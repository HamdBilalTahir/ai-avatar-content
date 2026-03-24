# AI Avatar Content — System Architecture

> **Purpose**: Living architecture document for the AI Avatar Content pipeline. Updated as each task is completed. Use this as the authoritative reference for how the system works and how to extend it.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [High-Level Architecture Diagram](#3-high-level-architecture-diagram)
4. [Project Structure](#4-project-structure)
5. [Pipeline Flow](#5-pipeline-flow)
6. [Rendering & Routing Architecture](#6-rendering--routing-architecture)
7. [Data Layer — Upstash Redis](#7-data-layer--upstash-redis)
8. [TypeScript Types](#8-typescript-types)
9. [API Layer](#9-api-layer)
10. [Services Layer](#10-services-layer)
11. [Styling System](#11-styling-system)
12. [TypeScript Configuration](#12-typescript-configuration)
13. [Testing Architecture](#13-testing-architecture)
14. [Code Quality & Pre-commit Pipeline](#14-code-quality--pre-commit-pipeline)
15. [Build & Toolchain](#15-build--toolchain)
16. [Environment Configuration](#16-environment-configuration)
17. [Local Storage](#17-local-storage)
18. [CI/CD](#18-cicd)
19. [Developer Workflow](#19-developer-workflow)

---

## 1. System Overview

This app generates short AI-presented videos end-to-end from a text topic. The user describes an avatar face, approves the generated image, provides a topic, and the system autonomously generates a script, synthesises speech, and lip-syncs the avatar — producing a ready-to-watch video.

### Build Status

| Area                 | Status  | Details                                                  |
| -------------------- | ------- | -------------------------------------------------------- |
| Framework            | ✅ Done | Next.js 16 App Router + React 19                         |
| Language             | ✅ Done | TypeScript strict mode                                   |
| Styling              | ✅ Done | Tailwind CSS v4                                          |
| Linting / Formatting | ✅ Done | ESLint 9 + Prettier                                      |
| Testing              | ✅ Done | Jest 30 + React Testing Library                          |
| Git Hooks            | ✅ Done | Husky + lint-staged                                      |
| Shared Types         | ✅ Done | `src/lib/types.ts`                                       |
| Redis / Job State    | ✅ Done | Upstash Redis via `src/lib/redis.ts` + `src/lib/jobs.ts` |
| Avatar Generation    | ✅ Done | Gemini image API + `/api/avatar/generate` + avatar page  |
| Script Generation    | 🔲 TBD  | Gemini via LangChain                                     |
| TTS                  | 🔲 TBD  | Cartesia                                                 |
| Lip Sync             | 🔲 TBD  | Sync.so                                                  |
| Pipeline Status Page | 🔲 TBD  | Polling UI at `/pipeline/[id]`                           |
| Video Serving        | 🔲 TBD  | `/api/storage/[id]/video`                                |
| Webhook Handler      | 🔲 TBD  | `/api/webhooks/syncso`                                   |
| CI/CD                | 🔲 TBD  | —                                                        |

### Core Architectural Characteristics

| Property          | Value                                                          |
| ----------------- | -------------------------------------------------------------- |
| Rendering         | Next.js App Router (RSC-first, client components where needed) |
| Package Manager   | Yarn                                                           |
| Language          | TypeScript (strict)                                            |
| CSS Engine        | Tailwind CSS v4 via PostCSS                                    |
| Testing           | Jest 30 + jsdom + Testing Library                              |
| Compiler          | Babel + React Compiler (auto-memoization)                      |
| Path Alias        | `@/*` → `./src/*`                                              |
| Job State Store   | Upstash Redis (HTTP-based, serverless-safe)                    |
| File Storage      | Local filesystem under `./storage/{job_id}/`                   |
| Deployment Target | Vercel (default), any Node.js host                             |

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
| Image Generation  | `@google/generative-ai`   | ^0.24.1 | Gemini avatar image generation (used directly) |
| Script Generation | `@langchain/google-genai` | ^2.1.25 | Gemini script generation via LangChain         |
| LangChain Core    | `@langchain/core`         | ^1.1.32 | Required peer for LangChain integrations       |
| Text-to-Speech    | `@cartesia/cartesia-js`   | ^3.0.0  | Cartesia TTS SDK                               |

### Infrastructure & Data

| Layer             | Technology       | Version | Purpose                               |
| ----------------- | ---------------- | ------- | ------------------------------------- |
| Job State         | `@upstash/redis` | ^1.37.0 | Serverless-safe Redis over HTTP       |
| File Download     | `axios`          | ^1.13.6 | Download completed video from Sync.so |
| Multipart Uploads | `form-data`      | ^4.0.5  | Submit audio + image to Sync.so       |

### Utilities

| Layer         | Technology    | Version | Purpose                         |
| ------------- | ------------- | ------- | ------------------------------- |
| ID Generation | `uuid`        | ^13.0.0 | Unique job IDs                  |
| UUID Types    | `@types/uuid` | ^11.0.0 | TypeScript types for uuid (dev) |

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
┌──────────────────────────────────────────────────────────────────────┐
│                              BROWSER                                  │
│                                                                       │
│   /avatar/new           (client component — avatar creation page)     │
│   /pipeline/[id]        (client component — status + video output)    │
└─────────────────────────────────┬────────────────────────────────────┘
                                  │ HTTP / fetch
┌─────────────────────────────────▼────────────────────────────────────┐
│                    NEXT.JS SERVER  (Vercel Serverless)                │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                        API Routes                             │    │
│  │                                                               │    │
│  │  POST /api/avatar/generate      → Gemini image generation     │    │
│  │  POST /api/pipeline/create      → Create job, start pipeline  │    │
│  │  GET  /api/pipeline/[id]        → Poll job status             │    │
│  │  GET  /api/storage/[id]/video   → Serve final video file      │    │
│  │  POST /api/webhooks/syncso      → Sync.so completion callback │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                      Services Layer                           │    │
│  │                                                               │    │
│  │  services/gemini-image.ts   → Avatar image via Gemini API     │    │
│  │  services/gemini-script.ts  → Script text via LangChain       │    │
│  │  services/cartesia.ts       → Audio file via Cartesia TTS     │    │
│  │  services/syncso.ts         → Lip sync job via Sync.so        │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                        lib Layer                              │    │
│  │                                                               │    │
│  │  lib/redis.ts    → Upstash Redis singleton                    │    │
│  │  lib/jobs.ts     → createJob / getJob / updateJob / getAvatar │    │
│  │  lib/types.ts    → Shared TypeScript interfaces               │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────┬─────────────────────────────┬────────────────────────────┘
           │                             │
┌──────────▼──────────┐     ┌────────────▼──────────────────────────┐
│   Upstash Redis      │     │          External AI APIs              │
│                      │     │                                        │
│  job:{id}  → JSON    │     │  Google AI Studio  (Gemini image+text) │
│  avatar:{id} → b64   │     │  Cartesia          (TTS audio)         │
│  syncso:{id} → jobId │     │  Sync.so           (lip sync video)    │
└──────────────────────┘     └────────────────────────────────────────┘
           │
┌──────────▼──────────┐
│   Local Filesystem   │
│  ./storage/{job_id}/ │
│    avatar.png        │
│    audio.wav         │
│    video.mp4         │
└──────────────────────┘
```

---

## 4. Project Structure

```
ai-avatar-content/
│
├── src/
│   ├── app/
│   │   ├── layout.tsx                        # Root layout
│   │   ├── page.tsx                          # Home "/"
│   │   ├── globals.css
│   │   │
│   │   ├── avatar/
│   │   │   └── new/
│   │   │       └── page.tsx                  # ✅ Avatar creation page (client)
│   │   │
│   │   ├── pipeline/
│   │   │   └── [id]/
│   │   │       └── page.tsx                  # 🔲 Pipeline status + video page
│   │   │
│   │   └── api/
│   │       ├── avatar/
│   │       │   └── generate/
│   │       │       └── route.ts              # ✅ POST — Gemini avatar image
│   │       ├── pipeline/
│   │       │   ├── create/
│   │       │   │   └── route.ts              # 🔲 POST — Start pipeline job
│   │       │   └── [id]/
│   │       │       └── route.ts              # 🔲 GET — Job status polling
│   │       ├── storage/
│   │       │   └── [id]/
│   │       │       └── video/
│   │       │           └── route.ts          # 🔲 GET — Serve video file
│   │       └── webhooks/
│   │           └── syncso/
│   │               └── route.ts              # 🔲 POST — Sync.so callback
│   │
│   ├── lib/
│   │   ├── types.ts                          # ✅ Shared TypeScript interfaces
│   │   ├── redis.ts                          # ✅ Upstash Redis singleton
│   │   └── jobs.ts                           # ✅ Job CRUD utilities
│   │
│   └── services/
│       ├── gemini-image.ts                   # ✅ Avatar image generation
│       ├── gemini-script.ts                  # 🔲 Script generation (LangChain)
│       ├── cartesia.ts                       # 🔲 TTS audio generation
│       └── syncso.ts                         # 🔲 Lip sync submission
│
├── storage/                                  # Local generated files (gitignored)
│   └── .gitkeep
│
├── .env                                      # Local env vars (gitignored)
├── .env_example                              # Template with empty values
├── next.config.ts
├── tsconfig.json
├── package.json
└── Architecture.md
```

### Path Alias

```
@/* → ./src/*
```

---

## 5. Pipeline Flow

The pipeline has two user-driven phases followed by an automated backend pipeline.

### Phase 1 — Avatar Creation (`/avatar/new`)

```
User fills prompt
      ↓
POST /api/avatar/generate
      ↓
services/gemini-image.ts → Gemini API (gemini-3.1-flash-image-preview)
      ↓
Returns { image_base64, mime_type }
      ↓
Image displayed in browser — user regenerates until satisfied
```

### Phase 2 — Pipeline Start (same page, Phase 2 UI)

```
User enters topic + clicks "Generate Video"
      ↓
POST /api/pipeline/create  { topic, avatar_prompt, image_base64 }
      ↓
lib/jobs.ts createJob()
  → Writes job:{id} to Redis (status: pending)
  → Writes avatar:{id} to Redis with 1hr TTL
      ↓
Pipeline orchestration kicks off (async):
  1. script_generating  → gemini-script.ts   → LangChain + Gemini
  2. script_complete
  3. tts_processing     → cartesia.ts        → Cartesia TTS → audio file saved
  4. tts_complete
  5. lipsync_processing → syncso.ts          → Sync.so job submitted
  → Returns { job_id }
      ↓
Browser navigates to /pipeline/{job_id}
```

### Phase 3 — Pipeline Monitoring (`/pipeline/[id]`)

```
Browser polls GET /api/pipeline/[id] every ~3s
      ↓
lib/jobs.ts getJob() → Redis read
      ↓
Returns { job, video_url }
      ↓
UI shows current stage_message + progress
      ↓
Sync.so fires POST /api/webhooks/syncso when video complete
  → Redis lookup: syncso:{syncso_id} → job_id
  → lib/jobs.ts updateJob() → status: complete, final_video_path set
      ↓
Next poll detects status: complete
  → Video player rendered with video_url
```

### Job Status State Machine

```
pending
  → script_generating → script_complete
  → tts_processing    → tts_complete
  → lipsync_processing
  → complete
  → failed  (from any stage)
```

---

## 6. Rendering & Routing Architecture

### Route Map

| Path                          | Type             | Status    | Purpose                          |
| ----------------------------- | ---------------- | --------- | -------------------------------- |
| `/`                           | RSC page         | ✅ exists | Home                             |
| `/avatar/new`                 | Client Component | ✅ done   | Avatar creation + pipeline start |
| `/pipeline/[id]`              | Client Component | 🔲 TBD    | Status polling + video output    |
| `POST /api/avatar/generate`   | API Route        | ✅ done   | Gemini avatar image              |
| `POST /api/pipeline/create`   | API Route        | 🔲 TBD    | Create + start pipeline          |
| `GET /api/pipeline/[id]`      | API Route        | 🔲 TBD    | Job status                       |
| `GET /api/storage/[id]/video` | API Route        | 🔲 TBD    | Serve video file                 |
| `POST /api/webhooks/syncso`   | API Route        | 🔲 TBD    | Sync.so callback                 |

### Server vs Client Components

| Component                    | Type   | Reason                         |
| ---------------------------- | ------ | ------------------------------ |
| `app/layout.tsx`             | RSC    | Static shell, no interactivity |
| `app/page.tsx`               | RSC    | Static home page               |
| `app/avatar/new/page.tsx`    | Client | State, fetch, user interaction |
| `app/pipeline/[id]/page.tsx` | Client | Polling, state, video playback |
| All `route.ts` files         | Server | API handlers, never rendered   |

---

## 7. Data Layer — Upstash Redis

Upstash Redis is used exclusively for job state. It communicates over HTTP (REST), making it safe to use in Next.js serverless API routes without connection-pooling concerns.

### Key Patterns

| Key                      | Value                        | TTL   | Purpose                    |
| ------------------------ | ---------------------------- | ----- | -------------------------- |
| `job:{job_id}`           | JSON string of `PipelineJob` | None  | Primary job record         |
| `avatar:{job_id}`        | base64 image string          | 3600s | Temporary avatar storage   |
| `syncso:{syncso_job_id}` | `job_id` string              | None  | Reverse lookup for webhook |

### Access Pattern

**All Redis access goes through `src/lib/jobs.ts`.** No API route or service imports `redis` directly.

```
API Route / Service
      ↓
lib/jobs.ts  (createJob / getJob / updateJob / getAvatarBase64)
      ↓
lib/redis.ts  (singleton)
      ↓
Upstash REST API  →  Redis
```

### Job Update Pattern

Updates use read-then-write (single job = single JSON value):

```typescript
const existing = await getJob(job_id); // 1 Redis GET
const updated = { ...existing, ...updates, updated_at: Date.now() };
await redis.set(`job:${job_id}`, JSON.stringify(updated)); // 1 Redis SET
```

`updated_at` is always overwritten unconditionally on every update.

---

## 8. TypeScript Types

All shared interfaces live in `src/lib/types.ts`. No other file redefines these shapes.

### `PipelineJob`

The central data model for a pipeline run.

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
  created_at: number; // unix ms
  updated_at: number; // unix ms
}
```

### Other Interfaces

| Interface                | Used By                              | Shape                                             |
| ------------------------ | ------------------------------------ | ------------------------------------------------- |
| `AvatarGenerateRequest`  | `POST /api/avatar/generate` body     | `{ avatar_prompt: string }`                       |
| `AvatarGenerateResponse` | `POST /api/avatar/generate` response | `{ image_base64: string; mime_type: string }`     |
| `PipelineCreateRequest`  | `POST /api/pipeline/create` body     | `{ topic; avatar_prompt; image_base64 }`          |
| `PipelineStatusResponse` | `GET /api/pipeline/[id]` response    | `{ job: PipelineJob; video_url: string \| null }` |

---

## 9. API Layer

### Error Response Format

All API routes return errors in a consistent shape:

```json
{ "error": "<human-readable message>" }
```

HTTP status codes: `400` for bad input, `500` for unexpected errors, `404` for missing resources.

### Route Details

#### `POST /api/avatar/generate`

- **Input**: `{ avatar_prompt: string }`
- **Output**: `{ image_base64: string; mime_type: string }`
- **Errors**: 400 if prompt missing/empty; 500 on Gemini failure
- **Notes**: Prompt is augmented server-side with lipsync-optimisation instructions before sending to Gemini. The augmentation is never exposed to the user.

#### `POST /api/pipeline/create` _(TBD)_

- **Input**: `{ topic, avatar_prompt, image_base64 }`
- **Output**: `{ job_id: string }`

#### `GET /api/pipeline/[id]` _(TBD)_

- **Output**: `{ job: PipelineJob; video_url: string | null }`

#### `GET /api/storage/[id]/video` _(TBD)_

- Streams the final video file from `./storage/{id}/`

#### `POST /api/webhooks/syncso` _(TBD)_

- Receives Sync.so completion payload
- Looks up pipeline `job_id` via `syncso:{syncso_job_id}` key
- Updates job to `complete` and sets `final_video_path`

---

## 10. Services Layer

Each external API integration lives in its own file under `src/services/`. Services are pure functions — they receive inputs, call an API, and return data. They never read from Redis or touch the filesystem directly.

| File               | Status  | SDK Used                         | Purpose                    |
| ------------------ | ------- | -------------------------------- | -------------------------- |
| `gemini-image.ts`  | ✅ Done | `@google/generative-ai` (direct) | Generate avatar face image |
| `gemini-script.ts` | 🔲 TBD  | `@langchain/google-genai`        | Generate video script      |
| `cartesia.ts`      | 🔲 TBD  | `@cartesia/cartesia-js`          | Text-to-speech audio       |
| `syncso.ts`        | 🔲 TBD  | `axios` + `form-data`            | Submit lip sync job        |

### `gemini-image.ts`

- Model: `gemini-3.1-flash-image-preview`
- Prompt augmentation: appends lipsync-safety instructions to every user prompt
- Returns: `{ image_base64: string; mime_type: string }`
- Throws: `"Gemini returned no image in response"` if no image part in response

---

## 11. Styling System

### Tailwind CSS v4

| Change from v3  | Detail                                 |
| --------------- | -------------------------------------- |
| No config file  | CSS-first configuration                |
| PostCSS plugin  | `@tailwindcss/postcss`                 |
| Import          | `@import 'tailwindcss'` in globals.css |
| Theme extension | `@theme` CSS block                     |

### Design Conventions (Avatar Page)

- Background: `bg-gray-950` (near-black)
- Primary action: `bg-indigo-600` → hover `bg-indigo-500`
- Final CTA: `bg-emerald-600` (visually distinct — pipeline commit)
- Errors: `bg-red-900/30` border `border-red-700`
- Success badge: `bg-emerald-900/60` border `border-emerald-700`
- Transitions: opacity fade-in on image arrival; `fadeSlideIn` keyframe for Phase 2

---

## 12. TypeScript Configuration

[tsconfig.json](tsconfig.json) key settings:

| Setting            | Value     | Why                                   |
| ------------------ | --------- | ------------------------------------- |
| `strict`           | `true`    | Full strict mode                      |
| `moduleResolution` | `bundler` | Modern resolution for Next.js/webpack |
| `noEmit`           | `true`    | Type check only; Next.js handles emit |
| `target`           | `ES2017`  | Broad browser compatibility           |
| `isolatedModules`  | `true`    | Required for SWC/ts-jest              |
| `incremental`      | `true`    | Faster subsequent type checks         |

---

## 13. Testing Architecture

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

## 14. Code Quality & Pre-commit Pipeline

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

## 15. Build & Toolchain

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

## 16. Environment Configuration

All credentials are stored in `.env` (gitignored). `.env_example` is the committed template.

### Variables

```bash
# Upstash Redis
UPSTASH_REDIS_REST_URL=        # REST URL from Upstash console
UPSTASH_REDIS_REST_TOKEN=      # REST token from Upstash console

# Google AI Studio
GEMINI_API_KEY=  # API key for Gemini image + text

# Cartesia
CARTESIA_API_KEY=              # API key from Cartesia dashboard

# Sync.so
SYNCSO_API_KEY=                # API key from Sync.so dashboard

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000   # Used by webhook URL construction
STORAGE_PATH=./storage                      # Root path for generated files
```

### Conventions

| Prefix         | Exposed To       | Use For                        |
| -------------- | ---------------- | ------------------------------ |
| `NEXT_PUBLIC_` | Browser + Server | Non-sensitive config (app URL) |
| _(no prefix)_  | Server only      | API keys, secrets              |

**Never prefix secrets with `NEXT_PUBLIC_`** — they will be bundled into client JS.

### Validation

`lib/redis.ts` throws a descriptive error at startup if either Redis variable is missing. Service files check their respective keys before making API calls.

---

## 17. Local Storage

Generated files are saved to `./storage/{job_id}/` on the server filesystem.

| File                      | Written By                                  | Purpose                  |
| ------------------------- | ------------------------------------------- | ------------------------ |
| `avatar.png` (or similar) | TTS stage (reads from Redis, saves to disk) | Avatar image for Sync.so |
| `audio.wav`               | Cartesia service                            | TTS output               |
| `video.mp4`               | Post-webhook handler                        | Downloaded from Sync.so  |

The `storage/` folder is gitignored. Only `storage/.gitkeep` is committed so the folder is tracked by git but its contents are never committed.

---

## 18. CI/CD

> **TBD** — No CI/CD pipeline is configured.
>
> When added, document here:
>
> - CI provider (GitHub Actions, etc.)
> - Pipeline stages (typecheck → lint → test → build → deploy)
> - Secrets management
> - Preview vs production environments

---

## 19. Developer Workflow

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
