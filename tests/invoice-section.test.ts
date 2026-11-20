/**
 * «Счета» in its own frame (the owner, 19.11.2026): the list's status
 * filter, search, period and sort, the «Сводка» sums, the desk's three
 * figures and its unpaid invoices, and the receivers report
 * (src/lib/billing/list.ts, pure); the desk's month card (invoices.ts); a
 * line picked from the shop's products or the salon's services, or typed
 * (picker.ts); the draft's preview, which takes no number and changes
 * nothing (send.ts); another receiver for a free draft and a copy
 * (invoices.ts); the events read back from the audit log and the outbox
 * (events.ts); and the export (export.ts). Fake companies only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { getBusiness, type Business } from "@/lib/availability";
import { invoiceCounts, invoiceEvents, latestEvents, receiverEvents } from "@/lib/billing/events";
import { recordOpen } from "@/lib/mail-opened";
import { exportInvoices, sectionRows } from "@/lib/billing/export";
import { addDraftLine, copyInvoice, creditInvoice, invoiceById, invoiceLines, issueInvoice, monthInvoices, openDraft, paidMoment, setDraftReceiver, setPaid, updateDraftLine } from "@/lib/billing/invoices";
import {
  DEFAULT_SORT,
  deskStats,
  deskUnpaid,
  filterRows,
  listQueryOf,
  listStatus,
  nextSort,
  pageOf,
  periodOf,
  receiversReport,
  sortRows,
  splitAddress,
  summaryOf,
  type ListRow,
} from "@/lib/billing/list";
import { listIssuers, receiverForStaff, saveReceiver, setRent } from "@/lib/billing/parties";
import { findLineItems, pickedVat, serviceItems } from "@/lib/billing/picker";
import { draftPdf, invoicePdf } from "@/lib/billing/send";
import { closeDb, query } from "@/lib/db";
import { runOutbox } from "@/lib/outbox";
import { FAKE_PRODUCTS } from "@/lib/shop";
import { zonedToUtc } from "@/lib/tz";
import { readXlsx } from "@/lib/xlsx";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const TODAY = "2026-11-19";
// the month being invoiced is the one before: October 2026
const NOW = zonedToUtc(TODAY, "10:00", TZ);
const DEV = { NODE_ENV: "development", VITEST: "true", ALLOW_INDEXING: "yes" } as Record<string, string>;

const row = (o: Partial<ListRow> & { id: string }): ListRow => ({ status: "issued", receiverId: o.receiver ?? "r", receiver: "A", person: false, sub: "", number: "", date: "", due: "", netCents: 0, vatCents: 0, grossCents: 0, ...o });

/** A draft, one not due, one overdue, one paid, one credited and the credit invoice that took it back. */
const ROWS: ListRow[] = [
  row({ id: "d1", status: "draft", receiver: "Habe OÜ", sub: "Mart, октябрь 2026", netCents: 41200, grossCents: 41200 }),
  row({ id: "i1", status: "issued", receiver: "Tänava OÜ", number: "481", date: "2026-11-02", due: "2026-11-30", netCents: 65000, vatCents: 15600, grossCents: 80600 }),
  row({ id: "o1", status: "overdue", receiver: "FIE Kalle", number: "480", date: "2026-11-02", due: "2026-11-07", netCents: 59640, grossCents: 59640 }),
  row({ id: "p1", status: "paid", receiver: "Habe OÜ", number: "479", date: "2026-10-02", due: "2026-10-16", netCents: 38800, grossCents: 38800 }),
  row({ id: "c1", status: "credited", receiver: "Lõikus OÜ", number: "477", date: "2026-10-02", due: "2026-10-16", netCents: 10000, vatCents: 2400, grossCents: 12400 }),
  row({ id: "n1", status: "credit", receiver: "Lõikus OÜ", number: "478", date: "2026-10-05", netCents: -10000, vatCents: -2400, grossCents: -12400 }),
];
const ids = (rows: ListRow[]) => rows.map((r) => r.id);
const all = { q: "", status: "" as const, from: "", to: "" };

