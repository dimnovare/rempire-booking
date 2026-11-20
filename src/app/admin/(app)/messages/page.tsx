/**
 * /admin/messages «Сообщения»: every message the app sends, a page of
 * «Отчёты» (decision 29, docs/kickoff.md; the messages report of the tool
 * we follow, docs/altegio-pages.md, «Сообщения»). The view is
 * messages-view.tsx; the log and its rights are src/lib/admin/message-log.ts.
 *
 * The first page (the last month) comes with the page; every other
 * question is asked by an action. Only a login with «Просматривать
 * детализацию сообщений»; the phones and e-mails whole only with its
 * «Показывать номера телефонов».
 */
import { Suspense } from "react";
import { connection } from "next/server";
import { cleanMessages, defaultMessages } from "@/lib/admin/message-filter";
import { listMessageLog, messagesMay } from "@/lib/admin/message-log";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
import { NoRights } from "../no-rights";
import { MessagesView } from "./messages-view";

export default function MessagesPage() {
  return (
    <main className="adm-page adm-wide adm-rc">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  // a login and the outbox as it is now: always at request time
  await connection();
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  const may = messagesMay(user);
  if (!may.open) return <NoRights />;
  const first = defaultMessages(todayIn(business.timezone));
  const initial = await listMessageLog(query, business, cleanMessages(first), user);
  return <MessagesView initial={initial} first={first} tz={business.timezone} may={may} />;
}
