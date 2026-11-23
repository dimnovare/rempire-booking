/**
 * Booking from the barber's phone (B3): his services at his prices, the
 * times still free in his column, and his own clients. Everything here is
 * read for ONE barber (the staffId requireStaff() gave). The booking, move
 * and cancel themselves go through src/lib/admin/visits.ts with that
 * column as the scope, so the rules are the admin's. The login (`who`) goes
 * with it: its rights are asked there (src/lib/auth/rights.ts).
 */
import { adminCancelVisit, adminCreateVisit, adminUpdateVisit, isUuid, type AdminOutcome } from "../admin/visits";
import { can, maskPhone, seenClients, type Holder } from "../auth/rights";
import type { Business } from "../availability";
import type { L10n } from "../catalog";
import { query, type Querier } from "../db";
import { isLocalDate } from "../tz";
import { loadBarberDays } from "./day";
import { freeGaps, startsIn, type FreeStart } from "./gaps";

export type Offer = { id: string; name: L10n; durationMin: number; priceCents: number; bufferMin: number };

/** The services this barber does, with his own time and price, in the salon's order. */
export async function barberOffers(q: Querier, businessId: string, staffId: string): Promise<Offer[]> {
  const rows = await q<{ id: string; name: L10n; duration_min: number; price_cents: number; buffer_after_min: number }>(
    `select sv.id, sv.name, coalesce(ss.duration_min, sv.duration_min) as duration_min,
            coalesce(ss.price_cents, sv.price_cents) as price_cents, sv.buffer_after_min
       from services sv join staff_services ss on ss.service_id = sv.id and ss.staff_id = $2 and ss.active
      where sv.business_id = $1 and sv.active
      order by sv.sort, sv.id`,
    [businessId, staffId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, durationMin: r.duration_min, priceCents: r.price_cents, bufferMin: r.buffer_after_min }));
}

export type StartsAnswer = { ok: true; durationMin: number; starts: FreeStart[] } | { ok: false; code: "invalid" | "not_found" | "not_offered" };

/**
 * The free start times on one day in his column, for these services (a new
 * visit) or for this visit's own services (a move; the visit itself is not
 * in the way). Nothing before now. Each start has its special-time extra in
 * money: a window priced in percent takes that percent of the visit's price
 * (his prices for the services; for a move, the lines as the visit keeps
 * them), the amount the booking or the move will then write.
 */
export async function barberFreeStarts(
  q: Querier,
  business: Business,
  staffId: string,
  date: string,
  what: { serviceIds: string[] } | { visitId: string },
  now = Date.now(),
): Promise<StartsAnswer> {
  if (!isLocalDate(date)) return { ok: false, code: "invalid" };
  let durationMin = 0;
  let bufferMin = 0;
  // the visit's price without a special-time extra
  let baseCents = 0;
  let skip: string | null = null;
  if ("visitId" in what) {
    const lines = await q<{ duration_min: number; price_cents: number; buffer_after_min: number }>(
      `select l.duration_min, l.price_cents, sv.buffer_after_min
         from appointments a join appointment_services l on l.appointment_id = a.id join services sv on sv.id = l.service_id
        where a.id = $1 and a.business_id = $2 and a.staff_id = $3 and a.status <> 'cancelled'`,
      [what.visitId, business.id, staffId],
    );
    if (!lines.length) return { ok: false, code: "not_found" };
    durationMin = lines.reduce((n, l) => n + l.duration_min, 0);
    bufferMin = Math.max(0, ...lines.map((l) => l.buffer_after_min));
    baseCents = lines.reduce((n, l) => n + l.price_cents, 0);
    skip = what.visitId;
  } else {
    const ids = [...new Set(what.serviceIds.map(String))];
    if (!ids.length || ids.length > 8) return { ok: false, code: "invalid" };
    const offers = await barberOffers(q, business.id, staffId);
    for (const id of ids) {
      const o = offers.find((x) => x.id === id);
      if (!o) return { ok: false, code: "not_offered" };
      durationMin += o.durationMin;
      bufferMin = Math.max(bufferMin, o.bufferMin);
      baseCents += o.priceCents;
    }
  }
  const [day] = await loadBarberDays(q, business, staffId, date, 1);
  const free = freeGaps({ ...day, visits: day.visits.filter((v) => v.id !== skip) }, { now, stepMin: business.settings.slot_step_min });
  return { ok: true, durationMin, starts: startsIn(free, { durationMin, bufferMin, baseCents, stepMin: business.settings.slot_step_min }) };
}

export type MyClient = { id: string; name: string; phone: string | null; visits: number; lastVisit: number | null };

/**
 * His clients by phone digits or by name: only people who have had a visit
 * in his column. Another barber's clients never show up here. With `who`:
 * only with the right to the clients' list, only if this column's clients
 * are the login's to see, and without the list's phones right the phones
 * are masked and digits find nobody.
 */
