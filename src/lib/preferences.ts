import { invoke, isTauri } from "@tauri-apps/api/core";

export type Project = { path: string; name: string };
export type RoomScope = { server: string; accountId: string; roomId: string };
export type RoomProject = RoomScope & { path: string };
export type LocalPreferences = {
  version: 2;
  recentProjects: Project[];
  activeProjectPath: string | null;
  roomProjects: RoomProject[];
  notificationsEnabled: boolean;
};
export const defaultPreferences = (): LocalPreferences => ({
  version: 2,
  recentProjects: [],
  activeProjectPath: null,
  roomProjects: [],
  notificationsEnabled: false,
});
export const preferencesKey = "digita.preferences.v1";
export function canonicalServer(server: string) {
  const url = new URL(server);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
  ) {
    throw new Error("Invalid preference server.");
  }
  return url.toString().replace(/\/+$/, "");
}
const textValid = (value: unknown, limit: number): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  !/[\u0000-\u001f\u007f-\u009f]/.test(value) &&
  new TextEncoder().encode(value).length <= limit;
const exactKeys = (value: object, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
export function validatePreferences(value: unknown): LocalPreferences {
  const invalid = () => {
    throw new Error("Invalid local preferences.");
  };
  // Upgrade only a valid legacy payload; never silently accept extra fields.
  if (
    value &&
    typeof value === "object" &&
    "version" in value &&
    value.version === 1
  ) {
    const legacy = value as Record<string, unknown>;
    if (
      !Number.isInteger(legacy.volume) ||
      (legacy.volume as number) < 0 ||
      (legacy.volume as number) > 100
    )
      return invalid();
    const { volume: _removed, ...rest } = legacy;
    value = { ...rest, version: 2 };
  }
  if (
    !value ||
    typeof value !== "object" ||
    !exactKeys(value, [
      "version",
      "recentProjects",
      "activeProjectPath",
      "roomProjects",
      "notificationsEnabled",
    ])
  )
    return invalid();
  if (
    new TextEncoder().encode(JSON.stringify(value, null, 2)).length >
    1024 * 1024
  )
    return invalid();
  const p = value as LocalPreferences;
  if (
    p.version !== 2 ||
    !Array.isArray(p.recentProjects) ||
    p.recentProjects.length > 20 ||
    !Array.isArray(p.roomProjects) ||
    p.roomProjects.length > 100 ||
    typeof p.notificationsEnabled !== "boolean"
  )
    return invalid();
  const paths = new Set<string>();
  for (const project of p.recentProjects) {
    if (
      !project ||
      typeof project !== "object" ||
      !exactKeys(project, ["path", "name"]) ||
      !textValid(project.path, 4096) ||
      !textValid(project.name, 255) ||
      paths.has(project.path)
    )
      return invalid();
    paths.add(project.path);
  }
  if (p.activeProjectPath !== null && !paths.has(p.activeProjectPath))
    return invalid();
  const scopes = new Set<string>();
  for (const binding of p.roomProjects) {
    if (
      !binding ||
      typeof binding !== "object" ||
      !exactKeys(binding, ["server", "accountId", "roomId", "path"]) ||
      !textValid(binding.server, 2048) ||
      !textValid(binding.accountId, 128) ||
      !textValid(binding.roomId, 128) ||
      !paths.has(binding.path)
    )
      return invalid();
    try {
      if (canonicalServer(binding.server) !== binding.server) return invalid();
    } catch {
      return invalid();
    }
    const scope = JSON.stringify([
      binding.server,
      binding.accountId,
      binding.roomId,
    ]);
    if (scopes.has(scope)) return invalid();
    scopes.add(scope);
  }
  // Copy only the permitted fields; credentials and consent have no place here.
  return {
    version: 2,
    recentProjects: p.recentProjects.map(({ path, name }) => ({ path, name })),
    activeProjectPath: p.activeProjectPath,
    roomProjects: p.roomProjects.map(({ server, accountId, roomId, path }) => ({
      server,
      accountId,
      roomId,
      path,
    })),
    notificationsEnabled: p.notificationsEnabled,
  };
}
export const sameRoom = (a: RoomScope, b: RoomScope) =>
  a.server === b.server && a.accountId === b.accountId && a.roomId === b.roomId;
export const roomProject = (preferences: LocalPreferences, scope: RoomScope) =>
  preferences.roomProjects.find((binding) => sameRoom(binding, scope))?.path ??
  null;
export function rememberProject(
  preferences: LocalPreferences,
  project: Project,
  activate: boolean,
): LocalPreferences {
  const recentProjects = [
    project,
    ...preferences.recentProjects.filter((p) => p.path !== project.path),
  ].slice(0, 20);
  const paths = new Set(recentProjects.map((p) => p.path));
  return {
    ...preferences,
    recentProjects,
    activeProjectPath: activate
      ? project.path
      : paths.has(preferences.activeProjectPath ?? "")
        ? preferences.activeProjectPath
        : null,
    roomProjects: preferences.roomProjects.filter((p) => paths.has(p.path)),
  };
}
export function forgetProject(
  preferences: LocalPreferences,
  path: string,
): LocalPreferences {
  return {
    ...preferences,
    recentProjects: preferences.recentProjects.filter((p) => p.path !== path),
    activeProjectPath:
      preferences.activeProjectPath === path
        ? null
        : preferences.activeProjectPath,
    roomProjects: preferences.roomProjects.filter((p) => p.path !== path),
  };
}
export const preferenceStorage = {
  async load(): Promise<LocalPreferences | null> {
    const value = isTauri()
      ? await invoke<unknown>("load_preferences")
      : (() => {
          const raw = localStorage.getItem(preferencesKey);
          return raw === null ? null : JSON.parse(raw);
        })();
    return value === null ? null : validatePreferences(value);
  },
  async save(preferences: LocalPreferences) {
    const safe = validatePreferences(preferences);
    if (isTauri())
      await invoke<void>("save_preferences", { preferences: safe });
    else localStorage.setItem(preferencesKey, JSON.stringify(safe));
  },
  async clear() {
    if (isTauri()) await invoke<void>("clear_preferences");
    else localStorage.removeItem(preferencesKey);
  },
};
