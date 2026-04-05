# AI Avatar Content — System Architecture

> **Purpose**: Living architecture document for the AI Avatar Content pipeline. Updated as each task is completed. Use this as the authoritative reference for how the system works and how to extend it.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [High-Level Architecture Diagram](#3-high-level-architecture-diagram)
4. [Project Structure](#4-project-structure)
5. [Pages & Features](#5-pages--features)
6. [Rendering & Routing Architecture](#6-rendering--routing-architecture)
7. [Data Layer](#7-data-layer)
8. [TypeScript Types](#8-typescript-types)
9. [API Layer](#9-api-layer)
10. [Services Layer](#10-services-layer)
11. [Components](#11-components)
12. [Styling System](#12-styling-system)
13. [TypeScript Configuration](#13-typescript-configuration)
14. [Testing Architecture](#14-testing-architecture)
15. [Code Quality & Pre-commit Pipeline](#15-code-quality--pre-commit-pipeline)
16. [Build & Toolchain](#16-build--toolchain)
17. [Environment Configuration](#17-environment-configuration)
18. [Local Storage & Generated Files](#18-local-storage--generated-files)
19. [CI/CD](#19-cicd)
20. [Developer Workflow](#20-developer-workflow)

---

## 1. System Overview

The app has three distinct product areas accessible via a left sidebar:

| Area            | Route          | Purpose                                                                                       |
| --------------- | -------------- | --------------------------------------------------------------------------------------------- |
| **Avatar**      | `/avatar/new`  | Generate an AI avatar face image using Gemini; push to library                                |
| **Script**      | `/script`      | Write, manage and generate video shots; attach reference images; trigger Veo video generation |
| **Video Maker** | `/video-maker` | Browser-based NLE editor — arrange video/audio clips on a timeline and export via ffmpeg      |

### Build Status

| Area                 | Status  | Details                                                             |
| -------------------- | ------- | ------------------------------------------------------------------- |
| Framework            | ✅ Done | Next.js 16 App Router + React 19                                    |
| Language             | ✅ Done | TypeScript strict mode                                              |
| Styling              | ✅ Done | Tailwind CSS v4                                                     |
| Linting / Formatting | ✅ Done | ESLint 9 + Prettier                                                 |
| Testing              | ✅ Done | Jest 30 + React Testing Library                                     |
| Git Hooks            | ✅ Done | Husky + lint-staged                                                 |
| Shared Types         | ✅ Done | `src/lib/types.ts`                                                  |
| Redis / Job State    | ✅ Done | Upstash Redis via `src/lib/redis.ts` + `src/lib/jobs.ts`            |
| Avatar Generation    | ✅ Done | Gemini image API (`@google/generative-ai`) + `/api/avatar/generate` |
| Script Page          | ✅ Done | Shot editor, global vars, bulk edit, image refs, Veo generation     |
| Veo Video Generation | ✅ Done | `@google/genai` → Veo 3.1 + reference images per shot               |
| Script AI Generation | ✅ Done | Gemini via LangChain → `/api/script/generate`                       |
| Video Maker          | ✅ Done | Browser NLE with timeline, clip trimming, ffmpeg export             |
| TTS / Voice          | 🔲 TBD  | Cartesia                                                            |
| Lip Sync             | 🔲 TBD  | Sync.so / SkyReels (Gradio)                                         |
| Pipeline Status Page | 🔲 TBD  | Polling UI at `/pipeline/[id]`                                      |
| CI/CD                | 🔲 TBD  | —                                                                   |

---

## 2. Technology Stack

### Framework & Runtime

| Layer      | Technology           | Version |
| ---------- | -------------------- | ------- |
| Framework  | Next.js (App Router) | 16.1.6  |
| UI Library | React                | 19.2.3  |
| Language   | TypeScript           | ^5      |
| Runtime    | Node.js              | ≥20     |

### AI / ML Services

| Layer             | Technology                | Version | Purpose                                        |
| ----------------- | ------------------------- | ------- | ---------------------------------------------- |
| Video Generation  | `@google/genai`           | ^1.48.0 | Veo 3.1 video generation + reference images    |
| Image Generation  | `@google/generative-ai`   | ^0.24.1 | Gemini avatar image generation                 |
| Script Generation | `@langchain/google-genai` | ^2.1.25 | Gemini script generation via LangChain         |
| LangChain Core    | `@langchain/core`         | ^1.1.32 | Required peer for LangChain integrations       |
| Text-to-Speech    | `@cartesia/cartesia-js`   | ^3.0.0  | Cartesia TTS SDK (integrated, not fully wired) |
| Lip Sync (Gradio) | `@gradio/client`          | ^2.1.0  | SkyReels Gradio API for talking-head lip sync  |

### Infrastructure & Data

| Layer             | Technology       | Version | Purpose                               |
| ----------------- | ---------------- | ------- | ------------------------------------- |
| Job State         | `@upstash/redis` | ^1.37.0 | Serverless-safe Redis over HTTP       |
| File Download     | `axios`          | ^1.13.6 | Download completed video from Sync.so |
| Multipart Uploads | `form-data`      | ^4.0.5  | Submit audio + image to Sync.so       |

### Utilities

| Layer         | Technology    | Version  | Purpose                             |
| ------------- | ------------- | -------- | ----------------------------------- |
| ID Generation | `uuid`        | ^13.0.0  | Unique job IDs                      |
| UUID Types    | `@types/uuid` | ^11.0.0  | TypeScript types for uuid (dev)     |
| Audio DSP     | `tone`        | ^15.1.22 | Pitch shift / formant for voice tab |

### Styling

| Layer          | Technology              | Version              |
| -------------- | ----------------------- | -------------------- |
| CSS Framework  | Tailwind CSS            | ^4                   |
| PostCSS Plugin | @tailwindcss/postcss    | ^4                   |
| Fonts          | Geist Sans + Geist Mono | via next/font/google |

### Testing

| Layer             | Technology                | Version |
| ----------------- | ------------------------- | ------- |
| Test Runner       | Jest                      | ^30.3.0 |
| DOM Environment   | jest-environment-jsdom    | ^30.3.0 |
| Component Testing | @testing-library/react    | ^16.3.2 |
| DOM Assertions    | @testing-library/jest-dom | ^6.9.1  |
| TS Transform      | ts-jest                   | ^29.4.6 |

### Code Quality

| Layer              | Technology  | Version |
| ------------------ | ----------- | ------- |
| Linter             | ESLint      | ^9      |
| Formatter          | Prettier    | ^3.8.1  |
| Git Hooks          | Husky       | ^9.1.7  |
| Staged File Runner | lint-staged | ^16.3.3 |

---

## 3. High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                BROWSER                                    │
│                                                                           │
│  /avatar/new      — avatar creation (Gemini image)                        │
│  /script          — shot editor + Veo video generation                    │
│  /video-maker     — browser NLE timeline editor                           │
│  /pipeline/[id]   — pipeline status polling (TBD)                         │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │ HTTP / fetch
┌─────────────────────────────────▼────────────────────────────────────────┐
│                      NEXT.JS SERVER  (Vercel / Node.js)                   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                          API Routes                              │     │
│  │                                                                  │     │
│  │  POST /api/avatar/generate          → Gemini avatar image        │     │
│  │  POST /api/script/generate          → Gemini script via LangChain│     │
│  │  POST /api/script/generate-video    → Veo 3.1 video per shot     │     │
│  │  POST /api/video-maker/upload       → Save media to disk         │     │
│  │  POST /api/video-maker/export       → ffmpeg clip assembly       │     │
│  │  POST /api/pipeline/create          → Create job (TBD)           │     │
│  │  GET  /api/pipeline/[id]            → Poll job status (TBD)      │     │
│  │  GET  /api/storage/[id]/video       → Serve final video (TBD)    │     │
│  │  GET  /api/storage/[id]/audio       → Serve audio file (TBD)     │     │
│  │  GET  /api/storage/[id]/avatar      → Serve avatar image (TBD)   │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                        Services Layer                            │     │
│  │                                                                  │     │
│  │  services/gemini-image.ts   → Avatar image via Gemini API        │     │
│  │  services/gemini-script.ts  → Shot scripts via LangChain/Gemini  │     │
│  │  services/gemini-video.ts   → Veo 3.1 video + reference images   │     │
│  │  services/cartesia.ts       → Audio via Cartesia TTS             │     │
│  │  services/skyreels.ts       → Talking-head video via Gradio      │     │
│  │  services/voice-style.ts    → Voice style utilities              │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                          lib Layer                               │     │
│  │                                                                  │     │
│  │  lib/redis.ts    → Upstash Redis singleton                       │     │
│  │  lib/jobs.ts     → createJob / getJob / updateJob / getAvatar    │     │
│  │  lib/types.ts    → Shared TypeScript interfaces                  │     │
│  └─────────────────────────────────────────────────────────────────┘     │
└──────────┬──────────────────────────────┬────────────────────────────────┘
           │                              │
┌──────────▼──────────┐      ┌────────────▼─────────────────────────────┐
│   Upstash Redis      │      │          External AI APIs                 │
│                      │      │                                           │
│  job:{id}  → JSON    │      │  Google AI Studio  (Gemini image + text)  │
│  avatar:{id} → b64   │      │  Google AI Studio  (Veo 3.1 video)        │
│  syncso:{id} → jobId │      │  Cartesia          (TTS audio)            │
└──────────────────────┘      │  Sync.so           (lip sync video)       │
                              │  SkyReels / Gradio (talking head)         │
┌─────────────────────┐       └───────────────────────────────────────────┘
│  Local Filesystem    │
│                      │
│  ./storage/{job_id}/ │  ← pipeline job files (avatar.png, audio.wav, video.mp4)
│  ./public/generated/ │  ← Veo generated shots (shot_1.mp4, shot_2.mp4 …)
│  ./public/uploads/   │  ← Video Maker uploaded media
└─────────────────────┘
```

---

## 4. Project Structure

```
ai-avatar-content/
│
├── src/
│   ├── app/
│   │   ├── layout.tsx                          # Root layout (sidebar + body)
│   │   ├── page.tsx                            # Home "/" — redirects
│   │   ├── globals.css                         # Tailwind v4 @import + @theme
│   │   │
│   │   ├── avatar/
│   │   │   └── new/
│   │   │       └── page.tsx                    # ✅ Avatar creation (client)
│   │   │
│   │   ├── script/
│   │   │   ├── page.tsx                        # ✅ Shot editor + Veo generation (client)
│   │   │   └── constants.ts                    # PODCAST_SHOTS defaults, character/set prompts
│   │   │
│   │   ├── video-maker/
│   │   │   ├── page.tsx                        # ✅ NLE timeline editor (client)
│   │   │   ├── store.tsx                       # Zustand-style React context store
│   │   │   ├── types.ts                        # MediaItem, Clip, Track, Project types
│   │   │   ├── mediaDb.ts                      # IndexedDB wrapper for media blobs
│   │   │   ├── dragState.ts                    # Global drag state singleton
│   │   │   └── _components/
│   │   │       ├── ClipBlock.tsx               # Draggable clip on timeline
│   │   │       ├── MediaPanel.tsx              # Left panel — imported media list
│   │   │       ├── Preview.tsx                 # Centre — video preview player
│   │   │       ├── ProjectsPanel.tsx           # Project switcher / management
│   │   │       ├── Timeline.tsx                # Multi-track timeline
│   │   │       └── TrackRow.tsx                # Single track row
│   │   │
│   │   ├── pipeline/
│   │   │   └── [id]/
│   │   │       └── page.tsx                    # 🔲 Pipeline status + video output
│   │   │
│   │   └── api/
│   │       ├── avatar/
│   │       │   └── generate/route.ts           # ✅ POST — Gemini avatar image
│   │       ├── script/
│   │       │   ├── generate/route.ts           # ✅ POST — Gemini script via LangChain
│   │       │   └── generate-video/
│   │       │       ├── text/route.ts           # ✅ POST — Veo text-only generation
│   │       │       ├── image-direct/route.ts   # ✅ POST — Veo image-direct (Lite only)
│   │       │       └── image-refs/route.ts     # ✅ POST — Veo reference images (Fast/Pro)
│   │       ├── video-maker/
│   │       │   ├── upload/route.ts             # ✅ POST — Save media to public/uploads
│   │       │   └── export/route.ts             # ✅ POST — ffmpeg clip assembly
│   │       ├── pipeline/
│   │       │   ├── create/route.ts             # 🔲 POST — Start pipeline job
│   │       │   └── [id]/route.ts               # 🔲 GET — Job status polling
│   │       └── storage/
│   │           └── [id]/
│   │               ├── video/route.ts          # 🔲 GET — Serve final video
│   │               ├── audio/route.ts          # 🔲 GET — Serve audio file
│   │               └── avatar/route.ts         # 🔲 GET — Serve avatar image
│   │
│   ├── components/
│   │   ├── AppSidebar.tsx                      # ✅ Global left nav (Avatar / Script / Video Maker)
│   │   ├── ConfirmPopup.tsx                    # ✅ Reusable confirm/cancel modal
│   │   ├── DeviceAwareUpload.tsx               # ✅ Native file picker + Image Library portal menu
│   │   └── PromptEditor.tsx                    # ✅ Rich prompt editor with {variable} autocomplete
│   │
│   ├── hooks/
│   │   └── useAudioProcessor.ts                # ✅ Tone.js pitch/formant voice processor hook
│   │
│   ├── lib/
│   │   ├── types.ts                            # ✅ Shared TypeScript interfaces (PipelineJob etc.)
│   │   ├── redis.ts                            # ✅ Upstash Redis singleton
│   │   └── jobs.ts                             # ✅ Job CRUD utilities
│   │
│   └── services/
│       ├── gemini-image.ts                     # ✅ Avatar image via @google/generative-ai
│       ├── gemini-script.ts                    # ✅ Shot scripts via LangChain + Gemini
│       ├── gemini-video.ts                     # ✅ Veo 3.1 video via @google/genai
│       ├── cartesia.ts                         # ✅ TTS audio (wired, not fully used)
│       ├── skyreels.ts                         # ✅ Talking-head via SkyReels Gradio space
│       └── voice-style.ts                      # ✅ Voice style mappings
│
├── public/
│   └── uploads/                               # ✅ Video Maker uploaded media
│
├── storage/                                    # Pipeline job files (gitignored)
│   └── .gitkeep
│
├── .vscode/
│   └── settings.json                           # css.lint.unknownAtRules: ignore (Tailwind v4)
│
├── .env                                        # Local env vars (gitignored)
├── .env_example                                # Template
├── next.config.ts
├── tsconfig.json
├── package.json
├── Architecture.md
└── CHANGE-LOGS.md
```

### Path Alias

```
@/* → ./src/*
```

---

## 5. Pages & Features

### `/avatar/new` — Avatar Creation

- **Layout**: Two-column on desktop (form left, preview right `w-[400px]` sticky). Single-column on mobile.
- **Flow**: User writes a face description → `POST /api/avatar/generate` → Gemini returns base64 image → displayed in right column with copy / download / regenerate buttons. Image opens in lightbox on click.
- **Actions**: Regenerate, Download, Push to Library (copies to image library in Script page).
- **API Key**: Gemini API key stored in `localStorage`, togglable visibility input.
- **Auto-scroll**: On mobile, page scrolls to preview after generation completes.

### `/script` — Shot Editor & Veo Video Generation

The primary production tool. Fully client-rendered, state persisted to `localStorage`.

#### Layout

Two-panel on desktop (`lg:`), stacked on mobile:

- **Left panel** — Globals accordion + Shots accordion
- **Right panel** — Settings, Image Library, Generated Media

#### Shot Data Model

```typescript
type Shot = {
  shot_number: number;
  duration: number | string;
  resolution: string;
  imageRefs: string[]; // IDs of ImageItems attached to this shot
  prompt: string;
  selected?: boolean;
  status?: 'idle' | 'generating' | 'completed' | 'error';
  generatedVideoUrl?: string;
  generatedVideoUrls?: string[];
};
```

#### Globals

- Key=value pairs with multi-line value support (`"""..."""` syntax)
- Used in shot prompts via `{variableName}` syntax — substituted before API call
- Bulk Edit mode: edit all as `KEY=value` text block
- Persistent in `localStorage`

#### Shots

- Accordion list; one expanded at a time
- Per-shot: prompt (via `PromptEditor`), duration, resolution, attached images (max 3), generated videos
- Select All / individual checkbox for batch generation
- **Bulk Edit**: Edit all shots as raw JSON array in a textarea; validates keys on save, warns on unknown keys
- Shot status badges: idle / generating / completed / error

#### Image Library (right panel)

- Upload via `DeviceAwareUpload` (native OS picker + Image Library portal menu)
- Images stored as `File` objects in React state + `previewUrl` blob URLs
- `hasLibraryImages` prop hides Image Library option when empty
- Per-shot: attach up to 3 images from library; multi-select modal for bulk attach
- Image deletion removes from library and all shot refs
- `imageRefs` legacy string constants (`'1'`, `'2'`) stripped on `localStorage` load

#### Veo Video Generation

Client automatically routes each shot to the correct API endpoint based on model and image count:

| Model                                  | Images | Route           | Veo API shape                          |
| -------------------------------------- | ------ | --------------- | -------------------------------------- |
| Any                                    | 0      | `/text`         | `{ prompt }`                           |
| Lite (`veo-3.1-lite-generate-preview`) | 1–3    | `/image-direct` | `{ prompt, image }` — first image only |
| Fast / Pro                             | 1–3    | `/image-refs`   | `{ prompt, referenceImages[] }`        |

- `imageRefs` IDs resolved client-side → `File` → base64 before fetch
- Models: `veo-3.1-fast-generate-preview` (default), `veo-3.1-generate-preview`, `veo-3.1-lite-generate-preview`
- Selecting Lite shows a persistent blue info banner above the model dropdown
- Generated videos saved to `public/generated/shot_N.mp4`; duplicates get `(1)`, `(2)` suffix
- Abort all button cancels in-flight requests via `AbortController`
- Error toast (bottom-centre, 7s auto-dismiss) for quota / RAI / API errors

#### Error Handling

- **429 / RESOURCE_EXHAUSTED** → "Quota exceeded — check your Google AI plan"
- **RAI filtered** → "Video was blocked by safety filters — `<reason>`"
- **No video returned** → "Generation may have been filtered or failed silently"
- **Other API errors** → API message passed through directly

### `/video-maker` — NLE Timeline Editor

- Browser-based non-linear editor
- **Panels**: Projects (left), Media Library (left), Preview (centre), Timeline (bottom)
- **State**: React context store (`store.tsx`); media blobs persisted in IndexedDB (`mediaDb.ts`)
- **Media**: Upload video/audio → stored as blob URLs + metadata; waveform analysis for audio tracks
- **Timeline**: Multi-track; clips draggable, trimable; playhead scrubbing
- **Export**: `POST /api/video-maker/export` — sends clip list + trim points → server spawns `ffmpeg` → returns assembled video

---

## 6. Rendering & Routing Architecture

### Route Map

| Path                                           | Type             | Status    | Purpose                         |
| ---------------------------------------------- | ---------------- | --------- | ------------------------------- |
| `/`                                            | RSC page         | ✅ exists | Home                            |
| `/avatar/new`                                  | Client Component | ✅ done   | Avatar creation                 |
| `/script`                                      | Client Component | ✅ done   | Shot editor + Veo generation    |
| `/video-maker`                                 | Client Component | ✅ done   | NLE timeline editor             |
| `/pipeline/[id]`                               | Client Component | 🔲 TBD    | Status polling + video output   |
| `POST /api/avatar/generate`                    | API Route        | ✅ done   | Gemini avatar image             |
| `POST /api/script/generate`                    | API Route        | ✅ done   | Gemini script via LangChain     |
| `POST /api/script/generate-video/text`         | API Route        | ✅ done   | Veo text-only generation        |
| `POST /api/script/generate-video/image-direct` | API Route        | ✅ done   | Veo image-direct (Lite)         |
| `POST /api/script/generate-video/image-refs`   | API Route        | ✅ done   | Veo reference images (Fast/Pro) |
| `POST /api/video-maker/upload`                 | API Route        | ✅ done   | Save media to public/uploads    |
| `POST /api/video-maker/export`                 | API Route        | ✅ done   | ffmpeg clip assembly            |
| `POST /api/pipeline/create`                    | API Route        | 🔲 TBD    | Create + start pipeline         |
| `GET /api/pipeline/[id]`                       | API Route        | 🔲 TBD    | Job status                      |
| `GET /api/storage/[id]/video`                  | API Route        | 🔲 TBD    | Serve video file                |
| `GET /api/storage/[id]/audio`                  | API Route        | 🔲 TBD    | Serve audio file                |
| `GET /api/storage/[id]/avatar`                 | API Route        | 🔲 TBD    | Serve avatar image              |

### Server vs Client Components

| Component                    | Type   | Reason                          |
| ---------------------------- | ------ | ------------------------------- |
| `app/layout.tsx`             | RSC    | Static shell                    |
| `app/page.tsx`               | RSC    | Static home                     |
| `app/avatar/new/page.tsx`    | Client | State, fetch, user interaction  |
| `app/script/page.tsx`        | Client | Heavy state, localStorage, APIs |
| `app/video-maker/page.tsx`   | Client | IndexedDB, drag, media, ffmpeg  |
| `app/pipeline/[id]/page.tsx` | Client | Polling, video playback         |
| All `route.ts` files         | Server | API handlers, never rendered    |

---

## 7. Data Layer

### Upstash Redis (Pipeline Jobs)

Used exclusively for async pipeline job state. Communicates over HTTP (REST) — safe in serverless routes.

| Key                      | Value                        | TTL   | Purpose                    |
| ------------------------ | ---------------------------- | ----- | -------------------------- |
| `job:{job_id}`           | JSON string of `PipelineJob` | None  | Primary job record         |
| `avatar:{job_id}`        | base64 image string          | 3600s | Temporary avatar storage   |
| `syncso:{syncso_job_id}` | `job_id` string              | None  | Reverse lookup for webhook |

All Redis access goes through `src/lib/jobs.ts`. No route imports `redis` directly.

### LocalStorage (Script Page)

The script page persists its full state to `localStorage` on every state change:

| Key              | Shape                  | Notes                                       |
| ---------------- | ---------------------- | ------------------------------------------- |
| `script_shots`   | `Shot[]` JSON          | Legacy `imageRefs` strings stripped on load |
| `script_globals` | `{name, value}[]` JSON | Global variable definitions                 |
| `script_apiKey`  | string                 | Veo API key                                 |
| `script_model`   | string                 | Selected Veo model name                     |

### IndexedDB (Video Maker)

Media blobs (video/audio files) too large for localStorage are persisted in IndexedDB via `mediaDb.ts`.

---

## 8. TypeScript Types

### Script Page Types (local to `script/page.tsx`)

```typescript
type Shot = {
  shot_number: number;
  duration: number | string;
  resolution: string;
  imageRefs: string[]; // IDs referencing ImageItem.id
  prompt: string;
  selected?: boolean;
  status?: 'idle' | 'generating' | 'completed' | 'error';
  generatedVideoUrl?: string;
  generatedVideoUrls?: string[];
};

type ImageItem = {
  id: string;
  file: File;
  previewUrl: string; // blob URL from URL.createObjectURL
};
```

### Video Maker Types (`video-maker/types.ts`)

```typescript
interface MediaItem {
  id: string;
  name: string;
  type: 'video' | 'audio';
  localUrl: string;
  serverPath: string | null;
  duration: number;
  thumbnail: string | null;
  waveform: number[] | null;
  size: number;
}

interface Clip {
  id: string;
  mediaItemId: string;
  trackId: string;
  timelineStart: number;
  trimStart: number;
  trimEnd: number;
}
```

### Pipeline Types (`lib/types.ts`)

```typescript
interface PipelineJob {
  job_id: string;
  status:
    | 'pending'
    | 'script_generating'
    | 'script_complete'
    | 'tts_processing'
    | 'tts_complete'
    | 'lipsync_processing'
    | 'complete'
    | 'failed';
  stage_message: string;
  topic: string;
  avatar_prompt: string;
  script: string | null;
  audio_path: string | null;
  avatar_image_path: string | null;
  syncso_job_id: string | null;
  final_video_path: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}
```

---

## 9. API Layer

### Error Response Format

All API routes return errors as:

```json
{ "error": "<human-readable message>" }
```

HTTP status codes: `400` bad input, `500` server error, `404` not found.

### Route Details

#### `POST /api/avatar/generate`

- **Input**: `{ avatar_prompt: string }`
- **Output**: `{ image_base64: string; mime_type: string }`
- Prompt augmented server-side with lipsync-safety instructions before Gemini call.

#### `POST /api/script/generate`

- **Input**: `{ topic, duration, style?, … }`
- **Output**: Shot list JSON
- Uses `gemini-script.ts` via LangChain.

#### `POST /api/script/generate-video/text`

- **Input**: `{ prompt, modelName, duration, resolution, shotNumber, apiKey }`
- **Output**: `{ videoUrl: string }` — used when shot has no images.

#### `POST /api/script/generate-video/image-direct`

- **Input**: `{ prompt, modelName, duration, resolution, shotNumber, apiKey, image: { base64, mimeType } }`
- **Output**: `{ videoUrl: string }` — Lite only. Passes image as Veo `image:` param, animates it directly.

#### `POST /api/script/generate-video/image-refs`

- **Input**: `{ prompt, modelName, duration, resolution, shotNumber, apiKey, referenceImages: { base64, mimeType }[] }`
- **Output**: `{ videoUrl: string }` — Fast/Pro with 1–3 images. Images guide style/content, prompt drives the scene.

All three routes: output saved to `public/generated/shot_{N}.mp4`; appends `(1)`, `(2)` suffix if file exists. Errors parsed to user-friendly messages (quota, RAI, permission, invalid arg).

#### `POST /api/video-maker/upload`

- Accepts `multipart/form-data` with a `file` field.
- Saves to `public/uploads/` and returns `{ path }`.

#### `POST /api/video-maker/export`

- Receives clip assembly spec (clips, tracks, trim points).
- Spawns `ffmpeg` subprocess to concatenate/trim clips.
- Returns exported video path.

---

## 10. Services Layer

Each integration is a pure function — receives inputs, calls API, returns data. No Redis or filesystem access except `gemini-video.ts` (saves output file).

| File               | Status   | SDK Used                  | Purpose                              |
| ------------------ | -------- | ------------------------- | ------------------------------------ |
| `gemini-image.ts`  | ✅ Done  | `@google/generative-ai`   | Generate avatar face image           |
| `gemini-script.ts` | ✅ Done  | `@langchain/google-genai` | Generate video shot scripts          |
| `gemini-video.ts`  | ✅ Done  | `@google/genai`           | Veo 3.1 — text / image-direct / refs |
| `cartesia.ts`      | ✅ Wired | `@cartesia/cartesia-js`   | Text-to-speech audio                 |
| `skyreels.ts`      | ✅ Wired | `@gradio/client`          | Talking-head video (SkyReels Gradio) |
| `voice-style.ts`   | ✅ Done  | —                         | Voice style mappings/utilities       |

### `gemini-video.ts` — Key Details

Three exported functions sharing a `saveVideo` polling/save helper and `logConfig` logger:

| Export                    | Veo API param                                 | Used by               |
| ------------------------- | --------------------------------------------- | --------------------- |
| `generateReelText`        | `{ prompt }`                                  | `/text` route         |
| `generateReelImageDirect` | `{ prompt, image: { imageBytes, mimeType } }` | `/image-direct` route |
| `generateReelImageRefs`   | `{ prompt, config: { referenceImages[] } }`   | `/image-refs` route   |

- Default model: `veo-3.1-fast-generate-preview`; also supports `veo-3.1-generate-preview` and `veo-3.1-lite-generate-preview`
- `referenceImages` use `VideoGenerationReferenceType.ASSET`
- Polls every 10s until `operation.done`
- RAI check: throws if `raiMediaFilteredCount > 0` with reasons from `raiMediaFilteredReasons`
- `parseApiError` converts SDK JSON errors into user-friendly strings (quota 429, permission denied, invalid arg)
- Console prints mode, model, duration, resolution, and image count per generation

---

## 11. Components

### `AppSidebar.tsx`

Global left navigation rendered in `layout.tsx`. Links: Avatar (`/avatar/new`), Script (`/script`), Video Maker (`/video-maker`). Active state via `usePathname`.

### `DeviceAwareUpload.tsx`

Smart upload button that adapts to context:

- When `hasLibraryImages = false`: clicking directly opens the OS native file picker (`<input type="file" accept="image/*" multiple>`).
- When `hasLibraryImages = true`: clicking opens a portal menu with two options — **Image Library** and **Upload Images**.
- Portal menu uses `createPortal` into `document.body` + `getBoundingClientRect` positioning to avoid `overflow: hidden` clipping.
- Outside-click uses `click` event (not `mousedown`) to avoid unmounting portal before button handlers fire.

**Props**: `onUpload(files)`, `onOpenLibrary?()`, `hasLibraryImages?`, `children?`, `className?`

### `PromptEditor.tsx`

Rich text editor for shot prompts with global variable support:

- Renders `{variableName}` tokens as visually highlighted spans (violet halo).
- Typing `{` triggers an autocomplete dropdown of available globals with keyboard navigation.
- Auto-inserts trailing space after selecting a variable.
- Detected variables displayed below as hoverable pill tags showing value preview.
- Uses a transparent textarea overlay over a styled div for cursor accuracy.

**Props**: `value`, `onChange(val)`, `globals: { name, value }[]`, `placeholder?`

### `ConfirmPopup.tsx`

Reusable modal for destructive action confirmation. Used for: delete shot, delete image, delete video, delete all vars.

**Props**: `isOpen`, `title?`, `message`, `onConfirm()`, `onCancel()`

---

## 12. Styling System

### Tailwind CSS v4

| Change from v3  | Detail                                 |
| --------------- | -------------------------------------- |
| No config file  | CSS-first configuration                |
| PostCSS plugin  | `@tailwindcss/postcss`                 |
| Import          | `@import 'tailwindcss'` in globals.css |
| Theme extension | `@theme` CSS block                     |

VS Code suppresses the `@theme` unknown-at-rule warning via `.vscode/settings.json`:

```json
{ "css.lint.unknownAtRules": "ignore" }
```

### Design Conventions

| Token         | Usage                                                      |
| ------------- | ---------------------------------------------------------- |
| `bg-slate-50` | Page backgrounds                                           |
| `slate-900`   | Primary text                                               |
| `violet-600`  | Primary action buttons, focus rings, active borders        |
| `violet-50`   | Subtle selected/active backgrounds                         |
| `amber-50`    | Warning banners (e.g., bulk edit unknown key warnings)     |
| `red-600`     | Error toast, delete actions                                |
| `slate-200`   | Default borders and dividers                               |
| Rounded       | `rounded-xl` (cards/modals), `rounded-lg` (buttons/inputs) |

---

## 13. TypeScript Configuration

Key settings in `tsconfig.json`:

| Setting            | Value     | Why                                   |
| ------------------ | --------- | ------------------------------------- |
| `strict`           | `true`    | Full strict mode                      |
| `moduleResolution` | `bundler` | Modern resolution for Next.js/webpack |
| `noEmit`           | `true`    | Type check only; Next.js handles emit |
| `target`           | `ES2017`  | Broad browser compatibility           |
| `isolatedModules`  | `true`    | Required for SWC/ts-jest              |
| `incremental`      | `true`    | Faster subsequent type checks         |

---

## 14. Testing Architecture

```
Jest 30
  └── next/jest (Next.js integration)
       └── jsdom (DOM simulation)
            └── @testing-library/react
                 └── @testing-library/jest-dom
```

```bash
yarn test           # Run all tests
yarn test --watch   # Watch mode
```

---

## 15. Code Quality & Pre-commit Pipeline

```
git commit
     ↓
.husky/pre-commit
     ↓
1. tsc --noEmit  (typecheck — fails commit on TS errors)
     ↓
2. lint-staged
   → *.{ts,tsx}: eslint --fix, prettier --write
   → *.{json,md,css}: prettier --write
     ↓
Commit created (or aborted)
```

---

## 16. Build & Toolchain

```bash
yarn dev       # Dev server with fast refresh
yarn build     # Production build
yarn start     # Serve production build
yarn typecheck # tsc --noEmit
yarn lint      # ESLint
yarn test      # Jest
```

### Makefile shortcuts

```bash
make lint              # ESLint --fix
make format            # Prettier
make check             # Lint + format (CI-safe)
make test              # Jest
make frontend-dev      # yarn dev
make frontend-build    # yarn build
```

---

## 17. Environment Configuration

All credentials are stored in `.env` (gitignored). `.env_example` is the committed template.

### Variables

```bash
# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Google AI Studio — Gemini image + script generation
GEMINI_API_KEY=

# Google AI Studio — Veo video generation (also accepted as user input in UI)
GOOGLE_API_KEY=

# Cartesia
CARTESIA_API_KEY=

# Sync.so
SYNCSO_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
STORAGE_PATH=./storage
```

> **Note**: The Veo API key (`GOOGLE_API_KEY` / `GEMINI_API_KEY`) can also be entered directly in the Script page UI and is stored in `localStorage`. The UI key takes precedence over the env var.

### Conventions

| Prefix         | Exposed To       | Use For                        |
| -------------- | ---------------- | ------------------------------ |
| `NEXT_PUBLIC_` | Browser + Server | Non-sensitive config (app URL) |
| _(no prefix)_  | Server only      | API keys, secrets              |

---

## 18. Local Storage & Generated Files

### Pipeline Jobs

Generated files for async pipeline jobs are saved to `./storage/{job_id}/` (gitignored).

| File         | Written By           | Purpose                  |
| ------------ | -------------------- | ------------------------ |
| `avatar.png` | Pipeline TTS stage   | Avatar image for Sync.so |
| `audio.wav`  | Cartesia service     | TTS output               |
| `video.mp4`  | Post-webhook handler | Downloaded from Sync.so  |

### Veo Generated Videos

Written to `/tmp/generated/` (writable on both local dev and Vercel). Served via `GET /api/generated/[filename]` which streams from `/tmp`. After generation the client fetches the blob, stores it in IndexedDB (`script-generated-videos`), and uses a `blob:` URL for playback — videos persist across page reloads and Vercel cold starts without needing the server file. `public/generated/` no longer exists.

| File         | Written By        | Notes                                        |
| ------------ | ----------------- | -------------------------------------------- |
| `shot_N.mp4` | `gemini-video.ts` | If file exists, appends `_(1)`, `_(2)`, etc. |

### Video Maker Uploads

`public/uploads/` — served statically. Written by `POST /api/video-maker/upload`.

---

## 19. CI/CD

> **TBD** — No CI/CD pipeline is configured.
>
> When added, document here:
>
> - CI provider (GitHub Actions, etc.)
> - Pipeline stages (typecheck → lint → test → build → deploy)
> - Secrets management
> - Preview vs production environments

---

## 20. Developer Workflow

### First-time Setup

```bash
git clone <repo>
cd ai-avatar-content
yarn install
make install-hooks        # Install Husky git hooks
cp .env_example .env      # Fill in real credentials
yarn dev                  # → http://localhost:3000
```

### Day-to-day

```bash
yarn dev                  # Dev server
yarn test --watch         # Tests in watch mode
git add <files>
git commit -m "feat: ..."  # Pre-commit: typecheck + lint + format auto-runs
```

### Before Merging

```bash
yarn typecheck            # Confirm no TS errors
make check                # ESLint + Prettier (no auto-fix)
yarn test                 # Full test suite
yarn build                # Confirm production build succeeds
```
