/**
 * «Каталог товаров» (Dim, 26.11.2026): the shop's whole list a page at a
 * time (listProducts in src/lib/shop.ts), and how many of each product our
 * barbers sold (src/lib/admin/catalogue.ts). The fake shop pages through
 * its demo products as the shop's list route does; the live one is a fetch
 * stub, and a shop without the route (404) is «not_supported», so the page
 * can stay a search. The sales are real rows on PGlite, made with the
 * barbers' own recordSale / undoSale / reverseSale. Fake data only.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { catalogueList, cataloguePage, catalogueSearch, soldKey, soldLastDays, soldThisMonth, CAT_PAGE } from "@/lib/admin/catalogue";
import { getBusiness, type Business } from "@/lib/availability";
import { closeDb, query } from "@/lib/db";
import { newRef, recordSale, reverseSale, undoSale } from "@/lib/sales";
import { FAKE_PRODUCTS, listProducts, lookupBarcode, LIST_MOST, ShopError } from "@/lib/shop";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const FAKE = {} as Record<string, string>;
const READ = "fake-read-key-0123456789";
const LIVE = { SHOP_API_URL: "https://shop.example.test", SHOP_API_SECRET: READ } as Record<string, string>;
const names = (l: { items: { name: string }[] }) => l.items.map((p) => p.name);

describe("listProducts, the fake shop", () => {
  it("gives the whole list in the shop's order (brand, name, variant), with every brand A→Z", async () => {
    const all = await listProducts({}, FAKE);
    expect(all.total).toBe(FAKE_PRODUCTS.length);
    expect(names(all)).toEqual(["Aftershave Balm", "Beard Oil Cedar", "Daily Shampoo", "Matte Paste", "Sea Salt Spray", "Shine Pomade", "Texture Powder", "Pocket Comb"]);
    expect(all.brands).toEqual(["Demo Beard Co", "Demo Grooming", "Demo Tools"]);
  });

  it("pages through it: offset and limit, the total stays the whole", async () => {
    const page = await listProducts({ offset: 3, limit: 2 }, FAKE);
    expect(names(page)).toEqual(["Matte Paste", "Sea Salt Spray"]);
    expect(page.total).toBe(8);
    const past = await listProducts({ offset: 50, limit: 10 }, FAKE);
    expect(past).toMatchObject({ items: [], total: 8 });
  });

  it("filters by an exact brand and by stock; the brands stay all of them", async () => {
    const grooming = await listProducts({ brand: "Demo Grooming" }, FAKE);
    expect(names(grooming)).toEqual(["Matte Paste", "Sea Salt Spray", "Shine Pomade", "Texture Powder"]);
    expect(grooming.total).toBe(4);
    expect(grooming.brands).toEqual(["Demo Beard Co", "Demo Grooming", "Demo Tools"]);
    // exact, not a search
    expect((await listProducts({ brand: "demo grooming" }, FAKE)).total).toBe(0);
    expect((await listProducts({ brand: "Grooming" }, FAKE)).total).toBe(0);
    // none left is out of stock
    const out = await listProducts({ stock: "out" }, FAKE);
    expect(names(out)).toEqual(["Aftershave Balm"]);
    expect(out.items[0].stock).toBe(0);
    const inStock = await listProducts({ stock: "in" }, FAKE);
    expect(inStock.total).toBe(7);
    expect(inStock.items.every((p) => (p.stock ?? 0) > 0)).toBe(true);
    // both at once
    expect(names(await listProducts({ brand: "Demo Beard Co", stock: "in" }, FAKE))).toEqual(["Beard Oil Cedar", "Daily Shampoo"]);
  });

  it("bounds what it is asked: a limit of 1–100, an offset from 0, an unknown stock is no filter", async () => {
    expect((await listProducts({ limit: 0 }, FAKE)).items).toHaveLength(1);
    expect((await listProducts({ limit: 5000 }, FAKE)).items).toHaveLength(8);
    expect(names(await listProducts({ offset: -5, limit: 1 }, FAKE))).toEqual(["Aftershave Balm"]);
    expect(names(await listProducts({ offset: Number.NaN, limit: 1 }, FAKE))).toEqual(["Aftershave Balm"]);
    expect((await listProducts({ stock: "maybe" }, FAKE)).total).toBe(8);
    expect(LIST_MOST).toBe(100);
  });
});

describe("listProducts, a live shop", () => {
  let calls: { url: URL; auth: string | null }[];
  let answer: () => Response;
  beforeEach(() => {
    calls = [];
    vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: new URL(String(url)), auth: new Headers(init?.headers).get("authorization") });
      return answer();
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const item = (over: Record<string, unknown> = {}) => ({ productId: "p-1", variant: "50ml", name: "Paste", variantLabel: "50 ml", brand: "Brand A", photo: "https://cdn.example.test/p.jpg", priceCents: 1500, purchaseCents: 700, vatBp: 2400, stock: 3, barcode: "2000000000015", ...over });

  it("asks the list route with the read key and the filter, and keeps only what booking needs", async () => {
    answer = () =>
      Response.json({
        items: [item(), item({ productId: "p-2", photo: "http://plain.example.test/x.jpg", stock: 0 }), { productId: "", priceCents: 1 }, "junk"],
        total: 42,
        brands: ["Brand A", " Brand B ", "", 7, "Brand A"],
      });
    const got = await listProducts({ offset: 25, limit: 25, brand: "Brand A", stock: "in", lang: "et" }, LIVE);
    expect(calls).toHaveLength(1);
    expect(calls[0].url.origin + calls[0].url.pathname).toBe("https://shop.example.test/api/partner/products/list");
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({ offset: "25", limit: "25", brand: "Brand A", stock: "in", lang: "et" });
    expect(calls[0].auth).toBe(`Bearer ${READ}`);
    expect(got.total).toBe(42);
    expect(got.brands).toEqual(["Brand A", "Brand B"]);
    expect(got.items.map((p) => [p.productId, p.photo, p.stock])).toEqual([
      ["p-1", "https://cdn.example.test/p.jpg", 3],
      // an http photo is dropped, the product stays
      ["p-2", null, 0],
    ]);
  });

  it("leaves out an empty filter and an unknown language; never takes more than it asked for", async () => {
    answer = () => Response.json({ items: [item(), item({ productId: "p-2" }), item({ productId: "p-3" })] });
    const got = await listProducts({ limit: 2, brand: "  ", stock: "", lang: "fi" }, LIVE);
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({ offset: "0", limit: "2", lang: "ru" });
    expect(got.items.map((p) => p.productId)).toEqual(["p-1", "p-2"]);
    // no total from the shop: as many as came
    expect(got).toMatchObject({ total: 2, brands: [] });
  });

  it("a shop without the route (404) is «not_supported»; other answers are what they were", async () => {
    answer = () => new Response("<!doctype html><title>404</title>", { status: 404, headers: { "Content-Type": "text/html" } });
    const e = await listProducts({}, LIVE).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ShopError);
    expect((e as ShopError).code).toBe("not_supported");
    expect((e as ShopError).message).toBe("shop answered 404");
    answer = () => Response.json({ error: "boom" }, { status: 500 });
    expect(((await listProducts({}, LIVE).catch((x: unknown) => x)) as ShopError).code).toBe("unavailable");
    answer = () => Response.json({ error: "unauthorized" }, { status: 401 });
    expect(((await listProducts({}, LIVE).catch((x: unknown) => x)) as ShopError).code).toBe("unauthorized");
    // a 404 that names the product is still «unknown_product»
    answer = () => Response.json({ error: "unknown_product" }, { status: 404 });
    expect(((await lookupBarcode("2000000000015", LIVE).catch((x: unknown) => x)) as ShopError).code).toBe("unknown_product");
  });
});

/* ---------- our barbers' sales beside the shop's products ---------- */

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const NOW = at("2026-11-20", "12:00");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TEST_RUN = { NODE_ENV: "test", VITEST: "true" } as Record<string, string>;
const paste = FAKE_PRODUCTS.find((p) => p.productId === "demo-matte-paste")!;
const oil = FAKE_PRODUCTS.find((p) => p.productId === "demo-beard-oil")!;
const salt = FAKE_PRODUCTS.find((p) => p.productId === "demo-sea-salt")!;

