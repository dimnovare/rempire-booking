"use client";

/**
 * The journal's grid, one for the salon's journal (calendar.tsx) and the
 * barber's «Мой день» (src/app/b/(app)/day-view.tsx, board MyDay-Grid): the
 * time down the side, a column for each barber (or day), the working hours
 * white on grey, special time, breaks and time off, the visits as cards in
 * their colours (src/lib/admin/journal.ts, visitLook), the clock line. Also
 * the phone's dark bar (the date with a ▾) and its floating week strip.
 *
 * Every place on it is in minutes (--t from the top, --m long) and the styles
 * make them pixels (--ppm), so nothing here knows how wide the screen is.
 * What a visit, a block or a special window says inside is the caller's
 * (render props); what a tap does too.
 *
 * Two things live here because they follow the mouse on the grid itself:
 *   - the bar «12:00 Новый сеанс» on free time under the mouse (`slotLabel`),
 *     snapped to `step`, the line the grid shows at its scale;
 *   - a visit's card on hover (`card`), beside the visit, after a short wait;
 *     it stays while the mouse crosses over to it, and opens for the
 *     keyboard too. It sits right after its visit, so Tab goes into it.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { hhmm, minutesInDay, snap } from "@/lib/admin/grid";
import { visitLook } from "@/lib/admin/journal";
import type { Interval } from "@/lib/slots";
import { CaretIcon } from "../icons";
import "./journal-extras.css";

export const MIN = 60_000;

/** A place on the grid: `t` minutes from its top, `m` minutes long. */
export const at = (t: number, m?: number): CSSProperties => {
  const place: Record<string, number> = m == null ? { "--t": t } : { "--t": t, "--m": m };
  return place;
};

/** The minute of the day under a point of a column, whatever the scale: read from the column's own height. */
export function minuteAt(el: HTMLElement, clientY: number, lo: number, hi: number): number {
  const r = el.getBoundingClientRect();
  return lo + ((clientY - r.top) / r.height) * (hi - lo);
}

export type GridCol = { key: string; staffId: string; date: string };
export type GridVisit = { id: string; staffId: string; start: number; end: number; status: string; source: string; extraCents: number };
export type GridBlock = { id: string; staffId: string; from: number; to: number; kind: string };
export type GridSpecial = { id: string; staffId: string; from: number; to: number };

/** The card's room beside a visit: its width and the gap the mouse crosses (the board: 376px). */
const CARD_W = 376;
const CARD_GAP = 8;
const SHOW_MS = 250;
const SWITCH_MS = 80;
const HIDE_MS = 200;

export type GridProps<V extends GridVisit, K extends GridBlock, S extends GridSpecial> = {
  cols: GridCol[];
  /** the minutes of the day shown, from `lo` to `hi` */
  lo: number;
  hi: number;
  tz: string;
  today: string;
  now: number;
  work: (c: GridCol) => Interval[];
  visits: V[];
  blocks: K[];
  special: S[];
  /** a visit shorter than this many minutes is drawn on one line */
  shortMin: number;
  /** the minutes a click and the bar snap to */
  step: number;
  /** the heads row (a barber's head, a day's); none: no heads row */
  head?: (c: GridCol) => ReactNode;
  /** the journal from 900px: the time on both sides too */
  wideParts?: boolean;
  className?: string;
  style?: CSSProperties;
  scrollRef?: Ref<HTMLDivElement>;
  /** a column marked as the login's own (data-mine) */
  mineId?: string | null;
  /** the columns take a tap as the new time of a visit being moved */
  target?: boolean;
  visitClass?: (v: V) => string;
  visitLabel: (v: V) => string;
  visitBody: (v: V) => ReactNode;
  blockBody: (b: K) => ReactNode;
  /** a tap on a block; none: a block is only drawn */
  onBlock?: (b: K) => void;
  specialBody: (s: S) => ReactNode;
  onColumn?: (c: GridCol, e: React.MouseEvent<HTMLDivElement>) => void;
  onVisit: (v: V, e: React.MouseEvent<HTMLButtonElement>) => void;
  onVisitDown?: (v: V, e: React.PointerEvent<HTMLButtonElement>) => void;
  /** a visit being dragged: where it would land */
  ghost?: { col: string; min: number; len: number } | null;
  /** «Новый сеанс»: the bar under the mouse on free time; none: no bar */
  slotLabel?: string | null;
  /** a bar that stays (the barber's new visit while its sheet is open) */
  mark?: { col: string; min: number; body: ReactNode } | null;
  /** more for a column: the barber's free time */
  colExtra?: (c: GridCol) => ReactNode;
  /** a visit's card on hover; none: no card */
  card?: ((v: V, close: () => void) => ReactNode) | null;
};

