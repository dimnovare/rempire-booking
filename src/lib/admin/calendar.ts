/**
 * What Renat's calendar shows for a range of local days: the barbers, their
 * working windows, visits, blocked time and special time. Plain data with
 * moments as epoch milliseconds, safe to hand to the browser.
 *
 * The grid maths that needs no database (bounds, snapping, the week) is in
 * src/lib/admin/grid.ts, so the browser uses the same rules.
 */
import type { Business } from "../availability";
import type { L10n } from "../catalog";
import type { Querier } from "../db";
import { workWindows, type HoursRow, type Interval } from "../slots";
import { addDays, startOfDay } from "../tz";

export type CalStaff = {
  id: string;
  name: string;
  /** the label under the name: «Барбер» */
  role: L10n;
  photoUrl: string | null;
  sort: number;
  bookable: boolean;
  active: boolean;
};

export type CalService = {
  id: string;
  name: L10n;
  durationMin: number;
  priceCents: number;
  bufferMin: number;
  active: boolean;
  /** staffId → [price, minutes] for barbers who do it */
  offers: Record<string, [number, number]>;
};

export type CalVisit = {
  id: string;
  staffId: string;
  start: number;
  end: number;
  blockedUntil: number;
  status: string;
  source: string;
  anyStaff: boolean;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  clientNote: string;
  comment: string;
  staffNote: string;
  reminder: boolean;
  totalCents: number;
  extraCents: number;
  services: { serviceId: string; name: L10n; durationMin: number; priceCents: number }[];
};

export type CalBlock = { id: string; staffId: string; from: number; to: number; kind: string; note: string; status: string };
/** A special-time band with its extra as written: an amount (extraCents) or a percent (extraPct), never both. */
export type CalSpecial = { id: string; staffId: string; from: number; to: number; extraCents: number; extraPct: number; note: string };

export type CalendarData = {
  tz: string;
  dates: string[];
  staff: CalStaff[];
  services: CalService[];
  /** staffId → date → working windows (the template, or that day's override) */
  work: Record<string, Record<string, Interval[]>>;
  visits: CalVisit[];
  blocks: CalBlock[];
  special: CalSpecial[];
};

const ms = (v: unknown) => (v instanceof Date ? v.getTime() : Date.parse(String(v)));

