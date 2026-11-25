/**
 * The invoice letter, built at send time by the outbox (src/lib/outbox.ts,
 * kind 'invoice'): the issued invoice as it was frozen at «Выставить», its
 * PDF attached. A draft or a discarded one is never sent.
 */
import type { Business } from "../availability";
import type { Querier } from "../db";
import type { LetterBody } from "../email";
import { invoiceLetter } from "../letters";
import { staffUrl } from "../site";
import { addDays, todayIn } from "../tz";
import { invoiceById, invoiceLines, partyOfIssuer, partyOfReceiver } from "./invoices";
import { issuerById, receiverById } from "./parties";
import { invoicePdfFilename, pdfDataOf, renderInvoicePdf } from "./pdf";

type Env = Record<string, string | undefined>;

/** The PDF of an issued invoice; null for a draft. */
export async function invoicePdf(q: Querier, businessId: string, invoiceId: string): Promise<{ filename: string; bytes: Uint8Array } | null> {
  const inv = await invoiceById(q, businessId, invoiceId);
  if (!inv || !inv.number || inv.status === "draft" || inv.status === "discarded") return null;
  const lines = await invoiceLines(q, inv.id);
  return { filename: invoicePdfFilename(inv.number), bytes: await renderInvoicePdf(pdfDataOf(inv, lines)) };
}

/**
 * A draft as it would print if it were issued now («Посмотреть и отправить
 * счёт»): today's date, the receiver's days to pay, both parties as they
 * are today. It carries no number and the «ЧЕРНОВИК / MUSTAND» stamp.
 *
 * Reads only: no number is taken from the series, nothing is written and
 * no letter is queued. Null for anything that is not a draft.
 */
export async function draftPdf(q: Querier, business: Pick<Business, "id" | "timezone">, invoiceId: string, now = Date.now()): Promise<{ filename: string; bytes: Uint8Array } | null> {
  const inv = await invoiceById(q, business.id, invoiceId);
  if (!inv || inv.status !== "draft") return null;
  const [lines, issuer, receiver] = await Promise.all([invoiceLines(q, inv.id), issuerById(q, business.id, inv.issuerId), receiverById(q, business.id, inv.receiverId)]);
  if (!issuer || !receiver) return null;
  const today = todayIn(business.timezone, now);
  const bytes = await renderInvoicePdf({
    ...pdfDataOf({ ...inv, number: "-", issuedOn: today, dueOn: addDays(today, receiver.termsDays), seller: partyOfIssuer(issuer), buyer: partyOfReceiver(receiver) }, lines),
    number: "",
    draft: true,
  });
  return { filename: invoicePdfFilename("mustand"), bytes };
}

export async function invoiceMessage(
  q: Querier,
  row: { business_id: string; locale: string; payload: Record<string, unknown> },
  env: Env = process.env,
): Promise<{ skip: string } | { subject: string; body: LetterBody }> {
  const id = typeof row.payload.invoiceId === "string" ? row.payload.invoiceId : "";
  const inv = id ? await invoiceById(q, row.business_id, id) : null;
  if (!inv || !inv.number || inv.status === "draft" || inv.status === "discarded") return { skip: "invoice not issued" };
  const pdf = await invoicePdf(q, row.business_id, inv.id);
  if (!pdf) return { skip: "invoice not issued" };
  const locale = row.locale === "ru" || row.locale === "en" ? row.locale : "et";
  const letter = invoiceLetter(
    { kind: inv.kind, number: inv.number, periodFrom: inv.periodFrom, periodTo: inv.periodTo, dueOn: inv.dueOn, grossCents: inv.grossCents, sellerName: inv.seller?.name ?? "REMPIRE" },
    // a letter to a barber's company: the staff address (src/lib/site.ts)
    { locale, origin: staffUrl(env).origin, pdf: { filename: pdf.filename, content: pdf.bytes } },
  );
  return { subject: letter.subject, body: letter };
}
