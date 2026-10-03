import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import type { Sharing } from "../hooks/useRoom";

export function SharingChoices({
  value,
  onChange,
}: {
  value: Sharing;
  onChange: (value: Sharing) => void;
}) {
  return (
    <div className="privacy-options">
      {(
        [
          ["branch", "Branch name"],
          ["files", "File names"],
          ["commit_message", "Commit message"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="check-label">
          <input
            type="checkbox"
            checked={value[key]}
            onChange={(event) =>
              onChange({ ...value, [key]: event.target.checked })
            }
          />
          {t(label)}
        </label>
      ))}
    </div>
  );
}

export function SharingConfirmation({
  repository,
  room,
  choices,
  onConfirm,
  onCancel,
}: {
  repository: string;
  room: string;
  choices: Sharing;
  onConfirm: (choices: Sharing) => void;
  onCancel: () => void;
}) {
  const [association, setAssociation] = useState(false);
  const [draft, setDraft] = useState(choices);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div className="sharing-dialog-backdrop">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sharing-dialog-title"
        className="sharing-dialog"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
          if (event.key !== "Tab") return;
          const controls = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled)",
            ) ?? [],
          );
          const first = controls[0];
          const last = controls.at(-1);
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === dialog.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <h2 id="sharing-dialog-title">{t("Choose Git metadata to share")}</h2>
        <p>
          {t("Confirm that {repository} is your local copy for {room}.", {
            repository,
            room,
          })}
        </p>
        <SharingChoices value={draft} onChange={setDraft} />
        <p>
          {t(
            "Sharing always includes the change count and latest commit hash. Branch name, file names and commit message are optional. Code, diffs and absolute paths stay on this device.",
          )}
        </p>
        <label className="check-label">
          <input
            type="checkbox"
            checked={association}
            onChange={(event) => setAssociation(event.target.checked)}
          />
          {t("This repository belongs to this room — share Git status")}
        </label>
        <div className="dashboard-actions">
          <button
            className="button primary"
            disabled={!association}
            onClick={() => onConfirm(draft)}
          >
            {t("Start sharing")}
          </button>
          <button className="button" onClick={onCancel}>
            {t("Cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
