/**
 * /admin/invoices/receivers/<id>: one receiver, as the invoicing tool's
 * contact page: the card with his details and «Редактировать», his
 * barber's chair rent, and two tabs: «Журнал действий» (what happened to
 * him and his invoices, from the audit log and the outbox) and «Счета»
 * (his invoices, the same list as the section's). A receiver has no note
 * of his own, so there is no third tab.
 */
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listStaff } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { receiverEvents } from "@/lib/billing/events";
import { sectionRows } from "@/lib/billing/export";
import { listIssuers, listRents, receiverById } from "@/lib/billing/parties";
import { dbConfigured, query } from "@/lib/db";
import { Title, Wait } from "../../../../lang";
import { getA } from "../../../../lang-server";
import { eventLines } from "../../common";
import { ReceiverView } from "./receiver-view";

export default function ReceiverPage({ params, searchParams }: PageProps<"/admin/invoices/receivers/[id]">) {
  return (
    <main className="iv-page">
      <Suspense fallback={<Wait />}>
        <Loaded params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Loaded({ params, searchParams }: Pick<PageProps<"/admin/invoices/receivers/[id]">, "params" | "searchParams">) {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { business } = await requireAdmin();
  // ?tab=invoices opens on «Счета» (from a barber's month: «Прошлые счета»)
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const receiver = /^[0-9a-f-]{36}$/i.test(id) ? await receiverById(query, business.id, id) : null;
  if (!receiver) notFound();
  const [list, events, rents, staff, issuers] = await Promise.all([
    sectionRows(query, business, A.inv.month),
    receiverEvents(query, business.id, receiver.id),
    listRents(query, business.id),
    listStaff(query, business.id),
    listIssuers(query, business.id),
  ]);
  return (
    <>
      <Title text={receiver.legalName} />
      <ReceiverView
        key={receiver.id}
        tab0={sp.tab === "invoices" ? "invoices" : "log"}
        receiver={receiver}
        rows={list.rows.filter((r) => r.receiverId === receiver.id)}
        today={list.today}
        events={eventLines(A, events, business.timezone)}
        rents={receiver.staffId ? rents.filter((r) => r.staffId === receiver.staffId) : []}
        staff={staff.map((s) => ({ id: s.id, name: s.name, active: s.active }))}
        issuers={issuers.map((i) => ({ id: i.id, name: i.legalName }))}
        canInvoice={issuers.length > 0 && receiver.active}
      />
    </>
  );
}
