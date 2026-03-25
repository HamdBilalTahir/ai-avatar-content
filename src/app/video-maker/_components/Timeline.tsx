'use client';
import { useRef, useEffect, useState } from 'react';
import { useEditor, selectTotalDuration } from '../store';
import {
  getHoverTrackId,
  setCopiedClipId,
  getCopiedClipId,
} from '../dragState';
import { effectiveDuration } from '../types';
import TrackRow from './TrackRow';
import type { Clip } from '../types';

const TRACK_HEADER_W = 176;

function rulerInterval(zoom: number): number {
  if (zoom >= 480) return 0.25; // 250ms
  if (zoom >= 240) return 0.5; // 500ms
  if (zoom >= 120) return 1; // 1s
  if (zoom >= 60) return 2; // 2s
  return 4; // 30px/s -> 4s
}

function formatRulerTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  if (m > 0) return `${m}:${sec.toString().padStart(2, '0')}`;
  return `${sec}s`;
}

export default function Timeline() {
  const { state, dispatch, activeProject } = useEditor();
  const scrollRef = useRef<HTMLDivElement>(null);
  const playheadLineRef = useRef<HTMLDivElement>(null);
  const editCursorLineRef = useRef<HTMLDivElement>(null);
  const isDraggingPlayhead = useRef(false);

  // Keep latest state in refs to prevent stale closures in keyboard shortcuts
  const stateRef = useRef(state);
  const activeProjectRef = useRef(activeProject);
  stateRef.current = state;
  activeProjectRef.current = activeProject;

  const totalDuration = selectTotalDuration(activeProject, state.mediaItems);
  const zoom = state.zoom;
  const timelineWidth = Math.max(totalDuration * zoom + 200, 800);

  // Keep playhead + edit cursor lines in sync (bypass React re-render for perf)
  useEffect(() => {
    const el = playheadLineRef.current;
    if (el) {
      const px = state.playhead * zoom + TRACK_HEADER_W;
      el.style.left = `${px}px`;

      // Auto-scroll when playing
      if (state.isPlaying && scrollRef.current) {
        const scrollEl = scrollRef.current;
        const visibleWidth = scrollEl.clientWidth;
        if (px > scrollEl.scrollLeft + visibleWidth - 100) {
          scrollEl.scrollLeft = px - visibleWidth / 2;
        }
      }
    }
  }, [state.playhead, zoom, state.isPlaying]);

  useEffect(() => {
    const el = editCursorLineRef.current;
    if (el) el.style.left = `${state.editCursor * zoom + TRACK_HEADER_W}px`;
  }, [state.editCursor, zoom]);

  // Ctrl/Cmd + scroll wheel → zoom timeline (prevent browser page zoom)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      if (!(isMac ? e.metaKey : e.ctrlKey)) return;
      e.preventDefault();
      // deltaY > 0 = scroll down = zoom out; < 0 = zoom in
      const delta = e.deltaY > 0 ? -10 : 10;
      dispatch({ type: 'SET_ZOOM', zoom: stateRef.current.zoom + delta });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [dispatch]);

  // Keyboard shortcuts for copy/paste
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const currentProject = activeProjectRef.current;
      const currentState = stateRef.current;
      if (!currentProject) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      const trackId = getHoverTrackId();
      const clipUnderPointer = currentProject.clips.find(
        (c) =>
          c.trackId === trackId &&
          currentState.editCursor >= c.timelineStart &&
          currentState.editCursor <=
            c.timelineStart +
              effectiveDuration(
                c,
                currentState.mediaItems.find((m) => m.id === c.mediaItemId)
                  ?.duration ?? 1
              )
      );
      const targetClip =
        clipUnderPointer ??
        currentProject.clips.find((c) => c.id === currentState.selectedClipId);

      if (cmdOrCtrl && e.key.toLowerCase() === 'c') {
        // Copy clip under pointer or selected
        if (targetClip) {
          setCopiedClipId(targetClip.id);
        }
      } else if (e.key === '=' || e.key === '+') {
        dispatch({
          type: 'SET_ZOOM',
          zoom: Math.min(480, stateRef.current.zoom * 2),
        });
      } else if (e.key === '-') {
        dispatch({
          type: 'SET_ZOOM',
          zoom: Math.max(30, stateRef.current.zoom / 2),
        });
      } else if (cmdOrCtrl && e.key.toLowerCase() === 'v') {
        // Paste copied clip
        const copiedId = getCopiedClipId();
        if (!copiedId) return;
        const clipToCopy = currentProject.clips.find((c) => c.id === copiedId);
        if (!clipToCopy) return;

        const targetTrackId = getHoverTrackId() ?? clipToCopy.trackId;
        const targetTrack = currentProject.tracks.find(
          (t) => t.id === targetTrackId
        );
        const sourceMedia = currentState.mediaItems.find(
          (m) => m.id === clipToCopy.mediaItemId
        );
        if (
          !targetTrack ||
          !sourceMedia ||
          targetTrack.type !== sourceMedia.type
        )
          return;

        const newClip: Clip = {
          ...clipToCopy,
          id: Math.random().toString(36).slice(2, 10),
          trackId: targetTrackId,
          timelineStart: currentState.editCursor,
        };
        dispatch({ type: 'ADD_CLIP', clip: newClip });
        dispatch({ type: 'SELECT_CLIP', clipId: newClip.id });
      } else if (e.key.toLowerCase() === 's') {
        if (!targetClip) return;
        const media = currentState.mediaItems.find(
          (m) => m.id === targetClip.mediaItemId
        );
        if (!media) return;
        const dur = effectiveDuration(targetClip, media.duration);
        const end = targetClip.timelineStart + dur;
        if (
          currentState.editCursor <= targetClip.timelineStart ||
          currentState.editCursor >= end
        )
          return;
        dispatch({
          type: 'SPLIT_CLIP',
          clipId: targetClip.id,
          atTime: currentState.editCursor,
          newClipId: Math.random().toString(36).slice(2, 10),
        });
      } else if (e.key.toLowerCase() === 'm') {
        if (!targetClip) return;
        dispatch({ type: 'TOGGLE_MUTE', trackId: targetClip.trackId });
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        if (!targetClip) return;
        dispatch({ type: 'DELETE_CLIP', clipId: targetClip.id });
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);

  function timeFromEvent(e: React.PointerEvent | React.MouseEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    // Use scrollLeft to adjust the x coordinate if clicking within the scrollable area
    const scrollLeft = scrollRef.current?.scrollLeft || 0;
    const clickX = e.clientX - rect.left - TRACK_HEADER_W;
    const totalX = clickX + scrollLeft;
    return Math.max(0, clickX / zoom); // clickX is already relative to the ruler content which scrolled along, because event.currentTarget is the ruler which spans the full width
  }

  // Ruler: click/drag → white playhead  |  hover (no button) → violet edit cursor
  function handleRulerPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingPlayhead.current = true;
    dispatch({ type: 'SET_PLAYHEAD', time: timeFromEvent(e) });
  }

  function handleRulerPointerMove(e: React.PointerEvent) {
    if (isDraggingPlayhead.current) {
      dispatch({ type: 'SET_PLAYHEAD', time: timeFromEvent(e) });
    } else {
      dispatch({ type: 'SET_EDIT_CURSOR', time: timeFromEvent(e) });
    }
  }

  function handleRulerPointerUp(e: React.PointerEvent) {
    if (!isDraggingPlayhead.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    isDraggingPlayhead.current = false;
  }

  // Tracks area hover → violet edit cursor
  function handleTracksMouseMove(e: React.MouseEvent) {
    dispatch({ type: 'SET_EDIT_CURSOR', time: timeFromEvent(e) });
  }

  function addTrack(type: 'video' | 'audio') {
    if (!activeProject) return;
    const count = activeProject.tracks.filter((t) => t.type === type).length;
    const id = `track-${Date.now()}-${type[0]}`;
    dispatch({
      type: 'ADD_TRACK',
      track: {
        id,
        type,
        name: `${type === 'video' ? 'Video' : 'Audio'} ${count + 1}`,
        muted: false,
      },
    });
  }

  function handleDrop(
    mediaItemId: string,
    trackId: string,
    timelineStart: number
  ) {
    if (!activeProject) return;
    const media = state.mediaItems.find((m) => m.id === mediaItemId);
    if (!media) return;

    const track = activeProject.tracks.find((t) => t.id === trackId);
    // Reject if media type doesn't match track type
    if (track && track.type !== media.type) return;

    const clip: Clip = {
      id: Math.random().toString(36).slice(2, 10),
      mediaItemId,
      trackId,
      timelineStart,
      trimStart: 0,
      trimEnd: 0,
      speed: 1,
      volume: 100,
    };
    dispatch({ type: 'ADD_CLIP', clip });
    dispatch({ type: 'SELECT_CLIP', clipId: clip.id });
  }

  const interval = rulerInterval(zoom);
  const halfInterval = interval / 2;
  const marks: { time: number; major: boolean }[] = [];
  for (let t = 0; t <= totalDuration + interval; t += halfInterval) {
    marks.push({ time: t, major: t % interval === 0 });
  }

  if (!activeProject) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        Select or create a project to start editing.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white border-t border-slate-200 select-none">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-1.5 flex-shrink-0">
        <span className="text-sm font-semibold text-slate-500 mr-1">
          Add track:
        </span>
        <button
          onClick={() => addTrack('video')}
          className="flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 transition hover:bg-violet-100"
        >
          + Video
        </button>
        <button
          onClick={() => addTrack('audio')}
          className="flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
        >
          + Audio
        </button>

        {/* Zoom controls */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-sm text-slate-400">Zoom</span>
          <button
            onClick={() =>
              dispatch({ type: 'SET_ZOOM', zoom: Math.max(30, zoom / 2) })
            }
            className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-100 transition text-base"
          >
            −
          </button>
          <span className="w-16 text-center text-sm font-mono text-slate-600">
            {zoom}px/s
          </span>
          <button
            onClick={() =>
              dispatch({ type: 'SET_ZOOM', zoom: Math.min(480, zoom * 2) })
            }
            className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-100 transition text-base"
          >
            +
          </button>
        </div>
      </div>

      {/* Timeline scroll area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Track headers column space (static, not scrolled) */}
        {/* This was causing a double-header-width gap, removed. TrackRow renders its own header. */}

        {/* Right: ruler + tracks (scrollable) */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto">
          {/* Ruler */}
          <div
            className="sticky top-0 z-10 h-8 flex-shrink-0 cursor-crosshair bg-slate-100 border-b border-slate-200 relative"
            style={{ width: timelineWidth + TRACK_HEADER_W }}
            onPointerDown={handleRulerPointerDown}
            onPointerMove={handleRulerPointerMove}
            onPointerUp={handleRulerPointerUp}
            onPointerCancel={handleRulerPointerUp}
          >
            {marks.map(({ time, major }) => (
              <div
                key={time}
                className="absolute top-0 flex flex-col items-center"
                style={{ left: time * zoom + TRACK_HEADER_W }}
              >
                <div
                  className={`w-px bg-slate-300 ${major ? 'h-full' : 'h-3'}`}
                />
                {major && (
                  <span className="absolute top-1 left-1 text-[11px] font-mono text-slate-500 whitespace-nowrap">
                    {formatRulerTime(time)}
                  </span>
                )}
              </div>
            ))}

            {/* White playhead on ruler (play position, click to set) */}
            <div
              ref={playheadLineRef}
              className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none drop-shadow"
              style={{ left: state.playhead * zoom + TRACK_HEADER_W }}
            >
              <div className="absolute -top-0.5 -left-[5px] h-3 w-3 rotate-45 bg-white border border-slate-300" />
            </div>

            {/* Violet edit cursor on ruler (hover position) */}
            <div
              ref={editCursorLineRef}
              className="absolute top-0 bottom-0 w-0.5 bg-violet-500 z-20 pointer-events-none"
              style={{ left: state.editCursor * zoom + TRACK_HEADER_W }}
            >
              <div className="absolute -top-0.5 -left-1.5 h-3 w-3 rotate-45 bg-violet-500" />
            </div>
          </div>

          {/* Track rows — positioned relative to scroll container */}
          <div
            className="relative"
            style={{ width: timelineWidth + TRACK_HEADER_W, minHeight: '100%' }}
            onMouseMove={handleTracksMouseMove}
          >
            {/* White playhead line through all tracks */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white/90 z-10 pointer-events-none drop-shadow"
              style={{ left: state.playhead * zoom + TRACK_HEADER_W }}
            />

            {/* Violet edit cursor line through all tracks */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-violet-400/70 z-10 pointer-events-none"
              style={{ left: state.editCursor * zoom + TRACK_HEADER_W }}
            />

            {activeProject.tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                clips={activeProject.clips.filter(
                  (c) => c.trackId === track.id
                )}
                zoom={zoom}
                timelineWidth={timelineWidth}
                onDrop={handleDrop}
              />
            ))}

            {activeProject.tracks.length === 0 && (
              <div className="flex items-center justify-center py-12 text-xs text-slate-400">
                Add a track to start building your timeline.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
