'use client';
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { MediaItem, Clip, Track, Project } from './types';
import { effectiveDuration } from './types';
import { loadAllMedia } from './mediaDb';

// ─── State ───────────────────────────────────────────────────────────────────

export interface EditorState {
  past: Project[][];
  future: Project[][];
  projects: Project[];
  activeProjectId: string | null;
  mediaItems: MediaItem[]; // in-memory only
  playhead: number; // white head — play position, advances during playback
  editCursor: number; // violet head — follows hover, used for edit ops
  isPlaying: boolean;
  zoom: number; // px per second
  selectedClipId: string | null;
  activeMediaTab: 'videos' | 'audio';
}

const INITIAL_STATE: EditorState = {
  past: [],
  future: [],
  projects: [],
  activeProjectId: null,
  mediaItems: [],
  playhead: 0,
  editCursor: 0,
  isPlaying: false,
  zoom: 60,
  selectedClipId: null,
  activeMediaTab: 'videos',
};

// ─── Actions ─────────────────────────────────────────────────────────────────

function createId() {
  return Math.random().toString(36).slice(2, 9);
}

export type EditorAction =
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'LOAD_PERSISTED'; projects: Project[] }
  | { type: 'CREATE_PROJECT'; id: string; name: string }
  | { type: 'DELETE_PROJECT'; projectId: string }
  | { type: 'RENAME_PROJECT'; projectId: string; name: string }
  | { type: 'SET_ACTIVE_PROJECT'; projectId: string | null }
  | { type: 'ADD_TRACK'; track: Track }
  | { type: 'DELETE_TRACK'; trackId: string }
  | { type: 'TOGGLE_MUTE'; trackId: string }
  | { type: 'ADD_MEDIA_ITEM'; item: MediaItem }
  | { type: 'REMOVE_MEDIA_ITEM'; itemId: string }
  | { type: 'SET_MEDIA_SERVER_PATH'; itemId: string; serverPath: string }
  | { type: 'ADD_CLIP'; clip: Clip }
  | {
      type: 'MOVE_CLIP';
      clipId: string;
      timelineStart: number;
      trackId: string;
    }
  | { type: 'TRIM_CLIP'; clipId: string; trimStart: number; trimEnd: number }
  | { type: 'SPLIT_CLIP'; clipId: string; atTime: number; newClipId: string }
  | { type: 'SET_CLIP_SPEED'; clipId: string; speed: number }
  | { type: 'SET_CLIP_VOLUME'; clipId: string; volume: number }
  | { type: 'DELETE_CLIP'; clipId: string }
  | { type: 'SET_PLAYHEAD'; time: number }
  | { type: 'ADVANCE_PLAYHEAD'; dt: number }
  | { type: 'SET_EDIT_CURSOR'; time: number }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'SELECT_CLIP'; clipId: string | null }
  | { type: 'SET_MEDIA_TAB'; tab: 'videos' | 'audio' }
  | { type: 'SNAPSHOT_FOR_UNDO' }
  | { type: 'SET_CLIP_VOLUME_PREVIEW'; clipId: string; volume: number }
  | { type: 'SET_CLIP_SPEED_PREVIEW'; clipId: string; speed: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getProject(state: EditorState): Project | null {
  return state.projects.find((p) => p.id === state.activeProjectId) ?? null;
}

function updateProject(
  state: EditorState,
  updated: Project,
  isUndoRedo = false
): EditorState {
  const newProjects = state.projects.map((p) =>
    p.id === updated.id ? updated : p
  );
  if (isUndoRedo) {
    return { ...state, projects: newProjects };
  }
  return {
    ...state,
    past: [...state.past, state.projects],
    future: [],
    projects: newProjects,
  };
}

function patchClips(
  state: EditorState,
  fn: (clips: Clip[]) => Clip[]
): EditorState {
  const project = getProject(state);
  if (!project) return state;
  return updateProject(state, {
    ...project,
    clips: fn(project.clips),
    updatedAt: Date.now(),
  });
}

/** Update clips without pushing to undo history (used during live drag previews) */
function patchClipsNoHistory(
  state: EditorState,
  fn: (clips: Clip[]) => Clip[]
): EditorState {
  const project = getProject(state);
  if (!project) return state;
  return updateProject(
    state,
    { ...project, clips: fn(project.clips), updatedAt: Date.now() },
    true // isUndoRedo = true → skip history push
  );
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'LOAD_PERSISTED':
      return { ...state, projects: action.projects };

    case 'CREATE_PROJECT': {
      const defaultVideoTrack: Track = {
        id: `track-${Date.now()}-v`,
        type: 'video',
        name: 'Video 1',
        muted: false,
      };
      const defaultAudioTrack: Track = {
        id: `track-${Date.now()}-a`,
        type: 'audio',
        name: 'Audio 1',
        muted: false,
      };
      const project: Project = {
        id: action.id,
        name: action.name,
        tracks: [defaultVideoTrack, defaultAudioTrack],
        clips: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      return {
        ...state,
        projects: [...state.projects, project],
        activeProjectId: project.id,
        playhead: 0,
        selectedClipId: null,
      };
    }

    case 'DELETE_PROJECT': {
      const remaining = state.projects.filter((p) => p.id !== action.projectId);
      const nextActive =
        state.activeProjectId === action.projectId
          ? (remaining[0]?.id ?? null)
          : state.activeProjectId;
      return { ...state, projects: remaining, activeProjectId: nextActive };
    }

    case 'RENAME_PROJECT':
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.projectId
            ? { ...p, name: action.name, updatedAt: Date.now() }
            : p
        ),
      };

    case 'SET_ACTIVE_PROJECT':
      return {
        ...state,
        activeProjectId: action.projectId,
        playhead: 0,
        selectedClipId: null,
        isPlaying: false,
      };

    case 'ADD_TRACK': {
      const project = getProject(state);
      if (!project) return state;
      return updateProject(state, {
        ...project,
        tracks: [...project.tracks, action.track],
        updatedAt: Date.now(),
      });
    }

    case 'DELETE_TRACK': {
      const project = getProject(state);
      if (!project) return state;
      return updateProject(state, {
        ...project,
        tracks: project.tracks.filter((t) => t.id !== action.trackId),
        clips: project.clips.filter((c) => c.trackId !== action.trackId),
        updatedAt: Date.now(),
      });
    }

    case 'TOGGLE_MUTE': {
      const project = getProject(state);
      if (!project) return state;
      return updateProject(state, {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === action.trackId ? { ...t, muted: !t.muted } : t
        ),
        updatedAt: Date.now(),
      });
    }

    case 'ADD_MEDIA_ITEM':
      return { ...state, mediaItems: [...state.mediaItems, action.item] };

    case 'UNDO': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, state.past.length - 1);
      return {
        ...state,
        past: newPast,
        future: [state.projects, ...state.future],
        projects: previous,
      };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      return {
        ...state,
        past: [...state.past, state.projects],
        future: newFuture,
        projects: next,
      };
    }

    case 'REMOVE_MEDIA_ITEM': {
      // Remove all clips that reference this media item from all projects, and remove tracks that become empty
      const newProjects = state.projects.map((p) => {
        const remainingClips = p.clips.filter(
          (c) => c.mediaItemId !== action.itemId
        );
        const removedClips = p.clips.filter(
          (c) => c.mediaItemId === action.itemId
        );
        const removedTrackIds = new Set(removedClips.map((c) => c.trackId));

        const remainingTracks = p.tracks.filter((t) => {
          if (removedTrackIds.has(t.id)) {
            return remainingClips.some((c) => c.trackId === t.id);
          }
          return true;
        });

        return {
          ...p,
          clips: remainingClips,
          tracks: remainingTracks,
        };
      });
      return {
        ...state,
        past: [...state.past, state.projects],
        future: [],
        projects: newProjects,
        mediaItems: state.mediaItems.filter((m) => m.id !== action.itemId),
      };
    }

    case 'SET_MEDIA_SERVER_PATH':
      return {
        ...state,
        mediaItems: state.mediaItems.map((m) =>
          m.id === action.itemId ? { ...m, serverPath: action.serverPath } : m
        ),
      };

    case 'ADD_CLIP': {
      const project = getProject(state);
      if (!project) return state;

      const clip: Clip = { ...action.clip };

      const newClips = [...project.clips];
      const mediaItem = state.mediaItems.find(
        (m) => m.id === action.clip.mediaItemId
      );
      let updatedTracks = [...project.tracks];

      if (mediaItem && mediaItem.type === 'video') {
        let audioTrack = updatedTracks.find(
          (t) => t.type === 'audio' && !t.muted
        );
        if (!audioTrack) {
          audioTrack = {
            id: `track-${Date.now()}-a`,
            type: 'audio',
            name: `Audio ${updatedTracks.filter((t) => t.type === 'audio').length + 1}`,
            muted: false,
          };
          updatedTracks.push(audioTrack);
        }

        if (audioTrack) {
          // Add the video clip but with 0 volume
          newClips.push({ ...clip, volume: 0 });
          // Add the extracted audio clip
          newClips.push({
            ...clip,
            id: createId(),
            trackId: audioTrack.id,
            // Keep all the properties synced initially except volume
          });
        } else {
          newClips.push(clip);
        }
      } else {
        newClips.push(clip);
      }

      return updateProject(state, {
        ...project,
        tracks: updatedTracks,
        clips: newClips,
        updatedAt: Date.now(),
      });
    }

    case 'MOVE_CLIP':
      return patchClips(state, (clips) => {
        // Find the clip being moved to see if it's a video clip
        const movedClip = clips.find((c) => c.id === action.clipId);

        return clips.map((c) => {
          // Update the moved clip
          if (c.id === action.clipId) {
            return {
              ...c,
              timelineStart: Math.max(0, action.timelineStart),
              trackId: action.trackId,
            };
          }

          // If we move a video clip, also move its associated extracted audio clip if it exists.
          if (
            movedClip &&
            c.mediaItemId === movedClip.mediaItemId &&
            c.id !== action.clipId
          ) {
            const track = state.projects
              .find((p) => p.id === state.activeProjectId)
              ?.tracks.find((t) => t.id === c.trackId);
            if (track && track.type === 'audio') {
              return {
                ...c,
                timelineStart: Math.max(0, action.timelineStart),
              };
            }
          }

          return c;
        });
      });

    case 'TRIM_CLIP':
      return patchClips(state, (clips) => {
        const trimmedClip = clips.find((c) => c.id === action.clipId);

        return clips.map((c) => {
          if (c.id === action.clipId) {
            return {
              ...c,
              trimStart: Math.max(0, action.trimStart),
              trimEnd: Math.max(0, action.trimEnd),
            };
          }

          // Try to sync trim operations for extracted audio clips too
          if (
            trimmedClip &&
            c.mediaItemId === trimmedClip.mediaItemId &&
            c.timelineStart === trimmedClip.timelineStart &&
            c.id !== action.clipId
          ) {
            const track = state.projects
              .find((p) => p.id === state.activeProjectId)
              ?.tracks.find((t) => t.id === c.trackId);
            if (track && track.type === 'audio') {
              return {
                ...c,
                trimStart: Math.max(0, action.trimStart),
                trimEnd: Math.max(0, action.trimEnd),
              };
            }
          }

          return c;
        });
      });

    case 'SPLIT_CLIP': {
      const project = getProject(state);
      if (!project) return state;
      const clip = project.clips.find((c) => c.id === action.clipId);
      if (!clip) return state;
      const media = state.mediaItems.find((m) => m.id === clip.mediaItemId);
      if (!media) return state;

      const elapsed = action.atTime - clip.timelineStart;
      const splitSourceTime = clip.trimStart + elapsed * (clip.speed ?? 1);

      // left clip ends right before the split time. The new trimEnd is simply everything
      // after the split time, which is exactly (media.duration - splitSourceTime)
      const leftClip: Clip = {
        ...clip,
        trimEnd: media.duration - splitSourceTime,
      };
      const rightClip: Clip = {
        ...clip,
        id: action.newClipId,
        timelineStart: action.atTime,
        trimStart: splitSourceTime,
        trimEnd: clip.trimEnd,
      };

      let newClips = project.clips
        .filter((c) => c.id !== action.clipId)
        .concat([leftClip, rightClip]);

      // Also split the extracted audio clip if this was a video clip
      const associatedAudioClip = project.clips.find(
        (c) =>
          c.id !== action.clipId &&
          c.mediaItemId === clip.mediaItemId &&
          c.timelineStart === clip.timelineStart
      );
      if (associatedAudioClip) {
        const track = project.tracks.find(
          (t) => t.id === associatedAudioClip.trackId
        );
        if (track && track.type === 'audio') {
          const leftAudioClip: Clip = {
            ...associatedAudioClip,
            trimEnd: media.duration - splitSourceTime,
          };
          const rightAudioClip: Clip = {
            ...associatedAudioClip,
            id: createId(),
            timelineStart: action.atTime,
            trimStart: splitSourceTime,
            trimEnd: associatedAudioClip.trimEnd,
          };
          newClips = newClips
            .filter((c) => c.id !== associatedAudioClip.id)
            .concat([leftAudioClip, rightAudioClip]);
        }
      }

      return updateProject(state, {
        ...project,
        clips: newClips,
        updatedAt: Date.now(),
      });
    }

    case 'SET_CLIP_SPEED':
      return patchClips(state, (clips) =>
        clips.map((c) =>
          c.id === action.clipId ? { ...c, speed: action.speed } : c
        )
      );

    case 'SET_CLIP_VOLUME':
      return patchClips(state, (clips) =>
        clips.map((c) =>
          c.id === action.clipId ? { ...c, volume: action.volume } : c
        )
      );

    case 'DELETE_CLIP':
      return patchClips(state, (clips) => {
        const deletedClip = clips.find((c) => c.id === action.clipId);
        let newClips = clips.filter((c) => c.id !== action.clipId);

        // Also delete extracted audio if video was deleted
        if (deletedClip) {
          const track = state.projects
            .find((p) => p.id === state.activeProjectId)
            ?.tracks.find((t) => t.id === deletedClip.trackId);
          if (track && track.type === 'video') {
            newClips = newClips.filter(
              (c) =>
                !(
                  c.mediaItemId === deletedClip.mediaItemId &&
                  c.timelineStart === deletedClip.timelineStart &&
                  c.trimStart === deletedClip.trimStart &&
                  c.trimEnd === deletedClip.trimEnd &&
                  c.id !== action.clipId
                )
            );
          }
        }

        return newClips;
      });

    case 'SET_PLAYHEAD':
      return { ...state, playhead: Math.max(0, action.time) };

    case 'ADVANCE_PLAYHEAD':
      return { ...state, playhead: Math.max(0, state.playhead + action.dt) };

    case 'SET_EDIT_CURSOR':
      return { ...state, editCursor: Math.max(0, action.time) };

    case 'SET_PLAYING':
      return { ...state, isPlaying: action.playing };

    case 'SET_ZOOM':
      return { ...state, zoom: Math.min(480, Math.max(30, action.zoom)) };

    case 'SELECT_CLIP':
      return { ...state, selectedClipId: action.clipId };

    case 'SET_MEDIA_TAB':
      return { ...state, activeMediaTab: action.tab };

    case 'SNAPSHOT_FOR_UNDO':
      return { ...state, past: [...state.past, state.projects], future: [] };

    case 'SET_CLIP_VOLUME_PREVIEW':
      return patchClipsNoHistory(state, (clips) =>
        clips.map((c) =>
          c.id === action.clipId ? { ...c, volume: action.volume } : c
        )
      );

    case 'SET_CLIP_SPEED_PREVIEW':
      return patchClipsNoHistory(state, (clips) =>
        clips.map((c) =>
          c.id === action.clipId ? { ...c, speed: action.speed } : c
        )
      );

    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface EditorContextValue {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  activeProject: Project | null;
}

