import { NextRequest, NextResponse } from 'next/server';
import { generateReelText } from '@/services/gemini-video';
import path from 'path';
import fs from 'fs';

function resolveOutputPath(shotNumber: number | undefined): {
  outputPath: string;
  outputFilename: string;
} {
  let outputFilename = shotNumber
    ? `shot_${shotNumber}.mp4`
    : `shot_${Date.now()}.mp4`;
  let outputPath = path.join(
    process.cwd(),
    'public',
    'generated',
    outputFilename
  );
  if (shotNumber) {
    let counter = 1;
    while (fs.existsSync(outputPath)) {
      outputFilename = `shot_${shotNumber}_(${counter}).mp4`;
      outputPath = path.join(
        process.cwd(),
        'public',
        'generated',
        outputFilename
      );
      counter++;
    }
  }
  return { outputPath, outputFilename };
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, modelName, duration, resolution, apiKey, shotNumber } =
      await req.json();

    if (!prompt)
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 }
      );

    const { outputPath, outputFilename } = resolveOutputPath(shotNumber);

    const generatedPath = await generateReelText({
      prompt,
      outputName: outputPath,
      modelName,
      duration,
      resolution,
      apiKey,
    });

    if (generatedPath) {
      return NextResponse.json(
        { videoUrl: `/generated/${outputFilename}` },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to generate video' },
      { status: 500 }
    );
  } catch (error: unknown) {
    console.warn(
      'generate-video/text error:',
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
