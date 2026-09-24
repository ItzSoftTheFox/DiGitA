import { expect, test } from "@playwright/test";

test.use({ locale: "cs-CZ" });

test("English defaults, language persistence, and switching without losing drafts or local work", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByLabel("Email", { exact: true }).fill("draft@example.com");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .screenshot({ path: "artifacts/settings-english.png" });
  await page.getByLabel("Language", { exact: true }).selectOption("cs");
  await expect(page.locator("html")).toHaveAttribute("lang", "cs");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Nastavení", exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(
    "draft@example.com",
  );
  await expect(
    page.getByRole("heading", { name: "Přihlásit se", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "cs");
  await page.getByRole("button", { name: "Nastavení", exact: true }).click();
  await page.getByLabel("Jazyk", { exact: true }).selectOption("en");
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.getByRole("button", { name: "Local mode" }).click();
  await page.getByRole("button", { name: "View demo" }).click();
  await page
    .getByRole("textbox", { name: "Search files" })
    .fill("Workspace.tsx");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("cs");
  await page.getByRole("button", { name: "Zavřít nastavení" }).click();
  await expect(
    page.getByRole("textbox", { name: "Hledat soubor" }),
  ).toHaveValue("Workspace.tsx");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText(
    "src/components/Workspace.tsx",
  );
});

test("a blocked language store shows a useful warning without blocking the switch", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "digita.language")
        throw new DOMException("Blocked", "SecurityError");
      return original.call(this, key, value);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("cs");
  await expect(page.getByRole("alert")).toContainText(
    "Jazyk se nepodařilo uložit",
  );
  await page.getByRole("button", { name: "Zavřít nastavení" }).click();
  await expect(
    page.getByRole("heading", { name: "Přihlásit se", exact: true }),
  ).toBeVisible();
});
