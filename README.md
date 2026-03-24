# AI Avatar Content

Generate short AI-presented videos end-to-end from a text topic. Describe an avatar, approve the generated face, provide a topic, and the system produces a lip-synced video — automatically.

---

## How It Works

1. **Describe your avatar** — Write a prompt describing the presenter (age, style, expression). Gemini generates a photorealistic face.
2. **Approve your avatar** — Regenerate as many times as you like until you're happy.
3. **Enter your topic** — One sentence describing what the video is about.
4. **Generate** — The pipeline runs automatically:
   - Gemini writes the script
   - Cartesia synthesises the voiceover
   - Sync.so lip-syncs the avatar to the audio
5. **Watch your video** — The finished video appears on the status page when ready.

---

## Tech Stack

| Layer          | Technology                                       |
| -------------- | ------------------------------------------------ |
| Framework      | Next.js 16 (App Router) + React 19               |
| Language       | TypeScript (strict)                              |
| Styling        | Tailwind CSS v4                                  |
| Job State      | Upstash Redis                                    |
| Avatar Image   | Google Gemini (`gemini-3.1-flash-image-preview`) |
| Script         | Google Gemini via LangChain                      |
| Text-to-Speech | Cartesia                                         |
| Lip Sync       | Sync.so                                          |

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

Open `.env` and fill in your credentials:

```bash
UPSTASH_REDIS_REST_URL=       # From Upstash console
UPSTASH_REDIS_REST_TOKEN=     # From Upstash console
GEMINI_API_KEY= # From Google AI Studio
CARTESIA_API_KEY=             # From Cartesia dashboard
SYNCSO_API_KEY=               # From Sync.so dashboard
NEXT_PUBLIC_APP_URL=http://localhost:3000
STORAGE_PATH=./storage
```

### 3. Run the dev server

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll land on the avatar creation page.

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Home → redirects to /avatar/new
│   ├── avatar/new/page.tsx         # Avatar creation + pipeline start
│   ├── pipeline/[id]/page.tsx      # Status polling + video output
│   └── api/
│       ├── avatar/generate/        # POST — Gemini avatar image
│       ├── pipeline/create/        # POST — Start pipeline job
│       ├── pipeline/[id]/          # GET  — Job status
│       ├── storage/[id]/video/     # GET  — Serve video file
│       └── webhooks/syncso/        # POST — Sync.so callback
├── lib/
│   ├── types.ts                    # Shared TypeScript interfaces
│   ├── redis.ts                    # Upstash Redis singleton
│   └── jobs.ts                     # Job CRUD utilities
└── services/
    ├── gemini-image.ts             # Avatar generation
    ├── gemini-script.ts            # Script generation
    ├── cartesia.ts                 # TTS
    └── syncso.ts                   # Lip sync submission
```

---

## Scripts

```bash
yarn dev        # Development server
yarn build      # Production build
yarn typecheck  # TypeScript check
yarn test       # Jest test suite
yarn lint       # ESLint
```

---

## Architecture

See [Architecture.md](Architecture.md) for a full deep-dive: data flow diagrams, Redis key patterns, API contracts, pipeline state machine, and component breakdown.
