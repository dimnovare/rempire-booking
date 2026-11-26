/**
 * «Каталог товаров» (/admin/catalogue; Dim, 26.11.2026): the shop's whole
 * product list a page at a time, and how many of each our barbers sold.
 *
 * The products, prices and stock are the shop's (src/lib/shop.ts, the one
 * place for products: docs/one-place.md); what is ours is the sales
 * (product_sales). A sale counts while it stands: done, not undone in the
 * barber's undo window, not taken back by a minus row, and not a minus row
 * itself, as the dashboards count goods (src/lib/admin/dashboards.ts). Both
 * kinds count: to a client, and a barber's product for himself; either way
 * it left the shelf through a barber.
 *
 * A shop that has no list route yet (not_supported) leaves the page as it
 * was: a search only.
 */
import type { Business } from "../availability";
import { query, type Querier } from "../db";
import { listProducts, ShopError, type ShopProduct } from "../shop";
import { startOfDay, todayIn } from "../tz";
import { findProducts } from "./sale";

type Env = Record<string, string | undefined>;

/** «Продано за 30 дн.» */
export const SOLD_DAYS = 30;
/** Products on one page of the list. */
export const CAT_PAGE = 50;
/** The most one search gives (the shop link's cap). */
export const CAT_FIND_MOST = 20;

const DAY = 86_400_000;

/** One product as the page shows it: no purchase price (it is not this page's to show). */
export type CatItem = {
  productId: string;
  variant: string;
  name: string;
  variantLabel: string;
  brand: string;
  photo: string | null;
  /** the shop price, VAT inside */
  priceCents: number;
  vatBp: number;
  stock: number | null;
  barcode: string | null;
  /** units our barbers sold in the last SOLD_DAYS days */
  sold: number;
};

export type CatStock = "" | "in" | "out";
export type CatFilter = { brand: string; stock: CatStock };

export type CatalogueList = {
  items: CatItem[];
  /** how many the filter leaves in the whole list */
  total: number;
  page: number;
  pages: number;
  /** products on a full page (CAT_PAGE) */
  size: number;
  brands: string[];
  /** units of anything our barbers sold in the last SOLD_DAYS days */
  soldTotal: number;
};

/** `capped`: the search gave its most (`most`), there may be more. */
export type CatalogueFound = { items: CatItem[]; capped: boolean; most: number; soldTotal: number };

/** What the page says when the shop could not give it: no route yet, no link set up, no answer. */
export type CatFail = "not_supported" | "not_configured" | "shop_down";
export type CatAnswer<T> = { ok: true; data: T } | { ok: false; code: CatFail };

export const soldKey = (productId: string, variant: string) => `${productId}\u0000${variant}`;

/** The sales that count (the module doc), as `p`. */
const STANDS = "p.status = 'done' and p.reverses_id is null and not exists (select 1 from product_sales r where r.reverses_id = p.id)";

/** Units sold per product and variant from `from` (inclusive) to `to` (exclusive). */
export async function soldBetween(q: Querier, businessId: string, from: Date, to: Date): Promise<Map<string, number>> {
  const rows = await q<{ product_id: string; variant: string; qty: number }>(
    `select p.shop_product_id as product_id, p.shop_variant as variant, sum(p.qty)::int as qty
       from product_sales p
      where p.business_id = $1 and p.created_at >= $2 and p.created_at < $3 and ${STANDS}
      group by 1, 2`,
    [businessId, from, to],
  );
  return new Map(rows.map((r) => [soldKey(r.product_id, r.variant), Number(r.qty)]));
}

/** «Продано за 30 дн.»: the last SOLD_DAYS × 24 hours up to now. */
export function soldLastDays(q: Querier, businessId: string, now = Date.now()): Promise<Map<string, number>> {
  return soldBetween(q, businessId, new Date(now - SOLD_DAYS * DAY), new Date(now + 1));
}

export type BarberSold = { staffId: string; name: string; photo: string | null; qty: number };

/** «Продали в ноябре»: this calendar month in the salon's time zone, per barber, most first. */
export async function soldThisMonth(q: Querier, business: Business, productId: string, variant: string, now = Date.now()): Promise<{ month: string; rows: BarberSold[] }> {
  const tz = business.timezone;
  const month = todayIn(tz, now).slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const rows = await q<{ staff_id: string; name: string; photo: string | null; qty: number }>(
    `select s.id as staff_id, s.display_name as name, s.photo_url as photo, sum(p.qty)::int as qty
       from product_sales p join staff s on s.id = p.staff_id
      where p.business_id = $1 and p.shop_product_id = $2 and p.shop_variant = $3
        and p.created_at >= $4 and p.created_at < $5 and ${STANDS}
      group by s.id, s.display_name, s.photo_url
     having sum(p.qty) > 0
      order by qty desc, s.display_name`,
    [business.id, productId, variant, new Date(startOfDay(`${month}-01`, tz)), new Date(startOfDay(`${next}-01`, tz))],
  );
  return { month, rows: rows.map((r) => ({ staffId: r.staff_id, name: r.name, photo: r.photo, qty: Number(r.qty) })) };
}

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

