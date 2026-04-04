import { NextRequest, NextResponse } from 'next/server';
import { generateScript } from '@/services/gemini-script';

const VALID_DURATIONS = ['4s', '8s', '15s', '30s', '45s', '60s'] as const;
type Duration = (typeof VALID_DURATIONS)[number];

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const { topic, duration } = body as Record<string, unknown>;

  if (!topic || typeof topic !== 'string' || topic.trim().length < 3) {
    return NextResponse.json({ error: 'topic is required' }, { status: 400 });
  }

  if (!VALID_DURATIONS.includes(duration as Duration)) {
    return NextResponse.json({ error: 'invalid duration' }, { status: 400 });
  }

  try {
    const script = await generateScript(topic.trim(), duration as Duration);
    return NextResponse.json({ script }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
