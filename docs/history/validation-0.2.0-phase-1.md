# 0.2.0 — phase 1: validating the 0.1.0 pilot

Date: **2026-09-24**. Status: **code/automated work complete; native validation partial, sharing/radar deferred**.
This record does not represent a 0.2.0 release or verification on two desktops.

## Environment and results

Arch Linux x86_64, kernel 7.2.6-arch2-1, Node.js 26.8.2, Cargo 1.98.1,
Python 3.12.13. Existing installed dependencies and lockfiles were used.
`uv sync --locked --check --offline` confirmed the backend environment matches
`uv.lock`. A clean installation of all dependencies was not part of this run.

Commands run from the repository root unless stated otherwise. These are the
phase 1 baseline results before the subsequent language changes.

| Check | Result |
| --- | --- |
| `npm test` | 28 tests in 7 files passed |
| `npm run build` | TypeScript and production frontend passed |
| `cargo test --locked --manifest-path crates/git-presence/Cargo.toml` | 6 tests passed using real temporary Git repositories |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml` | Compilation passed; this target contains 0 tests |
| `node --test scripts/prepare-release.test.mjs` | Release configuration checks passed |
| `npm run test:e2e` | 3 Chromium tests passed, including two-account collaboration |
| `cd backend && .venv/bin/python -m pytest -q -o faulthandler_timeout=30` | 87 tests passed on temporary SQLite databases |
| `cd backend && .venv/bin/ruff check .` | Passed |
| `cd backend && .venv/bin/ruff format --check .` | 29 files passed |
| `npm run tauri -- build --no-bundle -- --locked` | Release binary built; no installation or GUI launch |

E2E uses an isolated API on port 8001 and frontend on 1421. Coverage includes
account creation, teams, invitations, room entry, sharing consent, radar, WAV
playback, personal volume, network loss/recovery, withdrawing shared fields, and
logout. HTTP and WebSocket are real; Git snapshots, folder selection, and keyring
calls are mocked. Chromium media playback does not prove audible native WebView output.

Four new frontend tests cover remembered session restoration, clearing sessions
rejected with HTTP 401, preserving credentials during network failure, and local
mode after keyring-read failure. An existing test covers continuing with an
in-memory session after keyring-save failure.

The sandbox blocked localhost E2E (`EPERM`) and stalled backend TestClient
inter-thread communication. Those runs were terminated; the same suites passed
outside the sandbox. This was not a confirmed application defect.

## Findings and severity

| Severity | Finding | Status |
| --- | --- | --- |
| Blocking | No blocking application defect observed in completed checks | Native scenarios below remain unverified |
| Normal — documentation | README described only a local backend, disabled distribution, and the old prototype plan | Fixed; local development, hosted pilot, Arch builds, and future releases distinguished |
| Normal — documentation | Release guide implied active tag workflows and an actual $0.15 charge | Corrected against current YAML and the earlier screenshot showing $0 billed |
| Maintenance | Two Starlette/TestClient deprecation warnings: httpx and BlockingPortal alias | Tests passed; assess compatibility before upgrading test dependencies |

No new dependency/secret scan, live Render/Neon audit, PostgreSQL integration run,
or package installation was performed. Historical checks elsewhere do not replace
a current run. No build was published and `docs/downloads/` was not replaced.
Hosted Actions remained disabled.

## Scope decision — continue to phase 2

On 2026-09-24 the user explicitly deferred manual sharing/radar checks and
requested continuing with phase 2. N2/N3 remain deferred, not passed; other
unconfirmed native checks remain open. Automated/code work from phase 1 is
complete, while full two-desktop validation is not. Phase 2 results are recorded
in [the consolidated milestones](milestones-0.2.0.md).

## Manual verification on two desktops

Use two different accounts, two native clients, and two working copies of the
same test repository. Arch Linux is the priority for this milestone. Both clients
must use the same backend. Avoid sensitive work projects. If pilot registration
is closed, use prepared accounts or an isolated local backend; a team invitation
does not create an account.

Record the OS, build/version, date, actual result, and errors for each item.
Do not share passwords, tokens, or database URLs.

### User-reported progress

The user tested with a friend on Windows and explicitly confirmed that sign-in,
invitations, and rooms worked. These are user-reported manual results, not an
agent-observed run. Team creation and the online-member indicator were not
separately confirmed, so N1 is only partially verified. Git sharing, radar, audio,
and recovery scenarios remain unconfirmed.

The test date, app build, launch method (source or installer), and the user's own
OS are still unspecified. This does not establish clean installation or Windows
release readiness. “Not individually confirmed” below does not mean a scenario
was never tried.

| ID | Steps and expected result | Result |
| --- | --- | --- |
| N1 | Sign in as A and B. A creates a team and room and invites B. B accepts; both enter the same room and see each other online. | Partial: user confirms sign-in, invitations, and rooms work; team creation and online-member indicator not separately confirmed. |
| N2 | Both connect their test repositories. Before consent, only online presence is visible. Enable file-name sharing and edit the same relative path. Both see radar warnings. | Deferred by user on 2026-09-24; not verified |
| N3 | A disables file names, then all sharing. B no longer sees the metadata or overlap. Switching rooms/repositories requires fresh consent. | Deferred by user on 2026-09-24; not verified |
| N4 | Both explicitly enable personal listening. A starts ambience; B hears it. Changing A's volume does not affect B. B pauses playback for both. | Not individually confirmed |
| N5 | With an unlocked keyring, remember sign-in, close, and relaunch. The account and permitted local project preferences restore; Git sharing consent and listening do not. | Not individually confirmed |
| N6 | In a separate test desktop session without a working keyring, verify in-memory sign-in and local mode. Restarting without stored credentials returns to login. Do not alter a personal keyring for this test. | Not individually confirmed |
| N7 | Revoke a test client's session on an isolated backend. Test startup restoration and an already open room. Access is rejected and private room data disappears. | Not individually confirmed |
| N8 | B disconnects the network while sharing and listening. Local Git works, audio pauses, and live data disappears. Reconnection restores current state without duplicates; previously permitted sharing resumes within the same room visit. | Not individually confirmed |
| N9 | Suspend and resume B's computer with a room open. Verify reconnection, current radar, and audio without duplicate players. | Not individually confirmed |
| N10 | B signs out, leaves the room, stops sharing and playback, and is not signed in automatically after restart. | Not individually confirmed |
| N11 | With OS notifications enabled, create a new overlap. Verify delivery without file/member names. Denying permission leaves in-app radar functional. | Not individually confirmed |

Phase 1 remains in progress until these native checks are evaluated and any
blocking defects fixed. Automated results must not be recorded as manual passes.

## Follow-up — English default and optional Czech (2026-09-24)

English is now the source/default language for the application, website, and
Markdown documentation. The app provides a language-only Settings dialog on the
login, local workspace, dashboard, and room screens. Czech lives in a separate
catalog; dates follow the selected locale. The device-local preference survives
restart and falls back to English for missing/unsupported values. Storage failure
keeps the app usable and explains that the choice applies to the current launch.

Known legacy Czech API errors are translated on the client, so this change does
not require an immediate pilot-backend deployment. Backend/native source messages
are English. User-provided names, paths, branches, and commit contents are unchanged.
The complete Settings redesign remains phase 3.

Verification after the language change:

- 32 frontend tests in 8 files passed, including language fallback, restoration,
  unavailable storage, legacy errors, and unknown diagnostic handling.
- 87 backend tests passed on isolated SQLite; the same two deprecation warnings remain.
- 6 Git tests passed and the native Tauri compilation check passed.
- `npm run tauri -- build --no-bundle -- --locked` also produced the updated
  native release binary successfully. This verifies compilation, not installation
  or native GUI behavior.
- All 6 distinct browser scenarios passed across the complete initial run and
  targeted runs for the added website checks/screenshot updates. Coverage includes
  English defaults under a Czech browser locale, stored Czech after reload,
  preserved form drafts/local filters, modal Escape/focus behavior, storage failure,
  and language changes during real HTTP/WebSocket collaboration without new
  connections, changed sharing consent, or interrupted audio.
- Frontend and website production builds passed; the website build verified the
  existing download checksum. Ruff and diff whitespace checks passed.
- Website checked at 1440/768/390/320 px under `/DiGitA/`, with working English
  previews/FAQ, reduced motion, no-JavaScript content, and no console errors.
  English app screenshots replaced the previous Czech website/README previews.

No hosted workflow, live deployment, release publication, or installer replacement
was performed. The existing downloadable 0.1.0 archive still contains the earlier
UI; a newly validated package is needed to distribute these changes. Native manual
results for N1–N11 still need to be mapped to the partial manual test report above.
