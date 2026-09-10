# DiGitA

**A quieter workspace for better teamwork.**

DiGitA is a desktop workspace designed to make local Git activity visible before a push. The project combines repository awareness, early conflict warnings, and a shared ambient environment so developers can stay in sync while working in their own editors.

The interface follows a minimal black-and-white design with sharp edges, fine lines, geometric details, and subtle motion. It respects the system's reduced-motion preference.

## Project status

**Phase 1: local prototype — in progress.**

The frontend and Git integration are implemented. The frontend build, six component/hook tests, and two browser tests have passed. Native desktop execution and the Rust test suite still need verification in an environment with Rust and the required Tauri system libraries.

The current application UI is in Czech. This README describes both the available prototype and the planned product; team collaboration and ambient audio are not implemented yet.

## Current features

- Select a local Git repository through a native directory picker and disconnect it at any time.
- View the current branch, latest commit, and changed files.
- Distinguish staged and unstaged changes, search paths, and filter the file list.
- Refresh manually or automatically two seconds after the previous read completes.
- Handle empty repositories, detached HEAD, linked worktrees, renames, and existing merge conflicts.
- Keep the last known snapshot visible during read errors and retry automatically.
- Explore an explicitly labeled browser demo without connecting a repository.

## Roadmap

| Phase | Focus                | Planned outcome                                                                                        | Status      |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------ | ----------- |
| 1     | Local prototype      | Desktop window, repository selection, Git overview, automatic refresh, and native validation           | In progress |
| 2     | Backend and accounts | FastAPI service, database schema, registration, authentication, teams, and rooms                       | Planned     |
| 3     | Live collaboration   | WebSocket connection, online presence, shared Git metadata, and a project event timeline               | Planned     |
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
| Desktop shell      | Tauri 2 and Rust                        | Implemented; native verification pending |
| Interface          | React, TypeScript, Vite, Lucide         | Implemented                              |
| Git integration    | Git CLI through a standalone Rust crate | Implemented; Rust tests pending          |
| Frontend testing   | Vitest and Testing Library              | Implemented                              |
| Browser testing    | Playwright and Chromium                 | Implemented                              |
| Backend            | Python and FastAPI                      | Planned                                  |
| Database           | PostgreSQL                              | Planned                                  |
| Realtime transport | WebSocket                               | Planned                                  |
| Local persistence  | SQLite                                  | Planned                                  |
| Infrastructure     | Docker Compose and GitHub Actions       | Planned                                  |

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

Choose **Připojit repozitář** (Connect repository), then select an existing Git working copy. Selecting a subdirectory also works. Edit a file in your usual editor and the overview will refresh automatically.

### Browser preview

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:1420` and choose **Prohlédnout ukázku** (View demo). The browser preview uses labeled static sample data. Access to a real local repository requires the desktop application.

Stop the standalone preview server before running `npm run tauri dev`; both use port 1420.

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

Browser tests exercise the demo, file filters, search, disconnection, responsive layouts, and reduced-motion support. They save screenshots to the ignored `artifacts/` directory.

## Project structure

```text
src/                    React interface and frontend tests
src-tauri/              Tauri application, configuration, and icons
crates/git-presence/    Git inspection library and Rust tests
e2e/                    Playwright browser tests
```

## Privacy and scope

The local prototype does not send repository data to a server, require an account, or perform write operations such as commit, push, merge, or rebase. Repository selection is not persisted between launches.

Future collaboration features are intended to share only permitted metadata. Source code and diff contents must not be sent by default, and users must control whether branch names, file names, and commit messages are shared.

The MVP does not include a code editor, shared terminal, live collaborative editing, voice/video calls, automatic conflict resolution, or commercial music streaming.

## Known limitations

- Native desktop execution and Rust tests have not yet been validated in the current development environment.
- Git changes are detected by polling. Large repositories can take longer to refresh, and Git processes currently have no timeout.
- File names containing invalid UTF-8 are displayed with replacement characters.
- Installer packaging is disabled during the prototype phase.
- Accounts, rooms, networking, Conflict Radar, and ambient playback remain on the roadmap.
