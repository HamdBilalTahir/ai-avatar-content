# Risks & Dependencies

## Security Risks

### Critical

#### 1. Conditional Auth Bypass (CRON_SECRET)

- **File:** `src/app/api/pipeline/scrape/route.ts`
- **Issue:** If `CRON_SECRET` env var is unset, the auth condition short-circuits and the route is publicly accessible. All cron-protected routes share this pattern.
- **Fix:** Treat missing `CRON_SECRET` as a hard failure — return 401 if env var is not set.

#### 2. Unauthenticated Mutation Routes (18 routes)

No user auth check before hitting expensive AI APIs — any caller can trigger them.

- `src/app/api/upload/route.ts`
- `src/app/api/images/route.ts`
- `src/app/api/pipeline/create/route.ts`
- `src/app/api/avatar/generate/route.ts`
- `src/app/api/script/generate/route.ts`
- `src/app/api/video-maker/upload/route.ts`
- `src/app/api/script/generate-video/evolink/route.ts`
- `src/app/api/script/generate-video/image-direct/route.ts`
- `src/app/api/script/generate-video/image-refs/route.ts`
- `src/app/api/script/generate-video/text/route.ts`
- `src/app/api/script/generate-video/vertex/image-direct/route.ts`
- `src/app/api/script/generate-video/vertex/image-refs/route.ts`
- `src/app/api/script/generate-video/vertex/text/route.ts`
- `src/app/api/script/extend-video/gemini/route.ts`
- `src/app/api/script/extend-video/vertex/route.ts`
- `src/app/api/pipeline/generate-ideas/route.ts`
- `src/app/api/pipeline/generate-scripts/route.ts`
- `src/app/api/pipeline/assign-images/route.ts`

#### 3. Path Traversal Risk

- **File:** `src/app/api/video-maker/upload/route.ts:24`
- **Issue:** `projectId` from user input is used directly in `path.join()` without format validation. Should be restricted to UUID or alphanumeric format.

### Moderate

#### 4. Fire-and-Forget Fetch Chains

- **Files:** `src/app/api/pipeline/scrape/route.ts:178`, `src/app/api/pipeline/generate-ideas/route.ts:148`
- **Issue:** Downstream API calls are not awaited and failures are silently swallowed after the response has already been sent.

#### 5. Hardcoded Absolute Path in Debug Script

- **File:** `check-firestore.ts:6`
- **Issue:** Contains a hardcoded absolute path to a Firebase service account JSON on a local machine. This file should not be in the repo.

### Low

#### 6. Swallowed Cleanup Errors

- **File:** `src/app/api/video-maker/export/route.ts:331`
- **Issue:** `unlink(f).catch(() => {})` silently hides real I/O failures during temp file cleanup.

---

## Stale / Dead Files

These files exist in the repo root and appear to be unused dev artifacts:

| File                 | Notes                                                  |
| -------------------- | ------------------------------------------------------ |
| `check-firestore.ts` | Debug script with hardcoded local path (security risk) |
| `test-selection.ts`  | Experiment/test script, unused                         |
| `update_wizard.ts`   | Incomplete migration script, unused                    |
| `new_layout.tsx`     | 77KB abandoned component, unused                       |

---

## External Dependencies at Risk

| Dependency                    | Risk                                                                       |
| ----------------------------- | -------------------------------------------------------------------------- |
| **Google Vertex AI / Gemini** | Core video/image generation — no fallback if quota exceeded or API changes |
| **Cartesia**                  | TTS audio generation — single provider, no fallback                        |
| **Firebase / Firestore**      | Primary database and auth — full dependency, no abstraction layer          |
| **Redis (Upstash)**           | Job queue — pipeline fails entirely if unavailable                         |
| **Telegram Bot API**          | Notifications — fire-and-forget, failures are silent                       |
| **SkyReels**                  | Video generation provider — API stability unknown                          |

---

## Environment Variable Dependencies

Missing or misconfigured env vars can cause silent failures or security bypasses:

| Variable                                        | Impact if Missing                                    |
| ----------------------------------------------- | ---------------------------------------------------- |
| `CRON_SECRET`                                   | All cron-protected routes become publicly accessible |
| `FIREBASE_*` / `GOOGLE_APPLICATION_CREDENTIALS` | Auth and database unavailable                        |
| `VERTEX_AI_*`                                   | Video generation unavailable                         |
| `CARTESIA_API_KEY`                              | Audio generation unavailable                         |
| `UPSTASH_REDIS_*`                               | Job queue unavailable                                |
| `TELEGRAM_BOT_TOKEN`                            | Notifications fail silently                          |
