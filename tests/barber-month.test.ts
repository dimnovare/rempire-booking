/**
 * «Отчёты» → a barber's month (src/app/admin/(app)/invoices/barber/[id]):
 * the statement's fields the page reads (the month's invoice, what is
 * issued and not paid and what is in no invoice, by month; the pieces he
 * took for himself) and its sales by day. Fake products and the demo seed
 * only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { monthWords, salesByDay } from "@/app/admin/(app)/invoices/barber/[id]/days";
import { COPY } from "@/app/admin/copy";
import { getBusiness, type Business } from "@/lib/availability";
import { buildDraft, creditInvoice, issueInvoice } from "@/lib/billing/invoices";
import { receiverForStaff } from "@/lib/billing/parties";
import { monthStatement, pickMonthInvoice } from "@/lib/billing/statement";
import { closeDb, query } from "@/lib/db";
import { newRef, recordSale, reverseSale } from "@/lib/sales";
import { FAKE_PRODUCTS } from "@/lib/shop";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const FAKE = { NODE_ENV: "test", VITEST: "true", ALLOW_INDEXING: "yes", SHOP_SALES: "on" } as Record<string, string>;
const paste = FAKE_PRODUCTS[0]; // 24,90 €, purchase 11,50 € without VAT

describe("the month's sales by day", () => {
  const sale = (id: string, createdAt: string, totalCents: number, extra: { status?: "done" | "undone"; reversesId?: string | null } = {}) => ({
    id,
    createdAt,
    totalCents,
    status: extra.status ?? ("done" as const),
    reversesId: extra.reversesId ?? null,
  });

  it("groups by the salon's day, the newest day first, and counts what stands", () => {
    const days = salesByDay(
      [
        // 00:30 on the 6th in Tallinn is still the 5th in UTC
        sale("a", "2026-11-05T22:30:00.000Z", 2490),
        sale("b", "2026-11-05T10:00:00.000Z", 2190),
        sale("c", "2026-11-05T09:00:00.000Z", 2490, { status: "undone" }),
        sale("d", "2026-11-05T08:00:00.000Z", -2190, { reversesId: "x" }),
        sale("x", "2026-11-02T12:00:00.000Z", 2190),
      ],
      TZ,
    );
    expect(days.map((d) => [d.date, d.sales.map((s) => s.id), d.count, d.cents])).toEqual([
      ["2026-11-06", ["a"], 1, 2490],
      // the undone one is shown but not counted; the minus row takes its sale back from the sum
      ["2026-11-05", ["b", "c", "d"], 1, 0],
      ["2026-11-02", ["x"], 1, 2190],
    ]);
    expect(salesByDay([], TZ)).toEqual([]);
  });

  it("names months, with the year only when it is not the page's", () => {
    const ru = COPY.ru.inv.bm.months;
    expect(monthWords(["2025-12", "2026-10", "2026-11"], ru, "2026")).toBe("декабрь 2025, октябрь, ноябрь");
    expect(monthWords([], ru, "2026")).toBe("");
    expect(COPY.ru.inv.bm.unbilled("")).toBe("Продажи ни в одном счёте");
    expect(COPY.ru.inv.bm.dayHead(2, "46,80 €")).toBe("2 продажи · 46,80 €");
    expect(COPY.ru.inv.bm.day("2026-11-06")).toBe("6 ноября");
    expect(COPY.et.inv.bm.invoiceFor(COPY.et.inv.bm.monthsFor[10])).toBe("Novembri arve");
  });
});

describe("the month's invoice", () => {
  const inv = (id: string, periodFrom: string, status: string, extra: { kind?: "invoice" | "credit"; free?: boolean } = {}) => ({
    id,
    periodFrom,
    status: status as "draft" | "issued" | "paid" | "credited" | "discarded",
    kind: extra.kind ?? ("invoice" as const),
    free: extra.free ?? false,
  });

  it("is a live one before a credited one, the month's own before a free one", () => {
    const list = [
      inv("dec", "2026-12-01", "draft"),
      inv("credit", "2026-11-01", "issued", { kind: "credit" }),
      inv("gone", "2026-11-01", "discarded"),
      inv("free", "2026-11-01", "issued", { free: true }),
      inv("old", "2026-11-01", "credited"),
      inv("new", "2026-11-01", "draft"),
    ];
    expect(pickMonthInvoice(list, "2026-11")?.id).toBe("new");
    expect(pickMonthInvoice(list.filter((i) => i.id !== "new"), "2026-11")?.id).toBe("free");
    expect(pickMonthInvoice(list.filter((i) => i.id !== "new" && i.id !== "free"), "2026-11")?.id).toBe("old");
    expect(pickMonthInvoice(list, "2026-10")).toBeNull();
  });
});

describe("the statement's fields for the page", () => {
  let demo: Demo;
  let biz: Business;
  let owner: string;
  beforeEach(async () => {
    demo = await freshDemo();
    // the commission on the price without VAT, as billing.test.ts counts it
    await query(`update businesses set settings = settings || '{"commission_basis": "net-paid"}'::jsonb where id = $1`, [demo.business.id]);
    biz = (await getBusiness(query, "rempire"))!;
    const [u] = await query<{ id: string }>("insert into users (business_id, email, role) values ($1, 'owner@example.test', 'owner') returning id", [demo.business.id]);
    owner = u.id;
  });
  afterAll(closeDb);

  const sell = (mode: "client" | "self", now: number, qty = 1) =>
    recordSale(biz, demo.staff.valentin, null, { ref: newRef(), productId: paste.productId, variant: paste.variant, mode, qty }, now, FAKE);

  it("names the months of sales in no invoice by the salon's clock, and counts his own pieces", async () => {
    await sell("client", at("2026-10-10", "12:00"));
    await sell("self", at("2026-10-11", "12:00"), 2);
    // 00:30 on 1 November in Tallinn is still October in UTC: it is November's
    await sell("client", at("2026-11-01", "00:30"));
    const oct = await monthStatement(query, biz, demo.staff.valentin, "2026-10");
    expect(oct).toMatchObject({ clientCount: 1, selfCount: 2, selfCents: 2 * 1426, monthInvoice: null, openCents: 0, openMonths: [] });
    expect(oct.unbilledMonths).toEqual([
      { month: "2026-10", cents: 2490 - 341 + 2 * 1426 },
      { month: "2026-11", cents: 2490 - 341 },
    ]);
    expect(oct.unbilledCents).toBe(oct.unbilledMonths.reduce((n, r) => n + r.cents, 0));
    // a sale and its minus row in no invoice come to nothing: the month is not named
    const [nov] = await query<{ id: string }>("select id from product_sales where created_at >= $1 and mode = 'client'", [new Date(at("2026-11-01", "00:00"))]);
    expect(await reverseSale(biz, nov.id, owner)).toMatchObject({ ok: true });
    const again = await monthStatement(query, biz, demo.staff.valentin, "2026-11");
    expect(again.unbilledMonths.map((r) => r.month)).toEqual(["2026-10"]);
    expect(again.clientCount).toBe(0);
  });

  it("finds the month's invoice and what is issued and not paid, by month", async () => {
    await sell("client", at("2026-10-10", "12:00"));
    await sell("client", at("2026-11-03", "12:00"));
    const recv = (await receiverForStaff(query, demo.staff.valentin))!;
    const d = await buildDraft(biz, recv.id, "2026-10", owner);
    if (!d.ok || !d.id) throw new Error("no draft");
    let st = await monthStatement(query, biz, demo.staff.valentin, "2026-10");
    expect(st.monthInvoice).toMatchObject({ id: d.id, status: "draft" });
    // the draft holds October's sale; November's is in no invoice
    expect(st.unbilledMonths.map((r) => r.month)).toEqual(["2026-11"]);
    expect(st.openMonths).toEqual([]);
    // November has no invoice of its own
    expect((await monthStatement(query, biz, demo.staff.valentin, "2026-11")).monthInvoice).toBeNull();

    await issueInvoice(biz, d.id, owner, at("2026-11-01", "10:00"));
    st = await monthStatement(query, biz, demo.staff.valentin, "2026-10");
    const gross = st.monthInvoice!.grossCents;
    expect(st.monthInvoice).toMatchObject({ id: d.id, status: "issued" });
    expect(st.openMonths).toEqual([{ month: "2026-10", cents: gross }]);
    expect(st.openCents).toBe(gross);

    // credited: the credit note takes it back, so October is no longer open; the credited one is still the month's
    const c = await creditInvoice(biz, d.id, owner, at("2026-11-02", "10:00"));
    expect(c).toMatchObject({ ok: true });
    st = await monthStatement(query, biz, demo.staff.valentin, "2026-10");
    expect(st.openMonths).toEqual([]);
    expect(st.openCents).toBe(0);
    expect(st.monthInvoice).toMatchObject({ id: d.id, status: "credited" });
    expect(st.unbilledMonths.map((r) => r.month)).toEqual(["2026-10", "2026-11"]);
    // a new draft for the month is the month's again
    const d2 = await buildDraft(biz, recv.id, "2026-10", owner);
    if (!d2.ok || !d2.id) throw new Error("no second draft");
    expect((await monthStatement(query, biz, demo.staff.valentin, "2026-10")).monthInvoice).toMatchObject({ id: d2.id, status: "draft" });
  });
});
