'use client';
import React, { useEffect, useRef, useCallback } from 'react';
import { useEditor, selectTotalDuration } from '../store';
import { effectiveDuration } from '../types';
import type { Clip, Track } from '../types';

function AudioTrackPlayer({ track }: { track: Track }) {
  const { state, activeProject } = useEditor();
  const audioRef = useRef<HTMLAudioElement>(null);
  const loadedMediaIdRef = useRef<string | null>(null);
  const loadedClipIdRef = useRef<string | null>(null);

  const getActiveClip = useCallback(
    (time: number): Clip | null => {
      if (track.muted || !activeProject) return null;
      for (const clip of activeProject.clips) {
        if (clip.trackId !== track.id) continue;
        const media = state.mediaItems.find((m) => m.id === clip.mediaItemId);
        if (!media) continue;
        const end =
          clip.timelineStart + effectiveDuration(clip, media.duration);
        if (time >= clip.timelineStart && time < end) return clip;
      }
      return null;
    },
    [track, activeProject, state.mediaItems]
  );

  // Sync source, seek, playback rate (speed), and volume
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const clip = getActiveClip(state.playhead);

    if (!clip) {
      if (loadedMediaIdRef.current !== null) {
        audio.pause();
        audio.src = '';
        loadedMediaIdRef.current = null;
        loadedClipIdRef.current = null;
      }
      return;
    }

    const media = state.mediaItems.find((m) => m.id === clip.mediaItemId);
    if (!media) return;

    const sourceTime =
      clip.trimStart + (state.playhead - clip.timelineStart) * clip.speed;

    if (loadedMediaIdRef.current !== media.id) {
      loadedMediaIdRef.current = media.id;
      loadedClipIdRef.current = clip.id;
      audio.src = media.localUrl;
      audio.load();
      audio.addEventListener(
        'loadedmetadata',
        () => {
          audio.currentTime = sourceTime;
          if (state.isPlaying) audio.play().catch(() => {});
        },
        { once: true }
      );
    } else if (loadedClipIdRef.current !== clip.id) {
      loadedClipIdRef.current = clip.id;
      if (!state.isPlaying || Math.abs(audio.currentTime - sourceTime) > 0.15) {
        audio.currentTime = sourceTime;
      }
    } else if (!state.isPlaying) {
      if (Math.abs(audio.currentTime - sourceTime) > 0.05) {
        audio.currentTime = sourceTime;
      }
    }

    audio.playbackRate = clip.speed ?? 1;
    audio.volume = (clip.volume ?? 100) / 100;
  }, [state.playhead, state.isPlaying, getActiveClip, state.mediaItems]);

  // Start / stop playback
  useEffect(() => {
    if (state.isPlaying) {
      audioRef.current?.play().catch(() => {});
    } else {
      audioRef.current?.pause();
    }
  }, [state.isPlaying]);

  return <audio ref={audioRef} style={{ display: 'none' }} />;
}

