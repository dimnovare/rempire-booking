/**
 * How full each day of a month is, for the mini month in the admin's
 * sidebar (docs/reference-looks.md, «Sidebar and tiles»): the minutes booked
 * that day over the minutes the barbers work that day.
 *
 *   - booked: every visit that is not cancelled, from its start to its end
 *     (the cleaning time after it is not counted);
 *   - the barbers' minutes: each working barber's hours that day (the day's
 *     own hours if it has them, else the weekly ones: the same rule as the
 *     calendar, workWindows), less his time off: a vacation, a sick day, a
 *     break;
 *   - a day nobody works has no load at all.
 *
 * The ring's colour: green under 50 %, yellow from 50 %, red from 75 %.
 *
 * One query for the whole grid, the weeks that hold the month, Monday first.
 */
import type { Business } from "../availability";
import type { Querier } from "../db";
import { mergeIntervals, subtractIntervals, workWindows, type HoursRow, type Interval } from "../slots";
import { addDays, isoWeekday, startOfDay } from "../tz";

export type Band = "green" | "yellow" | "red";

export type DayLoad = {
  date: string;
  /** what the barbers work that day, in minutes */
  shiftMin: number;
  bookedMin: number;
  /** 0–100, or null on a day nobody works */
  pct: number | null;
  band: Band | null;
};

export type MonthLoad = {
  /** YYYY-MM */
  month: string;
  /** the weeks that hold the month, Monday first: 28, 35 or 42 days */
  days: DayLoad[];
};

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const isMonth = (v: unknown): v is string => typeof v === "string" && MONTH.test(v) && Number(v.slice(0, 4)) >= 2000 && Number(v.slice(0, 4)) <= 2100;

/** `month` plus `by` months. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The days the mini month shows: from the Monday of the 1st's week to the Sunday of the last day's week. */
export function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const from = addDays(first, 1 - isoWeekday(first));
  const to = addDays(last, 7 - isoWeekday(last));
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * The load of one day. Null on a day nobody works. A visit on such a day
 * (booked by hand outside every shift) makes it a full day, so it is never
 * taken for a free one.
 * The colour goes by the exact share, so 74.6 % is still yellow though the
 * ring is drawn at 75.
 */
export function dayLoad(bookedMin: number, shiftMin: number): { pct: number; band: Band } | null {
  const booked = Math.max(0, bookedMin);
  if (shiftMin <= 0) return booked > 0 ? { pct: 100, band: "red" } : null;
  const pct = Math.min(100, Math.round((booked * 100) / shiftMin));
  const band: Band = booked * 100 >= shiftMin * 75 ? "red" : booked * 100 >= shiftMin * 50 ? "yellow" : "green";
  return { pct, band };
}

type Loaded = {
  hours: (HoursRow & { staff: string })[];
  overrides: { staff: string; day: string; intervals: [string, string][] }[];
  off: { staff: string; from: number; to: number }[];
  booked: { day: string; min: number }[];
};

const MIN = 60_000;

export async function monthLoad(q: Querier, business: Business, month: string): Promise<MonthLoad> {
  const tz = business.timezone;
  const dates = monthGrid(month);
  const from = dates[0];
  const to = dates[dates.length - 1];
  const [row] = await q<Loaded>(
    `select
       (select coalesce(json_agg(json_build_object(
                 'staff', h.staff_id, 'weekday', h.weekday,
                 'starts', to_char(h.starts, 'HH24:MI'), 'ends', to_char(h.ends, 'HH24:MI'),
                 'valid_from', h.valid_from::text, 'valid_to', h.valid_to::text)), '[]'::json)
          from staff_hours h join staff s on s.id = h.staff_id
         where s.business_id = $1 and s.active) as hours,
       (select coalesce(json_agg(json_build_object('staff', o.staff_id, 'day', o.day::text, 'intervals', o.intervals)), '[]'::json)
          from staff_day_overrides o join staff s on s.id = o.staff_id
         where s.business_id = $1 and s.active and o.day between $2::date and $3::date) as overrides,
       (select coalesce(json_agg(json_build_object(
                 'staff', t.staff_id,
                 'from', floor(extract(epoch from t.starts_at) * 1000)::bigint,
                 'to', floor(extract(epoch from t.ends_at) * 1000)::bigint)), '[]'::json)
          from time_off t join staff s on s.id = t.staff_id
         where s.business_id = $1 and s.active and t.status <> 'declined' and t.starts_at < $5 and t.ends_at > $4) as off,
       (select coalesce(json_agg(json_build_object('day', b.day, 'min', b.min)), '[]'::json)
          from (select to_char(a.starts_at at time zone $6::text, 'YYYY-MM-DD') as day,
                       (sum(extract(epoch from (a.ends_at - a.starts_at))) / 60)::int as min
                  from appointments a
                 where a.business_id = $1 and a.status <> 'cancelled' and a.starts_at >= $4 and a.starts_at < $5
                 group by 1) b) as booked`,
    [business.id, from, to, new Date(startOfDay(from, tz)), new Date(startOfDay(addDays(to, 1), tz)), tz],
  );

  const staff = [...new Set([...row.hours.map((h) => h.staff), ...row.overrides.map((o) => o.staff)])];
  const hoursOf = new Map(staff.map((id) => [id, row.hours.filter((h) => h.staff === id)]));
  // merged and sorted: two blocks may overlap
  const offOf = new Map(staff.map((id) => [id, mergeIntervals(row.off.filter((t) => t.staff === id).map((t) => [Number(t.from), Number(t.to)] as Interval))]));
  const booked = new Map(row.booked.map((b) => [b.day, Number(b.min)]));

  const days = dates.map((date): DayLoad => {
    let shiftMin = 0;
    for (const id of staff) {
      const ov = row.overrides.find((o) => o.staff === id && o.day === date);
      const work = workWindows(date, tz, hoursOf.get(id) ?? [], ov ? ov.intervals : null);
      if (!work.length) continue;
      for (const [a, b] of subtractIntervals(work, offOf.get(id) ?? [])) shiftMin += Math.round((b - a) / MIN);
    }
    const bookedMin = booked.get(date) ?? 0;
    const load = dayLoad(bookedMin, shiftMin);
    return { date, shiftMin, bookedMin, pct: load ? load.pct : null, band: load ? load.band : null };
  });
  return { month, days };
}
