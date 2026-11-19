/**
 * «График работы»: the rules of the month grid of shifts that need no
 * database (the owner, 19.11.2026; docs/altegio-pages.md, «График работы»),
 * so the server, the page in the browser and the tests share them.
 *
 * **A day on the grid is the day booking sees.** `effectiveDay` is the
 * dated override if there is one, else the weekly hours (`workWindows`),
 * with the barber's time off taken out (`subtractIntervals`): the two
 * functions online booking itself runs (src/lib/slots.ts,
 * src/lib/availability.ts), not a second set of rules. A gap between two
 * pieces of the day is a break, whatever made it: two spans of hours, or a
 * block in the calendar.
 *
 * Hours are wall-clock spans («10:00»–«19:00») of the salon's own day, as
 * the overrides are stored: a shift on the day the clocks change is the
 * same shift, never an hour off.
 */
import { mergeIntervals, subtractIntervals, workWindows, type HoursRow, type Interval } from "../slots";
import { addDays, isLocalDate, isoWeekday, localParts, startOfDay, timeToMinutes } from "../tz";

/** What a day is on the grid. */
export const DAY_KINDS = ["work", "off", "vacation", "sick"] as const;
export type DayKind = (typeof DAY_KINDS)[number];
export const isDayKind = (v: unknown): v is DayKind => typeof v === "string" && (DAY_KINDS as readonly string[]).includes(v);

/** A piece of a day by the wall clock: «10:00»–«14:00»; an end may be «24:00». */
export type Span = [string, string];

/** Breaks in one day, at most (a day holds six spans: src/lib/admin/staff.ts, cleanSpans). */
export const BREAKS_MAX = 5;
/** The longest period a template fills, in days. */
export const PERIOD_MAX_DAYS = 186;
/** «По сменам»: so many days on, so many off, each at most. */
export const SHIFT_RUN_MAX = 31;

/**
 * The working time of one local day, as booking has it: the day's override
 * if there is one, else the weekly hours, less every piece of time off.
 * `off` is the barber's time off as moments (any kind that is not declined).
 */
export function effectiveDay(date: string, tz: string, hours: HoursRow[], override: Span[] | null | undefined, off: Interval[]): Interval[] {
  return subtractIntervals(workWindows(date, tz, hours, override), mergeIntervals(off.map(([a, b]) => [a, b] as Interval)));
}

const pad = (n: number) => String(n).padStart(2, "0");
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutesOf = (t: string) => (t === "24:00" ? 1440 : timeToMinutes(t));
const isTime = (t: unknown, end = false): t is string => typeof t === "string" && (TIME_RE.test(t) || (end && t === "24:00"));

/** Working windows of `date` back as wall-clock spans; a window that runs to midnight ends at «24:00». */
export function localSpans(windows: Interval[], date: string, tz: string): Span[] {
  const next = startOfDay(addDays(date, 1), tz);
  return windows.map(([a, b]) => [localParts(a, tz).time, b >= next ? "24:00" : localParts(b, tz).time]);
}

/** How long the spans are together, in minutes by the wall clock. */
export const spanMinutes = (spans: readonly Span[]) => spans.reduce((n, [a, b]) => n + Math.max(0, minutesOf(b) - minutesOf(a)), 0);

/**
 * A working day as the panel has it (from, to, and the breaks inside) as
 * the spans to store: the day with each break cut out. Null when a time is
 * none, the day ends before it starts, or a break is outside the day, back
 * to front or over another one.
 */
