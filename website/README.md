# DiGitA — prezentační web

Samostatné HTML + Tailwind CSS 4, malý JavaScript pro přepínání ukázek a animace.
Žádné API, přihlašování, analytika ani externí fonty. Podporuje mobilní zobrazení,
ovládání klávesnicí a `prefers-reduced-motion`.

## Úpravy a místní náhled

Z kořene repozitáře:

```sh
npm ci --prefix website
npm run build --prefix website
python3 -m http.server 4174 --bind 127.0.0.1 --directory docs
```

Otevřete http://127.0.0.1:4174. Editujte `website/index.html`, `styles.css`
a `site.js`. Build uloží hotový web do `docs/index.html` a `docs/assets/`.
Tyto výstupy se commitují společně se zdroji. Obrázky jsou v `docs/images/`.
Build ověřuje SHA-256 přibaleného instalátoru a doplní jeho skutečnou velikost.

## GitHub Pages

1. Commitněte a pushněte web včetně `docs/assets`, `docs/images`, `docs/downloads`
   a `docs/.nojekyll` do `main`.
2. V GitHub repozitáři otevřete **Settings → Pages**.
3. V **Build and deployment → Source** vyberte **Deploy from a branch**.
4. Nastavte větev **main**, složku **/docs** a klikněte **Save**.
5. GitHub zobrazí adresu zveřejněného webu; pro tento repozitář je očekávaná
   `https://itzsoftthefox.github.io/DiGitA/`.

Pro bezplatné Pages na GitHub Free musí být repozitář veřejný. Web je předem
sestavený; `.nojekyll` vypíná Jekyll. Není potřeba přidávat ani znovu zapínat
vlastní Actions workflow pro build aplikace. Všechny místní cesty jsou relativní,
takže web funguje i pod `/DiGitA/`.

Postup: [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Stažení

Pilotní Arch x86_64 balíček v0.1.0 je přímo v `docs/downloads/`, včetně SHA-256.
Má přibližně 4.2 MiB. Web tedy neodkazuje na neexistující release asset.
Balíček je nepodepsaný a instalace na čistém systému zatím nebyla ověřena;
web ho zřetelně označuje jako vývojový pilot. [Instalace](../docs/arch-linux.md).

Při nové verzi nahraďte soubor i kontrolní součet, aktualizujte název a verzi
v `website/index.html` a `website/build.mjs`, potom spusťte build.
Pro pravidelná vydání přesuňte binární soubory do veřejných GitHub Releases
(až bude daný asset publikovaný) a změňte odkaz na jeho přesnou URL.
Binaries ve větvi jsou nyní jen jednoduchá distribuce prvního pilotu.

Windows a macOS jsou na webu označeny jako plánované, bez falešných downloadů.
