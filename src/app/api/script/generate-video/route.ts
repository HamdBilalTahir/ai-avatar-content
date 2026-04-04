import { NextRequest, NextResponse } from 'next/server';
import { generateReel } from '@/services/gemini-video';
import path from 'path';

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

    const outputFilename = shotNumber
      ? `shot_${shotNumber}.mp4`
      : `shot_${Date.now()}.mp4`;
    const outputPath = path.join(
      process.cwd(),
      'public',
      'generated',
      outputFilename
    );

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
  } catch (error: any) {
    console.error('Video generation API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
