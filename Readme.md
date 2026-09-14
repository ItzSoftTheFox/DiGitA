# DiGitA

**A quieter workspace for better teamwork.**

DiGitA is a desktop workspace designed to make local Git activity visible before a push. The project combines repository awareness, early conflict warnings, and a shared ambient environment so developers can stay in sync while working in their own editors.

The interface follows a minimal black-and-white design with sharp edges, fine lines, geometric details, and subtle motion. It respects the system's reduced-motion preference.

## Project status

**Phases 1–3 complete: local Git workspace, accounts, and live collaboration.**

The desktop includes registration/login, a dashboard of teams and rooms, invitations, online presence, optional Git metadata sharing, and a live timeline. The local Git workspace remains available without signing in. The native application passes `cargo check`, builds, and displays its interface on Arch Linux with Wayland.

FastAPI provides accounts, team permissions, single-use invitations, and authenticated WebSocket rooms. PostgreSQL stores account/team data; active presence and the last 100 room events live in server memory. Validation includes 12 frontend tests, 32 backend tests on SQLite and PostgreSQL, and three browser tests, including two simultaneous clients.

The current application UI is in Czech. Conflict Radar and ambient audio remain planned.

## Current features

- Register and log in, optionally remembering the desktop session in the OS credential store.
- Create teams and rooms, invite colleagues, and switch rooms from the main dashboard.
- See online room members, their permitted Git metadata, and a live activity timeline.
- Enable sharing explicitly, with independent controls for branch names, file names, and commit messages.
- Reconnect after network interruptions and receive the room's current state.
- Select a local Git repository through a native directory picker and disconnect it at any time.
- View the current branch, latest commit, and changed files.
- Distinguish staged and unstaged changes, search paths, and filter the file list.
- Refresh manually or automatically two seconds after the previous read completes.
- Handle empty repositories, detached HEAD, linked worktrees, renames, and existing merge conflicts.
- Keep the last known snapshot visible during read errors and retry automatically.
- Explore an explicitly labeled browser demo without connecting a repository.

## Roadmap

### Desktop navigation

After login, the main dashboard lists the user's accessible rooms grouped by
team, with actions to create a room, create a team, accept an invitation, and enter
a room. Room creation follows team permissions. An empty dashboard offers
team creation or invitation acceptance.

The local Git overview is part of the selected room's workspace,
alongside members, activity, and later Conflict Radar and ambient audio. Users can
return to the dashboard to switch rooms. In this UX, a "server" means a team space;
selecting multiple backend hosts is a separate future feature.

| Phase | Focus                | Planned outcome                                                                                        | Status      |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------ | ----------- |
| 1     | Local prototype      | Desktop window, repository selection, Git overview, automatic refresh, and native validation           | Complete    |
| 2     | Backend and accounts | FastAPI service, database schema, registration, authentication, teams, and rooms                       | Complete    |
| 3     | Live collaboration   | WebSocket connection, online presence, shared Git metadata, and a project event timeline               | Complete    |
| 4     | Conflict Radar       | Detect overlapping file changes, update warnings, add notifications, and suppress duplicate alerts     | Planned     |
| 5     | Ambient rooms        | One licensed audio track, synchronized playback, individual volume, and reconnect recovery             | Planned     |
| 6     | Release readiness    | Broader automated testing, Docker Compose, CI, installers, documentation, and the first public release | Planned     |

Future ideas include GitHub/GitLab integrations, pull request and CI status, multiple ambient layers, editor plugins, and self-hosted servers.

### MVP target

Two users should be able to join the same room, connect separate working copies of the same repository, see each other's branch and local activity, receive warnings when they edit the same file, and listen to synchronized ambient audio. Each user must be able to disable file-name sharing.

Conflict Radar will indicate potential overlap; it will not guarantee that Git will produce a merge conflict or resolve conflicts automatically.

## Technology

| Area               | Technology                              | Status                                   |
| ------------------ | --------------------------------------- | ---------------------------------------- |
| Desktop shell      | Tauri 2 and Rust                        | Build and window startup verified on Arch Linux |
| Interface          | React, TypeScript, Vite, Lucide         | Implemented                              |
| Git integration    | Git CLI through a standalone Rust crate | Implemented; six Rust tests passed       |
| Frontend testing   | Vitest and Testing Library              | Implemented                              |
| Browser testing    | Playwright and Chromium                 | Implemented                              |
| Backend            | Python and FastAPI                      | Implemented; 32 tests passed on each database |
| Database           | PostgreSQL and Alembic                  | Implemented; migrations verified          |
| Realtime transport | WebSocket                               | Implemented; authenticated room connections |
| Local persistence  | SQLite                                  | Planned                                  |
| Infrastructure     | Docker Compose and GitHub Actions       | Local PostgreSQL Compose implemented; CI planned |

## Getting started

### Requirements

