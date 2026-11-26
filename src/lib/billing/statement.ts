/**
 * C4 and C6: a barber's running statement, and Renat's month across all
 * barbers with a CSV for the accountant (docs/phase-c.md). Read only; built
 * from product_sales, chair_rents and invoices, so it is never out of step.
 *
 * Signs: what the barber owes REMPIRE is positive. A client sale adds the
 * shop price and takes off his 17 %; a product for himself adds its price;
 * the month's rent adds; a minus row takes its sale back.
 */
import type { Business } from "../availability";
import type { Querier } from "../db";
import { amountText, bpText } from "../money";
import { listInvoices, monthMoments, monthRange, type Invoice } from "./invoices";
import { rentOn } from "./parties";

export type MonthSums = {
  clientCount: number;
  clientCents: number;
  commissionCents: number;
  /** products he took for himself, by quantity (done ones, as clientCount) */
  selfCount: number;
  selfCents: number;
  rentCents: number;
  /** clientCents − commissionCents + selfCents + rentCents */
  owedCents: number;
};

export type Statement = MonthSums & {
  month: string;
  invoices: Invoice[];
  /** issued and not paid, credits included (a credit for a paid invoice is money back) */
  openCents: number;
  /** sales of any month that no live invoice holds yet, net of the 17 % */
  unbilledCents: number;
  /**
   * The month's own invoice (a month's invoice, not a credit): a live one
   * (draft, issued, paid) before a credited one, the month's own before a
   * free one. null: there is none yet.
   */
  monthInvoice: Invoice | null;
  /** openCents by the month each invoice is for, oldest first; months that come to 0 left out */
  openMonths: MonthCents[];
  /** unbilledCents by the salon's month each sale was made in, oldest first; months that come to 0 left out */
  unbilledMonths: MonthCents[];
};

/** «2026-10» and an amount */
export type MonthCents = { month: string; cents: number };

const LIVE = "('draft', 'issued', 'paid')";
const LIVE_STATUS = new Set(["draft", "issued", "paid"]);

async function sums(q: Querier, staffId: string, from: Date, to: Date): Promise<Omit<MonthSums, "rentCents" | "owedCents">> {
  const [r] = await q<{ client_n: number; client: number; commission: number; self_n: number; self: number }>(
    `select coalesce(sum(qty) filter (where mode = 'client'), 0)::int as client_n,
            coalesce(sum(total_cents) filter (where mode = 'client'), 0)::int as client,
            coalesce(sum(commission_cents) filter (where mode = 'client'), 0)::int as commission,
            coalesce(sum(qty) filter (where mode = 'self'), 0)::int as self_n,
            coalesce(sum(total_cents) filter (where mode = 'self'), 0)::int as self
       from product_sales where staff_id = $1 and status = 'done' and created_at >= $2 and created_at < $3`,
    [staffId, from, to],
  );
  return { clientCount: r.client_n, clientCents: r.client, commissionCents: r.commission, selfCount: r.self_n, selfCents: r.self };
}

/**
 * Which of a barber's invoices is «the month's»: a month's invoice (not a
 * credit, not discarded) whose period starts in `month`. A live one wins
 * over a credited one, the month's own over a free one (Isolta's imported
 * invoices are free); among equals the list's order (the newest first).
 */
export function pickMonthInvoice<I extends Pick<Invoice, "kind" | "status" | "free" | "periodFrom">>(invoices: I[], month: string): I | null {
  const rank = (i: I) => (LIVE_STATUS.has(i.status) ? 0 : 2) + (i.free ? 1 : 0);
  let best: I | null = null;
  for (const i of invoices) {
    if (i.kind !== "invoice" || i.status === "discarded" || i.periodFrom.slice(0, 7) !== month) continue;
    if (!best || rank(i) < rank(best)) best = i;
  }
  return best;
}

const nonZero = (rows: MonthCents[]) => rows.filter((r) => r.cents !== 0);
const total = (rows: MonthCents[]) => rows.reduce((n, r) => n + r.cents, 0);