type CardAt = { id: string; rect: DOMRect };

export function JournalGrid<V extends GridVisit, K extends GridBlock, S extends GridSpecial>(p: GridProps<V, K, S>) {
  const { cols, lo, hi, tz, today, now, step } = p;
  const total = hi - lo;
  const minOf = (ms: number, d: string) => minutesInDay(ms, d, tz) - lo;
  const [slot, setSlot] = useState<{ col: string; min: number } | null>(null);
  const [card, setCard] = useState<CardAt | null>(null);
  const showT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardOn = !!p.card;

  const clear = () => {
    if (showT.current) clearTimeout(showT.current);
    if (hideT.current) clearTimeout(hideT.current);
    showT.current = hideT.current = null;
  };
  const close = useCallback(() => {
    if (showT.current) clearTimeout(showT.current);
    if (hideT.current) clearTimeout(hideT.current);
    showT.current = hideT.current = null;
    setCard(null);
  }, []);
  const hideSoon = () => {
    if (showT.current) clearTimeout(showT.current);
    showT.current = null;
    if (!hideT.current) hideT.current = setTimeout(close, HIDE_MS);
  };
  const keep = () => {
    if (hideT.current) clearTimeout(hideT.current);
    hideT.current = null;
  };
  const want = (id: string, el: HTMLElement) => {
    keep();
    if (card?.id === id) return;
    if (showT.current) clearTimeout(showT.current);
    showT.current = setTimeout(() => setCard({ id, rect: el.getBoundingClientRect() }), card ? SWITCH_MS : SHOW_MS);
  };

  // no card without its render, or once the visit is gone; any scroll moves the visit away from it
  useEffect(() => {
    if (!cardOn) close();
  }, [cardOn, close]);
  useEffect(() => {
    if (!card) return;
    const off = () => close();
    window.addEventListener("scroll", off, true);
    window.addEventListener("resize", off);
    return () => {
      window.removeEventListener("scroll", off, true);
      window.removeEventListener("resize", off);
    };
  }, [card, close]);
  useEffect(() => clear, []);
  // the keyboard opens a card when Tab brings it to a visit; the focus a closed window gives back opens none
  const tabbed = useRef(false);
  useEffect(() => {
    if (!cardOn) return;
    const key = (e: KeyboardEvent) => {
      tabbed.current = e.key === "Tab";
    };
    const down = () => {
      tabbed.current = false;
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", down, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerdown", down, true);
    };
  }, [cardOn]);

  const halves: number[] = [];
  for (let m = lo; m < hi; m += 30) halves.push(m);
  /** The journal's time marks from 900px: the hour large with a small «00», the half hour a small grey «30». */
  const marks = p.wideParts
    ? halves.map((m) =>
        m % 60 === 0 ? (
          <span key={m} className="jr-tick" style={at(m - lo)}>
            <b>{m / 60}</b>
            <i>00</i>
          </span>
        ) : (
          <span key={m} className="jr-tick is-half" style={at(m - lo)}>
            <i>30</i>
          </span>
        ),
      )
    : null;
  const nowMin = minutesInDay(now, today, tz);
  const nowOn = cols.some((c) => c.date === today) && nowMin >= lo && nowMin <= hi;

  const onMove = (c: GridCol, e: React.PointerEvent<HTMLDivElement>) => {
    if (!p.slotLabel || e.pointerType !== "mouse") return;
    if ((e.target as HTMLElement).closest("[data-item], [data-card]")) return setSlot(null);
    const m = snap(minuteAt(e.currentTarget, e.clientY, lo, hi), step);
    if (m < lo || m + step > hi) return setSlot(null);
    if (slot?.col !== c.key || slot.min !== m) setSlot({ col: c.key, min: m });
  };

  return (
    <div className="cal-scroll" ref={p.scrollRef}>
      {/* data-from, data-to: the hours shown, as minutes of the day */}
      <div
        className={`cal-grid${p.head ? "" : " no-heads"}${p.className ? ` ${p.className}` : ""}`}
        data-from={lo}
        data-to={hi}
        style={{ "--cols": cols.length, "--span": total, "--off": (60 - (lo % 60)) % 60, ...p.style } as CSSProperties}
      >
        {p.head && (
          <>
            <div className="cal-corner" />
            {cols.map((c) => p.head!(c))}
            {p.wideParts && <div className="cal-corner cal-corner-r only-wide" />}
          </>
        )}

        <div className="cal-gutter">
          {halves
            .filter((m) => m % 60 === 0)
            .map((m) => (
              <span key={m} className={`cal-tick${m === lo ? " is-first" : ""}`} style={at(m - lo)}>
                {hhmm(m)}
              </span>
            ))}
          {marks}
          {nowOn && (
            <span className="cal-nowtag" style={at(nowMin - lo)}>
              {hhmm(nowMin)}
            </span>
          )}
        </div>
        {cols.map((c) => (
          <div
            key={c.key}
            className={`cal-col${p.target ? " is-target" : ""}`}
            data-col={c.key}
            data-date={c.date}
            data-mine={c.staffId === p.mineId ? "" : undefined}
            onClick={p.onColumn ? (e) => p.onColumn!(c, e) : undefined}
            onPointerMove={p.slotLabel ? (e) => onMove(c, e) : undefined}
            onPointerLeave={p.slotLabel ? () => setSlot(null) : undefined}
          >
            {p.work(c).map(([a, b], i) => (
              <div key={`w${i}`} className="cal-work" style={at(minOf(a, c.date), (b - a) / MIN)} />
            ))}
            {p.special
              .filter((x) => x.staffId === c.staffId)
              .map((x) => {
                const top = Math.max(0, minOf(x.from, c.date));
                const bottom = Math.min(total, minOf(x.to, c.date));
                if (bottom <= 0 || top >= total) return null;
                return (
                  <div key={x.id} className="cal-sp" style={at(top, bottom - top)}>
                    {p.specialBody(x)}
                  </div>
                );
              })}
            {p.colExtra?.(c)}
            {p.blocks
              .filter((b) => b.staffId === c.staffId)
              .map((b) => {
                const top = Math.max(0, minOf(b.from, c.date));
                const bottom = Math.min(total, minOf(b.to, c.date));
                if (bottom <= 0 || top >= total) return null;
                const cls = `cal-off k-${b.kind}`;
                return p.onBlock ? (
                  <button
                    key={b.id}
                    type="button"
                    data-item
                    className={cls}
                    style={at(top, bottom - top)}
                    onClick={(e) => {
                      e.stopPropagation();
                      p.onBlock!(b);
                    }}
                  >
                    {p.blockBody(b)}
                  </button>
                ) : (
                  <div key={b.id} data-item className={cls} style={at(top, bottom - top)}>
                    {p.blockBody(b)}
                  </div>
                );
              })}
            {p.visits
              .filter((v) => v.staffId === c.staffId)
              .map((v) => {
                const top = minOf(v.start, c.date);
                const m = (v.end - v.start) / MIN;
                if (top + m <= 0 || top >= total) return null;
                const look = visitLookOf(v);
                const running = v.status !== "no_show" && v.start <= now && now < v.end;
                const cls = ["cal-v", `st-${v.status}`, `src-${v.source}`, `by-${look.maker}`, `k-${look.state}`, running ? "is-now" : "", v.extraCents ? "is-sp" : "", m < p.shortMin ? "is-short" : "", p.visitClass?.(v) ?? ""];
                return (
                  <VisitAndCard key={v.id} open={card?.id === v.id && !!p.card} rect={card?.id === v.id ? card.rect : null} onKeep={keep} onLeave={hideSoon} onClose={close} card={p.card ? () => p.card!(v, close) : null}>
                    <button
                      type="button"
                      data-item
                      className={cls.filter(Boolean).join(" ")}
                      // the strip by who made it, the body and the name by its state (src/lib/admin/journal.ts)
                      style={{ ...at(top, m), "--h": look.strip, "--b": look.body, "--n": look.name } as CSSProperties}
                      aria-label={p.visitLabel(v)}
                      onPointerEnter={
                        cardOn
                          ? (e) => {
                              // a mouse: a finger has no hover (its pointerType is «touch»)
                              if (e.pointerType === "mouse") want(v.id, e.currentTarget);
                            }
                          : undefined
                      }
                      onPointerLeave={
                        cardOn
                          ? (e) => {
                              if (e.pointerType === "mouse") hideSoon();
                            }
                          : undefined
                      }
                      onPointerDown={(e) => {
                        if (cardOn) close();
                        p.onVisitDown?.(v, e);
                      }}
                      onFocus={
                        cardOn
                          ? (e) => {
                              // Tab: at once; a click focuses too, and opens the visit instead
                              if (!tabbed.current) return;
                              keep();
                              setCard({ id: v.id, rect: e.currentTarget.getBoundingClientRect() });
                            }
                          : undefined
                      }
                      onBlur={
                        cardOn
                          ? (e) => {
                              const into = e.currentTarget.parentElement?.querySelector("[data-card]")?.contains(e.relatedTarget as Node | null);
                              if (!into && card?.id === v.id) close();
                            }
                          : undefined
                      }
                      onKeyDown={
                        cardOn
                          ? (e) => {
                              if (e.key !== "Escape" || card?.id !== v.id) return;
                              e.stopPropagation();
                              close();
                            }
                          : undefined
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        if (cardOn) close();
                        p.onVisit(v, e);
                      }}
                    >
                      {p.visitBody(v)}
                    </button>
                  </VisitAndCard>
                );
              })}
            {p.ghost?.col === c.key && (
              <div className="cal-ghost" style={at(p.ghost.min - lo, p.ghost.len)}>
                {hhmm(p.ghost.min)}
              </div>
            )}
            {slot?.col === c.key && p.slotLabel && (
              <div className="jr-slot" style={at(slot.min - lo, step)} aria-hidden="true">
                <b>{hhmm(slot.min)}</b> {p.slotLabel}
              </div>
            )}
            {p.mark?.col === c.key && (
              <div className="jr-slot is-mark" style={at(p.mark.min - lo)} aria-hidden="true">
                {p.mark.body}
              </div>
            )}
            {c.date === today && nowOn && <div className="cal-now" style={at(nowMin - lo)} />}
          </div>
        ))}
        {p.wideParts && <div className="cal-gutter cal-gutter-r only-wide">{marks}</div>}
      </div>
    </div>
  );
}

