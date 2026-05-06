## 🗓️ **2026-05-06**

---

### ✨ Features

---

> ### Sandbox Recreate Final Video and Download Audio Options
>
> - **What changed:** Added a "Recreate Video" button to the Final Complete Video view in the Sandbox (both active run and history runs). Also added a "Download Audio" option next to the video download button. The backend `/api/sandbox/stitch` route was updated to handle audio extraction (returning an `.mp3` blob).
> - **Why:** Allows users to manually force a re-stitch of their current clip selections if needed, and to extract just the audio from the finalized stitched video clips.
> - **Files:**
>   - `src/app/sandbox/page.tsx`
>   - `src/app/api/sandbox/stitch/route.ts`

---

### 🐛 Fixes

---

> ### Sandbox Video Stitched Updates
>
> - **What changed:** Sandbox stitched video generation now dynamically re-stitches existing clips using the Vercel Blob API explicitly bypassing caching using timestamp querying.
> - **Why:** When moving between versions of a single clip inside a run, the overall stitched view needed to overwrite and update automatically without a hard refresh.
> - **Files:**
>   - `src/app/sandbox/page.tsx`
>   - `src/app/api/sandbox/stitch/route.ts`

---

> ### Standardize Video Filename Versioning to `_1`, `_2`
>
> - **What changed:** Updated the file naming logic in both `src/lib/video-output.ts` and `src/app/api/upload/route.ts` to output versions as `_1.mp4`, `_2.mp4` etc. rather than generating `_v1` or raw `.mp4` for the first run.
> - **Why:** Makes the versioning extension consistent starting immediately from the first run.
> - **Files:**
>   - `src/lib/video-output.ts`
>   - `src/app/api/upload/route.ts`

---

> ### Explicitly Disallow Background Music in Sandbox Scripts
>
> - **What changed:** Updated the system prompt in `src/app/api/sandbox/generate-scripts/route.ts` to explicitly specify that there must be NO background music or soundtrack, only real human speech.
> - **Why:** To prevent the generated prompt from instructing the LLM to include background music, which could conflict with video generations that should focus purely on voice dialogue.
> - **Files:**
>   - `src/app/api/sandbox/generate-scripts/route.ts`

---

> ### Handle Vertex AI Deadline Exceeded Errors Gracefully
>
> - **What changed:** Added logic to parse the Vertex AI operation JSON error string (specifically `Deadline exceeded`) in the Sandbox page.
> - **Why:** When the video generation API returns a failed payload from Vertex AI, the error message was an unreadable JSON string (`Vertex AI operation error: {...}`) which cluttered the UI error states.
> - **Files:**
>   - `src/app/sandbox/page.tsx`

---

> ### Fix Unhandled Console Errors During Sandbox Video Generation
>
> - **What changed:** Replaced `console.error` with `console.warn` and removed re-throwing of caught errors inside `runStep` in the Sandbox page.
> - **Why:** When video generation failed (e.g. from a Vertex AI timeout), the application properly updated the UI to show the error but also threw an unhandled error to the console, which would needlessly trigger the Next.js development error overlay.
> - **Files:**
>   - `src/app/sandbox/page.tsx`

---

> ### Fix Duration Mismatch Error Disabling Sandbox Generation
>
> - **What changed:** Removed the `durationMismatch` validation error and allowed the create videos button to be active even if the script count doesn't match the target duration clip count.
> - **Why:** Videos that are not extended have different durations, so a strict clip count mismatch shouldn't prevent video generation.
> - **Files:**
>   - `src/app/sandbox/page.tsx`

---

### ✨ Features

---

> ### Loading States for Sandbox Generation Prompts
>
> - **What changed:** Added skeleton loading UI and "Regenerating..." disabled states to the script dialogues and default video prompt in the Sandbox when a regeneration is triggered.
> - **Why:** Gives the user immediate visual feedback that a regeneration request is in progress and prevents them from making conflicting edits while waiting for the LLM response.
> - **Files:**
>   - `src/app/sandbox/page.tsx`

---

> ### Regenerate Dialogues in Sandbox
>
> - **What changed:** Added individual "Regenerate" buttons for each generated dialogue in the Sandbox.
> - **Why:** Allows users to easily re-roll a specific dialogue line if they are unsatisfied, without regenerating the entire script or prompt.
> - **Files:**
>   - `src/app/sandbox/page.tsx`

---

> ### Regenerate Default Video Prompt Visibility Update
>
> - **What changed:** Updated the visibility condition for the "Regenerate" button on the Default Video Prompt in the Sandbox to be shown whenever `filmDirectionSystem` and `avatarImage` are present, removing the strict dependency on `isAiGeneratedPrompt`.
> - **Why:** Allows users to regenerate the default video prompt even if they manually edited the prompt and lost the AI-generated flag.
> - **Files:**
>   - `src/app/sandbox/page.tsx`

---

## 🗓️ **2026-05-05**

---

### ✨ Features

---

> ### Improved Sandbox UI Loading State & Blob Naming
>
> - **What changed:** Upgraded the loading UI within sandbox video cards from a static image icon to a properly styled spinning loader with "Generating video..." text. Additionally, modified `sandbox-updater.ts` so that uploads to Vercel Blob accurately read the `videoVersions` array length to generate unique `_1`, `_2`, etc. filename extensions on regeneration.
> - **Why:** Improves user feedback during potentially long generation wait times and explicitly prevents Vercel Blob from overwriting previous generation versions by ensuring each attempt gets a uniquely suffixed URL.
> - **Files:**
>   - `src/app/sandbox/page.tsx`
>   - `src/lib/sandbox-updater.ts`

---

> ### Vercel Blob Collision Fix in Sandbox Updater
>
> - **What changed:** Re-enabled `addRandomSuffix: true` on the `@vercel/blob` `put()` calls in `src/lib/sandbox-updater.ts` when uploading generated sandbox videos and reference JSONs.
> - **Why:** Prevents "blob already exists" errors. Even though version increments are properly tracked locally, network retries or simultaneous background updates could result in the same filename being requested again. Vercel Blob requires either overwrite permission or random suffixes to safely store duplicated pushes.
> - **Files:**
>   - `src/lib/sandbox-updater.ts`

---

> ### Track versions of regenerated sandbox steps
>
> - **What changed:** Replaced `videoUrlHistory: string[]` with `videoVersions: { version: string, url: string }[]` for Sandbox clips. Upon generation, a version label (e.g. `_1`, `_2`) is attached to the URL and stored in DB. Modified the UI to show arrows switching between tracked versions directly on the clip card, updating the current clip and restitching automatically.
> - **Why:** Makes iteration on sandbox clips clearer by tracking explicit versions rather than a blind history array, making it easier to select between various attempts.
> - **Files:**
>   - `src/app/sandbox/page.tsx`
>   - `src/lib/types.ts`

---

> ### Single-Clip Regeneration History & Auto-Stitching
>
> - **What changed:** Sandbox steps now maintain a `videoUrlHistory` array and an `activeHistoryIndex`. When 'Extend Video' is 'No', regenerating a clip appends the new version without deleting previous ones. The UI features left/right arrows to cycle through past generations for each step, and changing the active version automatically triggers the backend `/api/sandbox/stitch` endpoint to re-compile the final video.
> - **Why:** Allows users to experiment with single clip iterations (prompt tweaks or random seeds) and securely compare/restore past versions while keeping the final stitched video continuously synced with their current selections.
> - **Files:**
>   - `src/app/sandbox/page.tsx`

---

> ### Add Extend Video Toggle and FFmpeg Stitching API
>
> - **What changed:** Added a toggle in the Sandbox to disable extend video APIs and use `image-ref` generation with `ffmpeg` stitching instead.
> - **Why:** Allows users to choose between native video extension or independent clip generation combined via server-side ffmpeg concat.
> - **Files:**
>   - `src/app/sandbox/page.tsx`
>   - `src/app/api/sandbox/stitch/route.ts`

---

> ### Dynamic Film Direction System Subcollection
>
> - **What changed:** Updated film direction system to dynamically fetch `commonRules` and `styles` from Firestore subcollections. `api/sandbox/generate-scripts` now uses `gemini-2.5-flash` to select a single style key based on the image, dialogues, and goal, then dynamically injects explicitly labelled `Common Rules:` and `Selected Style:` into the final prompt.
> - **Why:** Simplifies the LLM prompt by removing the monolithic document context and ensures the final video generation LLM receives highly targeted style instructions specific to the selected genre without confusion.
> - **Files:**
>   - `src/app/api/intelligence/film-direction/route.ts`
>   - `src/app/api/sandbox/generate-scripts/route.ts`
>   - `src/app/sandbox/page.tsx`
>   - `test-selection.ts`

---

### 🐛 Fixes

---

> ### Fix missing sandbox topicName initialization
>
> - **What changed:** Updated `fetchSandboxData` in `src/app/sandbox/page.tsx` to strictly check `data.topicName !== undefined` instead of relying on truthiness `if (data.topicName)`.
> - **Why:** When users left the `topicName` empty, it would evaluate as falsey and not properly sync state, causing the topic name field in the UI not to pull the stored state correctly.
> - **Files:**
>   - `src/app/sandbox/page.tsx`

---

> ### Fix clip version switching not properly updating stitched video
>
> - **What changed:** Updated `handleChangeStepVersion` in `src/app/sandbox/page.tsx` to correctly capture and pass the updated clip versions when generating a new stitched video.
> - **Why:** The previous logic mistakenly sent the old, un-updated array of clips to the stitch API because of a delayed React state closure, causing the new stitched video to wrongly contain old clip versions. The stitched video also now maintains its exact blob path, with cache busting natively handled.
> - **Files:**
>   - `src/app/sandbox/page.tsx`

---

> ### Sandbox Video Dimensions Fixed to Object-Contain
>
> - **What changed:** Updated the video player components in the Sandbox page to use `object-contain` instead of `object-cover`.
> - **Why:** Ensures the full video dimensions are always visible and letterboxed correctly rather than cropping the video edges to fill the card.
> - **Files:**
>   - `src/app/sandbox/page.tsx`

---

> ### Block Phones in UGC Selfie Veo Generation
>
> - **What changed:** Added an explicit `UGC Selfie Rule` to the hardcoded Veo injections list that prevents the model from generating visible phones in UGC selfie style videos.
> - **Why:** Veo often forces a phone into the frame when generating selfie content, breaking the desired illusion. This hardcoded negative prompt stops it.
> - **Files:**
>   - `src/lib/veo-injections.ts`

---

> ### Fix History Buttons Visibility & Filename Increment Logic
>
> - **What changed:** Removed UI restrictions hiding the "Regenerate" and left/right history iteration buttons when the "Extend" toggle was enabled. Updated `processSandboxCompletion` in `sandbox-updater.ts` to fetch step history from Firestore before uploading so the files use sequential suffixes (`_1`, `_2`) instead of timestamps.
> - **Why:** Allows users to easily iterate and navigate previous clips regardless of extend video settings, and keeps the storage bucket organized with human-readable increment suffixes.
> - **Files:**
>   - `src/app/sandbox/page.tsx`
>   - `src/lib/sandbox-updater.ts`

---

> ### Relocate Veo Constraints to Sandbox Prompt Output
>
> - **What changed:** Removed Veo-specific pacing and transition/lighting instructions from the backend video generation API routes (`generate-video` and `extend-video`). These instructions are now explicitly appended to the LLM's output in the `sandbox/generate-scripts` route instead.
> - **Why:** Moves hardcoded AI constraints out of the infrastructure level and into the visible prompt payload. This ensures that the exact instructions sent to the Veo model are fully transparent and generated correctly upstream during the script creation phase.
> - **Files:**
>   - `src/app/api/sandbox/generate-scripts/route.ts`
>   - `src/app/api/script/generate-video/text/route.ts`
>   - `src/app/api/script/generate-video/image-refs/route.ts`
>   - `src/app/api/script/generate-video/image-direct/route.ts`
>   - `src/app/api/script/extend-video/gemini/route.ts`
>   - `src/app/api/script/generate-video/vertex/text/route.ts`
>   - `src/app/api/script/generate-video/vertex/image-refs/route.ts`

---

## 🗓️ **2026-05-04**

---

### 📚 Docs

---

> ### Document Sandbox, New DB Flows & APIs
>
> - **What changed:** Updated Architecture.md and README.md to reflect the newly introduced `/sandbox` testing environment, migration to Firebase Firestore and Vercel Blob, and the new backend APIs handling these operations.
> - **Why:** Keeps system architecture diagrams and project structure documentation aligned with current realities.
> - **Files:**
>   - `Architecture.md`
>   - `README.md`

---

### 🐛 Fixes

---

> ### Prevent Sandbox Firestore Crash on Large videoReference
>
> - **What changed:** Refactored the video generation pipeline to stop storing the massive `videoReference` object inside Firestore documents. Instead, the backend serializes `videoReference` to a JSON file, uploads it to Vercel Blob, and returns a lightweight `videoReferenceUrl`. The Extend APIs (Gemini and Vertex) were updated to accept this URL, fetch the JSON on-demand, and pass the reconstructed object to the Veo model. Also fixed the Google GenAI config parameter structure for extending videos to match the official spec (`video: videoReference` instead of `config.sourceVideo`).
> - **Why:** The raw `videoReference` object returned by Veo 3.1 is extremely large (often base64 strings). Attempting to save it to Firestore caused the 1 MB document size limit to be exceeded, which broke the sandbox step synchronization and made subsequent Extend calls fail with a "Missing previous step video reference" error. Additionally, fixing the SDK parameters ensures extensions actually work properly.
> - **Files:**
>   - `src/lib/sandbox-updater.ts`
>   - `src/app/sandbox/page.tsx`
>   - `src/app/api/script/extend-video/gemini/route.ts`
>   - `src/app/api/script/extend-video/vertex/route.ts`
>   - `src/app/api/script/generate-video/image-refs/route.ts`
>   - `src/app/api/script/generate-video/vertex/image-refs/route.ts`
>   - `src/services/gemini-video.ts`
>   - `src/services/vertex-video.ts`

---

> ### Fix Firebase Admin Initialization Crash in Sandbox Updater
>
> - **What changed:** Added a safety check (`typeof db.collection !== 'function'`) to gracefully handle Firebase Admin not being fully initialized when updating Sandbox runs instead of throwing `TypeError: db.collection is not a function`.
> - **Why:** Prevents the video generation completion handler from crashing entirely when environment variables for Firebase Admin are missing (like when running locally without the service account).
> - **Files:**
>   - `src/lib/sandbox-updater.ts`

