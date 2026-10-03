import { afterEach, expect, it, vi } from "vitest";
import { diagnosticSummary, openProjectLink } from "./diagnostics";
import { version } from "../../package.json";

it("copies a bounded allowlisted summary even when supplied private fields", () => {
  const context = {
    desktop: true,
    language: "cs" as const,
    path: "/private/project",
    token: "secret-token",
    email: "private@example.com",
    error: "private failure",
  };
  const summary = diagnosticSummary(context);
  expect(summary).toBe(
    `DiGitA diagnostics\nVersion: ${version}\nRuntime: desktop\nLanguage: cs`,
  );
  expect(summary.length).toBeLessThan(128);
  for (const secret of [
    context.path,
    context.token,
    context.email,
    context.error,
  ])
    expect(summary).not.toContain(secret);
});
it("does not interpolate arbitrary language or runtime values", () => {
  expect(diagnosticSummary({ desktop: false, language: "en" })).toContain(
    "Runtime: browser\nLanguage: en",
  );
  expect(
    diagnosticSummary({
      desktop: "secret" as unknown as boolean,
      language: "/private/path" as "en",
    }),
  ).toContain("Runtime: browser\nLanguage: en");
});

const native = vi.hoisted(() => ({
  desktop: vi.fn(() => false),
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: native.desktop,
  invoke: native.invoke,
}));
afterEach(() => {
  vi.resetAllMocks();
  native.desktop.mockReturnValue(false);
});
it("opens only the native project link enum and surfaces launch failures", async () => {
  await openProjectLink("help");
  expect(native.invoke).not.toHaveBeenCalled();
  native.desktop.mockReturnValue(true);
  await openProjectLink("issues");
  expect(native.invoke).toHaveBeenCalledWith("open_project_link", {
    link: "issues",
  });
  native.invoke.mockRejectedValueOnce(new Error("unavailable"));
  await expect(openProjectLink("help")).rejects.toThrow("unavailable");
});
