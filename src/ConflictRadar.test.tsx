import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConflictRadar } from "./ConflictRadar";
import type { Presence, RoomState } from "./useRoom";

const notification = vi.hoisted(() => ({ send: vi.fn(), permission: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: (...args: unknown[]) => Promise.resolve(notification.send(...args)),
}));
vi.mock("@tauri-apps/plugin-notification", () => ({
  sendNotification: notification.send,
  isPermissionGranted: notification.permission,
  requestPermission: async () => "denied",
}));
const presence: Presence = {
  repository_id: "room",
  files: ["private.ts"],
  branch: null,
  changed_count: 1,
  commit_hash: null,
  commit_message: null,
  sharing: { files: true, branch: false, commit_message: false },
};
const warning = { id: "first", path: "private.ts", user_ids: ["me", "other"] };
function state(conflicts: RoomState["conflicts"] = []): RoomState {
  return {
    type: "room.state",
    room_id: "room",
    ambient: {
      track: "soft-noise-v1",
      duration_ms: 30000,
      playing: false,
      position_ms: 0,
      revision: 0,
    },
    conflicts,
    events: [],
    members: [
      { user_id: "me", display_name: "Anna", presence },
      { user_id: "other", display_name: "Petr", presence },
    ],
  };
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

it("clears withdrawn local paths and offline state immediately", () => {
  const view = render(
    <ConflictRadar state={state([warning])} userId="me" presence={presence} />,
  );
  expect(screen.getByText("private.ts")).toBeTruthy();
  expect(screen.getByText("Anna (vy), Petr")).toBeTruthy();
  view.rerender(
    <ConflictRadar state={state([warning])} userId="me" presence={null} />,
  );
  expect(screen.queryByText("private.ts")).toBeNull();
  view.rerender(<ConflictRadar state={null} userId="me" presence={presence} />);
  expect(screen.getByText(/Radar čeká na spojení/)).toBeTruthy();
  expect(notification.send).not.toHaveBeenCalled();
});

it("throttles successive warnings and cancels pending notifications on opt-out", async () => {
  vi.useFakeTimers();
  notification.permission.mockResolvedValue(true);
  const view = render(
    <ConflictRadar state={state()} userId="me" presence={presence} />,
  );
  await act(async () => {
    fireEvent.click(screen.getByText("Zapnout systémová upozornění"));
  });
  view.rerender(
    <ConflictRadar state={state([warning])} userId="me" presence={presence} />,
  );
  act(() => vi.advanceTimersByTime(1500));
  view.rerender(
    <ConflictRadar
      state={state([{ ...warning, id: "next" }])}
      userId="me"
      presence={presence}
    />,
  );
  act(() => vi.advanceTimersByTime(29999));
  expect(notification.send).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(1));
  expect(notification.send).toHaveBeenCalledTimes(2);
  view.rerender(
    <ConflictRadar
      state={state([{ ...warning, id: "last" }])}
      userId="me"
      presence={presence}
    />,
  );
  fireEvent.click(screen.getByText("Vypnout systémová upozornění"));
  act(() => vi.advanceTimersByTime(30000));
  expect(notification.send).toHaveBeenCalledTimes(2);
});

it("requires permission, batches bursts, cancels resolved alerts and suppresses reconnect replay", async () => {
  vi.useFakeTimers();
  notification.permission.mockResolvedValue(true);
  const view = render(
    <ConflictRadar state={state()} userId="me" presence={presence} />,
  );
  await act(async () => {
    fireEvent.click(screen.getByText("Zapnout systémová upozornění"));
  });
  view.rerender(
    <ConflictRadar state={state([warning])} userId="me" presence={presence} />,
  );
  act(() => vi.advanceTimersByTime(1500));
  expect(notification.send).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(notification.send.mock.calls)).not.toContain(
    "private.ts",
  );
  view.rerender(<ConflictRadar state={null} userId="me" presence={presence} />);
  const restoring = state();
  restoring.members[0].presence = null;
  view.rerender(
    <ConflictRadar state={restoring} userId="me" presence={presence} />,
  );
  view.rerender(
    <ConflictRadar state={state([warning])} userId="me" presence={presence} />,
  );
  act(() => vi.advanceTimersByTime(30000));
  expect(notification.send).toHaveBeenCalledTimes(1);
  view.rerender(
    <ConflictRadar state={state()} userId="me" presence={presence} />,
  );
  view.rerender(
    <ConflictRadar
      state={state([{ ...warning, id: "second" }])}
      userId="me"
      presence={presence}
    />,
  );
  view.rerender(
    <ConflictRadar state={state()} userId="me" presence={presence} />,
  );
  act(() => vi.advanceTimersByTime(30000));
  expect(notification.send).toHaveBeenCalledTimes(1);
});

it("keeps radar usable after notification permission denial", async () => {
  notification.permission.mockResolvedValue(false);
  render(
    <ConflictRadar state={state([warning])} userId="me" presence={presence} />,
  );
  await act(async () => {
    fireEvent.click(screen.getByText("Zapnout systémová upozornění"));
  });
  expect(screen.getByRole("alert").textContent).toContain("nejsou povolená");
  expect(screen.getByText("private.ts")).toBeTruthy();
  expect(notification.send).not.toHaveBeenCalled();
});