/** Every barber who is active, or who has a visit in the range. */
export async function loadCalendar(q: Querier, business: Business, from: string, days: number): Promise<CalendarData> {
  const tz = business.timezone;
  const n = Math.max(1, Math.min(days, 14));
  const dates = Array.from({ length: n }, (_, i) => addDays(from, i));
  const fromMs = startOfDay(dates[0], tz);
  const toMs = startOfDay(addDays(dates[n - 1], 1), tz);
  const range = [business.id, new Date(fromMs), new Date(toMs)];

  const [staffRows, serviceRows, offerRows, hours, overrides, visitRows, lines, offRows, specialRows] = await Promise.all([
    q<{ id: string; display_name: string; role: L10n; photo_url: string | null; sort: number; bookable: boolean; active: boolean }>(
      `select id, display_name, role, photo_url, sort, bookable, active from staff
        where business_id = $1 order by sort, display_name`,
      [business.id],
    ),
    q<{ id: string; name: L10n; duration_min: number; price_cents: number; buffer_after_min: number; active: boolean }>(
      "select id, name, duration_min, price_cents, buffer_after_min, active from services where business_id = $1 order by sort, slug",
      [business.id],
    ),
    q<{ staff_id: string; service_id: string; price_cents: number; duration_min: number }>(
      `select ss.staff_id, ss.service_id, coalesce(ss.price_cents, sv.price_cents) as price_cents,
              coalesce(ss.duration_min, sv.duration_min) as duration_min
         from staff_services ss join services sv on sv.id = ss.service_id
        where sv.business_id = $1 and ss.active`,
      [business.id],
    ),
    q<HoursRow & { staff_id: string }>(
      `select h.staff_id, h.weekday, to_char(h.starts, 'HH24:MI') as starts, to_char(h.ends, 'HH24:MI') as ends,
              h.valid_from::text as valid_from, h.valid_to::text as valid_to
         from staff_hours h join staff s on s.id = h.staff_id where s.business_id = $1`,
      [business.id],
    ),
    q<{ staff_id: string; day: string; intervals: [string, string][] }>(
      `select o.staff_id, o.day::text as day, o.intervals from staff_day_overrides o join staff s on s.id = o.staff_id
        where s.business_id = $1 and o.day between $2::date and $3::date`,
      [business.id, dates[0], dates[n - 1]],
    ),
    q<{
      id: string;
      staff_id: string;
      starts_at: Date;
      ends_at: Date;
      blocked_until: Date;
      status: string;
      source: string;
      any_staff: boolean;
      client_id: string;
      client_name: string;
      phone_e164: string | null;
      client_note: string;
      client_comment: string;
      staff_note: string;
      reminder_min: number | null;
      total_cents: number;
      extra_cents: number;
    }>(
      `select a.id, a.staff_id, a.starts_at, a.ends_at, a.blocked_until, a.status, a.source, a.any_staff,
              a.client_id, c.name as client_name, c.phone_e164, c.staff_note as client_note,
              a.client_comment, a.staff_note, a.reminder_min, a.total_cents, a.extra_cents
         from appointments a join clients c on c.id = a.client_id
        where a.business_id = $1 and a.status <> 'cancelled' and a.starts_at < $3 and a.blocked_until > $2
        order by a.starts_at`,
      range,
    ),
    q<{ appointment_id: string; service_id: string; name: L10n; duration_min: number; price_cents: number }>(
      `select l.appointment_id, l.service_id, l.name, l.duration_min, l.price_cents
         from appointment_services l join appointments a on a.id = l.appointment_id
        where a.business_id = $1 and a.status <> 'cancelled' and a.starts_at < $3 and a.blocked_until > $2
        order by l.appointment_id, l.position`,
      range,
    ),
    q<{ id: string; staff_id: string; starts_at: Date; ends_at: Date; kind: string; note: string; status: string }>(
      `select t.id, t.staff_id, t.starts_at, t.ends_at, t.kind, t.note, t.status
         from time_off t join staff s on s.id = t.staff_id
        where s.business_id = $1 and t.status <> 'declined' and t.starts_at < $3 and t.ends_at > $2
        order by t.starts_at`,
      range,
    ),
    q<{ id: string; staff_id: string; starts_at: Date; ends_at: Date; extra_cents: number; extra_pct: number; note: string }>(
      `select id, staff_id, starts_at, ends_at, extra_cents, extra_pct, note from special_time
        where business_id = $1 and starts_at < $3 and ends_at > $2 order by starts_at, created_at`,
      range,
    ),
  ]);

  const busyStaff = new Set(visitRows.map((v) => v.staff_id));
  const staff = staffRows
    .filter((s) => s.active || busyStaff.has(s.id))
    .map((s) => ({ id: s.id, name: s.display_name, role: s.role, photoUrl: s.photo_url, sort: s.sort, bookable: s.bookable, active: s.active }));

  const work: CalendarData["work"] = {};
  for (const s of staff) {
    work[s.id] = {};
    const mine = hours.filter((h) => h.staff_id === s.id);
    for (const date of dates) {
      const ov = overrides.find((o) => o.staff_id === s.id && o.day === date);
      work[s.id][date] = workWindows(date, tz, mine, ov ? ov.intervals : null);
    }
  }

  const services: CalService[] = serviceRows.map((sv) => ({
    id: sv.id,
    name: sv.name,
    durationMin: sv.duration_min,
    priceCents: sv.price_cents,
    bufferMin: sv.buffer_after_min,
    active: sv.active,
    offers: Object.fromEntries(offerRows.filter((o) => o.service_id === sv.id).map((o) => [o.staff_id, [o.price_cents, o.duration_min] as [number, number]])),
  }));

  const linesBy = new Map<string, CalVisit["services"]>();
  for (const l of lines) {
    const list = linesBy.get(l.appointment_id) ?? [];
    list.push({ serviceId: l.service_id, name: l.name, durationMin: l.duration_min, priceCents: l.price_cents });
    linesBy.set(l.appointment_id, list);
  }

  return {
    tz,
    dates,
    staff,
    services,
    work,
    visits: visitRows.map((v) => ({
      id: v.id,
      staffId: v.staff_id,
      start: ms(v.starts_at),
      end: ms(v.ends_at),
      blockedUntil: ms(v.blocked_until),
      status: v.status,
      source: v.source,
      anyStaff: v.any_staff,
      clientId: v.client_id,
      clientName: v.client_name,
      clientPhone: v.phone_e164,
      clientNote: v.client_note,
      comment: v.client_comment,
      staffNote: v.staff_note,
      reminder: v.reminder_min != null,
      totalCents: v.total_cents,
      extraCents: v.extra_cents,
      services: linesBy.get(v.id) ?? [],
    })),
    blocks: offRows.map((t) => ({ id: t.id, staffId: t.staff_id, from: ms(t.starts_at), to: ms(t.ends_at), kind: t.kind, note: t.note, status: t.status })),
    special: specialRows.map((x) => ({ id: x.id, staffId: x.staff_id, from: ms(x.starts_at), to: ms(x.ends_at), extraCents: x.extra_cents, extraPct: x.extra_pct, note: x.note })),
  };
}

