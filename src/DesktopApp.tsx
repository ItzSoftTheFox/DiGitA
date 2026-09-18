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
        "Místní relace byla ukončena. Uložené nebo serverové přihlášení se nepodařilo plně zrušit; zkontrolujte připojení a systémové úložiště.",
      );
    }
  }
  if (local)
    return (
      <App
        navigation={
          <nav className="local-nav" aria-label="Online režim">
            <button className="button" onClick={() => setLocal(false)}>
              <ArrowLeft size={16} />
              {session ? "Zpět do týmového prostoru" : "Přihlásit se online"}
            </button>
          </nav>
        }
      />
    );
  if (!session)
    return (
      <Login
        restoring={restoring}
        error={error}
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
          Lokální režim
        </button>
        <button
          className="icon-button"
          aria-label="Odhlásit se"
          onClick={() => void logout()}
        >
          <LogOut size={18} />
        </button>
      </header>
      {session.storageNotice && (
        <p className="form-error" role="status">
          {session.storageNotice}
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
          storageNotice =
            "Přihlášení se nepodařilo zapamatovat. Jste přihlášeni pro toto spuštění; po zavření aplikace se přihlaste znovu.";
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
        <div className="eyebrow">VÁŠ TÝM. SPOLEČNÝ PROSTOR.</div>
        <h1>
          Méně šumu.
          <br />
          Více spolupráce.
        </h1>
        <p>
          Vstupte do místnosti. Mějte přehled o práci svého týmu, ještě než se
          objeví na GitHubu.
        </p>
        <div className="login-grid" aria-hidden="true">
          <FolderGit2 size={64} strokeWidth={1} />
        </div>
      </section>
      <section className="login-panel">
        <div className="eyebrow">VÍTEJTE V DIGITA</div>
        <h2>{register ? "Vytvořit účet" : "Přihlásit se"}</h2>
        {(error || initialError) && (
          <p className="form-error" role="alert">
            {error || initialError}
          </p>
        )}
        {restoring && <p role="status">Obnovuji přihlášení…</p>}
        <form onSubmit={(e) => void submit(e)}>
          {register && (
            <label>
              Jméno
              <input
                name="name"
                autoComplete="nickname"
                required
                maxLength={80}
              />
            </label>
          )}
          <label>
            E-mail
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
            />
          </label>
          <label>
            Heslo
            <input
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          {register && <p className="muted">Alespoň 12 znaků.</p>}
          {isTauri() && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />{" "}
              Zapamatovat přihlášení v systémovém úložišti
            </label>
          )}
          <button className="button primary" disabled={busy || restoring}>
            {busy ? "Připojuji…" : register ? "Vytvořit účet" : "Přihlásit se"}
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
          {register ? "Už mám účet" : "Nemám účet — registrovat"}
        </button>
        <div className="login-local">
          <p>Chcete pracovat bez připojení?</p>
          <button className="button" disabled={busy} onClick={onLocal}>
            Lokální režim
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
          <div className="eyebrow">VAŠE TÝMOVÉ PROSTORY</div>
          <h1>Všechno má své místo.</h1>
          <p>
            Vaše týmy, projekty a místnosti. Pokračujte tam, kde vzniká další
            dobrý nápad.
          </p>
        </div>
        <button
          className="button"
          aria-label="Obnovit místnosti"
          disabled={loading || busy}
          onClick={() => setRevision((n) => n + 1)}
        >
          <RefreshCw size={18} className={loading ? "spin" : undefined} />
          {loading ? "Obnovuji…" : "Obnovit místnosti"}
        </button>
      </div>
      <div className="dashboard-actions">
        <button
          className="button primary"
          disabled={loading || busy}
          onClick={() => setAction(managers.length ? "room" : "team")}
        >
          <Plus size={16} />
          Vytvořit místnost
        </button>
        <button
          className="button"
          disabled={loading || busy}
          onClick={() => setAction("join")}
        >
          Připojit se přes pozvánku
        </button>
        <button
          className="text-button"
          disabled={loading || busy}
          onClick={() => setAction("team")}
        >
          Vytvořit tým
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {action && (
        <section className="action-panel">
          <h2>
            {action === "team"
              ? "Nový tým"
              : action === "room"
                ? "Nová místnost"
                : "Připojit se k týmu"}
          </h2>
          {action === "team" && !managers.length && (
            <p>Nejprve vytvořte tým, do kterého bude místnost patřit.</p>
          )}
          <form onSubmit={(e) => void submit(e)}>
            {action === "room" && (
              <label>
                Tým
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
                Kód pozvánky
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
                Název
                <input name="name" required maxLength={80} />
              </label>
            )}
            <div className="dashboard-actions">
              <button className="button primary" disabled={busy}>
                {action === "join" ? "Přijmout pozvánku" : "Vytvořit"}
              </button>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Zrušit
              </button>
            </div>
          </form>
        </section>
      )}
      {invitation && (
        <section className="action-panel">
          <h2>Pozvánka je připravená</h2>
          <p>
            Předejte tento jednorázový kód kolegovi. Platí do{" "}
            {new Date(invitation.expires_at).toLocaleString("cs-CZ")}.
          </p>
          <input
            aria-label="Vytvořený kód pozvánky"
            readOnly
            value={invitation.code}
            onFocus={(e) => e.target.select()}
          />
          <button className="text-button" onClick={() => setInvitation(null)}>
            Zavřít pozvánku
          </button>
        </section>
      )}
      {loading ? (
        <p role="status">Načítám místnosti…</p>
      ) : !teams.length && !error ? (
        <section className="dashboard-empty">
          <Users size={40} strokeWidth={1} />
          <h2>Váš první společný prostor.</h2>
          <p>Vytvořte tým a místnost nebo přijměte pozvánku od kolegy.</p>
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
                  ? "VLASTNÍK"
                  : team.role === "admin"
                    ? "SPRÁVCE"
                    : "ČLEN"}
              </span>
              {team.role !== "member" && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void invite(team.id)}
                >
                  Pozvat člena
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
                      Vstoupit do místnosti <ArrowUpRight size={16} />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">
                Tým zatím nemá žádnou místnost.
                {team.role === "member"
                  ? " Požádejte správce o její vytvoření."
                  : " Použijte Vytvořit místnost."}
              </p>
            )}
          </section>
        ))
      )}
    </main>
  );
}

