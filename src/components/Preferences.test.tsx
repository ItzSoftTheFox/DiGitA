import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PreferencesProvider, usePreferences } from "./Preferences";
import { defaultPreferences, type LocalPreferences } from "../lib/preferences";
import { AmbientPlayer } from "./AmbientPlayer";
import App from "../App";
import { demoRepository } from "../lib/repository";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  clear: vi.fn(),
  granted: vi.fn(),
  permission: vi.fn(),
  open: vi.fn(),
  invoke: vi.fn(),
  desktop: vi.fn(() => true),
}));
vi.mock("../lib/preferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/preferences")>()),
  preferenceStorage: { load: mocks.load, save: mocks.save, clear: mocks.clear },
}));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: mocks.desktop,
  invoke: mocks.invoke,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: mocks.granted,
  requestPermission: mocks.permission,
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.desktop.mockReturnValue(true);
  mocks.load.mockResolvedValue(null);
  mocks.save.mockResolvedValue(undefined);
  mocks.clear.mockResolvedValue(undefined);
  mocks.granted.mockResolvedValue(false);
  mocks.permission.mockResolvedValue("denied");
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const scope = {
  server: "https://example.com",
  accountId: "user",
  roomId: "room",
};
const saved: LocalPreferences = {
  ...defaultPreferences(),
  volume: 42,
  notificationsEnabled: true,
  recentProjects: [
    { path: "/first", name: "First" },
    { path: "/second", name: "Second" },
  ],
  activeProjectPath: "/first",
  roomProjects: [{ ...scope, path: "/first" }],
};
function SessionEditor() {
  const context = usePreferences()!;
  return (
    <button onClick={() => context.update((p) => ({ ...p, volume: 99 }))}>
      Change during clear
    </button>
  );
}
it("restores volume and notification intent without listening or requesting permission", async () => {
  mocks.load.mockResolvedValue(saved);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const view = render(
    <PreferencesProvider>
      <AmbientPlayer
        state={{
          track: "soft-noise-v1",
          duration_ms: 30000,
          playing: true,
          position_ms: 0,
          revision: 1,
          receivedAt: performance.now(),
        }}
        onPlaying={() => true}
      />
    </PreferencesProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("slider")).toHaveProperty("value", "42"),
  );
  expect(view.container.querySelector("audio")!.volume).toBe(0.42);
  expect(play).not.toHaveBeenCalled();
  expect(mocks.permission).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.getByText(/Notifications were remembered/)).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Enable system notifications" }),
  );
  await screen.findByRole("alert");
  expect(mocks.permission).toHaveBeenCalledOnce();
});
it("retains session changes after a save failure and retries them explicitly", async () => {
  mocks.save
    .mockRejectedValueOnce(new Error("full"))
    .mockResolvedValue(undefined);
  render(
    <PreferencesProvider>
      <div />
    </PreferencesProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("slider")).toHaveProperty("disabled", false),
  );
  fireEvent.change(screen.getByRole("slider"), { target: { value: "67" } });
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Could not save local preferences",
  );
  expect(screen.getByRole("slider")).toHaveProperty("value", "67");
  fireEvent.click(
    screen.getByRole("button", { name: "Retry saving preferences" }),
  );
  await screen.findByText("Preferences saved on this device.");
  expect(mocks.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ volume: 67 }),
  );
});
it("does not overwrite unreadable storage until a successful explicit clear", async () => {
  mocks.load.mockRejectedValue(new Error("corrupt"));
  mocks.clear
    .mockRejectedValueOnce(new Error("denied"))
    .mockResolvedValue(undefined);
  render(
    <PreferencesProvider>
      <div />
    </PreferencesProvider>,
  );
  await screen.findByText(/Could not load local preferences/);
  fireEvent.change(screen.getByRole("slider"), { target: { value: "67" } });
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Clear project and audio preferences" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Could not clear local preferences",
  );
  expect(screen.getByRole("slider")).toHaveProperty("value", "67");
  fireEvent.click(
    screen.getByRole("button", { name: "Clear project and audio preferences" }),
  );
  await screen.findByText(
    "Project and audio preferences cleared on this device.",
  );
  expect(screen.getByRole("slider")).toHaveProperty("value", "25");
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("slider"), { target: { value: "31" } });
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ volume: 31 }),
    ),
  );
});
it("locks updates while clear is pending so old preferences cannot be restored", async () => {
  mocks.load.mockResolvedValue(saved);
  let finish!: () => void;
  mocks.clear.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <PreferencesProvider>
      <SessionEditor />
    </PreferencesProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("slider")).toHaveProperty("value", "42"),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Clear project and audio preferences" }),
  );
  await waitFor(() => expect(mocks.clear).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Change during clear" }));
  fireEvent.change(screen.getByRole("slider"), { target: { value: "90" } });
  await act(async () => finish());
  expect(screen.getByRole("slider")).toHaveProperty("value", "25");
  expect(screen.getByText("No remembered repositories yet.")).toBeTruthy();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("serializes saves so the newest value is persisted last", async () => {
  let finish!: () => void;
  mocks.save
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  render(
    <PreferencesProvider>
      <div />
    </PreferencesProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("slider")).toHaveProperty("disabled", false),
  );
  fireEvent.change(screen.getByRole("slider"), { target: { value: "40" } });
  fireEvent.change(screen.getByRole("slider"), { target: { value: "41" } });
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  await act(async () => finish());
  expect(mocks.save.mock.calls.map(([p]) => p.volume)).toEqual([40, 41]);
});
it("restores room associations only for the matching scope and repairs missing folders", async () => {
  mocks.load.mockResolvedValue(saved);
  mocks.invoke.mockImplementation((_command, args) =>
    args.path === "/first"
      ? Promise.reject("Folder missing")
      : Promise.resolve({ ...demoRepository, root: "/moved", name: "Moved" }),
  );
  mocks.open.mockResolvedValue("/moved");
  const selected = vi.fn();
  render(
    <PreferencesProvider>
      <App embedded roomScope={scope} onProjectChange={selected} />
    </PreferencesProvider>,
  );
  await screen.findByText(
    "If this folder moved or is missing, choose its new location.",
  );
  expect(mocks.invoke).toHaveBeenCalledWith("read_repository", {
    path: "/first",
  });
  fireEvent.click(screen.getByRole("button", { name: "Reassign folder" }));
  await screen.findByText("Moved", { selector: "h2" });
  expect(selected).toHaveBeenCalledOnce();
  await waitFor(() =>
    expect(mocks.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ roomProjects: [{ ...scope, path: "/moved" }] }),
    ),
  );
});
it.each([
  { ...scope, accountId: "other" },
  { ...scope, server: "https://other.example" },
  { ...scope, roomId: "other" },
])("does not restore another scope's repository (%#)", async (otherScope) => {
  mocks.load.mockResolvedValue(saved);
  render(
    <PreferencesProvider>
      <App embedded roomScope={otherScope} />
    </PreferencesProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getAllByRole("button", { name: "Choose folder" })[0],
    ).toHaveProperty("disabled", false),
  );
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(screen.getByText("Great things start locally.")).toBeTruthy();
});
it("switches immediately without stale snapshot and removes all bindings to a removed folder", async () => {
  mocks.load.mockResolvedValue(saved);
  mocks.invoke.mockResolvedValueOnce({
    ...demoRepository,
    root: "/first",
    name: "First",
  });
  let finish!: (value: typeof demoRepository) => void;
  mocks.invoke.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const snapshots = vi.fn();
  const selected = vi.fn();
  render(
    <PreferencesProvider>
      <App onSnapshot={snapshots} onProjectChange={selected} />
    </PreferencesProvider>,
  );
  await screen.findByText("First", { selector: "h2" });
  snapshots.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Open repository" }));
  expect(screen.queryByText("First", { selector: "h2" })).toBeNull();
  expect(snapshots.mock.calls.every(([value]) => value === null)).toBe(true);
  expect(selected).toHaveBeenCalledOnce();
  await act(async () =>
    finish({ ...demoRepository, root: "/second", name: "Second" }),
  );
  await screen.findByText("Second", { selector: "h2" });
  fireEvent.click(
    screen.getByRole("button", { name: "Remove First from recent projects" }),
  );
  await waitFor(() =>
    expect(mocks.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ roomProjects: [] }),
    ),
  );
});
it("never inspects saved real repositories in the browser demo", async () => {
  mocks.desktop.mockReturnValue(false);
  mocks.load.mockResolvedValue(saved);
  render(
    <PreferencesProvider>
      <App />
    </PreferencesProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("slider")).toHaveProperty("value", "42"),
  );
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(
    screen
      .getAllByRole("button", { name: "Open repository" })
      .every((button) => (button as HTMLButtonElement).disabled),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /View demo/ }));
  expect(screen.getByText("DEMO REPOSITORY")).toBeTruthy();
  expect(mocks.invoke).not.toHaveBeenCalled();
});

