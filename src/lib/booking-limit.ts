/**
 * A limit per address on the online booking and on the client's own move
 * (docs/test-plan.md § 11 «Spam bookings»; migration 041).
 *
 * The place is taken before the booking, not after: reserveBooking counts
 * and writes its row in one transaction, under a lock on the address, so
 * fifty requests sent at once from one address are counted one by one and
 * the seventh is refused. If the booking does not go through (the time was
 * taken, a field was wrong, the same tap again), releaseBooking takes the
 * row back: only what went through stays counted.
 *
 * Past the limit the booking page says «call the salon» (429 too_many). The
 * same tap again (its Idempotency-Key already booked a visit) is let
 * through even at the limit: it books nothing new and gives the client his
 * visit back.
 *
 * Many phones can share one address (a mobile network, an office), so the
 * numbers are loose: they stop a script, not a family booking three
 * haircuts. A request with no address, or from this machine itself (a
 * local server, the e2e run), is never limited. The admin's and the
 * barber's bookings never come here.
 */
import type { Business } from "./availability";
import { addressHash, isLoopback } from "./address-hash";
import { withTx } from "./db";
import { todayIn } from "./tz";

export const BOOKING_LIMITS = { bookPerHour: 6, bookPerDay: 15, movePerHour: 10 } as const;
export type LimitKind = "book" | "move";
/** Allowed: `id` is the row taken, to give back with releaseBooking (null: nothing was taken). */
export type Reservation = { ok: true; id: string | null } | { ok: false };

const HOUR = 60 * 60 * 1000;
/** How long a row is kept. */
const KEEP_MS = 2 * 24 * HOUR;
/** An address that is counted: not empty, not this machine. */
const counted = (ip: string) => !!ip.trim() && !isLoopback(ip);

/** May this address book (or move) once more now? If so, its place is taken. */
export async function reserveBooking(
  business: Pick<Business, "id" | "timezone">,
  kind: LimitKind,
  ip: string,
  opts: { now?: number; idempotencyKey?: string } = {},
): Promise<Reservation> {
  if (!counted(ip)) return { ok: true, id: null };
  const now = opts.now ?? Date.now();
  return withTx(async (tx) => {
    const hash = await addressHash(tx, ip, todayIn(business.timezone, now));
    // one request of this address at a time, until this transaction ends
    await tx("select pg_advisory_xact_lock(hashtext('booking-limit:' || $1))", [hash]);
    await tx("delete from booking_limit where at < $1::timestamptz", [new Date(now - KEEP_MS).toISOString()]);
    const [n] = await tx<{ hour: number; day: number }>(
      `select count(*) filter (where at > $4::timestamptz)::int as hour, count(*)::int as day
         from booking_limit
        where business_id = $1 and ip_hash = $2 and kind = $3 and at > $5::timestamptz`,
      [business.id, hash, kind, new Date(now - HOUR).toISOString(), new Date(now - 24 * HOUR).toISOString()],
    );
    const over = kind === "book" ? n.hour >= BOOKING_LIMITS.bookPerHour || n.day >= BOOKING_LIMITS.bookPerDay : n.hour >= BOOKING_LIMITS.movePerHour;
    if (over) {
      // the same tap again: it books nothing new
      if (kind === "book" && opts.idempotencyKey) {
        const [same] = await tx("select 1 from appointments where business_id = $1 and idempotency_key = $2", [business.id, opts.idempotencyKey]);
        if (same) return { ok: true, id: null } as const;
      }
      return { ok: false } as const;
    }
    const [row] = await tx<{ id: string }>(
      "insert into booking_limit (business_id, at, kind, ip_hash) values ($1, $2::timestamptz, $3, $4) returning id::text as id",
      [business.id, new Date(now).toISOString(), kind, hash],
    );
    return { ok: true, id: row.id } as const;
  });
}

/** The booking did not go through: its place is given back. */
export async function releaseBooking(id: string | null): Promise<void> {
  if (id) await withTx((tx) => tx("delete from booking_limit where id = $1::bigint", [id]));
}
