# Changelog

All notable changes are documented here. Versions follow semantic versioning.

## 0.1.1 - 2026-08-16

- Fixed Supabase Edge Function deployment to pass the shared Deno import map to the remote bundler.

## 0.1.0 - 2026-08-16

- Rebuilt TournamentTree as a vanilla-JavaScript offline-first PWA.
- Added 2–32 player double-elimination brackets with conditional grand-final reset.
- Added draft roster management, partial seeding, scores, corrections, standings, archive, and JSON backup.
- Added IndexedDB operation queues and venue-wins reconnection handling.
- Added Supabase schema, RLS, Realtime, Edge Function API, scoped automation tokens, and audit history.
- Added FTP and Supabase deployment workflows plus OpenAPI and operator documentation.
