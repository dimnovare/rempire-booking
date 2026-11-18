/**
 * C5: REMPIRE's invoices to the barbers, replacing Isolta (decision 7;
 * docs/phase-c.md).
 *
 *   draft      made on the billing day for the month before (planInvoiceDrafts,
 *              from the cron), or by Renat's «Собрать черновики». One per
 *              receiver and month: the chair rent, every sale not billed yet
 *              (a client sale with the 17 % as its discount, a product taken
 *              for himself at the purchase price, Renat's minus rows).
 *              Renat changes, adds or takes off lines.
 *   issued     «Выставить»: the next number of the issuer's series, from
 *              invoice_counters in the same transaction (no gaps, no twins),
 *              both parties frozen as printed, the PDF letter queued in the
 *              outbox. Never edited again.
 *   paid       «Оплачен» when the money is in.
 *   credited   a credit invoice (its own number, every line negated) took it
 *              back. Its sales and its month are free again for a new draft.
 *   discarded  a draft thrown away. Nothing is deleted.
 *
 * VAT (decision 13): a line carries the issuer's rate only when the issuer is
 * VAT-registered and the receiver's vat_mode is 'vat'; a product line takes
 * the rate it was sold at. Every amount is what the barber pays, VAT inside
 * (src/lib/money.ts), so «no VAT» changes the split, not the total.
 */
import { getBusinessById, type Business } from "../availability";
import { query, withTx, type Querier } from "../db";
import { lineAmounts } from "../money";
import { addDays, localParts, startOfDay, todayIn } from "../tz";
import { TEST_NUMBER_PREFIX, testRun } from "../test-run";
import { counterYear, formatNumber, issuerById, listReceivers, receiverById, rentOn, type Issuer, type Receiver } from "./parties";

type Env = Record<string, string | undefined>;

export type InvoiceStatus = "draft" | "issued" | "paid" | "credited" | "discarded";
export type LineKind = "rent" | "product" | "self" | "other";

export type Party = { name: string; regCode: string; vatNumber: string; address: string; email: string; phone?: string; iban?: string; bankName?: string; note?: string };

export type InvoiceLine = {
  id: string;
  position: number;
  kind: LineKind;
  text: string;
  qty: number;
  unitCents: number;
  discountCents: number;
  vatBp: number;
  grossCents: number;
  netCents: number;
  vatCents: number;
  saleId: string | null;
  rentMonth: string | null;
  dropped: boolean;
};

export type Invoice = {
  id: string;
  issuerId: string;
  receiverId: string;
  receiverName: string;
  staffId: string | null;
  staffName: string | null;
  kind: "invoice" | "credit";
  creditOf: string | null;
  creditOfNumber: string | null;
  creditedBy: string | null;
  status: InvoiceStatus;
  number: string | null;
  periodFrom: string;
  periodTo: string;
  issuedOn: string | null;
  dueOn: string | null;
  seller: Party | null;
  buyer: Party | null;
  locale: "ru" | "et" | "en";
  netCents: number;
  vatCents: number;
  grossCents: number;
  note: string;
  sentAt: string | null;
  paidAt: string | null;
  emailStatus: string | null;
};

type Fail<C extends string = string> = { ok: false; code: C };

/* ---------- months ---------- */

const pad = (n: number) => String(n).padStart(2, "0");

