# Earlier 0.2.0 milestones

This consolidates the superseded Phase 2/3/4 reports and preliminary Phase 3
design. Results are historical; they do not validate later source changes.
Current behavior is documented in [the development guide](../development.md),
with the remaining native checklist in [Phase 1](validation-0.2.0-phase-1.md).

## Phase 2 — first launch and error recovery (2026-09-24/25)

Delivered skippable/reopenable introduction, English default/optional Czech,
loading/offline/slow-server feedback, sanitized API errors, quota/cooldown states,
duplicate-submission locks, uncertain-write safeguards without automatic replay,
and in-memory sign-in after credential-store failures. HTTP timeouts are 75
seconds; a slow-request hint appears after eight seconds. Rate-limit countdowns
use bounded Retry-After with a 60-second fallback. Authentication expiration
clears private live state; denied room access stops reconnects.

The initial local run passed 49 frontend tests, 88 SQLite backend tests, nine
Chromium scenarios, frontend/native release builds and Ruff (29 files).
Desktop-feedback follow-up passed 52 frontend tests, ten browser scenarios,
frontend/native builds and release-configuration checks. It added square dialogs,
sidebar Settings, five-second/dismissible authentication errors with preserved
drafts, correct registration-stage messages and exact pilot HTTPS/WSS CSP origins.
A pilot health request returned 200; account creation/provider settings were not
verified. No deployment, publication or installer replacement occurred.

Native credential-store investigation on 2026-09-25 found no active/activatable
Secret Service provider. KWallet/libsecret were installed, but authorized
ksecretd startup exited 255 without registering org.freedesktop.secrets. No
stored secrets were read or system/autostart configuration changed. Real
remember-sign-in remains unverified; in-memory authentication remains usable.

## Phase 3 — navigation and Settings (2026-09-25)

Delivered full-window Settings with Account/profile, Projects, Privacy,
Audio/notifications, Language and About. Settings preserves the mounted room,
socket, repository, filters and listening; metadata preferences remain separate
from explicit consent and quick Stop sharing. Team administration is separate
from personal Settings. Focus enters the dialog, Escape closes it and focus
returns to the trigger. Creation drafts survive failures/Settings; navigation
asks before discarding. Profile editing and persistence were delivered later.

The preliminary design established this state ownership and journeys before
implementation. Its future editor contract became Phase 5: explicit validated
Save, preserved failure drafts, Keep editing/Discard, team-visible bundled
avatar/name/status and private email. It is no longer a separate pending design.

Verification passed 52 frontend tests, twelve Chromium scenarios, production
frontend build and diff whitespace checks. Browser checks included six sections
at 800×600, keyboard/Escape/focus return, retained local filters, draft guards,
language/audio/sharing continuity and denied notification permission. Generated
Settings screenshots were inspected. Backend/Rust did not change; their suites
were not rerun. No native two-client, PostgreSQL, packaging or provider validation.

## Phase 4 — remembered projects/preferences (2026-10-02)

Delivered up to twenty recent repositories, last-local selection and up to 100
optional room-folder associations scoped to canonical backend/account/room.
Missing folders offer reassignment; switches suppress old snapshots and withdraw
sharing. Remembered projects do not restore consent. Personal volume and
notification intent persist without starting listening or requesting permission.
Explicit clearing keeps language/sign-in. Failed loads preserve stored data;
failed saves retain session choices and offer retry. Serialized saves/revision
guards protect clearing, picker and permission races.

Version-1 preferences use desktop app-data local-preferences.json or validated
browser digita.preferences.v1 storage. Native load_preferences,
save_preferences and clear_preferences exclude credentials, consent, listening
and OS permission. Schema validation, 1 MiB I/O bounds, serialized filesystem
access and synchronized atomic replacement preserve corrupted/future data for
explicit reset. Absolute paths remain local. No Python/API/migration/Git writes.

Verification passed 85 frontend tests (12 files), ten real-filesystem native
preference tests, locked native Cargo check, frontend build, all eighteen
Chromium scenarios (six new preference scenarios) and whitespace checks.
Browsers mocked native filesystem/keyring/notification boundaries and used real
HTTP/WebSocket with an isolated SQLite backend. Ports needed sandbox escalation.
Desktop IPC/app-data restart, actual permission/audio/notifications, Windows
atomic replacement and PostgreSQL were not verified. In-flight Git reads were
ignored rather than cancelled; process bounds were deferred to Phase 6.

These milestones preserved existing work, used installed dependencies/lockfiles
and did not stage/commit, bump versions, rebuild packages, deploy or publish.
