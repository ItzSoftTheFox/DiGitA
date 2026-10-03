import { expect, test, type Page } from "@playwright/test";

async function register(page: Page, name: string, email: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "No account? Register" }).click();
  await page.getByLabel("Display name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("a phase three test password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Everything has its place." }),
  ).toBeVisible();
}

test("two accounts create a room, share private-by-default Git presence and reconnect", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const ownerContext = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const memberContext = await browser.newContext({
    viewport: { width: 1200, height: 1000 },
  });
  const owner = await ownerContext.newPage();
  const member = await memberContext.newPage();
  const errors: string[] = [];
  owner.on("pageerror", (e) => errors.push(e.message));
  member.on("pageerror", (e) => errors.push(e.message));
  const frames: string[] = [];
  let connections = 0;
  owner.on("websocket", () => {
    connections += 1;
  });
  owner.on("websocket", (socket) =>
    socket.on("framesent", (event) => {
      const payload = String(event.payload);
      if (payload.includes('"type":"presence.update"')) frames.push(payload);
    }),
  );
  // Only the native filesystem boundary is mocked. HTTP and WebSocket traffic is real.
  for (const page of [owner, member])
    await page.addInitScript(() => {
      localStorage.setItem("digita.intro.seen", "yes");
      const native = window as unknown as {
        isTauri: boolean;
        gitSnapshot: unknown;
        __TAURI_INTERNALS__: unknown;
      };
      native.isTauri = true;
      native.gitSnapshot = {
        root: "/workspace/private-repository",
        name: "Private local folder",
        branch: "feature/team",
        detached: false,
        commit: {
          hash: "a".repeat(40),
          subject: "Private commit message",
          author: "Private Author",
          authoredAt: "2026-09-14T00:00:00Z",
        },
        files: [
          {
            path: "src/team.ts",
            originalPath: null,
            indexStatus: ".",
            worktreeStatus: "M",
            conflicted: false,
          },
        ],
      };
      native.__TAURI_INTERNALS__ = {
        invoke: async (command: string, args?: { preferences?: unknown }) => {
          if (command === "load_preferences")
            return JSON.parse(
              localStorage.getItem("e2e.native.preferences") ?? "null",
            );
          if (command === "save_preferences") {
            localStorage.setItem(
              "e2e.native.preferences",
              JSON.stringify(args?.preferences),
            );
            return null;
          }
          if (command === "clear_preferences") {
            localStorage.removeItem("e2e.native.preferences");
            return null;
          }
          if (command === "read_repository")
            return structuredClone(native.gitSnapshot);
          if (command === "plugin:dialog|open")
            return "/workspace/private-repository";
          if (
            ["load_session", "clear_session", "save_session"].includes(command)
          )
            return null;
          throw new Error(`Unexpected native command: ${command}`);
        },
      };
    });
  try {
    const suffix = Date.now();
    await register(owner, "Anna", `anna-${suffix}@example.com`);
    await owner
      .getByRole("button", { name: "Create team", exact: true })
      .click();
    await owner.getByLabel("Name", { exact: true }).fill("Developers");
    await owner.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      owner.getByRole("heading", { name: "Developers" }),
    ).toBeVisible();
    await owner.getByRole("button", { name: "Create room" }).click();
    await owner.getByLabel("Name", { exact: true }).fill("Shared project");
    await owner.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      owner.getByRole("button", { name: /Shared project/ }),
    ).toBeVisible();
    await owner.screenshot({ path: "artifacts/dashboard.png", fullPage: true });
    await owner.locator(".dashboard").screenshot({
      path: "artifacts/readme-dashboard.png",
      style: ".language-settings-button { visibility: hidden; }",
    });
    await owner.getByRole("button", { name: "Team menu" }).click();
    await owner.getByRole("button", { name: "Invite member" }).click();
    const code = await owner.getByLabel("Created invitation code").inputValue();
    await register(member, "Petr", `petr-${suffix}@example.com`);
    await member.getByRole("button", { name: "Join with invitation" }).click();
    await member.getByLabel("Invitation code", { exact: true }).fill(code);
    await member.getByRole("button", { name: "Accept invitation" }).click();
    await expect(
      member.getByRole("button", { name: /Shared project/ }),
    ).toBeVisible();
    await owner.getByRole("button", { name: "Create room" }).click();
    await owner.getByLabel("Name", { exact: true }).fill("Next project");
    await owner.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      owner.getByRole("button", { name: /Next project/ }),
    ).toBeVisible();
    await expect(
      member.getByRole("button", { name: /Next project/ }),
    ).toHaveCount(0);
    await member.getByRole("button", { name: "Refresh rooms" }).click();
    await expect(
      member.getByRole("button", { name: /Next project/ }),
    ).toBeVisible();
    await member.getByRole("button", { name: "Local mode" }).click();
    await member.getByRole("button", { name: "Back to team space" }).click();
    await expect(
      member.getByRole("heading", { name: "Everything has its place." }),
    ).toBeVisible();
    await member.getByRole("button", { name: "Team menu" }).click();
    await expect(
      member.getByRole("region", { name: "Team administration" }),
    ).toContainText("Petr (you)");
    await expect(
      member.getByRole("button", { name: "Leave team", exact: true }),
    ).toBeVisible();
    await expect(
      member.getByRole("button", { name: "Invite member" }),
    ).toHaveCount(0);
    await owner.getByRole("button", { name: /Shared project/ }).click();
    await member.getByRole("button", { name: /Shared project/ }).click();
    await expect(owner.locator(".room-heading").getByRole("status")).toHaveText(
      "Connected live",
    );
    await expect(
      member.locator(".room-heading").getByRole("status"),
    ).toHaveText("Connected live");
    await expect(owner.locator(".privacy-controls")).toHaveCount(0);
    await expect(member.locator(".ambient-player, audio")).toHaveCount(0);
    const radarPanel = member.locator("#conflict-radar-panel");
    const radarToggle = member.getByRole("button", {
      name: "Conflict Radar",
      exact: true,
    });
    await expect(radarToggle).toHaveAttribute("aria-expanded", "false");
    await radarToggle.click();
    await expect(radarPanel).toBeVisible();
    await expect(radarPanel).toContainText("No overlap detected");
    await member
      .getByRole("button", { name: "Close conflict radar", exact: true })
      .click();
    await expect(radarPanel).toHaveCount(0);
    await expect(radarToggle).toBeFocused();
    await member.getByRole("button", { name: "Settings", exact: true }).click();
    await member
      .getByRole("button", { name: "Notifications", exact: true })
      .click();
    await member
      .getByRole("button", { name: "Enable system notifications" })
      .click();
    await expect(member.getByRole("dialog").getByRole("alert")).toContainText(
      "System notifications are not allowed.",
    );
    await member.getByRole("button", { name: "Close settings" }).click();
    const anna = member.locator(".member-card").filter({ hasText: "Anna" });
    await expect(anna).toContainText("Online");
    await owner
      .getByRole("button", { name: "Connect repository", exact: true })
      .click();
    await expect(
      owner
        .locator(".embedded-workspace")
        .getByRole("heading", { name: "Private local folder", exact: true }),
    ).toBeVisible();
    await expect(anna).toContainText("Git status is not shared.");
    await owner
      .getByLabel("This repository belongs to this room — share Git status")
      .check();
    await owner
      .getByRole("button", { name: "Start sharing", exact: true })
      .click();
    await expect(anna).toContainText("1 changed files");
    await expect(anna).not.toContainText("feature/team");
    await expect(anna).not.toContainText("src/team.ts");
    await owner.getByRole("button", { name: "Settings", exact: true }).click();
    await owner.getByRole("button", { name: "Privacy", exact: true }).click();
    await owner.getByLabel("File names", { exact: true }).check();
    await owner.getByRole("button", { name: "Close settings" }).click();
    await owner.getByRole("button", { name: "Settings", exact: true }).click();
    await owner.getByRole("button", { name: "Privacy", exact: true }).click();
    await owner.getByLabel("Branch name", { exact: true }).check();
    await owner.getByRole("button", { name: "Close settings" }).click();
    await expect(anna).toContainText("src/team.ts");
    await expect(anna).toContainText("feature/team");
    await member
      .getByRole("button", { name: "Connect repository", exact: true })
      .click();
    await member
      .getByLabel("This repository belongs to this room — share Git status")
      .check();
    await member
      .getByRole("button", { name: "Start sharing", exact: true })
      .click();
    const radar = member.locator(".conflict-radar");
    await expect(radar.locator(".conflict-list li")).toHaveCount(0);
    await member.getByRole("button", { name: "Settings", exact: true }).click();
    await member.getByRole("button", { name: "Privacy", exact: true }).click();
    await member.getByLabel("File names", { exact: true }).check();
    await expect(radarToggle).toHaveAttribute("aria-expanded", "true");
    await expect(
      member.getByLabel("File names", { exact: true }),
    ).toBeFocused();
    await member.keyboard.press("Escape");
    await expect(
      member.getByRole("button", { name: "Close settings" }),
    ).toHaveCount(0);
    await expect(radar.locator(".conflict-list li")).toHaveCount(1);
    await expect(radar).toContainText("src/team.ts");
    await expect(radar).toContainText("Anna");
    await expect(radar).toContainText("Petr (you)");
    await expect(radarPanel).toBeVisible();
    await expect(radarToggle).toHaveAttribute("aria-expanded", "true");
    await expect(
      member.getByRole("button", { name: "Settings", exact: true }),
    ).toBeFocused();
    await member.keyboard.press("Escape");
    await expect(radarPanel).toHaveCount(0);
    await expect(radarToggle).toBeFocused();
    await radarToggle.click();
    await expect(radarPanel).toBeVisible();
    await member.setViewportSize({ width: 800, height: 800 });
    await expect(radarPanel).toBeVisible();
    await member.screenshot({
      path: "artifacts/radar-panel-small.png",
      animations: "disabled",
    });
    await member.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await radarPanel.evaluate(
        (panel) => getComputedStyle(panel).animationName,
      ),
    ).toBe("none");
    await member.emulateMedia({ reducedMotion: "no-preference" });
    await member.setViewportSize({ width: 1200, height: 1000 });
    const ownerCloseRadar = owner.getByRole("button", {
      name: "Close conflict radar",
      exact: true,
    });
    await expect(ownerCloseRadar).toBeVisible();
    await ownerCloseRadar.click();
    // A language change must not remount the room or revoke sharing consent.
    const connectionCount = connections;
    const frameCount = frames.length;
    await owner.getByRole("button", { name: "Settings", exact: true }).click();
    await owner.getByRole("button", { name: "Language", exact: true }).click();
    await owner
      .getByRole("combobox", { name: "Language", exact: true })
      .selectOption("cs");
    await owner.getByRole("button", { name: "Zavřít nastavení" }).click();
    await expect(owner.locator(".room-heading").getByRole("status")).toHaveText(
      "Živě připojeno",
    );
    await expect(
      owner.getByLabel("Názvy souborů", { exact: true }),
    ).toBeChecked();
    await expect(
      owner.getByRole("button", { name: "Vypnout sdílení", exact: true }),
    ).toBeVisible();
    await expect(
      owner.getByRole("heading", { name: "Shared project", exact: true }),
    ).toBeVisible();
    await expect(member.locator("html")).toHaveAttribute("lang", "en");
    await owner.getByRole("button", { name: "Nastavení", exact: true }).click();
    await owner.getByRole("button", { name: "Jazyk", exact: true }).click();
    await owner
      .getByRole("combobox", { name: "Jazyk", exact: true })
      .selectOption("en");
    await owner.getByRole("button", { name: "Close settings" }).click();
    await expect(owner.locator(".room-heading").getByRole("status")).toHaveText(
      "Connected live",
    );
    expect(connections).toBe(connectionCount);
    expect(frames.length).toBe(frameCount);
    await radar.screenshot({
      path: "artifacts/readme-radar.png",
      style: ".language-settings-button { visibility: hidden; }",
    });
    await member.screenshot({
      path: "artifacts/conflict-radar.png",
      fullPage: true,
    });
    await member
      .getByRole("button", { name: "Close conflict radar", exact: true })
      .click();
    await expect(radarPanel).toHaveCount(0);
    await owner.evaluate(() => {
      const native = window as unknown as {
        gitSnapshot: { commit: { hash: string }; files: unknown[] };
      };
      native.gitSnapshot.commit.hash = "b".repeat(40);
      native.gitSnapshot.files = [
        {
          path: "src/next.ts",
          originalPath: null,
          indexStatus: "?",
          worktreeStatus: "?",
          conflicted: false,
        },
      ];
    });
    await expect(anna).toContainText("src/next.ts", { timeout: 10000 });
    await expect(radar.locator(".conflict-list li")).toHaveCount(0);
    await member.evaluate(() => {
      const native = window as unknown as {
        gitSnapshot: { files: { path: string }[] };
      };
      native.gitSnapshot.files[0].path = "src/next.ts";
    });
    await expect(radar.locator(".conflict-list li")).toHaveCount(1, {
      timeout: 10000,
    });
    await expect(radarPanel).toBeVisible();
    await member
      .getByRole("button", { name: "Close conflict radar", exact: true })
      .click();
    await expect(radarPanel).toHaveCount(0);
    await expect(member.locator(".room-timeline")).toContainText(
      "has a different latest commit",
    );
    await member.screenshot({
      path: "artifacts/live-room.png",
      fullPage: true,
    });
    await memberContext.setOffline(true);
    await expect(
      member.locator(".room-heading").getByRole("status"),
    ).not.toHaveText("Connected live", {
      timeout: 20000,
    });
    await expect(anna).not.toContainText("src/next.ts");
    await expect(radarPanel).toHaveCount(0);
    await memberContext.setOffline(false);
    await expect(
      member.locator(".room-heading").getByRole("status"),
    ).toHaveText("Connected live", {
      timeout: 20000,
    });
    await expect(anna).toContainText("src/next.ts");
    await expect(radarToggle).toHaveAttribute("aria-expanded", "false");
    await radarToggle.click();
    await expect(radar.locator(".conflict-list li")).toHaveCount(1);
    await expect(member.locator(".team-presence [role=alert]")).toHaveCount(0);
    await member.screenshot({
      path: "artifacts/radar-reconnected-room.png",
      fullPage: true,
    });
    await expect(ownerCloseRadar).toBeVisible();
    await ownerCloseRadar.click();
    await owner.getByRole("button", { name: "Settings", exact: true }).click();
    await owner.getByRole("button", { name: "Privacy", exact: true }).click();
    await owner.getByLabel("File names", { exact: true }).uncheck();
    await owner.getByRole("button", { name: "Close settings" }).click();
    await expect(anna).not.toContainText("src/next.ts");
    await expect(radar.locator(".conflict-list li")).toHaveCount(0);
    await expect(member.locator(".room-timeline")).not.toContainText(
      "src/next.ts",
    );
    await owner.getByRole("button", { name: "Settings", exact: true }).click();
    await owner.getByRole("button", { name: "About", exact: true }).click();
    await expect(owner.getByRole("dialog")).toContainText("Git sharing is on.");
    await owner
      .getByRole("dialog")
      .getByRole("button", { name: "Stop sharing", exact: true })
      .click();
    await expect(anna).toContainText("Git status is not shared.");
    await owner.getByRole("button", { name: "Close settings" }).click();
    await owner.getByRole("button", { name: "Disconnect repository" }).click();
    await expect(anna).toContainText("Git status is not shared.");
    expect(frames.join("\n")).not.toContain("/workspace/private-repository");
    expect(frames.join("\n")).not.toContain("Private Author");
    expect(frames.join("\n")).not.toContain("Private commit message");
    await member
      .getByRole("button", { name: "Close conflict radar", exact: true })
      .click();
    await member.getByRole("button", { name: "All rooms" }).click();
    await expect(
      owner.locator(".member-card").filter({ hasText: "Petr" }),
    ).toContainText("Outside the room");
    await member.getByRole("button", { name: "Sign out" }).click();
    await expect(
      member.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});
