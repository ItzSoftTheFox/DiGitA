import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConflictRadar } from "./ConflictRadar";
import type { Presence, RoomState } from "../hooks/useRoom";

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

it("opens manually without warnings and returns focus on Close or Escape", () => {
  const view = render(
    <ConflictRadar state={state()} userId="me" presence={presence} />,
  );
  const trigger = screen.getByRole("button", { name: "Conflict Radar" });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Close conflict radar" }),
  ).toBeNull();
  fireEvent.click(trigger);
  expect(
    screen
      .getByRole("dialog", { name: "Conflict Radar" })
      .getAttribute("aria-modal"),
  ).toBeNull();
  expect(
    screen.getByText("No overlap detected in the shared files right now."),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close conflict radar" }));
  expect(document.activeElement).toBe(trigger);
  expect(screen.queryByRole("dialog")).toBeNull();
  view.rerender(<ConflictRadar state={null} userId="me" presence={presence} />);
  fireEvent.click(trigger);
  expect(screen.getByText(/Radar is waiting for a connection/)).toBeTruthy();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("keeps a dismissed warning closed through updates and regenerated reconnect IDs, then opens for changed participants", () => {
  const view = render(
    <ConflictRadar state={state([warning])} userId="me" presence={presence} />,
  );
  expect(screen.getByRole("dialog", { name: "Conflict Radar" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close conflict radar" }));
  const updated = state([warning]);
  updated.members[1].display_name = "Updated name";
  view.rerender(
    <ConflictRadar state={updated} userId="me" presence={presence} />,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  view.rerender(<ConflictRadar state={null} userId="me" presence={presence} />);
  const restoring = state();
  restoring.members[0].presence = null;
  view.rerender(
    <ConflictRadar state={restoring} userId="me" presence={presence} />,
  );
  view.rerender(
    <ConflictRadar
      state={state([{ ...warning, id: "recreated" }])}
      userId="me"
      presence={presence}
    />,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  view.rerender(
    <ConflictRadar
      state={state([
        warning,
        { ...warning, id: "new-warning", user_ids: ["me", "other", "third"] },
      ])}
      userId="me"
      presence={presence}
    />,
  );
  expect(screen.getByRole("dialog", { name: "Conflict Radar" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Conflict Radar" }).textContent,
  ).toContain("2");
});

it("opens again when a warning genuinely clears and recurs while connected", () => {
  const view = render(
    <ConflictRadar state={state([warning])} userId="me" presence={presence} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Close conflict radar" }));
  view.rerender(
    <ConflictRadar state={state()} userId="me" presence={presence} />,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  view.rerender(
    <ConflictRadar
      state={state([{ ...warning, id: "new-occurrence" }])}
      userId="me"
      presence={presence}
    />,
  );
  expect(screen.getByRole("dialog", { name: "Conflict Radar" })).toBeTruthy();
});

it("does not take focus from a form when automatically opening a visible new warning", () => {
  const room = (data: RoomState) => (
    <>
      <input aria-label="Draft" />
      <ConflictRadar state={data} userId="me" presence={presence} />
    </>
  );
  const view = render(room(state()));
  const input = screen.getByRole("textbox", { name: "Draft" });
  input.focus();
  view.rerender(room(state([warning])));
  expect(screen.getByRole("dialog", { name: "Conflict Radar" })).toBeTruthy();
  expect(document.activeElement).toBe(input);
});

it("clears withdrawn local paths and offline state immediately", () => {
  const view = render(
    <ConflictRadar state={state([warning])} userId="me" presence={presence} />,
  );
  expect(screen.getByText("private.ts")).toBeTruthy();
  expect(screen.getByText("Anna (you), Petr")).toBeTruthy();
  view.rerender(
    <ConflictRadar state={state([warning])} userId="me" presence={null} />,
  );
  expect(screen.queryByText("private.ts")).toBeNull();
  view.rerender(<ConflictRadar state={null} userId="me" presence={presence} />);
  expect(screen.getByText(/Radar is waiting for a connection/)).toBeTruthy();
  expect(notification.send).not.toHaveBeenCalled();
});

it("throttles successive warnings and cancels pending notifications on opt-out", async () => {
  vi.useFakeTimers();
  notification.permission.mockResolvedValue(true);
  const view = render(
    <ConflictRadar state={state()} userId="me" presence={presence} />,
  );
  await act(async () => {
    fireEvent.click(screen.getByText("Enable system notifications"));
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
  fireEvent.click(screen.getByText("Disable system notifications"));
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
    fireEvent.click(screen.getByText("Enable system notifications"));
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
    fireEvent.click(screen.getByText("Enable system notifications"));
  });
  expect(screen.getByRole("alert").textContent).toContain("are not allowed");
  expect(screen.getByText("private.ts")).toBeTruthy();
  expect(notification.send).not.toHaveBeenCalled();
});

it("renders attacker-controlled names and paths as text, never markup", () => {
  const payload = '<img src=x onerror="alert(1)">';
  const data = state([{ ...warning, path: payload }]);
  data.members[1].display_name = payload;
  const shared = { ...presence, files: [payload] };
  data.members.forEach((member) => {
    member.presence = shared;
  });
  const view = render(
    <ConflictRadar state={data} userId="me" presence={shared} />,
  );
  expect(view.container.textContent).toContain(payload);
  expect(view.container.querySelector("img")).toBeNull();
  expect(view.container.querySelector("[onerror]")).toBeNull();
});
