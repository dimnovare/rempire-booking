/**
 * Rows → free slots. Loads one business's barbers, hours, day overrides,
 * visits, time off, special time and online hours for a range of local
 * days, then runs src/lib/slots.ts.
 * Every caller is the client's own booking (the booking page, «Любой», the
 * booking itself, the client's move), so the online hours a day may have
 * («Изменить время для онлайн-записи», 043) always apply here. The salon's
 * bookings (src/lib/admin/visits.ts, src/lib/barber/book.ts) do not come
 * here and are not limited by them.
 * Takes a Querier, so the booking transaction can run the same check
 * inside its lock.
 */
import type { Querier } from "./db";
import { readSettings, type BusinessSettings } from "./settings";
import { mergeSlots, workWindows, type HoursRow, type Interval, type Slot, type Special, type StaffDay } from "./slots";
import { addDays, localParts, startOfDay } from "./tz";

export type Business = {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  default_locale: string;
  settings: BusinessSettings;
};

export async function getBusiness(q: Querier, slug: string): Promise<Business | null> {
  const [row] = await q<Omit<Business, "settings"> & { settings: unknown }>(
    "select id, slug, name, timezone, default_locale, settings from businesses where slug = $1",
    [slug],
  );
  return row ? { ...row, settings: readSettings(row.settings) } : null;
}

export async function getBusinessById(q: Querier, id: string): Promise<Business | null> {
  const [row] = await q<Omit<Business, "settings"> & { settings: unknown }>(
    "select id, slug, name, timezone, default_locale, settings from businesses where id = $1",
    [id],
  );
  return row ? { ...row, settings: readSettings(row.settings) } : null;
}

/** One barber's terms for the chosen services. */
export type StaffQuote = {
  staffId: string;
  locationId: string;
  sort: number;
  durationMin: number;
  bufferMin: number;
  priceCents: number;
  /** his «График до» (042): the last local day he is offered online; null = no limit of his own */
  scheduleUntil: string | null;
};

/** Barbers who do every one of `serviceIds`, with their own time and price. */
export async function quoteStaff(q: Querier, businessId: string, serviceIds: string[], staffId?: string | null): Promise<StaffQuote[]> {
  const ids = [...new Set(serviceIds)];
  if (!ids.length) return [];
  const rows = await q<{ id: string; location_id: string; sort: number; duration_min: number; buffer_min: number; price_cents: number; schedule_until: string | null }>(
    `select s.id, s.location_id, s.sort, s.schedule_until::text as schedule_until,
            sum(coalesce(ss.duration_min, sv.duration_min))::int as duration_min,
            max(sv.buffer_after_min)::int as buffer_min,
            sum(coalesce(ss.price_cents, sv.price_cents))::int as price_cents
       from staff s
       join staff_services ss on ss.staff_id = s.id and ss.active
       join services sv on sv.id = ss.service_id and sv.active and sv.online
      where s.business_id = $1 and s.active and s.bookable
        and sv.business_id = $1 and sv.id = any($2::uuid[])
        and ($3::uuid is null or s.id = $3::uuid)
      group by s.id
     having count(*) = $4
      order by s.sort, s.id`,
    [businessId, ids, staffId ?? null, ids.length],
  );
  return rows.map((r) => ({
    staffId: r.id,
    locationId: r.location_id,
    sort: r.sort,
    durationMin: r.duration_min,
    bufferMin: r.buffer_min,
    priceCents: r.price_cents,
    scheduleUntil: r.schedule_until,
  }));
}

/** open = some barber works that day (so no slots means «full», not «closed»). */
export type DayAvailability = { date: string; open: boolean; slots: Slot[] };

export type AvailabilityQuery = {
  business: Business;
  serviceIds: string[];
  staffId?: string | null;
  from: string; // local date
  days: number;
  now?: number;
  /** a visit being moved: it does not block its own old time */
  ignoreAppointmentId?: string | null;
  /**
   * a visit being moved keeps its lines as booked: a percent window is a
   * percent of this, not of the barber's price today (src/lib/client-move.ts)
   */
  basePriceCents?: number | null;
};

const ms = (v: unknown) => (v instanceof Date ? v.getTime() : Date.parse(String(v)));

/** The last local day clients may book: today and the salon's horizon («Запись открыта на», 1–365 days). */
export function horizonEnd(business: Pick<Business, "timezone" | "settings">, now = Date.now()): string {
  return addDays(localParts(now, business.timezone).date, business.settings.horizon_days - 1);
}

/** The most days one call works out (the routes ask fewer: src/lib/slot-pages.ts). */
const DAYS_MAX = 120;

/**
 * Free slots per local day. `staffId` null or missing = «anyone», which
 * the salon may switch off («Любой специалист», any_staff_on): then nobody
 * is quoted for it, so nothing is offered and nothing can be booked.
 * Only days from today to the end of the booking horizon are returned, and
 * a barber only up to his own «График до» (staff.schedule_until, 042), at
 * most DAYS_MAX of them: a caller wanting more asks again from a later day.
 * `lastDay`: the last day anyone quoted may be offered (the horizon's end,
 * or the latest «График до» when every one of them has one); null when
 * nobody is quoted. A page of days ends there (slot-pages.ts, nextPage).
 */
