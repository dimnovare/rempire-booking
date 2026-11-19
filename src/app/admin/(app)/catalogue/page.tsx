/**
 * /admin/catalogue «Каталог товаров»: the shop's products inside the admin
 * (docs/one-place.md: the shop's catalogue is the one place for products;
 * booking keeps no list of its own). Read-only, and never a link out to the
 * shop: a search field, and the products as rows with the photo, the price
 * and the stock.
 *
 * The products come through the shop link (src/lib/shop.ts), which finds
 * them by a name or a barcode, 20 at most: it has no call for the whole
 * list, so the page shows what is searched for. With no shop connected
 * these are the demo products, and the page says so.
 */
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured } from "@/lib/db";
import { shopMode } from "@/lib/shop";
import { Title, Wait } from "../../lang";
import { getA } from "../../lang-server";
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
  await requireAdmin();
  return (
    <>
      <Title text={A.catalogue.title} />
      <CatalogueView demo={shopMode() === "fake"} />
    </>
  );
}
