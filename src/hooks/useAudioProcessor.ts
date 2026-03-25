'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type AudioState = 'uninitialized' | 'paused' | 'playing' | 'processing';

interface UseAudioProcessorProps {
  initialPitch?: number; // Semitones (-12 to 12)
  initialFormant?: 'neutral' | 'nasal' | 'throaty';
}

export function useAudioProcessor({
  initialPitch = 0,
  initialFormant = 'neutral',
}: UseAudioProcessorProps = {}) {
  const [pitch, setPitch] = useState<number>(initialPitch);
  const [formant, setFormant] = useState<'neutral' | 'nasal' | 'throaty'>(
    initialFormant
  );
  const [status, setStatus] = useState<AudioState>('uninitialized');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const pitchNodeRef = useRef<AudioWorkletNode | null>(null);
  const formantFilterNasalRef = useRef<BiquadFilterNode | null>(null);
  const formantFilterThroatyRef = useRef<BiquadFilterNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Initialize Web Audio API
  const initAudio = useCallback(async (audioUrl: string) => {
    try {
      if (typeof window === 'undefined') return;

      setStatus('processing');

      // Create Audio Element if not exists
      if (!audioElementRef.current) {
        audioElementRef.current = new Audio(audioUrl);
        audioElementRef.current.crossOrigin = 'anonymous';
        audioElementRef.current.addEventListener('ended', () =>
          setStatus('paused')
        );
        audioElementRef.current.addEventListener('play', () =>
          setStatus('playing')
        );
        audioElementRef.current.addEventListener('pause', () =>
          setStatus('paused')
        );
      } else {
        audioElementRef.current.src = audioUrl;
      }

      // Create Audio Context if not exists
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();

        // Load AudioWorklet
        await audioCtxRef.current.audioWorklet.addModule('/audio-processor.js');

        // Create Nodes
        sourceNodeRef.current = audioCtxRef.current.createMediaElementSource(
          audioElementRef.current
        );

        pitchNodeRef.current = new AudioWorkletNode(
          audioCtxRef.current,
          'pitch-shift-processor'
        );

        // Formant filter: Nasal (600-1200 Hz peaking filter)
        formantFilterNasalRef.current =
          audioCtxRef.current.createBiquadFilter();
        formantFilterNasalRef.current.type = 'peaking';
        formantFilterNasalRef.current.frequency.value = 900;
        formantFilterNasalRef.current.Q.value = 2.0;
        formantFilterNasalRef.current.gain.value = 0; // 0 means neutral

        // Formant filter: Throaty (100-400 Hz low-shelf/peaking filter)
        formantFilterThroatyRef.current =
          audioCtxRef.current.createBiquadFilter();
        formantFilterThroatyRef.current.type = 'lowshelf';
        formantFilterThroatyRef.current.frequency.value = 250;
        formantFilterThroatyRef.current.gain.value = 0; // 0 means neutral

        gainNodeRef.current = audioCtxRef.current.createGain();

        // Connect graph: Source -> Pitch -> Nasal -> Throaty -> Gain -> Destination
        sourceNodeRef.current
          .connect(pitchNodeRef.current)
          .connect(formantFilterNasalRef.current)
          .connect(formantFilterThroatyRef.current)
          .connect(gainNodeRef.current)
          .connect(audioCtxRef.current.destination);
      }

      setStatus('paused');
    } catch (error) {
      console.error('Failed to initialize audio processor:', error);
      setStatus('uninitialized');
    }
  }, []);

  // Effect to update pitch
  useEffect(() => {
    if (pitchNodeRef.current) {
      // Convert semitones to ratio: 2^(semitones/12)
      const ratio = Math.pow(2, pitch / 12);
      pitchNodeRef.current.port.postMessage({ pitchRatio: ratio });
    }
  }, [pitch]);

  // Effect to update formants
  useEffect(() => {
    if (formantFilterNasalRef.current && formantFilterThroatyRef.current) {
      if (formant === 'nasal') {
        formantFilterNasalRef.current.gain.value = 8; // Boost 900Hz
        formantFilterThroatyRef.current.gain.value = -4; // Cut 250Hz
      } else if (formant === 'throaty') {
        formantFilterNasalRef.current.gain.value = -4; // Cut 900Hz
        formantFilterThroatyRef.current.gain.value = 8; // Boost 250Hz
      } else {
        formantFilterNasalRef.current.gain.value = 0;
        formantFilterThroatyRef.current.gain.value = 0;
      }
    }
  }, [formant]);

  const play = useCallback(() => {
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    audioElementRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    audioElementRef.current?.pause();
  }, []);

  const stop = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
    }
    setStatus('paused');
  }, []);

  // Clean up
  useEffect(() => {
    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.src = '';
      }
    };
  }, []);

  return {
    pitch,
    setPitch,
    formant,
    setFormant,
    status,
    initAudio,
    play,
    pause,
    stop,
    audioElement: audioElementRef.current,
  };
}