- Node.js 22 or newer and npm.
- Git installed and available on `PATH`.
- Rust and Cargo for the desktop application and Git tests.
- The [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system.

On Arch Linux, install the native dependencies with:

```sh
sudo pacman -S --needed rust webkit2gtk-4.1 base-devel librsvg openssl curl wget file xdotool libappindicator-gtk3
```

### Desktop application

From the project root:

```sh
npm ci
npm run tauri dev
```

Start the backend below for collaboration, then register or log in. Create a team
and room, enter it, and choose **Připojit repozitář** (Connect repository). Each
member selects their own working copy and confirms it belongs to the room before
enabling sharing. A room represents one logical project; remote URLs are not
automatically matched. Change the sharing checkboxes to permit individual fields.

For offline use, choose **Lokální režim** (Local mode) on the login screen.
Selecting a repository subdirectory also works. Edit a file in your usual editor
and the overview refreshes automatically. Changing rooms or repositories resets
sharing consent. Linux session persistence requires an unlocked Secret Service
keyring; leave **Zapamatovat přihlášení** unchecked to use an in-memory session.

### Browser preview

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:1420`. Login and rooms use the running backend. For the
static Git demo, choose **Lokální režim**, then **Prohlédnout ukázku** (View demo).
Access to a real local repository requires the desktop application. The eventual
public website will be a separate product page with download links.

Stop the standalone preview server before running `npm run tauri dev`; both use port 1420.

### Backend and accounts

With Python 3.12+, uv, and Docker Compose installed, run from the project root:

```sh
docker compose up -d --wait db
cd backend
uv sync --locked
cp .env.example .env
uv run alembic upgrade head
uv run uvicorn digita_api.main:create_app --factory --host 127.0.0.1 --port 8000 --no-proxy-headers --ws-max-size 65536
```

Open `http://127.0.0.1:8000/docs` to register, log in, create a team and room, and
invite a second account. See [backend setup and API workflow](backend/README.md)
for permissions, configuration, security choices, and PostgreSQL test instructions.
From `backend/`, run `uv run pytest -q` for the isolated SQLite test suite.

## Development and testing

```sh
# Run component and hook tests
npm test

# Check TypeScript and build the frontend
npm run build

# Test Git behavior using temporary repositories
npm run test:git

# Check the native desktop application
cargo check --manifest-path src-tauri/Cargo.toml

# Install the test browser and run browser tests
npx playwright install chromium
npm run test:e2e

# Format frontend files and configuration
npm run format
```

Run `uv sync --locked` in `backend/` before browser tests. Playwright starts an
isolated API with a temporary SQLite database on port 8001 and a frontend on 1421.
It tests the local demo and two accounts creating/joining a room, live metadata,
privacy changes, a changed commit, disconnect, and network recovery. Only native
Git reads and the picker are mocked in this browser scenario. Screenshots are in
the ignored `artifacts/` directory.

Rust dependency versions are recorded in `src-tauri/Cargo.lock` and `crates/git-presence/Cargo.lock` for reproducible application builds and Git tests.

### Native validation (2026-09-14)

Verified on Arch Linux with Wayland and WebKitGTK 2.52.6:

- `npm test`: 12 frontend tests passed.
- `npm run build`: TypeScript check and frontend build passed.
- `cargo test --manifest-path crates/git-presence/Cargo.toml`: six Git tests passed.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed.
- `npm run test:e2e`: three Chromium browser tests passed.
- Backend: 32 tests passed on SQLite and PostgreSQL.
- `npm run tauri dev -- --no-watch`: native build and desktop window rendering passed.

The user previously confirmed native repository selection, branch/commit display,
and automatic refresh in Phase 1. The Phase 3 login window was visually checked
in the native app. The two-client collaboration test uses real HTTP/WebSocket
traffic with mocked native Git access; a full two-device native run and actual
OS-keyring persistence still need manual release validation.

## Project structure

```text
src/                    React interface and frontend tests
src-tauri/              Tauri application, configuration, and icons
crates/git-presence/    Git inspection library and Rust tests
e2e/                    Playwright browser tests
backend/digita_api/     FastAPI accounts, teams, rooms, invitations, and WebSockets
backend/migrations/     Alembic database migrations
backend/tests/          API, authorization, concurrency, and migration tests
compose.yaml            Local PostgreSQL development database
```

## Privacy and scope

Local mode requires no account and sends no repository data. Room mode announces
online presence; Git sharing remains off until enabled. Repository selection is
not persisted between launches. DiGitA does not perform Git write operations.

When sharing is enabled, the client sends the room/project ID, changed-file count,
commit hash, and only the optional metadata permitted by the user. It never sends
source code, diffs, absolute local paths, or commit authors. Hidden fields are also
removed on the server. The timeline contains generic event descriptions, without
file names, branch names, or commit messages. Session tokens are kept in memory
or the OS credential store; web storage contains only a remember-login flag.

The MVP does not include a code editor, shared terminal, live collaborative editing, voice/video calls, automatic conflict resolution, or commercial music streaming.

## Known limitations

- Native validation has been performed on Arch Linux only; other operating systems remain unverified.
- Git changes are detected by polling. Large repositories can take longer to refresh, and Git processes currently have no timeout.
- File names containing invalid UTF-8 are displayed with replacement characters.
- Installer packaging is disabled during the prototype phase.
- Conflict Radar and ambient playback remain on the roadmap.
- Run one backend worker: room state and timeline are in memory and disappear after the last member leaves or the server restarts. A room supports up to 32 online users, with one active connection per user.
- Git file lists above 500 entries or the payload budget share counts only. Project identity is confirmed by the user, not inferred from Git remote addresses.
- A changed HEAD is shown as a changed last commit; it does not prove a new commit was created rather than checked out.
- The backend is configured for local development; public deployment and multi-worker hardening remain part of release readiness. See the backend README for current limits.
