import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Settings, X } from "lucide-react";
import { setLanguage, t, useTranslation, type Language } from "../i18n";
import { version } from "../../package.json";

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
type DraftGuard = { dirty: boolean; busy: boolean; discard: () => void };
const NavigationContext = createContext<{
  navigate: (action: () => void) => void;
  register: (guard: DraftGuard) => void;
} | null>(null);
export function useSettingsNavigation() {
  const context = useContext(NavigationContext);
  return context?.navigate ?? ((action: () => void) => action());
}
export function useSettingsDraft(
  dirty: boolean,
  busy: boolean,
  discard: () => void,
) {
  const context = useContext(NavigationContext);
  useEffect(() => {
    if (!context) return;
    context.register({ dirty, busy, discard });
    return () => {
      context.register({ dirty: false, busy: false, discard: () => {} });
    };
  }, [context, dirty, busy, discard]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || busy) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
}

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
  const discardDialog = useRef<HTMLDialogElement>(null);
  const guard = useRef<DraftGuard>({
    dirty: false,
    busy: false,
    discard: () => {},
  });
  const [guardBusy, setGuardBusy] = useState(false);
  const register = useCallback((next: DraftGuard) => {
    guard.current = next;
    setGuardBusy(next.busy);
  }, []);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const [confirming, setConfirming] = useState(false);
  const navigate = useCallback((action: () => void) => {
    if (guard.current.dirty || guard.current.busy) {
      pendingNavigation.current = action;
      setConfirming(true);
    } else action();
  }, []);
  const [navigation] = useState(() => ({ navigate, register }));
  useEffect(() => {
    if (confirming) discardDialog.current?.showModal();
    else discardDialog.current?.close();
  }, [confirming]);
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
    <NavigationContext.Provider value={navigation}>
      <SettingsContext.Provider value={() => dialog.current?.showModal()}>
        <SlotsContext.Provider value={slots}>
          {children}
          <dialog
            ref={dialog}
            className="language-settings settings-screen"
            aria-labelledby="settings-title"
            onCancel={(event) => {
              event.preventDefault();
              navigate(() => dialog.current?.close());
            }}
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
                onClick={() => navigate(() => dialog.current?.close())}
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
                    onClick={() => {
                      if (id !== section) navigate(() => setSection(id));
                    }}
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
                          "Manage remembered repositories and optional room folders on this device.",
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
                          "Personal volume and notification preferences apply across rooms. Listening and sharing require your action.",
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
                            setSaved(
                              setLanguage(event.target.value as Language),
                            );
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
                              navigate(() => {
                                dialog.current?.close();
                                onShowGuide();
                              });
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
          <dialog
            ref={discardDialog}
            className="language-settings discard-profile-dialog"
            aria-labelledby="discard-profile-title"
            onCancel={(event) => {
              event.preventDefault();
              setConfirming(false);
              pendingNavigation.current = null;
            }}
          >
            <h2 id="discard-profile-title">{t("Discard profile changes?")}</h2>
            <p>
              {t(
                "Your profile has unsaved changes. Keep editing or discard them before leaving.",
              )}
            </p>
            <div className="dashboard-actions">
              <button
                autoFocus
                className="button"
                onClick={() => {
                  setConfirming(false);
                  pendingNavigation.current = null;
                }}
              >
                {t("Keep editing")}
              </button>
              <button
                className="button"
                disabled={guardBusy}
                onClick={() => {
                  guard.current.discard();
                  const action = pendingNavigation.current;
                  pendingNavigation.current = null;
                  setConfirming(false);
                  action?.();
                }}
              >
                {t("Discard")}
              </button>
            </div>
          </dialog>
        </SlotsContext.Provider>
      </SettingsContext.Provider>
    </NavigationContext.Provider>
  );
}
