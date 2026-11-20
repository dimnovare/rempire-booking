/**
 * POST /admin/invoices/export: «Счета» → «Инструменты» → «Экспорт счетов в
 * таблицу». The body is the list's own question as JSON (status, search,
 * dates, order: src/lib/billing/list.ts, listQueryOf); the answer is that
 * list as an .xlsx file. A POST, not a link: what is searched for stays out
 * of addresses.
 *
 *   200  the file, as a download; X-Rows says how many invoices are in it
 *   403  not from our own pages
 *
 * A login of the admin, as the rest of «Счета», and only from our own
 * pages: the request must name our own host as its origin. Every export is
 * written to the audit log, without its rows (src/lib/billing/export.ts).
 * Nothing is kept on the server.
 */
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth/current";
import { exportInvoices } from "@/lib/billing/export";
import type { ListStatus } from "@/lib/billing/list";
import { dbConfigured } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { XLSX_MIME } from "@/lib/xlsx";
import { getA } from "../../../lang-server";
import { statusWord } from "../common";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
const no = (code: string, status: number) => Response.json({ ok: false, code }, { status, headers: NO_STORE });

/** The page that sent this is one of ours: its origin is the host the request came to. */
function sameSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const STATUSES: ListStatus[] = ["draft", "issued", "overdue", "paid", "credited", "credit"];

export async function POST(request: Request) {
  // a login and today's data: always at request time
  await connection();
  if (!dbConfigured()) return no("not_found", 404);
  if (!sameSite(request)) return no("forbidden", 403);
  const { user, business } = await requireAdmin();
  let asked: unknown = null;
  try {
    asked = await request.json();
  } catch {
    /* no question at all is the whole list */
  }
  const A = await getA();
  const status = Object.fromEntries(STATUSES.map((s) => [s, statusWord(A, s)])) as Record<ListStatus, string>;
  const r = await exportInvoices(business, user, asked, { sheet: A.inv.title, cols: A.inv.xlsx, status }, A.inv.month);
  // the bytes alone, whatever buffer they came in
  return new Response(r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength) as ArrayBuffer, {
    headers: {
      ...NO_STORE,
      "Content-Type": XLSX_MIME,
      "Content-Length": String(r.bytes.byteLength),
      "Content-Disposition": `attachment; filename="rempire-invoices-${todayIn(business.timezone)}.xlsx"`,
      "X-Content-Type-Options": "nosniff",
      "X-Rows": String(r.rows),
    },
  });
}
