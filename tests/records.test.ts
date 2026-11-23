/**
 * «Записи» (src/lib/admin/records.ts, record-filter.ts): every visit in one
 * list. Each filter on its own and two together; who made a visit; what a
 * login without the rights sees; the file «Выгрузить в Excel» gives; and
 * «Отменить выбранные» with what it refuses and why. Fake people only; the
 * file never leaves memory.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addMonths, cleanRecords, defaultRecords, type RecordQuery } from "@/lib/admin/record-filter";
import { cancelRecords, exportRecords, listRecords, recordsMay, visitForSheet, type RecordWords } from "@/lib/admin/records";
import { saveClient } from "@/lib/admin/clients";
import { adminCancelVisit, adminCreateVisit, adminSetStatus } from "@/lib/admin/visits";
import { can, type Holder } from "@/lib/auth/rights";
import { groupKey } from "@/lib/auth/rights-catalogue";
import { legacyHolder } from "@/lib/auth/rights-store";
import { closeDb, query } from "@/lib/db";
import { addDays, zonedToUtc } from "@/lib/tz";
import { readXlsx, serialToLocal } from "@/lib/xlsx";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const NOW = at("2026-11-19", "12:00");
const WORDS: RecordWords = {
  sheet: "Записи",
  cols: { staff: "Сотрудник", services: "Услуги", client: "Клиент", phone: "Телефон", visit: "Время визита", by: "Создал", created: "Создана", status: "Статус визита", source: "Источник", total: "Сумма, €" },
  status: { booked: "Записан", arrived: "Пришёл", done: "Готово", no_show: "Не пришёл", pending: "Ждёт", cancelled: "Отменён" },
  source: { online: "Онлайн-запись", admin: "Салон", import: "Импорт" },
  byClient: "Клиент",
  bySalon: "Салон",
  byImport: "Импорт",
  pick: (n) => n?.ru ?? "",
};

type Who = Holder & { id: string };
let demo: Demo;
let owner: Who;
let desk: Who;
/** the visits of the fixture, by a short name */
let v: Record<"anna" | "boris" | "online" | "old" | "gone" | "imported", string>;
let anna: string;

async function login(role: "owner" | "admin", name: string): Promise<Who> {
  const [u] = await query<{ id: string }>("insert into users (business_id, email, name, role) values ($1, $2, $3, $4) returning id", [demo.business.id, `${name.toLowerCase()}@example.test`, name, role]);
  return legacyHolder(role, u.id);
}

async function client(name: string, phone: string): Promise<string> {
  const r = await saveClient(demo.business, null, { name, phone }, "test-admin");
  if (!r.ok) throw new Error(`client not added: ${r.field}`);
  return r.id;
}

let n = 0;
async function visit(staff: string, clientId: string, date: string, time: string, services: string[], actor: string, created: string) {
  const r = await adminCreateVisit(
    demo.business,
    { staffId: demo.staff[staff], start: at(date, time), serviceIds: services.map((s) => demo.services[s]), clientId, idempotencyKey: `records-${++n}-${Math.random()}`, force: true },
    actor,
  );
  if (!r.ok) throw new Error(`booking failed: ${r.code}`);
  await query("update appointments set created_at = $2 where id = $1", [r.id, new Date(at(created, "09:30"))]);
  return r.id;
}

/** A login as it is, with some rights switched off or on. */
const without = (who: Who, ...keys: string[]): Who => ({ ...who, rights: { ...who.rights, on: new Set([...who.rights.on].filter((k) => !keys.includes(k))) } });
const scoped = (who: Who, values: Record<string, unknown>): Who => ({ ...who, rights: { ...who.rights, values: { ...who.rights.values, ...values } as Who["rights"]["values"] } });

/** The whole list for a question: every visit of the fixture is within these days unless the question says other. */
const ALL: RecordQuery = { visitFrom: "2026-01-01", visitTo: "2027-12-31" };
const ids = async (q: RecordQuery, who: Who = owner) => (await listRecords(query, demo.business, { ...ALL, ...q }, who, NOW)).rows.map((r) => r.id);
const sorted = (list: string[]) => [...list].sort();

