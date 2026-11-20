/**
 * Phase C: the owner's money switches (the 17 %, its basis, the billing
 * day) and the month helpers the «Счета» pages use. A sale made before a
 * change keeps the share it was made with.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { dmy, pickMonth, shift } from "@/app/admin/(app)/invoices/common";
import { getBusiness, type Business } from "@/lib/availability";
import { cleanMoneySettings, saveMoneySettings } from "@/lib/billing/settings";
import { closeDb, query } from "@/lib/db";
import { newRef, recordSale, saleMinuteMs } from "@/lib/sales";
import { FAKE_PRODUCTS } from "@/lib/shop";
import { freshDemo, type Demo } from "./helpers";

const FAKE = { NODE_ENV: "test", VITEST: "true" } as Record<string, string>;

let demo: Demo;
let biz: Business;

beforeEach(async () => {
  demo = await freshDemo();
  biz = (await getBusiness(query, "rempire"))!;
});
afterAll(closeDb);

describe("month helpers", () => {
  it("defaults to the month before today, and keeps a given one", () => {
    expect(pickMonth(undefined, "2026-11-17")).toBe("2026-10");
    expect(pickMonth(undefined, "2026-01-03")).toBe("2025-12");
    expect(pickMonth("2026-05", "2026-11-17")).toBe("2026-05");
    expect(pickMonth("2026-13", "2026-11-17")).toBe("2026-10");
    expect(pickMonth(["2026-05"], "2026-11-17")).toBe("2026-10");
  });
  it("moves across years and prints Estonian dates", () => {
    expect(shift("2026-12", 1)).toBe("2027-01");
    expect(shift("2026-01", -1)).toBe("2025-12");
    expect(dmy("2026-11-03")).toBe("03.11.2026");
    expect(dmy(null)).toBe("");
  });
});

describe("sales timers", () => {
  it("run on a real minute, except in a local test that asks for less", () => {
    expect(saleMinuteMs({})).toBe(60_000);
    expect(saleMinuteMs({ NODE_ENV: "development", SALES_MINUTE_MS: "1000" })).toBe(1000);
    // never in production, and never absurdly short
    expect(saleMinuteMs({ NODE_ENV: "production", SALES_MINUTE_MS: "1000" })).toBe(60_000);
    expect(saleMinuteMs({ NODE_ENV: "development", SALES_MINUTE_MS: "5" })).toBe(60_000);
    expect(saleMinuteMs({ NODE_ENV: "development", SALES_MINUTE_MS: "1.5" })).toBe(60_000);
  });
});

describe("money settings", () => {
  it("checks each value", () => {
    expect(cleanMoneySettings({ commission_bp: 1700, commission_basis: "net-paid", billing_day: 1 })).toEqual({ commission_bp: 1700, commission_basis: "net-paid", billing_day: 1 });
    expect(cleanMoneySettings({ commission_bp: 5001, commission_basis: "net-paid", billing_day: 1 })).toEqual({ field: "commission_bp" });
    expect(cleanMoneySettings({ commission_bp: 1700, commission_basis: "gross", billing_day: 1 })).toEqual({ field: "commission_basis" });
    expect(cleanMoneySettings({ commission_bp: 1700, commission_basis: "gross-list", billing_day: 29 })).toEqual({ field: "billing_day" });
  });

  it("saves, and a sale made before keeps its own share", async () => {
    // Renat's basis from the start (18.11): the regular price with VAT
    expect(biz.settings.commission_basis).toBe("gross-list");
    const paste = FAKE_PRODUCTS[0];
    const before = await recordSale(biz, demo.staff.valentin, null, { ref: newRef(), productId: paste.productId, variant: paste.variant, mode: "client", qty: 1 }, Date.now(), FAKE);
    expect(before.ok).toBe(true);
    const [u] = await query<{ id: string }>("insert into users (business_id, email, role) values ($1, 'owner@example.test', 'owner') returning id", [demo.business.id]);
    expect(await saveMoneySettings(biz, u.id, { commission_bp: 2000, commission_basis: "gross-paid", billing_day: 3 })).toEqual({ ok: true });
    const next = (await getBusiness(query, "rempire"))!;
    expect(next.settings.commission_bp).toBe(2000);
    expect(next.settings.commission_basis).toBe("gross-paid");
    expect(next.settings.billing_day).toBe(3);
    const after = await recordSale(next, demo.staff.valentin, null, { ref: newRef(), productId: paste.productId, variant: paste.variant, mode: "client", qty: 1 }, Date.now(), FAKE);
    if (!before.ok || !after.ok) throw new Error("sale failed");
    // 24,90 € with VAT: 17 % of the regular 24,90 €, then 20 % of 24,90 €
    expect(before.sale.commissionCents).toBe(423);
    expect(after.sale.commissionCents).toBe(498);
    const [{ n }] = await query<{ n: number }>("select count(*)::int as n from audit where entity = 'business' and action = 'settings'");
    expect(n).toBeGreaterThan(0);
    expect(await saveMoneySettings(biz, u.id, { commission_bp: -1, commission_basis: "net-paid", billing_day: 1 })).toEqual({ ok: false, field: "commission_bp" });
  });
});
