/**
 * The one door to rempireshop.com (Phase C, C2; kickoff §7, decision 6):
 * the shop's partner API, never its database. The shop side lives on a
 * branch of rempire-web (docs/phase-c.md) and is pushed only with Dim's OK.
 *
 *   GET  /api/partner/products/lookup?barcode=… | ?q=…&limit=… | ?id=…&variant=…
 *   POST /api/partner/products/identify   {image: "data:image/jpeg;base64,…"}
 *   POST /api/partner/barber-sales        {ref, barber: {ref, name}, mode, items}
 *
 * Environment (names only; Dim puts the values into Vercel):
 *   SHOP_API_URL           the shop's origin, e.g. https://rempireshop.com
 *   SHOP_API_SECRET        the READ key: lookup, search, photo match. The shop
 *                          holds the same value as BOOKING_API_SECRET (or
 *                          BOOKING_API_READ_SECRET). Staging may hold it.
 *   SHOP_API_READ_SECRET   the same read key under its newer name; wins when
 *                          both are set
 *   SHOP_API_WRITE_SECRET  the WRITE key: a barber's sale becomes an order in
 *                          the shop and its stock goes down. The shop holds the
 *                          same value as BOOKING_API_WRITE_SECRET. Production
 *                          only, from the move on; never on staging
 *
 * The shop refuses a sale made with the read key (403), and booking never
 * sends one: sendBarberSale() uses the write key only, and refuses a write
 * key equal to the read key.
 *
 * STAGING NEVER SELLS INTO A LIVE SHOP, whatever is set (Dim, 25.11.2026):
 * while the test run is on (src/lib/test-run.ts: ALLOW_INDEXING is not
 * «yes»), sendBarberSale() refuses any shop that is not on this computer,
 * before a key is read or a request made, and syncShopSales()
 * (src/lib/sales.ts) sends nothing. Staging and production can be the same
 * Vercel project at different times; this is what tells them apart. The
 * local shop-link test (tools/shop-link-local.mjs) runs its shop on
 * localhost, so it still sells.
 *
 * With no SHOP_API_URL this is a **fake shop** of demo products, as push is
 * off without its keys: staging never calls the live shop, and nothing here
 * throws for a missing setting. The fake shop sells, but nothing leaves the
 * app (its order numbers start with DEMO-).
 */
import { indexingAllowed } from "./indexing";

export type ShopProduct = {
  /** the shop's product id and variant: its stock_levels key */
  productId: string;
  variant: string;
  name: string;
  variantLabel: string;
  brand: string;
  /** an absolute https URL, or null */
  photo: string | null;
  /** what a client pays in the shop now, VAT inside */
  priceCents: number;
  /** the purchase price, VAT not inside; null until Renat types it in the shop */
  purchaseCents: number | null;
  vatBp: number;
  stock: number | null;
  barcode: string | null;
};

export type BarberSaleRequest = {
  ref: string;
  barber: { ref: string; name: string };
  mode: "client" | "self";
  items: { productId: string; variant: string; qty: number; unitCents: number }[];
};

export type ShopErrorCode = "not_configured" | "unavailable" | "bad_request" | "unknown_product" | "unauthorized";

export class ShopError extends Error {
  constructor(
    public code: ShopErrorCode,
    message?: string,
  ) {
    super(message ?? `shop: ${code}`);
  }
}

type Env = Record<string, string | undefined>;

/** "live" only when SHOP_API_URL is set; otherwise the fake shop. */
export function shopMode(env: Env = process.env): "live" | "fake" {
  return (env.SHOP_API_URL ?? "").trim() ? "live" : "fake";
}

/* ---------- the fake shop ---------- */

const P = (productId: string, variant: string, name: string, variantLabel: string, brand: string, priceCents: number, purchaseCents: number | null, stock: number, barcode: string): ShopProduct => ({
  productId,
  variant,
  name,
  variantLabel,
  brand,
  photo: null,
  priceCents,
  purchaseCents,
  vatBp: 2400,
  stock,
  barcode,
});