beforeEach(async () => {
  demo = await freshDemo();
  owner = await login("owner", "Owner");
  desk = await login("admin", "Desk");
  anna = await client("Анна Образец", "+372 5555 0101");
  const boris = await client("Boris Näidis", "+372 5555 0102");
  const carl = await client("Carl Sample", "+372 5555 0103");
  v = {
    // Renat, tomorrow, made by the owner
    anna: await visit("renat", anna, "2026-11-20", "10:00", ["clip"], owner.id, "2026-11-10"),
    // Jevgeni, in two days, two services, made by the front desk; the client has come
    boris: await visit("jevgeni", boris, "2026-11-21", "11:00", ["clip", "beard"], desk.id, "2026-11-15"),
    // booked online by the client himself
    online: await visit("renat", carl, "2026-11-25", "12:00", ["long"], "client", "2026-11-18"),
    // a visit of last summer: outside the page's first period
    old: await visit("jevgeni", anna, "2026-07-01", "15:00", ["buzz"], owner.id, "2026-06-20"),
    // cancelled
    gone: await visit("renat", boris, "2026-11-22", "16:00", ["grey"], owner.id, "2026-11-12"),
    // came with the import: no login made it
    imported: await visit("valentin", carl, "2026-11-24", "13:00", ["kid"], "import", "2026-11-01"),
  };
  await adminSetStatus(demo.business, v.boris, "arrived", owner.id);
  await query("update appointments set source = 'online' where id = $1", [v.online]);
  await query("update appointments set source = 'import' where id = $1", [v.imported]);
  expect(await adminCancelVisit(demo.business, v.gone, owner.id)).toBe("cancelled");
});
afterAll(closeDb);

describe("the question", () => {
  it("a new page asks for the last month to one month ahead, everything else open", () => {
    expect(defaultRecords("2026-11-19")).toMatchObject({ visitFrom: "2026-10-19", visitTo: "2026-12-19", createdFrom: "", createdTo: "", cancelled: "all", page: 1, size: 25 });
    // the 31st of a month that has none is its last day
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-12-31", 2)).toBe("2027-02-28");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("is read by name: what is not one of the choices is nothing chosen, two days go the right way round", () => {
    const f = cleanRecords({ createdFrom: "2026-11-20", createdTo: "2026-11-10", visitFrom: "nope", staffId: "x", by: "'; drop table", cancelled: "maybe", status: "cancelled", source: "fax", size: 7, page: -2, serviceIds: ["1", demo.services.clip, demo.services.clip], q: "  Анна  " });
    expect(f).toEqual({ createdFrom: "2026-11-10", createdTo: "2026-11-20", visitFrom: null, visitTo: null, staffId: null, by: null, cancelled: "all", status: null, q: "Анна", serviceIds: [demo.services.clip], source: null, page: 1, size: 25 });
    expect(cleanRecords(null)).toMatchObject({ cancelled: "all", page: 1, size: 25, serviceIds: [] });
    expect(cleanRecords({ size: 100, page: 3, by: "client", status: "waiting", source: "import", cancelled: "yes" })).toMatchObject({ size: 100, page: 3, by: "client", status: "waiting", source: "import", cancelled: "yes" });
  });
});

