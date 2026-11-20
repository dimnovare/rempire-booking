/**
 * /admin/requests «Запросы» (Phase B, B4): what the barbers changed or ask
 * for from their app. Waiting ones on top with «Согласовать» / «Отклонить»;
 * the last 14 days under them. What barbers change themselves, and what
 * waits for an OK, is a right of each barber's login («Доступ» → the login;
 * 19.11.2026); the card that pointed there is gone (Dim, 20.11: not needed).
 * The client's reminder (SMS, push or both) moved to «Настройки →
 * Уведомления» (decision page round 11).
 */
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { seenStaff } from "@/lib/auth/rights";
import { listRequests } from "@/lib/barber/requests";
import { dbConfigured, query } from "@/lib/db";
import { Title, Wait } from "../../lang";
import { getA } from "../../lang-server";
import { Titled } from "../star";
import { RequestsView } from "./requests-view";

export default function RequestsPage() {
  return (
    <main className="adm-page adm-wide">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  // only the barbers whose column this login sees (journal.staff): the server refuses an answer for the others anyway
  const seen = seenStaff(user);
  const rows = (await listRequests(query, business.id, { days: 14 })).filter((r) => seen === "all" || seen.includes(r.staffId));
  return (
    <>
      <Title text={A.req.title} />
      <Titled page="requests">
        <h1 className="adm-h1">{A.req.title}</h1>
      </Titled>
      <RequestsView
        open={rows.filter((r) => r.status === "requested")}
        recent={rows.filter((r) => r.status !== "requested")}
        tz={business.timezone}
      />
    </>
  );
}
