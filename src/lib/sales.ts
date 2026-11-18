/**
 * C3: a barber sells a shop product from his app (docs/phase-c.md).
 *
 * The phone mints the sale's `ref` before the first send, so a retry on a
 * bad connection is the same sale: one row here (ref is unique) and one
 * order in the shop (the shop's own idempotency key). The price is read
 * from the shop again on the server; if it is not the one the barber saw,
 * nothing is sold and the new price is shown first.
 *
 * The trip to the shop waits out the undo window (UNDO_MIN): a sale undone
 * in time never reaches the shop at all. After that the cron
 * (/api/cron/outbox) sends it, with retries and backoff, as the outbox does
 * with messages; a sale the shop refuses for good is «failed» and Renat
 * sees it in «Счета».
 *
 * A wrong sale after that is reversed by a minus row (reverseSale), never
 * deleted. The minus row is booking's own: putting the product back on the
 * shop's shelf is a «Склад» move in the shop's admin.
 *
 * The 17 % is computed and stored here, never in the shop (kickoff §7.3).
 *
 * SHOP_SALES (docs/test-run.md): only "on" sends sales to the shop. Off (the
 * staging test run, reading the live shop's products) a sale is booking's
 * own, sync_status 'test': never sent, still on the statement and the invoice
 * draft. A sale for himself with no purchase price then books 0 €, marked
 * (mode 'self', purchase_cents null); with SHOP_SALES on it is refused.
 */
import { randomBytes } from "node:crypto";
import type { Business } from "./availability";
import { query, withTx, type Querier } from "./db";
import { commissionFor, grossOfNet } from "./money";
import { productById, sendBarberSale, ShopError, type ShopProduct } from "./shop";

type Env = Record<string, string | undefined>;

/** Sales go to the shop only with SHOP_SALES=on (the move, with the full partner API). */
export function shopSales(env: Env = process.env): boolean {
  return env.SHOP_SALES === "on";
}

export const SALES = {
  /** a barber may take a sale back this long after the tap */
  undoMin: 5,
  /** most of one product in one sale */
  maxQty: 20,
  /** sales sent to the shop per cron run */
  batch: 20,
  /** a claimed sale is free again after this, if its run died */
  lockMin: 5,
  /** tries before a sale is «failed» (2, 4 … 128 min apart: about 4 hours) */
  maxAttempts: 8,
  /** a cron run starts no new shop call after this long, so a slow shop never eats the run */
  budgetMs: 40_000,
};

/**
 * How long one «minute» of the timers above is (the undo window, the lock,
 * the backoff). Always 60 s, except in a local `next dev` that sets
 * SALES_MINUTE_MS: the shop-link test (tools/shop-link-local.mjs) runs on
 * one second, so it doesn't wait 5 minutes for each sale. Never read in
 * production.
 */
export function saleMinuteMs(env: Env = process.env): number {
  const v = Number(env.SALES_MINUTE_MS);
  return env.NODE_ENV !== "production" && Number.isInteger(v) && v >= 100 && v < 60_000 ? v : 60_000;
}

export type Sale = {
  id: string;
  ref: string;
  staffId: string;
  mode: "client" | "self";
  productId: string;
  variant: string;
  name: string;
  qty: number;
  unitCents: number;
  listCents: number;
  vatBp: number;
  commissionCents: number;
  totalCents: number;
  status: "done" | "undone";
  syncStatus: "queued" | "sending" | "synced" | "failed" | "none" | "test";
  /** a sale for himself booked at 0 € because the shop has no purchase price for it (test run only) */
  noPurchase: boolean;
  syncError: string | null;
  shopOrderRef: string | null;
  reversesId: string | null;
  reversedBy: string | null;
  note: string;
  createdAt: string;
};

