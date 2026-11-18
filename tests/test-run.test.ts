/**
 * The staging test run (docs/test-run.md, R2): sales stay in booking with
 * SHOP_SALES off, letters reach staff only, invoices are TEST-… from their
 * own counter with a stamp, and «Сообщить о проблеме» keeps what it's told.
 * Every other test file runs as the real thing (vitest.config.mts sets
 * ALLOW_INDEXING=yes); here it is unset where staging is meant.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBusiness, type Business } from "@/lib/availability";
import { buildDraft, invoiceLines, issueInvoice } from "@/lib/billing/invoices";
import { listIssuers, receiverForStaff } from "@/lib/billing/parties";
import { pdfDataOf, renderInvoicePdf } from "@/lib/billing/pdf";
import { invoicePdf } from "@/lib/billing/send";
import { invoiceById } from "@/lib/billing/invoices";
import { closeDb, query } from "@/lib/db";
import { sentToConsole } from "@/lib/email";
import { runOutbox } from "@/lib/outbox";
import { listReports, openReportCount, REPORTS, saveReport, setReportDone } from "@/lib/problem-reports";
import { newRef, recordSale, shopSales, syncShopSales, undoSale } from "@/lib/sales";
import { FAKE_PRODUCTS } from "@/lib/shop";
import { mailGuard, TEST_INBOX, testRun } from "@/lib/test-run";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const at = (date: string, time: string) => zonedToUtc(date, time, "Europe/Tallinn");
/** staging: no ALLOW_INDEXING, no SHOP_SALES, the fake shop */
const STAGE = { NODE_ENV: "test", VITEST: "true", EMAIL_TRANSPORT: "console" } as Record<string, string>;
const OCT = "2026-10";
const paste = FAKE_PRODUCTS[0];
const pomade = FAKE_PRODUCTS.find((p) => p.purchaseCents === null)!;

let demo: Demo;
let biz: Business;
let owner: string;
let saved: string | undefined;

beforeEach(async () => {
  demo = await freshDemo();
  biz = (await getBusiness(query, "rempire"))!;
  const [u] = await query<{ id: string }>("insert into users (business_id, email, role) values ($1, 'owner@example.test', 'owner') returning id", [demo.business.id]);
  owner = u.id;
  saved = process.env.ALLOW_INDEXING;
});
afterEach(() => {
  if (saved === undefined) delete process.env.ALLOW_INDEXING;
  else process.env.ALLOW_INDEXING = saved;
});
afterAll(closeDb);

/** Code that reads process.env (issueInvoice, the PDF) as on staging. */
const onStaging = () => delete process.env.ALLOW_INDEXING;

describe("the switch", () => {
  it("is on until ALLOW_INDEXING=yes, and sales reach the shop only with SHOP_SALES=on", () => {
    expect(testRun({})).toBe(true);
    expect(testRun({ ALLOW_INDEXING: "true" })).toBe(true);
    expect(testRun({ ALLOW_INDEXING: "yes" })).toBe(false);
    expect(shopSales({})).toBe(false);
    expect(shopSales({ SHOP_SALES: "yes" })).toBe(false);
    expect(shopSales({ SHOP_SALES: "on" })).toBe(true);
  });
});

describe("test sales (SHOP_SALES off)", () => {
  const sell = (p = paste, mode: "client" | "self" = "client", env = STAGE, now = at("2026-10-10", "12:00")) =>
    recordSale(biz, demo.staff.valentin, null, { ref: newRef(), productId: p.productId, variant: p.variant, mode, qty: 1 }, now, env);

  it("stay in booking, never go to the shop, and can be undone in the window", async () => {
    const a = await sell();
    if (!a.ok) throw new Error(a.code);
    expect(a.sale.syncStatus).toBe("test");
    let calls = 0;
    const later = at("2026-10-10", "13:00");
    expect(await syncShopSales(query, later, STAGE, async () => (calls++, { orderNumber: "X", repeat: false }))).toEqual({ sent: 0, retry: 0, failed: 0 });
    // a sale queued before the switch went off doesn't leave either
    await query("update product_sales set sync_status = 'queued', sync_after = $2 where id = $1", [a.sale.id, new Date(later - 1)]);
    expect((await syncShopSales(query, later, STAGE, async () => (calls++, { orderNumber: "X", repeat: false }))).sent).toBe(0);
    expect(calls).toBe(0);
    const b = await sell(paste, "client", STAGE, at("2026-10-11", "12:00"));
    if (!b.ok) throw new Error(b.code);
    expect(await undoSale(demo.staff.valentin, b.sale.ref, null, at("2026-10-11", "12:03"))).toEqual({ ok: true });
  });

  it("for himself with no purchase price: 0 €, marked; refused once sales go to the shop", async () => {
    const r = await sell(pomade, "self");
    if (!r.ok) throw new Error(r.code);
    expect(r.sale).toMatchObject({ unitCents: 0, totalCents: 0, commissionCents: 0, noPurchase: true, syncStatus: "test" });
    expect(await sell(pomade, "self", { ...STAGE, SHOP_SALES: "on" })).toEqual({ ok: false, code: "no_purchase_price" });
  });

  it("still go on the invoice draft, the zero one says why", async () => {
    await sell();
    await sell(pomade, "self");
    const recv = (await receiverForStaff(query, demo.staff.valentin))!;
    const d = await buildDraft(biz, recv.id, OCT, owner);
    if (!d.ok || !d.id) throw new Error("no draft");
    const lines = await invoiceLines(query, d.id);
    expect(lines.some((l) => l.kind === "product" && l.text === paste.brand + " " + paste.name + " " + paste.variantLabel)).toBe(true);
    const zero = lines.find((l) => l.kind === "self" && l.unitCents === 0)!;
    expect(zero.text).toContain("ostuhind puudub");
  });
});

