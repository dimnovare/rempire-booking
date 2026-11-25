"use client";

/**
 * The bell at the right of the sidebar's head (sidebar.tsx) and its panel,
 * as the product we follow has them (measured live 25.11.2026, read-only;
 * docs/altegio-pages.md, «Уведомления»): a button 24 × 47 with a red dot
 * while something is unread; a white panel 321px wide over the right edge
 * of the screen, top to bottom, that slides in from the right and back out,
 * with no shade over the page.
 *
 *   - first view: «Записи» and «Остальные», each with its unread count,
 *     «Прочитать все» and its newest rows in a light-blue box (an icon, the
 *     title, the time, a yellow dot while unread, an arrow), then
 *     «Показать полностью»;
 *   - «Показать полностью»: «‹ Назад», the group's title, the visits by a
 *     filter (Все, Новые, Перенесённые, Отменённые), every row with its
 *     icon in a circle, its words and its time, paged as it scrolls; on
 *     hover an unread row trades its dot for a «read» mark;
 *   - a row is read when it is clicked (it goes where the push's tap goes)
 *     or by its mark, a group by «Прочитать все»; opening reads nothing;
 *   - × or Esc closes it; a click on the page does not, nor the bell again.
 *
 * The dot is asked for when the bell mounts, every minute while the tab is
 * visible and wide enough to show the sidebar, and when the tab comes back.
 * src/lib/bell.ts has the rows.
 */
import "./bell.css";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { BellCursor, BellFilter, BellGroup, BellIcon, BellItem } from "@/lib/bell";
import { bellWhen } from "@/lib/bell-when";
import type { Copy } from "../copy";
import { useA } from "../lang";
import { bellOpenAction, bellPageAction, bellReadAction, bellStateAction, type BellOpened } from "./bell-actions";

const POLL_MS = 60_000;
/** the sidebar's own breakpoint (admin.css): a phone has none, so no bell to ask for */
const WIDE = "(min-width: 900px)";
/** as the panel's slide (bell.css), and a little more */
const CLOSE_MS = 450;
const FILTERS: BellFilter[] = ["all", "new", "moved", "cancelled"];

const shown = () => typeof window !== "undefined" && document.visibilityState === "visible" && window.matchMedia(WIDE).matches;

type Clock = { tz: string; now: number };
type View = { kind: "entry" } | { kind: "list"; group: BellGroup; filter: BellFilter };
type Paged = { items: BellItem[]; next: BellCursor | null; unread: number; loading: boolean; failed: boolean };

function stamp(A: Copy, at: string, c: Clock): string {
  const w = bellWhen(Date.parse(at), c.now, c.tz);
  return w.kind === "today" ? w.time : A.bell.day(w.day, A.bell.months[w.month], w.year);
}

function Svg({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const ICONS: Record<BellIcon, ReactNode> = {
  online: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 17.5h2" />
    </>
  ),
  new: <path d="M4 18h16M5.5 18a6.5 6.5 0 0113 0M12 8.5V6M10.5 6h3" />,
  moved: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 9.5h16M8 3v4M16 3v4M9.5 14.5h5M12.5 12.5l2 2-2 2" />
    </>
  ),
  cancelled: <path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7M10.5 11v5M13.5 11v5" />,
  plan: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 9.5h16M8 3v4M16 3v4" />
    </>
  ),
  request: <path d="M7 3.5h7l4 4v13H7zM14 3.5v4h4M9.5 12h6M9.5 15.5h6" />,
  review: <path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" />,
  answer: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12.2l2.3 2.3 4.7-4.8" />
    </>
  ),
};

