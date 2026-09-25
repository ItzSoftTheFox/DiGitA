import { useEffect, useState } from "react";
import { ApiError } from "./api";

export const slowRequestMessage =
  "This is taking longer than usual. The server may be waking up. You can keep working in local mode.";

export function errorMessage(cause: unknown): string {
  if (cause instanceof ApiError) return cause.message;
  // Unknown errors may contain server internals or submitted values.
  return "Could not complete the request. Check your connection and try again.";
}

export function useSlowRequest(pending: boolean) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!pending) return;
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [pending]);
  return pending && slow;
}

export function useRetryDelay(error: unknown) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const delay = error instanceof ApiError ? error.retryAfter : 0;
    setSeconds(delay);
    if (!delay) return;
    const deadline = Date.now() + delay * 1000;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(remaining);
      if (!remaining) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [error]);
  return seconds;
}

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
