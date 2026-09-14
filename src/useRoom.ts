import { useEffect, useRef, useState } from "react";
import { API_URL } from "./api";
import type { RepositorySnapshot } from "./repository";

export type Sharing = {
  branch: boolean;
  files: boolean;
  commit_message: boolean;
};
export type Presence = {
  repository_id: string;
  branch: string | null;
  files: string[] | null;
  changed_count: number;
  commit_hash: string | null;
  commit_message: string | null;
  sharing: Sharing;
};
export type RoomState = {
  type: "room.state";
  room_id: string;
  members: {
    user_id: string;
    display_name: string;
    presence: Presence | null;
  }[];
  events: {
    id: string;
    type: string;
    created_at: string;
    user_id: string;
    display_name: string;
  }[];
};
export function sharedPresence(
  roomId: string,
  snapshot: RepositorySnapshot | null,
  enabled: boolean,
  sharing: Sharing,
): Presence | null {
  if (!enabled || !snapshot) return null;
  const paths = snapshot.files.map((f) => f.path);
  // Never truncate a file list silently: a large repository shares only its count.
  const canShareFiles =
    sharing.files &&
    paths.length <= 500 &&
    paths.every((p) => p.length <= 512) &&
    new TextEncoder().encode(JSON.stringify(paths)).length < 48000;
  return {
    repository_id: roomId,
    branch: sharing.branch ? snapshot.branch.slice(0, 256) : null,
    files: canShareFiles ? paths : null,
    changed_count: paths.length,
    commit_hash: snapshot.commit?.hash ?? null,
    commit_message: sharing.commit_message
      ? (snapshot.commit?.subject.slice(0, 512) ?? null)
      : null,
    sharing: { ...sharing, files: canShareFiles },
  };
}

export function useRoom(
  roomId: string,
  token: string,
  presence: Presence | null,
) {
  const [state, setState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState("connecting");
  const [attempt, setAttempt] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const ready = useRef(false);
  const payload = JSON.stringify({ type: "presence.update", presence });
  const latest = useRef(payload);
  latest.current = payload;
  const lastSent = useRef("");
  useEffect(() => {
    if (
      ready.current &&
      socketRef.current?.readyState === WebSocket.OPEN &&
      payload !== lastSent.current
    ) {
      socketRef.current.send(payload);
      lastSent.current = payload;
    }
  }, [payload]);
  useEffect(() => {
    let active = true;
    let retry: ReturnType<typeof setTimeout>;
    let heartbeat: ReturnType<typeof setInterval>;
    let failures = 0;
    let terminal = false;
    let lastReceived = Date.now();
    function connect() {
      if (!active) return;
      if (!navigator.onLine) {
        setStatus("offline");
        return;
      }
      setStatus("connecting");
      ready.current = false;
      const socket = new WebSocket(
        `${API_URL.replace(/^http/, "ws")}/rooms/${roomId}/live`,
      );
      socketRef.current = socket;
      socket.onopen = () => {
        if (!active) return socket.close();
        lastReceived = Date.now();
        socket.send(JSON.stringify({ type: "auth", token }));
        heartbeat = setInterval(() => {
          if (Date.now() - lastReceived > 45000) socket.close();
          else if (socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({ type: "ping" }));
        }, 15000);
      };
      socket.onmessage = (event) => {
        if (!active || socketRef.current !== socket) return;
        lastReceived = Date.now();
        try {
          const data = JSON.parse(event.data);
          if (data.type !== "room.state" || data.room_id !== roomId) return;
          setState(data);
          setStatus("online");
          failures = 0;
          if (!ready.current) {
            ready.current = true;
            socket.send(latest.current);
            lastSent.current = latest.current;
          }
        } catch {
          socket.close();
        }
      };
      socket.onclose = (event) => {
        if (!active || socketRef.current !== socket) return;
        clearInterval(heartbeat);
        ready.current = false;
        // Remove stale private metadata immediately on disconnect/revocation.
        setState(null);
        if ([4401, 4403, 4009, 1008].includes(event.code)) {
          terminal = true;
          setStatus(
            event.code === 4009
              ? "replaced"
              : event.code === 1008
                ? "invalid"
                : "denied",
          );
          return;
        }
        setStatus("offline");
        retry = setTimeout(connect, Math.min(1000 * 2 ** failures++, 15000));
      };
    }
    function offline() {
      if (terminal) return;
      ready.current = false;
      setState(null);
      setStatus("offline");
      socketRef.current?.close();
    }
    function online() {
      if (terminal || !active) return;
      clearTimeout(retry);
      if (
        !socketRef.current ||
        socketRef.current.readyState === WebSocket.CLOSED
      )
        connect();
    }
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    setState(null);
    connect();
    return () => {
      active = false;
      ready.current = false;
      clearTimeout(retry);
      clearInterval(heartbeat);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN)
        socket.send(
          JSON.stringify({ type: "presence.update", presence: null }),
        );
      socket?.close();
      socketRef.current = null;
    };
  }, [roomId, token, attempt]);
  return { state, status, reconnect: () => setAttempt((a) => a + 1) };
}
