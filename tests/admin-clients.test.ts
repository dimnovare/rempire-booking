/**
 * «Клиенты» in the admin (src/lib/admin/clients.ts): the list with its
 * search, category filter, paging and numbers; one client with his visits;
 * adding and changing a client. Fake people only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clientDetail, clientLabels, LABEL_MAX, LABELS_MAX, listClients, NOTE_MAX, PAGE_SIZE, saveClient, type ClientInput } from "@/lib/admin/clients";
import { adminCancelVisit, adminCreateVisit, adminSetStatus } from "@/lib/admin/visits";
import { closeDb, query } from "@/lib/db";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const NOW = at("2026-11-30", "12:00");
const ACTOR = "test-admin";

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});
afterAll(closeDb);

async function add(input: ClientInput): Promise<string> {
  const r = await saveClient(demo.business, null, input, ACTOR);
  if (!r.ok) throw new Error(`client not added: ${r.field}`);
  return r.id;
}

let n = 0;
/** A visit of this client; `force` books it whatever the hours, as the admin may. */
async function visit(clientId: string, staff: string, date: string, time: string, service = "clip") {
  const r = await adminCreateVisit(
    demo.business,
    { staffId: demo.staff[staff], start: at(date, time), serviceIds: [demo.services[service]], clientId, idempotencyKey: `admin-clients-${++n}-${Math.random()}`, force: true },
    ACTOR,
  );
  if (!r.ok) throw new Error(`booking failed: ${r.code}`);
  return r;
}

const names = async (filter: Parameters<typeof listClients>[2]) => (await listClients(query, demo.business.id, filter, NOW)).rows.map((r) => r.name);

describe("the list: search", () => {
  beforeEach(async () => {
    await add({ name: "Anna Näidis", phone: "+372 5555 0101", email: "anna@example.test" });
    await add({ name: "Борис Пример", phone: "+372 5555 0102", email: "boris.primer@example.test" });
    await add({ name: "Carl Sample", phone: "+372 5555 0199" });
    await add({ name: "Walk-in Dan" });
    await add({ name: "100% Eve", email: "eve_x@example.test" });
  });

  it("by a part of the name, whatever the capitals, Cyrillic too", async () => {
    expect(await names({ q: "näid" })).toEqual(["Anna Näidis"]);
    expect(await names({ q: "  ПРИМ " })).toEqual(["Борис Пример"]);
    expect(await names({ q: "an" })).toEqual(["Anna Näidis", "Walk-in Dan"]);
    expect(await names({ q: "nobody" })).toEqual([]);
    // nothing typed: everybody, by name
    expect(await names({})).toHaveLength(5);
    expect(await names({ q: "   " })).toHaveLength(5);
  });

  it("by phone digits, typed any way", async () => {
    expect(await names({ q: "0102" })).toEqual(["Борис Пример"]);
    expect(await names({ q: "5555 01" })).toEqual(["Anna Näidis", "Carl Sample", "Борис Пример"]);
    expect(await names({ q: "+372 5555 0199" })).toEqual(["Carl Sample"]);
    expect(await names({ q: "00372 5555 0101" })).toEqual(["Anna Näidis"]);
    expect(await names({ q: "(5555) 01-99" })).toEqual(["Carl Sample"]);
    expect(await names({ q: "5555 0777" })).toEqual([]);
  });

  it("by e-mail", async () => {
    expect(await names({ q: "boris.primer@" })).toEqual(["Борис Пример"]);
    expect(await names({ q: "ANNA@EXAMPLE" })).toEqual(["Anna Näidis"]);
    expect(await names({ q: "example.test" })).toEqual(["100% Eve", "Anna Näidis", "Борис Пример"]);
  });

  it("% and _ are what was typed, not «anything»", async () => {
    expect(await names({ q: "100%" })).toEqual(["100% Eve"]);
    expect(await names({ q: "eve_x" })).toEqual(["100% Eve"]);
    expect(await names({ q: "a_n" })).toEqual([]);
    expect(await names({ q: "%" })).toEqual(["100% Eve"]);
  });
});

