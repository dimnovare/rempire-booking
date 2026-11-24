/**
 * What happened to an invoice, read back from what is already kept: the
 * audit log (issued, paid, the mark taken off, credited, sent again) and
 * the outbox (the letter with the PDF: to which address it went, or that
 * it did not go, and when it was first opened: notifications.opened_at,
 * 025_mail_opened.sql). Nothing is written here.
 *
 * Three views of the same rows:
 *   invoiceEvents    one invoice («Показать действия по счёту»);
 *   latestEvents     the business's newest, for «Рабочий стол»;
 *   receiverEvents   one receiver's («Журнал действий»): his invoices'
 *                    events, and when his card or his chair rent changed.
 */
import type { Querier } from "../db";

export type EventKind =
  | "issued"
  | "sent"
  | "mail_failed"
  /** the receiver opened the letter (025_mail_opened.sql), the first time */
  | "opened"
  | "paid"
  | "unpaid"
  | "credited"
  | "resend"
  /** brought over from Isolta (027): one invoice's own events only, never the desk's or a receiver's journal */
  | "imported"
  /** a receiver's own: made, changed, the rent set */
  | "receiver_new"
  | "receiver_edit"
  | "rent";

export type BillingEvent = {
  /** ISO moment */
  at: string;
  kind: EventKind;
  invoiceId: string | null;
  /** the invoice's number as it stands now; null for a receiver's own event */
  number: string | null;
  /** a credit invoice */
  credit: boolean;
  receiver: string;
  /** «sent», «mail_failed», «opened»: the address; «resend»: the one the new letter goes to */
  email: string | null;
  /** «credited»: the credit invoice that took it back */
  other: { id: string; number: string } | null;
  /** «rent»: the new amount */
  cents: number | null;
};

/** `letter_to`: a «resend» row's letter's address (its audit row names the letter, not the address) */
type AuditRow = { at: Date; action: string; after: Record<string, unknown> | null; id: string; number: string | null; kind: string; receiver: string; letter_to?: string | null };
type MailRow = { at: Date; opened_at: Date | null; status: string; recipient: string; id: string; number: string | null; kind: string; receiver: string };

const ACTIONS = "('issue', 'paid', 'unpaid', 'credit', 'resend')";
const KIND: Record<string, EventKind> = { issue: "issued", paid: "paid", unpaid: "unpaid", credit: "credited", resend: "resend" };

const str = (v: unknown) => (typeof v === "string" ? v : "");
const iso = (d: Date) => new Date(d).toISOString();

function fromAudit(r: AuditRow): BillingEvent {
  const other = r.action === "credit" && str(r.after?.credit) ? { id: str(r.after?.credit), number: str(r.after?.number) } : null;
  return { at: iso(r.at), kind: KIND[r.action] ?? "issued", invoiceId: r.id, number: r.number, credit: r.kind === "credit", receiver: r.receiver, email: r.letter_to ?? null, other, cents: null };
}

const fromMail = (r: MailRow): BillingEvent => ({
  at: iso(r.at),
  kind: r.status === "sent" ? "sent" : "mail_failed",
  invoiceId: r.id,
  number: r.number,
  credit: r.kind === "credit",
  receiver: r.receiver,
  email: r.recipient,
  other: null,
  cents: null,
});

/** The letter's own event, and «opened» after it once Resend reported an open. */
const mailEvents = (r: MailRow): BillingEvent[] =>
  r.status === "sent" && r.opened_at ? [fromMail(r), { ...fromMail(r), at: iso(r.opened_at), kind: "opened" }] : [fromMail(r)];

const newestFirst =(a: BillingEvent, b: BillingEvent) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);

/**
 * The events of the invoices that `where` picks (`i` is the invoice, `r` its
 * receiver). A credit invoice has no audit row of its own: the «credit» row
 * of the invoice it credits is also the moment it was issued.
 */
