# Desktop pilot: backend and releases

DiGitA is a React interface bundled inside a Tauri desktop application. The desktop
reads local Git repositories and connects to a hosted FastAPI/PostgreSQL service.
The public website only presents the product and links to installers. It must not
serve `dist/` as the product: that directory contains the desktop interface.
The admin dashboard is a separate future service, not an implemented hidden route.

## Current deliverables

- `.github/workflows/release.yml`: four native builds collected in one draft prerelease.
  Trigger: a `v*` tag; manual dispatch must also select that tag.

| Platform | Architecture | Downloads |
| --- | --- | --- |
| Windows | x64 | NSIS `.exe` |
| macOS | Apple Silicon / ARM64 | `.dmg` |
| macOS | Intel / x64 | `.dmg` |
| Linux | x64 | `.deb` and `.AppImage` |

Each build uploads `SHA256SUMS-<platform>-<architecture>.txt`. Jobs are serialized
so creation and updates of the shared draft cannot race. A failed job leaves a
partial draft: publish only after all four builds and installation checks succeed.
Linux ARM and Windows ARM are not included.
- `scripts/prepare-release.mjs`: validates the release version/API URL and produces
  an ignored Tauri override enabling the installer and allowing only the configured
  API HTTPS/WSS origins. Development config remains local-only.
- `render.yaml`: free Python backend blueprint with desktop origins, closed
  registration, external PostgreSQL, migrations at startup and one API worker.
- Existing quotas and cleanup remain active for desktop users.

No provider resources or GitHub releases have been created by preparing these files.
Installers must still be built on the hosted runners and tested on each supported
system. Automatic updates, Windows signing, the download website and admin dashboard
are not implemented by this change. Apple signing is wired but needs credentials.

## 1. Deploy backend and database

Create a Neon Free PostgreSQL project and a Render Free web service using the
repository's Blueprint. Prefer nearby regions. Set `DIGITA_DATABASE_URL` only in
Render's secret environment, never GitHub frontend variables or website code:

```text
postgresql+psycopg://USER:PASSWORD@HOST/DATABASE?sslmode=verify-full&sslrootcert=system
```

Use the actual provider credentials and URL-encode password characters. For
`sslrootcert=system`, the backend supplies the explicit Mozilla CA bundle from the
production dependency `certifi` and enforces `verify-full`. This avoids relying on
binary libpq/OpenSSL default CA paths matching the hosting operating system. Both
Alembic and the API use this connection setup. Explicit custom CA file paths are
preserved. The launcher rejects local/default DB URLs and unverified TLS.
Migrations run before the API starts. Inspect deployment logs and `/health`.

Registration defaults to disabled. Open it briefly for pilot onboarding and close
it afterward; an administration/onboarding UI does not exist yet.

Set `FORWARDED_ALLOW_IPS` to verified hosting proxy addresses/CIDRs before relying
on per-user-IP limits. Wildcard trust is rejected. Until configured, the app ignores
forwarded headers and may rate-limit multiple users behind the same proxy together.
Verify actual client IP separation and spoofed-header rejection on staging; do not
copy an unverified proxy range. Additional edge/WS connection limits remain pending.

Render Free sleeps after idle periods and may restart; room presence/timeline/audio
state is ephemeral. Stored accounts/teams remain in Neon. Check current plan limits
and billing settings before use. The blueprint intentionally creates no Render DB.

## 2. Build the installer

In GitHub repository Settings → Secrets and variables → Actions → Variables,
set `DIGITA_API_URL` to the live HTTPS API origin, with no path or credentials.
This public address is compiled into the installer; it is not a secret.

Keep desktop versions equal in `package.json`, `src-tauri/tauri.conf.json`, and
`src-tauri/Cargo.toml`; update the corresponding lockfiles when changing versions.
After committing the intended release, push its matching tag (initially `v0.1.0`).
The workflow runs frontend/native tests and builds platform-specific installers
into a **draft prerelease**. Review every job and test each installer before publishing.
Do not rebuild a published tag; issue a new version instead.

Local Windows equivalent (PowerShell):

```powershell
$env:VITE_API_URL = "https://YOUR-API-HOST"
$env:RELEASE_TAG = "v0.1.0"
npm ci
node scripts/prepare-release.mjs
npm run tauri -- build --config src-tauri/tauri.release.generated.json -- --locked
```

Release checks: install/launch, local Git reading, registration/login, two-client
room collaboration, OS credential storage, logout, and reconnect after server sleep.
Windows is currently unsigned and may display publisher/SmartScreen warnings.
macOS uses ad-hoc signing for test builds by default; this is not Developer ID
signing or notarization and Gatekeeper can block downloaded builds. For normal
macOS distribution, supply all six GitHub Actions secrets: `APPLE_CERTIFICATE`
(base64 Developer ID Application .p12), `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific), and
`APPLE_TEAM_ID`. The configured identity overrides the ad-hoc fallback.
Partial signing configuration fails the job rather than silently omitting signing.
See [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/).
Linux builds use Ubuntu 22.04 as a baseline; validate on target distributions and
with a running Secret Service/keyring for remembered sessions. SHA-256 verifies file integrity, not publisher identity. Configure code
signing before broader distribution; automatic updates require their own signed
update artifacts and are not enabled.

On macOS/Linux, set `VITE_API_URL` and `RELEASE_TAG` in the shell, then run the
same npm/Node/Tauri commands. The generator selects bundles from the host OS.
CI additionally passes the explicit Rust target to select each architecture.
Native tests execute on the runner host; the Intel macOS installer is cross-built
on Apple Silicon and still requires an Intel-machine installation test.

## 3. Download website

Publish a separate static landing page on Cloudflare Pages (not the app's dist/).
For the pilot link to the published version's GitHub release page or its exact
installer asset. `/releases/latest` does not select prereleases; draft releases are
not public. The repository must be public for anonymous asset downloads, or use
a separate public distribution repository and configure the release workflow.
Do not put GitHub access tokens into the website. No download button should claim
an installer exists before the draft has been tested and published.

## References

- [Tauri GitHub distribution](https://v2.tauri.app/distribute/pipelines/github/)
- [Tauri action inputs](https://github.com/tauri-apps/tauri-action)
- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render free-service limits](https://render.com/docs/free)

If deployment logs show IPv4 `certificate verify failed` followed by IPv6
`Network is unreachable`, resolve the certificate failure first: IPv4 already
reached the endpoint. Deploy the CA-bundle fix rather than disabling TLS validation.
See [libpq TLS verification](https://www.postgresql.org/docs/17/libpq-connect.html#LIBPQ-CONNECT-SSLROOTCERT).