/** «2026-10» → its first and last day. */
export function monthRange(ym: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12 || y < 2000 || y > 2999) return null;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${pad(last)}` };
}

export const monthOf = (date: string) => date.slice(0, 7);

export function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** The moments a month starts and ends on the salon's clock. */
export function monthMoments(ym: string, tz: string): { from: Date; to: Date } {
  const r = monthRange(ym)!;
  return { from: new Date(startOfDay(r.from, tz)), to: new Date(startOfDay(addDays(r.to, 1), tz)) };
}

/* ---------- reading ---------- */

type InvoiceRow = {
  id: string;
  issuer_id: string;
  receiver_id: string;
  receiver_name: string;
  staff_id: string | null;
  staff_name: string | null;
  kind: "invoice" | "credit";
  credit_of: string | null;
  credit_of_number: string | null;
  credited_by: string | null;
  status: InvoiceStatus;
  number: string | null;
  period_from: string;
  period_to: string;
  issued_on: string | null;
  due_on: string | null;
  seller: Party | null;
  buyer: Party | null;
  locale: "ru" | "et" | "en";
  net_cents: number;
  vat_cents: number;
  gross_cents: number;
  note: string;
  sent_at: Date | null;
  paid_at: Date | null;
  email_status: string | null;
};

const INVOICE_SQL = `
  select i.id, i.issuer_id, i.receiver_id, r.legal_name as receiver_name, i.staff_id, s.display_name as staff_name,
         i.kind, i.credit_of, o.number as credit_of_number, c.id as credited_by, i.status, i.number,
         to_char(i.period_from, 'YYYY-MM-DD') as period_from, to_char(i.period_to, 'YYYY-MM-DD') as period_to,
         to_char(i.issued_on, 'YYYY-MM-DD') as issued_on, to_char(i.due_on, 'YYYY-MM-DD') as due_on,
         i.seller, i.buyer, i.locale, i.net_cents, i.vat_cents, i.gross_cents, i.note, i.sent_at, i.paid_at,
         (select n.status from notifications n where n.kind = 'invoice' and n.payload->>'invoiceId' = i.id::text order by n.created_at desc limit 1) as email_status
    from invoices i
    join invoice_receivers r on r.id = i.receiver_id
    left join staff s on s.id = i.staff_id
    left join invoices o on o.id = i.credit_of
    left join invoices c on c.credit_of = i.id`;

const invoiceOf = (r: InvoiceRow): Invoice => ({
  id: r.id,
  issuerId: r.issuer_id,
  receiverId: r.receiver_id,
  receiverName: r.receiver_name,
  staffId: r.staff_id,
  staffName: r.staff_name,
  kind: r.kind,
  creditOf: r.credit_of,
  creditOfNumber: r.credit_of_number,
  creditedBy: r.credited_by,
  status: r.status,
  number: r.number,
  periodFrom: r.period_from,
  periodTo: r.period_to,
  issuedOn: r.issued_on,
  dueOn: r.due_on,
  seller: r.seller,
  buyer: r.buyer,
  locale: r.locale,
  netCents: r.net_cents,
  vatCents: r.vat_cents,
  grossCents: r.gross_cents,
  note: r.note,
  sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
  paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
  emailStatus: r.email_status,
});

type LineRow = {
  id: string;
  position: number;
  kind: LineKind;
  text: string;
  qty: number;
  unit_cents: number;
  discount_cents: number;
  vat_bp: number;
  gross_cents: number;
  net_cents: number;
  vat_cents: number;
  sale_id: string | null;
  rent_month: string | null;
  dropped: boolean;
};

const lineOf = (r: LineRow): InvoiceLine => ({
  id: r.id,
  position: r.position,
  kind: r.kind,
  text: r.text,
  qty: r.qty,
  unitCents: r.unit_cents,
  discountCents: r.discount_cents,
  vatBp: r.vat_bp,
  grossCents: r.gross_cents,
  netCents: r.net_cents,
  vatCents: r.vat_cents,
  saleId: r.sale_id,
  rentMonth: r.rent_month,
  dropped: r.dropped,
});

export async function invoiceById(q: Querier, businessId: string, id: string): Promise<Invoice | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await q<InvoiceRow>(`${INVOICE_SQL} where i.id = $1 and i.business_id = $2`, [id, businessId]);
  return r ? invoiceOf(r) : null;
}

export async function invoiceLines(q: Querier, invoiceId: string, withDropped = false): Promise<InvoiceLine[]> {
  const rows = await q<LineRow>(
    `select id, position, kind, text, qty, unit_cents, discount_cents, vat_bp, gross_cents, net_cents, vat_cents, sale_id,
            to_char(rent_month, 'YYYY-MM-DD') as rent_month, dropped
       from invoice_lines where invoice_id = $1 ${withDropped ? "" : "and not dropped"} order by position`,
    [invoiceId],
  );
  return rows.map(lineOf);
}

/** Invoices for a month (by the month they bill), or one barber's, newest first. */
export async function listInvoices(q: Querier, businessId: string, opts: { month?: string; staffId?: string; issuedOnly?: boolean } = {}): Promise<Invoice[]> {
  const where = ["i.business_id = $1"];
  const params: unknown[] = [businessId];
  if (opts.month) {
    const r = monthRange(opts.month);
    if (r) {
      params.push(r.from);
      where.push(`i.period_from = $${params.length}::date`);
    }
  }
  if (opts.staffId) {
    params.push(opts.staffId);
    where.push(`i.staff_id = $${params.length}`);
  }
  if (opts.issuedOnly) where.push("i.status not in ('draft', 'discarded')");
  const rows = await q<InvoiceRow>(`${INVOICE_SQL} where ${where.join(" and ")} order by i.period_from desc, i.number desc nulls first, r.legal_name`, params);
  return rows.map(invoiceOf);
}

/* ---------- drafts ---------- */

/** The VAT rate of a line on this receiver's invoices from this issuer. */
export function vatFor(issuer: Pick<Issuer, "vatNumber" | "vatBp">, receiver: Pick<Receiver, "vatMode">, saleVatBp?: number): number {
  if (!issuer.vatNumber || receiver.vatMode === "none") return 0;
  return saleVatBp ?? issuer.vatBp;
}

const LIVE = "('draft', 'issued', 'paid')";

/** Estonian with an English line, as the PDF (the accountant reads Estonian). */
const RENT_TEXT = (month: string) => `Töökoha üür ${month.slice(5, 7)}.${month.slice(0, 4)} / Chair rent`;
const SELF_TEXT = (name: string) => `${name} (enda tarbeks / for own use)`.slice(0, 200);
/** the test run: the shop had no purchase price, so the line is 0 € and says so */
const SELF_NO_PURCHASE_TEXT = (name: string) => `${name} (enda tarbeks, ostuhind puudub / for own use, no purchase price)`.slice(0, 200);

type NewLine = { kind: LineKind; text: string; qty: number; unitCents: number; discountCents: number; vatBp: number; saleId?: string | null; rentMonth?: string | null };

async function insertLines(tx: Querier, invoiceId: string, lines: NewLine[], start = 0) {
  for (const [i, l] of lines.entries()) {
    const a = lineAmounts(l);
    await tx(
      `insert into invoice_lines (invoice_id, position, kind, text, qty, unit_cents, discount_cents, vat_bp, gross_cents, net_cents, vat_cents, sale_id, rent_month)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::date)`,
      [invoiceId, start + i, l.kind, l.text.slice(0, 200), l.qty, l.unitCents, l.discountCents, l.vatBp, a.gross, a.net, a.vat, l.saleId ?? null, l.rentMonth ?? null],
    );
  }
}

/** Sum the lines that count into the invoice. */
async function retotal(tx: Querier, invoiceId: string) {
  await tx(
    `update invoices i set net_cents = t.net, vat_cents = t.vat, gross_cents = t.gross, updated_at = now()
       from (select coalesce(sum(net_cents), 0)::int as net, coalesce(sum(vat_cents), 0)::int as vat, coalesce(sum(gross_cents), 0)::int as gross
               from invoice_lines where invoice_id = $1 and not dropped) t
      where i.id = $1`,
    [invoiceId],
  );
}

async function defaultIssuer(q: Querier, businessId: string): Promise<Issuer | null> {
  const [r] = await q<{ id: string }>("select id from invoice_issuers where business_id = $1 and is_default and active", [businessId]);
  return r ? issuerById(q, businessId, r.id) : null;
}

export type DraftResult = { ok: true; id: string } | { ok: true; id: null; reason: "nothing" | "exists" } | Fail<"no_issuer" | "no_receiver">;

/**
 * A draft for one receiver and month: the rent, then every sale of his not
 * billed yet up to the end of that month (older ones a credit freed included).
 */
export async function buildDraft(business: Business, receiverId: string, month: string, actor: string | null): Promise<DraftResult> {
  const range = monthRange(month);
  if (!range) return { ok: false, code: "no_receiver" };
  return withTx(async (tx) => {
    const receiver = await receiverById(tx, business.id, receiverId);
    if (!receiver || !receiver.active) return { ok: false as const, code: "no_receiver" as const };
    // one draft at a time per barber: his sales go into one place
    if (receiver.staffId) await tx("select 1 from staff where id = $1 for update", [receiver.staffId]);
    const issuer = receiver.issuerId ? await issuerById(tx, business.id, receiver.issuerId) : await defaultIssuer(tx, business.id);
    if (!issuer || !issuer.active) return { ok: false as const, code: "no_issuer" as const };
    const [exists] = await tx<{ id: string }>(`select id from invoices where receiver_id = $1 and period_from = $2::date and kind = 'invoice' and status in ${LIVE}`, [receiverId, range.from]);
    if (exists) return { ok: true as const, id: null, reason: "exists" as const };

    const lines: NewLine[] = [];
    if (receiver.staffId) {
      const rent = await rentOn(tx, receiver.staffId, range.from);
      const [billed] = await tx(
        `select 1 from invoice_lines l join invoices i on i.id = l.invoice_id
          where i.staff_id = $1 and l.kind = 'rent' and l.rent_month = $2::date and not l.dropped and i.status in ${LIVE}`,
        [receiver.staffId, range.from],
      );
      if (rent && rent.amountCents > 0 && !billed) {
        lines.push({ kind: "rent", text: RENT_TEXT(range.from), qty: 1, unitCents: rent.amountCents, discountCents: 0, vatBp: vatFor(issuer, receiver), rentMonth: range.from });
      }
      const end = new Date(startOfDay(addDays(range.to, 1), business.timezone));
      const sales = await tx<{ id: string; mode: "client" | "self"; name: string; qty: number; unit_cents: number; vat_bp: number; commission_cents: number; purchase_cents: number | null }>(
        `select p.id, p.mode, p.name, p.qty, p.unit_cents, p.vat_bp, p.commission_cents, p.purchase_cents from product_sales p
          where p.staff_id = $1 and p.status = 'done' and p.created_at < $2
            and not exists (select 1 from invoice_lines l join invoices i on i.id = l.invoice_id
                             where l.sale_id = p.id and not l.dropped and i.status in ${LIVE})
          order by p.created_at`,
        [receiver.staffId, end],
      );
      for (const s of sales) {
        lines.push({
          kind: s.mode === "self" ? "self" : "product",
          text: s.mode === "self" ? (s.purchase_cents == null ? SELF_NO_PURCHASE_TEXT(s.name) : SELF_TEXT(s.name)) : s.name,
          qty: s.qty,
          unitCents: s.unit_cents,
          discountCents: s.commission_cents,
          vatBp: vatFor(issuer, receiver, s.vat_bp),
          saleId: s.id,
        });
      }
    }
    if (!lines.length) return { ok: true as const, id: null, reason: "nothing" as const };
    const [inv] = await tx<{ id: string }>(
      `insert into invoices (business_id, issuer_id, receiver_id, staff_id, period_from, period_to, locale, created_by)
       values ($1, $2, $3, $4, $5::date, $6::date, $7, $8) returning id`,
      [business.id, issuer.id, receiver.id, receiver.staffId, range.from, range.to, receiver.locale, actor && /^[0-9a-f-]{36}$/i.test(actor) ? actor : null],
    );
    await insertLines(tx, inv.id, lines);
    await retotal(tx, inv.id);
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'invoice', $2, 'draft', $3::jsonb)`, [actor ?? "cron", inv.id, JSON.stringify({ month, lines: lines.length })]);
    return { ok: true as const, id: inv.id };
  });
}

