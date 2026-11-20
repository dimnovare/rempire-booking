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
 *
 * Below 900px it is the phone's tab «Отчёты» (Dim, decision round 11):
 * the board's one screen (phone-kpi.tsx), this month for everyone first;
 * another period or barber is asked of an action, not of the address.
 */
import { Suspense } from "react";
import { connection } from "next/server";
import { kpiReport, periodDays } from "@/lib/admin/dashboards";
import { phoneKpi } from "@/lib/admin/phone-kpi";
import { listStaff } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { can, canGroup } from "@/lib/auth/rights";
import { dbConfigured, query } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
import { NoRights } from "../no-rights";
import { KpiView } from "./kpi-view";
import { PhoneKpiView } from "./phone-kpi";

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
  const [report, phone, staff] = await Promise.all([
    kpiReport(query, business, { from: one(sp.from), to: one(sp.to), staffId: one(sp.staff) }, user),
    phoneKpi(query, business, { per: "month" }, user),
    listStaff(query, business.id),
  ]);
  if (!report || !phone) return <NoRights />;
  // the barbers «Фильтры» and the phone's «Сотрудник» pick from: the ones this login sees in the journal
  const seen = staff.filter((s) => can(user, "journal.staff", { staffId: s.id }));
  return (
    <>
      <div className="only-narrow">
        <PhoneKpiView initial={phone} staff={seen.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))} today={todayIn(business.timezone)} />
      </div>
      <div className="only-wide">
        <KpiView
          // another period or barber is a fresh page: no sheet left open
          key={`${report.period.from}:${report.period.to}:${report.staffId ?? ""}`}
          report={report}
          days={periodDays(report.period)}
          today={todayIn(business.timezone)}
          staff={seen.map((s) => ({ id: s.id, name: s.name, active: s.active }))}
          cards={canGroup(user, "clients")}
        />
      </div>
    </>
  );
}
