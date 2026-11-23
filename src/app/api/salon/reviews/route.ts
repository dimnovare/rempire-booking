/**
 * GET /api/salon/reviews?before=<review id>&limit=6
 * → { rows: [{ id, at, rating, body, name, staff }], more }
 *
 * Every review on show, the barbers' (staff: his name) and the salon's own
 * (staff: null), as the widget we follow lists them (Dim, round 12), newest first, for its page on
 * the booking site («REMPIRE ▾», src/app/[locale]/booking-flow.tsx): the
 * first six when it opens, the next six after the last one given for «Ещё
 * отзывы». The name as the review was signed; no client and no phone go out
 * (src/lib/reviews.ts, salonReviews).
 *
 * POST /api/salon/reviews
 * { rating, staffId ("" or "salon" for the salon itself), name, text, website, ms }
 * → 201 { ok: true }                      kept, waiting for the salon's approval
 *   422 { error: "invalid", field }       rating | staff | name | text | link
 *   429 { error: "too_many" }             the limit per address or per day
 *
 * «Оцените и напишите отзыв» on the salon's page (src/app/[locale]/salon-review.tsx;
 * src/lib/reviews.ts, submitReview). The sender's address is read from the
 * request only to count against the limit, and kept only as a hash.
 */
import { connection } from "next/server";
import { currentBusiness } from "@/lib/business";
import { dbConfigured, query } from "@/lib/db";
import { salonReviews, submitReview } from "@/lib/reviews";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
/** A review is 1000 characters at most; the whole body with its other fields stays well under this. */
const MAX_BODY = 8_000;

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

/** The sender's address as the host gives it: Vercel sets x-real-ip and overwrites x-forwarded-for, so neither can be made up there. */
function addressOf(request: Request): string {
  const h = request.headers;
  return (h.get("x-real-ip") || (h.get("x-forwarded-for") ?? "").split(",")[0] || "").trim().slice(0, 64);
}

export async function POST(request: Request) {
  if (!dbConfigured()) return Response.json({ error: "unavailable" }, { status: 503, headers: HEADERS });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "too_large" }, { status: 413, headers: HEADERS });
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid", field: "body" }, { status: 400, headers: HEADERS });
  }
  const business = await currentBusiness();
  if (!business) return Response.json({ error: "unavailable" }, { status: 503, headers: HEADERS });
  // copied field by field: nothing else from the body reaches the review
  const r = await submitReview(
    query,
    business,
    { rating: body.rating, staffId: body.staffId, name: body.name, text: body.text, website: body.website, ms: body.ms },
    { ip: addressOf(request) },
  );
  if (r.ok) return Response.json({ ok: true }, { status: 201, headers: HEADERS });
  if (r.code === "too_many") return Response.json({ error: "too_many" }, { status: 429, headers: HEADERS });
  return Response.json({ error: "invalid", field: r.field }, { status: 422, headers: HEADERS });
}
