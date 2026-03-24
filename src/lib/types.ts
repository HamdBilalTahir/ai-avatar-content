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