/** «Собрать черновики»: a draft for every active barber receiver that has something for the month. */
export async function makeDrafts(business: Business, month: string, actor: string | null): Promise<{ made: number; exists: number; nothing: number; problems: { receiver: string; code: string }[] }> {
  const out = { made: 0, exists: 0, nothing: 0, problems: [] as { receiver: string; code: string }[] };
  for (const r of await listReceivers(query, business.id)) {
    if (!r.active || !r.staffId) continue;
    const d = await buildDraft(business, r.id, month, actor);
    if (!d.ok) out.problems.push({ receiver: r.legalName, code: d.code });
    else if (d.id !== null) out.made++;
    else if (d.reason === "exists") out.exists++;
    else out.nothing++;
  }
  return out;
}

/**
 * The cron: from the billing day on, the month before gets its drafts, once.
 * A draft Renat discarded is not made again by itself.
 */
export async function planInvoiceDrafts(q: Querier, now = Date.now()): Promise<number> {
  let made = 0;
  for (const b of await q<{ id: string }>("select id from businesses")) {
    const business = await getBusinessById(q, b.id);
    if (!business) continue;
    const today = todayIn(business.timezone, now);
    if (Number(today.slice(8, 10)) < business.settings.billing_day) continue;
    const month = shiftMonth(monthOf(today), -1);
    const range = monthRange(month)!;
    const due = await q<{ id: string }>(
      `select r.id from invoice_receivers r
        where r.business_id = $1 and r.active and r.staff_id is not null
          and not exists (select 1 from invoices i where i.receiver_id = r.id and i.period_from = $2::date and i.kind = 'invoice')`,
      [business.id, range.from],
    );
    for (const r of due) {
      const d = await buildDraft(business, r.id, month, null);
      if (d.ok && d.id) made++;
    }
  }
  return made;
}

