/**
 * «Клиенты»: the salon's client base (Dim, decisions round 8, 19.11.2026;
 * in full by the owner's word of the same day), as the «Клиентская база»
 * of the tool we follow (docs/reference-looks.md, «Клиенты»): a search,
 * the segments, the conditions, «Добавить клиента» and «Операции с Excel»,
 * one table from 900px with its bar at the bottom, and a row per client on
 * a phone.
 *
 * The list lives here, in the layout, and a client's card
 * (/admin/clients/<id>) is the page inside it: from 900px a drawer over the
 * list, which stays as it was left (its search, its page) and marks the
 * open row; on a phone the card is the page and the list waits behind it.
 *
 * The first page of the list comes with the layout, with what the list
 * needs around it: the columns this login keeps, and the barbers and
 * services its conditions pick from. A search, a condition or another page
 * is asked for by an action (list-view.tsx), so a client's name or phone
 * is never in an address.
 */
import { Suspense } from "react";
import { listClientColumns } from "@/lib/admin/client-columns";
import { listMay } from "@/lib/admin/client-scope";
import { listClients } from "@/lib/admin/clients";
import { listServices } from "@/lib/admin/services";
import { listStaff } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { canGroup } from "@/lib/auth/rights";
import { dbConfigured, query } from "@/lib/db";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
import { NoRights } from "../no-rights";
import { ClientsView } from "./list-view";

export default function ClientsLayout({ children }: LayoutProps<"/admin/clients">) {
  return (
    <main className="adm-page adm-wide adm-cl">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
      {children}
    </main>
  );
}

async function Loaded() {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  // the section itself: «Клиентская база»
  if (!canGroup(user, "clients")) return <NoRights />;
  const [initial, columns, staff, services] = await Promise.all([
    listClients(query, business.id, {}, Date.now(), business.timezone, user),
    listClientColumns(query, user.id),
    listStaff(query, business.id),
    listServices(query, business.id),
  ]);
  return (
    <ClientsView
      initial={initial}
      tz={business.timezone}
      may={listMay(user)}
      columns={columns}
      // a barber who has left still has his clients, a service that is switched off its visits
      staff={staff.map((s) => ({ id: s.id, name: s.name }))}
      services={services.map((s) => ({ id: s.id, name: A.pick(s.name) }))}
    />
  );
}