function pad2(n: number) {
  return String(Math.floor(n)).padStart(2, '0');
}
function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${pad2(m)}:${pad2(sec)}`;
}

export default function Preview() {
  const { state, dispatch, activeProject } = useEditor();
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const playheadRef = useRef(state.playhead);

  const totalDuration = selectTotalDuration(activeProject, state.mediaItems);

  // Keep playheadRef in sync
  useEffect(() => {
    playheadRef.current = state.playhead;
  }, [state.playhead]);

  // Find the video clip that covers the current playhead
  const getActiveVideoClip = useCallback(
    (time: number): Clip | null => {
      if (!activeProject) return null;
      const videoTracks = activeProject.tracks
        .filter((t) => t.type === 'video' && !t.muted)
        .map((t) => t.id);
      for (const clip of activeProject.clips) {
        if (!videoTracks.includes(clip.trackId)) continue;
        const media = state.mediaItems.find((m) => m.id === clip.mediaItemId);
        if (!media) continue;
        const end =
          clip.timelineStart + effectiveDuration(clip, media.duration);
        if (time >= clip.timelineStart && time < end) return clip;
      }
      return null;
    },
    [activeProject, state.mediaItems]
  );

  // Sync video element to playhead
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const clip = getActiveVideoClip(state.playhead);
    if (!clip) {
      video.removeAttribute('data-media-id');
      video.src = '';
      return;
    }
    const media = state.mediaItems.find((m) => m.id === clip.mediaItemId);
    if (!media) return;

    const sourceTime =
      clip.trimStart + (state.playhead - clip.timelineStart) * clip.speed;
    const currentSrc = video.getAttribute('data-media-id');

    if (currentSrc !== media.id) {
      video.setAttribute('data-media-id', media.id);
      video.src = media.localUrl;
      video.load();
      video.addEventListener(
        'loadedmetadata',
        () => {
          video.currentTime = sourceTime;
          if (state.isPlaying) {
            video.play().catch(() => {});
          }
        },
        { once: true }
      );
    } else {
      if (!state.isPlaying) {
        if (Math.abs(video.currentTime - sourceTime) > 0.05) {
          video.currentTime = sourceTime;
        }
      } else {
        if (!video.seeking && Math.abs(video.currentTime - sourceTime) > 0.25) {
          video.currentTime = sourceTime;
        }
      }
    }
    video.playbackRate = clip.speed;
    video.volume = (clip.volume ?? 100) / 100;
  }, [state.playhead, state.isPlaying, getActiveVideoClip, state.mediaItems]);

  // Playback loop
  const startLoop = useCallback(() => {
    lastTsRef.current = performance.now();
    function tick(ts: number) {
      const delta = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;

      const video = videoRef.current;
      const clip = getActiveVideoClip(playheadRef.current);
      const isBuffering = video && clip && video.readyState < 3;

      if (!isBuffering) {
        const next = Math.min(playheadRef.current + delta, totalDuration);
        playheadRef.current = next;
        dispatch({ type: 'SET_PLAYHEAD', time: next });
        if (next >= totalDuration) {
          dispatch({ type: 'SET_PLAYING', playing: false });
          return;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [dispatch, totalDuration, getActiveVideoClip]);

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  useEffect(() => {
    if (state.isPlaying) {
      startLoop();
      videoRef.current?.play().catch(() => {});
    } else {
      stopLoop();
      videoRef.current?.pause();
    }
    return stopLoop;
  }, [state.isPlaying, startLoop, stopLoop]);

  function togglePlay() {
    if (state.playhead >= totalDuration) {
      dispatch({ type: 'SET_PLAYHEAD', time: 0 });
    }
    dispatch({ type: 'SET_PLAYING', playing: !state.isPlaying });
  }

  const isDraggingSeek = useRef(false);

  function handleSeekDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingSeek.current = true;
    updateSeek(e);
  }

  function handleSeekMove(e: React.PointerEvent<HTMLDivElement>) {
    if (isDraggingSeek.current) {
      updateSeek(e);
    }
  }

  function handleSeekUp(e: React.PointerEvent<HTMLDivElement>) {
    isDraggingSeek.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function updateSeek(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width)
    );
    dispatch({ type: 'SET_PLAYHEAD', time: ratio * totalDuration });
  }

  const progressPct = (state.playhead / totalDuration) * 100;
  const hasVideo = !!getActiveVideoClip(state.playhead);

  return (
    <div className="flex flex-col items-center gap-3 h-full py-4 px-6">
      {/* Audio Players */}
      {activeProject?.tracks
        .filter((t) => t.type === 'audio')
        .map((track) => (
          <AudioTrackPlayer key={track.id} track={track} />
        ))}

      {/* Video frame */}
      <div className="relative flex-1 w-full max-w-2xl rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center">
        <video
          ref={videoRef}
          className="max-h-full max-w-full object-contain"
          playsInline
          style={{ display: hasVideo ? 'block' : 'none' }}
        />
        {!hasVideo && (
          <div className="flex flex-col items-center gap-2 text-slate-600">
            <svg
              className="h-12 w-12 opacity-20"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M15 10l4.553-2.277A1 1 0 0 1 21 8.693v6.614a1 1 0 0 1-1.447.916L15 14v-4zM3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
            </svg>
            <p className="type-level-3 opacity-40">
              Add a video clip to the timeline
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex w-full max-w-2xl items-center gap-3">
        <span className="w-12 text-right font-mono type-level-2 text-slate-500 tabular-nums">
          {formatTime(state.playhead)}
        </span>

        {/* Seek bar */}
        <div
          className="flex-1 h-3 bg-slate-200 rounded-full cursor-pointer relative overflow-hidden"
          onPointerDown={handleSeekDown}
          onPointerMove={handleSeekMove}
          onPointerUp={handleSeekUp}
          onPointerCancel={handleSeekUp}
        >
          <div
            className="absolute left-0 top-0 h-full bg-violet-500 rounded-full transition-none pointer-events-none"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <span className="w-12 font-mono type-level-2 text-slate-400 tabular-nums">
          {formatTime(totalDuration)}
        </span>
      </div>

      {/* Play / pause button */}
      <button
        onClick={togglePlay}
        disabled={!activeProject}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-600 text-white shadow-md transition hover:bg-violet-700 active:scale-95 disabled:opacity-40"
      >
        {state.isPlaying ? (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg
            className="h-5 w-5 translate-x-0.5"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M8 5.14v14l11-7-11-7z" />
          </svg>
        )}
      </button>
    </div>
  );
}