describe("the list", () => {
  it("has every visit, the newest first, with the barber, the services, the client, who made it and when", async () => {
    const list = await listRecords(query, demo.business, ALL, owner, NOW);
    expect(list).toMatchObject({ total: 6, page: 1, pages: 1, size: 25 });
    expect(list.rows.map((r) => r.id)).toEqual([v.online, v.imported, v.gone, v.boris, v.anna, v.old]);
    const boris = list.rows.find((r) => r.id === v.boris)!;
    expect(boris).toMatchObject({ staffName: "Jevgeni", clientName: "Boris Näidis", clientPhone: "+37255550102", status: "arrived", source: "admin", start: at("2026-11-21", "11:00"), createdAt: at("2026-11-15", "09:30"), by: { kind: "user", name: "Desk" } });
    expect(boris.services.map((s) => s.ru)).toHaveLength(2);
    expect(boris.staffRole.ru).toBe("Барбер");
    // who made it: the client himself, a login, nobody we know of
    expect(list.rows.find((r) => r.id === v.online)!.by).toEqual({ kind: "client", name: "" });
    expect(list.rows.find((r) => r.id === v.anna)!.by).toEqual({ kind: "user", name: "Owner" });
    expect(list.rows.find((r) => r.id === v.imported)!.by).toEqual({ kind: "import", name: "" });
    expect(list.rows.find((r) => r.id === v.gone)!.status).toBe("cancelled");
  });

  it("the page's own first question leaves out a visit of last summer", async () => {
    const list = await listRecords(query, demo.business, defaultRecords("2026-11-19"), owner, NOW);
    expect(list.total).toBe(5);
    expect(list.rows.some((r) => r.id === v.old)).toBe(false);
  });

  it("created between two days", async () => {
    expect(sorted(await ids({ createdFrom: "2026-11-12", createdTo: "2026-11-15" }))).toEqual(sorted([v.gone, v.boris]));
    // either end alone; a day is the salon's whole day
    expect(sorted(await ids({ createdFrom: "2026-11-18" }))).toEqual([v.online]);
    expect(sorted(await ids({ createdTo: "2026-06-20" }))).toEqual([v.old]);
  });

  it("the visit between two days", async () => {
    expect(sorted(await ids({ visitFrom: "2026-11-21", visitTo: "2026-11-24" }))).toEqual(sorted([v.boris, v.gone, v.imported]));
    expect(await ids({ visitFrom: "2026-11-25", visitTo: "2026-11-25" })).toEqual([v.online]);
  });

  it("one barber", async () => {
    expect(sorted(await ids({ staffId: demo.staff.jevgeni }))).toEqual(sorted([v.boris, v.old]));
    expect(await ids({ staffId: demo.staff.milena })).toEqual([]);
  });

  it("who made it: the client online, or a login", async () => {
    expect(await ids({ by: "client" })).toEqual([v.online]);
    expect(await ids({ by: desk.id })).toEqual([v.boris]);
    expect(sorted(await ids({ by: owner.id }))).toEqual(sorted([v.anna, v.old, v.gone]));
  });

  it("cancelled, not cancelled, or both", async () => {
    expect(await ids({ cancelled: "yes" })).toEqual([v.gone]);
    expect((await ids({ cancelled: "no" })).includes(v.gone)).toBe(false);
    expect(await ids({ cancelled: "no" })).toHaveLength(5);
    expect(await ids({ cancelled: "all" })).toHaveLength(6);
  });

  it("the visit's status", async () => {
    expect(await ids({ status: "arrived" })).toEqual([v.boris]);
    // «waiting» is everything still ahead of the chair
    expect(sorted(await ids({ status: "waiting" }))).toEqual(sorted([v.anna, v.online, v.old, v.imported]));
    expect(await ids({ status: "no_show" })).toEqual([]);
    await adminSetStatus(demo.business, v.anna, "no_show", owner.id);
    expect(await ids({ status: "no_show" })).toEqual([v.anna]);
  });

  it("«Клиент подтвердил»: a waiting visit the client confirmed, and it is no longer «waiting»", async () => {
    expect(await ids({ status: "confirmed" })).toEqual([]);
    expect(await adminSetStatus(demo.business, v.online, "booked", owner.id, {}, true)).toBe(true);
    expect(await ids({ status: "confirmed" })).toEqual([v.online]);
    expect(sorted(await ids({ status: "waiting" }))).toEqual(sorted([v.anna, v.old, v.imported]));
    // he came: neither confirmed nor waiting
    expect(await adminSetStatus(demo.business, v.online, "arrived", owner.id)).toBe(true);
    expect(await ids({ status: "confirmed" })).toEqual([]);
    expect(sorted(await ids({ status: "arrived" }))).toEqual(sorted([v.boris, v.online]));
    expect(cleanRecords({ status: "confirmed" }).status).toBe("confirmed");
  });

  it("the client, by a part of his name or by his phone's digits", async () => {
    expect(sorted(await ids({ q: "анна" }))).toEqual(sorted([v.anna, v.old]));
    expect(sorted(await ids({ q: "5555 0102" }))).toEqual(sorted([v.boris, v.gone]));
    expect(await ids({ q: "%" })).toEqual([]);
    expect(await ids({ q: "nobody" })).toEqual([]);
  });

  it("services: a visit with any one of them", async () => {
    expect(await ids({ serviceIds: [demo.services.beard] })).toEqual([v.boris]);
    expect(sorted(await ids({ serviceIds: [demo.services.beard, demo.services.long] }))).toEqual(sorted([v.boris, v.online]));
    expect(sorted(await ids({ serviceIds: [demo.services.clip] }))).toEqual(sorted([v.anna, v.boris]));
  });

  it("where it came from", async () => {
    expect(await ids({ source: "online" })).toEqual([v.online]);
    expect(await ids({ source: "import" })).toEqual([v.imported]);
    expect(sorted(await ids({ source: "admin" }))).toEqual(sorted([v.anna, v.boris, v.old, v.gone]));
  });

  it("two filters together leave only what both do", async () => {
    expect(await ids({ staffId: demo.staff.renat, cancelled: "no", source: "admin" })).toEqual([v.anna]);
    expect(await ids({ by: owner.id, visitFrom: "2026-11-01", visitTo: "2026-11-30", status: "waiting" })).toEqual([v.anna]);
    expect(await ids({ q: "boris", serviceIds: [demo.services.grey], cancelled: "yes" })).toEqual([v.gone]);
    expect(await ids({ staffId: demo.staff.jevgeni, source: "online" })).toEqual([]);
  });

  it("pages: 25, 50 or 100 a page; a page past the end is the last one", async () => {
    const page = (q: RecordQuery) => listRecords(query, demo.business, { ...ALL, ...q }, owner, NOW);
    expect(await page({ size: 50 })).toMatchObject({ size: 50, pages: 1, total: 6 });
    expect(await page({ size: 10 })).toMatchObject({ size: 25 });
    // 30 more visits of one client, a day apart, so there is a second page
    for (let i = 0; i < 30; i++) await visit("slava", anna, addDays("2027-02-01", i), "10:00", ["beard"], owner.id, "2026-11-19");
    const first = await page({ staffId: demo.staff.slava });
    expect(first.total).toBe(30);
    expect(first.rows).toHaveLength(25);
    // the newest visit first
    expect(first.rows[0].start).toBe(at("2027-03-02", "10:00"));
    const last = await page({ staffId: demo.staff.slava, page: 99 });
    expect(last.page).toBe(2);
    expect(last.rows).toHaveLength(5);
  });
});

