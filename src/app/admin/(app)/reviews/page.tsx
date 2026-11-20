/**
 * /admin/reviews «Отзывы»: the clients' reviews, a page of «Отчёты» (Dim,
 * 20.11.2026: «Import now, show ★ on the booking page»; the reviews report
 * of the tool we follow, docs/altegio-pages.md, «Отзывы»). The view is
 * reviews-view.tsx; the list and its rights are src/lib/reviews.ts.
 *
 * The first page (the last twelve months) comes with the page; every
 * other question is asked by an action. Only a login with «Просматривать
 * отзывы»; «Скрыть» with «Удалять отзывы».
 */
import { Suspense } from "react";
import { connection } from "next/server";
import { cleanReviews, defaultReviews } from "@/lib/admin/review-filter";
import { listStaff } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { listReviews, reviewsMay } from "@/lib/reviews";
import { todayIn } from "@/lib/tz";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
import { NoRights } from "../no-rights";
import { ReviewsView } from "./reviews-view";

export default function ReviewsPage() {
  return (
    <main className="adm-page adm-wide adm-rc">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  // a login and the reviews as they are now: always at request time
  await connection();
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  const may = reviewsMay(user);
  if (!may.open) return <NoRights />;
  const first = defaultReviews(todayIn(business.timezone));
  const [initial, staff] = await Promise.all([listReviews(query, business, cleanReviews(first), user), listStaff(query, business.id)]);
  return <ReviewsView initial={initial} first={first} tz={business.timezone} may={may} staff={staff.map((s) => ({ id: s.id, name: s.name }))} />;
}
