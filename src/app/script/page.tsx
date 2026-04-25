'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import * as initialData from './constants';
import DeviceAwareUpload from '@/components/DeviceAwareUpload';
import { ConfirmPopup } from '@/components/ConfirmPopup';
import PromptEditor from '@/components/PromptEditor';
import {
  saveGeneratedVideo,
  loadGeneratedVideosByThread,
  deleteGeneratedVideo,
  migrateVideosToThread,
} from '@/lib/generatedVideosDb';
import {
  saveImageToLibrary,
  loadAllLibraryImages,
  deleteLibraryImage,
} from '@/lib/imageLibraryDb';

type Shot = {
  shot_number: number;
  duration: number | string;
  resolution: string;
  aspectRatio: string;
  imageRefs: string[];
  prompt: string;
  selected?: boolean;
  status?: 'idle' | 'generating' | 'completed' | 'error';
  generatedVideoUrl?: string; // keeping for backwards compatibility
  generatedVideoUrls?: string[];
};

type ImageItem = {
  id: string;
  file: File;
  previewUrl: string;
  blobUrl?: string;
};

type ScriptThread = {
  id: string;
  name: string;
  createdAt: number;
};

function tryParseShots(raw: string): Shot[] {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function inferThreadName(shots: Shot[]): string {
  if (!shots.length) return 'Script 1';
  // Walk all shot prompts and collect the first descriptive line
  // (skip style/technical boilerplate lines)
  const skip =
    /^(style:|camera:|human movement:|no |single |only |aspect|resolution|duration)/i;
  for (const shot of shots.slice(0, 3)) {
    const lines = (shot.prompt || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (!skip.test(line) && line.length > 8) {
        // Take up to 5 words, strip trailing punctuation
        const name = line
          .split(/\s+/)
          .slice(0, 5)
          .join(' ')
          .replace(/[.,;:!?]+$/, '');
        if (name.length > 4) return name;
      }
    }
  }
  return `${shots.length}-Shot Script`;
}

/** Return a base64 string for the image. If the file exceeds 4 MB, resize to ≤1024px first. */
async function resizeImageToBase64(file: File, maxPx: number): Promise<string> {
  const FOUR_MB = 4 * 1024 * 1024;
  if (file.size <= FOUR_MB) {
    const buf = await file.arrayBuffer();
    return Buffer.from(buf).toString('base64');
  }
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve(dataUrl.split(',')[1]);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function ScriptPage() {
  const [threads, setThreads] = useState<ScriptThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingThreadName, setEditingThreadName] = useState('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [expandedShotIndex, setExpandedShotIndex] = useState<number | null>(0);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('veo-3.1-fast-generate-preview');
  const [isGenerating, setIsGenerating] = useState(false);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [recentSuccessUrls, setRecentSuccessUrls] = useState<string[]>([]);
  const [globals, setGlobals] = useState<
    { name: string; value: string; isEditing?: boolean }[]
  >([]);
  const [isGlobalsExpanded, setIsGlobalsExpanded] = useState(false);
  const [isShotsExpanded, setIsShotsExpanded] = useState(true);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(true);
  const [isLibraryExpanded, setIsLibraryExpanded] = useState(true);
  const [isMediaExpanded, setIsMediaExpanded] = useState(true);
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [isShotsBulkEditing, setIsShotsBulkEditing] = useState(false);
  const [shotsBulkText, setShotsBulkText] = useState('');
  const [shotsBulkWarning, setShotsBulkWarning] = useState<string | null>(null);
  const [editingVarIndex, setEditingVarIndex] = useState<number | null>(null);
  const [editingVarContent, setEditingVarContent] = useState({
    name: '',
    value: '',
  });
  const [isApiPopupOpen, setIsApiPopupOpen] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [shotToDelete, setShotToDelete] = useState<number | null>(null);
  const [isDeletingAllVars, setIsDeletingAllVars] = useState(false);
  const [varToDelete, setVarToDelete] = useState<number | null>(null);
  const [copiedShotIndex, setCopiedShotIndex] = useState<number | null>(null);
  const [isGlobalsBulkCopied, setIsGlobalsBulkCopied] = useState(false);
  const [isShotsBulkCopied, setIsShotsBulkCopied] = useState(false);
  const [imageLibraryModalShotIndex, setImageLibraryModalShotIndex] = useState<
    number | null
  >(null);
  const [selectedLibraryImages, setSelectedLibraryImages] = useState<string[]>(
    []
  );
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const [videoToDelete, setVideoToDelete] = useState<{
    shotIndex: number;
    urlIndex: number;
    url: string;
  } | null>(null);
  const [generationToast, setGenerationToast] = useState<string | null>(null);
  const generationToastTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const showGenerationToast = (msg: string) => {
    if (generationToastTimer.current)
      clearTimeout(generationToastTimer.current);
    setGenerationToast(msg);
    generationToastTimer.current = setTimeout(
      () => setGenerationToast(null),
      7000
    );
  };

  const generatedMediaRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (recentSuccessUrls.length > 0 && window.innerWidth < 1024) {
      setTimeout(() => {
        generatedMediaRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 100);
    }
  }, [recentSuccessUrls]);

  // Restore shots + videos for a given thread id (used on mount and on switch)
  const restoreThreadShots = (threadId: string, rawShots: Shot[]) => {
    // Always clear video URLs — blob: URLs expire on page unload. IndexedDB repopulates fresh ones.
    const resetShots = rawShots.map(
      (s: Shot) =>
        ({
          ...s,
          status:
            s.status === 'generating' ? 'idle' : (s.status as Shot['status']),
          imageRefs: Array.isArray(s.imageRefs)
            ? s.imageRefs.filter((ref) => ref !== '1' && ref !== '2')
            : [],
          generatedVideoUrls: [],
          generatedVideoUrl: undefined,
        }) as Shot
    );
    setShots(resetShots);

    loadGeneratedVideosByThread(threadId)
      .then((stored) => {
        console.log(
          `[restore] ${threadId}: ${stored.length} videos in IndexedDB`,
          stored.map((v) => v.id)
        );
        if (stored.length === 0) return;
        const blobMap = new Map(stored.map((v) => [v.id, v.blobUrl]));
        setShots((prev) =>
          prev.map((shot) => {
            const matchingUrls = [...blobMap.entries()]
              .filter(
                ([id]) =>
                  id.startsWith(`shot_${shot.shot_number}.`) ||
                  id.startsWith(`shot_${shot.shot_number}_`)
              )
              .map(([, url]) => url);
            if (matchingUrls.length === 0) return shot;
            return {
              ...shot,
              generatedVideoUrls: matchingUrls,
              generatedVideoUrl: matchingUrls[matchingUrls.length - 1],
              status: 'completed',
            } as Shot;
          })
        );
      })
      .catch((e) => {
        console.warn('[restore] loadGeneratedVideosByThread failed:', e);
      });
  };

  React.useEffect(() => {
    // --- Load or create threads ---
    let loadedThreads: ScriptThread[] = [];
    try {
      const raw = localStorage.getItem('script_threads');
      if (raw) loadedThreads = JSON.parse(raw);
    } catch {
      /* malformed — start fresh */
    }

    if (loadedThreads.length === 0) {
      // First run — migrate old localStorage keys into a default thread
      const firstId = `t_${Date.now()}`;
      const oldShots = localStorage.getItem('podcast_shots');
      const oldGlobals = localStorage.getItem('podcast_globals');
      if (oldShots) localStorage.setItem(`thread_${firstId}_shots`, oldShots);
      if (oldGlobals)
        localStorage.setItem(`thread_${firstId}_globals`, oldGlobals);
      const inferredName = inferThreadName(
        oldShots ? tryParseShots(oldShots) : []
      );
      loadedThreads = [
        { id: firstId, name: inferredName, createdAt: Date.now() },
      ];
      localStorage.setItem('script_threads', JSON.stringify(loadedThreads));
    }

    setThreads(loadedThreads);

    // --- Determine active thread ---
    const savedActiveId = localStorage.getItem('active_thread_id');
    const activeId =
      loadedThreads.find((t) => t.id === savedActiveId)?.id ??
      loadedThreads[loadedThreads.length - 1].id;
    setActiveThreadId(activeId);
    localStorage.setItem('active_thread_id', activeId);

    // --- Load active thread's globals ---
    const savedGlobals = localStorage.getItem(`thread_${activeId}_globals`);
    if (savedGlobals) {
      try {
        const parsedGlobals = JSON.parse(savedGlobals);
        setGlobals(parsedGlobals);
        setIsGlobalsExpanded(parsedGlobals.length === 0);
      } catch {
        setIsGlobalsExpanded(true);
      }
    } else {
      setIsGlobalsExpanded(true);
    }

    // --- Shared: API key, model, image library ---
    const savedApiKey = localStorage.getItem('veo_api_key');
    if (savedApiKey) setApiKey(savedApiKey);
    const savedModel = localStorage.getItem('veo_model');
    if (savedModel) setModel(savedModel);

    loadAllLibraryImages()
      .then((stored) => {
        if (stored.length > 0) setImages(stored);
      })
      .catch(() => {});

    // Migrate any bare-key IndexedDB videos to this thread, then load shots.
    // Chained so loadGeneratedVideosByThread always runs after migration's write transaction.
    const loadShotsAndMarkLoaded = () => {
      const savedShots = localStorage.getItem(`thread_${activeId}_shots`);
      if (savedShots) {
        try {
          restoreThreadShots(activeId, JSON.parse(savedShots));
        } catch {
          setShots([
            {
              shot_number: 1,
              duration: initialData.PODCAST_SHOTS[0]?.duration || 8,
              resolution: '720p',
              aspectRatio: '16:9',
              imageRefs: [],
              prompt: '',
              selected: false,
            },
          ]);
        }
      } else {
        setShots([
          {
            shot_number: 1,
            duration: initialData.PODCAST_SHOTS[0]?.duration || 8,
            resolution: '720p',
            aspectRatio: '16:9',
            imageRefs: [],
            prompt: '',
            selected: false,
          },
        ]);
      }
      setIsLoaded(true);
    };

    migrateVideosToThread(activeId)
      .then(loadShotsAndMarkLoaded)
      .catch(loadShotsAndMarkLoaded);
  }, []);

  React.useEffect(() => {
    if (isLoaded && activeThreadId) {
      localStorage.setItem(
        `thread_${activeThreadId}_shots`,
        JSON.stringify(shots)
      );
      localStorage.setItem(
        `thread_${activeThreadId}_globals`,
        JSON.stringify(globals)
      );
      localStorage.setItem('veo_api_key', apiKey);
      localStorage.setItem('veo_model', model);
    }
  }, [shots, globals, apiKey, model, isLoaded, activeThreadId]);

  const switchThread = (id: string) => {
    if (id === activeThreadId) return;
    // Eagerly persist current thread before switching
    localStorage.setItem(
      `thread_${activeThreadId}_shots`,
      JSON.stringify(shots)
    );
    localStorage.setItem(
      `thread_${activeThreadId}_globals`,
      JSON.stringify(globals)
    );

    setActiveThreadId(id);
    localStorage.setItem('active_thread_id', id);

    const savedShots = localStorage.getItem(`thread_${id}_shots`);
    if (savedShots) {
      try {
        restoreThreadShots(id, JSON.parse(savedShots));
      } catch {
        setShots([
          {
            shot_number: 1,
            duration: initialData.PODCAST_SHOTS[0]?.duration || 8,
            resolution: '720p',
            aspectRatio: '16:9',
            imageRefs: [],
            prompt: '',
            selected: false,
          },
        ]);
      }
    } else {
      setShots([
        {
          shot_number: 1,
          duration: initialData.PODCAST_SHOTS[0]?.duration || 8,
          resolution: '720p',
          aspectRatio: '16:9',
          imageRefs: [],
          prompt: '',
          selected: false,
        },
      ]);
    }

    const savedGlobals = localStorage.getItem(`thread_${id}_globals`);
    try {
      const g = savedGlobals ? JSON.parse(savedGlobals) : [];
      setGlobals(g);
      setIsGlobalsExpanded(g.length === 0);
    } catch {
      setGlobals([]);
      setIsGlobalsExpanded(true);
    }
  };

  const createThread = () => {
    const id = `t_${Date.now()}`;
    const name = `Script ${threads.length + 1}`;
    const newThread: ScriptThread = { id, name, createdAt: Date.now() };
    const updated = [newThread, ...threads];
    setThreads(updated);
    localStorage.setItem('script_threads', JSON.stringify(updated));
    switchThread(id);
  };

  const deleteThread = (id: string) => {
    if (threads.length === 1) return;
    const updated = threads.filter((t) => t.id !== id);
    setThreads(updated);
    localStorage.setItem('script_threads', JSON.stringify(updated));
    localStorage.removeItem(`thread_${id}_shots`);
    localStorage.removeItem(`thread_${id}_globals`);
    if (id === activeThreadId) switchThread(updated[updated.length - 1].id);
  };

  const renameThread = (id: string, name: string) => {
    const updated = threads.map((t) => (t.id === id ? { ...t, name } : t));
    setThreads(updated);
    localStorage.setItem('script_threads', JSON.stringify(updated));
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && playingVideoUrl) {
        setPlayingVideoUrl(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playingVideoUrl]);

  const addShot = () => {
    const newShot: Shot = {
      shot_number:
        shots.length > 0 ? Math.max(...shots.map((s) => s.shot_number)) + 1 : 1,
      duration: initialData.PODCAST_SHOTS[shots.length]?.duration || 8,
      resolution: initialData.PODCAST_SHOTS[shots.length]?.resolution || '720p',
      aspectRatio: '16:9',
      imageRefs: [],
      prompt: '',
      selected: false,
    };
    setShots([...shots, newShot]);
    setExpandedShotIndex(shots.length);
  };

  const removeShot = (index: number) => {
    const newShots = [...shots];
    newShots.splice(index, 1);
    setShots(newShots);
    if (expandedShotIndex === index) {
      setExpandedShotIndex(null);
    } else if (expandedShotIndex !== null && expandedShotIndex > index) {
      setExpandedShotIndex(expandedShotIndex - 1);
    }
  };

  // Add images to library + persist to IndexedDB, upload to Vercel Blob in background
  const addImagesToLibrary = (files: File[]) => {
    const newImages = files.map((file) => ({
      id: Math.random().toString(36).substring(7),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...newImages]);

    newImages.forEach((img) => {
      const formData = new FormData();
      formData.append('file', img.file);
      fetch('/api/images', { method: 'POST', body: formData })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.url) return;
          const blobUrl = data.url;
          setImages((prev) =>
            prev.map((i) => (i.id === img.id ? { ...i, blobUrl } : i))
          );
          saveImageToLibrary(img.id, img.file, blobUrl).catch(() => {});
        })
        .catch(() => {
          saveImageToLibrary(img.id, img.file).catch(() => {});
        });
    });

    return newImages;
  };

  // Update a specific shot
  const updateShot = (index: number, updates: Partial<Shot>) => {
    const newShots = [...shots];
    newShots[index] = { ...newShots[index], ...updates };
    setShots(newShots);
  };

  const handleCopyKey = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1500);
  };

  return (
    <div className="flex flex-col lg:flex-row lg:h-full bg-slate-50 text-slate-900 lg:overflow-hidden font-sans w-full min-w-0 box-border relative">
      {/* Generation error toast */}
      {generationToast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] max-w-sm w-[calc(100%-2rem)] flex items-start gap-3 bg-red-600 text-white text-sm px-4 py-3 rounded-xl shadow-xl">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span className="flex-1 leading-snug">{generationToast}</span>
          <button
            onClick={() => setGenerationToast(null)}
            className="shrink-0 opacity-70 hover:opacity-100 text-base leading-none"
          >
            ✕
          </button>
        </div>
      )}
      {/* Thread List Panel */}
      <div className="hidden lg:flex flex-col w-52 shrink-0 border-r border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-3 py-3 border-b border-slate-200">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Scripts
          </span>
          <button
            onClick={createThread}
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors text-lg leading-none"
            title="New script"
          >
            +
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {[...threads]
            .sort((a, b) =>
              a.id === activeThreadId ? -1 : b.id === activeThreadId ? 1 : 0
            )
            .map((thread) => (
              <div
                key={thread.id}
                className={`group flex items-center gap-1 px-3 py-2 cursor-pointer transition-colors ${
                  thread.id === activeThreadId
                    ? 'bg-violet-50 text-violet-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
                onClick={() => switchThread(thread.id)}
              >
                {editingThreadId === thread.id ? (
                  <input
                    autoFocus
                    className="flex-1 text-sm bg-white border border-violet-400 rounded px-1 py-0.5 outline-none"
                    value={editingThreadName}
                    onChange={(e) => setEditingThreadName(e.target.value)}
                    onBlur={() => {
                      if (editingThreadName.trim())
                        renameThread(thread.id, editingThreadName.trim());
                      setEditingThreadId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (editingThreadName.trim())
                          renameThread(thread.id, editingThreadName.trim());
                        setEditingThreadId(null);
                      } else if (e.key === 'Escape') {
                        setEditingThreadId(null);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span
                      className="flex-1 text-sm truncate"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingThreadId(thread.id);
                        setEditingThreadName(thread.name);
                      }}
                    >
                      {thread.name}
                    </span>
                    <button
                      className="opacity-0 group-hover:opacity-100 shrink-0 w-4 h-4 flex items-center justify-center text-slate-400 hover:text-violet-500 transition-all text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingThreadId(thread.id);
                        setEditingThreadName(thread.name);
                      }}
                      title="Rename script"
                    >
                      ✎
                    </button>
                    {threads.length > 1 && (
                      <button
                        className="opacity-0 group-hover:opacity-100 shrink-0 w-4 h-4 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteThread(thread.id);
                        }}
                        title="Delete script"
                      >
                        ✕
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
        </div>
      </div>

      {/* Left Pane: Shots Accordion */}
      <div className="flex-1 min-w-0 h-auto lg:h-full lg:overflow-y-auto overflow-x-hidden border-b lg:border-b-0 lg:border-r border-slate-200 p-4 lg:p-6 lg:pr-6 box-border">
        <div className="sticky top-0 z-20 bg-slate-50 -mx-4 lg:-mx-6 px-4 lg:px-6 pt-4 lg:pt-6 pb-4 border-b border-slate-200 mb-6 flex justify-between items-center">
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 leading-none">
            Video Script Editor
          </h1>
          <button
            onClick={createThread}
            className="text-sm px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors font-medium flex items-center gap-1.5 shadow-sm"
          >
            + Create New
          </button>
        </div>

        {/* Globals Section */}
        {isLoaded && (
          <div className="mb-6 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div
              className={`flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors ${isGlobalsExpanded ? 'border-b border-slate-100' : ''}`}
              onClick={() => setIsGlobalsExpanded(!isGlobalsExpanded)}
            >
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                Globals
                <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {globals.length} variables
                </span>
              </h2>
              <div className="text-slate-400">
                {isGlobalsExpanded ? '▼' : '▶'}
              </div>
            </div>

            {isGlobalsExpanded && (
              <div className="p-4">
                <div className="flex flex-col gap-4 mb-6">
                  <div className="text-xs text-slate-500">
                    Set global variables. You can add them one by one or use
                    Bulk Edit.
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!isBulkEditing && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsDeletingAllVars(true);
                        }}
                        className="text-sm px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors font-medium"
                      >
                        Delete All
                      </button>
                    )}
                    {!isBulkEditing && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // Enter bulk edit mode
                          const text = globals
                            .map((g) => {
                              if (g.value.includes('\n')) {
                                return `${g.name}="""${g.value}"""`;
                              }
                              return `${g.name}=${g.value}`;
                            })
                            .join('\n\n');
                          setBulkText(text);
                          setIsBulkEditing(true);
                        }}
                        className="text-sm px-3 py-1 bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-lg transition-colors font-medium"
                      >
                        Bulk Edit
                      </button>
                    )}
                    {!isBulkEditing && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingVarIndex(globals.length);
                          setEditingVarContent({ name: '', value: '' });
                        }}
                        className="text-sm px-3 py-1 bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-lg transition-colors font-medium"
                      >
                        + Add Variable
                      </button>
                    )}
                  </div>
                </div>

                {isBulkEditing ? (
                  <div className="space-y-4">
                    <div className="relative">
                      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (bulkText) {
                              navigator.clipboard.writeText(bulkText);
                              setIsGlobalsBulkCopied(true);
                              setTimeout(
                                () => setIsGlobalsBulkCopied(false),
                                2000
                              );
                            }
                          }}
                          className="text-xs font-semibold text-slate-500 hover:text-violet-600 bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50 active:bg-violet-100 active:scale-95 px-2 py-1 rounded transition-all flex items-center gap-1.5 shadow-sm"
                          title="Copy variables"
                        >
                          {isGlobalsBulkCopied ? (
                            <svg
                              className="w-3.5 h-3.5 text-emerald-500 animate-in zoom-in"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <rect
                                x="9"
                                y="9"
                                width="13"
                                height="13"
                                rx="2"
                                ry="2"
                              />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          )}
                          {isGlobalsBulkCopied ? 'Copied' : 'Copy'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setBulkText('');
                          }}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 active:bg-slate-200 active:scale-95 px-2 py-1 rounded transition-all shadow-sm"
                          title="Clear variables"
                        >
                          Clear
                        </button>
                      </div>
                      <textarea
                        value={bulkText}
                        onChange={(e) => setBulkText(e.target.value)}
                        placeholder={'KEY=value\nLONG_KEY="""long\nvalue"""'}
                        className="w-full h-64 bg-slate-50 border border-slate-200 text-slate-900 font-mono text-sm p-4 pt-12 rounded-xl focus:outline-none focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100 transition"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setIsBulkEditing(false)}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          // Save bulk edit
                          const newGlobals: { name: string; value: string }[] =
                            [];
                          const trimmedBulkText = bulkText.trim();
                          if (trimmedBulkText !== '') {
                            const lines = bulkText.split('\n');
                            let currentKey = '';
                            let currentValue = '';
                            let inBlock = false;

                            for (let i = 0; i < lines.length; i++) {
                              const line = lines[i];
                              // Match KEY = """... or KEY="""... (spaces around = are optional)
                              const tripleMatch =
                                !inBlock &&
                                line.match(/^([^=]+?)\s*=\s*"""(.*)/);
                              if (tripleMatch) {
                                currentKey = tripleMatch[1].trim();
                                currentValue = tripleMatch[2] || '';
                                // Single-line triple-quoted: KEY = """value"""
                                if (currentValue.endsWith('"""')) {
                                  currentValue = currentValue.slice(0, -3);
                                  newGlobals.push({
                                    name: currentKey,
                                    value: currentValue.trim(),
                                  });
                                } else {
                                  inBlock = true;
                                }
                              } else if (inBlock) {
                                if (line.endsWith('"""')) {
                                  currentValue += '\n' + line.slice(0, -3);
                                  newGlobals.push({
                                    name: currentKey,
                                    value: currentValue.trim(),
                                  });
                                  inBlock = false;
                                } else {
                                  currentValue += '\n' + line;
                                }
                              } else if (!inBlock && line.includes('=')) {
                                const eqIdx = line.indexOf('=');
                                const k = line.slice(0, eqIdx).trim();
                                let val = line.slice(eqIdx + 1).trim();
                                val = val.replace(/^"{3}|"{3}$/g, '').trim();
                                if (k) newGlobals.push({ name: k, value: val });
                              }
                            }
                          }
                          setGlobals(newGlobals);
                          localStorage.setItem(
                            `thread_${activeThreadId}_globals`,
                            JSON.stringify(newGlobals)
                          );
                          setIsBulkEditing(false);
                          setIsGlobalsExpanded(false);
                        }}
                        className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="-mx-4 -mb-4">
                    {globals.map((g, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-1 sm:grid-cols-[minmax(110px,auto)_1fr_auto] gap-2 sm:gap-3 items-start py-3 px-4 border-b border-[#f0f0f0] last:border-b-0 hover:bg-slate-50 transition-colors group"
                      >
                        <div className="font-mono text-sm text-slate-700 font-semibold break-all pt-1">
                          {g.name}
                        </div>
                        <div className="text-sm text-slate-600 break-words whitespace-pre-wrap pt-1 line-clamp-3">
                          {g.value || (
                            <span className="text-slate-400 italic">Empty</span>
                          )}
                        </div>
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
                          <button
                            onClick={() => {
                              setEditingVarIndex(i);
                              setEditingVarContent({
                                name: g.name,
                                value: g.value,
                              });
                            }}
                            className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded transition-colors"
                            title="Edit variable"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </button>
                          <button
                            onClick={() => setVarToDelete(i)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="Remove variable"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                    {globals.length === 0 && (
                      <div className="text-center text-slate-500 text-sm py-4 border border-dashed border-slate-200 rounded-lg">
                        No globals defined. Click "+ Add Variable" or "Bulk
                        Edit" to create one.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mb-8">
          <div
            className="sticky top-[60px] lg:top-[76px] z-40 bg-slate-50 py-3 flex items-center justify-between cursor-pointer border-b border-slate-200/60 mb-4"
            onClick={() => setIsShotsExpanded(!isShotsExpanded)}
          >
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 shrink-0">
              Shots
              <span className="text-xs font-normal text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                {shots.length} items
              </span>
            </h2>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShotsBulkText(
                    JSON.stringify(
                      shots.map(
                        ({
                          shot_number,
                          duration,
                          resolution,
                          imageRefs,
                          prompt,
                        }) => ({
                          shot_number,
                          duration,
                          resolution,
                          imageRefs,
                          prompt,
                        })
                      ),
                      null,
                      2
                    )
                  );
                  setIsShotsBulkEditing(true);
                  setIsShotsExpanded(true);
                }}
                className="text-xs font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
              >
                Bulk Edit
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const allSelected = shots.every((s) => s.selected);
                  setShots(
                    shots.map((s) => ({ ...s, selected: !allSelected }))
                  );
                }}
                className="text-xs font-semibold text-violet-600 border border-violet-200 bg-violet-50 hover:bg-violet-100 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
              >
                {shots.every((s) => s.selected) ? 'Deselect All' : 'Select All'}
              </button>
              <div className="text-slate-400 pl-1">
                {isShotsExpanded ? '▼' : '▶'}
              </div>
            </div>
          </div>

          {/* Shots bulk warning */}
          {shotsBulkWarning && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
              <span className="text-xs text-amber-700">
                ⚠ {shotsBulkWarning}
              </span>
              <button
                onClick={() => setShotsBulkWarning(null)}
                className="text-amber-400 hover:text-amber-600 text-xs shrink-0"
              >
                ✕
              </button>
            </div>
          )}

          {/* Shots bulk edit textarea */}
          {isShotsBulkEditing && (
            <div className="mb-4 space-y-3">
              <div className="relative">
                <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (shotsBulkText) {
                        navigator.clipboard.writeText(shotsBulkText);
                        setIsShotsBulkCopied(true);
                        setTimeout(() => setIsShotsBulkCopied(false), 2000);
                      }
                    }}
                    className="text-xs font-semibold text-slate-500 hover:text-violet-600 bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50 active:bg-violet-100 active:scale-95 px-2 py-1 rounded transition-all flex items-center gap-1.5 shadow-sm"
                    title="Copy shots"
                  >
                    {isShotsBulkCopied ? (
                      <svg
                        className="w-3.5 h-3.5 text-emerald-500 animate-in zoom-in"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <rect
                          x="9"
                          y="9"
                          width="13"
                          height="13"
                          rx="2"
                          ry="2"
                        />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                    {isShotsBulkCopied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShotsBulkText('');
                    }}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 active:bg-slate-200 active:scale-95 px-2 py-1 rounded transition-all shadow-sm"
                    title="Clear shots"
                  >
                    Clear
                  </button>
                </div>
                <textarea
                  value={shotsBulkText}
                  onChange={(e) => setShotsBulkText(e.target.value)}
                  className="w-full h-72 bg-slate-50 border border-slate-200 text-slate-900 font-mono text-xs p-4 pt-12 rounded-xl focus:outline-none focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100 resize-y transition"
                  placeholder='[{"shot_number":1,"duration":8,"resolution":"720p","imageRefs":[],"prompt":"..."}]'
                  spellCheck={false}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setIsShotsBulkEditing(false);
                    setShotsBulkWarning(null);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const VALID_KEYS = new Set([
                      'shot_number',
                      'duration',
                      'resolution',
                      'imageRefs',
                      'prompt',
                    ]);
                    const trimmedText = shotsBulkText.trim();
                    let parsed: unknown;
                    if (trimmedText === '') {
                      parsed = [];
                    } else {
                      try {
                        parsed = JSON.parse(trimmedText);
                      } catch {
                        setShotsBulkWarning(
                          'Invalid JSON — please fix the syntax and try again.'
                        );
                        return;
                      }
                    }
                    if (!Array.isArray(parsed)) {
                      setShotsBulkWarning(
                        'Expected a JSON array of shot objects.'
                      );
                      return;
                    }
                    const discardedKeys = new Set<string>();
                    const newShots: Shot[] = (
                      parsed as Record<string, unknown>[]
                    ).map((raw, i) => {
                      const base = shots[i] ?? {};
                      const cleaned: Partial<Shot> = {};
                      for (const key of Object.keys(raw)) {
                        if (VALID_KEYS.has(key)) {
                          let val = raw[key];
                          if (key === 'prompt' && typeof val === 'string') {
                            val = val.replace(/^"{3}|"{3}$/g, '').trim();
                          }
                          (cleaned as Record<string, unknown>)[key] = val;
                        } else {
                          discardedKeys.add(key);
                        }
                      }
                      return { ...base, ...cleaned, status: 'idle' } as Shot;
                    });
                    setShots(newShots);
                    localStorage.setItem(
                      `thread_${activeThreadId}_shots`,
                      JSON.stringify(newShots)
                    );
                    setIsShotsBulkEditing(false);
                    if (discardedKeys.size > 0) {
                      const msg = `Unknown keys discarded: ${[...discardedKeys].join(', ')}`;
                      setShotsBulkWarning(msg);
                      setTimeout(() => setShotsBulkWarning(null), 5000);
                    } else {
                      setShotsBulkWarning(null);
                    }
                  }}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {isShotsExpanded && (
            <div className="space-y-4 pb-32 relative w-full">
              {!isLoaded ? (
                <div className="text-slate-500">Loading...</div>
              ) : (
                shots.map((shot, index) => {
                  const isExpanded = expandedShotIndex === index;

                  return (
                    <div
                      key={index}
                      className={`border rounded-xl transition-all ${
                        isExpanded
                          ? 'bg-[#fafafa] shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-visible relative z-10'
                          : 'bg-white shadow-sm overflow-hidden relative z-0'
                      } ${
                        shot.selected
                          ? 'border-violet-400 ring-1 ring-violet-400'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Accordion Header */}
                      <div
                        className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() =>
                          setExpandedShotIndex(isExpanded ? null : index)
                        }
                      >
                        <div className="shrink-0 flex items-center justify-center self-start mt-1">
                          <input
                            type="checkbox"
                            checked={!!shot.selected}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              updateShot(index, { selected: e.target.checked });
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                          />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <div className="flex items-center gap-2">
                            <div className="font-semibold text-slate-800 shrink-0">
                              Shot {shot.shot_number}
                            </div>
                            <span className="text-slate-400 font-normal shrink min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                              ({shot.duration}s, {shot.resolution},{' '}
                              {shot.aspectRatio || '16:9'})
                            </span>
                            <div className="shrink-0 flex items-center ml-2">
                              {shot.status === 'generating' && (
                                <span className="flex items-center gap-1.5 px-2 py-0.5 bg-violet-100 text-violet-700 font-medium text-[10px] uppercase tracking-wider rounded-full">
                                  <div className="w-2.5 h-2.5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin"></div>
                                  Generating
                                </span>
                              )}
                              {shot.status === 'completed' && (
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 font-medium text-[10px] uppercase tracking-wider rounded-full">
                                  Done
                                </span>
                              )}
                              {shot.status === 'error' && (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 font-medium text-[10px] uppercase tracking-wider rounded-full">
                                  Error
                                </span>
                              )}
                            </div>
                          </div>
                          {!isExpanded &&
                            (shot.prompt ||
                              initialData.PODCAST_SHOTS[index]?.prompt) && (
                              <div
                                className={`text-sm truncate mt-0.5 w-full ${shot.prompt ? 'text-slate-400' : 'text-slate-300 italic'}`}
                              >
                                {shot.prompt ||
                                  initialData.PODCAST_SHOTS[index]?.prompt}
                              </div>
                            )}
                        </div>
                        <div className="flex items-center gap-3 ml-auto shrink-0 pl-2 self-start mt-0.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShotToDelete(index);
                            }}
                            className="text-slate-400 hover:text-red-500 px-2 py-1 transition-colors text-sm"
                            title="Delete shot"
                          >
                            Delete
                          </button>
                          <div className="text-slate-400 shrink-0">
                            {isExpanded ? '▴' : '▾'}
                          </div>
                        </div>
                      </div>

                      {/* Accordion Content */}
                      {isExpanded && (
                        <div className="p-4 border-t border-slate-100 space-y-4 bg-slate-50/50">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 w-full box-border">
                            <div className="min-w-0">
                              <label className="field-label break-words">
                                Duration (s)
                              </label>
                              <div className="grid grid-cols-2 gap-2 w-full box-border">
                                {[4, 8, 10].map((dur) => (
                                  <button
                                    key={dur}
                                    onClick={() =>
                                      updateShot(index, { duration: dur })
                                    }
                                    className={`flex-1 h-12 rounded-lg text-base font-medium transition-colors ${
                                      shot.duration === dur ||
                                      shot.duration === String(dur)
                                        ? 'bg-violet-100 text-violet-700 border-2 border-violet-500'
                                        : 'bg-white text-slate-600 border border-slate-200 hover:border-violet-300 hover:bg-violet-50'
                                    }`}
                                  >
                                    {dur}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="min-w-0">
                              <label className="field-label break-words">
                                Resolution
                              </label>
                              <div className="grid grid-cols-3 gap-2 w-full box-border">
                                {['720p', '1080p', '4k'].map((res) => (
                                  <button
                                    key={res}
                                    onClick={() =>
                                      updateShot(index, { resolution: res })
                                    }
                                    className={`flex-1 h-12 rounded-lg text-base font-medium transition-colors ${
                                      shot.resolution === res
                                        ? 'bg-violet-100 text-violet-700 border-2 border-violet-500'
                                        : 'bg-white text-slate-600 border border-slate-200 hover:border-violet-300 hover:bg-violet-50'
                                    }`}
                                  >
                                    {res}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="min-w-0">
                              <label className="field-label break-words">
                                Aspect Ratio
                              </label>
                              <div className="grid grid-cols-3 gap-2 w-full box-border">
                                {['16:9', '9:16', '1:1'].map((ratio) => (
                                  <button
                                    key={ratio}
                                    onClick={() =>
                                      updateShot(index, { aspectRatio: ratio })
                                    }
                                    className={`flex-1 h-12 rounded-lg text-base font-medium transition-colors ${
                                      (shot.aspectRatio || '16:9') === ratio
                                        ? 'bg-violet-100 text-violet-700 border-2 border-violet-500'
                                        : 'bg-white text-slate-600 border border-slate-200 hover:border-violet-300 hover:bg-violet-50'
                                    }`}
                                  >
                                    {ratio}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="w-full box-border">
                            <div className="flex items-center justify-between mb-2">
                              <label className="field-label break-words mb-0">
                                Prompt
                              </label>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (shot.prompt) {
                                      navigator.clipboard.writeText(
                                        shot.prompt
                                      );
                                      setCopiedShotIndex(index);
                                      setTimeout(
                                        () => setCopiedShotIndex(null),
                                        2000
                                      );
                                    }
                                  }}
                                  className="text-xs font-semibold text-slate-500 hover:text-violet-600 bg-slate-100 hover:bg-violet-50 active:bg-violet-100 active:scale-95 px-2 py-1 rounded transition-all flex items-center gap-1.5"
                                  title="Copy prompt"
                                >
                                  {copiedShotIndex === index ? (
                                    <svg
                                      className="w-3.5 h-3.5 text-emerald-500 animate-in zoom-in"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth={3}
                                    >
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  ) : (
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth={2}
                                    >
                                      <rect
                                        x="9"
                                        y="9"
                                        width="13"
                                        height="13"
                                        rx="2"
                                        ry="2"
                                      />
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                  )}
                                  {copiedShotIndex === index
                                    ? 'Copied'
                                    : 'Copy'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateShot(index, { prompt: '' });
                                  }}
                                  className="text-xs font-semibold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 active:scale-95 px-2 py-1 rounded transition-all"
                                  title="Clear prompt"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>
                            <PromptEditor
                              value={shot.prompt}
                              onChange={(val) =>
                                updateShot(index, { prompt: val })
                              }
                              globals={globals}
                              placeholder={
                                initialData.PODCAST_SHOTS[
                                  index
                                ]?.prompt?.trim() ||
                                'Describe your shot here...'
                              }
                            />
                            {/* Detected Variables Panel */}
                            {(() => {
                              const matches = shot.prompt.match(/\{([^}]+)\}/g);
                              if (!matches) return null;
                              const uniqueVars = Array.from(
                                new Set(matches.map((m) => m.slice(1, -1)))
                              );
                              if (uniqueVars.length === 0) return null;

                              return (
                                <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                  <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
                                    Detected Variables
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {uniqueVars.map((varName, i) => {
                                      const globalVar = globals.find(
                                        (g) => g.name === varName
                                      );
                                      const isResolved = !!globalVar;
                                      let previewValue = '';
                                      if (globalVar) {
                                        const words = globalVar.value
                                          .split(/\s+/)
                                          .filter(Boolean);
                                        previewValue =
                                          words.slice(0, 3).join(' ') +
                                          (words.length > 3 ? '...' : '');
                                      }

                                      return (
                                        <div key={i} className="relative group">
                                          <div
                                            className={`px-2 py-1 text-xs font-mono rounded cursor-pointer border ${isResolved ? 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100' : 'bg-red-50 text-red-600 border-red-200'}`}
                                          >
                                            {`{${varName}}`}
                                          </div>
                                          {isResolved && (
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs bg-slate-800 text-white text-xs px-2.5 py-1.5 rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                                              <span className="font-semibold text-violet-300">
                                                {varName}:
                                              </span>{' '}
                                              {previewValue}
                                              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800"></div>
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

                          <div className="w-full box-border">
                            <label className="field-label break-words flex items-center gap-2">
                              Attached Images
                              <span className="text-xs font-normal text-slate-400 normal-case tracking-normal">
                                {shot.imageRefs.length}/3 max
                              </span>
                            </label>
                            <div className="flex flex-wrap gap-2 max-w-full overflow-hidden">
                              {shot.imageRefs.map((refId, i) => {
                                const img = images.find(
                                  (img) => img.id === refId
                                );
                                return (
                                  <div
                                    key={i}
                                    className="relative group w-16 h-16 rounded-lg border border-slate-200 overflow-hidden bg-white shadow-sm"
                                  >
                                    {img ? (
                                      <Image
                                        src={img.previewUrl}
                                        alt="ref"
                                        fill
                                        unoptimized
                                        className="object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                                        Ref {refId}
                                      </div>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const newRefs = [...shot.imageRefs];
                                        newRefs.splice(i, 1);
                                        updateShot(index, {
                                          imageRefs: newRefs,
                                        });
                                      }}
                                      className="absolute top-0 right-0 bg-slate-900/60 hover:bg-red-500 backdrop-blur-sm text-white w-6 h-6 flex items-center justify-center text-sm rounded-bl-lg transition-colors z-10"
                                      title="Remove image"
                                    >
                                      ×
                                    </button>
                                  </div>
                                );
                              })}

                              {shot.imageRefs.length < 3 && (
                                <DeviceAwareUpload
                                  onUpload={(files) => {
                                    const newImages = addImagesToLibrary(files);

                                    // ensure we don't exceed 3
                                    const availableSlots =
                                      3 - shot.imageRefs.length;
                                    const idsToAdd = newImages
                                      .map((img) => img.id)
                                      .slice(0, availableSlots);

                                    updateShot(index, {
                                      imageRefs: [
                                        ...shot.imageRefs,
                                        ...idsToAdd,
                                      ],
                                    });
                                  }}
                                  onOpenLibrary={() => {
                                    setImageLibraryModalShotIndex(index);
                                    setSelectedLibraryImages([]);
                                  }}
                                  hasLibraryImages={images.length > 0}
                                >
                                  <div className="w-16 h-16 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition-colors text-slate-400 hover:text-violet-600 bg-white">
                                    <span className="text-xl leading-none">
                                      +
                                    </span>
                                  </div>
                                </DeviceAwareUpload>
                              )}
                            </div>
                            <div className="mt-2 text-[11px] text-slate-400">
                              Click the + button to upload and attach directly,
                              or click an image in the library. Max 3 images per
                              shot.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {isLoaded && isShotsExpanded && (
            <div className="sticky bottom-6 mt-4 z-20">
              <button
                onClick={addShot}
                className="w-full py-3.5 border-2 border-dashed border-slate-300 rounded-[12px] bg-white/90 backdrop-blur-md text-slate-600 hover:text-violet-700 hover:border-violet-300 hover:bg-violet-50 transition-all flex items-center justify-center gap-2 font-medium shadow-sm"
              >
                <span className="text-lg">+</span> Add New Shot
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right Pane: Settings & Library */}
      <div className="w-full lg:w-1/3 lg:max-w-[33.333333%] min-w-0 h-auto lg:h-full bg-white lg:border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col lg:overflow-hidden shadow-sm box-border lg:order-last">
        {/* Generation Settings */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex-shrink-0 transition-all">
          <div
            className="flex items-center justify-between cursor-pointer mb-4"
            onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
          >
            <h2 className="text-lg font-bold text-slate-800">
              Generation Settings
            </h2>
            <div className="text-slate-400">
              {isSettingsExpanded ? '▼' : '▶'}
            </div>
          </div>

          {isSettingsExpanded && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xl leading-none">🔑</span>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                      Veo API Key
                      {!apiKey && (
                        <span className="text-red-500 text-sm leading-none">
                          *
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-slate-500">
                        {apiKey
                          ? 'Key is configured'
                          : 'Required for generation'}
                      </span>
                      {apiKey && (
                        <button
                          onClick={handleCopyKey}
                          className="ml-1 text-slate-400 hover:text-slate-600 transition-colors"
                          title="Copy API Key"
                        >
                          {isCopied ? (
                            <svg
                              className="w-3 h-3 text-emerald-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          ) : (
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect
                                x="9"
                                y="9"
                                width="13"
                                height="13"
                                rx="2"
                                ry="2"
                              ></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setTempApiKey(apiKey);
                    setIsApiPopupOpen(true);
                  }}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md text-xs font-medium text-slate-700 transition-colors flex items-center gap-1.5"
                >
                  {apiKey ? 'Edit ✏️' : 'Set Key'}
                </button>
              </div>

              <div>
                {model === 'veo-3.1-lite-generate-preview' && (
                  <div className="mb-2 flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
                    <span className="shrink-0 mt-0.5">ℹ</span>
                    <span>
                      Veo 3.1 Lite supports 1 image max per shot. Extra images
                      are ignored.
                    </span>
                  </div>
                )}
                {(model === 'kling-o3-image-to-video' ||
                  model === 'grok-imagine-image-to-video-beta' ||
                  model === 'seedance-1.5-pro') && (
                  <div className="mb-2 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                    <span className="shrink-0 mt-0.5">ℹ</span>
                    <span>
                      {model === 'grok-imagine-image-to-video-beta'
                        ? 'Grok requires at least 1 image per shot.'
                        : model === 'seedance-1.5-pro'
                          ? 'Seedance 1.5 Pro requires at least 1 image per shot.'
                          : 'Kling O3 requires at least 1 image per shot. Only the first image is used as the start frame.'}
                    </span>
                  </div>
                )}
                {model === 'seedance-2.0-reference-to-video' && (
                  <div className="mb-2 flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
                    <span className="shrink-0 mt-0.5">ℹ</span>
                    <span>
                      Seedance 2.0 will use an image reference if attached,
                      otherwise it will fall back to text-to-video
                      automatically.
                    </span>
                  </div>
                )}
                <label className="field-label">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                >
                  <option value="veo-3.1-fast-generate-preview">
                    Veo 3.1 Fast
                  </option>
                  <option value="veo-3.1-generate-preview">Veo 3.1 Pro</option>
                  <option value="veo-3.1-lite-generate-preview">
                    Veo 3.1 Lite
                  </option>
                  <option value="kling-o3-image-to-video">
                    Kling O3 (Evolink)
                  </option>
                  <option value="seedance-2.0-reference-to-video">
                    Seedance 2.0
                  </option>
                  <option value="seedance-1.5-pro">Seedance 1.5 Pro</option>
                  <option value="grok-imagine-image-to-video-beta">
                    Grok (Beta)
                  </option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  disabled={isGenerating || !shots.some((s) => s.selected)}
                  onClick={async () => {
                    const selectedIndices = shots
                      .map((s, i) => (s.selected ? i : -1))
                      .filter((i) => i !== -1);

                    if (selectedIndices.length === 0)
                      return alert('Select at least one shot.');
                    if (
                      !apiKey &&
                      model !== 'kling-o3-image-to-video' &&
                      model !== 'seedance-2.0-reference-to-video' &&
                      model !== 'grok-imagine-image-to-video-beta' &&
                      model !== 'seedance-1.5-pro'
                    )
                      return alert('Please enter your API key.');

                    setIsGenerating(true);
                    const controller = new AbortController();
                    setAbortController(controller);

                    const newShots = [...shots];
                    selectedIndices.forEach((i) => {
                      newShots[i].status = 'generating';
                    });
                    setShots(newShots);

                    // Call actual API
                    Promise.all(
                      selectedIndices.map(async (i) => {
                        const shot = shots[i];
                        try {
                          let finalPrompt =
                            shot.prompt ||
                            initialData.PODCAST_SHOTS[i]?.prompt ||
                            '';
                          globals.forEach((g) => {
                            finalPrompt = finalPrompt.replace(
                              new RegExp(`\\{${g.name}\\}`, 'g'),
                              g.value
                            );
                          });

                          // Resolve imageRefs → base64, resized to ≤1024px to stay under Vercel's 4.5 MB body limit
                          const resolvedImages = await Promise.all(
                            shot.imageRefs
                              .map((id) => images.find((img) => img.id === id))
                              .filter(Boolean)
                              .map(async (img) => {
                                const base64 = await resizeImageToBase64(
                                  img!.file,
                                  1024
                                );
                                return {
                                  base64,
                                  mimeType: 'image/jpeg',
                                };
                              })
                          );

                          // Choose route based on model + image count
                          // Lite: max 1 image via image-direct; no refs support
                          // Fast/Pro: 0 → text, 1 → image-direct, 2-3 → image-refs
                          // Kling O3: always image-direct (first image as start frame)
                          const isLite =
                            model === 'veo-3.1-lite-generate-preview';
                          const isKling =
                            model === 'kling-o3-image-to-video' ||
                            model === 'seedance-2.0-reference-to-video' ||
                            model === 'grok-imagine-image-to-video-beta' ||
                            model === 'seedance-1.5-pro';
                          let route: string;
                          let body: Record<string, unknown>;
                          const base = {
                            prompt: finalPrompt,
                            modelName: model,
                            duration: shot.duration,
                            resolution: shot.resolution,
                            apiKey,
                            shotNumber: shot.shot_number,
                            existingCount: shot.generatedVideoUrls?.length ?? 0,
                          };

                          if (isKling) {
                            const klingImages = shot.imageRefs
                              .map((id) => images.find((img) => img.id === id))
                              .filter(Boolean);

                            let actualModel = model;
                            if (klingImages.length === 0) {
                              if (model === 'seedance-2.0-reference-to-video') {
                                actualModel = 'seedance-2.0-text-to-video';
                              } else {
                                throw new Error(
                                  'Model requires at least one image attached to this shot.'
                                );
                              }
                            }

                            if (
                              klingImages.length > 0 &&
                              klingImages.some((img) => !img?.blobUrl)
                            )
                              throw new Error(
                                'Some images are still uploading — please wait a moment and try again.'
                              );

                            route = '/api/script/generate-video/evolink';
                            body = {
                              prompt: finalPrompt,
                              model: actualModel,
                              duration: shot.duration,
                              shotNumber: shot.shot_number,
                              existingCount:
                                shot.generatedVideoUrls?.length ?? 0,
                              imageUrls:
                                klingImages.length > 0
                                  ? klingImages.map((img) => img!.blobUrl)
                                  : [],
                              quality: shot.resolution,
                              aspect_ratio: shot.aspectRatio || '16:9',
                            };
                          } else if (resolvedImages.length === 0) {
                            route = '/api/script/generate-video/text';
                            body = base;
                          } else if (isLite) {
                            // Lite only supports image-direct (no refs API)
                            route = '/api/script/generate-video/image-direct';
                            body = { ...base, image: resolvedImages[0] };
                          } else {
                            // Fast/Pro: always use refs even with 1 image —
                            // refs uses image as creative reference, prompt drives the scene
                            route = '/api/script/generate-video/image-refs';
                            body = { ...base, referenceImages: resolvedImages };
                          }

                          const res = await fetch(route, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            signal: controller.signal,
                            body: JSON.stringify(body),
                          });

                          // Routes return video/mp4 binary on success, JSON on error
                          let videoUrl: string | null = null;
                          let errorMsg: string | null = null;

                          const contentType =
                            res.headers.get('content-type') || '';
                          console.log(
                            `[generate-video] response status=${res.status} content-type="${contentType}" x-video-filename="${res.headers.get('x-video-filename')}"`
                          );
                          if (res.ok && contentType.startsWith('video/')) {
                            console.log(`[generate-video] reading blob...`);
                            const blob = await res.blob();
                            console.log(
                              `[generate-video] blob size=${blob.size} type=${blob.type}`
                            );
                            const filename =
                              res.headers.get('x-video-filename') ||
                              `shot_${shot.shot_number}.mp4`;
                            try {
                              await saveGeneratedVideo(
                                activeThreadId,
                                filename,
                                blob
                              );
                              console.log(
                                `[generate-video] saved to IndexedDB as ${filename}`
                              );
                            } catch (e) {
                              console.warn(
                                `[generate-video] IndexedDB save failed:`,
                                e
                              );
                            }
                            videoUrl = URL.createObjectURL(blob);
                            console.log(
                              `[generate-video] blob URL created: ${videoUrl}`
                            );
                          } else {
                            const data = await res.json();
                            errorMsg = data.error || 'Video generation failed.';
                            console.warn(
                              `[generate-video] error response:`,
                              data
                            );
                          }

                          setShots((prev) => {
                            const newShots = [...prev];
                            if (videoUrl) {
                              const existingUrls =
                                newShots[i].generatedVideoUrls || [];
                              const mergedUrls = Array.from(
                                new Set([...existingUrls, videoUrl])
                              );
                              newShots[i] = {
                                ...newShots[i],
                                status: 'completed',
                                generatedVideoUrl: videoUrl,
                                generatedVideoUrls: mergedUrls,
                              };

                              // Trigger hover animation for 3 seconds
                              setRecentSuccessUrls((prev) => [
                                ...prev,
                                videoUrl!,
                              ]);
                              setTimeout(() => {
                                setRecentSuccessUrls((prev) =>
                                  prev.filter((u) => u !== videoUrl)
                                );
                              }, 3000);
                            } else {
                              newShots[i] = {
                                ...newShots[i],
                                status: 'error',
                              };
                              console.warn(
                                'Failed to generate video:',
                                errorMsg
                              );
                              showGenerationToast(
                                `Shot ${shots[i].shot_number}: ${errorMsg}`
                              );
                            }
                            return newShots;
                          });
                        } catch (error: unknown) {
                          const isAbortError =
                            error instanceof Error &&
                            error.name === 'AbortError';
                          if (isAbortError) {
                            // handled by the stop button
                            return;
                          }
                          setShots((prev) => {
                            const newShots = [...prev];
                            newShots[i] = {
                              ...newShots[i],
                              status: 'error',
                            };
                            return newShots;
                          });
                          const msg =
                            error instanceof Error
                              ? error.message
                              : 'Unexpected error.';
                          console.warn('Error generating video:', msg);
                          showGenerationToast(
                            `Shot ${shots[i].shot_number}: ${msg}`
                          );
                        }
                      })
                    ).finally(() => {
                      setIsGenerating(false);
                      setAbortController(null);
                    });
                  }}
                  className="flex-1 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-[0.45] disabled:bg-violet-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                >
                  {isGenerating
                    ? 'Generating...'
                    : shots.filter((s) => s.selected).length > 0
                      ? `Generate Selected Shots (${shots.filter((s) => s.selected).length})`
                      : 'Select shots above to generate'}
                </button>

                {isGenerating && (
                  <button
                    onClick={() => {
                      if (abortController) {
                        abortController.abort();
                        setAbortController(null);
                      }
                      setShots((prev) =>
                        prev.map((s) =>
                          s.status === 'generating'
                            ? { ...s, status: 'idle' }
                            : s
                        )
                      );
                      setIsGenerating(false);
                    }}
                    className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
                    title="Stop Generation"
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Image Library (Slideable horizontally) */}
        {/* Image Library (Slideable horizontally) */}
        <div className="p-6 border-b border-slate-100 flex-shrink-0 transition-all">
          <div
            className="flex items-center justify-between mb-4 cursor-pointer"
            onClick={() => setIsLibraryExpanded(!isLibraryExpanded)}
          >
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              Image Library
              <span className="text-xs font-normal text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                {images.length} {images.length === 1 ? 'image' : 'images'}
              </span>
            </h2>
            <div className="flex items-center gap-3">
              <div onClick={(e) => e.stopPropagation()}>
                <DeviceAwareUpload
                  onUpload={(files) => addImagesToLibrary(files)}
                  onOpenLibrary={() => setIsLibraryExpanded(true)}
                  hasLibraryImages={images.length > 0}
                >
                  <div className="text-sm px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors font-medium shadow-sm">
                    + Upload
                  </div>
                </DeviceAwareUpload>
              </div>
              <div className="text-slate-400">
                {isLibraryExpanded ? '▼' : '▶'}
              </div>
            </div>
          </div>

          {isLibraryExpanded &&
            (images.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-slate-500 text-sm py-8 border border-dashed border-slate-300 rounded-lg bg-slate-50 gap-3">
                <span className="text-3xl">📷</span>
                <div>No images uploaded yet.</div>
                <div onClick={(e) => e.stopPropagation()}>
                  <DeviceAwareUpload
                    onUpload={(files) => addImagesToLibrary(files)}
                    onOpenLibrary={() => setIsLibraryExpanded(true)}
                    hasLibraryImages={images.length > 0}
                  >
                    <div className="text-sm px-4 py-2 bg-white border border-slate-200 hover:bg-violet-50 text-violet-700 hover:border-violet-300 rounded-lg transition-colors font-medium shadow-sm mt-1">
                      + Upload your first image
                    </div>
                  </DeviceAwareUpload>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4 overflow-y-auto max-h-64 pr-2">
                {images.map((img) => (
                  <div
                    key={img.id}
                    className="relative group aspect-square rounded-lg border border-slate-200 overflow-hidden cursor-pointer hover:border-violet-400 hover:ring-1 hover:ring-violet-400 transition-all shadow-sm"
                    onClick={() => {
                      if (expandedShotIndex !== null) {
                        const shot = shots[expandedShotIndex];
                        if (!shot.imageRefs.includes(img.id)) {
                          updateShot(expandedShotIndex, {
                            imageRefs: [...shot.imageRefs, img.id],
                          });
                        }
                      } else {
                        alert('Expand a shot first to attach this image.');
                      }
                    }}
                  >
                    <Image
                      src={img.previewUrl}
                      alt="Library Item"
                      fill
                      unoptimized
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs font-semibold text-white text-center p-1 pointer-events-none">
                      Attach to Shot
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setImageToDelete(img.id);
                      }}
                      className="absolute top-0 right-0 bg-slate-900/60 hover:bg-red-500 backdrop-blur-sm text-white w-6 h-6 flex items-center justify-center text-sm rounded-bl-lg transition-colors z-10"
                      title="Delete from Library"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ))}
        </div>

        {/* Generated Media (Stacked in a grid) */}
        {/* Generated Media (Stacked in a grid) */}
        <div
          ref={generatedMediaRef}
          className="p-4 lg:p-6 flex-1 min-h-0 flex flex-col pb-20 lg:pb-6 transition-all min-h-[50vh] lg:min-h-0 scroll-mt-6"
        >
          <div
            className="flex items-center justify-between mb-4 cursor-pointer"
            onClick={() => setIsMediaExpanded(!isMediaExpanded)}
          >
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              Generated Media
              <span className="text-xs font-normal text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                {shots.reduce(
                  (acc, s) => acc + (s.generatedVideoUrls?.length ?? 0),
                  0
                )}{' '}
                {shots.reduce(
                  (acc, s) => acc + (s.generatedVideoUrls?.length ?? 0),
                  0
                ) === 1
                  ? 'video'
                  : 'videos'}
              </span>
            </h2>
            <div className="text-slate-400">{isMediaExpanded ? '▼' : '▶'}</div>
          </div>

          {isMediaExpanded && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto max-h-[60vh] lg:max-h-none lg:h-full content-start pr-2">
              {shots.filter((s) => s.generatedVideoUrls?.length).length === 0 &&
              shots.filter((s) => s.status === 'generating').length === 0 ? (
                <div className="col-span-full text-center text-slate-500 text-sm mt-4 p-6 border border-dashed border-slate-300 rounded-lg bg-slate-50">
                  No generated videos yet. Select shots to generate.
                </div>
              ) : (
                <>
                  {shots.flatMap((shot) => {
                    const urls = shot.generatedVideoUrls || [];
                    if (
                      urls.length === 0 &&
                      shot.generatedVideoUrl &&
                      shot.status === 'completed'
                    ) {
                      urls.push(shot.generatedVideoUrl);
                    }
                    return urls.map((url, i) => {
                      const versionLabel =
                        urls.length > 1 ? ` (v${i + 1})` : '';
                      const isRecent = recentSuccessUrls.includes(url);

                      return (
                        <div
                          key={`vid-${shot.shot_number}-${i}`}
                          className={`bg-white rounded-xl p-3 border w-full flex flex-col transition-all duration-500 ${
                            isRecent
                              ? 'border-violet-500 ring-2 ring-violet-500 shadow-md ring-opacity-50'
                              : 'border-slate-200 shadow-sm'
                          }`}
                        >
                          <div className="text-sm font-semibold text-slate-800 mb-2 flex items-center justify-between px-1">
                            <span>
                              Shot {shot.shot_number}
                              {versionLabel}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `Shot_${shot.shot_number}${versionLabel}.mp4`;
                                  a.click();
                                }}
                                className="text-xs text-violet-600 hover:text-violet-700 font-medium"
                              >
                                Download
                              </button>
                              <button
                                onClick={() =>
                                  setVideoToDelete({
                                    shotIndex: i,
                                    urlIndex: i,
                                    url,
                                  })
                                }
                                className="text-slate-400 hover:text-red-500 transition-colors px-1"
                                title="Delete video"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                          <div
                            className="relative w-full rounded-lg bg-slate-900 aspect-video cursor-pointer overflow-hidden group"
                            onClick={() => setPlayingVideoUrl(url)}
                          >
                            <video
                              src={url}
                              preload="metadata"
                              className="w-full h-full object-cover pointer-events-none"
                            />
                            <div
                              className={`absolute inset-0 transition-colors flex items-center justify-center ${
                                isRecent
                                  ? 'bg-slate-900/30'
                                  : 'bg-slate-900/10 group-hover:bg-slate-900/30'
                              }`}
                            >
                              <div
                                className={`w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-slate-900 pl-1 shadow-md transition-transform ${
                                  isRecent
                                    ? 'scale-110'
                                    : 'transform group-hover:scale-110'
                                }`}
                              >
                                ▶
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })}
                  {shots
                    .filter((s) => s.status === 'generating')
                    .map((shot) => {
                      const nextVersion = shot.generatedVideoUrls?.length
                        ? ` (v${shot.generatedVideoUrls.length + 1})`
                        : '';
                      return (
                        <div
                          key={`vid-gen-${shot.shot_number}`}
                          className="bg-slate-50 rounded-xl p-4 border border-slate-200 border-dashed w-full flex flex-col items-center justify-center text-slate-500 aspect-video shadow-sm"
                        >
                          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                          <span className="text-xs font-medium text-center">
                            Generating Shot {shot.shot_number}
                            {nextVersion}...
                          </span>
                        </div>
                      );
                    })}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Video Modal */}
      {playingVideoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-5xl">
            <button
              onClick={() => setPlayingVideoUrl(null)}
              className="absolute -top-12 right-0 text-white hover:text-neutral-300 text-3xl font-light"
            >
              ×
            </button>
            <video
              src={playingVideoUrl}
              controls
              autoPlay
              className="w-full rounded-lg bg-black shadow-2xl max-h-[80vh] object-contain"
            />
          </div>
        </div>
      )}

      {/* Popup for single variable edit */}
      {editingVarIndex !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="font-bold text-slate-800">
                {editingVarIndex >= globals.length
                  ? 'Add Variable'
                  : 'Edit Variable'}
              </h3>
              <button
                onClick={() => setEditingVarIndex(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="field-label">Name</label>
                <input
                  type="text"
                  value={editingVarContent.name}
                  onChange={(e) =>
                    setEditingVarContent({
                      ...editingVarContent,
                      name: e.target.value,
                    })
                  }
                  placeholder="e.g. CHARACTER_NAME"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 font-mono"
                />
              </div>
              <div>
                <label className="field-label">Value</label>
                <textarea
                  value={editingVarContent.value}
                  onChange={(e) =>
                    setEditingVarContent({
                      ...editingVarContent,
                      value: e.target.value,
                    })
                  }
                  placeholder="Paste value here..."
                  className="w-full h-40 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 sticky bottom-0 z-10">
              <button
                onClick={() => setEditingVarIndex(null)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const newGlobals = [...globals];
                  if (editingVarIndex >= globals.length) {
                    newGlobals.push(editingVarContent);
                  } else {
                    newGlobals[editingVarIndex] = editingVarContent;
                  }
                  setGlobals(newGlobals);
                  localStorage.setItem(
                    `thread_${activeThreadId}_globals`,
                    JSON.stringify(newGlobals)
                  );
                  setEditingVarIndex(null);
                  if (editingVarIndex >= globals.length) {
                    setIsGlobalsExpanded(false);
                  }
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
              >
                Save Variable
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmPopup
        isOpen={shotToDelete !== null}
        title="Delete Shot"
        message={`Are you sure you want to delete Shot ${shotToDelete !== null ? shots[shotToDelete]?.shot_number : ''}?`}
        onConfirm={() => {
          if (shotToDelete !== null) {
            removeShot(shotToDelete);
            setShotToDelete(null);
          }
        }}
        onCancel={() => setShotToDelete(null)}
      />

      <ConfirmPopup
        isOpen={isDeletingAllVars}
        title="Delete All Variables"
        message="Are you sure you want to delete all variables?"
        onConfirm={() => {
          setGlobals([]);
          localStorage.setItem(
            `thread_${activeThreadId}_globals`,
            JSON.stringify([])
          );
          setIsDeletingAllVars(false);
        }}
        onCancel={() => setIsDeletingAllVars(false)}
      />

      <ConfirmPopup
        isOpen={varToDelete !== null}
        title="Delete Variable"
        message={`Are you sure you want to delete the variable "${varToDelete !== null ? globals[varToDelete]?.name : ''}"?`}
        onConfirm={() => {
          if (varToDelete !== null) {
            const newG = [...globals];
            newG.splice(varToDelete, 1);
            setGlobals(newG);
            localStorage.setItem(
              `thread_${activeThreadId}_globals`,
              JSON.stringify(newG)
            );
            setVarToDelete(null);
          }
        }}
        onCancel={() => setVarToDelete(null)}
      />

      <ConfirmPopup
        isOpen={imageToDelete !== null}
        title="Delete Image"
        message="Are you sure you want to permanently delete this image from your library?"
        onConfirm={() => {
          if (imageToDelete) {
            const imgToDelete = images.find((img) => img.id === imageToDelete);
            deleteLibraryImage(imageToDelete).catch(() => {});
            if (imgToDelete?.blobUrl) {
              fetch('/api/images', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: imgToDelete.blobUrl }),
              }).catch(() => {});
            }
            setImages((prev) => prev.filter((img) => img.id !== imageToDelete));
            setShots((prev) =>
              prev.map((s) => ({
                ...s,
                imageRefs: s.imageRefs.filter((ref) => ref !== imageToDelete),
              }))
            );
            setImageToDelete(null);
          }
        }}
        onCancel={() => setImageToDelete(null)}
      />

      <ConfirmPopup
        isOpen={videoToDelete !== null}
        title="Delete Video"
        message="Are you sure you want to remove this video from your generated media?"
        onConfirm={() => {
          if (videoToDelete !== null) {
            const { shotIndex, url } = videoToDelete;
            // Remove from IndexedDB — extract filename from blob URL or path
            const filename = url.split('/').pop();
            if (filename)
              deleteGeneratedVideo(activeThreadId, filename).catch(() => {});

            setShots((prev) => {
              const newShots = [...prev];
              const targetShot = newShots[shotIndex];
              if (targetShot && targetShot.generatedVideoUrls) {
                targetShot.generatedVideoUrls =
                  targetShot.generatedVideoUrls.filter((u) => u !== url);
                if (targetShot.generatedVideoUrl === url) {
                  targetShot.generatedVideoUrl =
                    targetShot.generatedVideoUrls[
                      targetShot.generatedVideoUrls.length - 1
                    ] || undefined;
                }
                if (targetShot.generatedVideoUrls.length === 0) {
                  targetShot.status = 'idle';
                }
              }
              return newShots;
            });
            setVideoToDelete(null);
          }
        }}
        onCancel={() => setVideoToDelete(null)}
      />

      {/* Image Library Modal */}
      {imageLibraryModalShotIndex !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white z-10">
              <h3 className="font-bold text-slate-800">
                Select Images for Shot{' '}
                {shots[imageLibraryModalShotIndex]?.shot_number}
              </h3>
              <button
                onClick={() => setImageLibraryModalShotIndex(null)}
                className="text-slate-400 hover:text-slate-600 px-2 text-xl"
              >
                ×
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {images.length === 0 ? (
                <div className="text-center text-slate-500 py-8">
                  Your library is empty. Please upload some images first.
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                  {images.map((img) => {
                    const isSelected = selectedLibraryImages.includes(img.id);
                    const isAlreadyAttached = shots[
                      imageLibraryModalShotIndex
                    ]?.imageRefs.includes(img.id);
                    const currentAttachedCount =
                      shots[imageLibraryModalShotIndex]?.imageRefs.length || 0;
                    const canSelect =
                      isSelected ||
                      selectedLibraryImages.length + currentAttachedCount < 3;

                    return (
                      <div
                        key={img.id}
                        className={`relative group aspect-square rounded-lg border overflow-hidden cursor-pointer transition-all shadow-sm ${
                          isAlreadyAttached
                            ? 'opacity-50 grayscale cursor-not-allowed border-slate-200'
                            : isSelected
                              ? 'border-violet-500 ring-2 ring-violet-500'
                              : canSelect
                                ? 'border-slate-200 hover:border-violet-400 hover:ring-1 hover:ring-violet-400'
                                : 'opacity-50 cursor-not-allowed border-slate-200'
                        }`}
                        onClick={() => {
                          if (isAlreadyAttached) return;
                          if (isSelected) {
                            setSelectedLibraryImages((prev) =>
                              prev.filter((id) => id !== img.id)
                            );
                          } else if (canSelect) {
                            setSelectedLibraryImages((prev) => [
                              ...prev,
                              img.id,
                            ]);
                          }
                        }}
                      >
                        <Image
                          src={img.previewUrl}
                          alt="Library Item"
                          fill
                          unoptimized
                          className="object-cover"
                        />
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-6 h-6 bg-violet-500 text-white rounded-full flex items-center justify-center z-10 shadow-sm">
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                        )}
                        {isAlreadyAttached && (
                          <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center text-xs font-semibold text-white text-center p-1">
                            Already Attached
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between z-10 shrink-0">
              <div className="text-sm text-slate-500">
                {selectedLibraryImages.length} selected (max{' '}
                {3 - (shots[imageLibraryModalShotIndex]?.imageRefs.length || 0)}{' '}
                more allowed)
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setImageLibraryModalShotIndex(null)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={selectedLibraryImages.length === 0}
                  onClick={() => {
                    const shot = shots[imageLibraryModalShotIndex];
                    if (shot) {
                      updateShot(imageLibraryModalShotIndex, {
                        imageRefs: [
                          ...shot.imageRefs,
                          ...selectedLibraryImages,
                        ],
                      });
                    }
                    setImageLibraryModalShotIndex(null);
                  }}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Attach Selected
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API Key Modal */}
      {isApiPopupOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <span className="text-xl">🔑</span> Veo API Key
              </h3>
              <button
                onClick={() => setIsApiPopupOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <label className="field-label">
                AI Studio Key <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                placeholder="Paste your API key here..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                autoFocus
              />
              <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                Your API key is stored locally in your browser and never sent to
                our servers. It is required to generate videos.
              </p>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 rounded-b-xl">
              <button
                onClick={() => setIsApiPopupOpen(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setApiKey(tempApiKey);
                  setIsApiPopupOpen(false);
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
