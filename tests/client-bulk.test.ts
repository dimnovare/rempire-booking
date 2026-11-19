/**
 * What the client base does to many clients at once
 * (src/lib/admin/client-bulk.ts; the owner, 19.11.2026): a mass message
 * (who is left out, the counts, the mark on each client, the one audit
 * row, how it goes out), a category for all, deleting with its refusals;
 * and the columns a login keeps (src/lib/admin/client-columns.ts). Fake
 * people only; nothing is sent anywhere.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { BULK_IDS_MAX, bulkAddLabel, bulkCount, bulkDelete, cleanTarget, massPreview, queueMassMessage, type BulkTarget } from "@/lib/admin/client-bulk";
import { listMessages, MESSAGE_MAX } from "@/lib/admin/client-card";
import { CLIENT_COLUMNS, cleanColumns, listClientColumns, setClientColumns } from "@/lib/admin/client-columns";
import { clientDetail, LABELS_MAX, listClients, saveClient, type ClientInput } from "@/lib/admin/clients";
import { adminCancelVisit, adminCreateVisit } from "@/lib/admin/visits";
import { saveClientSubscription } from "@/lib/client-push";
import { closeDb, query } from "@/lib/db";
import { sentToConsole } from "@/lib/email";
import { runOutbox, type Senders } from "@/lib/outbox";
import type { PushText } from "@/lib/push-kinds";
import { sentSms } from "@/lib/sms";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
// Monday 16.11.2026, 10:00 in Tallinn
const NOW = at("2026-11-16", "10:00");
const DEV = { NODE_ENV: "test", VITEST: "true", ALLOW_INDEXING: "yes" };
// test values only: pushConfigured() needs both to be there, nothing is sent with them
const KEYS = { VAPID_PUBLIC_KEY: "test-public-key", VAPID_PRIVATE_KEY: "test-private-key" };
const PHONE = { endpoint: "https://fcm.googleapis.com/fcm/send/test-client-phone-0019", p256dh: "p256dh-test", auth: "auth-test", label: "Android" };
const OWNER = { id: "test-owner", role: "owner" };
const DESK = { id: "test-desk", role: "admin" };
const ALL: BulkTarget = { filter: {} };

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
  sentSms.length = 0;
  sentToConsole.length = 0;
});
afterAll(closeDb);

async function add(input: ClientInput): Promise<string> {
  const r = await saveClient(demo.business, null, input, "test-admin");
  if (!r.ok) throw new Error(`client not added: ${r.field}`);
  return r.id;
}

let n = 0;
async function visit(clientId: string, date: string, time = "12:00") {
  const r = await adminCreateVisit(
    demo.business,
    { staffId: demo.staff.renat, start: at(date, time), serviceIds: [demo.services.clip], clientId, idempotencyKey: `client-bulk-${++n}-${Math.random()}`, force: true },
    "test-admin",
  );
  if (!r.ok) throw new Error(`booking failed: ${r.code}`);
  return r;
}

type Row = { client_id: string | null; channel: string; kind: string; recipient: string; status: string; payload: Record<string, unknown>; appointment_id: string | null; locale: string };
const outbox = () => query<Row>("select client_id, channel, kind, recipient, status, payload, appointment_id, locale from notifications where kind = 'mass' order by channel, recipient");
const audit = (action: string) => query<{ actor: string; entity_id: string | null; after: Record<string, unknown> }>("select actor, entity_id, after from audit where entity = 'client' and action = $1 order by id", [action]);
const marked = async () => (await query<{ name: string }>("select name from clients where mass_sent_at is not null order by name")).map((r) => r.name);

/**
 * Six clients, each reachable in his own way:
 *   Anna   a phone and an e-mail, accepts everything
 *   Boris  a phone only; switched SMS off
 *   Carl   an e-mail only; switched e-mail off
 *   Dan    a phone and an e-mail; «Рекламные сообщения: не отправлять»
 *   Eve    a phone and an e-mail, Estonian
 *   Fred   a walk-in: no phone, no e-mail
 */