let demo: Demo;
let biz: Business;
let owner: string;

beforeEach(async () => {
  demo = await freshDemo();
  biz = (await getBusiness(query, "rempire"))!;
  owner = (await query<{ id: string }>("insert into users (business_id, email, role) values ($1, 'owner@example.test', 'owner') returning id", [biz.id]))[0].id;
});
afterAll(closeDb);

async function sell(staff: string, p: typeof paste, qty: number, when: number, mode: "client" | "self" = "client") {
  const r = await recordSale(biz, demo.staff[staff], null, { ref: newRef(), productId: p.productId, variant: p.variant, mode, qty }, when, TEST_RUN);
  if (!r.ok) throw new Error(`not sold: ${JSON.stringify(r)}`);
  return r.sale;
}

/** The month of the sales below: what counts and what does not. */
async function november() {
  await sell("valentin", paste, 2, NOW - DAY);
  await sell("slava", paste, 1, NOW - 2 * DAY);
  // a product for himself left the shelf too
  await sell("valentin", oil, 1, NOW - 3 * DAY, "self");
  // the first hour of November in Tallinn, and the last of October: both inside 30 days
  await sell("slava", paste, 2, at("2026-11-01", "00:30"));
  await sell("valentin", paste, 4, at("2026-10-31", "23:30"));
  // more than 30 days ago
  await sell("valentin", paste, 3, NOW - 40 * DAY);
  // taken back with a minus row: neither counts
  const back = await sell("slava", paste, 5, NOW - 5 * DAY);
  expect(await reverseSale(biz, back.id, owner)).toMatchObject({ ok: true });
  // undone by the barber within his minutes
  const undone = await sell("valentin", salt, 1, NOW - HOUR);
  expect(await undoSale(demo.staff.valentin, undone.ref, null, NOW - HOUR + 60_000)).toEqual({ ok: true });
}

