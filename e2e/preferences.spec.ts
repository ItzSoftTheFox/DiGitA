import { expect, test, type Page } from "@playwright/test";

const nativeStorageKey = "e2e.phase4.preferences";
const firstPath = "/private/projects/first";
const secondPath = "/private/projects/second";

type Preferences = {
  version: number;
  recentProjects: { path: string; name: string }[];
  activeProjectPath: string | null;
  roomProjects: {
    server: string;
    accountId: string;
    roomId: string;
    path: string;
  }[];
  volume: number;
  notificationsEnabled: boolean;
};

const initialPreferences = (): Preferences => ({
  version: 1,
  recentProjects: [
    { path: firstPath, name: "First project" },
    { path: secondPath, name: "Second project" },
  ],
  activeProjectPath: firstPath,
  roomProjects: [],
  volume: 63,
  notificationsEnabled: true,
});

// Native filesystem/OS boundaries are mocked; persistence survives page reload.
// HTTP and WebSocket room traffic uses the disposable test backend.
async function installNative(page: Page, preferences = initialPreferences()) {
  await page.addInitScript(
    ({ preferences, storageKey }) => {
      localStorage.setItem("digita.intro.seen", "yes");
      if (!localStorage.getItem("e2e.phase4.seeded")) {
        localStorage.setItem(storageKey, JSON.stringify(preferences));
        localStorage.setItem("e2e.phase4.seeded", "yes");
      }
      const native = window as unknown as {
        isTauri: boolean;
        selectedFolder: string;
        missingFolders: string[];
        permissionRequests: number;
        nativeCalls: string[];
        failSave: boolean;
        __TAURI_INTERNALS__: unknown;
      };
      native.isTauri = true;
      native.selectedFolder = "/private/projects/second";
      native.missingFolders = [];
      native.permissionRequests = 0;
      native.nativeCalls = [];
      native.failSave = false;
      Object.defineProperty(window.Notification, "permission", {
        get: () => "default",
      });
      window.Notification.requestPermission = async () => {
        native.permissionRequests += 1;
        return "denied";
      };
      native.__TAURI_INTERNALS__ = {
        invoke: async (
          command: string,
          args?: { preferences?: unknown; path?: string },
        ) => {
          native.nativeCalls.push(command);
          if (command === "load_preferences")
            return JSON.parse(localStorage.getItem(storageKey) ?? "null");
          if (command === "save_preferences") {
            if (native.failSave)
              throw new Error("Could not save local preferences.");
            localStorage.setItem(storageKey, JSON.stringify(args?.preferences));
            return null;
          }
          if (command === "clear_preferences") {
            localStorage.removeItem(storageKey);
            return null;
          }
          if (command === "plugin:dialog|open") return native.selectedFolder;
          if (command === "plugin:notification|is_permission_granted")
            return false;
          if (
            ["load_session", "clear_session", "save_session"].includes(command)
          )
            return null;
          if (command === "read_repository") {
            if (native.missingFolders.includes(args?.path ?? ""))
              throw new Error("The selected repository is unavailable.");
            const first = args?.path === "/private/projects/first";
            return {
              root: args?.path,
              name: first ? "First project" : "Second project",
              branch: first ? "first-branch" : "second-branch",
              detached: false,
              commit: null,
              files: [
                {
                  path: first ? "src/first.ts" : "src/second.ts",
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
    },
    { preferences, storageKey: nativeStorageKey },
  );
}

async function settings(page: Page, section: string) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: section, exact: true }).click();
  return page.getByRole("dialog");
}

test("restores personal volume without requesting OS permission or opening folders in browser preview", async ({
  page,
}) => {
  await page.addInitScript((preferences) => {
    localStorage.setItem("digita.intro.seen", "yes");
    if (!localStorage.getItem("digita.preferences.v1"))
      localStorage.setItem(
        "digita.preferences.v1",
        JSON.stringify(preferences),
      );
  }, initialPreferences());
  await page.goto("/");
  const dialog = await settings(page, "Audio and notifications");
  await expect(dialog.getByRole("slider", { name: /My volume/ })).toHaveValue(
    "63",
  );
  await dialog.getByRole("slider", { name: /My volume/ }).fill("48");
  await page.reload();
  await settings(page, "Audio and notifications");
  await expect(page.getByRole("slider", { name: /My volume/ })).toHaveValue(
    "48",
  );
});

test("native recent projects restore and can be switched, removed, and cleared", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installNative(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Local mode", exact: true }).click();
  await expect(page.getByText("src/first.ts", { exact: true })).toBeVisible();
  await expect(page.locator("aside:visible")).toHaveCount(1);
  const localSettings = page
    .locator(".local-profile")
    .getByRole("button", { name: "Settings", exact: true });
  await expect(localSettings).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toHaveCount(1);
  await page.screenshot({
    path: "artifacts/sidebar-local-unsigned.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 800, height: 800 });
  await expect(localSettings).toBeVisible();
  await localSettings.click();
  await expect(
    page.getByRole("dialog", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.screenshot({
    path: "artifacts/sidebar-local-unsigned-small.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await settings(page, "Projects");
  await page
    .locator(".recent-projects li")
    .filter({ hasText: "Second project" })
    .getByRole("button", { name: "Open repository", exact: true })
    .click();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.getByText("src/second.ts", { exact: true })).toBeVisible();
  await expect(page.getByText("src/first.ts", { exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Local mode", exact: true }).click();
  await expect(page.getByText("src/second.ts", { exact: true })).toBeVisible();
  await settings(page, "Projects");
  await page
    .getByRole("button", {
      name: "Remove Second project from recent projects",
      exact: true,
    })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", {
      name: "Clear project and audio preferences",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("No remembered repositories yet.", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), nativeStorageKey),
  ).toBeNull();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(
    page.getByRole("heading", { name: "Great things start locally." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { permissionRequests: number })
          .permissionRequests,
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
});

test("a missing remembered folder offers reassignment and saves the replacement", async ({
  page,
}) => {
  await installNative(page);
  await page.goto("/");
  await page.evaluate((path) => {
    (window as unknown as { missingFolders: string[] }).missingFolders = [path];
  }, firstPath);
  await page.getByRole("button", { name: "Local mode", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reassign folder", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reassign folder", exact: true })
    .click();
  await expect(page.getByText("src/second.ts", { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const stored = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
        nativeStorageKey,
      );
      return stored?.activeProjectPath;
    })
    .toBe(secondPath);
  await page.reload();
  await page.getByRole("button", { name: "Local mode", exact: true }).click();
  await expect(page.getByText("src/second.ts", { exact: true })).toBeVisible();
});

test("failed saving keeps session changes visible and can be retried", async ({
  page,
}) => {
  await installNative(page);
  await page.goto("/");
  await page.evaluate(() => {
    (window as unknown as { failSave: boolean }).failSave = true;
  });
  const dialog = await settings(page, "Audio and notifications");
  await dialog.getByRole("slider", { name: /My volume/ }).fill("40");
  await expect(dialog.getByRole("alert")).toContainText(
    "Could not save local preferences.",
  );
  await expect(dialog.getByRole("slider", { name: /My volume/ })).toHaveValue(
    "40",
  );
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    nativeStorageKey,
  );
  expect(stored.volume).toBe(63);
  await page.evaluate(() => {
    (window as unknown as { failSave: boolean }).failSave = false;
  });
  await dialog
    .getByRole("button", { name: "Retry saving preferences", exact: true })
    .click();
  await expect(
    dialog.getByText("Preferences saved on this device.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await settings(page, "Audio and notifications");
  await expect(page.getByRole("slider", { name: /My volume/ })).toHaveValue(
    "40",
  );
});

test("damaged saved preferences are preserved until an explicit reset", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("digita.intro.seen", "yes");
    localStorage.setItem("digita.preferences.v1", "{damaged");
  });
  await page.goto("/");
  const dialog = await settings(page, "Audio and notifications");
  await expect(dialog.getByRole("alert")).toContainText(
    "Saved data is preserved.",
  );
  await dialog.getByRole("slider", { name: /My volume/ }).fill("72");
  expect(
    await page.evaluate(() => localStorage.getItem("digita.preferences.v1")),
  ).toBe("{damaged");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog
    .getByRole("button", {
      name: "Clear project and audio preferences",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByText("Project and audio preferences cleared on this device.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Audio and notifications", exact: true })
    .click();
  await expect(dialog.getByRole("slider", { name: /My volume/ })).toHaveValue(
    "25",
  );
  await dialog.getByRole("slider", { name: /My volume/ }).fill("35");
  await expect(
    dialog.getByText("Preferences saved on this device.", { exact: true }),
  ).toBeVisible();
});

test("room folder restoration and switching always require fresh sharing consent", async ({
  page,
  request,
}) => {
  const server = "http://127.0.0.1:8001";
  const email = `phase4-${Date.now()}@example.com`;
  const password = "a remembered project test password";
  const register = await request.post(`${server}/auth/register`, {
    data: { email, password, display_name: "Project owner" },
  });
  expect(register.ok()).toBe(true);
  const user = await register.json();
  const login = await request.post(`${server}/auth/login`, {
    data: { email, password },
  });
  const token = (await login.json()).access_token;
  const headers = { Authorization: `Bearer ${token}` };
  const teamResponse = await request.post(`${server}/teams`, {
    headers,
    data: { name: "Project team" },
  });
  const team = await teamResponse.json();
  const roomResponse = await request.post(`${server}/teams/${team.id}/rooms`, {
    headers,
    data: { name: "Remembered room" },
  });
  const room = await roomResponse.json();
  const otherRoomResponse = await request.post(
    `${server}/teams/${team.id}/rooms`,
    { headers, data: { name: "Unbound room" } },
  );
  const otherRoom = await otherRoomResponse.json();
  const preferences = initialPreferences();
  preferences.roomProjects = [
    { server, accountId: user.id, roomId: room.id, path: firstPath },
    {
      server: "https://other-server.example.com",
      accountId: user.id,
      roomId: otherRoom.id,
      path: secondPath,
    },
    {
      server,
      accountId: "another-account",
      roomId: otherRoom.id,
      path: secondPath,
    },
  ];
  await installNative(page, preferences);
  const frames: { presence: unknown }[] = [];
  page.on("websocket", (socket) =>
    socket.on("framesent", ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === "presence.update") frames.push(message);
    }),
  );
  async function signIn() {
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  const consent = page.getByLabel(
    "This repository belongs to this room — share Git status",
  );
  await page.goto("/");
  await signIn();
  await page.getByRole("button", { name: /Remembered room/ }).click();
  await expect(page.getByText("src/first.ts", { exact: true })).toBeVisible();
  await expect(consent).not.toBeChecked();
  await expect.poll(() => frames.length).toBeGreaterThan(0);
  expect(frames.every((frame) => frame.presence === null)).toBe(true);
  await expect(page.locator(".ambient-player, audio")).toHaveCount(0);
  await consent.check();
  await page
    .getByRole("button", { name: "Start sharing", exact: true })
    .click();
  await expect
    .poll(() => frames.some((frame) => frame.presence !== null))
    .toBe(true);
  await settings(page, "Projects");
  const frameCount = frames.length;
  await page
    .locator(".recent-projects li")
    .filter({ hasText: "Second project" })
    .getByRole("button", { name: "Open repository", exact: true })
    .click();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.getByText("src/second.ts", { exact: true })).toBeVisible();
  await expect(consent).not.toBeChecked();
  await expect.poll(() => frames.length).toBeGreaterThan(frameCount);
  expect(
    frames.slice(frameCount).every((frame) => frame.presence === null),
  ).toBe(true);
  await page
    .getByRole("dialog", { name: "Choose Git metadata to share" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.getByRole("button", { name: "All rooms", exact: true }).click();
  await page.getByRole("button", { name: /Unbound room/ }).click();
  await expect(
    page.getByRole("button", { name: "Choose sharing", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("src/second.ts", { exact: true })).toHaveCount(0);
  await page.reload();
  await signIn();
  await page.getByRole("button", { name: /Remembered room/ }).click();
  await expect(consent).not.toBeChecked();
  await expect(page.getByText("src/first.ts", { exact: true })).toBeVisible();
  expect(JSON.stringify(frames)).not.toContain("/private/projects/");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { permissionRequests: number })
          .permissionRequests,
    ),
  ).toBe(0);
});
