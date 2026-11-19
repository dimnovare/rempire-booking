/**
 * «Продажа товара» in the admin (src/lib/admin/sale.ts): the front desk
 * records a product for a barber, and it is the barber's own sale, written
 * by the same recordSale() his app uses: one product_sales row, the shop's
 * price, the same 17 %, the same wait before the shop, a test sale while
 * SHOP_SALES is off. Fake products and people only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminSell, findProducts, looksLikeBarcode, SALE_BACK_DAYS } from "@/lib/admin/sale";
import { getBusiness, type Business } from "@/lib/availability";
import { monthStatement } from "@/lib/billing/statement";
import { closeDb, query } from "@/lib/db";
import { listSales, newRef, recordSale, reverseSale, SALES, syncShopSales, undoSale } from "@/lib/sales";
import { FAKE_PRODUCTS, type BarberSaleRequest } from "@/lib/shop";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const NOW = at("2026-10-10", "12:00");
const MIN = 60_000;
const DAY = 86_400_000;
// the real thing: sales go to the (fake) shop; the staging test run has SHOP_SALES off
const LIVE = { NODE_ENV: "test", VITEST: "true", ALLOW_INDEXING: "yes", SHOP_SALES: "on" } as Record<string, string>;
const TEST_RUN = { NODE_ENV: "test", VITEST: "true" } as Record<string, string>;
const paste = FAKE_PRODUCTS[0]; // 24,90 €

let demo: Demo;
let biz: Business;
let owner: string;
let client: string;

beforeEach(async () => {
  demo = await freshDemo();
  biz = (await getBusiness(query, "rempire"))!;
  owner = (await query<{ id: string }>("insert into users (business_id, email, role) values ($1, 'owner@example.test', 'owner') returning id", [biz.id]))[0].id;
  client = (await query<{ id: string }>("insert into clients (business_id, name, phone_e164) values ($1, 'Test Buyer', '+37255550002') returning id", [biz.id]))[0].id;
});
afterAll(closeDb);

const input = (over: Partial<Parameters<typeof adminSell>[2]> = {}) => ({ ref: newRef(), staffId: demo.staff.valentin, productId: paste.productId, variant: paste.variant, qty: 1, ...over });
/** What a sale is, without what differs between any two sales. */
const row = async (ref: string) => {
  const [r] = await query<Record<string, unknown>>("select * from product_sales where ref = $1", [ref]);
  const { id: _id, ref: _ref, created_by: _by, client_id: _client, ...rest } = r;
  return rest;
};