describe("what a login may see", () => {
  it("nothing without «Просматривать список записей», and nothing with its group off", async () => {
    expect((await listRecords(query, demo.business, ALL, without(owner, "reports.bookings"), NOW)).total).toBe(0);
    expect((await listRecords(query, demo.business, ALL, without(owner, groupKey("reports")), NOW)).total).toBe(0);
    expect(recordsMay(without(owner, groupKey("reports")))).toMatchObject({ open: false, export: false, phones: false });
    // the front desk has the page and its file, as the roles' list gives them
    expect(recordsMay(desk)).toEqual({ open: true, export: true, phones: true, cancel: true });
    // a barber's login has none of it
    expect(recordsMay(legacyHolder("staff", "x", demo.staff.valentin))).toMatchObject({ open: false, export: false });
  });

  it("phones are masked without «Показывать номера телефонов в записях», and digits then find nobody", async () => {
    const blind = without(owner, "reports.bookings.phones");
    const list = await listRecords(query, demo.business, ALL, blind, NOW);
    expect(list.rows.find((r) => r.id === v.anna)!.clientPhone).toBe("+3725•••••01");
    expect(list.rows.every((r) => !r.clientPhone || r.clientPhone.includes("•"))).toBe(true);
    expect(await ids({ q: "5555 0102" }, blind)).toEqual([]);
    expect(sorted(await ids({ q: "boris" }, blind))).toEqual(sorted([v.boris, v.gone]));
  });

  it("only the barbers the login sees in the journal, and nothing before its history limit", async () => {
    const one = scoped(owner, { "journal.staff": [demo.staff.jevgeni] });
    expect(sorted(await ids({}, one))).toEqual(sorted([v.boris, v.old]));
    expect(await ids({}, scoped(owner, { "journal.staff": [] }))).toEqual([]);
    // no past days: 19.11 is today
    const recent = scoped(owner, { "journal.history": 0 });
    expect((await ids({}, recent)).includes(v.old)).toBe(false);
    expect(await ids({}, recent)).toHaveLength(5);
  });

  it("a filter that names a barber the login does not see leaves nothing, and says nothing of him", async () => {
    const one = scoped(owner, { "journal.staff": [demo.staff.jevgeni] });
    // Renat has three visits here; to this login the answer is the same as for a barber who does not exist
    const hidden = await listRecords(query, demo.business, { ...ALL, staffId: demo.staff.renat }, one, NOW);
    const nobody = await listRecords(query, demo.business, { ...ALL, staffId: "00000000-0000-4000-8000-000000000000" }, one, NOW);
    expect(hidden).toEqual({ rows: [], total: 0, page: 1, pages: 1, size: 25 });
    expect(nobody).toEqual(hidden);
    // and no other filter brings his visits back
    expect(await ids({ q: "Carl" }, one)).toEqual([]);
    expect(await ids({ by: "client" }, one)).toEqual([]);
    expect(await ids({ serviceIds: [demo.services.long, demo.services.grey] }, one)).toEqual([]);
    // the same login with «all» gets them
    expect(await ids({ staffId: demo.staff.renat }, scoped(owner, { "journal.staff": "all" }))).toHaveLength(3);
  });

  it("only the clients the login is shown, as the client base has it", async () => {
    // Anna and Boris have come to Jevgeni; Carl only to Renat and Valentin
    const some = scoped(owner, { "clients.show": [demo.staff.jevgeni] });
    expect(sorted(await ids({}, some))).toEqual(sorted([v.anna, v.old, v.boris, v.gone]));
    expect((await listRecords(query, demo.business, ALL, some, NOW)).total).toBe(4);
    expect(await ids({ q: "Carl" }, some)).toEqual([]);
    // shown nobody's clients (or the client base's group off): no visit at all
    expect(await ids({}, scoped(owner, { "clients.show": [] }))).toEqual([]);
    expect(await ids({}, without(owner, groupKey("clients")))).toEqual([]);
    expect(await ids({}, scoped(owner, { "clients.show": "all" }))).toHaveLength(6);
  });

  it("the file and «Отменить выбранные» are cut the same way: another barber's visit is not in the file and is «not found» to cancel", async () => {
    const one = scoped(owner, { "journal.staff": [demo.staff.jevgeni] });
    const file = await exportRecords(demo.business, one, ALL, WORDS, NOW);
    if (!file.ok) throw new Error(file.code);
    expect(file.rows).toBe(2);
    const sheet = readXlsx(file.bytes);
    expect(sheet.rows.slice(1).map((r) => r[0])).toEqual(["Jevgeni", "Jevgeni"]);
    expect(JSON.stringify(sheet.rows)).not.toContain("Renat");
    expect(JSON.stringify(sheet.rows)).not.toContain("Carl");
    // even when the question names him
    expect(await exportRecords(demo.business, one, { ...ALL, staffId: demo.staff.renat }, WORDS, NOW)).toMatchObject({ ok: true, rows: 0 });
    // a client the login is not shown: his visit is not there to cancel, nor one before its history limit
    const some = scoped(owner, { "clients.show": [demo.staff.jevgeni] });
    expect(await cancelRecords(demo.business, some, [v.online, v.anna], NOW)).toEqual({ ok: true, cancelled: 1, refused: { already: 0, forbidden: 0, notFound: 1 } });
    const recent = scoped(owner, { "journal.history": 0 });
    expect(await cancelRecords(demo.business, recent, [v.old], NOW)).toEqual({ ok: true, cancelled: 0, refused: { already: 0, forbidden: 0, notFound: 1 } });
    const left = await query<{ id: string }>("select id from appointments where id = any($1::uuid[]) and status <> 'cancelled'", [[v.online, v.old]]);
    expect(left).toHaveLength(2);
    // and the pencil does not open it
    expect(await visitForSheet(demo.business, some, v.online, NOW)).toBeNull();
    expect(await visitForSheet(demo.business, recent, v.old, NOW)).toBeNull();
    expect(await visitForSheet(demo.business, some, v.anna, NOW)).not.toBeNull();
  });

  it("the pencil: a visit comes as the calendar's sheet wants it, a cancelled one too; not one in a column the login does not see", async () => {
    const got = await visitForSheet(demo.business, owner, v.boris, NOW);
    expect(got!.data.visits).toHaveLength(1);
    expect(got!.data.visits[0]).toMatchObject({ id: v.boris, staffId: demo.staff.jevgeni, clientName: "Boris Näidis", clientPhone: "+37255550102", status: "arrived" });
    expect(got!.data.visits[0].services).toHaveLength(2);
    expect(got!.data.staff.some((s) => s.id === demo.staff.jevgeni)).toBe(true);
    expect(got!.data.services.find((s) => s.id === demo.services.beard)!.offers[demo.staff.jevgeni]).toBeTruthy();
    expect(got!.may.cancel).toBe(true);
    expect((await visitForSheet(demo.business, owner, v.gone, NOW))!.data.visits[0].status).toBe("cancelled");
    // the calendar's own rules cut it: its phone, its column
    expect((await visitForSheet(demo.business, without(owner, "journal.phones"), v.boris, NOW))!.data.visits[0].clientPhone).toBe("+3725•••••02");
    expect(await visitForSheet(demo.business, scoped(owner, { "journal.staff": [demo.staff.renat] }), v.boris, NOW)).toBeNull();
    expect(await visitForSheet(demo.business, without(owner, "reports.bookings"), v.boris, NOW)).toBeNull();
    expect(await visitForSheet(demo.business, owner, "nope", NOW)).toBeNull();
  });
});

