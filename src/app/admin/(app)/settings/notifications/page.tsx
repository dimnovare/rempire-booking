/**
 * /admin/settings/notifications «Уведомления» (decision page round 11,
 * board «Notifications»): every message the system sends by itself, by who
 * gets it (the client, the admin, a barber), each with its switch, its
 * channels and when it goes; a type opens its own page ([type]/). The
 * second tab, «Каналы отправки», says how SMS, e-mail and push go from
 * this deployment. Rights: src/lib/admin/notification-store.ts.
 */
import { connection } from "next/server";
import { Suspense } from "react";
import { loadNotify, notifyMay, transports, typeRows } from "@/lib/admin/notification-store";
import { requireAdmin } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";
import { dbConfigured, query } from "@/lib/db";
import { Title, Wait } from "../../../lang";
import { getA } from "../../../lang-server";
import { NoRights } from "../../no-rights";
import { NotificationsView } from "./notifications-view";

export default function NotificationsPage() {
  return (
    <main className="adm-page adm-wide ntf-page">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  // the login, the salon's settings and this deployment's env: always at request time
  await connection();
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  const may = notifyMay(user);
  if (!may.open) return <NoRights />;
  const ns = await loadNotify(query, business.id);
  return (
    <>
      <Title text={A.nav.notifications} />
      <NotificationsView rows={typeRows(ns, may)} transports={transports()} messages={can(user, "reports.messages")} />
    </>
  );
}
