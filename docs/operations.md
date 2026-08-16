# Operations

## First deployment

1. Create/link the Supabase project in Frankfurt (`eu-central-1`).
2. Run `SUPABASE_PROJECT_REF=... scripts/deploy-supabase.sh`.
3. Disable public Auth signup in the hosted project and provision exactly one administrator as described in `configuration.md`.
4. Put the project URL and publishable key in `.env.local`.
5. Run `pnpm check`.
6. Deploy `dist/` with `scripts/deploy-static.sh` or upload its contents manually over FTP.
7. Open the HTTPS URL, sign in, create a test tournament, and install the PWA on the designated venue device.

## Release smoke test

- Public home loads without authentication.
- Administrator can create a draft, add players, reroll, and start it.
- Entering a result advances both winner and loser correctly.
- A `tt_live_...` token can read state and enter a different result through the API.
- Public bracket refreshes after a cloud revision changes.
- With the browser offline, enter a result and reload; the state and pending count remain.
- Reconnect and verify the queued operation is applied once.
- Exercise Grand Final 1 both ways and confirm Grand Final 2 is conditional.
- Enable fair last-place mode and confirm zero-win candidates ignore byes.
- Exercise the one-player, two-player, three-player tie, and mirrored double-elimination loser formats; confirm the Grand Loser Final reset is conditional.

## Venue procedure

Before the event:

1. Sign in online on the one designated organizer device.
2. Open every tournament that may be needed so its snapshot is cached.
3. Confirm the connection bar says online and no pending changes remain.
4. Use **Export JSON** and keep the file outside the browser profile.
5. Test offline mode before leaving reliable internet.

During an outage, continue on that same device. Every accepted action is saved to IndexedDB before synchronization. Do not clear site data, use private browsing, or switch organizer devices.

After reconnection, leave the app open until pending changes reach zero. If cloud automation changed the same tournament while venue operations were pending, the venue snapshot wins; superseded cloud events remain in the audit history.

## Backup and recovery

JSON export is the manual venue backup. Clearing browser data destroys local snapshots and pending operations. The current UI intentionally supports export only; importing a snapshot is an operator recovery action and should be validated and applied through an administrator-controlled procedure.

Database backups and point-in-time recovery depend on the selected Supabase plan. Archive tournaments instead of deleting them.

## Troubleshooting

- **App works online but not offline:** load it once after deployment so the service worker caches the current assets; confirm production uses HTTPS.
- **Login unavailable offline:** the device must have completed one successful online login and retained its browser storage.
- **Changes remain pending:** restore connectivity and a valid admin session, then reopen the tournament. A revision conflict triggers the venue-wins flow only when local operations exist.
- **Public viewers see stale state:** verify Realtime publication and the 30-second polling fallback, then check the API health endpoint.
- **FTP subdirectory is blank:** upload the contents of `dist/`, not the directory itself; the Vite build uses relative asset paths and hash routes.
