import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

it("defaults to English and ignores unsupported persisted languages", async () => {
  localStorage.setItem("digita.language", "unsupported");
  const { getLanguage, t } = await import("./index");
  expect(getLanguage()).toBe("en");
  expect(document.documentElement.lang).toBe("en");
  expect(t("Sign in")).toBe("Sign in");
});

it("restores Czech across launches and formats dates with the chosen locale", async () => {
  const first = await import("./index");
  expect(first.setLanguage("cs")).toBe(true);
  vi.resetModules();
  const next = await import("./index");
  expect(next.getLanguage()).toBe("cs");
  expect(next.dateLocale()).toBe("cs-CZ");
  expect(document.documentElement.lang).toBe("cs");
  expect(next.t("Sign in")).toBe("Přihlásit se");
});

it("keeps the app usable when preference storage is unavailable", async () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  });
  const { getLanguage, setLanguage, t } = await import("./index");
  expect(getLanguage()).toBe("en");
  expect(setLanguage("cs")).toBe(false);
  expect(t("Settings")).toBe("Nastavení");
});

it("translates known legacy API errors and preserves unknown diagnostics", async () => {
  const { setLanguage, t } = await import("./index");
  expect(t("Registrace je momentálně uzavřena.")).toBe(
    "Registration is currently closed.",
  );
  setLanguage("cs");
  expect(t("Registration is currently closed.")).toBe(
    "Registrace je momentálně uzavřena.",
  );
  expect(t("toString")).toBe("toString");
  expect(t("Unknown diagnostic: src/private.ts")).toBe(
    "Unknown diagnostic: src/private.ts",
  );
  expect(t("LAST REFRESH {time}", { time: "10:30" })).toBe(
    "POSLEDNÍ OBNOVA 10:30",
  );
});


