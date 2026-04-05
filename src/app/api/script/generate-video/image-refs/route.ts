import { NextRequest, NextResponse } from 'next/server';
import { generateReelImageRefs } from '@/services/gemini-video';
import { resolveOutputPath } from '@/lib/video-output';

export async function POST(req: NextRequest) {
  try {
    const {
      prompt,
      modelName,
      duration,
      resolution,
      apiKey,
      shotNumber,
      referenceImages,
    } = await req.json();

    if (!prompt)
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 }
      );
    if (!Array.isArray(referenceImages) || referenceImages.length < 1)
      return NextResponse.json(
        { error: 'referenceImages must contain at least 1 image' },
        { status: 400 }
      );

    const { outputPath, videoUrl } = resolveOutputPath(shotNumber);

    const generatedPath = await generateReelImageRefs({
      prompt,
      outputName: outputPath,
      referenceImages,
      modelName,
      duration,
      resolution,
      apiKey,
    });

    if (generatedPath) {
      return NextResponse.json({ videoUrl }, { status: 200 });
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
