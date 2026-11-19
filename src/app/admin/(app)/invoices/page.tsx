/**
 * /admin/invoices «Счета»: every invoice in one table and «Новый счёт», the
 * way Renat works in Isolta (Dim, 19.11.2026: «new invoice → pick who gets
 * it, and that's all»; the look is Isolta's too, docs/reference-looks.md).
 *
 * «Новый счёт» asks only for the receiver and opens the draft for him: the
 * one he has, the month being invoiced with its rent and sales, or an empty
 * free invoice (src/lib/billing/invoices.ts, openDraft). The month's sums
 * per barber are the next tab, «Месяц».
 */
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { listInvoices } from "@/lib/billing/invoices";
import { listIssuers, listReceivers } from "@/lib/billing/parties";
import { dbConfigured, query } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { Title, Wait } from "../../lang";
import { getA } from "../../lang-server";
import { dmy, InvTabs, monthDate } from "./common";
import { InvoiceList, NewInvoice, type ListRow } from "./list-view";

export default function InvoicesPage() {
  return (
    <main className="adm-page adm-wide adm-inv">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { business } = await requireAdmin();
  const [invoices, receivers, issuers] = await Promise.all([listInvoices(query, business.id), listReceivers(query, business.id), listIssuers(query, business.id)]);
  const today = todayIn(business.timezone);
  const rows: ListRow[] = invoices
    .filter((i) => i.status !== "discarded")
    .map((i) => ({
      id: i.id,
      // an issued invoice past its day reads «просрочен», as in Isolta
      status: i.status === "issued" && i.kind === "invoice" && i.dueOn && i.dueOn < today ? "overdue" : i.status,
      credit: i.kind === "credit",
      receiver: i.buyer?.name ?? i.receiverName,
      // what it bills: the month, or for a free one nothing more than its date
      sub: [i.staffName, i.free ? "" : A.inv.month(monthDate(i.periodFrom.slice(0, 7)))].filter(Boolean).join(", "),
      number: i.number ?? "",
      date: dmy(i.issuedOn),
      due: i.kind === "invoice" ? dmy(i.dueOn) : "",
      netCents: i.netCents,
      grossCents: i.grossCents,
    }));

  return (
    <>
      <Title text={A.inv.title} />
      <div className="adm-page-head inv-top">
        <h1 className="adm-h1">{A.inv.title}</h1>
        {issuers.length > 0 && (
          <NewInvoice
            receivers={receivers
              .filter((r) => r.active)
              .map((r) => ({ id: r.id, name: r.legalName, sub: [r.staffName, r.address || r.email].filter(Boolean).join(", "), person: r.kind === "person" }))}
          />
        )}
      </div>
      <InvTabs A={A} here="list" />
      {!issuers.length && (
        <p className="adm-note">
          <Link href="/admin/invoices/company">{A.inv.noIssuer}</Link>
        </p>
      )}
      <InvoiceList rows={rows} />
    </>
  );
}
