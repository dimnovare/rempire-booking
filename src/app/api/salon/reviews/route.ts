/**
 * GET /api/salon/reviews?before=<review id>&limit=6
 * → { rows: [{ id, at, rating, body, name }], more }
 *
 * The reviews about the salon itself on show, newest first, for its page on
 * the booking site («REMPIRE ▾», src/app/[locale]/booking-flow.tsx): the
 * first six when it opens, the next six after the last one given for «Ещё
 * отзывы». The name as the review was signed; no client and no phone go out
 * (src/lib/reviews.ts, salonReviews).
 */
import { connection } from "next/server";
import { currentBusiness } from "@/lib/business";
import { dbConfigured, query } from "@/lib/db";
import { salonReviews } from "@/lib/reviews";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: Request) {
  // a request-time answer, never one made at build time
  await connection();
  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  const limit = Number(url.searchParams.get("limit") || 6);
  if (before != null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(before)) {
    return Response.json({ error: "before" }, { status: 400, headers: HEADERS });
  }
  const business = dbConfigured() ? await currentBusiness() : null;
  if (!business) return Response.json({ error: "unavailable" }, { status: 503, headers: HEADERS });
  const page = await salonReviews(query, business.id, { limit, before });
  return Response.json(page, { headers: HEADERS });
}
