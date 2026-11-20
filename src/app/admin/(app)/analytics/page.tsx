/**
 * /admin/analytics «Основные показатели» (Dim, 20.11.2026: copy the tool's
 * dashboard now; docs/altegio-pages.md, «D. Dashboards»): one column of
 * three cards, «Продажи», «Посещаемость» and «Заполненность», each figure
 * against the period before it, and a chart in each.
 *
 *   /admin/analytics                                  the last 30 days
 *   /admin/analytics?from=2026-10-01&to=2026-10-31    a period
 *   …&staff=<id>                                      one barber («Фильтры»)
 *
 * The address holds only days and a barber's id, never a client. What the
 * figures mean is written once, in src/lib/admin/dashboards.ts.
 *
 * Only with «Основные показатели»; the figures are those of the barbers the
 * login sees in the journal.
 */
import { Suspense } from "react";
import { connection } from "next/server";
import { kpiReport, periodDays } from "@/lib/admin/dashboards";
import { listStaff } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { can, canGroup } from "@/lib/auth/rights";
import { dbConfigured, query } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
import { NoRights } from "../no-rights";
import { KpiView } from "./kpi-view";

export default function AnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  return (
    <main className="adm-page adm-wide adm-dsk">
      <Suspense fallback={<Wait />}>
        <Loaded searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Loaded({ searchParams }: { searchParams: PageProps<"/admin/analytics">["searchParams"] }) {
  // a login and today's figures: always at request time
  await connection();
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  if (!can(user, "reports.dashboard")) return <NoRights />;
  const sp = await searchParams;
  const [report, staff] = await Promise.all([kpiReport(query, business, { from: one(sp.from), to: one(sp.to), staffId: one(sp.staff) }, user), listStaff(query, business.id)]);
  if (!report) return <NoRights />;
  return (
    <KpiView
      // another period or barber is a fresh page: no sheet left open
      key={`${report.period.from}:${report.period.to}:${report.staffId ?? ""}`}
      report={report}
      days={periodDays(report.period)}
      today={todayIn(business.timezone)}
      // the barbers «Фильтры» picks from: the ones this login sees in the journal
      staff={staff.filter((s) => can(user, "journal.staff", { staffId: s.id })).map((s) => ({ id: s.id, name: s.name, active: s.active }))}
      cards={canGroup(user, "clients")}
    />
  );
}
