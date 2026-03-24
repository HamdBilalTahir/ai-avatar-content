import { v4 as uuidv4 } from 'uuid';
import redis from '@/lib/redis';
import type { PipelineJob } from '@/lib/types';

export async function createJob(
  topic: string,
  avatarPrompt: string,
  imageBase64: string
): Promise<string> {
  const job_id = uuidv4();

  const job: PipelineJob = {
    job_id,
    status: 'pending',
    voice_style: null,
    stage_message: 'Pipeline created',
    topic,
    avatar_prompt: avatarPrompt,
    script: null,
    audio_path: null,
    avatar_image_path: null,
    final_video_path: null,
    error: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  try {
    await redis.set(`job:${job_id}`, JSON.stringify(job));
    await redis.set(`avatar:${job_id}`, imageBase64, { ex: 3600 });
  } catch (err) {
    throw new Error(`Failed to write job ${job_id} to Redis: ${err}`);
  }

  return job_id;
}

export async function getJob(job_id: string): Promise<PipelineJob | null> {
  const raw = await redis.get<string>(`job:${job_id}`);

  if (raw === null || raw === undefined) {
    return null;
  }

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed as PipelineJob;
  } catch {
    throw new Error(
      `Failed to parse stored job ${job_id}: value is not valid JSON`
    );
  }
}

export async function updateJob(
  job_id: string,
  updates: Partial<PipelineJob>
): Promise<void> {
  const existing = await getJob(job_id);

  if (existing === null) {
    throw new Error(`Job not found: ${job_id}`);
  }

  const updated: PipelineJob = {
    ...existing,
    ...updates,
    updated_at: Date.now(),
  };

  try {
    await redis.set(`job:${job_id}`, JSON.stringify(updated));
  } catch (err) {
    throw new Error(`Failed to update job ${job_id} in Redis: ${err}`);
  }
}

export async function getAvatarBase64(job_id: string): Promise<string | null> {
  const value = await redis.get<string>(`avatar:${job_id}`);
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'string' ? value : String(value);
}
