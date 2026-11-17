/**
 * /admin/requests «Запросы» (Phase B, B4): what the barbers changed or ask
 * for from their app. Waiting ones on top with «Согласовать» / «Отклонить»;
 * the last 14 days under them. The owner also sets his two switches here:
 * what barbers change themselves and what waits for his OK.
 */
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { listRequests } from "@/lib/barber/requests";
import { dbConfigured, query } from "@/lib/db";
import { Title, Wait } from "../../lang";
import { getA } from "../../lang-server";
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
  const rows = await listRequests(query, business.id, { days: 14 });
  return (
    <>
      <Title text={A.req.title} />
      <h1 className="adm-h1">{A.req.title}</h1>
      <RequestsView
        open={rows.filter((r) => r.status === "requested")}
        recent={rows.filter((r) => r.status !== "requested")}
        owner={user.role === "owner"}
        modes={{ barber_self_time: business.settings.barber_self_time, barber_self_price: business.settings.barber_self_price }}
        tz={business.timezone}
      />
    </>
  );
}
