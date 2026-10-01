import { canonicalMessage } from "../i18n";
import { invoke, isTauri } from "@tauri-apps/api/core";

export const API_URL = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");
const address = new URL(API_URL);
if (
  address.protocol !== "https:" &&
  !(
    address.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(address.hostname)
  )
) {
  throw new Error("The server must use HTTPS.");
}
if (address.username || address.password || address.search || address.hash)
  throw new Error("Invalid server address.");

export type User = { id: string; email: string; display_name: string };
export type Team = { id: string; name: string };
export type Room = { id: string; team_id: string; name: string };
export type Member = {
  user_id: string;
  display_name: string;
  role: "owner" | "admin" | "member";
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter = 0,
    public outcomeUnknown = false,
  ) {
    super(message);
  }
}

const safeConflictMessages = new Set([
  "The pilot has reached its capacity.",
  "An account with this email already exists.",
  "You have reached the limit for owned teams.",
  "You have reached the team membership limit.",
  "The team has reached its room limit.",
  "A room with this name already exists in the team.",
  "The team has reached its active invitation limit.",
  "The team has reached its member limit.",
  "You are already a member of this team.",
]);
function responseMessage(status: number, path: string, detail: unknown) {
  if (status === 401)
    return path === "/auth/login"
      ? "Incorrect email or password."
      : "Your session has expired. Sign in again.";
  if (status === 403)
    return path === "/auth/register"
      ? "Registration is currently closed."
      : "You do not have permission for this action. Ask a team owner or admin.";
  if (status === 404)
    return path === "/invitations/accept"
      ? "This invitation is invalid, expired, or already used. Ask for a new code."
      : "This team or room is no longer available to your account. Refresh your rooms.";
  if (status === 409) {
    const message = typeof detail === "string" ? canonicalMessage(detail) : "";
    return safeConflictMessages.has(message)
      ? message
      : "This action conflicts with the current state. Refresh and check before trying again.";
  }
  if (status === 429)
    return "Too many requests. Please wait before trying again.";
  if (status >= 500)
    return "The server is temporarily unavailable. Try again shortly.";
  return "Check the entered details.";
}
function retryDelay(response: Response) {
  if (response.status !== 429) return 0;
  const value = response.headers.get("Retry-After");
  const seconds =
    value && /^\d+$/.test(value)
      ? Number(value)
      : value
        ? Math.ceil((Date.parse(value) - Date.now()) / 1000)
        : 60;
  return Number.isFinite(seconds) ? Math.max(1, Math.min(seconds, 600)) : 60;
}

export async function api<T>(
  path: string,
  token?: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const mutation = method !== "GET";
  if (!navigator.onLine)
    throw new ApiError(0, "You are offline. Reconnect and try again.");
  const signal = AbortSignal.timeout(75000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        responseMessage(response.status, path, data?.detail),
        retryDelay(response),
        mutation && response.status >= 500,
      );
    }
    if (response.status === 204) return undefined as T;
    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError(
        0,
        "The server returned an unreadable response. Refresh and try again.",
        0,
        mutation,
      );
    }
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    throw new ApiError(
      0,
      signal.aborted
        ? "The request timed out. The server may still be waking up. Try again shortly."
        : "Cannot reach the server. Check your connection and try again.",
      0,
      mutation,
    );
  }
}
const rememberKey = `digita.remember:${API_URL}`;
export const credentials = {
  read: () =>
    isTauri() && localStorage.getItem(rememberKey) === "yes"
      ? invoke<string | null>("load_session", { server: API_URL })
      : Promise.resolve(null),
  save: async (token: string) => {
    if (isTauri()) {
      localStorage.removeItem(rememberKey);
      await invoke<void>("save_session", { server: API_URL, token });
      localStorage.setItem(rememberKey, "yes");
    }
  },
  clear: async () => {
    localStorage.removeItem(rememberKey);
    if (isTauri()) await invoke<void>("clear_session", { server: API_URL });
  },
};