async function six() {
  const anna = await add({ name: "Anna Näidis", phone: "+372 5555 0101", email: "anna@example.test" });
  const boris = await add({ name: "Boris Sample", phone: "+372 5555 0102", smsOptOut: true });
  const carl = await add({ name: "Carl Sample", email: "carl@example.test", emailOptOut: true });
  const dan = await add({ name: "Dan Sample", phone: "+372 5555 0104", email: "dan@example.test", marketingOptOut: true });
  const eve = await add({ name: "Eve Sample", phone: "+372 5555 0105", email: "eve@example.test", locale: "et" });
  const fred = await add({ name: "Fred Walkin" });
  return { anna, boris, carl, dan, eve, fred };
}

describe("whom an action is for", () => {
  it("the ticked rows, or the list's filter; nothing else", () => {
    const id = "0b7c1f0e-8a52-4c0b-9d1e-3f2a6b7c8d90";
    expect(cleanTarget({ ids: [id, id] })).toEqual({ ids: [id] });
    expect(cleanTarget({ ids: [] })).toBeNull();
    expect(cleanTarget({ ids: ["not-a-uuid"] })).toBeNull();
    expect(cleanTarget({ ids: Array.from({ length: BULK_IDS_MAX + 1 }, (_, i) => `0b7c1f0e-8a52-4c0b-9d1e-${String(i).padStart(12, "0")}`) })).toBeNull();
    expect(cleanTarget(null)).toBeNull();
    expect(cleanTarget("all")).toBeNull();
    expect(cleanTarget({})).toBeNull();
    // of a filter only what says which clients is kept: never a page, a size or an order
    expect(cleanTarget({ filter: { q: "anna", label: "VIP", page: 3, size: 10, sort: "sold", conds: [{ kind: "gender", value: "male" }], join: "or" } })).toEqual({
      filter: { q: "anna", label: "VIP", conds: [{ kind: "gender", value: "male" }], join: "or" },
    });
  });

  it("is counted as the list counts: this business's clients, none merged away", async () => {
    const c = await six();
    const [other] = await query<{ id: string }>("insert into businesses (slug, name) values ('other-salon', 'Other') returning id");
    const [theirs] = await query<{ id: string }>("insert into clients (business_id, name, phone_e164) values ($1, 'Their Client', '+37255550177') returning id", [other.id]);
    await query("update clients set merged_into = $2 where id = $1", [c.fred, c.anna]);
    expect(await bulkCount(query, demo.business, ALL, NOW)).toBe(5);
    expect(await bulkCount(query, demo.business, { filter: { q: "sample" } }, NOW)).toBe(4);
    expect(await bulkCount(query, demo.business, { ids: [c.anna, c.fred, theirs.id] }, NOW)).toBe(1);
    expect((await listClients(query, demo.business.id, {}, NOW)).total).toBe(5);
  });
});

