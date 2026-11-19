/**
 * The calendar: a day with a column for each barber who works it or has a
 * visit on it, or one barber's week.
 * /admin?d=2026-11-17            a day
 * /admin?d=2026-11-17&v=week&s=  a week of barber s
 * A day comes with what its product sales come to, for the day's numbers.
 */
import { Suspense } from "react";
import { dayGoodsCents, loadCalendar } from "@/lib/admin/calendar";
import { weekStart } from "@/lib/admin/grid";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { isLocalDate, todayIn } from "@/lib/tz";
import { Wait } from "../lang";
import { getA } from "../lang-server";
import { Calendar } from "./calendar";

export default function CalendarPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<Wait />}>
      <Loaded searchParams={searchParams} />
    </Suspense>
  );
}

async function Loaded({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  if (!dbConfigured()) return <p className="adm-wait">{(await getA()).noDb}</p>;
  const { business } = await requireAdmin();
  const sp = await searchParams;
  const tz = business.timezone;
  const now = Date.now();
  const today = todayIn(tz, now);
  const date = isLocalDate(sp.d) ? sp.d : today;
  const view = sp.v === "week" ? "week" : "day";
  const [data, goodsCents] = await Promise.all([
    loadCalendar(query, business, view === "week" ? weekStart(date) : date, view === "week" ? 7 : 1),
    view === "day" ? dayGoodsCents(query, business, date) : null,
  ]);
  const wanted = typeof sp.s === "string" ? sp.s : null;
  const staffId = data.staff.find((s) => s.id === wanted)?.id ?? data.staff[0]?.id ?? null;
  return (
    <Calendar
      // a new day or view starts with a fresh component (scroll, sheets)
      key={`${view}:${date}:${view === "week" ? staffId : ""}`}
      data={data}
      view={view}
      date={date}
      today={today}
      staffId={staffId}
      now={now}
      step={business.settings.slot_step_min}
      goodsCents={goodsCents}
    />
  );
}