it("discards a late permission grant after preferences were cleared", async () => {
  let grant!: (value: string) => void;
  mocks.permission.mockImplementation(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      }),
  );
  render(
    <PreferencesProvider>
      <div />
    </PreferencesProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("slider")).toHaveProperty("disabled", false),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Enable system notifications" }),
  );
  await waitFor(() => expect(mocks.permission).toHaveBeenCalledOnce());
  fireEvent.click(
    screen.getByRole("button", { name: "Clear project and audio preferences" }),
  );
  await screen.findByText(
    "Project and audio preferences cleared on this device.",
  );
  await act(async () => grant("granted"));
  expect(mocks.save).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Enable system notifications" }),
  ).toBeTruthy();
});
it("repairs an oldest missing room folder even when the recent-project cap evicts it", async () => {
  const atCapacity = {
    ...saved,
    recentProjects: [
      ...Array.from({ length: 19 }, (_, i) => ({
        path: `/recent${i}`,
        name: `Recent${i}`,
      })),
      { path: "/first", name: "First" },
    ],
  };
  mocks.load.mockResolvedValue(atCapacity);
  mocks.invoke.mockImplementation((_command, args) =>
    args.path === "/first"
      ? Promise.reject("Folder missing")
      : Promise.resolve({ ...demoRepository, root: "/moved", name: "Moved" }),
  );
  mocks.open.mockResolvedValue("/moved");
  render(
    <PreferencesProvider>
      <App embedded roomScope={scope} />
    </PreferencesProvider>,
  );
  await screen.findByText(
    "If this folder moved or is missing, choose its new location.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Reassign folder" }));
  await screen.findByText("Moved", { selector: "h2" });
  await waitFor(() =>
    expect(mocks.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ roomProjects: [{ ...scope, path: "/moved" }] }),
    ),
  );
  expect(mocks.save.mock.lastCall![0].recentProjects).toHaveLength(20);
});
it("discards a Settings folder picker result after the workspace scope changes", async () => {
  let pick!: (path: string) => void;
  mocks.open.mockImplementation(
    () =>
      new Promise((resolve) => {
        pick = resolve;
      }),
  );
  const view = render(
    <PreferencesProvider>
      <App key="first" embedded roomScope={scope} />
    </PreferencesProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("slider")).toHaveProperty("disabled", false),
  );
  fireEvent.click(screen.getAllByRole("button", { name: "Choose folder" })[1]);
  view.rerender(
    <PreferencesProvider>
      <App key="second" embedded roomScope={{ ...scope, accountId: "other" }} />
    </PreferencesProvider>,
  );
  await act(async () => pick("/chosen-for-first-account"));
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("discards a workspace picker result after that workspace unmounts", async () => {
  let pick!: (path: string) => void;
  mocks.open.mockImplementation(
    () =>
      new Promise((resolve) => {
        pick = resolve;
      }),
  );
  const view = render(
    <PreferencesProvider>
      <App key="first" embedded roomScope={scope} />
    </PreferencesProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("slider")).toHaveProperty("disabled", false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Connect repository" }));
  view.rerender(
    <PreferencesProvider>
      <App key="second" embedded roomScope={{ ...scope, accountId: "other" }} />
    </PreferencesProvider>,
  );
  await act(async () => pick("/chosen-for-first-account"));
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
