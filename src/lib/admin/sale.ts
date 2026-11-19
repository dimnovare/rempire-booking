/**
 * «Продажа товара» in the admin (docs/one-place.md): the front desk records
 * a product a barber sold. It is the barber's own sale, written by
 * recordSale() (src/lib/sales.ts): the same product_sales row, the shop's
 * price, the same 17 %, the same wait before the shop hears of it, and a
 * test sale while SHOP_SALES is off. Nothing here writes a sale itself.
 *
 * What the admin adds: who sold (any working barber, not only the login's
 * own), the day and time (now, or earlier for a sale written down late),
 * and the client who bought, if he is named.
 */
import type { Business } from "../availability";
import { query } from "../db";
import { recordSale, type SellResult } from "../sales";
import { searchProducts, lookupBarcode, type ShopProduct } from "../shop";
import { isUuid } from "./visits";

type Env = Record<string, string | undefined>;

/** How far back a sale may be dated, and how far a clock may run ahead. */
export const SALE_BACK_DAYS = 31;
const AHEAD_MS = 5 * 60_000;
const DAY = 86_400_000;

export type AdminSellInput = {
  ref: string;
  /** the barber who sold */
  staffId: string;
  productId: string;
  variant: string;
  qty: number;
  /** the price the front desk saw, per unit */
  expectCents?: number | null;
  /** the client who bought, or none */
  clientId?: string | null;
  /** when it was sold; now if left out */
  at?: number | null;
};

export type AdminSellResult = SellResult | { ok: false; code: "invalid"; field: "staff" | "at" };

export async function adminSell(business: Business, actorUserId: string, input: AdminSellInput, now = Date.now(), env: Env = process.env): Promise<AdminSellResult> {
  const staffId = String(input.staffId ?? "");
  if (!isUuid(staffId)) return { ok: false, code: "invalid", field: "staff" };
  const [barber] = await query<{ id: string }>("select id from staff where id = $1 and business_id = $2 and active", [staffId, business.id]);
  if (!barber) return { ok: false, code: "invalid", field: "staff" };

  const at = input.at == null ? now : Number(input.at);
  if (!Number.isFinite(at) || at > now + AHEAD_MS || at < now - SALE_BACK_DAYS * DAY) return { ok: false, code: "invalid", field: "at" };

  return recordSale(
    business,
    barber.id,
    actorUserId,
    { ref: input.ref, productId: input.productId, variant: input.variant, mode: "client", qty: input.qty, expectCents: input.expectCents ?? null, clientId: input.clientId ?? null },
    Math.min(at, now),
    env,
  );
}

/** A line of digits (spaces and dashes aside) long enough to be a barcode. */
export const looksLikeBarcode = (s: string) => /^[0-9][0-9 -]{6,62}[0-9]$/.test(s.trim()) && s.replace(/\D/g, "").length >= 8;

/**
 * The shop's products by a name or a barcode, through the shop link
 * (src/lib/shop.ts): the same two calls the barber's «Продать» makes. A
 * barcode that the shop does not know is still tried as words, so a product
 * number typed into the name finds its product.
 */
export async function findProducts(text: string, limit = 12, env: Env = process.env, lang = "ru"): Promise<ShopProduct[]> {
  const s = String(text ?? "").trim().slice(0, 80);
  if (s.length < 2) return [];
  if (looksLikeBarcode(s)) {
    const hit = await lookupBarcode(s.replace(/\D/g, ""), env);
    if (hit) return [hit];
  }
  return searchProducts(s, limit, env, lang);
}
