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

const MultiClipScriptSchema = z.object({
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
  commonVideoPrompt: z
    .string()
    .describe(
      'Shared baseline covering only persona, audio rules, and overall visual style. No scene or environment details — those go in clipPrompts.'
    ),
  clipPrompts: z
    .array(
      z.object({
        clipId: z
          .number()
          .describe('The clip number this prompt applies to (1-based)'),
        prompt: z
          .string()
          .describe(
            'Scene-specific visual context for this clip synthesised from its assigned images: environment, background, location, lighting mood. Empty string if the clip has no assigned images.'
          ),
      })
    )
    .describe(
      'One entry per clip. Clips with no images get an empty prompt string.'
    ),
});

const PromptOnlySchema = z.object({
  videoPrompt: z
    .string()
    .describe(
      'A single shared video prompt that describes visual style only — no dialogue content'
    ),
});

const ClipPromptOnlySchema = z.object({
  clipPrompt: z
    .string()
    .describe(
      'Scene-specific visual context for this clip synthesised from its assigned images. Empty string if no images. No persona, no audio rules, no style repetition.'
    ),
});

// VEO injections appended to the common/shared prompt only
const PACING_INSTRUCTION =
  'Speak at a natural conversational pace of approximately 2.5 to 3 words per second. No pauses between words.';
const HARD_STOP_INSTRUCTION =
  'Stop all dialogue, mouth movement, and speech immediately when the scripted lines are finished. Hold a neutral expression after speaking.';
const VEO_HARDCODED_INJECTIONS = `Final frame: clean held neutral expression, no fade out, no zoom, no vignette, no transition effect, no dissolve, hard clean stop on final frame.
Consistency: lighting quality, lighting direction, environment, background, voice tone, skin texture, and color grade must remain identical throughout all segments. No drift permitted between segments or extensions.
Skin and hair: no specular highlights on hair or face, matte skin rendering, no shine, flat diffused light on skin surface, consistent throughout.`;

function appendVeoInjections(prompt: string): string {
  return `${prompt}\n\nInstructions:\n- ${PACING_INSTRUCTION}\n- ${HARD_STOP_INSTRUCTION}\n\n${VEO_HARDCODED_INJECTIONS}`;
}

