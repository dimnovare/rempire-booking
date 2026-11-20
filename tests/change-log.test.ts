/**
 * «Изменения данных» (decision 29; src/lib/admin/change-log.ts): the audit
 * log as a page. The owner's alone; every author and object named; before →
 * after field by field; phones and e-mails masked without the client base's
 * contacts; the filters and the pages. Fake people only.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { changeQuestion, cleanChanges, defaultChanges } from "@/lib/admin/change-filter";
import { authorOf, changeAuthors, changeFields, changesMay, listChanges } from "@/lib/admin/change-log";
import { maskEmail, maskPhone, type Holder } from "@/lib/auth/rights";
import { legacyHolder } from "@/lib/auth/rights-store";
import { closeDb, query } from "@/lib/db";
import { freshDemo, type Demo } from "./helpers";

afterAll(closeDb);

const PHONE = "+37255500123";
const EMAIL = "anna@example.test";
let demo: Demo;
let me: string;
let anna: string;
let visit: { id: string; at: number };
let valentin: string;

beforeEach(async () => {
  demo = await freshDemo();
  await query("delete from audit");
  [{ id: me }] = await query<{ id: string }>("insert into users (business_id, email, name, role) values ($1, 'owner-log@example.test', 'Владелец Тест', 'owner') returning id", [demo.business.id]);
  [{ id: anna }] = await query<{ id: string }>("insert into clients (business_id, name, phone_e164, email) values ($1, 'Анна Тест', $2, $3) returning id", [demo.business.id, PHONE, EMAIL]);
  const [v] = await query<{ id: string }>(
    `insert into appointments (business_id, location_id, staff_id, client_id, starts_at, ends_at, blocked_until, source)
     select $1, s.location_id, s.id, $2, $3::timestamptz, $3::timestamptz + interval '30 minutes', $3::timestamptz + interval '30 minutes', 'admin'
       from staff s where s.id = $4 returning id`,
    [demo.business.id, anna, "2026-11-11T08:00:00Z", demo.staff.valentin],
  );
  visit = { id: v.id, at: Date.parse("2026-11-11T08:00:00Z") };
  valentin = (await query<{ display_name: string }>("select display_name from staff where id = $1", [demo.staff.valentin]))[0].display_name;
});

/** One audit row, as the app writes them. */
async function add(o: { actor?: string; entity: string; id?: string | null; action?: string; before?: unknown; after?: unknown; at?: string }): Promise<string> {
  const [row] = await query<{ id: string }>(
    "insert into audit (at, actor, entity, entity_id, action, before, after) values ($1::timestamptz, $2, $3, $4, $5, $6::jsonb, $7::jsonb) returning id::text as id",
    [o.at ?? "2026-11-10T10:00:00Z", o.actor ?? me, o.entity, o.id ?? null, o.action ?? "update", o.before === undefined ? null : JSON.stringify(o.before), o.after === undefined ? null : JSON.stringify(o.after)],
  );
  return row.id;
}

const all = (over: Record<string, unknown> = {}) => cleanChanges({ ...defaultChanges("2026-11-20"), from: "2025-01-01", to: "2026-12-31", ...over });
const list = (over: Record<string, unknown> = {}, who: Holder | null = owner(), locale: "ru" | "et" | "en" = "ru") => listChanges(query, demo.business, all(over), who, locale);

const owner = (): Holder & { id: string } => legacyHolder("owner", "owner-login");
const desk = (): Holder & { id: string } => legacyHolder("admin", "desk-login");
const barber = (): Holder & { id: string } => legacyHolder("staff", "barber-login", demo.staff.valentin);
function without(h: Holder & { id: string }, off: string[]): Holder & { id: string } {
  return { ...h, rights: { ...h.rights, on: new Set([...h.rights.on].filter((k) => !off.includes(k))) } };
}
const NO_STAFF = new Map<string, string>();

describe("the question", () => {
  it("is copied by name and checked", () => {
    const id = randomUUID().toUpperCase();
    expect(cleanChanges({ from: "2026-11-20", to: "2026-11-01", author: id, entity: "client", page: 2, size: 50 })).toEqual({
      from: "2026-11-01",
      to: "2026-11-20",
      author: id.toLowerCase(),
      entity: "client",
      page: 2,
      size: 50,
    });
    expect(cleanChanges({ author: "client" }).author).toBe("client");
    expect(cleanChanges({ author: "system" }).author).toBe("system");
    expect(cleanChanges({ author: "admin' or 1=1", entity: "audit", page: 0, size: 9 })).toMatchObject({ author: null, entity: null, page: 1, size: 25 });
    expect(defaultChanges("2026-11-20")).toMatchObject({ from: "2026-10-20", to: "2026-11-20", author: "", entity: "" });
    expect(Object.keys(changeQuestion({ from: "x", ...({ who: "y" } as object) })).sort()).toEqual(["author", "entity", "from", "page", "size", "to"]);
  });
});

