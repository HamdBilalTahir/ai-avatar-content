import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { extendReelVideo, parseApiError } from '@/services/gemini-video';

export const maxDuration = 300;

import fs from 'fs/promises';
import { processSandboxCompletion } from '@/lib/sandbox-updater';
import { VEO_HARDCODED_INJECTIONS } from '@/lib/veo-injections';

export async function POST(req: Request) {
  try {
    const {
      jobId,
      stepNumber,
      prompt,
      modelName,
      videoReferenceUrl,
      sandboxId,
      runId,
      apiKey: clientApiKey,
      resolution,
      aspectRatio,
    } = await req.json();

    if (
      (!jobId && !sandboxId) ||
      stepNumber === undefined ||
      !prompt ||
      !videoReferenceUrl
    ) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    let actualVideoReference = null;
    if (videoReferenceUrl) {
      console.log(
        `[Gemini Extend] Fetching video reference from URL: ${videoReferenceUrl}`
      );
      const refRes = await fetch(videoReferenceUrl);
      if (!refRes.ok) {
        return NextResponse.json(
          {
            error: `Failed to fetch video reference from URL: ${refRes.statusText}`,
          },
          { status: 500 }
        );
      }
      actualVideoReference = await refRes.json();
    }

    if (modelName === 'veo-3.1-fast-generate-preview') {
      return NextResponse.json(
        { error: 'Veo Extend is not supported on Lite model' },
        { status: 400 }
      );
    }

    const apiKey = clientApiKey || process.env.GOOGLE_VEO_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing VEO API KEY in server configuration' },
        { status: 500 }
      );
    }

    const outputId = sandboxId
      ? `${runId}_step_${stepNumber}`
      : `${jobId}_step_${stepNumber}`;
    const outputName = `/tmp/generated/sandbox_${outputId}.mp4`;

    const NEGATIVE_PROMPT =
      'slow speech, long pauses, continued talking after dialogue ends, extra lip movement, mumbling';

    const enhancedPrompt = `${prompt}\n\n${VEO_HARDCODED_INJECTIONS}`;

    const result = await extendReelVideo({
      prompt: enhancedPrompt,
      outputName,
      videoReference: actualVideoReference,
      modelName,
      apiKey,
      resolution,
      aspectRatio,
      duration: 7, // extending naturally for 7 seconds as per requirements
      negativePrompt: NEGATIVE_PROMPT,
    });

    if (!result) {
      throw new Error('Video extension returned no result');
    }

    let videoUrl;
    let newVideoReferenceUrl;
    if (sandboxId && runId) {
      const buffer = await fs.readFile(outputName);
      const uploadRes = await processSandboxCompletion({
        buffer,
        videoReference: result.videoReference,
        sandboxId,
        runId,
        stepNumber,
      });
      videoUrl = uploadRes.videoUrl;
      newVideoReferenceUrl = uploadRes.videoReferenceUrl;
    } else if (jobId) {
      const fileName = `sandbox_${jobId}_step_${stepNumber}.mp4`;
      videoUrl = `/api/generated/${fileName}`;

      await db
        .collection('jobs')
        .doc(jobId)
        .collection('steps')
        .doc(stepNumber.toString())
        .set(
          {
            status: 'complete',
            videoUrl,
            // Skip large videoReference object in Firestore to avoid size limits
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
    }

    return NextResponse.json({
      video_url: videoUrl,
      videoUrl, // Backwards compatibility
      video_reference_url: newVideoReferenceUrl,
      videoReferenceUrl: newVideoReferenceUrl,
    });
  } catch (error: any) {
    console.error('Gemini extend video error:', error);
    const friendly = parseApiError(error);
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}
