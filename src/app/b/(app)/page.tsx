/** /b: the barber's day (B2). */
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth/current";
import { dbConfigured } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { dateWords } from "../copy.shared";
import { getB } from "../lang-server";

export default function DayPage() {
  return (
    <Suspense fallback={null}>
      <Day />
    </Suspense>
  );
}

async function Day() {
  const B = await getB();
  if (!dbConfigured()) return <p className="adm-wait">{B.noDb}</p>;
  const { business, staff } = await requireStaff();
  const today = todayIn(business.timezone);
  return (
    <main className="adm-page">
      <h1 className="adm-h1">{staff.name}</h1>
      <p className="adm-meta">
        {B.day.today}, {dateWords(today, B.lang)}
      </p>
    </main>
  );
}