async function invoiceRows(q: Querier, where: string, params: unknown[], limit: number): Promise<BillingEvent[]> {
  const [audit, born, mail] = await Promise.all([
    q<AuditRow>(
      `select a.at, a.action, a.after, i.id, i.number, i.kind, coalesce(i.buyer->>'name', r.legal_name) as receiver, n.recipient as letter_to
         from audit a join invoices i on i.id = a.entity_id join invoice_receivers r on r.id = i.receiver_id
         left join notifications n on a.action = 'resend' and n.id::text = a.after->>'letter'
        where a.entity = 'invoice' and a.action in ${ACTIONS} and ${where}
        order by a.at desc, a.id desc limit ${limit}`,
      params,
    ),
    q<AuditRow>(
      `select a.at, 'issue' as action, null::jsonb as after, i.id, i.number, i.kind, coalesce(i.buyer->>'name', r.legal_name) as receiver
         from audit a join invoices i on i.id::text = a.after->>'credit' join invoice_receivers r on r.id = i.receiver_id
        where a.entity = 'invoice' and a.action = 'credit' and ${where}
        order by a.at desc, a.id desc limit ${limit}`,
      params,
    ),
    q<MailRow>(
      `select coalesce(n.sent_at, n.created_at) as at, n.opened_at, n.status, n.recipient, i.id, i.number, i.kind, coalesce(i.buyer->>'name', r.legal_name) as receiver
         from notifications n join invoices i on i.id::text = n.payload->>'invoiceId' join invoice_receivers r on r.id = i.receiver_id
        where n.kind = 'invoice' and n.status in ('sent', 'failed') and n.business_id = i.business_id and ${where}
        order by coalesce(n.sent_at, n.created_at) desc limit ${limit}`,
      params,
    ),
  ]);
  return [...audit.map(fromAudit), ...born.map(fromAudit), ...mail.flatMap(mailEvents)].sort(newestFirst);
}

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * One invoice's events, the newest first. An invoice imported from Isolta
 * (027) starts with «imported», its import's audit row: what happened to it
 * in Isolta was not exported. Only here, so 422 old invoices never fill the
 * desk's latest events or a receiver's journal.
 */
export async function invoiceEvents(q: Querier, businessId: string, invoiceId: string): Promise<BillingEvent[]> {
  if (!UUID.test(invoiceId)) return [];
  const [events, imported] = await Promise.all([
    invoiceRows(q, "i.business_id = $1 and i.id = $2", [businessId, invoiceId], 100),
    q<AuditRow>(
      `select a.at, a.action, a.after, i.id, i.number, i.kind, coalesce(i.buyer->>'name', r.legal_name) as receiver
         from audit a join invoices i on i.id = a.entity_id join invoice_receivers r on r.id = i.receiver_id
        where a.entity = 'invoice' and a.action = 'import' and i.business_id = $1 and i.id = $2
        order by a.at desc, a.id desc limit 1`,
      [businessId, invoiceId],
    ),
  ]);
  return [...events, ...imported.map((r): BillingEvent => ({ ...fromAudit(r), kind: "imported" }))].sort(newestFirst);
}

/** The newest events across the business. */
export async function latestEvents(q: Querier, businessId: string, limit = 12): Promise<BillingEvent[]> {
  const n = Math.min(Math.max(1, Math.floor(limit)), 50);
  return (await invoiceRows(q, "i.business_id = $1", [businessId], n)).slice(0, n);
}

/** One receiver's journal: his invoices' events, his card's changes and his barber's rent. */
export async function receiverEvents(q: Querier, businessId: string, receiverId: string, limit = 100): Promise<BillingEvent[]> {
  if (!UUID.test(receiverId)) return [];
  const [rcv] = await q<{ legal_name: string; staff_id: string | null }>("select legal_name, staff_id from invoice_receivers where id = $1 and business_id = $2", [receiverId, businessId]);
  if (!rcv) return [];
  const own = (at: Date, kind: EventKind, cents: number | null = null): BillingEvent => ({ at: iso(at), kind, invoiceId: null, number: null, credit: false, receiver: rcv.legal_name, email: null, other: null, cents });
  const [inv, card, rent] = await Promise.all([
    invoiceRows(q, "i.business_id = $1 and i.receiver_id = $2", [businessId, receiverId], limit),
    q<{ at: Date; action: string }>("select at, action from audit where entity = 'invoice_receiver' and entity_id = $1 order by at desc limit $2", [receiverId, limit]),
    rcv.staff_id ? q<{ at: Date; after: Record<string, unknown> | null }>("select at, after from audit where entity = 'chair_rent' and entity_id = $1 order by at desc limit $2", [rcv.staff_id, limit]) : Promise.resolve([]),
  ]);
  return [
    ...inv,
    ...card.map((c) => own(c.at, c.action === "create" ? "receiver_new" : "receiver_edit")),
    ...rent.map((x) => own(x.at, "rent", typeof x.after?.amountCents === "number" ? x.after.amountCents : null)),
  ]
    .sort(newestFirst)
    .slice(0, limit);
}

/** How many invoices each receiver has (drafts thrown away are not counted). */
export async function invoiceCounts(q: Querier, businessId: string): Promise<Map<string, number>> {
  const rows = await q<{ receiver_id: string; n: number }>("select receiver_id, count(*)::int as n from invoices where business_id = $1 and status <> 'discarded' group by receiver_id", [businessId]);
  return new Map(rows.map((r) => [r.receiver_id, r.n]));
}
