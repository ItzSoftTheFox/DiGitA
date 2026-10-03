import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DesktopApp from "./DesktopApp";
import { demoRepository } from "./lib/repository";
import { API_URL } from "./lib/api";
import { canonicalServer, defaultPreferences } from "./lib/preferences";
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  open: vi.fn(),
  api: vi.fn(),
  room: vi.fn(),
  account: "first",
}));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: mocks.invoke,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));
vi.mock("./lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/api")>()),
  api: mocks.api,
  credentials: {
    read: async () => "token",
    clear: async () => {},
    save: async () => {},
  },
}));
vi.mock("./hooks/useRoom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./hooks/useRoom")>()),
  useRoom: mocks.room,
}));
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: async () => false,
  requestPermission: vi.fn(),
}));
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  vi.resetAllMocks();
  mocks.account = "first";
  mocks.open.mockResolvedValue(null);
  vi.stubGlobal("localStorage", {
    getItem: () => "yes",
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  mocks.room.mockReturnValue({
    state: null,
    status: "online",
    setPlaying: () => true,
    reconnect: () => {},
  });
  mocks.api.mockImplementation(async (path: string) => {
    if (path === "/auth/me")
      return {
        id: mocks.account,
        display_name: "User",
        email: "user@example.com",
      };
    if (path === "/auth/login") return { access_token: "second-token" };
    if (path === "/teams") return [{ id: "team", name: "Team" }];
    if (path.endsWith("/rooms"))
      return [{ id: "room", team_id: "team", name: "Room" }];
    return [];
  });
  mocks.invoke.mockImplementation(
    async (command: string, args?: { path: string }) => {
      if (command === "load_preferences")
        return {
          ...defaultPreferences(),
          recentProjects: [
            { path: "/first", name: "First" },
            { path: "/second", name: "Second" },
          ],
          roomProjects: [
            {
              server: canonicalServer(API_URL),
              accountId: "first",
              roomId: "room",
              path: "/first",
            },
          ],
        };
      if (command === "read_repository")
        return {
          ...demoRepository,
          root: args!.path,
          name: args!.path === "/first" ? "First" : "Second",
        };
      return null;
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const consent = () =>
  screen.getByLabelText(
    "This repository belongs to this room — share Git status",
  );
async function enter() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Room Enter room" }),
  );
}
it("requires fresh consent after repository switches, room reentry and app restart", async () => {
  const view = render(<DesktopApp />);
  await enter();
  await screen.findByRole("dialog", { name: "Choose Git metadata to share" });
  expect(consent()).toHaveProperty("checked", false);
  expect(
    mocks.room.mock.calls.every(([, , presence]) => presence === null),
  ).toBe(true);
  fireEvent.click(consent());
  expect(mocks.room.mock.lastCall![2]).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Start sharing" }));
  expect(mocks.room.mock.lastCall![2]).not.toBeNull();
  mocks.room.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Second" }));
  await screen.findByRole("dialog", { name: "Choose Git metadata to share" });
  expect(consent()).toHaveProperty("checked", false);
  expect(
    mocks.room.mock.calls.every(([, , presence]) => presence === null),
  ).toBe(true);
  fireEvent.click(consent());
  expect(mocks.room.mock.lastCall![2]).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Start sharing" }));
  fireEvent.click(screen.getByRole("button", { name: "All rooms" }));
  mocks.room.mockClear();
  await enter();
  await screen.findByRole("dialog", { name: "Choose Git metadata to share" });
  expect(consent()).toHaveProperty("checked", false);
  expect(
    mocks.room.mock.calls.every(([, , presence]) => presence === null),
  ).toBe(true);
  fireEvent.click(consent());
  expect(mocks.room.mock.lastCall![2]).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Start sharing" }));
  view.unmount();
  mocks.room.mockClear();
  render(<DesktopApp />);
  await enter();
  await screen.findByRole("dialog", { name: "Choose Git metadata to share" });
  expect(consent()).toHaveProperty("checked", false);
  expect(
    mocks.room.mock.calls.every(([, , presence]) => presence === null),
  ).toBe(true);
});
it("keeps another account's bound folder and consent isolated", async () => {
  render(<DesktopApp />);
  await enter();
  await screen.findByRole("dialog", { name: "Choose Git metadata to share" });
  fireEvent.click(consent());
  expect(mocks.room.mock.lastCall![2]).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Start sharing" }));
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("button", { name: "Sign in" });
  mocks.account = "second";
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "second@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "test-only-password" },
  });
  await act(async () =>
    fireEvent.submit(
      screen.getByRole("button", { name: "Sign in" }).closest("form")!,
    ),
  );
  mocks.room.mockClear();
  mocks.invoke.mockClear();
  await enter();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Choose sharing" }),
    ).toHaveProperty("disabled", true),
  );
  expect(
    screen.queryByRole("dialog", { name: "Choose Git metadata to share" }),
  ).toBeNull();
  expect(
    mocks.room.mock.calls.every(([, , presence]) => presence === null),
  ).toBe(true);
  expect(
    mocks.invoke.mock.calls.some(([command]) => command === "read_repository"),
  ).toBe(false);
});

