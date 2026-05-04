'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  limit,
  getDocs,
} from 'firebase/firestore';
import { useAuth } from '@/lib/AuthContext';
import { useProvider } from '@/lib/ProviderContext';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ProviderBadge from '@/components/ProviderBadge';
import { DEFAULT_VIDEO_PROMPT } from './constants';

export type StepSlot = {
  stepNumber: number;
  dialogue: string;
  status: 'idle' | 'generating' | 'done' | 'error';
  videoUrl?: string;
  errorMsg?: string;
  cumulativeDuration?: number;
  completedAt?: number;
  videoReferenceUrl?: string;
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

export default function SandboxPage() {
  const { user } = useAuth();
  const { providerConfig } = useProvider();
  const [avatarImage, setAvatarImage] = useState<{
    file?: File;
    previewUrl: string;
  } | null>(null);
  const [targetDuration, setTargetDuration] = useState<number>(36);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const clipCount = 1 + Math.floor((targetDuration - 8) / 7);
  const [model, setModel] = useState<string>('veo-3.1-fast-generate-preview');
  const [defaultVideoPrompt, setDefaultVideoPrompt] =
    useState<string>(DEFAULT_VIDEO_PROMPT);
  const [videoQuality, setVideoQuality] = useState<'720p' | '1080p' | '4k'>(
    '1080p'
  );

  // Script Generation State
  const [goalText, setGoalText] = useState<string>('');
  const [generatedScript, setGeneratedScript] = useState<
    { id: number; text: string }[] | null
  >(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState<boolean>(false);
  const [filmDirectionSystem, setFilmDirectionSystem] = useState<string | null>(
    null
  );
  const [isAiGeneratedPrompt, setIsAiGeneratedPrompt] =
    useState<boolean>(false);
  const [isRegeneratingPrompt, setIsRegeneratingPrompt] =
    useState<boolean>(false);

  const [steps, setSteps] = useState<StepSlot[]>([]);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [isCreatingSandbox, setIsCreatingSandbox] = useState<boolean>(false);
  const [isCreatingVideos, setIsCreatingVideos] = useState<boolean>(false);

  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [expandedRunIds, setExpandedRunIds] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isCreatingVideosRef = useRef<boolean>(false);

  useEffect(() => {
    isCreatingVideosRef.current = isCreatingVideos;
  }, [isCreatingVideos]);

  // Fetch Film Direction System on mount
  useEffect(() => {
    getDoc(doc(db, 'intelligence', 'filmDirectionSystem'))
      .then((snap) => {
        setFilmDirectionSystem(
          snap.exists() ? (snap.data()?.filmDirectionSystem ?? null) : null
        );
      })
      .catch(() => setFilmDirectionSystem(null));
  }, []);

  // Load the default prompt from localStorage on mount
  useEffect(() => {
    const savedPrompt = localStorage.getItem('sandbox_default_prompt');
    if (savedPrompt) {
      setDefaultVideoPrompt(savedPrompt);
    }
  }, []);

  // Load the latest sandbox for the user on mount
  useEffect(() => {
    if (!sandboxId && user) {
      const fetchLatestSandbox = async () => {
        try {
          const q = query(
            collection(db, 'sandbox'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc'),
            limit(1)
          );
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            const latestDoc = querySnapshot.docs[0];
            setSandboxId(latestDoc.id);
          }
        } catch (error) {
          console.error('Failed to fetch latest sandbox:', error);
        }
      };
      fetchLatestSandbox();
    }
  }, [user, sandboxId]);

  useEffect(() => {
    const fetchSandboxData = async () => {
      if (sandboxId && user) {
        try {
          const snap = await getDoc(doc(collection(db, 'sandbox'), sandboxId));
          if (snap.exists()) {
            const data = snap.data();
            if (data.referenceImage && !avatarImage?.previewUrl) {
              setAvatarImage({ previewUrl: data.referenceImage });
            }
            if (data.config) {
              if (data.config.aspectRatio)
                setAspectRatio(data.config.aspectRatio);
              if (data.config.model) setModel(data.config.model);
              if (data.config.videoQuality)
                setVideoQuality(data.config.videoQuality);
              if (data.config.videoCount) {
                setTargetDuration(8 + (data.config.videoCount - 1) * 7);
              }
            }
            if (data.goal) setGoalText(data.goal);
            if (data.defaultVideoPrompt)
              setDefaultVideoPrompt(data.defaultVideoPrompt);
            if (data.scripts) setGeneratedScript(data.scripts);
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
                setIsCreatingVideos(false);
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
      aspectRatio: string;
      model: string;
      videoQuality: string;
      serviceProvider: string;
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

  const durationMismatch =
    generatedScript !== null && generatedScript.length !== clipCount;

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
      setGeneratedScript(null);
      setAvatarImage(null);
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sandboxId) return;

    if (avatarImage?.previewUrl) {
      URL.revokeObjectURL(avatarImage.previewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setAvatarImage({ file, previewUrl });

    try {
      const avatarExt = file.name.split('.').pop() || 'png';
      const avatarBlobUrl = await uploadToVercelBlob(
        file,
        `sandbox/${sandboxId}/avatar.${avatarExt}`
      );

      await setDoc(
        doc(collection(db, 'sandbox'), sandboxId),
        {
          referenceImage: avatarBlobUrl,
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Failed to upload image', err);
    }
  };

  const removeImage = async () => {
    if (avatarImage?.previewUrl) {
      URL.revokeObjectURL(avatarImage.previewUrl);
    }
    setAvatarImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (sandboxId) {
      await setDoc(
        doc(collection(db, 'sandbox'), sandboxId),
        {
          referenceImage: null,
        },
        { merge: true }
      );
    }
  };

  const canCreate =
    !!avatarImage &&
    generatedScript !== null &&
    !durationMismatch &&
    defaultVideoPrompt.trim().length > 0;

  const getImageBase64 = async (): Promise<{
    base64: string;
    mimeType: string;
  }> => {
    if (!avatarImage) throw new Error('No image');
    if (avatarImage.file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(avatarImage.file!);
        reader.onload = () => {
          const result = reader.result as string;
          resolve({
            base64: result.split(',')[1],
            mimeType: avatarImage.file!.type,
          });
        };
        reader.onerror = reject;
      });
    } else if (avatarImage.previewUrl) {
      const res = await fetch(avatarImage.previewUrl);
      const blob = await res.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onload = () => {
          const result = reader.result as string;
          resolve({ base64: result.split(',')[1], mimeType: blob.type });
        };
        reader.onerror = reject;
      });
    }
    throw new Error('Invalid image state');
  };

  const uploadToVercelBlob = async (file: Blob | File, filename: string) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(
      `/api/upload?filename=${encodeURIComponent(filename)}`,
      {
        method: 'POST',
        body: file,
      }
    );
    if (!res.ok) throw new Error('Failed to upload to blob');
    const data = await res.json();
    return data.url as string;
  };

  // Helper to run a step
  const runStep = async (
    stepNumber: number,
    runId: string,
    currentSteps: StepSlot[]
  ) => {
    if (!sandboxId || !avatarImage) return currentSteps;

    const providerStr = providerConfig.activeProvider;
    const isStep1 = stepNumber === 1;

    // Update local state and firestore to generating
    const generatingSteps = currentSteps.map((s) => {
      const step = { ...s };
      if (step.stepNumber === stepNumber) {
        step.status = 'generating' as const;
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
      const scriptText = generatedScript?.[stepNumber - 1]?.text || '';
      const finalPrompt = scriptText
        ? `${defaultVideoPrompt}. ${scriptText}`
        : defaultVideoPrompt;
      let finalBlobUrl = '';
      let stepRefUrl = undefined;

      if (isStep1) {
        const imgData = await getImageBase64();
        const endpoint =
          providerStr === 'vertex'
            ? '/api/script/generate-video/vertex/image-refs'
            : '/api/script/generate-video/image-refs';

        console.log(
          `[Sandbox] Step ${stepNumber}: Calling Image-Refs API (${endpoint})`
        );

        const payload = {
          defaultPrompt: defaultVideoPrompt,
          clipDialogue: scriptText,
          prompt: finalPrompt,
          modelName: model,
          aspectRatio,
          resolution: videoQuality,
          referenceImages: [
            { data: imgData.base64, mime_type: imgData.mimeType },
          ],
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
          throw new Error(errData.error || `HTTP error! status: ${res.status}`);
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
          throw new Error(errData.error || `HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        finalBlobUrl = data.video_url || data.videoUrl;
        if (data.video_reference_url || data.videoReferenceUrl) {
          stepRefUrl = data.video_reference_url || data.videoReferenceUrl;
        }
      }

      const dur = 8 + (stepNumber - 1) * 7;
      const doneSteps = generatingSteps.map((s) =>
        s.stepNumber === stepNumber
          ? {
              ...s,
              status: 'done' as const,
              videoUrl: finalBlobUrl,
              videoReferenceUrl: stepRefUrl,
              completedAt: Date.now(),
              cumulativeDuration: dur,
            }
          : s
      );

      setSteps(doneSteps);

      return doneSteps;
    } catch (error: any) {
      console.error(`Error in step ${stepNumber}:`, error);
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
    if (!avatarImage || !generatedScript || !user || !sandboxId) return;
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
        dialogue: generatedScript?.[i]?.text || '',
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      let currentStepsState = initialSteps;
      for (let i = 1; i <= numberOfVideos; i++) {
        currentStepsState = await runStep(i, runId, currentStepsState);
        const justFinished = currentStepsState.find((s) => s.stepNumber === i);
        if (justFinished?.status === 'error') {
          setIsCreatingVideos(false);
          return; // Stop the chain
        }
      }

      await setDoc(
        runDocRef,
        { status: 'done', updatedAt: serverTimestamp() },
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

  const handleRetryStep = async (stepNumber: number) => {
    if (!currentRunId) return;
    setIsCreatingVideos(true);
    let currentStepsState = steps;

    // We only retry this step, and if it succeeds we should ideally continue the chain.
    const numberOfVideos =
      generatedScript && generatedScript.length > 0
        ? generatedScript.length
        : clipCount;

    for (let i = stepNumber; i <= numberOfVideos; i++) {
      currentStepsState = await runStep(i, currentRunId, currentStepsState);
      const justFinished = currentStepsState.find((s) => s.stepNumber === i);
      if (justFinished?.status === 'error') {
        setIsCreatingVideos(false);
        return; // Stop the chain
      }
    }

    setIsCreatingVideos(false);
  };

  const handleRegeneratePrompt = async () => {
    if (!filmDirectionSystem || !avatarImage) return;
    setIsRegeneratingPrompt(true);

    try {
      const imgData = await getImageBase64();
      const existingDialogues = generatedScript?.map((s) => s.text) || [];
      const response = await fetch('/api/sandbox/generate-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalText: goalText.trim(),
          clipCount,
          filmDirectionSystem,
          avatarImageBase64: imgData.base64,
          promptOnlyMode: true,
          existingDialogues,
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
          await setDoc(
            doc(collection(db, 'sandbox'), sandboxId),
            { defaultVideoPrompt: data.videoPrompt },
            { merge: true }
          );
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
      let avatarBase64: string | undefined;
      if (avatarImage) {
        try {
          const imgData = await getImageBase64();
          avatarBase64 = imgData.base64;
        } catch (e) {
          console.warn('Could not get image base64 for script generation', e);
        }
      }

      const payload: any = {
        goalText: goalText.trim(),
        clipCount,
      };

      if (filmDirectionSystem && avatarBase64) {
        payload.filmDirectionSystem = filmDirectionSystem;
        payload.avatarImageBase64 = avatarBase64;
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
      if (data.dialogues && Array.isArray(data.dialogues)) {
        const newScripts = data.dialogues.map((text: string, idx: number) => ({
          id: idx + 1,
          text,
        }));
        setGeneratedScript(newScripts);
        if (data.videoPrompt) {
          setDefaultVideoPrompt(data.videoPrompt);
          setIsAiGeneratedPrompt(true);
          localStorage.setItem('sandbox_default_prompt', data.videoPrompt);
        }
        if (sandboxId) {
          await setDoc(
            doc(collection(db, 'sandbox'), sandboxId),
            {
              goal: goalText.trim(),
              scripts: newScripts,
              ...(data.videoPrompt
                ? { defaultVideoPrompt: data.videoPrompt }
                : {}),
            },
            { merge: true }
          );
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

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <div className="p-6 pb-4 flex-shrink-0 border-b border-border flex justify-between items-center">
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
        {sandboxId && (
          <Button
            onClick={handleCreateSandbox}
            disabled={isCreatingSandbox}
            variant="outline"
            className="gap-2"
          >
            <Sparkles className="w-4 h-4" />
            New Sandbox
          </Button>
        )}
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
              Create a new sandbox instance to experiment with video generation.
              All scripts, images, and settings will be automatically saved to
              this instance.
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
              {isCreatingSandbox ? 'Creating...' : 'Create Sandbox Instance'}
            </Button>
          </div>
        ) : (
          <>
            {/* Left Column: Controls */}
            <div className="h-full min-h-0 overflow-y-auto p-6 bg-slate-50/50 flex flex-col gap-6">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col shrink-0">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-violet-500" />
                    <h2 className="font-semibold text-slate-800">
                      Avatar Image
                    </h2>
                  </div>
                </div>
                <div className="p-4 flex-1">
                  {!avatarImage ? (
                    <div
                      className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 transition-colors bg-slate-50/50"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 mb-3">
                        <Upload className="w-5 h-5 text-violet-500" />
                      </div>
                      <h3 className="font-medium text-slate-800 mb-1">
                        Upload Reference Image
                      </h3>
                      <p className="text-xs text-slate-500">
                        Supports JPG, PNG (Max 5MB)
                      </p>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                      />
                    </div>
                  ) : (
                    <div className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square max-h-[300px] w-full max-w-[300px] mx-auto">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatarImage.previewUrl}
                        alt="Avatar Reference"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={removeImage}
                          className="gap-1.5"
                        >
                          <X className="w-4 h-4" /> Remove Image
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Script Generation Panel */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col shrink-0">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-violet-500" />
                    <h2 className="font-semibold text-slate-800">
                      Script & Dialogue
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
                        max="36"
                        step="7"
                        value={targetDuration}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setTargetDuration(val);
                          updateConfigInDb({
                            clipCount: 1 + Math.floor((val - 8) / 7),
                          });
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
                </div>
              </div>

              {generatedScript && generatedScript.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col shrink-0">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-violet-500" />
                      <h2 className="font-semibold text-slate-800">
                        Generated Dialogues ({generatedScript.length})
                      </h2>
                    </div>
                  </div>
                  <div className="p-4 space-y-4">
                    {durationMismatch && (
                      <div className="p-3 bg-amber-50 text-amber-700 text-sm rounded-lg border border-amber-200">
                        Duration changed — regenerate script to match clip count
                      </div>
                    )}
                    <div className="space-y-3">
                      {generatedScript.map((script, index) => (
                        <div
                          key={index}
                          className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600"
                        >
                          <span className="font-medium text-slate-800 mr-2">
                            Clip {script.id}:
                          </span>
                          <Textarea
                            value={script.text}
                            onChange={(e) => {
                              const newScripts = [...generatedScript];
                              newScripts[index].text = e.target.value;
                              setGeneratedScript(newScripts);
                              if (sandboxId) {
                                setDoc(
                                  doc(collection(db, 'sandbox'), sandboxId),
                                  { scripts: newScripts },
                                  { merge: true }
                                );
                              }
                            }}
                            className="mt-2 min-h-[60px] resize-y text-slate-700 bg-white"
                          />
                        </div>
                      ))}
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
                        {isAiGeneratedPrompt &&
                          filmDirectionSystem &&
                          avatarImage && (
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
                          localStorage.setItem('sandbox_default_prompt', val);
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
                            setVideoQuality(quality as '720p' | '1080p' | '4k');
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
                              Veo 3.1 Lite supports 1 image max per shot. Extra
                              images are ignored.
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
                                This model uses Evolink and ignores the Vertex
                                AI toggle.
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
              <h2 className="text-lg font-semibold mb-4">Output / Preview</h2>

              {/* Complete Video View */}
              {(() => {
                const isAllDone =
                  steps.length > 0 && steps.every((s) => s.status === 'done');
                if (!isAllDone) return null;
                const lastDoneStep = steps[steps.length - 1];
                if (!lastDoneStep?.videoUrl) return null;
                return (
                  <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4">
                    <h3 className="font-semibold text-slate-800 mb-3">
                      Final Complete Video
                    </h3>
                    <video
                      src={lastDoneStep.videoUrl}
                      controls
                      className="w-full rounded-lg aspect-video object-contain bg-black"
                    />
                    <div className="mt-4 flex justify-end">
                      <a
                        href={lastDoneStep.videoUrl}
                        download
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors h-9 px-4 gap-2 text-white bg-violet-600 hover:bg-violet-700 shadow-sm"
                      >
                        <Download className="w-4 h-4" /> Download Complete Video
                      </a>
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
                      <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                        Generating
                      </span>
                    )}
                  </div>

                  {/* Sequential Steps */}
                  <div className="space-y-4">
                    {steps.map((step, idx) => (
                      <div
                        key={step.stepNumber}
                        className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-slate-800">
                              {idx === steps.length - 1 &&
                              step.status === 'done'
                                ? 'Final Video'
                                : `Step ${step.stepNumber}`}
                            </h3>
                            {step.cumulativeDuration && (
                              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                ~{step.cumulativeDuration}s
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {step.status === 'generating' && (
                              <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full flex items-center gap-1">
                                <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                Generating
                              </span>
                            )}
                            {step.status === 'done' && step.videoUrl && (
                              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                                Completed
                              </span>
                            )}
                            {step.status === 'done' && !step.videoUrl && (
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
                        </div>
                        {step.dialogue && (
                          <div className="mb-3 text-sm text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                            <span className="font-medium text-slate-700 mr-2">
                              Dialogue:
                            </span>
                            {step.dialogue}
                          </div>
                        )}
                        {step.status === 'generating' && (
                          <div className="aspect-video bg-slate-100 rounded-lg animate-pulse flex items-center justify-center">
                            <ImageIcon className="w-8 h-8 text-slate-300" />
                          </div>
                        )}
                        {step.status === 'done' && step.videoUrl && (
                          <div>
                            <video
                              src={step.videoUrl}
                              controls
                              className="w-full rounded-lg aspect-video object-cover bg-black"
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
                            {idx === steps.length - 1 && (
                              <div className="mt-3 flex justify-end">
                                <a
                                  href={step.videoUrl}
                                  download
                                  className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors h-8 px-4 gap-1.5 text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm"
                                >
                                  Download Output
                                </a>
                              </div>
                            )}
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
                              onClick={() => handleRetryStep(step.stepNumber)}
                              className="gap-2"
                            >
                              <RotateCcw className="w-4 h-4" />
                              Retry Step
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
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
                                      const lastDoneStep =
                                        run.steps[run.steps.length - 1];
                                      if (!lastDoneStep?.videoUrl) return null;
                                      return (
                                        <div className="mb-4">
                                          <div className="text-sm font-semibold text-slate-800 mb-2">
                                            Final Complete Video
                                          </div>
                                          <video
                                            src={lastDoneStep.videoUrl}
                                            controls
                                            className="w-full rounded-lg aspect-video object-cover bg-black"
                                          />
                                          <div className="mt-2 flex justify-end">
                                            <a
                                              href={lastDoneStep.videoUrl}
                                              download
                                              className="inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors h-7 px-3 gap-1.5 text-white bg-violet-600 hover:bg-violet-700 shadow-sm"
                                            >
                                              <Download className="w-3 h-3" />{' '}
                                              Download
                                            </a>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                    {[...run.steps]
                                      .sort(
                                        (a, b) => a.stepNumber - b.stepNumber
                                      )
                                      .map((step) => (
                                        <div key={step.stepNumber}>
                                          <div className="text-xs font-medium text-slate-600 mb-1.5">
                                            Step {step.stepNumber}
                                          </div>
                                          {step.videoUrl && (
                                            <video
                                              src={step.videoUrl}
                                              controls
                                              className="w-full rounded-lg aspect-video object-cover bg-black"
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
            </div>
          </>
        )}
      </div>
      <ProviderBadge hideBadge />
    </div>
  );
}
