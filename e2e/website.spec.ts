import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

// Serve the actual generated Pages files without an external host or provider.
async function serveWebsite(page: Page) {
  const root = resolve("docs");
  const mime: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  };
  await page.route("http://digita-site.test/DiGitA/**", async (route) => {
    const relative = decodeURIComponent(
      new URL(route.request().url()).pathname.slice("/DiGitA/".length),
    );
    const file = resolve(root, relative || "index.html");
    if (!file.startsWith(root + sep)) return route.fulfill({ status: 404 });
    try {
      await route.fulfill({
        body: await readFile(file),
        contentType: mime[extname(file)] ?? "application/octet-stream",
      });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
}

test("English website works under the Pages path at desktop and mobile sizes", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await serveWebsite(page);
  await page.goto("http://digita-site.test/DiGitA/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle("DiGitA — Space for your work.");
  await expect(
    page.getByRole("link", { name: "Download DiGitA" }),
  ).toBeVisible();
  await expect(page.locator(".package-meta")).toContainText("v0.2.0");
  await expect(
    page.getByRole("link", { name: "Download DiGitA" }),
  ).toHaveAttribute("href", "./downloads/digita-0.2.0-1-x86_64.pkg.tar.zst");
  await expect(page.getByRole("link", { name: "SHA-256" })).toHaveAttribute(
    "href",
    "./downloads/digita-0.2.0-1-x86_64.pkg.tar.zst.sha256",
  );
  await expect(page.locator(".download-note")).toContainText(
    "clean installation, upgrade and uninstall have not been verified",
  );
  await expect(page.getByText(/shared ambient track|your volume/)).toHaveCount(
    0,
  );
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  for (const name of ["dashboard", "conflict-radar", "workspace"]) {
    await page.locator(`[data-preview="${name}"]`).click();
    await expect(page.locator("#preview-image")).toHaveAttribute(
      "src",
      `./images/${name}.png`,
    );
    await expect
      .poll(() =>
        page
          .locator("#preview-image")
          .evaluate(
            (image: HTMLImageElement) =>
              image.complete && image.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await expect(
      page.locator('[data-preview][aria-pressed="true"]'),
    ).toHaveCount(1);
  }
  await page
    .getByText("Is this an app or a website?", { exact: false })
    .click();
  await expect(page.locator(".faq-list details").first()).toHaveAttribute(
    "open",
    "",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.locator(".reveal-await").count()).toBe(0);
  expect(
    await page
      .locator(".orbit-outer")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "artifacts/site-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/site-mobile.png", fullPage: true });
  expect(errors).toEqual([]);

  const noJs = await browser.newPage({ javaScriptEnabled: false });
  try {
    await serveWebsite(noJs);
    await noJs.goto("http://digita-site.test/DiGitA/");
    await expect(
      noJs.getByRole("link", { name: "Download DiGitA" }),
    ).toBeVisible();
    await expect(
      noJs.getByRole("heading", { name: "Arch Linux", exact: true }),
    ).toBeVisible();
  } finally {
    await noJs.close();
  }
});