describe("the authors", () => {
  it("a login by its name; the words the app writes by what they mean", () => {
    expect(authorOf(me, "Владелец Тест", "owner-log@example.test")).toEqual({ kind: "login", name: "Владелец Тест" });
    expect(authorOf(me, null, "desk@example.test")).toEqual({ kind: "login", name: "desk" });
    expect(authorOf(randomUUID(), null, null)).toEqual({ kind: "gone", name: null });
    expect(authorOf("client", null, null)).toEqual({ kind: "client", name: null });
    expect(authorOf("admin", null, null)).toEqual({ kind: "salon", name: null });
    expect(authorOf("barber", null, null)).toEqual({ kind: "barber", name: null });
    expect(authorOf("isolta-import", null, null)).toEqual({ kind: "import", name: null });
    expect(authorOf("cron", null, null)).toEqual({ kind: "system", name: null });
  });

  it("the filter's list: every login of the salon, by name", async () => {
    const authors = await changeAuthors(query, demo.business.id);
    expect(authors).toContainEqual({ id: me, name: "Владелец Тест" });
  });
});

describe("before → after", () => {
  it("field by field, each value as the page shows it", () => {
    const f = changeFields(
      { status: "booked", staff_id: demo.staff.valentin, starts_at: "2026-11-21T08:00:00.000Z", total_cents: 2500, online: true, note: "" },
      { status: "cancelled", staff_id: demo.staff.valentin, starts_at: "2026-11-21T09:00:00.000Z", total_cents: 3000, online: false, services: ["a", "b"] },
      new Map([[demo.staff.valentin, "Валентин"]]),
      true,
    );
    expect(f).toEqual([
      { key: "status", before: { t: "text", v: "booked" }, after: { t: "text", v: "cancelled" } },
      { key: "staff_id", before: { t: "text", v: "Валентин" }, after: { t: "text", v: "Валентин" } },
      { key: "starts_at", before: { t: "time", v: Date.parse("2026-11-21T08:00:00Z") }, after: { t: "time", v: Date.parse("2026-11-21T09:00:00Z") } },
      { key: "total_cents", before: { t: "money", v: 2500 }, after: { t: "money", v: 3000 } },
      { key: "online", before: { t: "bool", v: true }, after: { t: "bool", v: false } },
      { key: "note", before: { t: "none" }, after: null },
      { key: "services", before: null, after: { t: "list", v: ["a", "b"] } },
    ]);
    // a row with no before (made) or no after (deleted)
    expect(changeFields(null, { name: "X" }, NO_STAFF, true)).toEqual([{ key: "name", before: null, after: { t: "text", v: "X" } }]);
    expect(changeFields({ name: "X" }, null, NO_STAFF, true)).toEqual([{ key: "name", before: { t: "text", v: "X" }, after: null }]);
    expect(changeFields(null, null, NO_STAFF, true)).toEqual([]);
  });

  it("phones and e-mails masked without the contacts, wherever they are; ids left alone", () => {
    const id = randomUUID();
    const before = { phone: PHONE, email: EMAIL, note: `звонить ${PHONE} или ${EMAIL}`, client_id: id };
    const masked = changeFields(before, null, NO_STAFF, false);
    expect(masked.map((x) => x.before)).toEqual([
      { t: "text", v: maskPhone(PHONE) },
      { t: "text", v: maskEmail(EMAIL) },
      { t: "text", v: `звонить ${maskPhone(PHONE)} или ${maskEmail(EMAIL)}` },
      { t: "text", v: id },
    ]);
    expect(JSON.stringify(masked)).not.toContain(PHONE);
    expect(JSON.stringify(masked)).not.toContain(EMAIL);
    // a phone typed with spaces, or as bare digits
    expect(changeFields({ note: "+372 5550 0123" }, null, NO_STAFF, false)[0].before).toEqual({ t: "text", v: maskPhone(PHONE) });
    expect(JSON.stringify(changeFields({ note: "55500123" }, null, NO_STAFF, false))).not.toContain("55500123");
    const whole = changeFields(before, null, NO_STAFF, true);
    expect(whole.map((x) => x.before)).toEqual([
      { t: "text", v: PHONE },
      { t: "text", v: EMAIL },
      { t: "text", v: before.note },
      { t: "text", v: id },
    ]);
  });

  it("a long text is cut", () => {
    const [x] = changeFields({ note: "а".repeat(400) }, null, NO_STAFF, true);
    expect(x.before).toMatchObject({ t: "text" });
    expect((x.before as { v: string }).v).toHaveLength(160);
  });
});