---

> ### Improve Sandbox Video Generation Prompt Instructions
>
> - **What changed:** Updated the LLM prompt instructions in the Sandbox to explicitly require the persona and audio instructions (specifically engaging UGC-style music that sits well under vocal speech, and real human speech with emotions) to be placed at the very top of the generated prompt. Removed all hardcoded stylistic constraints and templates, instructing the LLM instead to choose the best template dynamically from the Film Direction System based on the goal and image.
> - **Why:** VEO prioritizes instructions at the top of the prompt. Dynamic template selection ensures the output aligns accurately with the content rather than being forced into a generic mold.
> - **Files:**
>   - `src/app/api/sandbox/generate-scripts/route.ts`

---

### ✨ Features

---

> ### Background Sandbox Video Generation on Refresh
>
> - **What changed:** Sandbox generation API routes now upload videos to Vercel Blob and update Firestore directly when the API completes execution on the server. The client polling loop automatically resumes pending generation steps if the user refreshed the page. Removed giant full-response logging objects and instead log Vercel Blob upload links and concise API status steps.
> - **Why:** A page refresh or navigation away from the Sandbox previously caused the `fetch` request to cancel, resulting in lost video files even if the backend completed them. This makes generation resilient to connection drops.
> - **Files:**
>   - `src/lib/sandbox-updater.ts`
>   - `src/app/api/script/generate-video/image-refs/route.ts`
>   - `src/app/api/script/generate-video/vertex/image-refs/route.ts`
>   - `src/app/api/script/extend-video/gemini/route.ts`
>   - `src/app/api/script/extend-video/vertex/route.ts`
>   - `src/services/vertex-video.ts`
>   - `src/app/sandbox/page.tsx`

---

### 🐛 Fixes

---

> ### Improved Veo Dialogue Generation Prompting
>
> - **What changed:** Updated the script generation prompt in the Sandbox to enforce a strict "dialogue: " prefix for spoken text. Also added rules to ensure no hyphens or special characters appear inside the dialogue, and required that any moods, acting notes, or directions be placed on separate lines away from the dialogue itself.
> - **Why:** Veo models require explicit "dialogue: " formatting to properly trigger lipsync and speech, and special characters or inline acting notes within the dialogue string can cause the model to stumble, mispronounce, or fail generation entirely.
> - **Files:**
>   - `src/app/api/sandbox/generate-scripts/route.ts`

---

### 💅 Styling and UI Improvements

---

> ### Reorder Sandbox UI Panels
>
> - **What changed:** Moved the "Avatar Image" panel to be positioned right above the "Script & Dialogue" panel in the Sandbox page layout.
> - **Why:** Makes logical sense that the user sets their goal and reference image first, before clicking "Generate Script", aligning the visual flow with the generation sequence.
> - **Files:**
>   - `src/app/sandbox/page.tsx`

---

## 🗓️ **2026-05-03**

---

### 🐛 Fixes

---

> ### Fix Firestore not initialized error
>
> - **What changed:** Replaced thrown error with a console.warn and graceful fallback when Firestore is not initialized.
> - **Why:** Prevents ugly error stack traces in the server logs.
> - **Files:**
>   - `src/app/api/intelligence/film-direction/route.ts`

## 🗓️ **2026-05-04**

---

### ✨ Features

---

> ### Pull Film Direction System & Cinematic Script Generation
>
> - **What changed:** Integrated the Film Direction System into the Sandbox page. It is fetched silently on mount and used to dynamically generate a single shared visual video prompt alongside per-clip dialogues, utilizing the uploaded avatar image as a reference point.
> - **Why:** Replaces manual video prompting with an automated cinematic AI output based on a predefined Film Direction system for consistent styling and lighting.
> - **Files:**
>   - `src/app/sandbox/page.tsx`
>   - `src/app/api/sandbox/generate-scripts/route.ts`
>   - `src/app/api/intelligence/film-direction/route.ts`

---

### 🧹 Refactors

---

> ### Remove Obsolete Routes & Services
>
> - **What changed:** Cleaned up dead code by removing `generate-bridge`, `stitch`, and `extract-frames` API routes, as well as `generateReelFirstLastFrame()` service functions.
> - **Why:** The legacy bridge and stitch approach has been completely replaced by the new extend chain mechanism.
> - **Files:**
>   - `src/app/api/sandbox/generate-bridge/route.ts`
>   - `src/app/api/sandbox/stitch/route.ts`
>   - `src/app/api/sandbox/extract-frames/route.ts`
>   - `src/services/gemini-video.ts`
>   - `Architecture.md`

---

### ✨ Features

---

> ### Sandbox Script-Driven Flow & Duration Linking
>
> - **What changed:** Replaced the explicit video count control with a single target duration slider that dynamically calculates `clipCount` (8s = 1 clip, 15s = 2 clips, etc.). The left panel is now entirely script-driven: AI-generated dialogues dynamically render exactly `clipCount` editable cards. A permanent `Default Video Prompt` was introduced, synced with `localStorage`, and the final video prompt is assembled server-side using `{defaultPrompt}. {clipDialogue}` logic. Hardcoded limits were removed, relying solely on formula calculations.
> - **Why:** Improves UX by simplifying the configuration to only a Goal and Duration, while making the generated dialogue components the primary visual anchor for generating consecutive short-form video clips automatically.
> - **Files:**
>   - `src/app/sandbox/page.tsx`
>   - `src/app/api/sandbox/generate-scripts/route.ts`
>   - `src/app/api/script/generate-video/image-refs/route.ts`
>   - `src/app/api/script/generate-video/vertex/image-refs/route.ts`
>   - `src/app/sandbox/constants.ts`

---

> ### Sandbox Run History — Persistent Runs with Thread UI
>
> - **What changed:** Sandbox video generation now groups all clips, bridges, and the final stitched video into a single **run document** (`run_1`, `run_2`, etc.) under the `sandbox/{id}/generatedVideos` subcollection instead of saving each video as a separate flat doc. Clips and bridges are appended incrementally via Firestore `arrayUnion` as each one completes. The right-side output column now displays a **thread UI**: the active generation is shown inline as "Current Run" with the bridge/stitch section below it, and all completed runs are listed as collapsible cards in reverse chronological order with model name, clip count, and relative timestamp in the header.
> - **Why:** Provides a persistent, structured history of all generation attempts per sandbox, makes it easy to compare runs, and eliminates orphaned per-clip docs in Firestore.
> - **Files:**
>   - `src/app/sandbox/page.tsx`

---

> ### Store Sandbox Videos in Vercel Blob and Firestore `generatedVideos` Subcollection
>
> - **What changed:** Sandbox flow now uploads generated video clips, bridges, and stitched outputs directly to Vercel Blob and saves their links to a new `generatedVideos` subcollection instead of `videos`. Also added vertex output links to server logs.
> - **Why:** To persist all sandbox video assets centrally under Vercel Blob and track them accurately in a dedicated Firestore subcollection.
> - **Files:**
>   - `src/app/sandbox/page.tsx`
>   - `src/services/vertex-video.ts`

---

### 🐛 Fixes

---

> ### Fetch Film Direction System via Firebase Client SDK
>
> - **What changed:** Replaced the `/api/intelligence/film-direction` API route fetch with a direct Firestore client SDK `getDoc` call on the `intelligence/filmDirectionSystem` document.
> - **Why:** The Admin SDK route was failing locally due to `FIREBASE_SERVICE_ACCOUNT_BASE64` not being set, and there's no reason to proxy a read-only config document through the server.
> - **Files:**
>   - `src/app/sandbox/page.tsx`

---

> ### Improve Veo Video Generation Pacing and Behavior
>
> - **What changed:** Injected prompt instructions for conversational pacing (2.5-3 words/sec), hard stopping after scripted lines, and added a negative prompt to prevent mumbling/trailing speech.
> - **Why:** Ensures avatar speaks at a natural pace without unnatural lip movement continuing after dialogue finishes during video generation and extension.
> - **Files:**
>   - `src/services/gemini-video.ts`
>   - `src/services/vertex-video.ts`
>   - `src/app/api/script/extend-video/gemini/route.ts`
>   - `src/app/api/script/extend-video/vertex/route.ts`
>   - `src/app/api/script/generate-video/text/route.ts`
>   - `src/app/api/script/generate-video/image-direct/route.ts`
>   - `src/app/api/script/generate-video/image-refs/route.ts`
>   - `src/app/api/script/generate-video/vertex/text/route.ts`
>   - `src/app/api/script/generate-video/vertex/image-direct/route.ts`
>   - `src/app/api/script/generate-video/vertex/image-refs/route.ts`

---

> ### Sandbox DB Initialisation & Vertex Image Ref Enums Fix
>
> - **What changed:** Fixed the sandbox initialization logic to prevent overwriting saved db values (e.g. aspect ratio, resolution) with defaults on page reload. Additionally, fixed the image payload when executing `vertex/image-refs` logic to use the correct `VideoGenerationReferenceType.ASSET` enum (from the Google GenAI SDK) rather than falling back to a string, which caused `image is empty` payload errors. Finally, updated the video generation payloads to explicitly pass `aspectRatio` and `resolution` state properties dynamically instead of using defaults.
> - **Why:** Preserves the user's sandbox config parameters across sessions, resolves 400 invalid argument errors when sending images to the new Vertex AI models, and correctly translates user-configured resolution bounds down to the API correctly instead of defaulting to 720p.
> - **Files:**
>   - `src/app/sandbox/page.tsx`
>   - `src/services/vertex-video.ts`

---

> ### Fix Sandbox Bridge View Missing on Reload
>
> - **What changed:** Updated sandbox page logic to correctly populate the active generating context (`videoSlots`) and associated bridge slots dynamically upon initial page load if the sandbox instance is fetched and clips already exist. The historical "Generated Bridges" view has also been integrated into the expanded Run History panel.
> - **Why:** When users refreshed the page or navigated away, the current "Bridge Pairs Visualization" block would completely disappear because the UI state that maps extracted frames and bridges to video clips was lost, forcing users to recreate runs.
> - **Files:**
>   - `src/app/sandbox/page.tsx`

---

## 🗓️ **2026-05-03**

---

### ✨ Features

---

> ### Sandbox Instance Creation and Centralized Storage
>
> - **What changed:** Introduced a "Create Sandbox Instance" flow requiring users to initialize a Sandbox before executing generation tasks. Mirrored the provider and model configuration from the script panel to the sandbox, replaced the video count input with a target duration slider, and ensured all operations (goal scripts, configurations, and reference image uploads) automatically update and sync directly to the parent Sandbox document in Firestore.
> - **Why:** Unifies provider settings, prevents accidental generation with missing state, provides intuitive duration controls, and establishes a single source of truth for the entire sandbox workflow directly synced to Firestore in real-time.
> - **Files:**
>   - `src/app/sandbox/page.tsx`

---

> ### Sandbox Bridge Video Generation & Automated Stitching
>
> - **What changed:** Added new endpoints to generate transition video clips between extracted frame pairs using Veo 3.1 (`/api/sandbox/generate-bridge`), to automatically stitch them together with the generated avatar clips via FFmpeg (`/api/sandbox/stitch`), and to serve the resulting compiled mp4 (`/api/sandbox/output/[filename]`). Implemented frontend logic to trigger bridge generation in parallel, visualize statuses, and display the final compiled video.
> - **Why:** Allows users to create seamless visual transitions between multiple speaking segments, resulting in a cohesive multi-shot final video directly from the sandbox.
> - **Files:**
>   - `src/services/gemini-video.ts`
>   - `src/services/vertex-video.ts`
>   - `src/app/api/sandbox/generate-bridge/route.ts`
>   - `src/app/api/sandbox/stitch/route.ts`
>   - `src/app/api/sandbox/output/[filename]/route.ts`
>   - `src/app/sandbox/page.tsx`

---

> ### Sandbox Frame Extraction & Bridge Visualization
>
> - **What changed:** Added automated first/last frame extraction using ffmpeg and visualising bridge pairs in the Sandbox route. A "Generate Bridges & Stitch" button was added that unlocks once all frames are extracted.
> - **Why:** Allows users to review clip connection points visually before committing to generating bridge clips.
> - **Files:**
>   - `src/app/api/sandbox/extract-frames/route.ts`
>   - `src/app/sandbox/page.tsx`

---

> ### Sandbox Video Generation from Avatar Image
>
> - **What changed:** Connected the "Create Videos" button in the Sandbox page to generate `videoCount` parallel videos using the chosen provider (Gemini or Vertex) with the uploaded avatar image. Video outputs are automatically uploaded to Vercel Blob and tracking data is stored in the new `sandbox` and `sandbox/{id}/videos` Firestore collections. Added support for single-clip regeneration. Added video quality selector (720p, 1080p, 4k) which persists in config.
> - **Why:** Completes the end-to-end sandbox functionality, allowing manual testing of avatar video generation without running the full script pipeline.
> - **Files:**
>   - `src/lib/types.ts`
>   - `src/app/sandbox/page.tsx`

---

### 🐛 Fixes

---

> ### Fix Sandbox Layout Hiding Generate Button
>
> - **What changed:** Added `shrink-0` to the "Generate Script" button and `min-h-0` to the left column flex container in the Sandbox page to prevent the button from being pushed out of view or squished by expanding textareas.
> - **Why:** The script and dialogue textareas were expanding and hiding the generation button due to standard flexbox behavior in grid layouts.
> - **Files:**
>   - `src/app/sandbox/page.tsx`

---

## 🗓️ **2026-05-02**

---

### 🐛 Fixes

---

> ### Fix React State Duplication Preventing Shots Display
>
> - **What changed:** Fixed a React component state synchronization issue where `expandedShotIndex` was duplicated in both `page.tsx` and `ScriptPanels.tsx`. Moved the state entirely to `page.tsx` and passed it as a prop so `ScriptPanels` accurately reflects the correct shot when changing threads or adding/removing shots. Removed unused state variables from `page.tsx`.
> - **Why:** The duplicated state caused `ScriptPanels` to hold a stale active index after switching script threads or modifying shots, leading to the UI rendering empty or incorrect shots despite data existing in Firestore.
> - **Files:**
>   - `src/app/script/page.tsx`
>   - `src/app/script/ScriptPanels.tsx`