describe("«Выгрузить в Excel»", () => {
  it("is the filtered list: its head, and a row as the list has it", async () => {
    const r = await exportRecords(demo.business, owner, { ...ALL, staffId: demo.staff.jevgeni }, WORDS, NOW);
    if (!r.ok) throw new Error(r.code);
    expect(r.rows).toBe(2);
    const sheet = readXlsx(r.bytes);
    expect(sheet.name).toBe("Записи");
    expect(sheet.rows[0]).toEqual(["Сотрудник", "Услуги", "Клиент", "Телефон", "Время визита", "Создал", "Создана", "Статус визита", "Источник", "Сумма, €"]);
    expect(sheet.rows).toHaveLength(3);
    const row = sheet.rows[1];
    expect(row[0]).toBe("Jevgeni");
    // its services in their order, joined by «;»
    expect(String(row[1]).split("; ")).toHaveLength(2);
    expect(row[2]).toBe("Boris Näidis");
    expect(row[3]).toBe("+37255550102");
    expect(serialToLocal(row[4] as number)).toEqual({ date: "2026-11-21", time: "11:00" });
    expect(row[5]).toBe("Desk");
    expect(serialToLocal(row[6] as number)).toEqual({ date: "2026-11-15", time: "09:30" });
    expect(row[7]).toBe("Пришёл");
    expect(row[8]).toBe("Салон");
    expect(typeof row[9]).toBe("number");
    // who made the other one, and its status, in words
    expect(sheet.rows[2][5]).toBe("Owner");
    expect(sheet.rows[2][7]).toBe("Записан");
  });

  it("only with «Выгружать список записей в Excel»; every export is in the audit, without a row of it", async () => {
    expect(await exportRecords(demo.business, without(owner, "reports.bookings.export"), ALL, WORDS, NOW)).toEqual({ ok: false, code: "forbidden" });
    expect(await exportRecords(demo.business, without(owner, "reports.bookings"), ALL, WORDS, NOW)).toEqual({ ok: false, code: "forbidden" });
    expect(await query("select 1 from audit where action = 'export'")).toHaveLength(0);
    const r = await exportRecords(demo.business, owner, ALL, WORDS, NOW);
    expect(r).toMatchObject({ ok: true, rows: 6 });
    const log = await query<{ actor: string; entity: string; after: { rows: number; columns: string[] } }>("select actor, entity, after from audit where action = 'export'");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor: owner.id, entity: "appointment", after: { rows: 6 } });
    expect(JSON.stringify(log[0].after)).not.toContain("Boris");
    expect(JSON.stringify(log[0].after)).not.toContain("5555");
  });

  it("a login that sees phones masked gets a file with no phone column", async () => {
    const r = await exportRecords(demo.business, without(owner, "reports.bookings.phones"), ALL, WORDS, NOW);
    if (!r.ok) throw new Error(r.code);
    expect(r.columns).not.toContain("phone");
    const sheet = readXlsx(r.bytes);
    expect(sheet.rows[0]).not.toContain("Телефон");
    expect(JSON.stringify(sheet.rows)).not.toContain("5555");
    expect(JSON.stringify(sheet.rows)).not.toContain("•");
  });
});

