import { NextRequest, NextResponse } from 'next/server';
import { generateAvatarImage } from '@/services/gemini-image';
import type { AvatarGenerateResponse, ReferenceImage } from '@/lib/types';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'avatar_prompt is required and must be a non-empty string' },
      { status: 400 }
    );
  }

  const { avatar_prompt, negative_prompt, reference_images } = body as Record<
    string,
    unknown
  >;

  if (
    !avatar_prompt ||
    typeof avatar_prompt !== 'string' ||
    avatar_prompt.trim() === ''
  ) {
    return NextResponse.json(
      { error: 'avatar_prompt is required and must be a non-empty string' },
      { status: 400 }
    );
  }

  // Validate reference images if provided
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
      return NextResponse.json(
        {
          error:
            'reference_images must be an array of { data: string, mime_type: string }',
        },
        { status: 400 }
      );
    }
    refs = reference_images as ReferenceImage[];
  }

  try {
    const negPrompt =
      typeof negative_prompt === 'string' ? negative_prompt : undefined;
    const { image_base64, mime_type } = await generateAvatarImage(
      avatar_prompt,
      refs,
      negPrompt
    );
    const response: AvatarGenerateResponse = { image_base64, mime_type };
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
