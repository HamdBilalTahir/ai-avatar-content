'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import TopHeader from '@/components/TopHeader';
import ProviderBadge from '@/components/ProviderBadge';
import { Film, Play, Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Script = {
  id: string;
  name: string;
  createdAt: number;
};

type GeneratedVideo = {
  id: string;
  blobUrl: string;
  shotId: string;
  shotNumber: number;
  createdAt: number;
  scriptId: string;
};

type Shot = {
  id: string;
  shot_number: number;
  aspectRatio: string;
  scriptId: string;
};

export default function ResultsPage() {
  const { user } = useAuth();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [videos, setVideos] = useState<GeneratedVideo[]>([]);
  const [shots, setShots] = useState<Record<string, Shot>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  // Filters and Sorting
  const [selectedScriptId, setSelectedScriptId] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  const [playingVideo, setPlayingVideo] = useState<{
    url: string;
    filename: string;
  } | null>(null);

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        // Fetch Scripts
        const scriptsSnap = await getDocs(
          query(
            collection(db, 'scripts'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc')
          )
        );
        const loadedScripts = scriptsSnap.docs.map((d) => ({
          id: d.id,
          name: d.data().name || 'Script',
          createdAt: d.data().createdAt?.toMillis?.() || Date.now(),
        }));
        setScripts(loadedScripts);

        // Fetch Videos
        const videosSnap = await getDocs(
          query(
            collection(db, 'generatedVideos'),
            where('userId', '==', user.uid)
          )
        );
        const loadedVideos = videosSnap.docs.map((d) => ({
          id: d.id,
          blobUrl: d.data().blobUrl,
          shotId: d.data().shotId,
          shotNumber: d.data().shotNumber,
          createdAt: d.data().createdAt?.toMillis?.() || Date.now(),
          scriptId: d.data().scriptId,
        }));
        setVideos(loadedVideos);

        // Fetch Shots for scripts that have videos
        const uniqueScriptIds = Array.from(
          new Set(loadedVideos.map((v) => v.scriptId))
        );
        const loadedShots: Record<string, Shot> = {};

        await Promise.all(
          uniqueScriptIds.map(async (scriptId) => {
            try {
              const sSnap = await getDocs(
                collection(db, 'scripts', scriptId, 'shots')
              );
              sSnap.forEach((d) => {
                const data = d.data();
                loadedShots[d.id] = {
                  id: d.id,
                  shot_number: data.shotNumber,
                  aspectRatio: data.aspectRatio || '16:9',
                  scriptId: scriptId,
                };
              });
            } catch (e) {
              console.error(`Failed to fetch shots for script ${scriptId}`, e);
            }
          })
        );
        setShots(loadedShots);
      } catch (error) {
        console.error('Error loading library data:', error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadData();
  }, [user]);

  // Handle ESC for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && playingVideo) {
        setPlayingVideo(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playingVideo]);

  if (!isLoaded) {
    return (
      <div className="flex flex-col h-full bg-[#F9FAFB] items-center justify-center">
        <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="flex flex-col h-full bg-[#F9FAFB]">
        <ProviderBadge hideBadge />
        <TopHeader breadcrumbs={[{ label: 'Generated Video Library' }]} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <Film className="w-8 h-8 text-slate-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            No videos generated yet
          </h2>
          <p className="text-slate-500 type-level-2 mb-6 max-w-md">
            You haven't generated any videos. Head over to the Scripts page to
            create your first video.
          </p>
          <Link href="/script">
            <Button>Go to Scripts</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Group and filter
  const scriptIdsWithVideos = Array.from(
    new Set(videos.map((v) => v.scriptId))
  );
  const availableScripts = scripts.filter((s) =>
    scriptIdsWithVideos.includes(s.id)
  );

  // Apply Search
  const searchLower = searchQuery.toLowerCase();

  // A script matches if its name matches
  // A shot matches if "Shot X" matches
  // If search is active, we filter out videos that don't match. Wait, the search requirement:
  // "A search input that filters visible scripts and shots by name in real time as the user types."
  // So if script matches, show all shots. If shot matches (e.g. "shot 3"), show that shot.

  const filteredVideos = videos.filter((v) => {
    if (!searchQuery) return true;
    const script = scripts.find((s) => s.id === v.scriptId);
    const scriptName = script?.name.toLowerCase() || '';
    const actualShotNumber = v.shotNumber ?? shots[v.shotId]?.shot_number;
    const shotName = `shot ${actualShotNumber}`.toLowerCase();

    return scriptName.includes(searchLower) || shotName.includes(searchLower);
  });

  const filteredScriptIds = Array.from(
    new Set(filteredVideos.map((v) => v.scriptId))
  );

  return (
    <div className="flex flex-col h-full bg-[#F9FAFB] overflow-hidden">
      <ProviderBadge hideBadge />
      <TopHeader breadcrumbs={[{ label: 'Generated Video Library' }]} />

      {/* Toolbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4 shrink-0 z-10 sticky top-0">
        <select
          value={selectedScriptId}
          onChange={(e) => {
            const val = e.target.value;
            setSelectedScriptId(val);
            if (val !== 'all') {
              const el = document.getElementById(`script-section-${val}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }}
          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 type-level-2 text-slate-700 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 min-w-[200px]"
        >
          <option value="all">All scripts</option>
          {availableScripts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <div className="w-[1px] h-6 bg-slate-200 mx-2"></div>

        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 type-level-2 text-slate-700 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 min-w-[140px]"
        >
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>

        <div className="flex-1"></div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search scripts and shots..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg type-level-2 text-slate-700 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 w-64 transition-all focus:w-80"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
        <div className="max-w-7xl mx-auto space-y-12 pb-24">
          {availableScripts
            .filter((s) => filteredScriptIds.includes(s.id))
            .map((script) => {
              const scriptVideos = filteredVideos.filter(
                (v) => v.scriptId === script.id
              );
              if (scriptVideos.length === 0) return null;

              // Group videos by shotId (or shotNumber if missing)
              const shotGroups: Record<string, GeneratedVideo[]> = {};
              scriptVideos.forEach((v) => {
                const key = v.shotId || `shot_${v.shotNumber}`;
                if (!shotGroups[key]) shotGroups[key] = [];
                shotGroups[key].push(v);
              });

              // Determine default aspect ratio for the script based on any available shots
              const scriptShots = Object.values(shots).filter(
                (s) => s.scriptId === script.id
              );
              const defaultAspectRatio =
                scriptShots.length > 0 ? scriptShots[0].aspectRatio : '16:9';

              // Sort shots by shotNumber
              const sortedShotKeys = Object.keys(shotGroups).sort((a, b) => {
                const numA =
                  shotGroups[a][0].shotNumber ?? shots[a]?.shot_number ?? 0;
                const numB =
                  shotGroups[b][0].shotNumber ?? shots[b]?.shot_number ?? 0;
                return numA - numB;
              });

              return (
                <div
                  key={script.id}
                  id={`script-section-${script.id}`}
                  className="space-y-6 scroll-mt-24"
                >
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold text-slate-900">
                      {script.name}
                    </h1>
                    <span className="type-level-3 font-medium text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                      {scriptVideos.length}{' '}
                      {scriptVideos.length === 1 ? 'video' : 'videos'}
                    </span>
                  </div>

                  <div className="space-y-8 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                    {sortedShotKeys.map((shotKey) => {
                      const groupVideos = [...shotGroups[shotKey]];

                      // Sort videos
                      groupVideos.sort((a, b) =>
                        sortOrder === 'desc'
                          ? b.createdAt - a.createdAt
                          : a.createdAt - b.createdAt
                      );

                      const shotData = shots[shotKey];
                      const shotNumber =
                        groupVideos[0].shotNumber ?? shotData?.shot_number;
                      const aspectRatio =
                        shotData?.aspectRatio || defaultAspectRatio;

                      const isPortrait = aspectRatio === '9:16';
                      const isSquare = aspectRatio === '1:1';
                      const aspectRatioClass = isPortrait
                        ? 'aspect-[9/16]'
                        : isSquare
                          ? 'aspect-square'
                          : 'aspect-video';

                      const cardWidth = isPortrait
                        ? '140px'
                        : isSquare
                          ? '200px'
                          : '280px';

                      return (
                        <div key={shotKey} className="flex flex-col gap-3">
                          <h3 className="type-level-2 font-semibold text-slate-800">
                            Shot {shotNumber}
                          </h3>
                          <div className="flex gap-4 overflow-x-auto pb-4">
                            {groupVideos.map((video) => {
                              // We need to compute the version number properly.
                              // If we have all videos for this shot from `videos` state,
                              // we can compute its original version index.
                              const allShotVideos = videos
                                .filter((v) => v.shotId === video.shotId)
                                .sort((a, b) => a.createdAt - b.createdAt);
                              const versionIndex =
                                allShotVideos.indexOf(video) + 1;

                              return (
                                <div
                                  key={video.id}
                                  className="flex flex-col gap-2 shrink-0"
                                  style={{ width: cardWidth }}
                                >
                                  <div
                                    className={`relative w-full rounded-lg bg-black overflow-hidden group ${aspectRatioClass} border border-slate-200`}
                                  >
                                    <video
                                      src={video.blobUrl}
                                      preload="metadata"
                                      className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                      <div className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white">
                                        <Play className="w-3 h-3 ml-0.5" />
                                      </div>
                                    </div>
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-auto">
                                      <button
                                        onClick={() => {
                                          setPlayingVideo({
                                            url: video.blobUrl,
                                            filename: `${script.name} - Shot ${shotNumber} - v${versionIndex}.mp4`,
                                          });
                                        }}
                                        className="w-8 h-8 rounded-full bg-white/20 hover:bg-violet-500 flex items-center justify-center text-white backdrop-blur-sm transition-colors"
                                        title="Play"
                                      >
                                        <Play className="w-3 h-3 ml-0.5" />
                                      </button>
                                      <button
                                        onClick={async () => {
                                          const res = await fetch(
                                            video.blobUrl
                                          );
                                          const blob = await res.blob();
                                          const url = URL.createObjectURL(blob);
                                          const a = document.createElement('a');
                                          a.href = url;
                                          a.download = `${script.name} - Shot ${shotNumber} - v${versionIndex}.mp4`;
                                          a.click();
                                          URL.revokeObjectURL(url);
                                        }}
                                        className="w-8 h-8 rounded-full bg-white/20 hover:bg-violet-500 flex items-center justify-center text-white backdrop-blur-sm transition-colors"
                                        title="Download"
                                      >
                                        <Download className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="text-[11px] text-slate-400 text-center font-medium">
                                    v{versionIndex}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

          {filteredScriptIds.length === 0 && searchQuery && (
            <div className="text-center py-12 text-slate-500 type-level-2">
              No results found for "{searchQuery}"
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Video Modal */}
      {playingVideo && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90"
          onClick={() => setPlayingVideo(null)}
        >
          <div className="absolute top-6 right-6 flex items-center gap-4 z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                fetch(playingVideo.url)
                  .then((res) => res.blob())
                  .then((blob) => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = playingVideo.filename;
                    a.click();
                    URL.revokeObjectURL(url);
                  });
              }}
              className="text-white hover:text-neutral-300 type-level-2 flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" /> Download
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(playingVideo.url);
                alert('Video link copied to clipboard!');
              }}
              className="text-white hover:text-neutral-300 type-level-2 flex items-center gap-1.5"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                <polyline points="16 6 12 2 8 6"></polyline>
                <line x1="12" y1="2" x2="12" y2="15"></line>
              </svg>{' '}
              Share
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPlayingVideo(null);
              }}
              className="text-white hover:text-neutral-300 text-3xl font-light ml-4"
            >
              ×
            </button>
          </div>
          <div className="relative w-full max-w-7xl flex flex-col items-center p-4">
            <video
              src={playingVideo.url}
              controls
              controlsList="nodownload"
              autoPlay
              className="rounded-lg bg-black shadow-2xl h-[90vh] max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="mt-4 text-slate-400 type-level-2 font-medium">
              {playingVideo.filename.replace('.mp4', '').replace(/ - /g, ' · ')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
