/**
 * /admin/changes «Изменения данных»: the change log, a page of «Отчёты»
 * (decision 29, docs/kickoff.md; the change log of the tool we follow,
 * docs/altegio-pages.md, «Изменения данных»). The view is changes-view.tsx;
 * the log and who may read it are src/lib/admin/change-log.ts.
 *
 * The first page (the last month) comes with the page; every other
 * question is asked by an action. The owner's alone.
 */
import { Suspense } from "react";
import { connection } from "next/server";
import { cleanChanges, defaultChanges } from "@/lib/admin/change-filter";
import { changeAuthors, changesMay, listChanges } from "@/lib/admin/change-log";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
import { NoRights } from "../no-rights";
import { ChangesView } from "./changes-view";

export default function ChangesPage() {
  return (
    <main className="adm-page adm-wide adm-rc">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  // a login and the log as it is now: always at request time
  await connection();
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  if (!changesMay(user).open) return <NoRights />;
  const first = defaultChanges(todayIn(business.timezone));
  const [initial, authors] = await Promise.all([listChanges(query, business, cleanChanges(first), user, A.lang), changeAuthors(query, business.id)]);
  return <ChangesView initial={initial} first={first} tz={business.timezone} authors={authors} />;
}
