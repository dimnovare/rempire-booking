/**
 * GET /api/cron/outbox: plan reminders and send the due messages
 * (src/lib/outbox.ts). Vercel Cron calls it with
 * `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set it answers
 * 503 and does nothing. Safe to call often: claimed rows are locked.
 */
import { timingSafeEqual } from "node:crypto";
import { dbConfigured, query } from "@/lib/db";
import { planInvoiceDrafts } from "@/lib/billing/invoices";
import { stampHeartbeat } from "@/lib/health";
import { runOutbox } from "@/lib/outbox";
import { syncShopSales } from "@/lib/sales";

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
  const now = Date.now();
  // The messages first: reminders and confirmations never wait on the shop.
  // Every run leaves its stamp, a failed one too, for /api/health/cron.
  let result: Awaited<ReturnType<typeof runOutbox>>;
  try {
    result = await runOutbox(query, now);
  } catch (e) {
    await stampHeartbeat(query, "cron", false).catch(() => undefined);
    throw e;
  }
  await stampHeartbeat(query, "cron", true, { sent: result.sent, waiting: result.waiting }).catch(() => undefined);
  // Phase C, after them and each on its own: barbers' sales to the shop
  // (src/lib/sales.ts, capped at SALES.budgetMs) and, from the billing day,
  // last month's invoice drafts (src/lib/billing/invoices.ts).
  const sales = await syncShopSales(query, now).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  const drafts = await planInvoiceDrafts(query, now).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  return Response.json({ ...result, sales, drafts }, { headers: NO_STORE });
}
