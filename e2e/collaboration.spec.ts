import { expect, test, type Page } from "@playwright/test";

async function register(page: Page, name: string, email: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Nemám účet — registrovat" }).click();
  await page.getByLabel("Jméno", { exact: true }).fill(name);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page
    .getByLabel("Heslo", { exact: true })
    .fill("a phase three test password");
  await page
    .getByRole("button", { name: "Vytvořit účet", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Všechno má své místo." }),
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
  owner.on("websocket", (socket) =>
    socket.on("framesent", (event) => {
      const payload = String(event.payload);
      if (payload.includes('"type":"presence.update"')) frames.push(payload);
    }),
  );
  // Only the native filesystem boundary is mocked. HTTP and WebSocket traffic is real.
  await owner.addInitScript(() => {
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
      invoke: async (command: string) => {
        if (command === "read_repository") return structuredClone(native.gitSnapshot);
        if (command === "plugin:dialog|open")
          return "/workspace/private-repository";
        if (["load_session", "clear_session", "save_session"].includes(command))
          return null;
        throw new Error(`Unexpected native command: ${command}`);
      },
    };
  });
  try {
    const suffix = Date.now();
    await register(owner, "Anna", `anna-${suffix}@example.com`);
    await owner
      .getByRole("button", { name: "Vytvořit tým", exact: true })
      .click();
    await owner.getByLabel("Název", { exact: true }).fill("Vývojáři");
    await owner.getByRole("button", { name: "Vytvořit", exact: true }).click();
    await expect(
      owner.getByRole("heading", { name: "Vývojáři" }),
    ).toBeVisible();
    await owner.getByRole("button", { name: "Vytvořit místnost" }).click();
    await owner.getByLabel("Název", { exact: true }).fill("Společný projekt");
    await owner.getByRole("button", { name: "Vytvořit", exact: true }).click();
    await expect(
      owner.getByRole("button", { name: /Společný projekt/ }),
    ).toBeVisible();
    await owner.screenshot({ path: "artifacts/dashboard.png", fullPage: true });
    await owner.getByRole("button", { name: "Pozvat člena" }).click();
    const code = await owner.getByLabel("Vytvořený kód pozvánky").inputValue();
    await register(member, "Petr", `petr-${suffix}@example.com`);
    await member
      .getByRole("button", { name: "Připojit se přes pozvánku" })
      .click();
    await member.getByLabel("Kód pozvánky", { exact: true }).fill(code);
    await member.getByRole("button", { name: "Přijmout pozvánku" }).click();
    await owner.getByRole("button", { name: /Společný projekt/ }).click();
    await member.getByRole("button", { name: /Společný projekt/ }).click();
    await expect(owner.getByRole("status")).toHaveText("Živě připojeno");
    await expect(member.getByRole("status")).toHaveText("Živě připojeno");
    const anna = member.locator(".member-card").filter({ hasText: "Anna" });
    await expect(anna).toContainText("Online");
    await owner
      .getByRole("button", { name: "Připojit repozitář", exact: true })
      .click();
    await expect(
      owner.getByText("Private local folder", { exact: true }).last(),
    ).toBeVisible();
    await expect(anna).toContainText("Git stav se nesdílí.");
    await owner
      .getByLabel("Toto je repozitář této místnosti — sdílet Git stav")
      .check();
    await expect(anna).toContainText("1 změněných souborů");
    await expect(anna).not.toContainText("feature/team");
    await expect(anna).not.toContainText("src/team.ts");
    await owner.getByLabel("Názvy souborů", { exact: true }).check();
    await owner.getByLabel("Název větve", { exact: true }).check();
    await expect(anna).toContainText("src/team.ts");
    await expect(anna).toContainText("feature/team");
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
    await expect(member.locator(".room-timeline")).toContainText(
      "má jiný poslední commit",
    );
    await member.screenshot({
      path: "artifacts/live-room.png",
      fullPage: true,
    });
    await memberContext.setOffline(true);
    await expect(member.getByRole("status")).not.toHaveText("Živě připojeno", {
      timeout: 20000,
    });
    await expect(anna).not.toContainText("src/next.ts");
    await memberContext.setOffline(false);
    await expect(member.getByRole("status")).toHaveText("Živě připojeno", {
      timeout: 20000,
    });
    await expect(anna).toContainText("src/next.ts");
    await owner.getByLabel("Názvy souborů", { exact: true }).uncheck();
    await expect(anna).not.toContainText("src/next.ts");
    await owner.getByRole("button", { name: "Odpojit repozitář" }).click();
    await expect(anna).toContainText("Git stav se nesdílí.");
    expect(frames.join("\n")).not.toContain("/workspace/private-repository");
    expect(frames.join("\n")).not.toContain("Private Author");
    expect(frames.join("\n")).not.toContain("Private commit message");
    await member.getByRole("button", { name: "Všechny místnosti" }).click();
    await expect(
      owner.locator(".member-card").filter({ hasText: "Petr" }),
    ).toContainText("Mimo místnost");
    await member.getByRole("button", { name: "Odhlásit se" }).click();
    await expect(
      member.getByRole("heading", { name: "Přihlásit se", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});
