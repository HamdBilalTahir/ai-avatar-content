'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  X,
  ImageIcon,
  Settings2,
  Play,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Download,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  Pencil,
  Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  increment,
} from 'firebase/firestore';
import { useAuth } from '@/lib/AuthContext';
import { useProvider } from '@/lib/ProviderContext';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ProviderBadge from '@/components/ProviderBadge';
import { DEFAULT_VIDEO_PROMPT } from './constants';
import { extractAudioLocally } from '@/lib/client-ffmpeg';

export type StepSlot = {
  stepNumber: number;
  label?: string;
  dialogue: string;
  visualPrompt?: string;
  status: 'idle' | 'generating' | 'done' | 'error';
  videoUrl?: string;
  errorMsg?: string;
  cumulativeDuration?: number;
  completedAt?: number;
  videoReferenceUrl?: string;
  videoVersions?: { version: string; url: string }[];
  activeVersionIndex?: number;
  costUsd?: number;
};

type RunRecord = {
  id: string;
  runId: string;
  sandboxId: string;
  userId: string;
  createdAt: number;
  status: 'generating' | 'done' | 'error';
  model: string;
  provider: string;
  aspectRatio: string;
  quality: string;
  clipCount: number;
  scripts: { id: number; text: string }[];
  steps: StepSlot[];
  defaultPrompt?: string;
  topicName?: string;
  isExtendEnabled?: boolean;
  stitchedVideoUrl?: string;
  stitchedVideoUrls?: Record<string, string>;
  totalCostUsd?: number;
};

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function modelShortName(m: string): string {
  if (m.includes('veo-3.1-fast')) return 'Veo 3.1 Fast';
  if (m.includes('veo-3.1-generate')) return 'Veo 3.1 Pro';
  if (m.includes('veo-3.1-lite')) return 'Veo 3.1 Lite';
  if (m.includes('kling')) return 'Kling O3';
  if (m.includes('seedance-2')) return 'Seedance 2.0';
  if (m.includes('seedance-1.5')) return 'Seedance 1.5';
  if (m.includes('grok')) return 'Grok';
  return m;
}

// Veo pricing per second of video generated (USD), by resolution.
// Source: ai.google.dev/gemini-api/docs/pricing — current as of 2026-06-10 (post Apr 7 price cut).
const VEO_PRICE_PER_SECOND: Record<
  string,
  Partial<Record<'720p' | '1080p' | '4k', number>>
> = {
  'veo-3.1-lite': { '720p': 0.05, '1080p': 0.08 },
  'veo-3.1-fast': { '720p': 0.1, '1080p': 0.12, '4k': 0.3 },
  'veo-3.1-generate': { '720p': 0.4, '1080p': 0.4, '4k': 0.6 },
};

function clipCostValue(
  modelName: string,
  durationSeconds = 8,
  resolution: '720p' | '1080p' | '4k' = '1080p'
): number | null {
  const key = Object.keys(VEO_PRICE_PER_SECOND).find((k) =>
    modelName.includes(k)
  );
  if (!key) return null;
  const rate =
    VEO_PRICE_PER_SECOND[key][resolution] ??
    VEO_PRICE_PER_SECOND[key]['1080p'] ??
    Object.values(VEO_PRICE_PER_SECOND[key])[0];
  return rate !== undefined ? rate * durationSeconds : null;
}

function clipCostUsd(
  modelName: string,
  durationSeconds = 8,
  resolution: '720p' | '1080p' | '4k' = '1080p'
): string | null {
  const cost = clipCostValue(modelName, durationSeconds, resolution);
  return cost !== null ? `~$${cost.toFixed(2)}` : null;
}

// ─── Variation helpers ────────────────────────────────────────────────────────

function getVariantLetter(label: string | undefined): string | null {
  if (!label) return null;
  const m = label.match(/([A-Z]+)$/);
  return m ? m[1] : null;
}

function getVariantBase(label: string): string {
  return label.replace(/[A-Z]+$/, '');
}

// Returns { A: [url, url, ...], B: [...], C: [...] } or null if no variations
function buildVariantUrlMap(
  steps: StepSlot[]
): Record<string, string[]> | null {
  const letters = new Set<string>();
  for (const s of steps) {
    const l = getVariantLetter(s.label);
    if (l) letters.add(l);
  }
  if (letters.size === 0) return null;

  const result: Record<string, string[]> = {};
  for (const letter of Array.from(letters).sort()) {
    result[letter] = steps
      .filter((s) => {
        const l = getVariantLetter(s.label);
        return l === null || l === letter;
      })
      .map((s) => s.videoUrl)
      .filter((url): url is string => !!url);
  }
  return result;
}

type StepRow =
  | { type: 'single'; step: StepSlot; idx: number }
  | { type: 'group'; groupBase: string; steps: StepSlot[]; startIdx: number };

