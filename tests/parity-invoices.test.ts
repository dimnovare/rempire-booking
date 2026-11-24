/**
 * «Счета» against Isolta (docs/parity-check.md): what was built and no test
 * walked through yet. «Отправить снова»; no e-mail, no number; what the
 * PDF prints, read back as text; the barber's own PDF in his app
 * (/b/money/pdf/<id>); Isolta's plain series continued at the switch; and
 * «Открыт.» from Resend's webhook in the receiver's journal.
 *
 * Fake companies only, on the demo seed. Nothing is really sent: the
 * outbox runs with the console transport. Every date is fixed: October 2026
 * is invoiced on 1 November.
 */
import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// the barber app's route reads the session cookie: Next's request plumbing is stood in for, as in rights-doors.test.ts
const jar = vi.hoisted(() => ({ cookies: {} as Record<string, string> }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.cookies[name] ? { name, value: jar.cookies[name] } : undefined),
    set: (name: string, value: string) => void (jar.cookies[name] = value),
    delete: (name: string) => void delete jar.cookies[name],
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/server", () => ({ connection: async () => {}, after: () => {} }));

import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream } from "pdf-lib";
import { POST as resendWebhook } from "@/app/api/webhooks/resend/route";
import { GET as barberPdf } from "@/app/b/(app)/money/pdf/[id]/route";
import { getBusiness, type Business } from "@/lib/availability";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { createSession } from "@/lib/auth/sessions";
import { invoiceEvents, receiverEvents } from "@/lib/billing/events";
import { addDraftLine, buildDraft, discardDraft, invoiceById, issueInvoice, resendInvoice, setDraftNote } from "@/lib/billing/invoices";
import { listIssuers, receiverForStaff, saveIssuer, saveReceiver, setLastNumber, type IssuerInput, type Receiver } from "@/lib/billing/parties";
import { draftPdf, invoicePdf } from "@/lib/billing/send";
import { closeDb, query } from "@/lib/db";
import { sentToConsole } from "@/lib/email";
import { amountText } from "@/lib/money";
import { runOutbox } from "@/lib/outbox";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const OCT = "2026-10";
/** «Выставить» for October, on the 1st of November */
const ISSUE = at("2026-11-01", "10:00");
const DEV = { NODE_ENV: "development", VITEST: "true", ALLOW_INDEXING: "yes" } as Record<string, string>;
/** the demo receivers' address: Resend's test inbox (tools/seed-demo.mjs) */
const DEMO_MAIL = "delivered@resend.dev";

let demo: Demo;
let biz: Business;
let owner: string;

beforeEach(async () => {
  demo = await freshDemo();
  biz = (await getBusiness(query, "rempire"))!;
  const [u] = await query<{ id: string }>("insert into users (business_id, email, role) values ($1, 'owner@example.test', 'owner') returning id", [demo.business.id]);
  owner = u.id;
  jar.cookies = {};
  sentToConsole.length = 0;
});
afterAll(closeDb);

const receiverOf = async (staff: string): Promise<Receiver> => (await receiverForStaff(query, demo.staff[staff]))!;

/** The month's draft for a barber: his rent (and nothing else: no sales in these tests). */
async function draftFor(staff: string, month = OCT): Promise<string> {
  const d = await buildDraft(biz, (await receiverOf(staff)).id, month, owner);
  if (!d.ok || !d.id) throw new Error(`no draft for ${staff}`);
  return d.id;
}

async function issued(staff: string, now = ISSUE): Promise<{ id: string; number: string }> {
  const id = await draftFor(staff);
  const r = await issueInvoice(biz, id, owner, now);
  if (!r.ok) throw new Error(`issue ${staff}: ${r.code}`);
  return { id, number: r.number };
}

/** The invoice's letters in the outbox, oldest first. */
const letters = (invoiceId: string) =>
  query<{ recipient: string; status: string }>("select recipient, status from notifications where kind = 'invoice' and payload->>'invoiceId' = $1 order by created_at, id", [invoiceId]);

/** The outbox's run: the letters were queued on the database's own clock. */
const runMail = (ms = 1000) => runOutbox(query, Date.now() + ms, DEV);

/* ---------- the PDF as text ---------- */