export async function POST(req: NextRequest) {
  try {
    const {
      goalText,
      clipCount,
      videoCount,
      commonRules,
      avatarImageBase64,
      avatarImages, // [{ id: string, base64: string }]
      clipImageMap, // [{ clipId, images: [{ id, base64, mimeType }] }]
      promptOnlyMode, // legacy boolean — treated as mode: 'common'
      mode, // 'all' | 'common' | 'clip'
      clipDialogue, // for mode: 'clip'
      commonVideoPrompt, // for mode: 'clip'
      existingDialogues,
      styles,
      selectionContext,
    } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Server misconfiguration: missing GEMINI_API_KEY' },
        { status: 500 }
      );
    }

    // Resolve effective mode
    const effectiveMode: 'all' | 'common' | 'clip' =
      mode === 'clip'
        ? 'clip'
        : mode === 'common' || promptOnlyMode === true
          ? 'common'
          : 'all';

    const llm = new ChatGoogleGenerativeAI({
      model: 'gemini-3.1-pro-preview',
      apiKey: process.env.GEMINI_API_KEY,
    });

    const count = clipCount || videoCount || 2;

    // -------------------------------------------------------------------------
    // Style pre-selection (shared across all modes)
    // -------------------------------------------------------------------------
    let assembledSystem = commonRules || '';
    const firstImageBase64 = avatarImages?.[0]?.base64 || avatarImageBase64;

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
        if (firstImageBase64) {
          const imageUrl = firstImageBase64.startsWith('data:')
            ? firstImageBase64
            : `data:image/jpeg;base64,${firstImageBase64}`;

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

    // -------------------------------------------------------------------------
    // mode: 'clip' — regenerate one clip's visual prompt from its assigned images
    // -------------------------------------------------------------------------
    if (effectiveMode === 'clip') {
      const structuredLlm = llm.withStructuredOutput(ClipPromptOnlySchema);
      const clipImages: { base64: string; mimeType: string }[] =
        avatarImages ?? [];

      const textContent = `You are an expert cinematic director.
Task: Write the scene-specific visual context for a single video clip, based ONLY on its assigned reference images.

Common Video Prompt (already written — do NOT repeat persona, audio, or style details from here): ${commonVideoPrompt || 'N/A'}
Goal: ${goalText || 'N/A'}
Clip dialogue: ${clipDialogue || 'N/A'}

Rules:
- Describe environment, background, location, and lighting mood synthesised from ALL the reference images shown.
- If no images are provided, return an empty string.
- 1–3 concise sentences. No persona. No audio instructions. No style template repetition.`;

      const messageContent: any[] = [{ type: 'text', text: textContent }];
      for (const img of clipImages) {
        const url = img.base64.startsWith('data:')
          ? img.base64
          : `data:image/jpeg;base64,${img.base64}`;
        messageContent.push({ type: 'image_url', image_url: { url } });
      }

      const parsed = await structuredLlm.invoke([
        new HumanMessage({ content: messageContent }),
      ]);
      return NextResponse.json({ clipPrompt: parsed.clipPrompt });
    }

    // -------------------------------------------------------------------------
    // mode: 'common' — regenerate only the shared video prompt
    // -------------------------------------------------------------------------
    if (effectiveMode === 'common' && assembledSystem && firstImageBase64) {
      const structuredLlm = llm.withStructuredOutput(PromptOnlySchema);
      const textContent = `You are an expert cinematic director.
Film Direction System:
${assembledSystem}

Task: Generate a video prompt based on the provided avatar image and existing dialogues.
- CRITICAL: Place the persona and audio instructions AT THE VERY TOP of the generated video prompt because VEO prioritizes the top of the prompt
- Identify the persona of the subject from the avatar image and the goal, and explicitly describe their persona to derive human realism
- Add instructions for realistic audio: explicitly specify that there must be NO background music or soundtrack of any kind, only clear real human speech with appropriate emotions
- A single style template has been pre-selected and provided to you based on the goal, image, and context. Use it as your complete and only visual reference. Do not choose between templates. Do not deviate from the provided template.
- Follow the constraint stack order exactly when assembling the output: shot size and angle first, then lens and focus, then camera body, then frame rate, then subject and blocking, then environment with all three depth layers specified explicitly as foreground, midground, and background, then lighting quality and direction, then color grade, then grain, then motion blur, then aspect ratio and vertical format rules if applicable, then one single emotional tone word last.
- Output keywords and short directives only — no prose, no explanations, no section headers, no meta-commentary. The output will be passed directly to Veo as a generation prompt.
- Analyse the avatar image for skin tone and select the lighting and color grade choices from the provided style template that are most flattering for that specific skin tone.
- If the aspect ratio is 9:16, apply the vertical format composition rules from the style template — subject centered or in upper third, action in vertical plane, standard lens only, no anamorphic.
- Make sure to include all cinematic details described in the chosen template (camera movements, angles, voice, SFX, camera lens, lighting, etc.).
- The final output must strictly follow the template from the Film Direction System, containing only the persona, audio instructions, and the visual style details with zero dialogue content.

Goal Text Context: ${goalText || 'N/A'}
Existing Dialogues Context: ${existingDialogues ? JSON.stringify(existingDialogues) : 'None'}`;

      const imageUrl = firstImageBase64.startsWith('data:')
        ? firstImageBase64
        : `data:image/jpeg;base64,${firstImageBase64}`;

      const messages = [
        new HumanMessage({
          content: [
            { type: 'text', text: textContent },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        }),
      ];

      const parsed = await structuredLlm.invoke(messages);
      const finalVideoPrompt = appendVeoInjections(parsed.videoPrompt);
      return NextResponse.json({ videoPrompt: finalVideoPrompt });
    }

    // -------------------------------------------------------------------------
    // mode: 'all' with images + clip map — full generation with per-clip prompts
    // -------------------------------------------------------------------------
    if (
      effectiveMode === 'all' &&
      goalText &&
      assembledSystem &&
      avatarImages &&
      avatarImages.length > 0
    ) {
      const structuredLlm = llm.withStructuredOutput(MultiClipScriptSchema);

      // Describe clip assignments for the LLM
      const clipMapDesc = clipImageMap
        ? (clipImageMap as any[])
            .map(
              (c: any) =>
                `Clip ${c.clipId}: ${c.images.length > 0 ? c.images.map((img: any) => `image id=${img.id}`).join(', ') : 'no images'}`
            )
            .join('\n')
        : 'No clip-image mapping provided.';

      const textContent = `You are an expert scriptwriter and cinematic director for short-form video content.
Film Direction System:
${assembledSystem}

Goal: ${goalText}
Clip-to-image assignments:
${clipMapDesc}

Task:
1. Generate exactly ${count} short script dialogues. Each MUST be readable out loud in 8 seconds or less.
2. Generate a commonVideoPrompt with ONLY persona, audio rules, and overall visual style — zero environment or scene details.
3. Generate a clipPrompt for EACH clip (clipId 1..${count}). Synthesise all images assigned to that clip into a scene description. Empty string for clips with no images.

Instructions for Dialogues:
- Each dialogue MUST be prefixed explicitly with "dialogue: " followed by the spoken text.
- No hyphens (-) or special characters in spoken text.
- Acting notes on separate lines.

Instructions for commonVideoPrompt:
- Persona and audio instructions FIRST (VEO prioritises top of prompt).
- Describe the subject's persona from the reference images.
- NO background music — only clear natural human speech.
- Use ONLY the pre-selected style template. Follow the constraint stack: shot → lens → camera → frame rate → subject → lighting → colour grade → grain → motion blur → aspect ratio → one emotional tone word.
- NO environment or scene location — those go in clipPrompts.

Instructions for clipPrompts:
- Describe the FULL scene for this clip: environment, background, location, lighting mood, AND the specific actions, character interactions, and movements happening in this moment.
- If the goal includes shot-by-shot details or specific scene directions for this clip number, capture and refine them — make them more precise and cinematic while keeping them synchronised with the dialogue and the overall script arc.
- Think of it as a director's shot note: what the camera sees, where characters are, what they are doing, and how it feels.
- 2–4 sentences. No persona. No audio. No style repetition.
- Empty string if the clip has no images assigned and the goal has no scene-specific direction for this clip.`;

      // Attach all unique images (deduped) to the message for the LLM to see
      const messageContent: any[] = [{ type: 'text', text: textContent }];
      for (const img of avatarImages as any[]) {
        const url = img.base64.startsWith('data:')
          ? img.base64
          : `data:image/jpeg;base64,${img.base64}`;
        messageContent.push({ type: 'image_url', image_url: { url } });
      }

      const parsed = await structuredLlm.invoke([
        new HumanMessage({ content: messageContent }),
      ]);
      const finalVideoPrompt = appendVeoInjections(parsed.commonVideoPrompt);

      return NextResponse.json({
        topicName: parsed.topicName,
        dialogues: parsed.dialogues,
        videoPrompt: finalVideoPrompt,
        clipPrompts: parsed.clipPrompts,
      });
    }

    // -------------------------------------------------------------------------
    // mode: 'all' with single image — legacy AdvancedScriptSchema path
    // -------------------------------------------------------------------------
    if (goalText && assembledSystem && firstImageBase64) {
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
- Add instructions for realistic audio: explicitly specify that there must be NO background music or soundtrack of any kind, only clear real human speech with appropriate emotions
- A single style template has been pre-selected and provided to you based on the goal, image, and context. Use it as your complete and only visual reference. Do not choose between templates. Do not deviate from the provided template.
- Follow the constraint stack order exactly when assembling the output: shot size and angle first, then lens and focus, then camera body, then frame rate, then subject and blocking, then environment with all three depth layers specified explicitly as foreground, midground, and background, then lighting quality and direction, then color grade, then grain, then motion blur, then aspect ratio and vertical format rules if applicable, then one single emotional tone word last.
- Output keywords and short directives only — no prose, no explanations, no section headers, no meta-commentary. The output will be passed directly to Veo as a generation prompt.
- Analyse the avatar image for skin tone and select the lighting and color grade choices from the provided style template that are most flattering for that specific skin tone.
- If the aspect ratio is 9:16, apply the vertical format composition rules from the style template — subject centered or in upper third, action in vertical plane, standard lens only, no anamorphic.
- Make sure to include all cinematic details described in the chosen template (camera movements, angles, voice, SFX, camera lens, lighting, etc.).
- The final output must strictly follow the template from the Film Direction System, containing only the persona, audio instructions, and the visual style details with zero dialogue content.`;

      const imageUrl = firstImageBase64.startsWith('data:')
        ? firstImageBase64
        : `data:image/jpeg;base64,${firstImageBase64}`;

      const messages = [
        new HumanMessage({
          content: [
            { type: 'text', text: textContent },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        }),
      ];

      const parsed = await structuredLlm.invoke(messages);
      const finalVideoPrompt = appendVeoInjections(parsed.videoPrompt);

      return NextResponse.json({
        topicName: parsed.topicName,
        dialogues: parsed.dialogues,
        videoPrompt: finalVideoPrompt,
      });
    }

    // -------------------------------------------------------------------------
    // Fallback: no image / no film direction system — text-only generation
    // -------------------------------------------------------------------------
    if (!goalText && !promptOnlyMode) {
      return NextResponse.json(
        { error: 'goalText is required unless in promptOnlyMode' },
        { status: 400 }
      );
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
