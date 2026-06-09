import { NextRequest } from 'next/server';
import { generateAvatarImage } from '@/services/gemini-image';
import type { ReferenceImage } from '@/lib/types';
import sharp from 'sharp';

const FOUR_MB = 4 * 1024 * 1024;

async function compressIfNeeded(
  data: string,
  mimeType: string
): Promise<{ data: string; mimeType: string }> {
  const bytes = Buffer.byteLength(data, 'base64');
  if (bytes <= FOUR_MB) return { data, mimeType };

  const inputMb = (bytes / 1024 / 1024).toFixed(2);
  const buf = Buffer.from(data, 'base64');

  let lo = 10,
    hi = 85,
    result: Buffer = buf;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = await sharp(buf).jpeg({ quality: mid }).toBuffer();
    if (candidate.byteLength <= FOUR_MB) {
      result = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const outputMb = (result.byteLength / 1024 / 1024).toFixed(2);
  console.log(
    `[avatar/generate] 🔄 compressed reference image ${inputMb} MB → ${outputMb} MB (same dimensions, quality ~${hi})`
  );
  return { data: result.toString('base64'), mimeType: 'image/jpeg' };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({
        error: 'avatar_prompt is required and must be a non-empty string',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const {
    avatar_prompt,
    negative_prompt,
    reference_images,
    gemini_api_key,
    aspect_ratio,
    image_size,
  } = body as Record<string, unknown>;

  console.log(
    `[avatar/generate] ▶ prompt="${String(avatar_prompt ?? '').slice(0, 80)}" refCount=${Array.isArray(reference_images) ? reference_images.length : 0} hasNegPrompt=${!!negative_prompt} hasApiKey=${!!gemini_api_key} aspectRatio=${aspect_ratio ?? 'default'} imageSize=${image_size ?? 'default'}`
  );

  if (
    !avatar_prompt ||
    typeof avatar_prompt !== 'string' ||
    avatar_prompt.trim() === ''
  ) {
    console.warn(
      `[avatar/generate] ❌ validation failed: avatar_prompt is missing or empty`
    );
    return new Response(
      JSON.stringify({
        error: 'avatar_prompt is required and must be a non-empty string',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let refs: ReferenceImage[] | undefined;
  if (Array.isArray(reference_images) && reference_images.length > 0) {
    const valid = (reference_images as unknown[]).every(
      (img) =>
        img !== null &&
        typeof img === 'object' &&
        typeof (img as Record<string, unknown>).data === 'string' &&
        typeof (img as Record<string, unknown>).mime_type === 'string'
    );
    if (!valid) {
      console.warn(
        `[avatar/generate] ❌ validation failed: reference_images has invalid shape`
      );
      return new Response(
        JSON.stringify({
          error:
            'reference_images must be an array of { data: string, mime_type: string }',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    refs = reference_images as ReferenceImage[];
    const originalSizes = refs
      .map(
        (r) =>
          (Buffer.byteLength(r.data ?? '', 'base64') / 1024 / 1024).toFixed(2) +
          ' MB'
      )
      .join(', ');
    console.log(
      `[avatar/generate] ✅ validation passed — ${refs.length} reference image(s), sizes: ${originalSizes}`
    );
    refs = await Promise.all(
      refs.map(async (r) => {
        const result = await compressIfNeeded(r.data, r.mime_type);
        return { ...r, data: result.data, mime_type: result.mimeType };
      })
    );
  } else {
    console.log(`[avatar/generate] ✅ validation passed — no reference images`);
  }

  const negPrompt =
    typeof negative_prompt === 'string' ? negative_prompt : undefined;
  const apiKey =
    typeof gemini_api_key === 'string' ? gemini_api_key : undefined;

  // Stream the response so Vercel doesn't timeout on long generations.
  // Sends periodic pings to keep the connection alive, then a final result/error event.
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Ping every 5s to keep the connection alive
      const pingInterval = setInterval(() => {
        try {
          send('ping', { ts: Date.now() });
        } catch {
          /* stream closed */
        }
      }, 5000);

      try {
        console.log(`[avatar/generate] 🚀 calling generateAvatarImage...`);
        const {
          image_base64,
          mime_type,
          promptTokens,
          imageOutputTokens,
          textOutputTokens,
        } = await generateAvatarImage(
          avatar_prompt as string,
          refs,
          negPrompt,
          apiKey,
          typeof aspect_ratio === 'string' ? aspect_ratio : undefined,
          typeof image_size === 'string' ? image_size : undefined
        );

        // Pricing: input $0.50/1M, image output $60/1M, text output $3/1M
        const costUsd =
          (promptTokens * 0.5) / 1_000_000 +
          (imageOutputTokens * 60.0) / 1_000_000 +
          (textOutputTokens * 3.0) / 1_000_000;

        console.log(
          `[avatar/generate] ✅ image generated — mime=${mime_type} base64Len=${image_base64?.length ?? 0} promptTokens=${promptTokens} imageOutTokens=${imageOutputTokens} textOutTokens=${textOutputTokens} costUsd=$${costUsd.toFixed(5)}`
        );
        send('result', {
          image_base64,
          mime_type,
          costUsd,
          promptTokens,
          imageOutputTokens,
          textOutputTokens,
        });
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : typeof err === 'string'
              ? err
              : (() => {
                  try {
                    return JSON.stringify(err);
                  } catch {
                    return String(err);
                  }
                })();
        console.warn(
          `[avatar/generate] ❌ generateAvatarImage threw: ${message}`,
          err
        );
        send('error', { error: message || 'Image generation failed' });
      } finally {
        clearInterval(pingInterval);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
