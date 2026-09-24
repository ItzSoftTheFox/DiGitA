import { t, useTranslation } from "./i18n";
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
  useTranslation();
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
            title: t("DiGitA · Conflict Radar"),
            body: t(
              "Your changes overlap with your teammates' work. See the room for details.",
            ),
          },
        }).catch(() => {
          setError(
            "Could not show a system notification. The in-app radar is still available.",
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
          "System notifications are not allowed. Warnings remain visible in this room.",
        );
    } catch {
      setError(
        "System notifications are unavailable. Warnings remain visible in this room.",
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
          <Radar size={20} /> {t("Conflict Radar")}{" "}
          <span className="count">{conflicts.length}</span>
        </h2>
        {isTauri() && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void toggleNotifications()}
          >
            {notifications
              ? t("Disable system notifications")
              : t("Enable system notifications")}
          </button>
        )}
      </div>
      <p className="muted">
        {t(
          "Changes to the same file indicate a possible risk, not a confirmed Git conflict. Only shared file names are compared.",
        )}
      </p>
      <p
        aria-live="polite"
        aria-atomic="true"
        className={conflicts.length ? "radar-summary" : "muted"}
      >
        {!connected
          ? t(
              "Radar is waiting for a connection. Current overlaps cannot be checked.",
            )
          : conflicts.length
            ? t(
                "Files with overlapping changes: {count}. In your work: {mine}.",
                { count: conflicts.length, mine: mine.length },
              )
            : t("No overlap detected in the shared files right now.")}
      </p>
      {connected && (
        <p className="muted">
          {t(
            "File names shared by {sharing} of {total} online members. Hidden or oversized lists cannot be compared.",
            { sharing: sharingCount, total: state.members.length },
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="muted">
          {t(error)}
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
                    ? `${names.get(id) ?? t("Member")} ${t("(you)")}`
                    : (names.get(id) ?? t("Member")),
                )
                .join(", ")}
            </span>
            <p className="muted">
              {t(
                "Check with your teammates whether you are editing the same part of the file.",
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
