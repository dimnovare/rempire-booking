/**
 * POST /api/webhooks/resend: Resend tells us a letter was opened
 * (src/lib/mail-opened.ts). Only «email.opened» is used, for «Открыт.» on a
 * sent invoice. Without RESEND_WEBHOOK_SECRET set it answers 503 and does
 * nothing; a bad or stale signature gets 401. Any other event, or an open
 * of a letter we do not know, is acknowledged with 200 so Resend stops
 * retrying it.
 */
import { dbConfigured, query } from "@/lib/db";
import { openedEvent, recordOpen, verifySvix } from "@/lib/mail-opened";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  const body = await request.text();
  const h = request.headers;
  const signed = verifySvix(secret, { id: h.get("svix-id"), timestamp: h.get("svix-timestamp"), signature: h.get("svix-signature") }, body, Date.now());
  if (!signed) return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400, headers: NO_STORE });
  }
  const open = openedEvent(payload);
  if (!open) return Response.json({ ok: true, used: false }, { headers: NO_STORE });
  if (!dbConfigured()) return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  const matched = await recordOpen(query, open.emailId, open.at);
  return Response.json({ ok: true, used: matched }, { headers: NO_STORE });
}
