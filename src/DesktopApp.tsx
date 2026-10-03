import { t, useTranslation, dateLocale } from "./i18n";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  ArrowUpRight,
  FolderGit2,
  Hash,
  LayoutGrid,
  LogOut,
  Plus,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import App from "./App";
import { PreferencesProvider } from "./components/Preferences";
import { canonicalServer } from "./lib/preferences";
import { QuickStart, needsIntroduction } from "./components/QuickStart";
import {
  NetworkNotice,
  RequestProgress,
  RetryDelay,
} from "./components/RequestFeedback";
import {
  errorMessage,
  useRetryDelay,
  useSlowRequest,
  slowRequestMessage,
} from "./hooks/requestFeedback";
import {
  LanguageSettings,
  SettingsButton,
  SettingsContent,
  useSettingsNavigation,
} from "./components/LanguageSettings";
import { ProfileEditor, ProfileAvatar } from "./components/ProfileEditor";
import {
  SharingChoices,
  SharingConfirmation,
} from "./components/SharingConfirmation";
import { TeamAdministration } from "./components/TeamAdministration";
import { ConflictRadar } from "./components/ConflictRadar";
import {
  api,
  API_URL,
  ApiError,
  credentials,
  type Member,
  type Room,
  type Team,
  type User,
} from "./lib/api";
import { sharedPresence, useRoom, type Sharing } from "./hooks/useRoom";
import type { RepositorySnapshot } from "./lib/repository";
import "./styles/collaboration.css";

type Session = { token: string; user: User; storageNotice?: string };
type TeamView = Team & { rooms: Room[]; role: Member["role"] };
const message = errorMessage;

export default function DesktopApp() {
  const [intro, setIntro] = useState(needsIntroduction);
  return (
    <LanguageSettings onShowGuide={() => setIntro(true)}>
      <PreferencesProvider>
        <NetworkNotice />
        <DesktopContent />
        <QuickStart open={intro} onClose={() => setIntro(false)} />
      </PreferencesProvider>
    </LanguageSettings>
  );
}