describe("test invoices", () => {
  const issueOne = async (staff: string) => {
    const recv = (await receiverForStaff(query, demo.staff[staff]))!;
    const d = await buildDraft(biz, recv.id, OCT, owner);
    if (!d.ok || !d.id) throw new Error("no draft");
    return { id: d.id, r: await issueInvoice(biz, d.id, owner, at("2026-11-01", "10:00")) };
  };

  it("number TEST-… from their own counter, so the real series is never used up", async () => {
    onStaging();
    const a = await issueOne("valentin");
    expect(a.r).toEqual({ ok: true, number: "TEST-DEMO-2026-0001" });
    const [i] = await listIssuers(query, biz.id, 2026);
    expect(i.lastNumber).toBe(0);
    process.env.ALLOW_INDEXING = "yes";
    const b = await issueOne("slava");
    expect(b.r).toEqual({ ok: true, number: "DEMO-2026-0001" });
  });

  it("carry the «ТЕСТ / NÄIDIS» stamp, and the letter goes to the shop inbox, not the company", async () => {
    onStaging();
    const a = await issueOne("valentin");
    const pdf = (await invoicePdf(query, biz.id, a.id))!;
    expect(pdf.filename).toBe("rempire-arve-TEST-DEMO-2026-0001.pdf");
    const inv = (await invoiceById(query, biz.id, a.id))!;
    const lines = await invoiceLines(query, a.id);
    const data = pdfDataOf(inv, lines);
    expect(data.test).toBe(true);
    const plain = await renderInvoicePdf({ ...data, number: "DEMO-2026-0001", test: false });
    expect(pdf.bytes.length).toBeGreaterThan(plain.length);

    sentToConsole.length = 0;
    // the letter is queued at the real clock
    await runOutbox(query, Date.now() + 60_000, STAGE);
    const letter = sentToConsole.find((l) => l.subject.includes("TEST-DEMO-2026-0001"))!;
    expect(letter.to).toBe(TEST_INBOX);
    expect(letter.subject).toMatch(/^\[ТЕСТ → delivered@resend\.dev\] /);
    expect(letter.text.split("\n")[0]).toContain("delivered@resend.dev");
    expect(letter.attachments?.[0].filename).toBe("rempire-arve-TEST-DEMO-2026-0001.pdf");
  });
});

describe("the mail guard", () => {
  it("lets a staff login's letter through, marked, and sends the rest to the shop inbox", async () => {
    expect(await mailGuard(query, "owner@example.test", "Счёт", "текст", STAGE)).toEqual({ to: "owner@example.test", subject: "[ТЕСТ] Счёт", text: "текст", redirected: false });
    const c = await mailGuard(query, "Client@Example.test", "Запись", "текст", STAGE);
    expect(c).toMatchObject({ to: TEST_INBOX, subject: "[ТЕСТ → client@example.test] Запись", redirected: true });
    expect(c.text.endsWith("\n\nтекст")).toBe(true);
    expect((await mailGuard(query, "c@example.test", "Запись", "x", { ...STAGE, TEST_MAIL_TO: "qa@example.test" })).to).toBe("qa@example.test");
    // a switched-off login is not staff any more
    await query("update users set active = false where id = $1", [owner]);
    expect((await mailGuard(query, "owner@example.test", "Счёт", "x", STAGE)).redirected).toBe(true);
    // the real thing: untouched
    expect(await mailGuard(query, "client@example.test", "Запись", "x", { ALLOW_INDEXING: "yes" })).toEqual({ to: "client@example.test", subject: "Запись", text: "x", redirected: false });
  });
});

describe("problem reports", () => {
  const who = () => ({ businessId: demo.business.id, userId: owner, email: "owner@example.test", role: "owner" });

  it("keeps the text, the screen without its query, the login and the time", async () => {
    const now = at("2026-11-18", "10:00");
    expect(await saveReport(query, who(), { app: "b", path: "/b/sell?q=x#top", text: "  ", userAgent: "x" }, now)).toEqual({ ok: false, code: "empty" });
    const r = await saveReport(query, who(), { app: "b", path: "/b/sell?q=x#top", text: "Сканер не видит код\r\nна шампуне", userAgent: "iPhone" }, now);
    expect(r.ok).toBe(true);
    await saveReport(query, who(), { app: "admin", path: "/admin", text: "второе" }, now + 1000);
    const list = await listReports(query, demo.business.id);
    expect(list.map((x) => x.text)).toEqual(["второе", "Сканер не видит код\nна шампуне"]);
    expect(list[1]).toMatchObject({ app: "b", path: "/b/sell", email: "owner@example.test", role: "owner", userAgent: "iPhone", doneAt: null });
    expect(await openReportCount(query, demo.business.id)).toBe(2);
    expect(await setReportDone(query, demo.business.id, list[0].id, true, now)).toBe(true);
    expect(await openReportCount(query, demo.business.id)).toBe(1);
    // the open one first, the ticked-off one after
    expect((await listReports(query, demo.business.id)).map((x) => x.text)[0]).toBe("Сканер не видит код\nна шампуне");
    expect(await setReportDone(query, demo.business.id, "not-a-uuid", true)).toBe(false);
  });

  it("stops one login after its hourly share", async () => {
    const now = at("2026-11-18", "10:00");
    for (let i = 0; i < REPORTS.perHour; i++) await saveReport(query, who(), { app: "admin", path: "/admin", text: `n${i}` }, now);
    expect(await saveReport(query, who(), { app: "admin", path: "/admin", text: "one more" }, now)).toEqual({ ok: false, code: "too_many" });
    expect((await saveReport(query, who(), { app: "admin", path: "/admin", text: "an hour later" }, now + 3_600_001)).ok).toBe(true);
  });
});
