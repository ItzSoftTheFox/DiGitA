import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRoom } from "./useRoom";

class Socket {
  static OPEN = 1;
  static CLOSED = 3;
  static last: Socket;
  readyState = 1;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor() {
    Socket.last = this;
  }
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([
  [4401, "expired"],
  [4403, "denied"],
])(
  "distinguishes close %s, clears private state, and stops reconnecting",
  (code, status) => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", Socket);
    const { result } = renderHook(() => useRoom("room", "private-token", null));
    const socket = Socket.last;
    act(() => {
      socket.onopen?.();
      socket.onmessage?.({
        data: JSON.stringify({
          type: "room.state",
          room_id: "room",
          members: [{ user_id: "private-user" }],
          conflicts: [],
          events: [],
        }),
      });
    });
    expect(result.current.status).toBe("online");
    act(() => socket.onclose?.({ code }));
    expect(result.current.status).toBe(status);
    expect(result.current.state).toBeNull();
    act(() => vi.advanceTimersByTime(60000));
    expect(Socket.last).toBe(socket);
  },
);