/** The colours by who made it and its state. */
const visitLookOf = (v: GridVisit) => visitLook(v.status, v.source);

/**
 * A visit, and its card while it is open: fixed beside the visit, on the
 * right where it fits, else on the left, with a clear band towards the visit
 * that the mouse crosses without the card closing. Clicks inside it stay in
 * it (the column under it would book a new visit).
 */
function VisitAndCard({
  open,
  rect,
  card,
  onKeep,
  onLeave,
  onClose,
  children,
}: {
  open: boolean;
  rect: DOMRect | null;
  card: (() => ReactNode) | null;
  onKeep: () => void;
  onLeave: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // the mouse is on the card: a click on its text takes the focus away, and that does not close it
  const over = useRef(false);
  const [top, setTop] = useState<number | null>(null);
  const right = rect ? rect.right + CARD_GAP + CARD_W <= window.innerWidth - 8 : true;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el || !rect) return setTop(null);
    const h = el.getBoundingClientRect().height;
    setTop(Math.max(8, Math.min(rect.top, window.innerHeight - h - 8)));
  }, [open, rect]);
  return (
    <>
      {children}
      {open && rect && card && (
        <div
          ref={ref}
          data-card
          className={`jr-card-wrap${right ? " is-right" : " is-left"}`}
          style={{ left: right ? rect.right : Math.max(8, rect.left - CARD_GAP - CARD_W), top: top ?? rect.top, visibility: top == null ? "hidden" : undefined }}
          onPointerEnter={() => {
            over.current = true;
            onKeep();
          }}
          onPointerLeave={(e) => {
            over.current = false;
            if (e.pointerType === "mouse") onLeave();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            (ref.current?.previousElementSibling as HTMLElement | null)?.focus();
            onClose();
          }}
          onBlur={(e) => {
            const to = e.relatedTarget as Node | null;
            if (to ? ref.current?.contains(to) || ref.current?.previousElementSibling?.contains(to) : over.current) return;
            onClose();
          }}
        >
          {card()}
        </div>
      )}
    </>
  );
}

