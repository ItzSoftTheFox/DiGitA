import { useRef, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TeamAdministration } from "./TeamAdministration";
import { ApiError, type Member } from "../lib/api";
import { setLanguage } from "../i18n";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  api: mocks.api,
}));
const owner: Member = {
  user_id: "owner",
  display_name: "Owner",
  role: "owner",
};
const member: Member = {
  user_id: "member",
  display_name: "Member",
  role: "member",
  custom_status: "Reviewing",
};
const invitation = { id: "invite-id", expires_at: "2030-10-03T12:00:00Z" };
const code = "A".repeat(43);
const refreshed = vi.fn();
const expired = vi.fn();
const clipboard = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  setLanguage("en");
  vi.spyOn(window, "confirm").mockReturnValue(true);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboard },
  });
  mocks.api.mockImplementation(async (path: string) =>
    path.endsWith("/members") ? [owner, member] : [],
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function Administration({
  role = "owner",
  teamId = "team",
}: {
  role?: Member["role"];
  teamId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const submitting = useRef(false);
  return (
    <TeamAdministration
      team={{ id: teamId, name: "Test team", role }}
      token="token"
      accountId={role === "owner" ? "owner" : "member"}
      revision={0}
      busy={busy}
      setBusy={setBusy}
      submitting={submitting}
      uncertain={uncertain}
      onUncertain={() => setUncertain(true)}
      onAcknowledge={() => setUncertain(false)}
      onRefresh={refreshed}
      onExpired={expired}
    />
  );
}
async function ready() {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Refresh team" })).toHaveProperty(
      "disabled",
      false,
    ),
  );
}

it("shows owner role and removal controls only for other members and confirms each change", async () => {
  render(<Administration />);
  await ready();
  expect(screen.queryByRole("combobox", { name: "Role for Owner" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Remove Owner" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Leave team" })).toBeNull();
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  fireEvent.change(screen.getByRole("combobox", { name: "Role for Member" }), {
    target: { value: "admin" },
  });
  expect(mocks.api).not.toHaveBeenCalledWith(
    expect.anything(),
    "token",
    "PATCH",
    expect.anything(),
  );
  let roster = [owner, member];
  mocks.api.mockImplementation(
    async (path: string, _token: string, method = "GET") => {
      if (method === "PATCH") {
        roster = [owner, { ...member, role: "admin" }];
        return roster[1];
      }
      if (method === "DELETE") {
        roster = [owner];
        return;
      }
      return path.endsWith("/members") ? roster : [];
    },
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Role for Member" }), {
    target: { value: "admin" },
  });
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Role for Member" }),
    ).toHaveProperty("value", "admin"),
  );
  expect(mocks.api).toHaveBeenCalledWith(
    "/teams/team/members/member",
    "token",
    "PATCH",
    { role: "admin" },
  );
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Remove Member" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Remove Member" })).toBeNull(),
  );
  expect(window.confirm).toHaveBeenLastCalledWith(
    "Remove Member from this team? They will lose access to its rooms.",
  );
});

