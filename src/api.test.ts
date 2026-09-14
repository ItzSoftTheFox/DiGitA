import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ desktop: vi.fn(), invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: mocks.desktop,
  invoke: mocks.invoke,
}));
import { API_URL, credentials } from "./api";
const stored = new Map<string, string>();

beforeEach(() => {
  vi.resetAllMocks();
  stored.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
  mocks.desktop.mockReturnValue(true);
});
afterEach(() => vi.unstubAllGlobals());

describe("session storage", () => {
  it("stores the token only in the OS credential store and restores it only with consent", async () => {
    expect(await credentials.read()).toBeNull();
    expect(mocks.invoke).not.toHaveBeenCalled();
    mocks.invoke.mockResolvedValue(undefined);
    await credentials.save("private-token");
    expect(mocks.invoke).toHaveBeenCalledWith("save_session", {
      server: API_URL,
      token: "private-token",
    });
    expect([...stored.values()]).not.toContain("private-token");
    mocks.invoke.mockResolvedValue("private-token");
    expect(await credentials.read()).toBe("private-token");
    expect(mocks.invoke).toHaveBeenLastCalledWith("load_session", {
      server: API_URL,
    });
  });
  it("does not restore a credential after local logout even if the OS store is unavailable", async () => {
    mocks.invoke.mockResolvedValue(undefined);
    await credentials.save("private-token");
    mocks.invoke.mockRejectedValue(new Error("locked"));
    await expect(credentials.clear()).rejects.toThrow("locked");
    expect(await credentials.read()).toBeNull();
  });
  it("does not enable restoration after a failed save or persist browser tokens", async () => {
    mocks.invoke.mockRejectedValue(new Error("unavailable"));
    await expect(credentials.save("private-token")).rejects.toThrow(
      "unavailable",
    );
    expect(await credentials.read()).toBeNull();
    mocks.desktop.mockReturnValue(false);
    mocks.invoke.mockClear();
    await credentials.save("browser-token");
    expect(await credentials.read()).toBeNull();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(stored.size).toBe(0);
  });
});