describe("«Продано за 30 дн.»", () => {
  it("sums the qty per product and variant over the last 30 days; reversed and undone sales are out", async () => {
    await november();
    const sold = await soldLastDays(query, biz.id, NOW);
    expect(Object.fromEntries(sold)).toEqual({
      [soldKey(paste.productId, paste.variant)]: 2 + 1 + 2 + 4,
      [soldKey(oil.productId, oil.variant)]: 1,
    });
  });

  it("is this business's alone", async () => {
    await november();
    const other = (await query<{ id: string }>("insert into businesses (slug, name, timezone) values ('other-demo', 'Other', $1) returning id", [TZ]))[0].id;
    expect((await soldLastDays(query, other, NOW)).size).toBe(0);
  });

  it("stands beside each product of the list, with the whole 30 days' total", async () => {
    await november();
    const page = await cataloguePage(query, biz, 1, { brand: "", stock: "" }, "ru", FAKE, NOW);
    expect(page).toMatchObject({ total: 8, page: 1, pages: 1, size: CAT_PAGE, soldTotal: 10, brands: ["Demo Beard Co", "Demo Grooming", "Demo Tools"] });
    const byId = Object.fromEntries(page.items.map((p) => [p.productId, p.sold]));
    expect(byId).toMatchObject({ "demo-matte-paste": 9, "demo-beard-oil": 1, "demo-sea-salt": 0, "demo-comb": 0 });
    // the page never carries the purchase price
    expect(page.items.every((p) => !("purchaseCents" in p))).toBe(true);
    // a filter, and a page past the end goes back to the last one
    const out = await cataloguePage(query, biz, 7, { brand: "", stock: "out" }, "ru", FAKE, NOW);
    expect(out).toMatchObject({ page: 1, pages: 1, total: 1 });
    expect(out.items.map((p) => p.productId)).toEqual(["demo-aftershave"]);
  });

  it("stands beside what a search found too, the filter over it", async () => {
    await november();
    const found = await catalogueSearch(query, biz, "demo", { brand: "Demo Grooming", stock: "in" }, "ru", FAKE, NOW);
    expect(found.items.map((p) => [p.name, p.sold])).toEqual([
      ["Matte Paste", 9],
      ["Sea Salt Spray", 0],
      ["Shine Pomade", 0],
      ["Texture Powder", 0],
    ]);
    expect(found).toMatchObject({ capped: false, most: 20, soldTotal: 10 });
    const byCode = await catalogueSearch(query, biz, "2000000000022", { brand: "", stock: "" }, "ru", FAKE, NOW);
    expect(byCode.items.map((p) => p.productId)).toEqual(["demo-sea-salt"]);
  });
});

