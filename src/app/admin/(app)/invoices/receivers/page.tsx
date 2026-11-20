/**
 * /admin/invoices/receivers «Получатели»: who REMPIRE invoices, usually a
 * barber's FIE or OÜ, as the invoicing tool's contacts list: a search, the
 * name, the address in three columns, how many invoices. A row opens the
 * receiver's own page. `?new=1` opens «Новый получатель» at once (the
 * desk's tile). No groups.
 */
import { Suspense } from "react";
import { listStaff } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { invoiceCounts } from "@/lib/billing/events";
import { splitAddress } from "@/lib/billing/list";
import { listIssuers, listReceivers } from "@/lib/billing/parties";
import { dbConfigured, query } from "@/lib/db";
import { Title, Wait } from "../../../lang";
import { getA } from "../../../lang-server";
import { ReceiversList } from "./receivers-list";

export default function ReceiversPage({ searchParams }: PageProps<"/admin/invoices/receivers">) {
  return (
    <main className="iv-page">
      <Suspense fallback={<Wait />}>
        <Loaded searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Loaded({ searchParams }: { searchParams: PageProps<"/admin/invoices/receivers">["searchParams"] }) {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { business } = await requireAdmin();
  const sp = await searchParams;
  const [receivers, counts, staff, issuers] = await Promise.all([listReceivers(query, business.id), invoiceCounts(query, business.id), listStaff(query, business.id), listIssuers(query, business.id)]);
  // barbers with no receiver yet: the first one is offered for a new one
  const free = staff.filter((s) => s.active && !receivers.some((r) => r.active && r.staffId === s.id));
  return (
    <>
      <Title text={A.inv.receivers} />
      <ReceiversList
        rows={receivers.map((r) => ({ id: r.id, name: r.legalName, contact: r.staffName ?? "", person: r.kind === "person", active: r.active, ...splitAddress(r.address), invoices: counts.get(r.id) ?? 0 }))}
        staff={staff.map((s) => ({ id: s.id, name: s.name, active: s.active }))}
        issuers={issuers.map((i) => ({ id: i.id, name: i.legalName }))}
        defaultStaff={free[0]?.id ?? ""}
        without={free.map((s) => s.name)}
        startNew={sp.new === "1"}
      />
    </>
  );
}