describe("the log", () => {
  it("the owner's alone: the front desk and a barber get nothing", async () => {
    await add({ entity: "client", id: anna });
    expect((await list({}, owner())).total).toBe(1);
    expect(await list({}, desk())).toMatchObject({ total: 0, rows: [] });
    expect(await list({}, barber())).toMatchObject({ total: 0, rows: [] });
    expect(changesMay(owner())).toEqual({ open: true, contacts: true });
    expect(changesMay(desk())).toEqual({ open: false, contacts: false });
    expect(changesMay(barber()).open).toBe(false);
    expect(changesMay(null).open).toBe(false);
  });

  it("newest first, each author named", async () => {
    const byMe = await add({ entity: "client", id: anna, at: "2026-11-10T10:00:00Z" });
    const byClient = await add({ actor: "client", entity: "appointment", id: visit.id, action: "cancel", at: "2026-11-10T11:00:00Z" });
    const byApp = await add({ actor: "cron", entity: "invoice", action: "create", at: "2026-11-10T12:00:00Z" });
    const byGone = await add({ actor: randomUUID(), entity: "client", id: anna, at: "2026-11-10T13:00:00Z" });
    const r = await list();
    expect(r.rows.map((x) => x.id)).toEqual([byGone, byApp, byClient, byMe]);
    expect(r.rows.map((x) => x.author)).toEqual([
      { kind: "gone", name: null },
      { kind: "system", name: null },
      { kind: "client", name: null },
      { kind: "login", name: "Владелец Тест" },
    ]);
    expect(r.rows.find((x) => x.id === byClient)).toMatchObject({ action: "cancel", entity: "appointment", entityId: visit.id });
  });

  it("each object by what names it: a visit's time and barber, a client's name, an invoice's number", async () => {
    const [issuer] = await query<{ id: string }>("insert into invoice_issuers (business_id, legal_name) values ($1, 'Näidis Salong OÜ') returning id", [demo.business.id]);
    // the demo's receiver for Valentin (one per barber)
    const [receiver] = await query<{ id: string }>("select id from invoice_receivers where business_id = $1 and staff_id = $2", [demo.business.id, demo.staff.valentin]);
    const [inv] = await query<{ id: string }>(
      "insert into invoices (business_id, issuer_id, receiver_id, staff_id, status, number, period_from, period_to) values ($1, $2, $3, $4, 'issued', 'T-2026-0099', '2026-10-01', '2026-10-31') returning id",
      [demo.business.id, issuer.id, receiver.id, demo.staff.valentin],
    );
    const [svc] = await query<{ ru: string; en: string }>("select name->>'ru' as ru, name->>'en' as en from services where id = $1", [demo.services.clip]);
    const ids = {
      visit: await add({ entity: "appointment", id: visit.id, at: "2026-11-10T10:00:00Z" }),
      client: await add({ entity: "client", id: anna, at: "2026-11-10T10:01:00Z" }),
      invoice: await add({ entity: "invoice", id: inv.id, at: "2026-11-10T10:02:00Z" }),
      service: await add({ entity: "service", id: demo.services.clip, at: "2026-11-10T10:03:00Z" }),
      staff: await add({ entity: "staff", id: demo.staff.valentin, at: "2026-11-10T10:04:00Z" }),
      user: await add({ entity: "user", id: me, at: "2026-11-10T10:05:00Z" }),
      // a block deleted since: its barber from the row itself
      gone: await add({ entity: "time_off", id: randomUUID(), action: "delete", before: { staff_id: demo.staff.valentin, kind: "block" }, at: "2026-11-10T10:06:00Z" }),
      nothing: await add({ entity: "client", id: randomUUID(), action: "delete", at: "2026-11-10T10:07:00Z" }),
    };
    const by = new Map((await list()).rows.map((x) => [x.id, x.object]));
    expect(by.get(ids.visit)).toEqual({ name: valentin, at: visit.at, number: null });
    expect(by.get(ids.client)).toEqual({ name: "Анна Тест", at: null, number: null });
    expect(by.get(ids.invoice)).toEqual({ name: valentin, at: null, number: "T-2026-0099" });
    expect(by.get(ids.service)!.name).toBe(svc.ru);
    expect(by.get(ids.staff)!.name).toBe(valentin);
    expect(by.get(ids.user)!.name).toBe("Владелец Тест");
    expect(by.get(ids.gone)!.name).toBe(valentin);
    expect(by.get(ids.nothing)).toEqual({ name: null, at: null, number: null });
    // a service in the reader's language
    const en = new Map((await list({}, owner(), "en")).rows.map((x) => [x.id, x.object]));
    expect(en.get(ids.service)!.name).toBe(svc.en);
  });

  it("the barber's id in a field is his name; the contacts masked without «clients.list_contacts»", async () => {
    await add({ entity: "client", id: anna, before: { phone_e164: PHONE, email: EMAIL, staff_id: demo.staff.valentin }, after: { phone_e164: "+37255500999", email: null } });
    // (a jsonb column keeps its keys shortest first)
    const whole = (await list()).rows[0];
    expect(whole.fields).toEqual([
      { key: "email", before: { t: "text", v: EMAIL }, after: { t: "none" } },
      { key: "staff_id", before: { t: "text", v: valentin }, after: null },
      { key: "phone_e164", before: { t: "text", v: PHONE }, after: { t: "text", v: "+37255500999" } },
    ]);
    const blind = await list({}, without(owner(), ["clients.list_contacts"]));
    expect(blind.rows[0].fields.map((x) => x.before)).toEqual([
      { t: "text", v: maskEmail(EMAIL) },
      { t: "text", v: valentin },
      { t: "text", v: maskPhone(PHONE) },
    ]);
    const json = JSON.stringify(blind);
    expect(json).not.toContain(PHONE);
    expect(json).not.toContain(EMAIL);
    expect(json).not.toContain("+37255500999");
  });

  it("a client named by his phone is masked like one", async () => {
    const [walkIn] = await query<{ id: string }>("insert into clients (business_id, name, phone_e164) values ($1, $2, '+37255500777') returning id", [demo.business.id, "+37255500777"]);
    await add({ entity: "client", id: walkIn.id });
    expect((await list()).rows[0].object.name).toBe("+37255500777");
    expect((await list({}, without(owner(), ["clients.list_contacts"]))).rows[0].object.name).toBe(maskPhone("+37255500777"));
  });
});

