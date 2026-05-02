'use client';
import React, { useState, useEffect } from 'react';
import { EditorProvider, useEditor } from './store';
import ProjectsPanel from './_components/ProjectsPanel';
import MediaPanel from './_components/MediaPanel';
import Preview from './_components/Preview';
import Timeline from './_components/Timeline';

function ExportButton() {
  const { state, activeProject, dispatch } = useEditor();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    if (!activeProject) return;
    setExportError(null);
    setExporting(true);
    try {
      // Step 1: upload any media not yet on server; collect resolved server paths
      const serverPaths = new Map<string, string>(
        state.mediaItems
          .filter((m) => m.serverPath)
          .map((m) => [m.id, m.serverPath!])
      );

      const toUpload = state.mediaItems.filter(
        (m) =>
          activeProject.clips.some((c) => c.mediaItemId === m.id) &&
          !m.serverPath
      );

      for (const item of toUpload) {
        const blob = await fetch(item.localUrl).then((r) => r.blob());
        const form = new FormData();
        form.append(
          'file',
          blob,
          item.name + (item.type === 'video' ? '.mp4' : '.mp3')
        );
        form.append('itemId', item.id);
        form.append('projectId', activeProject.id);
        const res = await fetch('/api/video-maker/upload', {
          method: 'POST',
          body: form,
        });
        if (!res.ok) throw new Error('Upload failed for ' + item.name);
        const { serverPath } = (await res.json()) as { serverPath: string };
        serverPaths.set(item.id, serverPath);
        dispatch({
          type: 'SET_MEDIA_SERVER_PATH',
          itemId: item.id,
          serverPath,
        });
      }

      // Step 2: build export manifest using freshly resolved server paths
      const manifest = {
        projectId: activeProject.id,
        tracks: activeProject.tracks,
        clips: activeProject.clips.map((clip) => {
          const media = state.mediaItems.find((m) => m.id === clip.mediaItemId);
          return {
            ...clip,
            serverPath: serverPaths.get(clip.mediaItemId) ?? null,
            mediaDuration: media?.duration ?? 0,
          };
        }),
      };

      const res = await fetch('/api/video-maker/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manifest),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Export failed');
      }

      // Step 3: download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeProject.name.replace(/\s+/g, '_')}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {exportError && (
        <span className="type-level-3 text-red-500">{exportError}</span>
      )}
      <button
        onClick={handleExport}
        disabled={!activeProject || exporting}
        className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 type-level-2 text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {exporting ? (
          <>
            <svg
              className="h-3.5 w-3.5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="12" cy="12" r="10" strokeOpacity={0.2} />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
            Exporting…
          </>
        ) : (
          <>
            <svg
              className="h-3.5 w-3.5"
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
            Export MP4
          </>
        )}
      </button>
    </div>
  );
}

function VideoMakerInner() {
  const { activeProject, dispatch } = useEditor();
  const [sidebarTab, setSidebarTab] = useState<'projects' | 'media'>(
    'projects'
  );

  // Global Undo/Redo shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          dispatch({ type: 'REDO' });
        } else {
          dispatch({ type: 'UNDO' });
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900 overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600">
            <svg
              className="h-5 w-5 text-white"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M15 10l4.553-2.277A1 1 0 0 1 21 8.693v6.614a1 1 0 0 1-1.447.916L15 14v-4zM3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
            </svg>
          </div>
          <span className="font-semibold text-slate-800 text-base tracking-tight">
            Video Maker
          </span>
          {activeProject && (
            <>
              <span className="text-slate-300">›</span>
              <span className="type-level-2 text-slate-500">
                {activeProject.name}
              </span>
            </>
          )}
        </div>
        <ExportButton />
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="flex w-80 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
          {/* Sidebar tabs */}
          <div className="flex border-b border-slate-200">
            {(
              [
                { key: 'projects', label: 'Projects' },
                { key: 'media', label: 'Media' },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setSidebarTab(t.key)}
                className={`flex-1 py-3 type-level-2 transition ${
                  sidebarTab === t.key
                    ? 'border-b-2 border-violet-600 text-violet-700'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Sidebar content */}
          <div className="flex-1 overflow-hidden">
            {sidebarTab === 'projects' ? <ProjectsPanel /> : <MediaPanel />}
          </div>
        </div>

        {/* Main area: preview top, timeline bottom */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Preview — takes up ~55% */}
          <div
            className="flex-shrink-0 bg-slate-100 border-b border-slate-200"
            style={{ height: '55%' }}
          >
            <Preview />
          </div>

          {/* Timeline — fills remaining space */}
          <div className="flex-1 overflow-hidden">
            <Timeline />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VideoMakerPage() {
  return (
    <EditorProvider>
      <VideoMakerInner />
    </EditorProvider>
  );
}
