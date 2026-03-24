## 🗓️ **2026-03-24**

---

### ✨ Features

---

> ### Advanced Video Editor Keyboard Shortcuts & Undo/Redo
>
> - **What changed:**
>   - Added global `Cmd/Ctrl + Z` for Undo and `Cmd/Ctrl + Shift + Z` for Redo.
>   - Added `Cmd/Ctrl + C` / `V` to copy/paste the hovered or selected clip (pasting at the current playhead position on the hovered track).
>   - Modified `s`, `m`, and `Delete`/`Backspace` to act on the currently hovered clip under the pointer line instead of only working on the selected clip.
> - **Why:** Essential professional video editing functionality and speed improvements for creators.
> - **Files:**
>   - `src/app/video-maker/store.tsx`
>   - `src/app/video-maker/page.tsx`
>   - `src/app/video-maker/_components/Timeline.tsx`
>   - `src/app/video-maker/_components/ClipBlock.tsx`

---

### 🐛 Fixes

---

> ### Video Preview Playback & Clip Transition Fix
>
> - **What changed:** Fixed an issue where the video preview would freeze or go black during playback, and added multi-track audio playback support.
> - **Why:** The playback loop was occasionally causing a "seek death spiral" due to minor syncing drifts, and newly loaded clips weren't automatically resuming play when transitioning across splits or gaps in the timeline. Audio tracks are now fully mixed and played back in real-time alongside video.
> - **Files:**
>   - `src/app/video-maker/_components/Preview.tsx`

---

> ### Prevent Accidental Playhead Scrubbing on Timeline Hover
>
> - **What changed:** Fixed an issue where simply moving the mouse over the track rows would unintentionally scrub the playhead.
> - **Why:** Prevented keyboard shortcuts (like 's' to split) from working correctly at the paused location, as hovering moved the playhead away from the track head line.
> - **Files:**
>   - `src/app/video-maker/_components/Timeline.tsx`

---

> ### Seamless Hover Scrubbing & Preview Buffering
>
> - **What changed:**
>   - Playhead now automatically tracks mouse movement on hover over the tracks in `Timeline.tsx`.
>   - Modified `Preview.tsx` to instantly buffer and update the video frame when scrubbing while paused.
>   - Media deletion now correctly cleans up associated clips on all tracks.
> - **Why:** Removing videos left broken clips in tracks, and the preview wouldn't update smoothly during fast hover scrubbing.
> - **Files:**
>   - `src/app/video-maker/_components/Timeline.tsx`
>   - `src/app/video-maker/_components/Preview.tsx`
>   - `src/app/video-maker/store.tsx`

---

### ✨ Features

---

> ### Video Maker — Full Timeline Editor at `/video-maker`
>
> - **What changed:** New standalone route `/video-maker` with a Canva-style video editing interface. Left sidebar has two panels — **Projects** (create, rename, delete, persist to localStorage) and **Media** (upload videos/audio, auto-extracts thumbnails and waveforms). Centre shows a live preview with play/pause and seekbar. Bottom has a scrollable timeline with time ruler, playhead scrubbing, multiple video and audio tracks, and zoom controls.
> - **Clip operations:** Drag from media panel to any track to place a clip. Drag clips to reposition. Drag left/right trim handles to trim. Click "Split" in the selected-clip toolbar to split at the playhead. Set speed (0.25×–2×) from a speed picker in the toolbar. Audio clips get a volume slider. Tracks can be muted or deleted.
> - **Export:** "Export MP4" uploads all clip media to the server via `/api/video-maker/upload`, then sends the project manifest to `/api/video-maker/export` which uses system FFmpeg to stitch clips (with trim, speed, and audio mixing via `filter_complex`) and streams back the final MP4.
> - **Persistence:** Project track/clip structure is saved to `localStorage` under `video-maker-projects`. Media files (blob URLs) are in-memory only and require re-upload on page reload.
> - **Files:**
>   - `src/app/video-maker/page.tsx` — layout, export flow, `EditorProvider` root
>   - `src/app/video-maker/types.ts` — `MediaItem`, `Clip`, `Track`, `Project`, `effectiveDuration`, `clipEndTime`
>   - `src/app/video-maker/store.ts` — `useReducer` + React context, all actions, localStorage persistence, `selectTotalDuration`
>   - `src/app/video-maker/_components/ProjectsPanel.tsx` — project list with inline rename
>   - `src/app/video-maker/_components/MediaPanel.tsx` — file upload, thumbnail extraction (canvas), waveform sampling (Web Audio API), drag-to-timeline
>   - `src/app/video-maker/_components/Preview.tsx` — `<video>` element synced to playhead, `requestAnimationFrame` playback loop
>   - `src/app/video-maker/_components/Timeline.tsx` — ruler, zoom controls, add-track buttons, drop handler, playhead line
>   - `src/app/video-maker/_components/TrackRow.tsx` — per-track header (mute/delete) and clip drop zone
>   - `src/app/video-maker/_components/ClipBlock.tsx` — positioned clip with thumbnail/waveform overlay, mouse-drag move, trim handles, selected toolbar (split/speed/volume/delete)
>   - `src/app/api/video-maker/upload/route.ts` — saves uploaded media to `storage/video-maker/[projectId]/`
>   - `src/app/api/video-maker/export/route.ts` — FFmpeg orchestration: per-clip trim+speed processing, concat, audio mixing via `amix`, streams output MP4

