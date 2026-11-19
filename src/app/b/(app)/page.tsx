/**
 * /b: the barber's day (B2).
 * /b?d=2026-11-17   that day; the strip on top switches within its week
 *                   without a round trip (the whole week is loaded).
 *
 * The week is cut to what the login may see before it leaves the server
 * (barberDaysFor): its column, its history limit, phones and notes by its
 * rights.
 */
import { Suspense } from "react";
import { weekStart } from "@/lib/admin/grid";
import { requireStaff } from "@/lib/auth/current";
import { barberOffers } from "@/lib/barber/book";
import { barberDaysFor, barberMay, loadBarberDays } from "@/lib/barber/day";
import { dbConfigured, query } from "@/lib/db";
import { isLocalDate, todayIn } from "@/lib/tz";
import { Wait } from "../lang";
import { getB } from "../lang-server";
import { DayView } from "./day-view";
import { NoRights } from "./may";

export default function DayPage({ searchParams }: PageProps<"/b">) {
  return (
    <Suspense fallback={<Wait />}>
      <Day searchParams={searchParams} />
    </Suspense>
  );
}

async function Day({ searchParams }: { searchParams: PageProps<"/b">["searchParams"] }) {
  const B = await getB();
  if (!dbConfigured()) return <p className="adm-wait">{B.noDb}</p>;
  const { user, business, staff } = await requireStaff();
  const sp = await searchParams;
  const tz = business.timezone;
  const now = Date.now();
  const today = todayIn(tz, now);
  const may = barberMay(user, staff.id, today);
  if (!may.see) return <NoRights />;
  const asked = isLocalDate(sp.d) ? sp.d : today;
  // a day before the login's history limit opens as the earliest day it may see
  const date = may.from && asked < may.from ? may.from : asked;
  const from = weekStart(date);
  const [all, offers] = await Promise.all([loadBarberDays(query, business, staff.id, from, 7), barberOffers(query, business.id, staff.id)]);
  const days = barberDaysFor(user, staff.id, all, today);
  return (
    <DayView
      // a new week (or barber) starts fresh: scroll, the open sheet
      key={`${staff.id}:${from}`}
      days={days}
      date={date}
      today={today}
      now={now}
      tz={tz}
      step={business.settings.slot_step_min}
      offers={offers}
      may={may}
    />
  );
}