type SaleRow = {
  id: string;
  ref: string;
  staff_id: string;
  mode: "client" | "self";
  shop_product_id: string;
  shop_variant: string;
  name: string;
  qty: number;
  unit_cents: number;
  list_cents: number;
  vat_bp: number;
  commission_cents: number;
  total_cents: number;
  status: "done" | "undone";
  sync_status: Sale["syncStatus"];
  sync_error: string | null;
  shop_order_ref: string | null;
  purchase_cents: number | null;
  reverses_id: string | null;
  reversed_by?: string | null;
  note: string;
  created_at: Date;
};

const saleOf = (r: SaleRow): Sale => ({
  id: r.id,
  ref: r.ref,
  staffId: r.staff_id,
  mode: r.mode,
  productId: r.shop_product_id,
  variant: r.shop_variant,
  name: r.name,
  qty: r.qty,
  unitCents: r.unit_cents,
  listCents: r.list_cents,
  vatBp: r.vat_bp,
  commissionCents: r.commission_cents,
  totalCents: r.total_cents,
  status: r.status,
  syncStatus: r.sync_status,
  syncError: r.sync_error,
  shopOrderRef: r.shop_order_ref,
  noPurchase: r.mode === "self" && r.purchase_cents == null,
  reversesId: r.reverses_id,
  reversedBy: r.reversed_by ?? null,
  note: r.note,
  createdAt: new Date(r.created_at).toISOString(),
});

const SALE_SQL = `select p.*, (select r.id from product_sales r where r.reverses_id = p.id) as reversed_by from product_sales p`;

export const isRef = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v);
export const newRef = () => `s_${randomBytes(12).toString("base64url")}`;

/** The full product line as the statement and the invoice print it. */
export function productTitle(p: Pick<ShopProduct, "brand" | "name" | "variantLabel">): string {
  return [p.brand, p.name, p.variantLabel].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 200);
}

/**
 * What the barber pays per unit, VAT inside. With no purchase price in the
 * shop: null (he can't take it for himself yet), or 0 during the test run.
 */
export function unitPriceFor(p: ShopProduct, mode: "client" | "self", env: Env = process.env): number | null {
  if (mode === "client") return p.priceCents;
  if (p.purchaseCents != null) return grossOfNet(p.purchaseCents, p.vatBp);
  return shopSales(env) ? null : 0;
}

/** The price and the barber's share, as the sale sheet shows it before the tap. */
export function quote(business: Business, p: ShopProduct, mode: "client" | "self", qty: number, env: Env = process.env): { unitCents: number; totalCents: number; commissionCents: number } | null {
  const unit = unitPriceFor(p, mode, env);
  if (unit === null) return null;
  const commission =
    mode === "client" ? commissionFor({ qty, unitCents: unit, listCents: p.priceCents, vatBp: p.vatBp, basis: business.settings.commission_basis, bp: business.settings.commission_bp }) : 0;
  return { unitCents: unit, totalCents: qty * unit, commissionCents: commission };
}

export type SellInput = { ref: string; productId: string; variant: string; mode: string; qty: number; expectCents?: number | null };

export type SellResult =
  | { ok: true; sale: Sale; replay?: boolean }
  | { ok: false; code: "invalid"; field: string }
  | { ok: false; code: "not_found" | "shop_down" | "no_purchase_price" }
  | { ok: false; code: "price_changed"; unitCents: number };

