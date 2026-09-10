import { invoke } from "@tauri-apps/api/core";

export interface ChangedFile {
  path: string;
  originalPath: string | null;
  indexStatus: string;
  worktreeStatus: string;
  conflicted: boolean;
}
export interface RepositorySnapshot {
  root: string;
  name: string;
  branch: string;
  detached: boolean;
  commit: {
    hash: string;
    subject: string;
    author: string;
    authoredAt: string;
  } | null;
  files: ChangedFile[];
}
export const readRepository = (path: string) =>
  invoke<RepositorySnapshot>("read_repository", { path });
export const isStaged = (file: ChangedFile) =>
  ![".", "?"].includes(file.indexStatus) && !file.conflicted;
export const isUnstaged = (file: ChangedFile) =>
  file.worktreeStatus !== "." && !file.conflicted;
export const statusLabel = (value: string) =>
  ({
    ".": "—",
    "?": "Nový",
    M: "Upravený",
    A: "Přidaný",
    D: "Smazaný",
    R: "Přejmenovaný",
    C: "Kopie",
    U: "Konflikt",
    T: "Změna typu",
  })[value] ?? value;

export const demoRepository: RepositorySnapshot = {
  root: "~/Projects/digita",
  name: "digita",
  branch: "feature/local-workspace",
  detached: false,
  commit: {
    hash: "a84c19fd05ab729c0e014671f54fdc87bd60b231",
    subject: "Create a little space for great work",
    author: "Alex Morgan",
    authoredAt: "2026-09-10T16:42:00Z",
  },
  files: [
    {
      path: "src/components/Workspace.tsx",
      originalPath: null,
      indexStatus: "M",
      worktreeStatus: ".",
      conflicted: false,
    },
    {
      path: "src/styles/workspace.css",
      originalPath: null,
      indexStatus: ".",
      worktreeStatus: "M",
      conflicted: false,
    },
    {
      path: "src/hooks/useRepository.ts",
      originalPath: null,
      indexStatus: "?",
      worktreeStatus: "?",
      conflicted: false,
    },
    {
      path: "README.md",
      originalPath: null,
      indexStatus: ".",
      worktreeStatus: "M",
      conflicted: false,
    },
  ],
};