export function daySpans(from: unknown, to: unknown, breaks: unknown): Span[] | null {
  if (!isTime(from) || !isTime(to, true) || minutesOf(to) <= minutesOf(from)) return null;
  if (!Array.isArray(breaks) || breaks.length > BREAKS_MAX) return null;
  const cuts: Span[] = [];
  for (const b of breaks) {
    if (!Array.isArray(b) || b.length !== 2 || !isTime(b[0]) || !isTime(b[1])) return null;
    if (minutesOf(b[1]) <= minutesOf(b[0]) || minutesOf(b[0]) < minutesOf(from) || minutesOf(b[1]) > minutesOf(to)) return null;
    cuts.push([b[0], b[1]]);
  }
  cuts.sort((x, y) => minutesOf(x[0]) - minutesOf(y[0]));
  const out: Span[] = [];
  let at = from;
  for (const [a, b] of cuts) {
    if (minutesOf(a) < minutesOf(at)) return null;
    if (minutesOf(a) > minutesOf(at)) out.push([at, a]);
    at = b;
  }
  if (minutesOf(to) > minutesOf(at)) out.push([at, to]);
  return out.length ? out : null;
}

/** Stored spans back as the panel shows them: the day's start and end, and the gaps between as breaks. */
export function panelOf(spans: readonly Span[]): { from: string; to: string; breaks: Span[] } | null {
  if (!spans.length) return null;
  const breaks: Span[] = [];
  for (let i = 1; i < spans.length; i++) breaks.push([spans[i - 1][1], spans[i][0]]);
  return { from: spans[0][0], to: spans[spans.length - 1][1], breaks };
}

/** How many minutes of [a, b) lie inside the windows. */
function covered([a, b]: Interval, windows: Interval[]): number {
  let n = 0;
  for (const [x, y] of windows) n += Math.max(0, Math.min(b, y) - Math.max(a, x));
  return n;
}

/**
 * The visits a change of hours would cut: those that sit in working time
 * now and would have less of it under them afterwards. A visit booked
 * outside the hours on purpose loses nothing, whatever the hours become.
 */
export function cutVisits(visits: Interval[], before: Interval[], after: Interval[]): number {
  return visits.filter((v) => covered(v, after) < covered(v, before)).length;
}

/** Every day from `from` to `to`, both in. Null: not two days in order, or more than `max` of them. */
export function daysBetween(from: unknown, to: unknown, max = PERIOD_MAX_DAYS): string[] | null {
  if (!isLocalDate(from) || !isLocalDate(to) || from > to) return null;
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push(d);
    if (out.length > max) return null;
  }
  return out;
}

/** «По дням недели»: the days of the period that fall on a ticked weekday (ISO: 1 Monday … 7 Sunday). */
export function weekdayDays(dates: readonly string[], weekdays: readonly number[]): string[] {
  const on = new Set(weekdays);
  return dates.filter((d) => on.has(isoWeekday(d)));
}

/**
 * «По сменам»: `on` days of work, then `off` days free, over and over from
 * the period's first day. Each day says whether it is a working one.
 */
export function shiftDays(dates: readonly string[], on: number, off: number): { date: string; work: boolean }[] {
  const cycle = on + off;
  return dates.map((date, i) => ({ date, work: i % cycle < on }));
}

/* ---------- the grid's own dates ---------- */

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const isMonthKey = (v: unknown): v is string => typeof v === "string" && MONTH.test(v);

/** Every day of a month («2026-11»), the 1st first. */
export function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
}

/** The seven days of the week `date` is in, Monday first. */
export function weekDays(date: string): string[] {
  const monday = addDays(date, 1 - isoWeekday(date));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** The first day of the month `by` months from the one `date` is in. */
export function monthStart(date: string, by = 0): string {
  const [y, m] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`;
}

/** The last day of the month after the one `today` is in: as far as a copy may reach. */
export function endOfNextMonth(today: string): string {
  return addDays(monthStart(today, 2), -1);
}

/** «Скопировать график» starts with the next two weeks. */
export const COPY_DAYS = 14;

/** A barber's days in `dates` together: his shifts and how long they are, for «Итого». */
export function totalsOf(cells: Record<string, { kind: string; minutes: number } | undefined>, dates: readonly string[]): { shifts: number; minutes: number } {
  let shifts = 0;
  let minutes = 0;
  for (const d of dates) {
    const c = cells[d];
    if (c?.kind !== "work") continue;
    shifts++;
    minutes += c.minutes;
  }
  return { shifts, minutes };
}
