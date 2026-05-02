'use client';
import React, { useRef, useState } from 'react';
import { useEditor } from '../store';
import {
  getDraggingMedia,
  setDraggingMedia,
  setHoverTrackId,
} from '../dragState';
import ClipBlock from './ClipBlock';
import type { Track, Clip } from '../types';

interface Props {
  track: Track;
  clips: Clip[];
  zoom: number;
  timelineWidth: number;
  onDrop: (mediaItemId: string, trackId: string, timelineStart: number) => void;
}

const TRACK_HEIGHT = 72;
const HEADER_W = 176;

export default function TrackRow({
  track,
  clips,
  zoom,
  timelineWidth,
  onDrop,
}: Props) {
  const { dispatch } = useEditor();
  const [isDragOver, setIsDragOver] = useState(false);
  const clipAreaRef = useRef<HTMLDivElement>(null);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // Read from module-level state (reliable) with text/plain fallback
    const mediaItemId =
      getDraggingMedia() ?? e.dataTransfer.getData('text/plain');
    setDraggingMedia(null);

    if (!mediaItemId) return;

    // Measure directly from the clip area element — no HEADER_W subtraction needed,
    // so zoom changes and border/padding differences can't introduce an offset.
    const rect = clipAreaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const timelineStart = Math.max(0, (e.clientX - rect.left) / zoom);

    onDrop(mediaItemId, track.id, timelineStart);
  }

  function handleTrackClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-clip]')) return;
    dispatch({ type: 'SELECT_CLIP', clipId: null });
  }

  const isVideo = track.type === 'video';
  const trackBg = isVideo ? 'bg-violet-50/40' : 'bg-emerald-50/40';
  const dragBg = isVideo ? 'bg-violet-100/60' : 'bg-emerald-100/60';
  const headerBg = isVideo
    ? 'bg-violet-50 border-violet-100'
    : 'bg-emerald-50 border-emerald-100';

  return (
    <div
      className={`flex border-b border-slate-200 transition-colors ${isDragOver ? dragBg : ''}`}
      style={{ height: TRACK_HEIGHT }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleTrackClick}
      onPointerEnter={() => setHoverTrackId(track.id)}
    >
      {/* Track header — not a drop target itself, events bubble up to the row */}
      <div
        className={`flex w-44 flex-shrink-0 items-center justify-between border-r px-3 ${headerBg}`}
        style={{ minWidth: HEADER_W }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isVideo ? (
            <svg
              className="h-4 w-4 flex-shrink-0 text-violet-500"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M15 10l4.553-2.277A1 1 0 0 1 21 8.693v6.614a1 1 0 0 1-1.447.916L15 14v-4zM3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
            </svg>
          ) : (
            <svg
              className="h-4 w-4 flex-shrink-0 text-emerald-600"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M9 18V6l12-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
            </svg>
          )}
          <span className="truncate type-level-3 text-slate-700">
            {track.name}
          </span>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'TOGGLE_MUTE', trackId: track.id });
            }}
            title={track.muted ? 'Unmute' : 'Mute'}
            className={`rounded p-0.5 transition ${track.muted ? 'text-amber-500' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {track.muted ? (
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'DELETE_TRACK', trackId: track.id });
            }}
            title="Delete track"
            className="rounded p-0.5 text-slate-300 hover:text-red-500 transition"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Clip area */}
      <div
        ref={clipAreaRef}
        className={`relative overflow-hidden border-l border-slate-200 ${isDragOver ? '' : trackBg}`}
        style={{ width: timelineWidth, minWidth: timelineWidth }}
      >
        {isDragOver && (
          <div className="absolute inset-0 border-2 border-dashed border-violet-400 rounded pointer-events-none z-10 opacity-60" />
        )}
        {clips.map((clip) => (
          <div key={clip.id} data-clip="true">
            <ClipBlock clip={clip} zoom={zoom} />
          </div>
        ))}
      </div>
    </div>
  );
}