describe("«Продали в ноябре»", () => {
  it("is this calendar month in Tallinn, per barber, the most first", async () => {
    await november();
    const m = await soldThisMonth(query, biz, paste.productId, paste.variant, NOW);
    expect(m.month).toBe("2026-11");
    // Slava: 1 and the 2 in the first hour of the month; Valentin: 2 (his 4 were on 31.10); the reversed 5 not at all
    expect(m.rows.map((r) => [r.staffId, r.qty])).toEqual([
      [demo.staff.slava, 3],
      [demo.staff.valentin, 2],
    ]);
    expect(m.rows.every((r) => typeof r.name === "string" && r.name.length > 0)).toBe(true);
    // the beard oil: his own, still sold
    expect((await soldThisMonth(query, biz, oil.productId, oil.variant, NOW)).rows.map((r) => [r.staffId, r.qty])).toEqual([[demo.staff.valentin, 1]]);
    // the undone sea salt, and a variant nobody sold
    expect((await soldThisMonth(query, biz, salt.productId, salt.variant, NOW)).rows).toEqual([]);
    expect((await soldThisMonth(query, biz, paste.productId, "50ml", NOW)).rows).toEqual([]);
  });

  it("starts again on the first of the month", async () => {
    await november();
    const dec = await soldThisMonth(query, biz, paste.productId, paste.variant, at("2026-12-01", "00:10"));
    expect(dec).toEqual({ month: "2026-12", rows: [] });
    const oct = await soldThisMonth(query, biz, paste.productId, paste.variant, at("2026-10-31", "23:59"));
    expect(oct.month).toBe("2026-10");
    // the 4 at 23:30 on the 31st and the 3 forty days before 20.11 (11.10)
    expect(oct.rows.map((r) => [r.staffId, r.qty])).toEqual([[demo.staff.valentin, 7]]);
  });
});

describe("the page's first load", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("says «not_supported» for a shop without the list, so the page stays a search", async () => {
    vi.stubGlobal("fetch", async () => new Response("not here", { status: 404 }));
    expect(await catalogueList(biz, 1, null, "ru", LIVE)).toEqual({ ok: false, code: "not_supported" });
  });

  it("says «not_configured» for a link without its key, «shop_down» for no answer", async () => {
    expect(await catalogueList(biz, 1, null, "ru", { SHOP_API_URL: "https://shop.example.test" })).toEqual({ ok: false, code: "not_configured" });
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    expect(await catalogueList(biz, 1, null, "ru", LIVE)).toEqual({ ok: false, code: "shop_down" });
  });

  it("gives the first page of the fake shop, and cleans a filter it is sent", async () => {
    const r = await catalogueList(biz, 1, { brand: "Demo Tools", stock: "sideways", extra: 1 }, "ru", FAKE);
    if (!r.ok) throw new Error(r.code);
    expect(r.data.items.map((p) => p.productId)).toEqual(["demo-comb"]);
  });
});
