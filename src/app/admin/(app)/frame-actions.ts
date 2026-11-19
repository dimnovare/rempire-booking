"use server";

/**
 * What the admin's frame asks for (frame.tsx, sidebar.tsx): another month
 * of the mini month, a star on a page, and the three tiles: «Продажа
 * товара», «Список услуг», «Каталог товаров». Every action checks the login
 * itself and copies its arguments by name.
 *
 * Products, their prices and stock always come from the shop through the
 * shop link (src/lib/shop.ts); a sale is the barber's own sale
 * (src/lib/admin/sale.ts → src/lib/sales.ts).
 *
 * Rights (src/lib/auth/rights.ts): the sale is «Проводить продажу товаров»
 * with «Создание товарных транзакций» (its period decides whether a sale
 * may be dated before today); «Список услуг» is the section «Услуги».
 */
import { refresh } from "next/cache";
import { setFavourite, type FavPage } from "@/lib/admin/favourites";
import { isMonth, monthLoad, type MonthLoad } from "@/lib/admin/month-load";
import { adminSell, findProducts, SALE_BACK_DAYS } from "@/lib/admin/sale";
import { serviceList, type ServiceListRow } from "@/lib/admin/services";
import { listStaff } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { can, canGroup } from "@/lib/auth/rights";
import type { Business } from "@/lib/availability";
import { query } from "@/lib/db";
import { bpText, commissionFor } from "@/lib/money";
import { productTitle, SALES, shopSales } from "@/lib/sales";
import { ShopError, shopMode, type ShopProduct } from "@/lib/shop";
import { localParts, todayIn } from "@/lib/tz";
import { adminLang } from "../lang-server";

/** The load of one month's days, for the mini month. Null for anything that is not a month. */
export async function monthLoadAction(month: string): Promise<MonthLoad | null> {
  const { business } = await requireAdmin();
  return isMonth(month) ? monthLoad(query, business, month) : null;
}

/** Star a page or take the star off; the login's list after it. */
export async function favouriteAction(page: string, on: boolean): Promise<FavPage[] | null> {
  const { user } = await requireAdmin();
  return setFavourite(query, user.id, String(page ?? ""), on === true);
}

/* ---------- the shop's products: the catalogue, and the sale's search ---------- */

export type FrameProduct = {
  productId: string;
  variant: string;
  title: string;
  photo: string | null;
  /** the shop price, VAT inside */
  priceCents: number;
  stock: number | null;
  barcode: string | null;
  /** the barber's share of one unit, unrounded: the form rounds qty × it as the server does */
  shareCents: number;
};

/** `demo`: no shop is connected, these are the demo products. */
export type FoundProducts = { ok: true; items: FrameProduct[]; demo: boolean } | { ok: false; code: "shop_down" | "not_configured" };

function productView(business: Business, p: ShopProduct): FrameProduct {
  const per = commissionFor({ qty: 1_000_000, unitCents: p.priceCents, listCents: p.priceCents, vatBp: p.vatBp, basis: business.settings.commission_basis, bp: business.settings.commission_bp }) / 1_000_000;
  return { productId: p.productId, variant: p.variant, title: productTitle(p), photo: p.photo, priceCents: p.priceCents, stock: p.stock, barcode: p.barcode, shareCents: per };
}

/** Products by a name or a barcode. Read-only. */
export async function findProductsAction(text: string, limit = 12): Promise<FoundProducts> {
  const { business } = await requireAdmin();
  try {
    const items = await findProducts(String(text ?? ""), Number(limit) === 20 ? 20 : 12, process.env, await adminLang());
    return { ok: true, items: items.map((p) => productView(business, p)), demo: shopMode() === "fake" };
  } catch (e) {
    return { ok: false, code: e instanceof ShopError && (e.code === "not_configured" || e.code === "unauthorized") ? "not_configured" : "shop_down" };
  }
}

/* ---------- «Продажа товара» ---------- */

export type SaleForm = {
  /** the working barbers */
  barbers: { id: string; name: string }[];
  /** the login's own barber, if it is one */
  me: string | null;
  tz: string;
  now: number;
  /** «17» */
  pct: string;
  maxQty: number;
  /** how many days back a sale may be dated */
  backDays: number;
  /** no shop connected: demo products */
  demo: boolean;
  /** the sale stays in booking, the shop's stock is not touched (the test run) */
  test: boolean;
};

export async function saleFormAction(): Promise<SaleForm> {
  const { user, business } = await requireAdmin();
  const staff = (await listStaff(query, business.id)).filter((s) => s.active && can(user, "journal.staff", { staffId: s.id }));
  return {
    barbers: staff.map((s) => ({ id: s.id, name: s.name })),
    me: staff.some((s) => s.id === user.staffId) ? user.staffId : null,
    tz: business.timezone,
    now: Date.now(),
    pct: bpText(business.settings.commission_bp),
    maxQty: SALES.maxQty,
    backDays: SALE_BACK_DAYS,
    demo: shopMode() === "fake",
    test: !shopSales(),
  };
}

export type SaleDone =
  | { ok: true; ref: string; replay: boolean }
  | { ok: false; code: "invalid"; field: string }
  | { ok: false; code: "not_found" | "shop_down" }
  | { ok: false; code: "price_changed"; unitCents: number };

/** One sale, as the barber's own. The form made `ref`: the same tap sent twice is one sale. */
export async function sellAction(input: { ref: string; staffId: string; productId: string; variant: string; qty: number; expectCents: number; clientId: string | null; at: number | null }): Promise<SaleDone> {
  const { user, business } = await requireAdmin();
  // the day the sale is dated: «today only» refuses an earlier one
  const at = input?.at == null ? Date.now() : Number(input.at);
  const day = Number.isFinite(at) ? localParts(at, business.timezone).date : "";
  if (!can(user, "visit.sell.create", { date: day, today: todayIn(business.timezone) })) return { ok: false, code: "invalid", field: "forbidden" };
  if (!can(user, "journal.staff", { staffId: String(input?.staffId ?? "") })) return { ok: false, code: "invalid", field: "staff" };
  const r = await adminSell(business, user.id, {
    ref: String(input?.ref ?? ""),
    staffId: String(input?.staffId ?? ""),
    productId: String(input?.productId ?? ""),
    variant: String(input?.variant ?? ""),
    qty: Number(input?.qty),
    expectCents: Number.isFinite(Number(input?.expectCents)) ? Number(input.expectCents) : null,
    clientId: input?.clientId == null ? null : String(input.clientId),
    at: input?.at == null ? null : Number(input.at),
  });
  if (r.ok) {
    refresh();
    return { ok: true, ref: r.sale.ref, replay: r.replay === true };
  }
  if (r.code === "price_changed") return { ok: false, code: "price_changed", unitCents: r.unitCents };
  if (r.code === "invalid") return { ok: false, code: "invalid", field: r.field };
  // a sale to a client never needs a purchase price
  return { ok: false, code: r.code === "not_found" ? "not_found" : "shop_down" };
}

/* ---------- «Список услуг» ---------- */

export async function serviceListAction(): Promise<ServiceListRow[]> {
  const { user, business } = await requireAdmin();
  // the section «Услуги» itself
  if (!canGroup(user, "services")) return [];
  return serviceList(query, business.id);
}
