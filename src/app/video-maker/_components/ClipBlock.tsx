'use client';
import { useRef, useState, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useEditor } from '../store';
import { effectiveDuration, SPEED_OPTIONS } from '../types';
import type { Clip } from '../types';

interface Props {
  clip: Clip;
  zoom: number;
}

const TRACK_HEIGHT = 72;

// ─── Vertical bar control (pointer-capture drag, portal-safe) ───────────────

interface BarProps {
  value: number;
  min: number;
  max: number;
  label: string;
  format?: (v: number) => string;
  color: string; // Tailwind bg class e.g. 'bg-violet-400'
  centered?: boolean; // show center-line marker (for pitch/tone which have a 0 mid-point)
  onDragStart: () => void;
  onChange: (v: number) => void;
}

const BAR_H = 52;

function Bar({
  value,
  min,
  max,
  label,
  format,
  color,
  centered,
  onDragStart,
  onChange,
}: BarProps) {
  const startY = useRef(0);
  const startVal = useRef(0);
  const active = useRef(false);

  const pct = (value - min) / (max - min); // 0 = bottom, 1 = top
  const fillH = Math.round(pct * BAR_H);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    active.current = true;
    startY.current = e.clientY;
    startVal.current = value;
    onDragStart();
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!active.current) return;
    const dy = startY.current - e.clientY; // up = positive
    const delta = (dy / BAR_H) * (max - min);
    onChange(Math.max(min, Math.min(max, startVal.current + delta)));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    active.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const displayVal = format ? format(value) : value.toFixed(1);

  return (
    <div className="flex flex-col items-center gap-1 select-none touch-none">
      <span className="text-[8px] text-white/60 whitespace-nowrap">
        {displayVal}
      </span>
      <div
        className="relative cursor-ns-resize rounded overflow-hidden"
        style={{ width: 18, height: BAR_H }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title={`${label}: ${displayVal} — drag up/down`}
      >
        {/* Track */}
        <div className="absolute inset-0 bg-white/15 rounded" />
        {/* Fill */}
        <div
          className={`absolute inset-x-0 bottom-0 rounded ${color}`}
          style={{ height: fillH }}
        />
        {/* Center marker for bipolar controls */}
        {centered && (
          <div
            className="absolute inset-x-0 bg-white/50"
            style={{ top: '50%', height: 1 }}
          />
        )}
      </div>
      <span className="text-[8px] font-semibold text-white/80 whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

// ─── ClipBlock ────────────────────────────────────────────────────────────────

export default function ClipBlock({ clip, zoom }: Props) {
  const { state, dispatch, activeProject } = useEditor();
  const media = state.mediaItems.find((m) => m.id === clip.mediaItemId);
  const isSelected = state.selectedClipId === clip.id;
  const [isHovered, setIsHovered] = useState(false);
  const [knobsOpen, setKnobsOpen] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [popupPos, setPopupPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const clipRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotTaken = useRef(false);

  const pitch = clip.pitch ?? 0;
  const tone = clip.tone ?? 0;

  const duration = media ? effectiveDuration(clip, media.duration) : 1;
  const width = Math.max(8, duration * zoom);
  const left = clip.timelineStart * zoom;

  const dragMode = useRef<'undecided' | 'move' | 'volume'>('undecided');
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const dragStartTimeline = useRef(0);
  const dragStartVolume = useRef(0);

  const trackType =
    activeProject?.tracks.find((t) => t.id === clip.trackId)?.type ?? 'video';

  // ── Popup position: update whenever knobsOpen changes ────────────────────
  useLayoutEffect(() => {
    if (!knobsOpen) {
      setPopupPos(null);
      return;
    }
    const el = clipRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Position popup above clip, right-aligned
    setPopupPos({ top: rect.top - 84, left: Math.max(4, rect.right - 108) });
  }, [knobsOpen]);

  function openKnobs() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setKnobsOpen(true);
  }

  function closeKnobsSoon() {
    hoverTimer.current = setTimeout(() => setKnobsOpen(false), 200);
  }

  function snapshotOnce() {
    if (!snapshotTaken.current) {
      snapshotTaken.current = true;
      dispatch({ type: 'SNAPSHOT_FOR_UNDO' });
    }
  }

  // ── Clip drag (pointer capture): horizontal = move, vertical = volume ────
  function onClipPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).dataset.trim) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dispatch({ type: 'SELECT_CLIP', clipId: clip.id });
    dragMode.current = 'undecided';
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    dragStartTimeline.current = clip.timelineStart;
    dragStartVolume.current = clip.volume;
    snapshotTaken.current = false;
  }

  function onClipPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dx = Math.abs(e.clientX - dragStartX.current);
    const dy = Math.abs(e.clientY - dragStartY.current);

    if (dragMode.current === 'undecided' && (dx > 5 || dy > 5)) {
      dragMode.current = dy > dx ? 'volume' : 'move';
      snapshotOnce();
    }

    if (dragMode.current === 'move') {
      const newStart = Math.max(
        0,
        dragStartTimeline.current + (e.clientX - dragStartX.current) / zoom
      );
      dispatch({
        type: 'MOVE_CLIP',
        clipId: clip.id,
        timelineStart: newStart,
        trackId: clip.trackId,
      });
    } else if (dragMode.current === 'volume') {
      const newVol = Math.max(
        0,
        Math.min(
          1,
          dragStartVolume.current + (dragStartY.current - e.clientY) / 80
        )
      );
      dispatch({
        type: 'SET_CLIP_VOLUME_PREVIEW',
        clipId: clip.id,
        volume: newVol,
      });
    }
  }

  function onClipPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragMode.current = 'undecided';
    snapshotTaken.current = false;
  }

  // ── Trim handles ─────────────────────────────────────────────────────────
  const trimStartVal = useRef(0);
  const trimEndVal = useRef(0);

  function onTrimPointerDown(
    side: 'left' | 'right',
    e: React.PointerEvent<HTMLDivElement>
  ) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartX.current = e.clientX;
    trimStartVal.current = clip.trimStart;
    trimEndVal.current = clip.trimEnd;
    snapshotTaken.current = false;
  }

  function onTrimPointerMove(
    side: 'left' | 'right',
    e: React.PointerEvent<HTMLDivElement>
  ) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    if (!media) return;
    snapshotOnce();
    const dt = (e.clientX - dragStartX.current) / zoom;
    if (side === 'left') {
      const newTrimStart = Math.max(
        0,
        Math.min(trimStartVal.current + dt, media.duration - clip.trimEnd - 0.5)
      );
      const newTimelineStart = Math.max(
        0,
        clip.timelineStart + (newTrimStart - trimStartVal.current) / clip.speed
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
        Math.min(trimEndVal.current - dt, media.duration - clip.trimStart - 0.5)
      );
      dispatch({
        type: 'TRIM_CLIP',
        clipId: clip.id,
        trimStart: clip.trimStart,
        trimEnd: newTrimEnd,
      });
    }
  }

  function onTrimPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    snapshotTaken.current = false;
  }

  // ── Split at edit cursor ──────────────────────────────────────────────────
  const splitAtCursor = useCallback(() => {
    const t = state.editCursor;
    const end = clip.timelineStart + duration;
    if (t <= clip.timelineStart || t >= end) return;
    dispatch({
      type: 'SPLIT_CLIP',
      clipId: clip.id,
      atTime: t,
      newClipId: Math.random().toString(36).slice(2, 10),
    });
  }, [state.editCursor, clip.timelineStart, duration, clip.id, dispatch]);

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

  // ── Waveform helper (shared by audio full-height and video bottom-half) ──
  function renderWaveform(heightPx: number) {
    if (!media?.waveform) return null;
    const total = media.waveform.length;
    const startIdx = Math.floor((clip.trimStart / media.duration) * total);
    const endIdx = Math.ceil(
      ((media.duration - clip.trimEnd) / media.duration) * total
    );
    const samples = media.waveform.slice(startIdx, endIdx);
    return (
      <svg
        className="w-full h-full opacity-60"
        preserveAspectRatio="none"
        viewBox={`0 0 ${Math.max(1, samples.length)} ${heightPx}`}
      >
        {samples.map((v, i) => {
          const h = Math.max(1, v * (heightPx * 0.8) * clip.volume);
          return (
            <rect
              key={i}
              x={i}
              y={(heightPx - h) / 2}
              width={0.8}
              height={h}
              fill="white"
            />
          );
        })}
      </svg>
    );
  }

  const showKnobsBtn = isHovered && width >= 48;

  return (
    <>
      <div
        ref={clipRef}
        className={`absolute rounded overflow-hidden select-none cursor-grab active:cursor-grabbing ${bgClass} ${ringClass} touch-none`}
        style={{
          left,
          width: Math.max(8, width),
          height: TRACK_HEIGHT - 8,
          top: 4,
          opacity: 0.4 + clip.volume * 0.6,
          transition: 'left 150ms ease-out, width 150ms ease-out',
        }}
        onPointerDown={onClipPointerDown}
        onPointerMove={onClipPointerMove}
        onPointerUp={onClipPointerUp}
        onPointerCancel={onClipPointerUp}
        onMouseEnter={() => {
          setIsHovered(true);
          if (width >= 48) openKnobs();
        }}
        onMouseLeave={() => {
          setIsHovered(false);
          closeKnobsSoon();
        }}
      >
        {/* ── Video clip: top half = frames, bottom half = waveform ── */}
        {trackType === 'video' && (
          <>
            {/* Top half — thumbnail strip */}
            {media.thumbnail && (
              <div
                className="absolute top-0 left-0 right-0"
                style={{
                  height: '50%',
                  backgroundImage: `url(${media.thumbnail})`,
                  backgroundSize: 'auto 100%',
                  backgroundRepeat: 'repeat-x',
                  opacity: 0.55,
                }}
              />
            )}
            {/* Divider */}
            <div
              className="absolute left-0 right-0 bg-white/20"
              style={{ top: '50%', height: 1 }}
            />
            {/* Bottom half — waveform */}
            {media.waveform && (
              <div
                className="absolute left-0 right-0 bottom-0"
                style={{ height: '50%' }}
              >
                {renderWaveform(28)}
              </div>
            )}
          </>
        )}

        {/* ── Audio clip: full height waveform ── */}
        {trackType === 'audio' && media.waveform && (
          <div className="absolute inset-0">
            {renderWaveform(TRACK_HEIGHT - 8)}
          </div>
        )}

        {/* Label */}
        <div className="absolute inset-0 flex items-center px-2 pointer-events-none">
          <span className="text-xs font-semibold text-white drop-shadow truncate">
            {media.name}
            {clip.speed !== 1 && (
              <span className="ml-1 opacity-80">{clip.speed}×</span>
            )}
          </span>
        </div>

        {/* Non-default pitch / tone badges */}
        {!knobsOpen && (pitch !== 0 || tone !== 0) && (
          <div className="absolute top-0.5 right-2 flex gap-0.5 pointer-events-none">
            {pitch !== 0 && (
              <span className="text-[7px] bg-black/40 text-white rounded px-0.5">
                {pitch > 0 ? '+' : ''}
                {pitch.toFixed(1)}st
              </span>
            )}
            {tone !== 0 && (
              <span className="text-[7px] bg-black/40 text-white rounded px-0.5">
                {tone > 0 ? '▲' : '▼'}tone
              </span>
            )}
          </div>
        )}

        {/* Knob toggle button (visible on hover) */}
        {showKnobsBtn && (
          <button
            className="absolute bottom-1 right-1 rounded px-1 py-0.5 bg-black/50 text-white/80 text-[8px] font-semibold hover:bg-black/70 transition z-10"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              openKnobs();
            }}
          >
            ···
          </button>
        )}

        {/* Trim handles */}
        <div
          data-trim="left"
          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/30 hover:bg-white/50 transition z-10"
          onPointerDown={(e) => onTrimPointerDown('left', e)}
          onPointerMove={(e) => onTrimPointerMove('left', e)}
          onPointerUp={onTrimPointerUp}
          onPointerCancel={onTrimPointerUp}
        />
        <div
          data-trim="right"
          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/30 hover:bg-white/50 transition z-10"
          onPointerDown={(e) => onTrimPointerDown('right', e)}
          onPointerMove={(e) => onTrimPointerMove('right', e)}
          onPointerUp={onTrimPointerUp}
          onPointerCancel={onTrimPointerUp}
        />

        {/* Selected toolbar */}
        {isSelected && (
          <div
            className="absolute -top-8 left-0 flex items-center gap-1 bg-slate-800 rounded-lg px-1.5 py-1 shadow-lg z-20"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              title="Split at edit cursor"
              onClick={splitAtCursor}
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
                      className={`block w-full px-3 py-1.5 text-left text-[10px] hover:bg-slate-700 transition ${clip.speed === s ? 'text-violet-400 font-semibold' : 'text-slate-200'}`}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              )}
            </div>

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

      {/* ── Bar popup panel (portaled to body, outside overflow-hidden) ── */}
      {knobsOpen &&
        popupPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: popupPos.top,
              left: popupPos.left,
              zIndex: 9999,
            }}
            className="flex items-end gap-3 bg-slate-800/95 border border-slate-600 rounded-xl px-4 py-3 shadow-2xl"
            onMouseEnter={openKnobs}
            onMouseLeave={closeKnobsSoon}
          >
            <Bar
              value={clip.speed}
              min={0.25}
              max={2}
              label="Tempo"
              color="bg-violet-400"
              format={(v: number) => `${v.toFixed(2)}×`}
              onDragStart={snapshotOnce}
              onChange={(v: number) =>
                dispatch({
                  type: 'SET_CLIP_SPEED_PREVIEW',
                  clipId: clip.id,
                  speed: Math.round(v * 100) / 100,
                })
              }
            />
            <Bar
              value={pitch}
              min={-12}
              max={12}
              label="Pitch"
              color="bg-blue-400"
              centered
              format={(v: number) =>
                (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) + 'st'
              }
              onDragStart={snapshotOnce}
              onChange={(v: number) =>
                dispatch({
                  type: 'SET_CLIP_PITCH_PREVIEW',
                  clipId: clip.id,
                  pitch: Math.round(v * 10) / 10,
                })
              }
            />
            <Bar
              value={tone}
              min={-1}
              max={1}
              label="Tone"
              color="bg-amber-400"
              centered
              format={(v: number) =>
                v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)
              }
              onDragStart={snapshotOnce}
              onChange={(v: number) =>
                dispatch({
                  type: 'SET_CLIP_TONE_PREVIEW',
                  clipId: clip.id,
                  tone: Math.round(v * 100) / 100,
                })
              }
            />
            <Bar
              value={clip.volume}
              min={0}
              max={1}
              label="Volume"
              color="bg-emerald-400"
              format={(v: number) => `${Math.round(v * 100)}%`}
              onDragStart={snapshotOnce}
              onChange={(v: number) =>
                dispatch({
                  type: 'SET_CLIP_VOLUME_PREVIEW',
                  clipId: clip.id,
                  volume: v,
                })
              }
            />
          </div>,
          document.body
        )}
    </>
  );
}