function catItem(p: ShopProduct, sold: Map<string, number>): CatItem {
  return {
    productId: p.productId,
    variant: p.variant,
    name: p.name,
    variantLabel: p.variantLabel,
    brand: p.brand,
    photo: p.photo,
    priceCents: p.priceCents,
    vatBp: p.vatBp,
    stock: p.stock,
    barcode: p.barcode,
    sold: sold.get(soldKey(p.productId, p.variant)) ?? 0,
  };
}

/** A filter as it may be asked for: an exact brand, in or out of stock. */
export function cleanFilter(raw: unknown): CatFilter {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const stock = r.stock === "in" || r.stock === "out" ? r.stock : "";
  return { brand: String(r.brand ?? "").trim().slice(0, 80), stock };
}

/** One page of the list, with the 30 days' sales beside each product. */
export async function cataloguePage(q: Querier, business: Business, page: number, filter: CatFilter, lang: string, env: Env = process.env, now = Date.now()): Promise<CatalogueList> {
  let p = Number.isInteger(page) && page >= 1 ? Math.min(page, 2000) : 1;
  const ask = (n: number) => listProducts({ offset: (n - 1) * CAT_PAGE, limit: CAT_PAGE, brand: filter.brand || null, stock: filter.stock || null, lang }, env);
  const [first, sold] = await Promise.all([ask(p), soldLastDays(q, business.id, now)]);
  let list = first;
  const pages = Math.max(1, Math.ceil(list.total / CAT_PAGE));
  // the list grew shorter since the page was turned: its last page
  if (!list.items.length && list.total > 0 && p > pages) {
    p = pages;
    list = await ask(p);
  }
  return {
    items: list.items.map((x) => catItem(x, sold)),
    total: list.total,
    page: p,
    pages: Math.max(1, Math.ceil(list.total / CAT_PAGE)),
    size: CAT_PAGE,
    brands: list.brands,
    soldTotal: sum(sold),
  };
}

/** A search by a name, a brand or a barcode (as «Продажа товара» finds), the filter over what it found. */
export async function catalogueSearch(q: Querier, business: Business, text: string, filter: CatFilter, lang: string, env: Env = process.env, now = Date.now()): Promise<CatalogueFound> {
  const [found, sold] = await Promise.all([findProducts(String(text ?? ""), CAT_FIND_MOST, env, lang), soldLastDays(q, business.id, now)]);
  const keep = found.filter((p) => (!filter.brand || p.brand === filter.brand) && (!filter.stock || (filter.stock === "in") === (p.stock ?? 0) > 0));
  return { items: keep.map((p) => catItem(p, sold)), capped: found.length >= CAT_FIND_MOST, most: CAT_FIND_MOST, soldTotal: sum(sold) };
}

/** A failure as the page words it: the shop's own, or anything else as «the shop does not answer». */
export function catFail(e: unknown): CatFail {
  if (!(e instanceof ShopError)) {
    console.error("catalogue:", e);
    return "shop_down";
  }
  if (e.code === "not_supported") return "not_supported";
  if (e.code === "not_configured" || e.code === "unauthorized") return "not_configured";
  return "shop_down";
}

/** The page's first load and its action: one page of the list, or why there is none. */
export async function catalogueList(business: Business, page: number, filter: unknown, lang: string, env: Env = process.env): Promise<CatAnswer<CatalogueList>> {
  try {
    return { ok: true, data: await cataloguePage(query, business, page, cleanFilter(filter), lang, env) };
  } catch (e) {
    return { ok: false, code: catFail(e) };
  }
}

/** The search's action: what it found, or why nothing could be. */
export async function catalogueFound(business: Business, text: string, filter: unknown, lang: string, env: Env = process.env): Promise<CatAnswer<CatalogueFound>> {
  try {
    return { ok: true, data: await catalogueSearch(query, business, text, cleanFilter(filter), lang, env) };
  } catch (e) {
    return { ok: false, code: catFail(e) };
  }
}