describe("a mass message: who would get it", () => {
  it("by channel: who gets it, who has no address, who switched it off; no advertising for who asked for none", async () => {
    await six();
    expect(await massPreview(query, demo.business, ALL, NOW, DEV)).toEqual({
      clients: 6,
      // Dan: left out of everything, and of the counts below
      ads: 1,
      // Anna, Eve · Carl, Fred have no phone · Boris switched it off
      sms: { ok: 2, none: 2, off: 1 },
      // Anna, Eve · Boris, Fred have no e-mail · Carl switched it off
      email: { ok: 2, none: 2, off: 1 },
      // nobody has a notification turned on
      push: { ok: 0, none: 5, off: 0 },
    });
    expect(await massPreview(query, demo.business, { filter: { q: "sample" } }, NOW, DEV)).toMatchObject({ clients: 4, ads: 1, sms: { ok: 1, none: 1, off: 1 } });
    // counting queues nothing and marks nobody
    expect(await outbox()).toHaveLength(0);
    expect(await marked()).toEqual([]);
  });

  it("a notification reaches only a phone turned on for a visit ahead, and only while push is set up", async () => {
    const ENV = { ...DEV, ...KEYS };
    const c = await six();
    const v = await visit(c.anna, "2026-11-17");
    const gone = await visit(c.eve, "2026-11-10");
    const off = await visit(c.boris, "2026-11-18");
    for (const a of [v, gone, off]) await saveClientSubscription(query, demo.business.id, a.id, { ...PHONE, endpoint: `${PHONE.endpoint}-${a.id}` });
    await saveClient(demo.business, c.boris, { pushOptOut: true }, "test-admin");
    // Anna's visit is ahead · Eve's has begun, the rest have none · Boris switched push off
    expect((await massPreview(query, demo.business, ALL, NOW, ENV)).push).toEqual({ ok: 1, none: 3, off: 1 });
    // without the keys nothing can be sent, so nobody is reached
    expect((await massPreview(query, demo.business, ALL, NOW, DEV)).push).toEqual({ ok: 0, none: 5, off: 0 });
  });
});

