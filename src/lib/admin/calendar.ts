/**
 * What Renat's calendar shows for a range of local days: the barbers, their
 * working windows, visits, blocked time and special time. Plain data with
 * moments as epoch milliseconds, safe to hand to the browser.
 *
 * The grid maths that needs no database (bounds, snapping, the week) is in
 * src/lib/admin/grid.ts, so the browser uses the same rules.
 */
import { can, historyFrom, maskEmail, maskPhone, seenStaff, type Holder } from "../auth/rights";
import type { Business } from "../availability";
import type { L10n } from "../catalog";
import type { Querier } from "../db";
import { workWindows, type HoursRow, type Interval } from "../slots";
import { addDays, startOfDay } from "../tz";
import { seenClientsSql } from "./client-scope";

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
  /** «Клиент подтвердил»: a waiting visit the client said he will come to (021_visit_confirmed.sql) */
  confirmed: boolean;
  source: string;
  anyStaff: boolean;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  /** his e-mail, cut by the login's rights as the phone is (calendarFor) */
  clientEmail: string | null;
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
  /**
   * staffId → date → the hours clients may book him online that day, as
   * wall-clock spans («Изменить время для онлайн-записи», 043); a day that
   * is not here has all his working hours. Only the journal's own data has it:
   * his head's menu says them, and his column carries them as a strip
   * (journal-grid.tsx, `online`; journal.ts, onlineStrip).
   */
  online?: Record<string, Record<string, [string, string][]>>;
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

  const [staffRows, serviceRows, offerRows, hours, overrides, visitRows, lines, offRows, specialRows, onlineRows] = await Promise.all([
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
      confirmed: boolean;
      source: string;
      any_staff: boolean;
      client_id: string;
      client_name: string;
      phone_e164: string | null;
      email: string | null;
      client_note: string;
      client_comment: string;
      staff_note: string;
      reminder_min: number | null;
      total_cents: number;
      extra_cents: number;
    }>(
      `select a.id, a.staff_id, a.starts_at, a.ends_at, a.blocked_until, a.status, a.confirmed_at is not null as confirmed, a.source, a.any_staff,
              a.client_id, c.name as client_name, c.phone_e164, c.email, c.staff_note as client_note,
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
    q<{ staff_id: string; day: string; spans: [string, string][] }>(
      `select o.staff_id, o.day::text as day, o.spans from staff_online_hours o join staff s on s.id = o.staff_id
        where s.business_id = $1 and o.day between $2::date and $3::date`,
      [business.id, dates[0], dates[n - 1]],
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
      confirmed: v.status === "booked" && v.confirmed === true,
      source: v.source,
      anyStaff: v.any_staff,
      clientId: v.client_id,
      clientName: v.client_name,
      clientPhone: v.phone_e164,
      clientEmail: v.email,
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
    online: onlineRows.reduce<NonNullable<CalendarData["online"]>>((all, r) => {
      (all[r.staff_id] ??= {})[r.day] = r.spans;
      return all;
    }, {}),
  };
}

/**
 * One visit with what its sheet needs around it: every barber, the services
 * and who does them. For a page that opens the calendar's visit sheet
 * without the calendar («Записи»). A cancelled visit comes too (the
 * calendar never has one): its sheet only shows it. Null: no such visit in
 * this business. Cut it with `calendarFor` before it leaves the server, as
 * the calendar's own data is.
 */
export async function loadVisitData(q: Querier, business: Business, id: string): Promise<CalendarData | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) return null;
  const tz = business.timezone;
  const [v] = await q<{
    id: string;
    staff_id: string;
    starts_at: Date;
    ends_at: Date;
    blocked_until: Date;
    status: string;
    confirmed: boolean;
    source: string;
    any_staff: boolean;
    client_id: string;
    client_name: string;
    phone_e164: string | null;
    email: string | null;
    client_note: string;
    client_comment: string;
    staff_note: string;
    reminder_min: number | null;
    total_cents: number;
    extra_cents: number;
    day: string;
  }>(
    `select a.id, a.staff_id, a.starts_at, a.ends_at, a.blocked_until, a.status, a.confirmed_at is not null as confirmed, a.source, a.any_staff,
            a.client_id, c.name as client_name, c.phone_e164, c.email, c.staff_note as client_note,
            a.client_comment, a.staff_note, a.reminder_min, a.total_cents, a.extra_cents,
            to_char(a.starts_at at time zone $3::text, 'YYYY-MM-DD') as day
       from appointments a join clients c on c.id = a.client_id
      where a.id = $1 and a.business_id = $2`,
    [id, business.id, tz],
  );
  if (!v) return null;
  const [staffRows, serviceRows, offerRows, lines] = await Promise.all([
    q<{ id: string; display_name: string; role: L10n; photo_url: string | null; sort: number; bookable: boolean; active: boolean }>(
      "select id, display_name, role, photo_url, sort, bookable, active from staff where business_id = $1 order by sort, display_name",
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
    q<{ service_id: string; name: L10n; duration_min: number; price_cents: number }>(
      "select service_id, name, duration_min, price_cents from appointment_services where appointment_id = $1 order by position",
      [id],
    ),
  ]);
  return {
    tz,
    dates: [v.day],
    staff: staffRows.filter((s) => s.active || s.id === v.staff_id).map((s) => ({ id: s.id, name: s.display_name, role: s.role, photoUrl: s.photo_url, sort: s.sort, bookable: s.bookable, active: s.active })),
    services: serviceRows.map((sv) => ({
      id: sv.id,
      name: sv.name,
      durationMin: sv.duration_min,
      priceCents: sv.price_cents,
      bufferMin: sv.buffer_after_min,
      active: sv.active,
      offers: Object.fromEntries(offerRows.filter((o) => o.service_id === sv.id).map((o) => [o.staff_id, [o.price_cents, o.duration_min] as [number, number]])),
    })),
    work: {},
    visits: [
      {
        id: v.id,
        staffId: v.staff_id,
        start: ms(v.starts_at),
        end: ms(v.ends_at),
        blockedUntil: ms(v.blocked_until),
        status: v.status,
        confirmed: v.status === "booked" && v.confirmed === true,
        source: v.source,
        anyStaff: v.any_staff,
        clientId: v.client_id,
        clientName: v.client_name,
        clientPhone: v.phone_e164,
        clientEmail: v.email,
        clientNote: v.client_note,
        comment: v.client_comment,
        staffNote: v.staff_note,
        reminder: v.reminder_min != null,
        totalCents: v.total_cents,
        extraCents: v.extra_cents,
        services: lines.map((l) => ({ serviceId: l.service_id, name: l.name, durationMin: l.duration_min, priceCents: l.price_cents })),
      },
    ],
    blocks: [],
    special: [],
  };
}

/**
 * What the calendar's screen offers a login, each a right of its own
 * (src/lib/auth/rights.ts). The screen only hides by these; the actions
 * and src/lib/admin/visits.ts ask the same rights again.
 */
export type CalMay = {
  /** «Запись»: a new visit */
  create: boolean;
  /** …for a client typed in anew, …for one picked from the search */
  newClient: boolean;
  pickClient: boolean;
  /** change a visit: its status, and with the three below its time and barber, services, note */
  edit: boolean;
  /** …also one the client has come to */
  editCame: boolean;
  moveWindow: boolean;
  services: boolean;
  note: boolean;
  /** drag a visit, or «Перенести» */
  move: boolean;
  /** cancel a visit; one the client has come to */
  cancel: boolean;
  cancelCame: boolean;
  /** block time in a column, and take a block away */
  schedule: boolean;
  /** the day's numbers */
  stats: boolean;
  /** «Продать» */
  sell: boolean;
  /** the phone is shown in full, so it can be called */
  call: boolean;
  /** the earliest day the login may look at; null: no limit */
  from: string | null;
};

export function calendarMay(who: Holder, today: string): CalMay {
  return {
    create: can(who, "visit.create"),
    newClient: can(who, "visit.client_create"),
    pickClient: can(who, "visit.client_list"),
    edit: can(who, "visit.edit"),
    editCame: can(who, "visit.edit.arrived"),
    moveWindow: can(who, "visit.edit.staff_time"),
    services: can(who, "visit.edit.services"),
    note: can(who, "visit.edit.comment"),
    move: can(who, "journal.move"),
    cancel: can(who, "visit.delete"),
    cancelCame: can(who, "visit.delete.arrived"),
    schedule: can(who, "journal.schedule"),
    stats: can(who, "journal.stats"),
    sell: can(who, "visit.sell") && can(who, "visit.sell.create"),
    call: can(who, "visit.client_data") && can(who, "journal.phones"),
    from: historyFrom(who, today),
  };
}

/**
 * The calendar as one login may see it:
 *   - only the columns of the barbers it sees (journal.staff);
 *   - nothing before its history limit (journal.history);
 *   - a client's phone only with «Доступ к данным клиентов», and in full
 *     only with «Показывать номера телефонов» (else «+3725•••••45»); his
 *     e-mail the same way (else «a•••@example.test»);
 *   - the online hours only of the barbers it sees, and none before its
 *     history limit;
 *   - the client's note only with the client's data and «Просматривать
 *     примечание».
 * The data leaves the server already cut: the screen cannot show more.
 */
export function calendarFor(who: Holder, data: CalendarData, today: string): CalendarData {
  const seen = seenStaff(who);
  const sees = (staffId: string) => seen === "all" || seen.includes(staffId);
  const from = historyFrom(who, today);
  const fromMs = from ? startOfDay(from, data.tz) : null;
  const clientData = can(who, "visit.client_data");
  const phones = clientData && can(who, "journal.phones");
  const note = clientData && can(who, "clients.note");
  const staff = data.staff.filter((s) => sees(s.id));
  const work: CalendarData["work"] = {};
  for (const s of staff) work[s.id] = Object.fromEntries(Object.entries(data.work[s.id] ?? {}).map(([date, w]) => [date, from && date < from ? [] : w]));
  return {
    ...data,
    staff,
    work,
    services: data.services.map((sv) => ({ ...sv, offers: Object.fromEntries(Object.entries(sv.offers).filter(([id]) => sees(id))) })),
    visits: data.visits
      .filter((v) => sees(v.staffId) && (fromMs === null || v.start >= fromMs))
      .map((v) => ({
        ...v,
        clientPhone: !clientData ? null : phones ? v.clientPhone : maskPhone(v.clientPhone),
        clientEmail: !clientData ? null : phones ? v.clientEmail : maskEmail(v.clientEmail),
        clientNote: note ? v.clientNote : "",
      })),
    blocks: data.blocks.filter((b) => sees(b.staffId) && (fromMs === null || b.to > fromMs)),
    special: data.special.filter((x) => sees(x.staffId) && (fromMs === null || x.to > fromMs)),
    ...(data.online && {
      online: Object.fromEntries(
        Object.entries(data.online)
          .filter(([id]) => sees(id))
          .map(([id, days]) => [id, Object.fromEntries(Object.entries(days).filter(([date]) => !from || date >= from))]),
      ),
    }),
  };
}

/** The local day a login may open: the asked one, or the earliest it may look at when that is later. */
export function clampDay(who: Holder, date: string, today: string): string {
  const from = historyFrom(who, today);
  return from && date < from ? from : date;
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

/**
 * Clients by phone digits or by name, for the «new visit» form. With `who`
 * (a login): only with «Доступ к выпадающему списку с данными о клиентах»,
 * only the clients it sees (clients.show), and without «Показывать номера
 * телефонов» of that list the phones are masked and digits find nobody.
 */
export async function searchClients(q: Querier, businessId: string, text: string, who?: Holder): Promise<ClientHit[]> {
  if (who && !can(who, "visit.client_list")) return [];
  const phones = !who || can(who, "visit.client_list.phones");
  const s = String(text ?? "").trim().slice(0, 60);
  if (s.length < 2) return [];
  const digits = s.replace(/\D/g, "");
  const byPhone = digits.length >= 3 && digits.length >= s.replace(/[\s+()-]/g, "").length - 1;
  if (byPhone && !phones) return [];
  const params: unknown[] = [businessId, byPhone ? digits : s.replace(/[%_\\]/g, (m) => "\\" + m)];
  const only = seenClientsSql(who, (v) => {
    params.push(v);
    return `$${params.length}`;
  });
  const rows = await q<{ id: string; name: string; phone_e164: string | null; visits: number; last_visit: Date | null }>(
    `select c.id, c.name, c.phone_e164,
            count(a.id) filter (where a.status <> 'cancelled')::int as visits,
            max(a.starts_at) filter (where a.status <> 'cancelled') as last_visit
       from clients c left join appointments a on a.client_id = c.id
      where c.business_id = $1 and c.merged_into is null and c.anonymised_at is null
        and (${byPhone ? "replace(coalesce(c.phone_e164, ''), '+', '') like '%' || $2 || '%'" : "c.name ilike '%' || $2 || '%'"})${only}
      group by c.id
      order by max(a.starts_at) desc nulls last, c.name
      limit 8`,
    params,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, phone: phones ? r.phone_e164 : maskPhone(r.phone_e164), visits: r.visits, lastVisit: r.last_visit ? ms(r.last_visit) : null }));
}
