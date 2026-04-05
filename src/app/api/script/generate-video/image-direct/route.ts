import { NextRequest, NextResponse } from 'next/server';
import { generateReelImageDirect } from '@/services/gemini-video';
import { resolveOutputPath } from '@/lib/video-output';
import fs from 'fs/promises';

export async function POST(req: NextRequest) {
  try {
    const {
      prompt,
      modelName,
      duration,
      resolution,
      apiKey,
      shotNumber,
      image,
    } = await req.json();

    if (!prompt)
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 }
      );
    if (!image?.base64)
      return NextResponse.json(
        { error: 'image.base64 is required' },
        { status: 400 }
      );

    const { outputPath, outputFilename } = resolveOutputPath(shotNumber);

    const generatedPath = await generateReelImageDirect({
      prompt,
      outputName: outputPath,
      image,
      modelName,
      duration,
      resolution,
      apiKey,
    });

    if (generatedPath) {
      const buffer = await fs.readFile(outputPath);
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': buffer.byteLength.toString(),
          'X-Video-Filename': outputFilename,
          'Cache-Control': 'no-store',
        },
      });
    }
    return NextResponse.json(
      { error: 'Failed to generate video' },
      { status: 500 }
    );
  } catch (error: unknown) {
    console.warn(
      'generate-video/image-direct error:',
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
