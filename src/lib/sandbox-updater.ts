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

      const currentStep = steps.find(
        (s: any) => Number(s.stepNumber) === Number(stepNumber)
      );

      const versionsCount = currentStep?.videoVersions?.length || 0;
      const historyCount = currentStep?.videoUrlHistory?.length || 0;
      const totalCount = Math.max(versionsCount, historyCount);
      const extension = totalCount + 1;

      const filename = `sandbox/${sandboxId}/${runId}_step_${stepNumber}_${extension}.mp4`;
      console.log(
        `[SandboxUpdater] Uploading video to Vercel Blob: ${filename}`
      );

      const blob = await put(filename, buffer, {
        access: 'public',
        contentType: 'video/mp4',
        addRandomSuffix: true,
      });

      videoUrl = blob.url;
      console.log(`[SandboxUpdater] Upload successful: ${videoUrl}`);

      if (videoReference) {
        const refFilename = `sandbox/${sandboxId}/${runId}_step_${stepNumber}_${extension}_ref.json`;
        const refBlob = await put(
          refFilename,
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

      const updatedSteps = steps.map((s: any) => {
        // Allow updating even if type is different, parse string/number appropriately
        if (Number(s.stepNumber) === Number(stepNumber)) {
          console.log(`[SandboxUpdater] Found matching step: ${stepNumber}`);
          const dur = 8 + (Number(stepNumber) - 1) * 7;

          let newVersions = s.videoVersions ? [...s.videoVersions] : [];

          // Migrate old URL if it exists but no versions are tracked yet
          if (
            s.videoUrl &&
            !newVersions.some((v: any) => v.url === s.videoUrl) &&
            s.videoUrl !== videoUrl
          ) {
            newVersions.push({ version: `_1`, url: s.videoUrl });
          }
          if (!newVersions.some((v: any) => v.url === videoUrl)) {
            newVersions.push({ version: `_${extension}`, url: videoUrl });
          }

          const updatedStep = {
            ...s,
            status: 'done',
            videoUrl,
            ...(videoReferenceUrl !== undefined ? { videoReferenceUrl } : {}),
            completedAt: Date.now(),
            cumulativeDuration: dur,
            videoVersions: newVersions,
            activeVersionIndex: newVersions.length - 1,
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
