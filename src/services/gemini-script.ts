import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatPromptTemplate } from '@langchain/core/prompts';

type Duration = '4s' | '8s' | '15s' | '30s' | '45s' | '60s';

const WORD_RANGES: Record<Duration, string> = {
  '4s': '8–12',
  '8s': '16–24',
  '15s': '30–40',
  '30s': '60–75',
  '45s': '90–110',
  '60s': '120–140',
};

export async function generateScript(
  topic: string,
  duration: Duration = '30s',
  apiKey?: string
): Promise<string> {
  const resolvedKey = apiKey || process.env.GEMINI_API_KEY;
  if (!resolvedKey) {
    throw new Error('Missing GEMINI_API_KEY');
  }

  const wordRange = WORD_RANGES[duration];

  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-3-flash-preview',
    apiKey: resolvedKey,
    temperature: 0.7,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an expert short-form video script writer.
Your output must be plain spoken text only — exactly as a person would say it aloud.
Do not include any markdown formatting, hashtags, emojis, stage directions, speaker labels, scene descriptions, opening pleasantries, closing pleasantries, or any explanation of what the script is.
Output only the script itself, nothing else.
The script must be between ${wordRange} words.
It must open with a strong hook that grabs attention in the first sentence.
Use a conversational and energetic tone suitable for TikTok, Instagram Reels, and YouTube Shorts.
End with a clear call to action or a memorable closing line.`,
    ],
    ['human', 'Write a short-form video script about: {topic}'],
  ]);

  const chain = prompt.pipe(model);
  const response = await chain.invoke({ topic });

  const content =
    typeof response.content === 'string'
      ? response.content.trim()
      : String(response.content).trim();

  if (!content) {
    throw new Error('Gemini script generation returned an empty script');
  }

  return content;
}