export function Bell() {
  const A = useA();
  const [unread, setUnread] = useState(0);
  const [phase, setPhase] = useState<"shut" | "open" | "closing">("shut");
  const [view, setView] = useState<View>({ kind: "entry" });
  const [entry, setEntry] = useState<BellOpened | null>(null);
  const [entryFailed, setEntryFailed] = useState(false);
  const [paged, setPaged] = useState<Paged | null>(null);
  const [clock, setClock] = useState<Clock | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const panelId = useId();
  const open = phase !== "shut";

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

  const loadEntry = useCallback(() => {
    setEntryFailed(false);
    bellOpenAction().then(
      (got) => {
        if (!got) return setEntryFailed(true);
        setEntry(got);
        setClock({ tz: got.tz, now: got.now });
        setUnread(got.visits.unread + got.other.unread);
      },
      () => setEntryFailed(true),
    );
  }, []);

  const loadPage = useCallback((group: BellGroup, filter: BellFilter, after: BellCursor | null) => {
    const mine = ++seq.current;
    setPaged((p) => (after === null ? { items: [], next: null, unread: p?.unread ?? 0, loading: true, failed: false } : p && { ...p, loading: true, failed: false }));
    bellPageAction(group, filter, after).then(
      (got) => {
        if (mine !== seq.current) return;
        if (!got) return setPaged((p) => p && { ...p, loading: false, failed: true });
        setClock({ tz: got.tz, now: got.now });
        setPaged((p) => ({ items: after === null ? got.items : [...(p?.items ?? []), ...got.items], next: got.next, unread: got.unread, loading: false, failed: false }));
      },
      () => {
        if (mine === seq.current) setPaged((p) => p && { ...p, loading: false, failed: true });
      },
    );
  }, []);

  const openPanel = () => {
    // open already: the bell again changes nothing, as in the product we follow
    if (phase === "open") return;
    setPhase("open");
    if (phase === "closing") return;
    setView({ kind: "entry" });
    setPaged(null);
    loadEntry();
  };

  const close = useCallback(() => {
    setPhase((p) => (p === "open" ? "closing" : p));
    button.current?.focus();
  }, []);

  // into the panel when it opens, so the keyboard is there
  useEffect(() => {
    if (phase === "open") panel.current?.focus({ preventScroll: true });
  }, [phase]);

  // gone once it has slid out (bell.css), or a moment later if no animation runs
  useEffect(() => {
    if (phase !== "closing") return;
    const t = window.setTimeout(() => setPhase("shut"), CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  // Esc closes it; a click on the page does not
  useEffect(() => {
    if (phase !== "open") return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [phase, close]);

  // «Показать полностью»: the next page when the end of the list comes into view
  const listing = view.kind === "list" ? view : null;
  useEffect(() => {
    const el = more.current;
    if (!listing || !el || !paged?.next || paged.loading || paged.failed) return;
    const next = paged.next;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          loadPage(listing.group, listing.filter, next);
        }
      },
      { root: scroller.current, rootMargin: "0px 0px 120px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [listing, paged, loadPage]);

  /** what the panel shows of these rows, read */
  const seen = (pred: (i: BellItem) => boolean) => {
    const off = (items: BellItem[]) => items.map((i) => (i.unread && pred(i) ? { ...i, unread: false } : i));
    setEntry((e) => e && { ...e, visits: { ...e.visits, items: off(e.visits.items) }, other: { ...e.other, items: off(e.other.items) } });
    setPaged((p) => p && { ...p, items: off(p.items) });
  };

  const counts = (got: { unread: number } | null) => {
    if (got) setUnread(got.unread);
  };

  const readOne = (item: BellItem, group: BellGroup) => {
    if (!item.unread) return;
    seen((i) => i.id === item.id);
    setEntry((e) => e && { ...e, [group]: { ...e[group], unread: Math.max(0, e[group].unread - 1) } });
    setPaged((p) => p && { ...p, unread: Math.max(0, p.unread - 1) });
    setUnread((n) => Math.max(0, n - 1));
    bellReadAction({ ids: [item.id] }).then(counts, () => {});
  };

  const readAll = (group: BellGroup) => {
    const ids = new Set([...(entry?.[group].items ?? []), ...(listing?.group === group ? (paged?.items ?? []) : [])].map((i) => i.id));
    seen((i) => ids.has(i.id));
    setUnread((n) => Math.max(0, n - (entry?.[group].unread ?? 0)));
    setEntry((e) => e && { ...e, [group]: { ...e[group], unread: 0 } });
    if (listing?.group === group) setPaged((p) => p && { ...p, unread: 0, items: p.items.map((i) => ({ ...i, unread: false })) });
    bellReadAction({ group }).then(counts, () => {});
  };

  const showAll = (group: BellGroup) => {
    setView({ kind: "list", group, filter: "all" });
    setPaged({ items: [], next: null, unread: entry?.[group].unread ?? 0, loading: true, failed: false });
    loadPage(group, "all", null);
    scroller.current?.scrollTo({ top: 0 });
  };

  const pick = (filter: BellFilter) => {
    if (!listing || listing.filter === filter) return;
    setView({ ...listing, filter });
    loadPage(listing.group, filter, null);
    scroller.current?.scrollTo({ top: 0 });
  };

  const back = () => {
    setView({ kind: "entry" });
    seq.current++;
    setPaged(null);
    loadEntry();
    scroller.current?.scrollTo({ top: 0 });
  };

  const go = (item: BellItem, group: BellGroup) => {
    readOne(item, group);
    close();
  };

  const groupTitle = (g: BellGroup) => (g === "visits" ? A.bell.visits : A.bell.other);
  const when = (at: string) => (clock ? stamp(A, at, clock) : "");

  const block = (group: BellGroup) => {
    const b = entry?.[group];
    const id = `${panelId}-${group}`;
    return (
      <section key={group} className="bell-block" aria-labelledby={id}>
        <div className="bell-block-head">
          <h3 id={id}>{groupTitle(group)}</h3>
          {b && b.unread > 0 && (
            <span className="bell-count" aria-label={A.bell.unreadCount(b.unread)}>
              {A.bell.count(b.unread)}
            </span>
          )}
          {b && b.unread > 0 && (
            <button type="button" className="bell-link bell-readall" onClick={() => readAll(group)}>
              {A.bell.readAll}
            </button>
          )}
        </div>
        {!b ? (
          <p className="bell-empty">{A.loading}</p>
        ) : b.items.length === 0 ? (
          <p className="bell-empty">{A.bell.empty}</p>
        ) : (
          <>
            <ul className="bell-mini">
              {b.items.map((it) => (
                <li key={it.id}>
                  <Link href={it.url} prefetch={false} className="bell-mini-row" title={it.body} onClick={() => go(it, group)}>
                    <span className="bell-mini-ic">
                      <Svg size={16}>{ICONS[it.icon]}</Svg>
                    </span>
                    <span className="bell-mini-title">{it.title}</span>
                    <time dateTime={it.at}>{when(it.at)}</time>
                    {it.unread && (
                      <span className="bell-new">
                        <span className="bell-sr">{A.bell.unread}</span>
                      </span>
                    )}
                    <span className="bell-arrow">
                      <Svg size={16}>
                        <path d="M10 7l5 5-5 5" />
                      </Svg>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <button type="button" className="bell-link bell-all" onClick={() => showAll(group)}>
              {A.bell.showAll}
            </button>
          </>
        )}
      </section>
    );
  };

  const list = (l: { group: BellGroup; filter: BellFilter }) => {
    const items = paged?.items ?? [];
    return (
      <>
        <div className="bell-list-head">
          <h2 className="bell-h">{groupTitle(l.group)}</h2>
          {paged && paged.unread > 0 && (
            <button type="button" className="bell-link bell-readall" onClick={() => readAll(l.group)}>
              {A.bell.readAll}
            </button>
          )}
        </div>
        {l.group === "visits" && (
          <div className="bell-chips" role="group" aria-label={A.bell.filterLabel}>
            {FILTERS.map((f) => (
              <button key={f} type="button" className="bell-chip" aria-pressed={l.filter === f} onClick={() => pick(f)}>
                {A.bell.filters[f]}
              </button>
            ))}
          </div>
        )}
        {items.length > 0 && (
          <ul className="bell-rows">
            {items.map((it) => (
              <li key={it.id} className={it.unread ? "bell-item is-unread" : "bell-item"}>
                <Link href={it.url} prefetch={false} className="bell-card" onClick={() => go(it, l.group)}>
                  <span className="bell-ic">
                    <Svg size={20}>{ICONS[it.icon]}</Svg>
                  </span>
                  <span className="bell-text">
                    <span className="bell-top">
                      <b>{it.title}</b>
                      <time dateTime={it.at}>{when(it.at)}</time>
                    </span>
                    <span className="bell-msg">
                      <span>{it.body}</span>
                      {it.unread && (
                        <span className="bell-new">
                          <span className="bell-sr">{A.bell.unread}</span>
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
                {it.unread && (
                  <button type="button" className="bell-mark" aria-label={A.bell.read} title={A.bell.read} onClick={() => readOne(it, l.group)}>
                    <Svg size={16}>
                      <path d="M2.5 12.5l4 4 8-9M11.5 15.5l1 1 8-9" />
                    </Svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {paged?.failed ? (
          <p className="bell-empty" role="alert">
            {A.bell.failed}
          </p>
        ) : paged?.loading ? (
          <p className="bell-empty">{A.loading}</p>
        ) : items.length === 0 ? (
          <p className="bell-empty">{A.bell.empty}</p>
        ) : null}
        {paged?.next && <div ref={more} className="bell-more" aria-hidden="true" />}
      </>
    );
  };

  return (
    <div className="bell">
      <button
        ref={button}
        type="button"
        className="bell-btn"
        aria-label={A.bell.open(unread)}
        title={A.nav.notifications}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={openPanel}
      >
        <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" aria-hidden="true">
          <path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15zM10 20.5a2 2 0 004 0" />
        </svg>
        {unread > 0 && <span className="bell-dot" aria-hidden="true" />}
      </button>
      {open &&
        createPortal(
          <div
            id={panelId}
            ref={panel}
            tabIndex={-1}
            className={phase === "closing" ? "bell-panel is-closing" : "bell-panel"}
            role="dialog"
            aria-label={A.nav.notifications}
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget && phase === "closing") setPhase("shut");
            }}
          >
            <div className="bell-nav">
              {listing ? (
                <button type="button" className="bell-link bell-back" onClick={back}>
                  <Svg size={16}>
                    <path d="M14 7l-5 5 5 5" />
                  </Svg>
                  {A.bell.back}
                </button>
              ) : (
                <h2 className="bell-h">{A.nav.notifications}</h2>
              )}
              <button type="button" className="bell-x" aria-label={A.close} title={A.close} onClick={close}>
                <Svg size={20}>
                  <path d="M6 6l12 12M18 6L6 18" />
                </Svg>
              </button>
            </div>
            <div className="bell-scroll" ref={scroller}>
              {listing ? (
                list(listing)
              ) : entryFailed && !entry ? (
                <p className="bell-empty" role="alert">
                  {A.bell.failed}
                </p>
              ) : (
                (["visits", "other"] as const).map(block)
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
