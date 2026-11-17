/**
 * /b: the barber's day (B2).
 * /b?d=2026-11-17   that day; the strip on top switches within its week
 *                   without a round trip (the whole week is loaded).
 */
import { Suspense } from "react";
import { weekStart } from "@/lib/admin/grid";
import { requireStaff } from "@/lib/auth/current";
import { barberOffers } from "@/lib/barber/book";
import { loadBarberDays } from "@/lib/barber/day";
import { dbConfigured, query } from "@/lib/db";
import { isLocalDate, todayIn } from "@/lib/tz";
import { Wait } from "../lang";
import { getB } from "../lang-server";
import { DayView } from "./day-view";

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
  const { business, staff } = await requireStaff();
  const sp = await searchParams;
  const tz = business.timezone;
  const now = Date.now();
  const today = todayIn(tz, now);
  const date = isLocalDate(sp.d) ? sp.d : today;
  const from = weekStart(date);
  const [days, offers] = await Promise.all([loadBarberDays(query, business, staff.id, from, 7), barberOffers(query, business.id, staff.id)]);
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
    />
  );
}
