import { Suspense } from "react";
import { loadCalendar } from "@/lib/admin/calendar";
import { listStaff } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { canGroup } from "@/lib/auth/rights";
import { dbConfigured, query } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { getA } from "../../lang-server";
import { StaffRail, type RailItem } from "./rail";

/** «Барберы»: the list (the whole page on a phone, a rail on the left from 900px) and the barber beside it. */
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-split">
      <Suspense fallback={<aside className="adm-rail" />}>
        <Rail />
      </Suspense>
      {children}
    </div>
  );
}

/** Each barber with today at a glance: hours and how many visits. */
async function Rail() {
  if (!dbConfigured()) return null;
  const { user, business } = await requireAdmin();
  // the section «Сотрудники» itself: without it there is no list (the page says so)
  if (!canGroup(user, "staff")) return null;
  const tz = business.timezone;
  const today = todayIn(tz);
  const [A, staff, day] = await Promise.all([getA(), listStaff(query, business.id), loadCalendar(query, business, today, 1)]);
  const t = new Intl.DateTimeFormat(A.intl, { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const items: RailItem[] = staff.map((s) => {
    const work = day.work[s.id]?.[today] ?? [];
    const visits = day.visits.filter((v) => v.staffId === s.id).length;
    const hours = work.length ? A.staff.today(`${t.format(work[0][0])}–${t.format(work[work.length - 1][1])}`) : A.staff.todayOff;
    return {
      id: s.id,
      name: s.name,
      photoUrl: s.photoUrl ?? null,
      active: s.active,
      line: s.active ? `${hours}${visits > 0 ? ` · ${A.cal.visits(visits)}` : ""}` : A.staff.off,
      services: s.services,
      hidden: s.active && !s.bookable,
    };
  });
  return <StaffRail items={items} />;
}
