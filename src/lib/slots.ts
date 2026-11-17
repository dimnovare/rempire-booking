/**
 * Free start times. Pure functions: the database loader
 * (src/lib/availability.ts) turns rows into StaffDay values, this file
 * decides what is free. The booking transaction runs the same check.
 *
 * Rules:
 *   - a start is on the step grid counted from local midnight;
 *   - the visit [start, start + duration) fits inside one working window
 *     (a break is the gap between two windows);
 *   - the chair time [start, start + duration + buffer) touches no other
 *     visit and no time off;
 *   - nothing starts before `notBefore` (now + minimum notice).
 * «Anyone» is the union over barbers; a start goes to the barber with fewer
 * visits that day, then the one listed first.
 */
import { localParts, startOfDay, timeToMinutes, zonedToUtc, isoWeekday } from "./tz";

/** [from, to) in epoch milliseconds. */
export type Interval = [number, number];

export type StaffDay = {
  staffId: string;
  date: string; // local YYYY-MM-DD
  windows: Interval[];
  busy: Interval[];
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

const overlaps = (a: Interval, b: Interval) => a[0] < b[1] && b[0] < a[1];

/** Every free start of one barber on one day, ascending. */
export function freeStarts(day: StaffDay, opts: { tz: string; stepMin: number; notBefore: number }): number[] {
  const { stepMin, notBefore } = opts;
  if (day.durationMin <= 0 || !day.windows.length) return [];
  const midnight = startOfDay(day.date, opts.tz);
  const step = stepMin * MIN;
  const dur = day.durationMin * MIN;
  const chair = (day.durationMin + day.bufferMin) * MIN;
  const busy = mergeIntervals(day.busy.map((b) => [b[0], b[1]] as Interval));
  const out: number[] = [];
  for (const [ws, we] of day.windows) {
    let t = midnight + Math.ceil((Math.max(ws, notBefore) - midnight) / step) * step;
    for (; t + dur <= we; t += step) {
      const span: Interval = [t, t + chair];
      const hit = busy.find((b) => overlaps(span, b));
      if (hit) {
        // jump past this visit, back onto the grid
        t = midnight + Math.ceil((hit[1] - midnight) / step) * step - step;
        continue;
      }
      out.push(t);
    }
  }
  return out;
}

export type Slot = { start: number; staffIds: string[] };

/** The union of every barber's free starts; staffIds best first («anyone» takes [0]). */
export function mergeSlots(days: StaffDay[], opts: { tz: string; stepMin: number; notBefore: number }): Slot[] {
  const byStart = new Map<number, StaffDay[]>();
  for (const d of days) for (const t of freeStarts(d, opts)) {
    const list = byStart.get(t);
    if (list) list.push(d);
    else byStart.set(t, [d]);
  }
  return [...byStart.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, list]) => ({
      start,
      staffIds: list.sort((a, b) => a.bookings - b.bookings || a.sort - b.sort || a.staffId.localeCompare(b.staffId)).map((d) => d.staffId),
    }));
}

/** Morning / day / evening, as the time screen groups them. */
export function partOfDay(ms: number, tz: string): "morning" | "day" | "evening" {
  const m = localParts(ms, tz).minutes;
  return m < 12 * 60 ? "morning" : m < 17 * 60 ? "day" : "evening";
}
