import { NextRequest, NextResponse } from 'next/server';
import { generateVertexImageDirect } from '@/services/vertex-video';
import { resolveOutputPath } from '@/lib/video-output';
import fs from 'fs/promises';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const {
      prompt,
      modelName,
      duration,
      resolution,
      aspectRatio,
      vertexKey,
      vertexLocation,
      shotNumber,
      existingCount,
      image,
    } = await req.json();

    if (!prompt)
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 }
      );
    if (!vertexKey)
      return NextResponse.json(
        { error: 'vertexKey is required' },
        { status: 400 }
      );
    if (!image?.base64)
      return NextResponse.json(
        { error: 'image.base64 is required' },
        { status: 400 }
      );

    const { outputPath, outputFilename } = resolveOutputPath(
      shotNumber,
      existingCount ?? 0
    );

    await generateVertexImageDirect({
      prompt,
      outputName: outputPath,
      modelName,
      duration,
      resolution,
      aspectRatio,
      vertexKeyJson: vertexKey,
      location: vertexLocation || 'us-central1',
      image,
    });

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
  } catch (error: unknown) {
    console.warn(
      'generate-video/vertex/image-direct error:',
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