---

> ### Expand Evolink Error Object in Generation Failure
>
> - **What changed:** Fixed the `[object Object]` error message surfaced when Evolink generation fails. The failure reason is now JSON-serialized when it's an object, and the full poll response is logged to the server console on failure.
> - **Why:** The raw error object from Evolink's API was being coerced to a string via template literal, losing all detail. This makes failures diagnosable.
> - **Files:**
>   - `src/app/api/script/generate-video/evolink/route.ts`

---

## 🗓️ **2026-04-30**

---

### 🐛 Fixes

---

> ### Fix Generated Media Layout & Aspect Ratio Fallback for Legacy Videos
>
> - **What changed:** Fixed issue where legacy generated videos (e.g., Fight Scene) with missing `shotNumber` or `shotData` were not displaying properly. Added fallback to derive `shotNumber` from the loaded `shots` state map keyed by `shotId`. Fixed layout discrepancy where videos were all rendered at a fixed 120px width regardless of aspect ratio, causing landscape videos to appear significantly smaller (shorter) than portrait ones. Video thumbnail widths are now dynamically calculated based on their aspect ratio (140px for portrait, 200px for square, 280px for landscape). Added an aspect ratio fallback for videos without explicit `shotData` (like the first shot of some older records), inheriting the default aspect ratio from other shots in the same script.
> - **Why:** Improves visual consistency across the Generated Video Library, correctly formatting videos from older Firestore records, preventing tiny/squished thumbnail previews.
> - **Files:**
>   - `src/app/results/page.tsx`

---

> ### Fix DropdownMenuLabel Outside Menu.Group Error
>
> - **What changed:** Wrapped `DropdownMenuLabel` in `DropdownMenuGroup` inside the `TopHeader` user dropdown, resolving a Base UI runtime error (`MenuGroupRootContext is missing`).
> - **Why:** `DropdownMenuLabel` renders `MenuPrimitive.GroupLabel` which requires a `MenuPrimitive.Group` ancestor; the missing wrapper caused a crash on every page using `TopHeader`.
> - **Files:**
>   - `src/components/TopHeader.tsx`

---

### 💅 Styling and UI Improvements

---

> ### Rebrand to "AI Native Videos, Powered by Kuai Labs"
>
> - **What changed:** Replaced all standalone "Kuai Labs" references with "AI Native Videos" and added "Powered by Kuai Labs" as small trademark-style text in the sidebar and top header logo lockup.
> - **Why:** Surfaces the product name prominently while retaining the Kuai Labs brand attribution.
> - **Files:**
>   - `src/components/TopHeader.tsx`
>   - `src/components/AppSidebar.tsx`
>   - `src/app/login/page.tsx`
>   - `src/app/signup/page.tsx`
>   - `src/app/avatar/new/page.tsx`

---

### 💅 Styling and UI Improvements

---

> ### Enforce 4-Level Typography System
>
> - **What changed:** Defined a strict 4-level typography system in `globals.css` (`type-level-1` through `type-level-4`) and audited the entire codebase to replace scattered ad-hoc tailwind classes (`text-sm`, `text-xs`, `text-[13px]`, `font-bold`, etc.). Level 1 (15px/500) applies to card titles and headings. Level 2 (13px/400) applies to body text and prompts. Level 3 (12px/400) covers metadata and secondary labels. Level 4 (11px/500/uppercase) styles section headers.
> - **Why:** The app previously mixed font sizes and weights inconsistently. Applying a unified scale creates a much more polished, intentional, and cohesive interface without fundamentally changing any layouts.
> - **Files:**
>   - `src/app/globals.css`
>   - _~18 component and page files across `src/`_

---

