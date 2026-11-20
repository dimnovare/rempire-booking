/**
 * What a line of a draft can be picked from (docs/one-place.md): the shop's
 * products and the salon's services, the two lists that already exist. An
 * invoice has no list of its own; a line that is in neither is typed.
 *
 *   findLineItems   both lists by a few letters: the shop's products through
 *                   the shop link (src/lib/shop.ts), with the price a client
 *                   pays, and the working services with their price;
 *   pickedVat       the rate a picked product is sold at, read from the shop
 *                   again on the server, for vatFor() to apply the invoice's
 *                   own rule (src/lib/billing/invoices.ts). A service has
 *                   none: its line takes the issuer's rate, as a typed one.
 *
 * Every price here has its VAT inside, as everywhere in billing.
 */
import type { L10n } from "../catalog";
import type { Querier } from "../db";
import { productTitle } from "../sales";
import { productById, searchProducts, type ShopProduct } from "../shop";
import type { LinePicked } from "./invoices";

type Env = Record<string, string | undefined>;

export type LineItem =
  | { source: "product"; key: string; productId: string; variant: string; name: string; priceCents: number; vatBp: number }
  | { source: "service"; key: string; serviceId: string; name: string; priceCents: number };

/** What the browser sends back with a picked line: which item it was, never its price or rate. */
export type LinePick = { source: "product"; productId: string; variant: string } | { source: "service"; serviceId: string };

export type ServiceForPick = { id: string; name: L10n; priceCents: number };

const fold = (s: string) => s.toLocaleLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

export const productItem = (p: ShopProduct): LineItem => ({ source: "product", key: `p:${p.productId}:${p.variant}`, productId: p.productId, variant: p.variant, name: productTitle(p), priceCents: p.priceCents, vatBp: p.vatBp });

/** The services whose name (in any of the three languages) has every word typed; the name shown is in `lang`. */
export function serviceItems(services: readonly ServiceForPick[], text: string, lang: string, limit = 8): LineItem[] {
  const words = fold(String(text ?? "")).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const name = (n: L10n) => n[lang as keyof L10n] || n.ru || n.et || n.en || "";
  return services
    .filter((s) => {
      const hay = fold([s.name.ru, s.name.et, s.name.en].filter(Boolean).join(" "));
      return words.every((w) => hay.includes(w));
    })
    .slice(0, limit)
    .map((s) => ({ source: "service", key: `s:${s.id}`, serviceId: s.id, name: name(s.name), priceCents: s.priceCents }));
}

/** The working services of a business, with the price a client pays (the service's own). */
export async function servicesForPick(q: Querier, businessId: string): Promise<ServiceForPick[]> {
  const rows = await q<{ id: string; name: L10n; price_cents: number }>("select id, name, price_cents from services where business_id = $1 and active order by sort, slug", [businessId]);
  return rows.map((r) => ({ id: r.id, name: r.name, priceCents: r.price_cents }));
}

export type FoundItems = { items: LineItem[]; shopDown: boolean };

/**
 * Both lists for what was typed (two letters at least): the services first
 * (they are few and ours), then the shop's products. A shop that does not
 * answer leaves the services and says so; typing on is always possible.
 */
export async function findLineItems(q: Querier, businessId: string, text: string, lang = "ru", env: Env = process.env): Promise<FoundItems> {
  const s = String(text ?? "").trim().slice(0, 80);
  if (s.length < 2) return { items: [], shopDown: false };
  const services = serviceItems(await servicesForPick(q, businessId), s, lang);
  let products: LineItem[] = [];
  let shopDown = false;
  try {
    products = (await searchProducts(s, 8, env, lang)).map(productItem);
  } catch {
    shopDown = true;
  }
  return { items: [...services, ...products], shopDown };
}

/**
 * A pick as it came from the browser, checked: a product is asked from the
 * shop again for the rate it is sold at; a service must be this business's.
 * Null when the item is not there (the line is then saved as typed).
 */
export async function pickedVat(q: Querier, businessId: string, raw: unknown, env: Env = process.env): Promise<LinePicked | null> {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (p.source === "product") {
    const id = typeof p.productId === "string" ? p.productId.slice(0, 120) : "";
    const variant = typeof p.variant === "string" ? p.variant.slice(0, 120) : "";
    if (!id) return null;
    try {
      const product = await productById(id, variant, env);
      return product ? { saleVatBp: product.vatBp } : null;
    } catch {
      return null;
    }
  }
  if (p.source === "service") {
    const id = typeof p.serviceId === "string" ? p.serviceId : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [row] = await q("select 1 from services where id = $1 and business_id = $2", [id, businessId]);
    return row ? {} : null;
  }
  return null;
}