---

## 🗓️ **2026-03-22**

---

### ✨ Features

---

> ### Negative Prompt for Avatar Generation
>
> - **What changed:** Added an optional negative prompt field to the avatar creation page. It appears as a collapsible section below the avatar description — clicking "Negative prompt" expands a textarea styled in amber. When populated, an "active" badge appears on the toggle. The text is appended to the Gemini prompt as `Do not include: <terms>`. The value is saved/restored from the draft localStorage key.
> - **Why:** Lets users exclude specific unwanted attributes (e.g. glasses, beard, hat) without having to over-specify the positive prompt.
> - **Files:**
>   - `src/app/avatar/new/page.tsx` — collapsible negative prompt UI, draft save/restore, passed to API
>   - `src/services/gemini-image.ts` — accepts `negativePrompt?`; appends exclusion clause to the generated text prompt
>   - `src/app/api/avatar/generate/route.ts` — extracts and passes `negative_prompt` to service
>   - `src/lib/types.ts` — added `negative_prompt?` to `AvatarGenerateRequest`

---

> ### Reference Image Upload for Avatar Generation
>
> - **What changed:** Users can upload up to 3 reference photos on the avatar creation page to guide Gemini's likeness and style during generation. A reference images section is added inside the prompt card with a dashed dropzone, thumbnail previews with hover-to-remove, and a `+` tile to add more. When references are present, Gemini receives them as inline image parts alongside a modified prompt instructing it to use them as a visual guide.
> - **Why:** Text prompts alone can't reliably reproduce a specific person's appearance. Reference images give users a way to anchor the generated avatar to a real likeness.
> - **Files:**
>   - `src/app/avatar/new/page.tsx` — reference images UI (dropzone, thumbnails, remove, hidden file input)
>   - `src/services/gemini-image.ts` — accepts `referenceImages?: ReferenceImage[]`; builds multi-part content with inline image data when provided
>   - `src/app/api/avatar/generate/route.ts` — extracts and validates `reference_images` from request body, passes to service
>   - `src/lib/types.ts` — added `ReferenceImage` interface; updated `AvatarGenerateRequest` with optional `reference_images`

---

## 🗓️ **2026-03-15**

---

### ✨ Features

---

> ### Fix: avatar_prompt No Longer Required When Importing
>
> - **What changed:** Removed the hard validation on `avatar_prompt` in the pipeline create route. When the user imports their own avatar image and skips Gemini generation, `avatar_prompt` defaults to `'imported'`.
> - **Why:** The field is only stored as metadata — it has no effect on pipeline processing. Requiring it blocked the import flow entirely.
> - **Files:**
>   - `src/app/api/pipeline/create/route.ts`

---

> ### Sync.so 401 Fix — Correct Auth Header
>
> - **What changed:** Replaced `Authorization: Bearer <key>` with `x-api-key: <key>` when calling the Sync.so API.
> - **Why:** Sync.so requires the `x-api-key` header, not a Bearer token. The mismatch caused every lip sync submission to fail with HTTP 401.
> - **Files:**
>   - `src/services/syncso.ts`

---

> ### Voice Selection UI
>
> - **What changed:** Added a Voice card to the avatar creation page (Step 2). Users can choose from four preset voices (Female US, Female Indian, Male US, Male British) or paste a custom Cartesia voice ID. The selected voice is passed through `PipelineCreateRequest.voice_id` to the pipeline.
> - **Why:** The default voice didn't match all avatar personas — specifically female avatars speaking English with an Indian accent needed a different voice ID.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`
>   - `src/lib/types.ts` — added `voice_id?` to `PipelineCreateRequest`
>   - `src/services/cartesia.ts` — accepts optional `voiceId` param, falls back to `CARTESIA_VOICE_ID` env var then hardcoded default
>   - `src/app/api/pipeline/create/route.ts` — reads and passes `voice_id` through to `generateAudio`

---

