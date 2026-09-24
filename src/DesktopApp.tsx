import { t, useTranslation, dateLocale } from "./i18n";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  ArrowUpRight,
  FolderGit2,
  LogOut,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import App from "./App";
import { LanguageSettings } from "./LanguageSettings";
import { AmbientPlayer } from "./AmbientPlayer";
import { ConflictRadar } from "./ConflictRadar";
import {
  api,
  ApiError,
  credentials,
  type Member,
  type Room,
  type Team,
  type User,
} from "./api";
import { sharedPresence, useRoom, type Sharing } from "./useRoom";
import type { RepositorySnapshot } from "./repository";
import "./collaboration.css";

type Session = { token: string; user: User; storageNotice?: string };
type TeamView = Team & { rooms: Room[]; role: Member["role"] };
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export default function DesktopApp() {
  return (
    <>
      <DesktopContent />
      <LanguageSettings />
    </>
  );
}

function DesktopContent() {
  useTranslation();
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [local, setLocal] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void credentials
      .read()
      .then(async (token) => {
        if (!token) return;
        try {
          const user = await api<User>("/auth/me", token);
          if (active) setSession({ token, user });
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401)
            await credentials.clear();
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
  }, []);
  async function logout() {
    const previous = session;
    setRoom(null);
    setSession(null);
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
  if (local)
    return (
      <App
        navigation={
          <nav className="local-nav" aria-label={t("Online mode")}>
            <button className="button" onClick={() => setLocal(false)}>
              <ArrowLeft size={16} />
              {session ? t("Back to team space") : t("Sign in online")}
            </button>
          </nav>
        }
      />
    );
  if (!session)
    return (
      <Login
        restoring={restoring}
        error={t(error)}
        onSession={setSession}
        onLocal={() => setLocal(true)}
      />
    );
  return (
    <div className="collaboration-shell">
      <header className="collab-topbar">
        <button className="wordmark" onClick={() => setRoom(null)}>
          DiGitA<span>05</span>
        </button>
        <span className="signed-user">{session.user.display_name}</span>
        <button className="button" onClick={() => setLocal(true)}>
          {t("Local mode")}
        </button>
        <button
          className="icon-button"
          aria-label={t("Sign out")}
          onClick={() => void logout()}
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
          key={room.id}
          room={room}
          session={session}
          onBack={() => setRoom(null)}
        />
      ) : (
        <Dashboard
          session={session}
          onRoom={setRoom}
          onExpired={() => void logout()}
        />
      )}
    </div>
  );
}

function Login({
  restoring,
  error: initialError,
  onSession,
  onLocal,
}: {
  restoring: boolean;
  error: string;
  onSession: (s: Session) => void;
  onLocal: () => void;
}) {
  useTranslation();
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remember, setRemember] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));
    let token: string | undefined;
    try {
      if (register) {
        await api("/auth/register", undefined, "POST", {
          email,
          password,
          display_name: String(data.get("name")),
        });
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
      setError(message(cause));
    } finally {
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
          <p className="form-error" role="alert">
            {t(error || initialError)}
          </p>
        )}
        {restoring && <p role="status">{t("Restoring your session…")}</p>}
        <form onSubmit={(e) => void submit(e)}>
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
          {register && <p className="muted">{t("At least 12 characters.")}</p>}
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
          <button className="button primary" disabled={busy || restoring}>
            {busy
              ? t("Connecting…")
              : register
                ? t("Create account")
                : t("Sign in")}
            <ArrowUpRight size={16} />
          </button>
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
          <button className="button" disabled={busy} onClick={onLocal}>
            {t("Local mode")}
          </button>
        </div>
      </section>
    </div>
  );
}