/** What a barber owes for a month, and where his invoices stand. */
export async function monthStatement(q: Querier, business: Business, staffId: string, month: string): Promise<Statement> {
  const range = monthRange(month)!;
  const { from, to } = monthMoments(month, business.timezone);
  const s = await sums(q, staffId, from, to);
  const rent = (await rentOn(q, staffId, range.from))?.amountCents ?? 0;
  const all = (await listInvoices(q, business.id, { staffId })).filter((i) => i.status !== "discarded");
  const invoices = all.slice(0, 24);
  // issued and not paid, by the month each is for
  const open = await q<MonthCents>(
    `select to_char(period_from, 'YYYY-MM') as month, coalesce(sum(gross_cents), 0)::int as cents
       from invoices where staff_id = $1 and status not in ('draft', 'discarded') and paid_at is null
      group by 1 order by 1`,
    [staffId],
  );
  // in no live invoice, by the salon's month the sale was made in
  const unbilled = await q<MonthCents>(
    `select to_char(p.created_at at time zone $2::text, 'YYYY-MM') as month, coalesce(sum(p.total_cents - p.commission_cents), 0)::int as cents
       from product_sales p
      where p.staff_id = $1 and p.status = 'done'
        and not exists (select 1 from invoice_lines l join invoices i on i.id = l.invoice_id
                         where l.sale_id = p.id and not l.dropped and i.status in ${LIVE})
      group by 1 order by 1`,
    [staffId, business.timezone],
  );
  return {
    month,
    ...s,
    rentCents: rent,
    owedCents: s.clientCents - s.commissionCents + s.selfCents + rent,
    invoices,
    openCents: total(open),
    unbilledCents: total(unbilled),
    monthInvoice: pickMonthInvoice(all, month),
    openMonths: nonZero(open),
    unbilledMonths: nonZero(unbilled),
  };
}

export type OverviewRow = MonthSums & {
  staffId: string;
  staffName: string;
  receiverName: string | null;
  draftCents: number;
  invoicedCents: number;
  paidCents: number;
  openCents: number;
  failedSales: number;
};

/** Renat's month: one row per barber who sold, rents or was invoiced. */
export async function monthOverview(q: Querier, business: Business, month: string): Promise<OverviewRow[]> {
  const range = monthRange(month)!;
  const { from, to } = monthMoments(month, business.timezone);
  const staff = await q<{ id: string; name: string; active: boolean; receiver: string | null }>(
    `select s.id, s.display_name as name, s.active, r.legal_name as receiver
       from staff s left join invoice_receivers r on r.staff_id = s.id and r.active
      where s.business_id = $1 order by s.sort, s.display_name`,
    [business.id],
  );
  const inv = await q<{ staff_id: string; draft: number; invoiced: number; paid: number }>(
    `select staff_id,
            coalesce(sum(gross_cents) filter (where status = 'draft'), 0)::int as draft,
            coalesce(sum(gross_cents) filter (where status not in ('draft', 'discarded')), 0)::int as invoiced,
            coalesce(sum(gross_cents) filter (where status not in ('draft', 'discarded') and paid_at is not null), 0)::int as paid
       from invoices where business_id = $1 and period_from = $2::date and staff_id is not null group by staff_id`,
    [business.id, range.from],
  );
  const failed = await q<{ staff_id: string; n: number }>(`select staff_id, count(*)::int as n from product_sales where business_id = $1 and sync_status = 'failed' group by staff_id`, [business.id]);
  const byInv = new Map(inv.map((r) => [r.staff_id, r]));
  const byFail = new Map(failed.map((r) => [r.staff_id, r.n]));
  const rows: OverviewRow[] = [];
  for (const st of staff) {
    const s = await sums(q, st.id, from, to);
    const rent = (await rentOn(q, st.id, range.from))?.amountCents ?? 0;
    const i = byInv.get(st.id);
    const row: OverviewRow = {
      staffId: st.id,
      staffName: st.name,
      receiverName: st.receiver,
      ...s,
      rentCents: rent,
      owedCents: s.clientCents - s.commissionCents + s.selfCents + rent,
      draftCents: i?.draft ?? 0,
      invoicedCents: i?.invoiced ?? 0,
      paidCents: i?.paid ?? 0,
      openCents: (i?.invoiced ?? 0) - (i?.paid ?? 0),
      failedSales: byFail.get(st.id) ?? 0,
    };
    // a barber with nothing this month and no company is left out
    if (!st.active && !row.owedCents && !row.invoicedCents && !row.draftCents) continue;
    if (!st.receiver && !row.owedCents && !row.invoicedCents && !row.draftCents && !row.failedSales) continue;
    rows.push(row);
  }
  return rows;
}

