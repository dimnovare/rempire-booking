/** GET /api/ics/<token>?lang=ru → the visit as a calendar file. */
import { currentBusiness } from "@/lib/business";
import { dbConfigured, query } from "@/lib/db";
import { isLocale } from "@/lib/i18n";
import { visitIcsFor } from "@/lib/ics";
import { findVisit } from "@/lib/visits";

export async function GET(request: Request, ctx: RouteContext<"/api/ics/[token]">) {
  const { token } = await ctx.params;
  if (!dbConfigured()) return new Response("Not found", { status: 404 });
  const business = await currentBusiness();
  const v = business ? await findVisit(query, business.id, token) : null;
  if (!v || !business) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang");
  const locale = isLocale(lang) ? lang : isLocale(v.locale) ? v.locale : "ru";
  const ics = visitIcsFor(v, { businessName: business.name, origin: url.origin, token, locale });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="rempire.ics"',
      "Cache-Control": "no-store",
    },
  });
}
