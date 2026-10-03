# 0.2.0 phase 5 — team administration and account personalization

2026-10-03. Implementation authorized on 2026-10-02 and resumed on 2026-10-03.
Coordinator, Frontend and Backend worked in the shared checkout. Existing
uncommitted phase 4 and workflow changes were preserved.

## Delivered behavior

- Team menus show members, roles, avatars and custom statuses. Owners change
  nonowner roles and remove nonowners. Admins create rooms and create/revoke
  invitations. Nonowners can leave; the owner cannot leave or be removed.
  Role changes, removal, leaving and revocation require confirmation.
- Active invitation listings show expiry and allow revocation without revealing
  codes or hashes. A new code appears at creation, with an explicit copy action;
  clipboard failure selects the code and offers manual copying. Accepted,
  expired and revoked invitations disappear on refresh.
- Settings edits display name, one of five bundled avatars, one of five colors
  and a custom text status. The preview, avatar reset and status clearing are
  drafts until Save. Team visibility and private email are explained. Custom
  status is labeled separately from online presence and rendered as plain text.
- Saves apply only after a validated response. Failed saves keep drafts;
  ambiguous outcomes require refresh/review before another mutation. Dirty
  navigation, Settings closure and Escape offer Keep editing / Discard. Pending
  saves prevent discard until complete.
- Profile and role mutations update existing live room peers. Member removal
  immediately closes affected sockets with 4403 and clears their presence and
  conflicts, including idle clients. Git consent, other peers' presence, ambient
  playback and existing room connections survive profile changes.
- Czech translations and responsive controls follow the existing interface.
  Quota errors use the server's existing authoritative error messages.

## Contract and migration

`PATCH /auth/me` changes only the authenticated account. It validates trimmed
display names (1–80 characters), custom status (0–120), `avatar` from
`initials | fox | cat | robot | leaf` and `avatar_color` from
`slate | blue | green | amber | rose`. The editor submits all fields. At the API,
display name is required; omitted optional fields reset to defaults (`initials`,
`slate`, empty status). Unknown fields, foreign IDs, email/password edits, nulls
and unsupported values are rejected atomically.

Profile fields are additive in account, team member and live member outputs.
Live members also include role. Teammate outputs exclude email and credentials.
`GET /teams/{team_id}/invitations` is owner/admin only and returns active
`{id, expires_at}` entries. Existing role/removal and invitation mutation paths
retain their permissions. No native command or Git metadata payload changed.

Apply Alembic migration `859ab79a18f4` before starting the updated backend against
an existing application database. Defaults backfill existing accounts and allow
older writers. Downgrade preserves accounts but drops personalization values;
re-upgrade restores defaults. The working application database and hosted server
were not migrated or deployed by this implementation.

## Automated evidence

- Frontend: `npm test` — 101 tests across 14 files passed; 16 new tests cover
  profiles, navigation guards, permissions, async races and clipboard recovery.
- `npm run build` — TypeScript and production frontend build passed.
- Backend: `uv run pytest -q` — 114 tests passed on SQLite and separately on an
  isolated PostgreSQL 18.6 database. Checks include authorization bypasses, profile
  validation/privacy, live revocation/updates, populated-account migration
  backfill, downgrade/re-upgrade and schema consistency.
- Ruff check and format checks passed for 31 backend files.
- Locked native `cargo check --locked --manifest-path src-tauri/Cargo.toml`
  passed. Phase 5 contains no Rust changes.
- Chromium browser scenarios cover two-account profile propagation without
  socket/consent reset, failed drafts, dirty navigation, re-login persistence,
  owner/admin/member controls, clipboard copy, invitation revocation, live
  membership removal and confirmed self-leave. Full regression results are
  recorded in the current work record.
- `git diff --check` passed. Browser profile/team screenshots were visually
  inspected under `artifacts/`; published website images were not replaced.

An initial browser run found outdated phase 3 menu expectations and a hot-reload
context mismatch during concurrent source formatting. The menu test now checks
the delivered member roster/leave controls; stable reruns passed. The disposable
Playwright backend allows a larger request budget to accommodate the full suite;
production limits are unchanged. Backend checks needed sandbox escalation for
local sockets. Two existing Starlette/AnyIO deprecation warnings remain.

## Practical limits

Browser tests use real HTTP/WebSockets and mock native filesystem/OS boundaries.
They do not prove two-device native behavior, OS notification/audio delivery or
keyring persistence. Those earlier pilot checks remain manual. Ownership transfer,
uploaded avatars, email changes, password reset and a service-wide admin dashboard
are outside this phase. The single-process live-room limit remains in force.

For user review, the native development app uses a separate local backend and
ignored persistent SQLite preview database. No commit, publication, release,
hosted deployment, version bump or package rebuild was performed.
