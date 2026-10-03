import { SettingsButton, SettingsContent } from "./components/LanguageSettings";
import { t, useTranslation, dateLocale } from "./i18n";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePreferences } from "./components/Preferences";
import {
  rememberProject,
  roomProject,
  type RoomScope,
} from "./lib/preferences";
import type { RepositorySnapshot } from "./lib/repository";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Circle,
  Copy,
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
  isUntracked,
  statusLabel,
} from "./lib/repository";
import { useRepository } from "./hooks/useRepository";

type Filter = "all" | "staged" | "unstaged" | "untracked" | "conflicts";
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
  roomScope,
  onProjectChange,
  renderSidebar,
  repositoryActions,
}: {
  onSnapshot?: (value: RepositorySnapshot | null) => void;
  embedded?: boolean;
  navigation?: ReactNode;
  roomScope?: RoomScope;
  onProjectChange?: () => void;
  renderSidebar?: (repositoryNavigation: ReactNode) => ReactNode;
  repositoryActions?: ReactNode;
}) {
  useTranslation();
  const desktop = isTauri();
  const preferences = usePreferences();
  const initialRestored = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [path, setPath] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [copyNotice, setCopyNotice] = useState("");
  const state = useRepository(path);
  const latestSelection = useRef({
    path,
    roomScope,
    preferences,
    onProjectChange,
    onSnapshot,
    refresh: state.refresh,
  });
  latestSelection.current = {
    path,
    roomScope,
    preferences,
    onProjectChange,
    onSnapshot,
    refresh: state.refresh,
  };
  const switchProject = useCallback((next: string | null) => {
    const current = latestSelection.current;
    if (next === current.path) {
      current.refresh();
      return;
    }
    current.onProjectChange?.();
    current.onSnapshot?.(null);
    setDemo(false);
    setPickerError(null);
    setQuery("");
    setFilter("all");
    setCopyNotice("");
    setPath(next);
    if (current.preferences && !current.roomScope) {
      current.preferences.update((p) => ({ ...p, activeProjectPath: next }));
    }
  }, []);
  useEffect(() => {
    if (!desktop || !preferences?.ready || initialRestored.current) return;
    initialRestored.current = true;
    const restored = roomScope
      ? roomProject(preferences.preferences, roomScope)
      : preferences.preferences.activeProjectPath;
    // Restoration chooses a folder without changing or persisting consent.
    setPath(restored);
  }, [desktop, preferences?.ready, preferences?.preferences, roomScope]);
  useEffect(
    () =>
      preferences?.register({ path, scope: roomScope, select: switchProject }),
    [
      preferences?.register,
      path,
      roomScope?.server,
      roomScope?.accountId,
      roomScope?.roomId,
      switchProject,
    ],
  );
  useEffect(() => {
    if (!path || !state.snapshot || !preferences) return;
    const existing = preferences.preferences.recentProjects.find(
      (p) => p.path === path,
    );
    if (existing?.name === state.snapshot.name) return;
    // Snapshot names are local user data and never enter the room payload.
    preferences.update((p) =>
      rememberProject(p, { path, name: state.snapshot!.name }, !roomScope),
    );
  }, [
    path,
    state.snapshot,
    preferences?.update,
    preferences?.preferences,
    roomScope,
  ]);

  useEffect(() => {
    onSnapshot?.(demo || state.error || state.stale ? null : state.snapshot);
  }, [
    demo,
    state.snapshot,
    state.error,
    state.stale,
    state.updatedAt,
    onSnapshot,
  ]);
  const repo = demo ? demoRepository : state.snapshot;
  const error = pickerError || state.error;
  const stale =
    !demo &&
    (state.stale || Boolean(state.error) || repo?.statusComplete === false);
  const staged = repo?.files.filter(isStaged).length ?? 0;
  const unstaged = repo?.files.filter(isUnstaged).length ?? 0;
  const untracked = repo?.files.filter(isUntracked).length ?? 0;
  const conflicts = repo?.files.filter((file) => file.conflicted).length ?? 0;
  const files =
    repo?.files.filter(
      (file) =>
        (filter === "all" ||
          (filter === "staged"
            ? isStaged(file)
            : filter === "unstaged"
              ? isUnstaged(file)
              : filter === "untracked"
                ? isUntracked(file)
                : file.conflicted)) &&
        `${file.path} ${file.originalPath ?? ""}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    ) ?? [];
  const pageSize = 100;
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(files.length / pageSize) - 1),
  );
  const visibleFiles = files.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  useEffect(() => setPage(0), [filter, query, repo?.root]);
  async function copy(value: string) {
    const selectedPath = path;
    try {
      await navigator.clipboard.writeText(value);
      if (mounted.current && latestSelection.current.path === selectedPath)
        setCopyNotice("Copied to clipboard.");
    } catch {
      if (mounted.current && latestSelection.current.path === selectedPath)
        setCopyNotice("Could not copy. Select and copy the text manually.");
    }
  }

  async function selectRepository() {
    setPickerError(null);
    setPicking(true);
    const epoch = preferences?.revision;
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("Choose a Git repository"),
      });
      if (
        !mounted.current ||
        latestSelection.current.preferences?.revision !== epoch
      )
        return;
      if (typeof selected === "string") {
        if (roomScope && selected === path) {
          // Choosing the connected folder again still asks for fresh association.
          latestSelection.current.onProjectChange?.();
          latestSelection.current.onSnapshot?.(null);
        }
        preferences?.update((p) => {
          const next = rememberProject(
            p,
            {
              path: selected,
              name: selected.split(/[\\/]/).filter(Boolean).pop() || selected,
            },
            !roomScope,
          );
          // Reassigning a previously remembered room folder repairs its binding.
          if (roomScope && path && roomProject(p, roomScope) === path) {
            next.roomProjects = [
              { ...roomScope, path: selected },
              ...next.roomProjects.filter(
                (binding) =>
                  !(
                    binding.server === roomScope.server &&
                    binding.accountId === roomScope.accountId &&
                    binding.roomId === roomScope.roomId
                  ),
              ),
            ].slice(0, 100);
          }
          return next;
        });
        switchProject(selected);
      }
    } catch (cause) {
      setPickerError(String(cause));
    } finally {
      setPicking(false);
    }
  }
  function disconnect() {
    switchProject(null);
    setDemo(false);
    setPickerError(null);
    setQuery("");
    setFilter("all");
    setCopyNotice("");
  }
  const chooseButton = (
    <button
      className="button primary"
      disabled={picking || (preferences !== null && !preferences.ready)}
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

  const repositoryNavigation = (
    <>
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
            disabled={picking || (preferences !== null && !preferences.ready)}
          >
            <Plus size={14} /> {t("Choose folder")}
          </button>
        )}
      </div>
      {desktop &&
        preferences &&
        preferences.preferences.recentProjects.length > 0 && (
          <div className="sidebar-repository sidebar-recent">
            <div className="sidebar-section-label">{t("RECENT PROJECTS")}</div>
            {preferences.preferences.recentProjects.map((project) => (
              <button
                className="sidebar-add"
                key={project.path}
                title={project.path}
                aria-current={path === project.path ? "true" : undefined}
                onClick={() => switchProject(project.path)}
              >
                {project.name}
              </button>
            ))}
          </div>
        )}
    </>
  );

  return (
    <div
      className={
        renderSidebar
          ? "app-shell signed-layout unified-local-workspace"
          : embedded
            ? "app-shell embedded-workspace"
            : "app-shell"
      }
    >
      {!preferences && (
        <SettingsContent section="projects">
          <p>{repo ? repo.name : t("No repository connected")}</p>
        </SettingsContent>
      )}
      {renderSidebar ? (
        renderSidebar(repositoryNavigation)
      ) : (
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
          {repositoryNavigation}
          <div className="sidebar-bottom">
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
              {!embedded && <SettingsButton />}
            </div>
          </div>
        </aside>
      )}

      <div className={renderSidebar ? "main-shell signed-main" : "main-shell"}>
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
                {path && desktop && (
                  <>
                    <p>
                      {t(
                        "If this folder moved or is missing, choose its new location.",
                      )}
                    </p>
                    <button
                      className="button"
                      disabled={
                        picking || (preferences !== null && !preferences.ready)
                      }
                      onClick={() => void selectRepository()}
                    >
                      {t("Reassign folder")}
                    </button>
                  </>
                )}
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
          {stale && repo && (
            <p className="error-banner" role="status">
              {t(
                "Git status is out of date. The last known state is shown; sharing is off until you refresh and confirm again.",
              )}
            </p>
          )}
          {copyNotice && <p role="status">{t(copyNotice)}</p>}

          {repo ? (
            <div className="repository-content enter" key={repo.root}>
              <section
                className={
                  repositoryActions
                    ? "repository-header with-room-sharing"
                    : "repository-header"
                }
              >
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
                  {desktop && preferences && (
                    <select
                      className="project-switcher"
                      aria-label={t("Active project")}
                      value={path ?? ""}
                      onChange={(event) => switchProject(event.target.value)}
                    >
                      {preferences.preferences.recentProjects.map((project) => (
                        <option key={project.path} value={project.path}>
                          {project.name}
                        </option>
                      ))}
                      {path &&
                        !preferences.preferences.recentProjects.some(
                          (project) => project.path === path,
                        ) && <option value={path}>{repo.name}</option>}
                    </select>
                  )}
                  {desktop && (
                    <button
                      className="button"
                      disabled={
                        picking || (preferences !== null && !preferences.ready)
                      }
                      onClick={() => void selectRepository()}
                    >
                      {t("Choose folder")}
                    </button>
                  )}
                  <span className="connection">
                    <span
                      className={
                        demo || stale
                          ? "square-dot muted-dot"
                          : "square-dot live-dot"
                      }
                    />
                    {demo
                      ? t("Demo")
                      : stale
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
                {repositoryActions}
              </section>

              <div className="metrics">
                <section className="metric">
                  <div className="metric-label">
                    <span>{t("CURRENT BRANCH")}</span>
                    <GitBranch size={16} />
                  </div>
                  <div className="branch-value" title={repo.branch}>
                    {repo.detached ? t("Detached HEAD") : repo.branch}
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

              <section
                className="git-tracking"
                aria-label={t("Local Git tracking")}
              >
                {repo.upstream ? (
                  <p>
                    <strong>{repo.upstream}</strong> ·{" "}
                    {repo.ahead == null || repo.behind == null
                      ? t("Tracking counts unavailable")
                      : t("{ahead} ahead · {behind} behind", {
                          ahead: repo.ahead,
                          behind: repo.behind,
                        })}
                  </p>
                ) : (
                  <p>
                    {t(
                      repo.upstream === undefined
                        ? "Tracking information unavailable."
                        : repo.detached
                          ? "Detached HEAD has no tracked branch."
                          : "No upstream configured.",
                    )}
                  </p>
                )}
                <p className="muted">
                  {t(
                    "Tracking uses local upstream data and may be out of date. DiGitA never fetches.",
                  )}
                </p>
                {repo.operation && (
                  <p role="status" className="operation-status">
                    {t(
                      {
                        merge: "Merge in progress",
                        rebase: "Rebase in progress",
                        "cherry-pick": "Cherry-pick in progress",
                      }[repo.operation],
                    )}
                  </p>
                )}
              </section>

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
                        ["untracked", t("Untracked"), untracked],
                        ["conflicts", t("Conflicts"), conflicts],
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
                      {visibleFiles.map((file) => (
                        <tr key={file.path}>
                          <td>
                            <div className="file-name">
                              <FileCode2 size={16} />
                              <div>
                                <span className="mono">{file.path}</span>
                                <button
                                  className="icon-button copy-path"
                                  aria-label={t("Copy relative path {path}", {
                                    path: file.path,
                                  })}
                                  onClick={() => void copy(file.path)}
                                >
                                  <Copy size={14} />
                                </button>
                                {file.originalPath && (
                                  <small>← {file.originalPath}</small>
                                )}
                                {file.originalPath && (
                                  <button
                                    className="icon-button copy-path"
                                    aria-label={t(
                                      "Copy original relative path {path}",
                                      { path: file.originalPath },
                                    )}
                                    onClick={() =>
                                      void copy(file.originalPath!)
                                    }
                                  >
                                    <Copy size={14} />
                                  </button>
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
                      {stale
                        ? t("Current Git status unavailable")
                        : repo.files.length
                          ? t("No matching files")
                          : t("Clean working tree")}
                    </strong>
                    <span>
                      {stale
                        ? t("Refresh to check the current working tree.")
                        : repo.files.length
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
                {files.length > pageSize && (
                  <div className="file-pagination">
                    <button
                      className="button"
                      disabled={currentPage === 0}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      {t("Previous files")}
                    </button>
                    <span role="status">
                      {t("Showing {start}–{end} of {count} matching files", {
                        start: currentPage * pageSize + 1,
                        end: Math.min(
                          (currentPage + 1) * pageSize,
                          files.length,
                        ),
                        count: files.length,
                      })}
                    </span>
                    <button
                      className="button"
                      disabled={(currentPage + 1) * pageSize >= files.length}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      {t("Next files")}
                    </button>
                  </div>
                )}
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
                    <button
                      className="icon-button"
                      aria-label={t("Copy full commit hash")}
                      onClick={() => void copy(repo.commit!.hash)}
                    >
                      <Copy size={16} />
                    </button>
                    {copyNotice ===
                      "Could not copy. Select and copy the text manually." && (
                      <code className="full-commit-hash">
                        {repo.commit.hash}
                      </code>
                    )}
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
                {repositoryActions}
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