it("cancels initial sharing, permits reopening and never enables consent from choices alone", async () => {
  render(<DesktopApp />);
  await enter();
  await screen.findByRole("dialog", { name: "Choose Git metadata to share" });
  fireEvent.click(
    within(
      screen.getByRole("dialog", { name: "Choose Git metadata to share" }),
    ).getByLabelText("File names"),
  );
  fireEvent.click(consent());
  expect(mocks.room.mock.lastCall![2]).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(mocks.room.mock.lastCall![2]).toBeNull();
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" })),
  );
  expect(
    screen.queryByRole("dialog", { name: "Choose Git metadata to share" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Choose sharing" }));
  expect(consent()).toHaveProperty("checked", false);
  expect(
    within(
      screen.getByRole("dialog", { name: "Choose Git metadata to share" }),
    ).getByLabelText("File names"),
  ).toHaveProperty("checked", false);
  fireEvent.click(consent());
  fireEvent.click(screen.getByRole("button", { name: "Start sharing" }));
  expect(mocks.room.mock.lastCall![2]).not.toBeNull();
});

it("withdraws consent after a Git read error and requires fresh confirmation after recovery", async () => {
  render(<DesktopApp />);
  await enter();
  await screen.findByRole("dialog", { name: "Choose Git metadata to share" });
  fireEvent.click(consent());
  fireEvent.click(screen.getByRole("button", { name: "Start sharing" }));
  expect(mocks.room.mock.lastCall![2]).not.toBeNull();
  mocks.invoke.mockRejectedValueOnce(new Error("Git read timed out"));
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" })),
  );
  expect(mocks.room.mock.lastCall![2]).toBeNull();
  expect(screen.getByRole("button", { name: "Choose sharing" })).toHaveProperty(
    "disabled",
    true,
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" })),
  );
  expect(mocks.room.mock.lastCall![2]).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Choose sharing" }));
  expect(consent()).toHaveProperty("checked", false);
});

function twoTeams() {
  mocks.api.mockImplementation(async (path: string) => {
    if (path === "/auth/me")
      return {
        id: "first",
        display_name: "User",
        email: "user@example.com",
        avatar: "fox",
        avatar_color: "amber",
        custom_status: "Reviewing",
      };
    if (path === "/teams")
      return [
        { id: "team", name: "Team" },
        { id: "other", name: "Other team" },
      ];
    if (path.endsWith("/members"))
      return [{ user_id: "first", display_name: "User", role: "owner" }];
    if (path.endsWith("/rooms"))
      return path.includes("/other/")
        ? [{ id: "other-room", team_id: "other", name: "Other room" }]
        : [{ id: "room", team_id: "team", name: "Room" }];
    return [];
  });
}

it("switches joined teams without stale rooms or consent and retains the signed-in profile in local mode", async () => {
  twoTeams();
  render(<DesktopApp />);
  await enter();
  await screen.findByRole("dialog", { name: "Choose Git metadata to share" });
  fireEvent.click(consent());
  fireEvent.click(screen.getByRole("button", { name: "Start sharing" }));
  const sidebar = screen.getByRole("navigation", { name: "Joined teams" });
  fireEvent.click(sidebar.querySelectorAll("button")[1]);
  expect(screen.queryByRole("heading", { name: "Room" })).toBeNull();
  const other = await screen.findByRole("button", {
    name: "Other room Enter room",
  });
  expect(screen.queryByRole("button", { name: "Room Enter room" })).toBeNull();
  expect(screen.getByRole("button", { name: "Other team" })).toHaveProperty(
    "ariaCurrent",
    "true",
  );
  mocks.room.mockClear();
  fireEvent.click(other);
  expect(
    mocks.room.mock.calls.every(([, , presence]) => presence === null),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Local mode" }));
  await screen.findByRole("button", { name: "Back to team space" });
  expect(document.querySelector(".signed-profile")?.textContent).toContain(
    "User",
  );
  expect(document.querySelector(".signed-profile .avatar-amber")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "Joined teams" })).toBeTruthy();
});

