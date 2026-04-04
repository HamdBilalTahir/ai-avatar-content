'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import * as initialData from './constants';

type Shot = {
  shot_number: number;
  duration: number;
  resolution: string;
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
};

export default function ScriptPage() {
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const savedShots = localStorage.getItem('podcast_shots');
    if (savedShots) {
      try {
        const parsed = JSON.parse(savedShots);
        const resetShots = parsed.map((s: Shot) => ({
          ...s,
          status: s.status === 'generating' ? 'idle' : s.status,
        }));

        setShots(resetShots);

        // Check for existing generated videos in the background
        resetShots.forEach(async (shot: Shot, index: number) => {
          let urls: string[] = [];

          // Helper to sequentially check for files
          const checkFiles = async () => {
            // Check base file
            const baseUrl = `/generated/shot_${shot.shot_number}.mp4`;
            try {
              const res = await fetch(baseUrl, { method: 'HEAD' });
              if (res.ok) {
                urls.push(baseUrl);
              }
            } catch {
              // file doesn't exist
            }

            // Check numbered files
            let counter = 1;
            while (true) {
              // Try with space first (new format), then fallback to no space (old format)
              const newFormatUrl = `/generated/shot_${shot.shot_number} (${counter}).mp4`;
              const oldFormatUrl = `/generated/shot_${shot.shot_number}(${counter}).mp4`;

              try {
                let found = false;

                let res = await fetch(newFormatUrl, { method: 'HEAD' });
                if (res.ok) {
                  urls.push(newFormatUrl);
                  found = true;
                } else {
                  res = await fetch(oldFormatUrl, { method: 'HEAD' });
                  if (res.ok) {
                    urls.push(oldFormatUrl);
                    found = true;
                  }
                }

                if (found) {
                  counter++;
                } else {
                  break;
                }
              } catch {
                break;
              }
            }

            if (urls.length > 0) {
              setShots((prev) => {
                const newShots = [...prev];
                // Update urls list, merge with existing if any to avoid duplicates
                const existingUrls = newShots[index].generatedVideoUrls || [];
                const mergedUrls = Array.from(
                  new Set([...existingUrls, ...urls])
                );

                newShots[index] = {
                  ...newShots[index],
                  generatedVideoUrls: mergedUrls,
                  generatedVideoUrl: mergedUrls[mergedUrls.length - 1], // use latest
                };

                // Only update status to completed if it hasn't started generating again
                if (newShots[index].status !== 'generating') {
                  newShots[index].status = 'completed';
                }
                return newShots;
              });
            }
          };

          checkFiles();
        });
      } catch {
        setShots(
          initialData.PODCAST_SHOTS.map((s) => ({ ...s, selected: false }))
        );
      }
    } else {
      setShots(
        initialData.PODCAST_SHOTS.map((s) => ({ ...s, selected: false }))
      );
    }

    const savedApiKey = localStorage.getItem('veo_api_key');
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }

    const savedModel = localStorage.getItem('veo_model');
    if (savedModel) {
      setModel(savedModel);
    }

    setIsLoaded(true);
  }, []);

  React.useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('podcast_shots', JSON.stringify(shots));
      localStorage.setItem('veo_api_key', apiKey);
      localStorage.setItem('veo_model', model);
    }
  }, [shots, apiKey, model, isLoaded]);

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
      duration: 8,
      resolution: '720p',
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

  // Allow uploading images to the library
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newImages = Array.from(e.target.files).map((file) => ({
        id: Math.random().toString(36).substring(7),
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      setImages((prev) => [...prev, ...newImages]);
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Update a specific shot
  const updateShot = (index: number, updates: Partial<Shot>) => {
    const newShots = [...shots];
    newShots[index] = { ...newShots[index], ...updates };
    setShots(newShots);
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Left Pane: Shots Accordion */}
      <div className="w-2/3 h-full overflow-y-auto border-r border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            Video Script Editor
          </h1>
          <button
            onClick={() => {
              const allSelected = shots.every((s) => s.selected);
              setShots(shots.map((s) => ({ ...s, selected: !allSelected })));
            }}
            className="text-sm text-slate-500 hover:text-slate-900 font-medium"
          >
            {shots.every((s) => s.selected) ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        <div className="space-y-4">
          {!isLoaded ? (
            <div className="text-slate-500">Loading...</div>
          ) : (
            shots.map((shot, index) => {
              const isExpanded = expandedShotIndex === index;

              return (
                <div
                  key={index}
                  className={`bg-white border rounded-xl overflow-hidden shadow-sm transition-all ${
                    shot.selected
                      ? 'border-violet-400 ring-1 ring-violet-400'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Accordion Header */}
                  <div
                    className="px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() =>
                      setExpandedShotIndex(isExpanded ? null : index)
                    }
                  >
                    <input
                      type="checkbox"
                      checked={!!shot.selected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        updateShot(index, { selected: e.target.checked });
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    <div className="font-semibold text-slate-800 flex-1 flex items-center gap-3">
                      Shot {shot.shot_number}{' '}
                      <span className="text-slate-400 font-normal">
                        ({shot.duration}s, {shot.resolution})
                      </span>
                      {shot.status === 'generating' && (
                        <span className="flex items-center gap-2 px-2.5 py-1 bg-violet-100 text-violet-700 font-medium text-[10px] uppercase tracking-wider rounded-full">
                          <div className="w-3 h-3 border-2 border-violet-600 border-t-transparent rounded-full animate-spin"></div>
                          Generating...
                        </span>
                      )}
                      {shot.status === 'completed' && (
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 font-medium text-[10px] uppercase tracking-wider rounded-full">
                          Done
                        </span>
                      )}
                      {shot.status === 'error' && (
                        <span className="px-2.5 py-1 bg-red-100 text-red-700 font-medium text-[10px] uppercase tracking-wider rounded-full">
                          Error
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            confirm(
                              `Are you sure you want to delete Shot ${shot.shot_number}?`
                            )
                          ) {
                            removeShot(index);
                          }
                        }}
                        className="text-slate-400 hover:text-red-500 px-2 py-1 transition-colors"
                        title="Delete shot"
                      >
                        Delete
                      </button>
                      <div className="text-slate-400">
                        {isExpanded ? '▼' : '▶'}
                      </div>
                    </div>
                  </div>

                  {/* Accordion Content */}
                  {isExpanded && (
                    <div className="p-4 border-t border-slate-100 space-y-4 bg-slate-50/50">
                      <div className="flex gap-4 mb-4">
                        <div className="flex-1">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                            Duration (s)
                          </label>
                          <input
                            type="number"
                            value={shot.duration}
                            onChange={(e) =>
                              updateShot(index, {
                                duration: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                            Resolution
                          </label>
                          <input
                            type="text"
                            value={shot.resolution}
                            onChange={(e) =>
                              updateShot(index, { resolution: e.target.value })
                            }
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                          Prompt
                        </label>
                        <textarea
                          value={shot.prompt}
                          onChange={(e) =>
                            updateShot(index, { prompt: e.target.value })
                          }
                          className="w-full h-80 bg-white border border-slate-200 rounded-lg p-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                          Attached Images
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {shot.imageRefs.map((refId, i) => {
                            const img = images.find((img) => img.id === refId);
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
                                  onClick={() => {
                                    const newRefs = [...shot.imageRefs];
                                    newRefs.splice(i, 1);
                                    updateShot(index, { imageRefs: newRefs });
                                  }}
                                  className="absolute top-0 right-0 bg-red-500 text-white w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}

                          <label className="w-16 h-16 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition-colors text-slate-400 hover:text-violet-600 bg-white">
                            <span className="text-xl leading-none">+</span>
                            <input
                              type="file"
                              multiple
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                if (
                                  e.target.files &&
                                  e.target.files.length > 0
                                ) {
                                  const newImages = Array.from(
                                    e.target.files
                                  ).map((file) => ({
                                    id: Math.random().toString(36).substring(7),
                                    file,
                                    previewUrl: URL.createObjectURL(file),
                                  }));
                                  setImages((prev) => [...prev, ...newImages]);
                                  updateShot(index, {
                                    imageRefs: [
                                      ...shot.imageRefs,
                                      ...newImages.map((img) => img.id),
                                    ],
                                  });
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                        <div className="mt-2 text-[11px] text-slate-400">
                          Click the + button to upload and attach directly, or
                          click an image in the library.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {isLoaded && (
            <button
              onClick={addShot}
              className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:text-violet-700 hover:border-violet-300 hover:bg-violet-50 transition-all flex items-center justify-center gap-2 font-medium"
            >
              <span className="text-lg">+</span> Add New Shot
            </button>
          )}
        </div>
      </div>

      {/* Right Pane: Settings & Library */}
      <div className="w-1/3 h-full bg-white border-l border-slate-200 flex flex-col overflow-hidden shadow-sm z-10">
        {/* Generation Settings */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-800 mb-4">
            Generation Settings
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Veo API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AI Studio API Key"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              >
                <option value="veo-3.1-fast-generate-preview">
                  Veo 3.1 Fast
                </option>
                <option value="veo-3.1-generate-preview">Veo 3.1 Pro</option>
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
                  if (!apiKey) return alert('Please enter your API key.');

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
                        const res = await fetch('/api/script/generate-video', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          signal: controller.signal,
                          body: JSON.stringify({
                            prompt: shot.prompt,
                            modelName: model,
                            duration: shot.duration,
                            resolution: shot.resolution,
                            apiKey: apiKey,
                            shotNumber: shot.shot_number,
                          }),
                        });

                        const data = await res.json();

                        setShots((prev) => {
                          const newShots = [...prev];
                          if (res.ok && data.videoUrl) {
                            const existingUrls =
                              newShots[i].generatedVideoUrls || [];
                            const mergedUrls = Array.from(
                              new Set([...existingUrls, data.videoUrl])
                            );
                            newShots[i] = {
                              ...newShots[i],
                              status: 'completed',
                              generatedVideoUrl: data.videoUrl,
                              generatedVideoUrls: mergedUrls,
                            };

                            // Trigger hover animation for 3 seconds
                            setRecentSuccessUrls((prev) => [
                              ...prev,
                              data.videoUrl,
                            ]);
                            setTimeout(() => {
                              setRecentSuccessUrls((prev) =>
                                prev.filter((u) => u !== data.videoUrl)
                              );
                            }, 3000);
                          } else {
                            newShots[i] = {
                              ...newShots[i],
                              status: 'error',
                            };
                            console.error(
                              'Failed to generate video:',
                              data.error
                            );
                          }
                          return newShots;
                        });
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
                        console.error('Error generating video:', error);
                      }
                    })
                  ).finally(() => {
                    setIsGenerating(false);
                    setAbortController(null);
                  });
                }}
                className="flex-1 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                {isGenerating
                  ? 'Generating...'
                  : `Generate Selected Shots (${shots.filter((s) => s.selected).length})`}
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

        {/* Image Library (Slideable horizontally) */}
        <div className="p-6 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">Image Library</h2>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors font-medium shadow-sm"
            >
              + Upload
            </button>
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
          </div>

          {images.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-4 border border-dashed border-slate-300 rounded-lg bg-slate-50">
              No images uploaded yet.
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
                  <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs font-semibold text-white text-center p-1">
                    Attach to Shot
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Generated Media (Stacked in a grid) */}
        <div className="p-6 flex-1 min-h-0 flex flex-col">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex-shrink-0">
            Generated Media
          </h2>

          <div className="grid grid-cols-2 gap-4 overflow-y-auto h-full content-start pr-2">
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
                    const versionLabel = urls.length > 1 ? ` (v${i + 1})` : '';
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
                          <a
                            href={url}
                            download={`Shot_${shot.shot_number}${versionLabel}.mp4`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-violet-600 hover:text-violet-700 font-medium"
                          >
                            Download
                          </a>
                        </div>
                        <div
                          className="relative w-full rounded-lg bg-slate-900 aspect-video cursor-pointer overflow-hidden group"
                          onClick={() => setPlayingVideoUrl(url)}
                        >
                          <video
                            src={url}
                            className="w-full h-full object-contain pointer-events-none"
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
    </div>
  );
}
