import { expect, test } from "@playwright/test";

test("browser preview, filtering and layouts", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Velké věci začínají lokálně." }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/workspace-empty.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Prohlédnout ukázku" }).click();
  await expect(page.getByText("UKÁZKOVÝ REPOZITÁŘ")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.screenshot({
    path: "artifacts/workspace-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: /^Připravené/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Hledat soubor" }).fill("nothing");
  await expect(page.getByText("Žádné odpovídající soubory")).toBeVisible();
  await page.getByRole("button", { name: "Vymazat hledání" }).click();
  await page.getByRole("button", { name: /^Vše/ }).click();
  for (const width of [1200, 760, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "artifacts/workspace-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Odpojit repozitář" }).click();
  await expect(
    page.getByRole("heading", { name: "Velké věci začínají lokálně." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(
    await page
      .locator(".orbit-two")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});
