'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import DeviceAwareUpload from '@/components/DeviceAwareUpload';
import NextImage from 'next/image';
import type { PipelineCreateRequest, ReferenceImage } from '@/lib/types';
import TopHeader from '@/components/TopHeader';
import { Button } from '@/components/ui/button';
import { useProvider } from '@/lib/ProviderContext';

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

type Emotion =
  | 'neutral'
  | 'excited'
  | 'enthusiastic'
  | 'confident'
  | 'happy'
  | 'curious'
  | 'calm'
  | 'determined'
  | 'proud'
  | 'surprised'
  | 'anxious'
  | 'sad';

const CYCLING_MESSAGES = [
  'Crafting your avatar…',
  'Applying finishing touches…',
  'Almost there…',
  'Bringing your avatar to life…',
];

const PROMPT_CHIPS = [
  'Professional corporate headshot',
  'Casual tech worker in modern office',
  'Cinematic studio lighting, 85mm lens',
  'Warm lighting, friendly smile',
  'Urban street background, depth of field',
];

type AvatarVersion = {
  id: string;
  base64: string;
  mimeType: string;
  timestamp: number;
};

export default function AvatarNewPage() {
  const router = useRouter();
  const { providerConfig } = useProvider();

  const geminiApiKey = providerConfig.geminiApiKey || '';

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingSlide, setOnboardingSlide] = useState(0);

  useEffect(() => {
    const hasSeen = localStorage.getItem('hasSeenOnboarding');
    if (!hasSeen) {
      setShowOnboarding(true);
    }
  }, []);

  const completeOnboarding = () => {
    localStorage.setItem('hasSeenOnboarding', 'true');
    setShowOnboarding(false);
  };

  const [avatarPrompt, setAvatarPrompt] = useState('');
  const [topic, setTopic] = useState('');
  const [userScript, setUserScript] = useState('');
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [negativePrompt, setNegativePrompt] = useState('');
  const [showNegativePrompt, setShowNegativePrompt] = useState(false);

  // Generation & Preview
  const [versions, setVersions] = useState<AvatarVersion[]>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
  const [isStartingPipeline, setIsStartingPipeline] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [cyclingMessage, setCyclingMessage] = useState(CYCLING_MESSAGES[0]);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Voice Settings
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
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep AI topic field in sync with the topic textarea
  useEffect(() => {
    setAiTopic(topic);
  }, [topic]);

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

  async function handleGenerateScript() {
    if (!aiTopic.trim()) return;
    setScriptGenerateError(null);
    setIsGeneratingScript(true);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);

    try {
      const res = await fetch('/api/script/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: aiTopic,
          duration: aiDuration,
          gemini_api_key: geminiApiKey,
        }),
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

  function handleAddReferenceImagesFiles(files: File[]) {
    if (!files.length) return;
    files.forEach((file) => {
      if (referenceImages.length >= 10) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const [meta, data] = result.split(',');
        const mimeType = meta.replace('data:', '').replace(';base64', '');
        setReferenceImages((prev) =>
          prev.length >= 10 ? prev : [...prev, { data, mime_type: mimeType }]
        );
      };
      reader.readAsDataURL(file);
    });
  }

  function handleRemoveReferenceImage(index: number) {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleGenerateAvatar() {
    if (!avatarPrompt.trim()) return;
    setAvatarError(null);
    setIsGeneratingAvatar(true);

    try {
      const res = await fetch('/api/avatar/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatar_prompt: avatarPrompt,
          gemini_api_key: geminiApiKey,
          ...(negativePrompt.trim()
            ? { negative_prompt: negativePrompt.trim() }
            : {}),
          ...(referenceImages.length > 0
            ? { reference_images: referenceImages }
            : {}),
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json();
        throw new Error(data.error ?? 'Avatar generation failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const block of events) {
          const eventMatch = block.match(/^event: (\w+)/m);
          const dataMatch = block.match(/^data: (.+)$/m);
          if (!eventMatch || !dataMatch) continue;

          const event = eventMatch[1];
          const payload = JSON.parse(dataMatch[1]);

          if (event === 'result') {
            const newVersion: AvatarVersion = {
              id: Date.now().toString(),
              base64: payload.image_base64,
              mimeType: payload.mime_type,
              timestamp: Date.now(),
            };
            setVersions((prev) => [...prev, newVersion]);
            setCurrentVersionIndex(versions.length);
          } else if (event === 'error') {
            throw new Error(payload.error ?? 'Avatar generation failed');
          }
        }
      }
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingAvatar(false);
    }
  }

  function handleDownload() {
    const current = versions[currentVersionIndex];
    if (!current) return;
    const canvas = document.createElement('canvas');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `avatar-v${currentVersionIndex + 1}.png`;
      link.click();
    };
    img.src = `data:${current.mimeType};base64,${current.base64}`;
  }

  function handleNewSession() {
    setAvatarPrompt('');
    setTopic('');
    setUserScript('');
    setVersions([]);
    setCurrentVersionIndex(-1);
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
    const current = versions[currentVersionIndex];
    if (!current || !topic.trim()) return;
    setPipelineError(null);
    setIsStartingPipeline(true);

    try {
      const resolvedVoice = customVoiceId.trim() || selectedVoiceId;
      const body: PipelineCreateRequest & { gemini_api_key?: string } = {
        topic,
        avatar_prompt: avatarPrompt,
        image_base64: current.base64,
        voice_id: resolvedVoice,
        gemini_api_key: geminiApiKey,
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
      router.push(`/pipeline/${data.job_id}`);
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : String(err));
      setIsStartingPipeline(false);
    }
  }

  const hasAvatar = versions.length > 0 && currentVersionIndex >= 0;
  const currentAvatar = hasAvatar ? versions[currentVersionIndex] : null;

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-foreground flex flex-col">
      <TopHeader
        breadcrumbs={[
          { label: 'Avatars', href: '/avatar' },
          { label: 'New Avatar' },
        ]}
        actions={
          <Button
            variant="outline"
            onClick={handleNewSession}
            disabled={isGeneratingAvatar || isStartingPipeline}
          >
            <svg
              className="h-3.5 w-3.5 mr-1"
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
          </Button>
        }
      />

      <div className="flex-1 w-full flex flex-col lg:flex-row overflow-hidden max-h-[calc(100vh-64px)]">
        {/* LEFT PANE (60%) - Inputs */}
        <div className="w-full lg:w-[60%] overflow-y-auto bg-white border-r border-slate-200">
          <div className="p-6 md:p-8 flex flex-col gap-8 max-w-3xl mx-auto">
            {/* SECTION 1: DESCRIBE AVATAR */}
            <section className="flex flex-col gap-4">
              <div>
                <h2 className="type-level-1 text-slate-800">
                  1. Describe Avatar
                </h2>
                <p className="type-level-2 text-slate-500 mt-1">
                  What should your presenter look like?
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                <label className="block type-level-2 text-slate-700 mb-2">
                  Avatar Prompt
                </label>
                <textarea
                  rows={4}
                  value={avatarPrompt}
                  onChange={(e) => setAvatarPrompt(e.target.value)}
                  placeholder="e.g. Professional woman in her 30s, confident expression, plain grey background"
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 type-level-2 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 transition"
                  disabled={isGeneratingAvatar}
                />

                {/* Prompt Chips */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {PROMPT_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => setAvatarPrompt(chip)}
                      className="px-3 py-1.5 rounded-full bg-white border border-slate-200 type-level-3 text-slate-600 hover:border-violet-300 hover:text-violet-700 transition"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {/* Negative prompt */}
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setShowNegativePrompt((v) => !v)}
                    className="flex items-center gap-1.5 type-level-3 text-slate-500 hover:text-slate-700 transition"
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
                    <div className="mt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                      <textarea
                        rows={2}
                        value={negativePrompt}
                        onChange={(e) => setNegativePrompt(e.target.value)}
                        placeholder="e.g. glasses, beard, hat, blurry, cartoon"
                        className="w-full resize-y rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-slate-900 placeholder-slate-500 type-level-2 focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-100 transition"
                        disabled={isGeneratingAvatar}
                      />
                    </div>
                  )}
                </div>

                {/* Reference images */}
                <div className="mt-5 border-t border-slate-200/60 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="type-level-2 text-slate-700">
                        Reference images
                      </span>
                      <span className="ml-1.5 type-level-3 text-slate-400">
                        (optional · up to 10)
                      </span>
                    </div>
                    {referenceImages.length < 10 && (
                      <DeviceAwareUpload
                        onUpload={handleAddReferenceImagesFiles}
                        className="inline-block"
                      >
                        <button
                          type="button"
                          disabled={isGeneratingAvatar}
                          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 type-level-3 text-slate-600 transition hover:border-violet-300 hover:text-violet-700 disabled:opacity-50"
                        >
                          <UploadIcon />
                          Upload
                        </button>
                      </DeviceAwareUpload>
                    )}
                  </div>

                  {referenceImages.length === 0 ? (
                    <DeviceAwareUpload
                      onUpload={handleAddReferenceImagesFiles}
                      className="w-full"
                    >
                      <button
                        type="button"
                        disabled={isGeneratingAvatar}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-white py-6 type-level-2 text-slate-500 transition hover:border-violet-300 hover:text-violet-600 disabled:opacity-50"
                      >
                        <UploadIcon />
                        Upload reference photos to guide likeness
                      </button>
                    </DeviceAwareUpload>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {referenceImages.map((img, i) => (
                        <div
                          key={i}
                          className="relative group h-16 w-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex-shrink-0 shadow-sm"
                        >
                          <NextImage
                            src={`data:${img.mime_type};base64,${img.data}`}
                            alt={`Ref ${i}`}
                            fill
                            unoptimized
                            className="object-cover"
                          />
                          <button
                            onClick={() => handleRemoveReferenceImage(i)}
                            className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition text-white type-level-3"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Avatar Action */}
                <div className="mt-6 flex gap-3">
                  <Button
                    onClick={handleGenerateAvatar}
                    disabled={isGeneratingAvatar || !avatarPrompt.trim()}
                    className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-bold py-5 rounded-xl text-base shadow-sm shadow-violet-200"
                  >
                    {isGeneratingAvatar ? (
                      <>
                        <Spinner className="mr-2" /> Generating Avatar...
                      </>
                    ) : (
                      'Generate Avatar'
                    )}
                  </Button>
                </div>

                {avatarError && (
                  <div className="mt-3 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <span className="text-red-500">⚠</span>
                    <p className="flex-1 type-level-2 text-red-700">
                      {avatarError}
                    </p>
                    <button
                      onClick={() => setAvatarError(null)}
                      className="text-red-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* SECTION 2: SCRIPT & VOICE */}
            <section className="flex flex-col gap-4">
              <div>
                <h2 className="type-level-1 text-slate-800">
                  2. Script & Voice
                </h2>
                <p className="type-level-2 text-slate-500 mt-1">
                  What should your avatar say?
                </p>
              </div>

              {/* Topic */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                <label className="block type-level-2 text-slate-700 mb-1">
                  Video Topic
                </label>
                <textarea
                  rows={2}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. 3 morning habits that will change your life"
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 type-level-2 focus:border-violet-400 focus:outline-none transition"
                  disabled={isStartingPipeline}
                />

                {/* Script */}
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block type-level-2 text-slate-700">
                      Script
                    </label>
                    <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-0.5">
                      {(['manual', 'ai'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setScriptMode(mode)}
                          className={`rounded-full px-3 py-1 type-level-3 transition ${
                            scriptMode === mode
                              ? 'bg-slate-100 text-violet-700 shadow-sm border border-slate-200'
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

                  {scriptMode === 'ai' && (
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={aiTopic}
                        onChange={(e) => setAiTopic(e.target.value)}
                        placeholder="Topic for script..."
                        className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 type-level-2 focus:border-violet-400 focus:outline-none transition"
                        disabled={isGeneratingScript}
                      />
                      <select
                        value={aiDuration}
                        onChange={(e) => setAiDuration(e.target.value as any)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 type-level-2 outline-none focus:border-violet-400"
                        disabled={isGeneratingScript}
                      >
                        <option value="15s">15s</option>
                        <option value="30s">30s</option>
                        <option value="45s">45s</option>
                        <option value="60s">60s</option>
                      </select>
                      <Button
                        onClick={handleGenerateScript}
                        disabled={isGeneratingScript || !aiTopic.trim()}
                        className="bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-4"
                      >
                        {isGeneratingScript ? <Spinner /> : 'Generate'}
                      </Button>
                    </div>
                  )}

                  {scriptGenerateError && (
                    <p className="mb-2 type-level-3 text-red-600">
                      {scriptGenerateError}
                    </p>
                  )}
                  {scriptSuccessBanner && (
                    <div className="mb-2 p-2 rounded-lg bg-emerald-50 text-emerald-700 type-level-3">
                      ✓ Script generated — edit freely before continuing
                    </div>
                  )}

                  <textarea
                    rows={5}
                    value={userScript}
                    onChange={(e) => setUserScript(e.target.value)}
                    placeholder="e.g. Did you know most people skip the one habit that changes everything?"
                    className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 type-level-2 focus:border-violet-400 focus:outline-none transition"
                    disabled={isStartingPipeline}
                  />

                  {userScript.trim() && (
                    <p className="mt-2 text-right type-level-3 text-slate-400">
                      {userScript.trim().split(/\s+/).length} words · ~
                      {Math.round(
                        (userScript.trim().split(/\s+/).length / 140) * 60
                      )}
                      s
                    </p>
                  )}
                </div>

                {/* Voice */}
                <div className="mt-5 border-t border-slate-200/60 pt-5">
                  <label className="block type-level-2 text-slate-700 mb-3">
                    Voice
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                    {VOICE_PRESETS.map((v) => (
                      <label
                        key={v.id}
                        className={`flex items-center gap-3 cursor-pointer rounded-xl border p-3 transition ${selectedVoiceId === v.id && !customVoiceId.trim() ? 'border-violet-500 bg-violet-50/50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
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
                          className="accent-violet-600 w-4 h-4"
                        />
                        <span className="type-level-2 text-slate-700">
                          {v.label}
                        </span>
                      </label>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={customVoiceId}
                    onChange={(e) => setCustomVoiceId(e.target.value)}
                    placeholder="Or paste custom Cartesia voice ID..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-mono type-level-2 focus:border-violet-400 focus:outline-none transition"
                  />
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* RIGHT PANE (40%) - Preview & Action */}
        <div className="w-full lg:w-[40%] bg-[#F8FAFC] flex flex-col p-6 md:p-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="type-level-1 text-slate-800">Preview</h2>

            {/* Version Carousel Navigator */}
            {versions.length > 1 && (
              <div className="flex items-center gap-2 bg-white rounded-full border border-slate-200 px-3 py-1.5 shadow-sm">
                <button
                  onClick={() =>
                    setCurrentVersionIndex(Math.max(0, currentVersionIndex - 1))
                  }
                  disabled={currentVersionIndex === 0}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <span className="type-level-3 text-slate-600">
                  v{currentVersionIndex + 1} of {versions.length}
                </span>
                <button
                  onClick={() =>
                    setCurrentVersionIndex(
                      Math.min(versions.length - 1, currentVersionIndex + 1)
                    )
                  }
                  disabled={currentVersionIndex === versions.length - 1}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col">
            <div
              className={`relative w-full aspect-[3/4] max-h-[60vh] rounded-2xl overflow-hidden border ${isGeneratingAvatar ? 'border-violet-300 shadow-violet-100' : 'border-slate-200'} bg-white shadow-md transition-colors mx-auto flex items-center justify-center`}
            >
              {isGeneratingAvatar ? (
                <div className="flex flex-col items-center justify-center gap-4 animate-pulse">
                  <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center">
                    <Spinner className="w-8 h-8 text-violet-500" />
                  </div>
                  <p className="type-level-2 text-violet-600">
                    {cyclingMessage}
                  </p>
                </div>
              ) : currentAvatar ? (
                <div className="relative w-full h-full group">
                  <NextImage
                    src={`data:${currentAvatar.mimeType};base64,${currentAvatar.base64}`}
                    alt={`Avatar v${currentVersionIndex + 1}`}
                    fill
                    unoptimized
                    className="object-contain cursor-zoom-in"
                    onClick={() => setLightboxOpen(true)}
                  />

                  {/* Hover Actions */}
                  <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setLightboxOpen(true)}
                      className="w-9 h-9 flex items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-sm hover:bg-black/80 transition"
                      title="Fullscreen"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={handleDownload}
                      className="w-9 h-9 flex items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-sm hover:bg-black/80 transition"
                      title="Download"
                    >
                      <DownloadIcon />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center px-6">
                  <div className="w-20 h-20 rounded-full bg-slate-100 mx-auto flex items-center justify-center mb-4">
                    <PersonIcon />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800">
                    No Avatar Yet
                  </h3>
                  <p className="type-level-2 text-slate-500 mt-1 max-w-[250px] mx-auto">
                    Fill out the prompt on the left to generate your first
                    avatar.
                  </p>
                </div>
              )}
            </div>

            {/* Action Area */}
            <div className="mt-8 flex flex-col gap-4">
              <Button
                onClick={handleStartPipeline}
                disabled={isStartingPipeline || !currentAvatar || !topic.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-6 rounded-xl text-base shadow-md shadow-emerald-100 transition-transform active:scale-[0.98]"
              >
                {isStartingPipeline ? (
                  <>
                    <Spinner className="mr-2" /> Starting Pipeline...
                  </>
                ) : (
                  'Start Video Pipeline →'
                )}
              </Button>

              {pipelineError && (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <span className="text-red-500">⚠</span>
                  <p className="flex-1 type-level-2 text-red-700">
                    {pipelineError}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Onboarding Modal */}
      {showOnboarding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-8 flex-1 text-center">
              {onboardingSlide === 0 && (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-4xl mb-4">👋</div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">
                    Welcome to AI Native Videos
                  </h2>
                  <p className="text-slate-500">
                    Create AI avatars and script-driven video content in
                    minutes. Let's walk through how it works.
                  </p>
                </div>
              )}
              {onboardingSlide === 1 && (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-4xl mb-4">🖼️</div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">
                    1. Design your Avatar
                  </h2>
                  <p className="text-slate-500">
                    Use text prompts and optional reference photos to generate a
                    unique presenter for your videos.
                  </p>
                </div>
              )}
              {onboardingSlide === 2 && (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-4xl mb-4">🎬</div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">
                    2. Generate the Video
                  </h2>
                  <p className="text-slate-500">
                    Write your script (or let AI write it), pick a voice, and
                    we'll animate your avatar to deliver the message.
                  </p>
                </div>
              )}
            </div>
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-between">
              <div className="flex gap-1.5 ml-4">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${onboardingSlide === i ? 'bg-violet-500' : 'bg-slate-300'}`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={completeOnboarding}
                  className="px-4 py-2 text-slate-500 hover:text-slate-800 type-level-2"
                >
                  Skip
                </button>
                <button
                  onClick={() =>
                    onboardingSlide < 2
                      ? setOnboardingSlide((s) => s + 1)
                      : completeOnboarding()
                  }
                  className="px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white type-level-2 rounded-lg transition-colors shadow-sm"
                >
                  {onboardingSlide < 2 ? 'Next' : 'Get Started'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox for Fullscreen View */}
      {lightboxOpen && currentAvatar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="relative w-full h-full p-8 flex items-center justify-center">
            <NextImage
              src={`data:${currentAvatar.mimeType};base64,${currentAvatar.base64}`}
              alt="Avatar Fullscreen"
              fill
              unoptimized
              className="object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition backdrop-blur-md"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
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
      className="w-4 h-4"
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
      className="w-4 h-4"
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
      className="w-10 h-10 text-slate-300"
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
