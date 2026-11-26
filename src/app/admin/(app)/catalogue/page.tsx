/**
 * /admin/catalogue «Каталог товаров»: the shop's products inside the admin
 * (docs/one-place.md: the shop's catalogue is the one place for products;
 * booking keeps no list of its own). Read-only, and never a link out to the
 * shop.
 *
 * The whole list, a page at a time (Dim, 26.11.2026): filtered by a brand
 * and by stock, searched by a name, a brand or a barcode, and beside each
 * product how many our barbers sold in 30 days. A row opens the product's
 * card: its price, stock, barcode, the barber's share of a sale, and who
 * sold it this month.
 *
 * The list comes through the shop link's list call (src/lib/shop.ts). A
 * shop that does not have it yet (not_supported) leaves the page as it was:
 * a search only. With no shop connected these are the demo products, and
 * the page says so.
 */
import { Suspense } from "react";
import { catalogueList } from "@/lib/admin/catalogue";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured } from "@/lib/db";
import { shopMode } from "@/lib/shop";
import { Title, Wait } from "../../lang";
import { adminLang, getA } from "../../lang-server";
import { CatalogueView } from "./catalogue-view";

export default function CataloguePage() {
  return (
    <main className="adm-page adm-wide adm-cat">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { business } = await requireAdmin();
  const first = await catalogueList(business, 1, null, await adminLang());
  return (
    <>
      <Title text={A.catalogue.title} />
      <CatalogueView demo={shopMode() === "fake"} first={first} share={{ bp: business.settings.commission_bp, basis: business.settings.commission_basis }} />
    </>
  );
}
