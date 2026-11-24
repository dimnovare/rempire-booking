/**
 * «Счета» as Isolta does it (Dim, 24.11.2026, decisions round 15): the
 * reference number for the payment (7-3-1, src/lib/billing/reference.ts),
 * in the list and its search; no issuing without the company's IBAN and
 * address, refused before a number is taken; the number a draft would get
 * (not reserved); the receiver's phone (044), checked as the salon's own
 * numbers are. The PDF's side (reference printed, note not printed) and
 * «Отправить снова» to the current e-mail are in parity-invoices.test.ts.
 *
 * Fake companies only, on the demo seed. Every date is fixed: October 2026
 * is invoiced on 1 November.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getBusiness, type Business } from "@/lib/availability";
import { sectionRows } from "@/lib/billing/export";
import { buildDraft, invoiceById, issueBlock, issueInvoice, upcomingNumber } from "@/lib/billing/invoices";
import { filterRows } from "@/lib/billing/list";
import { listIssuers, listReceivers, receiverForStaff, saveReceiver, setLastNumber, type Receiver } from "@/lib/billing/parties";
import { checkDigit731, referenceNumber } from "@/lib/billing/reference";
import { closeDb, query } from "@/lib/db";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const ISSUE = zonedToUtc("2026-11-01", "10:00", "Europe/Tallinn");

let demo: Demo;
let biz: Business;
let owner: string;

beforeEach(async () => {
  demo = await freshDemo();
  biz = (await getBusiness(query, "rempire"))!;
  const [u] = await query<{ id: string }>("insert into users (business_id, email, role) values ($1, 'owner@example.test', 'owner') returning id", [demo.business.id]);
  owner = u.id;
});
afterAll(closeDb);

const receiverOf = async (staff: string): Promise<Receiver> => (await receiverForStaff(query, demo.staff[staff]))!;

async function draftFor(staff: string): Promise<string> {
  const d = await buildDraft(biz, (await receiverOf(staff)).id, "2026-10", owner);
  if (!d.ok || !d.id) throw new Error(`no draft for ${staff}`);
  return d.id;
}

const issuer = async () => (await listIssuers(query, biz.id, 2026))[0];

/* ---------- the reference number ---------- */

describe("the reference number (viitenumber, 7-3-1)", () => {
  it("weighs the digits 7, 3, 1 from the right and adds the check digit", () => {
    // the Estonian banks' own worked example: 123 → 1232
    expect(checkDigit731("123")).toBe(2);
    expect(referenceNumber("123")).toBe("1232");
    expect(referenceNumber("123456")).toBe("1234561");
    // a sum that is already a whole ten checks with 0: 5·7 + 5·3 = 50
    expect(checkDigit731("55")).toBe(0);
    expect(referenceNumber("55")).toBe("550");
    // Isolta's last, #422 (2·7 + 2·3 + 4 = 24 → 6), and our first, #423 (3·7 + 2·3 + 4 = 31 → 9)
    expect(referenceNumber("422")).toBe("4226");
    expect(referenceNumber("423")).toBe("4239");
  });

  it("takes the digits of a number with a prefix, a year and padding", () => {
    // 20260001: 1·7 + 0·3 + 0·1 + 0·7 + 6·3 + 2·1 + 0·7 + 2·3 = 33 → 7
    expect(referenceNumber("DEMO-2026-0001")).toBe("202600017");
    // the staging prefix changes nothing: the same digits
    expect(referenceNumber("TEST-DEMO-2026-0001")).toBe("202600017");
    // leading zeros are dropped, as a bank's field would
    expect(referenceNumber("0042")).toBe("424");
  });

  it("is none for no number, no digits, only zeros, or more than a reference can hold", () => {
    for (const n of [null, undefined, "", "ARVE", "000", "1".repeat(20)]) expect(referenceNumber(n)).toBe("");
    expect(referenceNumber("1".repeat(19))).toHaveLength(20);
  });
});

describe("the reference in the list", () => {
  it("is each issued invoice's, none for a draft, and the search finds an invoice by it", async () => {
    const draft = await draftFor("slava");
    const one = await issueInvoice(biz, await draftFor("valentin"), owner, ISSUE);
    if (!one.ok) throw new Error(one.code);
    const { rows, today } = await sectionRows(query, biz, undefined, ISSUE);
    const row = rows.find((r) => r.number === one.number)!;
    expect(row.reference).toBe(referenceNumber(one.number));
    expect(rows.find((r) => r.id === draft)!.reference).toBe("");
    const found = filterRows(rows, { q: row.reference, status: "", from: "", to: "" }, today);
    expect(found.map((r) => r.id)).toEqual([row.id]);
  });
});

/* ---------- no IBAN, no address: no issuing ---------- */

describe("issuing without the company's IBAN or address", () => {
  const nothingTaken = async (id: string) => {
    expect(await invoiceById(query, biz.id, id)).toMatchObject({ status: "draft", number: null, seller: null, buyer: null });
    expect(await query("select 1 from invoice_counters")).toEqual([]);
    expect(await query("select 1 from notifications where kind = 'invoice'")).toEqual([]);
    expect(await query("select 1 from audit where entity = 'invoice' and action = 'issue'")).toEqual([]);
  };

  it("is refused with «no_bank», then «no_address», before a number is taken; the drafts are still made", async () => {
    const i = await issuer();
    expect(issueBlock(i)).toBeNull();
    await query("update invoice_issuers set iban = '  ' where id = $1", [i.id]);
    // the month's draft is made as before: only issuing waits for the bank account
    const id = await draftFor("valentin");
    expect(issueBlock(await issuer())).toBe("no_bank");
    expect(await issueInvoice(biz, id, owner, ISSUE)).toEqual({ ok: false, code: "no_bank" });
    await nothingTaken(id);

    await query("update invoice_issuers set iban = 'EE000000000000000000', address = '' where id = $1", [i.id]);
    expect(issueBlock(await issuer())).toBe("no_address");
    expect(await issueInvoice(biz, id, owner, ISSUE)).toEqual({ ok: false, code: "no_address" });
    await nothingTaken(id);

    // with both, it goes, and takes the first number of the series
    await query("update invoice_issuers set address = 'Mardi 1, 10145 Tallinn' where id = $1", [i.id]);
    expect(await issueInvoice(biz, id, owner, ISSUE)).toEqual({ ok: true, number: "DEMO-2026-0001" });
  });

  it("says «no_bank» first when both are missing", () => {
    expect(issueBlock({ iban: "", address: "" })).toBe("no_bank");
    expect(issueBlock({ iban: "EE000000000000000000", address: " " })).toBe("no_address");
  });
});