function Dashboard({
  session,
  onRoom,
  onExpired,
}: {
  session: Session;
  onRoom: (r: Room) => void;
  onExpired: () => void;
}) {
  useTranslation();
  const [teams, setTeams] = useState<TeamView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [action, setAction] = useState<"team" | "room" | "join" | null>(null);
  const [revision, setRevision] = useState(0);
  const [invitation, setInvitation] = useState<{
    code: string;
    expires_at: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
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
                "member",
            };
          }),
        ),
      )
      .then((list) => {
        if (active) setTeams(list as TeamView[]);
      })
      .catch((cause) => {
        if (active) {
          setError(message(cause));
          if (cause instanceof ApiError && cause.status === 401) onExpired();
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session, revision]); // onExpired is intentionally not a reload trigger.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      setAction(null);
      setRevision((n) => n + 1);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function invite(teamId: string) {
    setBusy(true);
    setError("");
    try {
      setInvitation(
        await api(`/teams/${teamId}/invitations`, session.token, "POST"),
      );
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  const managers = teams.filter((t) => t.role !== "member");
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
          disabled={loading || busy}
          onClick={() => setRevision((n) => n + 1)}
        >
          <RefreshCw size={18} className={loading ? "spin" : undefined} />
          {loading ? t("Refreshing…") : t("Refresh rooms")}
        </button>
      </div>
      <div className="dashboard-actions">
        <button
          className="button primary"
          disabled={loading || busy}
          onClick={() => setAction(managers.length ? "room" : "team")}
        >
          <Plus size={16} />
          {t("Create room")}
        </button>
        <button
          className="button"
          disabled={loading || busy}
          onClick={() => setAction("join")}
        >
          {t("Join with invitation")}
        </button>
        <button
          className="text-button"
          disabled={loading || busy}
          onClick={() => setAction("team")}
        >
          {t("Create team")}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
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
          <form onSubmit={(e) => void submit(e)}>
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
              <button className="button primary" disabled={busy}>
                {action === "join" ? t("Accept invitation") : t("Create")}
              </button>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                {t("Cancel")}
              </button>
            </div>
          </form>
        </section>
      )}
      {invitation && (
        <section className="action-panel">
          <h2>{t("Your invitation is ready")}</h2>
          <p>
            {t("Share this single-use code with a teammate. Expires")}{" "}
            {new Date(invitation.expires_at).toLocaleString(dateLocale())}.
          </p>
          <input
            aria-label={t("Created invitation code")}
            readOnly
            value={invitation.code}
            onFocus={(e) => e.target.select()}
          />
          <button className="text-button" onClick={() => setInvitation(null)}>
            {t("Close invitation")}
          </button>
        </section>
      )}
      {loading ? (
        <p role="status">{t("Loading rooms…")}</p>
      ) : !teams.length && !error ? (
        <section className="dashboard-empty">
          <Users size={40} strokeWidth={1} />
          <h2>{t("Your first shared space.")}</h2>
          <p>
            {t("Create a team and room, or accept a teammate's invitation.")}
          </p>
        </section>
      ) : (
        teams.map((team) => (
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
              {team.role !== "member" && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void invite(team.id)}
                >
                  {t("Invite member")}
                </button>
              )}
            </div>
            {team.rooms.length ? (
              <div className="room-grid">
                {team.rooms.map((room) => (
                  <button
                    className="room-card"
                    key={room.id}
                    onClick={() => onRoom(room)}
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
  "ambient.started": "started ambient playback",
  "ambient.paused": "paused ambient playback",
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
}: {
  room: Room;
  session: Session;
  onBack: () => void;
}) {
  useTranslation();
  const [snapshot, setSnapshot] = useState<RepositorySnapshot | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [sharing, setSharing] = useState<Sharing>({
    branch: false,
    files: false,
    commit_message: false,
  });
  const [members, setMembers] = useState<Member[]>([]);
  const [memberError, setMemberError] = useState("");
  const root = useRef<string | null>(null);
  const onSnapshot = useCallback((value: RepositorySnapshot | null) => {
    if (root.current !== (value?.root ?? null)) setEnabled(false);
    root.current = value?.root ?? null;
    setSnapshot(value);
  }, []);
  const presence = sharedPresence(room.id, snapshot, enabled, sharing);
  const live = useRoom(room.id, session.token, presence);
  useEffect(() => {
    let active = true;
    void api<Member[]>(`/teams/${room.team_id}/members`, session.token)
      .then((data) => {
        if (active) {
          setMembers(data);
          setMemberError("");
        }
      })
      .catch((cause) => {
        if (active) setMemberError(message(cause));
      });
    return () => {
      active = false;
    };
  }, [room.team_id, session.token, live.status]);
  const online = new Map(live.state?.members.map((m) => [m.user_id, m]) ?? []);
  const visibleMembers = [
    ...members,
    ...(live.state?.members ?? []).filter(
      (m) => !members.some((existing) => existing.user_id === m.user_id),
    ),
  ];
  const statusLabel: Record<string, string> = {
    connecting: t("Connecting…"),
    online: t("Connected live"),
    offline: t("Connection lost — reconnecting…"),
    denied: t(
      "Access expired or was revoked. Return to the dashboard and sign in again.",
    ),
    replaced: t("This room is open in another window."),
    invalid: t("Shared status was rejected. Turn off sharing and reconnect."),
  };
  return (
    <div className="room-workspace">
      <div className="room-heading">
        <button className="button" onClick={onBack}>
          <ArrowLeft size={16} />
          {t("All rooms")}
        </button>
        <h1>{room.name}</h1>
        <span role="status" className="connection">
          {statusLabel[live.status]}
        </span>
        {["offline", "replaced", "invalid"].includes(live.status) && (
          <button className="text-button" onClick={live.reconnect}>
            {t("Reconnect")}
          </button>
        )}
      </div>
      <section className="privacy-controls">
        <div>
          <h2>{t("Sharing in this room")}</h2>
          <p>
            {t(
              "Connect your local copy of the shared project. Code and diffs are never sent.",
            )}
          </p>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!snapshot}
            onChange={(e) => setEnabled(e.target.checked)}
          />{" "}
          {t("This repository belongs to this room — share Git status")}
        </label>
        <div className="privacy-options">
          {(
            [
              ["branch", t("Branch name")],
              ["files", t("File names")],
              ["commit_message", t("Commit message")],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="check-label">
              <input
                type="checkbox"
                checked={sharing[key]}
                onChange={(e) =>
                  setSharing((s) => ({ ...s, [key]: e.target.checked }))
                }
              />
              {label}
            </label>
          ))}
        </div>
        <p className="muted">
          {enabled
            ? t(
                "Sharing the change count and commit hash, plus the fields selected above.",
              )
            : t(
                "Git sharing is off. Others can only see your online presence.",
              )}
        </p>
        {enabled && sharing.files && !presence?.sharing.files && (
          <p className="muted">
            {t("The file list is too large. Only the count is shared.")}
          </p>
        )}
      </section>
      <AmbientPlayer state={live.ambient} onPlaying={live.setPlaying} />
      <ConflictRadar
        state={live.state}
        userId={session.user.id}
        presence={presence}
      />
      <div className="room-columns">
        <section className="team-presence">
          <h2>
            {t("People in this room")}{" "}
            <span className="count">{online.size}</span>
          </h2>
          {memberError && <p role="alert">{t(memberError)}</p>}
          {visibleMembers.map((member) => {
            const peer = online.get(member.user_id);
            const git = peer?.presence;
            return (
              <article className="member-card" key={member.user_id}>
                <div className="member-title">
                  <strong>
                    {member.display_name}
                    {member.user_id === session.user.id ? t(" (you)") : ""}
                  </strong>
                  <span>{peer ? t("Online") : t("Outside the room")}</span>
                </div>
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
      <App embedded onSnapshot={onSnapshot} />
    </div>
  );
}
