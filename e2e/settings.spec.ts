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
    "Notifications",
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

test("About diagnostics exclude sensitive data and links stay fixed", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("digita.intro.seen", "yes");
    localStorage.setItem(
      "private-test-marker",
      "/private/project user@example.com bearer-token",
    );
    const native = window as unknown as { copiedSummary: string };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          native.copiedSummary = value;
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "About", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("DiGitA 0.2.0");
  await expect(dialog).toContainText("MIT");
  await expect(
    dialog.getByRole("link", { name: "Help and documentation" }),
  ).toHaveAttribute("href", "https://github.com/ItzSoftTheFox/DiGitA#readme");
  await expect(
    dialog.getByRole("link", { name: "Report an issue" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/ItzSoftTheFox/DiGitA/issues/new",
  );
  await dialog.getByRole("button", { name: "Copy diagnostic summary" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "Diagnostic summary copied.",
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedSummary: string }).copiedSummary,
    ),
  ).toBe("DiGitA diagnostics\nVersion: 0.2.0\nRuntime: browser\nLanguage: en");
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("cs");
  await page.getByRole("button", { name: "O aplikaci", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Kopírovat diagnostický souhrn" })
    .click();
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedSummary: string }).copiedSummary,
    ),
  ).toBe("DiGitA diagnostics\nVersion: 0.2.0\nRuntime: browser\nLanguage: cs");
  await page.setViewportSize({ width: 800, height: 600 });
  await page.screenshot({
    path: "artifacts/about-small-cs.png",
    fullPage: true,
    animations: "disabled",
  });
});