/* ---------- the accountant's CSV ---------- */

/**
 * One CSV cell. Text that a spreadsheet would read as a formula (= + - @,
 * a tab or a return first: a receiver's name, a line's text) gets a «'» in
 * front, so the accountant's Excel shows it and never runs it. Our own
 * amounts («-9,83») stay numbers.
 */
export const csvCell = (v: string | number) => {
  let s = String(v ?? "");
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-\d+(,\d+)?$/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const cell = csvCell;
const csv = (rows: (string | number)[][]) => "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
const dmy = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
};

const STATUS_ET: Record<string, string> = { issued: "väljastatud", paid: "tasutud", credited: "krediteeritud" };

/**
 * Invoices issued in a month (by their date), Estonian headers, «;» and
 * decimal commas as Estonian spreadsheets read them. `lines` gives one row
 * per invoice line instead.
 */
export async function monthCsv(q: Querier, business: Business, month: string, what: "invoices" | "lines" = "invoices"): Promise<string> {
  const range = monthRange(month)!;
  const all = await q<{ id: string }>(
    `select id from invoices where business_id = $1 and status not in ('draft', 'discarded') and issued_on between $2::date and $3::date order by issuer_id, issued_on, number`,
    [business.id, range.from, range.to],
  );
  const ids = new Set(all.map((r) => r.id));
  const invoices = (await listInvoices(q, business.id, { issuedOnly: true })).filter((i) => ids.has(i.id)).sort((a, b) => (a.issuedOn! < b.issuedOn! ? -1 : a.issuedOn! > b.issuedOn! ? 1 : (a.number ?? "").localeCompare(b.number ?? "")));
  if (what === "invoices") {
    const head = ["Arve nr", "Liik", "Kuupäev", "Maksetähtaeg", "Periood", "Müüja", "Ostja", "Registrikood", "KMKR", "Summa km-ta", "Käibemaks", "Kokku", "Staatus", "Tasutud", "Krediteerib arvet"];
    return csv([
      head,
      ...invoices.map((i) => [
        i.number ?? "",
        i.kind === "credit" ? "kreeditarve" : "arve",
        dmy(i.issuedOn),
        dmy(i.dueOn),
        `${dmy(i.periodFrom)}–${dmy(i.periodTo)}`,
        i.seller?.name ?? "",
        i.buyer?.name ?? i.receiverName,
        i.buyer?.regCode ?? "",
        i.buyer?.vatNumber ?? "",
        amountText(i.netCents),
        amountText(i.vatCents),
        amountText(i.grossCents),
        STATUS_ET[i.status] ?? i.status,
        i.paidAt ? dmy(new Date(i.paidAt).toISOString()) : "",
        i.creditOfNumber ?? "",
      ]),
    ]);
  }
  const rows: (string | number)[][] = [["Arve nr", "Rida", "Liik", "Kirjeldus", "Kogus", "Hind km-ga", "Allahindlus", "KM %", "Summa km-ta", "Käibemaks", "Kokku"]];
  const KIND: Record<string, string> = { rent: "üür", product: "toode", self: "enda tarbeks", other: "muu" };
  for (const i of invoices) {
    const lines = await q<{ position: number; kind: string; text: string; qty: number; unit_cents: number; discount_cents: number; vat_bp: number; net_cents: number; vat_cents: number; gross_cents: number }>(
      "select position, kind, text, qty, unit_cents, discount_cents, vat_bp, net_cents, vat_cents, gross_cents from invoice_lines where invoice_id = $1 and not dropped order by position",
      [i.id],
    );
    lines.forEach((l, n) =>
      rows.push([i.number ?? "", n + 1, KIND[l.kind] ?? l.kind, l.text, l.qty, amountText(l.unit_cents), amountText(l.discount_cents), bpText(l.vat_bp).replace(" %", ""), amountText(l.net_cents), amountText(l.vat_cents), amountText(l.gross_cents)]),
    );
  }
  return csv(rows);
}
