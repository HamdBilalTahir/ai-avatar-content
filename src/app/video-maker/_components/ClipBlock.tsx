'use client';
import { useRef, useState, useCallback, useEffect } from 'react';
import { useEditor } from '../store';
import { effectiveDuration, SPEED_OPTIONS } from '../types';
import type { Clip } from '../types';

interface Props {
  clip: Clip;
  zoom: number;
}

const TRACK_HEIGHT = 56;

export default function ClipBlock({ clip, zoom }: Props) {
  const { state, dispatch, activeProject } = useEditor();
  const media = state.mediaItems.find((m) => m.id === clip.mediaItemId);
  const isSelected = state.selectedClipId === clip.id;

  const duration = media ? effectiveDuration(clip, media.duration) : 1;
  const width = Math.max(8, duration * zoom);
  const left = clip.timelineStart * zoom;

  const dragStartX = useRef(0);
  const dragStartTimeline = useRef(0);
  const isDragging = useRef(false);
  const trimSide = useRef<'left' | 'right' | null>(null);
  const trimStartVal = useRef(0);
  const trimEndVal = useRef(0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // ── Clip drag (move) ────────────────────────────────────────────────────────
  function onClipMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).dataset.trim) return; // let trim handle it
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: 'SELECT_CLIP', clipId: clip.id });
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartTimeline.current = clip.timelineStart;

    function onMove(ev: MouseEvent) {
      if (!isDragging.current) return;
      const dx = ev.clientX - dragStartX.current;
      const newStart = Math.max(0, dragStartTimeline.current + dx / zoom);
      dispatch({
        type: 'MOVE_CLIP',
        clipId: clip.id,
        timelineStart: newStart,
        trackId: clip.trackId,
      });
    }
    function onUp() {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ── Trim handles ────────────────────────────────────────────────────────────
  function onTrimMouseDown(side: 'left' | 'right', e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    trimSide.current = side;
    dragStartX.current = e.clientX;
    trimStartVal.current = clip.trimStart;
    trimEndVal.current = clip.trimEnd;

    function onMove(ev: MouseEvent) {
      if (!media) return;
      const dx = ev.clientX - dragStartX.current;
      const dtSeconds = dx / zoom;

      if (side === 'left') {
        const newTrimStart = Math.max(
          0,
          Math.min(
            trimStartVal.current + dtSeconds,
            media.duration - clip.trimEnd - 0.5
          )
        );
        const newTimelineStart = Math.max(
          0,
          clip.timelineStart +
            (newTrimStart - trimStartVal.current) / clip.speed
        );
        dispatch({
          type: 'TRIM_CLIP',
          clipId: clip.id,
          trimStart: newTrimStart,
          trimEnd: clip.trimEnd,
        });
        dispatch({
          type: 'MOVE_CLIP',
          clipId: clip.id,
          timelineStart: newTimelineStart,
          trackId: clip.trackId,
        });
      } else {
        const newTrimEnd = Math.max(
          0,
          Math.min(
            trimEndVal.current - dtSeconds,
            media.duration - clip.trimStart - 0.5
          )
        );
        dispatch({
          type: 'TRIM_CLIP',
          clipId: clip.id,
          trimStart: clip.trimStart,
          trimEnd: newTrimEnd,
        });
      }
    }
    function onUp() {
      trimSide.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ── Split at playhead ───────────────────────────────────────────────────────
  const splitAtPlayhead = useCallback(() => {
    const t = state.playhead;
    const end = clip.timelineStart + duration;
    if (t <= clip.timelineStart || t >= end) return;
    dispatch({
      type: 'SPLIT_CLIP',
      clipId: clip.id,
      atTime: t,
      newClipId: Math.random().toString(36).slice(2, 10),
    });
  }, [state.playhead, clip.timelineStart, duration, clip.id, dispatch]);

  // Determine track type for colour
  const trackType =
    activeProject?.tracks.find((t) => t.id === clip.trackId)?.type ?? 'video';

  // Waveform / thumbnail content
  const bgClass =
    trackType === 'video'
      ? isSelected
        ? 'bg-violet-400'
        : 'bg-violet-500'
      : isSelected
        ? 'bg-emerald-400'
        : 'bg-emerald-600';

  const ringClass = isSelected ? 'ring-2 ring-white ring-offset-1' : '';

  if (!media) {
    return (
      <div
        className={`absolute flex items-center justify-center rounded ${bgClass} opacity-50 text-white text-[10px] select-none`}
        style={{ left, width, height: TRACK_HEIGHT - 8, top: 4 }}
      >
        Missing
      </div>
    );
  }

  return (
    <div
      className={`absolute rounded overflow-hidden select-none cursor-grab active:cursor-grabbing ${bgClass} ${ringClass}`}
      style={{
        left,
        width: Math.max(8, width),
        height: TRACK_HEIGHT - 8,
        top: 4,
      }}
      onMouseDown={onClipMouseDown}
    >
      {/* Video frame strip */}
      {trackType === 'video' && media.thumbnail && (
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: `url(${media.thumbnail})`,
            backgroundSize: 'auto 100%',
            backgroundRepeat: 'repeat-x',
          }}
        />
      )}

      {/* Audio waveform */}
      {trackType === 'audio' && media.waveform && (
        <svg
          className="absolute inset-0 w-full h-full opacity-50"
          preserveAspectRatio="none"
          viewBox="0 0 120 40"
        >
          {media.waveform.map((v, i) => {
            const h = Math.max(2, v * 32);
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

      {/* Label */}
      <div className="absolute inset-0 flex items-center px-2 pointer-events-none">
        <span className="text-[10px] font-semibold text-white drop-shadow truncate">
          {media.name}
          {clip.speed !== 1 && (
            <span className="ml-1 opacity-80">{clip.speed}×</span>
          )}
        </span>
      </div>

      {/* Trim handles */}
      <div
        data-trim="left"
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/30 hover:bg-white/50 transition"
        onMouseDown={(e) => onTrimMouseDown('left', e)}
      />
      <div
        data-trim="right"
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/30 hover:bg-white/50 transition"
        onMouseDown={(e) => onTrimMouseDown('right', e)}
      />

      {/* Selected toolbar */}
      {isSelected && (
        <div
          className="absolute -top-8 left-0 flex items-center gap-1 bg-slate-800 rounded-lg px-1.5 py-1 shadow-lg z-20"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Split */}
          <button
            title="Split at playhead"
            onClick={splitAtPlayhead}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700 transition"
          >
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M12 3v18M3 12h4M17 12h4" strokeLinecap="round" />
            </svg>
            Split
          </button>

          {/* Speed */}
          <div className="relative">
            <button
              onClick={() => setShowSpeedMenu((v) => !v)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700 transition"
            >
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4l3 3" strokeLinecap="round" />
              </svg>
              {clip.speed}×
            </button>
            {showSpeedMenu && (
              <div className="absolute top-full left-0 mt-1 bg-slate-800 rounded-lg shadow-xl overflow-hidden z-30">
                {SPEED_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      dispatch({
                        type: 'SET_CLIP_SPEED',
                        clipId: clip.id,
                        speed: s,
                      });
                      setShowSpeedMenu(false);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-[10px] hover:bg-slate-700 transition ${
                      clip.speed === s
                        ? 'text-violet-400 font-semibold'
                        : 'text-slate-200'
                    }`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Volume (audio only) */}
          {trackType === 'audio' && (
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={clip.volume}
              onChange={(e) =>
                dispatch({
                  type: 'SET_CLIP_VOLUME',
                  clipId: clip.id,
                  volume: parseFloat(e.target.value),
                })
              }
              className="w-14 accent-violet-400"
              title={`Volume: ${Math.round(clip.volume * 100)}%`}
            />
          )}

          {/* Delete */}
          <button
            title="Delete clip"
            onClick={() => dispatch({ type: 'DELETE_CLIP', clipId: clip.id })}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-slate-700 transition"
          >
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