describe("the list: categories, paging, who is left out", () => {
  it("one category as a filter; the categories in use, each once, A to Z", async () => {
    await add({ name: "Anna Näidis", labels: ["VIP", "дети"] });
    await add({ name: "Boris Sample", labels: ["VIP"] });
    await add({ name: "Carl Sample", labels: ["друг, сосед", "it's \"ok\""] });
    await add({ name: "Dan Sample" });
    expect(await names({ label: "VIP" })).toEqual(["Anna Näidis", "Boris Sample"]);
    expect(await names({ label: "дети" })).toEqual(["Anna Näidis"]);
    // a comma or a quote inside a word stays inside it
    expect(await names({ label: "друг, сосед" })).toEqual(["Carl Sample"]);
    expect(await names({ label: "nobody has it" })).toEqual([]);
    // with the search: both must hold
    expect(await names({ label: "VIP", q: "boris" })).toEqual(["Boris Sample"]);
    const list = await listClients(query, demo.business.id, { label: "VIP" }, NOW);
    expect(list.labels).toEqual(["it's \"ok\"", "VIP", "дети", "друг, сосед"]);
    expect(list.total).toBe(2);
    expect(list.rows[0].labels).toEqual(["VIP", "дети"]);
  });

  it("25 a page, the count of all of them, a page past the end is the last", async () => {
    for (let i = 1; i <= 30; i++) await add({ name: `Sample ${String(i).padStart(2, "0")}`, labels: i <= 3 ? ["VIP"] : [] });
    const first = await listClients(query, demo.business.id, {}, NOW);
    expect([first.total, first.page, first.pages, first.rows.length]).toEqual([30, 1, 2, PAGE_SIZE]);
    expect(first.rows[0].name).toBe("Sample 01");
    expect(first.rows[24].name).toBe("Sample 25");
    const second = await listClients(query, demo.business.id, { page: 2 }, NOW);
    expect([second.total, second.page, second.rows.length]).toEqual([30, 2, 5]);
    expect(second.rows.map((r) => r.name)).toEqual(["Sample 26", "Sample 27", "Sample 28", "Sample 29", "Sample 30"]);
    // nonsense for a page is the nearest real one
    expect((await listClients(query, demo.business.id, { page: 99 }, NOW)).page).toBe(2);
    expect((await listClients(query, demo.business.id, { page: 0 }, NOW)).page).toBe(1);
    expect((await listClients(query, demo.business.id, { page: Number.NaN }, NOW)).page).toBe(1);
    // the count is of what the search and the filter leave
    const some = await listClients(query, demo.business.id, { q: "sample 1" }, NOW);
    expect([some.total, some.pages, some.rows.length]).toEqual([10, 1, 10]);
    const vip = await listClients(query, demo.business.id, { label: "VIP", page: 2 }, NOW);
    expect([vip.total, vip.page, vip.pages, vip.rows.length]).toEqual([3, 1, 1, 3]);
    // nobody at all: one empty page
    const none = await listClients(query, demo.business.id, { q: "nobody" }, NOW);
    expect([none.total, none.page, none.pages, none.rows]).toEqual([0, 1, 1, []]);
  });

  it("a client merged into another, and another business's client, are not there", async () => {
    const kept = await add({ name: "Anna Näidis", phone: "+372 5555 0101", labels: ["VIP"] });
    const gone = await add({ name: "Anna Double", labels: ["old"] });
    await query("update clients set merged_into = $2 where id = $1", [gone, kept]);
    const [other] = await query<{ id: string }>("insert into businesses (slug, name) values ('other-salon', 'Other') returning id");
    const [theirs] = await query<{ id: string }>("insert into clients (business_id, name, labels) values ($1, 'Their Client', '{theirs}') returning id", [other.id]);

    const list = await listClients(query, demo.business.id, {}, NOW);
    expect(list.rows.map((r) => r.id)).toEqual([kept]);
    expect(list.total).toBe(1);
    expect(list.labels).toEqual(["VIP"]);
    expect(await clientLabels(query, other.id)).toEqual(["theirs"]);
    expect(await clientDetail(query, demo.business, gone, NOW)).toBeNull();
    expect(await clientDetail(query, demo.business, theirs.id, NOW)).toBeNull();
    expect(await clientDetail(query, demo.business, "not-a-uuid", NOW)).toBeNull();
    // and neither can be changed from here
    expect(await saveClient(demo.business, gone, { name: "X" }, ACTOR)).toEqual({ ok: false, field: "id" });
    expect(await saveClient(demo.business, theirs.id, { name: "X" }, ACTOR)).toEqual({ ok: false, field: "id" });
  });
});