describe("the list: status, search, period", () => {
  it("names a row's status from the invoice and today", () => {
    const inv = { kind: "invoice" as const, dueOn: "2026-11-18" };
    expect(listStatus({ ...inv, status: "draft" }, TODAY)).toBe("draft");
    expect(listStatus({ ...inv, status: "issued" }, TODAY)).toBe("overdue");
    // due today is not overdue yet
    expect(listStatus({ ...inv, status: "issued", dueOn: TODAY }, TODAY)).toBe("issued");
    expect(listStatus({ ...inv, status: "paid" }, TODAY)).toBe("paid");
    expect(listStatus({ ...inv, status: "credited" }, TODAY)).toBe("credited");
    // a credit invoice is its own kind of row, never «overdue»
    expect(listStatus({ kind: "credit", status: "issued", dueOn: "2026-10-01" }, TODAY)).toBe("credit");
    expect(listStatus({ ...inv, status: "discarded" }, TODAY)).toBeNull();
  });

  it("filters by status: drafts, issued and not due, overdue, paid, credited with its credit invoice", () => {
    const by = (status: string) => ids(filterRows(ROWS, { ...all, status: status as never }, TODAY));
    expect(by("")).toEqual(["d1", "i1", "o1", "p1", "c1", "n1"]);
    expect(by("draft")).toEqual(["d1"]);
    expect(by("issued")).toEqual(["i1"]);
    expect(by("overdue")).toEqual(["o1"]);
    expect(by("paid")).toEqual(["p1"]);
    expect(by("credited")).toEqual(["c1", "n1"]);
  });

  it("searches the receiver, the number and the barber, whatever the case", () => {
    expect(ids(filterRows(ROWS, { ...all, q: "  habe " }, TODAY))).toEqual(["d1", "p1"]);
    expect(ids(filterRows(ROWS, { ...all, q: "48" }, TODAY))).toEqual(["i1", "o1"]);
    expect(ids(filterRows(ROWS, { ...all, q: "MART" }, TODAY))).toEqual(["d1"]);
    expect(filterRows(ROWS, { ...all, q: "nobody" }, TODAY)).toEqual([]);
  });

  it("keeps the invoices dated in the period; a draft counts as dated today", () => {
    expect(ids(filterRows(ROWS, { ...all, from: "2026-11-01", to: "2026-11-30" }, TODAY))).toEqual(["d1", "i1", "o1"]);
    expect(ids(filterRows(ROWS, { ...all, from: "2026-10-03", to: "2026-10-31" }, TODAY))).toEqual(["n1"]);
    expect(ids(filterRows(ROWS, { ...all, to: "2026-10-02" }, TODAY))).toEqual(["p1", "c1"]);
    // the filters work together
    expect(ids(filterRows(ROWS, { q: "habe", status: "paid", from: "2026-10-01", to: "2026-10-31" }, TODAY))).toEqual(["p1"]);
  });

  it("takes a question from outside and drops what is not one", () => {
    expect(listQueryOf({ q: "x", status: "overdue", from: "2026-11-01", to: "2026-11-30", sort: { key: "gross", dir: "asc" } })).toEqual({ q: "x", status: "overdue", from: "2026-11-01", to: "2026-11-30", sort: { key: "gross", dir: "asc" } });
    expect(listQueryOf({ status: "everything", from: "tomorrow", to: "2026-13-40", sort: { key: "id; drop table", dir: "up" } })).toEqual({ q: "", status: "", from: "", to: "", sort: DEFAULT_SORT });
    expect(listQueryOf(null)).toEqual({ q: "", status: "", from: "", to: "", sort: DEFAULT_SORT });
  });

  it("steps a period: a month, a year, a week from Monday, a day", () => {
    expect(periodOf("month", TODAY)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(periodOf("month", TODAY, -1)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodOf("month", "2026-12-15", 1)).toEqual({ from: "2027-01-01", to: "2027-01-31" });
    expect(periodOf("year", TODAY, -1)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    // 19.11.2026 is a Thursday
    expect(periodOf("week", TODAY)).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(periodOf("week", TODAY, 1)).toEqual({ from: "2026-11-23", to: "2026-11-29" });
    expect(periodOf("day", "2026-11-30", 1)).toEqual({ from: "2026-12-01", to: "2026-12-01" });
  });
});

describe("the list: sort and pages", () => {
  it("opens with the newest date first, a draft on top, and the newest number first within a day", () => {
    expect(ids(sortRows(ROWS, DEFAULT_SORT, TODAY))).toEqual(["d1", "i1", "o1", "n1", "p1", "c1"]);
    expect(ids(sortRows(ROWS, { key: "date", dir: "asc" }, TODAY))).toEqual(["p1", "c1", "n1", "i1", "o1", "d1"]);
  });

  it("sorts by every column, both ways", () => {
    const by = (key: string, dir: "asc" | "desc") => ids(sortRows(ROWS, { key: key as never, dir }, TODAY));
    expect(by("gross", "asc")).toEqual(["n1", "c1", "p1", "d1", "o1", "i1"]);
    expect(by("gross", "desc")).toEqual(["i1", "o1", "d1", "p1", "c1", "n1"]);
    expect(by("net", "desc")).toEqual(["i1", "o1", "d1", "p1", "c1", "n1"]);
    expect(by("receiver", "asc")).toEqual(["o1", "d1", "p1", "n1", "c1", "i1"]);
    // numbers as numbers; a draft, which has none yet, is the newest
    expect(by("number", "asc")).toEqual(["c1", "n1", "p1", "o1", "i1", "d1"]);
    expect(by("number", "desc")).toEqual(["d1", "i1", "o1", "p1", "n1", "c1"]);
    expect(by("status", "asc")).toEqual(["d1", "i1", "o1", "p1", "c1", "n1"]);
    expect(by("due", "desc")).toEqual(["i1", "o1", "p1", "c1", "d1", "n1"]);
    // the rows handed in are left as they were
    expect(ids(ROWS)).toEqual(["d1", "i1", "o1", "p1", "c1", "n1"]);
  });

  it("«DEMO-2026-0010» comes after «DEMO-2026-0002»", () => {
    const rows = ["DEMO-2026-0010", "DEMO-2026-0002", "DEMO-2026-0001"].map((number, i) => row({ id: `x${i}`, number, date: "2026-11-02" }));
    expect(sortRows(rows, { key: "number", dir: "asc" }, TODAY).map((r) => r.number)).toEqual(["DEMO-2026-0001", "DEMO-2026-0002", "DEMO-2026-0010"]);
  });

  it("a header clicked again turns round; another starts with names A first and sums largest first", () => {
    expect(nextSort(DEFAULT_SORT, "date")).toEqual({ key: "date", dir: "asc" });
    expect(nextSort(DEFAULT_SORT, "receiver")).toEqual({ key: "receiver", dir: "asc" });
    expect(nextSort(DEFAULT_SORT, "gross")).toEqual({ key: "gross", dir: "desc" });
  });

  it("cuts a page of 10, 25, 50 or 100 and says which rows it shows", () => {
    const many = Array.from({ length: 27 }, (_, i) => i);
    expect(pageOf(many, 1, 10)).toMatchObject({ page: 1, pages: 3, from: 1, to: 10 });
    expect(pageOf(many, 3, 10)).toMatchObject({ rows: [20, 21, 22, 23, 24, 25, 26], page: 3, from: 21, to: 27 });
    // a page past the end is the last one; nothing at all is «0–0»
    expect(pageOf(many, 9, 25)).toMatchObject({ page: 2, pages: 2, from: 26, to: 27 });
    expect(pageOf([], 1, 10)).toMatchObject({ rows: [], page: 1, pages: 1, from: 0, to: 0 });
  });
});

describe("«Сводка по выбранным счетам»", () => {
  it("counts and sums the rows without and with VAT: issued, credit invoices, turnover, unpaid, overdue, drafts", () => {
    expect(summaryOf(ROWS)).toEqual({
      issued: { count: 4, netCents: 173440, grossCents: 191440 },
      credits: { count: 1, netCents: -10000, grossCents: -12400 },
      turnover: { count: 5, netCents: 163440, grossCents: 179040 },
      unpaid: { count: 2, netCents: 124640, grossCents: 140240 },
      overdue: { count: 1, netCents: 59640, grossCents: 59640 },
      drafts: { count: 1, netCents: 41200, grossCents: 41200 },
    });
  });

  it("sums what the filters leave, and nothing is all zeros", () => {
    const nov = filterRows(ROWS, { ...all, from: "2026-11-01", to: "2026-11-30" }, TODAY);
    expect(summaryOf(nov)).toMatchObject({ issued: { count: 2, grossCents: 140240 }, credits: { count: 0, grossCents: 0 }, drafts: { count: 1 } });
    const none = summaryOf([]);
    expect(Object.values(none).every((s) => s.count === 0 && s.netCents === 0 && s.grossCents === 0)).toBe(true);
  });
});

describe("«Рабочий стол»: the three figures", () => {
  it("this month, last month (credit invoices taken off) and everything overdue", () => {
    const s = deskStats(ROWS, TODAY);
    expect(s.thisRange).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(s.lastRange).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    // a draft is not an invoice of the month yet
    expect(s.thisMonth).toEqual({ count: 2, netCents: 124640, grossCents: 140240 });
    // two invoices in October; one of them was credited, so it adds nothing
    expect(s.lastMonth).toEqual({ count: 2, netCents: 38800, grossCents: 38800 });
    expect(s.overdue).toEqual({ count: 1, netCents: 59640, grossCents: 59640 });
  });

  it("«Неоплаченные счета»: issued and not paid, the longest overdue first, and what all of them come to", () => {
    const u = deskUnpaid(ROWS);
    // the draft, the paid, the credited and the credit invoice are owed by nobody
    expect(ids(u.rows)).toEqual(["o1", "i1"]);
    expect(u.all).toEqual({ count: 2, netCents: 124640, grossCents: 140240 });
    expect(u.overdue).toBe(1);
    // a few shown, the sum stays everything's
    expect(ids(deskUnpaid(ROWS, 1).rows)).toEqual(["o1"]);
    expect(deskUnpaid(ROWS, 1).all.count).toBe(2);
    expect(deskUnpaid([], 5)).toEqual({ rows: [], all: { count: 0, netCents: 0, grossCents: 0 }, overdue: 0 });
  });
});

describe("the receivers report", () => {
  it("a period: invoices, credit invoices, sold, credited, total and the last invoice, by name", () => {
    const oct = receiversReport(ROWS, "2026-10-01", "2026-10-31");
    expect(oct.rows).toEqual([
      { receiverId: "Habe OÜ", name: "Habe OÜ", person: false, invoices: 1, credits: 0, sold: { netCents: 38800, grossCents: 38800 }, credited: { netCents: 0, grossCents: 0 }, total: { netCents: 38800, grossCents: 38800 }, last: { id: "p1", number: "479", date: "2026-10-02" } },
      { receiverId: "Lõikus OÜ", name: "Lõikus OÜ", person: false, invoices: 1, credits: 1, sold: { netCents: 10000, grossCents: 12400 }, credited: { netCents: 10000, grossCents: 12400 }, total: { netCents: 0, grossCents: 0 }, last: { id: "c1", number: "477", date: "2026-10-02" } },
    ]);
    expect(oct).toMatchObject({ receivers: 2, invoices: 2, credits: 1, total: { netCents: 38800, grossCents: 38800 } });
  });

  it("leaves drafts out, and an open period is all time", () => {
    const nov = receiversReport(ROWS, "2026-11-01", "2026-11-30");
    expect(nov.rows.map((r) => r.name)).toEqual(["FIE Kalle", "Tänava OÜ"]);
    const ever = receiversReport(ROWS, "", "");
    expect(ever).toMatchObject({ receivers: 4, invoices: 4, credits: 1, total: { grossCents: 179040 } });
    // Habe's draft is not counted: his one invoice is the paid one
    expect(ever.rows.find((r) => r.name === "Habe OÜ")).toMatchObject({ invoices: 1, total: { grossCents: 38800 } });
    expect(receiversReport(ROWS, "2025-01-01", "2025-12-31")).toMatchObject({ rows: [], receivers: 0 });
  });
});

describe("«Платежи»: the day of a payment", () => {
  it("today is this moment, an earlier day its noon in the salon; never before the invoice or after today", () => {
    expect(paidMoment(TODAY, "2026-11-02", TZ, NOW)).toBe(NOW);
    expect(paidMoment("2026-11-10", "2026-11-02", TZ, NOW)).toBe(zonedToUtc("2026-11-10", "12:00", TZ));
    // the invoice's own day is allowed, the day before it is not
    expect(paidMoment("2026-11-02", "2026-11-02", TZ, NOW)).toBe(zonedToUtc("2026-11-02", "12:00", TZ));
    expect(paidMoment("2026-11-01", "2026-11-02", TZ, NOW)).toBeNull();
    expect(paidMoment("2026-11-20", "2026-11-02", TZ, NOW)).toBeNull();
    expect(paidMoment("20.11.2026", null, TZ, NOW)).toBeNull();
    expect(paidMoment("2026-13-45", null, TZ, NOW)).toBeNull();
    expect(paidMoment("", null, TZ, NOW)).toBeNull();
  });
});

describe("an address in three columns", () => {
  it("splits «street, 12345 Town» and leaves anything else whole", () => {
    expect(splitAddress("Näidise 5, 10111 Tallinn")).toEqual({ street: "Näidise 5", postcode: "10111", town: "Tallinn" });
    expect(splitAddress("Mardi 1, 10145 Tallinn, Eesti")).toEqual({ street: "Mardi 1", postcode: "10145", town: "Tallinn" });
    expect(splitAddress("10111 Tallinn")).toEqual({ street: "", postcode: "10111", town: "Tallinn" });
    expect(splitAddress("Tallinn")).toEqual({ street: "Tallinn", postcode: "", town: "" });
    expect(splitAddress("")).toEqual({ street: "", postcode: "", town: "" });
  });
});

/* ---------- with the database ---------- */

let demo: Demo;
let biz: Business;
let owner: string;
const paste = FAKE_PRODUCTS[0]; // 24,90 €, sold at 24 %

const withDb = () => {
  beforeEach(async () => {
    demo = await freshDemo();
    biz = (await getBusiness(query, "rempire"))!;
    const [u] = await query<{ id: string }>("insert into users (business_id, email, role) values ($1, 'owner@example.test', 'owner') returning id", [demo.business.id]);
    owner = u.id;
  });
};
afterAll(closeDb);

const typed = (text: string, unitCents: number) => ({ text, qty: 1, unitCents, discountCents: 0 });
const count = async (table: string) => (await query<{ n: number }>(`select count(*)::int as n from ${table}`))[0].n;

/** A free draft for a receiver who has no barber: only what is typed into it. */
async function freeDraft(vatMode: "vat" | "none" = "vat", name = "Näidis Klient OÜ"): Promise<{ id: string; receiverId: string }> {
  const saved = await saveReceiver(biz, null, { kind: "ou", legalName: name, regCode: "12345678", vatNumber: "", address: "Näidise 5, 10111 Tallinn", email: "arved@example.test", vatMode, termsDays: 14, locale: "et", staffId: null, issuerId: null, active: true }, owner);
  if (!saved.ok) throw new Error("receiver");
  const d = await openDraft(biz, saved.id, owner, NOW);
  if (!d.ok) throw new Error("draft");
  return { id: d.id, receiverId: saved.id };
}

describe("a line's name: the shop's products, the salon's services, or typed", () => {
  withDb();

  it("finds both lists by a few letters, each with its price", async () => {
    const products = await findLineItems(query, biz.id, "matte paste");
    expect(products.shopDown).toBe(false);
    expect(products.items).toContainEqual({ source: "product", key: `p:${paste.productId}:${paste.variant}`, productId: paste.productId, variant: paste.variant, name: "Demo Grooming Matte Paste 100 ml", priceCents: 2490, vatBp: 2400 });

    const [svc] = await query<{ id: string; name: { ru: string; et: string }; price_cents: number }>("select id, name, price_cents from services where business_id = $1 and active order by sort, slug limit 1", [biz.id]);
    const ru = await findLineItems(query, biz.id, svc.name.ru.slice(0, 4), "ru");
    expect(ru.items).toContainEqual({ source: "service", key: `s:${svc.id}`, serviceId: svc.id, name: svc.name.ru, priceCents: svc.price_cents });
    // found by its Estonian name too, and shown in the login's language
    const et = await findLineItems(query, biz.id, svc.name.et.slice(0, 4), "et");
    expect(et.items.find((i) => i.source === "service" && i.serviceId === svc.id)?.name).toBe(svc.name.et);
  });

  it("offers nothing for one letter or for a name in neither list: the line is then typed", async () => {
    expect(await findLineItems(query, biz.id, "p")).toEqual({ items: [], shopDown: false });
    expect(await findLineItems(query, biz.id, "Lisatöö 12.11")).toEqual({ items: [], shopDown: false });
    expect(serviceItems([{ id: "s", name: { ru: "Стрижка", et: "Lõikus", en: "Haircut" }, priceCents: 3000 }], "", "ru")).toEqual([]);
  });

  it("a shop that does not answer leaves the services, and says so", async () => {
    const [svc] = await query<{ name: { ru: string } }>("select name from services where business_id = $1 and active order by sort, slug limit 1", [biz.id]);
    // a live shop with nobody behind the address
    const down = await findLineItems(query, biz.id, svc.name.ru.slice(0, 4), "ru", { SHOP_API_URL: "https://localhost:9", SHOP_API_SECRET: "x" });
    expect(down.shopDown).toBe(true);
    expect(down.items.length).toBeGreaterThan(0);
    expect(down.items.every((i) => i.source === "service")).toBe(true);
  });

  it("reads a picked product's rate from the shop again, and knows a service of this salon", async () => {
    expect(await pickedVat(query, biz.id, { source: "product", productId: paste.productId, variant: paste.variant })).toEqual({ saleVatBp: 2400 });
    expect(await pickedVat(query, biz.id, { source: "product", productId: "no-such-product", variant: "" })).toBeNull();
    expect(await pickedVat(query, biz.id, { source: "service", serviceId: demo.services[Object.keys(demo.services)[0]] })).toEqual({});
    expect(await pickedVat(query, biz.id, { source: "service", serviceId: "00000000-0000-4000-8000-000000000000" })).toBeNull();
    // a price or a rate sent from the browser is never taken
    expect(await pickedVat(query, biz.id, { source: "product", productId: paste.productId, variant: paste.variant, vatBp: 0, saleVatBp: 0 })).toEqual({ saleVatBp: 2400 });
    expect(await pickedVat(query, biz.id, "product")).toBeNull();
  });

  it("a picked product's line takes its own rate, a service's and a typed one the issuer's; all three are typed lines", async () => {
    // the issuer's own rate is another one here, so the two can be told apart
    await query("update invoice_issuers set vat_bp = 2200 where business_id = $1", [biz.id]);
    const d = await freeDraft("vat");
    const product = await pickedVat(query, biz.id, { source: "product", productId: paste.productId, variant: paste.variant });
    const service = await pickedVat(query, biz.id, { source: "service", serviceId: demo.services[Object.keys(demo.services)[0]] });
    expect(await addDraftLine(biz, d.id, typed("Demo Grooming Matte Paste 100 ml", 2490), owner, product!)).toEqual({ ok: true });
    expect(await addDraftLine(biz, d.id, typed("Lõikus", 3000), owner, service!)).toEqual({ ok: true });
    expect(await addDraftLine(biz, d.id, typed("Lisatöö", 2500), owner)).toEqual({ ok: true });
    const lines = await invoiceLines(query, d.id);
    expect(lines.map((l) => [l.text, l.kind, l.unitCents, l.vatBp, l.saleId, l.itemNo])).toEqual([
      ["Demo Grooming Matte Paste 100 ml", "other", 2490, 2400, null, null],
      ["Lõikus", "other", 3000, 2200, null, null],
      ["Lisatöö", "other", 2500, 2200, null, null],
    ]);
    // the totals are the invoice's own: 79,90 € gross, each line split at its rate
    const inv = (await invoiceById(query, biz.id, d.id))!;
    expect(inv.grossCents).toBe(7990);
    expect(inv.netCents + inv.vatCents).toBe(7990);
    expect(inv.netCents).toBe(lines.reduce((n, l) => n + l.netCents, 0));
    // the typed line's name is then picked from the shop: it takes the product's rate
    expect(await updateDraftLine(biz, lines[2].id, typed("Demo Grooming Matte Paste 100 ml", 2490), owner, product!)).toEqual({ ok: true });
    expect((await invoiceLines(query, d.id))[2]).toMatchObject({ vatBp: 2400, unitCents: 2490 });
    // an edit with no pick leaves the rate as it is
    expect(await updateDraftLine(biz, lines[0].id, typed("Pasta", 2000), owner)).toEqual({ ok: true });
    expect((await invoiceLines(query, d.id))[0]).toMatchObject({ text: "Pasta", vatBp: 2400 });
  });

  it("for a receiver whose invoices carry no VAT, a picked line carries none either", async () => {
    const d = await freeDraft("none");
    const product = await pickedVat(query, biz.id, { source: "product", productId: paste.productId, variant: paste.variant });
    await addDraftLine(biz, d.id, typed("Demo Grooming Matte Paste 100 ml", 2490), owner, product!);
    await addDraftLine(biz, d.id, typed("Lisatöö", 2500), owner);
    expect((await invoiceLines(query, d.id)).map((l) => [l.vatBp, l.vatCents, l.grossCents])).toEqual([
      [0, 0, 2490],
      [0, 0, 2500],
    ]);
  });

  it("a sale's own line never changes its rate by a pick", async () => {
    const r = (await receiverForStaff(query, demo.staff.valentin))!;
    const d = await openDraft(biz, r.id, owner, NOW);
    if (!d.ok) throw new Error("draft");
    const [rent] = await invoiceLines(query, d.id);
    expect(rent.kind).toBe("rent");
    await query("update invoice_issuers set vat_bp = 2200 where business_id = $1", [biz.id]);
    expect(await updateDraftLine(biz, rent.id, { text: rent.text, qty: 1, unitCents: rent.unitCents, discountCents: 0 }, owner, { saleVatBp: 900 })).toEqual({ ok: true });
    expect((await invoiceLines(query, d.id))[0].vatBp).toBe(rent.vatBp);
  });
});

describe("«Посмотреть и отправить счёт»: the preview", () => {
  withDb();

  it("is the draft's PDF with no number and the draft's mark, and changes nothing", async () => {
    const d = await freeDraft();
    await addDraftLine(biz, d.id, typed("Konsultatsioon", 5000), owner);
    const before = { inv: await invoiceById(query, biz.id, d.id), counters: await count("invoice_counters"), letters: await count("notifications"), audit: await count("audit"), lines: await invoiceLines(query, d.id) };

    const pdf = (await draftPdf(query, biz, d.id, NOW))!;
    expect(pdf.filename).toBe("rempire-arve-mustand.pdf");
    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    const doc = await PDFDocument.load(pdf.bytes);
    expect(doc.getPageCount()).toBe(1);
    // where the number will be: «mustand / draft»
    expect(doc.getTitle()).toBe("ARVE / Invoice mustand / draft");

    // nothing was taken, written or queued: no number, no counter row, no letter, no audit row
    expect(await invoiceById(query, biz.id, d.id)).toEqual(before.inv);
    expect((await invoiceById(query, biz.id, d.id))!).toMatchObject({ status: "draft", number: null, issuedOn: null, dueOn: null, seller: null, buyer: null });
    expect(await invoiceLines(query, d.id)).toEqual(before.lines);
    expect(await count("invoice_counters")).toBe(before.counters);
    expect(await count("notifications")).toBe(before.letters);
    expect(await count("audit")).toBe(before.audit);
    // looked at twice, still nothing; the series starts at 1 when it is issued
    await draftPdf(query, biz, d.id, NOW);
    expect((await listIssuers(query, biz.id, 2026))[0].lastNumber).toBe(0);
    expect(await issueInvoice(biz, d.id, owner, NOW)).toEqual({ ok: true, number: "DEMO-2026-0001" });
  });

  it("carries the stamp the issued invoice does not, and exists only for a draft", async () => {
    const d = await freeDraft();
    await addDraftLine(biz, d.id, typed("Konsultatsioon", 5000), owner);
    const draft = (await draftPdf(query, biz, d.id, NOW))!;
    // an issued invoice has its own PDF and no preview
    expect(await invoicePdf(query, biz.id, d.id)).toBeNull();
    await issueInvoice(biz, d.id, owner, NOW);
    expect(await draftPdf(query, biz, d.id, NOW)).toBeNull();
    const issued = (await invoicePdf(query, biz.id, d.id))!;
    expect((await PDFDocument.load(issued.bytes)).getTitle()).toBe("ARVE / Invoice DEMO-2026-0001");
    expect(draft.bytes.length).not.toBe(issued.bytes.length);
    // somebody else's draft, or nothing at all, is not shown
    expect(await draftPdf(query, { id: "00000000-0000-4000-8000-000000000000", timezone: TZ }, d.id, NOW)).toBeNull();
    expect(await draftPdf(query, biz, "not-an-id", NOW)).toBeNull();
  });

  it("an empty draft still previews: the sheet with no lines", async () => {
    const d = await freeDraft();
    const pdf = await draftPdf(query, biz, d.id, NOW);
    expect(pdf).not.toBeNull();
    expect((await PDFDocument.load(pdf!.bytes)).getPageCount()).toBe(1);
  });
});

describe("«Рабочий стол»: the month's card", () => {
  withDb();

  it("counts the barbers who get a month's invoice and which of them have October's: a draft, then issued; a free one is not it", async () => {
    const [{ n }] = await query<{ n: number }>("select count(*)::int as n from invoice_receivers where business_id = $1 and active and staff_id is not null", [biz.id]);
    expect(n).toBeGreaterThan(1);
    const before = await monthInvoices(query, biz.id, "2026-10");
    expect(before.barbers).toBe(n);
    const v = (await receiverForStaff(query, demo.staff.valentin))!;
    const month = await openDraft(biz, v.id, owner, NOW);
    if (!month.ok) throw new Error("draft");
    expect(month.made).toBe("month");
    expect(await monthInvoices(query, biz.id, "2026-10")).toEqual({ barbers: n, drafts: before.drafts + 1, issued: before.issued });
    await issueInvoice(biz, month.id, owner, NOW);
    const issued = { barbers: n, drafts: before.drafts, issued: before.issued + 1 };
    expect(await monthInvoices(query, biz.id, "2026-10")).toEqual(issued);
    // pressed again for him: a free invoice beside the month's, which is not the month's
    const free = await openDraft(biz, v.id, owner, NOW);
    if (!free.ok) throw new Error("free");
    expect(free.made).toBe("free");
    expect(await monthInvoices(query, biz.id, "2026-10")).toEqual(issued);
    // another month has nothing yet; a receiver switched off gets no month's invoice
    expect(await monthInvoices(query, biz.id, "2026-09")).toMatchObject({ barbers: n });
    await query("update invoice_receivers set active = false where id = $1", [v.id]);
    expect((await monthInvoices(query, biz.id, "2026-10")).barbers).toBe(n - 1);
    expect(await monthInvoices(query, biz.id, "October")).toEqual({ barbers: 0, drafts: 0, issued: 0 });
  });
});

describe("a draft's receiver, and a copy", () => {
  withDb();

  it("a free draft moves to another receiver, and its lines follow his VAT", async () => {
    await query("update invoice_issuers set vat_bp = 2200 where business_id = $1", [biz.id]);
    const d = await freeDraft("vat");
    await addDraftLine(biz, d.id, typed("Lisatöö", 2500), owner);
    const other = await saveReceiver(biz, null, { kind: "person", legalName: "Mari Näidis", regCode: "", vatNumber: "", address: "Tallinn", email: "mari@example.test", vatMode: "none", termsDays: 7, locale: "ru", staffId: null, issuerId: null, active: true }, owner);
    if (!other.ok) throw new Error("receiver");
    expect(await setDraftReceiver(biz, d.id, other.id, owner)).toEqual({ ok: true });
    const moved = (await invoiceById(query, biz.id, d.id))!;
    expect(moved).toMatchObject({ receiverId: other.id, receiverName: "Mari Näidis", locale: "ru", status: "draft", vatCents: 0, grossCents: 2500, netCents: 2500 });
    expect((await invoiceLines(query, d.id))[0].vatBp).toBe(0);
    // and back: the issuer's rate again
    expect(await setDraftReceiver(biz, d.id, d.receiverId, owner)).toEqual({ ok: true });
    expect((await invoiceLines(query, d.id))[0].vatBp).toBe(2200);
    expect((await invoiceById(query, biz.id, d.id))!.grossCents).toBe(2500);
  });

  it("a month's draft stays its barber's; an issued invoice and a switched-off receiver are refused", async () => {
    const v = (await receiverForStaff(query, demo.staff.valentin))!;
    const s = (await receiverForStaff(query, demo.staff.slava))!;
    const month = await openDraft(biz, v.id, owner, NOW);
    if (!month.ok) throw new Error("draft");
    expect(month.made).toBe("month");
    expect(await setDraftReceiver(biz, month.id, s.id, owner)).toEqual({ ok: false, code: "not_free" });
    expect((await invoiceById(query, biz.id, month.id))!.receiverId).toBe(v.id);

    const d = await freeDraft();
    await query("update invoice_receivers set active = false where id = $1", [s.id]);
    expect(await setDraftReceiver(biz, d.id, s.id, owner)).toEqual({ ok: false, code: "no_receiver" });
    await addDraftLine(biz, d.id, typed("Lisatöö", 2500), owner);
    await issueInvoice(biz, d.id, owner, NOW);
    expect(await setDraftReceiver(biz, d.id, v.id, owner)).toEqual({ ok: false, code: "not_draft" });
  });

  it("a copy is a new free draft for the same receiver with the same lines as typed ones, and no number", async () => {
    const v = (await receiverForStaff(query, demo.staff.valentin))!;
    const month = await openDraft(biz, v.id, owner, NOW);
    if (!month.ok) throw new Error("draft");
    await addDraftLine(biz, month.id, typed("Lisatöö", 2500), owner);
    await issueInvoice(biz, month.id, owner, NOW);
    const src = await invoiceLines(query, month.id);

    const copy = await copyInvoice(biz, month.id, owner, NOW);
    if (!copy.ok) throw new Error("copy");
    const inv = (await invoiceById(query, biz.id, copy.id))!;
    expect(inv).toMatchObject({ status: "draft", free: true, number: null, receiverId: v.id, periodFrom: TODAY, periodTo: TODAY });
    const lines = await invoiceLines(query, copy.id);
    expect(lines.map((l) => [l.text, l.qty, l.unitCents, l.grossCents])).toEqual(src.map((l) => [l.text, l.qty, l.unitCents, l.grossCents]));
    // the rent's month is billed once: the copy's lines point at no month and no sale
    expect(lines.every((l) => l.kind === "other" && l.saleId === null && l.rentMonth === null)).toBe(true);
    expect(inv.grossCents).toBe((await invoiceById(query, biz.id, month.id))!.grossCents);
    // the original is as it was, and a credit invoice is not copied
    expect((await invoiceById(query, biz.id, month.id))!.status).toBe("issued");
    const credit = await creditInvoice(biz, month.id, owner, NOW);
    if (!credit.ok) throw new Error("credit");
    expect(await copyInvoice(biz, credit.id, owner, NOW)).toEqual({ ok: false, code: "not_found" });
  });
});

describe("what happened to an invoice: the audit log and the outbox", () => {
  withDb();

  it("issued, sent to which address, paid, credited; the credit invoice has its own", async () => {
    const v = (await receiverForStaff(query, demo.staff.valentin))!;
    const d = await openDraft(biz, v.id, owner, NOW);
    if (!d.ok) throw new Error("draft");
    // a draft has no events to show
    expect(await invoiceEvents(query, biz.id, d.id)).toEqual([]);
    const issued = await issueInvoice(biz, d.id, owner, NOW);
    if (!issued.ok) throw new Error("issue");
    // the letter was queued on the database's own clock
    await runOutbox(query, Date.now() + 1000, DEV);
    // Resend reports that the receiver opened it (src/lib/mail-opened.ts)
    await query("update notifications set provider = 'resend', provider_ref = 're_test_open' where kind = 'invoice' and payload->>'invoiceId' = $1", [d.id]);
    expect(await recordOpen(query, "re_test_open", new Date(Date.now() + 2000))).toBe(true);
    await setPaid(biz, d.id, true, owner, NOW);
    const credit = await creditInvoice(biz, d.id, owner, NOW);
    if (!credit.ok) throw new Error("credit");

    const events = await invoiceEvents(query, biz.id, d.id);
    expect(events.map((e) => e.kind).sort()).toEqual(["credited", "issued", "opened", "paid", "sent"]);
    expect(events.every((e) => e.invoiceId === d.id && e.number === issued.number && !e.credit)).toBe(true);
    expect(events.find((e) => e.kind === "sent")).toMatchObject({ email: "delivered@resend.dev", receiver: v.legalName });
    expect(events.find((e) => e.kind === "opened")).toMatchObject({ email: "delivered@resend.dev" });
    expect(events.find((e) => e.kind === "credited")!.other).toEqual({ id: credit.id, number: credit.number });
    // the newest first
    expect([...events].sort((a, b) => (a.at < b.at ? 1 : -1))).toEqual(events);

    const own = await invoiceEvents(query, biz.id, credit.id);
    expect(own.map((e) => [e.kind, e.number, e.credit])).toEqual([["issued", credit.number, true]]);

    // «Рабочий стол»: the business's newest, both invoices among them
    const latest = await latestEvents(query, biz.id, 12);
    expect(latest.length).toBe(6);
    expect(new Set(latest.map((e) => e.number))).toEqual(new Set([issued.number, credit.number]));
    expect(await latestEvents(query, "00000000-0000-4000-8000-000000000000")).toEqual([]);
    // another business's login reads nothing of it
    expect(await invoiceEvents(query, "00000000-0000-4000-8000-000000000000", d.id)).toEqual([]);
  });

  it("a receiver's journal: his invoices, his card, his barber's rent; and how many invoices he has", async () => {
    const v = (await receiverForStaff(query, demo.staff.valentin))!;
    const d = await openDraft(biz, v.id, owner, NOW);
    if (!d.ok) throw new Error("draft");
    await issueInvoice(biz, d.id, owner, NOW);
    await setRent(biz, demo.staff.valentin, 42000, "2027-01-01", owner);
    await saveReceiver(biz, v.id, { kind: v.kind, legalName: v.legalName, regCode: v.regCode, vatNumber: v.vatNumber, address: "Näidise 5, 10111 Tallinn", email: v.email, vatMode: v.vatMode, termsDays: 10, locale: v.locale, staffId: v.staffId, issuerId: null, active: true }, owner);
    const log = await receiverEvents(query, biz.id, v.id);
    expect(log.map((e) => e.kind).sort()).toEqual(["issued", "receiver_edit", "rent"]);
    expect(log.find((e) => e.kind === "rent")!.cents).toBe(42000);
    expect(log.find((e) => e.kind === "receiver_edit")!.invoiceId).toBeNull();
    // somebody else's receiver has his own
    const s = (await receiverForStaff(query, demo.staff.slava))!;
    expect(await receiverEvents(query, biz.id, s.id)).toEqual([]);
    const counts = await invoiceCounts(query, biz.id);
    expect(counts.get(v.id)).toBe(1);
    expect(counts.get(s.id)).toBeUndefined();
  });
});

describe("«Экспорт счетов в таблицу»", () => {
  withDb();
  const WORDS = {
    sheet: "Счета",
    cols: { status: "Статус", receiver: "Получатель", number: "№ счёта", date: "Дата счёта", due: "Срок оплаты", net: "без НДС, €", vat: "НДС, €", gross: "с НДС, €" },
    status: { draft: "Черновик", issued: "Выставлен", overdue: "Просрочен", paid: "Оплачен", credited: "Кредитован", credit: "Кредит-счёт" },
  };

  it("is the asked list as a sheet, and each export is in the audit log without its rows", async () => {
    const v = (await receiverForStaff(query, demo.staff.valentin))!;
    const d = await openDraft(biz, v.id, owner, NOW);
    if (!d.ok) throw new Error("draft");
    const issued = await issueInvoice(biz, d.id, owner, NOW);
    if (!issued.ok) throw new Error("issue");
    const free = await freeDraft();

    const { rows } = await sectionRows(query, biz, undefined, NOW);
    expect(rows.map((r) => r.status).sort()).toEqual(["draft", "issued"]);
    expect(rows.find((r) => r.id === d.id)).toMatchObject({ number: issued.number, receiver: v.legalName, date: TODAY, receiverId: v.id, person: false });
    expect(rows.find((r) => r.id === free.id)).toMatchObject({ number: "", date: "", due: "" });

    const all = await exportInvoices(biz, { id: owner }, {}, WORDS, undefined, NOW);
    expect(all.rows).toBe(2);
    const sheet = readXlsx(all.bytes);
    expect(sheet.name).toBe("Счета");
    expect(sheet.rows[0]).toEqual(["Статус", "Получатель", "№ счёта", "Дата счёта", "Срок оплаты", "без НДС, €", "НДС, €", "с НДС, €"]);
    // the list's own order: the draft first, then the issued one, with sums as numbers in euros
    expect(sheet.rows[1].slice(0, 3)).toEqual(["Черновик", "Näidis Klient OÜ", null]);
    const inv = (await invoiceById(query, biz.id, d.id))!;
    expect(sheet.rows[2]).toEqual(["Выставлен", v.legalName, issued.number, "19.11.2026", sheet.rows[2][4], inv.netCents / 100, inv.vatCents / 100, inv.grossCents / 100]);

    const some = await exportInvoices(biz, { id: owner }, { status: "issued", q: "näidis" }, WORDS, undefined, NOW);
    expect(some.rows).toBe(1);
    expect(readXlsx(some.bytes).rows).toHaveLength(2);

    const log = await query<{ actor: string; entity: string; after: Record<string, unknown> }>("select actor, entity, after from audit where action = 'export' order by id");
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ actor: owner, entity: "invoice", after: { by: "admin", rows: 2, status: "all" } });
    expect(log[1].after).toMatchObject({ rows: 1, status: "issued" });
    // who and how many, never a receiver's name or what was searched for
    expect(JSON.stringify(log)).not.toContain("Näidis");
    expect(JSON.stringify(log)).not.toContain("näidis");
  });
});
