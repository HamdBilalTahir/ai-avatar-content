'use client';

import React, { useState, useRef } from 'react';
import * as initialData from './constants';

type Shot = {
  shot_number: number;
  duration: number;
  resolution: string;
  imageRefs: string[];
  prompt: string;
  selected?: boolean;
  status?: 'idle' | 'generating' | 'completed' | 'error';
  generatedVideoUrl?: string;
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
          const videoUrl = `/generated/shot_${shot.shot_number}.mp4`;
          try {
            const res = await fetch(videoUrl, { method: 'HEAD' });
            if (res.ok) {
              setShots((prev) => {
                const newShots = [...prev];
                // Only update if it hasn't started generating again
                if (newShots[index].status !== 'generating') {
                  newShots[index] = {
                    ...newShots[index],
                    status: 'completed',
                    generatedVideoUrl: videoUrl,
                  };
                }
                return newShots;
              });
            }
          } catch {
            // Ignore errors, file might not exist
          }
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
    <div className="flex h-screen bg-neutral-950 text-neutral-200 overflow-hidden font-sans">
      {/* Left Pane: Shots Accordion */}
      <div className="w-2/3 h-full overflow-y-auto border-r border-neutral-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Video Script Editor</h1>
          <button
            onClick={() => {
              const allSelected = shots.every((s) => s.selected);
              setShots(shots.map((s) => ({ ...s, selected: !allSelected })));
            }}
            className="text-sm text-neutral-400 hover:text-white"
          >
            {shots.every((s) => s.selected) ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        <div className="space-y-4">
          {!isLoaded ? (
            <div className="text-neutral-500">Loading...</div>
          ) : (
            shots.map((shot, index) => {
              const isExpanded = expandedShotIndex === index;

              return (
                <div
                  key={index}
                  className={`bg-neutral-900 border rounded-lg overflow-hidden ${
                    shot.selected ? 'border-violet-500' : 'border-neutral-800'
                  }`}
                >
                  {/* Accordion Header */}
                  <div
                    className="px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-neutral-800 transition-colors"
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
                      className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-violet-600 focus:ring-violet-500"
                    />
                    <div className="font-semibold flex-1 flex items-center gap-3">
                      Shot {shot.shot_number}{' '}
                      <span className="text-neutral-500 font-normal">
                        ({shot.duration}s, {shot.resolution})
                      </span>
                      {shot.status === 'generating' && (
                        <span className="flex items-center gap-2 px-2 py-1 bg-violet-500/10 text-violet-400 text-xs rounded-full">
                          <div className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                          Generating...
                        </span>
                      )}
                      {shot.status === 'completed' && (
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-500 text-xs rounded-full">
                          Done
                        </span>
                      )}
                      {shot.status === 'error' && (
                        <span className="px-2 py-0.5 bg-red-500/20 text-red-500 text-xs rounded-full">
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
                        className="text-neutral-500 hover:text-red-500 px-2 py-1"
                        title="Delete shot"
                      >
                        Delete
                      </button>
                      <div className="text-neutral-400">
                        {isExpanded ? '▼' : '▶'}
                      </div>
                    </div>
                  </div>

                  {/* Accordion Content */}
                  {isExpanded && (
                    <div className="p-4 border-t border-neutral-800 space-y-4 bg-neutral-950/50">
                      <div className="flex gap-4 mb-4">
                        <div className="flex-1">
                          <label className="block text-xs text-neutral-500 mb-1 uppercase tracking-wider">
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
                            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs text-neutral-500 mb-1 uppercase tracking-wider">
                            Resolution
                          </label>
                          <input
                            type="text"
                            value={shot.resolution}
                            onChange={(e) =>
                              updateShot(index, { resolution: e.target.value })
                            }
                            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-neutral-500 mb-1 uppercase tracking-wider">
                          Prompt
                        </label>
                        <textarea
                          value={shot.prompt}
                          onChange={(e) =>
                            updateShot(index, { prompt: e.target.value })
                          }
                          className="w-full h-80 bg-neutral-800 border border-neutral-700 rounded p-3 text-sm font-mono text-neutral-300 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-neutral-500 mb-2 uppercase tracking-wider">
                          Attached Images
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {shot.imageRefs.map((refId, i) => {
                            const img = images.find((img) => img.id === refId);
                            return (
                              <div
                                key={i}
                                className="relative group w-16 h-16 rounded border border-neutral-700 overflow-hidden bg-neutral-800"
                              >
                                {img ? (
                                  <img
                                    src={img.previewUrl}
                                    alt="ref"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs text-neutral-500">
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

                          <label className="w-16 h-16 flex flex-col items-center justify-center rounded border border-dashed border-neutral-600 cursor-pointer hover:border-neutral-400 hover:bg-neutral-800 transition-colors text-neutral-500 hover:text-white">
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
                        <div className="mt-2 text-xs text-neutral-500">
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
              className="w-full py-4 border-2 border-dashed border-neutral-700 rounded-lg text-neutral-400 hover:text-white hover:border-neutral-500 hover:bg-neutral-800 transition-all flex items-center justify-center gap-2"
            >
              <span className="text-lg">+</span> Add New Shot
            </button>
          )}
        </div>
      </div>

      {/* Right Pane: Settings & Library */}
      <div className="w-1/3 h-full bg-neutral-900 border-l border-neutral-800 flex flex-col overflow-hidden">
        {/* Generation Settings */}
        <div className="p-6 border-b border-neutral-800 bg-neutral-950/50 flex-shrink-0">
          <h2 className="text-xl font-bold text-white mb-4">
            Generation Settings
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-neutral-500 mb-1 uppercase tracking-wider">
                Veo API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AI Studio API Key"
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-500 mb-1 uppercase tracking-wider">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
              >
                <option value="veo-3.1-fast-generate-preview">
                  Veo 3.1 Fast
                </option>
                <option value="veo-3.1-generate-preview">Veo 3.1 Pro</option>
              </select>
            </div>

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
                      // Get the image file if there are image references attached
                      // The current implementation is simple and expects a file upload on the server.
                      // For now, we will send the prompt and config to the API.
                      const res = await fetch('/api/script/generate-video', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          prompt: shot.prompt,
                          modelName: model,
                          duration: shot.duration,
                          resolution: shot.resolution,
                          apiKey: apiKey,
                          shotNumber: shot.shot_number,
                          // TODO: Handle image uploads separately if needed
                        }),
                      });

                      const data = await res.json();

                      setShots((prev) => {
                        const newShots = [...prev];
                        if (res.ok && data.videoUrl) {
                          newShots[i] = {
                            ...newShots[i],
                            status: 'completed',
                            generatedVideoUrl: data.videoUrl,
                          };
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
                    } catch (error) {
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
                });
              }}
              className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              {isGenerating
                ? 'Generating...'
                : `Generate Selected Shots (${shots.filter((s) => s.selected).length})`}
            </button>
          </div>
        </div>

        {/* Image Library (Slideable horizontally) */}
        <div className="p-6 border-b border-neutral-800 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Image Library</h2>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-white rounded transition-colors"
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
            <div className="text-center text-neutral-500 text-sm py-4 border border-dashed border-neutral-700 rounded-lg">
              No images uploaded yet.
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="relative group w-24 h-24 flex-shrink-0 snap-start rounded-lg border border-neutral-700 overflow-hidden cursor-pointer hover:border-blue-500 transition-colors"
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
                  <img
                    src={img.previewUrl}
                    alt="Library Item"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs font-semibold text-white text-center p-1">
                    Attach to Shot
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Generated Media (Moved down and slideable horizontally) */}
        <div className="p-6 flex-1 min-h-0 flex flex-col">
          <h2 className="text-xl font-bold text-white mb-4 flex-shrink-0">
            Generated Media
          </h2>

          <div className="flex gap-4 overflow-x-auto pb-2 snap-x h-full items-start">
            {shots.filter(
              (s) => s.status === 'completed' && s.generatedVideoUrl
            ).length === 0 &&
            shots.filter((s) => s.status === 'generating').length === 0 ? (
              <div className="w-full text-center text-neutral-500 text-sm mt-4">
                No generated videos yet. Select shots to generate.
              </div>
            ) : (
              <>
                {shots
                  .filter(
                    (s) => s.status === 'completed' && s.generatedVideoUrl
                  )
                  .map((shot) => (
                    <div
                      key={`vid-${shot.shot_number}`}
                      className="bg-neutral-800 rounded-lg p-3 border border-neutral-700 w-64 flex-shrink-0 snap-start"
                    >
                      <div className="text-sm font-semibold text-white mb-2 flex items-center justify-between">
                        <span>Shot {shot.shot_number}</span>
                        <a
                          href={shot.generatedVideoUrl}
                          download={`Shot_${shot.shot_number}.mp4`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-violet-400 hover:text-violet-300"
                        >
                          Download
                        </a>
                      </div>
                      <div
                        className="relative w-full rounded bg-black aspect-video cursor-pointer overflow-hidden group"
                        onClick={() =>
                          setPlayingVideoUrl(shot.generatedVideoUrl!)
                        }
                      >
                        <video
                          src={shot.generatedVideoUrl}
                          className="w-full h-full object-contain pointer-events-none"
                        />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                          <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-white pl-1">
                            ▶
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                {shots
                  .filter((s) => s.status === 'generating')
                  .map((shot) => (
                    <div
                      key={`vid-gen-${shot.shot_number}`}
                      className="bg-neutral-800/50 rounded-lg p-4 border border-neutral-700 border-dashed w-48 flex-shrink-0 snap-start flex flex-col items-center justify-center text-neutral-400 h-32"
                    >
                      <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                      <span className="text-xs text-center">
                        Generating Shot {shot.shot_number}...
                      </span>
                    </div>
                  ))}
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
