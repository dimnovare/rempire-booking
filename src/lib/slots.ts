/**
 * Free start times. Pure functions: the database loader
 * (src/lib/availability.ts) turns rows into StaffDay values, this file
 * decides what is free. The booking transaction runs the same check.
 *
 * Rules:
 *   - a start is on the step grid counted from the start of the barber's
 *     day, or right where a visit, time off, a break or a price ends
 *     (Altegio's «Оптимальный» grid, «От начала рабочего дня сотрудника»;
 *     Dim, 20.11.2026: copy Altegio's. See freeStartsPriced);
 *   - the visit [start, start + duration) fits inside one priced window:
 *     a working window (a break is the gap between two) or one of the
 *     barber's special-time windows, never across the edge of the two;
 *   - the chair time [start, start + duration + buffer) touches no other
 *     visit and no time off;
 *   - nothing starts before `notBefore` (now + minimum notice).
 * Special time (Renat, 17.11.2026) is the barber's own, higher-priced time.
 * Inside his hours it replaces the normal price; outside them it adds
 * bookable time. Where two special windows overlap, the earlier one wins.
 * A window's extra is an amount in euros or a percent of the visit's price
 * (Renat, 19.11.2026: «+50 %»); extraFor() turns it into money for one
 * visit, from that barber's price for the visit's services.
 * «Anyone» is the union over barbers; a start goes to the cheapest barber,
 * then the one with fewer visits that day, then the one listed first.
 */
import { localParts, timeToMinutes, zonedToUtc, isoWeekday } from "./tz";

/** [from, to) in epoch milliseconds. */
export type Interval = [number, number];

/**
 * What a special-time window adds to the usual price, as its owner wrote it:
 * an amount (extraCents) or a whole percent of the visit's price (extraPct).
 * One of the two, never both (014_special_time_pct.sql). No extraPct is 0:
 * rows and requests from before the percent have none.
 */
export type Extra = { extraCents: number; extraPct?: number };

/** A special-time window: [from, to) plus its extra on top of the usual price. */
export type Special = { from: number; to: number } & Extra;

/** The most a window adds: 1000 € as an amount, 300 as a percent. */
export const MAX_EXTRA_CENTS = 100_000;
export const MAX_EXTRA_PCT = 300;

/**
 * A window's extra for one visit, in cents. `baseCents` is the visit's price
 * without it: the sum of that barber's prices for the visit's services.
 */
export function extraFor(w: Extra, baseCents: number): number {
  const pct = w.extraPct ?? 0;
  return pct > 0 ? Math.round((baseCents * pct) / 100) : w.extraCents;
}

/**
 * The extra of a new window, checked: whole numbers in range, and exactly
 * one of the two above zero. null for anything else.
 */
export function cleanExtra(cents: unknown, pct: unknown): { extraCents: number; extraPct: number } | null {
  const c = cents ?? 0;
  const p = pct ?? 0;
  if (typeof c !== "number" || !Number.isInteger(c) || c < 0 || c > MAX_EXTRA_CENTS) return null;
  if (typeof p !== "number" || !Number.isInteger(p) || p < 0 || p > MAX_EXTRA_PCT) return null;
  if ((c > 0) === (p > 0)) return null;
  return { extraCents: c, extraPct: p };
}

/** Does the window add anything? (002 allowed a window at +0 €: more bookable time at the usual price.) */
export const hasExtra = (w: Extra): boolean => w.extraCents > 0 || (w.extraPct ?? 0) > 0;

/** A window's extra in words, where there is no visit yet: «+50 %» or «+20 €». The same in every language. */
export function extraText(w: Extra): string {
  if ((w.extraPct ?? 0) > 0) return `+${w.extraPct} %`;
  const e = w.extraCents / 100;
  return `+${Number.isInteger(e) ? e : e.toFixed(2)} €`;
}

export type StaffDay = {
  staffId: string;
  date: string; // local YYYY-MM-DD
  windows: Interval[];
  busy: Interval[];
  special?: Special[];
  durationMin: number; // this barber's time for the chosen services
  priceCents: number; // and his price for them: what a percent window is a percent of
  bufferMin: number;
  bookings: number; // visits already that day, for «anyone»
  sort: number;
};

export type HoursRow = { weekday: number; starts: string; ends: string; valid_from: string | null; valid_to: string | null };

const MIN = 60_000;

/** The working windows of one local date: the day override if any, else the weekly template. */
export function workWindows(date: string, tz: string, hours: HoursRow[], override?: [string, string][] | null): Interval[] {
  let spans: [string, string][];
  if (override) spans = override;
  else {
    const wd = isoWeekday(date);
    spans = hours
      .filter((h) => h.weekday === wd && (!h.valid_from || h.valid_from <= date) && (!h.valid_to || h.valid_to >= date))
      .map((h) => [h.starts, h.ends]);
  }
  const out: Interval[] = [];
  for (const [a, b] of spans) {
    if (timeToMinutes(b) <= timeToMinutes(a)) continue;
    out.push([zonedToUtc(date, a.slice(0, 5), tz), zonedToUtc(date, b.slice(0, 5), tz)]);
  }
  return mergeIntervals(out);
}

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** `list` minus `cut`, both merged and sorted. */
export function subtractIntervals(list: Interval[], cut: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [a0, b] of list) {
    let a = a0;
    for (const [c, d] of cut) {
      if (d <= a || c >= b) continue;
      if (c > a) out.push([a, c]);
      a = Math.max(a, d);
      if (a >= b) break;
    }
    if (a < b) out.push([a, b]);
  }
  return out;
}