describe("the admin's sale is the barber's sale", () => {
  it("writes the same row the barber's app writes: the shop price, 17 % of the price without VAT, waiting for the shop", async () => {
    const mine = await recordSale(biz, demo.staff.valentin, null, { ref: newRef(), productId: paste.productId, variant: paste.variant, mode: "client", qty: 2 }, NOW, LIVE);
    const desk = await adminSell(biz, owner, input({ qty: 2 }), NOW, LIVE);
    if (!mine.ok || !desk.ok) throw new Error("not sold");
    // 2 × 24,90 €; the barber's share is 17 % of 40,16 € (the price without 24 % VAT)
    expect(desk.sale).toMatchObject({ staffId: demo.staff.valentin, mode: "client", qty: 2, unitCents: 2490, listCents: 2490, totalCents: 4980, commissionCents: 683, status: "done", syncStatus: "queued" });
    expect(await row(desk.sale.ref)).toEqual(await row(mine.sale.ref));
    // one table, one kind of row: who typed it is the only difference
    const [made] = await query<{ created_by: string | null; client_id: string | null }>("select created_by, client_id from product_sales where ref = $1", [desk.sale.ref]);
    expect(made).toEqual({ created_by: owner, client_id: null });
    expect(await query("select 1 from audit where entity = 'product_sale' and entity_id = $1 and action = 'sell'", [desk.sale.id])).toHaveLength(1);
  });

  it("is on the barber's own list and statement, and he can undo it in his app", async () => {
    const r = await adminSell(biz, owner, input(), NOW, LIVE);
    if (!r.ok) throw new Error("not sold");
    const day = [new Date(at("2026-10-10", "00:00")), new Date(at("2026-10-11", "00:00"))] as const;
    expect((await listSales(query, demo.staff.valentin, ...day)).map((s) => s.ref)).toEqual([r.sale.ref]);
    expect(await listSales(query, demo.staff.slava, ...day)).toEqual([]);
    const st = await monthStatement(query, biz, demo.staff.valentin, "2026-10");
    expect(st).toMatchObject({ clientCount: 1, clientCents: 2490, commissionCents: 341 });
    // the barber's own undo, inside his five minutes
    expect(await undoSale(demo.staff.valentin, r.sale.ref, null, NOW + 2 * MIN)).toEqual({ ok: true });
    expect((await listSales(query, demo.staff.valentin, ...day))[0]).toMatchObject({ status: "undone", syncStatus: "none" });
  });

  it("goes to the shop as his sale, after the same wait, once", async () => {
    const r = await adminSell(biz, owner, input({ qty: 3 }), NOW, LIVE);
    if (!r.ok) throw new Error("not sold");
    const sent: BarberSaleRequest[] = [];
    const send = async (s: BarberSaleRequest) => {
      sent.push(s);
      return { orderNumber: "DEMO-1", repeat: false };
    };
    // inside the undo window the shop hears nothing
    expect(await syncShopSales(query, NOW + (SALES.undoMin - 1) * MIN, LIVE, send)).toMatchObject({ sent: 0 });
    expect(await syncShopSales(query, NOW + (SALES.undoMin + 1) * MIN, LIVE, send)).toMatchObject({ sent: 1 });
    expect(sent).toEqual([{ ref: r.sale.ref, barber: { ref: demo.staff.valentin, name: "Valentin" }, mode: "client", items: [{ productId: paste.productId, variant: paste.variant, qty: 3, unitCents: 2490 }] }]);
    expect(await syncShopSales(query, NOW + 60 * MIN, LIVE, send)).toMatchObject({ sent: 0 });
  });

  it("is a test sale while SHOP_SALES is off, as the barber's: counted, never sent", async () => {
    const r = await adminSell(biz, owner, input(), NOW, TEST_RUN);
    expect(r).toMatchObject({ ok: true, sale: { syncStatus: "test", commissionCents: 341 } });
    let calls = 0;
    const send = async () => {
      calls++;
      return { orderNumber: "X", repeat: false };
    };
    expect(await syncShopSales(query, NOW + 60 * MIN, TEST_RUN, send)).toEqual({ sent: 0, retry: 0, failed: 0 });
    expect(calls).toBe(0);
    expect(await monthStatement(query, biz, demo.staff.valentin, "2026-10")).toMatchObject({ clientCount: 1, clientCents: 2490 });
  });

  it("is one sale when «Сохранить» is sent twice with one ref", async () => {
    const one = input();
    const a = await adminSell(biz, owner, one, NOW, LIVE);
    const b = await adminSell(biz, owner, one, NOW + 1000, LIVE);
    expect(a).toMatchObject({ ok: true });
    expect(b).toMatchObject({ ok: true, replay: true });
    expect(await query("select 1 from product_sales where ref = $1", [one.ref])).toHaveLength(1);
    // the same ref for another barber is not that sale
    expect(await adminSell(biz, owner, { ...one, staffId: demo.staff.slava }, NOW, LIVE)).toMatchObject({ ok: false, code: "invalid", field: "ref" });
  });

  it("shows a new price before selling at it, and refuses a product the shop does not have", async () => {
    expect(await adminSell(biz, owner, input({ expectCents: 2000 }), NOW, LIVE)).toEqual({ ok: false, code: "price_changed", unitCents: 2490 });
    expect(await adminSell(biz, owner, input({ productId: "nope" }), NOW, LIVE)).toEqual({ ok: false, code: "not_found" });
    expect(await adminSell(biz, owner, input({ qty: 0 }), NOW, LIVE)).toMatchObject({ ok: false, code: "invalid", field: "qty" });
    expect(await adminSell(biz, owner, input({ qty: SALES.maxQty + 1 }), NOW, LIVE)).toMatchObject({ ok: false, code: "invalid", field: "qty" });
    expect(await query("select 1 from product_sales")).toHaveLength(0);
  });
});