/* ---------- changing a draft ---------- */

export type LineInput = { text: string; qty: number; unitCents: number; discountCents: number };

async function lockDraft(tx: Querier, businessId: string, invoiceId: string) {
  const [inv] = await tx<{ id: string; status: InvoiceStatus; issuer_id: string; receiver_id: string }>(
    "select id, status, issuer_id, receiver_id from invoices where id = $1 and business_id = $2 for update",
    [invoiceId, businessId],
  );
  return inv && inv.status === "draft" ? inv : null;
}

function cleanLine(l: LineInput): LineInput | null {
  const text = String(l.text ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const qty = Number(l.qty);
  const unit = Number(l.unitCents);
  const disc = Number(l.discountCents ?? 0);
  if (!text || !Number.isInteger(qty) || qty === 0 || Math.abs(qty) > 999) return null;
  if (!Number.isInteger(unit) || Math.abs(unit) > 10_000_000 || !Number.isInteger(disc) || Math.abs(disc) > 10_000_000) return null;
  return { text, qty, unitCents: unit, discountCents: disc };
}

export async function updateDraftLine(business: Business, lineId: string, input: LineInput, actor: string): Promise<{ ok: true } | Fail<"invalid" | "not_draft">> {
  const l = cleanLine(input);
  if (!l || !/^[0-9a-f-]{36}$/i.test(lineId)) return { ok: false, code: "invalid" };
  return withTx(async (tx) => {
    const [line] = await tx<{ invoice_id: string; vat_bp: number }>("select invoice_id, vat_bp from invoice_lines where id = $1 and not dropped", [lineId]);
    if (!line || !(await lockDraft(tx, business.id, line.invoice_id))) return { ok: false as const, code: "not_draft" as const };
    const a = lineAmounts({ ...l, vatBp: line.vat_bp });
    await tx(`update invoice_lines set text = $2, qty = $3, unit_cents = $4, discount_cents = $5, gross_cents = $6, net_cents = $7, vat_cents = $8 where id = $1`, [
      lineId,
      l.text,
      l.qty,
      l.unitCents,
      l.discountCents,
      a.gross,
      a.net,
      a.vat,
    ]);
    await retotal(tx, line.invoice_id);
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'invoice', $2, 'line_edit', $3::jsonb)`, [actor, line.invoice_id, JSON.stringify({ lineId, qty: l.qty, unitCents: l.unitCents })]);
    return { ok: true as const };
  });
}

/** Take a line off a draft: its sale or month is free for the next invoice. */
export async function dropDraftLine(business: Business, lineId: string, actor: string): Promise<{ ok: true } | Fail<"not_draft">> {
  if (!/^[0-9a-f-]{36}$/i.test(lineId)) return { ok: false, code: "not_draft" };
  return withTx(async (tx) => {
    const [line] = await tx<{ invoice_id: string }>("select invoice_id from invoice_lines where id = $1 and not dropped", [lineId]);
    if (!line || !(await lockDraft(tx, business.id, line.invoice_id))) return { ok: false as const, code: "not_draft" as const };
    await tx("update invoice_lines set dropped = true where id = $1", [lineId]);
    await retotal(tx, line.invoice_id);
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'invoice', $2, 'line_drop', $3::jsonb)`, [actor, line.invoice_id, JSON.stringify({ lineId })]);
    return { ok: true as const };
  });
}

