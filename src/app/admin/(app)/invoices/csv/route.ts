/**
 * GET /admin/invoices/csv?m=2026-10&kind=invoices|lines: the month's issued
 * invoices (or their lines) for the accountant, «;» and decimal commas.
 */
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth/current";
import { monthCsv } from "@/lib/billing/statement";
import { dbConfigured, query } from "@/lib/db";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: Request) {
  // a login and today's data: never prerendered (an early 404 would be)
  await connection();
  if (!dbConfigured()) return new Response("Not found", { status: 404, headers: NO_STORE });
  const { business } = await requireAdmin();
  const url = new URL(request.url);
  const m = url.searchParams.get("m") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return new Response("Bad month", { status: 400, headers: NO_STORE });
  const kind = url.searchParams.get("kind") === "lines" ? "lines" : "invoices";
  const body = await monthCsv(query, business, m, kind);
  return new Response(body, {
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rempire-${kind === "lines" ? "arveread" : "arved"}-${m}.csv"`,
    },
  });
}
