import { useEffect, useRef } from "react";
import { t, useTranslation } from "./i18n";

export function needsIntroduction() {
  try {
    return localStorage.getItem("digita.intro.seen") !== "yes";
  } catch {
    return true;
  }
}

export function QuickStart({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  function finish() {
    try {
      localStorage.setItem("digita.intro.seen", "yes");
    } catch {
      /* Still dismiss for this session. */
    }
    onClose();
  }
  return (
    <dialog
      ref={dialog}
      className="language-settings quick-start"
      aria-labelledby="intro-title"
      onCancel={finish}
    >
      <div className="eyebrow">DiGitA</div>
      <h2 id="intro-title">{t("A quick start")}</h2>
      <section>
        <h3>{t("Start locally")}</h3>
        <p>
          {t(
            "Explore your Git repository without an account. Local mode works without the team server and does not modify your files.",
          )}
        </p>
      </section>
      <section>
        <h3>{t("Meet in a room")}</h3>
        <p>
          {t(
            "Sign in to create a team or accept an invitation. An invitation joins an existing account to a team; it does not create an account.",
          )}
        </p>
      </section>
      <section>
        <h3>{t("Choose what you share")}</h3>
        <p>
          {t(
            "Sharing starts off. Connect your local copy of the project and choose which Git metadata to share. Code and diffs stay on your device. The radar highlights potential overlaps, not confirmed merge conflicts.",
          )}
        </p>
      </section>
      <p className="muted">{t("You can reopen this guide from Settings.")}</p>
      <div className="dashboard-actions">
        <button className="button primary" onClick={finish}>
          {t("Get started")}
        </button>
        <button className="text-button" onClick={finish}>
          {t("Skip intro")}
        </button>
      </div>
    </dialog>
  );
}
