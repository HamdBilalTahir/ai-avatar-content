import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { createJob, updateJob } from '@/lib/jobs';
import { generateScript } from '@/services/gemini-script';
import { generateAudio } from '@/services/cartesia';
import { extractVoiceStyle, type VoiceStyle } from '@/services/voice-style';
import { generateAvatarVideo } from '@/services/skyreels';

const tag = (job_id: string) => `[pipeline:${job_id}]`;

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

  const {
    topic,
    avatar_prompt,
    image_base64,
    script: providedScript,
    voice_id,
    voice_style_override,
    gemini_api_key,
  } = body as Record<string, unknown>;

  if (!topic || typeof topic !== 'string' || topic.trim() === '') {
    return NextResponse.json(
      { error: 'topic is required and must be a non-empty string' },
      { status: 400 }
    );
  }
  // avatar_prompt is optional metadata — not required when user imports their own image
  const resolvedAvatarPrompt =
    typeof avatar_prompt === 'string' && avatar_prompt.trim() !== ''
      ? avatar_prompt.trim()
      : 'imported';
  if (
    !image_base64 ||
    typeof image_base64 !== 'string' ||
    image_base64.trim() === ''
  ) {
    return NextResponse.json(
      { error: 'image_base64 is required and must be a non-empty string' },
      { status: 400 }
    );
  }

  const job_id = await createJob(topic, resolvedAvatarPrompt, image_base64);
  console.log(`[pipeline] Job created — id: ${job_id}, topic: "${topic}"`);

  const scriptOverride =
    typeof providedScript === 'string' && providedScript.trim() !== ''
      ? providedScript.trim()
      : undefined;

  if (scriptOverride) {
    console.log(
      `[pipeline:${job_id}] User-provided script detected (${scriptOverride.length} chars) — will skip Gemini generation`
    );
  }

  const voiceOverride =
    typeof voice_id === 'string' && voice_id.trim() !== ''
      ? voice_id.trim()
      : undefined;

  const styleOverride =
    voice_style_override &&
    typeof voice_style_override === 'object' &&
    'emotion' in (voice_style_override as object)
      ? (voice_style_override as VoiceStyle)
      : undefined;

  const apiKey =
    typeof gemini_api_key === 'string' ? gemini_api_key : undefined;

  // Fire and forget — response is returned before pipeline runs
  runPipeline(
    job_id,
    topic,
    resolvedAvatarPrompt,
    image_base64,
    scriptOverride,
    voiceOverride,
    styleOverride,
    apiKey
  );

  return NextResponse.json({ job_id }, { status: 200 });
}

