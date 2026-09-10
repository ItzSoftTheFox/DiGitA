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
    fireEvent.click(screen.getByRole("button", { name: /Prohlédnout ukázku/ }));
    expect(screen.getByText("UKÁZKOVÝ REPOZITÁŘ")).toBeTruthy();
    expect(screen.getByText("src/styles/workspace.css")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Připravené/ }));
    expect(screen.queryByText("src/styles/workspace.css")).toBeNull();
    expect(screen.getByText("src/components/Workspace.tsx")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Hledat soubor" }), {
      target: { value: "missing" },
    });
    expect(screen.getByText("Žádné odpovídající soubory")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Odpojit repozitář" }));
    expect(screen.getByText("Velké věci začínají lokálně.")).toBeTruthy();
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
        screen.getByRole("button", { name: "Připojit repozitář" }),
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
    expect(screen.getByText("Čistý pracovní strom")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Odpojit repozitář" }));
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
      .mockRejectedValueOnce("Složka není dostupná.")
      .mockResolvedValue(demoRepository);
    render(<App />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Připojit repozitář" }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "poslední známý stav",
    );
    expect(screen.getByText("src/styles/workspace.css")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Připojeno")).toBeTruthy();
  });

  it("does not connect when the directory picker is cancelled", async () => {
    mocks.desktop.mockReturnValue(true);
    mocks.open.mockResolvedValue(null);
    render(<App />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Připojit repozitář" }),
      );
    });
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(screen.getByText("Velké věci začínají lokálně.")).toBeTruthy();
  });
});
