import { SettingsButton, SettingsContent } from "./components/LanguageSettings";
import { t, useTranslation, dateLocale } from "./i18n";
import { useEffect, useState, type ReactNode } from "react";
import type { RepositorySnapshot } from "./lib/repository";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Circle,
  Command,
  FileCode2,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  LayoutGrid,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Unplug,
  X,
} from "lucide-react";
import {
  demoRepository,
  isStaged,
  isUnstaged,
  statusLabel,
} from "./lib/repository";
import { useRepository } from "./hooks/useRepository";

type Filter = "all" | "staged" | "unstaged";
const clock = (date: Date) =>
  date.toLocaleTimeString(dateLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function Mark({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? "mark small" : "mark"}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 5h16l14 14v16H19L5 21V5Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M14 5v21h21M5 14h21v21" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function App({
  onSnapshot,
  embedded = false,
  navigation,
}: {
  onSnapshot?: (value: RepositorySnapshot | null) => void;
  embedded?: boolean;
  navigation?: ReactNode;
}) {
  useTranslation();
  const desktop = isTauri();
  const [path, setPath] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const state = useRepository(path);
  useEffect(() => {
    onSnapshot?.(demo || state.error ? null : state.snapshot);
  }, [demo, state.snapshot, state.error, onSnapshot]);
  const repo = demo ? demoRepository : state.snapshot;
  const error = pickerError || state.error;
  const staged = repo?.files.filter(isStaged).length ?? 0;
  const unstaged = repo?.files.filter(isUnstaged).length ?? 0;
  const files =
    repo?.files.filter(
      (file) =>
        (filter === "all" ||
          (filter === "staged" ? isStaged(file) : isUnstaged(file))) &&
        `${file.path} ${file.originalPath ?? ""}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    ) ?? [];

  async function selectRepository() {
    setPickerError(null);
    setPicking(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("Choose a Git repository"),
      });
      if (typeof selected === "string") {
        setDemo(false);
        setQuery("");
        setFilter("all");
        if (selected === path) state.refresh();
        else setPath(selected);
      }
    } catch (cause) {
      setPickerError(String(cause));
    } finally {
      setPicking(false);
    }
  }
  function disconnect() {
    setPath(null);
    setDemo(false);
    setPickerError(null);
    setQuery("");
    setFilter("all");
  }
  const chooseButton = (
    <button
      className="button primary"
      disabled={picking}
      onClick={() => void selectRepository()}
    >
      {picking ? (
        <LoaderCircle className="spin" size={15} />
      ) : (
        <Plus size={15} />
      )}{" "}
      {t("Connect repository")} <ArrowUpRight size={15} />
    </button>
  );

  return (
    <div className={embedded ? "app-shell embedded-workspace" : "app-shell"}>
      <SettingsContent section="projects">
        <p>{repo ? repo.name : t("No repository connected")}</p>
      </SettingsContent>
      <aside className="sidebar">
        <a
          className="brand"
          href="#workspace"
          aria-label={t("DiGitA — go to workspace")}
        >
          <Mark />
          <span>
            DiGitA<span className="brand-period">01</span>
          </span>
        </a>
        <div className="sidebar-section-label">
          {t("WORKSPACE")} <span>01</span>
        </div>
        <a className="nav-active" href="#workspace" aria-label={t("Overview")}>
          <LayoutGrid size={16} />
          <span>{t("Overview")}</span>
          <ArrowUpRight size={15} />
        </a>
        <div className="sidebar-repository">
          <div className="sidebar-section-label">{t("REPOSITORY")}</div>
          {repo ? (
            <div className="repo-nav">
              <FolderGit2 size={16} />
              <span title={repo.root}>{repo.name}</span>
              <span className="square-dot" />
            </div>
          ) : (
            <div className="repo-placeholder">
              <span className="dashed-square" /> {t("Not connected yet")}
            </div>
          )}
          {desktop && (
            <button
              className="sidebar-add"
              onClick={() => void selectRepository()}
              disabled={picking}
            >
              <Plus size={14} /> {t("Choose folder")}
            </button>
          )}
        </div>
        <div className="sidebar-bottom">
          {!embedded && <SettingsButton />}
          <div className="privacy-card">
            <ShieldCheck size={19} />
            <p>
              {t("Your code. Your space.")}
              <span>
                {t("Repository contents stay")}
                <br />
                {t("on this device.")}
              </span>
            </p>
          </div>
          <div className="local-profile">
            <div className="profile-icon">
              <Command size={16} />
            </div>
            <div>
              {t("Local workspace")}
              <span>{t("Personal space")}</span>
            </div>
            <span className="square-dot" />
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          {navigation}
          <div className="breadcrumb" hidden={!!navigation}>
            <span>{t("Workspace")}</span>
            <ChevronRight size={12} />
            <strong>{t("Overview")}</strong>
          </div>
          <div className="mode-label">
            <span className="square-dot" />
            {demo ? t("DEMO REPOSITORY") : t("LOCAL MODE")}
          </div>
        </header>
        <main id="workspace">
          <div className="page-heading enter">
            <div>
              <div className="eyebrow">{t("LESS NOISE. MORE FOCUS.")}</div>
              <h1>
                {t("Space for your work")}
                <span>.</span>
              </h1>
              <p>
                {t("Your repository. Everything that matters in one place.")}
              </p>
            </div>
            <span className="edition">
              {t("LOCAL EDITION")}
              <br />
              <b>001 — WORKSPACE</b>
            </span>
          </div>

          {!desktop && (
            <div className="browser-note">
              <span>
                <Circle size={12} />{" "}
                {demo ? t("You are viewing demo data.") : t("Browser preview.")}{" "}
                {t("Connect a local repository in the desktop app.")}
              </span>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <X size={17} />
              <div>
                <strong>{t("Could not load the repository.")}</strong>
                <p>{t(error)}</p>
                {state.snapshot && (
                  <span>{t("Showing the last known state.")}</span>
                )}
              </div>
              <button
                className="icon-button"
                aria-label={t("Try again")}
                onClick={state.refresh}
                disabled={state.busy}
              >
                <RefreshCw size={16} />
              </button>
            </div>
          )}

          {repo ? (
            <div className="repository-content enter" key={repo.root}>
              <section className="repository-header">
                <div className="repo-symbol">
                  <FolderGit2 size={25} strokeWidth={1.3} />
                </div>
                <div className="repo-identity">
                  <div className="eyebrow">{t("ACTIVE REPOSITORY")}</div>
                  <h2>{repo.name}</h2>
                  <span className="mono repo-path" title={repo.root}>
                    {repo.root}
                  </span>
                </div>
                <div className="repo-actions">
                  <span className="connection">
                    <span
                      className={
                        demo || error
                          ? "square-dot muted-dot"
                          : "square-dot live-dot"
                      }
                    />
                    {demo
                      ? t("Demo")
                      : error
                        ? t("Out of date")
                        : t("Connected")}
                  </span>
                  <button
                    className="icon-button"
                    title={t("Refresh status")}
                    aria-label={t("Refresh status")}
                    disabled={demo || state.busy}
                    onClick={state.refresh}
                  >
                    <RefreshCw size={16} className={state.busy ? "spin" : ""} />
                  </button>
                  <button
                    className="icon-button"
                    title={t("Disconnect repository")}
                    aria-label={t("Disconnect repository")}
                    onClick={disconnect}
                  >
                    <Unplug size={16} />
                  </button>
                </div>
              </section>

              <div className="metrics">
                <section className="metric">
                  <div className="metric-label">
                    <span>{t("CURRENT BRANCH")}</span>
                    <GitBranch size={16} />
                  </div>
                  <div className="branch-value" title={repo.branch}>
                    {repo.branch}
                  </div>
                  <div className="metric-foot">
                    {repo.detached
                      ? t("Working outside a named branch")
                      : t("Your current working context")}
                  </div>
                </section>
                <section className="metric">
                  <div className="metric-label">
                    <span>{t("LOCAL CHANGES")}</span>
                    <FileCode2 size={16} />
                  </div>
                  <div className="metric-number">
                    {String(repo.files.length).padStart(2, "0")}
                    <span>{t("files")}</span>
                  </div>
                  <div className="metric-foot">
                    <span className="tiny-line" /> {unstaged}{" "}
                    {t("with unstaged changes")}
                  </div>
                </section>
                <section className="metric">
                  <div className="metric-label">
                    <span>{t("STAGED FOR COMMIT")}</span>
                    <GitCommitHorizontal size={17} />
                  </div>
                  <div className="metric-number">
                    {String(staged).padStart(2, "0")}
                    <span>{t("files")}</span>
                  </div>
                  <div className="metric-foot">
                    <span className="tiny-line filled" />{" "}
                    {t("Changes in the index")}
                  </div>
                </section>
              </div>

              <section className="changes-panel">
                <div className="section-heading">
                  <h3>
                    {t("Changed files")}{" "}
                    <span className="count">{repo.files.length}</span>
                  </h3>
                  <span className="eyebrow subtle">{t("WORKING TREE")}</span>
                </div>
                <div className="table-toolbar">
                  <div className="tabs" aria-label={t("Filter changes")}>
                    {(
                      [
                        ["all", t("All"), repo.files.length],
                        ["staged", t("Staged"), staged],
                        ["unstaged", t("Unstaged"), unstaged],
                      ] as const
                    ).map(([value, label, count]) => (
                      <button
                        key={value}
                        aria-pressed={filter === value}
                        className={filter === value ? "selected" : ""}
                        onClick={() => setFilter(value)}
                      >
                        {label}
                        <span>{count}</span>
                      </button>
                    ))}
                  </div>
                  <label className="search">
                    <Search size={14} />
                    <input
                      aria-label={t("Search files")}
                      placeholder={t("Search files…")}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    {query && (
                      <button
                        aria-label={t("Clear search")}
                        onClick={() => setQuery("")}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </label>
                </div>
                <div className="file-table-wrap">
                  <table className="file-table">
                    <thead>
                      <tr>
                        <th>{t("FILE")}</th>
                        <th>{t("INDEX")}</th>
                        <th>{t("WORKING COPY")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((file) => (
                        <tr key={file.path}>
                          <td>
                            <div className="file-name">
                              <FileCode2 size={16} />
                              <div>
                                <span className="mono">{file.path}</span>
                                {file.originalPath && (
                                  <small>← {file.originalPath}</small>
                                )}
                                {file.conflicted && (
                                  <small>
                                    {t("Conflict needs resolution")}
                                  </small>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`status-badge ${[".", "?"].includes(file.indexStatus) ? "empty-status" : ""}`}
                            >
                              {file.conflicted
                                ? t("Conflict")
                                : statusLabel(
                                    file.indexStatus === "?"
                                      ? "."
                                      : file.indexStatus,
                                  )}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`status-badge ${file.worktreeStatus === "." ? "empty-status" : ""}`}
                            >
                              {file.conflicted
                                ? t("Conflict")
                                : statusLabel(file.worktreeStatus)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!files.length && (
                  <div className="table-empty">
                    {repo.files.length ? (
                      <Search size={22} />
                    ) : (
                      <Check size={24} />
                    )}
                    <strong>
                      {repo.files.length
                        ? t("No matching files")
                        : t("Clean working tree")}
                    </strong>
                    <span>
                      {repo.files.length
                        ? t("Try another filter or search term.")
                        : t(
                            "Everything is saved in Git. Room for your next idea.",
                          )}
                    </span>
                  </div>
                )}
                <div className="table-footer">
                  <span>
                    <span className="square-dot muted-dot" />
                    {demo ? t("Demo data") : t("Auto-refresh every 2 seconds")}
                  </span>
                  <span>
                    {files.length} / {repo.files.length} {t("files")}
                  </span>
                </div>
              </section>

              <section className="commit-panel">
                <div className="commit-label">
                  <GitCommitHorizontal size={19} />
                  <span>{t("LATEST COMMIT")}</span>
                </div>
                {repo.commit ? (
                  <>
                    <div className="commit-details">
                      <h3>{repo.commit.subject}</h3>
                      <p>
                        {repo.commit.author}
                        <span>·</span>
                        {new Date(repo.commit.authoredAt).toLocaleString(
                          dateLocale(),
                          {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </p>
                    </div>
                    <code title={repo.commit.hash}>
                      {repo.commit.hash.slice(0, 7)}
                    </code>
                  </>
                ) : (
                  <div className="commit-details">
                    <h3>{t("Every project starts somewhere.")}</h3>
                    <p>{t("This repository has no commits yet.")}</p>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <section className="empty-workspace enter">
              <div className="empty-top">
                <span className="eyebrow">{t("01 / CONNECT")}</span>
                <span className="crosshair">+</span>
              </div>
              <div className="empty-art" aria-hidden="true">
                <div className="art-grid" />
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="art-core">
                  <Mark />
                </div>
                <span className="art-node node-one" />
                <span className="art-node node-two" />
                <span className="art-coordinate">LOCAL / GIT</span>
              </div>
              <div className="empty-copy">
                <span className="eyebrow">
                  {t("YOUR NEXT GREAT IDEA STARTS HERE")}
                </span>
                <h2>
                  {state.busy
                    ? t("Loading your workspace…")
                    : t("Great things start locally.")}
                </h2>
                <p>
                  {t("Connect your Git repository to keep track")}
                  <br />
                  {t("of branches, commits, and every change.")}
                </p>
                {desktop ? (
                  chooseButton
                ) : (
                  <button
                    className="button primary"
                    onClick={() => setDemo(true)}
                  >
                    <LayoutGrid size={15} /> {t("View demo")}{" "}
                    <ArrowUpRight size={15} />
                  </button>
                )}
                {path && (
                  <button className="text-button" onClick={disconnect}>
                    {t("Cancel connection")}
                  </button>
                )}
              </div>
              <div className="empty-bottom">
                <span>
                  <ShieldCheck size={14} /> {t("Only on your device")}
                </span>
                <span>
                  {t("YOUR WORKFLOW STAYS YOURS")} <ArrowDownRight size={15} />
                </span>
              </div>
            </section>
          )}

          <footer className="page-footer">
            <span>
              <Mark small /> {t("BUILT FOR FOCUS.")}
            </span>
            <span>
              {demo
                ? t("DEMO / PREVIEW")
                : state.updatedAt
                  ? t(
                      state.error
                        ? "LAST SUCCESSFUL REFRESH {time}"
                        : "LAST REFRESH {time}",
                      { time: clock(state.updatedAt) },
                    )
                  : "DIGITA / V 0.1.0"}
              <Minus size={16} />
              <span>{t("LOCAL FIRST")}</span>
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