function DesktopContent() {
  useTranslation();
  const navigate = useSettingsNavigation();
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const [mutating, setMutating] = useState(false);
  const mutationLock = useRef(false);
  const canNavigate = useRef(() => true);
  const [dashboardRevision, setDashboardRevision] = useState(0);
  const [local, setLocal] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [teams, setTeams] = useState<TeamView[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState("");
  const [teamsFailure, setTeamsFailure] = useState<unknown>(null);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setRestoring(true);
    setError("");
    void Promise.resolve()
      .then(async () => {
        try {
          return await credentials.read();
        } catch {
          throw new ApiError(
            0,
            "Could not read saved sign-in. Unlock your system credential store and retry, or sign in without remembering this session.",
          );
        }
      })
      .then(async (token) => {
        if (!token) return;
        try {
          const user = await api<User>("/auth/me", token);
          if (active) setSession({ token, user });
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401)
            await credentials.clear().catch(() => {});
          throw cause;
        }
      })
      .catch((cause) => {
        if (active) setError(message(cause));
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, [restoreAttempt]);
  const expireSession = useCallback(() => {
    setRoom(null);
    setSession(null);
    setUncertain(false);
    setError("Your session has expired. Sign in again.");
    void credentials.clear().catch(() => {});
  }, []);
  useEffect(() => {
    let active = true;
    if (!session) {
      setTeams([]);
      setSelectedTeam(null);
      return;
    }
    setTeamsLoading(true);
    setTeamsError("");
    setTeamsFailure(null);
    void api<Team[]>("/teams", session.token)
      .then((list) =>
        Promise.all(
          list.map(async (team) => {
            const [rooms, members] = await Promise.all([
              api<Room[]>(`/teams/${team.id}/rooms`, session.token),
              api<Member[]>(`/teams/${team.id}/members`, session.token),
            ]);
            return {
              ...team,
              rooms,
              role:
                members.find((m) => m.user_id === session.user.id)?.role ??
                ("member" as const),
            };
          }),
        ),
      )
      .then((list) => {
        if (!active) return;
        setTeams(list);
        setSelectedTeam((previous) =>
          list.some((team) => team.id === previous)
            ? previous
            : (list[0]?.id ?? null),
        );
        setRoom((previous) =>
          previous &&
          !list.some((team) =>
            team.rooms.some((entry) => entry.id === previous.id),
          )
            ? null
            : previous,
        );
      })
      .catch((cause) => {
        if (!active) return;
        setTeams([]);
        setTeamsError(message(cause));
        setTeamsFailure(cause);
        if (cause instanceof ApiError && cause.status === 401) expireSession();
      })
      .finally(() => {
        if (active) setTeamsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.token, session?.user.id, dashboardRevision, expireSession]);
  function selectTeam(id: string) {
    if (id === selectedTeam && !local && !room) return;
    navigate(() => {
      if (!canNavigate.current()) return;
      setRoom(null);
      setLocal(false);
      setSelectedTeam(id);
    });
  }
  function openLocal() {
    navigate(() => {
      if (canNavigate.current()) setLocal(true);
    });
  }
  function openRoom(value: Room) {
    navigate(() => {
      if (!canNavigate.current()) return;
      setSelectedTeam(value.team_id);
      setRoom(value);
      setLocal(false);
    });
  }
  const sidebar = (repositoryNavigation?: ReactNode) =>
    session ? (
      <TeamSidebar
        teams={teams}
        selectedTeam={selectedTeam}
        user={session.user}
        onSelect={selectTeam}
        loading={teamsLoading}
        local={local}
        room={room}
        onLocal={openLocal}
        onRoom={openRoom}
        repositoryNavigation={repositoryNavigation}
      />
    ) : null;
  async function logout() {
    if (!canNavigate.current()) return;
    const previous = session;
    setRoom(null);
    setSession(null);
    setUncertain(false);
    setError("");
    const results = await Promise.allSettled([
      credentials.clear(),
      previous
        ? api("/auth/logout", previous.token, "POST")
        : Promise.resolve(),
    ]);
    if (results.some((r) => r.status === "rejected")) {
      setError(
        "The local session has ended. The saved or server session could not be fully revoked; check your connection and credential store.",
      );
    }
  }
  const account = (
    <SettingsContent section="account">
      {session ? (
        <ProfileEditor
          key={`${session.user.id}:${session.token}`}
          user={session.user}
          token={session.token}
          onSaved={(user) => {
            setSession((previous) =>
              previous?.token === session.token
                ? { ...previous, user }
                : previous,
            );
            setDashboardRevision((revision) => revision + 1);
          }}
          onExpired={expireSession}
        />
      ) : null}
    </SettingsContent>
  );
  if (local)
    return (
      <App
        renderSidebar={session ? sidebar : undefined}
        navigation={
          <>
            {account}
            <nav className="local-nav" aria-label={t("Online mode")}>
              <button
                className="button"
                onClick={() => navigate(() => setLocal(false))}
              >
                <ArrowLeft size={16} />
                {session ? t("Back to team space") : t("Sign in online")}
              </button>
            </nav>
          </>
        }
      />
    );
  if (!session)
    return (
      <div className="desktop-with-menu">
        <nav className="desktop-menu" aria-label={t("Application menu")}>
          <SettingsButton />
        </nav>
        <Login
          restoring={restoring}
          error={t(error)}
          onDismissError={() => setError("")}
          onRestore={() => setRestoreAttempt((n) => n + 1)}
          onSession={(value) => {
            setUncertain(false);
            setError("");
            setSession(value);
          }}
          onLocal={() => setLocal(true)}
        />
      </div>
    );
  return (
    <div className="signed-layout">
      {sidebar()}
      {account}
      <div className="collaboration-shell signed-main">
        <header className="collab-topbar">
          <button
            className="wordmark"
            onClick={() =>
              navigate(() => {
                if (canNavigate.current()) setRoom(null);
              })
            }
          >
            DiGitA<span>05</span>
          </button>
          <span className="signed-user">{session.user.display_name}</span>
          <button
            className="icon-button"
            aria-label={t("Sign out")}
            onClick={() => navigate(() => void logout())}
          >
            <LogOut size={18} />
          </button>
        </header>
        {session.storageNotice && (
          <p className="form-error" role="status">
            {t(session.storageNotice)}
          </p>
        )}
        {room ? (
          <RoomWorkspace
            key={`${canonicalServer(API_URL)}:${session.user.id}:${session.token}:${room.id}`}
            room={room}
            session={session}
            onBack={() => navigate(() => setRoom(null))}
            onExpired={expireSession}
            onDenied={() => {
              setRoom(null);
              setDashboardRevision((n) => n + 1);
            }}
          />
        ) : (
          <Dashboard
            key={selectedTeam ?? "empty"}
            teams={teams}
            selectedTeam={selectedTeam}
            loading={teamsLoading}
            loadError={teamsError}
            loadFailure={teamsFailure}
            onDeleted={(id) => {
              setTeams((previous) => previous.filter((team) => team.id !== id));
              setSelectedTeam(null);
              setRoom(null);
            }}
            canNavigate={canNavigate}
            session={session}
            onRoom={(value) => navigate(() => setRoom(value))}
            onExpired={expireSession}
            revision={dashboardRevision}
            onRefresh={() => setDashboardRevision((n) => n + 1)}
            busy={mutating}
            setBusy={setMutating}
            submitting={mutationLock}
            uncertain={uncertain}
            onUncertain={() => setUncertain(true)}
            onAcknowledge={() => setUncertain(false)}
          />
        )}
      </div>
    </div>
  );
}

function TeamSidebar({
  teams,
  selectedTeam,
  user,
  onSelect,
  loading,
  local,
  room,
  onLocal,
  onRoom,
  repositoryNavigation,
}: {
  teams: TeamView[];
  selectedTeam: string | null;
  user: User;
  onSelect: (id: string) => void;
  loading: boolean;
  local: boolean;
  room: Room | null;
  onLocal: () => void;
  onRoom: (room: Room) => void;
  repositoryNavigation?: ReactNode;
}) {
  return (
    <aside className="team-sidebar">
      <div className="team-sidebar-title">DiGitA</div>
      <div className="team-sidebar-content">
        <button
          className="team-nav-button local-mode-button"
          aria-current={local ? "true" : undefined}
          onClick={onLocal}
        >
          <LayoutGrid size={18} />
          <span>{t("Local mode")}</span>
        </button>
        <nav aria-label={t("Joined teams")} className="joined-teams">
          <div className="eyebrow">{t("YOUR TEAMS")}</div>
          {teams.map((team) => (
            <button
              key={team.id}
              className="team-nav-button"
              aria-current={
                !local && selectedTeam === team.id ? "true" : undefined
              }
              onClick={() => onSelect(team.id)}
            >
              <span className="team-avatar" aria-hidden="true">
                {team.name.slice(0, 2).toLocaleUpperCase()}
              </span>
              <span>{team.name}</span>
            </button>
          ))}
          {!teams.length && (
            <p className="muted">
              {t(loading ? "Loading teams…" : "No joined teams yet.")}
            </p>
          )}
        </nav>
        {(local || room) && selectedTeam && (
          <nav aria-label={t("Team rooms")} className="team-rooms">
            <div className="eyebrow">{t("ROOMS")}</div>
            {teams
              .find((team) => team.id === selectedTeam)
              ?.rooms.map((entry) => (
                <button
                  key={entry.id}
                  className="team-nav-button room-nav-button"
                  aria-label={entry.name}
                  aria-current={
                    !local && room?.id === entry.id ? "true" : undefined
                  }
                  onClick={() => onRoom(entry)}
                >
                  <Hash size={16} />
                  <span>{entry.name}</span>
                </button>
              ))}
          </nav>
        )}
        {repositoryNavigation && (
          <div className="local-repository-navigation">
            {repositoryNavigation}
          </div>
        )}
      </div>
      <div className="signed-profile">
        <ProfileAvatar profile={user} small />
        <div>
          <strong>{user.display_name}</strong>
          {user.custom_status && <span>{user.custom_status}</span>}
        </div>
        <SettingsButton />
      </div>
    </aside>
  );
}

function Login({
  restoring,
  error: initialError,
  onSession,
  onLocal,
  onRestore,
  onDismissError,
}: {
  restoring: boolean;
  error: string;
  onSession: (s: Session) => void;
  onLocal: () => void;
  onRestore: () => void;
  onDismissError: () => void;
}) {
  useTranslation();
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const [failure, setFailure] = useState<unknown>(null);
  const cooldown = useRetryDelay(failure);
  const [remember, setRemember] = useState(false);
  const dismissError = useRef(() => {});
  dismissError.current = () => {
    setError("");
    onDismissError();
  };
  useEffect(() => {
    if (!error && !initialError) return;
    const timer = setTimeout(() => dismissError.current(), 5000);
    return () => clearTimeout(timer);
  }, [error, initialError]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || restoring || cooldown > 0) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    onDismissError();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));
    let token: string | undefined;
    let creatingAccount = register;
    try {
      if (register) {
        await api("/auth/register", undefined, "POST", {
          email,
          password,
          display_name: String(data.get("name")),
        });
        creatingAccount = false;
        setRegister(false);
      }
      const result = await api<{ access_token: string }>(
        "/auth/login",
        undefined,
        "POST",
        { email, password },
      );
      token = result.access_token;
      const user = await api<User>("/auth/me", token);
      let storageNotice: string | undefined;
      if (remember) {
        try {
          await credentials.save(token);
        } catch {
          await credentials.clear().catch(() => {});
          storageNotice = t(
            "Could not remember your session. You are signed in for this app session; sign in again after closing the app.",
          );
        }
      } else if (isTauri()) await credentials.clear().catch(() => {});
      onSession({ token, user, storageNotice });
    } catch (cause) {
      if (token) void api("/auth/logout", token, "POST").catch(() => {});
      setFailure(cause);
      if (
        creatingAccount &&
        cause instanceof ApiError &&
        cause.outcomeUnknown
      ) {
        setRegister(false);
        setError(
          "Could not confirm registration. Check your connection and try signing in before registering again.",
        );
      } else setError(message(cause));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <section className="login-story">
        <span className="wordmark">
          DiGitA<span>05</span>
        </span>
        <div className="eyebrow">{t("YOUR TEAM. A SHARED SPACE.")}</div>
        <h1>
          {t("Less noise.")}
          <br />
          {t("More teamwork.")}
        </h1>
        <p>
          {t(
            "Join a room. See what your team is working on before it reaches GitHub.",
          )}
        </p>
        <div className="login-grid" aria-hidden="true">
          <FolderGit2 size={64} strokeWidth={1} />
        </div>
      </section>
      <section className="login-panel">
        <div className="eyebrow">{t("WELCOME TO DIGITA")}</div>
        <h2>{register ? t("Create account") : t("Sign in")}</h2>
        {(error || initialError) && (
          <div role="alert">
            <button
              type="button"
              className="form-error dismissible-error"
              title={t("Dismiss error")}
              onClick={() => dismissError.current()}
            >
              {t(error || initialError)}
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}
        <RequestProgress
          pending={restoring || busy}
          label={restoring ? "Restoring your session…" : "Connecting…"}
        />
        <RetryDelay seconds={cooldown} />
        {initialError && (
          <button
            className="text-button"
            disabled={restoring || busy || cooldown > 0}
            onClick={onRestore}
          >
            {t("Retry saved sign-in")}
          </button>
        )}
        <form onSubmit={(e) => void submit(e)}>
          <fieldset className="request-fields" disabled={busy}>
            {register && (
              <label>
                {t("Display name")}
                <input
                  name="name"
                  autoComplete="nickname"
                  required
                  maxLength={80}
                />
              </label>
            )}
            <label>
              {t("Email")}
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
              />
            </label>
            <label>
              {t("Password")}
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            {register && (
              <p className="muted">{t("At least 12 characters.")}</p>
            )}
            {isTauri() && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />{" "}
                {t("Remember sign-in in the system credential store")}
              </label>
            )}
            <button
              className="button primary"
              disabled={busy || restoring || cooldown > 0}
            >
              {busy
                ? t("Connecting…")
                : register
                  ? t("Create account")
                  : t("Sign in")}
              <ArrowUpRight size={16} />
            </button>
          </fieldset>
        </form>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register
            ? t("I already have an account")
            : t("No account? Register")}
        </button>
        <div className="login-local">
          <p>{t("Want to work offline?")}</p>
          <button className="button" onClick={onLocal}>
            {t("Local mode")}
          </button>
        </div>
      </section>
    </div>
  );
}