it("returns revoked room access to refreshed teams and clears previous Git sharing", async () => {
  twoTeams();
  render(<DesktopApp />);
  await enter();
  await screen.findByRole("dialog", { name: "Choose Git metadata to share" });
  fireEvent.click(consent());
  fireEvent.click(screen.getByRole("button", { name: "Start sharing" }));
  mocks.api.mockImplementation(async (path: string) => {
    if (path === "/teams") return [{ id: "other", name: "Other team" }];
    if (path.endsWith("/members"))
      return [{ user_id: "first", display_name: "User", role: "owner" }];
    if (path.endsWith("/rooms"))
      return [{ id: "other-room", team_id: "other", name: "Other room" }];
    return [];
  });
  mocks.room.mockReturnValue({
    state: null,
    status: "denied",
    setPlaying: () => false,
    reconnect: () => {},
  });
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Stop sharing" })),
  );
  await screen.findByRole("button", { name: "Other room Enter room" });
  expect(screen.queryByRole("heading", { name: "Room" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Team" })).toBeNull();
  expect(mocks.api).toHaveBeenCalledWith("/teams", "token");
});

it("guards team switching while a profile draft is dirty", async () => {
  twoTeams();
  render(<DesktopApp />);
  await enter();
  await screen.findByRole("dialog", { name: "Choose Git metadata to share" });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), {
    target: { value: "Unsaved profile" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Other team" }));
  const guard = screen.getByRole("dialog", {
    name: "Discard profile changes?",
  });
  expect(screen.getByRole("heading", { name: "Room" })).toBeTruthy();
  fireEvent.click(within(guard).getByRole("button", { name: "Keep editing" }));
  expect(screen.getByRole("textbox", { name: "Display name" })).toHaveProperty(
    "value",
    "Unsaved profile",
  );
  fireEvent.click(screen.getByRole("button", { name: "Other team" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  await screen.findByRole("button", { name: "Other room Enter room" });
  expect(screen.queryByRole("heading", { name: "Room" })).toBeNull();
});

it("owner team deletion returns to another available team", async () => {
  twoTeams();
  let deleted = false;
  const initial = mocks.api.getMockImplementation()!;
  mocks.api.mockImplementation(
    async (path: string, token?: string, method?: string) => {
      if (method === "DELETE" && path === "/teams/team") {
        deleted = true;
        return undefined;
      }
      if (path === "/teams" && deleted)
        return [{ id: "other", name: "Other team" }];
      return initial(path, token, method);
    },
  );
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<DesktopApp />);
  fireEvent.click(await screen.findByRole("button", { name: "Team menu" }));
  const button = await screen.findByRole("button", { name: "Delete team" });
  await waitFor(() => expect(button).toHaveProperty("disabled", false));
  fireEvent.click(button);
  await screen.findByRole("button", { name: "Other room Enter room" });
  expect(screen.queryByRole("button", { name: "Team" })).toBeNull();
  expect(screen.getByRole("button", { name: "Other team" })).toHaveProperty(
    "ariaCurrent",
    "true",
  );
});

it("asks for association again when the connected folder is selected again", async () => {
  render(<DesktopApp />);
  await enter();
  await screen.findByRole("dialog", { name: "Choose Git metadata to share" });
  fireEvent.click(consent());
  fireEvent.click(screen.getByRole("button", { name: "Start sharing" }));
  mocks.open.mockResolvedValue("/first");
  mocks.room.mockClear();
  await act(async () =>
    fireEvent.click(
      screen.getAllByRole("button", { name: "Choose folder" }).at(-1)!,
    ),
  );
  await screen.findByRole("dialog", { name: "Choose Git metadata to share" });
  expect(consent()).toHaveProperty("checked", false);
  expect(
    mocks.room.mock.calls.every(([, , presence]) => presence === null),
  ).toBe(true);
});
