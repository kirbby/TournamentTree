# Project Scaffolding Instructions

Use this file as the default instruction set when creating a new web project or
repo. Prefer these choices unless the project has a clear reason to do
something else.

## Default Stack

- Use a small, boring stack with minimal runtime magic.
- For browser-first web apps, use Vite with plain JavaScript modules.
- Use TypeScript only where it buys real safety, especially Node services,
shared contracts, or larger non-trivial app logic.
- Avoid a frontend framework
- For backend services, use Go
- Prefer SQLite or file-backed JSON for local-first projects before adding a
network database.
- Keep external services optional and configured through environment variables
or config files, never hard-coded secrets.

## Frontend Defaults

- Use Vite for standalone browser UIs.
- Use plain JavaScript by default: `src/main.js`, browser `fetch`, native
  forms, native dialogs where appropriate, and small local modules.
- Keep CSS in normal `.css` files. Use CSS custom properties for theme tokens.
- Include a root `THEME.md` and implement it through one global theme file,
  usually `src/styles/theme.css`.
- Component CSS should use semantic theme tokens from `THEME.md` instead of raw
  hex colors.
- Use the shared icon map from `src/icons.js` for common actions so Kirbby apps
  use the same pictograms and names.
- For browser apps, prefer the shared Lucide-derived SVG helper instead of
  one-off inline SVG. The default common actions are `refresh`, `save`,
  `delete`, `close`, `favorite`, `navMenu`, `sidebarCollapse`,
  `sidebarUncollapse`, `add`, `search`, `archive`, and `settings`.
- Keep `src/icons.js` and viewable files in `src/icons/` synced from
  `kirbbyScaffold`; do not edit generated icon outputs by hand.
- Do not add Tailwind, React, Vue, Svelte, or a component library unless the
  project clearly benefits from it.
- Prefer server APIs that return simple JSON DTOs.
- Every app should have a `GET /health` endpoint and an obvious status endpoint
  when there is background work or a child process.
- For operational tools, make the first screen the actual tool, not a landing
  page.
- Use restrained, dense layouts for admin or operations UIs. Avoid marketing
  hero sections unless the project is actually a public website.
- Use real buttons, labels, forms, semantic HTML, accessible names, and visible
  focus states.
- Keep UI text short and task-oriented. Do not include in-app explanations of
  implementation details.

## Backend Defaults

- Prefer a single app binary or single service entry point.
- Provide CLI commands for at least:
  - `version`
  - `config print` or equivalent
  - `status`
  - `daemon` or `serve`
  - `help`
- Keep config in a predictable runtime root, usually:

```text
/srv/<app>/config/config.json
```

- Allow override with an environment variable such as `<APP>_CONFIG`.
- Keep runtime paths under `/srv/<app>`:

```text
/srv/<app>/config
/srv/<app>/data
/srv/<app>/logs
/srv/<app>/run
/srv/<app>/state
```

- Bind local HTTP servers to `127.0.0.1` by default for development. For LAN
  appliance-style deployments, explicitly set `0.0.0.0:<port>` during deploy.
- Use structured config normalization so missing fields get safe defaults.
- Do not require network services for local development unless they are the
  actual product.

## Versioning

- Keep a root `VERSION` file.
- For compiled apps, expose version and commit in the binary.
- Read `VERSION` during builds and inject it through linker flags or build-time
  constants.
- Keep hard-coded fallback versions and tests in sync with `VERSION`.
- Use semantic versioning:
  - Patch: fixes, tests, small internal changes.
  - Minor: new user-visible features or substantial behavior.
  - Major: only when explicitly requested.
- Documentation-only changes do not require a version bump.

## Testing And Build Commands

Every repo should have one obvious local verification path.

For Go:

```bash
go test ./...
go build ./cmd/<app>
```

For Vite:

```bash
npm ci
npm test
npm run build
```

For Node TypeScript services:

```bash
npm ci
npm test
npm run build
```

Recommended `Makefile` targets for Go services and larger projects:

```make
.PHONY: build test run deploy

build:
	<project build command>

test:
	<project test command>

run:
	<local run command>

deploy:
	scripts/deploy.sh
```

Agents must run the relevant test and build commands before finishing code
changes.

## Deployment Pattern

Use Bash deploy scripts for Raspberry Pi or small Linux host deployments. The
script should be safe to rerun.