const EditorContext = createContext<EditorContextValue | null>(null);

const LS_KEY = 'video-maker-projects';

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // Load projects from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const projects = JSON.parse(raw) as Project[];
        dispatch({ type: 'LOAD_PERSISTED', projects });
        if (projects.length > 0) {
          dispatch({ type: 'SET_ACTIVE_PROJECT', projectId: projects[0].id });
        }
      }
    } catch {
      /* corrupt — start fresh */
    }
  }, []);

  // Restore media blobs from IndexedDB on mount
  useEffect(() => {
    loadAllMedia()
      .then((records) => {
        for (const record of records) {
          const localUrl = URL.createObjectURL(record.blob);
          const item: MediaItem = {
            id: record.id,
            name: record.name,
            type: record.type,
            localUrl,
            serverPath: null,
            duration: record.duration,
            thumbnail: record.thumbnail,
            waveform: record.waveform,
            size: record.size,
          };
          dispatch({ type: 'ADD_MEDIA_ITEM', item });
        }
      })
      .catch(() => {
        /* IndexedDB unavailable — skip silently */
      });
  }, []);

  // Persist projects to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state.projects));
    } catch {
      /* storage full */
    }
  }, [state.projects]);

  const activeProject =
    state.projects.find((p) => p.id === state.activeProjectId) ?? null;

  return (
    <EditorContext.Provider value={{ state, dispatch, activeProject }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used inside EditorProvider');
  return ctx;
}

// ─── Selectors ───────────────────────────────────────────────────────────────

/** Total timeline duration in seconds based on furthest clip end */
export function selectTotalDuration(
  project: Project | null,
  mediaItems: MediaItem[]
): number {
  if (!project || project.clips.length === 0) return 30;
  let max = 30;
  for (const clip of project.clips) {
    const media = mediaItems.find((m) => m.id === clip.mediaItemId);
    if (!media) continue;
    const end = clip.timelineStart + effectiveDuration(clip, media.duration);
    if (end > max) max = end;
  }
  return max + 5; // 5s padding
}