function Dashboard({
  teams,
  selectedTeam,
  loading,
  loadError,
  loadFailure,
  onDeleted,
  canNavigate,
  session,
  revision,
  onRefresh,
  busy,
  setBusy,
  submitting,
  onRoom,
  onExpired,
  uncertain,
  onUncertain,
  onAcknowledge,
}: {
  teams: TeamView[];
  selectedTeam: string | null;
  loading: boolean;
  loadError: string;
  loadFailure: unknown;
  onDeleted: (id: string) => void;
  canNavigate: { current: () => boolean };
  session: Session;
  revision: number;
  onRefresh: () => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  submitting: { current: boolean };
  onRoom: (r: Room) => void;
  onExpired: () => void;
  uncertain: boolean;
  onUncertain: () => void;
  onAcknowledge: () => void;
}) {
  useTranslation();
  const [failure, setFailure] = useState<unknown>(null);
  const cooldown = useRetryDelay(failure ?? loadFailure);
  const [checked, setChecked] = useState(false);
  function failed(cause: unknown) {
    setFailure(cause);
    setError(message(cause));
    if (cause instanceof ApiError && cause.status === 401) onExpired();
    if (cause instanceof ApiError && cause.outcomeUnknown) {
      setChecked(false);
      onUncertain();
    }
  }
  const [error, setError] = useState("");
  const [action, setAction] = useState<"team" | "room" | "join" | null>(null);
  const [adminTeam, setAdminTeam] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    canNavigate.current = () =>
      !dirty || window.confirm(t("Discard the unsaved form?"));
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      canNavigate.current = () => true;
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty, canNavigate]);
  function changeAction(next: typeof action) {
    if (dirty && !window.confirm(t("Discard the unsaved form?"))) return;
    setDirty(false);
    setAction(next);
  }
  useEffect(() => {
    setChecked(!loading && !loadError);
  }, [loading, loadError, revision]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || loading || uncertain || cooldown > 0) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      if (action === "team")
        await api("/teams", session.token, "POST", {
          name: String(data.get("name")),
        });
      if (action === "room")
        await api(`/teams/${data.get("team")}/rooms`, session.token, "POST", {
          name: String(data.get("name")),
        });
      if (action === "join")
        await api("/invitations/accept", session.token, "POST", {
          code: String(data.get("code")).trim(),
        });
      setDirty(false);
      setAction(null);
      onRefresh();
    } catch (cause) {
      failed(cause);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const selectedTeams = teams.filter((team) => team.id === selectedTeam);
  const managers = selectedTeams.filter((team) => team.role !== "member");
  return (
    <main className="dashboard">
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">{t("YOUR TEAM SPACES")}</div>
          <h1>{t("Everything has its place.")}</h1>
          <p>
            {t(
              "Your teams, projects, and rooms. Pick up where the next good idea begins.",
            )}
          </p>
        </div>
        <button
          className="button"
          aria-label={t("Refresh rooms")}
          disabled={loading || busy || cooldown > 0}
          onClick={() => onRefresh()}
        >
          <RefreshCw size={18} className={loading ? "spin" : undefined} />
          {loading ? t("Refreshing…") : t("Refresh rooms")}
        </button>
      </div>
      <div className="dashboard-actions">
        <button
          className="button primary"
          disabled={loading || busy || cooldown > 0}
          onClick={() => changeAction(managers.length ? "room" : "team")}
        >
          <Plus size={16} />
          {t("Create room")}
        </button>
        <button
          className="button"
          disabled={loading || busy || cooldown > 0}
          onClick={() => changeAction("join")}
        >
          {t("Join with invitation")}
        </button>
        <button
          className="text-button"
          disabled={loading || busy || cooldown > 0}
          onClick={() => changeAction("team")}
        >
          {t("Create team")}
        </button>
      </div>
      <RequestProgress pending={busy} label="Saving…" />
      <RetryDelay seconds={cooldown} />
      {uncertain && !adminTeam && (
        <section className="action-panel" role="alert">
          <h2>{t("Check before trying again")}</h2>
          <p>
            {t(
              "The request may have succeeded. Refresh your rooms and check the result before sending another request. A lost invitation code cannot be recovered; creating another invitation may use additional quota.",
            )}
          </p>
          <button
            className="button"
            disabled={!checked || loading || cooldown > 0}
            onClick={onAcknowledge}
          >
            {t("I checked — allow a new request")}
          </button>
        </section>
      )}
      {(error || loadError) && (
        <p className="form-error" role="alert">
          {t(error || loadError)}
        </p>
      )}
      {action && (
        <section className="action-panel">
          <h2>
            {action === "team"
              ? t("New team")
              : action === "room"
                ? t("New room")
                : t("Join a team")}
          </h2>
          {action === "team" && !managers.length && (
            <p>{t("First create a team for this room.")}</p>
          )}
          <form
            key={action}
            onChange={() => setDirty(true)}
            onSubmit={(e) => void submit(e)}
          >
            <fieldset className="request-fields" disabled={busy}>
              {action === "room" && (
                <label>
                  {t("Team")}
                  <select name="team">
                    {managers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {action === "join" ? (
                <label>
                  {t("Invitation code")}
                  <input
                    name="code"
                    required
                    minLength={43}
                    maxLength={43}
                    autoComplete="off"
                  />
                </label>
              ) : (
                <label>
                  {t("Name")}
                  <input name="name" required maxLength={80} />
                </label>
              )}
              <div className="dashboard-actions">
                <button
                  className="button primary"
                  disabled={busy || uncertain || cooldown > 0}
                >
                  {action === "join" ? t("Accept invitation") : t("Create")}
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={busy || uncertain || cooldown > 0}
                  onClick={() => changeAction(null)}
                >
                  {t("Cancel")}
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
      <RequestProgress pending={loading} label="Loading rooms…" />
      {!loading && !teams.length && !error ? (
        <section className="dashboard-empty">
          <Users size={40} strokeWidth={1} />
          <h2>{t("Your first shared space.")}</h2>
          <p>
            {t("Create a team and room, or accept a teammate's invitation.")}
          </p>
        </section>
      ) : (
        selectedTeams.map((team) => (
          <section className="team-section" key={team.id}>
            <div className="team-heading">
              <h2>
                <Users size={18} />
                {team.name}
              </h2>
              <span className="eyebrow">
                {team.role === "owner"
                  ? t("OWNER")
                  : team.role === "admin"
                    ? t("ADMIN")
                    : t("MEMBER")}
              </span>
              <button
                className="text-button"
                aria-expanded={adminTeam === team.id}
                aria-controls={`team-admin-${team.id}`}
                disabled={busy}
                onClick={() =>
                  setAdminTeam(adminTeam === team.id ? null : team.id)
                }
              >
                {t("Team menu")}
              </button>
            </div>
            {adminTeam === team.id && (
              <TeamAdministration
                team={team}
                token={session.token}
                accountId={session.user.id}
                revision={revision}
                busy={busy}
                setBusy={setBusy}
                submitting={submitting}
                uncertain={uncertain}
                onUncertain={() => {
                  setChecked(false);
                  onUncertain();
                }}
                onAcknowledge={onAcknowledge}
                onRefresh={onRefresh}
                onExpired={onExpired}
                onDeleted={onDeleted}
              />
            )}
            {team.rooms.length ? (
              <div className="room-grid">
                {team.rooms.map((room) => (
                  <button
                    className="room-card"
                    key={room.id}
                    disabled={busy}
                    onClick={() => {
                      if (
                        !dirty ||
                        window.confirm(t("Discard the unsaved form?"))
                      )
                        onRoom(room);
                    }}
                  >
                    <FolderGit2 size={24} strokeWidth={1} />
                    <h3>{room.name}</h3>
                    <span>
                      {t("Enter room")} <ArrowUpRight size={16} />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">
                {t("This team has no rooms yet.")}
                {team.role === "member"
                  ? t(" Ask an admin to create one.")
                  : t(" Use Create room.")}
              </p>
            )}
          </section>
        ))
      )}
    </main>
  );
}

const eventLabels: Record<string, string> = {
  "presence.joined": "joined the room",
  "presence.left": "left the room",
  "git.connected": "started sharing Git status",
  "git.disconnected": "stopped sharing Git status",
  "git.working_tree_changed": "updated Git status",
  "git.branch_changed": "changed branches",
  "git.commit_created": "has a different latest commit",
  "conflict.detected": "detected a new overlap in shared changes",
  "conflict.resolved":
    "no longer sees an overlap (status, sharing, or presence changed)",
};
function RoomWorkspace({
  room,
  session,
  onBack,
  onExpired,
  onDenied,
}: {
  room: Room;
  session: Session;
  onBack: () => void;
  onExpired: () => void;
  onDenied: () => void;
}) {
  useTranslation();
  const [snapshot, setSnapshot] = useState<RepositorySnapshot | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [sharingPrompt, setSharingPrompt] = useState(false);
  const promptedRoot = useRef<string | null>(null);
  const [sharing, setSharing] = useState<Sharing>({
    branch: false,
    files: false,
    commit_message: false,
  });
  const [members, setMembers] = useState<Member[]>([]);
  const [memberError, setMemberError] = useState("");
  const [memberAttempt, setMemberAttempt] = useState(0);
  const root = useRef<string | null>(null);
  const onSnapshot = useCallback((value: RepositorySnapshot | null) => {
    const next = value?.statusComplete === false ? null : value;
    if (root.current !== (next?.root ?? null)) setEnabled(false);
    root.current = next?.root ?? null;
    setSnapshot(next);
    if (!next) setSharingPrompt(false);
    else if (promptedRoot.current !== next.root) {
      promptedRoot.current = next.root;
      setSharingPrompt(true);
    }
  }, []);
  const presence = sharedPresence(room.id, snapshot, enabled, sharing);
  const live = useRoom(room.id, session.token, presence);
  const profileRevision = JSON.stringify(
    live.state?.members.map(
      ({
        user_id,
        display_name,
        avatar,
        avatar_color,
        custom_status,
        role,
      }) => ({
        user_id,
        display_name,
        avatar,
        avatar_color,
        custom_status,
        role,
      }),
    ) ?? [],
  );
  const slowConnection = useSlowRequest(live.status === "connecting");
  useEffect(() => {
    if (live.status === "expired") onExpired();
    if (live.status === "denied") {
      setEnabled(false);
      onDenied();
    }
    if (live.status === "invalid") setEnabled(false);
  }, [live.status, onExpired, onDenied]);
  useEffect(() => {
    let active = true;
    if (live.status === "denied") {
      setMembers([]);
      setMemberError(
        "Room access was denied. Return to All rooms to refresh your access.",
      );
      return;
    }
    void api<Member[]>(`/teams/${room.team_id}/members`, session.token)
      .then((data) => {
        if (active) {
          setMembers(data);
          setMemberError("");
        }
      })
      .catch((cause) => {
        if (active) {
          if (
            cause instanceof ApiError &&
            [401, 403, 404].includes(cause.status)
          )
            setMembers([]);
          setMemberError(message(cause));
          if (cause instanceof ApiError && cause.status === 401) onExpired();
        }
      });
    return () => {
      active = false;
    };
  }, [
    room.team_id,
    session.token,
    session.user,
    live.status,
    profileRevision,
    memberAttempt,
    onExpired,
  ]);
  const online = new Map(live.state?.members.map((m) => [m.user_id, m]) ?? []);
  const visibleMembers = [
    ...members,
    ...(live.state?.members ?? []).filter(
      (m) => !members.some((existing) => existing.user_id === m.user_id),
    ),
  ];
  const statusLabel: Record<string, string> = {
    connecting: t(slowConnection ? slowRequestMessage : "Connecting…"),
    expired: t("Your session has expired. Sign in again."),
    online: t("Connected live"),
    offline: t("Connection lost — reconnecting…"),
    denied: t(
      "Room access was denied. Return to All rooms to refresh your access.",
    ),
    replaced: t("This room is open in another window."),
    invalid: t("Shared status was rejected. Turn off sharing and reconnect."),
  };
  return (
    <div className="room-workspace">
      {sharingPrompt && snapshot && (
        <SharingConfirmation
          repository={snapshot.name}
          room={room.name}
          choices={sharing}
          onCancel={() => {
            setSharingPrompt(false);
            setEnabled(false);
          }}
          onConfirm={(choices) => {
            if (!snapshot || snapshot.statusComplete === false) return;
            setSharing(choices);
            setEnabled(true);
            setSharingPrompt(false);
          }}
        />
      )}
      <div className="room-heading">
        <button className="button" onClick={onBack}>
          <ArrowLeft size={16} />
          {t("All rooms")}
        </button>
        <h1>{room.name}</h1>
        <span role="status" className="connection">
          {statusLabel[live.status]}
        </span>
        {(["offline", "replaced", "invalid"].includes(live.status) ||
          slowConnection) && (
          <button className="text-button" onClick={live.reconnect}>
            {t("Reconnect")}
          </button>
        )}
        <ConflictRadar
          state={live.state}
          userId={session.user.id}
          presence={presence}
        />
      </div>
      <SettingsContent section="activity">
        <p role="status">
          {enabled ? t("Git sharing is on.") : t("Git sharing is off.")}
        </p>
        {enabled && (
          <button className="button" onClick={() => setEnabled(false)}>
            {t("Stop sharing")}
          </button>
        )}
      </SettingsContent>
      <SettingsContent section="privacy">
        <SharingChoices value={sharing} onChange={setSharing} />
        <p>{t("Metadata changes apply immediately to this room.")}</p>
      </SettingsContent>
      <div className="room-columns">
        <section className="team-presence">
          <h2>
            {t("People in this room")}{" "}
            <span className="count">{online.size}</span>
          </h2>
          {memberError && (
            <p role="alert">
              {t(memberError)}{" "}
              <button
                className="text-button"
                onClick={() => setMemberAttempt((n) => n + 1)}
              >
                {t("Retry loading members")}
              </button>
            </p>
          )}
          {visibleMembers.map((member) => {
            const peer = online.get(member.user_id);
            const git = peer?.presence;
            const profile =
              member.user_id === session.user.id
                ? session.user
                : (peer ?? member);
            return (
              <article className="member-card" key={member.user_id}>
                <div className="member-title">
                  <ProfileAvatar profile={profile} small />
                  <strong>
                    {profile.display_name}
                    {member.user_id === session.user.id ? t(" (you)") : ""}
                  </strong>
                  <span>{peer ? t("Online") : t("Outside the room")}</span>
                </div>
                {profile.custom_status && (
                  <p className="member-custom-status">
                    {t("Custom status")}: {profile.custom_status}
                  </p>
                )}
                {git ? (
                  <>
                    <p>
                      {git.branch ?? t("Branch hidden")} · {git.changed_count}{" "}
                      {t("changed files")}
                    </p>
                    {git.commit_hash && (
                      <p className="mono">
                        {git.commit_hash.slice(0, 8)} {git.commit_message ?? ""}
                      </p>
                    )}
                    {git.files ? (
                      <ul className="shared-files">
                        {git.files.map((path) => (
                          <li key={path}>{path}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">{t("File names are not shared.")}</p>
                    )}
                  </>
                ) : (
                  <p className="muted">
                    {peer ? t("Git status is not shared.") : ""}
                  </p>
                )}
              </article>
            );
          })}
        </section>
        <section className="room-timeline">
          <h2>{t("Activity")}</h2>
          <p className="muted">
            {t("The last 100 events in the current room session.")}
          </p>
          <ol>
            {[...(live.state?.events ?? [])].reverse().map((event) => (
              <li key={event.id}>
                <time>
                  {new Date(event.created_at).toLocaleTimeString(dateLocale())}
                </time>
                <span>
                  <strong>{event.display_name}</strong>{" "}
                  {t(eventLabels[event.type] ?? "updated their status")}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <App
        embedded
        repositoryActions={
          <div className="repo-sharing">
            <p role="status" className="muted">
              {enabled
                ? t("Git sharing is on.")
                : t(
                    "Git sharing is off. Others can only see your online presence.",
                  )}
            </p>
            <button
              className="button"
              disabled={!snapshot}
              onClick={() => setSharingPrompt(true)}
            >
              {t("Choose sharing")}
            </button>
            {enabled && (
              <button className="button" onClick={() => setEnabled(false)}>
                {t("Stop sharing")}
              </button>
            )}
            {enabled && sharing.files && !presence?.sharing.files && (
              <p className="muted">
                {t("The file list is too large. Only the count is shared.")}
              </p>
            )}
          </div>
        }
        onSnapshot={onSnapshot}
        onProjectChange={() => {
          setEnabled(false);
          setSnapshot(null);
          root.current = null;
          promptedRoot.current = null;
          setSharingPrompt(false);
        }}
        roomScope={{
          server: canonicalServer(API_URL),
          accountId: session.user.id,
          roomId: room.id,
        }}
      />
    </div>
  );
}