/** Renat's own line on a draft («Другое»), at the invoice's VAT. */
export async function addDraftLine(business: Business, invoiceId: string, input: LineInput, actor: string): Promise<{ ok: true } | Fail<"invalid" | "not_draft">> {
  const l = cleanLine(input);
  if (!l) return { ok: false, code: "invalid" };
  return withTx(async (tx) => {
    const inv = await lockDraft(tx, business.id, invoiceId);
    if (!inv) return { ok: false as const, code: "not_draft" as const };
    const issuer = await issuerById(tx, business.id, inv.issuer_id);
    const receiver = await receiverById(tx, business.id, inv.receiver_id);
    if (!issuer || !receiver) return { ok: false as const, code: "not_draft" as const };
    const [{ n }] = await tx<{ n: number }>("select coalesce(max(position), -1)::int + 1 as n from invoice_lines where invoice_id = $1", [invoiceId]);
    await insertLines(tx, invoiceId, [{ kind: "other", ...l, vatBp: vatFor(issuer, receiver) }], n);
    await retotal(tx, invoiceId);
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'invoice', $2, 'line_add', $3::jsonb)`, [actor, invoiceId, JSON.stringify({ qty: l.qty, unitCents: l.unitCents })]);
    return { ok: true as const };
  });
}

export async function setDraftNote(business: Business, invoiceId: string, note: string, actor: string): Promise<boolean> {
  return withTx(async (tx) => {
    if (!(await lockDraft(tx, business.id, invoiceId))) return false;
    await tx("update invoices set note = $2, updated_at = now() where id = $1", [invoiceId, String(note ?? "").trim().slice(0, 300)]);
    await tx(`insert into audit (actor, entity, entity_id, action) values ($1, 'invoice', $2, 'note')`, [actor, invoiceId]);
    return true;
  });
}

export async function discardDraft(business: Business, invoiceId: string, actor: string): Promise<boolean> {
  return withTx(async (tx) => {
    if (!(await lockDraft(tx, business.id, invoiceId))) return false;
    await tx("update invoices set status = 'discarded', updated_at = now() where id = $1", [invoiceId]);
    await tx(`insert into audit (actor, entity, entity_id, action) values ($1, 'invoice', $2, 'discard')`, [actor, invoiceId]);
    return true;
  });
}

/* ---------- issuing ---------- */

const partyOfIssuer = (i: Issuer): Party => ({
  name: i.legalName,
  regCode: i.regCode,
  vatNumber: i.vatNumber,
  address: i.address,
  email: i.email,
  phone: i.phone,
  iban: i.iban,
  bankName: i.bankName,
  note: i.note,
});
const partyOfReceiver = (r: Receiver): Party => ({ name: r.legalName, regCode: r.regCode, vatNumber: r.vatNumber, address: r.address, email: r.email });

/**
 * The next number in the issuer's series: one row lock, so no gaps and no twins.
 * On staging (src/lib/test-run.ts) a counter of its own and a TEST- prefix,
 * so a test never uses up a real number.
 */
async function nextNumber(tx: Querier, issuer: Issuer, year: number, env: Env = process.env): Promise<string> {
  const test = testRun(env);
  const [c] = await tx<{ last: number }>(
    `insert into invoice_counters (issuer_id, year, test, last) values ($1, $2, $3, 1)
     on conflict (issuer_id, year, test) do update set last = invoice_counters.last + 1
     returning last`,
    [issuer.id, counterYear(issuer, year), test],
  );
  return (test ? TEST_NUMBER_PREFIX : "") + formatNumber(issuer, year, c.last);
}

/** The letter with the PDF, built at send time by the outbox (src/lib/outbox.ts). */
async function queueInvoiceLetter(tx: Querier, businessId: string, invoiceId: string, email: string, locale: string) {
  await tx(
    `insert into notifications (business_id, channel, kind, recipient, locale, payload) values ($1, 'email', 'invoice', $2, $3, $4::jsonb)`,
    [businessId, email, locale === "ru" || locale === "en" ? locale : "et", JSON.stringify({ invoiceId })],
  );
}

export type IssueResult = { ok: true; number: string } | Fail<"not_draft" | "empty" | "no_email" | "no_issuer">;

/** «Выставить»: number, frozen parties, due date, the letter queued. */
export async function issueInvoice(business: Business, invoiceId: string, actor: string, now = Date.now()): Promise<IssueResult> {
  return withTx(async (tx) => {
    const inv = await lockDraft(tx, business.id, invoiceId);
    if (!inv) return { ok: false as const, code: "not_draft" as const };
    await retotal(tx, invoiceId);
    const [t] = await tx<{ n: number; gross: number }>("select count(*)::int as n, coalesce(sum(gross_cents), 0)::int as gross from invoice_lines where invoice_id = $1 and not dropped", [invoiceId]);
    if (!t.n || t.gross === 0) return { ok: false as const, code: "empty" as const };
    const issuer = await issuerById(tx, business.id, inv.issuer_id);
    const receiver = await receiverById(tx, business.id, inv.receiver_id);
    if (!issuer || !receiver) return { ok: false as const, code: "no_issuer" as const };
    if (!receiver.email) return { ok: false as const, code: "no_email" as const };
    const today = todayIn(business.timezone, now);
    const number = await nextNumber(tx, issuer, Number(today.slice(0, 4)));
    await tx(
      `update invoices set status = 'issued', number = $2, issued_on = $3::date, due_on = $4::date, seller = $5::jsonb, buyer = $6::jsonb,
              issued_by = $7, updated_at = now()
        where id = $1`,
      [invoiceId, number, today, addDays(today, receiver.termsDays), JSON.stringify(partyOfIssuer(issuer)), JSON.stringify(partyOfReceiver(receiver)), /^[0-9a-f-]{36}$/i.test(actor) ? actor : null],
    );
    await queueInvoiceLetter(tx, business.id, invoiceId, receiver.email, receiver.locale);
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'invoice', $2, 'issue', $3::jsonb)`, [actor, invoiceId, JSON.stringify({ number, gross: t.gross })]);
    return { ok: true as const, number };
  });
}