/** Sell one product (qty of it) as this barber. Safe to send twice with the same ref. */
export async function recordSale(
  business: Business,
  staffId: string,
  actorUserId: string | null,
  input: SellInput,
  now = Date.now(),
  env: Env = process.env,
): Promise<SellResult> {
  if (!isRef(input.ref)) return { ok: false, code: "invalid", field: "ref" };
  const mode = input.mode === "self" ? "self" : input.mode === "client" ? "client" : null;
  if (!mode) return { ok: false, code: "invalid", field: "mode" };
  const qty = Number(input.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > SALES.maxQty) return { ok: false, code: "invalid", field: "qty" };

  const [seen] = await query<SaleRow>(`${SALE_SQL} where p.ref = $1`, [input.ref]);
  if (seen) {
    if (seen.staff_id !== staffId) return { ok: false, code: "invalid", field: "ref" };
    return { ok: true, sale: saleOf(seen), replay: true };
  }

  let product: ShopProduct | null;
  try {
    product = await productById(String(input.productId ?? ""), String(input.variant ?? ""), env);
  } catch (e) {
    if (e instanceof ShopError && e.code === "unknown_product") return { ok: false, code: "not_found" };
    return { ok: false, code: "shop_down" };
  }
  if (!product) return { ok: false, code: "not_found" };
  const q = quote(business, product, mode, qty, env);
  if (!q) return { ok: false, code: "no_purchase_price" };
  // the barber saw a price: if the shop's moved since, he sees the new one first
  if (input.expectCents != null && Number(input.expectCents) !== q.unitCents) return { ok: false, code: "price_changed", unitCents: q.unitCents };

  return withTx(async (tx) => {
    const [row] = await tx<SaleRow>(
      `insert into product_sales (business_id, ref, staff_id, mode, shop_product_id, shop_variant, name, barcode, qty, unit_cents, list_cents,
                                  purchase_cents, vat_bp, commission_bp, commission_basis, commission_cents, total_cents, sync_after, created_by, created_at, sync_status)
       select $1, $2, s.id, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
         from staff s where s.id = $3 and s.business_id = $1
       on conflict (ref) do nothing
       returning *, null::uuid as reversed_by`,
      [
        business.id,
        input.ref,
        staffId,
        mode,
        product.productId,
        product.variant,
        productTitle(product),
        product.barcode,
        qty,
        q.unitCents,
        product.priceCents,
        mode === "self" ? product.purchaseCents : null,
        product.vatBp,
        mode === "client" ? business.settings.commission_bp : 0,
        mode === "client" ? business.settings.commission_basis : null,
        q.commissionCents,
        q.totalCents,
        new Date(now + SALES.undoMin * saleMinuteMs()),
        actorUserId,
        new Date(now),
        shopSales(env) ? "queued" : "test",
      ],
    );
    if (!row) {
      // the same ref arrived twice at once: the other one won
      const [other] = await tx<SaleRow>(`${SALE_SQL} where p.ref = $1`, [input.ref]);
      if (!other || other.staff_id !== staffId) return { ok: false as const, code: "invalid" as const, field: "ref" };
      return { ok: true as const, sale: saleOf(other), replay: true };
    }
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'product_sale', $2, 'sell', $3::jsonb)`, [
      actorUserId ?? "barber",
      row.id,
      JSON.stringify({ mode, productId: product.productId, variant: product.variant, qty, unitCents: q.unitCents }),
    ]);
    return { ok: true as const, sale: saleOf(row) };
  });
}

/** The barber takes a sale back, within the window and before it left for the shop. */
export async function undoSale(staffId: string, ref: string, actorUserId: string | null, now = Date.now()): Promise<{ ok: true } | { ok: false; code: "not_found" | "too_late" }> {
  if (!isRef(ref)) return { ok: false, code: "not_found" };
  return withTx(async (tx) => {
    const [row] = await tx<{ id: string }>(
      `update product_sales set status = 'undone', undone_at = $3, sync_status = 'none'
        where ref = $1 and staff_id = $2 and status = 'done' and reverses_id is null
          and sync_status in ('queued', 'test') and sync_attempts = 0 and created_at > $4
        returning id`,
      [ref, staffId, new Date(now), new Date(now - SALES.undoMin * saleMinuteMs())],
    );
    if (!row) {
      const [exists] = await tx("select 1 from product_sales where ref = $1 and staff_id = $2", [ref, staffId]);
      return { ok: false as const, code: exists ? ("too_late" as const) : ("not_found" as const) };
    }
    await tx(`insert into audit (actor, entity, entity_id, action) values ($1, 'product_sale', $2, 'undo')`, [actorUserId ?? "barber", row.id]);
    return { ok: true as const };
  });
}

/**
 * Renat takes back a sale after the window: a minus row with the same
 * amounts. If the sale has not reached the shop yet, it never will.
 */
export async function reverseSale(business: Business, saleId: string, actor: string, note = ""): Promise<{ ok: true; id: string } | { ok: false; code: "not_found" | "already" }> {
  return withTx(async (tx) => {
    const [orig] = await tx<SaleRow & { business_id: string }>(`select * from product_sales where id = $1 and business_id = $2 for update`, [saleId, business.id]);
    if (!orig || orig.status !== "done" || orig.reverses_id) return { ok: false as const, code: "not_found" as const };
    const [taken] = await tx("select 1 from product_sales where reverses_id = $1", [saleId]);
    if (taken) return { ok: false as const, code: "already" as const };
    if (orig.sync_status === "queued" || orig.sync_status === "failed") {
      await tx("update product_sales set sync_status = 'none', sync_error = 'reversed before it reached the shop' where id = $1", [saleId]);
    }
    const [row] = await tx<{ id: string }>(
      `insert into product_sales (business_id, ref, staff_id, mode, shop_product_id, shop_variant, name, barcode, qty, unit_cents, list_cents,
                                  purchase_cents, vat_bp, commission_bp, commission_basis, commission_cents, total_cents,
                                  reverses_id, note, sync_status, created_by)
       select business_id, $2, staff_id, mode, shop_product_id, shop_variant, name, barcode, -qty, unit_cents, list_cents,
              purchase_cents, vat_bp, commission_bp, commission_basis, -commission_cents, -total_cents,
              id, $3, case when sync_status = 'test' then 'test' else 'none' end, $4
         from product_sales where id = $1
       returning id`,
      [saleId, `r_${randomBytes(12).toString("base64url")}`, String(note ?? "").trim().slice(0, 300), /^[0-9a-f-]{36}$/i.test(actor) ? actor : null],
    );
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'product_sale', $2, 'reverse', $3::jsonb)`, [actor, saleId, JSON.stringify({ minus: row.id })]);
    return { ok: true as const, id: row.id };
  });
}

