import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { demoRepository } from "./lib/repository";

const mocks = vi.hoisted(() => ({
  desktop: vi.fn(),
  open: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: mocks.desktop,
  invoke: mocks.invoke,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  vi.resetAllMocks();
});

describe("workspace", () => {
  it("clearly labels the browser demo, filters files and returns to the empty state", () => {
    mocks.desktop.mockReturnValue(false);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /View demo/ }));
    expect(screen.getByText("DEMO REPOSITORY")).toBeTruthy();
    expect(screen.getByText("src/styles/workspace.css")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Staged/ }));
    expect(screen.queryByText("src/styles/workspace.css")).toBeNull();
    expect(screen.getByText("src/components/Workspace.tsx")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Search files" }), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No matching files")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Disconnect repository" }),
    );
    expect(screen.getByText("Great things start locally.")).toBeTruthy();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("connects using a native picker and refreshes local state", async () => {
    vi.useFakeTimers();
    mocks.desktop.mockReturnValue(true);
    mocks.open.mockResolvedValue("/project");
    mocks.invoke
      .mockResolvedValueOnce(demoRepository)
      .mockResolvedValue({ ...demoRepository, files: [] });
    render(<App />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect repository" }),
      );
    });
    expect(mocks.open).toHaveBeenCalledWith(
      expect.objectContaining({ directory: true, multiple: false }),
    );
    expect(mocks.invoke).toHaveBeenCalledWith("read_repository", {
      path: "/project",
    });
    expect(screen.getByText("src/styles/workspace.css")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText("Clean working tree")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Disconnect repository" }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it("preserves the last snapshot on errors and recovers on the next refresh", async () => {
    vi.useFakeTimers();
    mocks.desktop.mockReturnValue(true);
    mocks.open.mockResolvedValue("/project");
    mocks.invoke
      .mockResolvedValueOnce(demoRepository)
      .mockRejectedValueOnce("The folder is unavailable.")
      .mockResolvedValue(demoRepository);
    render(<App />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect repository" }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByRole("alert").textContent).toContain("last known state");
    expect(screen.getByText("src/styles/workspace.css")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Connected")).toBeTruthy();
  });

  it("does not connect when the directory picker is cancelled", async () => {
    mocks.desktop.mockReturnValue(true);
    mocks.open.mockResolvedValue(null);
    render(<App />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect repository" }),
      );
    });
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(screen.getByText("Great things start locally.")).toBeTruthy();
  });
});

it("shows local tracking, detached HEAD, no commits and in-progress operations", async () => {
  mocks.desktop.mockReturnValue(true);
  mocks.open.mockResolvedValue("/project");
  mocks.invoke.mockResolvedValue({
    ...demoRepository,
    upstream: "origin/main",
    ahead: 2,
    behind: 3,
    operation: "rebase",
    detached: true,
    commit: null,
  });
  render(<App />);
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Connect repository" })),
  );
  expect(screen.getByText("Detached HEAD")).toBeTruthy();
  expect(screen.getByText(/2 ahead · 3 behind/)).toBeTruthy();
  expect(screen.getByText("Rebase in progress")).toBeTruthy();
  expect(screen.getByText("This repository has no commits yet.")).toBeTruthy();
  expect(screen.getByText(/DiGitA never fetches/)).toBeTruthy();
});

