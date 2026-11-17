/**
 * /b/time «Моё время» (B4): the barber's breaks, days off and special time
 * ahead, his weekly hours, his prices, and what he asked Renat lately.
 */
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth/current";
import { myTime } from "@/lib/barber/requests";
import { dbConfigured, query } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { Wait } from "../../lang";
import { getB } from "../../lang-server";
import { Title } from "../title";
import { TimeView } from "./time-view";

export default function TimePage() {
  return (
    <Suspense fallback={<Wait />}>
      <Time />
    </Suspense>
  );
}

async function Time() {
  const B = await getB();
  if (!dbConfigured()) return <p className="adm-wait">{B.noDb}</p>;
  const { business, staff, viewing } = await requireStaff();
  const now = Date.now();
  const data = await myTime(query, business, staff.id, now);
  return (
    <>
      <Title text={B.time.title} />
      <TimeView key={staff.id} data={data} tz={business.timezone} today={todayIn(business.timezone, now)} viewing={viewing} />
    </>
  );
}
