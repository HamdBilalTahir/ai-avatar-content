import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatPromptTemplate } from '@langchain/core/prompts';

export interface VoiceStyle {
  emotion:
    | 'neutral'
    | 'excited'
    | 'enthusiastic'
    | 'confident'
    | 'happy'
    | 'curious'
    | 'calm'
    | 'determined'
    | 'proud'
    | 'surprised'
    | 'anxious'
    | 'sad';
  /** 0.6 (slow) – 1.5 (fast), default 1.0 */
  speed: number;
  /** 0.5 (quiet) – 2.0 (loud), default 1.0 */
  volume: number;
}

const EMOTION_OPTIONS = [
  'neutral',
  'excited',
  'enthusiastic',
  'confident',
  'happy',
  'curious',
  'calm',
  'determined',
  'proud',
  'surprised',
  'anxious',
  'sad',
] as const;

const PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a voice-direction expert. Analyse the video brief and return ONLY a JSON object — no markdown, no explanation — with three fields:
- "emotion": one of ${EMOTION_OPTIONS.join(', ')}
- "speed": a number from 0.6 (slow/deliberate) to 1.5 (fast/energetic), step 0.05
- "volume": a number from 0.5 (soft) to 2.0 (loud), step 0.1

Guidelines:
- Sales / promotional / urgent → emotion "enthusiastic" or "excited", speed 1.1–1.3, volume 1.1–1.3
- Professional / educational / informational → emotion "confident" or "curious", speed 0.95–1.05, volume 1.0
- Calm / wellness / meditation → emotion "calm", speed 0.7–0.85, volume 0.8–1.0
- Urgent / alarming → emotion "anxious" or "determined", speed 1.2–1.4, volume 1.2
- If the brief explicitly mentions tone words like "energetic", "excited", "calm", "professional", honour them directly.`,
  ],
  ['human', '{topic}'],
]);

export async function extractVoiceStyle(
  topic: string,
  apiKey?: string
): Promise<VoiceStyle> {
  const resolvedKey = apiKey || process.env.GEMINI_API_KEY;
  if (!resolvedKey) throw new Error('Missing GEMINI_API_KEY');

  const model = new ChatGoogleGenerativeAI({
    apiKey: resolvedKey,
    model: 'gemini-2.0-flash',
    temperature: 0,
  });

  const chain = PROMPT.pipe(model);
  const result = await chain.invoke({ topic });
  const text =
    typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);

  let parsed: VoiceStyle;
  try {
    parsed = JSON.parse(text.trim()) as VoiceStyle;
  } catch {
    // Fallback if Gemini wraps in markdown fences
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Could not parse voice style JSON: ${text}`);
    parsed = JSON.parse(match[0]) as VoiceStyle;
  }

  // Clamp values to valid ranges
  parsed.speed = Math.min(1.5, Math.max(0.6, parsed.speed ?? 1.0));
  parsed.volume = Math.min(2.0, Math.max(0.5, parsed.volume ?? 1.0));
  if (
    !EMOTION_OPTIONS.includes(
      parsed.emotion as (typeof EMOTION_OPTIONS)[number]
    )
  ) {
    parsed.emotion = 'neutral';
  }

  return parsed;
}
