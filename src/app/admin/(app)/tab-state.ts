"use client";

/**
 * A choice kept for the browser tab (sessionStorage): the journal's status
 * filter, its scale and its right panel. It outlives the calendar's own
 * state, which starts anew with every day; a new tab starts with the
 * defaults, as the sidebar's mode does (sidebar.tsx).
 *
 * The server and the first draw in the browser use `fallback`; what the tab
 * kept comes right after, so the two never disagree while React takes the
 * page over.
 */
import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
// private mode, or storage turned off: the choice lasts until the page is left
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const kept = window.sessionStorage.getItem(key);
    if (kept != null) return kept;
  } catch {
    /* fall through to what this page remembers */
  }
  return memory.get(key) ?? null;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useTabState(key: string, fallback: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key) ?? fallback,
    () => fallback,
  );
  const set = useCallback(
    (next: string) => {
      try {
        window.sessionStorage.setItem(key, next);
      } catch {
        memory.set(key, next);
      }
      for (const cb of listeners) cb();
    },
    [key],
  );
  return [value, set];
}