describe("what the front desk adds", () => {
  it("who sold: any working barber, never one who is gone or of another salon", async () => {
    for (const who of ["renat", "slava", "milena"]) expect(await adminSell(biz, owner, input({ staffId: demo.staff[who] }), NOW, LIVE)).toMatchObject({ ok: true, sale: { staffId: demo.staff[who] } });
    await query("update staff set active = false where id = $1", [demo.staff.jevgeni]);
    expect(await adminSell(biz, owner, input({ staffId: demo.staff.jevgeni }), NOW, LIVE)).toEqual({ ok: false, code: "invalid", field: "staff" });
    expect(await adminSell(biz, owner, input({ staffId: "" }), NOW, LIVE)).toEqual({ ok: false, code: "invalid", field: "staff" });
    expect(await adminSell(biz, owner, input({ staffId: "00000000-0000-4000-8000-000000000000" }), NOW, LIVE)).toEqual({ ok: false, code: "invalid", field: "staff" });
    const [other] = await query<{ id: string }>("insert into businesses (slug, name, timezone, default_locale) values ('other', 'Other', 'Europe/Tallinn', 'et') returning id");
    const [loc] = await query<{ id: string }>("insert into locations (business_id, slug, name, address, timezone) values ($1, 'x', 'X', 'X 1', 'Europe/Tallinn') returning id", [other.id]);
    const [alien] = await query<{ id: string }>("insert into staff (business_id, location_id, slug, display_name) values ($1, $2, 'alien', 'Alien') returning id", [other.id, loc.id]);
    expect(await adminSell(biz, owner, input({ staffId: alien.id }), NOW, LIVE)).toEqual({ ok: false, code: "invalid", field: "staff" });
  });

  it("the client who bought: kept on the sale and on its minus row; none is fine", async () => {
    const r = await adminSell(biz, owner, input({ clientId: client }), NOW, LIVE);
    if (!r.ok) throw new Error("not sold");
    expect(r.sale.clientId).toBe(client);
    const [listed] = await listSales(query, demo.staff.valentin, new Date(NOW - DAY), new Date(NOW + DAY));
    expect(listed).toMatchObject({ clientId: client, clientName: "Test Buyer" });
    // a sale from the barber's app names nobody
    const mine = await recordSale(biz, demo.staff.slava, null, { ref: newRef(), productId: paste.productId, variant: paste.variant, mode: "client", qty: 1 }, NOW, LIVE);
    expect(mine).toMatchObject({ ok: true, sale: { clientId: null, clientName: null } });
    // «Сторно» keeps whose it was
    const minus = await reverseSale(biz, r.sale.id, owner);
    if (!minus.ok) throw new Error("not reversed");
    expect(await query("select client_id, qty from product_sales where id = $1", [minus.id])).toEqual([{ client_id: client, qty: -1 }]);
  });

  it("refuses a client who is not ours, and a client on a sale «себе»", async () => {
    expect(await adminSell(biz, owner, input({ clientId: "00000000-0000-4000-8000-000000000000" }), NOW, LIVE)).toEqual({ ok: false, code: "invalid", field: "client" });
    expect(await adminSell(biz, owner, input({ clientId: "not-an-id" }), NOW, LIVE)).toEqual({ ok: false, code: "invalid", field: "client" });
    const [gone] = await query<{ id: string }>("insert into clients (business_id, name, phone_e164, merged_into) values ($1, 'Merged', '+37255550003', $2) returning id", [biz.id, client]);
    expect(await adminSell(biz, owner, input({ clientId: gone.id }), NOW, LIVE)).toEqual({ ok: false, code: "invalid", field: "client" });
    expect(await recordSale(biz, demo.staff.valentin, null, { ref: newRef(), productId: paste.productId, variant: paste.variant, mode: "self", qty: 1, clientId: client }, NOW, LIVE)).toEqual({
      ok: false,
      code: "invalid",
      field: "client",
    });
    expect(await query("select 1 from product_sales")).toHaveLength(0);
  });

  it("the day and time: now by itself, earlier for a sale written down late, never ahead and not older than a month", async () => {
    const now = await adminSell(biz, owner, input(), NOW, LIVE);
    expect(now).toMatchObject({ ok: true, sale: { createdAt: new Date(NOW).toISOString() } });
    // yesterday afternoon: dated then, so it is on that day's list; its wait for the shop is long over
    const then = at("2026-10-09", "16:30");
    const late = await adminSell(biz, owner, input({ at: then }), NOW, LIVE);
    expect(late).toMatchObject({ ok: true, sale: { createdAt: new Date(then).toISOString() } });
    expect(await syncShopSales(query, NOW, LIVE, async () => ({ orderNumber: "DEMO-2", repeat: false }))).toMatchObject({ sent: 1 });
    // a clock a little ahead is «now»; tomorrow is refused
    expect(await adminSell(biz, owner, input({ at: NOW + 2 * MIN }), NOW, LIVE)).toMatchObject({ ok: true, sale: { createdAt: new Date(NOW).toISOString() } });
    expect(await adminSell(biz, owner, input({ at: NOW + DAY }), NOW, LIVE)).toEqual({ ok: false, code: "invalid", field: "at" });
    // the edge of how far back
    expect(await adminSell(biz, owner, input({ at: NOW - SALE_BACK_DAYS * DAY }), NOW, LIVE)).toMatchObject({ ok: true });
    expect(await adminSell(biz, owner, input({ at: NOW - SALE_BACK_DAYS * DAY - MIN }), NOW, LIVE)).toEqual({ ok: false, code: "invalid", field: "at" });
    expect(await adminSell(biz, owner, input({ at: Number.NaN }), NOW, LIVE)).toEqual({ ok: false, code: "invalid", field: "at" });
  });
});

describe("finding the product", () => {
  it("by a name or a barcode, through the shop link", async () => {
    expect((await findProducts("matte paste", 12, {})).map((p) => p.productId)).toEqual([paste.productId]);
    // the barcode as printed, and typed with spaces
    expect((await findProducts(paste.barcode!, 12, {})).map((p) => p.productId)).toEqual([paste.productId]);
    expect((await findProducts("2000 0000 00015", 12, {})).map((p) => p.productId)).toEqual([paste.productId]);
    // a number the shop does not know as a barcode is still looked for as words
    expect(await findProducts("9999999999999", 12, {})).toEqual([]);
    expect(await findProducts("a", 12, {})).toEqual([]);
    expect(await findProducts("   ", 12, {})).toEqual([]);
    // the shop link gives 20 at most, whatever is asked
    expect((await findProducts("demo", 99, {})).length).toBe(FAKE_PRODUCTS.length);
  });

  it("knows a barcode from a name", () => {
    for (const s of ["2000000000015", "2000 0000 00015", "20000000", " 4006381333931 "]) expect(looksLikeBarcode(s)).toBe(true);
    for (const s of ["matte paste", "250 ml", "1234567", "12-34", "", "paste 2000000000015"]) expect(looksLikeBarcode(s)).toBe(false);
  });
});
