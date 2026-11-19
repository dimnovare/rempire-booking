/**
 * /admin/invoices/<id>: one invoice, laid out as Isolta's. A draft has its
 * lines to change, drop or add, its note, «Выставить и отправить» and
 * «Удалить черновик». An issued one is read only: the PDF, «Оплачен»,
 * «Отправить ещё раз» and «Кредитовать».
 */
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { invoiceById, invoiceLines } from "@/lib/billing/invoices";
import { issuerById, receiverById } from "@/lib/billing/parties";
import { dbConfigured, query } from "@/lib/db";
import { Title, Wait } from "../../../lang";
import { getA } from "../../../lang-server";
import { dayOf, dmy } from "../common";
import { InvoiceView } from "./invoice-view";

export default function InvoicePage({ params }: PageProps<"/admin/invoices/[id]">) {
  return (
    <main className="adm-page adm-wide adm-inv">
      <Suspense fallback={<Wait />}>
        <Loaded params={params} />
      </Suspense>
    </main>
  );
}

const UUID = /^[0-9a-f-]{36}$/i;

async function Loaded({ params }: { params: PageProps<"/admin/invoices/[id]">["params"] }) {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { business } = await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const inv = await invoiceById(query, business.id, id);
  if (!inv) notFound();
  const tz = business.timezone;
  // a draft shows both parties as they are now; an issued one as they were printed
  const [lines, receiver, issuer, creditNote] = await Promise.all([
    invoiceLines(query, inv.id),
    inv.status === "draft" ? receiverById(query, business.id, inv.receiverId) : Promise.resolve(null),
    inv.seller ? Promise.resolve(null) : issuerById(query, business.id, inv.issuerId),
    inv.creditedBy ? invoiceById(query, business.id, inv.creditedBy) : Promise.resolve(null),
  ]);
  return (
    <>
      <Title text={inv.number ?? A.inv.draft} />
      <InvoiceView
        key={inv.id}
        inv={{
          id: inv.id,
          status: inv.status,
          kind: inv.kind,
          number: inv.number,
          month: inv.periodFrom.slice(0, 7),
          from: inv.seller?.name ?? issuer?.legalName ?? "",
          fromAddress: inv.seller?.address ?? issuer?.address ?? "",
          to: inv.buyer?.name ?? receiver?.legalName ?? inv.receiverName,
          toAddress: inv.buyer?.address ?? receiver?.address ?? "",
          email: inv.buyer?.email ?? receiver?.email ?? "",
          // a free invoice is of one day: its date says it
          period: inv.free ? "" : `${dmy(inv.periodFrom)}–${dmy(inv.periodTo)}`,
          termsDays: receiver?.termsDays ?? null,
          issuedOn: dmy(inv.issuedOn),
          dueOn: dmy(inv.dueOn),
          netCents: inv.netCents,
          vatCents: inv.vatCents,
          grossCents: inv.grossCents,
          note: inv.note,
          paidOn: dayOf(inv.paidAt, tz),
          sentOn: dayOf(inv.sentAt, tz),
          emailStatus: inv.emailStatus,
          creditOf: inv.creditOf ? { id: inv.creditOf, number: inv.creditOfNumber ?? "" } : null,
          creditedBy: creditNote ? { id: creditNote.id, number: creditNote.number ?? "" } : null,
          staffId: inv.staffId,
        }}
        lines={lines.map((l) => ({ id: l.id, kind: l.kind, text: l.text, qty: l.qty, unitCents: l.unitCents, discountCents: l.discountCents, vatBp: l.vatBp, grossCents: l.grossCents, saleId: l.saleId }))}
      />
    </>
  );
}
