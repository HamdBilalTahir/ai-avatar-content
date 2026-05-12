import { NextRequest, NextResponse } from 'next/server';
import { generateVertexText } from '@/services/vertex-video';
import { resolveOutputPath } from '@/lib/video-output';
import { processSandboxCompletion } from '@/lib/sandbox-updater';
import { VEO_HARDCODED_INJECTIONS } from '@/lib/veo-injections';
import fs from 'fs/promises';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const {
      prompt,
      defaultPrompt,
      clipDialogue,
      modelName,
      duration,
      resolution,
      aspectRatio,
      vertexKey,
      vertexLocation,
      shotNumber,
      existingCount,
      sandboxId,
      runId,
      stepNumber,
    } = await req.json();

    const finalPrompt =
      defaultPrompt && clipDialogue
        ? `${defaultPrompt}. ${clipDialogue}`
        : prompt;

    if (!finalPrompt)
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 }
      );
    if (!vertexKey)
      return NextResponse.json(
        { error: 'vertexKey is required' },
        { status: 400 }
      );

    const { outputPath, outputFilename } = resolveOutputPath(
      shotNumber,
      existingCount ?? 0
    );

    const NEGATIVE_PROMPT =
      'slow speech, long pauses, continued talking after dialogue ends, extra lip movement, mumbling, background music, music soundtrack, ambient music';

    const enhancedPrompt = `${finalPrompt}\n\n${VEO_HARDCODED_INJECTIONS}`;

    const res = await generateVertexText({
      prompt: enhancedPrompt,
      outputName: outputPath,
      modelName,
      duration,
      resolution,
      aspectRatio,
      vertexKeyJson: vertexKey,
      location: vertexLocation || 'us-central1',
      negativePrompt: NEGATIVE_PROMPT,
    });

    if (res?.outputName) {
      const buffer = await fs.readFile(res.outputName);

      let videoUrl: string | undefined;
      let videoReferenceUrl: string | undefined;
      if (sandboxId && runId && stepNumber) {
        const uploadRes = await processSandboxCompletion({
          buffer,
          sandboxId,
          runId,
          stepNumber,
        });
        videoUrl = uploadRes.videoUrl;
        videoReferenceUrl = uploadRes.videoReferenceUrl;
      }

      return NextResponse.json({
        video_url: videoUrl,
        output_name: outputFilename,
        video_reference_url: videoReferenceUrl,
      });
    }

    return NextResponse.json(
      { error: 'Failed to generate video' },
      { status: 500 }
    );
  } catch (error: unknown) {
    console.warn(
      'generate-video/vertex/text error:',
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
