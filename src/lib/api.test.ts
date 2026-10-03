import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ desktop: vi.fn(), invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: mocks.desktop,
  invoke: mocks.invoke,
}));
import { API_URL, api, credentials } from "./api";
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

it("disables restoration of an older credential when saving a new session fails", async () => {
  mocks.invoke.mockResolvedValue(undefined);
  await credentials.save("old-test-token");
  mocks.invoke.mockRejectedValue(new Error("locked"));
  await expect(credentials.save("new-test-token")).rejects.toThrow("locked");
  mocks.invoke.mockClear();
  expect(await credentials.read()).toBeNull();
  expect(mocks.invoke).not.toHaveBeenCalled();
});

// Exercise the actual HTTP boundary: only allowlisted public messages reach the UI.
describe("request failures", () => {
  it.each([
    [401, "/auth/login", "Incorrect email or password."],
    [401, "/teams", "Your session has expired. Sign in again."],
    [403, "/auth/register", "Registration is currently closed."],
    [
      403,
      "/teams",
      "You do not have permission for this action. Ask a team owner or admin.",
    ],
    [
      404,
      "/invitations/accept",
      "This invitation is invalid, expired, or already used. Ask for a new code.",
    ],
    [
      409,
      "/teams",
      "This action conflicts with the current state. Refresh and check before trying again.",
    ],
    [422, "/auth/login", "Check the entered details."],
    [
      503,
      "/teams",
      "The server is temporarily unavailable. Try again shortly.",
    ],
  ])("sanitizes status %s on %s", async (status, path, message) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ detail: "private password /server/path" }),
            { status },
          ),
        ),
    );
    await expect(api(path)).rejects.toMatchObject({ status, message });
  });

  it("preserves a known quota reason and provides a bounded Retry-After", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            detail: "You have reached the limit for owned teams.",
          }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        new Response("{}", { status: 429, headers: { "Retry-After": "2" } }),
      )
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 429,
          headers: { "Retry-After": "999999" },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(api("/teams")).rejects.toMatchObject({
      message: "You have reached the limit for owned teams.",
    });
    await expect(api("/teams")).rejects.toMatchObject({ retryAfter: 2 });
    await expect(api("/teams")).rejects.toMatchObject({ retryAfter: 600 });
  });

  it("never automatically replays a write whose outcome is unknown", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValue(new TypeError("private transport details"));
    vi.stubGlobal("fetch", fetch);
    await expect(
      api("/teams", "secret-token", "POST", { name: "Private" }),
    ).rejects.toMatchObject({
      status: 0,
      outcomeUnknown: true,
      message: "Cannot reach the server. Check your connection and try again.",
    });
    expect(fetch).toHaveBeenCalledOnce();
    fetch.mockResolvedValue(
      new Response("<html>private proxy error</html>", { status: 502 }),
    );
    await expect(
      api("/teams", "secret-token", "POST", {}),
    ).rejects.toMatchObject({ outcomeUnknown: true });
    fetch.mockResolvedValue(new Response("not json", { status: 200 }));
    await expect(
      api("/teams", "secret-token", "POST", {}),
    ).rejects.toMatchObject({ outcomeUnknown: true });
  });

  it("does not send offline requests or mark their outcome unknown", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(api("/teams", "token", "POST", {})).rejects.toMatchObject({
      outcomeUnknown: false,
      message: "You are offline. Reconnect and try again.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

it("accepts an empty team deletion response and preserves the owner-only denial", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: "Only the team owner can delete this team." }),
        { status: 403 },
      ),
    );
  vi.stubGlobal("fetch", fetch);
  await expect(api("/teams/team", "token", "DELETE")).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledWith(
    `${API_URL}/teams/team`,
    expect.objectContaining({
      method: "DELETE",
      headers: { Authorization: "Bearer token" },
    }),
  );
  await expect(api("/teams/team", "token", "DELETE")).rejects.toMatchObject({
    status: 403,
    message: "Only the team owner can delete this team.",
  });
});