const latin1 = (b: Uint8Array) => Buffer.from(b).toString("latin1");
/** a glyph with no letter in its font's map: «�», so a test sees it */
const UNKNOWN = String.fromCharCode(0xfffd);
/** A stream as loaded back from the bytes: still encoded (pdf-lib deflates them) */
const decoded = (s: PDFStream) => {
  if (!(s instanceof PDFRawStream)) throw new Error("not a loaded stream");
  return latin1(decodePDFRawStream(s).decode());
};

/**
 * Every string a PDF shows, in the order it was drawn. pdf-lib writes each
 * piece of text as one «<glyph ids> Tj» in a font of its own subset; the
 * font's ToUnicode map turns the ids back into letters.
 */
async function pdfText(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const out: string[] = [];
  for (const page of doc.getPages()) {
    const fonts = new Map<string, Map<string, string>>();
    const dict = page.node.Resources()?.lookup(PDFName.of("Font"), PDFDict);
    for (const [name, ref] of dict?.entries() ?? []) {
      const cmap = new Map<string, string>();
      const toUnicode = doc.context.lookup(ref, PDFDict).lookup(PDFName.of("ToUnicode"), PDFStream);
      for (const block of decoded(toUnicode).matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
        for (const [, code, uni] of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
          cmap.set(code.toLowerCase(), String.fromCharCode(...(uni.match(/.{4}/g) ?? []).map((h) => parseInt(h, 16))));
        }
      }
      fonts.set(name.asString(), cmap);
    }
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r, PDFStream)) : contents ? [contents] : [];
    let font = new Map<string, string>();
    for (const s of streams) {
      for (const m of decoded(s).matchAll(/(\/[^\s/[\]<>(){}%]+)\s+[-\d.]+\s+Tf|<([0-9a-fA-F]*)>\s*Tj/g)) {
        if (m[1]) font = fonts.get(m[1]) ?? new Map();
        else {
          const t = (m[2].match(/.{4}/g) ?? []).map((h) => font.get(h.toLowerCase()) ?? UNKNOWN).join("");
          if (t.trim()) out.push(t);
        }
      }
    }
  }
  return out;
}

/** The PDF's text as one line, the pieces in drawing order. */
const textOf = async (bytes: Uint8Array) => (await pdfText(bytes)).join(" ").replace(/\s+/g, " ");

/* ---------- 1 ---------- */

