/**
 * Calendar grid maths, shared by the server and the browser (no database,
 * no Node): which hours the grid shows, snapping a tap to the 15-minute
 * step, the week around a date. Times of day are minutes since local
 * midnight in the business's time zone (src/lib/tz.ts).
 */
import { addDays, isoWeekday, localParts, startOfDay, zonedToUtc } from "../tz";

/** The Monday of the week `date` is in. */
export function weekStart(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** Minutes since local midnight of `date` (may run past 24 h or below 0 for other days). */
export function minutesInDay(msValue: number, date: string, tz: string): number {
  return Math.round((msValue - startOfDay(date, tz)) / 60_000);
}

/** The moment at `minutes` after local midnight of `date`, read as a wall clock. */
export function momentAt(date: string, minutes: number, tz: string): number {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return zonedToUtc(date, hhmm(m), tz);
}

export function hhmm(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function snap(minutes: number, step = 15): number {
  return Math.floor(minutes / step) * step;
}

type Span = { from: number; to: number };

/**
 * The hours the grid shows: 09:00–21:00, widened to whole hours around every
 * working window, visit, block and special window of those days.
 */
export function gridBounds(dates: string[], tz: string, spans: Span[], base: [number, number] = [9 * 60, 21 * 60]): [number, number] {
  let lo = base[0];
  let hi = base[1];
  for (const date of dates) {
    const day0 = startOfDay(date, tz);
    const day1 = startOfDay(addDays(date, 1), tz);
    for (const s of spans) {
      if (s.to <= day0 || s.from >= day1) continue;
      const a = Math.max(0, Math.round((Math.max(s.from, day0) - day0) / 60_000));
      const b = Math.min(24 * 60, Math.round((Math.min(s.to, day1) - day0) / 60_000));
      lo = Math.min(lo, Math.floor(a / 60) * 60);
      hi = Math.max(hi, Math.ceil(b / 60) * 60);
    }
  }
  return [Math.max(0, lo), Math.min(24 * 60, hi)];
}

/** Is [from, to) inside one of the windows? */
export function inside(from: number, to: number, windows: [number, number][]): boolean {
  return windows.some(([a, b]) => from >= a && to <= b);
}

/** Do two half-open spans overlap? */
export const overlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/** The local date of a moment. */
export const dateOf = (msValue: number, tz: string) => localParts(msValue, tz).date;
