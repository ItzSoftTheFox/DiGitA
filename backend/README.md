# DiGitA API — Phase 2

FastAPI service for accounts, teams, membership roles, rooms and invitation codes.
The desktop currently remains a local Git client; account screens and server
connections will follow with Phase 3.

## Run locally

Requirements: Python 3.12 or newer, [uv](https://docs.astral.sh/uv/), Docker with Compose.
From the repository root:

```sh
docker compose up -d --wait db
cd backend
uv sync --locked
cp .env.example .env
uv run alembic upgrade head
uv run uvicorn digita_api.main:create_app --factory --host 127.0.0.1 --port 8000 --no-proxy-headers
```

Open [interactive API documentation](http://127.0.0.1:8000/docs).
`GET /health` checks database connectivity; migrations must be applied separately.
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
There is no separate room membership or private-room policy in Phase 2.

| Action | Owner | Admin | Member |
| --- | --- | --- | --- |
| Read team members and rooms | Yes | Yes | Yes |
| Create rooms and invitations; revoke invitations | Yes | Yes | No |
| Set another member's role to admin/member | Yes | No | No |
| Remove another member | Yes | No | No |
| Leave the team | No | Yes | Yes |

The owner cannot be demoted or removed. Ownership transfer and team deletion
are not implemented. Membership is checked for every team/room request, so a
removed member loses access even while their account session is still valid.
Non-members receive 404 for team resources. Member lists expose display names
and IDs, not other members' email addresses.

## Configuration and authentication

| Variable | Default | Meaning |
| --- | --- | --- |
| `DIGITA_DATABASE_URL` | Development PostgreSQL URL | SQLAlchemy connection URL |
| `DIGITA_SESSION_HOURS` | `24` | Token lifetime, 1–720 hours |
| `DIGITA_INVITE_HOURS` | `48` | Invitation lifetime, 1–168 hours |
| `DIGITA_AUTH_REQUESTS_PER_MINUTE` | `20` | Combined login/registration requests per client IP |

Passwords use Argon2id via pwdlib. Session and invitation tokens are random
256-bit values; only their SHA-256 hashes are stored in the database. Sessions
are opaque Bearer tokens, not JWTs, which makes immediate logout straightforward.
Emails are normalized to lowercase for this application's account identity.
Validation errors omit submitted values, and responses use `Cache-Control: no-store`.

The rate limit is an in-memory, per-process fixed window and resets on restart.
The local launch command disables forwarded proxy headers. Public deployments
need TLS, trusted proxy configuration, and a shared rate limiter before scaling
to multiple workers. Email verification, password reset, token refresh, and
scheduled cleanup of expired sessions/invitations are not part of this phase.
Expired tokens cannot authenticate; expired sessions for a user are removed at
their next successful login.

The API accepts no repository paths, source files, diffs or Git presence yet.
Browser cross-origin access is disabled by default. Desktop token storage and
network permissions will be handled when the client connects in Phase 3.

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
single-use acceptance, rate limits, and migration/schema consistency.

To change the schema, edit the models and run `uv run alembic revision
--autogenerate -m "describe change"`. Review the generated migration, then run
`uv run alembic upgrade head`. `uv.lock` records tested Python dependency versions.

Implementation references: [FastAPI password hashing](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/),
[SQLAlchemy transactions](https://docs.sqlalchemy.org/en/20/orm/session_basics.html),
and [Alembic migrations](https://alembic.sqlalchemy.org/en/latest/tutorial.html).
