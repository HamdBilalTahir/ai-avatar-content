import { NextRequest, NextResponse } from 'next/server';
import { resolveOutputPath } from '@/lib/video-output';
import fs from 'fs/promises';
import path from 'path';

export const maxDuration = 300;

const EVOLINK_BASE = 'https://api.evolink.ai/v1';
const POLL_INTERVAL_MS = 8_000;
const MAX_POLLS = 70; // ~5 minutes

export async function POST(req: NextRequest) {
  try {
    const {
      prompt,
      imageUrls,
      duration,
      shotNumber,
      existingCount,
      aspect_ratio,
      quality,
      model = 'kling-o3-image-to-video',
    } = await req.json();

    if (!prompt)
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 }
      );
    if (!imageUrls || !Array.isArray(imageUrls))
      return NextResponse.json(
        { error: 'imageUrls array is required' },
        { status: 400 }
      );

    const apiKey = process.env.EVOLINK_API_KEY;
    if (!apiKey)
      return NextResponse.json(
        { error: 'EVOLINK_API_KEY is not configured' },
        { status: 500 }
      );

    const { outputPath, outputFilename } = resolveOutputPath(
      shotNumber,
      existingCount ?? 0
    );

    console.log(`\n==================================================`);
    console.log(`🎥 Preparing to generate: ${outputFilename}`);
    console.log(`==================================================`);
    console.log(`📦 Generation Config:`);
    console.log(`  - Model: ${model}`);
    console.log(`  - Duration: ${duration ?? 5}s`);
    console.log(`  - Aspect Ratio: ${aspect_ratio ?? '16:9'}`);
    console.log(`  - Quality: ${quality ?? '720p'}`);
    console.log(`  - Image URLs: ${imageUrls?.length ?? 0} provided`);
    console.log(`  - Prompt: ${prompt.substring(0, 80)}...`);
    console.log(`==================================================\n`);

    // Start generation
    console.log(`🚀 Submitting job to Evolink...`);
    const genRes = await fetch(`${EVOLINK_BASE}/videos/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        ...(imageUrls?.length > 0 ? { image_urls: imageUrls } : {}),
        duration: duration ?? 5,
        aspect_ratio: aspect_ratio ?? '16:9',
        quality: quality ?? '720p',
        sound: 'off',
      }),
    });

    if (!genRes.ok) {
      const errText = await genRes.text();
      throw new Error(`Evolink API error: ${genRes.status} ${errText}`);
    }

    const genData = await genRes.json();
    console.log(`📨 Evolink response:`, JSON.stringify(genData, null, 2));

    const jobId =
      genData.id ??
      genData.task_id ??
      genData.generation_id ??
      genData.data?.id;
    if (!jobId) throw new Error('No job ID in Evolink response');

    console.log(`✅ Job accepted — ID: ${jobId}`);
    console.log(
      `⏳ Polling every ${POLL_INTERVAL_MS / 1000}s (max ${MAX_POLLS} attempts)...`
    );

    // Poll for completion
    let videoUrl: string | null = null;
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const pollRes = await fetch(`${EVOLINK_BASE}/tasks/${jobId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!pollRes.ok) {
        console.log(
          `  [poll ${i + 1}/${MAX_POLLS}] HTTP ${pollRes.status} — retrying...`
        );
        continue;
      }

      const pollData = await pollRes.json();
      const status = pollData.status ?? pollData.state ?? pollData.data?.status;

      console.log(`  [poll ${i + 1}/${MAX_POLLS}] status="${status}"`);

      if (status === 'completed' || status === 'succeeded') {
        videoUrl =
          pollData.results?.[0] ??
          pollData.result_data?.task_result?.videos?.[0]?.url ??
          pollData.video_url ??
          pollData.output?.url ??
          pollData.result?.url ??
          pollData.data?.video_url;
        console.log(`✅ Generation complete — video URL: ${videoUrl}`);
        break;
      }
      if (status === 'failed' || status === 'error') {
        console.log(
          `❌ Full failure response:`,
          JSON.stringify(pollData, null, 2)
        );
        const reason = pollData.error ?? pollData.message ?? 'unknown error';
        throw new Error(
          `Evolink generation failed: ${typeof reason === 'object' ? JSON.stringify(reason) : reason}`
        );
      }
    }

    if (!videoUrl) throw new Error('Evolink generation timed out');

    // Download the video
    console.log(`⬇️  Downloading video from Evolink...`);
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok)
      throw new Error(`Failed to download video: ${videoRes.status}`);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    await fs.writeFile(outputPath, videoBuffer);
    console.log(
      `✅ Saved to ${outputPath} (${(videoBuffer.byteLength / 1024).toFixed(1)} KB)`
    );

    return new NextResponse(videoBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': videoBuffer.byteLength.toString(),
        'X-Video-Filename': outputFilename,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    console.warn(
      `❌ generate-video/evolink error:`,
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
