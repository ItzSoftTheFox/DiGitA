# Current coordinated work

## Completed — Phase 6 and Phase 5 follow-up

Authorized and completed on 2026-10-03 in the shared DiGitA checkout. The existing
Backend and Frontend Codex sessions implemented their exclusive paths; the
Coordinator reviewed contracts/diffs, added end-to-end acceptance, integrated
fixes, updated the phase plan/guides and removed obsolete documentation.
Existing Phase 4/5 and workflow changes remain uncommitted and preserved.

Delivered: bounded read-only Git tracking/operation state, safe complete/stale
results, serialized polling across project and room remounts, full-list filters/
search with pagination, relative-path/hash copy, explicit room sharing choices;
joined-team sidebar, signed-in profile/Settings footer and confirmed owner-only
team deletion with immediate socket revocation/cascade cleanup. New Git fields
stay local; project restoration never restores sharing or listening.

Verification: 124 frontend tests, TypeScript/production build, 120 backend tests
on SQLite and separately PostgreSQL 18.6, Ruff check/format, 13 locked Git tests,
locked native Cargo check, all 24 Chromium scenarios, Markdown links and diff
whitespace checks passed. Screenshots were visually inspected. Browser Git/OS
boundaries are mocked; real Git tests use temporary repositories/processes.
See [current evidence](history/validation-0.2.0-phase-6.md).

Native/HTTP contracts: read_repository adds upstream/ahead/behind/operation/
statusComplete locally; timeout/output/parser failure returns an error. Limits
are 5 seconds/command, 15 seconds/snapshot and 8 MiB stdout+stderr/command.
DELETE /teams/{team_id} returns 204 for owners, 403 for other joined members,
404 for nonmembers/missing teams and 401 for invalid sessions. After commit it
closes affected sockets with 4403 and purges live rooms. Accounts/other teams
remain; no new schema migration or presence payload was added.

Phase 2/3/4 history and preliminary design were consolidated into one milestones
record. Their four redundant files and the obsolete private CODEBASE_GUIDE were
removed. The completed follow-up plan was removed after its requirements moved
into current guides, evidence and the ignored development plan. Necessary setup,
security, release and native-checklist documents and published website files stay.

## Latest interface revisions — 2026-10-03

Signed-in Local uses one sidebar for local repository controls, joined teams,
selected-team rooms and the profile/Settings footer. Unsigned Local keeps Settings
beside its workspace identity, including compact windows. Avatar alignment is
scoped independently from profile text styles.

Room sharing controls moved beside repository controls, preserving explicit
room/folder consent and immediate withdrawal. The background player is no longer
mounted in rooms. Phase 7 retains cleanup of bundled audio, legacy playback
code/protocol and volume preferences; notification settings remain independent.

Conflict Radar is a nonmodal panel sliding in from the left. Its room-header
button always allows manual opening/closing; Close and Escape return focus to
that button. New visible overlaps open it without moving keyboard focus; reduced
motion disables the animation. Dismissal survives unrelated updates and the
client's reconnect/presence restoration, using file/participant keys because the
server regenerates warning IDs. A genuinely new or resolved-and-recurring overlap
opens the panel again. Foreground modal dialogs handle Escape first.

Verification: 129 frontend tests passed; the final Escape handling change passed
all 9 radar tests and a new production build. All 24 Chromium scenarios passed
against the disposable backend, including real room warnings, dismissal/new
overlap/reconnect, focus preservation, foreground Settings Escape and reduced
motion. Drawer and room screenshots were inspected at 800px and desktop widths.
Native Git/OS boundaries remain mocked in browser tests. No backend contract
changed; no new preview/backend service was started for the user.

## Next work and practical limits

Phase 7 remains open: native two-device collaboration/recovery, real OS keyring/
notifications, remaining background music removal, suspend/resume, Arch clean
install/upgrade/uninstall and
release readiness. Windows currently terminates only direct Git children;
process-tree termination and other Windows native behavior remain unverified.
Account deletion remains deferred until owned-team/retention semantics are agreed.

Existing databases still require the Phase 5 migration 859ab79a18f4 before new
backend code starts. Do not migrate the pilot without deployment authorization.
The disposable PostgreSQL test instance was stopped. The existing Phase 5 native
preview/persistent local database were not modified or removed. No Git staging,
commit, branch change, version bump, package rebuild, deployment or publication.

## Worker sessions and standing decisions

Backend: 01a10166-b52b-7843-b4b3-bbe49f7639e2.
Frontend: 01a10166-c28c-79b1-a2dc-b0865b679d68.
Both use /home/Fox/Projects/DiGitA and returned their paths to the Coordinator.
Send bounded future tasks through actual Codex thread messages. At most two
workers; no worker creates further agents. Frontend owns src/ and API client;
Backend owns server/native; Coordinator owns shared records, E2E and integration.
Agree contracts before dependent edits; reserve generated website outputs/ports.
One backend process; source contents, absolute paths and credentials stay local.
