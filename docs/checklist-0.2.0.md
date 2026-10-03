# 0.2.0 exit checklist

Updated 2026-10-03. Version 0.2.0 is a locally prepared release candidate.
**The full release gate is not passed.** Automated evidence is recorded in
[Phase 7 validation](history/validation-0.2.0-phase-7.md). A browser/native mock
is not a real desktop pass; package transactions are not a clean Arch runtime test.

| Exit requirement | Status and evidence |
| --- | --- |
| Two desktop users complete the team workflow without manual DB changes | Open: two-account HTTP/WS browser flow passed; two actual desktop clients still needed. |
| Restart, network loss and unavailable keyring do not block local work | Partial: browser recovery/keyring mocks pass; real OS keyring and suspend/resume open. |
| Settings has its own screen; room context and quick sharing-off survive navigation | Passed automated: Settings, privacy and collaboration scenarios. |
| Remembered projects/preferences require fresh sharing consent | Passed automated: native filesystem tests, browser reload/scoped folders and v1→v2 migration; desktop app-data restart open. |
| Team administration enforces client/server roles | Passed automated: SQLite/PostgreSQL permission bypass and live revocation; two-desktop confirmation open. |
| Profiles persist, appear to teammates and permit only owner edits | Passed automated: both database engines and live profile browser scenarios. |
| Git reads are bounded and incomplete results are clear | Passed: 13 real Git tests and browser stale-data/sharing-withdrawal scenarios. |
| Automated and manual Arch checks have recorded results | Partial: automated checks and isolated package transactions passed; clean-environment launch/runtime and OS notification tests open. |
| No known blocking defect; other limits documented | No observed blocker in completed checks; release/native gaps explicitly remain. |
| Arch package, versions, changelog and website downloads agree | Passed locally: 0.2.0 manifests, archive, SHA-256, website and changelog; publication not performed. |
| No paid operational dependency or exposed secret introduced | Local checks passed; runners remain paused. Live provider billing/configuration not re-audited. |
| English defaults; Czech switching preserves work and local choice | Passed frontend/browser tests; screenshots reviewed. |

- [x] Remove background playback, audio assets/protocol and volume preferences.
- [x] Keep system notifications and migrate valid old preferences safely.
- [x] Finish About, safe diagnostics and fixed native help/issue links.
- [x] Run frontend, backend SQLite/PostgreSQL, Git/native, build, Ruff and browser checks.
- [x] Run npm/Python dependency and source secret checks; manually review false positives.
- [x] Select GPL-3.0-only and include its text in the package.
- [x] Build Arch package and verify isolated install, 0.1.0 upgrade and uninstall transactions.
- [x] Prepare matching local website download/checksum and changelog.
- [ ] Run Rust dependency audit: cargo-audit is not installed.
- [ ] Validate two real desktop clients, native restart/keyring, notifications and suspend/resume.
- [ ] Validate clean Arch installation with runtime dependencies, graphical launch, upgrade and uninstall.
- [ ] Verify deployed TLS/headers/proxy/limits, registration closure, MFA, backups and monitoring before expanding access.
- [ ] Publish exact corresponding source and validate it matches the distributed binary before public distribution.

User confirmed the dev appearance looks OK on 2026-10-03 (manual visual pass).

## Manual handoff

In two desktop accounts on the same backend: create a team, invite/join, open a
room, connect separate local working copies, explicitly share metadata and trigger
a same-path radar warning. Withdraw sharing, remove the member, and verify access
and presence disappear. Repeat reconnect and native restart without restoring
consent. Test a separate desktop session without keyring, notification permission
and suspend/resume. Do not alter the user's personal keyring to simulate failure.

Use an isolated Arch VM/chroot with a graphical session for installation checks.
Install 0.1.0 first for upgrade testing; retain its profile/project data and verify
0.2.0 migrations. Do not use the host's package database as a clean test system.
