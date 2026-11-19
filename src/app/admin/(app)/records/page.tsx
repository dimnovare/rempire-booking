/**
 * /admin/records «Записи»: every visit in one table, the first page of
 * «Отчёты» (the owner, 19.11.2026; docs/reference-looks.md, «Записи and
 * График работы»). The filters on top, «Найдено N», the table with a tick
 * per row and a pencil that opens the calendar's own visit sheet; on a
 * phone a row per visit and the filters in a sheet.
 *
 * The first page comes with the page, for the page's own first question
 * (visits from a month ago to a month ahead). Everything after it is asked
 * for by an action (records-view.tsx), so a client's name or phone is
 * never in an address.
 *
 * Only a login with «Просматривать список записей»; the list is cut for it
 * as the calendar is (src/lib/admin/records.ts).
 */
import { Suspense } from "react";
import { connection } from "next/server";
import { defaultRecords } from "@/lib/admin/record-filter";
import { listRecords, recordMakers, recordsMay } from "@/lib/admin/records";
import { listServices } from "@/lib/admin/services";
import { listStaff } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";
import { dbConfigured, query } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
import { NoRights } from "../no-rights";
import { RecordsView } from "./records-view";

export default function RecordsPage() {
  return (
    <main className="adm-page adm-wide adm-rc">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  // a login and today's visits: always at request time
  await connection();
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  if (!can(user, "reports.bookings")) return <NoRights />;
  const first = defaultRecords(todayIn(business.timezone));
  const [initial, staff, services, makers] = await Promise.all([listRecords(query, business, first, user), listStaff(query, business.id), listServices(query, business.id), recordMakers(query, business.id)]);
  return (
    <RecordsView
      initial={initial}
      first={first}
      tz={business.timezone}
      may={recordsMay(user)}
      // the barbers this login sees in the journal; one who has left still has his visits
      staff={staff.filter((s) => can(user, "journal.staff", { staffId: s.id })).map((s) => ({ id: s.id, name: s.name }))}
      services={services.map((s) => ({ id: s.id, name: A.pick(s.name) }))}
      makers={makers}
    />
  );
}
