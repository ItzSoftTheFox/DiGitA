# Current coordinated work

## Phase 7 implementation complete — release gates remain open

2026-10-03, shared DiGitA checkout. User authorized Phase 7, the 0.2.0 checklist,
a dev desktop launch and GPL-3.0. Frontend and Backend workers edited their
exclusive paths; Coordinator integrated E2E, root/native manifests, packaging,
license, website outputs and records. All worker paths are released.

Delivered: complete background music removal; preference schema v2 with strict
valid-v1 migration preserving projects/notification intent; About version/license,
help/issues and four-line allowlisted diagnostics; native fixed-URL launcher;
0.2.0 Arch candidate, GPL text, changelog, local download/checksum and matching
application source snapshot. Old 0.1.0 download remains. Native browser launcher
reports spawn/early failures and reaps long-running processes without killing
browser descendants; late launcher errors cannot be reported.

Verification: 131 frontend tests, 119 SQLite and 119 isolated PostgreSQL18.6 tests,
13 real Git and 13 native tests, locked native check, Ruff, frontend/native release
build, 25 Chromium scenarios and final Settings/website follow-up passed. npm and
Python audits report no known vulnerabilities; source secret scan passed after
individual false-positive review. Rust cargo-audit unavailable. Isolated fakeroot/
pacman install, upgrade from 0.1.0 and uninstall passed with dependencies disabled;
this is not a clean Arch runtime/ownership/desktop-hook test. Screenshots reviewed.
See [Phase 7 evidence](history/validation-0.2.0-phase-7.md) and
[the partial exit checklist](checklist-0.2.0.md).

## Running preview and remaining work

`npm run tauri -- dev` was started for the user. Vite uses 127.0.0.1:1420;
native target/debug/digita is running. It uses the existing root .env API setting
for the Render pilot; no configuration, accounts or pilot database were changed.
Read-only pilot /health returned 200/status ok and basic security headers; HSTS
was absent. Provider accounts, DB TLS, proxy trust, edge limits, registration,
billing/MFA/backups/monitoring and current-source deployment remain unverified.
The temporary regression servers and isolated PostgreSQL instance were stopped.

User confirmed the current visual appearance looks OK. This is a manual visual
pass, not OS/two-device acceptance.

Next: two actual desktop users, real app-data/keyring
restart, unavailable keyring, system notifications and suspend/resume; clean Arch
VM installation/runtime/upgrade/uninstall; Rust dependency audit and deployed
security review. Do not claim full 0.2.0 exit or public-release readiness yet.
Publish exact corresponding source with the binary only after authorized release.
No staging, commit, branch switch, publication or deployment occurred.

## Standing contracts and ownership

Local read_repository remains bounded/read-only and its additional tracking data
stays local. Sharing always needs explicit consent. Preferences keep the existing
storage filename/key but output version 2 without volume. WS room.state has no
ambient; pong contains only type; old playback commands close 1008. No new DB
models/migrations. Older databases still need Phase 5 migration 859ab79a18f4;
do not migrate the pilot without deployment authorization. Team DELETE and live
revocation contracts from Phase 6 are unchanged. Run one backend worker.

Workers do not spawn further agents or integrate Git. Frontend owns src/ and
website sources; Backend owns server/native sources; Coordinator owns docs/root/
E2E/packaging and generated outputs. Account deletion and other-OS releases remain
deferred. Project contents, absolute paths and credentials remain local.
