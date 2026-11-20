/**
 * /admin/dashboard «Визиты» (Dim, 20.11.2026: copy the tool's landing of
 * «Отчёты» now; docs/altegio-pages.md, «D. Dashboards»): the visits ahead
 * and behind on the left, the feed of what happened to bookings on the
 * right. What each panel lists is written once, in
 * src/lib/admin/dashboards.ts.
 *
 * Only with «Визиты»; the visits are those «Записи» shows this login (its
 * barbers, its history limit, its clients), the phones whole only with
 * «Показывать номера телефонов».
 */
import { Suspense } from "react";
import { connection } from "next/server";
import { dashMay, listDashVisits, listFeed, VISITS_FIRST, VISITS_MORE } from "@/lib/admin/dashboards";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
import { NoRights } from "../no-rights";
import { VisitsView } from "./visits-view";

export default function DashboardPage() {
  return (
    <main className="adm-page adm-wide adm-dsv">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  // a login and the visits as they are now: always at request time
  await connection();
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  const may = dashMay(user);
  if (!may.open) return <NoRights />;
  const [visits, feed] = await Promise.all([listDashVisits(query, business, { when: "upcoming" }, user), listFeed(query, business, { filter: "all" }, user)]);
  return <VisitsView tz={business.timezone} may={may} visits={visits} feed={feed} first={VISITS_FIRST} more={VISITS_MORE} />;
}
