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
  topicName: z
    .string()
    .describe(
      'A very short, concise, file-safe topic name representing the video (e.g. "AI-Product-Promo")'
    ),
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
  topicName: z
    .string()
    .describe(
      'A very short, concise, file-safe topic name representing the video (e.g. "AI-Product-Promo")'
    ),
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
      commonRules,
      avatarImageBase64,
      promptOnlyMode,
      existingDialogues,
      styles,
      selectionContext,
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

    let assembledSystem = commonRules || '';
    if (styles && styles.length > 0 && selectionContext) {
      try {
        const flashLlm = new ChatGoogleGenerativeAI({
          model: 'gemini-2.5-flash',
          apiKey: process.env.GEMINI_API_KEY,
        });

        const availableKeys = styles.map((s: any) => s.key);

        const preSelectionSchema = z.object({
          selectedKey: z
            .string()
            .describe(
              'The single best matching style key from the available list'
            ),
        });

        const preSelectionPrompt = `You are a cinematic director deciding the best visual style for a video.
Based on the goal, existing dialogues (if any), and the provided reference image (if any), pick the SINGLE most appropriate style key from the available list.
Do not invent keys. Output only one key that exactly matches one of the available keys.

Context:
Goal Text: ${selectionContext.goalText}
Aspect Ratio: ${selectionContext.aspectRatio}
Has Human Subject: ${selectionContext.hasHumanSubject}
Is UGC Style: ${selectionContext.isUGC}
Existing Dialogues: ${existingDialogues ? JSON.stringify(existingDialogues) : 'None'}

Available Style Keys:
${availableKeys.join(', ')}`;

        const messages: any[] = [];
        if (avatarImageBase64) {
          const imageUrl = avatarImageBase64.startsWith('data:')
            ? avatarImageBase64
            : `data:image/jpeg;base64,${avatarImageBase64}`;

          messages.push(
            new HumanMessage({
              content: [
                { type: 'text', text: preSelectionPrompt },
                { type: 'image_url', image_url: { url: imageUrl } },
              ],
            })
          );
        } else {
          messages.push({ role: 'user', content: preSelectionPrompt });
        }

        const parsedPreSelection = await flashLlm
          .withStructuredOutput(preSelectionSchema)
          .invoke(messages);

        const selectedKey = parsedPreSelection.selectedKey;
        const selectedStyle = styles.find(
          (s: any) => s.key.toLowerCase() === selectedKey.toLowerCase()
        );

        if (selectedStyle) {
          console.log(`Selected style key: ${selectedKey}`);
          assembledSystem = `Common Rules:\n${commonRules || ''}\n\nSelected Style (${selectedKey}):\n${selectedStyle.rules || selectedStyle.content}`;
        } else {
          console.warn(`Pre-selection returned unknown key: ${selectedKey}`);
          assembledSystem = `Common Rules:\n${commonRules || ''}`;
        }
      } catch (err) {
        console.warn('Pre-selection failed, falling back to common rules', err);
        assembledSystem = commonRules || '';
      }
    }

    if (promptOnlyMode && assembledSystem && avatarImageBase64) {
      const structuredLlm = llm.withStructuredOutput(PromptOnlySchema);
      const textContent = `You are an expert cinematic director.
Film Direction System:
${assembledSystem}

Task: Generate a video prompt based on the provided avatar image and existing dialogues.
- CRITICAL: Place the persona and audio instructions AT THE VERY TOP of the generated video prompt because VEO prioritizes the top of the prompt
- Identify the persona of the subject from the avatar image and the goal, and explicitly describe their persona to derive human realism
- Add instructions for realistic audio: specify the inclusion of engaging UGC-style music (avoid generic AI music) that sits perfectly under vocal speech to attract attention as a reel, along with real human speech with appropriate emotions
- A single style template has been pre-selected and provided to you based on the goal, image, and context. Use it as your complete and only visual reference. Do not choose between templates. Do not deviate from the provided template.
- Follow the constraint stack order exactly when assembling the output: shot size and angle first, then lens and focus, then camera body, then frame rate, then subject and blocking, then environment with all three depth layers specified explicitly as foreground, midground, and background, then lighting quality and direction, then color grade, then grain, then motion blur, then aspect ratio and vertical format rules if applicable, then one single emotional tone word last.
- Output keywords and short directives only — no prose, no explanations, no section headers, no meta-commentary. The output will be passed directly to Veo as a generation prompt.
- Analyse the avatar image for skin tone and select the lighting and color grade choices from the provided style template that are most flattering for that specific skin tone.
- If the aspect ratio is 9:16, apply the vertical format composition rules from the style template — subject centered or in upper third, action in vertical plane, standard lens only, no anamorphic.
- Make sure to include all cinematic details described in the chosen template (camera movements, angles, voice, SFX, camera lens, lighting, etc.).
- The final output must strictly follow the template from the Film Direction System, containing only the persona, audio instructions, and the visual style details with zero dialogue content.

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

      // Server-side Veo injections
      const PACING_INSTRUCTION =
        'Speak at a natural conversational pace of approximately 2.5 to 3 words per second. No pauses between words.';
      const HARD_STOP_INSTRUCTION =
        'Stop all dialogue, mouth movement, and speech immediately when the scripted lines are finished. Hold a neutral expression after speaking.';
      const VEO_HARDCODED_INJECTIONS = `Final frame: clean held neutral expression, no fade out, no zoom, no vignette, no transition effect, no dissolve, hard clean stop on final frame.
Consistency: lighting quality, lighting direction, environment, background, voice tone, skin texture, and color grade must remain identical throughout all segments. No drift permitted between segments or extensions.
Skin and hair: no specular highlights on hair or face, matte skin rendering, no shine, flat diffused light on skin surface, consistent throughout.`;

      const finalVideoPrompt = `${parsed.videoPrompt}\n\nInstructions:\n- ${PACING_INSTRUCTION}\n- ${HARD_STOP_INSTRUCTION}\n\n${VEO_HARDCODED_INJECTIONS}`;

      return NextResponse.json({ videoPrompt: finalVideoPrompt });
    }

    if (assembledSystem && avatarImageBase64) {
      const structuredLlm = llm.withStructuredOutput(AdvancedScriptSchema);
      const textContent = `You are an expert scriptwriter and cinematic director for short-form video content.
Film Direction System:
${assembledSystem}

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
- A single style template has been pre-selected and provided to you based on the goal, image, and context. Use it as your complete and only visual reference. Do not choose between templates. Do not deviate from the provided template.
- Follow the constraint stack order exactly when assembling the output: shot size and angle first, then lens and focus, then camera body, then frame rate, then subject and blocking, then environment with all three depth layers specified explicitly as foreground, midground, and background, then lighting quality and direction, then color grade, then grain, then motion blur, then aspect ratio and vertical format rules if applicable, then one single emotional tone word last.
- Output keywords and short directives only — no prose, no explanations, no section headers, no meta-commentary. The output will be passed directly to Veo as a generation prompt.
- Analyse the avatar image for skin tone and select the lighting and color grade choices from the provided style template that are most flattering for that specific skin tone.
- If the aspect ratio is 9:16, apply the vertical format composition rules from the style template — subject centered or in upper third, action in vertical plane, standard lens only, no anamorphic.
- Make sure to include all cinematic details described in the chosen template (camera movements, angles, voice, SFX, camera lens, lighting, etc.).
- The final output must strictly follow the template from the Film Direction System, containing only the persona, audio instructions, and the visual style details with zero dialogue content.`;

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

      // Server-side Veo injections
      const PACING_INSTRUCTION =
        'Speak at a natural conversational pace of approximately 2.5 to 3 words per second. No pauses between words.';
      const HARD_STOP_INSTRUCTION =
        'Stop all dialogue, mouth movement, and speech immediately when the scripted lines are finished. Hold a neutral expression after speaking.';
      const VEO_HARDCODED_INJECTIONS = `Final frame: clean held neutral expression, no fade out, no zoom, no vignette, no transition effect, no dissolve, hard clean stop on final frame.
Consistency: lighting quality, lighting direction, environment, background, voice tone, skin texture, and color grade must remain identical throughout all segments. No drift permitted between segments or extensions.
Skin and hair: no specular highlights on hair or face, matte skin rendering, no shine, flat diffused light on skin surface, consistent throughout.`;

      const finalVideoPrompt = `${parsed.videoPrompt}\n\nInstructions:\n- ${PACING_INSTRUCTION}\n- ${HARD_STOP_INSTRUCTION}\n\n${VEO_HARDCODED_INJECTIONS}`;

      return NextResponse.json({
        topicName: parsed.topicName,
        dialogues: parsed.dialogues,
        videoPrompt: finalVideoPrompt,
      });
    }

    const structuredLlm = llm.withStructuredOutput(ScriptSchema);

    const prompt = `You are an expert scriptwriter for short-form video content.
Goal: ${goalText}
Task: Generate exactly ${count} short script dialogues based on the goal. Also provide a concise topicName for the video.
CRITICAL CONSTRAINT: Each dialogue must be very short and punchy. It MUST be readable out loud at a normal speaking pace in 8 seconds or less (aim for around 15-20 words max per clip).
FORMATTING RULES FOR DIALOGUE:
1. Every dialogue MUST be explicitly prefixed with the exact string "dialogue: " followed by the spoken text.
2. The spoken dialogue itself MUST NOT contain any hyphens (-) or special characters.
3. Any acting notes, moods, or directions MUST be completely separated from the spoken text, placed on a separate line above or below the "dialogue: " line.`;

    const parsed = await structuredLlm.invoke(prompt);

    return NextResponse.json({
      topicName: parsed.topicName,
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
