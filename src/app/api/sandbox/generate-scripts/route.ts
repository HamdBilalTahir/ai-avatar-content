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

const ClipItemSchema = z.object({
  clipLabel: z
    .string()
    .describe(
      'Clip identifier. Use a plain number for normal clips ("1", "2", "3"). Use a number+letter suffix for variation clips ("2A", "2B", "4A", "4B", "4C"). All clips that are variations of the same scene share the same base number.'
    ),
  dialogue: z
    .string()
    .describe(
      'The short dialogue meant to be spoken. Must take exactly or less than 8 seconds to speak.'
    ),
  clipPrompt: z
    .string()
    .describe(
      'Scene-specific visual context for this clip. A-roll: start with a brief persona description of the subject (appearance, look, style from the reference images), then describe scene, environment, background, location, lighting mood, and actions. B-roll (isBroll: true): environment and scenery ONLY — no person, no subject. 2-4 sentences. No audio, no style repetition. Empty string if no images and no scene direction in goal.'
    ),
  variationGroup: z
    .number()
    .optional()
    .describe(
      'Present only on variation clips. The base clip number shared by all variations in this group (e.g. 2 for clips 2A, 2B). Omit for non-variation clips.'
    ),
  variationNote: z
    .string()
    .optional()
    .describe(
      'Present only on variation clips. What makes this specific variation different: mood, movement, expression, pacing. Omit for non-variation clips.'
    ),
  isBroll: z
    .boolean()
    .optional()
    .describe(
      'Set to true when this clip is a B-roll shot — scenery, objects, architecture, or locations with NO human subject. Omit or set false for all clips featuring a person speaking.'
    ),
});

