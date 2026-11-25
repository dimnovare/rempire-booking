/**
 * Phase C: money helpers, the fake shop, a barber's sales (C3), receivers,
 * issuer and rent (C1), the statement (C4), invoices with gap-free numbers,
 * credit and paid (C5), the overview and the accountant's CSV (C6), and the
 * invoice PDF and letter. Fake companies and fake products only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  addDraftLine,
  buildDraft,
  creditInvoice,
  discardDraft,
  dropDraftLine,
  invoiceById,
  invoiceLines,
  issueInvoice,
  listInvoices,
  makeDrafts,
  monthRange,
  planInvoiceDrafts,
  setPaid,
  shiftMonth,
  updateDraftLine,
} from "@/lib/billing/invoices";
import { formatNumber, listIssuers, listReceivers, receiverForStaff, rentOn, saveIssuer, saveReceiver, setLastNumber, setRent, type IssuerInput } from "@/lib/billing/parties";
import { invoicePdf, invoiceMessage } from "@/lib/billing/send";
import { csvCell, monthCsv, monthOverview, monthStatement } from "@/lib/billing/statement";
import { getBusiness, type Business } from "@/lib/availability";
import { closeDb, query } from "@/lib/db";
import { sentToConsole } from "@/lib/email";
import { amountText, commissionFor, grossOfNet, lineAmounts, netOf, parseCents, splitGross } from "@/lib/money";
import { runOutbox } from "@/lib/outbox";
import { newRef, recordSale, reverseSale, retrySale, SALES, syncShopSales, undoSale } from "@/lib/sales";
import { FAKE_PRODUCTS, identifyPhoto, lookupBarcode, productById, searchProducts, shopMode, ShopError } from "@/lib/shop";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
// the real thing: sales go to the (fake) shop; the test run with SHOP_SALES off is tested on its own
const FAKE = { NODE_ENV: "test", VITEST: "true", ALLOW_INDEXING: "yes", SHOP_SALES: "on" } as Record<string, string>;
const DEV = { NODE_ENV: "development", VITEST: "true", ALLOW_INDEXING: "yes" } as Record<string, string>;
const OCT = "2026-10";

let demo: Demo;
let biz: Business;
let owner: string;
const paste = FAKE_PRODUCTS[0]; // 24,90 €, purchase 11,50 € without VAT
const pomade = FAKE_PRODUCTS.find((p) => p.purchaseCents === null)!;

beforeEach(async () => {
  demo = await freshDemo();
  // the amounts below are on the price without VAT, the switch's «net-paid»; Renat's own
  // basis (the regular price with VAT, 18.11) is the default, tested in billing-settings.test.ts
  await query(`update businesses set settings = settings || '{"commission_basis": "net-paid"}'::jsonb where id = $1`, [demo.business.id]);
  biz = (await getBusiness(query, "rempire"))!;
  const [u] = await query<{ id: string }>("insert into users (business_id, email, role) values ($1, 'owner@example.test', 'owner') returning id", [demo.business.id]);
  owner = u.id;
});
afterAll(closeDb);

const sell = (staff: string, p = paste, mode: "client" | "self" = "client", qty = 1, now = at("2026-10-10", "12:00")) =>
  recordSale(biz, demo.staff[staff], null, { ref: newRef(), productId: p.productId, variant: p.variant, mode, qty }, now, FAKE);

describe("money", () => {
  it("splits gross into net and VAT that add up", () => {
    expect(splitGross(2490, 2400)).toEqual({ net: 2008, vat: 482 });
    expect(splitGross(-2490, 2400)).toEqual({ net: -2008, vat: -482 });
    expect(splitGross(1000, 0)).toEqual({ net: 1000, vat: 0 });
    expect(netOf(100, 2400)).toBe(81);
  });
  it("takes 17 % from the chosen basis", () => {
    const s = { qty: 1, unitCents: 2490, listCents: 2490, vatBp: 2400, bp: 1700 };
    expect(commissionFor({ ...s, basis: "net-paid" })).toBe(341);
    expect(commissionFor({ ...s, basis: "gross-paid" })).toBe(423);
    expect(commissionFor({ ...s, unitCents: 2000, basis: "gross-list" })).toBe(423);
    expect(commissionFor({ ...s, qty: -1, basis: "net-paid" })).toBe(-341);
  });
  it("prices a purchase price with VAT, lines and amounts", () => {
    expect(grossOfNet(1150, 2400)).toBe(1426);
    expect(lineAmounts({ qty: 2, unitCents: 2490, discountCents: 682, vatBp: 2400 })).toEqual({ gross: 4298, net: 3466, vat: 832 });
    expect(amountText(-5)).toBe("-0,05");
    expect(parseCents("24,9")).toBe(2490);
    expect(parseCents("12.345")).toBeNull();
  });
});

describe("the fake shop", () => {
  it("is on without SHOP_API_URL, and finds by barcode, name and id", async () => {
    expect(shopMode(FAKE)).toBe("fake");
    expect(shopMode({ SHOP_API_URL: "https://shop.example.test" })).toBe("live");
    expect((await lookupBarcode("2000000000015", FAKE))?.productId).toBe("demo-matte-paste");
    expect(await lookupBarcode("999", FAKE)).toBeNull();
    expect((await searchProducts("beard", 10, FAKE)).map((p) => p.productId)).toEqual(["demo-beard-oil", "demo-shampoo", "demo-aftershave"]);
    expect(await searchProducts("b", 10, FAKE)).toEqual([]);
    expect((await productById("demo-comb", "", FAKE))?.priceCents).toBe(990);
    expect(await identifyPhoto("data:image/jpeg;base64,AAAA", FAKE)).toHaveLength(3);
    await expect(identifyPhoto("not a photo", FAKE)).rejects.toBeInstanceOf(ShopError);
  });
  it("refuses a live shop without https or a secret", async () => {
    await expect(lookupBarcode("1", { SHOP_API_URL: "http://shop.example.test", SHOP_API_SECRET: "x" })).rejects.toMatchObject({ code: "not_configured" });
    await expect(lookupBarcode("1", { SHOP_API_URL: "https://shop.example.test" })).rejects.toMatchObject({ code: "not_configured" });
  });
});

describe("selling (C3)", () => {
  it("records a client sale at the shop price with 17 % of the price without VAT", async () => {
    const r = await sell("valentin", paste, "client", 2);
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.sale).toMatchObject({ mode: "client", qty: 2, unitCents: 2490, totalCents: 4980, commissionCents: 683, syncStatus: "queued" });
  });
  it("sells for himself at the purchase price with VAT and no commission; refuses with no purchase price", async () => {
    const r = await sell("valentin", paste, "self");
    expect(r.ok && r.sale).toMatchObject({ unitCents: 1426, commissionCents: 0 });
    expect(await sell("valentin", pomade, "self")).toEqual({ ok: false, code: "no_purchase_price" });
  });
  it("is the same sale when sent twice with one ref", async () => {
    const ref = newRef();
    const input = { ref, productId: paste.productId, variant: paste.variant, mode: "client", qty: 1 };
    const a = await recordSale(biz, demo.staff.valentin, null, input, Date.now(), FAKE);
    const b = await recordSale(biz, demo.staff.valentin, null, input, Date.now(), FAKE);
    expect(a.ok && b.ok && a.sale.id === b.sale.id).toBe(true);
    expect(b.ok && b.replay).toBe(true);
    // another barber can't take that ref
    expect(await recordSale(biz, demo.staff.slava, null, input, Date.now(), FAKE)).toMatchObject({ ok: false, code: "invalid" });
    const [{ n }] = await query<{ n: number }>("select count(*)::int as n from product_sales where ref = $1", [ref]);
    expect(n).toBe(1);
  });
  it("shows a new price before selling at it", async () => {
    const r = await recordSale(biz, demo.staff.valentin, null, { ref: newRef(), productId: paste.productId, variant: paste.variant, mode: "client", qty: 1, expectCents: 2000 }, Date.now(), FAKE);
    expect(r).toEqual({ ok: false, code: "price_changed", unitCents: 2490 });
  });
  it("refuses a bad qty, an unknown product and a bad ref", async () => {
    expect(await sell("valentin", paste, "client", 0)).toMatchObject({ code: "invalid", field: "qty" });
    expect(await recordSale(biz, demo.staff.valentin, null, { ref: newRef(), productId: "nope", variant: "", mode: "client", qty: 1 }, Date.now(), FAKE)).toEqual({ ok: false, code: "not_found" });
    expect(await recordSale(biz, demo.staff.valentin, null, { ref: "x", productId: paste.productId, variant: paste.variant, mode: "client", qty: 1 }, Date.now(), FAKE)).toMatchObject({ field: "ref" });
  });
  it("undoes within the window only, and an undone sale never reaches the shop", async () => {
    const t = Date.now();
    const a = await sell("valentin", paste, "client", 1, t);
    const b = await sell("valentin", paste, "client", 1, t);
    if (!a.ok || !b.ok) throw new Error("sell failed");
    expect(await undoSale(demo.staff.slava, a.sale.ref, null, t + 60_000)).toEqual({ ok: false, code: "not_found" });
    expect(await undoSale(demo.staff.valentin, a.sale.ref, null, t + 60_000)).toEqual({ ok: true });
    expect(await undoSale(demo.staff.valentin, b.sale.ref, null, t + (SALES.undoMin + 1) * 60_000)).toEqual({ ok: false, code: "too_late" });
    const sent: string[] = [];
    const res = await syncShopSales(query, t + (SALES.undoMin + 1) * 60_000, FAKE, async (s) => {
      sent.push(s.ref);
      return { orderNumber: "SHOP-1", repeat: false };
    });
    expect(res).toEqual({ sent: 1, retry: 0, failed: 0 });
    expect(sent).toEqual([b.sale.ref]);
  });
  it("waits out the undo window, retries a shop outage, fails for good on a refusal", async () => {
    const t = Date.now();
    const a = await sell("valentin", paste, "client", 1, t);
    if (!a.ok) throw new Error("sell failed");
    const down = async () => {
      throw new ShopError("unavailable");
    };
    expect(await syncShopSales(query, t + 60_000, FAKE, down)).toEqual({ sent: 0, retry: 0, failed: 0 });
    const later = t + (SALES.undoMin + 1) * 60_000;
    expect(await syncShopSales(query, later, FAKE, down)).toEqual({ sent: 0, retry: 1, failed: 0 });
    // backoff: not again a minute later
    expect(await syncShopSales(query, later + 60_000, FAKE, down)).toEqual({ sent: 0, retry: 0, failed: 0 });
    const no = async () => {
      throw new ShopError("unknown_product");
    };
    expect(await syncShopSales(query, later + 10 * 60_000, FAKE, no)).toEqual({ sent: 0, retry: 0, failed: 1 });
    expect(await retrySale(biz, a.sale.id, owner, later + 11 * 60_000)).toBe(true);
    expect(await syncShopSales(query, later + 11 * 60_000, FAKE)).toEqual({ sent: 1, retry: 0, failed: 0 });
    const [row] = await query<{ shop_order_ref: string }>("select shop_order_ref from product_sales where id = $1", [a.sale.id]);
    expect(row.shop_order_ref).toMatch(/^DEMO-/);
  });
  it("starts no shop call once the run's time is spent, and the sale waits without losing a try", async () => {
    const t = Date.now();
    const a = await sell("valentin", paste, "client", 1, t);
    if (!a.ok) throw new Error("sell failed");
    const later = t + (SALES.undoMin + 1) * 60_000;
    const never = async (): Promise<{ orderNumber: string; repeat: boolean }> => {
      throw new Error("should not be called");
    };
    expect(await syncShopSales(query, later, FAKE, never, 0)).toEqual({ sent: 0, retry: 0, failed: 0, left: 1 });
    const [row] = await query<{ sync_status: string; sync_attempts: number; sync_locked: Date | null }>("select sync_status, sync_attempts, sync_locked from product_sales where id = $1", [a.sale.id]);
    expect(row).toEqual({ sync_status: "queued", sync_attempts: 0, sync_locked: null });
    expect(await syncShopSales(query, later, FAKE)).toEqual({ sent: 1, retry: 0, failed: 0 });
  });
  it("reverses a sale with a minus row, once", async () => {
    const a = await sell("valentin", paste, "client", 2);
    if (!a.ok) throw new Error("sell failed");
    const r = await reverseSale(biz, a.sale.id, owner, "wrong product");
    expect(r.ok).toBe(true);
    expect(await reverseSale(biz, a.sale.id, owner)).toEqual({ ok: false, code: "already" });
    const rows = await query<{ qty: number; total_cents: number; commission_cents: number; sync_status: string }>(
      "select qty, total_cents, commission_cents, sync_status from product_sales where staff_id = $1 and ref not like 'demo-%' order by created_at",
      [demo.staff.valentin],
    );
    expect(rows.map((x) => x.qty)).toEqual([2, -2]);
    expect(rows[0].total_cents + rows[1].total_cents).toBe(0);
    expect(rows[0].commission_cents + rows[1].commission_cents).toBe(0);
    // not sent yet: it never will be
    expect(rows.map((x) => x.sync_status)).toEqual(["none", "none"]);
  });
});

describe("receivers, issuer, rent (C1)", () => {
  const issuer: IssuerInput = {
    legalName: "Test Salong OÜ",
    regCode: "00000009",
    vatNumber: "EE000000009",
    vatBp: 2400,
    address: "Testi 1, Tallinn",
    email: "arved@example.test",
    phone: "",
    iban: "EE000000000000000009",
    bankName: "",
    prefix: "T-",
    digits: 3,
    yearly: false,
    note: "",
    isDefault: true,
    active: true,
  };
  it("has the demo issuer, four demo receivers and their rent", async () => {
    const issuers = await listIssuers(query, biz.id);
    expect(issuers).toHaveLength(1);
    expect(issuers[0]).toMatchObject({ legalName: "Näidis Salong OÜ", isDefault: true });
    const recv = await listReceivers(query, biz.id);
    expect(recv.map((r) => r.staffName).sort()).toEqual(["Jevgeni", "Milena", "Slava", "Valentin"]);
    expect((await rentOn(query, demo.staff.valentin, "2026-10-01"))?.amountCents).toBe(40000);
    expect(await rentOn(query, demo.staff.renat, "2026-10-01")).toBeNull();
  });
  it("validates an issuer and keeps one default", async () => {
    expect(await saveIssuer(biz, null, { ...issuer, vatNumber: "123" }, owner)).toEqual({ ok: false, field: "vatNumber" });
    expect(await saveIssuer(biz, null, { ...issuer, legalName: " " }, owner)).toEqual({ ok: false, field: "legalName" });
    const r = await saveIssuer(biz, null, issuer, owner);
    expect(r.ok).toBe(true);
    const all = await listIssuers(query, biz.id);
    expect(all.filter((i) => i.isDefault).map((i) => i.legalName)).toEqual(["Test Salong OÜ"]);
  });
  it("formats numbers and only lets the last number go up", async () => {
    expect(formatNumber({ prefix: "RB", digits: 4, yearly: true }, 2026, 42)).toBe("RB2026-0042");
    expect(formatNumber({ prefix: "", digits: 0, yearly: false }, 2026, 1045)).toBe("1045");
    const [i] = await listIssuers(query, biz.id);
    expect(await setLastNumber(biz, i.id, 1044, owner, 2026)).toEqual({ ok: true });
    expect(await setLastNumber(biz, i.id, 1000, owner, 2026)).toEqual({ ok: false, field: "lastNumber" });
    expect((await listIssuers(query, biz.id, 2026))[0].lastNumber).toBe(1044);
  });
  it("gives a barber one active receiver and validates it", async () => {
    const base = { staffId: demo.staff.valentin, issuerId: null, kind: "ou", legalName: "Uus Test OÜ", regCode: "00000010", vatNumber: "", address: "", email: "uus@example.test", vatMode: "vat", termsDays: 14, locale: "et", active: true };
    expect(await saveReceiver(biz, null, { ...base, regCode: "" }, owner)).toEqual({ ok: false, field: "regCode" });
    expect(await saveReceiver(biz, null, { ...base, email: "nope" }, owner)).toEqual({ ok: false, field: "email" });
    expect(await saveReceiver(biz, null, { ...base, kind: "person", regCode: "" }, owner)).toMatchObject({ ok: true });
    expect((await receiverForStaff(query, demo.staff.valentin))?.legalName).toBe("Uus Test OÜ");
    const [{ n }] = await query<{ n: number }>("select count(*)::int as n from invoice_receivers where staff_id = $1 and active", [demo.staff.valentin]);
    expect(n).toBe(1);
  });
  it("changes rent from a date on and keeps old months", async () => {
    expect(await setRent(biz, demo.staff.valentin, 45000, "2026-11-01", owner)).toEqual({ ok: true });
    expect((await rentOn(query, demo.staff.valentin, "2026-10-01"))?.amountCents).toBe(40000);
    expect((await rentOn(query, demo.staff.valentin, "2026-11-01"))?.amountCents).toBe(45000);
    expect(await setRent(biz, demo.staff.valentin, -1, "2026-11-01", owner)).toEqual({ ok: false, field: "amountCents" });
  });
});

describe("invoices (C5)", () => {
  it("drafts rent and unbilled sales with the 17 % as the discount", async () => {
    await sell("valentin", paste, "client", 2, at("2026-10-10", "12:00"));
    await sell("valentin", paste, "self", 1, at("2026-10-11", "12:00"));
    // November's sale is not October's
    await sell("valentin", paste, "client", 1, at("2026-11-02", "12:00"));
    const recv = (await receiverForStaff(query, demo.staff.valentin))!;
    const d = await buildDraft(biz, recv.id, OCT, owner);
    expect(d).toMatchObject({ ok: true });
    if (!d.ok || !d.id) throw new Error("no draft");
    const lines = await invoiceLines(query, d.id);
    expect(lines.map((l) => [l.kind, l.qty, l.unitCents, l.discountCents, l.grossCents])).toEqual([
      ["rent", 1, 40000, 0, 40000],
      ["product", 2, 2490, 683, 4297],
      ["self", 1, 1426, 0, 1426],
    ]);
    const inv = (await invoiceById(query, biz.id, d.id))!;
    expect(inv).toMatchObject({ status: "draft", number: null, grossCents: 45723 });
    // one live draft per receiver and month
    expect(await buildDraft(biz, recv.id, OCT, owner)).toEqual({ ok: true, id: null, reason: "exists" });
  });
  it("applies VAT only for a VAT-registered issuer and a VAT receiver", async () => {
    await sell("valentin", paste, "client", 1, at("2026-10-10", "12:00"));
    const recv = (await receiverForStaff(query, demo.staff.valentin))!;
    await saveReceiver(biz, recv.id, { ...recv, staffId: recv.staffId, issuerId: null, vatMode: "none" }, owner);
    const d = await buildDraft(biz, recv.id, OCT, owner);
    if (!d.ok || !d.id) throw new Error("no draft");
    const lines = await invoiceLines(query, d.id);
    expect(lines.every((l) => l.vatBp === 0 && l.vatCents === 0)).toBe(true);
    // the same total, all of it net
    expect(lines.find((l) => l.kind === "product")).toMatchObject({ grossCents: 2149, netCents: 2149 });
  });
  it("edits, adds and drops draft lines, then issues with the next number and queues the letter", async () => {
    await sell("valentin", paste, "client", 1, at("2026-10-10", "12:00"));
    const recv = (await receiverForStaff(query, demo.staff.valentin))!;
    const d = await buildDraft(biz, recv.id, OCT, owner);
    if (!d.ok || !d.id) throw new Error("no draft");
    const [rent, product] = await invoiceLines(query, d.id);
    expect(await updateDraftLine(biz, rent.id, { text: rent.text, qty: 1, unitCents: 38000, discountCents: 0 }, owner)).toEqual({ ok: true });
    expect(await addDraftLine(biz, d.id, { text: "Kapp / Locker", qty: 1, unitCents: 1500, discountCents: 0 }, owner)).toEqual({ ok: true });
    expect(await dropDraftLine(biz, product.id, owner)).toEqual({ ok: true });
    expect((await invoiceById(query, biz.id, d.id))!.grossCents).toBe(39500);
    const now = at("2026-11-01", "10:00");
    const r = await issueInvoice(biz, d.id, owner, now);
    expect(r).toEqual({ ok: true, number: "DEMO-2026-0001" });
    const inv = (await invoiceById(query, biz.id, d.id))!;
    expect(inv).toMatchObject({ status: "issued", issuedOn: "2026-11-01", dueOn: "2026-11-08", seller: { name: "Näidis Salong OÜ" }, buyer: { name: "Näidis FIE (Valentin)" } });
    // never edited once issued
    expect(await updateDraftLine(biz, rent.id, { text: "x", qty: 1, unitCents: 1, discountCents: 0 }, owner)).toEqual({ ok: false, code: "not_draft" });
    expect(await discardDraft(biz, d.id, owner)).toBe(false);
    const [mail] = await query<{ recipient: string; kind: string }>("select recipient, kind from notifications where kind = 'invoice'");
    expect(mail).toEqual({ recipient: "delivered@resend.dev", kind: "invoice" });
    // the dropped product is free for the next month's draft
    const nov = await buildDraft(biz, recv.id, "2026-11", owner);
    if (!nov.ok || !nov.id) throw new Error("no november draft");
    expect((await invoiceLines(query, nov.id)).map((l) => l.kind)).toEqual(["rent", "product"]);
  });
  it("numbers without gaps or twins, also when two are issued at once", async () => {
    const ids: string[] = [];
    for (const st of ["valentin", "jevgeni", "slava", "milena"]) {
      const r = (await receiverForStaff(query, demo.staff[st]))!;
      const d = await buildDraft(biz, r.id, OCT, owner);
      if (d.ok && d.id) ids.push(d.id);
    }
    expect(ids).toHaveLength(4);
    const now = at("2026-11-02", "10:00");
    const out = await Promise.all(ids.map((id) => issueInvoice(biz, id, owner, now)));
    const numbers = out.map((o) => (o.ok ? o.number : "")).sort();
    expect(numbers).toEqual(["DEMO-2026-0001", "DEMO-2026-0002", "DEMO-2026-0003", "DEMO-2026-0004"]);
    // a draft never takes a number
    const [{ last }] = await query<{ last: number }>("select last from invoice_counters");
    expect(last).toBe(4);
  });
  it("continues Isolta's series", async () => {
    const [i] = await listIssuers(query, biz.id);
    await setLastNumber(biz, i.id, 41, owner, 2026);
    const r = (await receiverForStaff(query, demo.staff.slava))!;
    const d = await buildDraft(biz, r.id, OCT, owner);
    if (!d.ok || !d.id) throw new Error("no draft");
    expect(await issueInvoice(biz, d.id, owner, at("2026-11-01", "10:00"))).toEqual({ ok: true, number: "DEMO-2026-0042" });
  });
  it("marks paid, credits with its own number and frees the month for a new draft", async () => {
    await sell("valentin", paste, "client", 1, at("2026-10-10", "12:00"));
    const recv = (await receiverForStaff(query, demo.staff.valentin))!;
    const d = await buildDraft(biz, recv.id, OCT, owner);
    if (!d.ok || !d.id) throw new Error("no draft");
    const now = at("2026-11-01", "10:00");
    await issueInvoice(biz, d.id, owner, now);
    expect(await setPaid(biz, d.id, true, owner, now)).toBe(true);
    expect((await invoiceById(query, biz.id, d.id))!.status).toBe("paid");
    const c = await creditInvoice(biz, d.id, owner, now + 60_000);
    expect(c).toMatchObject({ ok: true, number: "DEMO-2026-0002" });
    if (!c.ok) return;
    expect(await creditInvoice(biz, d.id, owner)).toEqual({ ok: false, code: "already" });
    const orig = (await invoiceById(query, biz.id, d.id))!;
    const cr = (await invoiceById(query, biz.id, c.id))!;
    expect(orig).toMatchObject({ status: "credited", creditedBy: c.id });
    expect(cr).toMatchObject({ kind: "credit", status: "issued", creditOfNumber: "DEMO-2026-0001", grossCents: -orig.grossCents });
    // paid, then credited: REMPIRE owes the money back
    const st = await monthStatement(query, biz, demo.staff.valentin, OCT);
    expect(st.openCents).toBe(-orig.grossCents);
    // the month is free again
    const again = await buildDraft(biz, recv.id, OCT, owner);
    expect(again.ok && again.id).toBeTruthy();
    if (again.ok && again.id) expect((await invoiceLines(query, again.id)).map((l) => l.kind)).toEqual(["rent", "product"]);
  });
  it("makes the month's drafts on the billing day by itself, once", async () => {
    await sell("slava", paste, "client", 1, at("2026-10-10", "12:00"));
    expect(await planInvoiceDrafts(query, at("2026-10-31", "12:00"))).toBe(4); // September: rent only
    expect(await planInvoiceDrafts(query, at("2026-11-01", "08:00"))).toBe(4);
    expect(await planInvoiceDrafts(query, at("2026-11-05", "08:00"))).toBe(0);
    const oct = await listInvoices(query, biz.id, { month: OCT });
    expect(oct).toHaveLength(4);
    // a discarded draft is not made again by itself; «Собрать черновики» makes it
    await discardDraft(biz, oct[0].id, owner);
    expect(await planInvoiceDrafts(query, at("2026-11-06", "08:00"))).toBe(0);
    expect((await makeDrafts(biz, OCT, owner)).made).toBe(1);
  });
  it("prints a PDF and sends it attached", async () => {
    await sell("valentin", paste, "client", 1, at("2026-10-10", "12:00"));
    const recv = (await receiverForStaff(query, demo.staff.valentin))!;
    const d = await buildDraft(biz, recv.id, OCT, owner);
    if (!d.ok || !d.id) throw new Error("no draft");
    expect(await invoicePdf(query, biz.id, d.id)).toBeNull();
    await issueInvoice(biz, d.id, owner, at("2026-11-01", "10:00"));
    const pdf = (await invoicePdf(query, biz.id, d.id))!;
    expect(pdf.filename).toBe("rempire-arve-DEMO-2026-0001.pdf");
    const doc = await PDFDocument.load(pdf.bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("ARVE / Invoice DEMO-2026-0001");
    const [row] = await query<{ business_id: string; locale: string; payload: Record<string, unknown> }>("select business_id, locale, payload from notifications where kind = 'invoice'");
    const msg = await invoiceMessage(query, row, DEV);
    expect("subject" in msg && msg.subject).toBe("Arve DEMO-2026-0001 · REMPIRE");
    // a letter to a barber's company: on the staff address once the two addresses are split (docs/launch.md B3)
    const split = await invoiceMessage(query, row, { ...DEV, SITE_URL: "https://book.example.test", STAFF_URL: "https://staff.example.test" });
    const html = "body" in split ? (split.body.html ?? "") : "";
    expect(html).toContain("https://staff.example.test/brand/");
    expect(html).not.toContain("book.example.test");
    sentToConsole.length = 0;
    // the letter was queued on the database's own clock
    const res = await runOutbox(query, Date.now() + 1000, DEV);
    expect(res.sent).toBeGreaterThanOrEqual(1);
    const letter = sentToConsole.find((l) => l.subject.startsWith("Arve"))!;
    expect(letter.attachments?.[0]).toMatchObject({ filename: "rempire-arve-DEMO-2026-0001.pdf", contentType: "application/pdf" });
    expect((await invoiceById(query, biz.id, d.id))!.sentAt).not.toBeNull();
  });
});

describe("statement and overview (C4, C6)", () => {
  it("sums a barber's month and what is not billed yet", async () => {
    await sell("valentin", paste, "client", 2, at("2026-10-10", "12:00"));
    await sell("valentin", paste, "self", 1, at("2026-10-11", "12:00"));
    const st = await monthStatement(query, biz, demo.staff.valentin, OCT);
    expect(st).toMatchObject({ clientCount: 2, clientCents: 4980, commissionCents: 683, selfCents: 1426, rentCents: 40000, owedCents: 4980 - 683 + 1426 + 40000, openCents: 0 });
    expect(st.unbilledCents).toBe(4980 - 683 + 1426);
  });
  it("shows Renat's month and exports the accountant's CSV", async () => {
    await sell("valentin", paste, "client", 1, at("2026-10-10", "12:00"));
    await makeDrafts(biz, OCT, owner);
    const val = (await listInvoices(query, biz.id, { month: OCT })).find((i) => i.staffId === demo.staff.valentin)!;
    await issueInvoice(biz, val.id, owner, at("2026-10-31", "18:00"));
    const rows = await monthOverview(query, biz, OCT);
    const v = rows.find((r) => r.staffId === demo.staff.valentin)!;
    expect(v).toMatchObject({ clientCents: 2490, commissionCents: 341, rentCents: 40000, invoicedCents: 42149, paidCents: 0, openCents: 42149 });
    expect(rows.find((r) => r.staffId === demo.staff.jevgeni)).toMatchObject({ draftCents: 40000, invoicedCents: 0 });
    const csv = await monthCsv(query, biz, OCT);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0].split(";")[0]).toBe("Arve nr");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("DEMO-2026-0001;arve;31.10.2026");
    expect(lines[1]).toContain("421,49");
    const csvLines = await monthCsv(query, biz, OCT, "lines");
    expect(csvLines.trim().split("\r\n")).toHaveLength(3);
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("never lets a typed text become a spreadsheet formula", () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csvCell("+372 5555")).toBe("'+372 5555");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-cmd")).toBe("'-cmd");
    expect(csvCell("\tx")).toBe("'\tx");
    expect(csvCell("-9,83")).toBe("-9,83");
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell("Rent; October")).toBe('"Rent; October"');
    expect(csvCell("OÜ Demo")).toBe("OÜ Demo");
  });
});
