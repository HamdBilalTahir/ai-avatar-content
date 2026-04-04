import { NextRequest, NextResponse } from 'next/server';
import { generateReel } from '@/services/gemini-video';
import path from 'path';
import fs from 'fs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prompt,
      modelName,
      duration,
      resolution,
      imagePath,
      apiKey,
      shotNumber,
    } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 }
      );
    }

    let outputFilename = shotNumber
      ? `shot_${shotNumber}.mp4`
      : `shot_${Date.now()}.mp4`;
    let outputPath = path.join(
      process.cwd(),
      'public',
      'generated',
      outputFilename
    );

    // If file exists, append (1), (2), etc.
    if (shotNumber) {
      let counter = 1;
      while (fs.existsSync(outputPath)) {
        outputFilename = `shot_${shotNumber} (${counter}).mp4`;
        outputPath = path.join(
          process.cwd(),
          'public',
          'generated',
          outputFilename
        );
        counter++;
      }
    }

    const generatedPath = await generateReel({
      prompt,
      outputName: outputPath,
      modelName,
      duration,
      resolution,
      imagePath,
      apiKey,
    });

    if (generatedPath) {
      const videoUrl = `/generated/${outputFilename}`;
      return NextResponse.json({ videoUrl }, { status: 200 });
    } else {
      return NextResponse.json(
        { error: 'Failed to generate video' },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error('Video generation API error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