export async function searchMyClients(q: Querier, businessId: string, staffId: string, text: string, who?: Holder): Promise<MyClient[]> {
  if (who && !can(who, "visit.client_list")) return [];
  if (who && !columnClientsSeen(who, staffId)) return [];
  const phones = !who || can(who, "visit.client_list.phones");
  const s = String(text ?? "").trim().slice(0, 60);
  if (s.length < 2) return [];
  const digits = s.replace(/\D/g, "");
  const byPhone = digits.length >= 3 && digits.length >= s.replace(/[\s+()-]/g, "").length - 1;
  if (byPhone && !phones) return [];
  const rows = await q<{ id: string; name: string; phone_e164: string | null; visits: number; last_visit: Date | null }>(
    `select c.id, c.name, c.phone_e164,
            count(a.id) filter (where a.status <> 'cancelled')::int as visits,
            max(a.starts_at) filter (where a.status <> 'cancelled') as last_visit
       from clients c join appointments a on a.client_id = c.id and a.staff_id = $3
      where c.business_id = $1 and c.merged_into is null and c.anonymised_at is null
        and (${byPhone ? "replace(coalesce(c.phone_e164, ''), '+', '') like '%' || $2 || '%'" : "c.name ilike '%' || $2 || '%'"})
      group by c.id
      order by max(a.starts_at) desc nulls last, c.name
      limit 8`,
    [businessId, byPhone ? digits : s.replace(/[%_\\]/g, (m) => "\\" + m), staffId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, phone: phones ? r.phone_e164 : maskPhone(r.phone_e164), visits: r.visits, lastVisit: r.last_visit ? new Date(r.last_visit).getTime() : null }));
}

/** Are the clients of this column ones the login sees («Показывать клиентов»: all, or this barber's)? */
export function columnClientsSeen(who: Holder, staffId: string): boolean {
  const seen = seenClients(who);
  return seen === "all" || seen.includes(staffId);
}

/** Has this client had a visit in his column? (A client id from the phone is checked before it is used.) */
export async function isMyClient(q: Querier, businessId: string, staffId: string, clientId: string): Promise<boolean> {
  if (!isUuid(clientId)) return false;
  const rows = await q<{ x: number }>("select 1 as x from appointments where business_id = $1 and staff_id = $2 and client_id = $3 limit 1", [businessId, staffId, clientId]);
  return rows.length > 0;
}

/* ---------- the barber's own changes, in his column only ---------- */

export type NewVisitInput = {
  start: number;
  serviceIds: string[];
  /** one of his own clients, or name and/or phone for someone new */
  clientId?: string | null;
  name?: string;
  phone?: string;
  note?: string;
  sms?: boolean;
  key: string;
  /** yes, outside his hours / over his break (the second «yes») */
  force?: boolean;
};

/** A walk-in or the client's next visit, in his own column. */
export async function barberBook(business: Business, staffId: string, actor: string, v: NewVisitInput, who?: Holder): Promise<AdminOutcome> {
  const clientId = v?.clientId ? String(v.clientId) : null;
  // a client id from the phone must be one of his own clients
  if (clientId && !(await isMyClient(query, business.id, staffId, clientId))) return { ok: false, code: "invalid", field: "client" };
  return adminCreateVisit(
    business,
    {
      staffId,
      start: Number(v?.start),
      serviceIds: Array.isArray(v?.serviceIds) ? v.serviceIds.map(String) : [],
      clientId,
      name: clientId ? null : String(v?.name ?? ""),
      phone: clientId ? null : String(v?.phone ?? ""),
      comment: "",
      staffNote: String(v?.note ?? ""),
      smsReminder: v?.sms !== false,
      idempotencyKey: String(v?.key ?? ""),
      force: v?.force === true,
    },
    actor,
    { onlyStaffId: staffId, who },
  );
}

/** Move one of his visits to another time; never to another barber. */
export async function barberMove(business: Business, staffId: string, actor: string, visitId: string, start: number, force = false, who?: Holder): Promise<AdminOutcome> {
  return adminUpdateVisit(business, String(visitId), { start: Number(start), force: force === true }, actor, { onlyStaffId: staffId, who });
}

/** The shortest reason that says something («заболел» and up). */
export const MIN_REASON = 3;

/**
 * The emergency cancel: only with a reason, which Renat gets by push and
 * the audit keeps. The client gets the «cancelled» letter.
 */
export async function barberCancel(business: Business, staffId: string, actor: string, visitId: string, reason: string, who?: Holder): Promise<"cancelled" | "already" | "not_found" | "reason" | "forbidden"> {
  const why = String(reason ?? "").trim().replace(/\s+/g, " ");
  if (why.length < MIN_REASON) return "reason";
  return adminCancelVisit(business, String(visitId), actor, { onlyStaffId: staffId, reason: why, who });
}
