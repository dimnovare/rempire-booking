/**
 * The client moves his own visit from its link, as REMPIRE's Altegio lets
 * him: «Разрешить клиентам переносить записи онлайн», with no time limit
 * (Dim, 19.11.2026; docs/client-flow.md).
 *
 * The token is the only proof needed, as for a cancel (src/lib/visits.ts).
 * The barber and the services stay as booked; only the time changes, and
 * only to a time the booking page would offer him now, with the visit's own
 * old time out of the way. The move itself is the staff's own
 * (adminUpdateVisit): it locks the barber, checks the place again, re-prices
 * special time, keeps the audit row, tells the barber by push and the client
 * by the «moved» letter.
 *
 * The salon's «Онлайн-запись» settings hold as on the booking page: until
 * how long before the visit it may still change (cancel_cutoff_min, in
 * canChange), the notice, the horizon, and the barber's own «График до»
 * (staff.schedule_until): no day after it is offered, and a time after it
 * is «slot_taken» (loadAvailability leaves those days out).
 */
import { adminUpdateVisit } from "./admin/visits";
import { loadAvailability, type AvailabilityQuery, type Business, type DayAvailability } from "./availability";
import { query } from "./db";
import { localParts } from "./tz";
import { canChange, findVisit } from "./visits";

export type MoveProblem = "not_found" | "too_late" | "invalid" | "slot_taken";
export type MoveOutcome =
  | { ok: true; startsAt: string; endsAt: string; totalCents: number; extraCents: number }
  | { ok: false; code: MoveProblem };

/** What the visit costs without special time, as booked: a percent window is priced from this, as the move itself does. */
const baseOf = (v: { services: { priceCents: number }[] }) => v.services.reduce((n, s) => n + s.priceCents, 0);

/**
 * The free times this visit could move to: its barber, its services, itself
 * out of the way; `days` days from `from` (today when none), a page of the
 * booking page's (src/lib/slot-pages.ts). `lastDay`: the last day he may be
 * offered. Null: no such visit, or it can no longer change.
 */
export async function moveSlots(business: Business, token: string, days: number, now = Date.now(), from?: string | null): Promise<{ offered: boolean; days: DayAvailability[]; lastDay: string | null } | null> {
  const v = await findVisit(query, business.id, token);
  if (!v || !canChange(v, business, now)) return null;
  const ask: AvailabilityQuery = {
    business,
    serviceIds: v.services.map((s) => s.serviceId),
    staffId: v.staffId,
    from: from || localParts(now, business.timezone).date,
    days,
    now,
    ignoreAppointmentId: v.id,
    basePriceCents: baseOf(v),
  };
  const r = await loadAvailability(query, ask);
  return { offered: r.quotes.length > 0, days: r.days, lastDay: r.lastDay };
}

/**
 * Move the visit behind `token` to `startsAt`. `extraCents` is the
 * special-time extra the client was shown for that time: another one now is
 * «slot_taken», so nobody is moved onto a price he did not see.
 */
export async function moveByClient(business: Business, token: string, input: { startsAt?: unknown; extraCents?: unknown }, now = Date.now()): Promise<MoveOutcome> {
  const v = await findVisit(query, business.id, token);
  if (!v) return { ok: false, code: "not_found" };
  if (!canChange(v, business, now)) return { ok: false, code: "too_late" };
  const start = typeof input.startsAt === "string" ? Date.parse(input.startsAt) : NaN;
  if (!Number.isFinite(start)) return { ok: false, code: "invalid" };
  // the time it has already: nothing to do, and nothing to tell anyone
  if (start === Date.parse(v.startsAt)) return { ok: true, startsAt: v.startsAt, endsAt: v.endsAt, totalCents: v.totalCents, extraCents: v.extraCents };

  // only a time the booking page would offer him now (hours, notice, horizon, other visits)
  const ask: AvailabilityQuery = {
    business,
    serviceIds: v.services.map((s) => s.serviceId),
    staffId: v.staffId,
    from: localParts(start, business.timezone).date,
    days: 1,
    now,
    ignoreAppointmentId: v.id,
    basePriceCents: baseOf(v),
  };
  const { days } = await loadAvailability(query, ask);
  const slot = days[0]?.slots.find((s) => s.start === start && s.staffIds.includes(v.staffId));
  if (!slot) return { ok: false, code: "slot_taken" };
  if (typeof input.extraCents === "number" && input.extraCents !== slot.extraCents) return { ok: false, code: "slot_taken" };

  const r = await adminUpdateVisit(business, v.id, { start }, "client");
  if (!r.ok) return { ok: false, code: r.code === "not_found" ? "not_found" : r.code === "cancelled" ? "too_late" : "slot_taken" };
  return { ok: true, startsAt: new Date(r.start).toISOString(), endsAt: new Date(r.end).toISOString(), totalCents: r.totalCents, extraCents: r.extraCents };
}
