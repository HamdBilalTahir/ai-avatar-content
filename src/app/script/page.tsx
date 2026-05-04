'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import * as initialData from './constants';
import { ConfirmPopup } from '@/components/ConfirmPopup';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import ScriptPanels from './ScriptPanels';
import { Shot, GeneratedVideo, ImageItem, ScriptThread } from './types';

export default function ScriptPage() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<ScriptThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingThreadName, setEditingThreadName] = useState('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [expandedShotIndex, setExpandedShotIndex] = useState<number | null>(0);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [model, setModel] = useState('veo-3.1-fast-generate-001');
  const [playingVideo, setPlayingVideo] = useState<{
    url: string;
    filename: string;
  } | null>(null);
  const [recentSuccessUrls] = useState<string[]>([]);
  const [globals, setGlobals] = useState<
    { id?: string; name: string; value: string; isEditing?: boolean }[]
  >([]);
  const [editingVarIndex, setEditingVarIndex] = useState<number | null>(null);
  const [editingVarContent, setEditingVarContent] = useState({
    name: '',
    value: '',
  });
  const [shotToDelete, setShotToDelete] = useState<number | null>(null);
  const [isDeletingAllVars, setIsDeletingAllVars] = useState(false);
  const [varToDelete, setVarToDelete] = useState<number | null>(null);
  const [imageLibraryModalShotIndex, setImageLibraryModalShotIndex] = useState<
    number | null
  >(null);
  const [selectedLibraryImages, setSelectedLibraryImages] = useState<string[]>(
    []
  );
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
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
  const lastSavedRef = useRef<string>('');

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

  const loadThreadData = async (threadId: string) => {
    try {
      const scriptSnap = await getDoc(doc(db, 'scripts', threadId));
      if (scriptSnap.exists()) {
        const data = scriptSnap.data();
        if (data.model) setModel(data.model);
      }

      const globalsSnap = await getDocs(
        collection(db, 'scripts', threadId, 'globals')
      );
      const loadedGlobals = globalsSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        value: d.data().value,
      }));
      setGlobals(loadedGlobals);

      const shotsSnap = await getDocs(
        query(
          collection(db, 'scripts', threadId, 'shots'),
          orderBy('shotNumber', 'asc')
        )
      );
      if (shotsSnap.empty) {
        const initialShot: Shot = {
          id: `shot_${Date.now()}`,
          shot_number: 1,
          duration: initialData.PODCAST_SHOTS[0]?.duration || 8,
          resolution: '720p',
          aspectRatio: '16:9',
          imageRefs: [],
          prompt: '',
          selected: false,
        };
        setShots([initialShot]);
      } else {
        const loadedShots = shotsSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            shot_number: data.shotNumber,
            duration: data.duration,
            resolution: data.resolution || '720p',
            aspectRatio: data.aspectRatio || '16:9',
            imageRefs: data.imageRefs || [],
            prompt: data.prompt || '',
            status: data.status || 'idle',
            selected: false,
          } as Shot;
        });
        setShots(loadedShots);
      }

      try {
        const videosSnap = await getDocs(
          query(
            collection(db, 'generatedVideos'),
            where('scriptId', '==', threadId)
          )
        );
        const loadedVideos = videosSnap.docs
          .map((d) => ({
            id: d.id,
            blobUrl: d.data().blobUrl,
            shotId: d.data().shotId,
            shotNumber: d.data().shotNumber,
            createdAt: d.data().createdAt?.toMillis?.() || Date.now(),
          }))
          .sort((a, b) => a.createdAt - b.createdAt);
        setGeneratedVideos(loadedVideos);
      } catch (e) {
        console.warn('[restore] loadGeneratedVideos from Firestore failed:', e);
      }
    } catch (e) {
      console.error(e);
    }
  };

  React.useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        const scriptsSnap = await getDocs(
          query(
            collection(db, 'scripts'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc')
          )
        );

        let loadedThreads: ScriptThread[] = [];

        if (scriptsSnap.empty) {
          const inferredName = 'Script 1';
          const scriptRef = await addDoc(collection(db, 'scripts'), {
            userId: user.uid,
            name: inferredName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          loadedThreads = [
            { id: scriptRef.id, name: inferredName, createdAt: Date.now() },
          ];
        } else {
          loadedThreads = scriptsSnap.docs.map((d) => ({
            id: d.id,
            name: d.data().name || 'Script',
            createdAt: d.data().createdAt?.toMillis?.() || Date.now(),
          }));
        }

        setThreads(loadedThreads);

        const savedActiveId = localStorage.getItem('active_thread_id');
        const activeId =
          loadedThreads.find((t) => t.id === savedActiveId)?.id ??
          loadedThreads[0].id;

        setActiveThreadId(activeId);
        localStorage.setItem('active_thread_id', activeId);

        const imagesSnap = await getDocs(
          query(collection(db, 'imageLibrary'), where('userId', '==', user.uid))
        );
        const loadedImages = imagesSnap.docs
          .map((d) => ({
            id: d.id,
            previewUrl: d.data().blobUrl,
            blobUrl: d.data().blobUrl,
            createdAt: d.data().createdAt?.toMillis?.() || Date.now(),
          }))
          .sort((a, b) => b.createdAt - a.createdAt);
        setImages(loadedImages);

        await loadThreadData(activeId);

        // Setup baseline for sync
        lastSavedRef.current = JSON.stringify({ shots, globals, model });
        setIsLoaded(true);
      } catch (error) {
        console.error('Error loading scripts:', error);
        setIsLoaded(true);
      }
    };

    loadData();
  }, [user]);

  const syncToFirestoreNow = async (
    threadId: string,
    currentShots: Shot[],
    currentGlobals: { id?: string; name: string; value: string }[],
    currentModel: string
  ) => {
    if (!user || !isLoaded) return;
    try {
      const batch = writeBatch(db);
      const scriptRef = doc(db, 'scripts', threadId);

      batch.set(
        scriptRef,
        { model: currentModel, updatedAt: serverTimestamp() },
        { merge: true }
      );

      const shotsSnap = await getDocs(
        collection(db, 'scripts', threadId, 'shots')
      );
      const existingShotIds = new Set(shotsSnap.docs.map((d) => d.id));

      // Track new shots that need their local id replaced with Firestore auto-id
      const idUpdates: { oldId: string; newId: string }[] = [];

      currentShots.forEach((shot) => {
        if (!shot.id) return;

        const shotData: any = {
          scriptId: threadId,
          shotNumber: shot.shot_number,
          duration: shot.duration,
          resolution: shot.resolution || '720p',
          aspectRatio: shot.aspectRatio || '16:9',
          prompt: shot.prompt,
          imageRefs: shot.imageRefs,
          status: shot.status || 'idle',
          updatedAt: serverTimestamp(),
        };

        if (existingShotIds.has(shot.id)) {
          // Shot already exists in Firestore — update in place
          const shotRef = doc(db, 'scripts', threadId, 'shots', shot.id);
          shotData.shotId = shot.id;
          batch.set(shotRef, shotData, { merge: true });
          existingShotIds.delete(shot.id);
        } else {
          // New shot — let Firestore generate the ID
          const newShotRef = doc(collection(db, 'scripts', threadId, 'shots'));
          shotData.shotId = newShotRef.id;
          shotData.createdAt = serverTimestamp();
          batch.set(newShotRef, shotData);
          idUpdates.push({ oldId: shot.id, newId: newShotRef.id });
        }
      });

      existingShotIds.forEach((id) => {
        batch.delete(doc(db, 'scripts', threadId, 'shots', id));
      });

      const globalsSnap = await getDocs(
        collection(db, 'scripts', threadId, 'globals')
      );
      const existingGlobalIds = new Set(globalsSnap.docs.map((d) => d.id));
      const globalIdUpdates: { oldName: string; newId: string }[] = [];

      currentGlobals.forEach((g) => {
        if (!g.name.trim()) return;

        const globalData: any = {
          scriptId: threadId,
          name: g.name,
          value: g.value,
          updatedAt: serverTimestamp(),
        };

        if (g.id && existingGlobalIds.has(g.id)) {
          const globalRef = doc(db, 'scripts', threadId, 'globals', g.id);
          globalData.globalId = g.id;
          batch.set(globalRef, globalData, { merge: true });
          existingGlobalIds.delete(g.id);
        } else {
          const newGlobalRef = doc(
            collection(db, 'scripts', threadId, 'globals')
          );
          globalData.globalId = newGlobalRef.id;
          globalData.createdAt = serverTimestamp();
          batch.set(newGlobalRef, globalData);
          globalIdUpdates.push({ oldName: g.name, newId: newGlobalRef.id });
        }
      });

      existingGlobalIds.forEach((id) => {
        batch.delete(doc(db, 'scripts', threadId, 'globals', id));
      });

      await batch.commit();

      if (idUpdates.length > 0) {
        setShots((prev) =>
          prev.map((s) => {
            const update = idUpdates.find((u) => u.oldId === s.id);
            return update ? { ...s, id: update.newId } : s;
          })
        );
      }
      if (globalIdUpdates.length > 0) {
        setGlobals((prev) => {
          const updates = new Map(
            globalIdUpdates.map((u) => [u.oldName, u.newId])
          );
          return prev.map((g) =>
            !g.id && updates.has(g.name)
              ? { ...g, id: updates.get(g.name)! }
              : g
          );
        });
      }

      lastSavedRef.current = JSON.stringify({
        shots: currentShots,
        globals: currentGlobals,
        model: currentModel,
      });
    } catch (e) {
      console.error('Sync failed', e);
    }
  };

  React.useEffect(() => {
    if (!isLoaded || !activeThreadId || !user) return;

    const currentDataStr = JSON.stringify({ shots, globals, model });
    if (lastSavedRef.current === currentDataStr) return;

    const timeoutId = setTimeout(() => {
      syncToFirestoreNow(activeThreadId, shots, globals, model);
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [shots, globals, model, isLoaded, activeThreadId, user]);

  const switchThread = async (id: string) => {
    if (id === activeThreadId) return;

    await syncToFirestoreNow(activeThreadId, shots, globals, model);

    setActiveThreadId(id);
    localStorage.setItem('active_thread_id', id);

    setIsLoaded(false);
    await loadThreadData(id);
    setExpandedShotIndex(0);
    setIsLoaded(true);
  };

  const createThread = async () => {
    if (!user) return;
    const name = `Script ${threads.length + 1}`;
    try {
      const scriptRef = await addDoc(collection(db, 'scripts'), {
        userId: user.uid,
        name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const id = scriptRef.id;
      setThreads((prev) => [{ id, name, createdAt: Date.now() }, ...prev]);
      switchThread(id);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteThread = async (id: string) => {
    if (threads.length === 1) return;
    const updated = threads.filter((t) => t.id !== id);
    setThreads(updated);
    if (id === activeThreadId) switchThread(updated[0].id);

    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'scripts', id));
      const shotsSnap = await getDocs(collection(db, 'scripts', id, 'shots'));
      shotsSnap.forEach((d) => batch.delete(d.ref));
      const globalsSnap = await getDocs(
        collection(db, 'scripts', id, 'globals')
      );
      globalsSnap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    } catch (e) {
      console.error('Failed to delete script from Firestore', e);
    }
  };

  const renameThread = async (id: string, name: string) => {
    const updated = threads.map((t) => (t.id === id ? { ...t, name } : t));
    setThreads(updated);
    try {
      await updateDoc(doc(db, 'scripts', id), {
        name,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
    }
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && playingVideo) {
        setPlayingVideo(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playingVideo]);

  const addShot = () => {
    const newShot: Shot = {
      id: `shot_${Date.now()}_${Math.random().toString(36).substring(7)}`,
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
      previewUrl: URL.createObjectURL(file), // temporary full-size; replaced by thumbnail below
    }));
    setImages((prev) => [...prev, ...newImages]);

    // Generate small thumbnails (≤300px, 65% quality) for display — keeps raw file intact for API
    newImages.forEach(({ id, file }) => {
      const blobUrl = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, 300 / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        const thumbUrl = canvas.toDataURL('image/jpeg', 0.65);
        URL.revokeObjectURL(blobUrl);
        setImages((prev) =>
          prev.map((i) => (i.id === id ? { ...i, previewUrl: thumbUrl } : i))
        );
      };
      img.onerror = () => URL.revokeObjectURL(blobUrl);
      img.src = blobUrl;
    });

    newImages.forEach((img) => {
      const formData = new FormData();
      formData.append('file', img.file);
      fetch('/api/images', { method: 'POST', body: formData })
        .then((res) => (res.ok ? res.json() : null))
        .then(async (data) => {
          if (!data?.url) return;
          const blobUrl = data.url;
          setImages((prev) =>
            prev.map((i) => (i.id === img.id ? { ...i, blobUrl } : i))
          );
          try {
            const imageDocRef = await addDoc(collection(db, 'imageLibrary'), {
              userId: user!.uid,
              name: img.file.name,
              blobUrl,
              createdAt: serverTimestamp(),
            });
            setImages((prev) =>
              prev.map((i) =>
                i.id === img.id ? { ...i, id: imageDocRef.id } : i
              )
            );
            // Also update any shots that might be referencing this temporary id
            setShots((prevShots) =>
              prevShots.map((shot) => ({
                ...shot,
                imageRefs: shot.imageRefs
                  ? shot.imageRefs.map((ref) =>
                      ref === img.id ? imageDocRef.id : ref
                    )
                  : [],
              }))
            );
          } catch (e) {
            console.error('Failed to save image to firestore', e);
          }
        })
        .catch((e) => {
          console.error('Failed to upload image', e);
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

  return (
    <div className="flex flex-col lg:flex-row lg:h-full bg-[#F9FAFB] text-foreground lg:overflow-hidden font-sans w-full min-w-0 box-border relative">
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

      <ScriptPanels
        shots={shots}
        setShots={setShots}
        updateShot={updateShot}
        addShot={addShot}
        expandedShotIndex={expandedShotIndex}
        setExpandedShotIndex={setExpandedShotIndex}
        isLoaded={isLoaded}
        globals={globals as any}
        setGlobals={setGlobals as any}
        images={images}
        addImagesToLibrary={addImagesToLibrary}
        generatedVideos={generatedVideos}
        setGeneratedVideos={setGeneratedVideos}
        threads={threads}
        activeThreadId={activeThreadId}
        showGenerationToast={showGenerationToast}
        setShotToDelete={setShotToDelete}
        setImageLibraryModalShotIndex={setImageLibraryModalShotIndex}
        setSelectedLibraryImages={setSelectedLibraryImages}
        setPlayingVideo={setPlayingVideo}
        setPreviewImage={setPreviewImage}
        setImageToDelete={setImageToDelete}
        setEditingVarIndex={setEditingVarIndex}
        setEditingVarContent={setEditingVarContent}
        setVarToDelete={setVarToDelete}
        setIsDeletingAllVars={setIsDeletingAllVars}
      />

      {/* Fullscreen Video Modal */}
      {playingVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-5xl">
            <div className="absolute -top-12 right-0 flex items-center gap-4">
              <button
                onClick={async () => {
                  const res = await fetch(playingVideo.url);
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = playingVideo.filename;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="text-white hover:text-neutral-300 text-sm font-medium"
              >
                Download
              </button>
              <button
                onClick={() => setPlayingVideo(null)}
                className="text-white hover:text-neutral-300 text-3xl font-light"
              >
                ×
              </button>
            </div>
            <video
              src={playingVideo.url}
              controls
              controlsList="nodownload"
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
                  setEditingVarIndex(null);
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
            setVarToDelete(null);
          }
        }}
        onCancel={() => setVarToDelete(null)}
      />

      <ConfirmPopup
        isOpen={imageToDelete !== null}
        title="Delete Image"
        message="Are you sure you want to permanently delete this image from your library?"
        onConfirm={async () => {
          if (imageToDelete) {
            const imgToDelete = images.find((img) => img.id === imageToDelete);
            if (imgToDelete?.blobUrl) {
              fetch('/api/images', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: imgToDelete.blobUrl }),
              }).catch(() => {});
            }

            try {
              await deleteDoc(doc(db, 'imageLibrary', imageToDelete));
            } catch (e) {
              console.error('Failed to delete image from firestore', e);
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
        onConfirm={async () => {
          if (videoToDelete !== null) {
            const { url } = videoToDelete;
            // Remove from Firestore
            try {
              const videosSnap = await getDocs(
                query(
                  collection(db, 'generatedVideos'),
                  where('scriptId', '==', activeThreadId)
                )
              );
              const docToDelete = videosSnap.docs.find(
                (d) => d.data().blobUrl === url
              );
              if (docToDelete) {
                const batch = writeBatch(db);
                batch.delete(docToDelete.ref);
                await batch.commit();
              }
            } catch (e) {
              console.error('Failed to delete video from firestore', e);
            }

            setGeneratedVideos((prev) => prev.filter((v) => v.blobUrl !== url));
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
                          loading="lazy"
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
      {/* Fullscreen Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-6 right-6 text-white hover:text-neutral-300 text-3xl font-light z-10"
          >
            ×
          </button>
          <div
            className="relative max-w-5xl max-h-[90vh] w-full p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={previewImage}
              alt="Preview"
              width={1920}
              height={1080}
              unoptimized
              className="object-contain max-h-[90vh] w-full rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
