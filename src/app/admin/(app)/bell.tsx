"use client";

/**
 * The bell at the right of the sidebar's head (sidebar.tsx), as the product
 * we follow has one (docs/altegio-pages.md, «Sidebar»: a button 24 × 47, a
 * red dot when something is unread). It lists what the staff pushes say,
 * for this login, with a phone or without one (src/lib/bell.ts,
 * 046_bell.sql): newest first, each row a link to where the push's tap
 * goes. Opening it marks everything read, so the dot goes.
 *
 * It asks for the dot when it mounts, every minute while the tab is
 * visible and wide enough to show the sidebar, and when the tab comes
 * back; the rows when it opens. Esc, a click outside or leaving it with
 * Tab closes it.
 */
import "./bell.css";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { bellWhen } from "@/lib/bell-when";
import type { Copy } from "../copy";
import { useA } from "../lang";
import { bellOpenAction, bellStateAction, type BellOpened } from "./bell-actions";

const POLL_MS = 60_000;
/** the sidebar's own breakpoint (admin.css): a phone has none, so no bell to ask for */
const WIDE = "(min-width: 900px)";

const shown = () => typeof window !== "undefined" && document.visibilityState === "visible" && window.matchMedia(WIDE).matches;

function whenText(A: Copy, at: string, now: number, tz: string): string {
  const w = bellWhen(Date.parse(at), now, tz);
  switch (w.kind) {
    case "now":
      return A.bell.now;
    case "min":
      return A.bell.min(w.n);
    case "today":
      return A.bell.today(w.time);
    case "yesterday":
      return A.bell.yesterday(w.time);
    default:
      return A.bell.day(w.date, w.time);
  }
}

export function Bell() {
  const A = useA();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<BellOpened | null>(null);
  const [state, setState] = useState<"idle" | "wait" | "failed">("idle");
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const ask = useCallback(() => {
    if (!shown()) return;
    bellStateAction().then(
      (s) => {
        if (s) setUnread(s.unread);
      },
      () => {},
    );
  }, []);

  // the dot: now, every minute, and when the tab is looked at again
  useEffect(() => {
    ask();
    const timer = window.setInterval(ask, POLL_MS);
    document.addEventListener("visibilitychange", ask);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", ask);
    };
  }, [ask]);

  const close = useCallback((focusBack: boolean) => {
    setOpen(false);
    // what it showed has been read: opened again, it shows so until the new list comes
    setList((l) => (l ? { ...l, items: l.items.map((i) => (i.unread ? { ...i, unread: false } : i)) } : l));
    if (focusBack) button.current?.focus();
  }, []);

  // Esc and a click outside close it
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, close]);

  const toggle = () => {
    if (open) return close(false);
    setOpen(true);
    setState("wait");
    bellOpenAction().then(
      (got) => {
        if (!got) return setState("failed");
        setList(got);
        // what it shows is read now
        setUnread(0);
        setState("idle");
      },
      () => setState("failed"),
    );
  };

  const items = list?.items ?? [];
  return (
    <div
      className="bell"
      ref={root}
      onBlur={(e) => {
        // Tab past the last row: the panel goes
        if (open && e.relatedTarget && !root.current?.contains(e.relatedTarget as Node)) close(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className="bell-btn"
        aria-label={A.bell.open(unread)}
        title={A.nav.notifications}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" aria-hidden="true">
          <path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15zM10 20.5a2 2 0 004 0" />
        </svg>
        {unread > 0 && <span className="bell-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div id={panelId} className="bell-pop" role="dialog" aria-label={A.nav.notifications}>
          <h2 className="bell-title">{A.nav.notifications}</h2>
          {state === "failed" ? (
            <p className="bell-note" role="alert">
              {A.bell.failed}
            </p>
          ) : state === "wait" && !list ? (
            <p className="bell-note">{A.loading}</p>
          ) : items.length === 0 ? (
            <p className="bell-empty">{A.bell.empty}</p>
          ) : (
            <ul className="bell-list" aria-busy={state === "wait"}>
              {items.map((it) => (
                <li key={it.id}>
                  <Link href={it.url} prefetch={false} className={it.unread ? "bell-row is-unread" : "bell-row"} onClick={() => close(false)}>
                    <span className="bell-head">
                      <b>{it.title}</b>
                      {it.unread && (
                        <span className="bell-new">
                          <span className="bell-sr">{A.bell.unread}</span>
                        </span>
                      )}
                    </span>
                    <span className="bell-body">{it.body}</span>
                    <time dateTime={it.at}>{whenText(A, it.at, list!.now, list!.tz)}</time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
