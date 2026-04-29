import { GoogleGenAI, VideoGenerationReferenceType } from '@google/genai';
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
  aspectRatio: string | undefined
) {
  return {
    aspectRatio: aspectRatio || '9:16',
    durationSeconds: Number(duration) || 8,
    resolution: resolution || '720p',
  };
}

function logConfig(
  outputName: string,
  modelName: string,
  duration: number | string | undefined,
  resolution: string | undefined,
  mode: string,
  project: string,
  location: string
) {
  console.log(`\n==================================================`);
  console.log(`🎥 Preparing to generate: ${outputName}`);
  console.log(`==================================================`);
  console.log(`📦 Generation Config:`);
  console.log(
    `  - Provider: Vertex AI (Project: ${project}, Location: ${location})`
  );
  console.log(`  - Mode: ${mode}`);
  console.log(`  - Model: ${modelName}`);
  console.log(`  - Duration: ${duration || 8}s`);
  console.log(`  - Resolution: ${resolution || '720p'}`);
  console.log(`==================================================\n`);
}

async function saveVertexVideo(
  ai: any,
  operation: any,
  outputName: string,
  credentials: any
): Promise<string> {
  while (!operation.done) {
    console.log('[vertex] Waiting for generation...');
    await new Promise((r) => setTimeout(r, 10000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const response = operation.response;
  if (response?.raiMediaFilteredCount > 0) {
    const reasons =
      response.raiMediaFilteredReasons?.join(', ') ||
      'content policy violation';
    throw new Error(`Video blocked by safety filters — ${reasons}`);
  }

  const video = response?.generatedVideos?.[0]?.video;
  if (!video) throw new Error('No video returned from Vertex AI');

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

  console.log(`✅ [Vertex AI] Saved to ${outputName}`);
  return outputName;
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
}: BaseParams): Promise<string> {
  const credentials = JSON.parse(vertexKeyJson);
  logConfig(
    outputName,
    modelName,
    duration,
    resolution,
    'Text → Video',
    credentials.project_id,
    location
  );
  console.log(`  - Prompt: ${prompt.substring(0, 50)}...`);

  const ai = buildClient(credentials, location);
  const operation = await ai.models.generateVideos({
    model: modelName,
    prompt,
    config: buildConfig(duration, resolution, aspectRatio),
  });
  return saveVertexVideo(ai, operation, outputName, credentials);
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
}: BaseParams & {
  image: { base64: string; mimeType: string };
}): Promise<string> {
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
    config: buildConfig(duration, resolution, aspectRatio),
  });
  return saveVertexVideo(ai, operation, outputName, credentials);
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
}: BaseParams & {
  referenceImages: { base64: string; mimeType: string }[];
}): Promise<string> {
  const credentials = JSON.parse(vertexKeyJson);
  logConfig(
    outputName,
    modelName,
    duration,
    resolution,
    'Reference Images → Video',
    credentials.project_id,
    location
  );
  console.log(`  - Prompt: ${prompt.substring(0, 50)}...`);
  console.log(`  - Reference Images: ${referenceImages.length}`);

  const ai = buildClient(credentials, location);
  const configObj = {
    model: modelName,
    prompt,
    config: {
      ...buildConfig(duration, resolution, aspectRatio),
      referenceImages: referenceImages.map((img) => ({
        image: { imageBytes: img.base64, mimeType: img.mimeType },
        referenceType: VideoGenerationReferenceType.ASSET || 'ASSET',
      })),
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
            image: { imageBytes: '<base64...>', mimeType: r.image.mimeType },
          })),
        },
      },
      null,
      2
    )
  );

  const operation = await ai.models.generateVideos(configObj);
  return saveVertexVideo(ai, operation, outputName, credentials);
}
