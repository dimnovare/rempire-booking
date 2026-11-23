/**
 * POST /api/visit/<token>/move  { startsAt, extraCents? }
 *
 * The client moves his own visit to another time (src/lib/client-move.ts).
 * The token is his visit link, so no login is needed; the barber and the
 * services stay as booked.
 *
 *   200 { ok: true, startsAt, endsAt, totalCents, extraCents }
 *   404 not_found    the link opens no visit
 *   409 too_late     cancelled, done, started, or inside the salon's cutoff
 *   409 slot_taken   that time is not free any more, or its price changed
 *   422 invalid      no time in the request
 *   429 too_many     many moves from this address (src/lib/booking-limit.ts)
 */
import { requestAddress } from "@/lib/address-hash";
import { releaseBooking, reserveBooking } from "@/lib/booking-limit";
import { currentBusiness } from "@/lib/business";
import { moveByClient } from "@/lib/client-move";
import { dbConfigured } from "@/lib/db";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const answer = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: HEADERS });

export async function POST(request: Request, ctx: RouteContext<"/api/visit/[token]/move">) {
  const { token } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { startsAt?: unknown; extraCents?: unknown } | null;
  const business = dbConfigured() ? await currentBusiness() : null;
  if (!business) return answer({ error: "not_found" }, 404);
  // the place in the limit is taken first, so requests sent at once are counted one by one
  const held = await reserveBooking(business, "move", requestAddress(request));
  if (!held.ok) return answer({ error: "too_many" }, 429);
  const giveBack = () => releaseBooking(held.id).catch((err) => console.error("move limit release failed:", err instanceof Error ? err.message : err));
  let r: Awaited<ReturnType<typeof moveByClient>>;
  try {
    r = await moveByClient(business, token, body ?? {});
  } catch (err) {
    await giveBack();
    throw err;
  }
  // only a move made now stays counted
  if (!r.ok) await giveBack();
  if (r.ok) return answer({ ok: true, startsAt: r.startsAt, endsAt: r.endsAt, totalCents: r.totalCents, extraCents: r.extraCents });
  return answer({ error: r.code }, r.code === "not_found" ? 404 : r.code === "invalid" ? 422 : 409);
}