export async function loadAvailability(q: Querier, a: AvailabilityQuery): Promise<{ quotes: StaffQuote[]; days: DayAvailability[]; lastDay: string | null }> {
  const { business } = a;
  const tz = business.timezone;
  const s = business.settings;
  const now = a.now ?? Date.now();
  const today = localParts(now, tz).date;
  const lastDay = horizonEnd(business, now);
  const dates: string[] = [];
  for (let i = 0; i < Math.min(a.days, DAYS_MAX); i++) {
    const d = addDays(a.from, i);
    if (d >= today && d <= lastDay) dates.push(d);
  }
  const quotes = !a.staffId && !s.any_staff_on ? [] : await quoteStaff(q, business.id, a.serviceIds, a.staffId);
  // the last day anyone quoted may be offered: the horizon's end, or sooner when each of them has a «График до»
  let last: string | null = null;
  if (quotes.length) {
    last = lastDay;
    if (quotes.every((x) => x.scheduleUntil)) {
      const latest = quotes.reduce((m, x) => (x.scheduleUntil! > m ? x.scheduleUntil! : m), "");
      if (latest < last) last = latest;
    }
  }
  if (!dates.length || !quotes.length) return { quotes, days: dates.map((date) => ({ date, open: false, slots: [] })), lastDay: last };

  const staffIds = quotes.map((x) => x.staffId);
  const fromMs = startOfDay(dates[0], tz);
  const toMs = startOfDay(addDays(dates[dates.length - 1], 1), tz);
  const [hours, overrides, visits, off, special, onlineRows] = await Promise.all([
    q<HoursRow & { staff_id: string }>(
      `select staff_id, weekday, to_char(starts, 'HH24:MI') as starts, to_char(ends, 'HH24:MI') as ends,
              valid_from::text as valid_from, valid_to::text as valid_to
         from staff_hours where staff_id = any($1::uuid[])`,
      [staffIds],
    ),
    q<{ staff_id: string; day: string; intervals: [string, string][] }>(
      `select staff_id, day::text as day, intervals from staff_day_overrides
        where staff_id = any($1::uuid[]) and day between $2::date and $3::date`,
      [staffIds, dates[0], dates[dates.length - 1]],
    ),
    q<{ staff_id: string; starts_at: Date; blocked_until: Date }>(
      `select staff_id, starts_at, blocked_until from appointments
        where staff_id = any($1::uuid[]) and status <> 'cancelled'
          and starts_at < $3 and blocked_until > $2
          and ($4::uuid is null or id <> $4::uuid)`,
      [staffIds, new Date(fromMs), new Date(toMs), a.ignoreAppointmentId ?? null],
    ),
    q<{ staff_id: string; starts_at: Date; ends_at: Date }>(
      `select staff_id, starts_at, ends_at from time_off
        where staff_id = any($1::uuid[]) and status <> 'declined'
          and starts_at < $3 and ends_at > $2`,
      [staffIds, new Date(fromMs), new Date(toMs)],
    ),
    q<{ staff_id: string; starts_at: Date; ends_at: Date; extra_cents: number; extra_pct: number }>(
      `select staff_id, starts_at, ends_at, extra_cents, extra_pct from special_time
        where staff_id = any($1::uuid[]) and business_id = $4
          and starts_at < $3 and ends_at > $2
        order by starts_at, created_at`,
      [staffIds, new Date(fromMs), new Date(toMs), business.id],
    ),
    // «Изменить время для онлайн-записи» (043): the hours clients may book him that day
    q<{ staff_id: string; day: string; spans: [string, string][] }>(
      `select staff_id, day::text as day, spans from staff_online_hours
        where staff_id = any($1::uuid[]) and day between $2::date and $3::date`,
      [staffIds, dates[0], dates[dates.length - 1]],
    ),
  ]);

  const opts = { tz, stepMin: s.slot_step_min, notBefore: now + s.min_notice_min * 60_000 };
  const days = dates.map((date) => {
    const dayFrom = startOfDay(date, tz);
    const dayTo = startOfDay(addDays(date, 1), tz);
    // a barber past his «График до» is not there that day at all: no hours, no special time, not «open»
    const staffDays: StaffDay[] = quotes.filter((qt) => !qt.scheduleUntil || date <= qt.scheduleUntil).map((qt) => {
      const ov = overrides.find((o) => o.staff_id === qt.staffId && o.day === date);
      const on = onlineRows.find((o) => o.staff_id === qt.staffId && o.day === date);
      const busy: Interval[] = [];
      let bookings = 0;
      for (const v of visits) {
        if (v.staff_id !== qt.staffId) continue;
        const iv: Interval = [ms(v.starts_at), ms(v.blocked_until)];
        if (iv[0] < dayTo && iv[1] > dayFrom) busy.push(iv);
        if (iv[0] >= dayFrom && iv[0] < dayTo) bookings++;
      }
      for (const t of off) if (t.staff_id === qt.staffId) busy.push([ms(t.starts_at), ms(t.ends_at)]);
      // special time, cut to this day: a visit never runs past midnight. A
      // percent window becomes money in slots.ts, from this barber's price
      // for the chosen services (priceCents below).
      const sp: Special[] = [];
      for (const x of special) {
        if (x.staff_id !== qt.staffId) continue;
        const from = Math.max(ms(x.starts_at), dayFrom);
        const to = Math.min(ms(x.ends_at), dayTo);
        if (to > from) sp.push({ from, to, extraCents: x.extra_cents, extraPct: x.extra_pct });
      }
      return {
        staffId: qt.staffId,
        date,
        windows: workWindows(date, tz, hours.filter((h) => h.staff_id === qt.staffId), ov ? ov.intervals : null),
        busy,
        special: sp,
        durationMin: qt.durationMin,
        priceCents: a.basePriceCents ?? qt.priceCents,
        bufferMin: qt.bufferMin,
        bookings,
        sort: qt.sort,
        // wall-clock spans of that day as moments, as an override's are; no row: all his time
        online: on ? workWindows(date, tz, [], on.spans) : null,
      };
    });
    return { date, open: staffDays.some((d) => d.windows.length > 0 || (d.special?.length ?? 0) > 0), slots: mergeSlots(staffDays, opts) };
  });
  return { quotes, days, lastDay: last };
}
