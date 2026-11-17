"use server";

/**
 * «Продать» (Phase C, C3 and C7). The product, its price and stock always
 * come from the shop (src/lib/shop.ts: the fake shop while SHOP_API_URL is
 * unset); booking keeps only what was sold, at the price of that moment.
 * Every action is the barber's own: requireStaff() decides whose column.
 */
import { refresh } from "next/cache";
import { requireStaff } from "@/lib/auth/current";
import type { Business } from "@/lib/availability";
import { commissionFor } from "@/lib/money";
import { recordSale, undoSale, unitPriceFor, productTitle } from "@/lib/sales";
import { identifyPhoto, lookupBarcode, searchProducts, ShopError, type ShopProduct } from "@/lib/shop";
import { barberLang } from "../../lang-server";

export type SellProduct = {
  productId: string;
  variant: string;
  title: string;
  photo: string | null;
  stock: number | null;
  /** the shop price, VAT inside */
  clientCents: number;
  /** what one unit for himself costs (purchase price with VAT), or null */
  selfCents: number | null;
  /** the barber's share of one unit, unrounded: the sheet rounds qty × it as the server does */
  shareCents: number;
};

export type Found = { ok: true; items: SellProduct[] } | { ok: false; code: "shop_down" | "bad_request" };

function view(business: Business, p: ShopProduct): SellProduct {
  // commissionFor rounds; the unrounded share per unit lets the sheet show qty × it exactly as the server will
  const per = commissionFor({ qty: 1_000_000, unitCents: p.priceCents, listCents: p.priceCents, vatBp: p.vatBp, basis: business.settings.commission_basis, bp: business.settings.commission_bp }) / 1_000_000;
  return {
    productId: p.productId,
    variant: p.variant,
    title: productTitle(p),
    photo: p.photo,
    stock: p.stock,
    clientCents: p.priceCents,
    selfCents: unitPriceFor(p, "self"),
    shareCents: per,
  };
}

const failed = (e: unknown): Found => ({ ok: false, code: e instanceof ShopError && e.code === "bad_request" ? "bad_request" : "shop_down" });

export async function searchAction(q: string): Promise<Found> {
  const { business } = await requireStaff();
  try {
    const items = await searchProducts(String(q ?? "").slice(0, 80), 12, process.env, await barberLang());
    return { ok: true, items: items.map((p) => view(business, p)) };
  } catch (e) {
    return failed(e);
  }
}

export async function barcodeAction(code: string): Promise<Found> {
  const { business } = await requireStaff();
  const c = String(code ?? "").replace(/\s/g, "").slice(0, 64);
  if (!/^[0-9A-Za-z-]{4,64}$/.test(c)) return { ok: true, items: [] };
  try {
    const p = await lookupBarcode(c);
    return { ok: true, items: p ? [view(business, p)] : [] };
  } catch (e) {
    return failed(e);
  }
}

/** C7: a photo or a screenshot, downscaled on the phone, matched by the shop's AI. */
export async function photoAction(dataUrl: string): Promise<Found> {
  const { business } = await requireStaff();
  try {
    const items = await identifyPhoto(String(dataUrl ?? ""));
    return { ok: true, items: items.slice(0, 3).map((p) => view(business, p)) };
  } catch (e) {
    return failed(e);
  }
}

export type SellDone =
  | { ok: true; ref: string; replay: boolean }
  | { ok: false; code: "invalid" | "not_found" | "shop_down" | "no_purchase_price" }
  | { ok: false; code: "price_changed"; unitCents: number };

/** One sale. The phone made `ref`: the same tap sent twice is one sale. */
export async function sellAction(input: { ref: string; productId: string; variant: string; mode: "client" | "self"; qty: number; expectCents: number }): Promise<SellDone> {
  const { user, business, staff } = await requireStaff();
  const r = await recordSale(business, staff.id, user.id, {
    ref: String(input?.ref ?? ""),
    productId: String(input?.productId ?? ""),
    variant: String(input?.variant ?? ""),
    mode: input?.mode === "self" ? "self" : "client",
    qty: Number(input?.qty),
    expectCents: Number.isFinite(Number(input?.expectCents)) ? Number(input.expectCents) : null,
  });
  if (r.ok) {
    refresh();
    return { ok: true, ref: r.sale.ref, replay: r.replay === true };
  }
  if (r.code === "price_changed") return { ok: false, code: "price_changed", unitCents: r.unitCents };
  return { ok: false, code: r.code };
}

export async function undoAction(ref: string): Promise<{ ok: true } | { ok: false; code: "not_found" | "too_late" }> {
  const { user, staff } = await requireStaff();
  const r = await undoSale(staff.id, String(ref ?? ""), user.id);
  if (r.ok) refresh();
  return r;
}
