/**
 * /admin/invoices/receivers «Счета» → «Получатели» (Phase C, C1): who
 * REMPIRE invoices, usually a barber's FIE or OÜ, and each barber's chair
 * rent with the day it starts.
 */
import { Suspense } from "react";
import { listStaff } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { listIssuers, listReceivers, listRents } from "@/lib/billing/parties";
import { dbConfigured, query } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { Title, Wait } from "../../../lang";
import { getA } from "../../../lang-server";
import { InvTabs } from "../common";
import { ReceiversView } from "./receivers-view";

export default function ReceiversPage() {
  return (
    <main className="adm-page adm-wide adm-two adm-inv">
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
  const [receivers, rents, staff, issuers] = await Promise.all([listReceivers(query, business.id), listRents(query, business.id), listStaff(query, business.id), listIssuers(query, business.id)]);
  return (
    <>
      <Title text={A.inv.receivers} />
      <ReceiversView
        head={
          <>
            <div className="adm-page-head">
              <h1 className="adm-h1">{A.inv.title}</h1>
            </div>
            <InvTabs A={A} here="receivers" />
          </>
        }
        receivers={receivers}
        rents={rents}
        staff={staff.map((s) => ({ id: s.id, name: s.name, active: s.active }))}
        issuers={issuers.map((i) => ({ id: i.id, name: i.legalName }))}
        today={todayIn(business.timezone)}
      />
    </>
  );
}