/** Made-up products and barcodes (the 200… in-store range): no real shop data. */
export const FAKE_PRODUCTS: ShopProduct[] = [
  P("demo-matte-paste", "100ml", "Matte Paste", "100 ml", "Demo Grooming", 2490, 1150, 12, "2000000000015"),
  P("demo-sea-salt", "200ml", "Sea Salt Spray", "200 ml", "Demo Grooming", 1990, 840, 8, "2000000000022"),
  P("demo-beard-oil", "30ml", "Beard Oil Cedar", "30 ml", "Demo Beard Co", 2190, 900, 15, "2000000000039"),
  P("demo-shampoo", "250ml", "Daily Shampoo", "250 ml", "Demo Beard Co", 1790, 720, 20, "2000000000046"),
  P("demo-pomade", "100ml", "Shine Pomade", "100 ml", "Demo Grooming", 2290, null, 6, "2000000000053"),
  P("demo-comb", "", "Pocket Comb", "", "Demo Tools", 990, 310, 30, "2000000000060"),
  P("demo-aftershave", "100ml", "Aftershave Balm", "100 ml", "Demo Beard Co", 2690, 1240, 5, "2000000000077"),
  P("demo-powder", "20g", "Texture Powder", "20 g", "Demo Grooming", 1890, 790, 9, "2000000000084"),
];

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

function fakeSearch(q: string, limit: number): ShopProduct[] {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return FAKE_PRODUCTS.filter((p) => {
    const hay = fold(`${p.brand} ${p.name} ${p.variantLabel}`);
    return words.every((w) => hay.includes(w));
  }).slice(0, limit);
}

/** Three demo products picked from the photo's bytes: the same photo, the same three. */
function fakeIdentify(dataUrl: string): ShopProduct[] {
  let h = 0;
  for (let i = 0; i < dataUrl.length; i += 97) h = (h * 31 + dataUrl.charCodeAt(i)) >>> 0;
  const n = FAKE_PRODUCTS.length;
  const start = h % n;
  return [0, 1, 2].map((k) => FAKE_PRODUCTS[(start + k * 3) % n]);
}

/* ---------- the live shop ---------- */

type Key = "read" | "write";

const readKey = (env: Env) => (env.SHOP_API_READ_SECRET ?? "").trim() || (env.SHOP_API_SECRET ?? "").trim();
const writeKey = (env: Env) => (env.SHOP_API_WRITE_SECRET ?? "").trim();
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;

function shopUrl(env: Env): URL {
  const raw = (env.SHOP_API_URL ?? "").trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ShopError("not_configured", "SHOP_API_URL is not a URL");
  }
  const local = LOCAL_HOST.test(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new ShopError("not_configured", "SHOP_API_URL must be https");
  return url;
}

/**
 * May this app sell into the shop at all? The fake shop, yes. A real one only
 * outside the test run, or when it runs on this computer (the shop-link
 * test): staging never sells into a live shop (the module doc).
 */
export function shopWritesAllowed(env: Env = process.env): boolean {
  if (shopMode(env) === "fake") return true;
  if (indexingAllowed(env)) return true;
  try {
    return LOCAL_HOST.test(shopUrl(env).hostname);
  } catch {
    return false;
  }
}

function base(env: Env, key: Key): { url: URL; secret: string } {
  const url = shopUrl(env);
  if (key === "read") {
    const secret = readKey(env);
    if (!secret) throw new ShopError("not_configured", "SHOP_API_SECRET is not set");
    return { url, secret };
  }
  if (!shopWritesAllowed(env)) throw new ShopError("not_configured", "the test run never sells into a live shop (ALLOW_INDEXING is not yes)");
  const secret = writeKey(env);
  if (!secret) throw new ShopError("not_configured", "SHOP_API_WRITE_SECRET is not set");
  if (secret === readKey(env)) throw new ShopError("not_configured", "SHOP_API_WRITE_SECRET must not be the read key");
  return { url, secret };
}

const TIMEOUT_MS = 8000;

