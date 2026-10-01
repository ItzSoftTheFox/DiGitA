# Code map

Paths below are relative to the repository root.

## Desktop interface

`src/main.tsx` mounts `DesktopApp`. `src/DesktopApp.tsx` owns authentication,
team/room navigation and the active room. `src/App.tsx` renders the local repository
workspace, also used inside a team room.

| Directory | Main files and responsibilities |
| --- | --- |
| `src/components/` | `LanguageSettings.tsx`: Settings context/dialog; `QuickStart.tsx`: introduction; `ConflictRadar.tsx`: overlap warnings/notifications; `AmbientPlayer.tsx`: shared playback; `RequestFeedback.tsx`: connection/request notices |
| `src/hooks/` | `useRepository.ts`: Git polling; `useRoom.ts`: WebSocket lifecycle and permitted metadata; `requestFeedback.ts`: online status, slow-request hints and retry delays |
| `src/lib/` | `api.ts`: HTTP requests and session credentials; `repository.ts`: Tauri Git command, snapshot types and browser demo |
| `src/i18n/` | `index.ts`: translation helpers and language state; `translations.cs.json`: Czech translations |
| `src/styles/` | `styles.css`: base interface; `collaboration.css`: team/room interface |

Tests stay beside their modules. `src/hooks/sharing.test.ts` checks metadata privacy.
The browser demo cannot inspect a real local repository.

## Native Git and sessions

`src-tauri/src/main.rs` exposes repository reads and OS credential-store commands
to the interface. `crates/git-presence/src/lib.rs` reads Git status and commit
metadata through Git CLI processes. It also contains Rust tests using temporary
repositories. Native commands do not perform Git writes.

## Collaboration API

`backend/digita_api/main.py` creates the FastAPI application and HTTP routes.
`models.py`, `database.py`, and `backend/migrations/` define persisted account,
team, room, invitation and session data. `security.py` handles authentication.

`backend/digita_api/realtime.py` manages live WebSocket rooms, presence, conflict
warnings, the timeline and ambient state in memory. Run one backend worker.
`config.py` holds configuration; the limits/quota modules bound requests and usage.
`deploy.py` and `maintenance.py` cover startup and expiry cleanup.

The desktop reads its own working copy, then sends only metadata allowed by the
user to the room API. PostgreSQL stores accounts and team membership; room activity
is transient. Repository contents are not uploaded.

## Website and generated output

`website/` contains the public download website source. Its build writes the
published files into `docs/`; these outputs stay in Git for GitHub Pages.
`scripts/build-arch.sh` creates local packages under `artifacts/arch/`.

`npm run clean` removes disposable build/test outputs and Python caches. It retains
`node_modules/`, `backend/.venv/`, Rust `target/` directories, local configuration,
databases, private notes and published downloads. One-off local tools belong in
the ignored `scripts/local/` directory.
