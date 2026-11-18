/**
 * GET /api/visit/<token> → the client's visit as it is now, for the booking
 * page's «Ваша запись» card (docs/apps.md). The device remembers the visit
 * it booked; this says whether it still stands and when, after a move or a
 * cancel on another device. The token is the client's own link, as for the
 * visit page and the calendar file; no name or phone goes out.
 */
import { currentBusiness } from "@/lib/business";
import { dbConfigured, query } from "@/lib/db";
import { findVisit } from "@/lib/visits";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(_request: Request, ctx: RouteContext<"/api/visit/[token]">) {
  const { token } = await ctx.params;
  const business = dbConfigured() ? await currentBusiness() : null;
  const v = business ? await findVisit(query, business.id, token) : null;
  if (!v) return Response.json({ error: "not_found" }, { status: 404, headers: HEADERS });
  return Response.json(
    { status: v.status, startsAt: v.startsAt, endsAt: v.endsAt, staffId: v.staffId, anyStaff: v.anyStaff, serviceIds: v.services.map((s) => s.serviceId) },
    { headers: HEADERS },
  );
}
