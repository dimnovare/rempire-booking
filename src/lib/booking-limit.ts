/**
 * A limit per address on the online booking and on the client's own move
 * (docs/test-plan.md § 11 «Spam bookings»; migration 041).
 *
 * Only what went through is counted: a booking that found its time taken,
 * or a form with a mistake, costs nothing. Past the limit the booking page
 * says «call the salon» (429 too_many). The same tap again (its
 * Idempotency-Key already booked a visit) is let through even at the limit:
 * it books nothing new and gives the client his visit back.
 *
 * Many phones can share one address (a mobile network, an office), so the
 * numbers are loose: they stop a script, not a family booking three
 * haircuts. A request with no address, or from this machine itself (a
 * local server, the e2e run), is never limited. The admin's and the
 * barber's bookings never come here.
 */
import type { Business } from "./availability";
import { addressHash, isLoopback } from "./address-hash";
import type { Querier } from "./db";
import { todayIn } from "./tz";

export const BOOKING_LIMITS = { bookPerHour: 6, bookPerDay: 15, movePerHour: 10 } as const;
export type LimitKind = "book" | "move";

const HOUR = 60 * 60 * 1000;
/** An address that is counted: not empty, not this machine. */
const counted = (ip: string) => !!ip.trim() && !isLoopback(ip);
/** How long a row is kept. */
const KEEP_MS = 2 * 24 * HOUR;

/** May this address book (or move) once more now? */
export async function withinBookingLimit(
  q: Querier,
  business: Pick<Business, "id" | "timezone">,
  kind: LimitKind,
  ip: string,
  opts: { now?: number; idempotencyKey?: string } = {},
): Promise<boolean> {
  if (!counted(ip)) return true;
  const now = opts.now ?? Date.now();
  const hash = await addressHash(q, ip, todayIn(business.timezone, now));
  const [n] = await q<{ hour: number; day: number }>(
    `select count(*) filter (where at > $4::timestamptz)::int as hour, count(*)::int as day
       from booking_limit
      where business_id = $1 and ip_hash = $2 and kind = $3 and at > $5::timestamptz`,
    [business.id, hash, kind, new Date(now - HOUR).toISOString(), new Date(now - 24 * HOUR).toISOString()],
  );
  const over = kind === "book" ? n.hour >= BOOKING_LIMITS.bookPerHour || n.day >= BOOKING_LIMITS.bookPerDay : n.hour >= BOOKING_LIMITS.movePerHour;
  if (!over) return true;
  // the same tap again: it books nothing new
  if (kind === "book" && opts.idempotencyKey) {
    const [same] = await q("select 1 from appointments where business_id = $1 and idempotency_key = $2", [business.id, opts.idempotencyKey]);
    if (same) return true;
  }
  return false;
}

/** Count one booking (or move) that went through; rows older than two days go. */
export async function noteBooking(q: Querier, business: Pick<Business, "id" | "timezone">, kind: LimitKind, ip: string, now = Date.now()): Promise<void> {
  if (!counted(ip)) return;
  await q("delete from booking_limit where at < $1::timestamptz", [new Date(now - KEEP_MS).toISOString()]);
  const hash = await addressHash(q, ip, todayIn(business.timezone, now));
  await q("insert into booking_limit (business_id, at, kind, ip_hash) values ($1, $2::timestamptz, $3, $4)", [business.id, new Date(now).toISOString(), kind, hash]);
}
