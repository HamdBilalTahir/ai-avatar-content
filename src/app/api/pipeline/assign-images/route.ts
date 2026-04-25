import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export const maxDuration = 300;

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (
    cronSecret &&
    authHeader !== `Bearer ${cronSecret}` &&
    request.headers.get('x-cron-secret') !== cronSecret
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = Date.now().toString();
  await logPipelineStep(
    runId,
    'assign_images',
    'started',
    'Image assignment process initiated'
  );

  try {
    // Get all scripts pending review
    const scriptsSnap = await db
      .collection('scripts')
      .where('status', '==', 'pending_review')
      .get();

    if (scriptsSnap.empty) {
      await logPipelineStep(
        runId,
        'assign_images',
        'completed',
        'No pending scripts found to assign images to.'
      );
      return NextResponse.json({
        success: true,
        message: 'No pending scripts found.',
      });
    }

    // Get all images ordered by times_used asc
    const imagesSnap = await db
      .collection('images')
      .orderBy('times_used', 'asc')
      .get();

    if (imagesSnap.empty) {
      await logPipelineStep(
        runId,
        'assign_images',
        'failed',
        'No images found in the library.'
      );
      return NextResponse.json({
        success: false,
        message: 'No images found in the library.',
      });
    }

    const availableImages = imagesSnap.docs.map((doc) => ({
      id: doc.id,
      times_used: doc.data().times_used || 0,
    }));

    const batch = db.batch();
    let assignedCount = 0;

    // Map to keep track of how many times an image is used in this run
    // to correctly update the database
    const imageUsageCount: Record<string, number> = {};

    for (const scriptDoc of scriptsSnap.docs) {
      // Pick 2 to 3 images randomly for this script from the top least used images.
      // We will pick from the least used images to keep distribution even.
      // Let's sort availableImages by times_used + usage in this run
      availableImages.sort((a, b) => {
        const aTotal = a.times_used + (imageUsageCount[a.id] || 0);
        const bTotal = b.times_used + (imageUsageCount[b.id] || 0);
        return aTotal - bTotal;
      });

      const numImagesToAssign = Math.random() < 0.5 ? 2 : 3;
      const selectedImages = availableImages.slice(0, numImagesToAssign);
      const selectedImageIds = selectedImages.map((img) => img.id);

      // Update script
      batch.update(scriptDoc.ref, {
        reference_image_ids: selectedImageIds,
      });

      // Track usage
      for (const id of selectedImageIds) {
        imageUsageCount[id] = (imageUsageCount[id] || 0) + 1;
      }

      assignedCount++;
    }

    // Update image usage counts
    for (const [imageId, count] of Object.entries(imageUsageCount)) {
      const imageRef = db.collection('images').doc(imageId);
      batch.update(imageRef, {
        times_used: FieldValue.increment(count),
      });
    }

    await batch.commit();

    await logPipelineStep(
      runId,
      'assign_images',
      'completed',
      `Assigned images to ${assignedCount} scripts.`
    );

    return NextResponse.json({
      success: true,
      scripts_updated: assignedCount,
    });
  } catch (error: any) {
    console.error('Error assigning images:', error);
    await logPipelineStep(
      runId,
      'assign_images',
      'failed',
      error.message || 'Unknown error'
    );
    return NextResponse.json(
      { error: 'Failed to assign images' },
      { status: 500 }
    );
  }
}

async function logPipelineStep(
  runId: string,
  stepName: string,
  status: string,
  message: string
) {
  try {
    await db.collection('pipeline_logs').add({
      runId,
      stepName,
      status,
      message,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error logging pipeline step:', err);
  }
}
