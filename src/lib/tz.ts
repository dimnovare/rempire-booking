/**
 * Wall-clock time in a named zone, with no dependency (Intl only).
 *
 * A working hour is local: «10:00 in Europe/Tallinn». The database stores
 * moments (timestamptz). These functions convert between the two and are
 * tested on both 2026 DST days (29.03: 03:00 → 04:00; 25.10: 04:00 → 03:00).
 *
 * A local date is "YYYY-MM-DD", a local time "HH:MM".
 */

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export type LocalParts = {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  weekday: number; // ISO 1 = Monday … 7 = Sunday
  minutes: number; // minutes since local midnight
};

function partsOf(ms: number, tz: string) {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  return {
    y: Number(p.year),
    mo: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour),
    mi: Number(p.minute),
    s: Number(p.second),
    wd: WEEKDAY[p.weekday],
  };
}

/** The zone's offset from UTC at that moment, in minutes (Tallinn: +120 or +180). */
export function offsetMinutes(ms: number, tz: string): number {
  const p = partsOf(ms, tz);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** What a clock on the wall in `tz` shows at that moment. */
export function localParts(ms: number, tz: string): LocalParts {
  const p = partsOf(ms, tz);
  return {
    date: `${p.y}-${pad(p.mo)}-${pad(p.d)}`,
    time: `${pad(p.h)}:${pad(p.mi)}`,
    weekday: p.wd,
    minutes: p.h * 60 + p.mi,
  };
}

function parseDate(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Not a local date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function parseTime(time: string): [number, number] {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!m) throw new Error(`Not a local time: ${time}`);
  return [Number(m[1]), Number(m[2])];
}

/**
 * The moment a clock in `tz` shows `date time`.
 * A time that does not exist (the spring gap) moves forward by the gap;
 * a time that happens twice (the autumn hour) is the first of the two.
 */
export function zonedToUtc(date: string, time: string, tz: string): number {
  const [y, mo, d] = parseDate(date);
  const [h, mi] = parseTime(time);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Try the offsets in force just before and just after; keep the ones that
  // land on the asked wall time, earliest first.
  const offs = [offsetMinutes(wall - 86_400_000, tz), offsetMinutes(wall + 86_400_000, tz), offsetMinutes(wall, tz)];
  const hits = [...new Set(offs)]
    .map((o) => wall - o * 60_000)
    .filter((ms) => {
      const lp = localParts(ms, tz);
      return lp.date === date && lp.minutes === h * 60 + mi;
    })
    .sort((a, b) => a - b);
  if (hits.length) return hits[0];
  // In the gap: the offset before the change, read forward («03:30» → 04:30).
  return wall - Math.min(...offs) * 60_000;
}

/** Local midnight of `date` as a moment. */
export function startOfDay(date: string, tz: string): number {
  return zonedToUtc(date, "00:00", tz);
}

/** `date` plus `days` calendar days (no time zone involved). */
export function addDays(date: string, days: number): string {
  const [y, mo, d] = parseDate(date);
  const t = new Date(Date.UTC(y, mo - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** ISO weekday of a local date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const [y, mo, d] = parseDate(date);
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Today's local date in `tz`. */
export function todayIn(tz: string, now = Date.now()): string {
  return localParts(now, tz).date;
}

/** "HH:MM" or "HH:MM:SS" → minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = parseTime(time);
  return h * 60 + m;
}

export function isLocalDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return addDays(s, 0) === s; // rejects 2026-02-30
}
