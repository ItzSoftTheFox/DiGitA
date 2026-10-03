# Code map

Paths below are relative to the repository root.

## Desktop interface

`src/main.tsx` mounts `DesktopApp`. `src/DesktopApp.tsx` owns authentication,
joined-team sidebar, signed-in profile footer and active room. `src/App.tsx` renders the local repository
workspace, also used inside a team room.

| Directory | Main files and responsibilities |
| --- | --- |
| `src/components/` | `LanguageSettings.tsx`: Settings/dialog and draft navigation; `ProfileEditor.tsx`: profiles and bundled avatars; `TeamAdministration.tsx`: member/invitation controls and owner-only team deletion; `SharingConfirmation.tsx`: explicit room/repository association and sharing choices; `Preferences.tsx`: local preferences/projects; `QuickStart.tsx`: introduction; `ConflictRadar.tsx`: animated nonmodal overlap drawer with manual toggle and reconnect-safe automatic warnings; `RequestFeedback.tsx`: request notices |
| `src/hooks/` | `useRepository.ts`: serialized Git polling and stale/incomplete safeguards; `useRoom.ts`: WebSocket lifecycle and permitted metadata; `requestFeedback.ts`: online status, slow-request hints and retry delays |
| `src/lib/` | `api.ts`: HTTP requests and session credentials; `repository.ts`: Tauri Git command, snapshot types and browser demo; `preferences.ts`: validated local storage and scoped room-folder associations |
| `src/i18n/` | `index.ts`: translation helpers and language state; `translations.cs.json`: Czech translations |
| `src/styles/` | `styles.css`: base interface; `collaboration.css`: team/room interface |

Tests stay beside their modules. `src/hooks/sharing.test.ts` checks metadata privacy.
The browser demo cannot inspect a real local repository.

## Native Git and sessions

`src-tauri/src/main.rs` exposes repository reads, local preference commands and
OS credential-store commands to the interface. `src-tauri/src/preferences.rs`
validates local JSON, bounds I/O and saves through atomic replacement. Preferences
exclude credentials, sharing consent and OS permission.
`crates/git-presence/src/lib.rs` reads Git status, commits, local upstream counts
and operation markers through bounded Git CLI processes. Commands allow five
seconds and 8 MiB combined stdout/stderr; snapshots allow fifteen seconds.
Limit failures terminate/reap Git and return errors rather than partial lists.
Tests use real temporary repositories, including conflicts and linked worktrees.
Native commands never fetch or perform Git writes. New tracking/operation data
stays local and does not change the presence contract.

## Collaboration API

`backend/digita_api/main.py` creates the FastAPI application and HTTP routes.
`models.py`, `database.py`, and `backend/migrations/` define persisted account,
team, room, invitation and session data. `security.py` handles authentication.
Account profiles are persisted in PostgreSQL; team roster outputs exclude account
email and credentials. Invitation listings contain active IDs/expiry; raw codes
are returned only at creation.

`backend/digita_api/realtime.py` manages live WebSocket rooms, presence, conflict
warnings, the timeline in memory. Committed account and
membership changes refresh existing live peers; membership removal closes their
sockets and removes presence/conflicts. Owner-only `DELETE /teams/{team_id}`
atomically cascades team data, then closes all affected sockets and purges live
rooms. Accounts and other teams remain. Run one backend worker.
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

Phase 7 removes audio playback/protocol/assets. Local preferences v2 migrates valid
v1 data while dropping volume. About uses an allowlisted diagnostic summary and
a native `open_project_link` command restricted to fixed help/issue destinations.
