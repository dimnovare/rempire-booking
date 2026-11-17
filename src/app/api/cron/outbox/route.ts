/**
 * GET /api/cron/outbox: plan reminders and send the due messages
 * (src/lib/outbox.ts). Vercel Cron calls it with
 * `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set it answers
 * 503 and does nothing. Safe to call often: claimed rows are locked.
 */
import { timingSafeEqual } from "node:crypto";
import { dbConfigured, query } from "@/lib/db";
import { runOutbox } from "@/lib/outbox";

const NO_STORE = { "Cache-Control": "no-store" };

function sameSecret(got: string, want: string): boolean {
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  if (!sameSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  if (!dbConfigured()) return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  const result = await runOutbox(query, Date.now());
  return Response.json(result, { headers: NO_STORE });
}
