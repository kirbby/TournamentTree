# Architecture

## System boundaries

TournamentTree has three deployable/runtime parts:

1. A static Vite PWA running in the organizer or spectator browser.
2. A Supabase Postgres database with Auth, RLS, and Realtime.
3. The `tournament-api` Supabase Edge Function.

The browser bundle contains no privileged credential. Public viewers can read published rows under RLS. Every mutation goes through the Edge Function, which authenticates either the single administrator session or a scoped API token.

## State model

Each `tournaments` row stores one complete versioned state snapshot in `state jsonb`, alongside indexed lifecycle columns and an optimistic `revision`. At 32 players the snapshot is small, and atomic replacement keeps cloud mutations and offline reconciliation understandable.

`tournament_events` records idempotency UUIDs, resulting revisions, actions, actors, and conflict supersession. `api_tokens` stores only SHA-256 token hashes. `app_admins` is constrained to one row.

The canonical mutation boundary is `supabase/functions/_shared/tournament-engine.js`. The browser applies it locally before queueing an operation. The Edge Function applies the same operation before committing an incremented cloud snapshot. Neither UI code nor route code edits bracket entities directly.

## Offline flow

The PWA precaches all bundled assets. IndexedDB stores tournament records, pending operations, and metadata. A mutation is applied locally first and queued with a UUID, so refreshes and network loss do not discard it.

On reconnect:

- With no pending operation, a newer cloud revision replaces the cache.
- With pending operations and an unchanged cloud revision, operations replay in order with their original idempotency UUIDs.
- With pending operations and a changed cloud revision, the authenticated venue device sends its validated full snapshot to the administrator-only force-sync endpoint. Intervening cloud events remain in history and are marked superseded.

An old cache without pending operations never overwrites cloud state. Multiple offline editing devices and LAN synchronization are deliberately unsupported.

## Brackets

`brackets-manager` 1.11.0 creates and propagates bracket entities; `brackets-viewer` 1.9.1 renders them. The wrapper owns partial seed placement, a safe bye topology, scoring rules, correction impact, result reset, and completion semantics. Grand Final 2 remains locked when the winners-bracket champion wins Grand Final 1 and activates only when the losers-bracket champion wins it.

Drafts choose either standard placement or the fair last-place event. In fair mode, a real main-bracket win makes a player safe; byes do not count. Players eliminated with no real wins become candidates once every zero-win path is resolved. One candidate is last automatically, two play once, three complete a round robin with shared last place allowed, and four or more play mirrored double elimination. In the mirrored bracket the actual loser propagates, two actual wins make a player safe, and the Grand Loser Final has the same conditional reset shape as the championship.

Championship and last-place completion are tracked independently. A fair-mode tournament reaches `completed` only after both the champion and last place (or tied last places) are known.

## Routes

Hash navigation works from an FTP-hosted subdirectory:

- `#/` — public current tournaments and archive.
- `#/t/{slug}` — public bracket and standings.
- `#/admin` — login, tournament list, and API tokens.
- `#/admin/t/{id}` — draft and tournament management.
