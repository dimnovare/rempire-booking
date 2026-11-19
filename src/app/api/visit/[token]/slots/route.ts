/**
 * GET /api/visit/<token>/slots?days=60 → the free times this visit could
 * move to: the same barber and services, with the visit itself out of the
 * way. The answer has the shape of /api/slots, so the booking flow's time
 * step reads both (src/app/[locale]/booking-flow.tsx, `moving`).
 *
 *   200 { tz, offered, days: [{ d, open, s: [[startMs, staffId, extraCents], …] }] }
 *   404 not_found   no such visit, or it can no longer change
 */
import { currentBusiness } from "@/lib/business";
import { moveSlots } from "@/lib/client-move";
import { dbConfigured } from "@/lib/db";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: Request, ctx: RouteContext<"/api/visit/[token]/slots">) {
  const { token } = await ctx.params;
  const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days") || 60) || 60, 1), 92);
  const business = dbConfigured() ? await currentBusiness() : null;
  const r = business ? await moveSlots(business, token, days) : null;
  if (!business || !r) return Response.json({ error: "not_found" }, { status: 404, headers: HEADERS });
  return Response.json(
    {
      tz: business.timezone,
      offered: r.offered,
      days: r.days.map((d) => ({ d: d.date, open: d.open, s: d.slots.map((s) => [s.start, s.staffIds[0], s.extraCents]) })),
    },
    { headers: HEADERS },
  );
}