describe("the filters and the pages", () => {
  it("by author: a login, the client, the app", async () => {
    const other = randomUUID();
    await add({ entity: "client", id: anna, at: "2026-11-10T10:00:00Z" });
    await add({ actor: "client", entity: "appointment", id: visit.id, at: "2026-11-10T11:00:00Z" });
    await add({ actor: "cron", entity: "invoice", at: "2026-11-10T12:00:00Z" });
    await add({ actor: "admin", entity: "appointment", id: visit.id, at: "2026-11-10T13:00:00Z" });
    await add({ actor: other, entity: "client", id: anna, at: "2026-11-10T14:00:00Z" });
    expect((await list({ author: me })).rows.map((x) => x.author.name)).toEqual(["Владелец Тест"]);
    expect((await list({ author: "client" })).rows.map((x) => x.author.kind)).toEqual(["client"]);
    // the app: neither the client nor a login
    expect((await list({ author: "system" })).rows.map((x) => x.author.kind)).toEqual(["salon", "system"]);
    expect((await list({ author: other })).rows.map((x) => x.author.kind)).toEqual(["gone"]);
    expect((await list({ author: "nobody" })).total).toBe(5);
  });

  it("by object type and by the salon's days", async () => {
    // 00:30 on 10.11 in Tallinn is still 9.11 in UTC
    const late = await add({ entity: "client", id: anna, at: "2026-11-09T22:30:00Z" });
    await add({ entity: "appointment", id: visit.id, at: "2026-11-11T10:00:00Z" });
    await add({ entity: "service", id: demo.services.clip, at: "2026-11-11T11:00:00Z" });
    expect((await list({ entity: "appointment" })).rows.map((x) => x.entity)).toEqual(["appointment"]);
    expect((await list({ entity: "invoice" })).total).toBe(0);
    expect((await list({ from: "2026-11-10", to: "2026-11-10" })).rows.map((x) => x.id)).toEqual([late]);
    expect((await list({ from: "2026-11-01", to: "2026-11-09" })).total).toBe(0);
    expect((await list({ from: "2026-11-11", to: "2026-11-11", entity: "service" })).total).toBe(1);
  });

  it("pages of the size asked; a page past the end is the last one", async () => {
    for (let i = 0; i < 30; i++) await add({ entity: "client", id: anna, after: { n: i }, at: new Date(Date.parse("2026-11-10T08:00:00Z") + i * 60_000).toISOString() });
    const one = await list({ size: 25 });
    expect(one).toMatchObject({ total: 30, page: 1, pages: 2 });
    expect(one.rows).toHaveLength(25);
    expect(one.rows[0].fields[0].after).toEqual({ t: "text", v: "29" });
    const two = await list({ size: 25, page: 2 });
    expect(two.rows.map((x) => (x.fields[0].after as { v: string }).v)).toEqual(["4", "3", "2", "1", "0"]);
    expect(await list({ size: 25, page: 99 })).toMatchObject({ page: 2, pages: 2 });
    expect(await list({ entity: "review" })).toMatchObject({ total: 0, pages: 0, rows: [] });
  });
});
