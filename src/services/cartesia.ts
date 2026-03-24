import fs from 'fs';
import path from 'path';
import Cartesia from '@cartesia/cartesia-js';
import type { VoiceStyle } from './voice-style';

// Fallback voice — English female (US). Override via CARTESIA_VOICE_ID env var
// or by passing voiceId directly to generateAudio.
const FALLBACK_VOICE_ID = 'a0e99841-438c-4a64-b679-ae501e7d6091';

export async function generateAudio(
  script: string,
  jobId: string,
  voiceId?: string,
  voiceStyle?: VoiceStyle
): Promise<string> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    throw new Error('Missing environment variable: CARTESIA_API_KEY');
  }

  const storagePath = process.env.STORAGE_PATH ?? './storage';
  const jobDir = path.resolve(storagePath, jobId);
  const audioPath = path.join(jobDir, 'audio.wav');

  const resolvedVoiceId =
    voiceId ?? process.env.CARTESIA_VOICE_ID ?? FALLBACK_VOICE_ID;

  const client = new Cartesia({ apiKey });

  const response = await client.tts.generate({
    model_id: 'sonic-3',
    transcript: script,
    voice: { mode: 'id', id: resolvedVoiceId },
    output_format: {
      container: 'wav',
      encoding: 'pcm_s16le',
      sample_rate: 44100,
    },
    language: 'en',
    ...(voiceStyle
      ? {
          generation_config: {
            emotion: voiceStyle.emotion,
            speed: voiceStyle.speed,
            volume: voiceStyle.volume,
          },
        }
      : {}),
  });

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);

  if (audioBuffer.length === 0) {
    throw new Error('Cartesia returned an empty audio response');
  }

  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(audioPath, audioBuffer);

  return audioPath;
}
