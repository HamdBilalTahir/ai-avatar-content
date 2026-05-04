# AI Avatar Content

A full-stack AI video generation platform. Create lip-synced avatar videos from a topic, build multi-shot scripts with reference images, or edit clips on a timeline — all in one app.

---

## What's Inside

| Page             | Purpose                                                                                |
| ---------------- | -------------------------------------------------------------------------------------- |
| `/avatar/new`    | Generate a photorealistic avatar face with Gemini, then kick off the lip-sync pipeline |
| `/pipeline/[id]` | Live status polling for avatar → script → TTS → lip-sync jobs                          |
| `/script`        | Multi-shot script editor with Globals, an Image Library, and video generation per shot |
| `/video-maker`   | Timeline-based clip editor with FFmpeg export                                          |

---

## How It Works

### Avatar Pipeline (`/avatar/new → /pipeline/[id]`)

1. **Describe your avatar** — Gemini generates a photorealistic face from your prompt (with optional reference images and negative prompt).
2. **Approve** — Regenerate until satisfied.
3. **Enter a topic** — One sentence describing the video subject.
4. **Generate** — The background pipeline runs automatically:
   - Gemini writes the script and extracts a voice style
   - Cartesia synthesises the voiceover (WAV)
   - SkyReels lip-syncs the avatar to the audio (MP4)
5. **Watch** — The finished video appears on the status page.

### Script Editor (`/script`)

1. Create one or more **script threads** (saved to Firestore).
2. Add **shots** — each with a prompt, duration, resolution, aspect ratio, and up to 3 reference images.
3. Set **Global Variables** (`{VARIABLE_NAME}`) that are interpolated into all prompts at generation time.
4. Upload images to the **Image Library** (stored in Vercel Blob) and attach them to shots.
5. Select shots and hit **Generate** — supports multiple providers:
   - Google Gemini (text / image-direct / image-refs)
   - Google Vertex AI (text / image-direct / image-refs)
   - Evolink: Kling O3, Seedance 2.0, Seedance 1.5 Pro, Grok (image-to-video)
6. Videos are uploaded to Vercel Blob and saved to Firestore (`generatedVideos`).

### Video Maker (`/video-maker`)

Timeline editor for assembling and exporting clips. Upload media, drag clips onto tracks, trim, and export via FFmpeg.

---

## Tech Stack

| Layer            | Technology                                                                     |
| ---------------- | ------------------------------------------------------------------------------ |
| Framework        | Next.js App Router + React 19                                                  |
| Language         | TypeScript (strict)                                                            |
| Styling          | Tailwind CSS v4                                                                |
| Auth             | Firebase Authentication                                                        |
| Database         | Firestore (client + Admin SDK)                                                 |
| Job State        | Upstash Redis                                                                  |
| Media Storage    | Vercel Blob                                                                    |
| Avatar Image     | Google Gemini (`gemini-2.0-flash-preview-image-generation`)                    |
| Script / LLM     | Google Gemini via LangChain                                                    |
| Text-to-Speech   | Cartesia                                                                       |
| Lip Sync         | SkyReels (Gradio / HuggingFace)                                                |
| Video Generation | Google Gemini Veo 3.1 · Vertex AI Veo 3.1 · Evolink (Kling O3, Seedance, Grok) |
| Export           | FFmpeg (server-side, video-maker)                                              |

---

## Getting Started

### 1. Install dependencies

```bash
yarn install
```

### 2. Configure environment

```bash
cp .env_example .env
```

Fill in `.env`:

```bash
# Firebase (client)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

# Firebase Admin (server-side Firestore)
FIREBASE_SERVICE_ACCOUNT_BASE64=   # base64-encoded service account JSON

# Redis (pipeline job state)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# AI providers
GEMINI_API_KEY=                    # Google AI Studio
EVOLINK_API_KEY=                   # Evolink (Kling / Seedance / Grok)

# TTS & lip-sync
CARTESIA_API_KEY=

# Vercel Blob (images & videos)
BLOB_READ_WRITE_TOKEN=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
STORAGE_PATH=./storage             # local disk for pipeline jobs
CRON_SECRET=                       # secures cron-only endpoints
```

