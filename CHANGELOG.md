# Changelog

All notable changes are documented here. Versions follow semantic versioning.

## 0.2.2 - 2026-08-16

- Limited save notifications to one visible toast at a time.
- Kept the player-name field focused after pressing Enter so organizers can add players continuously.

## 0.2.1 - 2026-08-16

- Fixed older offline drafts without a saved last-place setting to display their compatible standard-placement mode correctly.

## 0.2.0 - 2026-08-16

- Added draft selection between fair last-place playoffs and standard placement.
- Added automatic zero-win candidate detection that ignores byes.
- Added the one-candidate, single-match, three-player round-robin, and complete mirrored double-elimination loser formats.
- Added a Grand Loser Final with conditional reset, shared round-robin last places, public/admin displays, offline mutations, and external API endpoints.

## 0.1.3 - 2026-08-16

- Added a public API endpoint for downloading the OpenAPI 3.1 specification.

## 0.1.2 - 2026-08-16

- Fixed administrator password login by enabling the email Auth provider while keeping public signup disabled.

## 0.1.1 - 2026-08-16

- Fixed Supabase Edge Function deployment to pass the shared Deno import map to the remote bundler.

## 0.1.0 - 2026-08-16

- Rebuilt TournamentTree as a vanilla-JavaScript offline-first PWA.
- Added 2–32 player double-elimination brackets with conditional grand-final reset.
- Added draft roster management, partial seeding, scores, corrections, standings, archive, and JSON backup.
- Added IndexedDB operation queues and venue-wins reconnection handling.
- Added Supabase schema, RLS, Realtime, Edge Function API, scoped automation tokens, and audit history.
- Added FTP and Supabase deployment workflows plus OpenAPI and operator documentation.
