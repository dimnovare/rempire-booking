/**
 * /admin/invoices/<id>: one invoice, to the design board «Счёт, черновик».
 *
 * A draft is the editor (draft-view.tsx): the receiver's card, the lines
 * to change, drop or add (a line's name is picked from the shop's products
 * and the salon's services, or typed), «Заметка к счёту», and «Посмотреть
 * и отправить счёт», which shows the draft's PDF before the number is
 * given. An issued one is read only (sent-view.tsx): the status banner with
 * its events, «Платежи», «Создать кредит-счёт» and «Инструменты».
 */
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { invoiceEvents } from "@/lib/billing/events";
import { sectionRows } from "@/lib/billing/export";
import { invoiceById, invoiceLines } from "@/lib/billing/invoices";
import { DEFAULT_SORT, listStatus, sortRows } from "@/lib/billing/list";
import { issuerById, listReceivers, receiverById } from "@/lib/billing/parties";
import { dbConfigured, query } from "@/lib/db";
import { Title, Wait } from "../../../lang";
import { getA } from "../../../lang-server";
import { dayOf, dmy, eventLines, INV_ROOT } from "../common";
import { DraftView } from "./draft-view";
import { SentView } from "./sent-view";
import type { ViewInvoice, ViewLine } from "./types";

export default function InvoicePage({ params }: PageProps<"/admin/invoices/[id]">) {
  return (
    <main className="iv-page">
      <Suspense fallback={<Wait />}>
        <Loaded params={params} />
      </Suspense>
    </main>
  );
}

const UUID = /^[0-9a-f-]{36}$/i;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

async function Loaded({ params }: { params: PageProps<"/admin/invoices/[id]">["params"] }) {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { business } = await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const inv = await invoiceById(query, business.id, id);
  if (!inv || inv.status === "discarded") notFound();
  const tz = business.timezone;
  const draft = inv.status === "draft";
  // a draft shows both parties as they are now; an issued one as they were printed
  const [lines, receiver, issuer, creditNote, list, events, receivers] = await Promise.all([
    invoiceLines(query, inv.id),
    receiverById(query, business.id, inv.receiverId),
    inv.seller ? Promise.resolve(null) : issuerById(query, business.id, inv.issuerId),
    inv.creditedBy ? invoiceById(query, business.id, inv.creditedBy) : Promise.resolve(null),
    sectionRows(query, business),
    draft ? Promise.resolve([]) : invoiceEvents(query, business.id, inv.id),
    draft ? listReceivers(query, business.id) : Promise.resolve([]),
  ]);
  // «Предыдущий» and «Следующий» walk the list as it opens: the newest first
  const order = sortRows(list.rows, DEFAULT_SORT, list.today);
  const at = order.findIndex((r) => r.id === inv.id);
  const termsDays = draft ? (receiver?.termsDays ?? null) : inv.kind === "invoice" && inv.issuedOn && inv.dueOn ? daysBetween(inv.issuedOn, inv.dueOn) : null;

  const view: ViewInvoice = {
    id: inv.id,
    status: listStatus(inv, list.today) ?? "draft",
    kind: inv.kind,
    free: inv.free,
    number: inv.number,
    month: inv.periodFrom.slice(0, 7),
    from: inv.seller?.name ?? issuer?.legalName ?? "",
    fromAddress: inv.seller?.address ?? issuer?.address ?? "",
    receiver: {
      name: inv.buyer?.name ?? receiver?.legalName ?? inv.receiverName,
      contact: inv.staffName ?? "",
      address: inv.buyer?.address ?? receiver?.address ?? "",
      email: inv.buyer?.email ?? receiver?.email ?? "",
      person: receiver?.kind === "person",
      href: `${INV_ROOT}/receivers/${inv.receiverId}`,
    },
    receiverId: inv.receiverId,
    // a free invoice is of one day: its date says it
    period: inv.free ? "" : `${dmy(inv.periodFrom)}–${dmy(inv.periodTo)}`,
    termsDays,
    issuedOn: dmy(inv.issuedOn),
    issuedIso: inv.issuedOn ?? "",
    dueOn: dmy(inv.dueOn),
    today: list.today,
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
    prev: at > 0 ? order[at - 1].id : null,
    next: at >= 0 && at < order.length - 1 ? order[at + 1].id : null,
  };
  const viewLines: ViewLine[] = lines.map((l) => ({ id: l.id, kind: l.kind, text: l.text, qty: l.qty, unitCents: l.unitCents, discountCents: l.discountCents, vatBp: l.vatBp, grossCents: l.grossCents, saleId: l.saleId, itemNo: l.itemNo ?? "" }));

  return (
    <>
      <Title text={inv.number ?? A.inv.draft} />
      {draft ? (
        <DraftView
          key={inv.id}
          inv={view}
          lines={viewLines}
          receivers={receivers.filter((r) => r.active && r.id !== inv.receiverId).map((r) => ({ id: r.id, name: r.legalName, sub: [r.staffName, r.address || r.email].filter(Boolean).join(", "), person: r.kind === "person" }))}
        />
      ) : (
        <SentView key={inv.id} inv={view} lines={viewLines} events={eventLines(A, events, tz, false)} />
      )}
    </>
  );
}