/** «Оплачен» (or back, if tapped by mistake). The invoice itself does not change. */
export async function setPaid(business: Business, invoiceId: string, paid: boolean, actor: string, now = Date.now()): Promise<boolean> {
  return withTx(async (tx) => {
    const rows = await tx<{ id: string }>(
      paid
        ? `update invoices set paid_at = $3, status = case when status = 'issued' then 'paid' else status end, updated_at = now()
            where id = $1 and business_id = $2 and status in ('issued', 'credited') and paid_at is null returning id`
        : `update invoices set paid_at = null, status = case when status = 'paid' then 'issued' else status end, updated_at = now()
            where id = $1 and business_id = $2 and status in ('paid', 'credited') and paid_at is not null returning id`,
      paid ? [invoiceId, business.id, new Date(now)] : [invoiceId, business.id],
    );
    if (rows.length) await tx(`insert into audit (actor, entity, entity_id, action) values ($1, 'invoice', $2, $3)`, [actor, invoiceId, paid ? "paid" : "unpaid"]);
    return rows.length > 0;
  });
}

export type CreditResult = { ok: true; id: string; number: string } | Fail<"not_issued" | "already" | "no_issuer">;

/**
 * A correction: a credit invoice with every line negated, issued at once
 * with its own number, sent like an invoice. The original turns «credited»;
 * its sales and its month go back to «not billed», for a new draft.
 */
