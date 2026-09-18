# DiGitA pro Arch Linux x86_64

První distribuční balíček je nativní `.pkg.tar.zst` pro pacman. Obsahuje
zkompilovanou Tauri aplikaci, přibalené rozhraní, ikonu a položku v menu.
Při používání není potřeba Node.js, Rust, Python ani lokální databáze.
Git je potřebný pro čtení repozitářů; systémové knihovny nainstaluje pacman.
Backend je `https://digita-hvse.onrender.com`.

## Sestavení z aktuálního pracovního stromu

Na aktualizovaném Arch Linuxu nainstaluj build závislosti, pokud ještě chybí:

```sh
sudo pacman -S --needed base-devel rust nodejs npm python webkit2gtk-4.1 gtk3 libappindicator openssl git libsoup3 dbus gst-plugins-good
npm ci
bash scripts/build-arch.sh
```

Skript sestaví release binárku s vloženým frontendem a HTTPS/WSS adresou serveru,
připraví lokální PKGBUILD s kontrolními součty a spustí makepkg bez sudo.
Nic neinstaluje ani nepublikuje. GitHub Actions se nepoužívají.
Verze se přebírá z package.json a kontroluje proti Tauri/Cargo verzím.
Jiný backend lze zvolit proměnnou `VITE_API_URL` před spuštěním skriptu.

Výstup pro aktuální verzi:

```text
artifacts/arch/digita-0.1.0-1-x86_64.pkg.tar.zst
artifacts/arch/digita-0.1.0-1-x86_64.pkg.tar.zst.sha256
```

`artifacts/arch/stage.*` jsou pomocné adresáře z jednotlivých sestavení.
Nejsou součástí repozitáře ani instalovaného balíčku. Samotný PKGBUILD v
packaging/arch vyžaduje vstupy připravené skriptem; není to hotový AUR recept.

## Instalace a spuštění

Z kořene projektu:

```sh
sudo pacman -U artifacts/arch/digita-0.1.0-1-x86_64.pkg.tar.zst
digita
```

Aplikaci lze spustit také z menu prostředí. Pokud máš stažený balíček jinde,
použij jeho cestu. Další verzi nainstaluj stejným příkazem `pacman -U`.
Odinstalace: `sudo pacman -R digita`.

Pro zapamatování přihlášení musí v uživatelské relaci fungovat odemčená
Secret Service klíčenka (např. GNOME Keyring). Bez ní lze použít přihlášení
pro aktuální spuštění. Instalace samotného balíčku klíčenku nenastavuje.

Balíček je určen pro aktuální Arch x86_64; kompatibilita se staršími knihovnami
nebo jinými distribucemi není garantovaná. Není podepsaný distribučním klíčem.
SHA-256 ověřuje shodu souboru, nikoliv identitu vydavatele.
Před zveřejněním ověř na desktopu instalaci, start, přihlášení, výběr Git
repozitáře, spolupráci dvou klientů a přehrávání zvuku.

## Stažení pro ostatní

Po ověření přilož `.pkg.tar.zst` a `.sha256` jako soubory testovacího
GitHub Release. Web může odkazovat přímo na tento publikovaný balíček.
Není potřeba zveřejňovat `.env`, databázové připojení ani build adresáře.
macOS/Windows a obecný Linux AppImage jsou zatím odložené.

Reference: [Arch makepkg](https://man.archlinux.org/man/makepkg.8),
[Tauri distribuce pro Arch](https://v2.tauri.app/distribute/aur/).
