# Phase 7 — Arch 0.2.0 candidate

2026-10-03, Arch Linux x86_64. User authorized Phase 7, the 0.2.0 exit
checklist and a native development preview. Frontend/Backend workers edited
exclusive source paths; Coordinator integrated E2E, packaging, license, versions,
website outputs, security review and records. No commit, branch change,
publication, pilot migration or backend deployment was performed.

## Delivered

Removed audio assets/generator/player, volume controls/preferences and ambient
WebSocket state/commands. Existing system notifications remain. `room.state`
has no ambient field; ping returns only `{type:"pong"}`. Old `ambient.set`
messages fail validation and close with 1008. This is a deliberate playback
protocol removal; old audio clients should be updated with the server.

Local preference schema v2 preserves recent/active projects, scoped room folders
and notification intent. Valid v1 data validates its old bounded integer volume,
drops that field and migrates in memory; the next save writes v2. Unknown fields
and damaged data remain rejected/preserved. Storage names remain unchanged.
Restoring projects never restores sharing consent or OS notification permission.

Settings → Notifications replaces Audio and notifications. About shows version
0.2.0, MIT, help/issues and diagnostics restricted to version, browser/
desktop runtime and English/Czech language. Account data, error objects, email,
paths and tokens never enter the summary. Native help/issues accept only two
enums mapped to fixed GitHub URLs; direct OS launchers use no shell/user URL.
The first 250ms detects startup errors; a dedicated thread reaps longer-running
launchers without killing the user's browser. Late launcher failures cannot be
reported. Browser links retain ordinary safe new-tab anchors.

User changed the license choice to MIT before publication; LICENSE contains its text,
with MIT metadata/About/package. The Arch package installs its text.
App/package/lock/Tauri/Cargo versions agree at 0.2.0; backend was already 0.2.0.
The standalone Git library retains its independent 0.1.0 crate version.
Changelog/guides and website remove current playback claims. The candidate and
checksum are prepared locally under docs/downloads; the 0.1.0 package is preserved.
Matching application source snapshot/checksum is also prepared locally and linked
from the website. The snapshot excludes private/ignored files and binary downloads;
locks/build scripts identify dependencies. Third-party dependencies retain their own licenses. The package includes the
MIT copyright/permission notice; the matching source snapshot is a convenience.

## Current evidence

| Check | Result |
| --- | --- |
| Frontend `npm test` | 131 tests / 16 files passed, including native-link/diagnostic privacy and error handling |
| Frontend production build | TypeScript/Vite passed; final frontend embedded in Arch build |
| SQLite backend full suite | 119 passed; 2 existing Starlette/AnyIO deprecation warnings |
| Isolated PostgreSQL18.6 suite | 119 passed; disposable server stopped, no pilot data accessed |
| Ruff check and format | Passed on 32 backend files |
| Locked Git Cargo tests | 13 real repository/process tests passed |
| Locked native Cargo tests | 13 passed: 11 preference/filesystem plus 2 link allowlist/platform tests |
| Locked native Cargo check | Passed |
| Complete Chromium E2E | 25 passed; real HTTP/WS, mocked Git/picker/keyring/OS boundaries |
| Settings/About and generated website follow-up | 4 passed after final build; English/Czech diagnostics and matching version/download paths |
| Release configuration tests / shell syntax | Passed |
| Arch release build / makepkg | Passed; package includes LICENSE and 0.2.0 metadata |
| Isolated pacman transactions | Install, removal, 0.1.0 install, upgrade to 0.2.0, uninstall passed |
| Website production build | Passed with matching binary/source checksums and package size |
| npm audit / pip-audit | No known vulnerabilities reported at scan time |
| Source detect-secrets | Passed after individual false-positive review; baseline hashes/line numbers updated |
| Rust dependency audit | Not run: cargo-audit is not installed |
| Diff whitespace / local documentation links | Checked before handoff |

Package transaction tests use fakeroot, a disposable empty package database/root,
no install scripts and disabled dependency resolution. They verify files,
permissions, license, versions, replacement and removal. Ownership warnings occur
because no real root/chown is available. They do not prove clean Arch dependency
installation, runtime loading, graphical launch, desktop-menu hooks or real root
ownership. Log: artifacts/arch/package-validation.log (ignored local artifact).

Final binary SHA-256:
`188974acf2a5ca886d996e89752209c0cb93b78d6e2e1956bbfe1d52ad183a32`.

About at 800×600 and website at desktop/mobile widths were captured and inspected.
Reduced-motion, Settings focus return, empty rooms/radar, stale repository data,
sharing withdrawal and member revocation are covered by browser scenarios.
CSS animation can affect intermediate screenshot colors; screenshots disable
animations where appropriate. OS delivery and actual native links remain manual.

Secret scan includes tracked and new source files. Reviewed candidates are
migration IDs, scanner metadata, example URLs, test-only credentials and translated
labels. Existing findings were not blindly regenerated. The hook refuses an
unstaged baseline: checks used a reviewed copy under /tmp, excluding the scanner's
own baseline hashes; no Git staging was performed. Full Git history was not scanned.

## Pilot observation and remaining gates

A read-only HTTPS request to the configured Render /health returned 200 and
`{"status":"ok"}`, with no-store, no-referrer, nosniff and DENY headers.
HSTS was absent from that response. This does not prove redirects, TLS policy,
proxy spoof rejection, WS concurrency limits, DB TLS, provider billing/MFA,
backups, monitoring, registration state or current source deployment. No provider
account/configuration was accessed or changed; paid runners stay paused.

Models did not change, so no new migration is needed. Existing Phase 5 migration
requirements remain for older installations. Native two-device collaboration,
real app-data/keyring restart, unavailable keyring, OS notifications, suspend/
resume and clean Arch graphical install/upgrade/uninstall are still open.
The [0.2.0 exit checklist](../checklist-0.2.0.md) is deliberately partial;
a version bump, package transaction or browser mock is not a release pass.

The requested native dev preview was started with `npm run tauri -- dev`; Vite
is on 127.0.0.1:1420 and target/debug/digita launched. It uses the existing
configured pilot API. This launch is not proof of two-client/OS acceptance.

User confirmed the dev appearance looks OK on 2026-10-03. Record this as a
manual visual pass only; no new keyring/two-client/package-runtime pass is implied.

License follow-up: user requested MIT on 2026-10-03. License text, metadata, About,
documentation and candidate binary/source artifacts were updated together.

MIT follow-up checks: 5 About/diagnostic unit tests and 3 Settings browser
scenarios passed; frontend/native release and Arch package rebuilt. The embedded
LICENSE and package metadata were verified, and binary/source checksums refreshed.