describe("a client's numbers and visits", () => {
  it("«sold» is what he came for: no cancelled visit, no visit still ahead, no no-show", async () => {
    const id = await add({ name: "Anna Näidis", phone: "+372 5555 0101" });
    const quiet = await add({ name: "Boris Sample" });
    const a = await visit(id, "valentin", "2026-11-03", "11:00"); // clip, 40 €
    const b = await visit(id, "jevgeni", "2026-11-10", "12:00", "beard"); // 28 €
    const c = await visit(id, "valentin", "2026-11-17", "11:00"); // cancelled
    const d = await visit(id, "valentin", "2026-11-24", "11:00"); // no-show
    const e = await visit(id, "valentin", "2026-12-08", "11:00"); // ahead
    await adminSetStatus(demo.business, a.id, "done", ACTOR);
    await adminSetStatus(demo.business, b.id, "arrived", ACTOR);
    await adminCancelVisit(demo.business, c.id, ACTOR);
    await adminSetStatus(demo.business, d.id, "no_show", ACTOR);

    const list = await listClients(query, demo.business.id, {}, NOW);
    const row = list.rows.find((r) => r.id === id)!;
    expect(row.soldCents).toBe(4000 + 2800);
    // every visit that is not cancelled, the one ahead too
    expect(row.visits).toBe(4);
    expect(row.firstVisit).toBe(a.start);
    // the latest one that has begun, not the one in December
    expect(row.lastVisit).toBe(d.start);
    expect(list.rows.find((r) => r.id === quiet)).toMatchObject({ visits: 0, firstVisit: null, lastVisit: null, soldCents: 0 });

    // a week later the December visit has begun: it counts
    const later = await listClients(query, demo.business.id, {}, at("2026-12-09", "12:00"));
    expect(later.rows.find((r) => r.id === id)).toMatchObject({ soldCents: 4000 + 2800 + 4000, lastVisit: e.start, visits: 4 });

    // the client's own page says the same and lists every visit: ahead first, then the newest
    const card = (await clientDetail(query, demo.business, id, NOW))!;
    expect(card).toMatchObject({ name: "Anna Näidis", phone: "+37255550101", visits: 4, soldCents: 6800, firstVisit: a.start, lastVisit: d.start, source: "admin", locale: "ru" });
    expect(card.history.map((v) => [v.id, v.status, v.ahead])).toEqual([
      [e.id, "booked", true],
      [d.id, "no_show", false],
      [c.id, "cancelled", false],
      [b.id, "arrived", false],
      [a.id, "done", false],
    ]);
    expect(card.history[3]).toMatchObject({ staffId: demo.staff.jevgeni, staffName: "Jevgeni", totalCents: 2800, start: b.start, end: b.end });
    expect(card.history[3].services.map((s) => s.en)).toEqual(["Beard trim"]);
  });

  it("the visits ahead come soonest first; a cancelled one ahead is not «ahead»", async () => {
    const id = await add({ name: "Anna Näidis" });
    const far = await visit(id, "valentin", "2026-12-22", "11:00");
    const near = await visit(id, "valentin", "2026-12-08", "11:00");
    const off = await visit(id, "valentin", "2026-12-15", "11:00");
    const past = await visit(id, "valentin", "2026-11-03", "11:00");
    await adminCancelVisit(demo.business, off.id, ACTOR);
    const card = (await clientDetail(query, demo.business, id, NOW))!;
    expect(card.history.map((v) => v.id)).toEqual([near.id, far.id, off.id, past.id]);
    expect(card.history.map((v) => v.ahead)).toEqual([true, true, false, false]);
  });
});

