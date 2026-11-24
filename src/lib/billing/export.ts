/**
 * «Счета» for the pages of the section, and «Экспорт счетов в таблицу».
 *
 *   sectionRows      every invoice of the business as a list row
 *                    (src/lib/billing/list.ts), for the list, the desk, the
 *                    reports and a receiver's own page;
 *   exportInvoices   the list as it was asked for (status, search, period,
 *                    order), every page of it, as an .xlsx file. Each export
 *                    leaves an audit row with who and how many rows, never
 *                    the rows, as the other exports do (src/lib/admin/records.ts).
 */
import type { Business } from "../availability";
import { query, withTx, type Querier } from "../db";
import { todayIn } from "../tz";
import { writeXlsx, type XCell } from "../xlsx";
import { listInvoices, monthRange, type Invoice } from "./invoices";
import { filterRows, listQueryOf, listStatus, sortRows, type ListRow, type ListStatus } from "./list";
import { referenceNumber } from "./reference";

const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");

/** «октябрь 2026» for the month an invoice bills; the page gives the words. */
export type MonthWord = (d: Date) => string;

export function rowOf(i: Invoice & { receiverKind?: string }, today: string, month?: MonthWord): ListRow | null {
  const status = listStatus(i, today);
  if (!status) return null;
  const range = i.free ? null : monthRange(i.periodFrom.slice(0, 7));
  return {
    id: i.id,
    status,
    receiverId: i.receiverId,
    // as it was printed; a draft shows the receiver as he is now
    receiver: i.buyer?.name ?? i.receiverName,
    person: i.receiverKind === "person",
    sub: [i.staffName, range && month ? month(new Date(`${range.from}T12:00:00Z`)) : ""].filter(Boolean).join(", "),
    number: i.number ?? "",
    reference: referenceNumber(i.number),
    date: i.issuedOn ?? "",
    due: i.kind === "invoice" ? (i.dueOn ?? "") : "",
    netCents: i.netCents,
    vatCents: i.vatCents,
    grossCents: i.grossCents,
  };
}

export async function sectionRows(q: Querier, business: Pick<Business, "id" | "timezone">, month?: MonthWord, now = Date.now()): Promise<{ rows: ListRow[]; today: string }> {
  const today = todayIn(business.timezone, now);
  const [invoices, kinds] = await Promise.all([listInvoices(q, business.id), q<{ id: string; kind: string }>("select id, kind from invoice_receivers where business_id = $1", [business.id])]);
  const kindOf = new Map(kinds.map((k) => [k.id, k.kind]));
  const rows = invoices.map((i) => rowOf({ ...i, receiverKind: kindOf.get(i.receiverId) }, today, month)).filter((r): r is ListRow => !!r);
  return { rows, today };
}

export type ExportWords = {
  sheet: string;
  cols: { status: string; receiver: string; number: string; reference: string; date: string; due: string; net: string; vat: string; gross: string };
  status: Record<ListStatus, string>;
};

export const INVOICES_EXPORT_MAX = 50_000;

export type InvoicesExported = { ok: true; bytes: Uint8Array; rows: number };

/** The asked list as a sheet: sums as numbers (euros), dates as «19.11.2026». */
export async function exportInvoices(business: Business, by: { id: string }, raw: unknown, words: ExportWords, month?: MonthWord, now = Date.now()): Promise<InvoicesExported> {
  const asked = listQueryOf(raw);
  const { rows: all, today } = await sectionRows(query, business, month, now);
  const rows = sortRows(filterRows(all, asked, today), asked.sort, today).slice(0, INVOICES_EXPORT_MAX);
  const C = words.cols;
  const euros = (cents: number) => cents / 100;
  const bytes = writeXlsx({
    name: words.sheet,
    header: [C.status, C.receiver, C.number, C.reference, C.date, C.due, C.net, C.vat, C.gross],
    rows: rows.map((r): XCell[] => [words.status[r.status], r.receiver, r.number, r.reference, dmy(r.date), dmy(r.due), euros(r.netCents), euros(r.vatCents), euros(r.grossCents)]),
    widths: [14, 36, 20, 14, 12, 12, 12, 12, 12],
  });
  await withTx(async (tx) => {
    await tx(`insert into audit (actor, entity, action, after) values ($1, 'invoice', 'export', $2::jsonb)`, [by.id, JSON.stringify({ by: "admin", rows: rows.length, status: asked.status || "all", from: asked.from || null, to: asked.to || null })]);
  });
  return { ok: true, bytes, rows: rows.length };
}
