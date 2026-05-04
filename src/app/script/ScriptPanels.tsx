'use client';

import React, { useState, useMemo, memo } from 'react';
import Image from 'next/image';
import { Trash2, Film, Eye, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PromptEditor from '@/components/PromptEditor';
import DeviceAwareUpload from '@/components/DeviceAwareUpload';
import { useAuth } from '@/lib/AuthContext';
import { useProvider } from '@/lib/ProviderContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import * as initialData from '@/app/script/constants';

import { Shot, GeneratedVideo, ImageItem, ScriptThread } from './types';

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

type Props = {
  shots: Shot[];
  setShots: React.Dispatch<React.SetStateAction<Shot[]>>;
  updateShot: (index: number, changes: Partial<Shot>) => void;
  addShot: () => void;
  expandedShotIndex: number | null;
  setExpandedShotIndex: (index: number | null) => void;
  isLoaded: boolean;
  globals: { name: string; value: string }[];
  setGlobals: React.Dispatch<
    React.SetStateAction<{ name: string; value: string }[]>
  >;
  images: ImageItem[];
  addImagesToLibrary: (files: File[]) => ImageItem[];
  generatedVideos: GeneratedVideo[];
  setGeneratedVideos: React.Dispatch<React.SetStateAction<GeneratedVideo[]>>;
  threads: ScriptThread[];
  activeThreadId: string;
  showGenerationToast: (msg: string) => void;
  setShotToDelete: (index: number) => void;
  setImageLibraryModalShotIndex: (index: number | null) => void;
  setSelectedLibraryImages: React.Dispatch<React.SetStateAction<string[]>>;
  setPlayingVideo: (video: { url: string; filename: string } | null) => void;
  setPreviewImage: (url: string | null) => void;
  setImageToDelete: (id: string | null) => void;
  setEditingVarIndex: (index: number | null) => void;
  setEditingVarContent: (content: { name: string; value: string }) => void;
  setVarToDelete: (index: number | null) => void;
  setIsDeletingAllVars: (val: boolean) => void;
};

function ScriptPanels(props: Props) {
  const {
    shots,
    setShots,
    updateShot,
    addShot,
    expandedShotIndex,
    setExpandedShotIndex,
    isLoaded,
    globals,
    setGlobals,
    images,
    addImagesToLibrary,
    generatedVideos,
    setGeneratedVideos,
    threads,
    activeThreadId,
    showGenerationToast,
    setShotToDelete,
    setImageLibraryModalShotIndex,
    setSelectedLibraryImages,
    setPlayingVideo,
    setPreviewImage,
    setImageToDelete,
    setEditingVarIndex,
    setEditingVarContent,
    setVarToDelete,
    setIsDeletingAllVars,
  } = props;

  const { user } = useAuth();
  const { providerConfig } = useProvider();

  const [shotsBulkText, setShotsBulkText] = useState('');
  const [isShotsBulkEditing, setIsShotsBulkEditing] = useState(false);
  const [isShotsBulkCopied, setIsShotsBulkCopied] = useState(false);
  const [shotsBulkWarning, setShotsBulkWarning] = useState<string | null>(null);
  const [copiedShotIndex, setCopiedShotIndex] = useState<number | null>(null);
  const [isGlobalsExpanded, setIsGlobalsExpanded] = useState(false);
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [isGlobalsBulkCopied, setIsGlobalsBulkCopied] = useState(false);
  const [model, setModel] = useState('kling-o3-image-to-video');
  const [isGenerating, setIsGenerating] = useState(false);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [isLibraryExpanded, setIsLibraryExpanded] = useState(true);

  // O(n) build once per generatedVideos change → O(1) lookup per shot in the list
  const videosByShotId = useMemo(() => {
    const map = new Map<string, GeneratedVideo[]>();
    for (const v of generatedVideos) {
      if (!map.has(v.shotId)) map.set(v.shotId, []);
      map.get(v.shotId)!.push(v);
    }
    return map;
  }, [generatedVideos]);

  const expandedShot =
    expandedShotIndex !== null ? shots[expandedShotIndex] : null;

  // Videos for the currently expanded shot (includes legacy shotNumber fallback)
  const expandedShotVideos = useMemo(() => {
    if (!expandedShot) return [];
    return generatedVideos.filter(
      (v) =>
        v.shotId === expandedShot.id ||
        (v.shotNumber && v.shotNumber === expandedShot.shot_number)
    );
  }, [expandedShot, generatedVideos]);

  // Variable tokens in the expanded shot's prompt
  const expandedShotVars = useMemo(() => {
    if (!expandedShot) return null;
    const matches = expandedShot.prompt.match(/\{([^}]+)\}/g);
    if (!matches) return null;
    const uniqueVars = Array.from(new Set(matches.map((m) => m.slice(1, -1))));
    if (uniqueVars.length === 0) return null;
    return uniqueVars.map((varName) => ({
      varName,
      isResolved: globals.some((g) => g.name === varName),
    }));
  }, [expandedShot, globals]);

  return (
    <>
      {/* Shots Panel (Navigation) */}
      <div className="w-[320px] shrink-0 h-auto lg:h-full overflow-y-auto border-b lg:border-b-0 lg:border-r border-slate-200 bg-white flex flex-col">
        <div className="flex flex-col h-full p-4 relative">
          <div className="flex-1 flex flex-col min-h-0 mb-4 space-y-3">
            <div className="shrink-0 flex flex-col gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center justify-between">
                <h2 className="type-level-1 text-slate-800 flex items-center gap-2">
                  Shots
                  <span className="type-level-4 font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {shots.length}
                  </span>
                </h2>
                <div className="flex items-center gap-2">
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
                    }}
                    className="type-level-3 text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 px-2 py-1 rounded-md transition-colors"
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
                    className="type-level-3 text-violet-600 border border-violet-200 bg-violet-50 hover:bg-violet-100 px-2 py-1 rounded-md transition-colors"
                  >
                    {shots.every((s) => s.selected)
                      ? 'Deselect All'
                      : 'Select All'}
                  </button>
                </div>
              </div>
            </div>

            {/* Shots bulk warning */}
            {shotsBulkWarning && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <span className="type-level-4 text-amber-700">
                  ⚠ {shotsBulkWarning}
                </span>
                <button
                  onClick={() => setShotsBulkWarning(null)}
                  className="text-amber-400 hover:text-amber-600 type-level-3 shrink-0"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Shots bulk edit textarea */}
            {isShotsBulkEditing && (
              <div className="space-y-3 mb-4">
                <div className="relative">
                  <div className="absolute top-2 right-2 flex items-center gap-2 z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (shotsBulkText) {
                          navigator.clipboard.writeText(shotsBulkText);
                          setIsShotsBulkCopied(true);
                          setTimeout(() => setIsShotsBulkCopied(false), 2000);
                        }
                      }}
                      className="type-level-4 text-slate-500 hover:text-violet-600 bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50 px-2 py-0.5 rounded shadow-sm"
                    >
                      {isShotsBulkCopied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShotsBulkText('');
                      }}
                      className="type-level-4 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 px-2 py-0.5 rounded shadow-sm"
                    >
                      Clear
                    </button>
                  </div>
                  <textarea
                    value={shotsBulkText}
                    onChange={(e) => setShotsBulkText(e.target.value)}
                    className="w-full h-48 bg-slate-50 border border-slate-200 text-slate-900 font-mono type-level-3 p-3 pt-8 rounded-lg focus:outline-none focus:border-violet-400 focus:bg-white focus:ring-1 focus:ring-violet-400 resize-y"
                    spellCheck={false}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setIsShotsBulkEditing(false);
                      setShotsBulkWarning(null);
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 type-level-3 rounded-md transition-colors"
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
                          setShotsBulkWarning('Invalid JSON — fix syntax.');
                          return;
                        }
                      }
                      if (!Array.isArray(parsed)) {
                        setShotsBulkWarning('Expected a JSON array.');
                        return;
                      }
                      const discardedKeys = new Set<string>();
                      const newShots: Shot[] = (
                        parsed as Record<string, unknown>[]
                      ).map((raw, i) => {
                        const base = shots[i] ?? {
                          id: `shot_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                        };
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
                        return {
                          ...base,
                          ...cleaned,
                          status: 'idle',
                        } as Shot;
                      });
                      setShots(newShots);
                      setIsShotsBulkEditing(false);
                      if (discardedKeys.size > 0) {
                        setShotsBulkWarning(
                          `Unknown keys discarded: ${[...discardedKeys].join(', ')}`
                        );
                        setTimeout(() => setShotsBulkWarning(null), 5000);
                      } else {
                        setShotsBulkWarning(null);
                      }
                    }}
                    className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white type-level-3 rounded-md transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-2 pb-24 pr-1 relative w-full">
              {!isLoaded ? (
                <div className="text-slate-500 type-level-3">Loading...</div>
              ) : (
                shots.map((shot, index) => {
                  const isExpanded = expandedShotIndex === index;
                  const shotVideos = videosByShotId.get(shot.id ?? '') ?? [];

                  return (
                    <div
                      key={shot.id}
                      className={`bg-white rounded-xl relative overflow-hidden group ${
                        isExpanded
                          ? 'shadow-[0_2px_10px_rgba(0,0,0,0.06)] border-[1.5px] border-violet-500'
                          : shot.selected
                            ? 'border-[1.5px] border-violet-400/60 shadow-sm'
                            : 'border border-slate-200 hover:border-slate-300 shadow-sm'
                      }`}
                      onClick={() => setExpandedShotIndex(index)}
                    >
                      <div className="px-3 py-2.5 flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 transition-colors">
                        <div className="shrink-0 flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={!!shot.selected}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              updateShot(index, {
                                selected: e.target.checked,
                              });
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                          />
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-medium ${isExpanded ? 'text-violet-700' : 'text-slate-800'}`}
                            >
                              Shot {shot.shot_number}
                            </span>
                            <span className="text-slate-400 type-level-3">
                              {shot.duration}s · {shot.resolution}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {shotVideos.length > 0 && (
                              <span className="type-level-4 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                                {shotVideos.length}{' '}
                                {shotVideos.length === 1 ? 'video' : 'videos'}
                              </span>
                            )}

                            {shot.status === 'generating' && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-violet-100 text-violet-700 font-medium type-level-4 rounded">
                                <div className="w-2 h-2 border-[1.5px] border-violet-600 border-t-transparent rounded-full animate-spin"></div>
                                Generating
                              </span>
                            )}
                            {shotVideos.length > 0 &&
                              shot.status !== 'generating' && (
                                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 font-medium type-level-4 rounded">
                                  Done
                                </span>
                              )}
                            {shot.status === 'error' && (
                              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 font-medium type-level-4 rounded">
                                Error
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-auto shrink-0 pl-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShotToDelete(index);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 type-level-3 transition-opacity p-1"
                            title="Delete shot"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <div className="text-slate-400 shrink-0">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            >
                              <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {isLoaded && (
              <div className="absolute bottom-4 left-4 right-4 z-20">
                <button
                  onClick={addShot}
                  className="w-full py-2.5 border border-dashed border-slate-300 rounded-lg bg-white text-slate-600 hover:text-violet-700 hover:border-violet-300 hover:bg-violet-50 transition-colors flex items-center justify-center gap-2 font-medium shadow-sm type-level-2"
                >
                  <span>+</span> Add Shot
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Video Panel (Hero Surface) */}
      <div className="flex-1 min-w-0 h-auto lg:h-full overflow-y-auto bg-[#F9FAFB] flex flex-col p-6">
        {expandedShotIndex === null || !shots[expandedShotIndex] ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <Film className="w-12 h-12 mb-4 opacity-50" />
            <div className="type-level-2 font-medium">
              Select a shot to view and edit
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col w-full max-w-5xl mx-auto">
            {(() => {
              const shot = expandedShot!;
              const shotVideos = expandedShotVideos;
              const hasVideo = shotVideos.length > 0;
              const isPortrait = shot.aspectRatio === '9:16';
              const isSquare = shot.aspectRatio === '1:1';
              const aspectRatioClass = isPortrait
                ? 'aspect-[9/16] max-h-[500px]'
                : isSquare
                  ? 'aspect-square max-h-[500px]'
                  : 'aspect-video max-h-[500px]';

              return (
                <>
                  {/* Hero Video Section */}
                  {hasVideo && (
                    <div className="w-full flex flex-col items-center mb-8">
                      <div
                        className={`relative w-full rounded-2xl bg-black overflow-hidden shadow-lg ${aspectRatioClass} border border-slate-200/50 flex items-center justify-center group`}
                      >
                        <video
                          src={shotVideos[shotVideos.length - 1].blobUrl}
                          controls
                          className="w-full h-full object-contain"
                        />
                      </div>

                      {/* Version Tabs */}
                      {shotVideos.length > 1 && (
                        <div className="flex gap-2 mt-4 overflow-x-auto pb-1 max-w-full">
                          {shotVideos.map((video, idx) => (
                            <button
                              key={video.id}
                              className={`px-4 py-1.5 rounded-full type-level-3 font-medium transition-colors ${
                                idx === shotVideos.length - 1
                                  ? 'bg-slate-800 text-white shadow-md'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                              }`}
                              onClick={() => {
                                const scriptName =
                                  threads.find((t) => t.id === activeThreadId)
                                    ?.name || 'Script';
                                setPlayingVideo({
                                  url: video.blobUrl,
                                  filename: `${scriptName} - Shot ${shot.shot_number} - v${idx + 1}.mp4`,
                                });
                              }}
                            >
                              v{idx + 1}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {!hasVideo && (
                    <div
                      className={`w-full flex flex-col items-center justify-center mb-8 rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 text-slate-400 ${aspectRatioClass}`}
                    >
                      <Film className="w-10 h-10 mb-2 opacity-30" />
                      <span className="type-level-2 font-medium">
                        No video generated yet
                      </span>
                    </div>
                  )}

                  {/* Bottom Split Section */}
                  <div className="flex flex-col lg:flex-row gap-8 w-full mt-auto">
                    {/* Left: Prompt & Actions */}
                    <div className="flex-1 flex flex-col gap-3 min-w-0">
                      <div className="flex items-center justify-between">
                        <label className="type-level-2 font-semibold text-slate-800">
                          Prompt
                        </label>
                        <div className="flex items-center gap-3 type-level-3 text-slate-400">
                          <button
                            disabled
                            className="opacity-40 cursor-not-allowed font-medium"
                            title="Coming soon"
                          >
                            Enhance
                          </button>
                          <button
                            onClick={() => {
                              if (shot.prompt) {
                                navigator.clipboard.writeText(shot.prompt);
                                setCopiedShotIndex(expandedShotIndex);
                                setTimeout(
                                  () => setCopiedShotIndex(null),
                                  2000
                                );
                              }
                            }}
                            className="hover:text-violet-600 transition-colors font-medium"
                          >
                            {copiedShotIndex === expandedShotIndex
                              ? 'Copied'
                              : 'Copy'}
                          </button>
                          <button
                            onClick={() =>
                              updateShot(expandedShotIndex, { prompt: '' })
                            }
                            className="hover:text-slate-600 transition-colors font-medium"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <PromptEditor
                        value={shot.prompt}
                        onChange={(val) =>
                          updateShot(expandedShotIndex, { prompt: val })
                        }
                        globals={globals}
                        placeholder="Describe your shot here..."
                      />

                      {expandedShotVars && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {expandedShotVars.map(({ varName, isResolved }) => (
                            <div
                              key={varName}
                              className={`px-2 py-1 type-level-4 font-mono rounded border ${isResolved ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-red-50 text-red-600 border-red-200'}`}
                            >
                              {`{${varName}}`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right: Shot Settings */}
                    <div className="w-full lg:w-[280px] shrink-0 flex flex-col gap-5">
                      <div>
                        <label className="type-level-2 font-semibold text-slate-800 mb-2 block">
                          Duration (s)
                        </label>
                        <div className="flex gap-2 w-full">
                          {[4, 8, 10].map((dur) => (
                            <button
                              key={dur}
                              onClick={() =>
                                updateShot(expandedShotIndex, { duration: dur })
                              }
                              className={`flex-1 h-8 rounded-md type-level-3 transition-colors font-medium ${
                                shot.duration === dur ||
                                shot.duration === String(dur)
                                  ? 'bg-violet-100 text-violet-700 border border-violet-200'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {dur}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="type-level-2 font-semibold text-slate-800 mb-2 block">
                          Resolution
                        </label>
                        <div className="flex gap-2 w-full">
                          {['720p', '1080p', '4k'].map((res) => (
                            <button
                              key={res}
                              onClick={() =>
                                updateShot(expandedShotIndex, {
                                  resolution: res,
                                })
                              }
                              className={`flex-1 h-8 rounded-md type-level-3 transition-colors font-medium ${
                                shot.resolution === res
                                  ? 'bg-violet-100 text-violet-700 border border-violet-200'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {res}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="type-level-2 font-semibold text-slate-800 mb-2 block">
                          Aspect Ratio
                        </label>
                        <div className="flex gap-2 w-full">
                          {['16:9', '9:16', '1:1'].map((ratio) => (
                            <button
                              key={ratio}
                              onClick={() =>
                                updateShot(expandedShotIndex, {
                                  aspectRatio: ratio,
                                })
                              }
                              className={`flex-1 h-8 rounded-md type-level-3 transition-colors font-medium ${
                                (shot.aspectRatio || '16:9') === ratio
                                  ? 'bg-violet-100 text-violet-700 border border-violet-200'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {ratio}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="type-level-2 font-semibold text-slate-800 mb-2 block">
                          Reference Images
                        </label>
                        {shot.imageRefs.length > 0 && (
                          <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
                            {shot.imageRefs.map((refId) => {
                              const img = images.find(
                                (img) => img.id === refId
                              );
                              return (
                                <div
                                  key={refId}
                                  className="relative group w-12 h-12 shrink-0 rounded-md border border-slate-200 overflow-hidden bg-white shadow-sm"
                                >
                                  {img ? (
                                    <Image
                                      src={img.previewUrl}
                                      alt="ref"
                                      fill
                                      unoptimized
                                      loading="lazy"
                                      className="object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[9px] text-slate-400">
                                      Ref {refId}
                                    </div>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateShot(expandedShotIndex, {
                                        imageRefs: shot.imageRefs.filter(
                                          (id) => id !== refId
                                        ),
                                      });
                                    }}
                                    className="absolute -top-1 -right-1 bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full w-5 h-5 flex items-center justify-center type-level-4 shadow-sm border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                    title="Remove image"
                                  >
                                    ×
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {shot.imageRefs.length < 3 && (
                          <DeviceAwareUpload
                            className="w-full"
                            onUpload={(files) => {
                              const newImages = addImagesToLibrary(files);
                              const availableSlots = 3 - shot.imageRefs.length;
                              const idsToAdd = newImages
                                .map((img) => img.id)
                                .slice(0, availableSlots);
                              updateShot(expandedShotIndex, {
                                imageRefs: [...shot.imageRefs, ...idsToAdd],
                              });
                            }}
                            onOpenLibrary={() => {
                              setImageLibraryModalShotIndex(expandedShotIndex);
                              setSelectedLibraryImages([]);
                            }}
                            hasLibraryImages={images.length > 0}
                          >
                            <button
                              type="button"
                              className="w-full py-2 type-level-3 border border-dashed border-slate-300 rounded-md text-slate-500 hover:text-violet-700 hover:border-violet-300 hover:bg-violet-50 transition-colors flex items-center justify-center gap-1.5 font-medium"
                            >
                              + Add Image
                            </button>
                          </DeviceAwareUpload>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Right Pane: Globals, Settings & Library */}
      <div className="w-[300px] shrink-0 h-auto lg:h-full overflow-y-auto bg-white border-l border-slate-200 flex flex-col shadow-sm box-border relative">
        {/* Globals Section */}
        <div className="p-5 border-b border-slate-100 bg-white flex-shrink-0">
          <div className="shrink-0 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div
              className={`flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors ${isGlobalsExpanded ? 'border-b border-slate-100' : ''}`}
              onClick={() => setIsGlobalsExpanded(!isGlobalsExpanded)}
            >
              <h2 className="type-level-1 text-slate-800 flex items-center gap-2">
                Globals
                <span className="type-level-3 font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
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
                  <div className="type-level-3 text-slate-500">
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
                        className="type-level-2 px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors font-medium"
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
                        className="type-level-2 px-3 py-1 bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-lg transition-colors font-medium"
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
                        className="type-level-2 px-3 py-1 bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-lg transition-colors font-medium"
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
                          className="type-level-3 text-slate-500 hover:text-violet-600 bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50 active:bg-violet-100 active:scale-95 px-2 py-1 rounded transition-colors flex items-center gap-1.5 shadow-sm"
                          title="Copy variables"
                        >
                          {isGlobalsBulkCopied ? 'Copied' : 'Copy'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setBulkText('');
                          }}
                          className="type-level-3 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 active:bg-slate-200 active:scale-95 px-2 py-1 rounded transition-colors shadow-sm"
                          title="Clear variables"
                        >
                          Clear
                        </button>
                      </div>
                      <textarea
                        value={bulkText}
                        onChange={(e) => setBulkText(e.target.value)}
                        placeholder={'KEY=value\nLONG_KEY="""long\nvalue"""'}
                        className="w-full h-64 bg-slate-50 border border-slate-200 text-slate-900 font-mono type-level-2 p-4 pt-12 rounded-xl focus:outline-none focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100 transition"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setIsBulkEditing(false)}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 type-level-2 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          // Save bulk edit
                          const newGlobals: {
                            name: string;
                            value: string;
                          }[] = [];
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
                          setIsBulkEditing(false);
                          setIsGlobalsExpanded(false);
                        }}
                        className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white type-level-2 rounded-lg transition-colors"
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
                        <div className="font-mono type-level-2 text-slate-700 font-semibold break-all pt-1">
                          {g.name}
                        </div>
                        <div className="type-level-2 text-slate-600 break-words whitespace-pre-wrap pt-1 line-clamp-3">
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
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {globals.length === 0 && (
                      <div className="text-center text-slate-500 type-level-2 py-4 border border-dashed border-slate-200 rounded-lg">
                        No globals defined. Click "+ Add Variable" or "Bulk
                        Edit" to create one.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Generation Settings */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="type-level-4 text-slate-500">Generation Settings</h2>
          </div>

          <div className="flex flex-col">
            {/* Top section: Provider */}
            <div className="pb-4 mb-4 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${providerConfig.activeProvider === 'vertex' ? 'bg-green-500' : 'bg-blue-500'}`}
                  />
                  <span className="type-level-2 text-slate-700">
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
                  className="type-level-3 text-violet-600 hover:text-violet-700 transition-colors"
                >
                  Change
                </button>
              </div>
            </div>

            {/* Second section: Model */}
            <div className="pb-4 mb-4 border-b border-slate-200">
              <label className="field-label mb-2 block">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 type-level-2 text-slate-900 shadow-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              >
                {providerConfig.activeProvider === 'vertex' ? (
                  <>
                    <option value="veo-3.1-fast-generate-001">
                      Veo 3.1 Fast
                    </option>
                    <option value="veo-3.1-generate-001">Veo 3.1 Pro</option>
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
                <option value="seedance-1.5-pro">Seedance 1.5 Pro</option>
                <option value="grok-imagine-image-to-video-beta">
                  Grok (Beta)
                </option>
              </select>

              {/* Model Info Note */}
              <div className="mt-2 type-level-3 text-slate-500 flex items-start gap-1.5">
                {model === 'veo-3.1-lite-generate-preview' && (
                  <>
                    <span className="shrink-0 mt-0.5">ℹ</span>
                    <span>
                      Veo 3.1 Lite supports 1 image max per shot. Extra images
                      are ignored.
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
                      Seedance 2.0 will use an image reference if attached,
                      otherwise it will fall back to text-to-video
                      automatically.
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
                        This model uses Evolink and ignores the Vertex AI
                        toggle.
                      </span>
                    </>
                  )}
              </div>
            </div>

            {/* Third section: Generate */}
            <div className="mt-2">
              <button
                disabled={isGenerating || !shots.some((s) => s.selected)}
                onClick={async () => {
                  const selectedIndices = shots
                    .map((s, i) => (s.selected ? i : -1))
                    .filter((i) => i !== -1);

                  if (selectedIndices.length === 0)
                    return alert('Select at least one shot.');
                  const isEvolinkModel =
                    model === 'kling-o3-image-to-video' ||
                    model === 'seedance-2.0-reference-to-video' ||
                    model === 'grok-imagine-image-to-video-beta' ||
                    model === 'seedance-1.5-pro';
                  if (!isEvolinkModel) {
                    if (
                      providerConfig.activeProvider === 'vertex' &&
                      !providerConfig.vertexCredentials.serviceAccountKey
                    )
                      return alert(
                        'Please enter your Vertex AI service account key.'
                      );
                    if (
                      providerConfig.activeProvider !== 'vertex' &&
                      !providerConfig.geminiApiKey
                    )
                      return alert('Please enter your Gemini API key.');
                  }

                  setIsGenerating(true);
                  const controller = new AbortController();
                  setAbortController(controller);

                  setShots((prev) =>
                    prev.map((s, i) =>
                      selectedIndices.includes(i)
                        ? { ...s, status: 'generating' }
                        : s
                    )
                  );

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
                              let fileObj = img!.file;
                              if (!fileObj && img!.blobUrl) {
                                const r = await fetch(img!.blobUrl);
                                const b = await r.blob();
                                fileObj = new File([b], 'image.jpg', {
                                  type: b.type || 'image/jpeg',
                                });
                              }
                              if (!fileObj)
                                throw new Error('Image file missing');

                              const base64 = await resizeImageToBase64(
                                fileObj,
                                1024
                              );
                              return {
                                base64,
                                mimeType: fileObj.type || 'image/jpeg',
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
                        const existingCount = generatedVideos.filter(
                          (v) => v.shotNumber === shot.shot_number
                        ).length;

                        const base = {
                          prompt: finalPrompt,
                          modelName: model,
                          duration: shot.duration,
                          resolution: shot.resolution,
                          apiKey: providerConfig.geminiApiKey,
                          shotNumber: shot.shot_number,
                          existingCount: existingCount,
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
                            existingCount: existingCount,
                            imageUrls:
                              klingImages.length > 0
                                ? klingImages.map((img) => img!.blobUrl)
                                : [],
                            quality: shot.resolution,
                            aspect_ratio: shot.aspectRatio || '16:9',
                          };
                        } else if (providerConfig.activeProvider === 'vertex') {
                          const vertexBase = {
                            prompt: finalPrompt,
                            modelName: model,
                            duration: shot.duration,
                            resolution: shot.resolution,
                            aspectRatio: shot.aspectRatio || '9:16',
                            vertexKey:
                              providerConfig.vertexCredentials
                                .serviceAccountKey,
                            vertexLocation:
                              providerConfig.vertexCredentials.region,
                            shotNumber: shot.shot_number,
                            existingCount,
                          };
                          if (resolvedImages.length === 0) {
                            route = '/api/script/generate-video/vertex/text';
                            body = vertexBase;
                          } else if (isLite) {
                            route =
                              '/api/script/generate-video/vertex/image-direct';
                            body = {
                              ...vertexBase,
                              image: resolvedImages[0],
                            };
                          } else {
                            route =
                              '/api/script/generate-video/vertex/image-refs';
                            body = {
                              ...vertexBase,
                              referenceImages: resolvedImages,
                            };
                          }
                        } else if (resolvedImages.length === 0) {
                          route = '/api/script/generate-video/text';
                          body = base;
                        } else if (isLite) {
                          route = '/api/script/generate-video/image-direct';
                          body = { ...base, image: resolvedImages[0] };
                        } else {
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
                            const uploadRes = await fetch(
                              `/api/upload?filename=${encodeURIComponent(filename)}&scriptId=${encodeURIComponent(activeThreadId)}&shotId=${encodeURIComponent(shot.id ?? `shot_${shot.shot_number}`)}&version=${existingCount + 1}`,
                              {
                                method: 'POST',
                                body: blob,
                              }
                            );
                            const uploadData = await uploadRes.json();
                            if (uploadData?.url) {
                              videoUrl = uploadData.url;
                              const videoRef = await addDoc(
                                collection(db, 'generatedVideos'),
                                {
                                  scriptId: activeThreadId,
                                  userId: user?.uid,
                                  shotId: shot.id,
                                  blobUrl: videoUrl,
                                  createdAt: serverTimestamp(),
                                  updatedAt: serverTimestamp(),
                                }
                              );

                              setGeneratedVideos((prev) => [
                                ...prev,
                                {
                                  id: videoRef.id,
                                  blobUrl: videoUrl!,
                                  shotId: shot.id!,
                                  shotNumber: shot.shot_number,
                                  createdAt: Date.now(),
                                },
                              ]);
                              console.log(
                                `[generate-video] saved to Firestore as ${filename}`
                              );
                            } else {
                              videoUrl = URL.createObjectURL(blob);
                            }
                          } catch (e) {
                            console.warn(
                              `[generate-video] Firestore save failed:`,
                              e
                            );
                            videoUrl = URL.createObjectURL(blob);
                          }
                          console.log(
                            `[generate-video] video URL ready: ${videoUrl}`
                          );
                        } else {
                          const data = await res.json();
                          errorMsg = data.error || 'Video generation failed.';
                          console.warn(
                            `[generate-video] error response:`,
                            data
                          );
                        }

                        if (videoUrl) {
                          setShots((prev) => {
                            const newShots = [...prev];
                            newShots[i] = {
                              ...newShots[i],
                              status: 'completed',
                            };
                            return newShots;
                          });
                        } else {
                          setShots((prev) => {
                            const newShots = [...prev];
                            newShots[i] = {
                              ...newShots[i],
                              status: 'error',
                            };
                            return newShots;
                          });
                          console.warn('Failed to generate video:', errorMsg);
                          showGenerationToast(
                            `Shot ${shots[i].shot_number}: ${errorMsg}`
                          );
                        }
                      } catch (error: unknown) {
                        const isAbortError =
                          error instanceof Error && error.name === 'AbortError';
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
                className={`w-full py-3 ${
                  providerConfig.activeProvider === 'vertex'
                    ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-600'
                    : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600'
                } disabled:opacity-[0.45] disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors`}
              >
                {isGenerating
                  ? 'Generating...'
                  : shots.filter((s) => s.selected).length > 0
                    ? `Generate ${shots.filter((s) => s.selected).length} Selected Shot${shots.filter((s) => s.selected).length > 1 ? 's' : ''}`
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
                        s.status === 'generating' ? { ...s, status: 'idle' } : s
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
        </div>

        {/* Image Library */}
        <div className="p-6 flex-1 min-h-0 flex flex-col">
          <div
            className="flex items-center justify-between mb-4 cursor-pointer"
            onClick={() => setIsLibraryExpanded(!isLibraryExpanded)}
          >
            <h2 className="type-level-1 text-slate-800 flex items-center gap-1.5">
              Image Library{' '}
              <span className="text-slate-400 font-normal">
                &middot; {images.length}{' '}
                {images.length === 1 ? 'image' : 'images'}
              </span>
            </h2>
            <div className="flex items-center gap-3">
              <div onClick={(e) => e.stopPropagation()}>
                <DeviceAwareUpload
                  onUpload={(files) => addImagesToLibrary(files)}
                  onOpenLibrary={() => setIsLibraryExpanded(true)}
                  hasLibraryImages={false}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 h-8 px-3"
                  >
                    + Upload
                  </Button>
                </DeviceAwareUpload>
              </div>
              <div className="text-slate-400">
                {isLibraryExpanded ? '▼' : '▶'}
              </div>
            </div>
          </div>

          {isLibraryExpanded &&
            (images.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-slate-500 type-level-2 py-10 border border-dashed border-slate-200 rounded-lg bg-slate-50/50 gap-3 flex-1">
                <UploadCloud className="w-8 h-8 text-slate-300" />
                <div onClick={(e) => e.stopPropagation()}>
                  <DeviceAwareUpload
                    onUpload={(files) => addImagesToLibrary(files)}
                    onOpenLibrary={() => setIsLibraryExpanded(true)}
                    hasLibraryImages={false}
                  >
                    <button className="type-level-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors font-medium shadow-sm mt-1 cursor-pointer">
                      Upload your first image
                    </button>
                  </DeviceAwareUpload>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-1 overflow-y-auto pr-2 flex-1">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className="relative group aspect-square rounded-lg bg-slate-100 overflow-hidden cursor-pointer"
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
                        loading="lazy"
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(img.previewUrl);
                          }}
                          className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center text-white backdrop-blur-sm transition-colors"
                          title="Preview full-size"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setImageToDelete(img.id);
                          }}
                          className="w-8 h-8 rounded-full bg-white/20 hover:bg-red-500/80 flex items-center justify-center text-white backdrop-blur-sm transition-colors"
                          title="Remove from Library"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="type-level-4 text-slate-400 mt-3 text-center">
                  Drag images onto shots to use as reference
                </div>
              </>
            ))}
        </div>
      </div>
    </>
  );
}

export default memo(ScriptPanels);
