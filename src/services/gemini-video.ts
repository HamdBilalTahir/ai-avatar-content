import { GoogleGenAI, VideoGenerationReferenceType } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';

export function parseApiError(error: any): string {
  try {
    const parsed =
      typeof error.message === 'string' ? JSON.parse(error.message) : null;
    if (parsed?.error) {
      const { code, status, message } = parsed.error;
      if (code === 429 || status === 'RESOURCE_EXHAUSTED') {
        return 'Quota exceeded — you have hit your Veo API rate limit. Please check your Google AI plan and billing.';
      }
      if (status === 'PERMISSION_DENIED') {
        return 'Permission denied — your API key does not have access to this Veo model.';
      }
      if (status === 'INVALID_ARGUMENT') {
        return `Invalid request — ${message}`;
      }
      if (message) return message;
    }
  } catch {
    // not a JSON error message, fall through
  }
  return error.message || 'Unknown error during video generation.';
}

async function saveVideo(
  ai: GoogleGenAI,
  operation: any,
  outputName: string
): Promise<string> {
  // Poll for completion
  while (!operation.done) {
    console.log('Waiting for video generation to complete...');
    await new Promise((resolve) => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  // Check for RAI filtering
  const response = operation.response;
  if (response?.raiMediaFilteredCount && response.raiMediaFilteredCount > 0) {
    const reasons =
      response.raiMediaFilteredReasons?.join(', ') ||
      'content policy violation';
    throw new Error(
      `Video was blocked by Google's safety filters — ${reasons}`
    );
  }

  // Save the output
  if (response?.generatedVideos?.[0]?.video) {
    const dir = path.dirname(outputName);
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
    await ai.files.download({
      file: response.generatedVideos[0].video,
      downloadPath: outputName,
    });
    console.log(`✅ SUCCESS — saved to ${outputName}`);
    return outputName;
  } else {
    throw new Error(
      'No video was returned — the generation may have been filtered or failed silently.'
    );
  }
}

function logConfig(
  outputName: string,
  modelName: string,
  duration: number,
  resolution: string,
  mode: string
) {
  console.log(`\n==================================================`);
  console.log(`🎥 Preparing to generate: ${outputName}`);
  console.log(`==================================================`);
  console.log(`📦 Generation Config:`);
  console.log(`  - Mode: ${mode}`);
  console.log(`  - Model: ${modelName}`);
  console.log(`  - Duration: ${duration}s`);
  console.log(`  - Resolution: ${resolution}`);
  console.log(`==================================================\n`);
}

function wrapError(error: any): never {
  const friendly = parseApiError(error);
  console.warn(`❌ Video generation failed:`, friendly);
  const out = new Error(friendly);
  throw out;
}

// ─── Text to Video ────────────────────────────────────────────────────────────

export async function generateReelText({
  prompt,
  outputName,
  modelName = 'veo-3.1-fast-generate-preview',
  duration = 8,
  resolution = '720p',
  apiKey,
}: {
  prompt: string;
  outputName: string;
  modelName?: string;
  duration?: number;
  resolution?: string;
  apiKey?: string;
}) {
  if (!apiKey) {
    throw new Error('Missing VEO API KEY. Please provide it in the UI.');
  }
  const ai = new GoogleGenAI({ apiKey });
  logConfig(outputName, modelName, duration, resolution, 'Text → Video');
  console.log(`  - Prompt: ${prompt.substring(0, 50)}...`);

  try {
    const operation = await ai.models.generateVideos({
      model: modelName,
      prompt,
      config: {
        aspectRatio: '9:16',
        durationSeconds: duration,
        resolution: resolution as any,
      },
    });
    return await saveVideo(ai, operation, outputName);
  } catch (error: any) {
    wrapError(error);
  }
}

// ─── Image Direct → Video ─────────────────────────────────────────────────────

export async function generateReelImageDirect({
  prompt,
  outputName,
  image,
  modelName = 'veo-3.1-fast-generate-preview',
  duration = 8,
  resolution = '720p',
  apiKey,
}: {
  prompt: string;
  outputName: string;
  image: { base64: string; mimeType: string };
  modelName?: string;
  duration?: number;
  resolution?: string;
  apiKey?: string;
}) {
  if (!apiKey) {
    throw new Error('Missing VEO API KEY. Please provide it in the UI.');
  }
  const ai = new GoogleGenAI({ apiKey });
  logConfig(
    outputName,
    modelName,
    duration,
    resolution,
    'Image Direct → Video'
  );
  console.log(`  - Prompt: ${prompt.substring(0, 50)}...`);
  console.log(`  - Image: 1 (direct animation)`);

  try {
    const operation = await ai.models.generateVideos({
      model: modelName,
      prompt,
      image: {
        imageBytes: image.base64,
        mimeType: image.mimeType,
      },
      config: {
        aspectRatio: '9:16',
        durationSeconds: duration,
        resolution: resolution as any,
      },
    } as any);
    return await saveVideo(ai, operation, outputName);
  } catch (error: any) {
    wrapError(error);
  }
}

// ─── Reference Images → Video ─────────────────────────────────────────────────

export async function generateReelImageRefs({
  prompt,
  outputName,
  referenceImages,
  modelName = 'veo-3.1-fast-generate-preview',
  duration = 8,
  resolution = '720p',
  apiKey,
}: {
  prompt: string;
  outputName: string;
  referenceImages: { base64: string; mimeType: string }[];
  modelName?: string;
  duration?: number;
  resolution?: string;
  apiKey?: string;
}) {
  if (!apiKey) {
    throw new Error('Missing VEO API KEY. Please provide it in the UI.');
  }
  const ai = new GoogleGenAI({ apiKey });
  logConfig(
    outputName,
    modelName,
    duration,
    resolution,
    'Reference Images → Video'
  );
  console.log(`  - Prompt: ${prompt.substring(0, 50)}...`);
  console.log(`  - Reference Images: ${referenceImages.length}`);

  const refImages = referenceImages.map((img) => ({
    image: { imageBytes: img.base64, mimeType: img.mimeType },
    referenceType: VideoGenerationReferenceType.ASSET,
  }));

  try {
    const operation = await ai.models.generateVideos({
      model: modelName,
      prompt,
      config: {
        aspectRatio: '9:16',
        durationSeconds: duration,
        resolution: resolution as any,
        referenceImages: refImages,
      },
    });
    return await saveVideo(ai, operation, outputName);
  } catch (error: any) {
    wrapError(error);
  }
}
