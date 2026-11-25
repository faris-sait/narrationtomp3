---
# NarrateToMP3 — text narration to MP3, browser-based

## Goal and users
A browser app where a user pastes a narration script, picks a free male or female
voice, and gets an MP3 they can play and download. Everything free: the TTS
provider is Microsoft Edge's read-aloud service (no API key, real neural voices,
MP3 out) via the `msedge-tts` npm package. Working = paste → generate → play →
download, with a history of past narrations.

## Scope
In scope (Phase 1): paste script, voice picker (male/female, several accents),
single MP3 per script, history stored in Postgres, audio streaming + download.
Out of scope for now: user accounts/auth, per-paragraph splitting, paid TTS
providers, SSML control, file uploads (docx/pdf).

## Architecture
- **Next.js (App Router, TypeScript)** — one codebase for UI + API routes; deploys to Vercel as-is.
- **TTS provider** — `msedge-tts`: voices like en-US-GuyNeural (male), en-US-JennyNeural (female), en-GB, en-IN, en-AU variants. Long scripts chunked; Edge TTS returns MP3 chunks which are concatenated (MPEG frames concatenate safely).
- **DB** — Postgres + Drizzle ORM. Local dev: local Postgres. Production: Neon free tier via `DATABASE_URL`. Narrations store script text, voice, and MP3 bytes (bytea) so history can re-play/re-download without regenerating.
- **Routes**
  - `GET /api/voices` — voice catalogue (id, name, gender, accent).
  - `POST /api/narrations` — {script, voiceId} → generates MP3, stores row, returns narration metadata.
  - `GET /api/narrations?limit&cursor` — history list (metadata only).
  - `GET /api/narrations/[id]/audio` — streams MP3 (`audio/mpeg`), supports `?download=1` (attachment).
  - `DELETE /api/narrations/[id]` — remove from history.
- **Validation** — zod at the boundary; script 1–100,000 chars, voiceId from the catalogue; structured errors `{error:{code,message}}`.
- **Secrets** — only `DATABASE_URL` (Vault/`env`). No other keys needed.

## Risks and assumptions
- Edge TTS is an unofficial free endpoint; if it blocks a datacenter IP the provider module is isolated so a fallback provider can be added behind the same interface.
- MP3 stored as bytea keeps history replay simple; if rows grow large, Phase 2 can move audio to blob storage.

## Phases
## Phase 1: Working converter
Ship the end-to-end converter: schema + migration, provider, API routes, UI, tests.
- [x] Scaffold Next.js app (App Router, TypeScript)
- [x] Drizzle schema + migration — narrations table (script, voice, mp3 bytea) on Postgres
- [x] Edge TTS provider — male/female voice catalogue, script chunking, MP3 out
- [x] API routes — voices, narrations CRUD, audio stream/download
- [x] UI — paste script, male/female voice picker, play + download, history
- [x] API tests against local Postgres + curl check
Acceptance: user opens the app, pastes a script, picks a voice, plays and downloads an MP3, and sees it in history.

## Phase 2: Polish and scale (done 2026-11-25)
- [x] Move audio to object storage (Vercel Blob free tier) instead of bytea — `lib/storage.ts`: MP3s upload to Blob when `BLOB_READ_WRITE_TOKEN` is set; without it (local dev) bytes fall back to the now-nullable `narrations.audio` column. Audio route redirects to the CDN blob URL; delete removes the blob. Migration `drizzle/0001_*.sql` adds `audio_url`.
- [x] Voice preview clips (short sample per voice) — `GET /api/voices/[id]/preview` synthesizes a fixed sample sentence once per voice per process and caches the MP3; ▶ button beside the voice select plays it.
- [x] Rate limiting + queue for very long scripts — `lib/ratelimit.ts` sliding window (6/min/IP, `RATE_LIMIT_PER_MINUTE`) returns 429 + Retry-After; `lib/queue.ts` caps concurrent TTS synthesis (2, `TTS_MAX_CONCURRENT`, waiting queue 20) and returns 503 `queue_busy` when full. Both are in-memory, per-instance (fine for the free tier).
Acceptance: history with hundreds of narrations stays fast (bytea no longer stored for new items once Blob is on); long scripts don't time out serverless functions (`maxDuration = 60` on the create route; queue sheds load with 503 instead of piling up).