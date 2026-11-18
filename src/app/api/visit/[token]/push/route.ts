/**
 * The client's reminder as a notification (docs/apps.md, step 4).
 *
 *   POST   /api/visit/<token>/push  { subscription, label }  this phone is on
 *   DELETE /api/visit/<token>/push  { endpoint }             this phone is off
 *
 * The token is the client's own visit link, so no login is needed. The
 * phone is turned on for that one visit and no other: a visit link never
 * reaches past its own visit (src/lib/client-push.ts, migration 013).
 *
 *   200 { ok: true }
 *   404 not_found      the link opens no visit
 *   409 over           the visit is cancelled, done or already started
 *   409 off            no keys on this server, or the salon reminds by SMS only
 *   422 subscription   not a browser's push subscription
 */
import { currentBusiness } from "@/lib/business";
import { clientPushOffered, removeClientSubscription, saveClientSubscription } from "@/lib/client-push";
import { dbConfigured, query } from "@/lib/db";
import { cleanSubscription } from "@/lib/push";
import { findVisit } from "@/lib/visits";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const answer = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: HEADERS });

/** The business and the one visit a link opens, or null. */
async function which(token: string) {
  const business = dbConfigured() ? await currentBusiness() : null;
  const v = business ? await findVisit(query, business.id, token) : null;
  return business && v ? { business, visitId: v.id, ahead: (v.status === "booked" || v.status === "pending") && Date.parse(v.startsAt) > Date.now() } : null;
}

export async function POST(request: Request, ctx: RouteContext<"/api/visit/[token]/push">) {
  const { token } = await ctx.params;
  const w = await which(token);
  if (!w) return answer({ error: "not_found" }, 404);
  if (!clientPushOffered(w.business.settings)) return answer({ error: "off" }, 409);
  // nothing left to remind of: an old link turns no phone on
  if (!w.ahead) return answer({ error: "over" }, 409);
  const body = (await request.json().catch(() => null)) as { subscription?: unknown; label?: unknown } | null;
  const sub = cleanSubscription(body?.subscription, body?.label);
  if (!sub) return answer({ error: "subscription" }, 422);
  await saveClientSubscription(query, w.business.id, w.visitId, sub);
  return answer({ ok: true });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/visit/[token]/push">) {
  const { token } = await ctx.params;
  const w = await which(token);
  if (!w) return answer({ error: "not_found" }, 404);
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint === "string" && body.endpoint) await removeClientSubscription(query, w.visitId, body.endpoint);
  return answer({ ok: true });
}
