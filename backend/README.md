# DiGitA API — Phases 2–5

FastAPI service for accounts, teams, membership roles, rooms, invitation codes,
live Git presence, Conflict Radar, and shared ambient playback. The desktop now connects through HTTP and WebSocket.

## Run locally

Requirements: Python 3.12 or newer, [uv](https://docs.astral.sh/uv/), Docker with Compose.
From the repository root:

```sh
docker compose up -d --wait db
cd backend
uv sync --locked
# First setup only; preserve any existing backend/.env.
cp .env.example .env
uv run alembic upgrade head
uv run uvicorn digita_api.main:create_app --factory --host 127.0.0.1 --port 8000 --no-proxy-headers --ws-max-size 65536
```

Open [interactive API documentation](http://127.0.0.1:8000/docs).
`GET /health` checks database connectivity; migrations must be applied separately.
`GET /` and `/favicon.ico` return 404 by design; the API does not serve the
frontend. Run the desktop/Vite client separately.
The service deliberately does not create or change tables during application startup.

Compose exposes PostgreSQL only on `127.0.0.1:5433`, using database `digita`
and the development credentials from `.env.example`. Data survives container
restarts in the `digita-postgres` volume. `docker compose stop db` stops the database.

## Try a two-user workflow in `/docs`

1. Call `POST /auth/register` with an email, `display_name`, and a password of 12–128
   characters. Register a second account for the team member too.
2. Call `POST /auth/login` for the first account with email and password as JSON.
   Copy `access_token` into **Authorize** (the token alone, without `Bearer`).
3. Call `POST /teams` with `{"name":"DiGitA"}`. The creator becomes its owner.
4. Use the returned team ID in `POST /teams/{team_id}/rooms` with
   `{"name":"Development"}` and `POST /teams/{team_id}/invitations`.
5. Copy the invitation `code`. Log in as the second user and replace the token
   in **Authorize**. Call `POST /invitations/accept` with `{"code":"..."}`.
6. `GET /teams`, `GET /teams/{team_id}/rooms`, and `GET /teams/{team_id}/members`
   now show the shared workspace to the second account.
7. `POST /auth/logout` revokes the current token immediately. Other sessions
   belonging to the same account remain valid.

Invitation codes are returned only when created, expire after 48 hours by default,
and can be accepted once. They grant the `member` role. Existing members get a
409 response without consuming the code. An owner or admin can revoke a code
with `DELETE /teams/{team_id}/invitations/{invite_id}`. Codes are shared manually;
this service does not send email.

## Permissions

Rooms belong to a team. Every team member can read all rooms in that team.
There is no separate room membership or private-room policy in the current prototype.

| Action                                                          | Owner | Admin | Member |
| --------------------------------------------------------------- | ----- | ----- | ------ |
| Read team members and rooms                                     | Yes   | Yes   | Yes    |
| Join live rooms, share Git metadata, control ambient play/pause | Yes   | Yes   | Yes    |
| Create rooms and invitations; revoke invitations                | Yes   | Yes   | No     |
| Set another member's role to admin/member                       | Yes   | No    | No     |
| Remove another member                                           | Yes   | No    | No     |
| Leave the team                                                  | No    | Yes   | Yes    |

Role changes, removal/leaving, and invitation revocation are currently available
through the API; the desktop does not yet expose these administration actions.

The owner cannot be demoted or removed. Ownership transfer and team deletion
are not implemented. Membership is checked for every team/room request, so a
removed member loses access even while their account session is still valid.
Non-members receive 404 for team resources. Member lists expose display names
and IDs, not other members' email addresses.

## Configuration and authentication

| Variable                          | Default                      | Meaning                                                              |
| --------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| `DIGITA_DATABASE_URL`             | Development PostgreSQL URL   | SQLAlchemy connection URL                                            |
| `DIGITA_SESSION_HOURS`            | `24`                         | Token lifetime, 1–720 hours                                          |
| `DIGITA_INVITE_HOURS`             | `48`                         | Invitation lifetime, 1–168 hours                                     |
| `DIGITA_AUTH_REQUESTS_PER_MINUTE` | `20`                         | Combined login/registration requests per client IP                   |
| `DIGITA_ALLOWED_ORIGINS`          | Local Vite and Tauri origins | JSON array of exact trusted frontend origins for CORS and WebSockets |

`backend/.env` is loaded relative to the backend working directory. The root
frontend `.env` is separate; it does not configure the database. Compose
credentials are public development defaults. Keep real secrets out of Git and
never place them in `VITE_*` frontend variables.

Passwords use Argon2id via pwdlib. Session and invitation tokens are random
256-bit values; only their SHA-256 hashes are stored in the database. Sessions
are opaque Bearer tokens, not JWTs, which makes immediate logout straightforward.
Emails are normalized to lowercase for this application's account identity.
Validation errors omit submitted values, and responses use `Cache-Control: no-store`.

The rate limit is an in-memory, per-process fixed window and resets on restart.
The local launch command disables forwarded proxy headers. Public deployments
need TLS, trusted proxy configuration, and a shared rate limiter before scaling
to multiple workers. Email verification, password reset and token refresh are not implemented.
Expired sessions/invitations are cleaned on startup and periodically (see pilot quotas below).
Expired tokens cannot authenticate; expired sessions for a user are removed at
their next successful login.

The API accepts permitted Git metadata, never source files, diffs, or absolute
repository paths. CORS and WebSocket origins are limited to the local Vite and
Tauri origins by default. Override `DIGITA_ALLOWED_ORIGINS` with a JSON array for
other trusted frontend origins. The desktop's API URL is configured at build time
with `VITE_API_URL`; update the exact HTTP/WebSocket origins in Tauri's `connect-src`
CSP when deploying elsewhere. Non-loopback APIs require HTTPS/WSS.

## Live rooms

Connect to `/rooms/{room_id}/live` and send `{"type":"auth","token":"..."}` as
the first frame within five seconds. Tokens must not be put in URLs. The server
authenticates the session and room membership before sending any room state.

Send `{"type":"presence.update","presence":null}` to stop Git sharing, or a
presence object with `repository_id` equal to the room ID, `changed_count`, an
optional `commit_hash`, and independent `sharing` flags for `branch`, `files`, and
`commit_message`. Hidden fields are removed server-side even if a client includes
them. The client confirms its working copy belongs to the room; no Git remote
URL or local folder name is used as a shared identity.

The server sends `room.state` snapshots with online members and the most recent
100 generic timeline events, current conflicts, and ambient playback state. New connections receive the complete current state.
The client resends its current permitted presence after reconnecting. A `ping`
message every 15 seconds receives `pong`; unresponsive clients are disconnected
after roughly 40–50 seconds. Expired sessions and removed members are checked on
incoming messages, before broadcasts, and during idle connection checks.

Limits: one backend process, 32 online users per room, one active connection per
user in each room, 1000 active rooms, eight inbound messages per second, and 64 KiB
inbound messages. Reopening the same room for the same account replaces the older
connection. Presence, conflicts, ambient playback, and timeline are ephemeral: after the last member leaves or
the process restarts, they are discarded. A new persistent timeline and shared
connection state would be needed before multiple server workers can be used.

Timeline events intentionally omit file names, branch names and commit messages.
The current `git.commit_created` event means the observed commit hash changed;
the UI describes this as a changed last commit because a checkout can cause it too.

## Conflict Radar

Every `room.state` includes `conflicts`, a list of `{id, path, user_ids}` objects.
The server groups exact, case-sensitive relative paths shared by at least two
distinct online users in the same room. Duplicate paths from one user count once.
Only sanitized presence with `sharing.files=true` and a non-null list participates.
The desktop includes both paths for renames; the changed-file count still counts
Git status entries. Different branches do not suppress an overlap.

Warning IDs remain stable while a path continues to overlap; its participant list
updates in place. Ending an overlap removes the warning. Privacy changes, stopped
sharing, disconnects, revoked access, and failed WebSocket deliveries all remove
affected participants before the final current state is broadcast. A disappearing
warning means the overlap is no longer observed, not that Git has resolved a merge.

Warnings live only in room memory and are discarded with the room. No migration
or new database table is required. Generic `conflict.detected` / `conflict.resolved`
events use `user_id: null` and `display_name: "Conflict Radar"`, contain no paths
or participant IDs, and are emitted at most once per type per 30 seconds per room.
This throttles timeline bursts without delaying updates to the live warning list.
The client independently batches optional native notifications and never sends
file names to the OS notification history.

## Ambient playback

`room.state.ambient` and heartbeat `pong.ambient` contain `track` (fixed to
`soft-noise-v1`), `duration_ms` (30000), `playing`, `position_ms`, and `revision`.
Positions are sampled using a server monotonic clock; clients use elapsed time
since receipt rather than comparing operating-system wall clocks.

Authenticated room members send `{"type":"ambient.set","playing":true}` (or
`false`). Additional fields, arbitrary tracks/URLs, positions, and non-boolean
values are rejected. Membership/session validation runs before commands.
The room lock serializes commands; each accepted transition increments revision
and adds `ambient.started`/`ambient.paused` to the bounded timeline. Repeated
states are idempotent; transitions within 500 ms of the preceding accepted
transition are ignored and the current state is broadcast back. The existing
8 messages/second per connection limit also applies.

Audio is bundled with the client. Personal listening/volume never reaches the
server. Playback state is isolated per room, kept in memory, and discarded when
the room empties or the backend restarts. No database migration is needed.

## Tests and migrations

From `backend/`:

```sh
uv run pytest -q
uv run ruff check .
uv run ruff format --check .
uv run alembic check
```

The default test suite uses a new SQLite file per test and applies actual Alembic
migrations. PostgreSQL is the application database; use the same suite against
a dedicated PostgreSQL database to validate its behavior:

```sh
# From repository root, once:
docker compose exec -T db createdb -U digita digita_test

# From backend/:
DIGITA_TEST_DATABASE_URL=postgresql+psycopg://digita:digita-local@127.0.0.1:5433/digita_test uv run pytest -q
```

The integration suite clears the selected database tables and tests migration
downgrade/upgrade. It requires a database name ending in `_test`; never point it
at application data. Run this suite serially, with no other process using that
test database.

Tests cover account validation, secret storage, session expiry/logout, team
isolation, role changes, removal, invitation expiry/revocation, concurrent
single-use acceptance, rate limits, migration/schema consistency, live metadata
privacy and revocation, conflict lifecycle, and ambient clock/control isolation.
The latest Phase 5 run passed 45 tests on SQLite; the last PostgreSQL run was
the 39-test Phase 4 suite. See the [main README](../Readme.md) for validation
history and the Windows VM/SSH setup.

To change the schema, edit the models and run `uv run alembic revision
--autogenerate -m "describe change"`. Review the generated migration, then run
`uv run alembic upgrade head`. `uv.lock` records tested Python dependency versions.

Implementation references: [FastAPI password hashing](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/),
[SQLAlchemy transactions](https://docs.sqlalchemy.org/en/20/orm/session_basics.html),
and [Alembic migrations](https://alembic.sqlalchemy.org/en/latest/tutorial.html).

## Web pilot security review

See [the web security review](../docs/security-review.md) for tested controls,
remaining deployment requirements, and the CI workflow. HTTP requests now have
an additional 120/minute/IP process-local limit (`DIGITA_API_REQUESTS_PER_MINUTE`),
a 16 KiB body limit (`DIGITA_MAX_REQUEST_BYTES`) and a 10-second body read timeout.
Health checks count against the HTTP budget. The 20/minute auth limit still applies.
Set `DIGITA_REGISTRATION_ENABLED=false` to close onboarding for a private pilot.
Configure the `digita.security` logger at INFO to collect the fixed auth event names;
it never includes submitted credentials or user data. Deployment access logs need
separate redaction and retention configuration.

## Pilot quotas and expiry cleanup

Limits apply server-side and can be changed through environment variables:

| Variable | Default | Scope |
| --- | ---: | --- |
| `DIGITA_MAX_USERS` | 50 | Total registered accounts |
| `DIGITA_MAX_OWNED_TEAMS` | 3 | Teams owned by one user |
| `DIGITA_MAX_JOINED_TEAMS` | 5 | All memberships per user, including owned teams |
| `DIGITA_MAX_TEAM_MEMBERS` | 10 | Members per team, including the owner |
| `DIGITA_MAX_TEAM_ROOMS` | 5 | Rooms per team, shared across all admins |
| `DIGITA_MAX_TEAM_INVITATIONS` | 10 | Unexpired invitations per team |
| `DIGITA_MAX_USER_SESSIONS` | 5 | Unexpired sessions per user |
| `DIGITA_CLEANUP_INTERVAL_SECONDS` | 3600 | Interval between expiry cleanup runs |

Capacity errors return HTTP 409 with a Czech explanation already displayed by the
frontend. Failed joins do not consume invitations. Leaving/removing a member and
revoking/consuming/expiring an invitation free the corresponding capacity.
At the session limit, a successful new login revokes the session with the earliest
expiry (normally the oldest login); wrong-password attempts cannot revoke sessions.
Lowering limits never deletes users, teams, rooms or memberships. It blocks new
allocations until usage drops; existing excess sessions are trimmed on next login.
Room/team deletion is not implemented, so their capacity cannot yet be freed in the UI.

All HTTP mutations and cleanup share a transaction-scoped database write lock
(PostgreSQL advisory lock; SQLite BEGIN IMMEDIATE). Counting and allocation are
serialized, including requests from separate API instances. This intentionally
trades write throughput for simple, reliable pilot limits. Password checks also
run under this lock; keep the existing auth rate limit and edge protections.
Do not bypass these writers with other applications or manual inserts expecting
quotas to apply. The API still requires one worker for live room state/rate limits.
No schema migration is required.

Expired sessions and invitations are removed on startup and every hour by default,
including those belonging to inactive users. Shutdown waits for an ongoing cleanup.
A database failure logs only `maintenance.cleanup_failed` and retries at the next
interval; configure an alert for that event. Sleeping free-tier instances cannot
run background jobs; startup catches up after waking. Migrations must exist first.

Manual inspection from `backend/` (uses the configured database):

```sh
uv run python -m digita_api.maintenance          # counts only; no deletion
uv run python -m digita_api.maintenance --apply  # deletes expired records only
```

The command prints counts, never tokens or personal data. Repeating cleanup is safe.
No real application database was cleaned during implementation; test data was
cleaned in disposable SQLite/PostgreSQL databases. Apply production cleanup by
starting the updated service or running the explicit command above.

Quota/cleanup validation: 78 tests passed on SQLite and PostgreSQL 18.6 (UTF-8).
CI also runs the backend suite against PostgreSQL 17, matching Compose.
