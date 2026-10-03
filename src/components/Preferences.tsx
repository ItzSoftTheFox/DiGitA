import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import { t, useTranslation } from "../i18n";
import { SettingsContent } from "./LanguageSettings";
import {
  defaultPreferences,
  forgetProject,
  preferenceStorage,
  rememberProject,
  roomProject,
  sameRoom,
  type LocalPreferences,
  type RoomScope,
} from "../lib/preferences";

type Workspace = {
  path: string | null;
  scope?: RoomScope;
  select: (path: string | null) => void;
};
type PreferencesContextValue = {
  preferences: LocalPreferences;
  ready: boolean;
  revision: number;
  notificationsGranted: boolean;
  update: (change: (p: LocalPreferences) => LocalPreferences) => void;
  register: (workspace: Workspace) => () => void;
};
const PreferencesContext = createContext<PreferencesContextValue | null>(null);
export const usePreferences = () => useContext(PreferencesContext);
const loadFailure =
  "Could not load local preferences. Saved data is preserved. Clear project and audio preferences to allow saving again.";
const failure =
  "Could not save local preferences. Changes apply only to this app session. Try saving again.";

export function PreferencesProvider({ children }: { children: ReactNode }) {
  useTranslation();
  const [preferences, setPreferences] = useState(defaultPreferences);
  const latest = useRef(preferences);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const blockedRef = useRef(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [notificationsGranted, setNotificationsGranted] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const workspaceRef = useRef<Workspace | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const clearing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    void preferenceStorage
      .load()
      .then((saved) => {
        if (!active) return;
        latest.current = saved ?? defaultPreferences();
        setPreferences(latest.current);
      })
      .catch(() => {
        if (!active) return;
        blockedRef.current = true;
        setBlocked(true);
        setError(loadFailure);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    // Inspect permission only; restoration must never prompt the OS.
    if (isTauri())
      void isPermissionGranted()
        .then((granted) => {
          if (active) setNotificationsGranted(granted);
        })
        .catch(() => {});
    return () => {
      active = false;
      mounted.current = false;
    };
  }, []);
  const enqueue = useCallback(
    (operation: () => Promise<void>, success: string, failed: string) => {
      pending.current++;
      setSaving(true);
      const task = queue.current.then(operation);
      queue.current = task
        .then(
          () => {
            if (mounted.current) {
              setError("");
              setNotice(success);
              setSaveFailed(false);
            }
          },
          () => {
            if (mounted.current) {
              setError(failed);
              setNotice("");
              setSaveFailed(failed === failure);
            }
          },
        )
        .finally(() => {
          pending.current--;
          if (mounted.current && !pending.current) setSaving(false);
        });
      return task;
    },
    [],
  );
  const update = useCallback(
    (change: (p: LocalPreferences) => LocalPreferences) => {
      if (clearing.current) return;
      const next = change(latest.current);
      latest.current = next;
      setPreferences(next);
      if (blockedRef.current) return;
      void enqueue(
        () => preferenceStorage.save(next),
        "Preferences saved on this device.",
        failure,
      ).catch(() => {});
    },
    [enqueue],
  );
  const register = useCallback((value: Workspace) => {
    workspaceRef.current = value;
    setWorkspace(value);
    return () => {
      if (workspaceRef.current === value) {
        workspaceRef.current = null;
        setWorkspace(null);
      }
    };
  }, []);
  function choose(path: string | null) {
    if (workspaceRef.current) workspaceRef.current.select(path);
    else update((p) => ({ ...p, activeProjectPath: path }));
  }
  async function chooseFolder() {
    setPicking(true);
    const epoch = revisionRef.current;
    const initialWorkspace = workspaceRef.current;
    const initialScope = initialWorkspace?.scope;
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("Choose a Git repository"),
      });
      if (!mounted.current || epoch !== revisionRef.current) return;
      const current = workspaceRef.current;
      if (
        Boolean(initialWorkspace) !== Boolean(current) ||
        initialWorkspace?.select !== current?.select ||
        Boolean(initialScope) !== Boolean(current?.scope) ||
        (initialScope &&
          current?.scope &&
          !sameRoom(initialScope, current.scope))
      )
        return;
      if (typeof selected === "string") {
        update((p) => {
          const next = rememberProject(
            p,
            {
              path: selected,
              name: selected.split(/[\\/]/).filter(Boolean).pop() || selected,
            },
            !current?.scope,
          );
          if (
            current?.scope &&
            current.path &&
            roomProject(p, current.scope) === current.path
          ) {
            next.roomProjects = [
              { ...current.scope, path: selected },
              ...next.roomProjects.filter(
                (binding) => !sameRoom(binding, current.scope!),
              ),
            ].slice(0, 100);
          }
          return next;
        });
        choose(selected);
      }
    } catch {
      setError("Could not open the folder picker. Try again.");
    } finally {
      setPicking(false);
    }
  }
  function remove(path: string) {
    if (workspaceRef.current?.path === path) workspaceRef.current.select(null);
    update((p) => forgetProject(p, path));
  }
  async function clear() {
    if (
      !window.confirm(
        t(
          "Clear remembered projects, room folders, volume and notification preferences on this device?",
        ),
      )
    )
      return;
    clearing.current = true;
    revisionRef.current++;
    setRevision(revisionRef.current);
    setPermissionBusy(false);
    try {
      await enqueue(
        () => preferenceStorage.clear(),
        "Project and audio preferences cleared on this device.",
        "Could not clear local preferences. Saved data and current settings were kept. Try again.",
      );
      // Select before resetting so active sharing is withdrawn in the same event.
      workspaceRef.current?.select(null);
      blockedRef.current = false;
      setBlocked(false);
      latest.current = defaultPreferences();
      setPreferences(latest.current);
    } catch {
      /* enqueue provides visible feedback */
    } finally {
      clearing.current = false;
    }
  }
  async function toggleNotifications() {
    if (latest.current.notificationsEnabled && notificationsGranted) {
      update((p) => ({ ...p, notificationsEnabled: false }));
      return;
    }
    const epoch = revisionRef.current;
    setPermissionBusy(true);
    setError("");
    setSaveFailed(false);
    try {
      const granted =
        (await isPermissionGranted()) ||
        (await requestPermission()) === "granted";
      if (!mounted.current || epoch !== revisionRef.current) return;
      setNotificationsGranted(granted);
      if (granted) update((p) => ({ ...p, notificationsEnabled: true }));
      else
        setError(
          "System notifications are not allowed. Warnings remain visible in this room.",
        );
    } catch {
      if (mounted.current && epoch === revisionRef.current)
        setError(
          "System notifications are unavailable. Warnings remain visible in this room.",
        );
    } finally {
      if (mounted.current && epoch === revisionRef.current)
        setPermissionBusy(false);
    }
  }
  const bound = workspace?.scope
    ? roomProject(preferences, workspace.scope)
    : null;
  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        ready,
        revision,
        notificationsGranted,
        update,
        register,
      }}
    >
      {children}
      <SettingsContent section="activity">
        {blocked && error !== loadFailure && (
          <p className="form-error">{t(loadFailure)}</p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        {!error && notice && <p role="status">{t(notice)}</p>}
        {saving && <p role="status">{t("Saving preferences…")}</p>}
        {error && saveFailed && !blocked && (
          <button
            className="button"
            disabled={!ready || saving}
            onClick={() => update((p) => ({ ...p }))}
          >
            {t("Retry saving preferences")}
          </button>
        )}
      </SettingsContent>
      <SettingsContent section="projects">
        <p>
          {t(
            "Recent repositories and room folders are saved only on this device. Remembering a folder never enables sharing.",
          )}
        </p>
        {!isTauri() && (
          <p>
            {t(
              "Connect a local repository in the desktop app. Browser preview never reads saved folders.",
            )}
          </p>
        )}
        {isTauri() && (
          <button
            className="button"
            disabled={!ready || picking || saving}
            onClick={() => void chooseFolder()}
          >
            {t("Choose folder")}
          </button>
        )}
        <ul className="recent-projects">
          {preferences.recentProjects.map((project) => (
            <li key={project.path}>
              <div>
                <strong>{project.name}</strong>
                <code>{project.path}</code>
              </div>
              <button
                className="button"
                disabled={!ready || saving || !isTauri()}
                onClick={() => choose(project.path)}
              >
                {workspace?.path === project.path
                  ? t("Active repository")
                  : t("Open repository")}
              </button>
              <button
                className="text-button"
                disabled={!ready || saving}
                aria-label={t("Remove {name} from recent projects", {
                  name: project.name,
                })}
                onClick={() => remove(project.path)}
              >
                {t("Remove")}
              </button>
            </li>
          ))}
        </ul>
        {!preferences.recentProjects.length && (
          <p>{t("No remembered repositories yet.")}</p>
        )}
        {workspace?.scope && (
          <>
            <label className="check-label">
              <input
                type="checkbox"
                disabled={!ready || !workspace.path || saving}
                checked={Boolean(bound && bound === workspace.path)}
                onChange={(event) => {
                  const { scope, path } = workspace;
                  if (!scope || !path) return;
                  const checked = event.target.checked;
                  update((p) => ({
                    ...p,
                    roomProjects: [
                      ...(checked ? [{ ...scope, path }] : []),
                      ...p.roomProjects.filter(
                        (binding) => !sameRoom(binding, scope),
                      ),
                    ].slice(0, 100),
                  }));
                }}
              />
              {t("Remember this folder for this room")}
            </label>
            <p>
              {t(
                "This association applies only to this server, account and room. Reopening still requires fresh sharing consent.",
              )}
            </p>
          </>
        )}
        <button
          className="button"
          disabled={!ready || saving}
          onClick={() => void clear()}
        >
          {t("Clear project and audio preferences")}
        </button>
        <p>
          {t(
            "Clearing resets projects, room folders, volume and notifications. Language and sign-in are kept.",
          )}
        </p>
      </SettingsContent>
      <SettingsContent section="audio">
        <label className="ambient-volume">
          {t("My volume")}
          <input
            type="range"
            min="0"
            max="100"
            disabled={!ready}
            value={preferences.volume}
            onChange={(event) =>
              update((p) => ({ ...p, volume: Number(event.target.value) }))
            }
          />
          <span>{preferences.volume} %</span>
        </label>
        <p>
          {t(
            "Volume is saved on this device. Listening always starts with your action in the room.",
          )}
        </p>
        {isTauri() && (
          <button
            className="button"
            disabled={!ready || permissionBusy}
            onClick={() => void toggleNotifications()}
          >
            {preferences.notificationsEnabled && notificationsGranted
              ? t("Disable system notifications")
              : t("Enable system notifications")}
          </button>
        )}
        {preferences.notificationsEnabled && !notificationsGranted && (
          <p>
            {t(
              "Notifications were remembered but system permission is unavailable. Enable them to review permission.",
            )}
          </p>
        )}
      </SettingsContent>
    </PreferencesContext.Provider>
  );
}
