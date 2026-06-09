import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = req.headers.get('content-type') ?? '';

  let sandboxId: string;
  let videoBuffer: Buffer;
  let filename: string;

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    sandboxId = form.get('sandboxId') as string;
    const file = form.get('video') as File | null;
    if (!file) {
      return NextResponse.json(
        { error: 'video file is required' },
        { status: 400 }
      );
    }
    videoBuffer = Buffer.from(await file.arrayBuffer());
    filename = file.name || `final_edited_${sandboxId}.mp4`;
  } else {
    const body = await req.json();
    sandboxId = body.sandboxId;
    // Accept base64-encoded video
    if (!body.videoBase64) {
      return NextResponse.json(
        { error: 'videoBase64 or multipart file is required' },
        { status: 400 }
      );
    }
    videoBuffer = Buffer.from(body.videoBase64, 'base64');
    filename = body.filename || `final_edited_${sandboxId}.mp4`;
  }

  if (!sandboxId || typeof sandboxId !== 'string') {
    return NextResponse.json(
      { error: 'sandboxId is required' },
      { status: 400 }
    );
  }

  try {
    const blob = await put(
      `sandbox/${sandboxId}/final_edited/${filename}`,
      videoBuffer,
      { access: 'public', contentType: 'video/mp4', addRandomSuffix: true }
    );

    await db.collection('sandbox').doc(sandboxId).update({
      finalEditedVideo: blob.url,
      finalEditedVideoUpdatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      sandboxId,
      finalEditedVideo: blob.url,
    });
  } catch (error: any) {
    console.error('[upload-final-video] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