describe("«Отправить снова»", () => {
  it("sends an issued invoice again: a second letter with the same PDF to the receiver's e-mail as it is now, and «resend» names it", async () => {
    const inv = await issued("valentin");
    await runMail();
    expect(await letters(inv.id)).toEqual([{ recipient: DEMO_MAIL, status: "sent" }]);
    sentToConsole.length = 0;

    // he has a new address since (Isolta's send window takes «Получатель» from the contact card)
    const NEW_MAIL = "valentin.new@example.test";
    const recv = await receiverOf("valentin");
    expect(await saveReceiver(biz, recv.id, { ...recv, email: NEW_MAIL }, owner)).toMatchObject({ ok: true });

    expect(await resendInvoice(biz, inv.id, owner)).toBe(true);
    expect(await letters(inv.id)).toEqual([
      { recipient: DEMO_MAIL, status: "sent" },
      { recipient: NEW_MAIL, status: "queued" },
    ]);
    // the invoice is as it was issued: its buyer keeps the address printed on it
    expect((await invoiceById(query, biz.id, inv.id))!.buyer).toMatchObject({ email: DEMO_MAIL });

    await runMail(2000);
    const again = sentToConsole.filter((l) => l.subject.startsWith("Arve"));
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ to: NEW_MAIL, subject: `Arve ${inv.number} · REMPIRE` });
    expect(again[0].attachments).toHaveLength(1);
    const pdf = again[0].attachments![0];
    expect(pdf).toMatchObject({ filename: `rempire-arve-${inv.number}.pdf`, contentType: "application/pdf" });
    // the same invoice as the first letter's: its number, its buyer
    expect((await PDFDocument.load(pdf.content as Uint8Array)).getTitle()).toBe(`ARVE / Invoice ${inv.number}`);
    const printed = await textOf(pdf.content as Uint8Array);
    expect(printed).toContain(`OSTJA / BUYER ${recv.legalName}`);
    expect(printed).toContain(DEMO_MAIL);
    expect(printed).not.toContain(NEW_MAIL);
    expect((await letters(inv.id)).map((l) => l.status)).toEqual(["sent", "sent"]);

    const events = await invoiceEvents(query, biz.id, inv.id);
    expect(events.map((e) => e.kind).sort()).toEqual(["issued", "resend", "sent", "sent"]);
    expect(events.filter((e) => e.kind === "sent").map((e) => e.email).sort()).toEqual([DEMO_MAIL, NEW_MAIL].sort());
    // «Счёт … отправляется ещё раз на …»: the address it went to, read from the letter, not copied into the audit log
    expect(events.find((e) => e.kind === "resend")).toMatchObject({ invoiceId: inv.id, number: inv.number, email: NEW_MAIL });
    const [audit] = await query<{ after: Record<string, unknown> }>("select after from audit where entity = 'invoice' and action = 'resend'");
    expect(JSON.stringify(audit.after)).not.toContain("@");
  });

  it("with no address on the receiver any more, sends again to the one the invoice was issued to", async () => {
    const inv = await issued("slava");
    await query("update invoice_receivers set email = '' where id = $1", [(await receiverOf("slava")).id]);
    expect(await resendInvoice(biz, inv.id, owner)).toBe(true);
    expect((await letters(inv.id)).map((l) => l.recipient)).toEqual([DEMO_MAIL, DEMO_MAIL]);
  });

  it("cannot send a draft or a discarded one: nothing is queued and nothing is logged", async () => {
    const draft = await draftFor("slava");
    expect(await resendInvoice(biz, draft, owner)).toBe(false);
    expect(await letters(draft)).toEqual([]);
    expect(await invoiceById(query, biz.id, draft)).toMatchObject({ status: "draft", number: null });

    const gone = await draftFor("milena");
    expect(await discardDraft(biz, gone, owner)).toBe(true);
    expect(await resendInvoice(biz, gone, owner)).toBe(false);
    expect(await letters(gone)).toEqual([]);

    expect(await query("select 1 from audit where entity = 'invoice' and action = 'resend'")).toEqual([]);
    expect(await invoiceEvents(query, biz.id, draft)).toEqual([]);
  });
});

/* ---------- 2 ---------- */

describe("issuing to a receiver with no e-mail", () => {
  it("is refused with «no_email» and uses up no number: the next issue takes the number that was next", async () => {
    const recv = await receiverOf("valentin");
    const id = await draftFor("valentin");
    // his card never saves without one; an Isolta import can leave a receiver with none
    expect(await saveReceiver(biz, recv.id, { ...recv, email: "" }, owner)).toEqual({ ok: false, field: "email" });
    await query("update invoice_receivers set email = '' where id = $1", [recv.id]);

    expect(await issueInvoice(biz, id, owner, ISSUE)).toEqual({ ok: false, code: "no_email" });
    expect(await invoiceById(query, biz.id, id)).toMatchObject({ status: "draft", number: null, issuedOn: null, dueOn: null, seller: null, buyer: null });
    expect(await query("select 1 from invoice_counters")).toEqual([]);
    expect((await listIssuers(query, biz.id, 2026))[0].lastNumber).toBe(0);
    expect(await letters(id)).toEqual([]);
    expect(await query("select 1 from audit where entity = 'invoice' and action = 'issue'")).toEqual([]);

    // another barber's invoice takes the first number of the series
    expect(await issueInvoice(biz, await draftFor("slava"), owner, ISSUE)).toEqual({ ok: true, number: "DEMO-2026-0001" });
    // with an address again, his takes the next one, and the letter goes there
    expect(await saveReceiver(biz, recv.id, { ...recv, email: "valentin.fie@example.test" }, owner)).toMatchObject({ ok: true });
    expect(await issueInvoice(biz, id, owner, ISSUE)).toEqual({ ok: true, number: "DEMO-2026-0002" });
    expect(await letters(id)).toEqual([{ recipient: "valentin.fie@example.test", status: "queued" }]);
    expect((await listIssuers(query, biz.id, 2026))[0].lastNumber).toBe(2);
  });
});

/* ---------- 3 ---------- */

