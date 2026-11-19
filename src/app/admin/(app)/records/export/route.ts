/**
 * POST /admin/records/export: «Записи» as an .xlsx file («Операции с Excel»
 * → «Выгрузить в Excel»). The body is the list's own question as JSON
 * (question.ts). A POST, not a link: what is searched for is a client's
 * name or phone, and those stay out of addresses.
 *
 *   200  the file, as a download; X-Rows says how many visits are in it
 *   403  no right to it, or not from our own pages
 *
 * Only a login with «Выгружать список записей в Excel», and only from our
 * own pages: the request must name our own host as its origin. Every
 * export is written to the audit log, without its rows
 * (src/lib/admin/records.ts). Nothing is kept on the server.
 */
import { connection } from "next/server";
import { exportRecords } from "@/lib/admin/records";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { XLSX_MIME } from "@/lib/xlsx";
import { getA } from "../../../lang-server";
import { questionOf } from "../question";

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
  let asked: unknown = null;
  try {
    asked = await request.json();
  } catch {
    /* no question at all is the whole list */
  }
  const A = await getA();
  const R = A.records;
  const r = await exportRecords(business, user, questionOf(asked as Parameters<typeof questionOf>[0]), {
    sheet: R.title,
    cols: R.xlsx,
    status: A.visit.status,
    source: R.sources,
    byClient: R.madeByClient,
    bySalon: R.madeBySalon,
    byImport: R.madeByImport,
    pick: A.pick,
  });
  if (!r.ok) return no(r.code, 403);
  // the bytes alone, whatever buffer they came in
  return new Response(r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength) as ArrayBuffer, {
    headers: {
      ...NO_STORE,
      "Content-Type": XLSX_MIME,
      "Content-Length": String(r.bytes.byteLength),
      "Content-Disposition": `attachment; filename="rempire-records-${todayIn(business.timezone)}.xlsx"`,
      "X-Content-Type-Options": "nosniff",
      "X-Rows": String(r.rows),
    },
  });
}
