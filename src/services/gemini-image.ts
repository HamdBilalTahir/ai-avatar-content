import { GoogleGenAI } from '@google/genai';
import type { ReferenceImage } from '@/lib/types';

export async function generateAvatarImage(
  avatarPrompt: string,
  referenceImages?: ReferenceImage[],
  negativePrompt?: string,
  apiKey?: string
): Promise<{ image_base64: string; mime_type: string }> {
  const resolvedKey = apiKey || process.env.GEMINI_API_KEY;
  if (!resolvedKey) {
    throw new Error('Missing GEMINI_API_KEY');
  }

  const ai = new GoogleGenAI({ apiKey: resolvedKey });

  const hasRefs = referenceImages && referenceImages.length > 0;
  const negSuffix = negativePrompt?.trim()
    ? ` Do not include: ${negativePrompt.trim()}.`
    : '';
  const textPrompt = hasRefs
    ? `Using the provided reference image${referenceImages!.length > 1 ? 's' : ''} as a visual guide, generate an image that matches this description: ${avatarPrompt}${negSuffix}`
    : `${avatarPrompt}${negSuffix}`;

  const contents: any[] = [{ text: textPrompt }];
  if (hasRefs) {
    for (const img of referenceImages!) {
      contents.push({
        inlineData: { mimeType: img.mime_type, data: img.data },
      });
    }
  }

  const TIMEOUT_MS = 120_000;
  console.log(`[gemini-image] 🚀 starting generation — hasRefs=${hasRefs}`);
  const start = Date.now();
  const pingInterval = setInterval(() => {
    console.log(
      `[gemini-image] ⏳ still waiting... ${Math.round((Date.now() - start) / 1000)}s elapsed`
    );
  }, 5000);

  let response: any;
  try {
    const generatePromise = ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Gemini image generation timed out after ${TIMEOUT_MS / 1000}s`
            )
          ),
        TIMEOUT_MS
      )
    );

    response = await Promise.race([generatePromise, timeoutPromise]);
    console.log(
      `[gemini-image] ✅ generation complete in ${Math.round((Date.now() - start) / 1000)}s`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Gemini image generation failed: ${message}`);
  } finally {
    clearInterval(pingInterval);
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p: any) =>
    p.inlineData?.mimeType?.startsWith('image/')
  );

  if (!imagePart?.inlineData) {
    throw new Error('Gemini returned no image in response');
  }

  return {
    image_base64: imagePart.inlineData.data,
    mime_type: imagePart.inlineData.mimeType,
  };
}
