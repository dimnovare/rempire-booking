/**
 * /admin/invoices «Счета», the list: every invoice in one table, the way
 * the invoicing tool Renat used shows them (the design board «Счета,
 * список»; docs/reference-looks.md). The section's entry from the salon's
 * menu, as before: his routine is «Счета» → «Новый счёт» → the receiver.
 *
 * `?status=overdue` and `?from=…&to=…` open it already filtered: the desk's
 * three figures link here that way. Nothing typed into the search is ever
 * in the address.
 */
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { sectionRows } from "@/lib/billing/export";
import { EMPTY_QUERY, listQueryOf } from "@/lib/billing/list";
import { listIssuers } from "@/lib/billing/parties";
import { dbConfigured, query } from "@/lib/db";
import { Title, Wait } from "../../lang";
import { getA } from "../../lang-server";
import { InvoiceList } from "./list-view";

export default function InvoicesPage({ searchParams }: PageProps<"/admin/invoices">) {
  return (
    <main className="iv-page">
      <Suspense fallback={<Wait />}>
        <Loaded searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Loaded({ searchParams }: { searchParams: PageProps<"/admin/invoices">["searchParams"] }) {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { business } = await requireAdmin();
  const sp = await searchParams;
  const [{ rows, today }, issuers] = await Promise.all([sectionRows(query, business, A.inv.month), listIssuers(query, business.id)]);
  const asked = listQueryOf({ status: sp.status, from: sp.from, to: sp.to });
  return (
    <>
      <Title text={A.inv.title} />
      <InvoiceList key={`${asked.status}:${asked.from}:${asked.to}`} rows={rows} today={today} canNew={issuers.length > 0} initial={{ ...EMPTY_QUERY, status: asked.status, from: asked.from, to: asked.to }} />
    </>
  );
}