const eventLabels: Record<string, string> = {
  "ambient.started": "spustil/a společné prostředí",
  "ambient.paused": "pozastavil/a společné prostředí",
  "presence.joined": "vstoupil/a do místnosti",
  "presence.left": "opustil/a místnost",
  "git.connected": "zapnul/a sdílení Git stavu",
  "git.disconnected": "ukončil/a sdílení Git stavu",
  "git.working_tree_changed": "aktualizoval/a Git stav",
  "git.branch_changed": "změnil/a větev",
  "git.commit_created": "má jiný poslední commit",
  "conflict.detected": "zaznamenal nový překryv sdílených změn",
  "conflict.resolved":
    "přestal pozorovat některý překryv (změna stavu, sdílení nebo přítomnosti)",
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
    connecting: "Připojuji…",
    online: "Živě připojeno",
    offline: "Spojení přerušeno — obnovuji…",
    denied:
      "Přístup vypršel nebo byl odebrán. Vraťte se na dashboard a přihlaste se znovu.",
    replaced: "Místnost je otevřená v jiném okně.",
    invalid: "Sdílený stav nebyl přijat. Vypněte sdílení a připojte se znovu.",
  };
  return (
    <div className="room-workspace">
      <div className="room-heading">
        <button className="button" onClick={onBack}>
          <ArrowLeft size={16} />
          Všechny místnosti
        </button>
        <h1>{room.name}</h1>
        <span role="status" className="connection">
          {statusLabel[live.status]}
        </span>
        {["offline", "replaced", "invalid"].includes(live.status) && (
          <button className="text-button" onClick={live.reconnect}>
            Připojit znovu
          </button>
        )}
      </div>
      <section className="privacy-controls">
        <div>
          <h2>Sdílení v této místnosti</h2>
          <p>
            Připojte lokální kopii společného projektu. Kód ani obsah změn se
            neodesílají.
          </p>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!snapshot}
            onChange={(e) => setEnabled(e.target.checked)}
          />{" "}
          Toto je repozitář této místnosti — sdílet Git stav
        </label>
        <div className="privacy-options">
          {(
            [
              ["branch", "Název větve"],
              ["files", "Názvy souborů"],
              ["commit_message", "Zpráva commitu"],
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
            ? "Sdílíte počet změn a hash commitu; další údaje podle voleb výše."
            : "Sdílení Git stavu je vypnuté. Ostatní vidí pouze vaši přítomnost."}
        </p>
        {enabled && sharing.files && !presence?.sharing.files && (
          <p className="muted">
            Seznam souborů je příliš velký. Sdílí se pouze jejich počet.
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
            Lidé v místnosti <span className="count">{online.size}</span>
          </h2>
          {memberError && <p role="alert">{memberError}</p>}
          {visibleMembers.map((member) => {
            const peer = online.get(member.user_id);
            const git = peer?.presence;
            return (
              <article className="member-card" key={member.user_id}>
                <div className="member-title">
                  <strong>
                    {member.display_name}
                    {member.user_id === session.user.id ? " (vy)" : ""}
                  </strong>
                  <span>{peer ? "Online" : "Mimo místnost"}</span>
                </div>
                {git ? (
                  <>
                    <p>
                      {git.branch ?? "Větev je skrytá"} · {git.changed_count}{" "}
                      změněných souborů
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
                      <p className="muted">Názvy souborů se nesdílejí.</p>
                    )}
                  </>
                ) : (
                  <p className="muted">{peer ? "Git stav se nesdílí." : ""}</p>
                )}
              </article>
            );
          })}
        </section>
        <section className="room-timeline">
          <h2>Aktivita</h2>
          <p className="muted">
            Posledních 100 událostí aktuální relace místnosti.
          </p>
          <ol>
            {[...(live.state?.events ?? [])].reverse().map((event) => (
              <li key={event.id}>
                <time>
                  {new Date(event.created_at).toLocaleTimeString("cs-CZ")}
                </time>
                <span>
                  <strong>{event.display_name}</strong>{" "}
                  {eventLabels[event.type] ?? "aktualizoval/a stav"}
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
