import { Suspense } from "react";
import { listStaff, staffDetail } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { A } from "../../copy";
import { BarberPage } from "./[id]/barber";

export const metadata = { title: A.staff.title };

/**
 * «Барберы». The list itself is in the layout (the rail). On a phone it is
 * all this page shows; a wide screen has room, so the first barber is
 * already open beside the list.
 */
export default function StaffPage() {
  return (
    <Suspense fallback={null}>
      <First />
    </Suspense>
  );
}

async function First() {
  if (!dbConfigured())
    return (
      <main className="adm-page">
        <p className="adm-wait">{A.noDb}</p>
      </main>
    );
  const { business } = await requireAdmin();
  const first = (await listStaff(query, business.id))[0];
  if (!first) return null;
  const today = todayIn(business.timezone);
  const d = await staffDetail(query, business, first.id, today);
  if (!d) return null;
  return (
    <div className="only-wide">
      <BarberPage key={d.id} d={d} tz={business.timezone} today={today} back={null} />
    </div>
  );
}
