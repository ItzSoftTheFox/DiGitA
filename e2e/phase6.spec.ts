import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const server = "http://127.0.0.1:8001";
const password = "a phase six test password";
type Account = { email: string; token: string; name: string };
const headers = (user: Account) => ({ Authorization: `Bearer ${user.token}` });

async function account(
  request: APIRequestContext,
  name: string,
): Promise<Account> {
  const email = `phase6-${crypto.randomUUID()}@example.com`;
  const registered = await request.post(`${server}/auth/register`, {
    data: { email, password, display_name: name },
  });
  expect(registered.status()).toBe(201);
  const login = await request.post(`${server}/auth/login`, {
    data: { email, password },
  });
  expect(login.ok()).toBe(true);
  return { email, name, token: (await login.json()).access_token };
}

async function team(request: APIRequestContext, owner: Account, name: string) {
  const response = await request.post(`${server}/teams`, {
    headers: headers(owner),
    data: { name },
  });
  expect(response.status()).toBe(201);
  const created = await response.json();
  const roomResponse = await request.post(
    `${server}/teams/${created.id}/rooms`,
    {
      headers: headers(owner),
      data: { name: `${name} room` },
    },
  );
  expect(roomResponse.status()).toBe(201);
  return { ...created, room: await roomResponse.json() };
}

async function signIn(page: Page, user: Account) {
  await page.addInitScript(() =>
    localStorage.setItem("digita.intro.seen", "yes"),
  );
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Everything has its place." }),
  ).toBeVisible();
}

async function nativeRepository(page: Page) {
  await page.addInitScript(() => {
    const native = window as unknown as {
      isTauri: boolean;
      selectedFolder: string;
      failGit: boolean;
      incompleteGit: boolean;
      copied: string;
      __TAURI_INTERNALS__: unknown;
    };
    native.isTauri = true;
    native.selectedFolder = "/private/phase-six";
    native.failGit = false;
    native.incompleteGit = false;
    native.copied = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          native.copied = text;
        },
      },
    });
    native.__TAURI_INTERNALS__ = {
      invoke: async (
        command: string,
        args?: { path?: string; preferences?: unknown },
      ) => {
        if (command === "load_preferences")
          return JSON.parse(
            localStorage.getItem("phase6.preferences") ?? "null",
          );
        if (command === "save_preferences") {
          localStorage.setItem(
            "phase6.preferences",
            JSON.stringify(args?.preferences),
          );
          return null;
        }
        if (
          [
            "load_session",
            "save_session",
            "clear_session",
            "clear_preferences",
          ].includes(command)
        )
          return null;
        if (command === "plugin:dialog|open") return native.selectedFolder;
        if (command === "read_repository") {
          if (native.failGit)
            throw new Error("Git timed out; repository status is unavailable.");
          return {
            root: args?.path,
            name: "Phase six project",
            branch: "feature/phase-six",
            detached: false,
            upstream: "origin/main",
            ahead: 3,
            behind: 2,
            operation: "rebase",
            statusComplete: !native.incompleteGit,
            commit: {
              hash: "c".repeat(40),
              subject: "Local subject",
              author: "Private author",
              authoredAt: "2026-10-03T00:00:00Z",
            },
            files: [
              {
                path: "src/shared.ts",
                originalPath: null,
                indexStatus: ".",
                worktreeStatus: "M",
                conflicted: false,
              },
            ],
          };
        }
        throw new Error(`Unexpected native command: ${command}`);
      },
    };
  });
}

