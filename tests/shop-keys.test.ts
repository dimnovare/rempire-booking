/**
 * The shop link's two keys (src/lib/shop.ts, Dim 25.11.2026): reads use the
 * read key, a sale only the write key, and the staging test run never sells
 * into a shop that is not on this computer, whatever is set. No network:
 * fetch is a stub that records what would have gone out. Fake values only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupBarcode, sendBarberSale, shopWritesAllowed, type BarberSaleRequest } from "@/lib/shop";

const READ = "fake-read-key-0123456789";
const OLD = "fake-first-read-key-0123456789";
const WRITE = "fake-write-key-0123456789abcdef0123456789";
const LIVE = "https://shop.example.test";

/** production after the move: indexing on, both keys */
const PROD = { ALLOW_INDEXING: "yes", SHOP_API_URL: LIVE, SHOP_API_SECRET: READ, SHOP_API_WRITE_SECRET: WRITE } as Record<string, string>;
/** staging with every key set by mistake: the test run is still on */
const STAGING_WRONG = { SHOP_API_URL: LIVE, SHOP_API_SECRET: READ, SHOP_API_WRITE_SECRET: WRITE, SHOP_SALES: "on" } as Record<string, string>;

const sale: BarberSaleRequest = {
  ref: "bk-keys-test-01",
  barber: { ref: "00000000-0000-4000-8000-000000000001", name: "Test Barber" },
  mode: "client",
  items: [{ productId: "demo-comb", variant: "", qty: 1, unitCents: 990 }],
};

let calls: { url: string; auth: string | null }[];
let answer: () => Response;

beforeEach(() => {
  calls = [];
  answer = () => Response.json({ ok: true, orderNumber: "R-1", repeat: false, items: [] });
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
    return answer();
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("reads", () => {
  it("use the read key: SHOP_API_READ_SECRET first, else SHOP_API_SECRET", async () => {
    await lookupBarcode("1", { ...PROD });
    await lookupBarcode("1", { ...PROD, SHOP_API_SECRET: OLD, SHOP_API_READ_SECRET: READ });
    await lookupBarcode("1", { SHOP_API_URL: LIVE, SHOP_API_SECRET: OLD });
    expect(calls.map((c) => c.auth)).toEqual([`Bearer ${READ}`, `Bearer ${READ}`, `Bearer ${OLD}`]);
  });

  it("never send the write key, and work on staging as today", async () => {
    await expect(lookupBarcode("1", { SHOP_API_URL: LIVE, SHOP_API_WRITE_SECRET: WRITE })).rejects.toMatchObject({ code: "not_configured" });
    await lookupBarcode("1", STAGING_WRONG);
    expect(calls.map((c) => c.auth)).toEqual([`Bearer ${READ}`]);
  });
});

describe("a sale", () => {
  it("goes with the write key, never the read key", async () => {
    expect(await sendBarberSale(sale, PROD)).toEqual({ orderNumber: "R-1", repeat: false });
    expect(calls).toEqual([{ url: `${LIVE}/api/partner/barber-sales`, auth: `Bearer ${WRITE}` }]);
  });

  it("is refused before any request without a write key of its own", async () => {
    const noWrite = { ...PROD, SHOP_API_WRITE_SECRET: "" };
    await expect(sendBarberSale(sale, noWrite)).rejects.toMatchObject({ code: "not_configured", message: "SHOP_API_WRITE_SECRET is not set" });
    await expect(sendBarberSale(sale, { ...PROD, SHOP_API_WRITE_SECRET: READ })).rejects.toMatchObject({ code: "not_configured" });
    await expect(sendBarberSale(sale, { ...PROD, SHOP_API_READ_SECRET: WRITE })).rejects.toMatchObject({ code: "not_configured" });
    expect(calls).toEqual([]);
  });

  it("the shop's 403 read_only is unauthorized: never retried as a success", async () => {
    answer = () => Response.json({ error: "read_only" }, { status: 403 });
    await expect(sendBarberSale(sale, PROD)).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("staging never sells into a live shop", () => {
  it("refuses before any request, with every key and SHOP_SALES on", async () => {
    for (const env of [STAGING_WRONG, { ...STAGING_WRONG, ALLOW_INDEXING: "true" }, { ...STAGING_WRONG, SHOP_API_URL: "https://rempireshop.com" }]) {
      expect(shopWritesAllowed(env)).toBe(false);
      await expect(sendBarberSale(sale, env)).rejects.toMatchObject({ code: "not_configured" });
    }
    expect(calls).toEqual([]);
  });

  it("lets the fake shop, production, and a shop on this computer (the shop-link test) through", async () => {
    expect(shopWritesAllowed({})).toBe(true);
    expect(shopWritesAllowed(PROD)).toBe(true);
    for (const host of ["http://localhost:3399", "http://127.0.0.1:3399", "http://[::1]:3399"]) {
      const env = { ...STAGING_WRONG, SHOP_API_URL: host };
      expect(shopWritesAllowed(env)).toBe(true);
      await sendBarberSale(sale, env);
    }
    expect(calls.map((c) => c.auth)).toEqual([`Bearer ${WRITE}`, `Bearer ${WRITE}`, `Bearer ${WRITE}`]);
    // a name that only starts like this computer is not it
    expect(shopWritesAllowed({ ...STAGING_WRONG, SHOP_API_URL: "https://localhost.example.test" })).toBe(false);
  });
});
