export type Shot = {
  id?: string;
  shot_number: number;
  duration: number | string;
  resolution: string;
  aspectRatio: string;
  imageRefs: string[];
  prompt: string;
  selected?: boolean;
  status?: 'idle' | 'generating' | 'completed' | 'error';
};

export type GeneratedVideo = {
  id: string;
  blobUrl: string;
  shotId: string;
  shotNumber: number;
  createdAt: number;
};

export type ImageItem = {
  id: string;
  file?: File;
  previewUrl: string;
  blobUrl?: string;
};

export type ScriptThread = {
  id: string;
  name: string;
  createdAt: number;
};
