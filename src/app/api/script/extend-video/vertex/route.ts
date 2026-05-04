import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { extendVertexVideo } from '@/services/vertex-video';

export const maxDuration = 300;

import fs from 'fs/promises';
import { processSandboxCompletion } from '@/lib/sandbox-updater';

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
      vertexKey: clientVertexKey,
      vertexLocation: clientVertexLocation,
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
        `[Vertex Extend] Fetching video reference from URL: ${videoReferenceUrl}`
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

    const vertexKeyJson =
      clientVertexKey || process.env.GOOGLE_VERTEX_CREDENTIALS;
    if (!vertexKeyJson) {
      return NextResponse.json(
        { error: 'Missing Vertex credentials in server configuration' },
        { status: 500 }
      );
    }

    const outputId = sandboxId
      ? `${runId}_step_${stepNumber}`
      : `${jobId}_step_${stepNumber}`;
    const outputName = `/tmp/generated/sandbox_${outputId}.mp4`;

    const PACING_INSTRUCTION =
      'Speak at a natural conversational pace of approximately 2.5 to 3 words per second. No pauses between words.';
    const HARD_STOP_INSTRUCTION =
      'Stop all dialogue, mouth movement, and speech immediately when the scripted lines are finished. Hold a neutral expression after speaking.';
    const NEGATIVE_PROMPT =
      'slow speech, long pauses, continued talking after dialogue ends, extra lip movement, mumbling';

    const enhancedPrompt = `${prompt}\n\nInstructions:\n- ${PACING_INSTRUCTION}\n- ${HARD_STOP_INSTRUCTION}`;

    const result = await extendVertexVideo({
      prompt: enhancedPrompt,
      outputName,
      videoReference: actualVideoReference,
      modelName,
      vertexKeyJson,
      location: clientVertexLocation || 'us-central1',
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
    console.error('Vertex extend video error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to extend video' },
      { status: 500 }
    );
  }
}
