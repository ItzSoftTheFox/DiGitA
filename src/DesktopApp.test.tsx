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
  ApiError: class extends Error {},
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
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
    name: "Přihlásit se",
  });
  await vi.waitFor(() =>
    expect((submit as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "user@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Heslo"), {
    target: { value: "test-only-password" },
  });
  fireEvent.click(
    screen.getByLabelText("Zapamatovat přihlášení v systémovém úložišti"),
  );
  fireEvent.submit(submit.closest("form")!);
  expect(await screen.findByText("Test user")).toBeTruthy();
  expect(
    screen.getByText(/Jste přihlášeni pro toto spuštění/).getAttribute("role"),
  ).toBe("status");
  expect(mocks.save).toHaveBeenCalledWith("test-token");
  expect(mocks.clear).toHaveBeenCalled();
  expect(mocks.api.mock.calls.some(([path]) => path === "/auth/logout")).toBe(
    false,
  );
});
