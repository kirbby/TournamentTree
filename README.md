# TournamentTree

TournamentTree is an offline-first double-elimination tournament manager for 2–32 players. One organizer manages tournaments from an installable browser app; spectators use public read-only bracket links; external LLMs and automations use a scoped JSON API.

The frontend is plain JavaScript built by Vite and can be uploaded as the contents of `dist/` to any HTTPS static host, including FTP hosting. Supabase provides Auth, durable snapshots, audit events, Realtime updates, and the Edge Function API.

## Features

- Draft, active, completed, and archived tournament lifecycle.
- Partial seeding, reproducible unseeded shuffling, bracket preview, and byes.
- Winners bracket, losers bracket, Grand Final 1, and conditional Grand Final 2.
- Optional fair last-place event: one automatic loser, one match for two candidates, round robin for three, and complete mirrored double elimination for four or more.
- Winner-only results or optional paired integer scores.
- Confirmed rollback of downstream results when correcting an earlier match.
- Public current tournaments, archive, bracket, champion, and standings.
- Local IndexedDB snapshots, persistent operation queue, PWA asset cache, and JSON export.
- Venue-wins conflict policy when offline edits and cloud edits overlap.
- Scoped `tt_live_...` API tokens for AI tools; no service-role credentials leave Supabase.

## Local development

Requirements: Node.js 20+, pnpm 10+, and optionally the Supabase CLI/Docker for local backend work.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Without environment values, the public app loads and the local UI shell works, but cloud login and synchronization are disabled.

Run the complete local verification path:

```bash
pnpm check
```

## Configuration

The static frontend needs only public Supabase values:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Never place a secret/service-role key in a Vite variable. See [configuration](docs/configuration.md) for backend, administrator, AI token, and FTP settings.

## Deployment

- `scripts/deploy-supabase.sh` applies migrations and deploys the Edge Function.
- `scripts/deploy-static.sh` verifies, builds, and mirrors `dist/` to an FTP/FTPS/SFTP host using `lftp`.
- Hash routes require no web-server rewrite rules.
- PWA installation and service workers require HTTPS in production.

See [operations](docs/operations.md) for provisioning, smoke tests, offline venue procedure, backup, and recovery.

## API

The deployed base URL is:

```text
https://PROJECT_REF.supabase.co/functions/v1/tournament-api/v1
```

The live OpenAPI 3.1 document is available at `${API_BASE}/openapi.yaml` (for example, `https://PROJECT_REF.supabase.co/functions/v1/tournament-api/v1/openapi.yaml`). Give an external AI this URL, the [AI API guide](docs/AI_API_GUIDE.md), and a scoped token created in the admin UI. Do not give it a Supabase secret key.

## Repository map

- `src/` — routes, UI, API client, IndexedDB, and synchronization.
- `supabase/functions/_shared/` — canonical tournament engine.
- `supabase/functions/tournament-api/` — JSON API.
- `supabase/migrations/` — database schema, RLS, and atomic mutation functions.
- `tests/` — engine and offline persistence tests.
- `docs/` — architecture, configuration, operations, OpenAPI, and AI usage.
- `public/` — locally served PWA assets.

Version: `0.2.2`.
