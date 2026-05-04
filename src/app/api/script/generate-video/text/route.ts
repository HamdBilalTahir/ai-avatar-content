import { NextRequest, NextResponse } from 'next/server';
import { generateReelText } from '@/services/gemini-video';
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
      existingCount,
    } = await req.json();

    if (!prompt)
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 }
      );

    const { outputPath, outputFilename } = resolveOutputPath(
      shotNumber,
      existingCount ?? 0
    );

    const PACING_INSTRUCTION =
      'Speak at a natural conversational pace of approximately 2.5 to 3 words per second. No pauses between words.';
    const HARD_STOP_INSTRUCTION =
      'Stop all dialogue, mouth movement, and speech immediately when the scripted lines are finished. Hold a neutral expression after speaking.';
    const NEGATIVE_PROMPT =
      'slow speech, long pauses, continued talking after dialogue ends, extra lip movement, mumbling';

    const enhancedPrompt = `${prompt}\n\nInstructions:\n- ${PACING_INSTRUCTION}\n- ${HARD_STOP_INSTRUCTION}`;

    const res = await generateReelText({
      prompt: enhancedPrompt,
      outputName: outputPath,
      modelName,
      duration: duration || 8,
      resolution,
      apiKey,
      negativePrompt: NEGATIVE_PROMPT,
    });

    if (res?.outputName) {
      const buffer = await fs.readFile(res.outputName);
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
      'generate-video/text error:',
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
