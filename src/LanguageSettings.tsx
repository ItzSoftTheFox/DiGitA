import {
  createContext,
  useContext,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Settings, X } from "lucide-react";
import { setLanguage, t, useTranslation, type Language } from "./i18n";
import { version } from "../package.json";

type Section =
  "account" | "projects" | "privacy" | "audio" | "language" | "about";
type Slot = Section | "activity";
const sections: [Section, string][] = [
  ["account", "Account and profile"],
  ["projects", "Projects"],
  ["privacy", "Privacy"],
  ["audio", "Audio and notifications"],
  ["language", "Language"],
  ["about", "About"],
];
const SettingsContext = createContext<(() => void) | null>(null);
const SlotsContext = createContext<Partial<Record<Slot, HTMLElement>> | null>(
  null,
);

/** Keep ownership in the workspace; portalling controls never remounts its state. */
export function SettingsContent({
  section,
  children,
}: {
  section: Slot;
  children: ReactNode;
}) {
  const slots = useContext(SlotsContext);
  if (!slots) return children;
  return slots[section] ? createPortal(children, slots[section]) : null;
}

export function SettingsButton() {
  useTranslation();
  const open = useContext(SettingsContext);
  if (!open) return null;
  return (
    <button
      type="button"
      className="icon-button sidebar-settings"
      aria-label={t("Settings")}
      title={t("Settings")}
      onClick={open}
    >
      <Settings size={18} />
    </button>
  );
}

export function LanguageSettings({
  onShowGuide,
  children,
}: {
  onShowGuide?: () => void;
  children: ReactNode;
}) {
  const language = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [saved, setSaved] = useState(true);
  const [changed, setChanged] = useState(false);
  const [section, setSection] = useState<Section>("account");
  const [slots, setSlots] = useState<Partial<Record<Slot, HTMLElement>>>({});
  // Stable callback refs prevent detaching/re-attaching portal destinations on renders.
  const [refs] = useState(
    () =>
      Object.fromEntries(
        [...sections.map(([id]) => id), "activity"].map((id) => [
          id,
          (node: HTMLElement | null) => {
            if (node) setSlots((previous) => ({ ...previous, [id]: node }));
          },
        ]),
      ) as Record<Slot, (node: HTMLElement | null) => void>,
  );
  return (
    <SettingsContext.Provider value={() => dialog.current?.showModal()}>
      <SlotsContext.Provider value={slots}>
        {children}
        <dialog
          ref={dialog}
          className="language-settings settings-screen"
          aria-labelledby="settings-title"
        >
          <header>
            <div>
              <div className="eyebrow">DiGitA</div>
              <h1 id="settings-title">{t("Settings")}</h1>
            </div>
            <button
              className="button"
              autoFocus
              aria-label={t("Close settings")}
              onClick={() => dialog.current?.close()}
            >
              <X size={18} />
              {t("Back to work")}
            </button>
          </header>
          <div ref={refs.activity} className="settings-activity" />
          <div className="settings-layout">
            <nav aria-label={t("Settings sections")}>
              {sections.map(([id, label]) => (
                <button
                  key={id}
                  className="button"
                  aria-current={section === id ? "page" : undefined}
                  onClick={() => setSection(id)}
                >
                  {t(label)}
                </button>
              ))}
            </nav>
            <div className="settings-body">
              {sections.map(([id, label]) => (
                <section
                  key={id}
                  hidden={section !== id}
                  aria-labelledby={`settings-${id}`}
                >
                  <h2 id={`settings-${id}`}>{t(label)}</h2>
                  <div ref={refs[id]} className="settings-slot" />
                  {id === "account" && (
                    <p className="settings-fallback">
                      {t(
                        "Sign in to see your account. Local Git works without an account.",
                      )}
                    </p>
                  )}
                  {id === "projects" && (
                    <p>
                      {t(
                        "Connect or switch a repository in your workspace. Projects are kept only for this session.",
                      )}
                    </p>
                  )}
                  {id === "privacy" && (
                    <>
                      <p>
                        {t(
                          "Code, diffs, absolute paths and credentials stay on this device.",
                        )}
                      </p>
                      <p>
                        {t(
                          "Sharing requires explicit consent for each room and repository. Open a room to choose shared metadata.",
                        )}
                      </p>
                    </>
                  )}
                  {id === "audio" && (
                    <p>
                      {t(
                        "Open a room to adjust personal volume and system notifications. These choices apply only to this session.",
                      )}
                    </p>
                  )}
                  {id === "language" && (
                    <>
                      <label htmlFor="language">{t("Language")}</label>
                      <select
                        id="language"
                        value={language}
                        onChange={(event) => {
                          setSaved(setLanguage(event.target.value as Language));
                          setChanged(true);
                        }}
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
                      {changed && (
                        <p role={saved ? "status" : "alert"}>
                          {t(
                            saved
                              ? "Language saved on this device."
                              : "Could not save the language. It will apply only to this app session.",
                          )}
                        </p>
                      )}
                    </>
                  )}
                  {id === "about" && (
                    <>
                      <p>
                        DiGitA {version} · {t("Development pilot")}
                      </p>
                      <p>
                        {t(
                          "Git access is read-only. Room activity resets when the server restarts or the last member leaves.",
                        )}
                      </p>
                      {onShowGuide && (
                        <button
                          className="button"
                          onClick={() => {
                            dialog.current?.close();
                            onShowGuide();
                          }}
                        >
                          {t("Quick start")}
                        </button>
                      )}
                    </>
                  )}
                </section>
              ))}
            </div>
          </div>
        </dialog>
      </SlotsContext.Provider>
    </SettingsContext.Provider>
  );
}
