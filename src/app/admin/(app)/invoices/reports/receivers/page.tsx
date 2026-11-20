/**
 * /admin/invoices/reports/receivers «Отчёты» → «Отчёт по получателям»: who
 * was invoiced in a period and for how much, as the invoicing tool's client
 * report: invoices, credit invoices, sold, credited, the total, and the
 * last invoice (a link to it). It opens on this month; drafts are not in
 * it. Counted from the invoices' own totals (src/lib/billing/list.ts).
 */
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { sectionRows } from "@/lib/billing/export";
import { dbConfigured, query } from "@/lib/db";
import { Title, Wait } from "../../../../lang";
import { getA } from "../../../../lang-server";
import { ReceiversReportView } from "./report-view";

export default function ReceiversReportPage() {
  return (
    <main className="iv-page">
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
  const { rows, today } = await sectionRows(query, business);
  return (
    <>
      <Title text={A.inv.rep.tabs.receivers} />
      <ReceiversReportView rows={rows} today={today} />
    </>
  );
}
