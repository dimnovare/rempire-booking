/**
 * The calendar: a day with a column for each barber who works it or has a
 * visit on it, or one barber's week.
 * /admin?d=2026-11-17            a day
 * /admin?d=2026-11-17&v=week&s=  a week of barber s
 * A day comes with what its product sales come to, for the day's numbers.
 *
 * What the login may see is cut here, on the server (calendarFor): the
 * columns of the barbers it sees, no day before its history limit, phones
 * and notes by its rights. The screen gets the rest as `may`.
 *
 * A login linked to a barber whose column it sees also gets `mine`
 * (docs/apps.md, «One app for Renat»): from 900px the journal has «Мой день
 * | Весь салон», and «Мой день» is his column with the panel «Моё» beside
 * it. The panel is about today, whatever day is shown, so today in his
 * column is read apart, the way the barber app reads it. Which of the two
 * the page opens on is what this device chose last (MINE_COOKIE), «Мой
 * день» the first time; the browser tab's own choice comes right after.
 */
import { cookies } from "next/headers";
import { Suspense } from "react";
import { calendarFor, calendarMay, clampDay, dayGoodsCents, loadCalendar, type CalMay } from "@/lib/admin/calendar";
import { weekStart } from "@/lib/admin/grid";
import type { MineToday } from "@/lib/admin/journal";
import type { Business } from "@/lib/availability";
import { requireAdmin } from "@/lib/auth/current";
import { can, canGroup, seenStaff } from "@/lib/auth/rights";
import type { StaffUser } from "@/lib/auth/sessions";
import { MINE_COOKIE } from "@/lib/auth/side";
import { barberDaysFor, loadBarberDays } from "@/lib/barber/day";
import { dbConfigured, query } from "@/lib/db";
import { isLocalDate, todayIn } from "@/lib/tz";
import { Wait } from "../lang";
import { getA } from "../lang-server";
import { Calendar } from "./calendar";
import type { MineLinks } from "./journal-mine";
import { NoRights } from "./no-rights";

export default function CalendarPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<Wait />}>
      <Loaded searchParams={searchParams} />
    </Suspense>
  );
}

/** Today in the login's own column, cut to its rights as the barber app's day is; the sum only with «Показывать статистику». */
async function mineToday(user: StaffUser, business: Business, staffId: string, today: string, may: CalMay): Promise<MineToday> {
  const [day] = barberDaysFor(user, staffId, await loadBarberDays(query, business, staffId, today, 1), today);
  return {
    visits: day.visits.map((v) => ({ id: v.id, start: v.start, end: v.end, status: v.status, clientName: v.clientName, service: v.services[0]?.name ?? null })),
    count: day.count,
    totalCents: may.stats ? day.totalCents : null,
  };
}

async function Loaded({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  if (!dbConfigured()) return <p className="adm-wait">{(await getA()).noDb}</p>;
  const { user, business } = await requireAdmin();
  const seen = seenStaff(user);
  if (seen !== "all" && seen.length === 0)
    return (
      <main className="adm-page">
        <NoRights />
      </main>
    );
  const sp = await searchParams;
  const tz = business.timezone;
  const now = Date.now();
  const today = todayIn(tz, now);
  const may = calendarMay(user, today);
  // a day before the login's history limit opens as the earliest day it may see
  const date = clampDay(user, isLocalDate(sp.d) ? sp.d : today, today);
  const view = sp.v === "week" ? "week" : "day";
  // his own column, if this login is linked to a barber and sees that column
  const mineId = user.staffId && (seen === "all" || seen.includes(user.staffId)) ? user.staffId : null;
  // «Мой день» unless this device left the journal on «Весь салон»
  const mineFirst = mineId ? (await cookies()).get(MINE_COOKIE)?.value !== "0" : true;
  const [all, goodsCents, mine] = await Promise.all([
    loadCalendar(query, business, view === "week" ? weekStart(date) : date, view === "week" ? 7 : 1),
    view === "day" && may.stats ? dayGoodsCents(query, business, date) : null,
    mineId ? mineToday(user, business, mineId, today, may) : null,
  ]);
  const data = calendarFor(user, all, today);
  const wanted = typeof sp.s === "string" ? sp.s : null;
  const staffId = data.staff.find((s) => s.id === wanted)?.id ?? data.staff[0]?.id ?? null;
  // the links of the panel «Моё»: his hours are his own page under «Барберы», his sums his month under «Счета»,
  // his clients the client base on the clients who came to him; each only with the right to its section
  const links: MineLinks | null = mineId
    ? {
        time: canGroup(user, "staff") ? `/admin/staff/${mineId}` : null,
        money: `/admin/invoices/barber/${mineId}?m=${today.slice(0, 7)}`,
        clients: canGroup(user, "clients") ? `/admin/clients?barber=${mineId}` : null,
      }
    : null;
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
      may={may}
      // a barber's day from the journal (journal-hours.tsx): the schedule's own rights
      hours={{ edit: can(user, "staff.schedule"), page: canGroup(user, "staff") }}
      mine={mineId && mine && links && data.staff.some((s) => s.id === mineId) ? { staffId: mineId, today: mine, links, first: mineFirst } : null}
    />
  );
}