/* ---------- a phone's dark bar and its week strip ---------- */

/**
 * A phone's bar, as the app we follow (Dim, 20.11.2026, option D): the date
 * with a ▾ in the dark bar on top, which it lies over (a date input under
 * the words), «Сегодня» when today is not in view, and what the page puts
 * on the right («День | Неделя»).
 */
export function PhoneBar({
  title,
  titleShort,
  date,
  pickLabel,
  onPick,
  today,
  className,
  children,
}: {
  title: string;
  titleShort: string;
  date: string;
  pickLabel: string;
  onPick: (date: string) => void;
  /** «Сегодня»: its words and what it does; none when today is one tap away already */
  today: { label: string; go: () => void } | null;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`cal-bar${className ? ` ${className}` : ""}`}>
      <label className="cal-title">
        <span className="is-long">{title}</span>
        <span className="is-short">{titleShort}</span>
        <CaretIcon />
        <input type="date" value={date} aria-label={pickLabel} onChange={(e) => e.target.value && onPick(e.target.value)} />
      </label>
      {today && (
        <button type="button" className="cal-today" onClick={today.go}>
          {today.label}
        </button>
      )}
      {children}
    </div>
  );
}

/**
 * The week of the day shown, floating at the bottom above the tabs; a swipe
 * sideways is the week before or after (`onSwipe`, -1 or 1).
 */
