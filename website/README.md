# DiGitA — product website

Standalone HTML + Tailwind CSS 4 with a small JavaScript file for previews and
animations. English is the website's primary language. There is no API, login,
analytics, or external font dependency. Mobile layouts, keyboard navigation,
and `prefers-reduced-motion` are supported.

## Editing and local preview

From the repository root:

```sh
npm ci --prefix website
npm run build --prefix website
python3 -m http.server 4174 --bind 127.0.0.1 --directory docs
```

Open http://127.0.0.1:4174. Edit `website/index.html`, `styles.css`, and `site.js`.
The build writes `docs/index.html` and `docs/assets/`. Commit these outputs along
with the sources. Images live in `docs/images/`. The build verifies the bundled
installer's SHA-256 and inserts its actual size.

## GitHub Pages

1. Commit and push the website, including `docs/assets`, `docs/images`,
   `docs/downloads`, and `docs/.nojekyll`, to `main`.
2. Open repository **Settings → Pages**.
3. Under **Build and deployment → Source**, select **Deploy from a branch**.
4. Select **main**, folder **/docs**, and **Save**.
5. GitHub displays the published URL, expected to be
   `https://itzsoftthefox.github.io/DiGitA/` for this repository.

The intended setup uses a public repository and GitHub Free. Check the account's
actual Pages availability before publishing. The website is prebuilt; `.nojekyll`
disables Jekyll. No custom application-build Actions workflow needs enabling.
Local asset paths are relative, so the website also works under `/DiGitA/`.

Reference: [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Downloads

The v0.1.0 Arch x86_64 pilot package and SHA-256 are stored in `docs/downloads/`.
The archive is about 4.2 MiB; the site does not depend on an unpublished release
asset. It is unsigned and has not been tested on a clean installation. The site
labels it as a development pilot. See the [installation guide](../docs/arch-linux.md).

When releasing a new version, replace the archive and checksum, update the name
and version in `website/index.html` and `website/build.mjs`, and rebuild.
For regular releases, move binaries to public GitHub Releases after their assets
are published and link the exact URLs. Binaries in the branch are a temporary
way to distribute the first pilot.

Windows and macOS are marked as planned, with no nonfunctional download links.
The existing v0.1.0 archive predates the English-default UI; source changes do
not update that binary. Rebuild and validate a package before replacing it.

## Browser verification

With the root application's E2E prerequisites installed, run
`npm run test:e2e -- e2e/website.spec.ts` from the repository root. The test serves
the generated files through Playwright's local request routing under `/DiGitA/`;
it checks English content, previews, responsive layouts, reduced motion, and
no-JavaScript access without a public deployment.
