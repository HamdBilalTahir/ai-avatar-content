import { NextRequest, NextResponse } from 'next/server';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    'Missing GEMINI_API_KEY environment variable. Script generation will fail.'
  );
}

const ScriptSchema = z.object({
  scripts: z
    .array(
      z.object({
        id: z.number().describe('The clip number/sequence ID'),
        text: z
          .string()
          .describe(
            'The short dialogue meant to be spoken. Must take exactly or less than 8 seconds to speak.'
          ),
      })
    )
    .describe('Array of short script dialogues'),
});

const AdvancedScriptSchema = z.object({
  dialogues: z
    .array(z.string())
    .describe(
      'Array of short script dialogues, exactly matching the requested clipCount'
    ),
  videoPrompt: z
    .string()
    .describe(
      'A single shared video prompt that describes visual style only — no dialogue content'
    ),
});

const PromptOnlySchema = z.object({
  videoPrompt: z
    .string()
    .describe(
      'A single shared video prompt that describes visual style only — no dialogue content'
    ),
});

export async function POST(req: NextRequest) {
  try {
    const {
      goalText,
      clipCount,
      videoCount,
      filmDirectionSystem,
      avatarImageBase64,
      promptOnlyMode,
      existingDialogues,
    } = await req.json();

    if (!goalText && !promptOnlyMode) {
      return NextResponse.json(
        { error: 'goalText is required unless in promptOnlyMode' },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Server misconfiguration: missing GEMINI_API_KEY' },
        { status: 500 }
      );
    }

    const llm = new ChatGoogleGenerativeAI({
      model: 'gemini-3.1-pro-preview', // User specifically requested this model format in the example
      apiKey: process.env.GEMINI_API_KEY,
    });

    const count = clipCount || videoCount || 2;

    if (promptOnlyMode && filmDirectionSystem && avatarImageBase64) {
      const structuredLlm = llm.withStructuredOutput(PromptOnlySchema);
      const textContent = `You are an expert cinematic director.
Film Direction System:
${filmDirectionSystem}

Task: Generate a video prompt based on the provided avatar image and existing dialogues.
- CRITICAL: Place the persona and audio instructions AT THE VERY TOP of the generated video prompt because VEO prioritizes the top of the prompt
- Identify the persona of the subject from the avatar image and the goal, and explicitly describe their persona to derive human realism
- Add instructions for realistic audio: specify the inclusion of engaging UGC-style music (avoid generic AI music) that sits perfectly under vocal speech to attract attention as a reel, along with real human speech with appropriate emotions
- Treat the Film Direction System as the cinematic reference for all visual decisions
- Review the templates provided in the Film Direction System, choose the one that best resonates with the content/goal, and build the video prompt strictly based on that template.
- Make sure to include all cinematic details described in the chosen template (camera movements, angles, voice, SFX, camera lens, lighting, etc.).
- Output a concise video prompt (no more than a few hundred words) with zero dialogue content. The final output must strictly follow the chosen template from the Film Direction System as your bible, containing only the persona, audio instructions, and the visual style details.
- Treat the Film Direction System as the cinematic reference for all visual decisions
- Review the templates provided in the Film Direction System, choose the one that best resonates with the content/goal, and build the video prompt strictly based on that template.
- Make sure to include all cinematic details described in the chosen template (camera movements, angles, voice, SFX, camera lens, lighting, etc.).
- Output a concise video prompt (no more than a few hundred words) with zero dialogue content. The final output must strictly follow the chosen template from the Film Direction System as your bible, containing only the persona, audio instructions, and the visual style details.

Goal Text Context: ${goalText || 'N/A'}
Existing Dialogues Context: ${existingDialogues ? JSON.stringify(existingDialogues) : 'None'}`;

      const imageUrl = avatarImageBase64.startsWith('data:')
        ? avatarImageBase64
        : `data:image/jpeg;base64,${avatarImageBase64}`;

      const messages = [
        new HumanMessage({
          content: [
            { type: 'text', text: textContent },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        }),
      ];

      const parsed = await structuredLlm.invoke(messages);
      return NextResponse.json({ videoPrompt: parsed.videoPrompt });
    }

    if (filmDirectionSystem && avatarImageBase64) {
      const structuredLlm = llm.withStructuredOutput(AdvancedScriptSchema);
      const textContent = `You are an expert scriptwriter and cinematic director for short-form video content.
Film Direction System:
${filmDirectionSystem}

Goal: ${goalText}
Task: 
1. Generate exactly ${count} short script dialogues based on the goal. Each dialogue MUST be readable out loud in 8 seconds or less.
2. Generate a single shared video prompt.

Instructions for Dialogues:
- Each dialogue MUST be prefixed explicitly with "dialogue: " followed by the spoken text.
- The spoken dialogue MUST NOT contain any hyphens (-) or special characters.
- Any acting notes, moods, or directions MUST be separated from the spoken dialogue, placed on a different line (e.g., above or below the dialogue line).

Instructions for Video Prompt:
- CRITICAL: Place the persona and audio instructions AT THE VERY TOP of the generated video prompt because VEO prioritizes the top of the prompt
- Identify the persona of the subject from the avatar image and the goal, and explicitly describe their persona to derive human realism
- Add instructions for realistic audio: specify the inclusion of engaging UGC-style music (avoid generic AI music) that sits perfectly under vocal speech to attract attention as a reel, along with real human speech with appropriate emotions
- Treat the Film Direction System as the cinematic reference for all visual decisions
- Analyse the avatar image for skin tone and recommend appropriate lighting and color grade from Module 1I and 1K of the system
- Review the templates provided in the Film Direction System, choose the one that best resonates with the content/goal, and build the video prompt strictly based on that template.
- Make sure to include all cinematic details described in the chosen template (camera movements, angles, voice, SFX, camera lens, lighting, etc.).
- Output a concise video prompt (no more than a few hundred words) with zero dialogue content. The final output must strictly follow the chosen template from the Film Direction System as your bible, containing only the persona, audio instructions, and the visual style details.`;

      const imageUrl = avatarImageBase64.startsWith('data:')
        ? avatarImageBase64
        : `data:image/jpeg;base64,${avatarImageBase64}`;

      const messages = [
        new HumanMessage({
          content: [
            { type: 'text', text: textContent },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        }),
      ];

      const parsed = await structuredLlm.invoke(messages);

      return NextResponse.json({
        dialogues: parsed.dialogues,
        videoPrompt: parsed.videoPrompt,
      });
    }

    const structuredLlm = llm.withStructuredOutput(ScriptSchema);

    const prompt = `You are an expert scriptwriter for short-form video content.
Goal: ${goalText}
Task: Generate exactly ${count} short script dialogues based on the goal.
CRITICAL CONSTRAINT: Each dialogue must be very short and punchy. It MUST be readable out loud at a normal speaking pace in 8 seconds or less (aim for around 15-20 words max per clip).
FORMATTING RULES FOR DIALOGUE:
1. Every dialogue MUST be explicitly prefixed with the exact string "dialogue: " followed by the spoken text.
2. The spoken dialogue itself MUST NOT contain any hyphens (-) or special characters.
3. Any acting notes, moods, or directions MUST be completely separated from the spoken text, placed on a separate line above or below the "dialogue: " line.`;

    const parsed = await structuredLlm.invoke(prompt);

    return NextResponse.json({
      dialogues: parsed.scripts.map((s: any) => s.text),
    });
  } catch (error: any) {
    console.error('Script generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate scripts: ' + error.message },
      { status: 500 }
    );
  }
}
