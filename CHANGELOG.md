# Changelog

## 0.2.0 — release candidate, 2026-10-03

Prepared locally; final native/release checks remain open. No publication or
backend deployment is implied by this entry.

- Reopenable introduction, clearer offline/server/session states and useful retries.
- Dedicated Settings with English defaults and Czech translation; room context
  survives navigation and language changes.
- Remembered projects and scoped room folders require fresh sharing consent.
- Team member/invitation administration, profile editing, joined-team sidebar and
  confirmed owner-only team deletion with immediate live access revocation.
- Bounded read-only Git status, local tracking/operation indicators, full-list
  filters, paging and copying. Local paths, contents and tracking data stay local.
- Nonmodal Conflict Radar with keyboard controls and reconnect-safe dismissal.
- Background music, bundled audio, volume preferences and playback protocol removed.
  Preferences v2 preserves valid legacy projects and notification intent.
- About shows the app version, help, issue reporting and a small private-data-free
  diagnostic summary. Notifications remain available.
- GPL-3.0-only selected; Arch package includes the license. Matching source must
  accompany public binary distribution.

Arch Linux x86_64 remains the target. Other platforms, account deletion,
private rooms, multi-worker live state and automatic updates remain deferred.
See [exit checklist](docs/checklist-0.2.0.md) and
[Phase 7 validation](docs/history/validation-0.2.0-phase-7.md).

## 0.1.0 — development pilot

Initial local Git workspace, accounts, team rooms, opt-in metadata sharing,
Conflict Radar and experimental shared ambience. The preserved pilot download
predates the 0.2.0 interface and background music removal.
