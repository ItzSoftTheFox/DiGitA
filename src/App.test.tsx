import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { demoRepository } from "./repository";

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
    expect(screen.getByRole("alert").textContent).toContain(
      "last known state",
    );
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
