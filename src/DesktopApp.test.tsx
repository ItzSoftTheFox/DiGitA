import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DesktopApp from "./DesktopApp";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("./lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/api")>()),
  api: mocks.api,
  credentials: { read: mocks.read, save: mocks.save, clear: mocks.clear },
}));
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (key === "digita.intro.seen" ? "yes" : null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
});
import { ApiError } from "./lib/api";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
  expect(
    await screen.findByText("Remembered user", { selector: ".signed-user" }),
  ).toBeTruthy();
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
  mocks.read.mockRejectedValue(
    new Error("The system credential store is unavailable."),
  );
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
  expect(
    await screen.findByText("Test user", { selector: ".signed-user" }),
  ).toBeTruthy();
  expect(
    screen
      .getByText(/You are signed in for this app session/)
      .getAttribute("role"),
  ).toBe("status");
  expect(mocks.save).toHaveBeenCalledWith("test-token");
  expect(mocks.clear).toHaveBeenCalled();
  expect(mocks.api.mock.calls.some(([path]) => path === "/auth/logout")).toBe(
    false,
  );
});

async function openDashboard() {
  mocks.read.mockResolvedValue("token");
  mocks.clear.mockResolvedValue(undefined);
  mocks.api.mockImplementation(async (path: string) =>
    path === "/auth/me"
      ? { id: "user", email: "test@example.com", display_name: "Test user" }
      : [],
  );
  render(<DesktopApp />);
  await screen.findByText("Your first shared space.");
}

it("blocks rapid and ambiguous creation retries until a successful refresh and explicit check", async () => {
  await openDashboard();
  fireEvent.click(screen.getByRole("button", { name: "Create team" }));
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
    target: { value: "Test team" },
  });
  let reject!: (reason: unknown) => void;
  mocks.api.mockImplementation((path, _token, method) =>
    method === "POST"
      ? new Promise((_, fail) => {
          reject = fail;
        })
      : Promise.resolve([]),
  );
  const form = screen.getByRole("button", { name: "Create" }).closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(
    mocks.api.mock.calls.filter(([, , method]) => method === "POST"),
  ).toHaveLength(1);
  reject(new ApiError(0, "Cannot reach the server.", 0, true));
  await screen.findByText("Check before trying again");
  expect(screen.getByRole("button", { name: "Create" })).toHaveProperty(
    "disabled",
    true,
  );
  const acknowledge = screen.getByRole("button", {
    name: "I checked — allow a new request",
  });
  expect(acknowledge).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByRole("button", { name: "Refresh rooms" }));
  await vi.waitFor(() => expect(acknowledge).toHaveProperty("disabled", false));
  expect(screen.getByRole("button", { name: "Create" })).toHaveProperty(
    "disabled",
    true,
  );
  fireEvent.click(acknowledge);
  expect(screen.getByRole("button", { name: "Create" })).toHaveProperty(
    "disabled",
    false,
  );
  expect(screen.getByLabelText("Name", { exact: true })).toHaveProperty(
    "value",
    "Test team",
  );
  expect(
    mocks.api.mock.calls.filter(([, , method]) => method === "POST"),
  ).toHaveLength(1);
});

it("returns to sign-in on mutation expiry and clears remembered credentials", async () => {
  await openDashboard();
  mocks.api.mockRejectedValue(
    new ApiError(401, "Your session has expired. Sign in again."),
  );
  fireEvent.click(screen.getByRole("button", { name: "Create team" }));
  fireEvent.submit(
    screen.getByRole("button", { name: "Create" }).closest("form")!,
  );
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Your session has expired. Sign in again.",
  );
  expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  expect(mocks.clear).toHaveBeenCalledOnce();
});

it("retries saved sign-in after synchronous credential-store failure", async () => {
  mocks.read
    .mockImplementationOnce(() => {
      throw new Error("private keyring error");
    })
    .mockResolvedValue(null);
  render(<DesktopApp />);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Could not read saved sign-in. Unlock your system credential store and retry, or sign in without remembering this session.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry saved sign-in" }));
  await vi.waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(mocks.read).toHaveBeenCalledTimes(2);
});

it("keeps pending mutations locked when switching to local mode and back", async () => {
  await openDashboard();
  let finish!: () => void;
  mocks.api.mockImplementation((_path, _token, method) =>
    method === "POST"
      ? new Promise<void>((resolve) => {
          finish = resolve;
        })
      : Promise.resolve([]),
  );
  fireEvent.click(screen.getByRole("button", { name: "Create team" }));
  fireEvent.submit(
    screen.getByRole("button", { name: "Create" }).closest("form")!,
  );
  fireEvent.click(screen.getByRole("button", { name: "Local mode" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Back to team space" }),
  );
  await screen.findByText("Your first shared space.");
  expect(screen.getByRole("button", { name: "Create team" })).toHaveProperty(
    "disabled",
    true,
  );
  finish();
  await vi.waitFor(() =>
    expect(screen.getByRole("button", { name: "Create team" })).toHaveProperty(
      "disabled",
      false,
    ),
  );
  expect(
    mocks.api.mock.calls.filter(([, , method]) => method === "POST"),
  ).toHaveLength(1);
});

it.each([false, true])(
  "registers independently of remember sign-in (%s)",
  async (remember) => {
    mocks.read.mockResolvedValue(null);
    mocks.clear.mockResolvedValue(undefined);
    mocks.save.mockResolvedValue(undefined);
    mocks.api.mockImplementation(async (path: string) => {
      if (path === "/auth/login") return { access_token: "test-token" };
      if (path === "/auth/me")
        return {
          id: "user",
          email: "test@example.com",
          display_name: "New user",
        };
      return [];
    });
    render(<DesktopApp />);
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign in" })).toHaveProperty(
        "disabled",
        false,
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "No account? Register" }),
    );
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "New user" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "test-only-password" },
    });
    if (remember)
      fireEvent.click(
        screen.getByLabelText(
          "Remember sign-in in the system credential store",
        ),
      );
    fireEvent.submit(
      screen.getByRole("button", { name: "Create account" }).closest("form")!,
    );
    await screen.findByText("New user", { selector: ".signed-user" });
    expect(mocks.api).toHaveBeenCalledWith(
      "/auth/register",
      undefined,
      "POST",
      {
        email: "test@example.com",
        password: "test-only-password",
        display_name: "New user",
      },
    );
    expect(mocks.save).toHaveBeenCalledTimes(remember ? 1 : 0);
  },
);

it("does not describe a later login failure as an uncertain registration", async () => {
  mocks.read.mockResolvedValue(null);
  mocks.api.mockImplementation(async (path: string) => {
    if (path === "/auth/register") return {};
    throw new ApiError(
      0,
      "Cannot reach the server. Check your connection and try again.",
      0,
      true,
    );
  });
  render(<DesktopApp />);
  await vi.waitFor(() =>
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveProperty(
      "disabled",
      false,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "No account? Register" }));
  fireEvent.submit(
    screen.getByRole("button", { name: "Create account" }).closest("form")!,
  );
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Cannot reach the server. Check your connection and try again.",
  );
});