/** A piece of the day with its extra as written (an amount or a percent); extraFor() makes it money for a visit. */
export type PricedWindow = { from: number; to: number; extraCents: number; extraPct: number };

/**
 * The day as windows with a price: working time outside special time at
 * +0, then each special window at its own extra. Touching pieces with the
 * same extra join, so a visit can run from one into the next. An amount and
 * a percent are never the same extra, whatever they come to for one visit.
 */
export function pricedWindows(windows: Interval[], special: Special[] = []): PricedWindow[] {
  const pieces: PricedWindow[] = [];
  const taken: Interval[] = [];
  for (const sp of [...special].filter((s) => s.to > s.from).sort((x, y) => x.from - y.from || x.to - y.to)) {
    for (const [from, to] of subtractIntervals([[sp.from, sp.to]], mergeIntervals(taken.map((t) => [t[0], t[1]] as Interval)))) {
      pieces.push({ from, to, extraCents: sp.extraCents, extraPct: sp.extraPct ?? 0 });
    }
    taken.push([sp.from, sp.to]);
  }
  const normal = subtractIntervals(windows, mergeIntervals(taken));
  for (const [from, to] of normal) pieces.push({ from, to, extraCents: 0, extraPct: 0 });
  pieces.sort((x, y) => x.from - y.from);
  const out: PricedWindow[] = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (last && last.to === p.from && last.extraCents === p.extraCents && last.extraPct === p.extraPct) last.to = p.to;
    else out.push({ ...p });
  }
  return out;
}

const overlaps = (a: Interval, b: Interval) => a[0] < b[1] && b[0] < a[1];

/** A free start and its special-time extra in money, for this barber's price for the chosen services. */
export type PricedStart = { start: number; extraCents: number };

/**
 * Every free start of one barber on one day, ascending, with its special-time extra.
 *
 * Altegio's «Оптимальный» grid, as REMPIRE has it set (docs/altegio-pages.md,
 * «Онлайн-запись»; the rule: alteg.io/en/support/knowledge-base/16898106582429):
 *   - the step grid, counted from the start of the barber's day: his first
 *     working window, or his first special window on a day he has no hours;
 *   - plus one start where something before it ends, so no gap is left
 *     there: a visit with its tidy-up, time off, a break (the next window's
 *     start) or a change of price (a special window's start or end). The
 *     grid starts around it stay as they are.
 * A start is never before `notBefore`, so with no notice the grid begins at
 * now rounded up to the grid, and an end-of-visit start only when it is
 * still ahead.
 */
export function freeStartsPriced(day: StaffDay, opts: { tz: string; stepMin: number; notBefore: number }): PricedStart[] {
  const { stepMin, notBefore } = opts;
  const windows = pricedWindows(day.windows, day.special);
  if (day.durationMin <= 0 || stepMin <= 0 || !windows.length) return [];
  const origin = mergeIntervals(day.windows)[0]?.[0] ?? windows[0].from;
  const step = stepMin * MIN;
  const dur = day.durationMin * MIN;
  const chair = (day.durationMin + day.bufferMin) * MIN;
  const busy = mergeIntervals(day.busy.map((b) => [b[0], b[1]] as Interval));
  const out: PricedStart[] = [];
  for (const w of windows) {
    const extraCents = extraFor(w, day.priceCents);
    const starts = new Set<number>([w.from]);
    for (let t = origin + Math.ceil((w.from - origin) / step) * step; t < w.to; t += step) starts.add(t);
    for (const [, end] of busy) if (end > w.from && end < w.to) starts.add(end);
    for (const t of [...starts].sort((a, b) => a - b)) {
      if (t < notBefore || t + dur > w.to) continue;
      const span: Interval = [t, t + chair];
      if (busy.some((b) => overlaps(span, b))) continue;
      out.push({ start: t, extraCents });
    }
  }
  return out;
}

/** Every free start of one barber on one day, ascending. */
export function freeStarts(day: StaffDay, opts: { tz: string; stepMin: number; notBefore: number }): number[] {
  return freeStartsPriced(day, opts).map((p) => p.start);
}

/**
 * One free start. staffIds best first («anyone» takes [0]); extras[i] is
 * staffIds[i]'s special-time extra in cents, worked out for his own price
 * (a percent window gives each barber another amount); extraCents is the
 * first one's.
 */
export type Slot = { start: number; staffIds: string[]; extras: number[]; extraCents: number };

/** The union of every barber's free starts. */
export function mergeSlots(days: StaffDay[], opts: { tz: string; stepMin: number; notBefore: number }): Slot[] {
  const byStart = new Map<number, { d: StaffDay; extra: number }[]>();
  for (const d of days) for (const p of freeStartsPriced(d, opts)) {
    const list = byStart.get(p.start);
    const item = { d, extra: p.extraCents };
    if (list) list.push(item);
    else byStart.set(p.start, [item]);
  }
  return [...byStart.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, list]) => {
      list.sort((a, b) => a.extra - b.extra || a.d.bookings - b.d.bookings || a.d.sort - b.d.sort || a.d.staffId.localeCompare(b.d.staffId));
      return { start, staffIds: list.map((x) => x.d.staffId), extras: list.map((x) => x.extra), extraCents: list[0].extra };
    });
}

/** Morning / day / evening, as the time screen groups them. */
export function partOfDay(ms: number, tz: string): "morning" | "day" | "evening" {
  const m = localParts(ms, tz).minutes;
  return m < 12 * 60 ? "morning" : m < 17 * 60 ? "day" : "evening";
}
