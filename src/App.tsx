import { useState } from "react";
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
} from "./repository";
import { useRepository } from "./useRepository";

type Filter = "all" | "staged" | "unstaged";
const clock = (date: Date) =>
  date.toLocaleTimeString("cs-CZ", {
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

export default function App() {
  const desktop = isTauri();
  const [path, setPath] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const state = useRepository(path);
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
        title: "Vyberte Git repozitář",
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
      Připojit repozitář <ArrowUpRight size={15} />
    </button>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#workspace"
          aria-label="DiGitA — přejít na workspace"
        >
          <Mark />
          <span>
            DiGitA<span className="brand-period">01</span>
          </span>
        </a>
        <div className="sidebar-section-label">
          PRACOVNÍ PROSTOR <span>01</span>
        </div>
        <a className="nav-active" href="#workspace" aria-label="Přehled">
          <LayoutGrid size={16} />
          <span>Přehled</span>
          <ArrowUpRight size={15} />
        </a>
        <div className="sidebar-repository">
          <div className="sidebar-section-label">REPOZITÁŘ</div>
          {repo ? (
            <div className="repo-nav">
              <FolderGit2 size={16} />
              <span title={repo.root}>{repo.name}</span>
              <span className="square-dot" />
            </div>
          ) : (
            <div className="repo-placeholder">
              <span className="dashed-square" /> Zatím nepřipojeno
            </div>
          )}
          {desktop && (
            <button
              className="sidebar-add"
              onClick={() => void selectRepository()}
              disabled={picking}
            >
              <Plus size={14} /> Vybrat složku
            </button>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={19} />
            <p>
              Váš kód. Váš prostor.
              <span>
                Všechna data zůstávají
                <br />
                na tomto zařízení.
              </span>
            </p>
          </div>
          <div className="local-profile">
            <div className="profile-icon">
              <Command size={16} />
            </div>
            <div>
              Lokální workspace<span>Osobní prostředí</span>
            </div>
            <span className="square-dot" />
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={12} />
            <strong>Přehled</strong>
          </div>
          <div className="mode-label">
            <span className="square-dot" />
            {demo ? "UKÁZKOVÝ REPOZITÁŘ" : "LOKÁLNÍ REŽIM"}
          </div>
        </header>
        <main id="workspace">
          <div className="page-heading enter">
            <div>
              <div className="eyebrow">MÉNĚ ŠUMU. VÍCE SOUSTŘEDĚNÍ.</div>
              <h1>
                Prostor pro vaši práci<span>.</span>
              </h1>
              <p>Váš repozitář. Vše podstatné na jednom místě.</p>
            </div>
            <span className="edition">
              LOCAL EDITION
              <br />
              <b>001 — WORKSPACE</b>
            </span>
          </div>

          {!desktop && (
            <div className="browser-note">
              <span>
                <Circle size={12} />{" "}
                {demo ? "Prohlížíte ukázková data." : "Webový náhled rozhraní."}{" "}
                Lokální repozitář připojíte v desktopové aplikaci.
              </span>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <X size={17} />
              <div>
                <strong>Repozitář se nepodařilo načíst.</strong>
                <p>{error}</p>
                {state.snapshot && (
                  <span>Zobrazen je poslední známý stav.</span>
                )}
              </div>
              <button
                className="icon-button"
                aria-label="Zkusit znovu"
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
                  <div className="eyebrow">AKTIVNÍ REPOZITÁŘ</div>
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
                    {demo ? "Ukázka" : error ? "Neaktuální stav" : "Připojeno"}
                  </span>
                  <button
                    className="icon-button"
                    title="Obnovit stav"
                    aria-label="Obnovit stav"
                    disabled={demo || state.busy}
                    onClick={state.refresh}
                  >
                    <RefreshCw size={16} className={state.busy ? "spin" : ""} />
                  </button>
                  <button
                    className="icon-button"
                    title="Odpojit repozitář"
                    aria-label="Odpojit repozitář"
                    onClick={disconnect}
                  >
                    <Unplug size={16} />
                  </button>
                </div>
              </section>

              <div className="metrics">
                <section className="metric">
                  <div className="metric-label">
                    <span>AKTUÁLNÍ VĚTEV</span>
                    <GitBranch size={16} />
                  </div>
                  <div className="branch-value" title={repo.branch}>
                    {repo.branch}
                  </div>
                  <div className="metric-foot">
                    {repo.detached
                      ? "Pracujete mimo pojmenovanou větev"
                      : "Váš aktuální pracovní kontext"}
                  </div>
                </section>
                <section className="metric">
                  <div className="metric-label">
                    <span>LOKÁLNÍ ZMĚNY</span>
                    <FileCode2 size={16} />
                  </div>
                  <div className="metric-number">
                    {String(repo.files.length).padStart(2, "0")}
                    <span>souborů</span>
                  </div>
                  <div className="metric-foot">
                    <span className="tiny-line" /> {unstaged} s nepřipravenými
                    změnami
                  </div>
                </section>
                <section className="metric">
                  <div className="metric-label">
                    <span>PŘIPRAVENO KE COMMITU</span>
                    <GitCommitHorizontal size={17} />
                  </div>
                  <div className="metric-number">
                    {String(staged).padStart(2, "0")}
                    <span>souborů</span>
                  </div>
                  <div className="metric-foot">
                    <span className="tiny-line filled" /> Změny v indexu
                  </div>
                </section>
              </div>

              <section className="changes-panel">
                <div className="section-heading">
                  <h3>
                    Změněné soubory{" "}
                    <span className="count">{repo.files.length}</span>
                  </h3>
                  <span className="eyebrow subtle">WORKING TREE</span>
                </div>
                <div className="table-toolbar">
                  <div className="tabs" aria-label="Filtrovat změny">
                    {(
                      [
                        ["all", "Vše", repo.files.length],
                        ["staged", "Připravené", staged],
                        ["unstaged", "Nepřipravené", unstaged],
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
                      aria-label="Hledat soubor"
                      placeholder="Hledat soubor…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    {query && (
                      <button
                        aria-label="Vymazat hledání"
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
                        <th>SOUBOR</th>
                        <th>INDEX</th>
                        <th>PRACOVNÍ KOPIE</th>
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
                                  <small>Konflikt vyžaduje vyřešení</small>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`status-badge ${[".", "?"].includes(file.indexStatus) ? "empty-status" : ""}`}
                            >
                              {file.conflicted
                                ? "Konflikt"
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
                                ? "Konflikt"
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
                        ? "Žádné odpovídající soubory"
                        : "Čistý pracovní strom"}
                    </strong>
                    <span>
                      {repo.files.length
                        ? "Zkuste jiný filtr nebo hledaný výraz."
                        : "Vše je uložené v Gitu. Prostor pro další nápad."}
                    </span>
                  </div>
                )}
                <div className="table-footer">
                  <span>
                    <span className="square-dot muted-dot" />
                    {demo ? "Ukázková data" : "Automatická obnova každé 2 s"}
                  </span>
                  <span>
                    {files.length} / {repo.files.length} souborů
                  </span>
                </div>
              </section>

              <section className="commit-panel">
                <div className="commit-label">
                  <GitCommitHorizontal size={19} />
                  <span>POSLEDNÍ COMMIT</span>
                </div>
                {repo.commit ? (
                  <>
                    <div className="commit-details">
                      <h3>{repo.commit.subject}</h3>
                      <p>
                        {repo.commit.author}
                        <span>·</span>
                        {new Date(repo.commit.authoredAt).toLocaleString(
                          "cs-CZ",
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
                    <h3>Každý projekt má svůj začátek.</h3>
                    <p>V tomto repozitáři zatím není žádný commit.</p>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <section className="empty-workspace enter">
              <div className="empty-top">
                <span className="eyebrow">01 / PŘIPOJENÍ</span>
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
                  VAŠE DALŠÍ DOBRÁ MYŠLENKA ZAČÍNÁ TADY
                </span>
                <h2>
                  {state.busy
                    ? "Načítám váš prostor…"
                    : "Velké věci začínají lokálně."}
                </h2>
                <p>
                  Připojte svůj Git repozitář a mějte přehled
                  <br />o větvi, commitech a každé změně.
                </p>
                {desktop ? (
                  chooseButton
                ) : (
                  <button
                    className="button primary"
                    onClick={() => setDemo(true)}
                  >
                    <LayoutGrid size={15} /> Prohlédnout ukázku{" "}
                    <ArrowUpRight size={15} />
                  </button>
                )}
                {path && (
                  <button className="text-button" onClick={disconnect}>
                    Zrušit připojení
                  </button>
                )}
              </div>
              <div className="empty-bottom">
                <span>
                  <ShieldCheck size={14} /> Pouze na vašem zařízení
                </span>
                <span>
                  VÁŠ WORKFLOW ZŮSTÁVÁ VÁŠ <ArrowDownRight size={15} />
                </span>
              </div>
            </section>
          )}

          <footer className="page-footer">
            <span>
              <Mark small /> BUILT FOR FOCUS.
            </span>
            <span>
              {demo
                ? "DEMO / NÁHLED"
                : state.updatedAt
                  ? `POSLEDNÍ ${state.error ? "ÚSPĚŠNÁ " : ""}OBNOVA ${clock(state.updatedAt)}`
                  : "DIGITA / V 0.1.0"}
              <Minus size={16} />
              <span>LOCAL FIRST</span>
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
