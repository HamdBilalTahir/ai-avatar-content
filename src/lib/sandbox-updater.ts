import { put } from '@vercel/blob';
import { db } from './firebase-admin';

export async function processSandboxCompletion({
  buffer,
  videoReference,
  sandboxId,
  runId,
  stepNumber,
}: {
  buffer: Buffer;
  videoReference?: any;
  sandboxId: string;
  runId: string;
  stepNumber: number;
}) {
  try {
    const filename = `sandbox/${sandboxId}/${runId}_step_${stepNumber}.mp4`;
    console.log(`[SandboxUpdater] Uploading video to Vercel Blob: ${filename}`);

    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: 'video/mp4',
    });

    const videoUrl = blob.url;
    console.log(`[SandboxUpdater] Upload successful: ${videoUrl}`);

    let videoReferenceUrl = undefined;
    if (videoReference) {
      const refFilename = `sandbox/${sandboxId}/${runId}_step_${stepNumber}_ref.json`;
      const refBlob = await put(
        refFilename,
        Buffer.from(JSON.stringify(videoReference)),
        {
          access: 'public',
          contentType: 'application/json',
        }
      );
      videoReferenceUrl = refBlob.url;
      console.log(
        `[SandboxUpdater] Uploaded videoReference JSON to: ${videoReferenceUrl}`
      );
    }

    console.log(
      `[SandboxUpdater] Updating Firestore for run ${runId}, step ${stepNumber}`
    );
    console.log(
      `[SandboxUpdater] Fetching document: sandbox/${sandboxId}/generatedVideos/${runId}`
    );

    if (typeof db.collection !== 'function') {
      console.warn(
        '[SandboxUpdater] Firestore not initialized (missing credentials). Skipping update.'
      );
      return { videoUrl };
    }

    const docRef = db
      .collection('sandbox')
      .doc(sandboxId)
      .collection('generatedVideos')
      .doc(runId);

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      console.log(
        `[SandboxUpdater] Document ${docRef.path} exists: ${doc.exists}`
      );
      if (!doc.exists) {
        console.warn(
          `[SandboxUpdater] Document ${docRef.path} does not exist.`
        );
        return;
      }

      const data = doc.data() || {};
      const steps = data.steps || [];
      console.log(`[SandboxUpdater] Current steps count: ${steps.length}`);

      const updatedSteps = steps.map((s: any) => {
        // Allow updating even if type is different, parse string/number appropriately
        if (Number(s.stepNumber) === Number(stepNumber)) {
          console.log(`[SandboxUpdater] Found matching step: ${stepNumber}`);
          const dur = 8 + (Number(stepNumber) - 1) * 7;

          const updatedStep = {
            ...s,
            status: 'done',
            videoUrl,
            ...(videoReferenceUrl !== undefined ? { videoReferenceUrl } : {}),
            completedAt: Date.now(),
            cumulativeDuration: dur,
          };

          return updatedStep;
        }
        return s;
      });

      console.log(`[SandboxUpdater] Updated steps output:`, updatedSteps);

      console.log(
        `[SandboxUpdater] Proceeding to update transaction for doc: ${docRef.path}`
      );
      transaction.update(docRef, {
        steps: updatedSteps,
        updatedAt: new Date(),
      });
    });

    console.log(`[SandboxUpdater] Firebase updated successfully`);
    return { videoUrl, videoReferenceUrl };
  } catch (err) {
    console.error('[SandboxUpdater] Failed to process completion', err);

    try {
      if (typeof db.collection !== 'function') {
        console.warn(
          '[SandboxUpdater] Firestore not initialized. Skipping error state update.'
        );
        throw err;
      }
      const docRef = db
        .collection('sandbox')
        .doc(sandboxId)
        .collection('generatedVideos')
        .doc(runId);
      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        if (!doc.exists) return;
        const data = doc.data() || {};
        const steps = data.steps || [];
        const updatedSteps = steps.map((s: any) => {
          if (s.stepNumber === stepNumber) {
            return { ...s, status: 'error', errorMsg: String(err) };
          }
          return s;
        });
        transaction.update(docRef, {
          steps: updatedSteps,
          status: 'error',
          updatedAt: new Date(),
        });
      });
    } catch (dbErr) {
      console.error(
        '[SandboxUpdater] Failed to update error state in Firebase',
        dbErr
      );
    }
    throw err;
  }
}
