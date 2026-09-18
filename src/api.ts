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
  throw new Error("Server musí používat HTTPS.");
}
if (address.username || address.password || address.search || address.hash)
  throw new Error("Neplatná adresa serveru.");

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
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  token?: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(75000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      typeof data.detail === "string"
        ? data.detail
        : "Zkontrolujte zadané údaje.",
    );
  }
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
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
