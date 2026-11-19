"use client";

/**
 * A choice kept for the browser tab (sessionStorage): the journal's status
 * filter, its scale, its right panel and «Мой день | Весь салон». It
 * outlives the calendar's own state, which starts anew with every day; a
 * new tab starts with the defaults, as the sidebar's mode does
 * (sidebar.tsx).
 *
 * The server and the first draw in the browser use `fallback`; what the tab
 * kept comes right after, so the two never disagree while React takes the
 * page over.
 */
import { useCallback, useSyncExternalStore } from "react";
import { MINE_COOKIE } from "@/lib/auth/side";

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

/** «Мой день | Весь салон» of the journal, for the tab: "1" his day, "0" the whole salon (calendar.tsx). */
export const MINE_KEY = "adm-jr-mine";

/**
 * …and for the device (docs/apps.md, «One app for Renat»): a new tab opens
 * the journal the way it was left. A cookie, so that the server draws the
 * page right the first time (src/app/admin/(app)/page.tsx reads it). It
 * says nothing about anyone: «his day» or «the whole salon».
 */
export function rememberMine(on: boolean): void {
  try {
    document.cookie = `${MINE_COOKIE}=${on ? "1" : "0"}; path=/; max-age=${400 * 86_400}; samesite=lax${window.location.protocol === "https:" ? "; secure" : ""}`;
  } catch {
    /* cookies turned off: the tab still has its choice */
  }
}

const WIDE = "(min-width: 900px)";

function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/**
 * Is the screen wide (from 900px, where the sidebar and the journal's own
 * bar are)? The server and the first draw say no; almost everything about
 * the width is the styles' business, and this is only for what they cannot
 * do: which columns the journal works with.
 */
export function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}