it("filters conflicts and untracked files and searches renamed paths", async () => {
  mocks.desktop.mockReturnValue(true);
  mocks.open.mockResolvedValue("/project");
  mocks.invoke.mockResolvedValue({
    ...demoRepository,
    files: [
      {
        ...demoRepository.files[0],
        path: "new.ts",
        originalPath: "old.ts",
        indexStatus: "R",
      },
      { ...demoRepository.files[2], path: "new-file.ts" },
      {
        ...demoRepository.files[0],
        path: "conflict.ts",
        conflicted: true,
        indexStatus: "U",
        worktreeStatus: "U",
      },
    ],
  });
  render(<App />);
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Connect repository" })),
  );
  fireEvent.click(screen.getByRole("button", { name: /^Conflicts/ }));
  expect(screen.getByText("conflict.ts")).toBeTruthy();
  expect(screen.queryByText("new-file.ts")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Untracked/ }));
  expect(screen.getByText("new-file.ts")).toBeTruthy();
  expect(screen.queryByText("conflict.ts")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^All/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Search files" }), {
    target: { value: "OLD.TS" },
  });
  expect(screen.getByText("new.ts")).toBeTruthy();
  expect(screen.queryByText("new-file.ts")).toBeNull();
});

it("copies only relative paths and the full hash and exposes a manual fallback", async () => {
  const write = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: write },
  });
  mocks.desktop.mockReturnValue(false);
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /View demo/ }));
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", {
        name: "Copy relative path src/components/Workspace.tsx",
      }),
    ),
  );
  expect(write).toHaveBeenCalledWith("src/components/Workspace.tsx");
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Copy full commit hash" }),
    ),
  );
  expect(write).toHaveBeenCalledWith(demoRepository.commit!.hash);
  expect(
    write.mock.calls.some(([value]) => value === demoRepository.root),
  ).toBe(false);
  write.mockRejectedValueOnce(new Error("Denied"));
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Copy full commit hash" }),
    ),
  );
  expect(
    screen.getByText("Could not copy. Select and copy the text manually."),
  ).toBeTruthy();
  expect(screen.getByText(demoRepository.commit!.hash)).toBeTruthy();
});

it("never describes stale empty status as clean or sends it as a snapshot", async () => {
  mocks.desktop.mockReturnValue(true);
  mocks.open.mockResolvedValue("/project");
  mocks.invoke
    .mockResolvedValueOnce({ ...demoRepository, files: [] })
    .mockRejectedValueOnce("Git timed out");
  const onSnapshot = vi.fn();
  render(<App onSnapshot={onSnapshot} />);
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Connect repository" })),
  );
  expect(screen.getByText("Clean working tree")).toBeTruthy();
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" })),
  );
  expect(screen.queryByText("Clean working tree")).toBeNull();
  expect(screen.getByText("Current Git status unavailable")).toBeTruthy();
  expect(onSnapshot).toHaveBeenLastCalledWith(null);
});

it("rejects an initial incomplete snapshot and keeps a large complete list searchable", async () => {
  mocks.desktop.mockReturnValue(true);
  mocks.open.mockResolvedValue("/project");
  const files = Array.from({ length: 1200 }, (_, i) => ({
    ...demoRepository.files[0],
    path: `src/loaded-${i}.ts`,
  }));
  mocks.invoke
    .mockResolvedValueOnce({
      ...demoRepository,
      files: [],
      statusComplete: false,
    })
    .mockResolvedValueOnce({
      ...demoRepository,
      files,
      statusComplete: true,
      upstream: null,
    });
  const onSnapshot = vi.fn();
  render(<App onSnapshot={onSnapshot} />);
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Connect repository" })),
  );
  expect(screen.queryByText("Clean working tree")).toBeNull();
  expect(onSnapshot.mock.calls.every(([snapshot]) => snapshot === null)).toBe(
    true,
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Try again" })),
  );
  expect(screen.getByText("No upstream configured.")).toBeTruthy();
  expect(screen.getAllByRole("row")).toHaveLength(101);
  expect(screen.getByText("Showing 1–100 of 1200 matching files")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next files" }));
  expect(screen.getByText("src/loaded-100.ts")).toBeTruthy();
  expect(screen.queryByText("src/loaded-0.ts")).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Search files" }), {
    target: { value: "loaded-1199" },
  });
  expect(screen.getByText("src/loaded-1199.ts")).toBeTruthy();
  expect(screen.queryByText("src/loaded-0.ts")).toBeNull();
  expect(screen.getByText("1 / 1200 files")).toBeTruthy();
});
