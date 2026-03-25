export type MediaType = 'video' | 'audio';

export interface MediaItem {
  id: string;
  name: string;
  type: MediaType;
  localUrl: string; // blob URL — in-memory only, not persisted
  serverPath: string | null; // set after upload to server
  duration: number; // seconds
  thumbnail: string | null; // data URL of first video frame
  waveform: number[] | null; // normalised 0-1 amplitude samples (audio)
  size: number; // bytes
}

export interface Clip {
  id: string;
  mediaItemId: string;
  trackId: string;
  timelineStart: number; // seconds from timeline origin
  trimStart: number; // seconds removed from source start
  trimEnd: number; // seconds removed from source end
  speed: number; // 0.25–2 (tempo multiplier)
  volume: number; // 0–100
}

export interface Track {
  id: string;
  type: MediaType;
  name: string;
  muted: boolean;
}

export interface Project {
  id: string;
  name: string;
  tracks: Track[];
  clips: Clip[];
  createdAt: number;
  updatedAt: number;
}

/** Playable duration of a clip after trim and speed adjustment */
export function effectiveDuration(clip: Clip, sourceDuration: number): number {
  const trimmed = sourceDuration - clip.trimStart - clip.trimEnd;
  return Math.max(0.1, trimmed / clip.speed);
}

/** Timeline end-time of a clip */
export function clipEndTime(clip: Clip, sourceDuration: number): number {
  return clip.timelineStart + effectiveDuration(clip, sourceDuration);
}

export const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5, 2] as const;
export type SpeedOption = (typeof SPEED_OPTIONS)[number];