describe("«Отменить выбранные»", () => {
  const statusOf = async (id: string) => (await query<{ status: string }>("select status from appointments where id = $1", [id]))[0].status;

  it("cancels each as the calendar does, and says what it refused and why", async () => {
    const r = await cancelRecords(demo.business, owner, [v.anna, v.online, v.gone, "00000000-0000-4000-8000-000000000000", "nope"]);
    expect(r).toEqual({ ok: true, cancelled: 2, refused: { already: 1, forbidden: 0, notFound: 2 } });
    expect(await statusOf(v.anna)).toBe("cancelled");
    expect(await statusOf(v.online)).toBe("cancelled");
    // the calendar's own audit row, by the login that asked
    const log = await query<{ actor: string }>("select actor from audit where entity = 'appointment' and action = 'cancel' and entity_id = $1", [v.anna]);
    expect(log).toEqual([{ actor: owner.id }]);
    expect(await query("select 1 from appointments where id = $1 and cancelled_by = $2", [v.anna, owner.id])).toHaveLength(1);
  });

  it("a visit the client has come to needs its own right; without the right to cancel nothing goes", async () => {
    // «Удаление записей со статусом Клиент пришел» off: Boris has come, Anna has not
    const some = without(owner, "visit.delete.arrived");
    expect(await cancelRecords(demo.business, some, [v.boris, v.anna])).toEqual({ ok: true, cancelled: 1, refused: { already: 0, forbidden: 1, notFound: 0 } });
    expect(await statusOf(v.boris)).toBe("arrived");
    const none = without(owner, "visit.delete");
    expect(can(none, "visit.delete")).toBe(false);
    expect(await cancelRecords(demo.business, none, [v.online, v.imported])).toEqual({ ok: true, cancelled: 0, refused: { already: 0, forbidden: 2, notFound: 0 } });
    expect(await statusOf(v.online)).toBe("booked");
  });

  it("a visit in a column the login does not see is not found; the page's own right is asked first; a list that is none is refused", async () => {
    const one = scoped(owner, { "journal.staff": [demo.staff.renat] });
    expect(await cancelRecords(demo.business, one, [v.boris, v.anna])).toEqual({ ok: true, cancelled: 1, refused: { already: 0, forbidden: 0, notFound: 1 } });
    expect(await statusOf(v.boris)).toBe("arrived");
    expect(await cancelRecords(demo.business, without(owner, "reports.bookings"), [v.online])).toEqual({ ok: false, code: "forbidden" });
    expect(await cancelRecords(demo.business, owner, [])).toEqual({ ok: false, code: "invalid" });
    expect(await cancelRecords(demo.business, owner, "all")).toEqual({ ok: false, code: "invalid" });
    expect(await cancelRecords(demo.business, owner, Array.from({ length: 101 }, (_, i) => `id-${i}`))).toEqual({ ok: false, code: "invalid" });
    expect(await statusOf(v.online)).toBe("booked");
  });

  it("a visit still ahead gets the client's «cancelled» letter queued, as from the calendar", async () => {
    // a letter goes only where a confirmation went: give Anna's visit one
    await query(
      `insert into notifications (business_id, appointment_id, kind, channel, recipient, locale, status)
       values ($1, $2, 'confirmation', 'email', 'anna@example.test', 'ru', 'sent')`,
      [demo.business.id, v.anna],
    );
    const before = await query("select 1 from notifications where appointment_id = $1 and kind = 'cancelled'", [v.anna]);
    expect(before).toHaveLength(0);
    // far ahead: two days out lands on another demo visit at some hours of the day
    await query("update appointments set starts_at = now() + interval '400 days', ends_at = now() + interval '400 days 1 hour', blocked_until = now() + interval '400 days 1 hour' where id = $1", [v.anna]);
    expect(await cancelRecords(demo.business, owner, [v.anna])).toMatchObject({ ok: true, cancelled: 1 });
    expect(await query("select 1 from notifications where appointment_id = $1 and kind = 'cancelled'", [v.anna])).toHaveLength(1);
  });
});