/* ---------- the number a draft would get ---------- */

describe("the number on a draft (not reserved)", () => {
  it("is the one the next issue takes, the same on every draft, and moves on once one is issued", async () => {
    const i = await issuer();
    const a = await draftFor("valentin");
    const b = await draftFor("slava");
    expect(await upcomingNumber(query, i, 2026)).toBe("DEMO-2026-0001");
    // reading it takes nothing
    expect(await query("select 1 from invoice_counters")).toEqual([]);

    // b is issued first: it takes the number a was showing
    expect(await issueInvoice(biz, b, owner, ISSUE)).toEqual({ ok: true, number: "DEMO-2026-0001" });
    expect(await upcomingNumber(query, i, 2026)).toBe("DEMO-2026-0002");
    expect(await issueInvoice(biz, a, owner, ISSUE)).toEqual({ ok: true, number: "DEMO-2026-0002" });
  });

  it("goes on after Isolta's last number, as «Последний номер» sets it", async () => {
    const i = await issuer();
    expect(await setLastNumber(biz, i.id, 422, owner, 2026)).toEqual({ ok: true });
    expect(await upcomingNumber(query, i, 2026)).toBe("DEMO-2026-0423");
    expect(await issueInvoice(biz, await draftFor("valentin"), owner, ISSUE)).toEqual({ ok: true, number: "DEMO-2026-0423" });
  });
});

/* ---------- the receiver's phone ---------- */

describe("the receiver's phone (044)", () => {
  it("is kept as typed with its code, +372 added when typed without; a number that is not one is refused", async () => {
    const r = await receiverOf("valentin");
    expect(r.phone).toBe("");
    expect(await saveReceiver(biz, r.id, { ...r, phone: "+372 5123 4567" }, owner)).toEqual({ ok: true, id: r.id });
    expect((await receiverOf("valentin")).phone).toBe("+372 5123 4567");
    expect(await saveReceiver(biz, r.id, { ...r, phone: "5123 4567" }, owner)).toEqual({ ok: true, id: r.id });
    expect((await receiverOf("valentin")).phone).toBe("+37251234567");

    for (const bad of ["abc", "12", "+372 1"]) expect(await saveReceiver(biz, r.id, { ...r, phone: bad }, owner)).toEqual({ ok: false, field: "phone" });
    expect((await receiverOf("valentin")).phone).toBe("+37251234567");

    // cleared
    expect(await saveReceiver(biz, r.id, { ...r, phone: "" }, owner)).toEqual({ ok: true, id: r.id });
    expect((await receiverOf("valentin")).phone).toBe("");
  });

  it("left out of a save, stays as it is; a new receiver gets it too; the audit log never holds it", async () => {
    const r = await receiverOf("valentin");
    await saveReceiver(biz, r.id, { ...r, phone: "+372 5123 4567" }, owner);
    const { phone: _left, ...rest } = await receiverOf("valentin");
    expect(await saveReceiver(biz, r.id, { ...rest, termsDays: 10 }, owner)).toEqual({ ok: true, id: r.id });
    expect(await receiverOf("valentin")).toMatchObject({ phone: "+372 5123 4567", termsDays: 10 });

    const made = await saveReceiver(biz, null, { staffId: null, issuerId: null, kind: "person", legalName: "Näidis Klient", regCode: "", vatNumber: "", address: "", email: "klient@example.test", phone: "+372 5000 0009", vatMode: "none", termsDays: 14, locale: "et", active: true }, owner);
    if (!made.ok) throw new Error(made.field);
    expect((await listReceivers(query, biz.id)).find((x) => x.id === made.id)?.phone).toBe("+372 5000 0009");
    // a new one without a phone given has none
    const bare = await saveReceiver(biz, null, { staffId: null, issuerId: null, kind: "person", legalName: "Näidis Teine", regCode: "", vatNumber: "", address: "", email: "teine@example.test", vatMode: "none", termsDays: 14, locale: "et", active: true }, owner);
    if (!bare.ok) throw new Error(bare.field);
    expect((await listReceivers(query, biz.id)).find((x) => x.id === bare.id)?.phone).toBe("");

    const log = await query<{ after: unknown }>("select after from audit where entity = 'invoice_receiver'");
    expect(log.length).toBeGreaterThan(0);
    expect(JSON.stringify(log)).not.toMatch(/5123|5000 0009/);
  });

  it("is not printed: an issued invoice's frozen buyer has no phone", async () => {
    const r = await receiverOf("valentin");
    await saveReceiver(biz, r.id, { ...r, phone: "+372 5123 4567" }, owner);
    const id = await draftFor("valentin");
    expect(await issueInvoice(biz, id, owner, ISSUE)).toMatchObject({ ok: true });
    expect(JSON.stringify((await invoiceById(query, biz.id, id))!.buyer)).not.toContain("5123");
  });
});
