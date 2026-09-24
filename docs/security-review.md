# Security review before the web pilot

Date: 2026-09-16. Scope: React frontend, FastAPI, HTTP/WebSocket interfaces,
tracked files, and installed JavaScript/Python dependencies. This combined manual
code review with automated regression tests. It was not a penetration test of
deployed infrastructure or a guarantee that no vulnerabilities exist.
Desktop/Rust integration was outside this web audit's scope.

## Conclusion

Authorization and session protections are implemented. **This review did not
approve public operation:** the deployment requirements below remain open.
A closed pilot can proceed with hosting selection and limited configuration.
No provider or paid service was connected during this review.

## Findings by area

| Area | Finding and evidence | Remaining work |
| --- | --- | --- |
| Identity | Argon2id; same error for unknown accounts and incorrect passwords; combined login/registration rate limit. `test_api.py`, `test_rate_limit.py`. | MFA, email verification, and password reset are not implemented. Registration reveals existing emails through HTTP 409. |
| Authorization | Membership checked for HTTP and WS; other teams return 404; only owners manage roles. Revocation checked before WS broadcasts. | All rooms are accessible to the entire team; private rooms are outside the model. |
| Sessions | Random 256-bit bearer tokens; only SHA-256 stored; expiry and immediate HTTP logout. Web tokens are not persisted in browser storage. | No UI to list/revoke all sessions; idle WS revocation is checked periodically. |
| Input | Pydantic bounds lengths and rejects extra fields; SQLAlchemy uses parameters. HTTP limits apply before JSON parsing. | Database quotas were added in the follow-up below; lists lack pagination. |
| XSS | React renders values as text; malicious names/paths covered by Conflict Radar regression tests. No `dangerouslySetInnerHTML` or eval in reviewed source. | Website hosting must enforce its own CSP; Tauri CSP does not apply to the website. |
| Uploads | No file upload endpoint; only metadata is shared. | No current input for a malware scanner. Reassess when introducing uploads. |
| API and WS | Bearer authorization for private HTTP routes, exact CORS/WS origins, WS message and size limits, private-field validation. | Edge concurrency, handshake, and traffic limits; no distributed rate limiter. |
| Transport | Frontend rejects non-loopback HTTP APIs. API adds no-store, nosniff, no-referrer, and DENY framing headers. | Verify actual TLS, HTTPS redirects, HSTS, and frontend headers on the deployed domain. |
| Stored data | Passwords are hashed; session/invitation tokens are not stored in plaintext. | Emails and names are readable in the DB; disk/backup encryption, DB TLS, and access depend on provider configuration. |
| Secrets | detect-secrets found only development/test values and Git hashes in tracked files; `.secrets.baseline` reviewed. | Full Git history was not scanned; the baseline is not permission to add real keys. |
| Dependencies | `npm audit`: no known vulnerabilities; `pip-audit` against backend/.venv: no known vulnerabilities. | Results apply only at scan time; repeat regularly. Rust dependencies were outside scope. |
| Logs | Fixed registration/login/logout and rate-limit events omit emails, passwords, and tokens; covered by tests. | Enable INFO logging in hosting; collection, retention, alerts, and permission-change auditing remain pending. |

## Fixed findings

- HTTP bodies previously lacked an application limit. They now have a 16 KiB
  maximum and a 10-second read timeout before JSON parsing, including chunked
  requests and incorrect Content-Length. Proxy concurrency limits are still needed.
- HTTP requests outside authentication had no rate limit. The new process-local
  limit is 120 requests/minute/IP, including health and invalid requests, returning
  429 and Retry-After. Auth retains its additional 20/minute/IP limit. Users behind
  a shared NAT can consume one budget together.
- Public registration could not be disabled by configuration.
  `DIGITA_REGISTRATION_ENABLED=false` now blocks account creation without changing
  existing sign-in behavior.
- WS path validation did not cover backslash traversal and control characters.
  Both are now rejected. This was not demonstrated file access; the backend never
  opens these paths.
- Automated CI security checks and basic auth audit events were missing.

## Requirements before connecting a public domain

