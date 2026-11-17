/**
 * The invoice letter, built at send time by the outbox (src/lib/outbox.ts,
 * kind 'invoice'): the issued invoice as it was frozen at «Выставить», its
 * PDF attached. A draft or a discarded one is never sent.
 */
import type { Querier } from "../db";
import type { LetterBody } from "../email";
import { invoiceLetter } from "../letters";
import { siteUrl } from "../site";
import { invoiceById, invoiceLines } from "./invoices";
import { invoicePdfFilename, pdfDataOf, renderInvoicePdf } from "./pdf";

type Env = Record<string, string | undefined>;

/** The PDF of an issued invoice; null for a draft. */
export async function invoicePdf(q: Querier, businessId: string, invoiceId: string): Promise<{ filename: string; bytes: Uint8Array } | null> {
  const inv = await invoiceById(q, businessId, invoiceId);
  if (!inv || !inv.number || inv.status === "draft" || inv.status === "discarded") return null;
  const lines = await invoiceLines(q, inv.id);
  return { filename: invoicePdfFilename(inv.number), bytes: await renderInvoicePdf(pdfDataOf(inv, lines)) };
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
    { locale, origin: siteUrl(env).origin, pdf: { filename: pdf.filename, content: pdf.bytes } },
  );
  return { subject: letter.subject, body: letter };
}