describe("what the invoice's PDF prints", () => {
  it("both registry codes, the seller's IBAN and bank, the dates, the lines and totals, and «no VAT» for a receiver without VAT", async () => {
    const recv = await receiverOf("valentin");
    expect(await saveReceiver(biz, recv.id, { ...recv, vatMode: "none" }, owner)).toMatchObject({ ok: true });
    const id = await draftFor("valentin");
    expect(await addDraftLine(biz, id, { text: "Kapp / Locker", qty: 2, unitCents: 1500, discountCents: 500 }, owner)).toEqual({ ok: true });
    expect(await issueInvoice(biz, id, owner, ISSUE)).toEqual({ ok: true, number: "DEMO-2026-0001" });
    expect(await invoiceById(query, biz.id, id)).toMatchObject({ grossCents: 42500, netCents: 42500, vatCents: 0 });

    const pdf = (await invoicePdf(query, biz.id, id))!;
    const text = await textOf(pdf.bytes);
    // every glyph read back to a letter
    expect(text).not.toContain(UNKNOWN);
    // the number, the date, 7 days to pay, the month billed
    expect(text).toContain("DEMO-2026-0001 Arve nr / Invoice no 01.11.2026 Kuupäev / Date 08.11.2026 Maksetähtaeg / Due date 01.10.2026–31.10.2026 Periood / Period");
    // the seller (the demo issuer, as frozen at «Выставить») and the buyer, each with its registry code
    expect(text).toContain("MÜÜJA / SELLER Näidis Salong OÜ Mardi 1, 10145 Tallinn Registrikood / Reg. code: 00000001 KMKR nr / VAT no: EE000000001 arved@example.test");
    expect(text).toContain(`OSTJA / BUYER Näidis FIE (Valentin) Tallinn Registrikood / Reg. code: 00000002 ${DEMO_MAIL}`);
    // the buyer has no VAT number: the seller's is the only one printed
    expect(text.match(/KMKR nr/g)).toHaveLength(1);
    // the lines: description, qty, unit price, discount, net, VAT %, total
    expect(text).toContain("Töökoha üür 10.2026 / Chair rent 1 400,00 400,00 0 400,00");
    expect(text).toContain("Kapp / Locker 2 15,00 -5,00 25,00 0 25,00");
    // the totals, with «no VAT» where a VAT receiver's rate would be
    expect(text).toContain("425,00 € Summa ilma käibemaksuta / Subtotal excl. VAT 0,00 € Käibemaksuta / No VAT 425,00 € Kokku tasuda / Total due (EUR)");
    expect(text).not.toContain("Käibemaks 24");
    // how to pay: to the seller's IBAN at its bank, with the 7-3-1 reference from the number's digits (20260001 → 202600017) and the number
    expect(text).toContain(
      "MAKSMINE / PAYMENT Saaja / Beneficiary Näidis Salong OÜ IBAN EE000000000000000000 Viitenumber / Reference no 202600017 Pank / Bank Demo Pank Selgitus / Payment details Arve nr DEMO-2026-0001 Summa / Amount 425,00 € Maksetähtaeg / Due date 08.11.2026",
    );
    // the same text each time it is printed
    expect(await textOf((await invoicePdf(query, biz.id, id))!.bytes)).toBe(text);
  });

  it("not the note: it is for the staff only (Isolta's «не будет видна на инвойсе»), neither on the preview nor once issued", async () => {
    const NOTE = "Ainult meile: helista reedel";
    const id = await draftFor("valentin");
    expect(await setDraftNote(biz, id, NOTE, owner)).toBe(true);
    expect(await textOf((await draftPdf(query, biz, id, ISSUE))!.bytes)).not.toContain("reedel");
    expect(await issueInvoice(biz, id, owner, ISSUE)).toMatchObject({ ok: true });
    // kept on the invoice, for the page
    expect((await invoiceById(query, biz.id, id))!.note).toBe(NOTE);
    const text = await textOf((await invoicePdf(query, biz.id, id))!.bytes);
    expect(text).not.toContain("reedel");
    expect(text).not.toContain("Ainult meile");
  });

  it("for a receiver with VAT: his KMKR number, each line at 24 % and the VAT on its own row", async () => {
    const id = await draftFor("jevgeni");
    expect(await issueInvoice(biz, id, owner, ISSUE)).toEqual({ ok: true, number: "DEMO-2026-0001" });
    const inv = (await invoiceById(query, biz.id, id))!;
    expect(inv.grossCents).toBe(40000);
    expect(inv.vatCents).toBeGreaterThan(0);
    const text = await textOf((await invoicePdf(query, biz.id, id))!.bytes);
    expect(text).toContain("OSTJA / BUYER Näidis Juuksur OÜ (Jevgeni) Tallinn Registrikood / Reg. code: 00000003 KMKR nr / VAT no: EE000000003");
    expect(text).toContain(`Töökoha üür 10.2026 / Chair rent 1 400,00 ${amountText(inv.netCents)} 24 400,00`);
    expect(text).toContain(`${amountText(inv.netCents)} € Summa ilma käibemaksuta / Subtotal excl. VAT ${amountText(inv.vatCents)} € Käibemaks 24 % / VAT 24 % 400,00 € Kokku tasuda / Total due (EUR)`);
    expect(text).not.toContain("Käibemaksuta");
  });

  it("the draft's preview: the parties as they are now, today's date and due date, no number, and the draft's stamp", async () => {
    const id = await draftFor("valentin");
    const text = await textOf((await draftPdf(query, biz, id, ISSUE))!.bytes);
    expect(text).toContain("mustand / draft Arve nr / Invoice no 01.11.2026 Kuupäev / Date 08.11.2026 Maksetähtaeg / Due date");
    expect(text).toContain("MÜÜJA / SELLER Näidis Salong OÜ Mardi 1, 10145 Tallinn Registrikood / Reg. code: 00000001");
    expect(text).toContain("OSTJA / BUYER Näidis FIE (Valentin) Tallinn Registrikood / Reg. code: 00000002");
    expect(text).toContain("IBAN EE000000000000000000 Pank / Bank Demo Pank");
    expect(text).toContain("ЧЕРНОВИК / MUSTAND");
    // no number yet, so nothing for the payer to quote: no reference either
    expect(text).not.toContain("DEMO-");
    expect(text).not.toContain("Selgitus");
    expect(text).not.toContain("Viitenumber");
  });
});

