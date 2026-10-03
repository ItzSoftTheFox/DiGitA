import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const server = "http://127.0.0.1:8001";
const password = "a phase five test password";
type Account = { id: string; email: string; token: string; name: string };

async function account(
  request: APIRequestContext,
  name: string,
): Promise<Account> {
  const email = `${name.toLowerCase()}-${crypto.randomUUID()}@example.com`;
  const registered = await request.post(`${server}/auth/register`, {
    data: { email, password, display_name: name },
  });
  expect(registered.status()).toBe(201);
  const login = await request.post(`${server}/auth/login`, {
    data: { email, password },
  });
  expect(login.ok()).toBe(true);
  return {
    id: (await registered.json()).id,
    email,
    token: (await login.json()).access_token,
    name,
  };
}

const headers = (user: Account) => ({ Authorization: `Bearer ${user.token}` });

async function seed(request: APIRequestContext) {
  const owner = await account(request, "Owner");
  const member = await account(request, "Member");
  const teamResponse = await request.post(`${server}/teams`, {
    headers: headers(owner),
    data: { name: "Phase five team" },
  });
  expect(teamResponse.status()).toBe(201);
  const team = await teamResponse.json();
  const roomResponse = await request.post(`${server}/teams/${team.id}/rooms`, {
    headers: headers(owner),
    data: { name: "Phase five room" },
  });
  expect(roomResponse.status()).toBe(201);
  const room = await roomResponse.json();
  const invitation = await request.post(
    `${server}/teams/${team.id}/invitations`,
    {
      headers: headers(owner),
    },
  );
  const joined = await request.post(`${server}/invitations/accept`, {
    headers: headers(member),
    data: { code: (await invitation.json()).code },
  });
  expect(joined.ok()).toBe(true);
  return { owner, member, team, room };
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

async function enterRoom(page: Page) {
  await page.getByRole("button", { name: /Phase five room/ }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Connected live" }),
  ).toBeVisible();
}

async function nativeRepository(page: Page) {
  // Mock only native folder/Git boundaries; collaboration HTTP and WebSocket are real.
  await page.addInitScript(() => {
    const native = window as unknown as {
      isTauri: boolean;
      __TAURI_INTERNALS__: unknown;
    };
    native.isTauri = true;
    native.__TAURI_INTERNALS__ = {
      invoke: async (command: string) => {
        if (
          [
            "load_preferences",
            "load_session",
            "clear_session",
            "save_session",
            "save_preferences",
          ].includes(command)
        )
          return null;
        if (command === "plugin:dialog|open") return "/private/phase-five";
        if (command === "read_repository")
          return {
            root: "/private/phase-five",
            name: "Local project",
            branch: "private-branch",
            detached: false,
            commit: null,
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
        throw new Error(`Unexpected native command: ${command}`);
      },
    };
  });
}

test("profile drafts recover from failure and live saves preserve sharing and the room socket", async ({
  browser,
  request,
}) => {
  const { owner, member } = await seed(request);
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const errors: string[] = [];
  ownerPage.on("pageerror", (error) => errors.push(error.message));
  memberPage.on("pageerror", (error) => errors.push(error.message));
  let sockets = 0;
  ownerPage.on("websocket", () => {
    sockets += 1;
  });
  try {
    await nativeRepository(ownerPage);
    await signIn(ownerPage, owner);
    await signIn(memberPage, member);
    await enterRoom(ownerPage);
    await enterRoom(memberPage);
    await ownerPage
      .getByRole("button", { name: "Connect repository", exact: true })
      .click();
    const consent = ownerPage.getByLabel(
      "This repository belongs to this room — share Git status",
    );
    await consent.check();
    await ownerPage
      .getByRole("button", { name: "Start sharing", exact: true })
      .click();
    const card = memberPage
      .locator(".member-card")
      .filter({ hasText: "Owner" });
    await expect(card).toContainText("1 changed files");
    const connections = sockets;
    await ownerPage
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await ownerPage
      .getByRole("button", { name: "Account and profile", exact: true })
      .click();
    await ownerPage
      .getByLabel("Display name", { exact: true })
      .fill("Renamed owner");
    await ownerPage
      .getByRole("button", { name: "Language", exact: true })
      .click();
    const discard = ownerPage.getByRole("dialog", {
      name: "Discard profile changes?",
    });
    await expect(discard).toBeVisible();
    await discard
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await expect(
      ownerPage.getByLabel("Display name", { exact: true }),
    ).toHaveValue("Renamed owner");
    await ownerPage
      .getByRole("combobox", { name: "Avatar", exact: true })
      .selectOption("fox");
    await ownerPage
      .getByRole("combobox", { name: "Avatar color", exact: true })
      .selectOption("green");
    await ownerPage
      .getByLabel("Custom status", { exact: true })
      .fill("Reviewing changes");
    await ownerPage.route("**/auth/me", (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({ status: 422, json: { detail: "Invalid profile." } })
        : route.continue(),
    );
    await ownerPage
      .getByRole("button", { name: "Save profile", exact: true })
      .click();
    await expect(
      ownerPage.getByRole("dialog").getByRole("alert"),
    ).toBeVisible();
    await expect(
      ownerPage.getByLabel("Display name", { exact: true }),
    ).toHaveValue("Renamed owner");
    await expect(card).toContainText("Owner");
    await expect(card).not.toContainText("Reviewing changes");
    await ownerPage.unroute("**/auth/me");
    await ownerPage
      .getByRole("button", { name: "Save profile", exact: true })
      .click();
    await expect(card).toContainText("Renamed owner");
    await expect(card).toContainText("Reviewing changes");
    await expect(card).toContainText("1 changed files");
    await ownerPage
      .getByRole("button", { name: "Close settings", exact: true })
      .click();
    await expect(
      ownerPage.getByRole("button", { name: "Stop sharing", exact: true }),
    ).toBeVisible();
    expect(sockets).toBe(connections);
    const saved = await request.get(`${server}/auth/me`, {
      headers: headers(owner),
    });
    expect(await saved.json()).toMatchObject({
      display_name: "Renamed owner",
      avatar: "fox",
      avatar_color: "green",
      custom_status: "Reviewing changes",
    });
    await ownerPage
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await ownerPage
      .getByLabel("Display name", { exact: true })
      .fill("Discard this name");
    await ownerPage.keyboard.press("Escape");
    await expect(discard).toBeVisible();
    await discard.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(
      ownerPage.getByRole("button", { name: "Close settings" }),
    ).toHaveCount(0);
    await ownerPage
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await expect(
      ownerPage.getByLabel("Display name", { exact: true }),
    ).toHaveValue("Renamed owner");
    await ownerPage.screenshot({ path: "artifacts/phase5-profile.png" });
    await ownerPage
      .getByRole("button", { name: "Close settings", exact: true })
      .click();
    await ownerPage
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    await expect(
      ownerPage.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await signIn(ownerPage, owner);
    await ownerPage
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await expect(
      ownerPage.getByLabel("Display name", { exact: true }),
    ).toHaveValue("Renamed owner");
    await expect(
      ownerPage.getByRole("combobox", { name: "Avatar", exact: true }),
    ).toHaveValue("fox");
    await expect(
      ownerPage.getByLabel("Custom status", { exact: true }),
    ).toHaveValue("Reviewing changes");
    expect(errors).toEqual([]);
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});

test("team roles govern invitations and removal promptly revokes live access", async ({
  browser,
  request,
}) => {
  const { owner, member, team, room } = await seed(request);
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  try {
    await signIn(ownerPage, owner);
    await signIn(memberPage, member);
    await ownerPage.getByRole("button", { name: "Team menu" }).click();
    await memberPage.getByRole("button", { name: "Team menu" }).click();
    const ownerAdmin = ownerPage.getByRole("region", {
      name: "Team administration",
    });
    const memberAdmin = memberPage.getByRole("region", {
      name: "Team administration",
    });
    await expect(
      memberAdmin.getByRole("button", { name: "Invite member" }),
    ).toHaveCount(0);
    await expect(
      ownerAdmin.getByRole("combobox", { name: "Role for Owner", exact: true }),
    ).toHaveCount(0);
    await expect(
      ownerAdmin.getByRole("button", { name: "Remove Owner", exact: true }),
    ).toHaveCount(0);
    await expect(
      ownerAdmin.getByRole("button", { name: "Leave team", exact: true }),
    ).toHaveCount(0);
    ownerPage.once("dialog", (dialog) => dialog.accept());
    await ownerAdmin
      .getByRole("combobox", { name: "Role for Member", exact: true })
      .selectOption("admin");
    await expect(
      ownerAdmin.getByRole("combobox", {
        name: "Role for Member",
        exact: true,
      }),
    ).toHaveValue("admin");
    await memberAdmin
      .getByRole("button", { name: "Refresh team", exact: true })
      .click();
    await expect(
      memberAdmin.getByRole("button", { name: "Invite member" }),
    ).toBeVisible();
    await expect(
      memberAdmin.getByRole("combobox", {
        name: "Role for Owner",
        exact: true,
      }),
    ).toHaveCount(0);
    await memberAdmin.getByRole("button", { name: "Invite member" }).click();
    const code = await memberPage
      .getByLabel("Created invitation code")
      .inputValue();
    expect(code).toHaveLength(43);
    await memberContext.grantPermissions(["clipboard-read", "clipboard-write"]);
    await memberAdmin
      .getByRole("button", { name: "Copy invitation code", exact: true })
      .click();
    await expect(
      memberAdmin
        .getByRole("status")
        .filter({ hasText: "Invitation code copied." }),
    ).toBeVisible();
    expect(
      await memberPage.evaluate(() => navigator.clipboard.readText()),
    ).toBe(code);
    const listing = await request.get(
      `${server}/teams/${team.id}/invitations`,
      { headers: headers(member) },
    );
    const invites = await listing.json();
    expect(invites).toHaveLength(1);
    expect(Object.keys(invites[0]).sort()).toEqual(["expires_at", "id"]);
    memberPage.once("dialog", (dialog) => dialog.accept());
    await memberAdmin
      .getByRole("button", {
        name: `Revoke invitation ${invites[0].id}`,
        exact: true,
      })
      .click();
    await expect(
      memberAdmin.getByRole("button", { name: /^Revoke invitation / }),
    ).toHaveCount(0);
    const outsider = await account(request, "Outsider");
    const revoked = await request.post(`${server}/invitations/accept`, {
      headers: headers(outsider),
      data: { code },
    });
    expect(revoked.status()).toBe(404);
    ownerPage.once("dialog", (dialog) => dialog.accept());
    await ownerAdmin
      .getByRole("combobox", { name: "Role for Member", exact: true })
      .selectOption("member");
    await expect(
      ownerAdmin.getByRole("combobox", {
        name: "Role for Member",
        exact: true,
      }),
    ).toHaveValue("member");
    await memberAdmin
      .getByRole("button", { name: "Refresh team", exact: true })
      .click();
    await expect(
      memberAdmin.getByRole("button", { name: "Invite member" }),
    ).toHaveCount(0);
    await enterRoom(memberPage);
    ownerPage.once("dialog", (dialog) => dialog.accept());
    await ownerAdmin
      .getByRole("button", { name: "Remove Member", exact: true })
      .click();
    await expect(
      memberPage.getByRole("status").filter({ hasText: "Connected live" }),
    ).toHaveCount(0);
    await expect(
      memberPage.getByRole("button", { name: "Reconnect", exact: true }),
    ).toHaveCount(0);
    const denied = await request.get(`${server}/rooms/${room.id}`, {
      headers: headers(member),
    });
    expect(denied.status()).toBe(404);
    await ownerPage.screenshot({
      path: "artifacts/phase5-team.png",
      fullPage: true,
    });
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});

test("a member can cancel leaving and then leave without removing the team owner", async ({
  page,
  request,
}) => {
  const { owner, member, team } = await seed(request);
  await signIn(page, member);
  await page.getByRole("button", { name: "Team menu" }).click();
  const admin = page.getByRole("region", { name: "Team administration" });
  page.once("dialog", (dialog) => dialog.dismiss());
  await admin.getByRole("button", { name: "Leave team", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Phase five team", exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await admin.getByRole("button", { name: "Leave team", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Phase five team", exact: true }),
  ).toHaveCount(0);
  const members = await request.get(`${server}/teams/${team.id}/members`, {
    headers: headers(owner),
  });
  expect(
    (await members.json()).map((entry: { user_id: string }) => entry.user_id),
  ).toEqual([owner.id]);
});
