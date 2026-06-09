import {
  GoogleGenAI,
  PersonGeneration,
  VideoGenerationReferenceType,
} from '@google/genai';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

async function getAccessToken(credentials: any): Promise<string> {
  const { client_email, private_key } = credentials;
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' })
  ).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claim = Buffer.from(
    JSON.stringify({
      iss: client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${claim}`);
  const sig = sign.sign(private_key.replace(/\\n/g, '\n'), 'base64url');
  const jwt = `${header}.${claim}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Vertex auth failed: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function downloadFromGCS(
  gcsUri: string,
  outputPath: string,
  token: string
): Promise<void> {
  const withoutScheme = gcsUri.replace('gs://', '');
  const slashIdx = withoutScheme.indexOf('/');
  const bucket = withoutScheme.slice(0, slashIdx);
  const object = withoutScheme.slice(slashIdx + 1);
  const encodedObject = object.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(
    `https://storage.googleapis.com/${bucket}/${encodedObject}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok)
    throw new Error(`GCS download failed: ${res.status} ${await res.text()}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buffer);
}

type BaseParams = {
  prompt: string;
  outputName: string;
  modelName?: string;
  duration?: number | string;
  resolution?: string;
  aspectRatio?: string;
  vertexKeyJson: string;
  location?: string;
  negativePrompt?: string;
  isBroll?: boolean;
};

function buildClient(credentials: any, location: string) {
  return new GoogleGenAI({
    vertexai: true,
    project: credentials.project_id,
    location,
    googleAuthOptions: { credentials },
  } as any);
}

function buildConfig(
  duration: number | string | undefined,
  resolution: string | undefined,
  aspectRatio: string | undefined,
  negativePrompt?: string,
  isBroll?: boolean
) {
  return {
    aspectRatio: aspectRatio || '9:16',
    durationSeconds: Number(duration) || 8,
    resolution: resolution || '720p',
    personGeneration: isBroll
      ? PersonGeneration.DONT_ALLOW
      : PersonGeneration.ALLOW_ALL,
    ...(negativePrompt ? { negativePrompt } : {}),
  };
}

function logConfig(
  outputName: string,
  modelName: string,
  duration: number | string | undefined,
  resolution: string | undefined,
  mode: string,
  project: string,
  location: string,
  isBroll?: boolean
) {
  const shotType =
    isBroll === true ? 'B-roll' : isBroll === false ? 'A-roll' : 'A-roll';
  console.log(`\n==================================================`);
  console.log(`🎥 Preparing to generate: ${outputName}`);
  console.log(`==================================================`);
  console.log(`📦 Generation Config:`);
  console.log(
    `  - Provider: Vertex AI (Project: ${project}, Location: ${location})`
  );
  console.log(`  - Shot Type: ${shotType}`);
  console.log(`  - Person Generation: ${isBroll ? 'DONT_ALLOW' : 'ALLOW_ALL'}`);
  console.log(`  - Mode: ${mode}`);
  console.log(`  - Model: ${modelName}`);
  console.log(`  - Duration: ${duration || 8}s`);
  console.log(`  - Resolution: ${resolution || '720p'}`);
  console.log(`==================================================\n`);
}

function isHighLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('high load') ||
    msg.includes('try again later') ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE')
  );
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 15000
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isHighLoadError(err) || attempt === maxAttempts) throw err;
      const delay = baseDelayMs * attempt;
      console.warn(
        `[vertex] High-load error on attempt ${attempt}/${maxAttempts}. Retrying in ${delay / 1000}s...`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function saveVertexVideo(
  ai: any,
  operation: any,
  outputName: string,
  credentials: any
): Promise<{ outputName: string; videoReference?: any }> {
  let elapsed = 0;
  while (!operation.done) {
    console.log(`[vertex] Waiting for generation... ${elapsed}s elapsed`);
    await new Promise((r) => setTimeout(r, 10000));
    elapsed += 10;
    operation = await ai.operations.getVideosOperation({ operation });
  }

  console.log(
    `[vertex] Operation finished after ${elapsed}s, processing response...`
  );
  const response = operation.response;
  if (response?.raiMediaFilteredCount > 0) {
    const reasons =
      response.raiMediaFilteredReasons?.join(', ') ||
      'content policy violation';
    throw new Error(`Video blocked by safety filters — ${reasons}`);
  }

  const video = response?.generatedVideos?.[0]?.video;
  if (!video) {
    if (operation.error) {
      throw new Error(
        `Vertex AI operation error: ${JSON.stringify(operation.error)}`
      );
    }
    throw new Error('No video returned from Vertex AI');
  }

  await fs.mkdir(path.dirname(outputName), { recursive: true });

  if (video.videoBytes) {
    await fs.writeFile(outputName, Buffer.from(video.videoBytes, 'base64'));
  } else if (video.uri?.startsWith('gs://')) {
    console.log(`[vertex] Downloading from GCS: ${video.uri}`);
    const token = await getAccessToken(credentials);
    await downloadFromGCS(video.uri, outputName, token);
  } else {
    throw new Error('No downloadable content in Vertex AI response');
  }

  if (video.uri) {
    console.log(`✅ [Vertex AI] Output Link (GCS): ${video.uri}`);
  }
  console.log(`✅ [Vertex AI] Saved to ${outputName}`);
  return { outputName, videoReference: video };
}

// ─── Extend Video ─────────────────────────────────────────────────────────────

export async function extendVertexVideo({
  prompt,
  outputName,
  modelName = 'veo-3.1-fast-generate-001',
  duration,
  resolution,
  aspectRatio,
  vertexKeyJson,
  location = 'us-central1',
  videoReference,
  negativePrompt,
  isBroll,
}: BaseParams & { videoReference: any }) {
  const credentials = JSON.parse(vertexKeyJson);
  logConfig(
    outputName,
    modelName,
    duration,
    resolution,
    'Extend Video',
    credentials.project_id,
    location,
    isBroll
  );
  console.log(`  - Prompt: ${prompt.substring(0, 50)}...`);

  const ai = buildClient(credentials, location);
  return withRetry(async () => {
    const operation = await (ai.models.generateVideos as any)({
      model: modelName,
      prompt,
      video: videoReference,
      config: buildConfig(
        duration,
        resolution,
        aspectRatio,
        negativePrompt,
        isBroll
      ),
    });
    return saveVertexVideo(ai, operation, outputName, credentials);
  });
}

// ─── Text → Video ─────────────────────────────────────────────────────────────

export async function generateVertexText({
  prompt,
  outputName,
  modelName = 'veo-3.1-fast-generate-001',
  duration,
  resolution,
  aspectRatio,
  vertexKeyJson,
  location = 'us-central1',
  negativePrompt,
  isBroll,
}: BaseParams) {
  const credentials = JSON.parse(vertexKeyJson);
  logConfig(
    outputName,
    modelName,
    duration,
    resolution,
    'Text → Video',
    credentials.project_id,
    location,
    isBroll
  );
  console.log(`  - Prompt: ${prompt.substring(0, 50)}...`);

  const ai = buildClient(credentials, location);
  return withRetry(async () => {
    const operation = await ai.models.generateVideos({
      model: modelName,
      prompt,
      config: buildConfig(
        duration,
        resolution,
        aspectRatio,
        negativePrompt,
        isBroll
      ),
    });
    return saveVertexVideo(ai, operation, outputName, credentials);
  });
}

// ─── Image Direct → Video ─────────────────────────────────────────────────────

export async function generateVertexImageDirect({
  prompt,
  outputName,
  modelName = 'veo-3.1-fast-generate-001',
  duration,
  resolution,
  aspectRatio,
  vertexKeyJson,
  location = 'us-central1',
  image,
  negativePrompt,
}: BaseParams & {
  image: { base64: string; mimeType: string };
}) {
  const credentials = JSON.parse(vertexKeyJson);
  logConfig(
    outputName,
    modelName,
    duration,
    resolution,
    'Image Direct → Video',
    credentials.project_id,
    location
  );
  console.log(`  - Prompt: ${prompt.substring(0, 50)}...`);
  console.log(`  - Image: 1 (direct animation)`);

  const ai = buildClient(credentials, location);
  const operation = await (ai.models.generateVideos as any)({
    model: modelName,
    prompt,
    image: { imageBytes: image.base64, mimeType: image.mimeType },
    config: buildConfig(duration, resolution, aspectRatio, negativePrompt),
  });
  return saveVertexVideo(ai, operation, outputName, credentials);
}

// ─── First & Last Frame → Video ───────────────────────────────────────────────

export async function generateVertexFirstLastFrame({
  prompt,
  outputName,
  modelName = 'veo-3.1-fast-generate-001',
  duration,
  resolution,
  aspectRatio,
  vertexKeyJson,
  location = 'us-central1',
  firstFrame,
  lastFrame,
  negativePrompt,
}: BaseParams & {
  firstFrame: { base64: string; mimeType: string };
  lastFrame: { base64: string; mimeType: string };
}) {
  const credentials = JSON.parse(vertexKeyJson);
  logConfig(
    outputName,
    modelName,
    duration,
    resolution,
    'First & Last Frame → Video',
    credentials.project_id,
    location
  );
  console.log(`  - Prompt: ${prompt.substring(0, 50)}...`);

  const ai = buildClient(credentials, location);
  const configObj = {
    model: modelName,
    prompt,
    image: { imageBytes: firstFrame.base64, mimeType: firstFrame.mimeType },
    config: {
      ...buildConfig(duration, resolution, aspectRatio, negativePrompt),
      lastFrame: { imageBytes: lastFrame.base64, mimeType: lastFrame.mimeType },
    },
  };

  return withRetry(async () => {
    const operation = await (ai.models.generateVideos as any)(configObj);
    return saveVertexVideo(ai, operation, outputName, credentials);
  });
}

// ─── Reference Images → Video ─────────────────────────────────────────────────

export async function generateVertexImageRefs({
  prompt,
  outputName,
  modelName = 'veo-3.1-fast-generate-001',
  duration,
  resolution,
  aspectRatio,
  vertexKeyJson,
  location = 'us-central1',
  referenceImages,
  negativePrompt,
  isBroll,
}: BaseParams & {
  referenceImages: { base64: string; mimeType: string }[];
}) {
  const credentials = JSON.parse(vertexKeyJson);
  logConfig(
    outputName,
    modelName,
    duration,
    resolution,
    'Reference Images → Video',
    credentials.project_id,
    location,
    isBroll
  );
  console.log(`  - Prompt: ${prompt.substring(0, 50)}...`);
  console.log(`  - Reference Images: ${referenceImages.length}`);

  const ai = buildClient(credentials, location);
  const configObj = {
    model: modelName,
    prompt,
    config: {
      ...buildConfig(
        duration,
        resolution,
        aspectRatio,
        negativePrompt,
        isBroll
      ),
      referenceImages: referenceImages.map(
        (img) =>
          ({
            image: { imageBytes: img.base64, mimeType: img.mimeType },
            referenceType: VideoGenerationReferenceType.ASSET,
          }) as any
      ),
    },
  };
  console.log(
    `  [Vertex AI Debug] generateVideos payload:`,
    JSON.stringify(
      {
        model: configObj.model,
        prompt: configObj.prompt,
        config: {
          ...configObj.config,
          referenceImages: configObj.config.referenceImages.map((r) => ({
            ...r,
            image: {
              imageBytes: '<base64...>',
              mimeType: r.image?.mimeType,
            },
          })),
        },
      },
      null,
      2
    )
  );

  return withRetry(async () => {
    const operation = await ai.models.generateVideos(configObj);
    return saveVertexVideo(ai, operation, outputName, credentials);
  });
}
