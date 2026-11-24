/**
 * GET /api/slots?services=<id,id>&staff=<id|any>&from=YYYY-MM-DD&days=62
 * → { tz, offered, days: [{ d, open, s: [[startMs, staffId, extraCents], …] }], next }
 * staffId is the barber «anyone» would get; extraCents is his special-time
 * extra at that start (0 = the usual price), in money: a window priced in
 * percent is already worked out for the chosen services at his prices.
 *
 * One page of days at a time (src/lib/slot-pages.ts): `days` at most 92,
 * from `from` (today when none). `next` is the day the next page starts,
 * null when the horizon (or the last «График до» of those asked for) ends
 * within this one; the booking page asks it only when it needs it.
 */
import { loadAvailability } from "@/lib/availability";
import { currentBusiness } from "@/lib/business";
import { dbConfigured, query } from "@/lib/db";
import { nextPage, pageDays } from "@/lib/slot-pages";
import { isLocalDate, todayIn } from "@/lib/tz";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const services = (url.searchParams.get("services") || "").split(",").filter(Boolean);
  const staff = url.searchParams.get("staff") || "any";
  const days = pageDays(url.searchParams.get("days"));
  const from = url.searchParams.get("from");
  if (!services.length || services.length > 5 || !services.every((s) => UUID_RE.test(s))) {
    return Response.json({ error: "services" }, { status: 400, headers: NO_STORE });
  }
  if (staff !== "any" && !UUID_RE.test(staff)) return Response.json({ error: "staff" }, { status: 400, headers: NO_STORE });
  if (from && !isLocalDate(from)) return Response.json({ error: "from" }, { status: 400, headers: NO_STORE });
  if (!dbConfigured()) return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });

  const business = await currentBusiness();
  if (!business) return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  const start = from || todayIn(business.timezone);
  const r = await loadAvailability(query, {
    business,
    serviceIds: services,
    staffId: staff === "any" ? null : staff,
    from: start,
    days,
  });
  return Response.json(
    {
      tz: business.timezone,
      offered: r.quotes.length > 0,
      days: r.days.map((d) => ({ d: d.date, open: d.open, s: d.slots.map((s) => [s.start, s.staffIds[0], s.extraCents]) })),
      next: nextPage(start, days, r.lastDay),
    },
    { headers: NO_STORE },
  );
}
