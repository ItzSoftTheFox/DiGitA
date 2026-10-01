# Phase 3 — UI, navigation and Settings validation

Date: 2026-09-25. Environment: local Linux workspace, Chromium, Vite and the
isolated SQLite E2E backend. User authorized implementation of phase 3.

## Delivered

The [design and journey sketches](design-0.2.0-phase-3.md) were written before
implementation. Settings is a dedicated full-window native HTML dialog with six
sections and persistent sidebar entry points. Its portal destinations let the
workspace retain ownership of sharing, audio, notifications and repository state.
Opening Settings does not unmount or reconnect the room. Its modal focus handling
supports keyboard navigation, Escape and return to the original trigger.

Metadata choices, personal volume and notification opt-in now live in Settings.
Explicit sharing consent, quick Stop sharing, radar and playback/listening remain
in the room. Sharing state and Stop sharing also remain visible in every Settings
section. No preference or consent persistence was added beyond existing language
storage. Language reports storage success/failure; other changes apply immediately.

Account and profile previews the signed-in name, initials and private email.
The future editor and save/error/dirty-state contract are designed, not exposed as
nonfunctional controls. Remembered projects and profile APIs remain phases 4/5.
Team menu exposes existing invitation creation to owners/admins, with member guidance.
Complete member/role/invitation administration remains phase 5.

Creation forms retain drafts through Settings and failed API calls. Cancelling,
switching forms, entering a room, local navigation and sign-out guard dirty drafts.
Window close/reload uses the browser beforeunload safeguard. Settings itself has
no unsaved draft because its existing preferences apply immediately.

## Checks

- `npm run build`: TypeScript and production Vite build passed.
- `npm test`: 52 tests passed across 9 files, including existing audio/radar privacy,
  notifications, session restoration and request-error regressions.
- `npm run test:e2e`: 12 Chromium scenarios passed. Two-account collaboration uses
  real HTTP/WebSockets and browser audio, mocking native filesystem/credentials.
  It covers Settings volume changes, metadata selection/withdrawal, continuing
  room connection/audio across language changes, Stop sharing from About,
  role-dependent team menus, denied notification permission feedback and reconnect.
- New Settings scenarios verify all six sections at 800×600 without horizontal
  overflow, keyboard open/Escape/focus return, local filter preservation, API-error
  draft retention and cancel/keep decisions on navigation.
- Existing intro/language checks also pass at 390px with language-storage failure
  feedback and draft preservation. Inspected generated Settings screenshots.
- `git diff --check`: passed.

Earlier test failures were selector ambiguity after adding profile/project previews
and moving controls, plus a notification mock expectation (Chromium denies
permission). These were corrected to match the actual user journeys. Visual
inspection found global button style interference; Settings now scopes its styles.

## Limits

No native two-desktop run, audible OS output, real notification delivery/keyring,
suspend/resume, PostgreSQL migration, package rebuild or publication was performed.
The earlier native phase 1 checks remain deferred. Backend/Rust behavior was not
changed in this phase; their standalone suites were not rerun. The workspace
already contained earlier phase changes, which were preserved. No version bump.
