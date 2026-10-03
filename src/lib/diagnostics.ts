import { invoke, isTauri } from "@tauri-apps/api/core";
import { version } from "../../package.json";
import type { Language } from "../i18n";

export const projectLinks = {
  help: "https://github.com/ItzSoftTheFox/DiGitA#readme",
  issues: "https://github.com/ItzSoftTheFox/DiGitA/issues/new",
};

/** An explicit allowlist: never serialize runtime, account or repository objects. */
export function diagnosticSummary(options: {
  desktop: boolean;
  language: Language;
}): string {
  const release = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version)
    ? version
    : "unknown";
  return [
    "DiGitA diagnostics",
    `Version: ${release}`,
    `Runtime: ${options.desktop === true ? "desktop" : "browser"}`,
    `Language: ${options.language === "cs" ? "cs" : "en"}`,
  ].join("\n");
}

export async function openProjectLink(
  link: keyof typeof projectLinks,
): Promise<void> {
  if (isTauri()) await invoke<void>("open_project_link", { link });
}
