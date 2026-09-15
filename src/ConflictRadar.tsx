import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import { Radar } from "lucide-react";
import type { Presence, RoomState } from "./useRoom";

export function ConflictRadar({
  state,
  userId,
  presence,
}: {
  state: RoomState | null;
  userId: string;
  presence: Presence | null;
}) {
  const [notifications, setNotifications] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Hide our withdrawn metadata immediately, without waiting for the server echo.
  const conflicts = (state?.conflicts ?? []).filter(
    (c) =>
      !c.user_ids.includes(userId) ||
      (presence?.sharing.files && presence.files?.includes(c.path)),
  );
  const mine = conflicts.filter((c) => c.user_ids.includes(userId));
  const signature = JSON.stringify(mine.map((c) => c.id).sort());
  const connected = state !== null;
  const serverPresence =
    state?.members.find((m) => m.user_id === userId)?.presence ?? null;
  const acknowledged =
    JSON.stringify(serverPresence) === JSON.stringify(presence);
  const synchronized = useRef(false);
  const previous = useRef<Set<string> | null>(null);
  const pending = useRef(new Set<string>());
  const lastNotice = useRef(-Infinity);
  useEffect(() => {
    const ids = new Set<string>(JSON.parse(signature));
    if (!connected) {
      synchronized.current = false;
      previous.current = null;
      pending.current.clear();
      return;
    }
    // Reconnect first delivers a snapshot before our current presence is restored.
    // Wait for its echo before taking a baseline, so restoration isn't a new alert.
    if (!synchronized.current) {
      if (!acknowledged) return;
      synchronized.current = true;
      previous.current = ids;
      return;
    }
    if (previous.current && notifications) {
      for (const id of ids)
        if (!previous.current.has(id)) pending.current.add(id);
    }
    previous.current = ids;
    for (const id of pending.current)
      if (!ids.has(id)) pending.current.delete(id);
    if (!notifications) pending.current.clear();
    if (!pending.current.size) return;
    // Group bursts and cap notifications at one every 30 seconds.
    const timer = setTimeout(
      () => {
        pending.current.clear();
        lastNotice.current = Date.now();
        // No project/file/member metadata enters the OS notification history.
        // Await the plugin command: its JS Notification constructor discards failures.
        void invoke("plugin:notification|notify", {
          options: {
            title: "DiGitA · Conflict Radar",
            body: "Vaše změny se překrývají s prací kolegů. Podrobnosti najdete v místnosti.",
          },
        }).catch(() => {
          setError(
            "Systémové upozornění se nepodařilo zobrazit. Radar v aplikaci zůstává dostupný.",
          );
        });
      },
      Math.max(1500, lastNotice.current + 30000 - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [signature, connected, notifications, acknowledged]);

  async function toggleNotifications() {
    if (notifications) {
      setNotifications(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const granted =
        (await isPermissionGranted()) ||
        (await requestPermission()) === "granted";
      setNotifications(granted);
      if (!granted)
        setError(
          "Systémová upozornění nejsou povolená. Varování uvidíte zde v místnosti.",
        );
    } catch {
      setError(
        "Systémová upozornění nejsou dostupná. Varování uvidíte zde v místnosti.",
      );
    } finally {
      setBusy(false);
    }
  }
  const sharingCount =
    state?.members.filter(
      (m) => m.presence?.sharing.files && m.presence.files !== null,
    ).length ?? 0;
  const names = new Map(state?.members.map((m) => [m.user_id, m.display_name]));
  return (
    <section className="conflict-radar" aria-labelledby="radar-heading">
      <div className="radar-heading">
        <h2 id="radar-heading">
          <Radar size={20} /> Conflict Radar{" "}
          <span className="count">{conflicts.length}</span>
        </h2>
        {isTauri() && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void toggleNotifications()}
          >
            {notifications
              ? "Vypnout systémová upozornění"
              : "Zapnout systémová upozornění"}
          </button>
        )}
      </div>
      <p className="muted">
        Stejný soubor u více lidí znamená možné riziko, ne potvrzený Git
        konflikt. Porovnáváme jen sdílené názvy souborů.
      </p>
      <p
        aria-live="polite"
        aria-atomic="true"
        className={conflicts.length ? "radar-summary" : "muted"}
      >
        {!connected
          ? "Radar čeká na spojení. Aktuální překryvy nelze ověřit."
          : conflicts.length
            ? `Soubory se souběžnými změnami: ${conflicts.length}. Z toho ve vaší práci: ${mine.length}.`
            : "Ve sdílených souborech nyní není zjištěný překryv."}
      </p>
      {connected && (
        <p className="muted">
          Názvy souborů sdílí {sharingCount} z {state.members.length} online
          členů. Skryté nebo příliš velké seznamy nelze porovnat.
        </p>
      )}
      {error && (
        <p role="alert" className="muted">
          {error}
        </p>
      )}
      <ul className="conflict-list">
        {conflicts.map((c) => (
          <li key={c.id}>
            <code>{c.path}</code>
            <span>
              {c.user_ids
                .map((id) =>
                  id === userId
                    ? `${names.get(id) ?? "Člen"} (vy)`
                    : (names.get(id) ?? "Člen"),
                )
                .join(", ")}
            </span>
            <p className="muted">
              Domluvte se, zda upravujete stejnou část souboru.
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
