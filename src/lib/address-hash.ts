/**
 * The sender's address, for the limits per address (reviews, online
 * bookings), and never kept in clear.
 */
import { createHmac } from "node:crypto";
import type { Querier } from "./db";

/** The sender's address as the host gives it: Vercel sets x-real-ip and overwrites x-forwarded-for, so neither can be made up there. */
export function requestAddress(request: Request): string {
  const h = request.headers;
  return (h.get("x-real-ip") || (h.get("x-forwarded-for") ?? "").split(",")[0] || "").trim().slice(0, 64);
}

/**
 * This machine itself: Next's own server puts ::1 or 127.0.0.1 into
 * x-forwarded-for for a local request (`next dev`, `next start`, the e2e
 * server). On Vercel the address is always the client's.
 */
export function isLoopback(ip: string): boolean {
  return /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+|localhost)$/i.test(ip.trim());
}

/**
 * The address, unreadable: an HMAC of it and the salon's day, keyed with
 * the database's own random key (review_salt, migration 035). The same
 * address gives one hash a day, so a day's rows can be counted, and
 * another the next day.
 */
export async function addressHash(q: Querier, ip: string, day: string): Promise<string> {
  const [row] = await q<{ salt: string }>("select salt from review_salt limit 1");
  if (!row) throw new Error("review_salt is empty: migration 035 makes it");
  return createHmac("sha256", row.salt).update(`${day}\n${ip.trim().toLowerCase()}`).digest("hex");
}