> ### Redesign Generated Media Panel
>
> - **What changed:** Redesigned the Generated Media panel into a structured media gallery grouping generated videos by their corresponding shot. Cards were transformed from dark rectangles into clean video tiles (respecting the shot's aspect ratio) featuring an explicit Play button. Added a dark overlay on hover to reveal Play, Download, and Delete actions. Beneath each thumbnail, the shot number and version are displayed cleanly with a muted generation timestamp. Also added a total count of videos next to the section header.
> - **Why:** Makes the generated videos section easier to parse, interact with, and directly links specific video outputs visually with their parent shots.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Redesign Image Library Panel
>
> - **What changed:** Redesigned the Image Library panel as a proper media shelf with a 3-column square grid, hover overlay containing preview and delete actions, full-screen image preview, an improved empty state with a centered upload button, and subtle instructional text. Also fixed the upload button to skip the nested dropdown menu.
> - **Why:** Replaces an outdated file-picker style with a modern, visual media shelf that provides better feedback and quicker actions (like previewing images).
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Redesign Generation Settings Panel
>
> - **What changed:** Redesigned the Generation Settings right panel on the Script page. Removed the collapse toggle to keep settings permanently visible, removed the ProviderBadge from the main header and integrated its function (Change provider) directly into the panel's Top section, and updated the Generate button to feature provider-aware colors (Vertex AI is green, Gemini is blue) along with improved disabled state labels. The settings sections are now cleanly separated by dividers rather than colored banners.
> - **Why:** Improves usability by keeping core generation settings and provider configurations permanently accessible in a unified, cleanly separated panel without cluttering the global app header.
> - **Files:**
>   - `src/app/script/page.tsx`
>   - `src/components/ProviderBadge.tsx`

---

> ### Main Content Area Padding & Layout Fix
>
> - **What changed:** Updated the Script Editor's main content column layout to feature a consistent 24px internal padding (`p-6`). The center column content is now wrapped in a max-width container capped at 800px and centered (`max-w-[800px] flex justify-center`), preventing awkward stretching on wide monitors. Adjusted the vertical margin below the Globals card to precisely 20px (`mb-5`), ensuring visual balance. Adjusted shot cards to feature a uniform 16px internal padding (`p-4`), removing the cramped vertical padding in the headers.
> - **Why:** The previous full-width layout with tight and inconsistent padding made the editor feel unfinished and cramped on standard screens, and uncomfortably stretched on large monitors.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Redesign App Sidebar
>
> - **What changed:** Redesigned `AppSidebar` to a 220px expanded width (48px collapsed). Nav items now have 16px icons with consistent stroke weight, and hover states with a background-secondary fill and `border-radius: 6px` applied exclusively to the item row. Active items feature a stronger background and medium font-weight labels. Group labels received distinct 10px uppercase, letter-spaced styling with a 20px top margin. The user profile row was updated with a full-width 0.5px top border, displaying the user's name and plan badge alongside a sign-out icon.
> - **Why:** Makes the sidebar visually distinct and aligns its weight, highlights, and structure with modern commercial product dashboards (like Linear or Vercel).
> - **Files:**
>   - `src/components/AppSidebar.tsx`
>   - `src/app/globals.css`

---

> ### Redesign App Header & Navigation
>
> - **What changed:** Redesigned the `TopHeader` component into three distinct zones: a left zone with a Kuai Labs logomark and wordmark, a center zone featuring clickable breadcrumb navigation, and a right zone containing the provider badge, notification bell, and a user avatar dropdown menu (for settings and logout). Removed the old H1 page titles and refactored the layout on the Script page to ensure the header spans the full viewport width.
> - **Why:** Replaces the generic scaffold header with a commercial-grade, brand-aligned top navigation that provides clear context via breadcrumbs and easy access to account settings, while recovering vertical space by removing redundant page titles.
> - **Files:**
>   - `src/components/TopHeader.tsx`
>   - `src/app/script/page.tsx`
>   - `src/app/avatar/new/page.tsx`
>   - `src/app/settings/page.tsx`

---

## 🗓️ **2026-04-29**

---

### ✨ Features

---

> ### Secure API Key UI in Settings
>
> - **What changed:** Replaced the plain password inputs for Gemini API key and Vertex Configuration in the Settings page with clickable masked buttons. ClickiAng these buttons now prompts the user to re-enter their account password for authentication before displaying the actual keys in an editable, copyable dialog.
> - **Why:** Enhances security for sensitive API credentials by requiring password re-authentication before viewing or modifying them.
> - **Files:**
>   - `src/app/settings/page.tsx`

---

### 💅 Styling and UI Improvements

---

> ### Trust and Onboarding Enhancements
>
> - **What changed:** Added a usage & quota dashboard in the App Sidebar, an onboarding flow (3-slide modal) for new users on the Avatar creation page, and improved error state/toast designs. Also added a centralized Settings page where users can update their profile (Email, Display Name, Password) and manage secretive API Provider settings.
> - **Why:** Increases user trust by displaying account usage quotas, provides clear onboarding for cold starts, and ensures API/generation failures are handled gracefully with commercial-grade UI. Securely isolates API keys to the Settings page.
> - **Files:**
>   - `src/components/AppSidebar.tsx`
>   - `src/app/avatar/new/page.tsx`
>   - `src/app/script/page.tsx`
>   - `src/app/settings/page.tsx`

---

> ### Redesign Avatar creation page
>
> - **What changed:** Refactored the avatar creation page to use a 60/40 split layout instead of a step wizard, added prompt chips, implemented a version history carousel with lightbox zoom, and removed inline API key warnings.
> - **Why:** Improves UX by giving input forms breathing room, eliminating writer's block with prompt starters, showing generation history, and moving technical API key configurations out of the core user flow.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

### 🐛 Fixes

---

> ### Fix image breaking on shot after upload
>
> - **What changed:** Updated `addImagesToLibrary` to also update the `shots` state array, replacing temporary image reference IDs with the newly generated Firestore document IDs once the upload is completed.
> - **Why:** When an image is uploaded directly to a shot, the shot is assigned a temporary random ID which was breaking once the upload completed because only the global images library state was being updated with the permanent ID.
> - **Files:**
>   - `src/app/script/page.tsx`

---

## 🗓️ **2026-04-28**

---

### 🐛 Fixes

---

> ### Update Vertex AI Veo model names
>
> - **What changed:** Kept Gemini API routes using `veo-3.1-fast-generate-preview` / `veo-3.1-generate-preview` while updating Vertex API routes to use the new `veo-3.1-fast-generate-001` / `veo-3.1-generate-001` model names. The UI model dropdown now dynamically swaps the available options based on whether Vertex AI or Gemini API is selected in the provider toggle.
> - **Why:** Aligning with the official model names for Vertex AI, while preserving the existing model names for Gemini.
> - **Files:**
>   - `src/services/vertex-video.ts`
>   - `src/app/script/page.tsx`

---

## 🗓️ **2026-04-26**

---

### ✨ Features

---

> ### Vertex AI video generation support
>
> - **What changed:** Added a Gemini / Vertex AI provider toggle in Settings. When Vertex AI is selected, a "Set Key" popup accepts a service account JSON and a GCS region (default `us-central1`). Both are stored per-script in Firestore. Selecting shots and generating routes to a new `/api/script/generate-video/vertex` route backed by `src/services/vertex-video.ts`. The service uses `@google/genai` with `vertexai: true` and passes explicit service account credentials via `googleAuthOptions`. It handles both inline `videoBytes` responses and GCS URI responses (downloading the latter via a self-signed JWT + GCS HTTP API — no new npm dependencies). Kling / Seedance / Grok models always route through Evolink regardless of the toggle.
> - **Why:** User wanted to use their GCP service account to generate videos via Vertex AI instead of the Google AI Studio API key.
> - **Files:**
>   - `src/services/vertex-video.ts` _(new)_
>   - `src/app/api/script/generate-video/vertex/route.ts` _(new)_
>   - `src/app/script/page.tsx`

---

## 🗓️ **2026-04-25**

---

### 🐛 Fixes

---

> ### All Firestore doc IDs now auto-generated — no custom names anywhere
>
> - **What changed:** Removed every custom Firestore document ID from the codebase. Scripts now created with `addDoc` (was `t_${Date.now()}`). Globals subcollection now uses Firestore auto-IDs tracked via `id?` field in state (was name-derived slugs). Shot `idUpdates` now applied to React state after batch commit so future syncs correctly identify existing vs new shots. Image library restructured from `imageLibraries/{uid}/images/{clientRandom}` to a flat `imageLibrary/{autoId}` collection with a `userId` field; images created with `addDoc` and local state updated with the returned Firestore ID.
> - **Why:** User required all Firestore doc IDs to be default-generated; any custom ID violates the data architecture contract.
> - **Files:**
>   - `src/app/script/page.tsx`

---

### ✨ Features

---

> ### Migrate storage to Firestore and normalize schema
>
> - **What changed:** Migrated imageLibraries and generatedVideos to Firestore, making imageLibraries a user-specific document with an images subcollection, and normalizing generatedVideos to reference shotId. Included robust createdAt and updatedAt timestamp handling for all script related collections.
> - **Why:** To decouple large binary/media data from core script documents, improve query performance, and ensure persistent, scalable data storage across devices.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Vercel Blob Integration & Firestore Schema Migration
>
> - **What changed:** Replaced IndexedDB and `localStorage` media with centralized Vercel Blob storage. Added `POST /api/upload` to handle chunked/streamed uploads to `@vercel/blob`. Executed a one-time migration to move all existing `script_threads`, shots, global variables, and generated video links into the formalised Firestore schema (`scripts`, `scripts/{id}/shots`, `scripts/{id}/globals`, `generatedVideos`, `imageLibraries`). The script fetched local blobs via IndexedDB URLs, uploaded them to Vercel Blob (under `generated-videos/`), and saved the persistent URLs to Firestore with proper relational keys.
> - **Why:** Local blob URLs are ephemeral and don't persist across devices. Moving data to Vercel Blob and Firestore ensures content is permanently accessible and correctly mapped to user profiles as defined in the ER diagram.
> - **Files:**
>   - `src/app/api/upload/route.ts` _(new)_
>   - `src/lib/types.ts`
>   - `src/app/migrate-data/page.tsx` _(created & removed)_

---

### 💅 Styling and UI Improvements

---

> ### Script Threads — UI Enhancements
>
> - **What changed:** Added a "Create New" button adjacent to the "Video Script Editor" title for quick thread creation. Added an explicit edit (✎) button next to each script thread in the sidebar to make renaming more discoverable. Fixed an issue where the Prompt Editor placeholder text was indented due to leading whitespace. The first shot now loads as the only shot by default when creating a new thread, using the other shots' data as placeholder text.
> - **Why:** Improves usability and discoverability of thread management features while ensuring a cleaner, aligned UI in the prompt editor.
> - **Files:**
>   - `src/app/script/page.tsx`
>   - `src/components/PromptEditor.tsx`

---

### ✨ Features

---

> ### Script Threads — Multiple Scripts in a Left Panel
>
> - **What changed:** The Script page now supports multiple script threads in a collapsible left panel. Each thread has its own shot list, globals, and generated video history. The image library is shared across all threads. Threads are stored in `localStorage` under `script_threads` (array of `{ id, name, createdAt }`). The active thread persists via `active_thread_id`. Shots and globals are stored under `thread_${id}_shots` / `thread_${id}_globals`. Clicking a thread switches to it (persisting the current one first). Double-clicking renames inline. Hovering shows a delete button. A `+` button in the panel header creates a new thread at the top of the list. On first load, existing `podcast_shots` / `podcast_globals` data is migrated into a default thread whose name is inferred from the first descriptive line in the first few shots.
> - **Why:** Allows managing multiple video scripts without losing prior work — each shoot or content batch lives in its own thread while sharing the image library.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Evolink / Kling O3 — Image-to-Video Model Added
>
> - **What changed:** Added `kling-o3-image-to-video` (and additional Evolink models: `seedance-2.0-reference-to-video`, `grok-imagine-image-to-video-beta`, `seedance-1.5-pro`) to the model dropdown on the Script page. These route to a new `POST /api/script/generate-video/evolink` route that submits a job to the Evolink API (`api.evolink.ai/v1/videos/generations`), polls `GET /v1/tasks/${jobId}` every 8 s (up to 70 attempts, ~9 min), downloads the completed video, and returns the binary MP4 with an `X-Video-Filename` header. Full structured logging matches the Veo routes.
> - **Why:** Expands model selection beyond Google Veo to include Kling-based models via the Evolink aggregator, enabling image-driven video generation.
> - **Files:**
>   - `src/app/api/script/generate-video/evolink/route.ts` _(new)_
>   - `src/app/script/page.tsx`

---

> ### Image Library — Vercel Blob Persistence for Public URLs
>
> - **What changed:** Uploaded images are now also stored in Vercel Blob (`@vercel/blob`, `access: 'public'`) via `POST /api/images`. The returned public URL is saved alongside the IndexedDB blob as `blobUrl` on each `ImageItem`. Deleting an image calls `DELETE /api/images` to remove the blob from Vercel storage. The `/api/images` route is now blob-only (no Firestore).
> - **Why:** Kling/Evolink models require a publicly accessible image URL (`image_urls`). Vercel Blob provides a permanent public URL that the Evolink API can fetch directly, removing the need to base64-encode images or proxy them through the app server.
> - **Files:**
>   - `src/app/api/images/route.ts` _(rewritten)_
>   - `src/lib/imageLibraryDb.ts`
>   - `src/app/script/page.tsx`

---

> ### Telegram Notification Bot — Idea Approval Messages
>
> - **What changed:** New `POST /api/telegram/notify` route sends a formatted Telegram message to a configured group containing up to 3 pending post ideas (headline, hook, category) from Firestore `post_ideas`. After sending, the `message_id` and associated idea IDs are stored in Firestore `telegram_messages` for later processing. Auth is gated behind `CRON_SECRET`. Message text uses Telegram MarkdownV2 with proper escaping.
> - **Why:** Enables a human-in-the-loop approval step — ideas generated by the pipeline are pushed to a Telegram group where they can be reviewed before publishing.
> - **Files:**
>   - `src/app/api/telegram/notify/route.ts` _(new)_

---

> ### Automated Pipeline — OpenAI GPT-4o for Idea Generation
>
> - **What changed:** The `POST /api/pipeline/generate-ideas` route now uses the OpenAI Chat Completions API (`gpt-4o`) instead of Anthropic Claude. Auth uses `Authorization: Bearer ${OPENAI_API_KEY}` and the response is read from `data.choices[0].message.content`.
> - **Why:** Standardises on the OpenAI API key already present in the environment.
> - **Files:**
>   - `src/app/api/pipeline/generate-ideas/route.ts`

---

> ### Automated Pipeline — CRON-Only Chaining
>
> - **What changed:** Added an `isCronRequest` boolean to both `POST /api/pipeline/scrape` and `POST /api/pipeline/generate-ideas`. Each route only fires the next step in the chain (scrape → generate-ideas → Telegram notify) when the request is authenticated with `CRON_SECRET`. Manual API calls execute the route's own logic without triggering downstream routes.
> - **Why:** Prevents manual test calls from accidentally kicking off the full automated pipeline chain.
> - **Files:**
>   - `src/app/api/pipeline/scrape/route.ts`
>   - `src/app/api/pipeline/generate-ideas/route.ts`

---

> ### Firebase Client SDK — Auth & Firestore Initialised
>
> - **What changed:** Added `src/lib/firebase.ts` — a singleton client-side Firebase initialiser that reads config from `NEXT_PUBLIC_FIREBASE_*` env vars and exports `db` (Firestore), `auth` (Firebase Auth), and `analyticsPromise` (lazy, browser-only Analytics guarded against SSR). Added all seven `NEXT_PUBLIC_FIREBASE_*` variables to both `.env` and `.env_example`. The existing `firebase-admin.ts` is unchanged and remains the server-only path for API routes.
> - **Why:** Enables client-side Firebase Auth (email/password) and direct Firestore reads/writes from React components, while keeping the Admin SDK isolated to server routes where privileged access is needed.
> - **Files:**
>   - `src/lib/firebase.ts` _(new)_
>   - `.env`
>   - `.env_example`

---

### 🐛 Fixes

---

> ### Generated Videos — Thread-Scoped IndexedDB Keys & Migration
>
> - **What changed:** IndexedDB video keys are now scoped per thread: `${threadId}:${filename}`. A one-time `migrateVideosToThread(threadId)` function re-keys any existing bare-filename records (from before threads were introduced) to the thread-prefixed format. The migration runs idempotently at startup — if no bare-key records exist it is a no-op.
> - **Why:** Without scoping, all threads shared the same video pool. Scoped keys ensure each thread's generated media is isolated.
> - **Files:**
>   - `src/lib/generatedVideosDb.ts`
>   - `src/app/script/page.tsx`

---

> ### Generated Videos — Race Condition on First Load Fixed
>
> - **What changed:** Shot loading (and therefore `loadGeneratedVideosByThread`) is now chained as `.then()` on `migrateVideosToThread` rather than running concurrently with it. Both `migrateVideosToThread` and the old `loadGeneratedVideosByThread` call opened readonly IndexedDB transactions at the same time — on first load the readonly transaction could read before migration's readwrite transaction had re-keyed the bare records, returning an empty result.
> - **Why:** Videos were visible in IndexedDB with correct thread-scoped keys but showed as "0 videos" in the Generated Media panel on the first load after the threads feature was introduced.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Generated Videos — Stale Blob URLs Cleared on Restore
>
> - **What changed:** `restoreThreadShots` no longer keeps `blob:` URLs from localStorage when restoring shots. All `generatedVideoUrls` are cleared on restore — IndexedDB repopulates fresh `blob:` URLs via `loadGeneratedVideosByThread`.
> - **Why:** `blob:` URLs created with `URL.createObjectURL` expire when the page unloads. Keeping dead blob: URLs in restored shot state prevented the fresh IndexedDB-sourced URLs from being the source of truth, causing videos to appear broken or absent after reload.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Telegram Notify — Fixed Wrong Path in generate-ideas Chain
>
> - **What changed:** Corrected the chained POST URL in `generate-ideas` from `/api/pipeline/notify` to `/api/telegram/notify`.
> - **Why:** The route was calling a non-existent path, silently failing to send Telegram notifications at the end of the automated pipeline.
> - **Files:**
>   - `src/app/api/pipeline/generate-ideas/route.ts`

---

> ### Video Upload — Unique Vercel Blob Path per Script × Shot × Version
>
> - **What changed:** `POST /api/upload` now accepts `scriptId` and `shotId` query params and writes to `Generated Videos/{scriptId}_{shotId}_v{n}.mp4`. The route computes the next version number server-side by listing existing blobs under that prefix via `list({ prefix })` — so the version is always derived from actual Vercel Blob state, not the client's potentially-stale `generatedVideos` count. The route falls back to the plain filename when params are absent.
> - **Why:** Client-side `existingCount` can be 0 when Firestore hasn't finished loading, causing every regeneration to produce the same `_v1` path and Vercel Blob to reject it with "blob already exists". Server-side counting is the reliable source of truth.
> - **Files:**
>   - `src/app/api/upload/route.ts`
>   - `src/app/script/page.tsx`

---

> ### Video Download — Fetch-then-Download to Bypass Cross-Origin Restriction
>
> - **What changed:** The Download button on generated videos now fetches the Vercel Blob URL as a `Response`, converts it to a local `blob:` URL via `URL.createObjectURL`, triggers the download with the `<a download>` attribute, then immediately revokes the temporary URL.
> - **Why:** The `download` attribute on `<a>` is silently ignored by browsers for cross-origin URLs (Vercel Blob is a different domain), causing the file to open in a new tab instead of downloading. Fetching the bytes first makes the URL same-origin and forces a file save.
> - **Files:**
>   - `src/app/script/page.tsx`

---

## 🗓️ **2026-04-10**

---

### ✨ Features

---

> ### Avatar Image Generation — SSE Streaming to Prevent Vercel Timeout
>
> - **What changed:** `POST /api/avatar/generate` now returns a Server-Sent Events (SSE) stream instead of a plain JSON response. The server sends a `ping` event every 5 seconds to keep the connection alive during long generations, then sends a final `result` event (with `image_base64` and `mime_type`) or `error` event on completion. The client reads the stream, ignores pings, and updates the UI when the result arrives.
> - **Why:** Gemini image generation can take 40–90s. Vercel's default function timeout is 60s, causing silent failures on longer requests. SSE keeps the connection open past that limit.
> - **Files:**
>   - `src/app/api/avatar/generate/route.ts`
>   - `src/app/avatar/new/page.tsx`

---

> ### Avatar Image Service — Elapsed Time Logging & Timeout
>
> - **What changed:** `generateAvatarImage` in `src/services/gemini-image.ts` now logs elapsed time every 5s while waiting for Gemini (`⏳ still waiting... Xs elapsed`) and logs total time on completion. The interval is always cleared in a `finally` block so it stops regardless of success, error, or timeout. A 2-minute hard timeout via `Promise.race` ensures hung requests are rejected cleanly rather than polling forever.
> - **Why:** Without `finally`, a successful generation on a prior request left the interval running indefinitely (seen logging up to 1100s). Without a timeout, hung Gemini calls would never resolve.
> - **Files:**
>   - `src/services/gemini-image.ts`

---

### 🐛 Fixes

---

> ### Avatar Image Generation — Removed Hardcoded Portrait/Lipsync Constraints
>
> - **What changed:** Removed the `LIPSYNC_SUFFIX` constant and its usage from `generateAvatarImage`. Prompts are now passed through as-is. When reference images are provided, the instruction simply says "generate an image that matches this description" rather than forcing face/portrait/lipsync-specific constraints.
> - **Why:** The generator was locked to producing front-facing portrait images, preventing any other kind of image (scenes, objects, backgrounds, etc.) from being generated.
> - **Files:**
>   - `src/services/gemini-image.ts`

---

---

### 🐛 Fixes

---

> ### Video Naming — Version-Based on Both Local and Vercel
>
> - **What changed:** `video-output.ts` now always uses human-readable version-based filenames (`shot_1.mp4`, `shot_1_(v2).mp4`, `shot_1_(v3).mp4`) regardless of environment. The timestamp-based naming (`shot_1_1775806098332.mp4`) has been removed. The client now sends `existingCount` in the request body so the server knows which version to name the file. All three routes (`text`, `image-direct`, `image-refs`) accept and forward `existingCount` to `resolveOutputPath`.
> - **Why:** Timestamp naming was added to avoid `/tmp` collisions on Vercel, but each Vercel serverless invocation has its own isolated `/tmp` filesystem — collisions are impossible. Version-based names are consistent and readable everywhere.
> - **Files:**
>   - `src/lib/video-output.ts`
>   - `src/app/api/script/generate-video/text/route.ts`
>   - `src/app/api/script/generate-video/image-direct/route.ts`
>   - `src/app/api/script/generate-video/image-refs/route.ts`
>   - `src/app/script/page.tsx`

---

> ### Video Client — Binary Response Handling
>
> - **What changed:** The client now correctly handles the `video/mp4` binary response from the generation APIs. It checks `content-type` header, reads the response as a blob directly (no second GET request), saves to IndexedDB using the `x-video-filename` header, and creates a `blob:` URL. Error responses (JSON) are handled separately.
> - **Why:** The client was calling `res.json()` on a binary response, silently failing, and showing an error despite the server returning 200 with a valid video.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Stale Server Video URLs Stripped on Page Load
>
> - **What changed:** On page load, any `generatedVideoUrls` stored in localStorage that are not `blob:` URLs (e.g. old `/api/generated/...` paths) are stripped before setting shot state. IndexedDB then restores valid blob URLs for matching shots.
> - **Why:** Old server-path URLs caused 404 requests on reload since `/tmp` is ephemeral and filenames changed between sessions.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Avatar Image Compression Always On — `config.ts` Removed
>
> - **What changed:** Reference image compression (>4 MB → compress to fit) now always runs in `POST /api/avatar/generate`, regardless of environment. The `IS_PRODUCTION` env gate and `src/lib/config.ts` have been removed.
> - **Why:** The 4.5 MB Vercel request body limit applies everywhere — there's no reason to only compress in one environment.
> - **Files:**
>   - `src/app/api/avatar/generate/route.ts`
>   - `src/lib/config.ts` _(deleted)_

---

## 🗓️ **2026-04-09**

---

### ✨ Features

---

> ### Central App Config (`src/lib/config.ts`)
>
> - **What changed:** Added `src/lib/config.ts` as a central config file. Currently exposes `config.isProduction` (boolean), driven by the `IS_PRODUCTION` env variable — set to `Yes` to enable, `No` (or absent) to disable.
> - **Why:** Provides a single place to gate environment-specific behaviour without scattering `process.env` checks across the codebase.
> - **Files:**
>   - `src/lib/config.ts` _(new)_

---

### 🐛 Fixes

---

> ### Avatar Reference Image Compression (>4 MB) — Server-Side via Sharp
>
> - **What changed:** The avatar generate API (`POST /api/avatar/generate`) now compresses reference images that exceed 4 MB before passing them to Gemini. Compression preserves the original pixel dimensions — only JPEG quality is reduced, using a binary search to find the highest quality that still fits under 4 MB. The original and compressed sizes are logged. Only runs when `IS_PRODUCTION=Yes` in the env config.
> - **Why:** Large phone photos (e.g. 7–10 MB) were being passed to the Gemini image API at full size, causing slow requests. Compression brings them under 4 MB with minimal visible quality loss.
> - **Files:**
>   - `src/app/api/avatar/generate/route.ts`
>   - `src/lib/config.ts`
>   - `package.json` (`sharp` added)

---

> ### Avatar Generate API — Request Logging
>
> - **What changed:** Added structured `console.log` / `console.warn` calls throughout `POST /api/avatar/generate` covering: entry (prompt preview, ref count, key presence), validation pass/fail, reference image sizes in MB, compression before/after, Gemini call start, and success/error outcomes.
> - **Why:** The API was taking 40+ seconds with no visibility into where time was being spent or whether validation was passing.
> - **Files:**
>   - `src/app/api/avatar/generate/route.ts`

---

## 🗓️ **2026-04-06**

---

### 🐛 Fixes

---

> ### Image Resize Before Video Generation API Call (>4 MB Only)
>
> - **What changed:** Images attached to shots are now resized client-side before being base64-encoded and sent to the video generation APIs. If a file is ≤ 4 MB it is sent as-is at full quality. If it exceeds 4 MB, it is drawn onto a canvas scaled so the longest side is ≤ 1024 px and re-exported as JPEG at 85% quality before encoding. The resize is handled by the new `resizeImageToBase64` helper in `src/app/script/page.tsx` and applies to all three routes (text, image-direct, image-refs) since the encoding happens in the shared `resolvedImages` mapping before the route is chosen.
> - **Why:** Large phone photos (4–10 MB+) were causing Vercel's 4.5 MB request body limit to be exceeded, returning a 413 payload-too-large error on image-to-video generation.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Push to Library Button — Style Consistency Fix (Avatar Page)
>
> - **What changed:** The "Push to Library" button on the avatar page now matches the same outlined style as the Regenerate and Download buttons (`border-violet-200 bg-white text-violet-700`). Previously it had a heavy dark `border-violet-600 bg-violet-600` fill that made it look selected or out of place.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

### 🐛 Fixes

---

> ### Fix video overwriting in Generated Media
>
> - **What changed:** Fixed issue where new videos were overwriting older ones in the UI and IndexedDB on Vercel instances.
> - **Why:** Vercel's stateless container behavior caused local file-name collisions, which now are uniquely tracked by timestamps internally and correctly incremented on the client.
> - **Files:**
>   - `src/lib/video-output.ts`
>   - `src/app/script/page.tsx`

---

### ✨ Features

---

> ### Video Generation URL Logged
>
> - **What changed:** The `saveVideo` function now logs the generated video's direct URL (`response.generatedVideos[0].video.uri`) before downloading it.
> - **Why:** Allows users to easily access the direct video URL from the terminal logs.
> - **Files:**
>   - `src/services/gemini-video.ts`

---

### 🐛 Fixes

---

> ### Video Generation API Returns Binary MP4 Stream
>
> - **What changed:** Modified the three video generation API routes (`/text`, `/image-direct`, `/image-refs`) to stream the generated MP4 file directly to the client as a `video/mp4` binary with appropriate headers (including `X-Video-Filename`) instead of returning a JSON object containing the `videoUrl`. The client (`src/app/script/page.tsx`) was updated to handle the binary response by converting it to a blob, creating a local object URL, and initiating download via a programmatic `<a>` tag rather than relying on navigation.
> - **Why:** Returning a URL from the API and requiring the client to fetch it again caused issues. By returning the binary data directly, we avoid an extra roundtrip and prevent issues where the video URL might not be immediately available or fetchable. Changing the download mechanism to programmatic click avoids navigation issues with `blob:` URLs.
> - **Files:**
>   - `src/app/api/script/generate-video/text/route.ts`
>   - `src/app/api/script/generate-video/image-direct/route.ts`
>   - `src/app/api/script/generate-video/image-refs/route.ts`
>   - `src/app/script/page.tsx`

---

### ✨ Features

---

> ### IndexedDB Persistence for Image Library & Generated Videos
>
> - **What changed:** Image Library uploads and generated shot videos are now persisted in IndexedDB and survive page reloads, browser restarts, and Vercel cold starts:
>   - **Images** — every file uploaded via any upload point (`addImagesToLibrary`) is saved as a blob to the `script-image-library` IndexedDB store (`src/lib/imageLibraryDb.ts`). On page load, all stored blobs are read from IndexedDB, reconstructed as `File` objects, and `blob:` URLs are created for preview — no server involved. Deleting an image from the UI calls `deleteLibraryImage` to remove it from IndexedDB as well.
>   - **Videos** — after a successful generation, the client fetches the video blob from `/api/generated/[filename]`, stores it in the `script-generated-videos` IndexedDB store (`src/lib/generatedVideosDb.ts`), and immediately switches to a `blob:` URL for playback. On page load, stored blobs are matched back to their shots by filename prefix and `blob:` URLs are recreated. Deleting a video from the UI calls `deleteGeneratedVideo` to remove it from IndexedDB as well.
> - **Why:** Without IndexedDB, every page refresh wiped the image library (forcing re-upload) and generated videos were lost on Vercel cold starts since `/tmp` is ephemeral. IndexedDB acts as the permanent client-side store — the server is only needed at the moment of generation.
> - **Files:**
>   - `src/lib/imageLibraryDb.ts` _(new)_
>   - `src/lib/generatedVideosDb.ts` _(new)_
>   - `src/app/script/page.tsx`

---

> ### Unified Video Output Path — Always `/tmp/generated` via API Route + IndexedDB
>
> - **What changed:** Removed the `isVercel` environment branch from `video-output.ts`. Generated videos are now always written to `/tmp/generated/` and always served via `GET /api/generated/[filename]` — on both local dev and Vercel. `public/generated/` has been deleted. Added `GET /api/generated/[filename]` route that streams from `/tmp` with path-traversal protection. After the client receives the video URL, it immediately fetches the blob, saves it to IndexedDB (`script-generated-videos`), and switches to a `blob:` URL for playback — so the video is available offline and survives `/tmp` being wiped on cold starts.
> - **Why:** The previous dual-path approach (`public/generated/` locally, `/tmp` on Vercel) added unnecessary complexity. A single path makes the behaviour identical in both environments. IndexedDB as the source of truth means the server file is only needed once — immediately after generation.
> - **Files:**
>   - `src/lib/video-output.ts`
>   - `src/app/api/generated/[filename]/route.ts` _(new)_
>   - `public/generated/` _(deleted)_
>   - `Architecture.md`

---

### 🐛 Fixes

---

> ### Globals Bulk Edit — Triple-Quote Parser Handles Spaces & Multiline Correctly
>
> - **What changed:** Rewrote the globals bulk edit parser to use a regex (`/^([^=]+?)\s*=\s*"""/`) instead of a plain string split on `="""`. This correctly handles all spacing variants around the `=` sign (`KEY="""`, `KEY = """`, `KEY= """`, `KEY ="""`) and properly captures multi-line values that span many paragraphs. Triple quotes are stripped from the saved value — only the raw content is stored.
> - **Why:** When users pasted globals with a space before `"""` (e.g. `VEO_SUBJECT_WORKERS = """...`), the parser failed to enter block mode and only captured the first line, silently discarding everything after it.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Globals Bulk Edit — Line Break Between Variables on Open
>
> - **What changed:** When opening Globals Bulk Edit, each variable is now separated by a blank line (`\n\n` instead of `\n`), making the textarea much easier to read and edit when variables have long values.
> - **Why:** Without the gap, long multi-line values ran into the next variable key with no visual separation.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Globals & Shots Bulk Edit — Triple Quotes Stripped on Save
>
> - **What changed:** When saving bulk edits, any leading or trailing `"""` are now stripped from global values and shot prompt fields before storing. Works whether the quotes are present or not.
> - **Why:** Users copy-paste values wrapped in triple quotes from their notes or constants files. These decorators should be transparent — only the content matters.
> - **Files:**
>   - `src/app/script/page.tsx`

---

## 🗓️ **2026-04-05**

---

### 💅 Styling and UI Improvements

---

> ### Hide Video Maker
>
> - **What changed:** Commented out the Video Maker link in the sidebar navigation.
> - **Why:** The feature is not needed right now, so the link is hidden without removing the underlying code.
> - **Files:**
>   - `src/components/AppSidebar.tsx`

---

### ✨ Features

---

> ### UI-Provided Gemini & Veo API Keys Exclusively Used
>
> - **What changed:** Detached the Gemini API key from being exclusively loaded via the `.env` file on the New Avatar page, and the Veo API key on the Script Video Generation page. The API keys are now consumed strictly from the UI prompts on the frontend and explicitly passed to the backend for Avatar generation, Script generation, Pipeline creation (including voice style extraction), and Video Generation. The `gemini-video` service specifically removes its `.env` fallback to strictly enforce the user-entered Veo API key.
> - **Why:** Gives the user direct control over their Gemini and Veo API usage quotas per session by utilizing their own UI-provided API keys at all times, making the deployment more tenant-friendly.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`
>   - `src/app/api/avatar/generate/route.ts`
>   - `src/services/gemini-image.ts`
>   - `src/app/api/script/generate/route.ts`
>   - `src/services/gemini-script.ts`
>   - `src/app/api/pipeline/create/route.ts`
>   - `src/services/voice-style.ts`
>   - `src/services/gemini-video.ts`

---

### 🐛 Fixes

---

> ### Prompt Editor Autocomplete & Alignment Fixes
>
> - **What changed:** Fixed a visual alignment issue in the Prompt Editor where the highlighted variable tags had extra padding and font-weight, causing the transparent typing layer to misalign with the visual layer and break cursor navigation. Positioned the autocomplete dropdown dynamically to float precisely below the text cursor rather than the bottom of the editor, and added an automatic trailing space when selecting a variable via autocomplete.
> - **Why:** Ensures the text cursor remains perfectly synced with the visible text, preventing navigation bugs, and provides a much more intuitive, developer-like autocomplete experience.
> - **Files:**
>   - `src/components/PromptEditor.tsx`

---

> ### Legacy ImageRefs Cleared on Load
>
> - **What changed:** Added logic to automatically strip out legacy `'1'` and `'2'` string values from the `imageRefs` array when loading saved shots from `localStorage`.
> - **Why:** The app is moving toward using direct images instead of string references. Users who had the old default constants saved in their browser were seeing orphaned "Ref 1" tiles; this cleanly drops them so the UI reflects the new state.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Bulk Edit Accepts Empty Submissions
>
> - **What changed:** Saving an empty or whitespace-only bulk edit for Globals and Shots no longer triggers an error.
> - **Why:** Clearing all shots or globals via bulk edit is a valid action, but empty JSON caused parse errors for Shots, and we wanted to ensure empty Globals saved properly. Now empty strings are caught and cleanly parsed as an empty array before attempting JSON parse.
> - **Files:**
>   - `src/app/script/page.tsx`

---

### 💅 UI Improvements

---

> ### Copy & Clear Buttons for Bulk Edit
>
> - **What changed:** Added "Copy" and "Clear" buttons to the bulk edit textareas for both Globals and Shots, mirroring the functionality provided for individual shot prompts. The Copy button copies the entire bulk text to the clipboard and shows a brief success animation, while the Clear button instantly empties the textarea. Additionally, the "Save Bulk Edit" button for Globals was moved from the top header down to the bottom row alongside the "Cancel" button, perfectly aligning its layout with the Shots Bulk Edit interface.
> - **Why:** Improves workflow efficiency when managing large scripts or variable sets, making it easier to duplicate or wipe bulk content without manual text selection on desktop and mobile. Moving the Save button creates a consistent, predictable user experience across all bulk edit modes.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Clear Button for Shot Prompts
>
> - **What changed:** Added a "Clear" button next to the Prompt label in each shot's detail view. Clicking it instantly empties the prompt textarea. Additionally, added a "Copy" button next to it that copies the current prompt text to the clipboard and shows a green tick animation for 2 seconds. Both buttons also have active click scaling and background darkening states.
> - **Why:** Makes it much easier to wipe the text area on mobile devices where selecting all text manually can be tedious, allowing users to quickly paste new prompts. The copy button allows for easy duplication of prompts, and the active styling gives immediate physical click feedback.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Default Shots Constants Cleaned
>
> - **What changed:** Removed all pre-filled `imageRefs` (e.g. `['1']` or `['2']`) from the default `PODCAST_SHOTS` constants.
> - **Why:** Prevents non-existent image references from showing up by default when loading initial boilerplate or adding new shots.
> - **Files:**
>   - `src/app/script/page.tsx`

---

### 💅 UI Improvements

---

> ### Mobile Generated Media Scroll
>
> - **What changed:** When generating a video on mobile devices (viewport width < 1024px), the screen now automatically scrolls down to the "Generated Media" section once the generation succeeds.
> - **Why:** Prevents the user from having to manually scroll down to find their newly generated video, improving the mobile UX.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Mobile Avatar Generation Scroll
>
> - **What changed:** When generating an avatar on mobile devices (viewport width < 768px), the screen now automatically scrolls smoothly down to the image preview container once the generation is complete and the image appears.
> - **Why:** In the mobile single-column layout, the generated image appears far below the generation button. Users previously had to manually scroll down to see the result, which felt disconnected. Auto-scrolling immediately reveals the success state.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

### ✨ Features

---

> ### Shot Prompts Global Variables Support
>
> - **What changed:** Added a custom `PromptEditor` component for referencing global variables inside shot prompts using `{variableName}` syntax. Variables are formatted in real-time as bold text with a violet halo while typing. Typing `{` triggers an autocomplete dropdown of available global variables with keyboard navigation support. Detected variables are also displayed below the prompt as hoverable pill tags showing a preview of their value. During video generation, these variables are automatically replaced with their respective values before sending to the backend API.
> - **Why:** Allows users to reuse repetitive text, like character descriptions or stylistic instructions, across multiple shots. Real-time visual formatting and autocomplete make typing complex variables intuitive and error-free without leaving the keyboard.
> - **Files:**
>   - `src/app/script/page.tsx`
>   - `src/components/PromptEditor.tsx`

---

> ### Image Library Multi-Select Modal & Media Deletion
>
> - **What changed:**
>   1. Selecting "Image Library" when attaching an image to a shot now opens a dedicated popup modal instead of just expanding the right sidebar. This modal allows multi-selecting images to attach all at once, while enforcing the 3-image limit.
>   2. Images in the global Image Library can now be deleted via an '×' button, which prompts a confirmation dialog. Deleting an image also removes it from any shots it was attached to.
>   3. Generated videos in the global Generated Media list can now be deleted, also prompting a confirmation dialog before removal.
> - **Why:** Improves workflow speed by allowing bulk attachment of library images directly from the shot card. Adds necessary media management features so users can clean up their workspace and remove unwanted files safely.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Mobile-Friendly Image Removal & Limit
>
> - **What changed:** The 'remove' (`×`) button on attached images in a shot is now constantly visible with a dark backdrop (instead of requiring hover), and a strict limit of 3 images per shot has been enforced. When the limit is reached, the "Upload" button is hidden.
> - **Why:** Hover-only actions are inaccessible on touch devices, making it impossible for mobile users to delete attachments. Enforcing a 3-image limit ensures stable performance and adherence to backend API constraints.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Shots Bulk Edit
>
> - **What changed:** Added a "Bulk Edit" feature for the Shots section, allowing users to view and edit all shots as a single JSON array in a large textarea. It validates the JSON on save, drops unknown keys, and warns on invalid syntax.
> - **Why:** Makes it much easier for power users to copy/paste entire scripts or make large sweeping changes to multiple shots at once without clicking through each accordion.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Camera Flow with Live Viewfinder and Accept/Reject Preview
>
> - **What changed:** Tapping Camera on mobile now opens a full-screen web camera overlay (via `getUserMedia`) instead of delegating to the native input capture. A large shutter button captures the frame. The user is then shown the still preview with **Retake** and **Use Photo** buttons — accepting converts the canvas frame to a `File` and calls `onUpload`, rejecting restarts the live stream. The overlay is rendered via a React portal into `document.body` so it sits above all stacking contexts.
> - **Why:** Native `input capture` hands control to the OS camera app with no in-app preview step. The web camera approach keeps the accept/reject flow inside the product.
> - **Files:**
>   - `src/components/DeviceAwareUpload.tsx`

---

> ### Gallery and File Options Open Correct OS Pickers on Mobile
>
> - **What changed:** Gallery now uses `input.accept = "image/*"` without a `capture` attribute — on iOS and Android this opens the photo gallery picker directly. File now uses `input.accept = "*/*"` — this opens the OS file browser (Files app on iOS, file manager on Android). Both support multi-select.
> - **Why:** Previously both options shared the same generic file input with no differentiation, so they behaved identically and neither specifically targeted the gallery or file browser.
> - **Files:**
>   - `src/components/DeviceAwareUpload.tsx`

---

### 💅 UI Improvements

---

> ### DeviceAwareUpload — Simplified to Native Picker with Image Library Option
>
> - **What changed:** Removed all custom mobile UI (bottom sheet, camera overlay, getUserMedia flow, gallery/file differentiation). Replaced with a single hidden `<input type="file" accept="image/*" multiple>` that the OS handles natively. When `hasLibraryImages` is false, clicking upload goes straight to the native picker. When `hasLibraryImages` is true, a small portal menu appears with two options: **Image Library** and **Upload Images**. The menu is positioned via `getBoundingClientRect` and rendered into `document.body` so `overflow: hidden` ancestors cannot clip it. Outside-click detection uses `click` (not `mousedown`) so button handlers always fire before dismissal.
> - **Why:** The previous custom MobileMenu was broken — `mousedown` outside-click fired before button click events, unmounting the portal before handlers ran. The desktop dropdown was clipped by `overflow: hidden` ancestors in the script page. Delegating to the OS native picker fixes both issues with zero custom UI needed.
> - **Files:**
>   - `src/components/DeviceAwareUpload.tsx`

---

> ### Avatar Page — Two-Column Desktop Layout
>
> - **What changed:** On desktop (≥768px) the Create Your Avatar page now renders in two columns — form on the left (`flex: 1`), image preview on the right (`w-[400px]`, `flex-shrink: 0`, `sticky top-6`). The page title sits above both columns as a full-width header so the form card and preview box are top-aligned. On mobile (<768px) the layout stays single-column and unchanged. The right column shows a placeholder when no image has been generated, and fills with the avatar once generated. Action buttons (Regenerate, Push to Library, Download) sit below the preview in the right column. Generate Avatar and Import stay in the left column.
> - **Why:** The original single-column layout wasted the full right half of the viewport on desktop and buried the preview below a long form.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

> ### Avatar Page — "Step 1 of 2" Pill Removed
>
> - **What changed:** Removed the "Step 1 of 2" step indicator pill from the page header. Step 2 components (topic, script, voice, pipeline) are hidden, making the step indicator misleading.
> - **Why:** Surfacing a step count when step 2 is not reachable confuses the user flow.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

> ### Update API Key Component UI in Avatar Page
>
> - **What changed:** Matched the Gemini API key component UI in the avatar page to look identical to the Veo API key component in the script page.
> - **Why:** To maintain consistent UI and UX across the application for API key inputs.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

> ### Image Library Option Hidden When Library Is Empty
>
> - **What changed:** The "Image Library" option (renamed from "Image Media") is now hidden in both the desktop dropdown and mobile bottom sheet when no images have been uploaded yet (`images.length === 0`). It reappears automatically once at least one image exists. All three `DeviceAwareUpload` usages in the script page pass `hasLibraryImages={images.length > 0}`.
> - **Why:** Showing a library picker when the library is empty is confusing and leads to a dead end.
> - **Files:**
>   - `src/components/DeviceAwareUpload.tsx`
>   - `src/app/script/page.tsx`

---

### ✨ Features

---

> ### Veo 3.1 Lite — Inline Image Limitation Notice & Correct Model ID
>
> - **What changed:** When Veo 3.1 Lite (`veo-3.1-lite-generate-preview`) is selected in the Settings panel, a persistent blue info banner appears directly above the Model dropdown explaining that Lite supports a maximum of 1 image per shot and that extra images will be ignored. The banner disappears instantly when switching to a different model. Model ID corrected from `veo-3.1-lite-preview` to `veo-3.1-lite-generate-preview`.
> - **Why:** Lite does not support the `referenceImages` API — silently dropping images 2 and 3 without any notice would be confusing to users who have multiple images attached to their shots.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Fast/Pro Models Always Use Reference Images API
>
> - **What changed:** For Veo 3.1 Fast and Pro, any shot with 1–3 images now always uses the `/image-refs` route (`referenceImages:` API) regardless of image count. Previously, 1 image routed to `/image-direct`. The `/image-refs` route validation was also relaxed to accept a minimum of 1 image (previously 2).
> - **Why:** The image-direct API animates the image as a literal first frame — the prompt has little control over the scene. The reference images API uses images as style/content guidance while the prompt fully drives the scene composition, making it far more useful for creative video generation.
> - **Files:**
>   - `src/app/script/page.tsx`
>   - `src/app/api/script/generate-video/image-refs/route.ts`

---

### 🐛 Fixes

---

> ### Generated Video Filenames — Spaces Replaced with Underscores
>
> - **What changed:** Duplicate video filenames now use underscores instead of spaces in the counter suffix — `shot_1_(2).mp4` instead of `shot_1 (2).mp4`. Applied to all three generation routes.
> - **Why:** Filenames with spaces become URL-encoded (`shot_1%20(2).mp4`) when served statically. Next.js couldn't match the encoded URL to the file on disk, causing 404s for any shot that had already been generated once.
> - **Files:**
>   - `src/app/api/script/generate-video/text/route.ts`
>   - `src/app/api/script/generate-video/image-direct/route.ts`
>   - `src/app/api/script/generate-video/image-refs/route.ts`

---

### ✨ Features

---

> ### Three-Route Video Generation Architecture
>
> - **What changed:** The single hybrid `/api/script/generate-video` route was replaced with three purpose-built routes, each with a clean input contract matching a distinct Veo API call shape:
>   - `POST /api/script/generate-video/text` — prompt only, no images
>   - `POST /api/script/generate-video/image-direct` — prompt + single image animated directly via Veo's `image:` param (Lite only)
>   - `POST /api/script/generate-video/image-refs` — prompt + 1–3 style/content reference images via `referenceImages:` param (Fast/Pro)
>
>   The client (`script/page.tsx`) automatically selects the correct route based on model + image count:
>   - 0 images → `/text`
>   - Lite + any images → `/image-direct` (first image only; Lite doesn't support `referenceImages`)
>   - Fast/Pro + 1 image → `/image-direct`
>   - Fast/Pro + 2–3 images → `/image-refs`
>
>   `gemini-video.ts` was refactored into three exported functions (`generateReelText`, `generateReelImageDirect`, `generateReelImageRefs`) sharing a common `saveVideo` polling/save helper and `logConfig` logger. The old `generateReel` export was removed.
>
> - **Why:** The old hybrid route conflated three fundamentally different Veo API shapes into one function with conditionals, making it hard to reason about, test, or extend. Separating them gives each route a single responsibility and a clear, validated input contract.
> - **Files:**
>   - `src/app/api/script/generate-video/text/route.ts` _(new)_
>   - `src/app/api/script/generate-video/image-direct/route.ts` _(new)_
>   - `src/app/api/script/generate-video/image-refs/route.ts` _(new)_
>   - `src/app/api/script/generate-video/route.ts` _(deleted)_
>   - `src/services/gemini-video.ts`
>   - `src/app/script/page.tsx`

---

> ### Veo 3.1 Lite Model Added
>
> - **What changed:** Added `veo-3.1-lite-generate-preview` as a selectable model in the Script page Settings panel. Lite does not support the `referenceImages` API — if a Lite shot has images attached, only the first is used via the `image-direct` route.
> - **Why:** Lite is faster and cheaper for simple generations that don't need multi-image reference guidance.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Architecture Document — Updated for Three-Route Video Generation
>
> - **What changed:** `Architecture.md` updated to reflect the three-route video generation split: project structure now shows `generate-video/text/`, `generate-video/image-direct/`, and `generate-video/image-refs/` sub-routes; the script page Veo section has a routing decision table (model × image count); route map and API layer details updated for all three routes; `gemini-video.ts` services section rewritten to document the three exported functions and shared helpers.
> - **Files:**
>   - `Architecture.md`

---

> ### Architecture Document — Full Rewrite
>
> - **What changed:** `Architecture.md` was fully rewritten to reflect the current state of the codebase. Added: Script page (shot editor, global vars, bulk edit, image refs, Veo generation, localStorage persistence), Video Maker (browser NLE, IndexedDB, ffmpeg export), all new API routes (`/api/script/generate`, `/api/script/generate-video`, `/api/video-maker/upload`, `/api/video-maker/export`), new services (`gemini-video.ts`, `skyreels.ts`, `voice-style.ts`), new components (`AppSidebar`, `DeviceAwareUpload`, `PromptEditor`, `ConfirmPopup`), `@google/genai` SDK, `@gradio/client`, `tone.js`, `.vscode/settings.json`, `public/generated/` and `public/uploads/` output directories, design token conventions, and updated route/status tables.
> - **Why:** The previous document described only the avatar + pipeline flow and was missing all work done since initial setup.
> - **Files:**
>   - `Architecture.md`

---

### 🐛 Fixes

---

> ### Graceful Error Handling for Video Generation Failures
>
> - **What changed:** Generation errors (quota exceeded, RAI content filter, permission denied, invalid arguments, no output returned) are now caught and converted into user-friendly messages displayed in a red toast notification at the bottom of the screen. The toast auto-dismisses after 7 seconds and has a manual ✕ close button. `console.error` calls in the generation path were changed to `console.warn` to prevent the Next.js dev overlay from hijacking the screen.
> - **Why:** Previously, any API error caused a raw error object to be logged, triggered the Next.js error overlay in dev, and gave the user no visible feedback other than a red badge on the shot card. Quota (429) and RAI filter rejections are expected occurrences that should be communicated clearly without crashing the UI.
> - **Error cases handled:**
>   - `429 / RESOURCE_EXHAUSTED` → "Quota exceeded — you have hit your Veo API rate limit."
>   - RAI filtered (`raiMediaFilteredCount > 0`) → "Video was blocked by safety filters — `<reason>`"
>   - No video returned → "Generation may have been filtered or failed silently."
>   - `PERMISSION_DENIED` → "Permission denied — your API key does not have access."
>   - `INVALID_ARGUMENT` → API message passed through.
> - **Files:**
>   - `src/services/gemini-video.ts`
>   - `src/app/api/script/generate-video/route.ts`
>   - `src/app/script/page.tsx`

---

> ### Mobile Overlay Z-Index — Bottom Sheet Now Covers Sticky Headers
>
> - **What changed:** The `DeviceAwareUpload` mobile bottom sheet is now rendered via `ReactDOM.createPortal` into `document.body`, completely escaping `main`'s stacking context. Previously, sticky headers (`z-20`, `z-40`) inside `main` (which has `overflow-x-hidden overflow-y-auto`) were rendering above the `fixed` overlay even at `z-[9999]` because `position: sticky` always creates its own stacking context regardless of z-index value.
> - **Why:** CSS stacking context containment — `fixed` descendants of overflow containers do not always paint at the root stacking level in all browsers. Portal sidesteps this entirely.
> - **Files:**
>   - `src/components/DeviceAwareUpload.tsx`

---

> ### Script Page — Mobile Layout Shows Shots First, Settings Below
>
> - **What changed:** Removed `h-full` from the root container on mobile (now `lg:h-full`) so both panels can render their full content height and the page scrolls naturally via `main`'s existing `overflow-y-auto`. Removed `order-first` from the right (Settings) panel so the Shots/Script panel appears first on mobile in DOM order.
> - **Why:** `h-full flex-col` on mobile constrained total height to the viewport. The right panel's `order-first` consumed all visible space, leaving the Shots panel below the fold with no way to reach it.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Script Page — `overflow-hidden` Clipping Shot Cards Removed
>
> - **What changed:** Removed `overflow-hidden` from the shots container div. Added `z-20` to the sticky page title so it stays above expanded shot cards (`z-10`) while scrolling.
> - **Why:** `overflow-hidden` on a parent clips `overflow-visible` children, causing expanded shot accordion cards to be cut off at the container boundary.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### VS Code — Suppress `@theme` Unknown At-Rule Warning
>
> - **What changed:** Created `.vscode/settings.json` with `"css.lint.unknownAtRules": "ignore"`.
> - **Why:** Tailwind CSS v4 uses the `@theme` directive which the VS Code built-in CSS language server does not recognise, producing a spurious warning on `globals.css`.
> - **Files:**
>   - `.vscode/settings.json`

---

### 🐛 Fixes

---

> ### Video Script Editor — Accordion Layout Fix
>
> - **What changed:** Fixed the Shots Accordion layout in the Script Editor by making the parent container `relative`, ensuring the left pane is a `block`, and adding `order-first lg:order-last` to ensure the layout functions properly on mobile and desktop without hiding elements.
> - **Why:** The Shots Accordion was hidden/clipped because the layout styling was broken, particularly on responsive screens.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Video Script Editor — Desktop Layout and Overflow Fixes
>
> - **What changed:** Fixed the main content column width by ensuring the layout `main` uses `min-w-0 overflow-x-hidden`. Updated `DeviceAwareUpload` dropdown to use `max-w-[100vw] sm:max-w-xs z-50`. Added `pr-6` to the right pane to ensure padding. Used `break-words` and `box-border` for textarea and DURATION selector rows to prevent right-edge clipping.
> - **Why:** On desktop, the main content area was overflowing to the right, causing the PROMPT textarea, DURATION selector row, and upload dropdowns to clip at the screen boundary.
> - **Files:**
>   - `src/app/layout.tsx`
>   - `src/app/script/page.tsx`
>   - `src/components/DeviceAwareUpload.tsx`

---

### ✨ Features

---

> ### Device-Aware Upload Experience
>
> - **What changed:** Implemented a reusable `DeviceAwareUpload` component that detects screen width dynamically. On desktop, it renders a popover dropdown under the trigger button (Image Media, Local Directory). On mobile, it displays a native-feeling bottom sheet with an overlay (Image Media, Gallery, File, Camera). Integrated into the Image Library and shot card attachments.
> - **Why:** Provides a tailored, native-like upload experience on mobile devices while keeping a compact dropdown approach on desktop viewports.
> - **Files:**
>   - `src/components/DeviceAwareUpload.tsx`
>   - `src/app/avatar/new/page.tsx`
>   - `src/app/script/page.tsx`

---

### 💅 Styling and UI Improvements

---

> ### Consistent Custom Confirm Popups
>
> - **What changed:** Replaced all native browser `window.confirm` dialogs with a custom, theme-consistent `ConfirmPopup` component across the application (deleting shots, clearing variables, and deleting projects).
> - **Why:** The native browser popups felt disjointed and interrupted the app's clean UI design. The custom modal perfectly matches the light theme, complete with backdrop blur, rounded corners, and consistent action buttons.
> - **Files:**
>   - `src/components/ConfirmPopup.tsx`
>   - `src/app/script/page.tsx`
>   - `src/app/video-maker/_components/ProjectsPanel.tsx`

---

> ### Video Script Editor — Visual Polish and Whitespace Reductions
>
> - **What changed:** Defined a reusable `.field-label` CSS class for all section labels to ensure consistent typography (font weight, letter spacing, size, and color). Reduced the vertical padding in the Globals variable list and added a subtle 1px divider line between rows, cutting the section's total height by ~40%.
> - **Why:** Inconsistent label styles made the UI look unpolished. The Globals list previously required too much scrolling due to excessive padding per variable row.
> - **Files:**
>   - `src/app/globals.css`
>   - `src/app/script/page.tsx`
>
> ---
>
> ### Video Script Editor — Generation Settings and Media Fixes
>
> - **What changed:** Wrapped the API Key inputs into a collapsible "⚙️ API Settings" accordion, removed the Gemini API Key field completely, updated generated video thumbnails to use `object-cover` instead of `object-contain` to fix letterboxing, and added a clearer empty state to the Image Library with a camera icon and a direct "+ Upload your first image" button.
> - **Why:** The API Key inputs were unnecessarily taking up prime real estate. The video thumbnails were rendering with large black bars. The empty state for the Image Library was confusing and lacked a clear call-to-action.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Video Script Editor — Shot Card UI Improvements
>
> - **What changed:** Enhanced the UI of Shot Cards, making collapsed shots show a prompt preview, changing the expand icon to a chevron, adding visual hierarchy (background and shadow) to the expanded state, and replacing the duration/resolution select dropdowns with touch-friendly pill button toggles.
> - **Why:** Improves touch-friendliness on mobile, visual distinction between states, and provides context for collapsed shots.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Create Avatar Page — Layout and API Key UI
>
> - **What changed:** Switched the Create Avatar page to a single-column layout, moving the avatar image preview directly beneath the generation box. Hid the step 2 video/pipeline settings. Added a Gemini API Key input popup with validation state above the avatar description, and a new "Push to Image Library" button alongside the Download button.
> - **Why:** Streamlines the avatar generation flow and makes providing the API key explicit and mandatory before generating images. The single-column layout provides a more focused user experience.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

### 🐛 Fixes

---

> ### Video Script Editor — UI Layout and Truncation Fixes
>
> - **What changed:** Fixed horizontal overflow on action buttons, updated variable names and values to use a CSS grid (`minmax(110px,auto) 1fr`) to ensure values are never left-orphaned and utilize available space cleanly, stacked the Globals description text above action buttons to fix overlap, added a visual separator border under the Globals header, corrected the sidebar navigation icon alignment and active highlight style on mobile, added bottom safe-area spacing to the sidebar, aligned the page title and Select All button visually, and added bottom padding to the scrollable list. Fixed the shot list header layout using flex-nowrap and overflow hidden so that titles and duration text safely truncate instead of wrapping into a broken second row. Moved the "Add New Shot" button into a sticky container at the bottom of the list for immediate access. Added visual disabled states (opacity and cursor) to the Generate button when zero shots are selected. Added collapsible section accordions with item counts and chevron indicators for major page sections (Shots, Generation Settings, Image Library, Generated Media) to fix infinite scrolling issues. Added a sticky page header to retain context, and moved the global "Select All" button contextually into the Shots section header.
> - **Why:** The action buttons and variable names were illegible on smaller devices due to truncation and overflow, the layout felt clustered without clear separation, sidebar icons were misaligned, and the page lacked visual polish and safe-area adjustments for mobile viewports. The shot rows were breaking and overflowing on long text. The primary call-to-actions were misleading or buried out of view on smaller screens. The page lacked proper section navigation resulting in an infinite scroll, and the global Select All button was contextually ambiguous.
> - **Files:**
>   - `src/app/script/page.tsx`
>   - `src/components/AppSidebar.tsx`

---

> ### Video Script Editor — Add Variable Modal Mobile Fix
>
> - **What changed:** Moved the "Add Variable" modal outside of its `overflow-hidden` container to the root level. Added `max-h-[90vh]`, `overflow-y-auto`, and sticky headers/footers to the modal.
> - **Why:** The modal was being cut off and bleeding out of the frame on mobile devices without any way to scroll.
> - **Files:**
>   - `src/app/script/page.tsx`

---

### 💅 Styling and UI Improvements

---

> ### Video Script Editor — Mobile Responsive Layout Fix
>
> - **What changed:** Fixed the mobile layout for the Script page by changing the top-level container to `flex flex-col lg:flex-row`.
> - **Why:** The layout was rendering improperly on mobile devices (squished side-by-side panes). Using `flex-col` on mobile ensures the left and right panes stack vertically as expected, improving readability and usability on smaller screens.
> - **Files:**
>   - `src/app/script/page.tsx`
>
> ---

> ### Video Script Editor — Light Theme and Grid Layouts
>
> - **What changed:**
>   - Completely redesigned the Script Editor interface from dark mode to a light theme (`bg-slate-50`, `bg-white` cards, `border-slate-200`) to perfectly match the application's left sidebar styling.
>   - Converted the "Image Library" and "Generated Media" sections from single-row horizontal scrolling to responsive grid layouts with vertical scrollbars.
>   - Added a 3-second highlight animation (glowing violet ring and scaled play button) to newly generated videos upon API success to immediately draw attention.
> - **Why:** Ensures visual consistency across the app while making it much easier to browse large amounts of media without awkward horizontal scrolling. The highlight effect provides clear visual feedback when long-running generations complete.
> - **Files:**
>   - `src/app/script/page.tsx`

---

### ✨ Features

---

> ### Video Script Editor — Generation Versioning & Stop Control
>
> - **What changed:**
>   - **Versioning:** When re-generating a video for a shot, it no longer overwrites the old file. The backend now appends a version number (e.g. `shot_1 (1).mp4`) if the file exists. The frontend tracks an array of URLs per shot and renders all generated versions simultaneously in the grid.
>   - **Stop Button:** Added a "Stop" button that appears during video generation. Clicking it instantly aborts the pending Next.js API fetch request (`AbortController`) and resets the UI loading state back to idle.
>   - **Loader Versioning:** The loading spinner text now dynamically indicates which version is being generated (e.g., "Generating Shot 1 (v2)...").
> - **Why:** Prevents accidental data loss of previously generated good takes, allowing users to compare multiple generations side-by-side. The stop button gives users immediate control to cancel long-running processes if they spot an error in their prompt.
> - **Files:**
>   - `src/app/script/page.tsx`
>   - `src/app/api/script/generate-video/route.ts`

---

## 🗓️ **2026-04-04**

---

### ✨ Features

---

> ### Video Script Editor — Generation and Layout Refinements
>
> - **What changed:**
>   - **Generated Media Section**: Added a horizontally scrollable section at the bottom of the right sidebar to display generated videos alongside their shot names, including a Download button for each.
>   - **Layout Fixes**: The right sidebar is now locked to the screen's height without global scrolling. The Image Library and Generated Media sections slide horizontally (`overflow-x-auto`), maximizing vertical efficiency.
>   - **Shot Management & Persistence**: Users can now add new shots or delete existing ones. All shots, API Keys, and Model selections are persisted to `localStorage` and restored on load.
>   - **UI Polish**: Checkbox selection no longer accidentally opens the accordion. Added an inline `+` button inside each shot's "Attached Images" area for quick uploads. Added a pulsating spinner/loader inside the shot's accordion header when generating.
> - **Why:** A more intuitive layout allows users to quickly view generations without scrolling up and down the page. Storing settings locally enables a smoother, continuous workflow across sessions.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Video Script Editor Initial Route
>
> - **What changed:** Created a dedicated `/script` route for managing AI video script shots. Includes an accordion-based shot list with editable prompts, durations, and resolutions. Added a Generation Settings panel (with API Key and Model selection) and a persistent Image Library for attaching reference images to shots. Shots and settings are saved to `localStorage`.
> - **Why:** Provides a dedicated workspace to prepare, adjust, and configure individual shots before sending them to the video generation model (e.g. Veo).
> - **Files:**
>   - `src/app/script/page.tsx`
>   - `src/app/script/constants.ts`
>   - `src/components/AppSidebar.tsx`

---

## 🗓️ **2026-03-30**

---

### 💅 UI Improvements

---

> ### Copy-to-Clipboard Button on Avatar Image
>
> - **What changed:** A frosted-glass icon button is now overlaid on the top-right corner of the avatar image. Clicking it copies the image as a PNG to the system clipboard using `navigator.clipboard.write()` with a `ClipboardItem`. The icon switches to a green checkmark for 2 seconds then reverts to the copy icon. The standalone Copy button that was previously in the button row below the image is removed.
> - **Why:** Lets users copy the avatar directly into other apps (Figma, Notion, chat, etc.) without having to download and re-import.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

## 🗓️ **2026-03-28**

---

### ✨ Features

---

> ### Reference Image Upload Limit Raised to 10
>
> - **What changed:** Users can now upload up to 10 reference images (previously capped at 3). All guards, state setters, and UI labels updated consistently.
> - **Why:** More reference images give Gemini better likeness signal, especially for subjects with varied angles, lighting, or expressions.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

### 💅 UI Improvements

---

> ### Avatar Image Container Adapts to Natural Image Dimensions
>
> - **What changed:** The avatar preview container no longer forces a fixed `3/4` portrait aspect ratio when an image is loaded. On `onLoad`, the container switches to the image's `naturalWidth / naturalHeight` ratio, and `object-cover` is replaced with `object-contain` so the full image is always visible without cropping. The placeholder state still uses the `3/4` ratio. Aspect ratio and visibility state are reset on each new generation.
> - **Why:** Generated images can be square, landscape, or any other ratio. Forcing `3/4` was cropping wide images and leaving dead whitespace around square ones.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

## 🗓️ **2026-03-25**

---

### ✨ Features

---

> ### Simplify Audio Controls — Volume Only (Remove Pitch & Tone)
>
> - **What changed:**
>   - Removed `pitch` and `tone` fields from the `Clip` type entirely.
>   - Removed the Pitch and Tone drag-bar controls from the clip settings popup. The popup now shows only **Tempo** and **Volume**.
>   - Removed all Web Audio API code (AudioContext, MediaElementAudioSourceNode, BiquadFilterNode) from `AudioTrackPlayer` in Preview.tsx. Audio now plays through the HTML5 `<audio>` element directly with `audio.volume = clip.volume / 100`.
>   - Volume range changed from `0–1` to `0–100`. The bar shows `{value}%` and double-clicking it resets to 100.
>   - Export route updated: removed `audioProcessingFilters()` (pitch+tone EQ); volume filter now uses `clip.volume / 100`. Video stream is copied without re-encoding when speed == 1 (preserves quality). When re-encoding is required (speed != 1), uses CRF 18 + 192 kbps AAC for high quality output.
>   - `atempo` filter is now skipped when speed == 1.0, and correctly chains two filters for sub-0.5 speeds (e.g., `atempo=0.5,atempo=0.5` for 0.25×).
> - **Why:** Pitch and tone controls used Web Audio API routing that was unreliable across browsers and added latency in preview. Removing them makes audio playback simpler and more reliable. Volume-only is sufficient for the current use case.
> - **Files:**
>   - `src/app/video-maker/types.ts` — removed `pitch` and `tone` from `Clip`
>   - `src/app/video-maker/store.tsx` — removed `SET_CLIP_PITCH`, `SET_CLIP_TONE`, `SET_CLIP_PITCH_PREVIEW`, `SET_CLIP_TONE_PREVIEW` actions and reducer cases
>   - `src/app/video-maker/_components/Timeline.tsx` — clip default volume `1` → `100`, removed `pitch`/`tone` defaults
>   - `src/app/video-maker/_components/ClipBlock.tsx` — removed Pitch/Tone bars and badges; Volume bar range 0–100; volume drag range updated; waveform/opacity scaled by `volume / 100`; double-click volume bar resets to 100
>   - `src/app/video-maker/_components/Preview.tsx` — removed Web Audio graph entirely; simplified `AudioTrackPlayer` to direct `<audio>` element with `volume = clip.volume / 100`
>   - `src/app/api/video-maker/export/route.ts` — removed pitch/tone from `ExportClip`; volume filter uses `clip.volume / 100`; video copied at speed==1; CRF 18 + 192k AAC when re-encoding; `atempoChain()` helper for safe atempo chaining

---

> ### Advanced Audio Processing Engine for Next.js
>
> - **What changed:** Implemented a new advanced audio processing engine using the Web Audio API. This features an AudioWorklet `PitchShiftProcessor` for granular pitch shifting without tempo alteration, and a `useAudioProcessor` hook managing Biquad filters for tone control (Nasal and Throaty formants).
> - **Why:** To support high-fidelity, real-time voice manipulation (pitch and tone independent of speed) directly in the browser, overcoming the standard `playbackRate` limitations and meeting the strict latency and quality constraints.
> - **Files:**
>   - `public/audio-processor.js`
>   - `src/hooks/useAudioProcessor.ts`

---

> ### Auto-Create Audio Track on Video Drop
>
> - **What changed:** When dropping a video clip onto the timeline, if no unmuted audio track exists, a new audio track is now automatically created to hold the extracted audio clip.
> - **Why:** Previously, if a user dragged a video clip and there were no audio tracks (e.g., they deleted the default one), the audio portion was silently discarded. Now it safely creates a destination track for the extracted audio.
> - **Files:**
>   - `src/app/video-maker/store.tsx`

---

> ### Knob Popup Panel — Portal-Based, Pointer-Capture Drag, Undo/Redo
>
> - **What changed:**
>   - Knobs (Tempo, Pitch, Tone) now open as a **floating popup panel** anchored above the clip, rendered via `createPortal` into `document.body`. This means they are never clipped by `overflow-hidden` containers — they always float freely over the UI.
>   - Each knob uses **pointer capture** (`setPointerCapture` / `releasePointerCapture`) on pointer-down, so dragging works reliably even when the mouse leaves the knob or the clip area entirely.
>   - The popup also includes a **Volume bar** (drag up/down) so all four clip audio parameters are accessible in one place.
>   - **Undo/redo support**: A `SNAPSHOT_FOR_UNDO` action is dispatched once at the start of each drag gesture, pushing the pre-drag state to history. All live-drag updates use new `*_PREVIEW` action variants (`SET_CLIP_VOLUME_PREVIEW`, `SET_CLIP_SPEED_PREVIEW`, `SET_CLIP_PITCH_PREVIEW`, `SET_CLIP_TONE_PREVIEW`) that update state without pushing to the undo stack. Result: `Cmd+Z` / `Cmd+Shift+Z` undoes or redoes the entire gesture as a single step.
>   - Popup opens on clip hover (when clip is ≥ 48 px wide) and stays open when the mouse moves into the popup itself (150 ms close delay).
> - **Why:** Knobs inside `overflow-hidden` clips were being clipped and were uninteractable because `window.addEventListener` mouse events are unreliable once the pointer leaves the element. The portal + pointer-capture approach makes them fully reliable. Undo/redo was added so users can freely experiment without fear of losing their previous settings.
> - **Files:**
>   - `src/app/video-maker/store.tsx` — `SNAPSHOT_FOR_UNDO` action; `patchClipsNoHistory` helper; four `*_PREVIEW` action variants
>   - `src/app/video-maker/_components/ClipBlock.tsx` — full rewrite: `createPortal` popup, pointer-capture knob drag, snapshot-on-drag-start pattern, volume bar in popup

---

> ### Video Clip Split Display — Top Half Frames, Bottom Half Waveform
>
> - **What changed:** Video clips on the timeline now display in two vertical halves: the **top 50%** shows the thumbnail frame strip (repeating preview frames), and the **bottom 50%** shows the audio waveform extracted from the video file. A subtle divider line separates the two sections.
> - **Why:** Users requested the ability to see and interact with the audio waveform inside video clips directly on the timeline, enabling visual volume drag by feel. Having the frame strip alongside the waveform also makes it clearer which visual content corresponds to which audio.
> - **Files:**
>   - `src/app/video-maker/_components/MediaPanel.tsx` — waveform is now extracted from video files too (not just audio), using `AudioContext.decodeAudioData` on the video blob
>   - `src/app/video-maker/_components/ClipBlock.tsx` — video clips render top-half thumbnail + bottom-half waveform; shared `renderWaveform` helper

---

### 🐛 Bug Fixes

---

> ### Fix: Video Fast-Forwards Without Sound on Play
>
> - **What changed:** Removed the on-mount Web Audio graph setup for the `<video>` element. The video's Web Audio graph (for pitch/tone) is now built **lazily on the first play click**, after `Tone.start()` has resumed the AudioContext.
> - **Why:** Connecting a `<video>` element to `createMediaElementSource` on component mount captures its audio stream into the Web Audio graph immediately. Since browsers suspend the AudioContext until a user gesture (autoplay policy), the video's audio was silently dropped into a non-running graph. In some browsers this also caused `currentTime` to behave erratically, making the seek-drift correction fire repeatedly and producing a fast-forward effect. Building the graph only after `Tone.start()` has confirmed the context is running eliminates both the silence and the jitter.
> - **Files:**
>   - `src/app/video-maker/_components/Preview.tsx`

---

> ### Fix: Volume Not Applied to Video Clips in Preview
>
> - **What changed:** Added `video.volume = clip.volume ?? 1` to the video sync effect that fires on every playhead update.
> - **Why:** The `<video>` element's native volume was never set from `clip.volume`, so dragging a video clip's volume had no audible effect during preview (though it was correctly applied at export via FFmpeg).
> - **Files:**
>   - `src/app/video-maker/_components/Preview.tsx`

---

> ### Fix: Pitch & Tone Not Affecting Video Clip Audio in Preview
>
> - **What changed:** Added a Web Audio processing graph (PitchShift + two-band EQ) for the `<video>` element, mirroring what `AudioTrackPlayer` does for audio tracks. The graph is built lazily on first play. A separate effect updates pitch routing and EQ gain values whenever the active video clip changes.
> - **Why:** The existing pitch/tone Web Audio graph only applied to `<audio>` elements (audio tracks). Video clips played through the `<video>` element which had no graph, so pitch and tone knob changes had no audible effect in preview even though they were correctly exported.
> - **Files:**
>   - `src/app/video-maker/_components/Preview.tsx`

---

### 💅 UI Improvements

---

> ### Scaled Up UI — Larger Tracks, Sidebar, Controls
>
> - **What changed:**
>   - Track height: 56 px → 72 px; track header width: 160 px → 176 px
>   - Sidebar width: `w-72` (288 px) → `w-80` (320 px)
>   - Header bar: larger padding, `text-base` title, bigger logo icon (`h-8 w-8`)
>   - Timeline ruler: `h-6` → `h-8`; time labels `text-[9px]` → `text-[11px]`; toolbar buttons and zoom controls increased to `text-sm`
>   - Seek bar: `h-2` → `h-3`; time displays `text-xs` → `text-sm`
>   - Play/pause button: `h-10 w-10` → `h-12 w-12`; icons `h-4 w-4` → `h-5 w-5`
>   - Export button: larger padding and `text-sm` font
>   - Media panel: video thumbnails `h-28` → `h-36`; audio thumbnails `h-14` → `h-20`; item name `text-[11px]` → `text-xs`
>   - Clip block label: `text-[10px]` → `text-xs`; track header icons `h-3.5` → `h-4`
> - **Why:** The editor felt too zoomed-out at typical screen sizes, making clips, controls, and text hard to target and read.
> - **Files:**
>   - `src/app/video-maker/page.tsx`
>   - `src/app/video-maker/_components/Timeline.tsx`
>   - `src/app/video-maker/_components/TrackRow.tsx`
>   - `src/app/video-maker/_components/ClipBlock.tsx`
>   - `src/app/video-maker/_components/Preview.tsx`
>   - `src/app/video-maker/_components/MediaPanel.tsx`

---

## 🗓️ **2026-03-24**

---

### ✨ Features

---

> ### Per-Clip Volume Drag, Pitch, Tempo & Tone Knobs
>
> - **What changed:**
>   - **Volume drag**: Dragging a clip body vertically (up = louder, down = quieter) now adjusts clip volume in real time. Waveform bar heights and clip opacity scale proportionally as visual feedback. Works on both video and audio clips.
>   - **Hover knobs**: Three rotary knobs appear on any clip wider than 72 px when hovered. Drag up to increase, down to decrease.
>     - **Tempo** (0.25×–2×) — real-time via `audio.playbackRate`, also applied at export.
>     - **Pitch** (±12 semitones) — real-time via Tone.js `PitchShift` (phase vocoder); PitchShift node is bypassed entirely when pitch = 0 to avoid adding latency.
>     - **Tone** (−1 warm/throaty → +1 bright/nasal) — real-time via two Web Audio API `BiquadFilter` peaking EQ nodes (200 Hz and 3 kHz), zero latency.
>   - Non-zero pitch / tone values show compact badges on the clip so they remain visible when not hovering.
>   - All four values are included in the export manifest and applied in FFmpeg: `asetrate`+`atempo` for pitch, `equalizer` filters for tone.
> - **Why:** Gives users direct, in-place control over clip audio character without leaving the timeline. Pitch and tone are particularly useful for matching voice clips recorded in different environments.
> - **Files:**
>   - `src/app/video-maker/types.ts` — added `pitch: number` and `tone: number` to `Clip`
>   - `src/app/video-maker/store.tsx` — `SET_CLIP_PITCH`, `SET_CLIP_TONE` actions; `ADD_CLIP` defaults both to 0 for backward compat
>   - `src/app/video-maker/_components/ClipBlock.tsx` — direction-detecting drag (vertical = volume, horizontal = move), `Knob` component, hover overlay, pitch/tone badges
>   - `src/app/video-maker/_components/Timeline.tsx` — new clip literal includes `pitch: 0, tone: 0`
>   - `src/app/video-maker/_components/Preview.tsx` — `AudioTrackPlayer` builds a Web Audio graph (MediaElementSource → PitchShift → EqLow → EqHigh → destination); pitch routing is switched in/out dynamically; Tone.js context started lazily on first play
>   - `src/app/api/video-maker/export/route.ts` — `audioProcessingFilters()` helper applies `asetrate`+`atempo` for pitch and dual `equalizer` for tone in the FFmpeg filter chain

---

> ### Dual Playhead System — White Play Head & Violet Edit Cursor
>
> - **What changed:** Replaced the single playhead with two independent cursors. The **white head** (play position) is set only by clicking on the ruler or tracks and advances during playback — it determines where play starts from. The **violet head** (edit cursor) follows the mouse at all times, including during playback, and is used exclusively for editing operations (split, paste, delete, keyboard shortcuts). Both heads are rendered as lines through the full track area with matching diamond markers on the ruler.
> - **Why:** Previously, hovering the timeline during playback was blocked, and there was no way to position the edit point independently from the play position. Separating the two allows users to set up split/paste operations while audio/video is still running.
> - **Files:**
>   - `src/app/video-maker/store.tsx` — added `editCursor` state field and `SET_EDIT_CURSOR` action
>   - `src/app/video-maker/_components/Timeline.tsx` — ruler hover → `SET_EDIT_CURSOR`, ruler click/drag → `SET_PLAYHEAD`; all keyboard shortcuts and paste now use `editCursor`
>   - `src/app/video-maker/_components/ClipBlock.tsx` — split button uses `editCursor` instead of `playhead`

---

> ### Fix: Timeline Drop Position Misalignment at Any Zoom Level
>
> - **What changed:** Replaced the drop-position calculation in `TrackRow` from `e.currentTarget.getBoundingClientRect().left + HEADER_W` to measuring directly from the clip area element's own bounding rect via a `clipAreaRef`.
> - **Why:** The old calculation subtracted a hard-coded `HEADER_W` constant from the full row's rect, which could drift from the actual rendered header width due to borders or scroll offsets, causing clips to land 1–2 seconds off from where they were dropped. Measuring from the clip area element directly eliminates all such offsets regardless of zoom or scroll position.
> - **Files:**
>   - `src/app/video-maker/_components/TrackRow.tsx`

---

> ### Fix: Audio Waveform Shows Correct Segment After Split
>
> - **What changed:** Audio clip waveforms now display only the samples corresponding to the clip's `trimStart`/`trimEnd` range. The SVG `viewBox` is updated to match the sliced sample count so the waveform stretches correctly across the trimmed width.
> - **Why:** After splitting a clip, both halves referenced the same full 120-sample waveform array. Since the SVG used `preserveAspectRatio="none"`, the full waveform was squashed into each shorter clip, making it appear as if the same wave pattern repeated at each second.
> - **Files:**
>   - `src/app/video-maker/_components/ClipBlock.tsx`

---

> ### Fix: Audio Glitch & Repeated Segment at Split Point During Playback
>
> - **What changed:** Rewrote `AudioTrackPlayer` in `Preview.tsx` to stop re-seeking the audio element on every RAF frame. The audio now plays natively between same-source clip transitions; a seek is only issued when the source file changes, when transitioning to a different clip with significant drift (> 0.15 s), or when scrubbing while paused.
> - **Why:** The previous implementation dispatched a corrective seek on every playhead update (~60 fps). At split points, the audio was already at the correct position but was being seeked back to `trimStart`, causing a brief stutter/repeat of the audio at exactly the split moment. Removing the continuous drift-correction seek eliminates both glitches.
> - **Files:**
>   - `src/app/video-maker/_components/Preview.tsx`

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
