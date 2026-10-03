import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  canonicalServer,
  defaultPreferences,
  forgetProject,
  preferenceStorage,
  preferencesKey,
  rememberProject,
  roomProject,
  validatePreferences,
} from "./preferences";
const native = vi.hoisted(() => ({
  desktop: vi.fn(() => false),
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: native.desktop,
  invoke: native.invoke,
}));
const stored = new Map<string, string>();
beforeEach(() => {
  stored.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      stored.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      stored.delete(key);
    }),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  native.desktop.mockReturnValue(false);
});
const scope = {
  server: "https://example.com/api",
  accountId: "account",
  roomId: "room",
};
function saved() {
  return {
    ...rememberProject(
      defaultPreferences(),
      { path: "/project", name: "Project" },
      true,
    ),
    roomProjects: [{ ...scope, path: "/project" }],
  };
}
it("roundtrips only allowed local preferences in the browser", async () => {
  await preferenceStorage.save(saved());
  expect(await preferenceStorage.load()).toEqual(saved());
  expect(JSON.parse(localStorage.getItem(preferencesKey)!)).not.toHaveProperty(
    "sharing",
  );
  await preferenceStorage.clear();
  expect(await preferenceStorage.load()).toBeNull();
});
it("uses native commands with the confirmed schema", async () => {
  native.desktop.mockReturnValue(true);
  native.invoke.mockResolvedValueOnce(saved()).mockResolvedValue(undefined);
  expect(await preferenceStorage.load()).toEqual(saved());
  await preferenceStorage.save(saved());
  await preferenceStorage.clear();
  expect(native.invoke.mock.calls).toEqual([
    ["load_preferences"],
    ["save_preferences", { preferences: saved() }],
    ["clear_preferences"],
  ]);
});
it.each([
  { ...saved(), version: 2 },
  { ...saved(), sharing: true },
  { ...saved(), token: "secret" },
  { ...saved(), listening: true },
  { ...saved(), volume: 100.1 },
  { ...saved(), activeProjectPath: "/unknown" },
  { ...saved(), recentProjects: [{ path: "/folder\u0085", name: "Bad" }] },
  { ...saved(), recentProjects: [{ path: "/project", name: "Bad\u0000" }] },
  { ...saved(), roomProjects: [{ ...scope, path: "/unknown" }] },
  {
    ...saved(),
    roomProjects: [
      { ...scope, path: "/project" },
      { ...scope, path: "/project" },
    ],
  },
  {
    ...saved(),
    roomProjects: [
      { ...scope, server: "https://EXAMPLE.COM/api/", path: "/project" },
    ],
  },
])("rejects invalid, future or sensitive preference fields (%#)", (value) => {
  expect(() => validatePreferences(value)).toThrow();
});
it("isolates associations by canonical server, account and room", () => {
  expect(canonicalServer("https://EXAMPLE.com:443/api/")).toBe(scope.server);
  expect(roomProject(saved(), scope)).toBe("/project");
  expect(
    roomProject(saved(), { ...scope, server: "https://other.example" }),
  ).toBeNull();
  expect(roomProject(saved(), { ...scope, accountId: "other" })).toBeNull();
  expect(roomProject(saved(), { ...scope, roomId: "other" })).toBeNull();
});
it("bounds recents and removes bindings when projects are removed or evicted", () => {
  let preferences = saved();
  for (let i = 0; i < 20; i++)
    preferences = rememberProject(
      preferences,
      { path: `/repo${i}`, name: `Repo${i}` },
      false,
    );
  expect(preferences.recentProjects).toHaveLength(20);
  expect(preferences.activeProjectPath).toBeNull();
  expect(preferences.roomProjects).toEqual([]);
  expect(forgetProject(saved(), "/project")).toEqual(defaultPreferences());
});
it("preserves corrupt browser data and surfaces storage failures", async () => {
  localStorage.setItem(preferencesKey, "{broken");
  await expect(preferenceStorage.load()).rejects.toThrow();
  expect(localStorage.getItem(preferencesKey)).toBe("{broken");
  vi.mocked(localStorage.setItem).mockImplementation(() => {
    throw new Error("disk full");
  });
  await expect(preferenceStorage.save(saved())).rejects.toThrow("disk full");
  vi.mocked(localStorage.removeItem).mockImplementation(() => {
    throw new Error("denied");
  });
  await expect(preferenceStorage.clear()).rejects.toThrow("denied");
});
