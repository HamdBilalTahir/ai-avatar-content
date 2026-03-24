'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AvatarGenerateResponse,
  PipelineCreateRequest,
  ReferenceImage,
} from '@/lib/types';

const VOICE_PRESETS = [
  {
    id: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    label: 'Female · English (US)',
  },
  {
    id: '638efaaa-4d0c-442e-b701-3fae16aad012',
    label: 'Female · English (Indian)',
  },
  { id: '79a125e8-cd45-4c13-8a67-188112f4dd22', label: 'Male · English (US)' },
  {
    id: '5c42302c-194b-4d0c-ba1a-8cb485c84ab9',
    label: 'Male · English (British)',
  },
] as const;

const EMOTION_OPTIONS = [
  'neutral',
  'excited',
  'enthusiastic',
  'confident',
  'happy',
  'curious',
  'calm',
  'determined',
  'proud',
  'surprised',
  'anxious',
  'sad',
] as const;
type Emotion = (typeof EMOTION_OPTIONS)[number];

const CYCLING_MESSAGES = [
  'Crafting your avatar…',
  'Applying finishing touches…',
  'Almost there…',
  'Bringing your avatar to life…',
];

const DRAFT_KEY = 'ai-avatar-draft';
const DRAFT_IMAGE_KEY = 'ai-avatar-draft-image';

