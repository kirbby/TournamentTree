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

<!-- kirbbyScaffold:git-workflow:start -->
## Commit, cloud sync, and CI policy

This is the owner's shared policy from kirbbyScaffold. It supersedes older
commit/push cadence instructions, including per-subtask commit rules. Preserve
project-specific validation, branch, deployment, and security requirements.

1. **One commit per prompt per repository.** When a user prompt changes files,
   finish the authorized work and required checks, then create exactly one commit
   containing that prompt's changes, related tests/docs, and version updates.
   Do not commit intermediate edits. Research-only prompts need no empty commit.
   A prompt spanning repositories gets one commit in each changed repository.
2. **Push at the completed-prompt boundary.** Push that commit once to the
   current branch's configured upstream before handing back, so another PC can
   resume. Do not push after every edit or tool call. Push before an explicit
   handoff or machine switch. Follow explicit requests to keep work local.
   Never leave completed commits local merely to reduce CI usage.
3. **Preserve work and history.** Inspect status and fetch before editing when
   possible; fast-forward only when safe. Do not overwrite unrelated edits,
   commit another task's files, force-push, or silently change branches. If a
   push is blocked, report the local commit and exact blocker. Do not claim cloud
   sync succeeded. Stop or handoff requests take priority over finishing checks;
   label unfinished work and sync it only when requested, without claiming done.
4. **Separate backups from expensive CI.** Prefer normal working-branch pushes
   without an open PR during rapid iteration. For GitHub Actions, the recommended
   full-CI boundaries are non-draft PR updates, pushes to the default/release
   branches, release tags, and manual dispatch. Draft PRs may defer expensive
   jobs, but becoming ready must run them. Use per-branch/PR concurrency to cancel
   obsolete validation runs. Keep required checks on the latest review/release
   commit; local checks still run before completion.
5. **Adapt CI deliberately.** Inspect existing workflows, required checks, and
   deployment triggers before changing them. Avoid duplicate push + PR runs for
   the same branch. Do not cancel deployments with the validation concurrency
   group. Preserve security, release, merge-queue, and project-specific gates.
   Existing workflows are not changed merely by syncing this policy. Until they
   are adapted, completed-prompt pushes may still trigger CI.
6. **No routine CI bypass.** Do not add `[skip ci]`, disable required checks, or
   rewrite history just to save runs. Commit-message skips can leave required
   GitHub checks pending and block merging. If working directly on the default
   branch or updating a ready PR, expect CI on each completed-prompt push; use a
   working branch for iteration when the task permits it.

Policy-only documentation changes do not require an application version bump or
build. Verify the diff and shared-policy sync instead. Code changes still follow
the project's normal versioning, test, and production-build requirements.
<!-- kirbbyScaffold:git-workflow:end -->
