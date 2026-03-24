import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { Client } from '@gradio/client';

const SPACE = 'Skywork/skyreels-a1-talking-head';

export async function generateAvatarVideo(
  avatarImagePath: string,
  audioPath: string,
  jobId: string
): Promise<string> {
  // ── Read files from disk ────────────────────────────────────────────────────
  let imageBuffer: Buffer;
  let audioBuffer: Buffer;
  try {
    imageBuffer = fs.readFileSync(avatarImagePath);
    audioBuffer = fs.readFileSync(audioPath);
  } catch (err) {
    throw new Error(
      `[skyreels:${jobId}] Failed to read input files: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const imageBlob = new Blob([new Uint8Array(imageBuffer)], {
    type: 'image/png',
  });
  const audioBlob = new Blob([new Uint8Array(audioBuffer)], {
    type: 'audio/wav',
  });

  // ── Connect to HuggingFace Space ────────────────────────────────────────────
  const hfToken = process.env.HUGGINGFACE_TOKEN;
  console.log(
    `[skyreels:${jobId}] Connecting to ${SPACE}${hfToken ? ' (authenticated)' : ' (anonymous)'}…`
  );

  let client: Awaited<ReturnType<typeof Client.connect>>;
  try {
    client = await Client.connect(
      SPACE,
      hfToken ? ({ hf_token: hfToken as `hf_${string}` } as any) : {}
    );
  } catch (err) {
    throw new Error(
      `[skyreels:${jobId}] Failed to connect to HuggingFace Space: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // ── Submit prediction — blocks until video is ready ─────────────────────────
  console.log(
    `[skyreels:${jobId}] Submitting generation job — image: ${imageBuffer.length}b, audio: ${audioBuffer.length}b`
  );
  const startMs = Date.now();

  let result: { data: unknown[] };
  try {
    result = (await client.predict('/predict', [
      imageBlob, // portrait image
      audioBlob, // driving audio
      3.0, // guidance_scale
      10, // inference_steps
    ])) as { data: unknown[] };
  } catch (err) {
    throw new Error(
      `[skyreels:${jobId}] Prediction failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  console.log(
    `[skyreels:${jobId}] Generation complete in ${((Date.now() - startMs) / 1000).toFixed(1)}s`
  );

  // ── Extract video URL from result ───────────────────────────────────────────
  // result.data[0] is the output video, result.data[1] is the comparison video
  const videoOutput = result.data[0];
  let videoUrl: string | undefined;

  if (typeof videoOutput === 'string') {
    videoUrl = videoOutput;
  } else if (videoOutput && typeof videoOutput === 'object') {
    const obj = videoOutput as Record<string, unknown>;
    videoUrl = (obj.url ?? obj.path ?? obj.value) as string | undefined;
  }

  if (!videoUrl) {
    throw new Error(
      `[skyreels:${jobId}] No video URL in result. data[0]: ${JSON.stringify(videoOutput)}`
    );
  }

  console.log(`[skyreels:${jobId}] Downloading video from: ${videoUrl}`);

  // ── Download and save video ─────────────────────────────────────────────────
  let videoBuffer: Buffer;
  try {
    const downloadResp = await axios.get<ArrayBuffer>(videoUrl, {
      responseType: 'arraybuffer',
    });
    videoBuffer = Buffer.from(downloadResp.data);
  } catch (err) {
    throw new Error(
      `[skyreels:${jobId}] Failed to download video: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const storagePath = process.env.STORAGE_PATH ?? './storage';
  const jobDir = path.resolve(storagePath, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const videoPath = path.join(jobDir, 'final.mp4');
  fs.writeFileSync(videoPath, videoBuffer);
  console.log(
    `[skyreels:${jobId}] Video saved → ${videoPath} (${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB)`
  );

  return videoPath;
}