/** A failed sale goes to the shop once more (Renat's «Повторить»). */
export async function retrySale(business: Business, saleId: string, actor: string, now = Date.now()): Promise<boolean> {
  const rows = await withTx((tx) =>
    tx<{ id: string }>(
      `update product_sales set sync_status = 'queued', sync_after = $3, sync_attempts = 0, sync_error = null
        where id = $1 and business_id = $2 and sync_status = 'failed' and status = 'done' and reverses_id is null returning id`,
      [saleId, business.id, new Date(now)],
    ),
  );
  if (rows.length) await withTx((tx) => tx(`insert into audit (actor, entity, entity_id, action) values ($1, 'product_sale', $2, 'retry')`, [actor, saleId]));
  return rows.length > 0;
}

/** A barber's sales between two moments, newest first (undone ones too: the app shows them crossed out). */
export async function listSales(q: Querier, staffId: string, from: Date, to: Date): Promise<Sale[]> {
  const rows = await q<SaleRow>(`${SALE_SQL} where p.staff_id = $1 and p.created_at >= $2 and p.created_at < $3 order by p.created_at desc`, [staffId, from, to]);
  return rows.map(saleOf);
}

/** Every barber's sales between two moments (the admin), newest first. */
export async function listAllSales(q: Querier, businessId: string, from: Date, to: Date): Promise<(Sale & { staffName: string })[]> {
  const rows = await q<SaleRow & { staff_name: string }>(
    `select p.*, s.display_name as staff_name, (select r.id from product_sales r where r.reverses_id = p.id) as reversed_by
       from product_sales p join staff s on s.id = p.staff_id
      where p.business_id = $1 and p.created_at >= $2 and p.created_at < $3 order by p.created_at desc`,
    [businessId, from, to],
  );
  return rows.map((r) => ({ ...saleOf(r), staffName: r.staff_name }));
}