- If there is only one deploy path, use `scripts/deploy.sh`.
- If there are multiple deploy paths, use clear names such as
  `scripts/deploy-static.sh`, `scripts/deploy-api.sh`, or
  `scripts/deploy-worker.sh`.

Required local phase:

- Start with `#!/usr/bin/env bash` and `set -euo pipefail`.
- Define overrideable defaults for remote host, service name, service user,
  remote root, local artifact path, service file path, temp paths, and health
  URL.
- Read `VERSION`.
- Read the current git commit with `git rev-parse --short HEAD`.
- Append `-dirty` to commit metadata when the worktree is dirty.
- Run local tests before touching the remote host.
- Build the deploy artifact locally.
- Package static assets or sidecar packages into tarballs when needed.
- On macOS, disable AppleDouble/xattr metadata when creating tar archives, for
  example `COPYFILE_DISABLE=1 tar --format=ustar ...`, so Linux hosts do not
  warn about `LIBARCHIVE.xattr.com.apple.provenance`.
- Do not leave runtime-critical files such as migrations, templates, or default
  config dependent on the source checkout path. Embed them in the binary, or
  install them under the runtime root with explicit permissions.
- Use `mktemp` for temporary local scripts and archives.
- Register a cleanup trap.

Use SSH connection reuse:

```bash
REMOTE_HOST="${REMOTE_HOST:-192.168.1.10}"
REMOTE="${REMOTE_HOST}"
SSH_CONTROL_DIR="$(mktemp -d /tmp/<app>-ssh.XXXXXX)"
SSH_CONTROL_PATH="${SSH_CONTROL_DIR}/c"
SSH_OPTS=(-o ControlMaster=auto -o ControlPath="${SSH_CONTROL_PATH}" -o ControlPersist=10m)
SSH_MASTER_OPTS=(-o ControlMaster=yes -o ControlPath="${SSH_CONTROL_PATH}" -o ControlPersist=10m)

ssh "${SSH_MASTER_OPTS[@]}" -fN "${REMOTE}"
```

`REMOTE_HOST` should default to the target IP address or local SSH host alias.
Do not hard-code an SSH user in scaffolded deploy scripts. If a user is needed,
put it in local SSH config for the host alias or override `REMOTE_HOST` with a
full SSH destination when running the deploy.

Run the remote installer with a TTY so `sudo -v` can prompt when the remote host
requires a password:

```bash
ssh "${SSH_OPTS[@]}" -tt "${REMOTE}" "sudo -v"
scp "${SSH_OPTS[@]}" "${LOCAL_REMOTE_SCRIPT}" "${REMOTE}:${REMOTE_SCRIPT}"
ssh "${SSH_OPTS[@]}" -tt "${REMOTE}" \
  "APP_NAME='${APP_NAME}' SERVICE_NAME='${SERVICE_NAME}' bash '${REMOTE_SCRIPT}'"
```

Required remote phase:

- Copy artifacts to `/tmp` first.
- Copy a generated remote runner script to `/tmp/<app>-deploy.sh`.
- Before copying artifacts, run `ssh -tt ... "sudo -v"` so sudo problems fail
  early and password prompts have a terminal.
- Run the remote runner with `ssh -tt` and required values passed as
  environment variables.
- In the remote runner, call `sudo -v` before doing work.
- Check required commands such as `curl`, `tar`, and `systemctl`.
- Create a system service user idempotently.
- Create runtime directories under `/srv/<app>`.
- Set ownership to the service user.
- Restrict sensitive directories with `chmod 0700` or `0750`.
- Install binaries, static assets, or sidecar runtime files with `sudo install`
  or tar archives as appropriate.
- Install the systemd unit to `/etc/systemd/system/<app>.service`.
- Run `systemctl daemon-reload`, `enable`, and `restart`.
- Smoke check the running service with HTTP health and status endpoints.
- For SQLite-backed services, do not start a second post-restart CLI smoke check
  that opens the same database. Prefer the running service's HTTP status
  endpoint, or run the CLI before restart while the service is stopped.
- Configure SQLite connections with a busy timeout, and prefer WAL mode when the
  app may open the database from more than one process.
- Run CLI smoke checks that need restricted config or data as the systemd
  service user, for example `sudo -u "${SERVICE_USER}" env CONFIG=... app
  status`.