### 3. Run the dev server

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                         # Home → redirects to /avatar/new
│   ├── avatar/new/page.tsx              # Avatar creation + pipeline start
│   ├── pipeline/[id]/page.tsx           # Status polling + video output
│   ├── sandbox/
│   │   ├── page.tsx                     # Sandbox testing UI
│   │   └── constants.ts                 # Sandbox constants
│   ├── script/
│   │   ├── page.tsx                     # Script editor orchestrator
│   │   ├── ScriptPanels.tsx             # Shots list, video panel, globals, library
│   │   ├── types.ts                     # Shot, GeneratedVideo, ImageItem, ScriptThread
│   │   └── constants.ts                 # Default shot templates
│   ├── video-maker/
│   │   ├── page.tsx                     # Timeline editor
│   │   └── _components/                 # ClipBlock, Timeline, TrackRow, Preview, …
│   ├── login/ signup/ forgot-password/  # Firebase auth pages
│   └── api/
│       ├── avatar/generate/             # POST — Gemini avatar image (SSE stream)
│       ├── sandbox/
│       │   ├── generate-scripts/        # POST — generate test scripts batch
│       │   └── output/[filename]/       # GET  — read sandbox test output
│       ├── intelligence/
│       │   └── film-direction/          # POST — AI review of video aesthetics
│       ├── pipeline/
│       │   ├── create/                  # POST — start pipeline job (Redis)
│       │   ├── [id]/                    # GET  — job status
│       │   ├── scrape/                  # POST — CRON: scrape articles
│       │   ├── generate-ideas/          # POST — CRON: generate post ideas
│       │   └── generate-scripts/        # POST — CRON: ideas → scripts
│       ├── script/
│       │   ├── generate/                # POST — generate script text
│       │   └── generate-video/
│       │       ├── text/                # POST — Gemini text-to-video
│       │       ├── image-direct/        # POST — Gemini image-to-video (1 image)
│       │       ├── image-refs/          # POST — Gemini image-to-video (multi)
│       │       ├── evolink/             # POST — Kling / Seedance / Grok
│       │       └── vertex/
│       │           ├── text/            # POST — Vertex text-to-video
│       │           ├── image-direct/    # POST — Vertex image-to-video
│       │           └── image-refs/      # POST — Vertex multi-image
│       ├── images/                      # POST/DELETE — Vercel Blob image management
│       ├── upload/                      # POST — Vercel Blob video upload
│       ├── storage/[id]/                # GET  — serve pipeline video/audio/avatar
│       ├── video-maker/
│       │   ├── upload/                  # POST — upload clip to local storage
│       │   └── export/                  # POST — FFmpeg timeline export
│       └── telegram/notify/             # POST — CRON: Telegram notifications
├── components/
│   ├── AppSidebar.tsx
│   ├── AuthGuard.tsx
│   ├── ConfirmPopup.tsx
│   ├── DeviceAwareUpload.tsx
│   ├── PromptEditor.tsx
│   └── ui/                             # Shadcn UI primitives
├── lib/
│   ├── firebase.ts                     # Firestore + Auth client
│   ├── firebase-admin.ts               # Firestore Admin (server only)
│   ├── redis.ts                        # Upstash Redis singleton
│   ├── jobs.ts                         # Pipeline job CRUD (Redis)
│   ├── AuthContext.tsx
│   ├── ProviderContext.tsx             # API key management
│   └── utils.ts                        # cn() helper
└── services/
    ├── gemini-image.ts                 # Avatar generation
    ├── gemini-script.ts                # Script generation
    ├── gemini-video.ts                 # Veo video generation
    ├── vertex-video.ts                 # Vertex AI video generation
    ├── cartesia.ts                     # TTS
    ├── skyreels.ts                     # Lip-sync
    └── voice-style.ts                  # Voice style extraction
```

---

## Firestore Schema

| Collection             | Key fields                                                                   |
| ---------------------- | ---------------------------------------------------------------------------- |
| `scripts`              | `userId, name, model, createdAt, updatedAt`                                  |
| `scripts/{id}/shots`   | `shotNumber, prompt, duration, resolution, aspectRatio, imageRefs[], status` |
| `scripts/{id}/globals` | `name, value`                                                                |
| `imageLibrary`         | `userId, blobUrl, createdAt`                                                 |
| `generatedVideos`      | `userId, scriptId, shotId, blobUrl, createdAt`                               |
| `scraped_articles`     | `title, content, source, category, scraped_at, used`                         |
| `post_ideas`           | `content, status, createdAt`                                                 |

---

## Scripts

```bash
yarn dev        # Development server
yarn build      # Production build
yarn typecheck  # TypeScript check
yarn test       # Jest test suite
yarn lint       # ESLint
```