1. Deploy one backend process/worker. Live rooms and rate limits are in memory;
   multiple workers would split state and multiply budgets. Restarts reset them.
2. Enable HTTPS/WSS, exact frontend origins, trust only specific proxy IPs, and
   configure body/timeout/concurrency limits plus a 65536-byte WS frame limit.
   Clients must not spoof their IP through X-Forwarded-For. Restrict database
   access, enforce verified TLS for remote DB connections, and use a private password.
3. Configure and verify frontend CSP with exact HTTP/WS origins,
   `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, nosniff,
   Referrer-Policy, Permissions-Policy, and HSTS once HTTPS works. Test sign-in,
   audio, and WS against the resulting policy; this audit deployed no universal CSP.
4. Close registration after pilot onboarding or introduce an allowlist. Without
   email verification, email is not proof of identity or organization membership.
   Enable MFA on provider administration accounts; assess application MFA before
   expanding the pilot. Application MFA is not an existing feature.
5. Set pilot quotas according to provider capacity (implemented in the follow-up
   below, including expiry cleanup). Add concurrent WS limits per account/IP.
   A per-minute limiter alone cannot prevent gradual free-tier DB exhaustion or
   distributed flooding. Configure available provider hard limits/budget alerts.
6. Configure safe logs, retention, monitoring of 401/403/429/5xx and capacity.
   Do not log request bodies, Authorization, WS auth frames, or sensitive query
   parameters; default access logs can contain URLs. Verify DB backup and restore.
7. On real staging, run PostgreSQL and browser checks; verify final headers, TLS,
   CORS, proxy IP handling, and behavior when free-tier limits are reached.

## Repeating the checks

At audit time, `.github/workflows/security.yml` was configured for PRs, pushes to
main/master, manual runs, and weekly checks, with read-only permissions and a
15-minute web-job timeout. It defined locked installs, regression tests, lint,
build, browser tests, dependency scans, and secret scanning.
**Current status (2026-09-24): hosted workflows are paused, manually triggered,
and their jobs unconditionally skipped. Use local checks.** No GitHub CI run was
performed during the original local review.

Audit tools need network access. An unavailable vulnerability database does not
count as a clean scan.

```sh
npm ci
npm audit --audit-level=low
npm test
npm run build
cd backend
uv sync --locked
uv run pytest -q
uv run ruff check .
uv run ruff format --check .
cd ..
uv tool run pip-audit --path backend/.venv/lib/python3.12/site-packages --progress-spinner off
git ls-files -z | xargs -0 uv tool run --from detect-secrets==1.5.0 detect-secrets-hook --baseline .secrets.baseline
npm run test:e2e
```

Review new secret findings manually; do not blindly regenerate the baseline.
Revoke/rotate a published real credential first; deleting it is insufficient.
Files must be tracked for the tracked-file scanner to include them.

Historical local results: 69 backend tests (SQLite), 22 frontend tests, production
build, and Ruff passed. Two test-client/AnyIO deprecation warnings remained.
PostgreSQL was not tested in that run.

All three E2E browser tests passed serially with a 90-second timeout. The initial
parallel run timed out on a screenshot; collaboration passed in both runs. The CI
definition therefore runs E2E serially. The secret hook passed with the reviewed baseline.

## Follow-up: pilot quotas and cleanup

Implemented limits: 50 accounts; 3 owned / 5 total teams per user; 10 members,
5 rooms, and 10 valid invitations per team; 5 sessions per user.
See backend/README.md for configuration and capacity errors. Database locking
serializes allocation so concurrent requests cannot exceed quotas.
Expired records are cleaned at startup, hourly, and optionally through a CLI.
Active user data is not automatically deleted. Infrastructure controls and
pre-authentication WS limits from the original audit remain open.

Follow-up validation passed: 78 SQLite tests, 78 isolated PostgreSQL 18.6 tests
(UTF-8), Ruff, and diff checks. A PostgreSQL 17 CI job was added to match Compose;
the GitHub workflow was not run during that work and is currently paused.
These historical results do not validate subsequent changes.
