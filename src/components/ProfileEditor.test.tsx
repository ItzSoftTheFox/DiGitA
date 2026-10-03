import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProfileEditor } from "./ProfileEditor";
import {
  LanguageSettings,
  SettingsButton,
  useSettingsNavigation,
} from "./LanguageSettings";
import { ApiError, type User } from "../lib/api";
import { setLanguage } from "../i18n";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  api: mocks.api,
}));
const user = {
  id: "self",
  email: "private@example.com",
  display_name: "Original",
  avatar: "cat",
  avatar_color: "blue",
  custom_status: "A status",
} satisfies User;
const saved = vi.fn();
const expired = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  setLanguage("en");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function () {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function () {
      this.removeAttribute("open");
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function editor() {
  return (
    <ProfileEditor
      user={user}
      token="token"
      onSaved={saved}
      onExpired={expired}
    />
  );
}
function name(value: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), {
    target: { value },
  });
}
function save() {
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
}

it("validates trimmed names and preserves the draft on a rejected save", async () => {
  mocks.api.mockRejectedValue(new ApiError(422, "Check the entered details."));
  render(editor());
  name("   ");
  save();
  expect(screen.getByRole("alert").textContent).toContain("1–80");
  expect(mocks.api).not.toHaveBeenCalled();
  name("  New name  ");
  fireEvent.change(screen.getByRole("textbox", { name: "Custom status" }), {
    target: { value: "  Focused  " },
  });
  save();
  await screen.findByText("Check the entered details.");
  expect(mocks.api).toHaveBeenCalledWith("/auth/me", "token", "PATCH", {
    display_name: "New name",
    avatar: "cat",
    avatar_color: "blue",
    custom_status: "Focused",
  });
  expect(screen.getByRole("textbox", { name: "Display name" })).toHaveProperty(
    "value",
    "  New name  ",
  );
  expect(saved).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Save profile" })).toHaveProperty(
    "disabled",
    false,
  );
});

it("saves bundled avatar reset and status clearing only after a valid account response", async () => {
  mocks.api.mockResolvedValue({
    ...user,
    avatar: "initials",
    avatar_color: "slate",
    custom_status: "",
  });
  render(editor());
  fireEvent.click(screen.getByRole("button", { name: "Reset avatar" }));
  fireEvent.click(screen.getByRole("button", { name: "Clear status" }));
  expect(saved).not.toHaveBeenCalled();
  save();
  await screen.findByText("Profile saved.");
  expect(saved).toHaveBeenCalledWith({
    ...user,
    avatar: "initials",
    avatar_color: "slate",
    custom_status: "",
  });
  expect(mocks.api).toHaveBeenCalledWith("/auth/me", "token", "PATCH", {
    display_name: "Original",
    avatar: "initials",
    avatar_color: "slate",
    custom_status: "",
  });
  expect(screen.getByRole("button", { name: "Save profile" })).toHaveProperty(
    "disabled",
    true,
  );
});

it.each([new ApiError(0, "Connection lost", 0, true), null])(
  "blocks an unknown or invalid save until refresh and explicit review (%s)",
  async (failure) => {
    if (failure) mocks.api.mockRejectedValueOnce(failure);
    else mocks.api.mockResolvedValueOnce({ ...user, avatar: "remote-image" });
    mocks.api.mockResolvedValue({ ...user, display_name: "Server result" });
    render(editor());
    name("My draft");
    save();
    await screen.findByText(/The save may have succeeded/);
    expect(saved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save profile" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.getByRole("button", { name: "I checked — allow a new request" }),
    ).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Refresh profile" }));
    await screen.findByText(
      "Profile refreshed. Review your draft before saving again.",
    );
    expect(saved).toHaveBeenCalledWith({
      ...user,
      display_name: "Server result",
    });
    expect(
      screen.getByRole("textbox", { name: "Display name" }),
    ).toHaveProperty("value", "My draft");
    expect(screen.getByRole("button", { name: "Save profile" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "I checked — allow a new request" }),
    );
    expect(screen.getByRole("button", { name: "Save profile" })).toHaveProperty(
      "disabled",
      false,
    );
  },
);

it("expires unauthorized sessions and ignores saves after the editor unmounts", async () => {
  mocks.api.mockRejectedValueOnce(new ApiError(401, "Session expired"));
  const view = render(editor());
  name("New");
  save();
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
  let finish!: (value: User) => void;
  mocks.api.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  save();
  view.unmount();
  await act(async () => finish({ ...user, display_name: "Late response" }));
  expect(saved).not.toHaveBeenCalled();
});

function NavigationProbe({ navigate }: { navigate: () => void }) {
  const guard = useSettingsNavigation();
  return <button onClick={() => guard(navigate)}>Leave workspace</button>;
}
it("keeps dirty drafts on cancelled close, discards on section navigation, and guards workspace navigation", () => {
  const leave = vi.fn();
  render(
    <LanguageSettings>
      <SettingsButton />
      {editor()}
      <NavigationProbe navigate={leave} />
    </LanguageSettings>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  name("Unsaved");
  fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
  expect(
    screen.getByRole("dialog", { name: "Discard profile changes?" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByRole("textbox", { name: "Display name" })).toHaveProperty(
    "value",
    "Unsaved",
  );
  fireEvent.click(screen.getByRole("button", { name: "Language" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(
    screen
      .getByRole("button", { name: "Language" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(screen.getByRole("textbox", { name: "Display name" })).toHaveProperty(
    "value",
    "Original",
  );
  name("Another draft");
  fireEvent.click(screen.getByRole("button", { name: "Leave workspace" }));
  expect(leave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(leave).toHaveBeenCalledOnce();
});

it("enables Discard after an in-flight failed save finishes", async () => {
  let fail!: (cause: Error) => void;
  mocks.api.mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  render(
    <LanguageSettings>
      <SettingsButton />
      {editor()}
    </LanguageSettings>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  name("Unsaved");
  save();
  fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
  expect(screen.getByRole("button", { name: "Discard" })).toHaveProperty(
    "disabled",
    true,
  );
  await act(async () => fail(new ApiError(422, "Check details")));
  expect(screen.getByRole("button", { name: "Discard" })).toHaveProperty(
    "disabled",
    false,
  );
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(screen.queryByRole("button", { name: "Close settings" })).toBeNull();
});
