# TournamentTree Repository Instructions

## Stack

- Vite is build tooling only; the browser application uses plain JavaScript modules and native DOM APIs.
- Tailwind may be used for layout utilities. App colors must come from the semantic tokens in `src/styles/theme.css`.
- Use the shared semantic icon helper in `src/icons.js` for common actions.
- Supabase migrations and Edge Functions live under `supabase/`.
- The shared bracket engine is `supabase/functions/_shared/tournament-engine.js`; frontend and API mutations must go through it.
- The deployable FTP artifact is `dist/` only.

## Workflow

For every code change:

1. Update tests with the behavior.
2. Bump `VERSION` and `package.json` according to semantic versioning. Documentation-only changes do not require a bump.
3. Add the user-visible change to `CHANGELOG.md`.
4. Run `pnpm check`.
5. Inspect `git diff` and confirm no secret or unrelated change is included.
6. Commit the complete change with a concise imperative message.
7. Push the current branch to its configured upstream.

Use patch versions for fixes and internal improvements, minor versions for new user-visible functionality, and major versions only when explicitly requested.

## Safety

- Never commit `.env.local`, database passwords, service-role keys, secret Supabase keys, FTP passwords, or plaintext API tokens.
- The browser receives only the Supabase URL and publishable key.
- External automation receives a scoped `tt_live_...` token, never a Supabase secret/service-role key.
- Do not expose permanent deletion in the UI or API.
- Preserve offline IndexedDB data and queued operations when changing storage code; add migration tests when the schema changes.

## Verification

- `pnpm test` runs engine and offline-state tests.
- `pnpm build` creates the static PWA artifact.
- `pnpm check` validates version consistency, tests, and production build.
- Before a release, also run the browser smoke flow described in `docs/operations.md` and validate the deployed Edge Function health endpoint.

Shared repository conventions are documented in `PROJECT_SCAFFOLDING.md`, `THEME.md`, and `ICONS.md`.
