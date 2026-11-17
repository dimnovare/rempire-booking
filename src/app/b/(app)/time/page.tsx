/** /b/time: the barber's own time (B4 fills it: breaks, days off, special time, hours). */
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth/current";
import { dbConfigured } from "@/lib/db";
import { Wait } from "../../lang";
import { getB } from "../../lang-server";
import { Title } from "../title";

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
  await requireStaff();
  return (
    <main className="adm-page">
      <Title text={B.time.title} />
      <h1 className="adm-h1">{B.time.title}</h1>
      <p className="adm-meta">{B.time.soon}</p>
    </main>
  );
}
