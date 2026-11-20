/**
 * The barber's day, worked out from the loaded data (day.ts): what is still
 * free, what comes next, the words for the hours. Pure, so the page in the
 * phone runs it too (the free time moves with the clock).
 */
import { extraFor, mergeIntervals, pricedWindows, subtractIntervals, type Interval } from "../slots";
import { localParts, startOfDay, addDays } from "../tz";
import type { BBlock, BDay, BVisit } from "./day";

/** Statuses that count towards the day's visits and money. */
export const COUNTED = new Set(["pending", "booked", "arrived", "done"]);

/**
 * A free piece of the day with its special-time extra as written: an amount
 * (extraCents) or a percent (extraPct). No visit yet, so a percent is still
 * a percent here; startsIn() makes it money for one visit.
 */
export type Gap = {
  from: number;
  to: number;
  extraCents: number;
  extraPct?: number;
  /** where the day's step grid starts (its first working window), for startsIn; none: the clock's */
  grid?: number;
};

/** Free pieces shorter than this are left out: a sliver between two visits is no free time. */
const MIN_GAP_MIN = 15;

/**
 * What is still free in a day: working and special time minus visits (with
 * their tidy-up buffer) and blocked time, each piece with its special-time
 * extra. Nothing before `now`: a piece already running starts at the next
 * point of the day's grid, which counts from his first working window
 * (his first special one on a day without hours), as the clients' times do
 * (src/lib/slots.ts, Altegio's «Оптимальный»); a piece that starts later
 * starts where it starts, right after a visit or at a window. Pieces
 * shorter than MIN_GAP_MIN are left out.
 */
export function freeGaps(day: Pick<BDay, "windows" | "visits" | "blocks" | "special">, opts: { now: number; stepMin: number }): Gap[] {
  const step = opts.stepMin * 60_000;
  const busy = mergeIntervals([
    ...day.visits.filter((v) => v.status !== "cancelled").map((v) => [v.start, v.blockedUntil] as Interval),
    ...day.blocks.filter((b) => b.status !== "declined").map((b) => [b.from, b.to] as Interval),
  ]);
  const windows = pricedWindows(day.windows, day.special);
  const grid = mergeIntervals(day.windows)[0]?.[0] ?? windows[0]?.from ?? 0;
  const onGrid = (t: number) => (step > 0 ? grid + Math.ceil((t - grid) / step) * step : t);
  const out: Gap[] = [];
  for (const w of windows) {
    for (const [from, to] of subtractIntervals([[w.from, w.to]], busy)) {
      const a = from < opts.now ? onGrid(opts.now) : from;
      if (to - a >= MIN_GAP_MIN * 60_000) out.push({ from: a, to, extraCents: w.extraCents, extraPct: w.extraPct, grid });
    }
  }
  return out.sort((x, y) => x.from - y.from);
}

/** A free start for one visit, with its special-time extra in money. */
export type FreeStart = { start: number; extraCents: number };

/**
 * Where a visit of this length can start in these gaps: right after the
 * visit before (the gap's own start), then on the step grid, counted from
 * the gap's `grid` (the day's start; the clock's when it has none). The visit and
 * its tidy-up must fit before the gap ends. A gap never spans two prices
 * (freeGaps cuts at special time), as the server's own check wants.
 * `baseCents` is the visit's price without the extra (its services at his
 * prices): a gap priced in percent adds that percent of it, as the server
 * does when the visit is booked or moved (src/lib/admin/visits.ts).
 */
export function startsIn(gaps: Gap[], o: { durationMin: number; bufferMin: number; stepMin: number; baseCents: number }): FreeStart[] {
  const step = o.stepMin * 60_000;
  const need = (o.durationMin + o.bufferMin) * 60_000;
  const out: FreeStart[] = [];
  if (step <= 0 || o.durationMin <= 0) return out;
  for (const g of gaps) {
    const extraCents = extraFor(g, o.baseCents);
    const grid = g.grid ?? 0;
    for (let s = g.from; s + need <= g.to; s = grid + (Math.floor((s - grid) / step) + 1) * step) out.push({ start: s, extraCents });
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
