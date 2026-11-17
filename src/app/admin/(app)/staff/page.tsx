import Link from "next/link";
import { Suspense } from "react";
import { loadCalendar } from "@/lib/admin/calendar";
import { listStaff } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { A } from "../../copy";
import { Ava, NextIcon, PlusIcon } from "../../icons";

export const metadata = { title: A.staff.title };

export default function StaffPage() {
  return (
    <main className="adm-page">
      <div className="adm-page-head">
        <h1 className="adm-h1">{A.staff.title}</h1>
        <Link className="adm-btn adm-btn-line adm-btn-sm" href="/admin/staff/new">
          <PlusIcon size={14} />
          {A.visit.barber}
        </Link>
      </div>
      <Suspense fallback={<p className="adm-wait">{A.loading}</p>}>
        <List />
      </Suspense>
    </main>
  );
}

/** Each barber with today at a glance: hours and how many visits. */
async function List() {
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { business } = await requireAdmin();
  const tz = business.timezone;
  const today = todayIn(tz);
  const [staff, day] = await Promise.all([listStaff(query, business.id), loadCalendar(query, business, today, 1)]);
  const t = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (
    <ul className="adm-list">
      {staff.map((s) => {
        const work = day.work[s.id]?.[today] ?? [];
        const visits = day.visits.filter((v) => v.staffId === s.id).length;
        const hours = work.length ? A.staff.today(`${t.format(work[0][0])}–${t.format(work[work.length - 1][1])}`) : A.staff.todayOff;
        return (
          <li key={s.id}>
            <Link className={`adm-item${s.active ? "" : " is-off"}`} href={`/admin/staff/${s.id}`}>
              <Ava src={s.photoUrl} name={s.name} />
              <span className="txt">
                <b>{s.name}</b>
                <small>
                  {s.active ? hours : A.staff.off}
                  {s.active && visits > 0 ? ` · ${A.cal.visits(visits)}` : ""}
                </small>
                <span className="tags">
                  <span className="adm-tag">{A.staff.servicesN(s.services)}</span>
                  {s.active && !s.bookable && <span className="adm-tag warn">{A.staff.hidden}</span>}
                </span>
              </span>
              <span className="adm-chev">
                <NextIcon />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
