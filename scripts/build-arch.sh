#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $(uname -m) != x86_64 ]] || ! command -v makepkg >/dev/null; then
  echo 'Build this package on Arch Linux x86_64 with makepkg installed.' >&2
  exit 1
fi
export VITE_API_URL="${VITE_API_URL:-https://digita-hvse.onrender.com}"
version=$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version')
export RELEASE_TAG="v${version}"
# Keep the binary location deterministic even when the shell overrides Cargo paths.
export CARGO_TARGET_DIR="$PWD/src-tauri/target"
node scripts/prepare-release.mjs
npm run tauri -- build --no-bundle --config src-tauri/tauri.release.generated.json -- --locked
mkdir -p artifacts/arch
output_dir="$PWD/artifacts/arch"
stage=$(mktemp -d "$PWD/artifacts/arch/stage.XXXXXX")
cp packaging/arch/PKGBUILD "$stage/"
cp packaging/arch/app.digita.desktop.desktop "$stage/"
cp src-tauri/icons/128x128.png "$stage/digita.png"
cp "$CARGO_TARGET_DIR/release/digita" "$stage/digita"
python3 - "$stage" "$version" <<'PY'
import hashlib
from pathlib import Path
import sys
stage = Path(sys.argv[1])
p = stage / 'PKGBUILD'
text = p.read_text().replace('pkgver=0.1.0', 'pkgver=' + sys.argv[2])
names = ['digita', 'app.digita.desktop.desktop', 'digita.png']
hashes = []
for name in names:
    with (stage / name).open('rb') as stream:
        hashes.append(hashlib.file_digest(stream, 'sha256').hexdigest())
text = text.replace("sha256sums=('SKIP' 'SKIP' 'SKIP')", 'sha256sums=(' + ' '.join(repr(h) for h in hashes) + ')')
p.write_text(text)
PY
(
  cd "$stage"
  # This step only packages prebuilt files; pacman resolves runtime dependencies on install.
  PKGDEST="$output_dir" PKGEXT='.pkg.tar.zst' makepkg --force --nodeps
)
package="artifacts/arch/digita-${version}-1-x86_64.pkg.tar.zst"
(cd artifacts/arch && sha256sum "$(basename "$package")" > "$(basename "$package").sha256")
printf '\nPackage: %s\nInstall: sudo pacman -U %q\n' "$package" "$package"
