import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import DesktopApp from "./DesktopApp";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("./api", () => ({
  api: mocks.api,
  credentials: { read: mocks.read, save: mocks.save, clear: mocks.clear },
  ApiError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
import { ApiError } from "./api";
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("restores a remembered session after restarting the app", async () => {
  mocks.read.mockResolvedValue("remembered-token");
  mocks.api.mockImplementation(async (path: string) =>
    path === "/auth/me"
      ? {
          id: "user",
          email: "user@example.com",
          display_name: "Remembered user",
        }
      : [],
  );
  render(<DesktopApp />);
  expect(await screen.findByText("Remembered user")).toBeTruthy();
  expect(mocks.api).toHaveBeenCalledWith("/auth/me", "remembered-token");
  expect(mocks.clear).not.toHaveBeenCalled();
});

it("removes an expired remembered session and returns to login", async () => {
  mocks.read.mockResolvedValue("expired-token");
  mocks.api.mockRejectedValue(new ApiError(401, "The session expired."));
  mocks.clear.mockResolvedValue(undefined);
  render(<DesktopApp />);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "The session expired.",
  );
  expect(mocks.clear).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Sign in" })).toHaveProperty(
    "disabled",
    false,
  );
});

it("preserves remembered credentials during a network outage and allows local work", async () => {
  mocks.read.mockResolvedValue("remembered-token");
  mocks.api.mockRejectedValue(new TypeError("Failed to fetch"));
  render(<DesktopApp />);
  await screen.findByRole("alert");
  expect(mocks.clear).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Local mode" }));
  expect(
    await screen.findByRole("button", { name: "Sign in online" }),
  ).toBeTruthy();
});

it("allows local work when loading the OS credential store fails", async () => {
  mocks.read.mockRejectedValue(new Error("The system credential store is unavailable."));
  render(<DesktopApp />);
  await screen.findByRole("alert");
  expect(mocks.api).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Local mode" }));
  expect(
    await screen.findByRole("button", { name: "Sign in online" }),
  ).toBeTruthy();
});

it("keeps an authenticated session usable when the OS keyring is unavailable", async () => {
  mocks.read.mockResolvedValue(null);
  mocks.save.mockRejectedValue(new Error("locked"));
  mocks.clear.mockRejectedValue(new Error("locked"));
  mocks.api.mockImplementation(async (path: string) => {
    if (path === "/auth/login") return { access_token: "test-token" };
    if (path === "/auth/me")
      return {
        id: "user",
        email: "user@example.com",
        display_name: "Test user",
      };
    return [];
  });
  render(<DesktopApp />);
  const submit = await screen.findByRole("button", {
    name: "Sign in",
  });
  await vi.waitFor(() =>
    expect((submit as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "user@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "test-only-password" },
  });
  fireEvent.click(
    screen.getByLabelText("Remember sign-in in the system credential store"),
  );
  fireEvent.submit(submit.closest("form")!);
  expect(await screen.findByText("Test user")).toBeTruthy();
  expect(
    screen.getByText(/You are signed in for this app session/).getAttribute("role"),
  ).toBe("status");
  expect(mocks.save).toHaveBeenCalledWith("test-token");
  expect(mocks.clear).toHaveBeenCalled();
  expect(mocks.api.mock.calls.some(([path]) => path === "/auth/logout")).toBe(
    false,
  );
});
