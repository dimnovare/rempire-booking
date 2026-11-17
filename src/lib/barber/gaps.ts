/**
 * The barber's day, worked out from the loaded data (day.ts): what is still
 * free, what comes next, the words for the hours. Pure, so the page in the
 * phone runs it too (the free time moves with the clock).
 */
import { mergeIntervals, pricedWindows, subtractIntervals, type Interval } from "../slots";
import { localParts, startOfDay, addDays } from "../tz";
import type { BBlock, BDay, BVisit } from "./day";

/** Statuses that count towards the day's visits and money. */
export const COUNTED = new Set(["pending", "booked", "arrived", "done"]);

export type Gap = { from: number; to: number; extraCents: number };

/**
 * What is still free in a day: working and special time minus visits (with
 * their tidy-up buffer) and blocked time, each piece with its special-time
 * extra. Nothing before `now` (rounded up to the step). Pieces shorter than
 * one step are left out.
 */
export function freeGaps(day: Pick<BDay, "windows" | "visits" | "blocks" | "special">, opts: { now: number; stepMin: number }): Gap[] {
  const step = opts.stepMin * 60_000;
  const busy = mergeIntervals([
    ...day.visits.filter((v) => v.status !== "cancelled").map((v) => [v.start, v.blockedUntil] as Interval),
    ...day.blocks.filter((b) => b.status !== "declined").map((b) => [b.from, b.to] as Interval),
  ]);
  const notBefore = Math.ceil(opts.now / step) * step;
  const out: Gap[] = [];
  for (const w of pricedWindows(day.windows, day.special)) {
    for (const [a, b] of subtractIntervals([[Math.max(w.from, notBefore), w.to]], busy)) {
      if (b - a >= step) out.push({ from: a, to: b, extraCents: w.extraCents });
    }
  }
  return out.sort((x, y) => x.from - y.from);
}

export type FreeStart = { start: number; extraCents: number };

/**
 * Where a visit of this length can start in these gaps: right after the
 * visit before (the gap's own start), then on the step grid. The visit and
 * its tidy-up must fit before the gap ends. A gap never spans two prices
 * (freeGaps cuts at special time), as the server's own check wants.
 */
export function startsIn(gaps: Gap[], o: { durationMin: number; bufferMin: number; stepMin: number }): FreeStart[] {
  const step = o.stepMin * 60_000;
  const need = (o.durationMin + o.bufferMin) * 60_000;
  const out: FreeStart[] = [];
  if (step <= 0 || o.durationMin <= 0) return out;
  for (const g of gaps) {
    for (let s = g.from; s + need <= g.to; s = (Math.floor(s / step) + 1) * step) out.push({ start: s, extraCents: g.extraCents });
  }
  return out;
}

/** The visit to show on top: the one in the chair now, else the next one. */
export function nextVisit(visits: BVisit[], now: number): BVisit | null {
  const live = visits.filter((v) => (v.status === "booked" || v.status === "arrived" || v.status === "pending") && v.end > now).sort((a, b) => a.start - b.start);
  return live[0] ?? null;
}

/** «10:00–14:00, 15:00–19:00»; "" for a day off. */
export function hoursText(windows: Interval[], tz: string): string {
  return windows.map(([a, b]) => `${localParts(a, tz).time}–${localParts(b, tz).time}`).join(", ");
}

/** Does this blocked time cover the whole day (a vacation, sick days)? */
export function coversDay(b: Pick<BBlock, "from" | "to">, date: string, tz: string): boolean {
  return b.from <= startOfDay(date, tz) && b.to >= startOfDay(addDays(date, 1), tz);
}