/** Sales the shop never got, for Renat's attention. */
export async function failedSales(q: Querier, businessId: string): Promise<(Sale & { staffName: string })[]> {
  const rows = await q<SaleRow & { staff_name: string }>(
    `select p.*, s.display_name as staff_name, null::uuid as reversed_by from product_sales p join staff s on s.id = p.staff_id
      where p.business_id = $1 and p.sync_status = 'failed' order by p.created_at desc limit 50`,
    [businessId],
  );
  return rows.map((r) => ({ ...saleOf(r), staffName: r.staff_name }));
}

/* ---------- to the shop ---------- */

/** `left`: claimed sales this run had no time for; they wait for the next one, their try not counted. */
export type SyncResult = { sent: number; retry: number; failed: number; left?: number };

/**
 * One run: send the sales whose undo window is over. Called by the cron,
 * after the messages. Starts no new shop call once `budgetMs` (wall clock)
 * is spent; each call has its own timeout (src/lib/shop.ts).
 */
export async function syncShopSales(q: Querier, now = Date.now(), env: Env = process.env, send = sendBarberSale, budgetMs = SALES.budgetMs): Promise<SyncResult> {
  const res: SyncResult = { sent: 0, retry: 0, failed: 0 };
  // the test run reads the live shop but never sells into it, not even a sale queued before the switch went off
  if (!shopSales(env)) return res;
  const stopAt = Date.now() + budgetMs;
  const rows = await q<SaleRow & { staff_name: string; sync_attempts: number }>(
    `update product_sales p set sync_status = 'sending', sync_locked = $2, sync_attempts = p.sync_attempts + 1
       from staff s
      where s.id = p.staff_id and p.id in (
              select id from product_sales
               where (sync_status = 'queued' and sync_after <= $1) or (sync_status = 'sending' and sync_locked < $1)
               order by sync_after limit $3 for update skip locked)
      returning p.*, s.display_name as staff_name`,
    [new Date(now), new Date(now + SALES.lockMin * saleMinuteMs()), SALES.batch],
  );
  for (const [i, r] of rows.entries()) {
    if (Date.now() >= stopAt) {
      const ids = rows.slice(i).map((x) => x.id);
      await q(`update product_sales set sync_status = 'queued', sync_locked = null, sync_attempts = greatest(sync_attempts - 1, 0) where id = any($1::uuid[])`, [ids]);
      res.left = ids.length;
      break;
    }
    try {
      const out = await send(
        {
          ref: r.ref,
          barber: { ref: r.staff_id, name: r.staff_name.slice(0, 80) },
          mode: r.mode,
          items: [{ productId: r.shop_product_id, variant: r.shop_variant, qty: r.qty, unitCents: r.unit_cents }],
        },
        env,
      );
      await q(`update product_sales set sync_status = 'synced', shop_order_ref = $2, synced_at = $3, sync_locked = null, sync_error = null where id = $1`, [r.id, out.orderNumber, new Date(now)]);
      res.sent++;
    } catch (e) {
      const error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      // the shop said no to this sale itself: trying again will not change that
      const final = (e instanceof ShopError && (e.code === "unknown_product" || e.code === "bad_request")) || r.sync_attempts >= SALES.maxAttempts;
      if (final) {
        await q(`update product_sales set sync_status = 'failed', sync_locked = null, sync_error = $2 where id = $1`, [r.id, error]);
        res.failed++;
      } else {
        await q(`update product_sales set sync_status = 'queued', sync_locked = null, sync_after = $2, sync_error = $3 where id = $1`, [r.id, new Date(now + 2 ** r.sync_attempts * saleMinuteMs()), error]);
        res.retry++;
      }
    }
  }
  return res;
}
