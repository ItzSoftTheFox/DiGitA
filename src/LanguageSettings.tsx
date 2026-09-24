import { useRef, useState } from "react";
import { Settings, X } from "lucide-react";
import { setLanguage, t, useTranslation, type Language } from "./i18n";

export function LanguageSettings() {
  const language = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [saved, setSaved] = useState(true);
  return (
    <>
      <button
        className="button language-settings-button"
        onClick={() => dialog.current?.showModal()}
      >
        <Settings size={16} />
        {t("Settings")}
      </button>
      <dialog
        ref={dialog}
        className="language-settings"
        aria-labelledby="settings-title"
      >
        <header>
          <h2 id="settings-title">{t("Settings")}</h2>
          <button
            className="icon-button"
            aria-label={t("Close settings")}
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
        </header>
        <label htmlFor="language">{t("Language")}</label>
        <select
          id="language"
          value={language}
          onChange={(event) =>
            setSaved(setLanguage(event.target.value as Language))
          }
        >
          <option value="en" lang="en">
            English
          </option>
          <option value="cs" lang="cs">
            Čeština
          </option>
        </select>
        <p>
          {t(
            "Language is saved only on this device. Changes apply immediately.",
          )}
        </p>
        {!saved && (
          <p role="alert">
            {t(
              "Could not save the language. It will apply only to this app session.",
            )}
          </p>
        )}
      </dialog>
    </>
  );
}
