/**
 * GET /api/visit/<token>/slots?from=YYYY-MM-DD&days=62 → the free times this
 * visit could move to: the same barber and services, with the visit itself
 * out of the way. The answer has the shape of /api/slots, a page of days at
 * a time with `next` (src/lib/slot-pages.ts), so the booking flow's time
 * step reads both (src/app/[locale]/booking-flow.tsx, `moving`).
 *
 *   200 { tz, offered, days: [{ d, open, s: [[startMs, staffId, extraCents], …] }], next }
 *   400 from        `from` is not a day
 *   404 not_found   no such visit, or it can no longer change
 */
import { currentBusiness } from "@/lib/business";
import { moveSlots } from "@/lib/client-move";
import { dbConfigured } from "@/lib/db";
import { nextPage, pageDays } from "@/lib/slot-pages";
import { isLocalDate, todayIn } from "@/lib/tz";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: Request, ctx: RouteContext<"/api/visit/[token]/slots">) {
  const { token } = await ctx.params;
  const params = new URL(request.url).searchParams;
  const days = pageDays(params.get("days"));
  const from = params.get("from");
  if (from && !isLocalDate(from)) return Response.json({ error: "from" }, { status: 400, headers: HEADERS });
  const business = dbConfigured() ? await currentBusiness() : null;
  const now = Date.now();
  const r = business ? await moveSlots(business, token, days, now, from) : null;
  if (!business || !r) return Response.json({ error: "not_found" }, { status: 404, headers: HEADERS });
  return Response.json(
    {
      tz: business.timezone,
      offered: r.offered,
      days: r.days.map((d) => ({ d: d.date, open: d.open, s: d.slots.map((s) => [s.start, s.staffIds[0], s.extraCents]) })),
      next: nextPage(from || todayIn(business.timezone, now), days, r.lastDay),
    },
    { headers: HEADERS },
  );
}
