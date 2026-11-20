/**
 * The barber's own days (B2): his working windows, his visits, his blocked
 * time and special time, and what is still free. Everything is read for ONE
 * barber (the staffId requireStaff() gave): nothing of another barber's
 * column or clients ever leaves the database here.
 *
 * Plain data with moments as epoch milliseconds, safe to hand to the
 * browser. The phone number is in it: Dim, 17.11.2026, «shown, tap to call,
 * for his own visits only».
 *
 * What a login may see of it is its rights (src/lib/auth/rights.ts), cut
 * on the server by barberDaysFor before a page gets the days.
 */
import { can, historyFrom, maskPhone, type Holder } from "../auth/rights";
import type { Business } from "../availability";
import type { L10n } from "../catalog";
import type { Querier } from "../db";
import { workWindows, type HoursRow, type Interval } from "../slots";
import { addDays, startOfDay } from "../tz";
import { COUNTED } from "./gaps";

export type BVisit = {
  id: string;
  start: number;
  end: number;
  blockedUntil: number;
  status: string;
  /** «Подтвердил»: a waiting visit the client said he will come to (021_visit_confirmed.sql) */
  confirmed: boolean;
  source: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  /** clients.staff_note: one note per client, every barber and Renat see it */
  clientNote: string;
  /** what the client wrote when booking */
  comment: string;
  /** appointments.staff_note: this visit's own note */
  staffNote: string;
  reminder: boolean;
  totalCents: number;
  extraCents: number;
  services: { serviceId: string; name: L10n; durationMin: number; priceCents: number }[];
};

export type BBlock = { id: string; from: number; to: number; kind: string; status: string; note: string };
/** A special-time window with its extra as written: an amount (extraCents) or a percent (extraPct), never both. */
export type BSpecial = { id: string; from: number; to: number; extraCents: number; extraPct: number; note: string };

export type BDay = {
  date: string;
  /** working windows: the weekly hours or that day's override */
  windows: Interval[];
  visits: BVisit[];
  blocks: BBlock[];
  special: BSpecial[];
  /** visits that count (not cancelled, not a no-show) and their money */
  count: number;
  totalCents: number;
};

const ms = (v: unknown) => (v instanceof Date ? v.getTime() : Date.parse(String(v)));

/**
 * What the barber app offers a login in one column, each a right of its
 * own. The screens only hide by these; the actions ask the same rights.
 */
export type BMay = {
  /** the column is the login's to see at all (journal.staff) */
  see: boolean;
  /** phones in full, so they can be called */
  call: boolean;
  /** «Карточка клиента» from a visit */
  card: boolean;
  create: boolean;
  newClient: boolean;
  pickClient: boolean;
  /** a visit's status; one the client has come to */
  edit: boolean;
  editCame: boolean;
  /** a visit's services: «+ Добавить услугу», «Убрать услугу» (visit.edit.services) */
  services: boolean;
  /** the visit's own note; the client's shared note */
  note: boolean;
  clientNote: boolean;
  move: boolean;
  cancel: boolean;
  /** the day's and the week's sums */
  stats: boolean;
  /** the earliest day the login may look at; null: no limit */
  from: string | null;
};

export function barberMay(who: Holder, staffId: string, today: string): BMay {
  return {
    see: can(who, "journal.staff", { staffId }),
    call: can(who, "visit.client_data") && can(who, "journal.phones"),
    card: can(who, "visit.client_data"),
    create: can(who, "visit.create"),
    newClient: can(who, "visit.client_create"),
    pickClient: can(who, "visit.client_list"),
    edit: can(who, "visit.edit"),
    editCame: can(who, "visit.edit.arrived"),
    services: can(who, "visit.edit.services"),
    note: can(who, "visit.edit.comment"),
    clientNote: can(who, "clients.note.edit"),
    move: can(who, "journal.move") || can(who, "visit.edit.staff_time"),
    cancel: can(who, "visit.delete"),
    stats: can(who, "journal.stats"),
    from: historyFrom(who, today),
  };
}

/**
 * A barber's days as one login may see them: nothing of a column it does
 * not see, nothing before its history limit, phones and the client's note
 * by its rights (as the admin's calendar: src/lib/admin/calendar.ts), and
 * the day's sum only with «Показывать статистику».
 */
export function barberDaysFor(who: Holder, staffId: string, days: BDay[], today: string): BDay[] {
  const sees = can(who, "journal.staff", { staffId });
  const from = historyFrom(who, today);
  const clientData = can(who, "visit.client_data");
  const phones = clientData && can(who, "journal.phones");
  const note = clientData && can(who, "clients.note");
  const stats = can(who, "journal.stats");
  return days.map((d) => {
    if (!sees || (from !== null && d.date < from)) return { ...d, windows: [], visits: [], blocks: [], special: [], count: 0, totalCents: 0 };
    return {
      ...d,
      visits: d.visits.map((v) => ({ ...v, clientPhone: !clientData ? null : phones ? v.clientPhone : maskPhone(v.clientPhone), clientNote: note ? v.clientNote : "" })),
      totalCents: stats ? d.totalCents : 0,
    };
  });
}


