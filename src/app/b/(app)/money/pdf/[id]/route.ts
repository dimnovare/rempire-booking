/**
 * GET /b/money/pdf/<id>: the barber's own issued invoice as a PDF. Only an
 * invoice to his own column; anything else is «not found».
 */
import { requireStaff } from "@/lib/auth/current";
import { invoicePdf } from "@/lib/billing/send";
import { dbConfigured, query } from "@/lib/db";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(_request: Request, ctx: RouteContext<"/b/money/pdf/[id]">) {
  if (!dbConfigured()) return new Response("Not found", { status: 404, headers: NO_STORE });
  const { business, staff } = await requireStaff();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404, headers: NO_STORE });
  const [own] = await query<{ id: string }>("select id from invoices where id = $1 and business_id = $2 and staff_id = $3", [id, business.id, staff.id]);
  const pdf = own ? await invoicePdf(query, business.id, own.id) : null;
  if (!pdf) return new Response("Not found", { status: 404, headers: NO_STORE });
  return new Response(new Uint8Array(pdf.bytes), {
    headers: { ...NO_STORE, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"` },
  });
}
