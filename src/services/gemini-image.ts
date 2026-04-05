import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ReferenceImage } from '@/lib/types';

const LIPSYNC_SUFFIX =
  'front-facing, neutral to friendly expression, clear and fully visible face, photorealistic, evenly lit, plain or softly blurred background, no accessories obscuring the face, suitable for AI lip sync video generation';

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

  const genAI = new GoogleGenerativeAI(resolvedKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-image-preview',
  });

  const hasRefs = referenceImages && referenceImages.length > 0;
  const negSuffix = negativePrompt?.trim()
    ? ` Do not include: ${negativePrompt.trim()}.`
    : '';
  const textPrompt = hasRefs
    ? `Using the provided reference image${referenceImages!.length > 1 ? 's' : ''} as a visual guide for likeness and style, generate an avatar portrait that matches this description: ${avatarPrompt}, ${LIPSYNC_SUFFIX}${negSuffix}`
    : `${avatarPrompt}, ${LIPSYNC_SUFFIX}${negSuffix}`;

  let result;
  try {
    if (hasRefs) {
      const parts = [
        ...referenceImages!.map((img) => ({
          inlineData: { mimeType: img.mime_type, data: img.data },
        })),
        { text: textPrompt },
      ];
      result = await model.generateContent({
        contents: [{ role: 'user', parts }],
      });
    } else {
      result = await model.generateContent(textPrompt);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Gemini image generation failed: ${message}`);
  }

  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) =>
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
