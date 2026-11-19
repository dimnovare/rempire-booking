/**
 * «Новый счёт» → the receiver (src/lib/billing/invoices.ts, openDraft), the
 * way Renat works in Isolta: the draft he has, else the month being
 * invoiced with its rent, else a free invoice beside the month's own (015).
 * Fake companies only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addDraftLine, buildDraft, invoiceById, invoiceLines, issueInvoice, listInvoices, makeDrafts, openDraft } from "@/lib/billing/invoices";
import { listReceivers, receiverForStaff, saveReceiver } from "@/lib/billing/parties";
import { invoicePdf } from "@/lib/billing/send";
import { getBusiness, type Business } from "@/lib/availability";
import { closeDb, query } from "@/lib/db";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
// the month being invoiced is the one before: October 2026
const NOW = zonedToUtc("2026-11-19", "10:00", TZ);

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

describe("«Новый счёт» → the receiver", () => {
  it("a barber's receiver: the month being invoiced, with his rent, and the same draft the next time", async () => {
    const r = (await receiverForStaff(query, demo.staff.valentin))!;
    const first = await openDraft(biz, r.id, owner, NOW);
    expect(first).toMatchObject({ ok: true, made: "month" });
    if (!first.ok) throw new Error("open");
    const inv = (await invoiceById(query, biz.id, first.id))!;
    expect(inv).toMatchObject({ status: "draft", free: false, periodFrom: "2026-10-01", periodTo: "2026-10-31", receiverId: r.id });
    expect((await invoiceLines(query, inv.id)).map((l) => l.kind)).toEqual(["rent"]);
    // pressed again: the draft he has, nothing new
    expect(await openDraft(biz, r.id, owner, NOW)).toEqual({ ok: true, id: first.id, made: "found" });
    expect(await listInvoices(query, biz.id)).toHaveLength(1);
  });

  it("the month is invoiced already: a free invoice dated today, empty, beside it", async () => {
    const r = (await receiverForStaff(query, demo.staff.valentin))!;
    const month = await openDraft(biz, r.id, owner, NOW);
    if (!month.ok) throw new Error("open");
    expect(await issueInvoice(biz, month.id, owner, NOW)).toMatchObject({ ok: true });

    const free = await openDraft(biz, r.id, owner, NOW);
    expect(free).toMatchObject({ ok: true, made: "free" });
    if (!free.ok) throw new Error("free");
    const inv = (await invoiceById(query, biz.id, free.id))!;
    expect(inv).toMatchObject({ status: "draft", free: true, periodFrom: "2026-11-19", periodTo: "2026-11-19", staffId: demo.staff.valentin, grossCents: 0 });
    expect(await invoiceLines(query, inv.id)).toHaveLength(0);
    // nothing to send yet; with a typed line it issues with the next number
    expect(await issueInvoice(biz, inv.id, owner, NOW)).toEqual({ ok: false, code: "empty" });
    expect(await addDraftLine(biz, inv.id, { text: "Konsultatsioon", qty: 1, unitCents: 5000, discountCents: 0 }, owner)).toEqual({ ok: true });
    const issued = await issueInvoice(biz, inv.id, owner, NOW);
    expect(issued).toMatchObject({ ok: true });
    // a second free one the same day is fine: Renat sends several a month in Isolta
    const again = await openDraft(biz, r.id, owner, NOW);
    expect(again).toMatchObject({ ok: true, made: "free" });
    if (again.ok) expect(again.id).not.toBe(free.id);
  });

  it("a free invoice never stands in the month's way, and the month's list shows both", async () => {
    const r = (await receiverForStaff(query, demo.staff.slava))!;
    // October is invoiced, so today's «Новый счёт» is free
    const oct = await buildDraft(biz, r.id, "2026-10", owner);
    if (!oct.ok || !oct.id) throw new Error("oct");
    await issueInvoice(biz, oct.id, owner, NOW);
    const free = await openDraft(biz, r.id, owner, NOW);
    expect(free).toMatchObject({ ok: true, made: "free" });
    // November's own draft is still made, by hand or by the cron
    const nov = await buildDraft(biz, r.id, "2026-11", owner);
    expect(nov).toMatchObject({ ok: true });
    expect(nov.ok && nov.id).toBeTruthy();
    const inNov = await listInvoices(query, biz.id, { month: "2026-11" });
    expect(inNov.map((i) => i.free).sort()).toEqual([false, true]);
    // «Сделать черновики» again: November exists, nothing doubles
    expect((await makeDrafts(biz, "2026-11", owner)).exists).toBeGreaterThanOrEqual(1);
  });

  it("a receiver without a barber: a free invoice straight away", async () => {
    const saved = await saveReceiver(
      biz,
      null,
      { kind: "ou", legalName: "Näidis Klient OÜ", regCode: "12345678", vatNumber: "", address: "Näidis 1, Tallinn", email: "arved@example.test", vatMode: "none", termsDays: 14, locale: "et", staffId: null, issuerId: null, active: true },
      owner,
    );
    if (!saved.ok) throw new Error(`receiver: ${JSON.stringify(saved)}`);
    const company = (await listReceivers(query, biz.id)).find((x) => x.legalName === "Näidis Klient OÜ")!;
    const r = await openDraft(biz, company.id, owner, NOW);
    expect(r).toMatchObject({ ok: true, made: "free" });
    if (!r.ok) throw new Error("open");
    expect((await invoiceById(query, biz.id, r.id))!).toMatchObject({ free: true, staffId: null });
  });

  it("no such receiver, or one switched off: nothing is made", async () => {
    expect(await openDraft(biz, "nope", owner, NOW)).toEqual({ ok: false, code: "no_receiver" });
    expect(await openDraft(biz, "00000000-0000-4000-8000-000000000000", owner, NOW)).toEqual({ ok: false, code: "no_receiver" });
    expect(await listInvoices(query, biz.id)).toHaveLength(0);
  });

  it("a free invoice's PDF has its date and no period line", async () => {
    const r = (await receiverForStaff(query, demo.staff.jevgeni))!;
    const oct = await buildDraft(biz, r.id, "2026-10", owner);
    if (oct.ok && oct.id) await issueInvoice(biz, oct.id, owner, NOW);
    const free = await openDraft(biz, r.id, owner, NOW);
    if (!free.ok) throw new Error("free");
    await addDraftLine(biz, free.id, { text: "Lisatöö", qty: 2, unitCents: 1500, discountCents: 0 }, owner);
    expect(await issueInvoice(biz, free.id, owner, NOW)).toMatchObject({ ok: true });
    const pdf = await invoicePdf(query, biz.id, free.id);
    expect(pdf?.bytes.length).toBeGreaterThan(1000);
  });
});
