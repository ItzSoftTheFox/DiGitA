import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SharingConfirmation } from "./SharingConfirmation";
afterEach(cleanup);
const choices = { branch: false, files: false, commit_message: false };

it("requires association plus Start sharing and returns the chosen optional fields", () => {
  const confirm = vi.fn();
  render(
    <SharingConfirmation
      repository="Repo"
      room="Room"
      choices={choices}
      onConfirm={confirm}
      onCancel={() => {}}
    />,
  );
  expect(
    screen.getByRole("dialog", { name: "Choose Git metadata to share" }),
  ).toBe(document.activeElement);
  const start = screen.getByRole("button", { name: "Start sharing" });
  expect(start).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByLabelText("File names"));
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByLabelText(
      "This repository belongs to this room — share Git status",
    ),
  );
  expect(confirm).not.toHaveBeenCalled();
  expect(start).toHaveProperty("disabled", false);
  fireEvent.click(start);
  expect(confirm).toHaveBeenCalledWith({ ...choices, files: true });
});

it("cancels on Escape and traps keyboard focus", () => {
  const cancel = vi.fn();
  const confirm = vi.fn();
  render(
    <SharingConfirmation
      repository="Repo"
      room="Room"
      choices={choices}
      onConfirm={confirm}
      onCancel={cancel}
    />,
  );
  const dialog = screen.getByRole("dialog");
  const button = screen.getByRole("button", { name: "Cancel" });
  fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(button);
  fireEvent.keyDown(button, { key: "Tab" });
  expect(document.activeElement).toBe(screen.getByLabelText("Branch name"));
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(cancel).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
});
