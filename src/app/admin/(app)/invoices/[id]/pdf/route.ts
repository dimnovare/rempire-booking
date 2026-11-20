/**
 * GET /admin/invoices/<id>/pdf: an issued invoice's PDF, as it was frozen at
 * «Выставить». Shown in the browser («Печать» prints it from there); with
 * `?dl=1` it comes as a file to keep («Сохранить PDF»).
 */
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth/current";
import { invoicePdf } from "@/lib/billing/send";
import { dbConfigured, query } from "@/lib/db";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: Request, ctx: RouteContext<"/admin/invoices/[id]/pdf">) {
  // a login and the invoice as it is: never prerendered
  await connection();
  if (!dbConfigured()) return new Response("Not found", { status: 404, headers: NO_STORE });
  const { business } = await requireAdmin();
  const { id } = await ctx.params;
  const pdf = /^[0-9a-f-]{36}$/i.test(id) ? await invoicePdf(query, business.id, id) : null;
  if (!pdf) return new Response("Not found", { status: 404, headers: NO_STORE });
  const how = new URL(request.url).searchParams.get("dl") === "1" ? "attachment" : "inline";
  return new Response(new Uint8Array(pdf.bytes), {
    headers: { ...NO_STORE, "Content-Type": "application/pdf", "Content-Disposition": `${how}; filename="${pdf.filename}"` },
  });
}
