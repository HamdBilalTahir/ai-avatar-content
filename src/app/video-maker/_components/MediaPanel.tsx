'use client';
import { useRef } from 'react';
import { useEditor } from '../store';
import { persistMedia, removeMedia } from '../mediaDb';
import { setDraggingMedia } from '../dragState';
import type { MediaItem } from '../types';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Extract a thumbnail from a video blob URL, preserving the video's actual aspect ratio */
async function extractThumbnail(blobUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      // Seek to 10% through, capped at 2s, so we get a representative frame
      video.currentTime = Math.min(video.duration * 0.1, 2);
    };

    video.onseeked = () => {
      const vw = video.videoWidth || 160;
      const vh = video.videoHeight || 90;

      // Scale so the longest dimension is 240px, preserving aspect ratio
      const scale = 240 / Math.max(vw, vh);
      const cw = Math.round(vw * scale);
      const ch = Math.round(vh * scale);

      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      canvas.getContext('2d')!.drawImage(video, 0, 0, cw, ch);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };

    video.onerror = () => resolve('');
    video.src = blobUrl;
  });
}

/** Sample audio waveform from a blob URL — returns ~120 normalised values */
async function extractWaveform(blobUrl: string): Promise<number[]> {
  try {
    const ctx = new AudioContext();
    const resp = await fetch(blobUrl);
    const buffer = await resp.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buffer);
    const data = decoded.getChannelData(0);
    const samples = 120;
    const blockSize = Math.floor(data.length / samples);
    const out: number[] = [];
    for (let i = 0; i < samples; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++)
        sum += Math.abs(data[i * blockSize + j]);
      out.push(sum / blockSize);
    }
    const max = Math.max(...out, 0.001);
    ctx.close();
    return out.map((v) => v / max);
  } catch {
    return Array(120).fill(0.5);
  }
}

export default function MediaPanel() {
  const { state, dispatch, activeProject } = useEditor();
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const tab = state.activeMediaTab;
  const visible = state.mediaItems.filter(
    (m) => m.type === (tab === 'videos' ? 'video' : 'audio')
  );

  async function handleFiles(files: FileList | null, type: MediaType) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const localUrl = URL.createObjectURL(file);
      const id = uid();

      // Get duration — attach listeners before setting src to avoid missing the event
      const duration = await new Promise<number>((resolve) => {
        const el =
          type === 'video'
            ? document.createElement('video')
            : document.createElement('audio');
        el.preload = 'metadata';
        el.onloadedmetadata = () => resolve(el.duration);
        el.onerror = () => resolve(0);
        el.src = localUrl;
      });

      const thumbnail =
        type === 'video' ? await extractThumbnail(localUrl) : null;
      const waveform =
        type === 'audio' ? await extractWaveform(localUrl) : null;

      const item: MediaItem = {
        id,
        name: file.name.replace(/\.[^.]+$/, ''),
        type,
        localUrl,
        serverPath: null,
        duration,
        thumbnail,
        waveform,
        size: file.size,
      };
      dispatch({ type: 'ADD_MEDIA_ITEM', item });

      // Persist blob to IndexedDB so it survives page reload
      persistMedia(
        {
          id,
          name: item.name,
          type,
          duration,
          thumbnail,
          waveform,
          size: file.size,
        },
        file
      ).catch((err) =>
        console.warn('Failed to persist media to IndexedDB:', err)
      );
    }
  }

  type MediaType = 'video' | 'audio';

  return (
    <div className="flex flex-col h-full">
      {/* Upload buttons */}
      <div className="px-4 py-3 border-b border-slate-200 flex flex-col gap-2">
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files, 'video')}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files, 'audio')}
        />

        <button
          onClick={() =>
            (tab === 'videos' ? videoInputRef : audioInputRef).current?.click()
          }
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-violet-300 bg-violet-50 px-3 py-2.5 text-xs font-semibold text-violet-700 transition hover:border-violet-400 hover:bg-violet-100"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              d="M12 21V8M7 13l5-5 5 5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M5 21h14" strokeLinecap="round" />
          </svg>
          Upload {tab === 'videos' ? 'Videos' : 'Audio'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {(['videos', 'audio'] as const).map((t) => (
          <button
            key={t}
            onClick={() => dispatch({ type: 'SET_MEDIA_TAB', tab: t })}
            className={`flex-1 py-2 text-xs font-medium transition capitalize ${
              tab === t
                ? 'border-b-2 border-violet-600 text-violet-700'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* No active project warning */}
      {!activeProject && (
        <div className="mx-4 mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <p className="text-xs text-amber-700">
            Create or select a project to use media.
          </p>
        </div>
      )}

      {/* Media grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {visible.length === 0 && (
          <p className="py-8 text-center text-xs text-slate-400">
            No {tab} uploaded yet.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {visible.map((item) => (
            <MediaThumbnail key={item.id} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MediaThumbnail({ item }: { item: MediaItem }) {
  const { dispatch } = useEditor();

  function handleRemove() {
    URL.revokeObjectURL(item.localUrl);
    removeMedia(item.id).catch(() => {});
    dispatch({ type: 'REMOVE_MEDIA_ITEM', itemId: item.id });
  }

  function onDragStart(e: React.DragEvent) {
    setDraggingMedia(item.id);
    e.dataTransfer.effectAllowed = 'copy';
    // Also set text/plain as a fallback
    e.dataTransfer.setData('text/plain', item.id);
  }

  function onDragEnd() {
    setDraggingMedia(null);
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group relative rounded-lg overflow-hidden border border-slate-200 bg-slate-100 cursor-grab active:cursor-grabbing select-none"
    >
      {item.type === 'video' ? (
        <div className="relative h-28 bg-slate-900 flex items-center justify-center overflow-hidden">
          {item.thumbnail ? (
            <img
              src={item.thumbnail}
              alt={item.name}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <svg
                className="h-6 w-6 text-slate-400"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M15 10l4.553-2.277A1 1 0 0 1 21 8.693v6.614a1 1 0 0 1-1.447.916L15 14v-4zM3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
              </svg>
            </div>
          )}
          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white font-mono">
            {formatDuration(item.duration)}
          </span>
        </div>
      ) : (
        <div className="relative h-14 bg-violet-900 flex items-center justify-center px-2 overflow-hidden">
          {/* Mini waveform */}
          {item.waveform && (
            <svg
              className="absolute inset-0 w-full h-full opacity-50"
              preserveAspectRatio="none"
              viewBox="0 0 120 40"
            >
              {item.waveform.map((v, i) => {
                const h = Math.max(2, v * 36);
                return (
                  <rect
                    key={i}
                    x={i}
                    y={(40 - h) / 2}
                    width={0.8}
                    height={h}
                    fill="white"
                  />
                );
              })}
            </svg>
          )}
          <svg
            className="h-5 w-5 text-violet-300 relative z-10"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M9 18V6l12-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
          </svg>
          <span className="absolute bottom-1 right-1 text-[10px] text-violet-300 font-mono">
            {formatDuration(item.duration)}
          </span>
        </div>
      )}

      {/* Name + meta */}
      <div className="px-2 py-1.5">
        <p className="truncate text-[11px] font-medium text-slate-700">
          {item.name}
        </p>
        <p className="text-[10px] text-slate-400">{formatSize(item.size)}</p>
      </div>

      {/* Delete button */}
      <button
        onClick={handleRemove}
        className="absolute top-1 right-1 rounded-full bg-black/50 p-0.5 text-white opacity-0 group-hover:opacity-100 transition"
        title="Remove"
      >
        <svg
          className="h-3 w-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