function groupStepRows(steps: StepSlot[]): StepRow[] {
  const rows: StepRow[] = [];
  let i = 0;
  while (i < steps.length) {
    const step = steps[i];
    const letter = getVariantLetter(step.label);
    if (letter !== null && step.label) {
      const base = getVariantBase(step.label);
      const groupSteps: StepSlot[] = [step];
      let j = i + 1;
      while (j < steps.length) {
        const next = steps[j];
        if (
          getVariantLetter(next.label) !== null &&
          next.label &&
          getVariantBase(next.label) === base
        ) {
          groupSteps.push(next);
          j++;
        } else {
          break;
        }
      }
      if (groupSteps.length > 1) {
        rows.push({
          type: 'group',
          groupBase: base,
          steps: groupSteps,
          startIdx: i,
        });
        i = j;
      } else {
        rows.push({ type: 'single', step, idx: i });
        i++;
      }
    } else {
      rows.push({ type: 'single', step, idx: i });
      i++;
    }
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────

type AvatarImageEntry = {
  id: string;
  file?: File;
  previewUrl: string;
  blobUrl?: string;
  assignedTo: 'all' | number[];
  isBroll?: boolean;
};

type ScriptItem = {
  id: number;
  label?: string;
  text: string;
  visualPrompt?: string;
  variationGroup?: number;
  variationNote?: string;
  isBroll?: boolean;
};

export default function SandboxPage() {
  const { user } = useAuth();
  const { providerConfig } = useProvider();
  const [avatarImages, setAvatarImages] = useState<AvatarImageEntry[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [targetDuration, setTargetDuration] = useState<number>(36);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const clipCount = 1 + Math.floor((targetDuration - 8) / 7);
  const [model, setModel] = useState<string>('veo-3.1-fast-generate-preview');
  const [defaultVideoPrompt, setDefaultVideoPrompt] =
    useState<string>(DEFAULT_VIDEO_PROMPT);
  const [videoQuality, setVideoQuality] = useState<'720p' | '1080p' | '4k'>(
    '1080p'
  );
  const [isExtendEnabled, setIsExtendEnabled] = useState<boolean>(false);

  // Script Generation State
  const [goalText, setGoalText] = useState<string>('');
  const [topicName, setTopicName] = useState<string>('');
  const [generatedScript, setGeneratedScript] = useState<ScriptItem[] | null>(
    null
  );
  const [isGeneratingScript, setIsGeneratingScript] = useState<boolean>(false);
  const [filmDirectionSystem, setFilmDirectionSystem] = useState<string | null>(
    null
  );
  const [filmDirectionSections, setFilmDirectionSections] = useState<
    any[] | null
  >(null);
  const [isAiGeneratedPrompt, setIsAiGeneratedPrompt] =
    useState<boolean>(false);
  const [isRegeneratingPrompt, setIsRegeneratingPrompt] =
    useState<boolean>(false);
  const [regeneratingDialogueIndex, setRegeneratingDialogueIndex] = useState<
    number | null
  >(null);

  const [steps, setSteps] = useState<StepSlot[]>([]);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [finalEditedVideo, setFinalEditedVideo] = useState<string | null>(null);
  const [isUploadingFinalVideo, setIsUploadingFinalVideo] = useState(false);
  const [isPosted, setIsPosted] = useState(false);
  const [isMarkingPosted, setIsMarkingPosted] = useState(false);
  const [showImageGen, setShowImageGen] = useState(false);
  const [imageGenPrompt, setImageGenPrompt] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageGenError, setImageGenError] = useState<string | null>(null);
  const [generatedImagePreview, setGeneratedImagePreview] = useState<{
    base64: string;
    mimeType: string;
    objectUrl: string;
  } | null>(null);
  const [imageGenCostUsd, setImageGenCostUsd] = useState(0);
  const [scriptGenCostUsd, setScriptGenCostUsd] = useState(0);
  const [imageGenAspectRatio, setImageGenAspectRatio] = useState('1:1');
  const [imageGenSize, setImageGenSize] = useState('1K');
  const [imageGenRefImages, setImageGenRefImages] = useState<
    { data: string; mimeType: string; previewUrl: string }[]
  >([]);
  const [sandboxes, setSandboxes] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [sandboxToDelete, setSandboxToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isDeletingSandbox, setIsDeletingSandbox] = useState(false);
  const [isDownloadingFinalAudio, setIsDownloadingFinalAudio] = useState(false);
  const [ffmpegProgress, setFfmpegProgress] = useState<string | null>(null);
  const [isCreatingSandbox, setIsCreatingSandbox] = useState<boolean>(false);
  const [isCreatingVideos, setIsCreatingVideos] = useState<boolean>(false);

  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [expandedRunIds, setExpandedRunIds] = useState<Set<string>>(new Set());

  const [expandedClipPromptIndex, setExpandedClipPromptIndex] = useState<
    number | null
  >(null);
  const [regeneratingClipPromptIndex, setRegeneratingClipPromptIndex] =
    useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isCreatingVideosRef = useRef<boolean>(false);
  const assignmentSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const clipPromptSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    isCreatingVideosRef.current = isCreatingVideos;
  }, [isCreatingVideos]);

  // Fetch Film Direction System on mount
  useEffect(() => {
    fetch('/api/intelligence/film-direction')
      .then((res) => res.json())
      .then((data) => {
        setFilmDirectionSystem(data.commonRules || null);
        setFilmDirectionSections(data.styles || null);
      })
      .catch(() => {
        setFilmDirectionSystem(null);
        setFilmDirectionSections(null);
      });
  }, []);

  // Load the default prompt from localStorage on mount
  useEffect(() => {
    const savedPrompt = localStorage.getItem('sandbox_default_prompt');
    if (savedPrompt) {
      setDefaultVideoPrompt(savedPrompt);
    }
  }, []);

  // Load sandboxes for the user
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'sandbox'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedSandboxes = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setSandboxes(loadedSandboxes);
      if (!sandboxId && loadedSandboxes.length > 0) {
        setSandboxId(loadedSandboxes[0].id);
      }
    });
    return () => unsubscribe();
  }, [user, sandboxId]);

  const handleSelectSandbox = (id: string) => {
    if (id === sandboxId) return;
    setSandboxId(id);
    setGoalText('');
    setTopicName('');
    setGeneratedScript(null);
    setAvatarImages([]);
    setSteps([]);
    setRuns([]);
    setCurrentRunId(null);
    setExpandedRunIds(new Set());
    setDefaultVideoPrompt(DEFAULT_VIDEO_PROMPT);
  };

  useEffect(() => {
    const fetchSandboxData = async () => {
      if (sandboxId && user) {
        try {
          const snap = await getDoc(doc(collection(db, 'sandbox'), sandboxId));
          if (snap.exists()) {
            const data = snap.data();
            if (data.referenceImages && Array.isArray(data.referenceImages)) {
              setAvatarImages(
                data.referenceImages.map((img: any) => ({
                  id: img.id || crypto.randomUUID(),
                  previewUrl: img.url,
                  blobUrl: img.url,
                  assignedTo: img.assignedTo ?? 'all',
                  ...(img.isBroll ? { isBroll: true } : {}),
                }))
              );
            } else if (data.referenceImage) {
              setAvatarImages([
                {
                  id: crypto.randomUUID(),
                  previewUrl: data.referenceImage,
                  blobUrl: data.referenceImage,
                  assignedTo: 'all',
                },
              ]);
            }
            if (data.config) {
              if (data.config.aspectRatio)
                setAspectRatio(data.config.aspectRatio);
              if (data.config.model) setModel(data.config.model);
              if (data.config.videoQuality)
                setVideoQuality(data.config.videoQuality);
              if (data.config.targetDuration) {
                setTargetDuration(data.config.targetDuration);
              } else if (data.config.clipCount) {
                setTargetDuration(8 + (data.config.clipCount - 1) * 7);
              } else if (data.config.videoCount) {
                setTargetDuration(8 + (data.config.videoCount - 1) * 7);
              }
              if (data.config.isExtendEnabled !== undefined) {
                setIsExtendEnabled(data.config.isExtendEnabled);
              }
            }
            if (data.goal) setGoalText(data.goal);
            if (data.topicName) setTopicName(data.topicName);
            if (data.defaultVideoPrompt)
              setDefaultVideoPrompt(data.defaultVideoPrompt);
            if (data.scripts)
              setGeneratedScript(
                data.scripts.map((s: any) => ({
                  id: s.id,
                  text: s.text,
                  ...(s.label ? { label: s.label } : {}),
                  ...(s.visualPrompt ? { visualPrompt: s.visualPrompt } : {}),
                  ...(s.variationGroup !== undefined
                    ? { variationGroup: s.variationGroup }
                    : {}),
                  ...(s.variationNote
                    ? { variationNote: s.variationNote }
                    : {}),
                  ...(s.isBroll ? { isBroll: true } : {}),
                }))
              );
            if (data.finalEditedVideo)
              setFinalEditedVideo(data.finalEditedVideo);
            setIsPosted(data.posted === true);
            if (data.imageGenCostUsd) setImageGenCostUsd(data.imageGenCostUsd);
            if (data.scriptGenCostUsd)
              setScriptGenCostUsd(data.scriptGenCostUsd);
          }
        } catch (error) {
          console.error('Failed to fetch sandbox data:', error);
        }
      }
    };
    fetchSandboxData();
  }, [sandboxId, user]);

  const loadRunsForSandbox = async (sid: string) => {
    if (!user) return [];
    try {
      const snap = await getDocs(
        query(
          collection(db, 'sandbox', sid, 'generatedVideos'),
          orderBy('createdAt', 'desc')
        )
      );
      const runDocs = snap.docs
        .filter((d) => d.id.startsWith('run_'))
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            runId: data.runId ?? d.id,
            sandboxId: data.sandboxId ?? sid,
            userId: data.userId ?? '',
            createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
            status: data.status ?? 'done',
            model: data.model ?? '',
            provider: data.provider ?? '',
            aspectRatio: data.aspectRatio ?? '',
            quality: data.quality ?? '',
            clipCount: data.clipCount ?? 0,
            scripts: data.scripts ?? [],
            steps: data.steps ?? [],
            defaultPrompt: data.defaultPrompt ?? '',
            topicName: data.topicName ?? '',
            isExtendEnabled: data.isExtendEnabled ?? true,
            stitchedVideoUrl: data.stitchedVideoUrl,
            totalCostUsd: data.totalCostUsd,
          } as RunRecord;
        });
      setRuns(runDocs);
      setExpandedRunIds((prev) =>
        prev.size === 0 && runDocs.length > 0 ? new Set([runDocs[0].id]) : prev
      );
      return runDocs;
    } catch (err) {
      console.error('Failed to load runs:', err);
      return [];
    }
  };

  useEffect(() => {
    if (sandboxId && user) {
      loadRunsForSandbox(sandboxId).then((runDocs) => {
        // If we load runs and don't have active slots, populate the active view with the latest run
        if (runDocs && runDocs.length > 0 && steps.length === 0) {
          const latestRun = runDocs[0];
          setCurrentRunId(latestRun.id);
          setSteps(latestRun.steps || []);
        }
      });
    }
  }, [sandboxId, user]);

  // Polling for the current run
  useEffect(() => {
    if (!sandboxId || !currentRunId) return;
    const interval = setInterval(async () => {
      try {
        const snap = await getDoc(
          doc(
            collection(db, 'sandbox', sandboxId, 'generatedVideos'),
            currentRunId
          )
        );
        if (snap.exists()) {
          const data = snap.data();
          if (data.steps) {
            setSteps(data.steps);
            // Check if all generating is done
            if (data.status !== 'generating') {
              setIsCreatingVideos(false);
            } else if (
              !data.steps.some((s: any) => s.status === 'generating')
            ) {
              // Client-side sequential trigger if previous is done
              const nextIdleStep = data.steps.find(
                (s: any) => s.status === 'idle'
              );
              if (nextIdleStep) {
                if (!isCreatingVideosRef.current) {
                  handleRetryStep(nextIdleStep.stepNumber);
                }
              } else {
                // All steps are done. If handleCreateVideos is still running it
                // will stitch itself — skip here to avoid racing it.
                if (!isCreatingVideosRef.current) {
                  setIsCreatingVideos(false);
                  const needsStitch =
                    data.isExtendEnabled === false &&
                    !data.stitchedVideoUrl &&
                    (data.steps as any[]).filter((s: any) => !!s.videoUrl)
                      .length > 1;

                  if (needsStitch) {
                    console.log('[Poll] All steps done, triggering stitch');
                    const videoUrls = (data.steps as any[])
                      .map((s: any) => s.videoUrl)
                      .filter((u): u is string => !!u);
                    fetch('/api/sandbox/stitch', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        videoUrls,
                        filename: `stitched_${sandboxId}_${currentRunId}.mp4`,
                      }),
                    })
                      .then(async (stitchRes) => {
                        if (stitchRes.ok) {
                          const stitchData = await stitchRes.json();
                          await setDoc(
                            doc(
                              collection(
                                db,
                                'sandbox',
                                sandboxId,
                                'generatedVideos'
                              ),
                              currentRunId
                            ),
                            {
                              stitchedVideoUrl: stitchData.videoUrl,
                              status: 'done',
                              updatedAt: serverTimestamp(),
                            },
                            { merge: true }
                          );
                          await setDoc(
                            doc(collection(db, 'sandbox'), sandboxId),
                            { status: 'done' },
                            { merge: true }
                          );
                          await loadRunsForSandbox(sandboxId);
                        } else {
                          console.error(
                            '[Poll] Stitch failed',
                            await stitchRes.text()
                          );
                        }
                      })
                      .catch((e) => console.error('[Poll] Stitch error:', e));
                  } else {
                    setDoc(
                      doc(
                        collection(db, 'sandbox', sandboxId, 'generatedVideos'),
                        currentRunId
                      ),
                      { status: 'done', updatedAt: serverTimestamp() },
                      { merge: true }
                    );
                    setDoc(
                      doc(collection(db, 'sandbox'), sandboxId),
                      { status: 'done' },
                      { merge: true }
                    );
                    loadRunsForSandbox(sandboxId);
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [sandboxId, currentRunId]);

  // Update model default when provider changes
  useEffect(() => {
    if (providerConfig.activeProvider === 'vertex') {
      if (model === 'veo-3.1-fast-generate-preview') {
        setModel('veo-3.1-fast-generate-001');
        updateConfigInDb({
          model: 'veo-3.1-fast-generate-001',
          serviceProvider: 'vertex',
        });
      }
      if (model === 'veo-3.1-generate-preview') {
        setModel('veo-3.1-generate-001');
        updateConfigInDb({
          model: 'veo-3.1-generate-001',
          serviceProvider: 'vertex',
        });
      }
    } else {
      if (model === 'veo-3.1-fast-generate-001') {
        setModel('veo-3.1-fast-generate-preview');
        updateConfigInDb({
          model: 'veo-3.1-fast-generate-preview',
          serviceProvider: 'gemini',
        });
      }
      if (model === 'veo-3.1-generate-001') {
        setModel('veo-3.1-generate-preview');
        updateConfigInDb({
          model: 'veo-3.1-generate-preview',
          serviceProvider: 'gemini',
        });
      }
    }
  }, [providerConfig.activeProvider, model]);

  const updateConfigInDb = async (
    updates: Partial<{
      clipCount: number;
      targetDuration: number;
      aspectRatio: string;
      model: string;
      videoQuality: string;
      serviceProvider: string;
      isExtendEnabled: boolean;
    }>
  ) => {
    if (!sandboxId) return;
    try {
      await setDoc(
        doc(collection(db, 'sandbox'), sandboxId),
        {
          config: updates,
        },
        { merge: true }
      );
    } catch (error) {
      console.error('Failed to update config in db:', error);
    }
  };

  const handleDeleteSandbox = async () => {
    if (!sandboxToDelete) return;
    setIsDeletingSandbox(true);
    try {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(collection(db, 'sandbox'), sandboxToDelete.id));
      if (sandboxId === sandboxToDelete.id) {
        setSandboxId(null);
        setGoalText('');
        setTopicName('');
        setGeneratedScript(null);
        setAvatarImages([]);
        setSteps([]);
        setRuns([]);
        setCurrentRunId(null);
        setExpandedRunIds(new Set());
      }
    } catch (error: any) {
      console.error('Failed to delete sandbox:', error);
      alert('Failed to delete sandbox: ' + error.message);
    } finally {
      setIsDeletingSandbox(false);
      setSandboxToDelete(null);
    }
  };

  const handleCreateSandbox = async () => {
    if (!user) return;
    setIsCreatingSandbox(true);
    try {
      const sId = `sandbox_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await setDoc(doc(collection(db, 'sandbox'), sId), {
        id: sId,
        userId: user.uid,
        status: 'draft',
        createdAt: serverTimestamp(),
      });
      setSandboxId(sId);
      setGoalText('');
      setTopicName('');
      setGeneratedScript(null);
      setAvatarImages([]);
      setSteps([]);
      setRuns([]);
      setCurrentRunId(null);
      setExpandedRunIds(new Set());
    } catch (error: any) {
      console.error('Failed to create sandbox:', error);
      alert('Failed to create sandbox instance: ' + error.message);
    } finally {
      setIsCreatingSandbox(false);
    }
  };

  const saveImagesToFirestore = useCallback(
    async (images: AvatarImageEntry[]) => {
      if (!sandboxId) return;
      await setDoc(
        doc(collection(db, 'sandbox'), sandboxId),
        {
          referenceImages: images.map((img) => ({
            id: img.id,
            url: img.blobUrl || img.previewUrl,
            assignedTo: img.assignedTo,
            ...(img.isBroll ? { isBroll: true } : {}),
          })),
        },
        { merge: true }
      );
    },
    [sandboxId]
  );

  const handleAddImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !sandboxId) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    const newEntries: AvatarImageEntry[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      assignedTo: 'all',
    }));
    const updated = [...avatarImages, ...newEntries];
    setAvatarImages(updated);

    try {
      const withBlobs = await Promise.all(
        newEntries.map(async (entry) => {
          const ext = entry.file!.name.split('.').pop() || 'png';
          const blobUrl = await uploadToVercelBlob(
            entry.file!,
            `sandbox/${sandboxId}/avatar_${entry.id}.${ext}`
          );
          return { ...entry, blobUrl };
        })
      );
      const final = updated.map((img) => {
        const uploaded = withBlobs.find((b) => b.id === img.id);
        return uploaded ?? img;
      });
      setAvatarImages(final);
      await saveImagesToFirestore(final);
    } catch (err) {
      console.error('Failed to upload image', err);
    }
  };

  const removeAvatarImage = async (id: string) => {
    const img = avatarImages.find((i) => i.id === id);
    if (img?.previewUrl && img.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(img.previewUrl);
    }
    const updated = avatarImages.filter((i) => i.id !== id);
    setAvatarImages(updated);
    await saveImagesToFirestore(updated);
  };

  const replaceAvatarImage = async (id: string, file: File) => {
    const existing = avatarImages.find((i) => i.id === id);
    if (!existing || !sandboxId) return;
    if (existing.previewUrl?.startsWith('blob:'))
      URL.revokeObjectURL(existing.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    const updated = avatarImages.map((img) =>
      img.id === id ? { ...img, file, previewUrl, blobUrl: undefined } : img
    );
    setAvatarImages(updated);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const blobUrl = await uploadToVercelBlob(
        file,
        `sandbox/${sandboxId}/avatar_${id}.${ext}`
      );
      const final = updated.map((img) =>
        img.id === id ? { ...img, blobUrl } : img
      );
      setAvatarImages(final);
      await saveImagesToFirestore(final);
    } catch (err) {
      console.error('Failed to replace image', err);
    }
  };

  const updateImageAssignment = useCallback(
    (id: string, assignedTo: 'all' | number[]) => {
      setAvatarImages((prev) => {
        const updated = prev.map((img) =>
          img.id === id ? { ...img, assignedTo } : img
        );
        if (assignmentSaveTimer.current)
          clearTimeout(assignmentSaveTimer.current);
        assignmentSaveTimer.current = setTimeout(
          () => saveImagesToFirestore(updated),
          800
        );
        return updated;
      });
    },
    [saveImagesToFirestore]
  );

  const toggleImageBroll = useCallback(
    (id: string) => {
      setAvatarImages((prev) => {
        const updated = prev.map((img) =>
          img.id === id ? { ...img, isBroll: !img.isBroll } : img
        );
        saveImagesToFirestore(updated);
        return updated;
      });
    },
    [saveImagesToFirestore]
  );

  const canCreate =
    avatarImages.length > 0 &&
    generatedScript !== null &&
    defaultVideoPrompt.trim().length > 0;

  const getEntryBase64 = async (
    entry: AvatarImageEntry
  ): Promise<{ base64: string; mimeType: string }> => {
    if (entry.file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(entry.file!);
        reader.onload = () => {
          const result = reader.result as string;
          resolve({ base64: result.split(',')[1], mimeType: entry.file!.type });
        };
        reader.onerror = reject;
      });
    }
    return fetch(entry.previewUrl)
      .then((res) => res.blob())
      .then(
        (blob) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onload = () => {
              const result = reader.result as string;
              resolve({ base64: result.split(',')[1], mimeType: blob.type });
            };
            reader.onerror = reject;
          })
      );
  };

  const getImagesBase64ForStep = async (
    stepNumber: number,
    isBroll = false
  ): Promise<{ base64: string; mimeType: string }[]> => {
    const relevant = avatarImages.filter((img) =>
      isBroll
        ? Array.isArray(img.assignedTo) && img.assignedTo.includes(stepNumber)
        : img.assignedTo === 'all' ||
          (Array.isArray(img.assignedTo) && img.assignedTo.includes(stepNumber))
    );
    if (relevant.length === 0) {
      return [];
    }
    return Promise.all(relevant.map(getEntryBase64));
  };

  const uploadToVercelBlob = async (file: Blob | File, filename: string) => {
    const res = await fetch(
      `/api/upload?filename=${encodeURIComponent(filename)}`,
      {
        method: 'POST',
        body: file,
      }
    );
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(
        `Failed to upload to blob (${res.status}): ${errBody.error ?? 'unknown'}`
      );
    }
    const data = await res.json();
    return data.url as string;
  };

  const handleGenerateImage = async () => {
    if (!imageGenPrompt.trim() || !sandboxId) return;
    console.log(
      `[ImageGen] Starting generation — prompt="${imageGenPrompt.slice(0, 80)}" sandboxId=${sandboxId}`
    );
    setIsGeneratingImage(true);
    setImageGenError(null);
    if (generatedImagePreview) {
      URL.revokeObjectURL(generatedImagePreview.objectUrl);
      setGeneratedImagePreview(null);
    }
    try {
      const res = await fetch('/api/avatar/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatar_prompt: imageGenPrompt,
          gemini_api_key: providerConfig.geminiApiKey || undefined,
          aspect_ratio: imageGenAspectRatio,
          image_size: imageGenSize,
          ...(imageGenRefImages.length > 0
            ? {
                reference_images: imageGenRefImages.map((r) => ({
                  data: r.data,
                  mime_type: r.mimeType,
                })),
              }
            : {}),
        }),
      });
      console.log(`[ImageGen] API response status=${res.status} ok=${res.ok}`);
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Image generation failed');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventCount = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log(
            `[ImageGen] SSE stream closed — total events received: ${eventCount}`
          );
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const block of events) {
          const eventMatch = block.match(/^event: (\w+)/m);
          const dataMatch = block.match(/^data: (.+)$/m);
          if (!eventMatch || !dataMatch) continue;
          const event = eventMatch[1];
          eventCount++;
          console.log(`[ImageGen] SSE event="${event}" (#${eventCount})`);
          const payload = JSON.parse(dataMatch[1]);
          if (event === 'result') {
            const {
              image_base64,
              mime_type,
              costUsd: actualCost,
              promptTokens,
              imageOutputTokens,
              textOutputTokens,
            } = payload as {
              image_base64: string;
              mime_type: string;
              costUsd?: number;
              promptTokens?: number;
              imageOutputTokens?: number;
              textOutputTokens?: number;
            };
            console.log(
              `[ImageGen] ✅ Result received — mime=${mime_type} base64Len=${image_base64?.length ?? 0} promptTokens=${promptTokens} imageOutTokens=${imageOutputTokens} textOutTokens=${textOutputTokens} costUsd=$${(actualCost ?? 0).toFixed(5)}`
            );
            const byteArr = Uint8Array.from(atob(image_base64), (c) =>
              c.charCodeAt(0)
            );
            const blob = new Blob([byteArr], { type: mime_type });
            const objectUrl = URL.createObjectURL(blob);
            setGeneratedImagePreview({
              base64: image_base64,
              mimeType: mime_type,
              objectUrl,
            });
            const thisCost = actualCost ?? 0;
            const newCost = imageGenCostUsd + thisCost;
            setImageGenCostUsd(newCost);
            console.log(
              `[ImageGen] Cost tracked — this attempt=$${thisCost.toFixed(5)} running total=$${newCost.toFixed(5)}`
            );
            await setDoc(
              doc(collection(db, 'sandbox'), sandboxId),
              { imageGenCostUsd: increment(thisCost) },
              { merge: true }
            );
            console.log(`[ImageGen] Firestore imageGenCostUsd incremented`);
          } else if (event === 'error') {
            console.error(`[ImageGen] ❌ Server error event:`, payload);
            throw new Error(payload.error ?? 'Image generation failed');
          } else {
            console.log(`[ImageGen] Skipping event="${event}"`);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ImageGen] ❌ Failed:`, msg);
      setImageGenError(msg);
    } finally {
      setIsGeneratingImage(false);
      console.log(`[ImageGen] Generation complete`);
    }
  };

  const handleUseGeneratedImage = async () => {
    if (!generatedImagePreview || !sandboxId) return;
    const { mimeType, objectUrl } = generatedImagePreview;
    const ext = mimeType.split('/')[1] || 'png';
    const id = crypto.randomUUID();
    console.log(`[ImageGen] Adding to references — id=${id} mime=${mimeType}`);
    const entry: AvatarImageEntry = {
      id,
      previewUrl: objectUrl,
      assignedTo: 'all',
    };
    const updated = [...avatarImages, entry];
    setAvatarImages(updated);
    setGeneratedImagePreview(null);
    setShowImageGen(false);
    try {
      const byteArr = Uint8Array.from(atob(generatedImagePreview.base64), (c) =>
        c.charCodeAt(0)
      );
      const blob = new Blob([byteArr], { type: mimeType });
      const blobUrl = await uploadToVercelBlob(
        blob,
        `sandbox/${sandboxId}/avatar_${id}.${ext}`
      );
      console.log(`[ImageGen] ✅ Uploaded to Vercel Blob — url=${blobUrl}`);
      const withUrl = updated.map((img) =>
        img.id === id ? { ...img, blobUrl } : img
      );
      setAvatarImages(withUrl);
      await saveImagesToFirestore(withUrl);
      console.log(`[ImageGen] Firestore reference images updated`);
    } catch (err) {
      console.error(
        '[ImageGen] ❌ Failed to upload generated image to blob:',
        err
      );
    }
  };

  const handleMarkPosted = async () => {
    if (!sandboxId) return;
    setIsMarkingPosted(true);
    try {
      await setDoc(
        doc(collection(db, 'sandbox'), sandboxId),
        { posted: true, postedAt: serverTimestamp() },
        { merge: true }
      );
      setIsPosted(true);
    } catch (err) {
      console.error('Failed to mark as posted', err);
      alert(
        'Failed to mark as posted: ' +
          (err instanceof Error ? err.message : 'unknown error')
      );
    } finally {
      setIsMarkingPosted(false);
    }
  };

  const handleUploadFinalVideo = async (file: File) => {
    if (!sandboxId) return;
    setIsUploadingFinalVideo(true);
    try {
      const url = await uploadToVercelBlob(
        file,
        `sandbox/${sandboxId}/final_edited/${file.name}`
      );
      setFinalEditedVideo(url);
      await setDoc(
        doc(collection(db, 'sandbox'), sandboxId),
        { finalEditedVideo: url, finalEditedVideoUpdatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (err) {
      console.error('Failed to upload final video', err);
      alert(
        'Upload failed: ' +
          (err instanceof Error ? err.message : 'unknown error')
      );
    } finally {
      setIsUploadingFinalVideo(false);
    }
  };

  // Helper to run a step
  const runStep = async (
    stepNumber: number,
    runId: string,
    currentSteps: StepSlot[],
    useExtendAPI: boolean
  ) => {
    if (!sandboxId) return currentSteps;

    const providerStr = providerConfig.activeProvider;
    // We treat it as an initial generation if it's step 1 OR if extend is disabled
    const isInitialGeneration = stepNumber === 1 || !useExtendAPI;

    // Read fresh script values before building the step update
    const scriptItem = generatedScript?.[stepNumber - 1];
    const scriptText = scriptItem?.text?.trim() || '';
    const clipVisualPrompt = scriptItem?.visualPrompt?.trim() || '';
    const isBroll = scriptItem?.isBroll === true;

    // Update local state and firestore to generating, syncing latest dialogue/prompt
    const generatingSteps = currentSteps.map((s) => {
      const step = { ...s };
      if (step.stepNumber === stepNumber) {
        step.status = 'generating' as const;
        if (scriptText) step.dialogue = scriptText;
        if (clipVisualPrompt) step.visualPrompt = clipVisualPrompt;
        else delete (step as any).visualPrompt;
        delete step.errorMsg; // remove instead of setting to undefined
      }
      return step;
    });
    setSteps(generatingSteps);
    await setDoc(
      doc(collection(db, 'sandbox', sandboxId, 'generatedVideos'), runId),
      {
        steps: generatingSteps,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    try {
      const BROLL_NO_FACES =
        'No human faces. No people. No human subjects. No bodies. No skin. Strictly B-roll footage only — environmental, product, or abstract visuals only.';
      const finalPrompt = isBroll
        ? [BROLL_NO_FACES, defaultVideoPrompt, clipVisualPrompt]
            .filter(Boolean)
            .join('\n\n')
        : [defaultVideoPrompt, clipVisualPrompt, scriptText]
            .filter(Boolean)
            .join('\n\n');
      let finalBlobUrl = '';
      let stepRefUrl = undefined;

      if (isInitialGeneration) {
        const imgDataArr = await getImagesBase64ForStep(stepNumber, isBroll);
        const hasImages = imgDataArr.length > 0;

        const endpoint = hasImages
          ? providerStr === 'vertex'
            ? '/api/script/generate-video/vertex/image-refs'
            : '/api/script/generate-video/image-refs'
          : providerStr === 'vertex'
            ? '/api/script/generate-video/vertex/text'
            : '/api/script/generate-video/text';

        console.log(
          `[Sandbox] Step ${stepNumber}: Calling ${hasImages ? 'Image-Refs' : 'Text'} API (${endpoint}) [${isBroll ? 'B-roll' : 'A-roll'}]`
        );

        const payload = hasImages
          ? {
              defaultPrompt: defaultVideoPrompt,
              ...(scriptText ? { clipDialogue: scriptText } : {}),
              prompt: finalPrompt,
              modelName: model,
              aspectRatio,
              resolution: videoQuality,
              referenceImages: imgDataArr.map((d) => ({
                data: d.base64,
                mime_type: d.mimeType,
              })),
              sandboxId,
              runId,
              stepNumber,
              isBroll,
              apiKey: providerConfig.geminiApiKey,
              ...(providerStr === 'vertex' && {
                vertexKey: providerConfig.vertexCredentials.serviceAccountKey,
                vertexLocation: providerConfig.vertexCredentials.region,
              }),
            }
          : {
              defaultPrompt: defaultVideoPrompt,
              ...(scriptText ? { clipDialogue: scriptText } : {}),
              prompt: finalPrompt,
              modelName: model,
              aspectRatio,
              resolution: videoQuality,
              sandboxId,
              runId,
              stepNumber,
              isBroll,
              apiKey: providerConfig.geminiApiKey,
              ...(providerStr === 'vertex' && {
                vertexKey: providerConfig.vertexCredentials.serviceAccountKey,
                vertexLocation: providerConfig.vertexCredentials.region,
              }),
            };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          let errMsg = errData.error || `HTTP error! status: ${res.status}`;

          // Try to parse ugly Vertex AI JSON error strings
          try {
            if (
              typeof errMsg === 'string' &&
              errMsg.includes('Vertex AI operation error:')
            ) {
              const jsonStr = errMsg
                .replace('Vertex AI operation error:', '')
                .trim();
              const parsed = JSON.parse(jsonStr);
              if (parsed && parsed.message) {
                errMsg = parsed.message;
              }
            }
          } catch {
            // ignore parse errors
          }

          throw new Error(errMsg);
        }

        const data = await res.json();
        finalBlobUrl = data.video_url || data.videoUrl;
        if (data.video_reference_url || data.videoReferenceUrl) {
          stepRefUrl = data.video_reference_url;
        }
      } else {
        // Step 2..N
        const prevStep = currentSteps.find(
          (s) => s.stepNumber === stepNumber - 1
        );
        if (!prevStep || (!prevStep.videoReferenceUrl && !prevStep.videoUrl)) {
          throw new Error('Missing previous step video reference');
        }

        const endpoint =
          providerStr === 'vertex'
            ? '/api/script/extend-video/vertex'
            : '/api/script/extend-video/gemini';

        console.log(
          `[Sandbox] Step ${stepNumber}: Calling Extend API (${endpoint})`
        );

        const payload = {
          prompt: finalPrompt,
          modelName: model,
          aspectRatio,
          resolution: videoQuality,
          videoReferenceUrl: prevStep.videoReferenceUrl || null,
          sandboxId,
          runId,
          stepNumber,
          apiKey: providerConfig.geminiApiKey,
          ...(providerStr === 'vertex' && {
            vertexKey: providerConfig.vertexCredentials.serviceAccountKey,
            vertexLocation: providerConfig.vertexCredentials.region,
          }),
        };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          let errMsg = errData.error || `HTTP error! status: ${res.status}`;

          // Try to parse ugly Vertex AI JSON error strings
          try {
            if (
              typeof errMsg === 'string' &&
              errMsg.includes('Vertex AI operation error:')
            ) {
              const jsonStr = errMsg
                .replace('Vertex AI operation error:', '')
                .trim();
              const parsed = JSON.parse(jsonStr);
              if (parsed && parsed.message) {
                errMsg = parsed.message;
              }
            }
          } catch {
            // ignore parse errors
          }

          throw new Error(errMsg);
        }

        const data = await res.json();
        finalBlobUrl = data.video_url || data.videoUrl;
        if (data.video_reference_url || data.videoReferenceUrl) {
          stepRefUrl = data.video_reference_url || data.videoReferenceUrl;
        }
      }

      const dur = 8 + (stepNumber - 1) * 7;
      const doneSteps = generatingSteps.map((s) => {
        if (s.stepNumber === stepNumber) {
          let newVersions = s.videoVersions || [];

          // Migrate old URL if it exists but no versions are tracked yet
          if (
            newVersions.length === 0 &&
            s.videoUrl &&
            s.videoUrl !== finalBlobUrl
          ) {
            newVersions = [{ version: '_1', url: s.videoUrl }];
          }

          const newVersionString = `_${newVersions.length + 1}`;
          newVersions = [
            ...newVersions,
            { version: newVersionString, url: finalBlobUrl },
          ];

          const costUsd = clipCostValue(model, 8, videoQuality);
          return {
            ...s,
            status: 'done' as const,
            videoUrl: finalBlobUrl,
            videoReferenceUrl: stepRefUrl,
            completedAt: Date.now(),
            cumulativeDuration: dur,
            videoVersions: newVersions,
            activeVersionIndex: newVersions.length - 1,
            ...(costUsd !== null ? { costUsd } : {}),
          };
        }
        return s;
      });

      setSteps(doneSteps);

      // Persist done step and accumulate cost — runs on every completion including retries
      const stepCost = doneSteps.find(
        (s) => s.stepNumber === stepNumber
      )?.costUsd;
      await setDoc(
        doc(collection(db, 'sandbox', sandboxId, 'generatedVideos'), runId),
        {
          steps: doneSteps,
          updatedAt: serverTimestamp(),
          ...(stepCost ? { totalCostUsd: increment(stepCost) } : {}),
        },
        { merge: true }
      );

      return doneSteps;
    } catch (error: any) {
      console.warn(`Error in step ${stepNumber}:`, error.message);
      const errorSteps = generatingSteps.map((s) =>
        s.stepNumber === stepNumber
          ? { ...s, status: 'error' as const, errorMsg: error.message }
          : s
      );
      setSteps(errorSteps);

      const cleanErrorSteps = errorSteps.map((step) => {
        const cleanStep = { ...step };
        Object.keys(cleanStep).forEach((key) => {
          if ((cleanStep as any)[key] === undefined) {
            delete (cleanStep as any)[key];
          }
        });
        return cleanStep;
      });

      await setDoc(
        doc(collection(db, 'sandbox', sandboxId, 'generatedVideos'), runId),
        {
          steps: cleanErrorSteps,
          status: 'error',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      return errorSteps;
    }
  };

  const handleCreateVideos = async () => {
    if (avatarImages.length === 0 || !generatedScript || !user || !sandboxId)
      return;
    setIsCreatingVideos(true);

    try {
      const providerStr = providerConfig.activeProvider;

      await setDoc(
        doc(collection(db, 'sandbox'), sandboxId),
        {
          status: 'generating',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const numberOfVideos =
        generatedScript && generatedScript.length > 0
          ? generatedScript.length
          : clipCount;
      const initialSteps: StepSlot[] = Array.from({
        length: numberOfVideos,
      }).map((_, i) => ({
        stepNumber: i + 1,
        label: generatedScript?.[i]?.label,
        dialogue: generatedScript?.[i]?.text || '',
        visualPrompt: generatedScript?.[i]?.visualPrompt || undefined,
        status: 'idle',
      }));
      setSteps(initialSteps);

      // Determine sequential run number
      const existingSnap = await getDocs(
        collection(db, 'sandbox', sandboxId, 'generatedVideos')
      );
      const runNumber =
        existingSnap.docs.filter((d) => d.id.startsWith('run_')).length + 1;
      const runId = `run_${runNumber}`;
      const runDocRef = doc(
        collection(db, 'sandbox', sandboxId, 'generatedVideos'),
        runId
      );
      setCurrentRunId(runId);
      setExpandedRunIds(new Set([runId]));

      await setDoc(runDocRef, {
        runId,
        sandboxId,
        userId: user.uid,
        status: 'generating',
        model,
        provider: providerStr,
        aspectRatio,
        quality: videoQuality,
        clipCount: numberOfVideos,
        scripts: generatedScript ?? [],
        steps: initialSteps,
        defaultPrompt: defaultVideoPrompt,
        topicName,
        isExtendEnabled,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      let currentStepsState = initialSteps;
      for (let i = 1; i <= numberOfVideos; i++) {
        currentStepsState = await runStep(
          i,
          runId,
          currentStepsState,
          isExtendEnabled
        );
      }

      // Stitch clips into final video(s)
      let stitchedVideoUrl: string | undefined = undefined;
      let stitchedVideoUrls: Record<string, string> | undefined = undefined;
      if (!isExtendEnabled && numberOfVideos > 1) {
        try {
          const allUrls = currentStepsState
            .map((s) => s.videoUrl)
            .filter((url): url is string => !!url);

          if (allUrls.length === numberOfVideos) {
            const variantMap = buildVariantUrlMap(currentStepsState);
            if (variantMap) {
              // Variation run: stitch one final per variant letter
              stitchedVideoUrls = {};
              for (const [letter, urls] of Object.entries(variantMap)) {
                if (urls.length < 2) continue;
                console.log(
                  `[Stitch:auto] Stitching Final ${letter} (${urls.length} clips)…`
                );
                const res = await fetch('/api/sandbox/stitch', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    videoUrls: urls,
                    filename: `stitched_${sandboxId}_${runId}_${letter}.mp4`,
                  }),
                });
                if (res.ok) {
                  const data = await res.json();
                  stitchedVideoUrls[letter] = data.videoUrl;
                  console.log(
                    `[Stitch:auto] Final ${letter} done:`,
                    data.videoUrl
                  );
                } else {
                  console.error(
                    `[Stitch:auto] Final ${letter} failed:`,
                    res.status
                  );
                }
              }
            } else {
              // No variations: single stitch
              console.log(
                `[Stitch:auto] Stitching single final (${allUrls.length} clips)…`
              );
              const stitchRes = await fetch('/api/sandbox/stitch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  videoUrls: allUrls,
                  filename: `stitched_${sandboxId}_${runId}.mp4`,
                }),
              });
              if (stitchRes.ok) {
                const stitchData = await stitchRes.json();
                stitchedVideoUrl = stitchData.videoUrl;
                console.log('[Stitch:auto] DONE —', stitchedVideoUrl);
              } else {
                console.error(`[Stitch:auto] API error ${stitchRes.status}`);
              }
            }
          } else {
            console.warn(
              `[Stitch:auto] Skipped — only ${allUrls.length} of ${numberOfVideos} clip URLs available`
            );
          }
        } catch (e) {
          console.error('[Stitch:auto] Exception during stitching:', e);
        }
      }

      await setDoc(
        runDocRef,
        {
          status: 'done',
          updatedAt: serverTimestamp(),
          ...(stitchedVideoUrl ? { stitchedVideoUrl } : {}),
          ...(stitchedVideoUrls ? { stitchedVideoUrls } : {}),
        },
        { merge: true }
      );
      await setDoc(
        doc(collection(db, 'sandbox'), sandboxId),
        { status: 'done' },
        { merge: true }
      );
      await loadRunsForSandbox(sandboxId);
    } catch (error: any) {
      console.error('Failed to create videos:', error);
      alert('Failed to initialize sandbox: ' + error.message);
    } finally {
      setIsCreatingVideos(false);
    }
  };

  const handleStopGenerating = () => {
    isCreatingVideosRef.current = false;
    setIsCreatingVideos(false);
    const next = steps.map((s) => {
      if (s.status !== 'generating') return s;
      return s.videoUrl
        ? { ...s, status: 'done' as const }
        : { ...s, status: 'idle' as const };
    });
    setSteps(next);
    // Persist to Firestore so the polling loop doesn't restore 'generating'
    if (sandboxId && currentRunId) {
      setDoc(
        doc(
          collection(db, 'sandbox', sandboxId, 'generatedVideos'),
          currentRunId
        ),
        { steps: next, updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(() => {});
    }
  };

  const handleRetryStep = async (stepNumber: number) => {
    if (!currentRunId || !sandboxId) return;
    setIsCreatingVideos(true);
    let currentStepsState = steps;

    // We only retry this step, and if it succeeds we should ideally continue the chain.
    const numberOfVideos =
      generatedScript && generatedScript.length > 0
        ? generatedScript.length
        : clipCount;

    // Get current run to check if extend is enabled
    let useExtendAPI = true;
    const runDoc = await getDoc(
      doc(collection(db, 'sandbox', sandboxId, 'generatedVideos'), currentRunId)
    );
    const runData = runDoc.data();
    useExtendAPI = runData?.isExtendEnabled ?? true;

    if (!useExtendAPI) {
      // Regenerate just this step
      currentStepsState = await runStep(
        stepNumber,
        currentRunId,
        currentStepsState,
        false
      );
      const justFinished = currentStepsState.find(
        (s) => s.stepNumber === stepNumber
      );

      if (justFinished?.status !== 'error') {
        // Restitch videos
        try {
          const allUrls = currentStepsState
            .map((s) => s.videoUrl)
            .filter((url): url is string => !!url);

          if (allUrls.length === numberOfVideos) {
            const variantMap = buildVariantUrlMap(currentStepsState);
            if (variantMap) {
              const stitchedVideoUrls: Record<string, string> = {};
              for (const [letter, urls] of Object.entries(variantMap)) {
                if (urls.length < 2) continue;
                const res = await fetch('/api/sandbox/stitch', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    videoUrls: urls,
                    filename: `stitched_${sandboxId}_${currentRunId}_${letter}.mp4`,
                  }),
                });
                if (res.ok) {
                  const data = await res.json();
                  stitchedVideoUrls[letter] = data.videoUrl;
                }
              }
              await setDoc(
                doc(
                  collection(db, 'sandbox', sandboxId, 'generatedVideos'),
                  currentRunId
                ),
                { stitchedVideoUrls },
                { merge: true }
              );
            } else {
              const stitchRes = await fetch('/api/sandbox/stitch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  videoUrls: allUrls,
                  filename: `stitched_${sandboxId}_${currentRunId}.mp4`,
                }),
              });
              if (stitchRes.ok) {
                const stitchData = await stitchRes.json();
                await setDoc(
                  doc(
                    collection(db, 'sandbox', sandboxId, 'generatedVideos'),
                    currentRunId
                  ),
                  { stitchedVideoUrl: stitchData.videoUrl },
                  { merge: true }
                );
              }
            }
          }
        } catch (e) {
          console.error('Error during stitching:', e);
        }
      }
    } else {
      // Chain regenerate
      for (let i = stepNumber; i <= numberOfVideos; i++) {
        currentStepsState = await runStep(
          i,
          currentRunId,
          currentStepsState,
          useExtendAPI
        );
        const justFinished = currentStepsState.find((s) => s.stepNumber === i);
        if (justFinished?.status === 'error') {
          break;
        }
      }
    }

    setIsCreatingVideos(false);
    // Refresh runs so the cost banner reflects the newly incremented totalCostUsd
    if (sandboxId) await loadRunsForSandbox(sandboxId);
  };

  const handleChangeStepVersion = async (
    stepNumber: number,
    runId: string,
    newIndex: number
  ) => {
    if (!sandboxId) return;

    const run = runs.find((r) => r.id === runId);
    let targetSteps = run ? run.steps : steps;

    targetSteps = targetSteps.map((s) => {
      if (
        s.stepNumber === stepNumber &&
        s.videoVersions &&
        s.videoVersions[newIndex]
      ) {
        return {
          ...s,
          videoUrl: s.videoVersions[newIndex].url,
          activeVersionIndex: newIndex,
        };
      }
      return s;
    });

    if (runId === currentRunId) {
      setSteps(targetSteps);
    }

    // Update run history state
    setRuns((prev) =>
      prev.map((r) => {
        if (r.id === runId) {
          return { ...r, steps: targetSteps };
        }
        return r;
      })
    );

    // Find the run steps to stitch
    const targetRun = { steps: targetSteps };

    // Restitch with new configuration
    try {
      const videoUrls = targetRun.steps
        .map((s) => s.videoUrl)
        .filter((url): url is string => !!url);

      let stitchedVideoUrl = undefined;
      // Re-stitch if not using extend and we have more than 1 part
      if ((!run || run.isExtendEnabled === false) && videoUrls.length > 1) {
        const stitchRes = await fetch('/api/sandbox/stitch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoUrls,
            filename: `stitched_${sandboxId}_${runId}.mp4`,
          }),
        });
        if (stitchRes.ok) {
          const stitchData = await stitchRes.json();
          stitchedVideoUrl = stitchData.videoUrl;
        }
      }

      // Important: Add cache-busting timestamp to the final render video locally so it re-renders
      if (stitchedVideoUrl) {
        stitchedVideoUrl = stitchedVideoUrl.split('?')[0] + `?t=${Date.now()}`;
      }

      // Update DB with the new steps selection and new stitch
      await setDoc(
        doc(collection(db, 'sandbox', sandboxId, 'generatedVideos'), runId),
        {
          steps: targetRun.steps,
          ...(stitchedVideoUrl !== undefined ? { stitchedVideoUrl } : {}),
        },
        { merge: true }
      );

      // Refresh local runs state
      setRuns((prev) =>
        prev.map((r) => {
          if (r.id === runId) {
            return {
              ...r,
              ...(stitchedVideoUrl !== undefined ? { stitchedVideoUrl } : {}),
            };
          }
          return r;
        })
      );
    } catch (e) {
      console.error('Error restitching history version change', e);
    }
  };

  const handleRegeneratePrompt = async () => {
    if (!filmDirectionSystem || avatarImages.length === 0) return;
    setIsRegeneratingPrompt(true);

    try {
      const imgDataArr = await getImagesBase64ForStep(1);
      const existingDialogues = generatedScript?.map((s) => s.text) || [];
      const selectionContext = {
        goalText: goalText.trim(),
        aspectRatio,
        hasHumanSubject: avatarImages.length > 0,
        isUGC: true,
      };

      const response = await fetch('/api/sandbox/generate-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalText: goalText.trim(),
          clipCount,
          commonRules: filmDirectionSystem,
          avatarImageBase64: imgDataArr[0]?.base64,
          mode: 'common',
          existingDialogues,
          styles: filmDirectionSections,
          selectionContext,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.videoPrompt) {
        setDefaultVideoPrompt(data.videoPrompt);
        setIsAiGeneratedPrompt(true);
        localStorage.setItem('sandbox_default_prompt', data.videoPrompt);
        if (sandboxId) {
          const scriptCost =
            typeof data.scriptCostUsd === 'number' ? data.scriptCostUsd : 0;
          await setDoc(
            doc(collection(db, 'sandbox'), sandboxId),
            {
              defaultVideoPrompt: data.videoPrompt,
              ...(scriptCost > 0
                ? { scriptGenCostUsd: increment(scriptCost) }
                : {}),
            },
            { merge: true }
          );
          if (scriptCost > 0) {
            setScriptGenCostUsd((prev) => prev + scriptCost);
          }
        }
      }
    } catch (error) {
      console.error('Failed to regenerate prompt:', error);
      alert(
        'Failed to regenerate prompt: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      );
    } finally {
      setIsRegeneratingPrompt(false);
    }
  };

  const handleGenerateScript = async () => {
    if (!goalText.trim()) return;
    setIsGeneratingScript(true);

    try {
      // Build per-clip image map: for each clip 1..clipCount, which images are assigned?
      let clipImageMap: {
        clipId: number;
        images: { id: string; base64: string; mimeType: string }[];
      }[] = [];
      let allImagesBase64: { id: string; base64: string }[] = [];

      if (avatarImages.length > 0) {
        try {
          const imgDataArr = await Promise.all(
            avatarImages.map(getEntryBase64)
          );
          allImagesBase64 = avatarImages.map((img, i) => ({
            id: img.id,
            base64: imgDataArr[i].base64,
          }));

          clipImageMap = Array.from({ length: clipCount }, (_, i) => {
            const clipId = i + 1;
            const relevant = avatarImages.filter(
              (img) =>
                img.assignedTo === 'all' ||
                (Array.isArray(img.assignedTo) &&
                  img.assignedTo.includes(clipId))
            );
            return {
              clipId,
              images: relevant.map((img) => {
                const data = imgDataArr[avatarImages.indexOf(img)];
                return {
                  id: img.id,
                  base64: data.base64,
                  mimeType: data.mimeType,
                  isBroll: img.isBroll ?? false,
                };
              }),
            };
          });
        } catch (e) {
          console.warn('Could not get image base64 for script generation', e);
        }
      }

      const payload: any = {
        goalText: goalText.trim(),
        clipCount,
      };

      if (filmDirectionSystem && allImagesBase64.length > 0) {
        payload.commonRules = filmDirectionSystem;
        payload.avatarImages = allImagesBase64;
        payload.avatarImageBase64 = allImagesBase64[0]?.base64;
        payload.clipImageMap = clipImageMap;
        payload.styles = filmDirectionSections;
        payload.selectionContext = {
          goalText: goalText.trim(),
          aspectRatio,
          hasHumanSubject: avatarImages.length > 0,
          isUGC: true,
        };
      }

      const response = await fetch('/api/sandbox/generate-scripts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData.error || `HTTP error! status: ${response.status}`
        );
      }

      const data = await response.json();
      if (
        (data.clips && Array.isArray(data.clips)) ||
        (data.dialogues && Array.isArray(data.dialogues))
      ) {
        let newScripts: ScriptItem[];

        if (data.clips && Array.isArray(data.clips)) {
          newScripts = (
            data.clips as {
              clipLabel: string;
              dialogue: string;
              clipPrompt?: string;
              variationGroup?: number;
              variationNote?: string;
              isBroll?: boolean;
            }[]
          ).map((clip, idx) => ({
            id: idx + 1,
            label: clip.clipLabel,
            text: clip.dialogue,
            ...(clip.clipPrompt ? { visualPrompt: clip.clipPrompt } : {}),
            ...(clip.variationGroup !== undefined
              ? { variationGroup: clip.variationGroup }
              : {}),
            ...(clip.variationNote
              ? { variationNote: clip.variationNote }
              : {}),
            ...(clip.isBroll ? { isBroll: true } : {}),
          }));
        } else {
          // Legacy path: dialogues[] + clipPrompts[]
          const clipPromptsMap: Record<number, string> = {};
          if (data.clipPrompts && Array.isArray(data.clipPrompts)) {
            for (const cp of data.clipPrompts as {
              clipId: number;
              prompt: string;
            }[]) {
              if (cp.prompt) clipPromptsMap[cp.clipId] = cp.prompt;
            }
          }
          newScripts = (data.dialogues as string[]).map((text, idx) => ({
            id: idx + 1,
            text,
            ...(clipPromptsMap[idx + 1]
              ? { visualPrompt: clipPromptsMap[idx + 1] }
              : {}),
          }));
        }
        setGeneratedScript(newScripts);
        if (data.topicName) {
          setTopicName(data.topicName);
        }
        if (data.videoPrompt) {
          setDefaultVideoPrompt(data.videoPrompt);
          setIsAiGeneratedPrompt(true);
          localStorage.setItem('sandbox_default_prompt', data.videoPrompt);
        }

        if (sandboxId) {
          const scriptCost =
            typeof data.scriptCostUsd === 'number' ? data.scriptCostUsd : 0;
          await setDoc(
            doc(collection(db, 'sandbox'), sandboxId),
            {
              goal: goalText.trim(),
              scripts: newScripts,
              ...(data.topicName ? { topicName: data.topicName } : {}),
              ...(data.videoPrompt
                ? { defaultVideoPrompt: data.videoPrompt }
                : {}),
              ...(scriptCost > 0
                ? { scriptGenCostUsd: increment(scriptCost) }
                : {}),
            },
            { merge: true }
          );
          if (scriptCost > 0) {
            setScriptGenCostUsd((prev) => prev + scriptCost);
            console.log(
              `[ScriptGen] Cost tracked — this call=$${scriptCost.toFixed(6)} running total=$${(scriptGenCostUsd + scriptCost).toFixed(6)}`
            );
          }
        }
      } else {
        throw new Error(
          'Invalid response format from generate-scripts endpoint'
        );
      }
    } catch (error) {
      console.error('Failed to generate script:', error);
      alert(
        'Failed to generate script: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      );
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleRemoveClip = (clipId: number) => {
    if (!generatedScript || generatedScript.length <= 1) return;
    const filtered = generatedScript.filter((s) => s.id !== clipId);
    // Re-sequence IDs 1..N
    const resequenced = filtered.map((s, i) => ({ ...s, id: i + 1 }));
    setGeneratedScript(resequenced);

    // Remap image assignments: remove clipId, shift IDs above it down by 1
    const remappedImages = avatarImages.map((img) => {
      if (img.assignedTo === 'all') return img;
      const next = (img.assignedTo as number[])
        .filter((n) => n !== clipId)
        .map((n) => (n > clipId ? n - 1 : n));
      return { ...img, assignedTo: next.length > 0 ? next : ('all' as const) };
    });
    setAvatarImages(remappedImages);

    // Update duration to match new clip count
    const newCount = resequenced.length;
    const newDuration = 8 + (newCount - 1) * 7;
    setTargetDuration(newDuration);

    if (sandboxId) {
      setDoc(
        doc(collection(db, 'sandbox'), sandboxId),
        {
          scripts: resequenced,
          config: { clipCount: newCount, targetDuration: newDuration },
        },
        { merge: true }
      );
      saveImagesToFirestore(remappedImages);
    }
  };

  const handleRegenerateClipPrompt = async (clipIndex: number) => {
    if (!filmDirectionSystem || !generatedScript) return;
    setRegeneratingClipPromptIndex(clipIndex);

    try {
      const script = generatedScript[clipIndex];
      const clipId = script.id;

      const isClipBroll = script.isBroll === true;
      const imgsForClip = avatarImages.filter((img) =>
        isClipBroll
          ? Array.isArray(img.assignedTo) && img.assignedTo.includes(clipId)
          : img.assignedTo === 'all' ||
            (Array.isArray(img.assignedTo) && img.assignedTo.includes(clipId))
      );

      const clipImagesBase64 = await Promise.all(
        imgsForClip.map(async (img) => {
          const { base64, mimeType } = await getEntryBase64(img);
          return { id: img.id, base64, mimeType };
        })
      );

      const selectionContext = {
        goalText: goalText.trim(),
        aspectRatio,
        hasHumanSubject: avatarImages.length > 0,
        isUGC: true,
      };

      const response = await fetch('/api/sandbox/generate-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'clip',
          targetClipId: clipId,
          avatarImages: clipImagesBase64,
          clipDialogue: script.text,
          goalText: goalText.trim(),
          commonRules: filmDirectionSystem,
          commonVideoPrompt: defaultVideoPrompt,
          isBroll: isClipBroll,
          styles: filmDirectionSections,
          selectionContext,
        }),
      });

      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      if (data.clipPrompt !== undefined) {
        const updated = generatedScript.map((s, i) =>
          i === clipIndex
            ? { ...s, visualPrompt: data.clipPrompt || undefined }
            : s
        );
        setGeneratedScript(updated);
        if (clipPromptSaveTimer.current)
          clearTimeout(clipPromptSaveTimer.current);
        clipPromptSaveTimer.current = setTimeout(() => {
          if (sandboxId) {
            setDoc(
              doc(collection(db, 'sandbox'), sandboxId),
              { scripts: updated },
              { merge: true }
            );
          }
        }, 800);
      }
    } catch (error) {
      console.error('Failed to regenerate clip prompt:', error);
    } finally {
      setRegeneratingClipPromptIndex(null);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <div className="flex-1 overflow-hidden flex relative">
        {/* Sidebar */}
        <div
          className={cn(
            'border-r border-border flex flex-col bg-slate-50/30 shrink-0 transition-all duration-300 ease-in-out',
            isSidebarOpen
              ? 'w-64 opacity-100'
              : 'w-0 opacity-0 overflow-hidden border-r-0'
          )}
        >
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Button
              onClick={handleCreateSandbox}
              disabled={isCreatingSandbox}
              className="flex-1 gap-2"
            >
              <Sparkles className="w-4 h-4" />
              New
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSidebarOpen(false)}
              className="shrink-0 text-slate-500 hover:text-slate-700"
              title="Close Sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sandboxes.map((sandbox) => (
              <div
                key={sandbox.id}
                className={cn(
                  'group flex items-center gap-1 rounded-md transition-colors text-sm',
                  sandbox.id === sandboxId
                    ? 'bg-violet-100 text-violet-900'
                    : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                <button
                  onClick={() => handleSelectSandbox(sandbox.id)}
                  className="flex-1 min-w-0 text-left px-3 py-2"
                >
                  <div className="truncate font-medium">
                    {sandbox.topicName || 'New Sandbox'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {timeAgo(sandbox.createdAt?.toMillis?.() || Date.now())}
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSandboxToDelete({
                      id: sandbox.id,
                      name: sandbox.topicName || 'New Sandbox',
                    });
                  }}
                  className="opacity-0 group-hover:opacity-100 shrink-0 p-1.5 mr-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                  title="Delete sandbox"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {sandboxes.length === 0 && (
              <div className="p-4 text-center text-sm text-slate-500 whitespace-nowrap">
                No sandboxes yet.
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-background relative z-10">
          <div className="p-6 pb-4 flex-shrink-0 border-b border-border flex gap-4 items-center">
            {!isSidebarOpen && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsSidebarOpen(true)}
                className="shrink-0"
                title="Open Sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </Button>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Sandbox</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Manual testing ground for the automated avatar video pipeline.
              </p>
              {filmDirectionSystem === null && (
                <p className="text-amber-600 mt-1 text-xs flex items-center gap-1 bg-amber-50 inline-flex px-2 py-0.5 rounded-md border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  Film direction system unavailable — video prompt will not be
                  auto-generated
                </p>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-border">
            {!sandboxId ? (
              <div className="col-span-1 lg:col-span-2 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 h-full">
                <div className="w-16 h-16 bg-violet-100 rounded-full flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-violet-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">
                  Start a New Sandbox
                </h2>
                <p className="text-slate-500 mb-6 max-w-md">
                  Create a new sandbox instance to experiment with video
                  generation. All scripts, images, and settings will be
                  automatically saved to this instance.
                </p>
                <Button
                  onClick={handleCreateSandbox}
                  disabled={isCreatingSandbox}
                  className="bg-violet-600 hover:bg-violet-700 text-white gap-2 px-8 py-6 rounded-xl text-lg font-medium shadow-md transition-all hover:shadow-lg"
                >
                  {isCreatingSandbox ? (
                    <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <Play className="w-5 h-5 fill-current" />
                  )}
                  {isCreatingSandbox
                    ? 'Creating...'
                    : 'Create Sandbox Instance'}
                </Button>
              </div>
            ) : (
              <>
                {/* Left Column: Controls */}
                <div className="h-full min-h-0 overflow-y-auto p-6 bg-slate-50/50 flex flex-col gap-6">
                  {/* Goal & Duration */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col shrink-0">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-violet-500" />
                        <h2 className="font-semibold text-slate-800">
                          Goal & Duration
                        </h2>
                      </div>
                    </div>
                    <div className="p-4 flex flex-col gap-5">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium text-slate-700">
                            Target Duration
                          </Label>
                          <span className="text-sm font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                            {targetDuration}s
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <input
                            type="range"
                            min="8"
                            max="71"
                            step="7"
                            value={targetDuration}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              const newCount = 1 + Math.floor((val - 8) / 7);
                              setTargetDuration(val);
                              updateConfigInDb({
                                clipCount: newCount,
                                targetDuration: val,
                              });
                              // Add empty clips if script exists and slider increased
                              if (
                                generatedScript &&
                                newCount > generatedScript.length
                              ) {
                                const extra: ScriptItem[] = Array.from(
                                  { length: newCount - generatedScript.length },
                                  (_, i) => ({
                                    id: generatedScript.length + i + 1,
                                    text: '',
                                  })
                                );
                                const updated = [...generatedScript, ...extra];
                                setGeneratedScript(updated);
                                if (sandboxId) {
                                  setDoc(
                                    doc(collection(db, 'sandbox'), sandboxId),
                                    { scripts: updated },
                                    { merge: true }
                                  );
                                }
                              }
                            }}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
                          />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Generates exactly {clipCount} clips ({targetDuration}s
                          total)
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                          Goal / Topic
                        </Label>
                        <Textarea
                          placeholder="e.g. Create a series of promotional videos for our new AI product."
                          value={goalText}
                          onChange={(e) => setGoalText(e.target.value)}
                          className="min-h-[80px] resize-y"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col shrink-0">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-violet-500" />
                        <h2 className="font-semibold text-slate-800">
                          Reference Images
                        </h2>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">
                          {avatarImages.length} image
                          {avatarImages.length !== 1 ? 's' : ''}
                        </span>
                        <button
                          onClick={() => {
                            setShowImageGen((v) => !v);
                            setImageGenError(null);
                          }}
                          className={cn(
                            'text-xs px-2.5 py-1 rounded-full border transition-colors',
                            showImageGen
                              ? 'bg-violet-600 text-white border-violet-600'
                              : 'bg-white text-slate-600 border-slate-300 hover:border-violet-400'
                          )}
                        >
                          Generate
                        </button>
                      </div>
                    </div>
                    {showImageGen && (
                      <div className="px-4 pt-4 pb-3 flex flex-col gap-3 border-b border-slate-100">
                        <textarea
                          value={imageGenPrompt}
                          onChange={(e) => setImageGenPrompt(e.target.value)}
                          placeholder="Describe the image to generate…"
                          rows={3}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500"
                        />
                        <div className="flex gap-2">
                          <select
                            value={imageGenAspectRatio}
                            onChange={(e) =>
                              setImageGenAspectRatio(e.target.value)
                            }
                            className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                          >
                            <option value="9:16">9:16 — Portrait</option>
                            <option value="1:1">1:1 — Square</option>
                            <option value="16:9">16:9 — Landscape</option>
                            <option value="4:3">4:3 — Standard</option>
                            <option value="3:4">3:4 — Portrait wide</option>
                          </select>
                          <select
                            value={imageGenSize}
                            onChange={(e) => setImageGenSize(e.target.value)}
                            className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                          >
                            <option value="1K">1K — Standard</option>
                            <option value="2K">2K — HD</option>
                            <option value="4K">4K — Ultra HD</option>
                          </select>
                        </div>
                        {/* Guiding images */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            {imageGenRefImages.map((ref, i) => (
                              <div key={i} className="relative shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={ref.previewUrl}
                                  alt={`Guide ${i + 1}`}
                                  className="w-12 h-12 object-cover rounded-lg border border-slate-200"
                                />
                                <button
                                  onClick={() =>
                                    setImageGenRefImages((prev) =>
                                      prev.filter((_, idx) => idx !== i)
                                    )
                                  }
                                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] leading-none"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            {imageGenRefImages.length < 3 && (
                              <label className="w-12 h-12 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:border-violet-400 transition-colors shrink-0">
                                <ImageIcon className="w-4 h-4 text-slate-400" />
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={async (e) => {
                                    const files = Array.from(
                                      e.target.files ?? []
                                    ).slice(0, 3 - imageGenRefImages.length);
                                    e.target.value = '';
                                    const loaded = await Promise.all(
                                      files.map(
                                        (file) =>
                                          new Promise<{
                                            data: string;
                                            mimeType: string;
                                            previewUrl: string;
                                          }>((resolve) => {
                                            const reader = new FileReader();
                                            reader.onload = () => {
                                              const dataUrl =
                                                reader.result as string;
                                              const base64 =
                                                dataUrl.split(',')[1];
                                              resolve({
                                                data: base64,
                                                mimeType: file.type,
                                                previewUrl:
                                                  URL.createObjectURL(file),
                                              });
                                            };
                                            reader.readAsDataURL(file);
                                          })
                                      )
                                    );
                                    setImageGenRefImages((prev) =>
                                      [...prev, ...loaded].slice(0, 3)
                                    );
                                  }}
                                />
                              </label>
                            )}
                            <span className="text-xs text-slate-400">
                              {imageGenRefImages.length === 0
                                ? 'Add up to 3 guiding images'
                                : `${imageGenRefImages.length}/3 guide${imageGenRefImages.length !== 1 ? 's' : ''}`}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-slate-400">
                              Cost tracked per attempt
                            </span>
                            {imageGenCostUsd > 0 && (
                              <span className="text-xs text-amber-600 font-medium">
                                Spent so far: ${imageGenCostUsd.toFixed(2)}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={handleGenerateImage}
                            disabled={
                              isGeneratingImage || !imageGenPrompt.trim()
                            }
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-medium transition-colors"
                          >
                            {isGeneratingImage ? (
                              <>
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Generating…
                              </>
                            ) : generatedImagePreview ? (
                              'Regenerate'
                            ) : (
                              'Generate'
                            )}
                          </button>
                        </div>
                        {imageGenError && (
                          <p className="text-xs text-red-500">
                            {imageGenError}
                          </p>
                        )}
                        {generatedImagePreview && (
                          <div className="flex flex-col gap-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={generatedImagePreview.objectUrl}
                              alt="Generated preview"
                              className="w-full rounded-lg border border-slate-200 object-cover"
                            />
                            <button
                              onClick={handleUseGeneratedImage}
                              className="w-full text-xs py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors"
                            >
                              Add to References
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="p-4 flex flex-col gap-3">
                      {avatarImages.map((img) => (
                        <div
                          key={img.id}
                          data-testid="avatar-image-card"
                          className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50"
                        >
                          <div className="flex items-start gap-3 p-3">
                            <div className="relative shrink-0 group/thumb">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={img.previewUrl}
                                alt="Reference"
                                className="w-16 h-16 object-cover rounded-lg border border-slate-200 bg-slate-100 cursor-zoom-in"
                                onClick={() =>
                                  setLightboxIndex(avatarImages.indexOf(img))
                                }
                                onError={(e) => {
                                  const el = e.currentTarget;
                                  el.style.display = 'none';
                                  const placeholder =
                                    el.nextElementSibling as HTMLElement | null;
                                  if (placeholder)
                                    placeholder.style.display = 'flex';
                                }}
                              />
                              <div
                                className="w-16 h-16 rounded-lg border border-slate-200 bg-slate-100 items-center justify-center hidden cursor-zoom-in"
                                onClick={() =>
                                  setLightboxIndex(avatarImages.indexOf(img))
                                }
                              >
                                <ImageIcon className="w-6 h-6 text-slate-400" />
                              </div>
                              <label className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity cursor-pointer">
                                <Pencil className="w-4 h-4 text-white" />
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) replaceAvatarImage(img.id, f);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className={cn(
                                    'text-xs px-2.5 py-1 rounded-full border transition-colors',
                                    img.assignedTo === 'all'
                                      ? 'bg-violet-600 text-white border-violet-600'
                                      : 'bg-white text-slate-600 border-slate-300 hover:border-violet-400'
                                  )}
                                  onClick={() =>
                                    updateImageAssignment(img.id, 'all')
                                  }
                                >
                                  All clips
                                </button>
                                <button
                                  type="button"
                                  className={cn(
                                    'text-xs px-2.5 py-1 rounded-full border transition-colors',
                                    Array.isArray(img.assignedTo)
                                      ? 'bg-violet-600 text-white border-violet-600'
                                      : 'bg-white text-slate-600 border-slate-300 hover:border-violet-400'
                                  )}
                                  onClick={() =>
                                    updateImageAssignment(
                                      img.id,
                                      Array.isArray(img.assignedTo)
                                        ? img.assignedTo
                                        : [1]
                                    )
                                  }
                                >
                                  Select clips
                                </button>
                                <button
                                  type="button"
                                  title="Mark as B-roll: no person will be generated for clips using this image"
                                  className={cn(
                                    'text-xs px-2.5 py-1 rounded-full border transition-colors',
                                    img.isBroll
                                      ? 'bg-slate-700 text-white border-slate-700'
                                      : 'bg-white text-slate-500 border-slate-300 hover:border-slate-500'
                                  )}
                                  onClick={() => toggleImageBroll(img.id)}
                                >
                                  B-roll
                                </button>
                                <button
                                  className="ml-auto text-slate-400 hover:text-violet-500 transition-colors"
                                  title="Download"
                                  onClick={async () => {
                                    const url = img.blobUrl || img.previewUrl;
                                    const ext =
                                      img.blobUrl
                                        ?.split('.')
                                        .pop()
                                        ?.split('?')[0] ?? 'png';
                                    const suggestedName = `reference_${img.id}.${ext}`;
                                    try {
                                      const response = await fetch(url);
                                      const blob = await response.blob();
                                      if ('showSaveFilePicker' in window) {
                                        const fileHandle = await (
                                          window as any
                                        ).showSaveFilePicker({
                                          suggestedName,
                                          types: [
                                            {
                                              description: 'Image',
                                              accept: {
                                                'image/*': [
                                                  '.png',
                                                  '.jpg',
                                                  '.jpeg',
                                                  '.webp',
                                                ],
                                              },
                                            },
                                          ],
                                        });
                                        const writable =
                                          await fileHandle.createWritable();
                                        await writable.write(blob);
                                        await writable.close();
                                      } else {
                                        const a = document.createElement('a');
                                        a.href = URL.createObjectURL(blob);
                                        a.download = suggestedName;
                                        a.click();
                                        URL.revokeObjectURL(a.href);
                                      }
                                    } catch (err: any) {
                                      if (err?.name !== 'AbortError')
                                        console.error('Download failed', err);
                                    }
                                  }}
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                <button
                                  className="text-slate-400 hover:text-red-500 transition-colors"
                                  onClick={() => removeAvatarImage(img.id)}
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              {Array.isArray(img.assignedTo) && (
                                <div className="flex flex-wrap gap-1.5">
                                  {Array.from(
                                    { length: clipCount },
                                    (_, i) => i + 1
                                  ).map((n) => {
                                    const clipLabel =
                                      generatedScript?.[n - 1]?.label ??
                                      String(n);
                                    const isVariant =
                                      getVariantLetter(clipLabel) !== null;
                                    return (
                                      <button
                                        key={n}
                                        type="button"
                                        className={cn(
                                          'h-7 rounded-md text-xs font-medium border px-1.5',
                                          isVariant ? 'min-w-[2.25rem]' : 'w-7',
                                          (img.assignedTo as number[]).includes(
                                            n
                                          )
                                            ? 'bg-violet-600 text-white border-violet-600'
                                            : isVariant
                                              ? 'bg-violet-50 text-violet-600 border-violet-300 hover:border-violet-500'
                                              : 'bg-white text-slate-600 border-slate-300 hover:border-violet-400'
                                        )}
                                        onClick={() => {
                                          const cur =
                                            img.assignedTo as number[];
                                          const next = cur.includes(n)
                                            ? cur.filter((x) => x !== n)
                                            : [...cur, n].sort((a, b) => a - b);
                                          updateImageAssignment(
                                            img.id,
                                            next.length === 0 ? [n] : next
                                          );
                                        }}
                                      >
                                        {clipLabel}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div
                        className="border-2 border-dashed border-slate-200 rounded-xl p-4 flex items-center justify-center gap-2 cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 transition-colors text-slate-500 hover:text-violet-600"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          {avatarImages.length === 0
                            ? 'Upload Reference Image'
                            : 'Add Another Image'}
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          multiple
                          ref={fileInputRef}
                          onChange={handleAddImage}
                        />
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full gap-2 border-violet-200 text-violet-700 hover:bg-violet-50 shrink-0"
                    onClick={handleGenerateScript}
                    disabled={isGeneratingScript || !goalText.trim()}
                  >
                    {isGeneratingScript ? (
                      <div className="w-4 h-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {isGeneratingScript ? 'Generating...' : 'Generate Script'}
                  </Button>

                  {generatedScript && generatedScript.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col shrink-0">
                      <div className="p-4 border-b border-slate-100 flex flex-col gap-3 bg-slate-50/50">
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-violet-500" />
                          <h2 className="font-semibold text-slate-800">
                            Generated Dialogues ({generatedScript.length})
                          </h2>
                        </div>
                        <div className="flex items-center gap-3">
                          <Label className="text-sm font-medium text-slate-700 whitespace-nowrap">
                            Topic Name:
                          </Label>
                          <input
                            type="text"
                            value={topicName}
                            placeholder="e.g. AI-Product-Promo"
                            onChange={(e) => {
                              const val = e.target.value;
                              setTopicName(val);
                              if (sandboxId) {
                                setDoc(
                                  doc(collection(db, 'sandbox'), sandboxId),
                                  { topicName: val },
                                  { merge: true }
                                );
                              }
                            }}
                            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                      </div>
                      <div className="p-4 space-y-4">
                        <div className="space-y-3">
                          {generatedScript.map((script, index) => {
                            const prevScript = generatedScript[index - 1];
                            const isFirstInGroup =
                              script.variationGroup !== undefined &&
                              prevScript?.variationGroup !==
                                script.variationGroup;
                            const groupSize = script.variationGroup
                              ? generatedScript.filter(
                                  (s) =>
                                    s.variationGroup === script.variationGroup
                                ).length
                              : 0;
                            return (
                              <div key={index}>
                                {isFirstInGroup && (
                                  <div className="flex items-center gap-2 mb-1.5 mt-2">
                                    <div className="h-px flex-1 bg-violet-200" />
                                    <span className="text-xs font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                                      Scene {script.variationGroup} —{' '}
                                      {groupSize} variations
                                    </span>
                                    <div className="h-px flex-1 bg-violet-200" />
                                  </div>
                                )}
                                <div
                                  className={`p-3 bg-slate-50 border rounded-lg text-sm text-slate-600 ${script.variationGroup !== undefined ? 'border-violet-200 bg-violet-50/30' : 'border-slate-200'}`}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-medium text-slate-800">
                                        Clip {script.label ?? script.id}:
                                      </span>
                                      {script.variationNote && (
                                        <span
                                          className="text-xs text-violet-500 italic truncate max-w-[160px]"
                                          title={script.variationNote}
                                        >
                                          {script.variationNote}
                                        </span>
                                      )}
                                      {generatedScript.length > 1 && (
                                        <button
                                          className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded p-0.5 transition-colors"
                                          title="Remove clip"
                                          onClick={() =>
                                            handleRemoveClip(script.id)
                                          }
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={
                                          regeneratingDialogueIndex === index
                                        }
                                        className="h-6 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 gap-1 px-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={async () => {
                                          if (
                                            !goalText.trim() ||
                                            !filmDirectionSystem
                                          )
                                            return;
                                          setRegeneratingDialogueIndex(index);
                                          try {
                                            const existingDialogues =
                                              generatedScript.map(
                                                (s) => s.text
                                              );
                                            const selectionContext = {
                                              goalText: goalText.trim(),
                                              aspectRatio,
                                              hasHumanSubject:
                                                avatarImages.length > 0,
                                              isUGC: true,
                                            };

                                            const response = await fetch(
                                              '/api/sandbox/generate-scripts',
                                              {
                                                method: 'POST',
                                                headers: {
                                                  'Content-Type':
                                                    'application/json',
                                                },
                                                body: JSON.stringify({
                                                  goalText: goalText.trim(),
                                                  clipCount: 1,
                                                  commonRules:
                                                    filmDirectionSystem,
                                                  promptOnlyMode: false,
                                                  existingDialogues,
                                                  styles: filmDirectionSections,
                                                  selectionContext,
                                                  targetClipIndex: index,
                                                }),
                                              }
                                            );

                                            if (response.ok) {
                                              const data =
                                                await response.json();
                                              if (
                                                data.dialogues &&
                                                data.dialogues.length > 0
                                              ) {
                                                const newScripts = [
                                                  ...generatedScript,
                                                ];
                                                newScripts[index].text =
                                                  data.dialogues[0];
                                                setGeneratedScript(newScripts);
                                                if (sandboxId) {
                                                  setDoc(
                                                    doc(
                                                      collection(db, 'sandbox'),
                                                      sandboxId
                                                    ),
                                                    { scripts: newScripts },
                                                    { merge: true }
                                                  );
                                                }
                                              }
                                            }
                                          } catch (error) {
                                            console.error(
                                              'Failed to regenerate dialogue:',
                                              error
                                            );
                                          } finally {
                                            setRegeneratingDialogueIndex(null);
                                          }
                                        }}
                                      >
                                        {regeneratingDialogueIndex === index ? (
                                          <div className="w-3 h-3 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                                        ) : (
                                          <RotateCcw className="w-3 h-3" />
                                        )}
                                        {regeneratingDialogueIndex === index
                                          ? 'Regenerating...'
                                          : 'Regenerate'}
                                      </Button>
                                    </div>
                                  </div>
                                  {regeneratingDialogueIndex === index ? (
                                    <div className="flex flex-col gap-2 min-h-[60px] p-2 bg-white border border-slate-200 rounded-md">
                                      <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
                                      <div className="h-3 w-4/5 bg-slate-100 rounded animate-pulse" />
                                      <div className="h-3 w-2/3 bg-slate-100 rounded animate-pulse" />
                                    </div>
                                  ) : (
                                    <Textarea
                                      value={script.text}
                                      onChange={(e) => {
                                        const newScripts = [...generatedScript];
                                        newScripts[index].text = e.target.value;
                                        setGeneratedScript(newScripts);
                                        if (sandboxId) {
                                          setDoc(
                                            doc(
                                              collection(db, 'sandbox'),
                                              sandboxId
                                            ),
                                            { scripts: newScripts },
                                            { merge: true }
                                          );
                                        }
                                      }}
                                      className="min-h-[60px] resize-y text-slate-700 bg-white"
                                    />
                                  )}

                                  {/* Per-clip visual prompt */}
                                  {(() => {
                                    const clipImgs = avatarImages.filter(
                                      (img) =>
                                        img.assignedTo === 'all' ||
                                        (Array.isArray(img.assignedTo) &&
                                          img.assignedTo.includes(script.id))
                                    );
                                    return (
                                      <div className="mt-2 border-t border-slate-100 pt-2">
                                        {/* Image thumbnails for this clip */}
                                        {clipImgs.length > 0 && (
                                          <div className="flex gap-1 mb-1.5">
                                            {clipImgs.map((img) => (
                                              // eslint-disable-next-line @next/next/no-img-element
                                              <img
                                                key={img.id}
                                                src={img.previewUrl}
                                                alt=""
                                                className="w-6 h-6 rounded object-cover border border-slate-200 shrink-0"
                                              />
                                            ))}
                                            <span className="text-[10px] text-slate-400 self-center ml-1">
                                              {clipImgs.length} image
                                              {clipImgs.length !== 1 ? 's' : ''}
                                            </span>
                                          </div>
                                        )}
                                        {/* Collapsible visual prompt row */}
                                        <div className="flex items-center gap-1 w-full">
                                          <div
                                            className="flex items-center gap-1 flex-1 cursor-pointer min-w-0"
                                            onClick={() =>
                                              setExpandedClipPromptIndex(
                                                expandedClipPromptIndex ===
                                                  index
                                                  ? null
                                                  : index
                                              )
                                            }
                                          >
                                            <ChevronRight
                                              className={cn(
                                                'w-3 h-3 text-slate-400 transition-transform shrink-0',
                                                expandedClipPromptIndex ===
                                                  index && 'rotate-90'
                                              )}
                                            />
                                            <span className="text-xs text-slate-500 flex-1">
                                              Visual prompt
                                            </span>
                                            <span
                                              className={cn(
                                                'text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0',
                                                script.visualPrompt
                                                  ? 'bg-violet-100 text-violet-700'
                                                  : 'bg-slate-100 text-slate-400'
                                              )}
                                            >
                                              {script.visualPrompt
                                                ? 'Custom'
                                                : clipImgs.length > 0
                                                  ? 'Auto'
                                                  : 'None'}
                                            </span>
                                          </div>
                                          {regeneratingClipPromptIndex ===
                                          index ? (
                                            <div className="w-3 h-3 rounded-full border-2 border-violet-500 border-t-transparent animate-spin shrink-0 ml-1" />
                                          ) : clipImgs.length > 0 ? (
                                            <button
                                              className="ml-1 text-slate-400 hover:text-violet-600 transition-colors shrink-0"
                                              title="Regenerate visual prompt for this clip"
                                              onClick={() =>
                                                handleRegenerateClipPrompt(
                                                  index
                                                )
                                              }
                                            >
                                              <RotateCcw className="w-3 h-3" />
                                            </button>
                                          ) : null}
                                        </div>
                                        {expandedClipPromptIndex === index && (
                                          <div className="mt-1.5 flex flex-col gap-1.5">
                                            <Textarea
                                              value={script.visualPrompt ?? ''}
                                              placeholder={
                                                clipImgs.length > 0
                                                  ? 'Scene-specific visual details for this clip…'
                                                  : 'No images assigned — type a custom visual note…'
                                              }
                                              className="min-h-[48px] resize-y text-xs text-slate-700 bg-white"
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                const newScripts =
                                                  generatedScript.map((s, i) =>
                                                    i === index
                                                      ? {
                                                          ...s,
                                                          visualPrompt:
                                                            val || undefined,
                                                        }
                                                      : s
                                                  );
                                                setGeneratedScript(newScripts);
                                                if (clipPromptSaveTimer.current)
                                                  clearTimeout(
                                                    clipPromptSaveTimer.current
                                                  );
                                                clipPromptSaveTimer.current =
                                                  setTimeout(() => {
                                                    if (sandboxId) {
                                                      setDoc(
                                                        doc(
                                                          collection(
                                                            db,
                                                            'sandbox'
                                                          ),
                                                          sandboxId
                                                        ),
                                                        { scripts: newScripts },
                                                        { merge: true }
                                                      );
                                                    }
                                                  }, 800);
                                              }}
                                            />
                                            {script.visualPrompt && (
                                              <button
                                                className="self-end text-xs text-slate-400 hover:text-red-500 transition-colors"
                                                onClick={() => {
                                                  const newScripts =
                                                    generatedScript.map(
                                                      (s, i) =>
                                                        i === index
                                                          ? {
                                                              ...s,
                                                              visualPrompt:
                                                                undefined,
                                                            }
                                                          : s
                                                    );
                                                  setGeneratedScript(
                                                    newScripts
                                                  );
                                                  if (sandboxId) {
                                                    setDoc(
                                                      doc(
                                                        collection(
                                                          db,
                                                          'sandbox'
                                                        ),
                                                        sandboxId
                                                      ),
                                                      { scripts: newScripts },
                                                      { merge: true }
                                                    );
                                                  }
                                                }}
                                              >
                                                Reset
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                              Default Video Prompt
                              {isAiGeneratedPrompt && (
                                <span className="text-[10px] font-semibold tracking-wider uppercase bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded border border-violet-200 flex items-center gap-1">
                                  <Sparkles className="w-3 h-3" />
                                  AI-generated
                                </span>
                              )}
                            </Label>
                            {filmDirectionSystem && avatarImages.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 gap-1 px-2"
                                onClick={handleRegeneratePrompt}
                                disabled={isRegeneratingPrompt}
                              >
                                {isRegeneratingPrompt ? (
                                  <div className="w-3 h-3 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3 h-3" />
                                )}
                                Regenerate
                              </Button>
                            )}
                          </div>
                          {isRegeneratingPrompt ? (
                            <div className="flex flex-col gap-2 min-h-[80px] p-3 bg-white border border-slate-200 rounded-md">
                              <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
                              <div className="h-3 w-[90%] bg-slate-100 rounded animate-pulse" />
                              <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
                              <div className="h-3 w-3/4 bg-slate-100 rounded animate-pulse" />
                            </div>
                          ) : (
                            <Textarea
                              value={defaultVideoPrompt}
                              onChange={(e) => {
                                if (
                                  e.target.value.length === 0 &&
                                  defaultVideoPrompt.length > 0
                                ) {
                                  return; // Not clearable
                                }
                                const val = e.target.value;
                                setDefaultVideoPrompt(val);
                                localStorage.setItem(
                                  'sandbox_default_prompt',
                                  val
                                );
                                if (sandboxId) {
                                  setDoc(
                                    doc(collection(db, 'sandbox'), sandboxId),
                                    { defaultVideoPrompt: val },
                                    { merge: true }
                                  );
                                }
                              }}
                              className="min-h-[80px] resize-y text-slate-700"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col shrink-0">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <div className="flex items-center gap-2">
                        <Settings2 className="w-5 h-5 text-violet-500" />
                        <h2 className="font-semibold text-slate-800">
                          Generation Settings
                        </h2>
                      </div>
                    </div>
                    <div className="p-4 flex flex-col gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                          Aspect Ratio
                        </Label>
                        <div className="flex gap-2">
                          {['16:9', '9:16'].map((ratio) => (
                            <button
                              key={ratio}
                              onClick={() => {
                                setAspectRatio(ratio as '16:9' | '9:16');
                                updateConfigInDb({ aspectRatio: ratio });
                              }}
                              className={cn(
                                'flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors',
                                aspectRatio === ratio
                                  ? 'bg-violet-50 border-violet-200 text-violet-700'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              )}
                            >
                              {ratio}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                          Video Quality
                        </Label>
                        <div className="flex gap-2">
                          {['720p', '1080p', '4k'].map((quality) => (
                            <button
                              key={quality}
                              onClick={() => {
                                setVideoQuality(
                                  quality as '720p' | '1080p' | '4k'
                                );
                                updateConfigInDb({ videoQuality: quality });
                              }}
                              className={cn(
                                'flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors',
                                videoQuality === quality
                                  ? 'bg-violet-50 border-violet-200 text-violet-700'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              )}
                            >
                              {quality}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                          Extend Video
                        </Label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setIsExtendEnabled(true);
                              updateConfigInDb({ isExtendEnabled: true });
                            }}
                            className={cn(
                              'flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors',
                              isExtendEnabled
                                ? 'bg-violet-50 border-violet-200 text-violet-700'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            )}
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => {
                              setIsExtendEnabled(false);
                              updateConfigInDb({ isExtendEnabled: false });
                            }}
                            className={cn(
                              'flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors',
                              !isExtendEnabled
                                ? 'bg-violet-50 border-violet-200 text-violet-700'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            )}
                          >
                            No
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {isExtendEnabled
                            ? 'Uses extend APIs to natively generate longer videos.'
                            : 'Generates independent clips and stitches them using ffmpeg.'}
                        </p>
                      </div>

                      <div className="space-y-4">
                        <Label className="text-sm font-medium text-slate-700">
                          Model & Provider
                        </Label>

                        {/* Top section: Provider */}
                        <div className="pb-4 mb-4 border-b border-slate-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-2 h-2 rounded-full ${providerConfig.activeProvider === 'vertex' ? 'bg-green-500' : 'bg-blue-500'}`}
                              />
                              <span className="text-sm text-slate-700">
                                {providerConfig.activeProvider === 'vertex'
                                  ? 'Vertex AI'
                                  : 'Gemini'}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                document.dispatchEvent(
                                  new CustomEvent('open-provider-modal')
                                );
                              }}
                              className="text-xs font-medium text-violet-600 hover:text-violet-700 transition-colors"
                            >
                              Change
                            </button>
                          </div>
                        </div>

                        {/* Second section: Model */}
                        <div>
                          <select
                            value={model}
                            onChange={(e) => {
                              setModel(e.target.value);
                              updateConfigInDb({ model: e.target.value });
                            }}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                          >
                            {providerConfig.activeProvider === 'vertex' ? (
                              <>
                                <option value="veo-3.1-fast-generate-001">
                                  Veo 3.1 Fast
                                </option>
                                <option value="veo-3.1-generate-001">
                                  Veo 3.1 Pro
                                </option>
                              </>
                            ) : (
                              <>
                                <option value="veo-3.1-fast-generate-preview">
                                  Veo 3.1 Fast
                                </option>
                                <option value="veo-3.1-generate-preview">
                                  Veo 3.1 Pro
                                </option>
                              </>
                            )}
                            <option value="veo-3.1-lite-generate-preview">
                              Veo 3.1 Lite
                            </option>
                            <option value="kling-o3-image-to-video">
                              Kling O3 (Evolink)
                            </option>
                            <option value="seedance-2.0-reference-to-video">
                              Seedance 2.0
                            </option>
                            <option value="seedance-1.5-pro">
                              Seedance 1.5 Pro
                            </option>
                            <option value="grok-imagine-image-to-video-beta">
                              Grok (Beta)
                            </option>
                          </select>

                          {/* Model Info Note */}
                          <div className="mt-2 text-xs text-slate-500 flex items-start gap-1.5">
                            {model === 'veo-3.1-lite-generate-preview' && (
                              <>
                                <span className="shrink-0 mt-0.5">ℹ</span>
                                <span>
                                  Veo 3.1 Lite supports 1 image max per shot.
                                  Extra images are ignored.
                                </span>
                              </>
                            )}
                            {(model === 'kling-o3-image-to-video' ||
                              model === 'grok-imagine-image-to-video-beta' ||
                              model === 'seedance-1.5-pro') && (
                              <>
                                <span className="shrink-0 mt-0.5">ℹ</span>
                                <span>
                                  {model === 'grok-imagine-image-to-video-beta'
                                    ? 'Grok requires at least 1 image per shot.'
                                    : model === 'seedance-1.5-pro'
                                      ? 'Seedance 1.5 Pro requires at least 1 image per shot.'
                                      : 'Kling O3 requires at least 1 image per shot. Only the first image is used as the start frame.'}
                                </span>
                              </>
                            )}
                            {model === 'seedance-2.0-reference-to-video' && (
                              <>
                                <span className="shrink-0 mt-0.5">ℹ</span>
                                <span>
                                  Seedance 2.0 will use an image reference if
                                  attached, otherwise it will fall back to
                                  text-to-video automatically.
                                </span>
                              </>
                            )}
                            {providerConfig.activeProvider === 'vertex' &&
                              (model === 'kling-o3-image-to-video' ||
                                model === 'seedance-2.0-reference-to-video' ||
                                model === 'grok-imagine-image-to-video-beta' ||
                                model === 'seedance-1.5-pro') && (
                                <>
                                  <span className="shrink-0 mt-0.5">ℹ</span>
                                  <span>
                                    This model uses Evolink and ignores the
                                    Vertex AI toggle.
                                  </span>
                                </>
                              )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button
                    className={cn(
                      'w-full py-6 text-base font-medium rounded-xl gap-2 shrink-0',
                      canCreate && !isCreatingVideos
                        ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-md hover:shadow-lg transition-all'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    )}
                    disabled={!canCreate || isCreatingVideos}
                    onClick={handleCreateVideos}
                  >
                    {isCreatingVideos ? (
                      <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    ) : (
                      <Play className="w-5 h-5 fill-current" />
                    )}
                    {isCreatingVideos ? 'Creating...' : 'Create Videos'}
                  </Button>
                </div>

                {/* Right Column: Output/Preview */}
                <div className="h-full overflow-y-auto p-6 bg-slate-50">
                  <div className="flex items-start justify-between mb-4">
                    <h2 className="text-lg font-semibold">Output / Preview</h2>
                    {(() => {
                      const videoCost = runs.reduce(
                        (sum, r) => sum + (r.totalCostUsd ?? 0),
                        0
                      );
                      const grandTotal =
                        videoCost + imageGenCostUsd + scriptGenCostUsd;
                      if (grandTotal === 0) return null;
                      return (
                        <div className="text-right">
                          <div className="text-2xl font-bold text-slate-800">
                            ${grandTotal.toFixed(2)}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 space-y-0.5">
                            {videoCost > 0 && (
                              <div>Video: ${videoCost.toFixed(2)}</div>
                            )}
                            {imageGenCostUsd > 0 && (
                              <div>Images: ${imageGenCostUsd.toFixed(2)}</div>
                            )}
                            {scriptGenCostUsd > 0 && (
                              <div>Scripts: ${scriptGenCostUsd.toFixed(2)}</div>
                            )}
                            <div className="text-slate-300">approx.</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Complete Video View */}
                  {(() => {
                    const isAllDone =
                      steps.length > 0 &&
                      steps.every((s) => s.status === 'done');
                    if (!isAllDone) return null;

                    const activeRun = runs.find((r) => r.id === currentRunId);
                    const hasVariantSteps = steps.some(
                      (s) => getVariantLetter(s.label) !== null
                    );
                    const isNoExtend =
                      steps.length > 1 &&
                      (!activeRun || activeRun.isExtendEnabled === false);

                    // Variation run — show one player per final letter
                    if (isNoExtend && hasVariantSteps) {
                      const urls = activeRun?.stitchedVideoUrls;
                      if (!urls || Object.keys(urls).length === 0) {
                        return (
                          <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4">
                            <div className="text-sm font-semibold text-slate-800 mb-1">
                              Final Videos
                            </div>
                            <p className="text-xs text-slate-500">
                              Finalizing variant stitches…
                            </p>
                          </div>
                        );
                      }
                      return (
                        <div className="mb-6 space-y-4">
                          {Object.entries(urls)
                            .sort()
                            .map(([letter, url]) => (
                              <div
                                key={letter}
                                className="bg-white rounded-xl border border-violet-200 shadow-sm overflow-hidden p-4"
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <h3 className="font-semibold text-slate-800">
                                    Final {letter}
                                  </h3>
                                </div>
                                <video
                                  src={url}
                                  controls
                                  className="w-full rounded-lg aspect-video object-contain bg-black"
                                />
                                <div className="mt-4 flex justify-end">
                                  <button
                                    onClick={async () => {
                                      const res = await fetch(url);
                                      const blob = await res.blob();
                                      const blobUrl =
                                        window.URL.createObjectURL(blob);
                                      const a = document.createElement('a');
                                      a.href = blobUrl;
                                      a.download = `${topicName || 'video'}-Final${letter}-${Date.now()}.mp4`;
                                      document.body.appendChild(a);
                                      a.click();
                                      window.URL.revokeObjectURL(blobUrl);
                                      document.body.removeChild(a);
                                    }}
                                    className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors h-9 px-4 gap-2 text-white bg-violet-600 hover:bg-violet-700 shadow-sm"
                                  >
                                    <Download className="w-4 h-4" /> Download
                                    Final {letter}
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                      );
                    }

                    // Non-variation run — existing single final logic
                    let finalVideoUrl = '';
                    if (isNoExtend) {
                      finalVideoUrl = activeRun?.stitchedVideoUrl || '';
                    } else {
                      const lastDoneStep = steps[steps.length - 1];
                      finalVideoUrl = lastDoneStep?.videoUrl || '';
                    }

                    if (!finalVideoUrl) {
                      const needsStitch =
                        isNoExtend && !activeRun?.stitchedVideoUrl;
                      if (!needsStitch) return null;
                      return (
                        <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-slate-800">
                              Final Complete Video
                            </h3>
                            <Button
                              variant="default"
                              size="sm"
                              disabled={isCreatingVideos}
                              onClick={async () => {
                                if (!currentRunId) return;
                                setIsCreatingVideos(true);
                                try {
                                  const videoUrls = steps
                                    .map((s) => s.videoUrl)
                                    .filter((url): url is string => !!url);
                                  console.log(
                                    `[GenerateFullClip] Clicked — ${videoUrls.length} clip(s) to stitch for ${currentRunId}`
                                  );
                                  if (videoUrls.length < 2) {
                                    console.warn(
                                      '[GenerateFullClip] Not enough clip URLs, aborting'
                                    );
                                    return;
                                  }
                                  videoUrls.forEach((u, i) =>
                                    console.log(
                                      `[GenerateFullClip]   clip[${i}]: ${u}`
                                    )
                                  );
                                  console.log(
                                    '[GenerateFullClip] Calling /api/sandbox/stitch…'
                                  );
                                  const stitchRes = await fetch(
                                    '/api/sandbox/stitch',
                                    {
                                      method: 'POST',
                                      headers: {
                                        'Content-Type': 'application/json',
                                      },
                                      body: JSON.stringify({
                                        videoUrls,
                                        filename: `stitched_${sandboxId}_${currentRunId}.mp4`,
                                      }),
                                    }
                                  );
                                  if (stitchRes.ok) {
                                    const stitchData = await stitchRes.json();
                                    console.log(
                                      '[GenerateFullClip] Stitch succeeded — URL:',
                                      stitchData.videoUrl
                                    );
                                    await setDoc(
                                      doc(
                                        collection(
                                          db,
                                          'sandbox',
                                          sandboxId!,
                                          'generatedVideos'
                                        ),
                                        currentRunId
                                      ),
                                      { stitchedVideoUrl: stitchData.videoUrl },
                                      { merge: true }
                                    );
                                    await loadRunsForSandbox(sandboxId!);
                                    console.log(
                                      '[GenerateFullClip] DONE — Firestore updated'
                                    );
                                  } else {
                                    const errText = await stitchRes.text();
                                    console.error(
                                      `[GenerateFullClip] Stitch API error ${stitchRes.status}:`,
                                      errText
                                    );
                                  }
                                } catch (e) {
                                  console.error(
                                    '[GenerateFullClip] Failed to fetch:',
                                    e
                                  );
                                } finally {
                                  setIsCreatingVideos(false);
                                }
                              }}
                            >
                              {isCreatingVideos
                                ? 'Stitching…'
                                : 'Generate Full Clip'}
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-slate-800">
                            Final Complete Video
                          </h3>
                          {steps.length > 1 &&
                            (!activeRun ||
                              activeRun.isExtendEnabled === false) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-2 text-xs"
                                disabled={isCreatingVideos}
                                onClick={async () => {
                                  if (!currentRunId) return;
                                  setIsCreatingVideos(true);
                                  try {
                                    const videoUrls = steps
                                      .map((s) => s.videoUrl)
                                      .filter((url): url is string => !!url);

                                    if (videoUrls.length > 1) {
                                      const stitchRes = await fetch(
                                        '/api/sandbox/stitch',
                                        {
                                          method: 'POST',
                                          headers: {
                                            'Content-Type': 'application/json',
                                          },
                                          body: JSON.stringify({
                                            videoUrls,
                                            filename: `stitched_${sandboxId}_${currentRunId}.mp4`,
                                          }),
                                        }
                                      );
                                      if (stitchRes.ok) {
                                        const stitchData =
                                          await stitchRes.json();
                                        let newStitchedUrl =
                                          stitchData.videoUrl;
                                        if (newStitchedUrl) {
                                          newStitchedUrl =
                                            newStitchedUrl.split('?')[0] +
                                            `?t=${Date.now()}`;
                                        }
                                        await setDoc(
                                          doc(
                                            collection(
                                              db,
                                              'sandbox',
                                              sandboxId!,
                                              'generatedVideos'
                                            ),
                                            currentRunId
                                          ),
                                          { stitchedVideoUrl: newStitchedUrl },
                                          { merge: true }
                                        );
                                        setRuns((prev) =>
                                          prev.map((r) =>
                                            r.id === currentRunId
                                              ? {
                                                  ...r,
                                                  stitchedVideoUrl:
                                                    newStitchedUrl,
                                                }
                                              : r
                                          )
                                        );
                                      }
                                    }
                                  } catch (e) {
                                    console.error(
                                      'Failed to restitch video manually',
                                      e
                                    );
                                  } finally {
                                    setIsCreatingVideos(false);
                                  }
                                }}
                              >
                                <RotateCcw className="w-3 h-3" /> Recreate Video
                              </Button>
                            )}
                        </div>
                        <video
                          src={finalVideoUrl}
                          controls
                          className="w-full rounded-lg aspect-video object-contain bg-black"
                        />
                        <div className="mt-4 flex justify-end gap-3">
                          <button
                            disabled={
                              isCreatingVideos || isDownloadingFinalAudio
                            }
                            onClick={async () => {
                              setIsDownloadingFinalAudio(true);
                              setFfmpegProgress(null);
                              console.log(
                                '[DownloadAudio] Clicked — extracting audio client-side from:',
                                finalVideoUrl
                              );
                              try {
                                const blob = await extractAudioLocally(
                                  finalVideoUrl,
                                  (msg) => {
                                    console.log('[DownloadAudio]', msg);
                                    setFfmpegProgress(msg);
                                  }
                                );
                                console.log(
                                  `[DownloadAudio] Done — ${(blob.size / 1024 / 1024).toFixed(2)} MB — triggering download`
                                );
                                const blobUrl =
                                  window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = blobUrl;
                                a.download = `${topicName || 'complete-audio'}-${Date.now()}.mp3`;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(blobUrl);
                                document.body.removeChild(a);
                              } catch (err) {
                                console.error('[DownloadAudio] Failed:', err);
                              } finally {
                                setIsDownloadingFinalAudio(false);
                                setFfmpegProgress(null);
                              }
                            }}
                            className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors h-9 px-4 gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${isDownloadingFinalAudio ? 'text-white bg-violet-500 cursor-not-allowed' : 'text-violet-700 bg-violet-100 hover:bg-violet-200'}`}
                          >
                            <Download className="w-4 h-4" />
                            {isDownloadingFinalAudio
                              ? (ffmpegProgress ?? 'Extracting…')
                              : 'Download Audio'}
                          </button>
                          <button
                            disabled={isCreatingVideos}
                            onClick={async () => {
                              console.log(
                                '[DownloadVideo] Clicked — downloading from:',
                                finalVideoUrl
                              );
                              try {
                                console.log(
                                  '[DownloadVideo] Fetching video blob…'
                                );
                                const res = await fetch(finalVideoUrl);
                                const blob = await res.blob();
                                console.log(
                                  `[DownloadVideo] Blob received: ${(blob.size / 1024 / 1024).toFixed(2)} MB — triggering download`
                                );
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${topicName || 'complete-video'}-${Date.now()}.mp4`;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                                console.log('[DownloadVideo] DONE');
                              } catch (err) {
                                console.error('[DownloadVideo] Failed:', err);
                              }
                            }}
                            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors h-9 px-4 gap-2 text-white bg-violet-600 hover:bg-violet-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Download className="w-4 h-4" /> Download Complete
                            Video
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Active Generation (current run) */}
                  {steps.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm font-semibold text-slate-700">
                          {currentRunId
                            ? currentRunId.replace('run_', 'Run ')
                            : 'Current Run'}
                        </span>
                        {isCreatingVideos && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                              Generating
                            </span>
                            <button
                              onClick={handleStopGenerating}
                              className="text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-full flex items-center gap-1 transition-colors"
                            >
                              <Square className="w-3 h-3 fill-red-600" />
                              Stop
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Sequential Steps */}
                      <div className="space-y-4">
                        {(() => {
                          const renderCard = (
                            step: StepSlot,
                            idx: number,
                            grouped: boolean
                          ) => (
                            <div
                              key={step.stepNumber}
                              className={`bg-white rounded-xl border shadow-sm overflow-hidden p-4 ${grouped ? 'border-violet-200' : 'border-slate-200'}`}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-medium text-slate-800">
                                    {idx === steps.length - 1 &&
                                    step.status === 'done' &&
                                    isExtendEnabled
                                      ? 'Final Video'
                                      : `Clip ${step.label ?? step.stepNumber}`}
                                  </h3>
                                  {step.cumulativeDuration && (
                                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                      ~{step.cumulativeDuration}s
                                    </span>
                                  )}
                                  {step.status === 'done' &&
                                    step.videoUrl &&
                                    (() => {
                                      const cost = clipCostUsd(
                                        model,
                                        8,
                                        videoQuality
                                      );
                                      return cost ? (
                                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                          {cost}
                                        </span>
                                      ) : null;
                                    })()}
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <div className="flex items-center gap-2">
                                    {step.status === 'generating' && (
                                      <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full flex items-center gap-1">
                                        <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                        Generating
                                      </span>
                                    )}
                                    {step.status === 'done' &&
                                      step.videoUrl && (
                                        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                                          Completed
                                        </span>
                                      )}
                                    {step.status === 'done' &&
                                      !step.videoUrl && (
                                        <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                                          No Data
                                        </span>
                                      )}
                                    {step.status === 'error' && (
                                      <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full">
                                        Error
                                      </span>
                                    )}
                                    {step.status === 'idle' && (
                                      <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                                        Waiting
                                      </span>
                                    )}
                                  </div>

                                  {step.status === 'done' &&
                                    (!step.videoVersions ||
                                      step.videoVersions.length === 0) && (
                                      <div className="flex items-center gap-2 bg-slate-100 rounded-md p-1 mt-1 justify-end">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 px-2 text-xs font-medium text-violet-600 hover:text-violet-700 gap-1"
                                          disabled={isCreatingVideos}
                                          onClick={() =>
                                            handleRetryStep(step.stepNumber)
                                          }
                                        >
                                          <RotateCcw className="w-3 h-3" />
                                          Regenerate
                                        </Button>
                                      </div>
                                    )}
                                  {step.status === 'done' &&
                                    step.videoVersions &&
                                    step.videoVersions.length > 0 && (
                                      <div className="flex items-center gap-2 bg-slate-100 rounded-md p-1 mt-1 justify-between w-full">
                                        <div className="flex items-center">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0"
                                            disabled={
                                              step.activeVersionIndex === 0
                                            }
                                            onClick={() =>
                                              handleChangeStepVersion(
                                                step.stepNumber,
                                                currentRunId!,
                                                (step.activeVersionIndex || 0) -
                                                  1
                                              )
                                            }
                                          >
                                            <ChevronDown className="w-4 h-4 rotate-90" />
                                          </Button>
                                          <span className="text-xs font-medium text-slate-600 min-w-[70px] text-center">
                                            Version{' '}
                                            {
                                              step.videoVersions[
                                                step.activeVersionIndex || 0
                                              ].version
                                            }
                                          </span>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0"
                                            disabled={
                                              step.activeVersionIndex ===
                                              step.videoVersions.length - 1
                                            }
                                            onClick={() =>
                                              handleChangeStepVersion(
                                                step.stepNumber,
                                                currentRunId!,
                                                (step.activeVersionIndex || 0) +
                                                  1
                                              )
                                            }
                                          >
                                            <ChevronDown className="w-4 h-4 -rotate-90" />
                                          </Button>
                                        </div>
                                        <div className="flex items-center">
                                          <div className="w-px h-4 bg-slate-200 mx-1" />
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-xs font-medium text-violet-600 hover:text-violet-700 gap-1"
                                            disabled={isCreatingVideos}
                                            onClick={() =>
                                              handleRetryStep(step.stepNumber)
                                            }
                                          >
                                            <RotateCcw className="w-3 h-3" />
                                            Regenerate
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                </div>
                              </div>
                              {step.dialogue && (
                                <div className="mb-1.5 text-sm text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                                  <span className="font-medium text-slate-700 mr-2">
                                    Dialogue:
                                  </span>
                                  {step.dialogue}
                                </div>
                              )}
                              {step.visualPrompt && (
                                <div className="mb-3 text-sm text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                                  <span className="font-medium text-slate-600 mr-2">
                                    Prompt:
                                  </span>
                                  {step.visualPrompt}
                                </div>
                              )}
                              {step.status === 'generating' && (
                                <div className="aspect-video bg-slate-100 rounded-lg flex flex-col items-center justify-center gap-3 relative">
                                  <div className="w-8 h-8 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
                                  <span className="text-sm font-medium text-slate-500">
                                    Generating video...
                                  </span>
                                  <button
                                    onClick={handleStopGenerating}
                                    className="absolute top-2 right-2 text-xs font-medium text-red-500 hover:text-red-700 bg-white border border-red-200 hover:border-red-400 px-2 py-1 rounded-full flex items-center gap-1 transition-colors"
                                  >
                                    <Square className="w-3 h-3 fill-red-500" />
                                    Stop
                                  </button>
                                </div>
                              )}
                              {step.status === 'done' && step.videoUrl && (
                                <div>
                                  <video
                                    src={step.videoUrl}
                                    controls
                                    className="w-full rounded-lg aspect-video object-contain bg-black"
                                  />
                                  {step.videoReferenceUrl && (
                                    <div className="mt-2 text-xs">
                                      <a
                                        href={step.videoReferenceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-violet-600 hover:underline flex items-center gap-1"
                                      >
                                        <FileText className="w-3 h-3" />
                                        View videoReference JSON
                                      </a>
                                    </div>
                                  )}
                                  <div className="mt-3 flex items-center justify-end gap-2">
                                    <button
                                      onClick={async (e) => {
                                        const btn = e.currentTarget;
                                        btn.disabled = true;
                                        btn.textContent = 'Extracting…';
                                        try {
                                          const res = await fetch(
                                            '/api/sandbox/stitch',
                                            {
                                              method: 'POST',
                                              headers: {
                                                'Content-Type':
                                                  'application/json',
                                              },
                                              body: JSON.stringify({
                                                videoUrls: [step.videoUrl],
                                                filename: `clip_${step.stepNumber}_audio_${Date.now()}.mp3`,
                                                extractAudio: true,
                                              }),
                                            }
                                          );
                                          const data = await res.json();
                                          if (data.audioUrl) {
                                            const audioRes = await fetch(
                                              data.audioUrl
                                            );
                                            const audioBlob =
                                              await audioRes.blob();
                                            const blobUrl =
                                              window.URL.createObjectURL(
                                                audioBlob
                                              );
                                            const a =
                                              document.createElement('a');
                                            a.href = blobUrl;
                                            a.download = `${topicName || 'clip'}-step${step.stepNumber}.mp3`;
                                            document.body.appendChild(a);
                                            a.click();
                                            window.URL.revokeObjectURL(blobUrl);
                                            document.body.removeChild(a);
                                          }
                                        } catch (err) {
                                          console.error(
                                            'Audio extract failed',
                                            err
                                          );
                                        } finally {
                                          btn.disabled = false;
                                          btn.textContent = 'Download Audio';
                                        }
                                      }}
                                      className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors h-8 px-3 gap-1.5 text-slate-700 bg-slate-100 hover:bg-slate-200"
                                    >
                                      Download Audio
                                    </button>
                                    {idx === steps.length - 1 &&
                                      isExtendEnabled && (
                                        <a
                                          href={step.videoUrl}
                                          download
                                          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors h-8 px-4 gap-1.5 text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm"
                                        >
                                          Download Output
                                        </a>
                                      )}
                                  </div>
                                </div>
                              )}
                              {step.status === 'error' && (
                                <div className="aspect-video bg-red-50 rounded-lg flex flex-col items-center justify-center p-4 text-center">
                                  <X className="w-8 h-8 text-red-400 mb-2" />
                                  <p className="text-sm text-red-600 mb-3">
                                    {step.errorMsg || 'Failed to generate step'}
                                  </p>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleRetryStep(step.stepNumber)
                                    }
                                    className="gap-2"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                    Retry Step
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                          return groupStepRows(steps).map((row) => {
                            if (row.type === 'single') {
                              return renderCard(row.step, row.idx, false);
                            }
                            return (
                              <div
                                key={`group-${row.groupBase}`}
                                className="space-y-2"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="h-px flex-1 bg-violet-200" />
                                  <span className="text-xs font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                                    Scene {row.groupBase} — {row.steps.length}{' '}
                                    alternatives
                                  </span>
                                  <div className="h-px flex-1 bg-violet-200" />
                                </div>
                                <div className="flex gap-3">
                                  {row.steps.map((step, gIdx) => (
                                    <div
                                      key={step.stepNumber}
                                      className="flex-1 min-w-0"
                                    >
                                      {renderCard(
                                        step,
                                        row.startIdx + gIdx,
                                        true
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Run History */}
                  {(() => {
                    const historyRuns = runs.filter(
                      (r) => !(r.id === currentRunId && steps.length > 0)
                    );
                    return (
                      <div>
                        {steps.length > 0 && historyRuns.length > 0 && (
                          <h3 className="text-sm font-semibold text-slate-700 mb-3 mt-2">
                            Run History
                          </h3>
                        )}
                        {historyRuns.length === 0 && steps.length === 0 && (
                          <div className="text-sm text-muted-foreground">
                            Pipeline outputs and live preview will render here.
                          </div>
                        )}
                        <div className="space-y-3">
                          {historyRuns.map((run) => {
                            const isExpanded = expandedRunIds.has(run.id);
                            return (
                              <div
                                key={run.id}
                                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                              >
                                <button
                                  className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
                                  onClick={() =>
                                    setExpandedRunIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(run.id)) next.delete(run.id);
                                      else next.add(run.id);
                                      return next;
                                    })
                                  }
                                >
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={cn(
                                        'w-2 h-2 rounded-full shrink-0',
                                        run.status === 'done'
                                          ? 'bg-emerald-500'
                                          : run.status === 'error'
                                            ? 'bg-red-500'
                                            : 'bg-amber-500 animate-pulse'
                                      )}
                                    />
                                    <span className="font-semibold text-slate-800 text-sm">
                                      {run.id.replace('run_', 'Run ')}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                      {modelShortName(run.model)}
                                    </span>
                                    <span className="text-xs text-slate-400">
                                      {run.clipCount} clips
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs text-slate-400">
                                      {timeAgo(run.createdAt)}
                                    </span>
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4 text-slate-400" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4 text-slate-400" />
                                    )}
                                  </div>
                                </button>

                                {isExpanded && (
                                  <div className="border-t border-slate-100 p-4 space-y-4">
                                    {run.steps && run.steps.length > 0 ? (
                                      <div className="space-y-3">
                                        {(() => {
                                          const isAllDone =
                                            run.steps.length > 0 &&
                                            run.steps.every(
                                              (s) => s.status === 'done'
                                            );
                                          if (!isAllDone) return null;
                                          const runIsNoExtend =
                                            run.steps.length > 1 &&
                                            run.isExtendEnabled === false;
                                          const runHasVariants = run.steps.some(
                                            (s) =>
                                              getVariantLetter(s.label) !== null
                                          );

                                          // Variation run: show one player per final letter
                                          if (
                                            runIsNoExtend &&
                                            runHasVariants &&
                                            run.stitchedVideoUrls
                                          ) {
                                            return (
                                              <div className="mb-4 space-y-3">
                                                {Object.entries(
                                                  run.stitchedVideoUrls
                                                )
                                                  .sort()
                                                  .map(([letter, url]) => (
                                                    <div
                                                      key={letter}
                                                      className="rounded-lg border border-violet-200 overflow-hidden p-3"
                                                    >
                                                      <div className="flex items-center justify-between mb-2">
                                                        <div className="text-sm font-semibold text-slate-800">
                                                          Final {letter}
                                                          {run.topicName
                                                            ? ` (${run.topicName})`
                                                            : ''}
                                                        </div>
                                                        <button
                                                          onClick={async () => {
                                                            const res =
                                                              await fetch(url);
                                                            const blob =
                                                              await res.blob();
                                                            const blobUrl =
                                                              window.URL.createObjectURL(
                                                                blob
                                                              );
                                                            const a =
                                                              document.createElement(
                                                                'a'
                                                              );
                                                            a.href = blobUrl;
                                                            a.download = `${run.topicName || 'video'}-Final${letter}.mp4`;
                                                            document.body.appendChild(
                                                              a
                                                            );
                                                            a.click();
                                                            window.URL.revokeObjectURL(
                                                              blobUrl
                                                            );
                                                            document.body.removeChild(
                                                              a
                                                            );
                                                          }}
                                                          className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800"
                                                        >
                                                          <Download className="w-3 h-3" />{' '}
                                                          Download
                                                        </button>
                                                      </div>
                                                      <video
                                                        src={url}
                                                        controls
                                                        className="w-full rounded aspect-video object-contain bg-black"
                                                      />
                                                    </div>
                                                  ))}
                                              </div>
                                            );
                                          }

                                          let finalVideoUrl = '';
                                          if (runIsNoExtend) {
                                            finalVideoUrl =
                                              run.stitchedVideoUrl || '';
                                          } else {
                                            const lastDoneStep =
                                              run.steps[run.steps.length - 1];
                                            finalVideoUrl =
                                              lastDoneStep?.videoUrl || '';
                                          }
                                          if (!finalVideoUrl) return null;
                                          return (
                                            <div className="mb-4">
                                              <div className="flex items-center justify-between mb-2">
                                                <div className="text-sm font-semibold text-slate-800">
                                                  Final Complete Video{' '}
                                                  {run.topicName
                                                    ? `(${run.topicName})`
                                                    : ''}
                                                </div>
                                                {run.steps.length > 1 &&
                                                  run.isExtendEnabled ===
                                                    false && (
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      className="h-7 gap-1.5 text-xs px-2"
                                                      onClick={async () => {
                                                        try {
                                                          const videoUrls =
                                                            run.steps
                                                              .map(
                                                                (s) =>
                                                                  s.videoUrl
                                                              )
                                                              .filter(
                                                                (
                                                                  url
                                                                ): url is string =>
                                                                  !!url
                                                              );

                                                          if (
                                                            videoUrls.length > 1
                                                          ) {
                                                            const stitchRes =
                                                              await fetch(
                                                                '/api/sandbox/stitch',
                                                                {
                                                                  method:
                                                                    'POST',
                                                                  headers: {
                                                                    'Content-Type':
                                                                      'application/json',
                                                                  },
                                                                  body: JSON.stringify(
                                                                    {
                                                                      videoUrls,
                                                                      filename: `stitched_${sandboxId}_${run.id}.mp4`,
                                                                    }
                                                                  ),
                                                                }
                                                              );
                                                            if (stitchRes.ok) {
                                                              const stitchData =
                                                                await stitchRes.json();
                                                              let newStitchedUrl =
                                                                stitchData.videoUrl;
                                                              if (
                                                                newStitchedUrl
                                                              ) {
                                                                newStitchedUrl =
                                                                  newStitchedUrl.split(
                                                                    '?'
                                                                  )[0] +
                                                                  `?t=${Date.now()}`;
                                                              }
                                                              await setDoc(
                                                                doc(
                                                                  collection(
                                                                    db,
                                                                    'sandbox',
                                                                    sandboxId!
                                                                  ),
                                                                  'generatedVideos',
                                                                  run.id
                                                                ),
                                                                {
                                                                  stitchedVideoUrl:
                                                                    newStitchedUrl,
                                                                },
                                                                { merge: true }
                                                              );
                                                              setRuns((prev) =>
                                                                prev.map((r) =>
                                                                  r.id ===
                                                                  run.id
                                                                    ? {
                                                                        ...r,
                                                                        stitchedVideoUrl:
                                                                          newStitchedUrl,
                                                                      }
                                                                    : r
                                                                )
                                                              );
                                                            }
                                                          }
                                                        } catch (e) {
                                                          console.error(
                                                            'Failed to restitch video manually',
                                                            e
                                                          );
                                                        }
                                                      }}
                                                    >
                                                      <RotateCcw className="w-3 h-3" />{' '}
                                                      Recreate Video
                                                    </Button>
                                                  )}
                                              </div>
                                              <video
                                                src={finalVideoUrl}
                                                controls
                                                className="w-full rounded-lg aspect-video object-contain bg-black"
                                              />
                                              <div className="mt-2 flex justify-end gap-2">
                                                <button
                                                  onClick={async () => {
                                                    try {
                                                      const videoUrls =
                                                        run.steps
                                                          .map(
                                                            (s) => s.videoUrl
                                                          )
                                                          .filter(
                                                            (
                                                              url
                                                            ): url is string =>
                                                              !!url
                                                          );
                                                      if (
                                                        videoUrls.length === 0
                                                      )
                                                        return;
                                                      const res = await fetch(
                                                        '/api/sandbox/stitch',
                                                        {
                                                          method: 'POST',
                                                          headers: {
                                                            'Content-Type':
                                                              'application/json',
                                                          },
                                                          body: JSON.stringify({
                                                            videoUrls,
                                                            filename: `stitched_${sandboxId}_${run.id}.mp4`,
                                                            extractAudio: true,
                                                          }),
                                                        }
                                                      );
                                                      if (res.ok) {
                                                        const data =
                                                          await res.json();
                                                        if (data.audioUrl) {
                                                          const fetchRes =
                                                            await fetch(
                                                              data.audioUrl
                                                            );
                                                          const blob =
                                                            await fetchRes.blob();
                                                          const blobUrl =
                                                            window.URL.createObjectURL(
                                                              blob
                                                            );
                                                          const a =
                                                            document.createElement(
                                                              'a'
                                                            );
                                                          a.href = blobUrl;
                                                          a.download = `${run.topicName || 'complete-audio'}-${Date.now()}.mp3`;
                                                          document.body.appendChild(
                                                            a
                                                          );
                                                          a.click();
                                                          window.URL.revokeObjectURL(
                                                            blobUrl
                                                          );
                                                          document.body.removeChild(
                                                            a
                                                          );
                                                        }
                                                      }
                                                    } catch (err) {
                                                      console.error(
                                                        'Audio download failed',
                                                        err
                                                      );
                                                    }
                                                  }}
                                                  className="inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors h-7 px-3 gap-1.5 text-violet-700 bg-violet-100 hover:bg-violet-200 shadow-sm"
                                                >
                                                  <Download className="w-3 h-3" />{' '}
                                                  Audio
                                                </button>
                                                <button
                                                  onClick={async () => {
                                                    try {
                                                      const res =
                                                        await fetch(
                                                          finalVideoUrl
                                                        );
                                                      const blob =
                                                        await res.blob();
                                                      const url =
                                                        window.URL.createObjectURL(
                                                          blob
                                                        );
                                                      const a =
                                                        document.createElement(
                                                          'a'
                                                        );
                                                      a.href = url;
                                                      a.download = `${run.topicName || 'complete-video'}-${Date.now()}.mp4`;
                                                      document.body.appendChild(
                                                        a
                                                      );
                                                      a.click();
                                                      window.URL.revokeObjectURL(
                                                        url
                                                      );
                                                      document.body.removeChild(
                                                        a
                                                      );
                                                    } catch (err) {
                                                      console.error(
                                                        'Download failed',
                                                        err
                                                      );
                                                    }
                                                  }}
                                                  className="inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors h-7 px-3 gap-1.5 text-white bg-violet-600 hover:bg-violet-700 shadow-sm"
                                                >
                                                  <Download className="w-3 h-3" />{' '}
                                                  Download
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })()}
                                        {[...run.steps]
                                          .sort(
                                            (a, b) =>
                                              a.stepNumber - b.stepNumber
                                          )
                                          .map((step) => (
                                            <div
                                              key={step.stepNumber}
                                              className="relative"
                                            >
                                              <div className="flex justify-between items-center mb-1.5">
                                                <div className="text-xs font-medium text-slate-600">
                                                  Clip{' '}
                                                  {step.label ??
                                                    step.stepNumber}
                                                </div>
                                                {step.videoVersions &&
                                                  step.videoVersions.length >
                                                    0 && (
                                                    <div className="flex items-center gap-1 bg-slate-100 rounded p-0.5">
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-5 w-5 p-0"
                                                        disabled={
                                                          step.activeVersionIndex ===
                                                          0
                                                        }
                                                        onClick={() =>
                                                          handleChangeStepVersion(
                                                            step.stepNumber,
                                                            run.id,
                                                            (step.activeVersionIndex ||
                                                              0) - 1
                                                          )
                                                        }
                                                      >
                                                        <ChevronDown className="w-3 h-3 rotate-90" />
                                                      </Button>
                                                      <span className="text-[10px] font-medium text-slate-500 min-w-[50px] text-center">
                                                        Ver{' '}
                                                        {
                                                          step.videoVersions[
                                                            step.activeVersionIndex ||
                                                              0
                                                          ].version
                                                        }
                                                      </span>
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-5 w-5 p-0"
                                                        disabled={
                                                          step.activeVersionIndex ===
                                                          step.videoVersions
                                                            .length -
                                                            1
                                                        }
                                                        onClick={() =>
                                                          handleChangeStepVersion(
                                                            step.stepNumber,
                                                            run.id,
                                                            (step.activeVersionIndex ||
                                                              0) + 1
                                                          )
                                                        }
                                                      >
                                                        <ChevronDown className="w-3 h-3 -rotate-90" />
                                                      </Button>
                                                    </div>
                                                  )}
                                              </div>
                                              {step.videoUrl && (
                                                <video
                                                  src={step.videoUrl}
                                                  controls
                                                  className="w-full rounded-lg aspect-video object-contain bg-black"
                                                />
                                              )}
                                            </div>
                                          ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-slate-500">
                                        Legacy run (no step data).
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Final Edited Video */}
                  {sandboxId && (
                    <div className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-700">
                          Final Edited Video
                        </h3>
                        <div className="flex items-center gap-2">
                          {isPosted && (
                            <span className="text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full font-medium">
                              Posted
                            </span>
                          )}
                          {finalEditedVideo && (
                            <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                              Uploaded
                            </span>
                          )}
                        </div>
                      </div>
                      {finalEditedVideo && !isPosted && (
                        <button
                          onClick={handleMarkPosted}
                          disabled={isMarkingPosted}
                          className="w-full mb-3 flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                        >
                          {isMarkingPosted ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Marking…
                            </>
                          ) : (
                            'Mark as Posted'
                          )}
                        </button>
                      )}
                      {finalEditedVideo && (
                        <video
                          src={finalEditedVideo}
                          controls
                          className="w-full rounded-lg aspect-video object-contain bg-black mb-3"
                        />
                      )}
                      <label className="flex items-center justify-center gap-2 w-full cursor-pointer border-2 border-dashed border-slate-200 rounded-lg py-3 px-4 text-sm text-slate-500 hover:border-violet-400 hover:text-violet-600 transition-colors">
                        {isUploadingFinalVideo ? (
                          <>
                            <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                            Uploading…
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            {finalEditedVideo
                              ? 'Replace final video'
                              : 'Upload final edited video'}
                          </>
                        )}
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          disabled={isUploadingFinalVideo}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadFinalVideo(file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <ProviderBadge hideBadge />

      {/* Image lightbox */}
      {lightboxIndex !== null && avatarImages[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
            onClick={() => setLightboxIndex(null)}
          >
            <X className="w-6 h-6" />
          </button>

          {/* Left arrow */}
          {avatarImages.length > 1 && (
            <button
              className="absolute left-4 text-white/70 hover:text-white transition-colors p-2"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(
                  (lightboxIndex - 1 + avatarImages.length) %
                    avatarImages.length
                );
              }}
            >
              <ChevronDown className="w-8 h-8 rotate-90" />
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarImages[lightboxIndex].previewUrl}
            alt="Reference full"
            className="max-h-[85vh] max-w-[85vw] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Right arrow */}
          {avatarImages.length > 1 && (
            <button
              className="absolute right-4 text-white/70 hover:text-white transition-colors p-2"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((lightboxIndex + 1) % avatarImages.length);
              }}
            >
              <ChevronDown className="w-8 h-8 -rotate-90" />
            </button>
          )}

          {/* Counter */}
          <span className="absolute bottom-4 text-white/60 text-sm">
            {lightboxIndex + 1} / {avatarImages.length}
          </span>
        </div>
      )}

      {/* Delete sandbox confirmation */}
      <Dialog
        open={!!sandboxToDelete}
        onOpenChange={(open) => {
          if (!open) setSandboxToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sandbox</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <strong>{sandboxToDelete?.name}</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSandboxToDelete(null)}
              disabled={isDeletingSandbox}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSandbox}
              disabled={isDeletingSandbox}
            >
              {isDeletingSandbox ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