export default function AvatarNewPage() {
  const router = useRouter();

  const [avatarPrompt, setAvatarPrompt] = useState('');
  const [topic, setTopic] = useState('');
  const [userScript, setUserScript] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [negativePrompt, setNegativePrompt] = useState('');
  const [showNegativePrompt, setShowNegativePrompt] = useState(false);
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
  const [isStartingPipeline, setIsStartingPipeline] = useState(false);
  const [generationCount, setGenerationCount] = useState(0);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [cyclingMessage, setCyclingMessage] = useState(CYCLING_MESSAGES[0]);
  const [imageVisible, setImageVisible] = useState(false);

  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    VOICE_PRESETS[0].id
  );
  const [customVoiceId, setCustomVoiceId] = useState('');
  const [voiceStyleMode, setVoiceStyleMode] = useState<'auto' | 'manual'>(
    'auto'
  );
  const [manualEmotion, setManualEmotion] = useState<Emotion>('enthusiastic');
  const [manualSpeed, setManualSpeed] = useState(1.0);
  const [manualVolume, setManualVolume] = useState(1.0);

  // Script card AI mode state
  const [scriptMode, setScriptMode] = useState<'manual' | 'ai'>('manual');
  const [aiTopic, setAiTopic] = useState('');
  const [aiDuration, setAiDuration] = useState<'15s' | '30s' | '45s' | '60s'>(
    '30s'
  );
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [scriptGenerateError, setScriptGenerateError] = useState<string | null>(
    null
  );
  const [scriptSuccessBanner, setScriptSuccessBanner] = useState(false);

  const cycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refImageInputRef = useRef<HTMLInputElement>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Restore draft from localStorage on mount ───────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        if (d.avatarPrompt) setAvatarPrompt(d.avatarPrompt as string);
        if (d.topic) setTopic(d.topic as string);
        if (d.userScript) setUserScript(d.userScript as string);
        if (d.mimeType) setMimeType(d.mimeType as string);
        if (d.generationCount) setGenerationCount(d.generationCount as number);
        if (d.selectedVoiceId) setSelectedVoiceId(d.selectedVoiceId as string);
        if (d.customVoiceId) setCustomVoiceId(d.customVoiceId as string);
        if (d.voiceStyleMode)
          setVoiceStyleMode(d.voiceStyleMode as 'auto' | 'manual');
        if (d.manualEmotion) setManualEmotion(d.manualEmotion as Emotion);
        if (d.manualSpeed) setManualSpeed(d.manualSpeed as number);
        if (d.manualVolume) setManualVolume(d.manualVolume as number);
        if (d.scriptMode) setScriptMode(d.scriptMode as 'manual' | 'ai');
        if (d.aiDuration)
          setAiDuration(d.aiDuration as '15s' | '30s' | '45s' | '60s');
        if (d.negativePrompt) setNegativePrompt(d.negativePrompt as string);
        if (d.showNegativePrompt)
          setShowNegativePrompt(d.showNegativePrompt as boolean);
      }
      const savedImage = localStorage.getItem(DRAFT_IMAGE_KEY);
      if (savedImage) {
        const img = JSON.parse(savedImage) as {
          imageBase64: string;
          mimeType: string;
        };
        setImageBase64(img.imageBase64);
        setMimeType(img.mimeType);
        requestAnimationFrame(() => setImageVisible(true));
      }
    } catch {
      // Corrupt storage — ignore and start fresh
    }
  }, []);

  // ── Persist draft to localStorage whenever state changes ───────────────────
  useEffect(() => {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          avatarPrompt,
          topic,
          userScript,
          mimeType,
          generationCount,
          selectedVoiceId,
          customVoiceId,
          voiceStyleMode,
          manualEmotion,
          manualSpeed,
          manualVolume,
          scriptMode,
          aiDuration,
          negativePrompt,
          showNegativePrompt,
        })
      );
    } catch {
      /* storage full — skip */
    }
  }, [
    avatarPrompt,
    topic,
    userScript,
    mimeType,
    generationCount,
    selectedVoiceId,
    customVoiceId,
    voiceStyleMode,
    manualEmotion,
    manualSpeed,
    manualVolume,
    scriptMode,
    aiDuration,
    negativePrompt,
    showNegativePrompt,
  ]);

  useEffect(() => {
    if (!imageBase64 || !mimeType) return;
    try {
      localStorage.setItem(
        DRAFT_IMAGE_KEY,
        JSON.stringify({ imageBase64, mimeType })
      );
    } catch {
      /* image too large for quota — skip silently */
    }
  }, [imageBase64, mimeType]);

  useEffect(() => {
    if (isGeneratingAvatar) {
      let i = 0;
      cycleRef.current = setInterval(() => {
        i = (i + 1) % CYCLING_MESSAGES.length;
        setCyclingMessage(CYCLING_MESSAGES[i]);
      }, 2000);
    } else {
      if (cycleRef.current) clearInterval(cycleRef.current);
      setCyclingMessage(CYCLING_MESSAGES[0]);
    }
    return () => {
      if (cycleRef.current) clearInterval(cycleRef.current);
    };
  }, [isGeneratingAvatar]);

  // Keep AI topic field in sync with the topic textarea above
  useEffect(() => {
    setAiTopic(topic);
  }, [topic]);

  async function handleGenerateScript() {
    if (!aiTopic.trim()) return;
    setScriptGenerateError(null);
    setIsGeneratingScript(true);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);

    try {
      const res = await fetch('/api/script/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: aiTopic, duration: aiDuration }),
      });
      const data = (await res.json()) as { script?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Script generation failed');
      setUserScript(data.script ?? '');
      setScriptSuccessBanner(true);
      successTimerRef.current = setTimeout(
        () => setScriptSuccessBanner(false),
        4000
      );
    } catch (err) {
      setScriptGenerateError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingScript(false);
    }
  }

  function handleAddReferenceImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    files.forEach((file) => {
      if (referenceImages.length >= 3) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const [meta, data] = result.split(',');
        const mimeType = meta.replace('data:', '').replace(';base64', '');
        setReferenceImages((prev) =>
          prev.length >= 3 ? prev : [...prev, { data, mime_type: mimeType }]
        );
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  function handleRemoveReferenceImage(index: number) {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleGenerate() {
    if (!avatarPrompt.trim()) return;
    setAvatarError(null);
    setImageBase64(null);
    setImageVisible(false);
    setIsGeneratingAvatar(true);

    try {
      const res = await fetch('/api/avatar/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatar_prompt: avatarPrompt,
          ...(negativePrompt.trim()
            ? { negative_prompt: negativePrompt.trim() }
            : {}),
          ...(referenceImages.length > 0
            ? { reference_images: referenceImages }
            : {}),
        }),
      });
      const data = (await res.json()) as AvatarGenerateResponse & {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error ?? 'Avatar generation failed');
      }

      setImageBase64(data.image_base64);
      setMimeType(data.mime_type);
      setGenerationCount((c) => c + 1);
      requestAnimationFrame(() => setImageVisible(true));
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingAvatar(false);
    }
  }

  function handleDownload() {
    if (!imageBase64 || !mimeType) return;
    // Always download as PNG regardless of source mime type
    const canvas = document.createElement('canvas');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = 'avatar.png';
      link.click();
    };
    img.src = `data:${mimeType};base64,${imageBase64}`;
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:<mime>;base64,<data>"
      const [meta, data] = result.split(',');
      const mime = meta.replace('data:', '').replace(';base64', '');
      setImageBase64(data);
      setMimeType(mime);
      setGenerationCount((c) => c + 1);
      setAvatarError(null);
      requestAnimationFrame(() => setImageVisible(true));
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be re-imported
    e.target.value = '';
  }

  function handleNewSession() {
    // Clear localStorage drafts
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(DRAFT_IMAGE_KEY);
    // Reset all state
    setAvatarPrompt('');
    setTopic('');
    setUserScript('');
    setImageBase64(null);
    setMimeType(null);
    setImageVisible(false);
    setGenerationCount(0);
    setReferenceImages([]);
    setNegativePrompt('');
    setShowNegativePrompt(false);
    setAvatarError(null);
    setPipelineError(null);
    setSelectedVoiceId(VOICE_PRESETS[0].id);
    setCustomVoiceId('');
    setVoiceStyleMode('auto');
    setManualEmotion('enthusiastic');
    setManualSpeed(1.0);
    setManualVolume(1.0);
    setScriptMode('manual');
    setAiTopic('');
    setAiDuration('30s');
    setScriptSuccessBanner(false);
    setScriptGenerateError(null);
  }

  async function handleStartPipeline() {
    if (!imageBase64 || !topic.trim()) return;
    setPipelineError(null);
    setIsStartingPipeline(true);

    try {
      const resolvedVoice = customVoiceId.trim() || selectedVoiceId;
      const body: PipelineCreateRequest = {
        topic,
        avatar_prompt: avatarPrompt,
        image_base64: imageBase64,
        voice_id: resolvedVoice,
        ...(voiceStyleMode === 'manual'
          ? {
              voice_style_override: {
                emotion: manualEmotion,
                speed: manualSpeed,
                volume: manualVolume,
              },
            }
          : {}),
        ...(userScript.trim() ? { script: userScript.trim() } : {}),
      };
      const res = await fetch('/api/pipeline/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { job_id?: string; error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to start pipeline');
      }

      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(DRAFT_IMAGE_KEY);
      router.push(`/pipeline/${data.job_id}`);
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : String(err));
      setIsStartingPipeline(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top nav bar */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <svg
                className="h-4 w-4 text-white"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2zm0 12c5.33 0 8 2.67 8 4v2H4v-2c0-1.33 2.67-4 8-4z" />
              </svg>
            </div>
            <span className="font-semibold text-slate-800 text-sm tracking-tight">
              AI Avatar
            </span>
          </div>
          <button
            onClick={handleNewSession}
            disabled={isGeneratingAvatar || isStartingPipeline}
            title="Clear everything and start a fresh generation session"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            New Session
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Page header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700 mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            Step 1 of 2
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Create Your Avatar
          </h1>
          <p className="mt-2 text-slate-500 text-base max-w-lg">
            Describe the person who will present your video. You can regenerate
            as many times as you like.
          </p>
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Left column — controls */}
          <div className="flex flex-col gap-5 lg:w-1/2">
            {/* Prompt card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Avatar description
              </label>
              <textarea
                rows={4}
                value={avatarPrompt}
                onChange={(e) => setAvatarPrompt(e.target.value)}
                placeholder="e.g. Professional woman in her 30s, confident expression, plain grey background"
                className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder-slate-400 text-sm focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 transition"
                disabled={isGeneratingAvatar}
              />
              <p className="mt-1.5 text-right text-xs text-slate-400">
                {avatarPrompt.length} chars
              </p>

              {/* Negative prompt */}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowNegativePrompt((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-600 transition"
                >
                  <span
                    className="inline-block transition-transform duration-200"
                    style={{
                      transform: showNegativePrompt
                        ? 'rotate(90deg)'
                        : 'rotate(0deg)',
                    }}
                  >
                    ›
                  </span>
                  Negative prompt
                  {negativePrompt.trim() && (
                    <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      active
                    </span>
                  )}
                </button>

                {showNegativePrompt && (
                  <div
                    className="mt-2"
                    style={{ animation: 'fadeSlideIn 0.2s ease both' }}
                  >
                    <textarea
                      rows={2}
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      placeholder="e.g. glasses, beard, hat, sunglasses, blurry, cartoon"
                      className="w-full resize-y rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-slate-900 placeholder-slate-400 text-sm focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-100 transition"
                      disabled={isGeneratingAvatar}
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Things to exclude from the generated image.
                      Comma-separated works well.
                    </p>
                  </div>
                )}
              </div>

              {/* Reference images */}
              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-xs font-semibold text-slate-600">
                      Reference images
                    </span>
                    <span className="ml-1.5 text-xs text-slate-400">
                      (optional · up to 3)
                    </span>
                  </div>
                  {referenceImages.length < 3 && (
                    <button
                      type="button"
                      onClick={() => refImageInputRef.current?.click()}
                      disabled={isGeneratingAvatar}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <UploadIcon />
                      Upload
                    </button>
                  )}
                </div>

                {referenceImages.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => refImageInputRef.current?.click()}
                    disabled={isGeneratingAvatar}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-5 text-xs text-slate-400 transition hover:border-violet-300 hover:text-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <UploadIcon />
                    Upload reference photos to guide likeness
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {referenceImages.map((img, i) => (
                      <div
                        key={i}
                        className="relative group h-16 w-16 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex-shrink-0"
                      >
                        <img
                          src={`data:${img.mime_type};base64,${img.data}`}
                          alt={`Reference ${i + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveReferenceImage(i)}
                          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition text-white text-xs font-bold"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {referenceImages.length < 3 && (
                      <button
                        type="button"
                        onClick={() => refImageInputRef.current?.click()}
                        disabled={isGeneratingAvatar}
                        className="h-16 w-16 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 transition hover:border-violet-300 hover:text-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Add another reference"
                      >
                        <span className="text-lg leading-none">+</span>
                      </button>
                    )}
                  </div>
                )}

                {referenceImages.length > 0 && (
                  <p className="mt-2 text-xs text-slate-400">
                    Gemini will use{' '}
                    {referenceImages.length === 1
                      ? 'this image'
                      : 'these images'}{' '}
                    as a visual guide for likeness when generating your avatar.
                  </p>
                )}
              </div>
            </div>

            {/* Generate / Regenerate + Import buttons */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImport}
            />
            <input
              ref={refImageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleAddReferenceImages}
            />
            <div className="flex gap-3">
              {!imageBase64 ? (
                <button
                  onClick={handleGenerate}
                  disabled={isGeneratingAvatar || !avatarPrompt.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition hover:bg-violet-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGeneratingAvatar ? (
                    <>
                      <Spinner />
                      Generating…
                    </>
                  ) : (
                    'Generate Avatar'
                  )}
                </button>
              ) : (
                <button
                  onClick={handleGenerate}
                  disabled={isGeneratingAvatar || !avatarPrompt.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-violet-200 bg-white px-6 py-3.5 text-sm font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGeneratingAvatar ? (
                    <>
                      <Spinner />
                      Generating…
                    </>
                  ) : (
                    '↺ Regenerate'
                  )}
                </button>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isGeneratingAvatar}
                title="Import an existing avatar image"
                className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UploadIcon />
                Import
              </button>
            </div>

            {/* Cycling status message */}
            {isGeneratingAvatar && (
              <div className="flex items-center justify-center gap-2 text-sm text-violet-600">
                <span className="inline-block h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
                {cyclingMessage}
              </div>
            )}

            {/* Avatar error banner */}
            {avatarError && (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <span className="mt-0.5 text-red-500 text-sm">⚠</span>
                <p className="flex-1 text-sm text-red-700">{avatarError}</p>
                <button
                  onClick={() => setAvatarError(null)}
                  className="text-red-400 hover:text-red-600 text-xs"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Phase 2 — topic + pipeline */}
            {imageBase64 && (
              <div
                className="flex flex-col gap-5"
                style={{ animation: 'fadeSlideIn 0.4s ease both' }}
              >
                {/* Divider */}
                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-medium text-slate-400 whitespace-nowrap">
                    Step 2 — Create your video
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                {/* Topic card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    What is your video about?
                  </label>
                  <p className="text-xs text-slate-400 mb-3">
                    A one-line summary of the topic. Used to auto-generate the
                    script if you leave the script field below empty.
                  </p>
                  <textarea
                    rows={3}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. 3 morning habits that will change your life"
                    className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder-slate-400 text-sm focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 transition"
                    disabled={isStartingPipeline}
                  />
                </div>

                {/* Script card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  {/* Mode toggle row */}
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-semibold text-slate-700">
                      Script
                    </label>
                    <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-0.5">
                      {(['manual', 'ai'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setScriptMode(mode)}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                            scriptMode === mode
                              ? 'bg-white text-violet-700 shadow-sm border border-slate-200'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {mode === 'manual'
                            ? '✍️ Manual'
                            : '✨ Generate with AI'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* AI controls row — only in AI mode */}
                  {scriptMode === 'ai' && (
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={aiTopic}
                        onChange={(e) => setAiTopic(e.target.value)}
                        placeholder="Topic…"
                        className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-100 transition"
                        disabled={isGeneratingScript}
                      />
                      <div className="flex items-center gap-1">
                        {(['15s', '30s', '45s', '60s'] as const).map((d) => (
                          <button
                            key={d}
                            onClick={() => setAiDuration(d)}
                            className={`rounded-full px-2 py-1 text-xs font-medium transition ${
                              aiDuration === d
                                ? 'bg-violet-600 text-white'
                                : 'border border-slate-200 bg-white text-slate-500 hover:border-violet-300 hover:text-violet-600'
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={handleGenerateScript}
                        disabled={isGeneratingScript || !aiTopic.trim()}
                        className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isGeneratingScript ? <Spinner /> : '✨'}
                        {isGeneratingScript ? 'Generating…' : 'Generate'}
                      </button>
                    </div>
                  )}

                  {/* Error message */}
                  {scriptGenerateError && (
                    <p className="mb-2 text-xs text-red-600">
                      {scriptGenerateError}
                    </p>
                  )}

                  {/* Success banner */}
                  {scriptSuccessBanner && (
                    <div className="mb-2 flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                      <span className="text-xs text-emerald-700">
                        ✓ Script generated — edit freely before continuing
                      </span>
                      <button
                        onClick={() => setScriptSuccessBanner(false)}
                        className="text-emerald-500 hover:text-emerald-700 text-xs ml-2"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Existing textarea — untouched */}
                  <textarea
                    rows={5}
                    value={userScript}
                    onChange={(e) => setUserScript(e.target.value)}
                    placeholder="e.g. Did you know most people skip the one habit that changes everything? Here's what the top 1% do every single morning…"
                    className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder-slate-400 text-sm focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 transition"
                    disabled={isStartingPipeline}
                  />

                  {/* Live stats row */}
                  {(() => {
                    const words = userScript.trim()
                      ? userScript.trim().split(/\s+/).length
                      : 0;
                    const estSecs = Math.round((words / 140) * 60);
                    return (
                      <p className="mt-1.5 text-right text-xs text-slate-400">
                        {userScript.length} chars · {words} words · ~{estSecs}s
                      </p>
                    );
                  })()}

                  {/* Pipeline time estimate */}
                  {(() => {
                    const words = userScript.trim()
                      ? userScript.trim().split(/\s+/).length
                      : 0;
                    const audioDurationSecs = (words / 140) * 60;
                    const renderingMins = Math.max(
                      1,
                      Math.ceil((audioDurationSecs * 4) / 60)
                    );
                    const totalMins = Math.max(2, renderingMins + 1);
                    const show = userScript.length >= 10;
                    return (
                      <div
                        className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 transition-all duration-300"
                        style={{
                          opacity: show ? 1 : 0,
                          maxHeight: show ? '120px' : '0px',
                          overflow: 'hidden',
                          marginTop: show ? '0.75rem' : '0',
                        }}
                      >
                        <p className="text-xs text-slate-500">
                          🎙 Voice: ~5 seconds
                        </p>
                        <p className="text-xs text-slate-500">
                          🎬 Rendering: ~{renderingMins} min
                        </p>
                        <p className="text-xs text-slate-500">
                          ⏱ Total: ~{totalMins} min
                        </p>
                      </div>
                    );
                  })()}
                </div>

                {/* Voice card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col gap-4">
                  <label className="block text-sm font-semibold text-slate-700">
                    Voice
                  </label>

                  {/* Voice ID presets */}
                  <div className="flex flex-col gap-2">
                    {VOICE_PRESETS.map((v) => (
                      <label
                        key={v.id}
                        className="flex items-center gap-3 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="voice"
                          value={v.id}
                          checked={
                            selectedVoiceId === v.id && !customVoiceId.trim()
                          }
                          onChange={() => {
                            setSelectedVoiceId(v.id);
                            setCustomVoiceId('');
                          }}
                          className="accent-violet-600"
                        />
                        <span className="text-sm text-slate-700">
                          {v.label}
                        </span>
                        <span className="ml-auto font-mono text-xs text-slate-400 truncate max-w-[160px]">
                          {v.id}
                        </span>
                      </label>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={customVoiceId}
                    onChange={(e) => setCustomVoiceId(e.target.value)}
                    placeholder="Or paste a custom Cartesia voice ID…"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 font-mono text-xs text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 transition"
                  />

                  {/* Divider */}
                  <div className="h-px bg-slate-100" />

                  {/* Style mode toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">
                      Voice Style
                    </span>
                    <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-0.5">
                      {(['auto', 'manual'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setVoiceStyleMode(m)}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                            voiceStyleMode === m
                              ? 'bg-white text-violet-700 shadow-sm border border-slate-200'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {m === 'auto' ? '✨ Auto from topic' : '🎛 Manual'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {voiceStyleMode === 'auto' && (
                    <p className="text-xs text-slate-400">
                      Gemini will read your topic description and choose the
                      right emotion, speed, and volume automatically.
                    </p>
                  )}

                  {voiceStyleMode === 'manual' && (
                    <div className="flex flex-col gap-4">
                      {/* Emotion */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-2">
                          Emotion
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {EMOTION_OPTIONS.map((e) => (
                            <button
                              key={e}
                              onClick={() => setManualEmotion(e)}
                              className={`rounded-full px-2.5 py-1 text-xs font-medium transition capitalize ${
                                manualEmotion === e
                                  ? 'bg-violet-600 text-white'
                                  : 'border border-slate-200 bg-white text-slate-500 hover:border-violet-300 hover:text-violet-600'
                              }`}
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Speed */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-xs font-medium text-slate-600">
                            Speed
                          </label>
                          <span className="text-xs font-mono text-violet-700">
                            {manualSpeed.toFixed(2)}×
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.6}
                          max={1.5}
                          step={0.05}
                          value={manualSpeed}
                          onChange={(e) =>
                            setManualSpeed(parseFloat(e.target.value))
                          }
                          className="w-full accent-violet-600"
                        />
                        <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                          <span>0.6× slow</span>
                          <span>1.5× fast</span>
                        </div>
                      </div>

                      {/* Volume */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-xs font-medium text-slate-600">
                            Volume
                          </label>
                          <span className="text-xs font-mono text-violet-700">
                            {manualVolume.toFixed(2)}×
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.5}
                          max={2.0}
                          step={0.1}
                          value={manualVolume}
                          onChange={(e) =>
                            setManualVolume(parseFloat(e.target.value))
                          }
                          className="w-full accent-violet-600"
                        />
                        <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                          <span>0.5× quiet</span>
                          <span>2.0× loud</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleStartPipeline}
                  disabled={isStartingPipeline || !topic.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 text-sm font-bold text-white shadow-md shadow-emerald-100 transition hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isStartingPipeline ? (
                    <>
                      <Spinner />
                      Starting pipeline…
                    </>
                  ) : (
                    <>Generate Video →</>
                  )}
                </button>

                {pipelineError && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <span className="mt-0.5 text-red-500 text-sm">⚠</span>
                    <p className="flex-1 text-sm text-red-700">
                      {pipelineError}
                    </p>
                    <button
                      onClick={() => setPipelineError(null)}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right column — avatar preview */}
          <div className="flex flex-col items-center gap-4 lg:w-1/2">
            <div className="w-full max-w-sm">
              <div
                className="relative w-full rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm"
                style={{ aspectRatio: '3/4' }}
              >
                {imageBase64 ? (
                  <img
                    src={`data:${mimeType};base64,${imageBase64}`}
                    alt="Generated avatar"
                    className="h-full w-full object-cover transition-opacity duration-700"
                    style={{ opacity: imageVisible ? 1 : 0 }}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3">
                    <div className="rounded-full bg-slate-100 p-5">
                      <PersonIcon />
                    </div>
                    <p className="text-sm text-slate-400">
                      Your avatar will appear here
                    </p>
                  </div>
                )}
              </div>

              {imageBase64 && (
                <>
                  <div className="mt-3 flex items-center justify-center gap-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Avatar ready
                    </span>
                    <span className="text-xs text-slate-400">
                      Generated {generationCount}{' '}
                      {generationCount === 1 ? 'time' : 'times'}
                    </span>
                  </div>

                  <div className="mt-3 flex gap-3 w-full">
                    <button
                      onClick={handleGenerate}
                      disabled={isGeneratingAvatar || !avatarPrompt.trim()}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-violet-200 bg-white py-2.5 text-sm font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isGeneratingAvatar ? <Spinner /> : '↺'}
                      Regenerate
                    </button>
                    <button
                      onClick={handleDownload}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]"
                    >
                      <DownloadIcon />
                      Download
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="10" strokeOpacity={0.2} />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        d="M12 3v13M7 11l5 5 5-5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 21h14" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      className="h-4 w-4"
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
  );
}

function PersonIcon() {
  return (
    <svg
      className="h-10 w-10 text-slate-300"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}
