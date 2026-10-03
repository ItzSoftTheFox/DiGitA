# Phase 6 and team-navigation follow-up

2026-10-03. The user authorized Phase 6, the Phase 5 follow-up and removal of
obsolete files. Existing uncommitted Phase 4/5 work remains preserved. The
Coordinator used the existing Frontend/Backend Codex sessions in the same checkout.

## Delivered behavior and contracts

Local Git status includes upstream/ahead/behind from local references, explicit
unborn/no-upstream/detached states and merge/rebase/cherry-pick markers in the
actual Git directory, including linked worktrees. DiGitA never fetches or writes
Git state. Snapshot success is complete; malformed/truncated/invalid UTF-8 data,
timeout or oversized output returns an error. Limits are five seconds per command,
fifteen seconds per snapshot and 8 MiB combined stdout/stderr per command.
Unix limit failures kill the process group and reap the direct child. Windows
currently kills/reaps only the direct child; process-tree handling remains unverified.

Frontend reads use one shared queue across project changes and workspace remounts.
Inactive queued selections are skipped; old snapshots never appear under a new
project. Last-known failed/stalled status is labeled stale, expires after fifteen
seconds without success and withdraws sharing. Empty stale data is not presented
as clean. Search/filters inspect the full loaded list, including original rename
paths, with staged/unstaged/untracked/conflict filters and 100-row pages. Relative
paths/original paths/full commit hashes can be copied with manual failure recovery.

Connecting/selecting/restoring a valid repository in a room opens sharing choices.
The user must confirm its room association and select Start sharing. Cancel/Escape
keeps sharing off; team/room/project changes require fresh consent. Privacy and
Stop sharing remain accessible. Tracking, operation, diagnostics, authors and local
absolute paths remain outside the existing Git presence payload.

The sidebar lists all joined teams and marks the selected team. It opens that
team's rooms/administration, retains draft navigation guards and withdraws room
sharing on switches. The saved profile and Settings remain bottom left in team,
room and signed-in local views. English source copy includes Czech translations.

Owner-only DELETE /teams/{team_id} returns empty 204; joined nonowners get 403,
nonmembers/missing teams 404 and invalid/expired sessions 401. Existing transaction
write locks serialize creation/deletion. Database cascades remove rooms,
memberships and invitations atomically; after commit live sockets close with 4403
and their room state is purged. A failed commit keeps access. Accounts, sessions
and other teams survive. Clients return to refreshed available teams/empty state.
No migration beyond existing Phase 5 migration 859ab79a18f4 was introduced.

## Verification

Local Arch Linux x86_64, PostgreSQL 18.6, existing dependencies/lockfiles.

| Check | Result |
| --- | --- |
| Frontend Vitest | 124 passed across 15 files |
| Production frontend build | TypeScript and production Vite build passed |
| Backend full PostgreSQL | 120 passed in isolated digita_phase6_test; server stopped |
| Backend full SQLite | 120 passed in temporary SQLite databases |
| Ruff check / format | Passed |
| Locked Git Cargo tests | 13 passed |
| Locked native Cargo check | Passed |
| New Chromium Phase 6 scenarios | 3 passed |
| Complete Chromium regression | 24 passed in the final stable run |
| Markdown links / whitespace | Passed |

Git tests use real temporary repositories: divergent/missing upstream,
unborn/detached/worktree cases, real conflicted operations, 3,000 files, unchanged
index/content/HEAD, malformed output and timeout/output-limit process termination.
Backend tests independently verify permission bypass, cascade isolation, idle
multi-room revocation, rollback and concurrent creation/authorization/deletion.

Browser scenarios use real HTTP/WebSockets and mock native folder/Git/credential
boundaries. They verify tracking/copying, null presence before confirmation,
cancellation, no new local metadata in shared payloads, withdrawal on incomplete
reads, keyboard team selection, cancelled/confirmed owner deletion and prompt live
teammate removal. Existing privacy/audio/profile/preferences regressions are retained.

The first complete browser run passed 22/24. One old selector selected a hidden
new project option; it now targets the repository heading. The other found hidden
Settings in unsigned local mode at 800×600; signed-in layout styling was corrected.
Only stable final runs establish the final result. Two existing Starlette/AnyIO
backend deprecation warnings remain. Sandbox-blocked local sockets/cache accesses
were rerun with environment permission, using disposable databases and ports.

## Documentation cleanup and limits

Phase 2/3/4 reports and the obsolete preliminary Phase 3 design were consolidated
into milestones-0.2.0.md, retaining dated results, decisions and manual limitations.
Their four redundant files were removed. The obsolete private CODEBASE_GUIDE.md
was removed in favor of the current code map. The redundant follow-up planning document was removed after its requirements
were merged into this report and the current development/phase plan. Markdown links,
roadmap/status and Git timeout/storage claims are updated. Published website
files/downloads, necessary guides/security/native checklist, tests, migrations,
configuration, private account data and existing source work are preserved.

The temporary Phase 6 assignment note was removed after its approved contracts
and results moved into current-work.md and this evidence record.

Account deletion stays deferred until owned-team/retention behavior is defined.
Real two-desktop collaboration, OS keyring/audio/notifications, suspend/resume,
Windows process-tree termination and clean package installation remain manual.
No staging/commit, branch changes, version bump, package rebuild, deployment,
publication, paid service or pilot database modification occurred.
