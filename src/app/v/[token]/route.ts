/**
 * GET /v/<token>: the short change link in the SMS reminder (Dim,
 * 17.11.2026), so the reminder stays 2 SMS parts. It only forwards to the
 * visit page, in the language the visit was booked in; the page itself
 * checks the token. Outside the languages, like /admin (src/proxy.ts).
 */
import { currentBusiness } from "@/lib/business";
import { dbConfigured, query } from "@/lib/db";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n";
import { findVisit } from "@/lib/visits";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,100}$/;

export async function GET(_request: Request, ctx: RouteContext<"/v/[token]">) {
  const { token } = await ctx.params;
  if (!TOKEN_RE.test(token)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const business = dbConfigured() ? await currentBusiness() : null;
  const v = business ? await findVisit(query, business.id, token) : null;
  const locale = v && isLocale(v.locale) ? v.locale : DEFAULT_LOCALE;
  return new Response(null, { status: 307, headers: { Location: `/${locale}/visit/${token}`, "Cache-Control": "no-store" } });
}