async function call<T>(env: Env, path: string, init?: { method?: string; body?: unknown; timeoutMs?: number; key?: Key }): Promise<T> {
  const { url, secret } = base(env, init?.key ?? "read");
  const target = new URL(path, url);
  let res: Response;
  try {
    res = await fetch(target, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Bearer ${secret}`, Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(init?.timeoutMs ?? TIMEOUT_MS),
    });
  } catch (e) {
    throw new ShopError("unavailable", e instanceof Error ? e.message : String(e));
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (res.ok && body) return body;
  const err = body?.error;
  // 403 read_only: the shop wants the write key for this, and was shown the read key
  if (res.status === 401 || res.status === 403) throw new ShopError("unauthorized", err === "read_only" ? "the shop refused the read key for a sale" : undefined);
  if (res.status === 503 && err === "not_configured") throw new ShopError("not_configured", "the shop has no partner secret or AI key");
  if (res.status === 422 || err === "unknown_product") throw new ShopError("unknown_product");
  if (res.status === 400 || res.status === 413) throw new ShopError("bad_request", err);
  throw new ShopError("unavailable", `shop answered ${res.status}`);
}

/** Only what booking needs from an item, typed and bounded. */
export function cleanProduct(raw: unknown): ShopProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10_000_000 ? v : null);
  const productId = str(r.productId, 120);
  const price = int(r.priceCents);
  const vat = int(r.vatBp);
  if (!productId || price === null || vat === null || vat > 10000) return null;
  const photo = str(r.photo, 500);
  return {
    productId,
    variant: str(r.variant, 120),
    name: str(r.name, 200) || productId,
    variantLabel: str(r.variantLabel, 60),
    brand: str(r.brand, 80),
    photo: /^https:\/\//.test(photo) ? photo : null,
    priceCents: price,
    purchaseCents: int(r.purchaseCents),
    vatBp: vat,
    stock: typeof r.stock === "number" && Number.isInteger(r.stock) ? r.stock : null,
    barcode: str(r.barcode, 64) || null,
  };
}

const items = (body: { items?: unknown }): ShopProduct[] => (Array.isArray(body.items) ? body.items.map(cleanProduct).filter((p): p is ShopProduct => !!p) : []);

/* ---------- the four calls ---------- */

export async function lookupBarcode(code: string, env: Env = process.env): Promise<ShopProduct | null> {
  const c = String(code ?? "").trim().slice(0, 64);
  if (!c) return null;
  if (shopMode(env) === "fake") return FAKE_PRODUCTS.find((p) => p.barcode === c) ?? null;
  return items(await call<{ items?: unknown }>(env, `/api/partner/products/lookup?barcode=${encodeURIComponent(c)}`))[0] ?? null;
}

export async function searchProducts(q: string, limit = 10, env: Env = process.env, lang = "ru"): Promise<ShopProduct[]> {
  const s = String(q ?? "").trim().slice(0, 80);
  if (s.length < 2) return [];
  const n = Math.min(Math.max(1, Math.floor(limit)), 20);
  if (shopMode(env) === "fake") return fakeSearch(s, n);
  return items(await call<{ items?: unknown }>(env, `/api/partner/products/lookup?q=${encodeURIComponent(s)}&limit=${n}&lang=${encodeURIComponent(lang)}`));
}

/** One variant by its id, for the price at the moment of the sale. */
export async function productById(productId: string, variant: string, env: Env = process.env): Promise<ShopProduct | null> {
  const id = String(productId ?? "").trim().slice(0, 120);
  const v = String(variant ?? "").trim().slice(0, 120);
  if (!id) return null;
  if (shopMode(env) === "fake") return FAKE_PRODUCTS.find((p) => p.productId === id && p.variant === v) ?? null;
  return items(await call<{ items?: unknown }>(env, `/api/partner/products/lookup?id=${encodeURIComponent(id)}&variant=${encodeURIComponent(v)}`))[0] ?? null;
}

/** Up to three products that look like the photo (C7); the shop's own AI key, never ours. */
export async function identifyPhoto(dataUrl: string, env: Env = process.env): Promise<ShopProduct[]> {
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 2_800_000) throw new ShopError("bad_request", "not an image");
  if (shopMode(env) === "fake") return fakeIdentify(dataUrl);
  return items(await call<{ items?: unknown }>(env, "/api/partner/products/identify", { method: "POST", body: { image: dataUrl }, timeoutMs: 25_000 })).slice(0, 3);
}

/**
 * The sale reaches the shop: an order, its stock goes down. Idempotent by ref.
 * The write key only, and never from the test run into a live shop (the module doc).
 */
export async function sendBarberSale(sale: BarberSaleRequest, env: Env = process.env): Promise<{ orderNumber: string; repeat: boolean }> {
  if (shopMode(env) === "fake") return { orderNumber: `DEMO-${sale.ref.slice(0, 8).toUpperCase()}`, repeat: false };
  const out = await call<{ ok?: boolean; orderNumber?: unknown; repeat?: unknown }>(env, "/api/partner/barber-sales", { method: "POST", body: sale, timeoutMs: 15_000, key: "write" });
  if (!out.ok || typeof out.orderNumber !== "string" || !out.orderNumber) throw new ShopError("unavailable", "no order number");
  return { orderNumber: out.orderNumber.slice(0, 40), repeat: out.repeat === true };
}
