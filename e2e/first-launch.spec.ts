import { expect, test, type Page } from "@playwright/test";

async function loginForm(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip intro" }).click();
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
}

test("intro is skippable, remembered, reopenable, translated, and usable on narrow screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto("/");
  await expect(page.getByRole("dialog")).toContainText("Sharing starts off.");
  await expect(page.getByRole("dialog")).toHaveCSS("border-radius", "0px");
  await page
    .getByRole("dialog")
    .screenshot({ path: "artifacts/quick-start.png" });
  await page.getByRole("button", { name: "Skip intro" }).click();
  await page.reload();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("keep@example.com");
  await expect(
    page
      .getByRole("navigation", { name: "Application menu" })
      .getByRole("button", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCSS("border-radius", "0px");
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("cs");
  await page.getByRole("button", { name: "O aplikaci", exact: true }).click();
  await page.getByRole("button", { name: "Rychlý úvod" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Sdílení je zpočátku vypnuté.",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(
    "keep@example.com",
  );
});

test("slow server and network outage keep local mode available", async ({
  page,
  context,
}) => {
  await page.clock.install();
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/auth/login", async (route) => {
    await wait;
    await route.abort();
  });
  await loginForm(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.clock.fastForward(8100);
  await expect(page.getByRole("status")).toContainText(
    "server may be waking up",
  );
  await page.getByRole("button", { name: "Local mode", exact: true }).click();
  await page.getByRole("button", { name: "View demo" }).click();
  await context.setOffline(true);
  await expect(
    page.getByText(
      "You are offline. Local Git remains available. Reconnect to use your team.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Search files" }),
  ).toBeVisible();
  release();
  await context.setOffline(false);
});

test("rate limit has a cooldown, server internals stay hidden, and registration closure is explained", async ({
  page,
}) => {
  await page.clock.install();
  let requests = 0;
  await page.route("**/auth/login", async (route) => {
    requests++;
    await route.fulfill({
      status: 429,
      headers: {
        "Retry-After": "2",
        "Access-Control-Expose-Headers": "Retry-After",
      },
      json: { detail: "private server internals" },
    });
  });
  await page.route("**/auth/register", (route) =>
    route.fulfill({
      status: 403,
      json: { detail: "private server internals" },
    }),
  );
  await loginForm(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Too many requests. Please wait before trying again.",
  );
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("You can try again in 2 seconds.")).toBeVisible();
  await page.clock.fastForward(2100);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "No account? Register" }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Test user");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Registration is currently closed.",
  );
  await expect(page.locator("body")).not.toContainText(
    "private server internals",
  );
});

test("authentication errors dismiss on click or after five seconds without clearing the draft", async ({
  page,
}) => {
  await page.clock.install();
  await page.route("**/auth/login", (route) =>
    route.fulfill({ status: 401, json: {} }),
  );
  await loginForm(page);
  const submit = page.getByRole("button", { name: "Sign in", exact: true });
  await submit.click();
  await expect(page.getByRole("alert")).toHaveText(
    "Incorrect email or password.",
  );
  await page.getByRole("alert").getByRole("button").click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await submit.click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.clock.fastForward(4900);
  await expect(page.getByRole("alert")).toBeVisible();
  await page.clock.fastForward(200);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "test@example.com",
  );
});
