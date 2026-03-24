'use client';
import { useEffect, useRef, useCallback } from 'react';
import { useEditor, selectTotalDuration } from '../store';
import { effectiveDuration } from '../types';
import type { Clip, Track } from '../types';

// ─── Direct Audio API approach without HTMLMediaElement restrictions ───────────

function AudioTrackPlayer({ track }: { track: Track }) {
  const { state, activeProject } = useEditor();
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const bufferCacheRef = useRef<Record<string, AudioBuffer>>({});
  const lastPlayheadRef = useRef(state.playhead);
  const isPlayingRef = useRef(state.isPlaying);

  // Track the ID of the currently playing clip
  const currentClipIdRef = useRef<string | null>(null);

  useEffect(() => {
    lastPlayheadRef.current = state.playhead;
    isPlayingRef.current = state.isPlaying;
  }, [state.playhead, state.isPlaying]);

  // Helper to fetch and decode audio buffer
  const loadAudioBuffer = async (
    url: string,
    id: string,
    ctx: AudioContext
  ) => {
    if (bufferCacheRef.current[id]) {
      return bufferCacheRef.current[id];
    }

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);
      bufferCacheRef.current[id] = decodedBuffer;
      return decodedBuffer;
    } catch (e) {
      console.error(`Failed to load audio for ${url}`, e);
      return null;
    }
  };

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

  const stopCurrentAudio = useCallback(() => {
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
        activeSourceRef.current.disconnect();
      } catch (e) {
        // Ignored
      }
      activeSourceRef.current = null;
    }
  }, []);

  // Main playback engine
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;

    if (!state.isPlaying) {
      if (ctx.state === 'running') {
        ctx.suspend().catch(() => {});
      }
      return;
    } else {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    }

    const clip = getActiveClip(state.playhead);

    // Stop if no clip
    if (!clip) {
      if (activeSourceRef.current) {
        stopCurrentAudio();
        currentClipIdRef.current = null;
      }
      return;
    }

    const media = state.mediaItems.find((m) => m.id === clip.mediaItemId);
    if (!media) return;

    // Calculate time offset in the source buffer
    const sourceTime =
      clip.trimStart + (state.playhead - clip.timelineStart) * clip.speed;

    // Check if properties have changed to require restarting
    // like speed and pitch
    const currentSpeed = clip.speed ?? 1;
    const currentPitch = clip.pitch ?? 0;
    const currentVolume = clip.volume ?? 1;
    const currentTone = clip.tone ?? 0;

    // Do we need to start or restart the clip?
    let shouldStart = false;

    if (currentClipIdRef.current !== clip.id || !activeSourceRef.current) {
      shouldStart = true;
    }

    if (shouldStart && state.isPlaying) {
      stopCurrentAudio();

      loadAudioBuffer(media.localUrl, media.id, ctx).then((buffer) => {
        if (!buffer || !isPlayingRef.current) return;

        // Verify this clip is still active after async loading
        const activeNow = getActiveClip(lastPlayheadRef.current);
        if (!activeNow || activeNow.id !== clip.id) return;

        // Recalculate time based on the latest playhead (it may have moved during load)
        const currentSourceTime =
          clip.trimStart +
          (lastPlayheadRef.current - clip.timelineStart) * clip.speed;

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        // Store properties directly on nodes so we can update them without restarting
        (source as any)._clipId = clip.id;
        (source as any)._clipProps = {
          speed: currentSpeed,
          pitch: currentPitch,
          volume: currentVolume,
          tone: currentTone,
        };

        // Apply EQ and Volume
        const eqLow = ctx.createBiquadFilter();
        eqLow.type = 'peaking';
        eqLow.frequency.value = 200;
        eqLow.Q.value = 1;
        eqLow.gain.value = -currentTone * 5;
        (source as any)._eqLow = eqLow;

        const eqHigh = ctx.createBiquadFilter();
        eqHigh.type = 'peaking';
        eqHigh.frequency.value = 3000;
        eqHigh.Q.value = 1;
        eqHigh.gain.value = currentTone * 5;
        (source as any)._eqHigh = eqHigh;

        const gainNode = ctx.createGain();
        gainNode.gain.value = currentVolume;
        (source as any)._gainNode = gainNode;

        const pitchFactor = Math.pow(2, currentPitch / 12);
        source.playbackRate.value = currentSpeed * pitchFactor;

        source.connect(eqLow);
        eqLow.connect(eqHigh);
        eqHigh.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Start playback at the calculated offset
        source.start(0, currentSourceTime);

        activeSourceRef.current = source;
        currentClipIdRef.current = clip.id;
      });
    } else if (activeSourceRef.current && state.isPlaying) {
      // If it's already playing the right clip, just update properties in real-time
      const source = activeSourceRef.current as any;
      if (source._clipId === clip.id && source._clipProps) {
        if (
          source._clipProps.speed !== currentSpeed ||
          source._clipProps.pitch !== currentPitch
        ) {
          const pitchFactor = Math.pow(2, currentPitch / 12);
          source.playbackRate.value = currentSpeed * pitchFactor;
          source._clipProps.speed = currentSpeed;
          source._clipProps.pitch = currentPitch;
        }
        if (source._clipProps.volume !== currentVolume && source._gainNode) {
          source._gainNode.gain.value = currentVolume;
          source._clipProps.volume = currentVolume;
        }
        if (
          source._clipProps.tone !== currentTone &&
          source._eqLow &&
          source._eqHigh
        ) {
          const now = ctx.currentTime;
          source._eqLow.gain.setTargetAtTime(-currentTone * 5, now, 0.02);
          source._eqHigh.gain.setTargetAtTime(currentTone * 5, now, 0.02);
          source._clipProps.tone = currentTone;
        }
      }
    }
  }, [
    state.playhead,
    state.isPlaying,
    getActiveClip,
    state.mediaItems,
    stopCurrentAudio,
  ]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopCurrentAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [stopCurrentAudio]);

  return null; // No DOM element needed!
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

  const videoAudioCtxRef = useRef<AudioContext | null>(null);
  const videoSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const videoEqLowRef = useRef<BiquadFilterNode | null>(null);
  const videoEqHighRef = useRef<BiquadFilterNode | null>(null);

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

  // Set up video audio graph once
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Only init context once
    if (!videoAudioCtxRef.current) {
      const ctx = new AudioContext();
      videoAudioCtxRef.current = ctx;

      let source: MediaElementAudioSourceNode;
      try {
        source = ctx.createMediaElementSource(video);
      } catch (e) {
        return;
      }

      const eqLow = ctx.createBiquadFilter();
      eqLow.type = 'peaking';
      eqLow.frequency.value = 200;
      eqLow.Q.value = 1;
      eqLow.gain.value = 0;

      const eqHigh = ctx.createBiquadFilter();
      eqHigh.type = 'peaking';
      eqHigh.frequency.value = 3000;
      eqHigh.Q.value = 1;
      eqHigh.gain.value = 0;

      source.connect(eqLow);
      eqLow.connect(eqHigh);
      eqHigh.connect(ctx.destination);

      videoSourceNodeRef.current = source;
      videoEqLowRef.current = eqLow;
      videoEqHighRef.current = eqHigh;
    }
  }, []);

  // Sync video element to playhead
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const clip = getActiveVideoClip(state.playhead);

    if (!clip) {
      if (video.src) {
        video.pause();
        video.removeAttribute('data-media-id');
        video.src = '';
      }
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

      const onLoaded = () => {
        video.currentTime = sourceTime;
        if (state.isPlaying) {
          video.play().catch(() => {});
        }
      };

      if (video.readyState >= 1) {
        onLoaded();
      } else {
        video.addEventListener('loadedmetadata', onLoaded, { once: true });
      }
    } else {
      if (!state.isPlaying) {
        if (Math.abs(video.currentTime - sourceTime) > 0.05) {
          video.currentTime = sourceTime;
        }
        video.pause();
      } else {
        if (!video.seeking && Math.abs(video.currentTime - sourceTime) > 0.25) {
          video.currentTime = sourceTime;
        }
        video.play().catch(() => {});
      }
    }

    const pitchFactor = Math.pow(2, (clip.pitch ?? 0) / 12);
    // Preserves pitch approximation logic like AudioTracks
    video.playbackRate = (clip.speed ?? 1) * pitchFactor;

    // Ensure the video element itself is muted if we're using a separate extracted audio track or we just don't want duplicate playback
    // For video tracks, we mute them so that their extracted audio tracks play exclusively
    video.muted = true;

    // Apply Tone (Though muted, we leave EQ connections intact if someone unmutes it manually)
    if (
      videoEqLowRef.current &&
      videoEqHighRef.current &&
      videoAudioCtxRef.current
    ) {
      const currentTone = clip.tone ?? 0;
      const now = videoAudioCtxRef.current.currentTime;
      videoEqLowRef.current.gain.setTargetAtTime(-currentTone * 5, now, 0.02);
      videoEqHighRef.current.gain.setTargetAtTime(currentTone * 5, now, 0.02);
    }
  }, [state.playhead, state.isPlaying, getActiveVideoClip, state.mediaItems]);

  // Audio Context Resume
  useEffect(() => {
    if (state.isPlaying && videoAudioCtxRef.current?.state === 'suspended') {
      videoAudioCtxRef.current.resume().catch(() => {});
    }
  }, [state.isPlaying]);

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  useEffect(() => {
    if (state.isPlaying) {
      startLoop();
    } else {
      stopLoop();
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
          crossOrigin="anonymous"
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
            <p className="text-xs opacity-40">
              Add a video clip to the timeline
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex w-full max-w-2xl items-center gap-3">
        <span className="w-12 text-right font-mono text-sm text-slate-500 tabular-nums">
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

        <span className="w-12 font-mono text-sm text-slate-400 tabular-nums">
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