describe("a mass message: queued", () => {
  const TEXT = "Скидка 10 % на стрижку до конца ноября. REMPIRE";

  it("one row per client and channel, only for who takes it; each of them is marked; one audit row without the words", async () => {
    const c = await six();
    const r = await queueMassMessage(demo.business, ALL, { text: `  ${TEXT}\r\n `, channels: ["email", "sms"] }, DESK, NOW, DEV);
    // Cyrillic and short: one part each
    expect(r).toMatchObject({ ok: true, clients: 6, reached: 2, sms: 2, email: 2, push: 0, parts: 2 });
    if (!r.ok) return;
    const rows = await outbox();
    expect(rows.map((x) => [x.channel, x.recipient, x.client_id, x.locale])).toEqual([
      ["email", "anna@example.test", c.anna, "ru"],
      ["email", "eve@example.test", c.eve, "et"],
      ["sms", "+37255550101", c.anna, "ru"],
      ["sms", "+37255550105", c.eve, "et"],
    ]);
    for (const x of rows) expect(x).toMatchObject({ kind: "mass", status: "queued", appointment_id: null, payload: { text: TEXT, subject: demo.business.name, batch: r.batch } });
    // the mark, for the list's filter «получал рассылку»
    expect(await marked()).toEqual(["Anna Näidis", "Eve Sample"]);
    const got = (await listClients(query, demo.business.id, { conds: [{ kind: "massSent", value: "yes" }] }, NOW)).rows.map((x) => x.name);
    expect(got).toEqual(["Anna Näidis", "Eve Sample"]);
    expect((await listClients(query, demo.business.id, { conds: [{ kind: "massSent", value: "no" }] }, NOW)).total).toBe(4);
    // who, to how many, by which channels: never the words, never a name
    const log = await audit("mass_message");
    expect(log).toEqual([{ actor: DESK.id, entity_id: null, after: { by: "admin", batch: r.batch, channels: ["sms", "email"], clients: 6, reached: 2, sms: 2, email: 2, push: 0, parts: 2 } }]);
    expect(JSON.stringify(log)).not.toContain("Скидка");
    // on each client's card it is among his messages, with its words
    expect(await listMessages(query, demo.business.id, c.anna)).toMatchObject([{ kind: "mass" }, { kind: "mass" }]);
    expect((await listMessages(query, demo.business.id, c.anna)).map((m) => [m.channel, m.text, m.status, m.visitAt]).sort()).toEqual([
      ["email", TEXT, "queued", null],
      ["sms", TEXT, "queued", null],
    ]);
    expect(await listMessages(query, demo.business.id, c.dan)).toEqual([]);
  });

  it("a long text is billed in parts: the count is parts per message times the SMS", async () => {
    await six();
    const long = "Я".repeat(71); // UCS-2: two parts
    const r = await queueMassMessage(demo.business, ALL, { text: long, channels: ["sms"] }, OWNER, NOW, DEV);
    expect(r).toMatchObject({ ok: true, sms: 2, email: 0, parts: 4, reached: 2 });
  });

  it("the ticked rows only; a client of another business among them is not one of ours", async () => {
    const c = await six();
    const [other] = await query<{ id: string }>("insert into businesses (slug, name) values ('other-salon', 'Other') returning id");
    const [theirs] = await query<{ id: string }>("insert into clients (business_id, name, phone_e164) values ($1, 'Their Client', '+37255550177') returning id", [other.id]);
    const r = await queueMassMessage(demo.business, { ids: [c.eve, c.dan, c.boris, theirs.id] }, { text: TEXT, channels: ["sms", "email"] }, OWNER, NOW, DEV);
    // Eve by both; Dan asked for no advertising; Boris has SMS off and no e-mail
    expect(r).toMatchObject({ ok: true, clients: 3, reached: 1, sms: 1, email: 1 });
    expect((await outbox()).map((x) => x.recipient)).toEqual(["eve@example.test", "+37255550105"]);
    expect(await marked()).toEqual(["Eve Sample"]);
  });

  it("a filter's clients: the same ones the list shows for it", async () => {
    await six();
    const filter = { q: "sample", conds: [{ kind: "massSent", value: "no" }] };
    expect((await listClients(query, demo.business.id, filter, NOW)).rows.map((x) => x.name)).toEqual(["Boris Sample", "Carl Sample", "Dan Sample", "Eve Sample"]);
    const r = await queueMassMessage(demo.business, { filter }, { text: TEXT, channels: ["sms"] }, OWNER, NOW, DEV);
    expect(r).toMatchObject({ ok: true, clients: 4, reached: 1, sms: 1 });
    // asked again, the one who got it is no longer «не получал»: nobody is left to reach
    expect(await queueMassMessage(demo.business, { filter }, { text: TEXT, channels: ["sms"] }, OWNER, NOW, DEV)).toEqual({ ok: false, code: "nobody" });
    expect(await outbox()).toHaveLength(1);
    expect(await audit("mass_message")).toHaveLength(1);
  });

  it("refuses: a barber's login, no words, too many words, no channel, a channel that is none, nobody to reach", async () => {
    const c = await six();
    const send = (text: unknown, channels: unknown, by = OWNER, target: BulkTarget | null = ALL) => queueMassMessage(demo.business, target, { text, channels }, by, NOW, DEV);
    expect(await send(TEXT, ["sms"], { id: "test-barber", role: "staff" })).toEqual({ ok: false, code: "forbidden" });
    expect(await send("   ", ["sms"])).toEqual({ ok: false, code: "text" });
    expect(await send("a".repeat(MESSAGE_MAX + 1), ["sms"])).toEqual({ ok: false, code: "text" });
    expect(await send(TEXT, [])).toEqual({ ok: false, code: "channels" });
    expect(await send(TEXT, "sms")).toEqual({ ok: false, code: "channels" });
    expect(await send(TEXT, ["sms", "fax"])).toEqual({ ok: false, code: "channels" });
    expect(await send(TEXT, ["sms"], OWNER, null)).toEqual({ ok: false, code: "target" });
    // only clients who cannot be reached: nothing queued, nobody marked, nothing in the audit
    expect(await send(TEXT, ["sms", "email"], OWNER, { ids: [c.dan, c.fred, c.boris] })).toEqual({ ok: false, code: "nobody" });
    // push with no keys set, or with nobody's phone turned on
    expect(await send(TEXT, ["push"])).toEqual({ ok: false, code: "nobody" });
    expect(await outbox()).toHaveLength(0);
    expect(await marked()).toEqual([]);
    expect(await audit("mass_message")).toHaveLength(0);
    expect((await send("a".repeat(MESSAGE_MAX), ["sms"])).ok).toBe(true);
  });

  it("it goes out as every outbox row does: the SMS and the letter with its words, a notification to the visit's phones", async () => {
    const ENV = { ...DEV, ...KEYS };
    const c = await six();
    const v = await visit(c.anna, "2026-11-17");
    await saveClientSubscription(query, demo.business.id, v.id, PHONE);
    const r = await queueMassMessage(demo.business, { ids: [c.anna, c.dan] }, { text: TEXT, channels: ["sms", "email", "push"] }, OWNER, NOW, ENV);
    expect(r).toMatchObject({ ok: true, clients: 2, reached: 1, sms: 1, email: 1, push: 1 });
    const [push] = (await outbox()).filter((x) => x.channel === "push");
    expect(push).toMatchObject({ recipient: v.id, appointment_id: v.id, client_id: c.anna });
    const told: { visitId: string; msg: PushText }[] = [];
    const letters: { to: string; subject: string; text: string }[] = [];
    const texts: { to: string; text: string }[] = [];
    const senders: Senders = {
      sms: async (to, text) => {
        texts.push({ to, text });
        return { provider: "console" as const, ref: null, segments: 1 };
      },
      email: async (to, subject, body) => {
        letters.push({ to, subject, text: typeof body === "string" ? body : body.text });
        return { provider: "console" as const, ref: null };
      },
      pushClient: async (_q, visitId, msg) => {
        told.push({ visitId, msg });
        return { devices: 1, sent: 1, failed: 0, gone: 0 };
      },
    };
    await runOutbox(query, NOW + 60_000, ENV, senders);
    expect(texts).toEqual([{ to: "+37255550101", text: TEXT }]);
    expect(letters).toEqual([{ to: "anna@example.test", subject: demo.business.name, text: TEXT }]);
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ visitId: v.id, msg: { title: demo.business.name, body: TEXT } });
    expect((await outbox()).map((x) => x.status)).toEqual(["sent", "sent", "sent"]);
  });

  it("while no SMS provider is set, an SMS row stays queued and the letter still goes", async () => {
    await six();
    await queueMassMessage(demo.business, ALL, { text: TEXT, channels: ["sms", "email"] }, OWNER, NOW, DEV);
    // production with no provider: the SMS transport is «disabled» (src/lib/sms.ts)
    await runOutbox(query, NOW + 60_000, { ...DEV, NODE_ENV: "production", EMAIL_TRANSPORT: "console" });
    const by = Object.fromEntries((await outbox()).map((x) => [`${x.channel}:${x.recipient}`, x.status]));
    expect(by).toEqual({ "email:anna@example.test": "sent", "email:eve@example.test": "sent", "sms:+37255550101": "queued", "sms:+37255550105": "queued" });
    expect(sentSms).toHaveLength(0);
  });
});

