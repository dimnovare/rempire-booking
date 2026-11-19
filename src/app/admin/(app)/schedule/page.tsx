/**
 * /admin/schedule «График работы»: the month grid of shifts (the owner,
 * 19.11.2026; docs/reference-looks.md, «Записи and График работы»; sizes
 * and colours from the design board of the same name).
 *
 *   /admin/schedule                    this month
 *   /admin/schedule?d=2026-12-01       the month of that day
 *   /admin/schedule?d=2026-11-19&v=week  the week of that day
 *
 * A day on it is the day booking sees (src/lib/admin/schedule.ts). The
 * page is the section «Сотрудники»: without its group a login gets «Нет
 * доступа»; changing anything is «Редактирование графика работы».
 */
import { Suspense } from "react";
import { connection } from "next/server";
import { loadSchedule } from "@/lib/admin/schedule";
import { monthDays, weekDays } from "@/lib/admin/schedule-plan";
import { requireAdmin } from "@/lib/auth/current";
import { can, canGroup } from "@/lib/auth/rights";
import { dbConfigured, query } from "@/lib/db";
import { isLocalDate, todayIn } from "@/lib/tz";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
import { NoRights } from "../no-rights";
import { ScheduleView } from "./schedule-view";

export default function SchedulePage({ searchParams }: PageProps<"/admin/schedule">) {
  return (
    <main className="adm-page adm-wide adm-sc">
      <Suspense fallback={<Wait />}>
        <Loaded searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Loaded({ searchParams }: { searchParams: PageProps<"/admin/schedule">["searchParams"] }) {
  // a login and today's shifts: always at request time
  await connection();
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  // the section «Сотрудники» itself
  if (!canGroup(user, "staff")) return <NoRights />;
  const sp = await searchParams;
  const today = todayIn(business.timezone);
  // a day of this century or the next, else today
  const date = isLocalDate(sp.d) && sp.d >= "2000-01-01" && sp.d <= "2100-12-31" ? sp.d : today;
  const view = sp.v === "week" ? "week" : "month";
  const dates = view === "week" ? weekDays(date) : monthDays(date.slice(0, 7));
  const data = await loadSchedule(query, business, dates, user);
  return (
    <ScheduleView
      // another month or week starts with a fresh grid: nothing marked, no panel
      key={`${view}:${dates[0]}`}
      data={data}
      view={view}
      date={date}
      today={today}
      may={{ edit: can(user, "staff.schedule") }}
    />
  );
}
