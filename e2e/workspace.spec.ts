import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("digita.intro.seen", "yes"),
  );
});

test("browser preview, filtering and layouts", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Local mode" }).click();
  await expect(
    page.getByRole("heading", { name: "Great things start locally." }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/workspace-empty.png",
    fullPage: true,
    animations: "disabled",
  });
  // The fixed sidebar must not cover navigation back to online mode.
  await page.getByRole("button", { name: "Sign in online" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Local mode" }).click();
  await page.getByRole("button", { name: "View demo" }).click();
  await expect(page.getByText("DEMO REPOSITORY")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.screenshot({
    path: "artifacts/workspace-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: /^Staged/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Search files" }).fill("nothing");
  await expect(page.getByText("No matching files")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: /^All/ }).click();
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
  await page.getByRole("button", { name: "Disconnect repository" }).click();
  await expect(
    page.getByRole("heading", { name: "Great things start locally." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign in online" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Local mode" }).click();
  expect(
    await page
      .locator(".orbit-two")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});
