# 0.2.0 — phase 2: first launch and recovery

Date: **2026-09-24**. Status: **implemented and locally verified**.
This is development work toward 0.2.0, not a release or live deployment.

## Scope and behavior

The user authorized proceeding while native sharing/radar tests are deferred.
[Phase 1](validation-0.2.0-phase-1.md) retains the partial Windows report and
remaining native checks. No unperformed check is marked as passed.

- First launch introduces local mode, rooms, invitations, consent, and the limits
  of radar. Skip, Escape, and Get started dismiss it; Settings can reopen it.
  Only a dismissal flag is stored. English is primary; Czech remains optional.
- Loading shows a slow-server hint after eight seconds without claiming a known
  outage cause. HTTP requests time out after 75 seconds. Local Git remains usable
  during a pending request or offline. A slow room connection offers Reconnect.
- API failures distinguish invalid credentials, expired sessions, forbidden
  actions, closed registration, invalid/used/expired invitations, known quotas,
  rate limiting, unavailable servers, and transport errors. Unrecognized server
  details and native exceptions are not echoed into the UI.
- Rate-limit responses use a bounded Retry-After countdown (60-second fallback).
  CORS now wraps rate-limit middleware and exposes that header to trusted clients.
  Untrusted origins still receive no access permission.
- Form submission has a synchronous lock and disabled fields. Team/room/invitation
  operations retain their lock across navigation into local mode. Successful writes
  refresh the dashboard, including after returning from local mode.
- A lost write response is ambiguous, not proof of failure. No automatic replay is
  performed. Further team/room/invitation writes require a successful room refresh
  and an explicit acknowledgement. An invitation code cannot be recovered from its
  server-side hash; creating another can consume additional quota. This is a UI
  safeguard, not backend idempotency or an exactly-once guarantee across restarts.
- An uncertain registration directs the user to sign in first. Failed keyring save
  keeps the existing in-memory fallback. Synchronous/asynchronous restoration
  failures show a safe explanation and a retry action.
- HTTP 401 from dashboard/room requests and WebSocket 4401 return to sign-in and
  attempt to clear saved credentials. WebSocket 4403 stays a distinct room-access
  failure. Both remove private live state and stop automatic reconnects.

## Verification

Existing local dependencies and lockfiles, Arch Linux x86_64. No paid runners or
live provider requests. Browser tests use isolated local frontend/API servers and
SQLite; native filesystem/keyring boundaries are mocked in collaboration E2E.

| Check | Result |
| --- | --- |
| `npm test` | 49 tests in 9 files passed |
| `npm run build` | TypeScript and production frontend passed |
| `npm run test:e2e` | 9 Chromium scenarios passed |
| `cd backend && .venv/bin/python -m pytest -q -o faulthandler_timeout=30` | 88 SQLite tests passed; two existing TestClient deprecation warnings |
| `cd backend && .venv/bin/ruff check .` | Passed |
| `cd backend && .venv/bin/ruff format --check .` | 29 files passed |
| `npm run tauri -- build --no-bundle -- --locked` | Native release binary built; no installer or GUI launch |

New checks cover sanitized API failures, known quotas, cooldown bounds, offline
requests, ambiguous writes without replay, duplicate submission, navigation during
writes, expired sessions, synchronous keyring failures, and terminal WebSocket
closures. Browser coverage includes narrow-screen introduction, dismissal/reopen,
Czech translation, slow requests, offline local work, cooldown, and closed signup.
The introduction screenshot was visually inspected at 390px viewport width.
Existing two-account sharing/radar/audio/reconnection and website scenarios passed.
These automated scenarios do not substitute for the deferred native tests.

## Limits and next step

Real keyring behavior, audible native playback, OS notifications, suspend/resume,
PostgreSQL and deployed Render/Neon configuration remain outside this verification.
No new installer was published; version numbers and existing downloads are unchanged.
Next planned work is phase 3: design navigation and dedicated Settings, then implement
that agreed UI structure. Account personalization remains in its planned later phase.

## Follow-up — desktop feedback (2026-09-25)

- Introduction and Settings now use square corners, matching the application.
  Settings is an icon in the local workspace sidebar, or the left navigation rail
  on account/team/room screens, rather than a floating bottom-right button.
- Login/registration errors dismiss on click or after five seconds. Dismissal does
  not clear form values or bypass the independent rate-limit cooldown.
- The default native build used the hosted API from the frontend environment but
  its production CSP allowed only localhost. Development CSP already allowed the
  pilot. The production allowlist now includes the exact pilot HTTPS/WSS origins;
  it does not allow arbitrary destinations. Release-generated CSP remains limited
  to the selected release API. Added a regression check for public-origin parity.
- Registration stage tracking now distinguishes a failed registration from a later
  failed login. Remember-sign-in only controls credential storage after successful
  authentication; it does not change the registration request.

Verification: 52 frontend tests, 10 Chromium E2E scenarios, frontend production
build, and release-configuration tests passed. Browser checks include square corners,
Settings in the left menu, dismissal on click and at five seconds, and draft retention.
Unit checks cover registration with and without remembered sign-in and login failure
following successful registration. The updated intro screenshot was inspected.
Production account creation has not been tested; local tests do not establish live
registration policy, quotas, or database health.

The follow-up native release build (`npm run tauri -- build --no-bundle -- --locked`)
also passed. A read-only request to the public pilot `/health` returned HTTP 200.
This does not verify account creation or the pilot's configured CORS/registration policy.

## Native credential-store report (2026-09-25)

The user reached an authenticated session but received the in-memory fallback
notice after requesting remembered sign-in. On the inspected Hyprland session,
D-Bus had no active or activatable `org.freedesktop.secrets` provider. KWallet
6.30.0-1 and libsecret were installed; GNOME Keyring and KeePassXC were absent.
The installed KWallet package provides `ksecretd` and its KDE compatibility
activation service, but no `org.freedesktop.secrets.service` activation file.
A direct authorized startup of `ksecretd` exited with status 255 and did not
register the Secret Service name. Effective KWallet/Secret Service enablement
switches read as true; the daemon's startup failure is not yet explained.
No stored secrets were read, and no system/autostart configuration was changed.
Native remember-sign-in remains unverified and requires a functioning unlocked
Secret Service provider. Existing in-memory authentication remains usable.