const MultiClipScriptSchema = z.object({
  topicName: z
    .string()
    .describe(
      'A very short, concise, file-safe topic name representing the video (e.g. "AI-Product-Promo")'
    ),
  clips: z
    .array(ClipItemSchema)
    .describe(
      'Exactly clipCount clip entries. Normal clips are numbered sequentially. Variation clips share a base number with a letter suffix (2A, 2B, 4A, 4B, 4C, 4D).'
    ),
  commonVideoPrompt: z
    .string()
    .describe(
      'Shared baseline covering only audio rules and overall cinematic style — NO persona, NO subject description. Must apply equally to A-roll (person speaking) and B-roll (scenery/objects) clips. No scene or environment details — those go in clip clipPrompts.'
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

// Pricing — Gemini API (Google AI Studio), per 1M tokens
// gemini-2.5-flash: $0.15/1M input, $0.60/1M output (non-thinking)
// gemini-3.1-pro-preview: using gemini-2.5-pro rates as proxy ($1.25/1M input, $10/1M output)
const FLASH_INPUT_RATE = 0.15 / 1_000_000;
const FLASH_OUTPUT_RATE = 0.6 / 1_000_000;
const PRO_INPUT_RATE = 1.25 / 1_000_000;
const PRO_OUTPUT_RATE = 10.0 / 1_000_000;

function extractTokens(raw: any): {
  inputTokens: number;
  outputTokens: number;
} {
  const usage = raw?.usage_metadata ?? {};
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
  };
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
      isBroll, // for mode: 'clip'
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
    // Token accumulators — filled by each LLM call, used to compute final cost
    // -------------------------------------------------------------------------
    let flashInputTokens = 0;
    let flashOutputTokens = 0;
    let proInputTokens = 0;
    let proOutputTokens = 0;

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

        const preSelResult = await flashLlm
          .withStructuredOutput(preSelectionSchema, { includeRaw: true })
          .invoke(messages);

        const flashUsage = extractTokens(preSelResult.raw);
        flashInputTokens += flashUsage.inputTokens;
        flashOutputTokens += flashUsage.outputTokens;
        console.log(
          `[generate-scripts] pre-selection tokens — in=${flashUsage.inputTokens} out=${flashUsage.outputTokens}`
        );

        const selectedKey = preSelResult.parsed.selectedKey;
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
      const structuredLlm = llm.withStructuredOutput(ClipPromptOnlySchema, {
        includeRaw: true,
      });
      const clipImages: { base64: string; mimeType: string }[] =
        avatarImages ?? [];

      const clipRule = isBroll
        ? `- B-roll clip: Describe ONLY the environment, scenery, objects, or architecture shown in the reference images. NO mention of any person, subject, human, face, or speaker. Pure scene description only: location, lighting, atmosphere, movement of the environment.`
        : `- A-roll clip (person speaking): Start with a brief persona description of the subject from the reference images (appearance, look, style). Then describe the scene — environment, background, location, lighting mood, and what the subject is doing in this moment.`;

      const textContent = `You are an expert cinematic director.
Task: Write the scene-specific visual context for a single video clip, based ONLY on its assigned reference images.

Common Video Prompt (already written — do NOT repeat audio or style details from here): ${commonVideoPrompt || 'N/A'}
Goal: ${goalText || 'N/A'}
Clip dialogue: ${clipDialogue || 'N/A'}

Rules:
${clipRule}
- If no images are provided, return an empty string.
- 1–3 concise sentences. No audio instructions. No style template repetition.`;

      const messageContent: any[] = [{ type: 'text', text: textContent }];
      for (const img of clipImages) {
        const url = img.base64.startsWith('data:')
          ? img.base64
          : `data:image/jpeg;base64,${img.base64}`;
        messageContent.push({ type: 'image_url', image_url: { url } });
      }

      const result = await structuredLlm.invoke([
        new HumanMessage({ content: messageContent }),
      ]);
      const proUsage = extractTokens(result.raw);
      proInputTokens += proUsage.inputTokens;
      proOutputTokens += proUsage.outputTokens;

      const scriptCostUsd =
        flashInputTokens * FLASH_INPUT_RATE +
        flashOutputTokens * FLASH_OUTPUT_RATE +
        proInputTokens * PRO_INPUT_RATE +
        proOutputTokens * PRO_OUTPUT_RATE;

      console.log(
        `[generate-scripts] clip mode — proIn=${proUsage.inputTokens} proOut=${proUsage.outputTokens} costUsd=$${scriptCostUsd.toFixed(6)}`
      );
      return NextResponse.json({
        clipPrompt: result.parsed.clipPrompt,
        scriptCostUsd,
      });
    }

    // -------------------------------------------------------------------------
    // mode: 'common' — regenerate only the shared video prompt
    // -------------------------------------------------------------------------
    if (effectiveMode === 'common' && assembledSystem && firstImageBase64) {
      const structuredLlm = llm.withStructuredOutput(PromptOnlySchema, {
        includeRaw: true,
      });
      const textContent = `You are an expert cinematic director.
Film Direction System:
${assembledSystem}

Task: Generate a shared video prompt that works for ALL clip types — both A-roll (person speaking to camera) and B-roll (scenery, objects, architecture).
- CRITICAL: Audio rules AT THE VERY TOP — NO background music or soundtrack of any kind, only clear real human speech with appropriate emotions.
- NO persona. NO subject description. NO mention of any person, face, or human — this prompt must be equally valid for clips that show only scenery or objects.
- A single style template has been pre-selected and provided to you based on the goal, image, and context. Use it as your complete and only visual reference. Do not choose between templates. Do not deviate from the provided template.
- Follow the constraint stack order exactly: shot size and angle first, then lens and focus, then camera body, then frame rate, then lighting quality and direction, then color grade, then grain, then motion blur, then aspect ratio and vertical format rules if applicable, then one single emotional tone word last. Skip any "subject and blocking" entries — those are clip-specific.
- Output keywords and short directives only — no prose, no explanations, no section headers, no meta-commentary. The output will be passed directly to Veo as a generation prompt.
- If the aspect ratio is 9:16, apply the vertical format composition rules from the style template — subject centered or in upper third, action in vertical plane, standard lens only, no anamorphic.
- Make sure to include all cinematic details described in the chosen template (camera movements, angles, camera lens, lighting, etc.). Do NOT include any voice or speech SFX cues.
- The final output must contain only audio rules and visual style details — zero dialogue content, zero subject/persona content.

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

      const result = await structuredLlm.invoke(messages);
      const proUsage = extractTokens(result.raw);
      proInputTokens += proUsage.inputTokens;
      proOutputTokens += proUsage.outputTokens;

      const scriptCostUsd =
        flashInputTokens * FLASH_INPUT_RATE +
        flashOutputTokens * FLASH_OUTPUT_RATE +
        proInputTokens * PRO_INPUT_RATE +
        proOutputTokens * PRO_OUTPUT_RATE;

      const finalVideoPrompt = appendVeoInjections(result.parsed.videoPrompt);
      console.log(
        `[generate-scripts] common mode — proIn=${proUsage.inputTokens} proOut=${proUsage.outputTokens} costUsd=$${scriptCostUsd.toFixed(6)}`
      );
      return NextResponse.json({
        videoPrompt: finalVideoPrompt,
        scriptCostUsd,
      });
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
      const structuredLlm = llm.withStructuredOutput(MultiClipScriptSchema, {
        includeRaw: true,
      });

      // Describe clip assignments for the LLM
      const clipMapDesc = clipImageMap
        ? (clipImageMap as any[])
            .map((c: any) => {
              if (c.images.length === 0) return `Clip ${c.clipId}: no images`;
              const imgLabels = c.images
                .map(
                  (img: any) =>
                    `image id=${img.id}${img.isBroll ? ' [B-roll: scenery/object/architecture, no person]' : ' [A-roll: person/avatar]'}`
                )
                .join(', ');
              const allBroll =
                c.images.length > 0 &&
                c.images.every((img: any) => img.isBroll);
              return `Clip ${c.clipId}${allBroll ? ' [B-ROLL CLIP]' : ''}: ${imgLabels}`;
            })
            .join('\n')
        : 'No clip-image mapping provided.';

      const textContent = `You are an expert scriptwriter and cinematic director for short-form video content.
Film Direction System:
${assembledSystem}

Goal: ${goalText}
Clip-to-image assignments:
${clipMapDesc}

Task:
1. Generate exactly ${count} clip entries. Each clip's dialogue MUST be readable out loud in 8 seconds or less.
2. Generate a commonVideoPrompt with ONLY audio rules and overall cinematic style — NO persona, NO subject description, zero environment or scene details. It must apply equally to A-roll and B-roll clips.
3. For EACH clip, synthesise a clipPrompt from its assigned images into a scene description. Empty string for clips with no images.
4. If the goal mentions variations for specific images or scenes, assign letter suffixes to those clips (e.g. "2A", "2B", "4A", "4B", "4C"). All other clips get plain numeric labels ("1", "2", "3"...). Set variationGroup to the base number and variationNote to what makes each variation unique. Total clips must equal exactly ${count}.
5. Determine B-roll from the assigned images and the goal: if a clip's assigned images show scenery, architecture, objects, or locations with NO human subject — OR the goal explicitly describes the clip as B-roll — set isBroll: true on that clip. If a clip has no assigned images but the goal describes it as a scene/location shot with no person, also set isBroll: true.

Instructions for Dialogues:
- Each dialogue MUST be prefixed explicitly with "dialogue: " followed by the spoken text.
- No hyphens (-) or special characters in spoken text.
- Acting notes on separate lines.
- Variation clips sharing a scene should have similar dialogue structure but differ per the variation description.
- Follow the goal exactly for whether a clip has spoken dialogue or not — do not add or remove dialogue that the goal didn't specify.

Instructions for commonVideoPrompt:
- Audio rules FIRST (VEO prioritises top of prompt): NO background music — only clear natural human speech.
- NO persona. NO subject description. NO mention of any person, face, or human subject — the prompt must work for both A-roll (person speaking) and B-roll (scenery/objects only) clips.
- Use ONLY the pre-selected style template. Follow the constraint stack: shot → lens → camera → frame rate → lighting → colour grade → grain → motion blur → aspect ratio → one emotional tone word.
- NO environment or scene location — those go in clipPrompts.

Instructions for clipPrompts:
- For A-roll clips (person speaking): START with a brief persona description of the subject derived from the reference images (appearance, look, style — e.g. "Young woman in her early 30s, long wavy dark hair, natural makeup, white linen shirt"). Then describe the FULL scene — environment, background, location, lighting mood, AND the specific actions, character interactions, and movements happening in this moment.
- For B-roll clips (isBroll: true): Describe ONLY the environment, scenery, objects, or architecture — NO mention of any person, subject, human, face, or speaker. No "subject speaking", no "person", no "camera-facing". Pure scene description only: location, lighting, atmosphere, movement of the environment.
- For variation clips, the scene is the same base environment but vary the micro-movements, expression, or energy per the variationNote.
- If the goal includes shot-by-shot details or specific scene directions for this clip, capture and refine them — make them more precise and cinematic while keeping them synchronised with the dialogue and the overall script arc.
- 2–4 sentences. No persona. No audio. No style repetition.
- Empty string if the clip has no images assigned and the goal has no scene-specific direction for this clip.`;

      // Build a reverse map: imageId → list of clip IDs it's assigned to
      const imageClipAssignments: Record<string, number[]> = {};
      if (clipImageMap) {
        for (const c of clipImageMap as any[]) {
          for (const img of c.images as any[]) {
            if (!imageClipAssignments[img.id])
              imageClipAssignments[img.id] = [];
            imageClipAssignments[img.id].push(c.clipId);
          }
        }
      }

      // Interleave a text label before each image so the LLM can match id → pixels
      const messageContent: any[] = [{ type: 'text', text: textContent }];
      for (const img of avatarImages as any[]) {
        const assignedClips = imageClipAssignments[img.id];
        const label =
          assignedClips && assignedClips.length > 0
            ? `Image id=${img.id} — assigned to clip(s): ${assignedClips.join(', ')}`
            : `Image id=${img.id} — not yet assigned to any clip`;
        messageContent.push({ type: 'text', text: label });
        const url = img.base64.startsWith('data:')
          ? img.base64
          : `data:image/jpeg;base64,${img.base64}`;
        messageContent.push({ type: 'image_url', image_url: { url } });
      }

      const result = await structuredLlm.invoke([
        new HumanMessage({ content: messageContent }),
      ]);
      const proUsage = extractTokens(result.raw);
      proInputTokens += proUsage.inputTokens;
      proOutputTokens += proUsage.outputTokens;

      const scriptCostUsd =
        flashInputTokens * FLASH_INPUT_RATE +
        flashOutputTokens * FLASH_OUTPUT_RATE +
        proInputTokens * PRO_INPUT_RATE +
        proOutputTokens * PRO_OUTPUT_RATE;

      const finalVideoPrompt = appendVeoInjections(
        result.parsed.commonVideoPrompt
      );
      console.log(
        `[generate-scripts] all+images mode — flashIn=${flashInputTokens} flashOut=${flashOutputTokens} proIn=${proUsage.inputTokens} proOut=${proUsage.outputTokens} costUsd=$${scriptCostUsd.toFixed(6)}`
      );

      return NextResponse.json({
        topicName: result.parsed.topicName,
        clips: result.parsed.clips,
        videoPrompt: finalVideoPrompt,
        scriptCostUsd,
      });
    }

    // -------------------------------------------------------------------------
    // mode: 'all' with single image — legacy AdvancedScriptSchema path
    // -------------------------------------------------------------------------
    if (goalText && assembledSystem && firstImageBase64) {
      const structuredLlm = llm.withStructuredOutput(AdvancedScriptSchema, {
        includeRaw: true,
      });
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
- CRITICAL: Audio rules AT THE VERY TOP — NO background music or soundtrack of any kind, only clear real human speech with appropriate emotions.
- NO persona. NO subject description. NO mention of any person, face, or human — the prompt must work for both A-roll and B-roll clips.
- A single style template has been pre-selected and provided to you based on the goal, image, and context. Use it as your complete and only visual reference. Do not choose between templates. Do not deviate from the provided template.
- Follow the constraint stack order exactly: shot size and angle first, then lens and focus, then camera body, then frame rate, then lighting quality and direction, then color grade, then grain, then motion blur, then aspect ratio and vertical format rules if applicable, then one single emotional tone word last.
- Output keywords and short directives only — no prose, no explanations, no section headers, no meta-commentary. The output will be passed directly to Veo as a generation prompt.
- If the aspect ratio is 9:16, apply the vertical format composition rules from the style template — subject centered or in upper third, action in vertical plane, standard lens only, no anamorphic.
- Make sure to include all cinematic details described in the chosen template (camera movements, angles, camera lens, lighting, etc.).
- The final output must contain only audio rules and visual style details — zero dialogue content, zero subject/persona content.`;

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

      const result = await structuredLlm.invoke(messages);
      const proUsage = extractTokens(result.raw);
      proInputTokens += proUsage.inputTokens;
      proOutputTokens += proUsage.outputTokens;

      const scriptCostUsd =
        flashInputTokens * FLASH_INPUT_RATE +
        flashOutputTokens * FLASH_OUTPUT_RATE +
        proInputTokens * PRO_INPUT_RATE +
        proOutputTokens * PRO_OUTPUT_RATE;

      const finalVideoPrompt = appendVeoInjections(result.parsed.videoPrompt);
      console.log(
        `[generate-scripts] all+single-image mode — proIn=${proUsage.inputTokens} proOut=${proUsage.outputTokens} costUsd=$${scriptCostUsd.toFixed(6)}`
      );

      return NextResponse.json({
        topicName: result.parsed.topicName,
        dialogues: result.parsed.dialogues,
        videoPrompt: finalVideoPrompt,
        scriptCostUsd,
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

    const structuredLlm = llm.withStructuredOutput(ScriptSchema, {
      includeRaw: true,
    });

    const prompt = `You are an expert scriptwriter for short-form video content.
Goal: ${goalText}
Task: Generate exactly ${count} short script dialogues based on the goal. Also provide a concise topicName for the video.
CRITICAL CONSTRAINT: Each dialogue must be very short and punchy. It MUST be readable out loud at a normal speaking pace in 8 seconds or less (aim for around 15-20 words max per clip).
FORMATTING RULES FOR DIALOGUE:
1. Every dialogue MUST be explicitly prefixed with the exact string "dialogue: " followed by the spoken text.
2. The spoken dialogue itself MUST NOT contain any hyphens (-) or special characters.
3. Any acting notes, moods, or directions MUST be completely separated from the spoken text, placed on a separate line above or below the "dialogue: " line.`;

    const result = await structuredLlm.invoke(prompt);
    const proUsage = extractTokens(result.raw);
    proInputTokens += proUsage.inputTokens;
    proOutputTokens += proUsage.outputTokens;

    const scriptCostUsd =
      flashInputTokens * FLASH_INPUT_RATE +
      flashOutputTokens * FLASH_OUTPUT_RATE +
      proInputTokens * PRO_INPUT_RATE +
      proOutputTokens * PRO_OUTPUT_RATE;

    console.log(
      `[generate-scripts] text-only fallback — proIn=${proUsage.inputTokens} proOut=${proUsage.outputTokens} costUsd=$${scriptCostUsd.toFixed(6)}`
    );

    return NextResponse.json({
      topicName: result.parsed.topicName,
      dialogues: result.parsed.scripts.map((s: any) => s.text),
      scriptCostUsd,
    });
  } catch (error: any) {
    console.error('Script generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate scripts: ' + error.message },
      { status: 500 }
    );
  }
}
