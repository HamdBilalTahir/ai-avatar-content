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
    if (typeof db.collection !== 'function') {
      console.warn(
        '[SandboxUpdater] Firestore not initialized (missing credentials). Uploading with _1.'
      );
      const filename = `sandbox/${sandboxId}/${runId}_step_${stepNumber}_1.mp4`;
      const blob = await put(filename, buffer, {
        access: 'public',
        contentType: 'video/mp4',
      });
      return { videoUrl: blob.url };
    }

    const docRef = db
      .collection('sandbox')
      .doc(sandboxId)
      .collection('generatedVideos')
      .doc(runId);

    let videoUrl = '';
    let videoReferenceUrl: string | undefined = undefined;

    // Upload blobs OUTSIDE the transaction so retries don't create duplicate files.
    // We use a placeholder extension (_0) then correct it inside the transaction.
    const tempFilename = `sandbox/${sandboxId}/${runId}_step_${stepNumber}_0.mp4`;
    console.log(
      `[SandboxUpdater] Uploading video to Vercel Blob: ${tempFilename}`
    );
    const blob = await put(tempFilename, buffer, {
      access: 'public',
      contentType: 'video/mp4',
      addRandomSuffix: true,
    });
    videoUrl = blob.url;
    console.log(`[SandboxUpdater] Upload successful: ${videoUrl}`);

    if (videoReference) {
      const refTempFilename = `sandbox/${sandboxId}/${runId}_step_${stepNumber}_0_ref.json`;
      const refBlob = await put(
        refTempFilename,
        Buffer.from(JSON.stringify(videoReference)),
        {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: true,
        }
      );
      videoReferenceUrl = refBlob.url;
      console.log(
        `[SandboxUpdater] Uploaded videoReference JSON to: ${videoReferenceUrl}`
      );
    }

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
        if (Number(s.stepNumber) === Number(stepNumber)) {
          console.log(`[SandboxUpdater] Found matching step: ${stepNumber}`);
          const dur = 8 + (Number(stepNumber) - 1) * 7;

          let newVersions = s.videoVersions ? [...s.videoVersions] : [];
          if (
            s.videoUrl &&
            !newVersions.some((v: any) => v.url === s.videoUrl) &&
            s.videoUrl !== videoUrl
          ) {
            newVersions.push({ version: `_1`, url: s.videoUrl });
          }
          if (!newVersions.some((v: any) => v.url === videoUrl)) {
            const ext = newVersions.length + 1;
            newVersions.push({ version: `_${ext}`, url: videoUrl });
          }

          return {
            ...s,
            status: 'done',
            videoUrl,
            ...(videoReferenceUrl !== undefined ? { videoReferenceUrl } : {}),
            completedAt: Date.now(),
            cumulativeDuration: dur,
            videoVersions: newVersions,
            activeVersionIndex: newVersions.length - 1,
          };
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
