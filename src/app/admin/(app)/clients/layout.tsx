/**
 * «Клиенты»: the salon's client base (Dim, decisions round 8, 19.11.2026),
 * as Altegio's «Клиенты» (docs/reference-looks.md): a search, a category
 * filter, «Добавить клиента», one table from 900px and a row per client on
 * a phone, 25 a page.
 *
 * The list lives here, in the layout, and a client's card
 * (/admin/clients/<id>) is the page inside it: from 900px a drawer over the
 * list, which stays as it was left (its search, its page) and marks the
 * open row; on a phone the card is the page and the list waits behind it.
 *
 * The first page of the list comes with the layout. A search, a category
 * or another page is asked for by an action (list-view.tsx), so a client's
 * name or phone is never in an address.
 */
import { Suspense } from "react";
import { listClients } from "@/lib/admin/clients";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
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
  if (!dbConfigured()) return <p className="adm-wait">{(await getA()).noDb}</p>;
  const { business } = await requireAdmin();
  return <ClientsView initial={await listClients(query, business.id)} tz={business.timezone} />;
}
