'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { PipelineJob, PipelineStatusResponse } from '@/lib/types';

// ── Stage tracker config ──────────────────────────────────────────────────────

const STAGES = [
  { label: 'Avatar Saved', icon: '🖼' },
  { label: 'Script Ready', icon: '📝' },
  { label: 'Voice Ready', icon: '🎙' },
  { label: 'Video Rendered', icon: '🎬' },
];

function activeStepIndex(status: PipelineJob['status']): number {
  switch (status) {
    case 'pending':
      return 0;
    case 'script_generating':
    case 'script_complete':
      return 1;
    case 'tts_processing':
    case 'tts_complete':
      return 2;
    case 'lipsync_processing':
      return 3;
    case 'complete':
      return 4; // all done
    default:
      return 0;
  }
}

function progressPercent(status: PipelineJob['status']): number {
  switch (status) {
    case 'pending':
      return 5;
    case 'script_generating':
      return 15;
    case 'script_complete':
      return 35;
    case 'tts_processing':
      return 45;
    case 'tts_complete':
      return 60;
    case 'lipsync_processing':
      return 75;
    case 'complete':
      return 100;
    default:
      return 0;
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [job, setJob] = useState<PipelineJob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  async function fetchStatus() {
    try {
      const res = await fetch(`/api/pipeline/${id}`);
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as PipelineStatusResponse;
      setJob(data.job);
      setVideoUrl(data.video_url);
      setFetchError(null);

      if (data.job.status === 'complete' || data.job.status === 'failed') {
        stopPolling();
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 3000);
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Loading splash ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Spinner large />
          <p className="text-slate-400 text-sm">Loading your pipeline…</p>
        </div>
      </PageShell>
    );
  }

  // ── Fetch error (API itself failed) ────────────────────────────────────────
  if (fetchError && !job) {
    return (
      <PageShell>
        <ErrorCard
          title="Could not load pipeline"
          message={fetchError}
          onRetry={() => router.push('/avatar/new')}
        />
      </PageShell>
    );
  }

  if (!job) return null;

  const isComplete = job.status === 'complete';
  const isFailed = job.status === 'failed';
  const isRunning = !isComplete && !isFailed;
  const stepIndex = activeStepIndex(job.status);
  const pct = progressPercent(job.status);

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <PageShell>
      <div className="mx-auto max-w-2xl px-6 py-12 flex flex-col gap-8">
        {/* Title */}
        <div>
          {isComplete ? (
            <h1 className="text-3xl font-bold text-slate-900">
              Your Video is Ready 🎉
            </h1>
          ) : isFailed ? (
            <h1 className="text-3xl font-bold text-slate-900">
              Generation Failed
            </h1>
          ) : (
            <h1
              className="text-3xl font-bold bg-gradient-to-r from-violet-600 via-indigo-500 to-violet-600 bg-[length:200%_auto] bg-clip-text text-transparent"
              style={{ animation: 'shimmer 3s linear infinite' }}
            >
              Generating Your Video…
            </h1>
          )}
          <p className="mt-2 text-slate-500 text-sm">Job ID: {job.job_id}</p>
        </div>

        {/* ── Failed state ── */}
        {isFailed && (
          <ErrorCard
            title="Something went wrong"
            message={job.error ?? 'An unknown error occurred'}
            onRetry={() => router.push('/avatar/new')}
          />
        )}

        {/* ── Voice style card (visible once resolved) ── */}
        {job.voice_style && (
          <div className="rounded-2xl border border-violet-100 bg-violet-50 px-5 py-4 flex flex-wrap gap-5">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-violet-500 uppercase tracking-wide">
                Emotion
              </span>
              <span className="text-sm font-semibold text-violet-800 capitalize">
                {job.voice_style.emotion}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-violet-500 uppercase tracking-wide">
                Speed
              </span>
              <span className="text-sm font-semibold text-violet-800">
                {job.voice_style.speed.toFixed(2)}×
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-violet-500 uppercase tracking-wide">
                Volume
              </span>
              <span className="text-sm font-semibold text-violet-800">
                {job.voice_style.volume.toFixed(2)}×
              </span>
            </div>
          </div>
        )}

        {/* ── Running state: stage tracker + progress ── */}
        {isRunning && (
          <>
            {/* Stage tracker */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-5">
                {STAGES.map((stage, i) => {
                  const done = stepIndex > i;
                  const active = stepIndex === i;
                  return (
                    <div key={stage.label} className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="relative flex-shrink-0 mt-0.5">
                        <div
                          className={`h-9 w-9 rounded-full flex items-center justify-center text-base transition-all duration-500 ${
                            done
                              ? 'bg-emerald-100 text-emerald-600'
                              : active
                                ? 'bg-violet-100 text-violet-600'
                                : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {done ? '✓' : stage.icon}
                        </div>
                        {active && (
                          <span className="absolute inset-0 rounded-full animate-ping bg-violet-400 opacity-30" />
                        )}
                      </div>

                      {/* Label + message */}
                      <div className="flex-1 pt-1">
                        <p
                          className={`text-sm font-semibold transition-colors duration-300 ${
                            done
                              ? 'text-emerald-700'
                              : active
                                ? 'text-violet-700'
                                : 'text-slate-400'
                          }`}
                        >
                          {stage.label}
                        </p>
                        {active && job.stage_message && (
                          <p className="mt-0.5 text-xs italic text-slate-400">
                            {job.stage_message}
                          </p>
                        )}
                      </div>

                      {/* Done check */}
                      {done && (
                        <span className="flex-shrink-0 mt-1 text-emerald-500 text-sm font-bold">
                          ✓
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                <span>Progress</span>
                <span>{pct}%</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-[width] duration-700 ease-in-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Lipsync callout */}
            <div
              className="transition-all duration-500"
              style={{
                opacity: job.status === 'lipsync_processing' ? 1 : 0,
                maxHeight:
                  job.status === 'lipsync_processing' ? '120px' : '0px',
                overflow: 'hidden',
              }}
            >
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                <span className="text-lg">🕐</span>
                <p className="text-sm text-amber-800">
                  <strong>
                    Video generation usually takes 2–5 minutes on shared GPU.
                  </strong>{' '}
                  Please keep this tab open — we'll update automatically when
                  it's done.
                </p>
              </div>
            </div>
          </>
        )}

        {/* ── Complete state: video player ── */}
        {isComplete && videoUrl && (
          <div className="flex flex-col items-center gap-6">
            <video
              src={videoUrl}
              controls
              autoPlay
              className="w-full rounded-2xl shadow-xl border border-slate-200"
              style={{ maxWidth: 480 }}
            />
            <div className="flex gap-3">
              <a
                href={videoUrl}
                download
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 active:scale-[0.98]"
              >
                <DownloadIcon />
                Download Video
              </a>
              <button
                onClick={() => router.push('/avatar/new')}
                className="flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]"
              >
                ＋ Create Another
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 0% center; }
          100% { background-position: 200% center; }
        }
      `}</style>
    </PageShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center gap-2">
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
      </header>
      {children}
    </div>
  );
}

function ErrorCard({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-base flex-shrink-0">
          ✕
        </div>
        <h2 className="text-base font-semibold text-red-800">{title}</h2>
      </div>
      <p className="text-sm text-red-700">{message}</p>
      <button
        onClick={onRetry}
        className="self-start rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 active:scale-[0.98]"
      >
        Try Again
      </button>
    </div>
  );
}

function Spinner({ large = false }: { large?: boolean }) {
  const size = large ? 'h-10 w-10' : 'h-4 w-4';
  return (
    <svg
      className={`${size} animate-spin text-violet-500`}
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