- Print `systemctl status` and recent `journalctl` output.
- Remove temporary remote files.

Use this smoke check shape:

```bash
curl --fail --show-error --retry 15 --retry-delay 1 --retry-connrefused http://127.0.0.1:<port>/health
systemctl status "${SERVICE_NAME}" --no-pager
journalctl -u "${SERVICE_NAME}" -n 50 --no-pager
```

For static web UIs, smoke check the served UI path, usually `/`, and also check
`/health` when the app owns or proxies a backend health endpoint that is expected
to be available during deploy.

## Systemd Service Defaults

For service apps, create `packaging/systemd/<app>.service`:

```ini
[Unit]
Description=<App> daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=<app>
Group=<app>
Environment=<APP>_CONFIG=/srv/<app>/config/config.json
Environment=HOME=/srv/<app>
Environment=PATH=/srv/<app>/bin:/usr/local/bin:/usr/bin:/bin
EnvironmentFile=-/srv/<app>/config/<app>.env
ExecStart=/usr/local/bin/<app> daemon
Restart=on-failure
RestartSec=5
WorkingDirectory=/srv/<app>

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/srv/<app>

[Install]
WantedBy=multi-user.target
```

Only relax hardening when the app genuinely needs it.

For static frontend apps, the systemd unit may instead run a small static file
server or reverse proxy. Keep the same hardening defaults, but set app-specific
environment values such as:

```ini
Environment=<APP>_PORT=<port>
Environment=<APP>_STATIC_DIR=/srv/<app>/current
Environment=<APP>_API_BASE_URL=http://127.0.0.1:<api-port>
EnvironmentFile=-/srv/<app>/config/<app>.env
ExecStart=<static-server-command>
WorkingDirectory=/srv/<app>
```

## Agent Workflow

Each repo should include an `AGENTS.md` with:

```markdown
# Agent Workflow

Before considering work finished:

- For code changes, bump `VERSION` according to semantic versioning.
- For code changes, keep hard-coded fallback version references and tests in sync.
- For code changes, run the project tests and build.
- Commit the completed change.
- Push the commit.

Version bump policy:

- Major bumps happen only when the user explicitly asks for a major version bump.
- Minor bumps are for big new features or substantial user-visible behavior.
- Patch bumps are for fixes, tests, and small internal code changes.
- Documentation-only changes do not require a version bump or build.
```

## Starter Files To Include

Add these to every new project unless there is a reason not to:

- `README.md` with purpose, local setup, commands, config, deploy, and runtime
  paths.
- `VERSION` starting at `0.1.0`.
- `THEME.md` with the shared theme palette, semantic CSS tokens, component
  defaults, and implementation rules.
- `.gitignore` for build artifacts, local env files, coverage, and dependency
  directories.
- `.env.example` with placeholder environment variables and no secrets.
- `Makefile` with `build`, `test`, `run`, and `deploy` for Go services and
  larger projects.
- `scripts/deploy.sh`, or clearly named deploy scripts when the repo has
  multiple deploy targets.
- `packaging/systemd/<app>.service`.
- `docs/architecture.md` for important design choices in larger projects or
  projects that need durable design notes.
- `docs/operations.md` for deploy, logs, backups, restore, and smoke checks in
  larger projects or projects with meaningful operational complexity.
- `docs/configuration.md` for config fields and environment variables.
- Basic tests for config loading, version output, health endpoint, and one
  primary user flow.

## Operational Extras Worth Adding

For projects expected to run continuously, include:

- `GET /health` returning machine-readable health.
- `GET /api/status` or equivalent for richer diagnostics.
- A `status` CLI command.
- A `version` CLI command.
- A config print or validation command.
- Log locations documented in `README.md`.
- Backup and restore notes for persistent data.
- A migration story for config or file formats.
- Idempotent deploy scripts.
- Smoke checks that fail the deploy when the app is not usable.
- Clear separation between config, state, cache, logs, and source/artifacts.

## Avoid By Default

- Do not add Docker unless the project will actually be deployed with Docker.
- Do not add a database before file-backed state becomes insufficient.
- Do not add a frontend framework for simple dashboards, tools, or forms.
- Do not run production services through package managers when a built artifact
  or direct runtime command is available.
- Do not hard-code secrets, tokens, private hosts, or absolute user home paths.
- Do not leave deploy placeholders such as `<test-command>` in committed scripts.
