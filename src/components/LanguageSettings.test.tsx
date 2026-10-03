import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LanguageSettings, SettingsButton } from "./LanguageSettings";
import { setLanguage } from "../i18n";
const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: native.invoke,
}));
beforeEach(() => {
  vi.resetAllMocks();
  setLanguage("en");
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function () {
      this.removeAttribute("open");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function () {
      this.setAttribute("open", "");
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function about() {
  render(
    <LanguageSettings>
      <SettingsButton />
    </LanguageSettings>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "About" }));
}
it("opens fixed project links through the native command and reports launch failure", async () => {
  native.invoke.mockRejectedValueOnce(new Error("private launcher detail"));
  about();
  fireEvent.click(screen.getByRole("link", { name: "Help and documentation" }));
  expect(native.invoke).toHaveBeenCalledWith("open_project_link", {
    link: "help",
  });
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Could not open the link. Try again.",
  );
  expect(screen.queryByText("private launcher detail")).toBeNull();
});
it("reports clipboard failure without copying error internals", async () => {
  const writeText = vi
    .fn()
    .mockRejectedValue(new Error("private clipboard detail"));
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  about();
  fireEvent.click(
    screen.getByRole("button", { name: "Copy diagnostic summary" }),
  );
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Could not copy the diagnostic summary. Try again.",
  );
  expect(writeText.mock.calls[0][0]).toMatch(
    /^DiGitA diagnostics\nVersion: \d+\.\d+\.\d+\nRuntime: desktop\nLanguage: en$/,
  );
  expect(screen.queryByText("private clipboard detail")).toBeNull();
});