> ### AI Voice Style Extraction from Topic (Gemini → Cartesia sonic-3)
>
> - **What changed:** New `voice-style` service calls Gemini to analyse the "What is your video about?" text and return structured voice controls (`emotion`, `speed`, `volume`). These are applied to Cartesia via `generation_config`. Model upgraded from `sonic-2` to `sonic-3` (required for `generation_config` support). Voice style is stored on the job record and displayed as a violet badge on the pipeline status page.
> - **Why:** The topic field already contains tone and energy instructions (e.g. "high-energy sales ad", "calm and professional"). Routing those through Gemini into Cartesia's voice controls makes the delivery match the content intent automatically.
> - **Files:**
>   - `src/services/voice-style.ts` _(new)_
>   - `src/services/cartesia.ts` — upgraded to `sonic-3`, accepts `voiceStyle?: VoiceStyle`, applies `generation_config`
>   - `src/lib/types.ts` — added `VoiceStyleConfig` interface and `voice_style` field to `PipelineJob`
>   - `src/lib/jobs.ts` — initialises `voice_style: null` on job creation
>   - `src/app/api/pipeline/create/route.ts` — calls `extractVoiceStyle(topic)` before TTS; logs resolved style
>   - `src/app/pipeline/[id]/page.tsx` — violet badge showing emotion / speed / volume once resolved

---

> ### Manual Voice Style Override
>
> - **What changed:** Voice card extended with a Style section: toggle between **Auto (Gemini)** and **Manual**. Manual mode reveals an emotion pill selector (12 options) and range sliders for speed (0.6×–1.5×) and volume (0.5×–2.0×) with live readouts. When manual is active, Gemini analysis is skipped entirely and the user values go straight to Cartesia.
> - **Why:** Users who want precise control over delivery — e.g. "I want `enthusiastic` at 1.2× speed" — shouldn't have to rely on AI inference.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`
>   - `src/lib/types.ts` — added `voice_style_override?` to `PipelineCreateRequest`
>   - `src/app/api/pipeline/create/route.ts` — when `voice_style_override` is present, bypasses `extractVoiceStyle`

---

> ### Project Setup & Environment Configuration
>
> - **What changed:** Installed all pipeline dependencies, created `.env` with required keys, scaffolded folder structure, and defined shared TypeScript interfaces.
> - **Why:** Establishes the foundation all pipeline tasks depend on — types, folder layout, and environment config.
> - **Files:**
>   - `package.json`, `yarn.lock`
>   - `.env`, `.gitignore`
>   - `src/lib/types.ts`
>   - _(~10 stub files in `src/lib/`, `src/services/`, `src/app/avatar/`, `src/app/pipeline/`, `src/app/api/`)_
>   - `storage/.gitkeep`

---

> ### Upstash Redis Singleton + Job Utilities
>
> - **What changed:** Implemented the Redis client singleton and four job data-access functions (`createJob`, `getJob`, `updateJob`, `getAvatarBase64`).
> - **Why:** Centralises all Redis access in one place; provides job lifecycle management and reverse lookup for Sync.so webhook callbacks.
> - **Files:**
>   - `src/lib/redis.ts`
>   - `src/lib/jobs.ts`

---

> ### Avatar Generation Service + API Route + Avatar Page (Task 3)
>
> - **What changed:** Built the Gemini image service, the `/api/avatar/generate` POST route, and the full avatar creation page at `/avatar/new`.
> - **Why:** Delivers the first user-facing feature — avatar generation with approval flow before committing to the full pipeline.
> - **Files:**
>   - `src/services/gemini-image.ts`
>   - `src/app/api/avatar/generate/route.ts`
>   - `src/app/avatar/new/page.tsx`

---

### 🔧 DevOps / Build

---

> ### Home Route Redirects to Avatar Page
>
> - **What changed:** `src/app/page.tsx` now redirects `/` to `/avatar/new`.
> - **Why:** The app's entry point is the avatar creation flow; the boilerplate placeholder page is no longer relevant.
> - **Files:**
>   - `src/app/page.tsx`

---

### 📚 Docs

---

> ### Architecture.md + README Rewritten for AI Avatar Project
>
> - **What changed:** `Architecture.md` fully rewritten to document the pipeline, Redis key patterns, service layer, API contracts, and build status. `README.md` replaced the boilerplate content with project-specific setup and overview.
> - **Why:** Documentation now reflects the actual system rather than the Next.js scaffold defaults.
> - **Files:**
>   - `Architecture.md`
>   - `README.md`

---

> ### Script Generation + TTS + Sync.so Services + Pipeline Orchestration (Task 4)
>
> - **What changed:** Implemented all three AI services and the pipeline create route that orchestrates them in sequence with fire-and-forget background execution.
> - **Why:** Wires together Gemini (script), Cartesia (TTS), and Sync.so (lip sync) into a single automated pipeline triggered after avatar approval.
> - **Files:**
>   - `src/services/gemini-script.ts`
>   - `src/services/cartesia.ts`
>   - `src/services/syncso.ts`
>   - `src/app/api/pipeline/create/route.ts`

