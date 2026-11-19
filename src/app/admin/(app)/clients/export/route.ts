/**
 * POST /admin/clients/export: the client list as an .xlsx file («Операции
 * с Excel» → «Выгрузить в Excel»; the owner, 19.11.2026). The body is the
 * list's own question as JSON (query.ts): its search, category, conditions
 * and order. A POST, not a link: what is searched for is a client's name
 * or phone, and those stay out of addresses.
 *
 *   200  the file, as a download; X-Rows says how many clients are in it
 *   403  not the owner, or not from our own pages
 *
 * Only the owner's login, and only from our own pages: the request must
 * name our own host as its origin. The columns are the ones the login
 * keeps in the table, and every export is written to the audit log
 * (src/lib/admin/client-export.ts). Nothing is kept on the server.
 */
import { connection } from "next/server";
import { exportClients } from "@/lib/admin/client-export";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { XLSX_MIME } from "@/lib/xlsx";
import { getA } from "../../../lang-server";
import { filterOf, type ClientQuery } from "../query";

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

export async function POST(request: Request) {
  // a login and today's data: always at request time
  await connection();
  if (!dbConfigured()) return no("not_found", 404);
  if (!sameSite(request)) return no("forbidden", 403);
  const { user, business } = await requireAdmin();
  let asked: ClientQuery | null = null;
  try {
    asked = (await request.json()) as ClientQuery;
  } catch {
    /* no question at all is the whole list */
  }
  const A = await getA();
  const B = A.clients.base;
  const r = await exportClients(business, { id: user.id, role: user.role }, filterOf(asked), { sheet: A.nav.clients, cols: { ...B.cols, sold: B.xlsx.sold, discount: B.xlsx.discount } });
  if (!r.ok) return no(r.code, 403);
  // the bytes alone, whatever buffer they came in
  return new Response(r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength) as ArrayBuffer, {
    headers: {
      ...NO_STORE,
      "Content-Type": XLSX_MIME,
      "Content-Length": String(r.bytes.byteLength),
      "Content-Disposition": `attachment; filename="rempire-clients-${todayIn(business.timezone)}.xlsx"`,
      "X-Content-Type-Options": "nosniff",
      "X-Rows": String(r.rows),
    },
  });
}