export function WeekStrip({
  days,
  date,
  today,
  label,
  dayName,
  dayLabel,
  onPick,
  onSwipe,
  className,
}: {
  days: string[];
  date: string;
  today: string;
  label: string;
  /** «Пн» */
  dayName: (d: string, i: number) => string;
  /** «Пятница, 20 ноября», for a screen reader */
  dayLabel: (d: string) => string;
  onPick: (d: string) => void;
  onSwipe: (by: -1 | 1) => void;
  className?: string;
}) {
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  return (
    <nav
      className={`cal-strip${className ? ` ${className}` : ""}`}
      aria-label={label}
      onPointerDown={(e) => {
        swipe.current = { x: e.clientX, y: e.clientY };
        swiped.current = false;
      }}
      onPointerUp={(e) => {
        const s = swipe.current;
        swipe.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(e.clientY - s.y) * 1.5) return;
        swiped.current = true;
        onSwipe(dx < 0 ? 1 : -1);
      }}
      onPointerCancel={() => (swipe.current = null)}
      // the tap that ends a swipe is not a day's
      onClickCapture={(e) => {
        if (!swiped.current) return;
        swiped.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {days.map((d, i) => (
        <button key={d} type="button" className={`${d === today ? "is-today" : ""}${i >= 5 ? " is-end" : ""}`.trim() || undefined} aria-pressed={d === date} aria-label={dayLabel(d)} onClick={() => d !== date && onPick(d)}>
          <span>{dayName(d, i)}</span>
          <b>{Number(d.slice(8))}</b>
        </button>
      ))}
    </nav>
  );
}
