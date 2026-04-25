export interface VoiceStyleConfig {
  emotion: string;
  speed: number;
  volume: number;
}

export interface PipelineJob {
  job_id: string;
  voice_style: VoiceStyleConfig | null;
  status:
    | 'pending'
    | 'script_generating'
    | 'script_complete'
    | 'tts_processing'
    | 'tts_complete'
    | 'lipsync_processing'
    | 'complete'
    | 'failed';
  stage_message: string;
  topic: string;
  avatar_prompt: string;
  script: string | null;
  audio_path: string | null;
  avatar_image_path: string | null;
  final_video_path: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export interface ReferenceImage {
  data: string; // base64
  mime_type: string;
}

export interface AvatarGenerateRequest {
  avatar_prompt: string;
  negative_prompt?: string;
  reference_images?: ReferenceImage[];
}

export interface AvatarGenerateResponse {
  image_base64: string;
  mime_type: string;
}

export interface PipelineCreateRequest {
  topic: string;
  script?: string;
  avatar_prompt: string;
  image_base64: string;
  voice_id?: string;
  voice_style_override?: VoiceStyleConfig;
}

export interface PipelineStatusResponse {
  job: PipelineJob;
  video_url: string | null;
}

export interface UserSession {
  sessionId: string;
  uid: string;
  userAgent: string;
  status: 'active' | 'ended' | 'revoked';
  createdAt: any; // Firestore serverTimestamp
  endedAt: any | null; // null if active
  lastActive: any; // Firestore serverTimestamp
}

// --- Firestore Schema Definitions ---

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  createdAt: any;
}

export interface ScriptDocument {
  scriptId: string;
  userId: string;
  name: string;
  model: string;
  apiKey?: string; // Optional: user's personal API key overrides
  createdAt: any;
  updatedAt: any;
}

export interface ShotDocument {
  shotId: string;
  scriptId: string; // Implicit parent
  shotNumber: number;
  duration: number | string;
  resolution: string;
  prompt: string;
  imageRefs: string[]; // Refs imageLibraries IDs
  status?: 'idle' | 'generating' | 'completed' | 'error';
  createdAt?: any;
  updatedAt?: any;
}

export interface GlobalDocument {
  globalId: string;
  scriptId: string; // Implicit parent
  name: string;
  value: string;
}

export interface ImageLibraryDocument {
  imageId: string;
  userId: string;
  blobUrl: string; // Later will be Vercel Blob URL
  createdAt?: any;
}

export interface GeneratedVideoDocument {
  videoId: string;
  userId: string;
  scriptId: string;
  shotId: string;
  blobUrl: string; // Later will be Vercel Blob URL
  createdAt?: any;
}