/* ---------- 4 ---------- */

describe("the barber's own invoice PDF in his app", () => {
  const get = (id: string) => barberPdf(new Request(`http://localhost/b/money/pdf/${id}`), { params: Promise.resolve({ id }) });

  async function loginAs(staff: string) {
    const [u] = await query<{ id: string }>("insert into users (business_id, email, name, role, staff_id) values ($1, $2, $3, 'staff', $4) returning id", [
      demo.business.id,
      `${staff}.parity@example.test`,
      staff,
      demo.staff[staff],
    ]);
    jar.cookies = { [SESSION_COOKIE]: await createSession(query, u.id) };
  }

  it("opens his own issued invoice; another barber's, his own draft and no such invoice answer «not found»", async () => {
    const mine = await issued("valentin");
    const theirs = await issued("slava");
    // September's rent, not issued yet
    const draft = await draftFor("valentin", "2026-09");
    await loginAs("valentin");

    const res = await get(mine.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(`inline; filename="rempire-arve-${mine.number}.pdf"`);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const text = await textOf(new Uint8Array(await res.arrayBuffer()));
    expect(text).toContain(`${mine.number} Arve nr / Invoice no`);
    expect(text).toContain("OSTJA / BUYER Näidis FIE (Valentin)");

    for (const id of [theirs.id, draft, "00000000-0000-4000-8000-000000000000", "not-an-id"]) {
      const r = await get(id);
      expect(r.status).toBe(404);
      expect(r.headers.get("content-type")).not.toBe("application/pdf");
      expect(await r.text()).toBe("Not found");
    }

    // and the other way round
    await loginAs("slava");
    expect((await get(theirs.id)).status).toBe(200);
    expect((await get(mine.id)).status).toBe(404);
  });

  it("sends someone with no session to the barber app's login", async () => {
    const mine = await issued("valentin");
    await expect(get(mine.id)).rejects.toThrow("REDIRECT /b/login");
  });
});

/* ---------- 5 ---------- */

describe("Isolta's series, continued at the switch", () => {
  // Isolta's numbers are plain: 1 … 422
  const PLAIN: IssuerInput = {
    legalName: "Näidis Arved OÜ",
    regCode: "00000006",
    vatNumber: "EE000000006",
    vatBp: 2400,
    address: "Mardi 1, 10145 Tallinn",
    email: "arved@example.test",
    phone: "",
    iban: "EE000000000000000006",
    bankName: "Demo Pank",
    prefix: "",
    digits: 0,
    yearly: false,
    note: "",
    isDefault: true,
    active: true,
  };

  it("a plain series set to 422 issues «423», then «424», never goes back, and does not start again in a new year", async () => {
    const saved = await saveIssuer(biz, null, PLAIN, owner);
    if (!saved.ok) throw new Error(`issuer: ${saved.field}`);
    expect(await setLastNumber(biz, saved.id, 422, owner, 2026)).toEqual({ ok: true });
    const plain = async () => (await listIssuers(query, biz.id, 2026)).find((i) => i.id === saved.id)!;
    expect(await plain()).toMatchObject({ isDefault: true, prefix: "", digits: 0, yearly: false, lastNumber: 422 });

    const first = await issued("valentin");
    expect(first.number).toBe("423");
    expect(await invoiceById(query, biz.id, first.id)).toMatchObject({ issuerId: saved.id, seller: { name: "Näidis Arved OÜ", regCode: "00000006" } });
    expect((await invoicePdf(query, biz.id, first.id))!.filename).toBe("rempire-arve-423.pdf");
    expect((await issued("slava")).number).toBe("424");

    // a number handed out is never handed out again: the last number only goes up
    expect(await setLastNumber(biz, saved.id, 423, owner, 2026)).toEqual({ ok: false, field: "lastNumber" });
    expect(await setLastNumber(biz, saved.id, 1, owner, 2026)).toEqual({ ok: false, field: "lastNumber" });
    expect((await plain()).lastNumber).toBe(424);
    expect((await issued("jevgeni")).number).toBe("425");
    // no year in the series: January goes on from December's
    expect((await issued("milena", at("2027-01-04", "10:00"))).number).toBe("426");
    expect((await listIssuers(query, biz.id, 2027)).find((i) => i.id === saved.id)!.lastNumber).toBe(426);
  });
});

/* ---------- 6 ---------- */

// a made-up endpoint secret, as Resend shows one: «whsec_» + base64
const SECRET = "whsec_" + Buffer.from("fake-secret-for-parity-tests-01").toString("base64");

/** Resend's (Svix) signature headers for a body, signed now: the webhook refuses one older than five minutes. */
function signed(body: string): Record<string, string> {
  const id = "msg_parity_1";
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from(SECRET.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` };
}

describe("«Открыт.»: Resend reports the invoice letter opened", () => {
  it("the opening shows in the receiver's journal and in the invoice's events", async () => {
    const inv = await issued("valentin");
    await runMail();
    // sent through Resend, the letter keeps Resend's id; the console transport sent this one, so it is set here
    await query("update notifications set provider = 'resend', provider_ref = 're_parity_open' where kind = 'invoice' and payload->>'invoiceId' = $1", [inv.id]);

    const openedAt = new Date(Date.now() + 5000).toISOString();
    const body = JSON.stringify({ type: "email.opened", created_at: openedAt, data: { email_id: "re_parity_open", to: [DEMO_MAIL] } });
    const before = process.env.RESEND_WEBHOOK_SECRET;
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    try {
      const res = await resendWebhook(new Request("http://localhost/api/webhooks/resend", { method: "POST", body, headers: signed(body) }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, used: true });
    } finally {
      if (before === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
      else process.env.RESEND_WEBHOOK_SECRET = before;
    }

    const recv = await receiverOf("valentin");
    const journal = await receiverEvents(query, biz.id, recv.id);
    expect(journal.map((e) => e.kind).sort()).toEqual(["issued", "opened", "sent"]);
    const opened = journal.find((e) => e.kind === "opened")!;
    expect(opened).toMatchObject({ at: openedAt, invoiceId: inv.id, number: inv.number, email: DEMO_MAIL, receiver: recv.legalName, credit: false });

    const events = await invoiceEvents(query, biz.id, inv.id);
    expect(events.map((e) => e.kind).sort()).toEqual(["issued", "opened", "sent"]);
    expect(events.find((e) => e.kind === "opened")).toEqual(opened);
    // the newest first: the opening comes after the letter
    expect(events[0].kind).toBe("opened");

    // another barber's journal has nothing of it
    expect(await receiverEvents(query, biz.id, (await receiverOf("slava")).id)).toEqual([]);
  });
});