export async function creditInvoice(business: Business, invoiceId: string, actor: string, now = Date.now()): Promise<CreditResult> {
  return withTx(async (tx) => {
    const [orig] = await tx<{ id: string; status: InvoiceStatus; kind: string; issuer_id: string; receiver_id: string; staff_id: string | null; period_from: string; period_to: string; locale: string; number: string; buyer: Party }>(
      `select id, status, kind, issuer_id, receiver_id, staff_id, to_char(period_from, 'YYYY-MM-DD') as period_from, to_char(period_to, 'YYYY-MM-DD') as period_to, locale, number, buyer
         from invoices where id = $1 and business_id = $2 for update`,
      [invoiceId, business.id],
    );
    if (orig?.status === "credited") return { ok: false as const, code: "already" as const };
    if (!orig || orig.kind !== "invoice" || (orig.status !== "issued" && orig.status !== "paid")) return { ok: false as const, code: "not_issued" as const };
    const [done] = await tx("select 1 from invoices where credit_of = $1", [invoiceId]);
    if (done) return { ok: false as const, code: "already" as const };
    const issuer = await issuerById(tx, business.id, orig.issuer_id);
    const receiver = await receiverById(tx, business.id, orig.receiver_id);
    if (!issuer || !receiver) return { ok: false as const, code: "no_issuer" as const };
    const lines = await invoiceLines(tx, invoiceId);
    const today = todayIn(business.timezone, now);
    const number = await nextNumber(tx, issuer, Number(today.slice(0, 4)));
    const email = receiver.email || orig.buyer?.email || "";
    const [cr] = await tx<{ id: string }>(
      `insert into invoices (business_id, issuer_id, receiver_id, staff_id, kind, credit_of, status, number, period_from, period_to, issued_on, due_on,
                             seller, buyer, locale, note, created_by, issued_by)
       values ($1, $2, $3, $4, 'credit', $5, 'issued', $6, $7::date, $8::date, $9::date, $9::date, $10::jsonb, $11::jsonb, $12, $13, $14, $14)
       returning id`,
      [
        business.id,
        orig.issuer_id,
        orig.receiver_id,
        orig.staff_id,
        invoiceId,
        number,
        orig.period_from,
        orig.period_to,
        today,
        JSON.stringify(partyOfIssuer(issuer)),
        JSON.stringify(orig.buyer ?? partyOfReceiver(receiver)),
        orig.locale,
        `Kreeditarve arvele ${orig.number} / Credit note for invoice ${orig.number}`.slice(0, 300),
        /^[0-9a-f-]{36}$/i.test(actor) ? actor : null,
      ],
    );
    await insertLines(
      tx,
      cr.id,
      lines.map((l) => ({ kind: l.kind, text: l.text, qty: -l.qty, unitCents: l.unitCents, discountCents: -l.discountCents, vatBp: l.vatBp })),
    );
    await retotal(tx, cr.id);
    await tx("update invoices set status = 'credited', updated_at = now() where id = $1", [invoiceId]);
    if (email) await queueInvoiceLetter(tx, business.id, cr.id, email, orig.locale);
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'invoice', $2, 'credit', $3::jsonb)`, [actor, invoiceId, JSON.stringify({ credit: cr.id, number })]);
    return { ok: true as const, id: cr.id, number };
  });
}

/** Send the letter again (a barber lost it, or the first try failed for good). */
export async function resendInvoice(business: Business, invoiceId: string, actor: string): Promise<boolean> {
  const inv = await invoiceById(query, business.id, invoiceId);
  if (!inv || inv.status === "draft" || inv.status === "discarded" || !inv.buyer?.email) return false;
  await withTx(async (tx) => {
    await queueInvoiceLetter(tx, business.id, invoiceId, inv.buyer!.email, inv.locale);
    await tx(`insert into audit (actor, entity, entity_id, action) values ($1, 'invoice', $2, 'resend')`, [actor, invoiceId]);
  });
  return true;
}

/** The outbox marks the letter sent on the invoice too. */
export async function markInvoiceSent(q: Querier, invoiceId: string, now = Date.now()): Promise<void> {
  await q("update invoices set sent_at = coalesce(sent_at, $2) where id = $1", [invoiceId, new Date(now)]);
}

/** The local day an instant falls on, for printing a paid date. */
export const localDay = (iso: string, tz: string) => localParts(Date.parse(iso), tz).date;