describe("a category for many", () => {
  it("is added to who has none like it; who had it and who is full are counted, not touched", async () => {
    const c = await six();
    await saveClient(demo.business, c.anna, { labels: ["VIP"] }, "test-admin");
    await saveClient(demo.business, c.boris, { labels: Array.from({ length: LABELS_MAX }, (_, i) => `word ${i}`) }, "test-admin");
    // typed in other capitals: written as it is in use already
    const r = await bulkAddLabel(demo.business, ALL, "  vip ", OWNER.id, NOW);
    expect(r).toEqual({ ok: true, label: "VIP", clients: 6, added: 4, had: 1, full: 1 });
    const labels = async (id: string) => (await clientDetail(query, demo.business, id, NOW))!.labels;
    expect(await labels(c.anna)).toEqual(["VIP"]);
    expect(await labels(c.carl)).toEqual(["VIP"]);
    expect((await labels(c.boris)).includes("VIP")).toBe(false);
    expect((await listClients(query, demo.business.id, { label: "VIP" }, NOW)).total).toBe(5);
    expect(await audit("bulk_label")).toEqual([{ actor: OWNER.id, entity_id: null, after: { by: "admin", label: "VIP", clients: 6, added: 4 } }]);
    // once more: everybody has it, nothing to write and nothing in the audit
    expect(await bulkAddLabel(demo.business, ALL, "VIP", OWNER.id, NOW)).toEqual({ ok: true, label: "VIP", clients: 6, added: 0, had: 5, full: 1 });
    expect(await audit("bulk_label")).toHaveLength(1);
  });

  it("only the ticked rows; a new word is kept as typed; a word that is none is refused", async () => {
    const c = await six();
    expect(await bulkAddLabel(demo.business, { ids: [c.eve, c.fred] }, "Друзья  салона", OWNER.id, NOW)).toEqual({ ok: true, label: "Друзья салона", clients: 2, added: 2, had: 0, full: 0 });
    expect((await listClients(query, demo.business.id, { label: "Друзья салона" }, NOW)).rows.map((x) => x.name)).toEqual(["Eve Sample", "Fred Walkin"]);
    expect(await bulkAddLabel(demo.business, ALL, "   ", OWNER.id, NOW)).toEqual({ ok: false, field: "label" });
    expect(await bulkAddLabel(demo.business, ALL, null, OWNER.id, NOW)).toEqual({ ok: false, field: "label" });
    expect(await bulkAddLabel(demo.business, null, "VIP", OWNER.id, NOW)).toEqual({ ok: false, field: "target" });
  });
});

