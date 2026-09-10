import { useEffect, useRef, useState } from "react";
import { readRepository, type RepositorySnapshot } from "./repository";

export function useRepository(path: string | null) {
  const [snapshot, setSnapshot] = useState<RepositorySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setSnapshot(null);
    setError(null);
    setUpdatedAt(null);
    setBusy(false);
    async function refresh() {
      if (!path || !active || inFlight) return;
      clearTimeout(timer);
      inFlight = true;
      setBusy(true);
      try {
        const next = await readRepository(path);
        if (active) {
          setSnapshot(next);
          setUpdatedAt(new Date());
          setError(null);
        }
      } catch (cause) {
        if (active) setError(String(cause));
      } finally {
        inFlight = false;
        if (active) {
          setBusy(false);
          timer = setTimeout(() => void refresh(), 2000);
        }
      }
    }
    refreshRef.current = () => void refresh();
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
      refreshRef.current = () => {};
    };
  }, [path]);

  return {
    snapshot,
    error,
    busy,
    updatedAt,
    refresh: () => refreshRef.current(),
  };
}