async function runPipeline(
  job_id: string,
  topic: string,
  _avatar_prompt: string,
  image_base64: string,
  scriptOverride?: string,
  voiceOverride?: string,
  styleOverride?: VoiceStyle,
  apiKey?: string
): Promise<void> {
  const t = tag(job_id);
  console.log(`${t} Pipeline started`);

  try {
    // ── Step 0: Save avatar image to disk ────────────────────────────────
    console.log(`${t} [0/3] Saving avatar image to disk…`);
    const storagePath = process.env.STORAGE_PATH ?? './storage';
    const jobDir = path.resolve(storagePath, job_id);
    fs.mkdirSync(jobDir, { recursive: true });

    const imageBuffer = Buffer.from(image_base64, 'base64');
    const avatarImagePath = path.join(jobDir, 'avatar.png');
    fs.writeFileSync(avatarImagePath, imageBuffer);
    console.log(
      `${t} [0/3] Avatar saved → ${avatarImagePath} (${imageBuffer.length} bytes)`
    );

    await updateJob(job_id, { avatar_image_path: avatarImagePath });

    // ── Step 1: Script generation (skip if user provided their own) ───────
    let script: string;

    if (scriptOverride) {
      script = scriptOverride;
      console.log(
        `${t} [1/3] Using user-provided script (${script.length} chars, ~${script.trim().split(/\s+/).length} words)`
      );
      await updateJob(job_id, {
        status: 'script_complete',
        script,
        stage_message: 'Using your script',
      });
    } else {
      console.log(
        `${t} [1/3] Generating script via Gemini for topic: "${topic}"`
      );
      await updateJob(job_id, {
        status: 'script_generating',
        stage_message: 'Writing your script…',
      });

      try {
        script = await generateScript(topic, '30s', apiKey);
        console.log(
          `${t} [1/3] Script generated (${script.length} chars, ~${script.trim().split(/\s+/).length} words)`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${t} [1/3] Script generation failed: ${message}`);
        await updateJob(job_id, {
          status: 'failed',
          error: message,
          stage_message: 'Script generation failed',
        });
        return;
      }

      await updateJob(job_id, {
        status: 'script_complete',
        script,
        stage_message: 'Script ready',
      });
    }

    // ── Step 2: Text-to-speech ────────────────────────────────────────────
    await updateJob(job_id, {
      status: 'tts_processing',
      stage_message: 'Analysing voice style…',
    });

    let voiceStyle: VoiceStyle | undefined;

    if (styleOverride) {
      voiceStyle = styleOverride;
      console.log(
        `${t} [2/3] Using manual voice style — emotion: ${voiceStyle.emotion}, speed: ${voiceStyle.speed}, volume: ${voiceStyle.volume}`
      );
      await updateJob(job_id, {
        voice_style: voiceStyle,
        stage_message: 'Generating your voice…',
      });
    } else {
      console.log(`${t} [2/3] Extracting voice style from topic via Gemini…`);
      try {
        voiceStyle = await extractVoiceStyle(topic, apiKey);
        console.log(
          `${t} [2/3] Voice style — emotion: ${voiceStyle.emotion}, speed: ${voiceStyle.speed}, volume: ${voiceStyle.volume}`
        );
        await updateJob(job_id, {
          voice_style: voiceStyle,
          stage_message: 'Generating your voice…',
        });
      } catch (err) {
        console.warn(
          `${t} [2/3] Voice style extraction failed (continuing without it): ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    console.log(`${t} [2/3] Sending script to Cartesia TTS…`);

    let audioPath: string;
    try {
      audioPath = await generateAudio(
        script,
        job_id,
        voiceOverride,
        voiceStyle
      );
      const audioStats = fs.statSync(audioPath);
      console.log(
        `${t} [2/3] Audio saved → ${audioPath} (${(audioStats.size / 1024).toFixed(1)} KB)`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${t} [2/3] TTS failed: ${message}`);
      await updateJob(job_id, {
        status: 'failed',
        error: message,
        stage_message: 'Voice generation failed',
      });
      return;
    }

    await updateJob(job_id, {
      status: 'tts_complete',
      audio_path: audioPath,
      stage_message: 'Voice ready',
    });

    // ── Step 3: Avatar video generation via SkyReels ─────────────────────
    console.log(`${t} [3/3] Submitting to SkyReels A1 on HuggingFace…`);
    console.log(`${t} [3/3]   avatar: ${avatarImagePath}`);
    console.log(`${t} [3/3]   audio:  ${audioPath}`);
    await updateJob(job_id, {
      status: 'lipsync_processing',
      stage_message: 'Generating avatar video… this may take a few minutes',
    });

    let finalVideoPath: string;
    try {
      finalVideoPath = await generateAvatarVideo(
        avatarImagePath,
        audioPath,
        job_id
      );
      console.log(`${t} [3/3] SkyReels complete — video: ${finalVideoPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${t} [3/3] SkyReels failed: ${message}`);
      await updateJob(job_id, {
        status: 'failed',
        error: message,
        stage_message: 'Video generation failed',
      });
      return;
    }

    await updateJob(job_id, {
      status: 'complete',
      final_video_path: finalVideoPath,
      stage_message: 'Your video is ready',
    });
    console.log(`${t} Pipeline complete ✓`);
  } catch (err) {
    // Safety net: catch any unhandled error so the job never gets permanently stuck
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${t} Unhandled pipeline error: ${message}`);
    try {
      await updateJob(job_id, {
        status: 'failed',
        error: message,
        stage_message: 'An unexpected error occurred',
      });
    } catch (updateErr) {
      console.error(
        `${t} Failed to update job status after unhandled error: ${updateErr}`
      );
    }
  }
}
