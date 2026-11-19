/**
 * «Выгрузить в Excel»: the client list as an .xlsx file (the owner,
 * 19.11.2026). The clients are the ones the list shows with its search and
 * conditions (the same `clientWhere`), every page of them, in the list's
 * order; the columns are the ones this login keeps in the table
 * (client-columns.ts), the name first.
 *
 * **Only with «Выгружать список клиентов»** (the owner's login started
 * with it, and no other). The file holds every client's phone and e-mail,
 * so each export is written to the audit log: who, when, how many rows and
 * which columns. Never the rows themselves. A login that does not see
 * phones and e-mails in the list gets a file without those two columns,
 * and only the clients it sees.
 *
 * The file is made in memory and handed back as bytes; nothing is kept on
 * the server.
 */
import { can, type Holder } from "../auth/rights";
import type { Business } from "../availability";
import { withTx } from "../db";
import { excelSerial, writeXlsx, type XCell } from "../xlsx";
import { listClientColumns, type ClientColumn } from "./client-columns";
import { clientRows, clientWhere, type ClientFilter, type ClientRow } from "./clients";

/** Rows in one file, at most. A salon's base is a few thousand. */
export const EXPORT_MAX = 50_000;

/** The words of the file, in the login's language: the tab's name and each column's head. */
export type ExportWords = { sheet: string; cols: Record<ClientColumn | "name", string> };

export type Exported = { ok: true; bytes: Uint8Array; rows: number; columns: ("name" | ClientColumn)[] } | { ok: false; code: "forbidden" };

const WIDTH: Record<ClientColumn | "name", number> = { name: 30, phone: 18, email: 30, sold: 12, visits: 10, discount: 10, last: 18, first: 18 };

/** One client's cell in a column: money in euros, the discount in percent, a visit as a real date in the salon's time. */
function cell(c: ClientRow, col: ClientColumn | "name", tz: string): XCell {
  if (col === "name") return c.name;
  if (col === "phone") return c.phone;
  if (col === "email") return c.email;
  if (col === "sold") return c.soldCents / 100;
  if (col === "visits") return c.visits;
  if (col === "discount") return c.discountPct;
  const at = col === "last" ? c.lastVisit : c.firstVisit;
  return at == null ? null : { dateTime: excelSerial(at, tz) };
}

/**
 * The filtered list as an .xlsx file, and the audit row about it. `by` is
 * the login that asks: its rights decide, its columns are the file's.
 */
export async function exportClients(business: Business, by: Holder & { id: string }, filter: ClientFilter, words: ExportWords, now = Date.now()): Promise<Exported> {
  if (!can(by, "clients.export")) return { ok: false, code: "forbidden" };
  const contacts = can(by, "clients.list_contacts");
  return withTx<Exported>(async (tx) => {
    const columns: ("name" | ClientColumn)[] = ["name", ...(await listClientColumns(tx, by.id)).filter((c) => contacts || (c !== "phone" && c !== "email"))];
    const rows = await clientRows(tx, clientWhere(business.id, filter, now, business.timezone, by), filter, EXPORT_MAX, 0, now);
    const bytes = writeXlsx({
      name: words.sheet,
      header: columns.map((c) => words.cols[c]),
      rows: rows.map((r) => columns.map((c) => cell(r, c, business.timezone))),
      widths: columns.map((c) => WIDTH[c]),
    });
    await tx(`insert into audit (actor, entity, action, after) values ($1, 'client', 'export', $2::jsonb)`, [by.id, JSON.stringify({ by: "admin", rows: rows.length, columns })]);
    return { ok: true, bytes, rows: rows.length, columns };
  });
}
