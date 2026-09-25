import { expect, test } from "@playwright/test";

test("Settings supports keyboard return, small windows, and local work", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("digita.intro.seen", "yes"),
  );
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto("/");
  await page.getByRole("button", { name: "Local mode", exact: true }).click();
  await page.getByRole("button", { name: "View demo" }).click();
  await page
    .getByRole("textbox", { name: "Search files" })
    .fill("Workspace.tsx");
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  await settings.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Close settings" }),
  ).toBeFocused();
  for (const section of [
    "Account and profile",
    "Projects",
    "Privacy",
    "Audio and notifications",
    "Language",
    "About",
  ]) {
    await page.getByRole("button", { name: section, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: section, exact: true }),
    ).toBeVisible();
    expect(
      await page
        .getByRole("dialog")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  }
  await page.screenshot({ path: "artifacts/settings-small.png" });
  await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Search files" })).toHaveValue(
    "Workspace.tsx",
  );
  await expect(page.locator("tbody tr")).toHaveCount(1);
});

test("creation drafts survive Settings and errors, and navigation confirms discarding", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("digita.intro.seen", "yes"),
  );
  await page.route("**/auth/login", (route) =>
    route.fulfill({ json: { access_token: "test" } }),
  );
  await page.route("**/auth/me", (route) =>
    route.fulfill({
      json: {
        id: "u",
        display_name: "Draft user",
        email: "private@example.com",
      },
    }),
  );
  await page.route("**/teams", (route) =>
    route.fulfill(
      route.request().method() === "POST"
        ? { status: 403, json: { detail: "Access denied." } }
        : { json: [] },
    ),
  );
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("private@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("password-long-enough");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Unsaved team");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Draft user");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Unsaved team",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Local mode", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Unsaved team",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
});
