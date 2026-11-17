/**
 * Free start times. Pure functions: the database loader
 * (src/lib/availability.ts) turns rows into StaffDay values, this file
 * decides what is free. The booking transaction runs the same check.
 *
 * Rules:
 *   - a start is on the step grid counted from local midnight;
 *   - the visit [start, start + duration) fits inside one priced window:
 *     a working window (a break is the gap between two) or one of the
 *     barber's special-time windows, never across the edge of the two;
 *   - the chair time [start, start + duration + buffer) touches no other
 *     visit and no time off;
 *   - nothing starts before `notBefore` (now + minimum notice).
 * Special time (Renat, 17.11.2026) is the barber's own, higher-priced time.
 * Inside his hours it replaces the normal price; outside them it adds
 * bookable time. Where two special windows overlap, the earlier one wins.
 * «Anyone» is the union over barbers; a start goes to the cheapest barber,
 * then the one with fewer visits that day, then the one listed first.
 */
import { localParts, startOfDay, timeToMinutes, zonedToUtc, isoWeekday } from "./tz";

/** [from, to) in epoch milliseconds. */
export type Interval = [number, number];

/** A special-time window: [from, to) plus the extra on top of the usual price. */
export type Special = { from: number; to: number; extraCents: number };

export type StaffDay = {
  staffId: string;
  date: string; // local YYYY-MM-DD
  windows: Interval[];
  busy: Interval[];
  special?: Special[];
  durationMin: number; // this barber's time for the chosen services
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

export type PricedWindow = { from: number; to: number; extraCents: number };

/**
 * The day as windows with a price: working time outside special time at
 * +0, then each special window at its own extra. Touching pieces with the
 * same extra join, so a visit can run from one into the next.
 */
export function pricedWindows(windows: Interval[], special: Special[] = []): PricedWindow[] {
  const pieces: PricedWindow[] = [];
  const taken: Interval[] = [];
  for (const sp of [...special].filter((s) => s.to > s.from).sort((x, y) => x.from - y.from || x.to - y.to)) {
    for (const [from, to] of subtractIntervals([[sp.from, sp.to]], mergeIntervals(taken.map((t) => [t[0], t[1]] as Interval)))) {
      pieces.push({ from, to, extraCents: sp.extraCents });
    }
    taken.push([sp.from, sp.to]);
  }
  const normal = subtractIntervals(windows, mergeIntervals(taken));
  for (const [from, to] of normal) pieces.push({ from, to, extraCents: 0 });
  pieces.sort((x, y) => x.from - y.from);
  const out: PricedWindow[] = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (last && last.to === p.from && last.extraCents === p.extraCents) last.to = p.to;
    else out.push({ ...p });
  }
  return out;
}

const overlaps = (a: Interval, b: Interval) => a[0] < b[1] && b[0] < a[1];

export type PricedStart = { start: number; extraCents: number };

/** Every free start of one barber on one day, ascending, with its special-time extra. */
export function freeStartsPriced(day: StaffDay, opts: { tz: string; stepMin: number; notBefore: number }): PricedStart[] {
  const { stepMin, notBefore } = opts;
  const windows = pricedWindows(day.windows, day.special);
  if (day.durationMin <= 0 || !windows.length) return [];
  const midnight = startOfDay(day.date, opts.tz);
  const step = stepMin * MIN;
  const dur = day.durationMin * MIN;
  const chair = (day.durationMin + day.bufferMin) * MIN;
  const busy = mergeIntervals(day.busy.map((b) => [b[0], b[1]] as Interval));
  const out: PricedStart[] = [];
  for (const w of windows) {
    let t = midnight + Math.ceil((Math.max(w.from, notBefore) - midnight) / step) * step;
    for (; t + dur <= w.to; t += step) {
      const span: Interval = [t, t + chair];
      const hit = busy.find((b) => overlaps(span, b));
      if (hit) {
        // jump past this visit, back onto the grid
        t = midnight + Math.ceil((hit[1] - midnight) / step) * step - step;
        continue;
      }
      out.push({ start: t, extraCents: w.extraCents });
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
 * staffIds[i]'s special-time extra; extraCents is the first one's.
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
