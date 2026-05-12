import { NextRequest, NextResponse } from 'next/server';
import { generateReelImageRefs } from '@/services/gemini-video';
import { resolveOutputPath } from '@/lib/video-output';
import { processSandboxCompletion } from '@/lib/sandbox-updater';
import { VEO_HARDCODED_INJECTIONS } from '@/lib/veo-injections';
import fs from 'fs/promises';

export async function POST(req: NextRequest) {
  try {
    const {
      prompt,
      defaultPrompt,
      clipDialogue,
      modelName,
      duration,
      resolution,
      apiKey,
      shotNumber,
      existingCount,
      referenceImages,
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
        { error: 'prompt or defaultPrompt/clipDialogue is required' },
        { status: 400 }
      );
    if (!Array.isArray(referenceImages) || referenceImages.length < 1)
      return NextResponse.json(
        { error: 'referenceImages must contain at least 1 image' },
        { status: 400 }
      );

    const { outputPath, outputFilename } = resolveOutputPath(
      shotNumber,
      existingCount ?? 0
    );

    const resolvedReferenceImages = referenceImages.map((img: any) => ({
      base64: img.base64 || img.data,
      mimeType: img.mimeType || img.mime_type || 'image/jpeg',
    }));

    const NEGATIVE_PROMPT =
      'slow speech, long pauses, continued talking after dialogue ends, extra lip movement, mumbling, background music, music soundtrack, ambient music';

    const enhancedPrompt = `${finalPrompt}\n\n${VEO_HARDCODED_INJECTIONS}`;

    const res = await generateReelImageRefs({
      prompt: enhancedPrompt,
      outputName: outputPath,
      referenceImages: resolvedReferenceImages,
      modelName,
      duration,
      resolution,
      apiKey,
      negativePrompt: NEGATIVE_PROMPT,
    });

    if (res?.outputName) {
      const buffer = await fs.readFile(res.outputName);

      let videoUrl;
      let videoReferenceUrl;
      if (sandboxId && runId && stepNumber) {
        const uploadRes = await processSandboxCompletion({
          buffer,
          videoReference: res.videoReference,
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
        video_reference: res.videoReference,
        video_reference_url: videoReferenceUrl,
      });
    }
    return NextResponse.json(
      { error: 'Failed to generate video' },
      { status: 500 }
    );
  } catch (error: unknown) {
    console.warn(
      'generate-video/image-refs error:',
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