/**
 * «Товаров на сумму» in the journal's day numbers: what the barbers' product
 * sales made on one local day come to, in cents. A sale that was taken back
 * (undone by the barber, or reversed by Renat on any later day) is not in
 * it, and a minus row is nobody's sale. Sales to clients and the barbers'
 * own purchases both count: each is goods sold that day.
 */
export async function dayGoodsCents(q: Querier, business: Business, date: string): Promise<number> {
  const tz = business.timezone;
  const [row] = await q<{ cents: number }>(
    `select coalesce(sum(p.total_cents), 0)::int as cents
       from product_sales p
      where p.business_id = $1 and p.status = 'done' and p.reverses_id is null
        and p.created_at >= $2 and p.created_at < $3
        and not exists (select 1 from product_sales r where r.reverses_id = p.id)`,
    [business.id, new Date(startOfDay(date, tz)), new Date(startOfDay(addDays(date, 1), tz))],
  );
  return row?.cents ?? 0;
}

export type ClientHit = { id: string; name: string; phone: string | null; visits: number; lastVisit: number | null };

/** Clients by phone digits or by name, for the «new visit» form. */
export async function searchClients(q: Querier, businessId: string, text: string): Promise<ClientHit[]> {
  const s = String(text ?? "").trim().slice(0, 60);
  if (s.length < 2) return [];
  const digits = s.replace(/\D/g, "");
  const byPhone = digits.length >= 3 && digits.length >= s.replace(/[\s+()-]/g, "").length - 1;
  const rows = await q<{ id: string; name: string; phone_e164: string | null; visits: number; last_visit: Date | null }>(
    `select c.id, c.name, c.phone_e164,
            count(a.id) filter (where a.status <> 'cancelled')::int as visits,
            max(a.starts_at) filter (where a.status <> 'cancelled') as last_visit
       from clients c left join appointments a on a.client_id = c.id
      where c.business_id = $1 and c.merged_into is null
        and (${byPhone ? "replace(coalesce(c.phone_e164, ''), '+', '') like '%' || $2 || '%'" : "c.name ilike '%' || $2 || '%'"})
      group by c.id
      order by max(a.starts_at) desc nulls last, c.name
      limit 8`,
    [businessId, byPhone ? digits : s.replace(/[%_\\]/g, (m) => "\\" + m)],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone_e164, visits: r.visits, lastVisit: r.last_visit ? ms(r.last_visit) : null }));
}