it.each(["member", "admin"] as const)(
  "respects %s access using the refreshed roster and supports confirmed self-leave",
  async (role) => {
    mocks.api.mockImplementation(async (path: string) =>
      path.endsWith("/members") ? [owner, { ...member, role }] : [],
    );
    render(<Administration role={role} />);
    await ready();
    expect(screen.queryByRole("combobox", { name: /Role for/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(!!screen.queryByRole("button", { name: "Invite member" })).toBe(
      role === "admin",
    );
    if (role === "member")
      expect(mocks.api).not.toHaveBeenCalledWith(
        "/teams/team/invitations",
        "token",
      );
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Leave team" }));
    expect(mocks.api).not.toHaveBeenCalledWith(
      "/teams/team/members/member",
      "token",
      "DELETE",
      undefined,
    );
    fireEvent.click(screen.getByRole("button", { name: "Leave team" }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/teams/team/members/member",
        "token",
        "DELETE",
        undefined,
      ),
    );
  },
);

it("lists active expiry without codes, displays a created code once and confirms revocation", async () => {
  let active: (typeof invitation)[] = [];
  mocks.api.mockImplementation(
    async (path: string, _token: string, method = "GET") => {
      if (path.endsWith("/members")) return [owner, member];
      if (method === "POST") {
        active = [invitation];
        return { ...invitation, code };
      }
      if (method === "DELETE") {
        active = [];
        return;
      }
      return active;
    },
  );
  render(<Administration />);
  await ready();
  expect(
    screen.queryByRole("textbox", { name: "Created invitation code" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Invite member" }));
  expect(
    await screen.findByRole("textbox", { name: "Created invitation code" }),
  ).toHaveProperty("value", code);
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Close invitation" }));
  expect(
    screen.queryByRole("textbox", { name: "Created invitation code" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Revoke invitation invite-id" }),
  ).toBeTruthy();
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  fireEvent.click(
    screen.getByRole("button", { name: "Revoke invitation invite-id" }),
  );
  expect(mocks.api).not.toHaveBeenCalledWith(
    "/teams/team/invitations/invite-id",
    "token",
    "DELETE",
    undefined,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Revoke invitation invite-id" }),
  );
  await screen.findByText("No active invitations.");
  expect(mocks.api).toHaveBeenCalledWith(
    "/teams/team/invitations/invite-id",
    "token",
    "DELETE",
    undefined,
  );
});

it("reports clipboard success only after completion and selects the code on failure", async () => {
  mocks.api.mockImplementation(
    async (path: string, _token: string, method = "GET") =>
      path.endsWith("/members")
        ? [owner, member]
        : method === "POST"
          ? { ...invitation, code }
          : [invitation],
  );
  render(<Administration />);
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Invite member" }));
  const input = (await screen.findByRole("textbox", {
    name: "Created invitation code",
  })) as HTMLInputElement;
  await ready();
  let finish!: () => void;
  clipboard.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy invitation code" }));
  expect(screen.queryByText("Invitation code copied.")).toBeNull();
  await act(async () => finish());
  expect(screen.getByRole("status").textContent).toBe(
    "Invitation code copied.",
  );
  clipboard.mockRejectedValueOnce(new Error("Denied"));
  fireEvent.click(screen.getByRole("button", { name: "Copy invitation code" }));
  await screen.findByText(
    "Could not copy the invitation code. Select and copy it manually.",
  );
  expect(screen.queryByText("Invitation code copied.")).toBeNull();
  expect(document.activeElement).toBe(input);
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(43);
});

it("retains quota/conflict feedback after automatic refresh and allows recovery", async () => {
  mocks.api.mockImplementation(
    async (path: string, _token: string, method = "GET") => {
      if (method === "POST")
        throw new ApiError(
          409,
          "The team has reached its active invitation limit.",
        );
      return path.endsWith("/members") ? [owner, member] : [invitation];
    },
  );
  render(<Administration />);
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Invite member" }));
  await ready();
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "The team has reached its active invitation limit.",
  );
  await waitFor(() => expect(refreshed).toHaveBeenCalled());
  expect(
    screen.getByRole("button", { name: "Revoke invitation invite-id" }),
  ).toHaveProperty("disabled", false);
});

it("refreshes changed access and hides stale member controls after permission failure", async () => {
  let removed = false;
  mocks.api.mockImplementation(
    async (path: string, _token: string, method = "GET") => {
      if (method === "PATCH") {
        removed = true;
        throw new ApiError(403, "You do not have permission for this action.");
      }
      if (removed) throw new ApiError(404, "Team unavailable.");
      return path.endsWith("/members") ? [owner, member] : [invitation];
    },
  );
  render(<Administration />);
  await ready();
  fireEvent.change(screen.getByRole("combobox", { name: "Role for Member" }), {
    target: { value: "admin" },
  });
  await screen.findByText("Team unavailable.");
  expect(screen.queryByRole("button", { name: "Invite member" })).toBeNull();
  expect(
    screen.queryByRole("combobox", { name: "Role for Member" }),
  ).toBeNull();
  expect(refreshed).toHaveBeenCalled();
});

it("blocks unknown mutations until an explicit roster refresh and acknowledgement", async () => {
  mocks.api.mockImplementation(
    async (path: string, _token: string, method = "GET") => {
      if (method === "POST") throw new ApiError(0, "Connection lost", 0, true);
      return path.endsWith("/members") ? [owner, member] : [invitation];
    },
  );
  render(<Administration />);
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Invite member" }));
  await screen.findByText(/The request may have succeeded/);
  expect(screen.getByRole("button", { name: "Invite member" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(
    screen.getByRole("button", { name: "I checked — allow a new request" }),
  ).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByRole("button", { name: "Refresh team" }));
  await ready();
  expect(screen.getByRole("button", { name: "Invite member" })).toHaveProperty(
    "disabled",
    true,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "I checked — allow a new request" }),
  );
  expect(screen.getByRole("button", { name: "Invite member" })).toHaveProperty(
    "disabled",
    false,
  );
});

it("ignores an old roster response after changing teams and expires unauthorized sessions", async () => {
  let finish!: (value: Member[]) => void;
  mocks.api.mockImplementation((path: string) =>
    path === "/teams/team/members"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : path.endsWith("/members")
        ? Promise.resolve([owner])
        : Promise.resolve([]),
  );
  const view = render(<Administration />);
  view.rerender(<Administration teamId="new-team" />);
  await ready();
  await act(async () => finish([owner, member]));
  expect(screen.queryByRole("button", { name: "Remove Member" })).toBeNull();
  mocks.api.mockRejectedValue(new ApiError(401, "Session expired"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh team" }));
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
  expect(screen.queryByRole("button", { name: "Invite member" })).toBeNull();
});

it("offers team deletion only to the owner, confirms its consequences and handles denial", async () => {
  const view = render(<Administration />);
  await ready();
  const button = screen.getByRole("button", { name: "Delete team" });
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  fireEvent.click(button);
  expect(
    mocks.api.mock.calls.some(
      ([path, , method]) => path === "/teams/team" && method === "DELETE",
    ),
  ).toBe(false);
  mocks.api.mockImplementation(async (path, _token, method) => {
    if (method === "DELETE")
      throw new ApiError(403, "Only the team owner can delete this team.");
    return path.endsWith("/members") ? [owner, member] : [];
  });
  fireEvent.click(button);
  expect(window.confirm).toHaveBeenLastCalledWith(
    "Delete team Test team? Its rooms, memberships and invitations will be permanently removed.",
  );
  await screen.findByText("Only the team owner can delete this team.");
  expect(mocks.api).toHaveBeenCalledWith(
    "/teams/team",
    "token",
    "DELETE",
    undefined,
  );
  view.unmount();
  render(<Administration role="member" />);
  await ready();
  expect(screen.queryByRole("button", { name: "Delete team" })).toBeNull();
});

it("does not expose team deletion to administrators", async () => {
  mocks.api.mockImplementation(async (path: string) =>
    path.endsWith("/members") ? [owner, { ...member, role: "admin" }] : [],
  );
  render(<Administration role="admin" />);
  await ready();
  expect(screen.queryByRole("button", { name: "Delete team" })).toBeNull();
});
