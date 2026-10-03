import { useEffect, useRef, useState } from "react";
import { readRepository, type RepositorySnapshot } from "../lib/repository";

// A delayed or suspended native read must not keep sending an old Git snapshot.
export const REPOSITORY_STALE_MS = 15000;
// Shared across room/workspace remounts, with queued obsolete reads skipped.
let pendingRead: Promise<unknown> | null = null;
export function useRepository(path: string | null) {
  const [snapshot, setSnapshot] = useState<RepositorySnapshot | null>(null);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    let active = true;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    setLoadedPath(path);
    setSnapshot(null);
    setError(null);
    setUpdatedAt(null);
    setStale(false);
    setBusy(false);
    async function refresh() {
      if (!path || !active || inFlight) return;
      clearTimeout(timer);
      inFlight = true;
      setBusy(true);
      const read = pendingRead
        ? pendingRead.then(() => (active ? readRepository(path) : null))
        : readRepository(path);
      const tail = read.then(
        () => {},
        () => {},
      );
      pendingRead = tail;
      void tail.then(() => {
        if (pendingRead === tail) pendingRead = null;
      });
      try {
        const next = await read;
        if (!active || !next) return;
        if (next.statusComplete === false) {
          throw new Error(
            "The Git status is incomplete. Refresh before sharing.",
          );
        }
        setSnapshot(next);
        setUpdatedAt(new Date());
        setError(null);
        setStale(false);
        clearTimeout(expiry);
        expiry = setTimeout(() => {
          if (active) setStale(true);
        }, REPOSITORY_STALE_MS);
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setStale(true);
        }
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
      clearTimeout(expiry);
      refreshRef.current = () => {};
    };
  }, [path]);

  return {
    // A new path must never expose the previous snapshot, even before effects run.
    snapshot: loadedPath === path ? snapshot : null,
    error: loadedPath === path ? error : null,
    stale: loadedPath === path && stale,
    busy: loadedPath === path ? busy : Boolean(path),
    updatedAt: loadedPath === path ? updatedAt : null,
    refresh: () => refreshRef.current(),
  };
}
