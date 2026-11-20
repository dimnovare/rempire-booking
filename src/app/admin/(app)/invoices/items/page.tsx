/**
 * /admin/invoices/items «Товары и услуги»: what a line of an invoice can be
 * picked from. Not a third list (docs/one-place.md): two read-only views
 * over the two that exist, the shop's products (by a search, through the
 * shop link, as «Каталог товаров» shows them) and the salon's services with
 * their prices. A line at the top says where each one is changed.
 */
import { Suspense } from "react";
import { serviceList } from "@/lib/admin/services";
import { requireAdmin } from "@/lib/auth/current";
import { canGroup } from "@/lib/auth/rights";
import { dbConfigured, query } from "@/lib/db";
import { shopMode } from "@/lib/shop";
import { Title, Wait } from "../../../lang";
import { getA } from "../../../lang-server";
import { ItemsView } from "./items-view";

export default function ItemsPage() {
  return (
    <main className="iv-page">
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
  // the services are the section «Услуги» itself: a login without it sees the tab say so
  const services = canGroup(user, "services") ? await serviceList(query, business.id) : null;
  return (
    <>
      <Title text={A.inv.menu.items} />
      <ItemsView demo={shopMode() === "fake"} services={services} />
    </>
  );
}
