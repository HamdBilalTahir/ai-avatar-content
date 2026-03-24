'use client';
import { useState } from 'react';
import { useEditor } from '../store';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function ProjectsPanel() {
  const { state, dispatch, activeProject } = useEditor();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  function createProject() {
    const id = uid();
    dispatch({
      type: 'CREATE_PROJECT',
      id,
      name: `Project ${state.projects.length + 1}`,
    });
  }

  function startRename(id: string, currentName: string) {
    setEditingId(id);
    setEditName(currentName);
  }

  function commitRename(id: string) {
    if (editName.trim()) {
      dispatch({
        type: 'RENAME_PROJECT',
        projectId: id,
        name: editName.trim(),
      });
    }
    setEditingId(null);
  }

  function deleteProject(id: string) {
    if (!confirm('Delete this project?')) return;
    dispatch({ type: 'DELETE_PROJECT', projectId: id });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Projects
        </h2>
        <button
          onClick={createProject}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-700 active:scale-[0.98]"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          New Project
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto py-1">
        {state.projects.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-slate-400">
            No projects yet. Create one to get started.
          </p>
        )}
        {state.projects.map((project) => {
          const isActive = project.id === activeProject?.id;
          return (
            <div
              key={project.id}
              onClick={() =>
                dispatch({ type: 'SET_ACTIVE_PROJECT', projectId: project.id })
              }
              className={`group mx-2 my-0.5 flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition ${
                isActive
                  ? 'bg-violet-50 border border-violet-200'
                  : 'hover:bg-slate-100 border border-transparent'
              }`}
            >
              {/* Film icon */}
              <svg
                className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-violet-600' : 'text-slate-400'}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path
                  d="M7 6V18M17 6V18M2 10h3M19 10h3M2 14h3M19 14h3"
                  strokeLinecap="round"
                />
              </svg>

              {/* Name / edit field */}
              {editingId === project.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => commitRename(project.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(project.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 rounded border border-violet-300 bg-white px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-violet-400"
                />
              ) : (
                <span
                  className={`flex-1 min-w-0 truncate text-xs font-medium ${isActive ? 'text-violet-800' : 'text-slate-700'}`}
                >
                  {project.name}
                </span>
              )}

              {/* Action buttons — show on hover or when active */}
              <div
                className={`flex items-center gap-0.5 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename(project.id, project.name);
                  }}
                  title="Rename"
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700 transition"
                >
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                      strokeLinecap="round"
                    />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteProject(project.id);
                  }}
                  title="Delete"
                  className="rounded p-0.5 text-slate-400 hover:text-red-500 transition"
                >
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