---

> ### Webhook Handler + Pipeline Status Route + Video Serving Route (Task 5)
>
> - **What changed:** Implemented the Sync.so webhook handler, the job status polling endpoint, and the video file serving route.
> - **Why:** Completes the backend — the webhook marks jobs complete after lip sync finishes, the status route enables frontend polling, and the video route serves the final MP4.
> - **Files:**
>   - `src/app/api/webhooks/syncso/route.ts`
>   - `src/app/api/pipeline/[id]/route.ts`
>   - `src/app/api/storage/[id]/video/route.ts`

---

### 💅 Styling and UI Improvements

---

> ### Avatar Page Switched to Light Mode
>
> - **What changed:** Redesigned the avatar creation page from dark (`bg-gray-950`) to a clean light theme (`bg-slate-50`) with white cards, a frosted glass header, step badges, and refined button styles.
> - **Why:** Improved readability and visual comfort; more professional feel for a light-mode audience.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

> ### Avatar Page — Download, Regenerate & Import Buttons
>
> - **What changed:** Added a Download button (exports as PNG via canvas), a Regenerate button in the preview column, and an Import button to load an existing image from disk.
> - **Why:** Users can now save their avatar, quickly regenerate from the preview area, or skip generation entirely by importing their own image.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

> ### Script Section — AI Generation Mode (Task 7)
>
> - **What changed:** Script card enhanced with Manual / Generate with AI toggle. AI mode adds inline topic input, duration pills (15s/30s/45s/60s), Generate button, success banner, and a new standalone `/api/script/generate` route. Live stats (chars · words · ~Xs) and a pipeline time estimate box added below the textarea.
> - **Why:** Users can generate a script without leaving the page, or write their own — the AI result is pre-populated and freely editable before committing to the pipeline.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`
>   - `src/services/gemini-script.ts` — added `duration` parameter with per-duration word count ranges
>   - `src/app/api/script/generate/route.ts` _(new)_

---

> ### Debug Logging — Pipeline & Webhook
>
> - **What changed:** Added structured `console.log` / `console.error` / `console.warn` throughout the pipeline orchestration route and Sync.so webhook handler covering every stage transition, file save, API call, and failure path.
> - **Why:** Makes it possible to trace the full pipeline execution and catch bugs from server logs without guesswork.
> - **Files:**
>   - `src/app/api/pipeline/create/route.ts`
>   - `src/app/api/webhooks/syncso/route.ts`

---

> ### Pipeline Status Page with Live Progress UI
>
> - **What changed:** Built the full pipeline status page at `/pipeline/[id]` — polling, animated stage tracker, progress bar, lipsync wait callout, video player on completion, and error state.
> - **Why:** Gives users live feedback while the 2–5 minute pipeline runs and reveals the final video when ready.
> - **Files:**
>   - `src/app/pipeline/[id]/page.tsx`

---

> ### Avatar Page — Topic + Script Fields & Portrait Image Container
>
> - **What changed:** Phase 2 now has two input sections — a resizable "What is your video about?" textarea and an optional "Script" textarea. Image preview container changed from square to 3:4 portrait ratio.
> - **Why:** Users can write their own script to skip AI generation; multi-line topics are now supported; portrait avatars display without cropping.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`
>   - `src/lib/types.ts` — added optional `script` field to `PipelineCreateRequest`
>   - `src/app/api/pipeline/create/route.ts` — skips Gemini script generation when user provides their own script

---

### 🔧 DevOps / Build

---

> ### Rename `GOOGLE_GENERATIVE_AI_API_KEY` → `GEMINI_API_KEY`
>
> - **What changed:** Renamed the Gemini API key environment variable to `GEMINI_API_KEY` across all services, `.env_example`, and docs.
> - **Why:** Shorter and consistent with how the key is labelled in Google AI Studio.
> - **Files:**
>   - `src/services/gemini-image.ts`
>   - `src/services/gemini-script.ts`
>   - `.env_example`
>   - `README.md`, `Architecture.md`

---

## 🗓️ **2026-03-12**

---

### ✨ Features

---

> ### Setup Next.js App
>
> - **What changed:** Initialized Next.js app with Tailwind, ESLint, Husky, lint-staged, and Jest.
> - **Why:** To setup the frontend application as requested.
> - **Files:**
>   - `package.json`
>   - `eslint.config.mjs`
>   - `jest.config.ts`
>   - `src/app/page.test.tsx`
