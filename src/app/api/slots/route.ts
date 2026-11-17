/**
 * GET /api/slots?services=<id,id>&staff=<id|any>&from=YYYY-MM-DD&days=60
 * → { tz, days: [{ d, open, s: [[startMs, staffId, extraCents], …] }] }
 * staffId is the barber «anyone» would get; extraCents is his special-time
 * extra at that start (0 = the usual price).
 */
import { loadAvailability } from "@/lib/availability";
import { currentBusiness } from "@/lib/business";
import { dbConfigured, query } from "@/lib/db";
import { isLocalDate, todayIn } from "@/lib/tz";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const services = (url.searchParams.get("services") || "").split(",").filter(Boolean);
  const staff = url.searchParams.get("staff") || "any";
  const days = Math.min(Math.max(Number(url.searchParams.get("days") || 60) || 60, 1), 92);
  const from = url.searchParams.get("from");
  if (!services.length || services.length > 5 || !services.every((s) => UUID_RE.test(s))) {
    return Response.json({ error: "services" }, { status: 400, headers: NO_STORE });
  }
  if (staff !== "any" && !UUID_RE.test(staff)) return Response.json({ error: "staff" }, { status: 400, headers: NO_STORE });
  if (from && !isLocalDate(from)) return Response.json({ error: "from" }, { status: 400, headers: NO_STORE });
  if (!dbConfigured()) return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });

  const business = await currentBusiness();
  if (!business) return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  const r = await loadAvailability(query, {
    business,
    serviceIds: services,
    staffId: staff === "any" ? null : staff,
    from: from || todayIn(business.timezone),
    days,
  });
  return Response.json(
    {
      tz: business.timezone,
      offered: r.quotes.length > 0,
      days: r.days.map((d) => ({ d: d.date, open: d.open, s: d.slots.map((s) => [s.start, s.staffIds[0], s.extraCents]) })),
    },
    { headers: NO_STORE },
  );
}