/** `days` local days from `from`, for one barber. */
export async function loadBarberDays(q: Querier, business: Business, staffId: string, from: string, days: number): Promise<BDay[]> {
  const tz = business.timezone;
  const n = Math.max(1, Math.min(days, 14));
  const dates = Array.from({ length: n }, (_, i) => addDays(from, i));
  const fromMs = startOfDay(dates[0], tz);
  const toMs = startOfDay(addDays(dates[n - 1], 1), tz);
  const range = [staffId, business.id, new Date(fromMs), new Date(toMs)];

  const [hours, overrides, visitRows, lines, offRows, specialRows] = await Promise.all([
    q<HoursRow>(
      `select h.weekday, to_char(h.starts, 'HH24:MI') as starts, to_char(h.ends, 'HH24:MI') as ends,
              h.valid_from::text as valid_from, h.valid_to::text as valid_to
         from staff_hours h join staff s on s.id = h.staff_id
        where h.staff_id = $1 and s.business_id = $2`,
      [staffId, business.id],
    ),
    q<{ day: string; intervals: [string, string][] }>(
      `select o.day::text as day, o.intervals from staff_day_overrides o join staff s on s.id = o.staff_id
        where o.staff_id = $1 and s.business_id = $2 and o.day between $3::date and $4::date`,
      [staffId, business.id, dates[0], dates[n - 1]],
    ),
    q<{
      id: string;
      starts_at: Date;
      ends_at: Date;
      blocked_until: Date;
      status: string;
      confirmed: boolean;
      source: string;
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
      `select a.id, a.starts_at, a.ends_at, a.blocked_until, a.status, a.confirmed_at is not null as confirmed, a.source,
              a.client_id, c.name as client_name, c.phone_e164, c.staff_note as client_note,
              a.client_comment, a.staff_note, a.reminder_min, a.total_cents, a.extra_cents
         from appointments a join clients c on c.id = a.client_id
        where a.staff_id = $1 and a.business_id = $2 and a.status <> 'cancelled'
          and a.starts_at < $4 and a.blocked_until > $3
        order by a.starts_at`,
      range,
    ),
    q<{ appointment_id: string; service_id: string; name: L10n; duration_min: number; price_cents: number }>(
      `select l.appointment_id, l.service_id, l.name, l.duration_min, l.price_cents
         from appointment_services l join appointments a on a.id = l.appointment_id
        where a.staff_id = $1 and a.business_id = $2 and a.status <> 'cancelled'
          and a.starts_at < $4 and a.blocked_until > $3
        order by l.appointment_id, l.position`,
      range,
    ),
    q<{ id: string; starts_at: Date; ends_at: Date; kind: string; status: string; note: string }>(
      `select t.id, t.starts_at, t.ends_at, t.kind, t.status, t.note
         from time_off t join staff s on s.id = t.staff_id
        where t.staff_id = $1 and s.business_id = $2 and t.status <> 'declined'
          and t.starts_at < $4 and t.ends_at > $3
        order by t.starts_at`,
      range,
    ),
    q<{ id: string; starts_at: Date; ends_at: Date; extra_cents: number; extra_pct: number; note: string }>(
      `select id, starts_at, ends_at, extra_cents, extra_pct, note from special_time
        where staff_id = $1 and business_id = $2 and starts_at < $4 and ends_at > $3
        order by starts_at, created_at`,
      range,
    ),
  ]);

  const linesBy = new Map<string, BVisit["services"]>();
  for (const l of lines) {
    const list = linesBy.get(l.appointment_id) ?? [];
    list.push({ serviceId: l.service_id, name: l.name, durationMin: l.duration_min, priceCents: l.price_cents });
    linesBy.set(l.appointment_id, list);
  }
  const visits: BVisit[] = visitRows.map((v) => ({
    id: v.id,
    start: ms(v.starts_at),
    end: ms(v.ends_at),
    blockedUntil: ms(v.blocked_until),
    status: v.status,
    confirmed: v.confirmed,
    source: v.source,
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
  }));
  const blocks: BBlock[] = offRows.map((t) => ({ id: t.id, from: ms(t.starts_at), to: ms(t.ends_at), kind: t.kind, status: t.status, note: t.note }));
  const special: BSpecial[] = specialRows.map((x) => ({ id: x.id, from: ms(x.starts_at), to: ms(x.ends_at), extraCents: x.extra_cents, extraPct: x.extra_pct, note: x.note }));

  return dates.map((date) => {
    const d0 = startOfDay(date, tz);
    const d1 = startOfDay(addDays(date, 1), tz);
    const ov = overrides.find((o) => o.day === date);
    const mine = visits.filter((v) => v.start >= d0 && v.start < d1);
    const counted = mine.filter((v) => COUNTED.has(v.status));
    return {
      date,
      windows: workWindows(date, tz, hours, ov ? ov.intervals : null),
      visits: mine,
      blocks: blocks.filter((b) => b.from < d1 && b.to > d0),
      special: special
        .filter((s) => s.from < d1 && s.to > d0)
        .map((s) => ({ ...s, from: Math.max(s.from, d0), to: Math.min(s.to, d1) })),
      count: counted.length,
      totalCents: counted.reduce((n, v) => n + v.totalCents, 0),
    };
  });
}
