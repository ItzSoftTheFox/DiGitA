# DiGitA for Arch Linux x86_64

The first distribution package is a native pacman `.pkg.tar.zst`. It contains
the compiled Tauri application, bundled interface, icon, and menu entry.
Running it requires no Node.js, Rust, Python, or local database. Git is needed
to read repositories; pacman installs runtime libraries.
The default pilot backend is `https://digita-hvse.onrender.com`.

## Build from the current working tree

On an up-to-date Arch Linux installation, install any missing build dependencies:

```sh
sudo pacman -S --needed base-devel rust nodejs npm python webkit2gtk-4.1 gtk3 libappindicator openssl git libsoup3 dbus gst-plugins-good
npm ci
bash scripts/build-arch.sh
```

The script builds the release binary with the frontend and API HTTPS/WSS origin,
prepares a local PKGBUILD with checksums, and runs makepkg without sudo.
It neither installs nor publishes anything and does not use GitHub Actions.
The version comes from package.json and is checked against Tauri/Cargo versions.
Set `VITE_API_URL` before running the script to select a different backend.

Output for the current version:

```text
artifacts/arch/digita-0.1.0-1-x86_64.pkg.tar.zst
artifacts/arch/digita-0.1.0-1-x86_64.pkg.tar.zst.sha256
```

`artifacts/arch/stage.*` contains intermediate build directories, not repository
or installed files. The PKGBUILD in `packaging/arch` requires inputs prepared
by the script; it is not a ready-to-use AUR recipe.

## Install and launch

From the repository root:

```sh
sudo pacman -U artifacts/arch/digita-0.1.0-1-x86_64.pkg.tar.zst
digita
```

You can also launch DiGitA from the applications menu. Use the actual archive
path if downloaded elsewhere. Install later versions with the same `pacman -U`
command. Uninstall with `sudo pacman -R digita`.

Remembering sign-in requires an unlocked Secret Service keyring, such as GNOME
Keyring, in the desktop session. Otherwise, use an in-memory session for the
current launch. Installing the package does not configure a keyring.
New builds default to English; select Czech in **Settings → Language**.
The existing downloadable v0.1.0 archive predates this language setting.

The package targets current Arch x86_64. Older libraries and other distributions
are not verified. It is not signed with a distribution key. SHA-256 verifies
file consistency, not publisher identity.
Before publication, validate installation, startup, sign-in, native Git selection,
two-client collaboration, and audio on a desktop.

## Distributing the package

After validation, attach `.pkg.tar.zst` and `.sha256` to a test GitHub Release.
The website can link directly to that published asset. Do not publish `.env`,
database credentials, or build directories. macOS, Windows, and a general Linux
AppImage remain deferred.

References: [Arch makepkg](https://man.archlinux.org/man/makepkg.8),
[Tauri distribution for Arch](https://v2.tauri.app/distribute/aur/).