describe("deleting many", () => {
  it("only who the card's own «Удалить» would delete; the rest stay, counted by the reason", async () => {
    const c = await six();
    // Anna has a visit ahead, Boris a cancelled one (a visit is never deleted), Carl bought something,
    // Dan has another client merged into him; Eve and Fred have nothing
    await visit(c.anna, "2026-11-17");
    const off = await visit(c.boris, "2026-11-18");
    await adminCancelVisit(demo.business, off.id, "test-admin");
    await query(
      `insert into product_sales (business_id, ref, staff_id, mode, shop_product_id, name, qty, unit_cents, list_cents, vat_bp, total_cents, client_id)
       values ($1, 'bulk-test-sale-01', $2, 'client', 'p1', 'Wax', 1, 1500, 1500, 2400, 1500, $3)`,
      [demo.business.id, demo.staff.renat, c.carl],
    );
    const old = await add({ name: "Dan Old" });
    await query("update clients set merged_into = $2 where id = $1", [old, c.dan]);

    // not the front desk, not a barber
    expect(await bulkDelete(demo.business, ALL, DESK, NOW)).toEqual({ ok: false, code: "forbidden" });
    expect(await bulkDelete(demo.business, ALL, { id: "test-barber", role: "staff" }, NOW)).toEqual({ ok: false, code: "forbidden" });
    expect(await bulkDelete(demo.business, null, OWNER, NOW)).toEqual({ ok: false, code: "target" });
    expect(await query("select 1 from clients where merged_into is null")).toHaveLength(6);

    expect(await bulkDelete(demo.business, ALL, OWNER, NOW)).toEqual({ ok: true, clients: 6, deleted: 2, kept: { visits: 2, sales: 1, merged: 1 } });
    expect((await listClients(query, demo.business.id, {}, NOW)).rows.map((x) => x.name)).toEqual(["Anna Näidis", "Boris Sample", "Carl Sample", "Dan Sample"]);
    // each deleted client has the audit row a single delete writes, marked as one of many; nobody's name is in it
    const log = await audit("delete");
    expect(log.map((x) => [x.actor, x.entity_id, x.after]).sort()).toEqual([[OWNER.id, c.eve, { by: "admin", bulk: true }], [OWNER.id, c.fred, { by: "admin", bulk: true }]].sort());
    // again: nobody left to delete
    expect(await bulkDelete(demo.business, ALL, OWNER, NOW)).toEqual({ ok: true, clients: 4, deleted: 0, kept: { visits: 2, sales: 1, merged: 1 } });
    expect(await audit("delete")).toHaveLength(2);
  });

  it("the ticked rows only, and never another business's client", async () => {
    const c = await six();
    const [other] = await query<{ id: string }>("insert into businesses (slug, name) values ('other-salon', 'Other') returning id");
    const [theirs] = await query<{ id: string }>("insert into clients (business_id, name) values ($1, 'Their Client') returning id", [other.id]);
    await visit(c.anna, "2026-11-17");
    expect(await bulkDelete(demo.business, { ids: [c.anna, c.fred, theirs.id] }, OWNER, NOW)).toEqual({ ok: true, clients: 2, deleted: 1, kept: { visits: 1, sales: 0, merged: 0 } });
    expect(await query("select 1 from clients where id = $1", [theirs.id])).toHaveLength(1);
    expect((await listClients(query, demo.business.id, {}, NOW)).total).toBe(5);
    // a filter: the walk-ins the search finds
    expect(await bulkDelete(demo.business, { filter: { q: "eve" } }, OWNER, NOW)).toMatchObject({ clients: 1, deleted: 1 });
    expect((await listClients(query, demo.business.id, {}, NOW)).total).toBe(4);
  });

  it("a deleted client's queued mass message stays in the outbox without his name on it", async () => {
    const c = await six();
    await queueMassMessage(demo.business, { ids: [c.eve] }, { text: "Привет", channels: ["sms"] }, OWNER, NOW, DEV);
    expect(await bulkDelete(demo.business, { ids: [c.eve] }, OWNER, NOW)).toMatchObject({ deleted: 1 });
    expect((await outbox()).map((x) => x.client_id)).toEqual([null]);
  });
});