describe("adding and changing a client", () => {
  it("adds one with every field cleaned, and an audit row without his data", async () => {
    const r = await saveClient(
      demo.business,
      null,
      { name: "  Anna   Näidis ", phone: "5555 0101", email: " anna@example.test ", locale: "et", note: "  любит покороче \r\n виски ", labels: [" VIP ", "vip", "", "дети  сад"], smsOptOut: true },
      ACTOR,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const card = (await clientDetail(query, demo.business, r.id, NOW))!;
    expect(card).toMatchObject({
      name: "Anna Näidis",
      phone: "+37255550101",
      email: "anna@example.test",
      locale: "et",
      note: "любит покороче \n виски",
      labels: ["VIP", "дети сад"],
      smsOptOut: true,
      emailOptOut: false,
      source: "admin",
      history: [],
    });
    const audit = await query<{ actor: string; action: string; after: unknown }>("select actor, action, after from audit where entity = 'client' and entity_id = $1", [r.id]);
    expect(audit).toEqual([{ actor: ACTOR, action: "create", after: { by: "admin", source: "admin" } }]);
    // a walk-in: a name is enough, and the language is the salon's
    const walkIn = await saveClient(demo.business, null, { name: "Walk-in Dan" }, ACTOR);
    expect(walkIn.ok && (await clientDetail(query, demo.business, walkIn.id, NOW))).toMatchObject({ phone: null, email: null, locale: "ru", labels: [], note: "" });
  });

  it("refuses what cannot be saved, and names the field", async () => {
    const bad = (input: ClientInput) => saveClient(demo.business, null, { name: "Anna Näidis", ...input }, ACTOR);
    expect(await saveClient(demo.business, null, {}, ACTOR)).toEqual({ ok: false, field: "name" });
    expect(await bad({ name: "   " })).toEqual({ ok: false, field: "name" });
    expect(await bad({ phone: "12" })).toEqual({ ok: false, field: "phone" });
    expect(await bad({ phone: "not a phone" })).toEqual({ ok: false, field: "phone" });
    expect(await bad({ email: "anna@" })).toEqual({ ok: false, field: "email" });
    expect(await bad({ email: "anna example.test" })).toEqual({ ok: false, field: "email" });
    expect(await bad({ locale: "de" })).toEqual({ ok: false, field: "locale" });
    expect(await bad({ labels: "VIP" as unknown as string[] })).toEqual({ ok: false, field: "labels" });
    expect(await bad({ labels: Array.from({ length: LABELS_MAX + 1 }, (_, i) => `word ${i}`) })).toEqual({ ok: false, field: "labels" });
    expect(await saveClient(demo.business, "not-a-uuid", { name: "X" }, ACTOR)).toEqual({ ok: false, field: "id" });
    expect(await saveClient(demo.business, "00000000-0000-4000-8000-000000000000", { name: "X" }, ACTOR)).toEqual({ ok: false, field: "id" });
    // nothing was written on the way
    expect(await query("select 1 from clients")).toHaveLength(0);
    // the longest that fits is kept, the rest is cut
    const id = await add({ name: "N".repeat(200), note: "a".repeat(NOTE_MAX + 50), labels: ["L".repeat(LABEL_MAX + 10), ...Array.from({ length: LABELS_MAX - 1 }, (_, i) => `word ${i}`)] });
    const card = (await clientDetail(query, demo.business, id, NOW))!;
    expect([card.name.length, card.note.length, card.labels.length, card.labels[0].length]).toEqual([120, NOTE_MAX, LABELS_MAX, LABEL_MAX]);
  });

  it("a change touches only the fields it brings; the audit row names them", async () => {
    const id = await add({ name: "Anna Näidis", phone: "+372 5555 0101", email: "anna@example.test", note: "первая", labels: ["VIP"] });
    expect(await saveClient(demo.business, id, { labels: ["VIP", "дети"] }, ACTOR)).toEqual({ ok: true, id });
    expect(await saveClient(demo.business, id, { note: "вторая" }, ACTOR)).toEqual({ ok: true, id });
    expect(await saveClient(demo.business, id, { name: "Anna Uus", phone: "", email: "", locale: "en", emailOptOut: true }, ACTOR)).toEqual({ ok: true, id });
    expect(await clientDetail(query, demo.business, id, NOW)).toMatchObject({
      name: "Anna Uus",
      phone: null,
      email: null,
      locale: "en",
      note: "вторая",
      labels: ["VIP", "дети"],
      smsOptOut: false,
      emailOptOut: true,
    });
    // the same again: nothing to save, nothing in the audit
    expect(await saveClient(demo.business, id, { note: "вторая", labels: ["VIP", "дети"] }, ACTOR)).toEqual({ ok: true, id });
    // a field that cannot be saved leaves the whole change out
    expect(await saveClient(demo.business, id, { name: "Anna Kolmas", email: "nope" }, ACTOR)).toEqual({ ok: false, field: "email" });
    expect((await clientDetail(query, demo.business, id, NOW))!.name).toBe("Anna Uus");
    expect(await saveClient(demo.business, id, { name: "" }, ACTOR)).toEqual({ ok: false, field: "name" });

    const audit = await query<{ action: string; after: { changed?: string[] } }>("select action, after from audit where entity = 'client' and entity_id = $1 order by id", [id]);
    expect(audit.map((a) => [a.action, a.after.changed ?? null])).toEqual([
      ["create", null],
      ["edit", ["labels"]],
      ["edit", ["staff_note"]],
      ["edit", ["name", "phone_e164", "email", "locale", "email_opt_out"]],
    ]);
    // no name, phone or note in any of them
    expect(JSON.stringify(audit)).not.toMatch(/Anna|5555|example\.test|вторая/);
  });

  it("a phone another client has is a named error, with who has it; never a crash", async () => {
    const anna = await add({ name: "Anna Näidis", phone: "+372 5555 0101" });
    const boris = await add({ name: "Boris Sample", phone: "+372 5555 0102" });
    // adding a second client with Anna's phone, typed another way
    expect(await saveClient(demo.business, null, { name: "Anna Again", phone: "5555 0101" }, ACTOR)).toEqual({ ok: false, field: "phoneTaken", clientId: anna });
    // changing Boris's phone to Anna's
    expect(await saveClient(demo.business, boris, { phone: "+37255550101" }, ACTOR)).toEqual({ ok: false, field: "phoneTaken", clientId: anna });
    expect((await clientDetail(query, demo.business, boris, NOW))!.phone).toBe("+37255550102");
    // his own phone again, with another field: fine
    expect(await saveClient(demo.business, boris, { phone: "5555 0102", name: "Boris Uus" }, ACTOR)).toEqual({ ok: true, id: boris });
    // no phone twice is fine: walk-ins
    await add({ name: "Walk-in One" });
    await add({ name: "Walk-in Two", phone: "" });
    // a phone held by a client who was merged away: the error points at the one who is left
    const old = await add({ name: "Anna Old", phone: "+372 5555 0109" });
    await query("update clients set merged_into = $2 where id = $1", [old, anna]);
    expect(await saveClient(demo.business, boris, { phone: "5555 0109" }, ACTOR)).toEqual({ ok: false, field: "phoneTaken", clientId: anna });
    // the same phone in another business is not in the way
    const [other] = await query<{ id: string }>("insert into businesses (slug, name) values ('other-salon', 'Other') returning id");
    await query("insert into clients (business_id, name, phone_e164) values ($1, 'Their Client', '+37255550177')", [other.id]);
    expect(await saveClient(demo.business, boris, { phone: "5555 0177" }, ACTOR)).toEqual({ ok: true, id: boris });
    expect(await query("select 1 from clients where business_id = $1", [demo.business.id])).toHaveLength(5);
  });
});