test("local tracking, operation and copying remain usable while failed reads show stale data", async ({
  page,
}) => {
  await nativeRepository(page);
  await page.addInitScript(() =>
    localStorage.setItem("digita.intro.seen", "yes"),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Local mode", exact: true }).click();
  await page
    .getByRole("button", { name: "Connect repository", exact: true })
    .click();
  await expect(page.getByText("origin/main", { exact: true })).toBeVisible();
  await expect(page.getByText(/Rebase in progress/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start sharing", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Copy relative path src/shared.ts",
      exact: true,
    })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { copied: string }).copied),
    )
    .toBe("src/shared.ts");
  await page
    .getByRole("button", { name: "Copy full commit hash", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { copied: string }).copied),
    )
    .toBe("c".repeat(40));
  await page.evaluate(() => {
    (window as unknown as { failGit: boolean }).failGit = true;
  });
  await page
    .getByRole("button", { name: "Refresh status", exact: true })
    .click();
  await expect(page.getByText("Out of date", { exact: true })).toBeVisible();
  await expect(page.getByText("src/shared.ts", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Clean working tree", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "artifacts/phase6-stale.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("room sharing requires confirmation and excludes local tracking data; errors withdraw it", async ({
  page,
  request,
}) => {
  const owner = await account(request, "Phase six owner");
  const space = await team(request, owner, "Sharing team");
  const frames: { presence: null | Record<string, unknown> }[] = [];
  page.on("websocket", (socket) =>
    socket.on("framesent", ({ payload }) => {
      const frame = JSON.parse(String(payload));
      if (frame.type === "presence.update") frames.push(frame);
    }),
  );
  await nativeRepository(page);
  await signIn(page, owner);
  await page.getByRole("button", { name: new RegExp(space.room.name) }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Connected live" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Connect repository", exact: true })
    .click();
  const dialog = page.getByRole("dialog").filter({
    has: page.getByRole("button", { name: "Start sharing", exact: true }),
  });
  await expect(dialog).toBeVisible();
  expect(frames.every((frame) => frame.presence === null)).toBe(true);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop sharing", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Disconnect repository", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect repository", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("File names", { exact: true }).check();
  await dialog
    .getByLabel("This repository belongs to this room — share Git status")
    .check();
  await dialog
    .getByRole("button", { name: "Start sharing", exact: true })
    .click();
  await expect
    .poll(() => frames.some((frame) => frame.presence !== null))
    .toBe(true);
  const shared = frames.find((frame) => frame.presence !== null)!.presence!;
  expect(shared.files).toEqual(["src/shared.ts"]);
  for (const field of [
    "upstream",
    "ahead",
    "behind",
    "operation",
    "statusComplete",
    "root",
    "author",
  ])
    expect(shared).not.toHaveProperty(field);
  expect(JSON.stringify(frames)).not.toContain("/private/phase-six");
  expect(JSON.stringify(frames)).not.toContain("origin/main");
  const count = frames.length;
  await page.evaluate(() => {
    (window as unknown as { incompleteGit: boolean }).incompleteGit = true;
  });
  await page
    .getByRole("button", { name: "Refresh status", exact: true })
    .click();
  await expect.poll(() => frames.length).toBeGreaterThan(count);
  expect(frames.slice(count).every((frame) => frame.presence === null)).toBe(
    true,
  );
  await expect(page.getByText("Out of date", { exact: true })).toBeVisible();
});

test("joined-team switching retains profile and owner deletion promptly ejects a live teammate", async ({
  browser,
  request,
}) => {
  const owner = await account(request, "Sidebar owner");
  const member = await account(request, "Sidebar member");
  const first = await team(request, owner, "First space");
  const second = await team(request, owner, "Second space");
  const invitation = await request.post(
    `${server}/teams/${first.id}/invitations`,
    { headers: headers(owner) },
  );
  expect(invitation.status()).toBe(201);
  const accepted = await request.post(`${server}/invitations/accept`, {
    headers: headers(member),
    data: { code: (await invitation.json()).code },
  });
  expect(accepted.ok()).toBe(true);
  expect(
    (
      await request.delete(`${server}/teams/${first.id}`, {
        headers: headers(member),
      })
    ).status(),
  ).toBe(403);
  const ownerContext = await browser.newContext({
    viewport: { width: 1100, height: 800 },
  });
  const memberContext = await browser.newContext();
  try {
    const ownerPage = await ownerContext.newPage();
    const memberPage = await memberContext.newPage();
    await signIn(ownerPage, owner);
    await signIn(memberPage, member);
    const sidebar = ownerPage.getByRole("navigation", {
      name: "Joined teams",
      exact: true,
    });
    await sidebar
      .getByRole("button", { name: "Second space", exact: true })
      .click();
    await expect(
      ownerPage.getByRole("button", { name: /Second space room/ }),
    ).toBeVisible();
    await expect(
      ownerPage.getByRole("button", { name: /First space room/ }),
    ).toHaveCount(0);
    await ownerPage
      .getByRole("button", { name: "Local mode", exact: true })
      .click();
    await expect(ownerPage.locator("aside:visible")).toHaveCount(1);
    await expect(
      sidebar.getByRole("button", { name: "Second space", exact: true }),
    ).toBeVisible();
    await expect(
      ownerPage
        .getByRole("navigation", { name: "Team rooms", exact: true })
        .getByRole("button", { name: "Second space room", exact: true }),
    ).toBeVisible();
    await sidebar
      .getByRole("button", { name: "First space", exact: true })
      .focus();
    await ownerPage.keyboard.press("Enter");
    await expect(
      ownerPage.getByRole("button", { name: /First space room/ }),
    ).toBeVisible();
    await memberPage.getByRole("button", { name: /First space room/ }).click();
    await expect(
      memberPage.getByRole("status").filter({ hasText: "Connected live" }),
    ).toBeVisible();
    await ownerPage
      .getByRole("button", { name: "Team menu", exact: true })
      .click();
    ownerPage.once("dialog", (dialog) => dialog.dismiss());
    await ownerPage
      .getByRole("button", { name: "Delete team", exact: true })
      .click();
    expect(
      (
        await request.get(`${server}/teams/${first.id}/rooms`, {
          headers: headers(owner),
        })
      ).ok(),
    ).toBe(true);
    ownerPage.once("dialog", (dialog) => dialog.accept());
    await ownerPage
      .getByRole("button", { name: "Delete team", exact: true })
      .click();
    await expect(
      ownerPage.getByRole("button", { name: /Second space room/ }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("heading", { name: "Everything has its place." }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("button", { name: /First space room/ }),
    ).toHaveCount(0);
    expect(
      (
        await request.get(`${server}/teams/${first.id}/rooms`, {
          headers: headers(owner),
        })
      ).status(),
    ).toBe(404);
    await ownerPage
      .getByRole("button", { name: "Local mode", exact: true })
      .click();
    await expect(ownerPage.locator(".signed-profile")).toContainText(
      owner.name,
    );
    await expect(
      ownerPage.getByRole("button", { name: "Settings", exact: true }),
    ).toBeVisible();
    await expect(ownerPage.locator("aside:visible")).toHaveCount(1);
    const localSidebar = ownerPage.locator(".team-sidebar");
    await expect(ownerPage.locator("aside")).toHaveCount(1);
    const localMain = ownerPage.locator(
      ".unified-local-workspace > .main-shell",
    );
    await expect
      .poll(async () => {
        const bounds = await localMain.boundingBox();
        return bounds ? bounds.x + bounds.width : 0;
      })
      .toBe(1100);
    await expect(
      localSidebar.getByRole("link", { name: "Overview", exact: true }),
    ).toBeVisible();
    await expect(
      localSidebar.getByRole("button", { name: "Local mode", exact: true }),
    ).toHaveAttribute("aria-current", "true");
    const roomNavigation = localSidebar.getByRole("navigation", {
      name: "Team rooms",
      exact: true,
    });
    await expect(
      roomNavigation.getByRole("button", {
        name: "Second space room",
        exact: true,
      }),
    ).toBeVisible();
    await roomNavigation
      .getByRole("button", { name: "Second space room", exact: true })
      .click();
    await expect(
      ownerPage.getByRole("status").filter({ hasText: "Connected live" }),
    ).toBeVisible();
    await localSidebar
      .getByRole("button", { name: "Local mode", exact: true })
      .click();
    await expect(ownerPage.locator("aside:visible")).toHaveCount(1);
    await ownerPage.setViewportSize({ width: 800, height: 800 });
    await expect
      .poll(async () => {
        const bounds = await localMain.boundingBox();
        return bounds ? bounds.x + bounds.width : 0;
      })
      .toBe(800);
    await expect(
      localSidebar.getByRole("link", { name: "Overview", exact: true }),
    ).toBeVisible();
    await expect(
      localSidebar.getByRole("button", { name: "Settings", exact: true }),
    ).toBeVisible();
    await expect(
      roomNavigation.getByRole("button", {
        name: "Second space room",
        exact: true,
      }),
    ).toBeVisible();
    await ownerPage.screenshot({
      path: "artifacts/sidebar-local-small.png",
      fullPage: true,
      animations: "disabled",
    });
    await ownerPage.setViewportSize({ width: 1100, height: 800 });
    await ownerPage.screenshot({
      path: "artifacts/phase6-sidebar.png",
      fullPage: true,
      animations: "disabled",
    });
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});