describe("the columns a login keeps", () => {
  async function login(name: string): Promise<string> {
    const [u] = await query<{ id: string }>("insert into users (business_id, email, name, role) values ($1, $2, $3, 'owner') returning id", [demo.business.id, `${name}@example.test`, name]);
    return u.id;
  }

  it("all of them until it chooses; then its own choice, in the table's order, and nobody else's", async () => {
    const renat = await login("renat");
    const desk = await login("desk");
    expect(await listClientColumns(query, renat)).toEqual([...CLIENT_COLUMNS]);
    expect(await setClientColumns(query, renat, ["first", "phone", "phone", "nope", "sold"])).toEqual(["phone", "sold", "first"]);
    expect(await listClientColumns(query, renat)).toEqual(["phone", "sold", "first"]);
    expect(await listClientColumns(query, desk)).toEqual([...CLIENT_COLUMNS]);
    // every column hidden is a choice too: the name alone
    expect(await setClientColumns(query, renat, [])).toEqual([]);
    expect(await listClientColumns(query, renat)).toEqual([]);
    expect(await setClientColumns(query, renat, [...CLIENT_COLUMNS])).toEqual([...CLIENT_COLUMNS]);
  });

  it("what is no list is not kept; a login that is none has none", async () => {
    const renat = await login("renat");
    expect(await setClientColumns(query, renat, "phone")).toBeNull();
    expect(await setClientColumns(query, renat, null)).toBeNull();
    expect(await listClientColumns(query, renat)).toEqual([...CLIENT_COLUMNS]);
    expect(await setClientColumns(query, "00000000-0000-4000-8000-000000000000", ["phone"])).toBeNull();
    expect(cleanColumns(undefined)).toEqual([...CLIENT_COLUMNS]);
    expect(cleanColumns(["email", 7, "last"])).toEqual(["email", "last"]);
    expect(CLIENT_COLUMNS).toEqual(["phone", "email", "sold", "visits", "discount", "last", "first"]);
  });
});
