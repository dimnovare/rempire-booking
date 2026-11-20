/**
 * GET /admin/invoices/<id>/preview: a draft's PDF as it would print if it
 * were issued now («Посмотреть и отправить счёт»). It has no number and
 * carries the draft stamp. Reading it changes nothing: no number is taken,
 * nothing is saved, no letter is queued (src/lib/billing/send.ts, draftPdf).
 * An invoice that is not a draft has its own PDF at …/pdf.
 */
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth/current";
import { draftPdf } from "@/lib/billing/send";
import { dbConfigured, query } from "@/lib/db";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(_request: Request, ctx: RouteContext<"/admin/invoices/[id]/preview">) {
  // a login and the draft as it is now: never prerendered
  await connection();
  if (!dbConfigured()) return new Response("Not found", { status: 404, headers: NO_STORE });
  const { business } = await requireAdmin();
  const { id } = await ctx.params;
  const pdf = /^[0-9a-f-]{36}$/i.test(id) ? await draftPdf(query, business, id) : null;
  if (!pdf) return new Response("Not found", { status: 404, headers: NO_STORE });
  return new Response(new Uint8Array(pdf.bytes), {
    headers: { ...NO_STORE, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"` },
  });
}
