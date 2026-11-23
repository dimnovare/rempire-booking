/**
 * «Обезличить клиента» (040_client_anonymise.sql; anonymiseClient in
 * src/lib/admin/clients.ts): a client who asks to be erased but has a
 * history keeps his visits and sales, and loses everything that says who he
 * was: on his card, on his visits, in the outbox and on his reviews. Then
 * nobody finds him, nothing reaches him and nothing is written to him again.
 * Fake people only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { listChanges } from "@/lib/admin/change-log";
import { cleanChanges, defaultChanges } from "@/lib/admin/change-filter";
import { bulkCount, massPreview, queueMassMessage } from "@/lib/admin/client-bulk";
import { addComment, addFile, clientStats, defaultStatsPeriod, listComments, listFiles, queueClientMessage, saveClientPhoto } from "@/lib/admin/client-card";
import { searchClients } from "@/lib/admin/calendar";
import { anonymiseClient, clientDetail, deleteClient, listClients, saveClient, type ClientInput } from "@/lib/admin/clients";
import { cleanMessages, defaultMessages } from "@/lib/admin/message-filter";
import { listMessageLog } from "@/lib/admin/message-log";
import { adminCancelVisit, adminCreateVisit, adminSetStatus } from "@/lib/admin/visits";
import type { Holder } from "@/lib/auth/rights";
import { legacyHolder } from "@/lib/auth/rights-store";
import { searchMyClients } from "@/lib/barber/book";
import { setClientNote } from "@/lib/barber/clients";
import { validateBooking, type BookingInput } from "@/lib/booking";
import { ANON_NAME, shownName } from "@/lib/client-anon";
import { CLIENT_KINDS } from "@/lib/client-notify";
import { saveClientSubscription } from "@/lib/client-push";
import { closeDb, query } from "@/lib/db";
import { findVisit, mintVisitLink } from "@/lib/visits";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
// Friday 20.11.2026, noon in Tallinn: the 3rd is behind, the 8th of December ahead
const NOW = at("2026-11-20", "12:00");
const BEFORE = "2026-11-03";
const AHEAD = "2026-12-08";
const ACTOR = "test-admin";
const DEV = { NODE_ENV: "test", VITEST: "true", ALLOW_INDEXING: "yes" };
const PHONE = "+37255550601";
const PHONE2 = "+37255550602";
const EMAIL = "anna.anon@example.test";

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

/** A login with the rights its role had before there were rights. */
async function login(role: "owner" | "admin" | "staff", name: string) {
  const [u] = await query<{ id: string }>("insert into users (business_id, email, name, role) values ($1, $2, $3, $4) returning id", [demo.business.id, `${name.toLowerCase()}@example.test`, name, role]);
  return { ...legacyHolder(role, u.id), name };
}
const without = <H extends Holder>(h: H, off: string[]): H => ({ ...h, rights: { ...h.rights, on: new Set([...h.rights.on].filter((k) => !off.includes(k))) } });

let n = 0;
/** A visit made by the staff; `force` books it whatever the hours, as the admin may. */
async function visit(clientId: string, date: string, time = "12:00", staff = "renat") {
  const r = await adminCreateVisit(
    demo.business,
    { staffId: demo.staff[staff], start: at(date, time), serviceIds: [demo.services.clip], clientId, idempotencyKey: `client-anon-${++n}-${Math.random()}`, force: true },
    ACTOR,
  );
  if (!r.ok) throw new Error(`booking failed: ${r.code}`);
  return r;
}

/** Anna, with everything a card can carry, a visit she came to, a product she bought and what was sent to her. */
async function anna() {
  const id = await add({
    name: "Anna Anonüüm",
    phone: "5555 0601",
    phone2: "5555 0602",
    email: EMAIL,
    birthday: "14.03.1990",
    gender: "female",
    importance: "gold",
    cardNo: "CARD-0601",
    discountPct: 10,
    note: "просит тихую музыку",
    labels: ["VIP"],
    noOnline: true,
  });
  await query("update clients set altegio_id = 'altegio-test-0601' where id = $1", [id]);
  const came = await visit(id, BEFORE);
  await adminSetStatus(demo.business, came.id, "done", ACTOR);
  await query("update appointments set client_comment = 'позвоните Анне', staff_note = 'Анна, аллергия' where id = $1", [came.id]);
  await query(
    `insert into product_sales (business_id, ref, staff_id, mode, shop_product_id, name, qty, unit_cents, list_cents, vat_bp, total_cents, client_id)
     values ($1, 'anon-test-sale-01', $2, 'client', 'p1', 'Wax', 1, 1500, 1500, 2400, 1500, $3)`,
    [demo.business.id, demo.staff.renat, id],
  );
  await addComment(demo.business, id, "Анна просила звонить после шести", { id: ACTOR, name: "Desk" });
  await saveClientPhoto(demo.business, id, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]), ACTOR);
  const file = await addFile(demo.business, id, { name: "anna.txt", type: "text/plain", bytes: new TextEncoder().encode("Anna Anonüüm, +372 5555 0601") }, { id: ACTOR, name: "Desk" });
  if (!file.ok) throw new Error(`file: ${file.code}`);
  return { id, came };
}

describe("anonymising a client with a history", () => {
  it("clears every field of his card, keeps his visits, sales and numbers, and stays in the database", async () => {
    const desk = await login("admin", "Desk");
    const { id, came } = await anna();
    const before = (await clientDetail(query, demo.business, id, NOW))!;
    expect(await deleteClient(demo.business, id, desk.id, desk)).toEqual({ ok: false, code: "has_history" });

    expect(await anonymiseClient(demo.business, id, desk.id, desk, NOW)).toEqual({ ok: true });

    const [c] = await query<Record<string, unknown>>("select * from clients where id = $1", [id]);
    expect(c).toMatchObject({
      name: ANON_NAME,
      phone_e164: null,
      phone2_e164: null,
      email: null,
      birth_day: null,
      birth_month: null,
      birth_year: null,
      gender: null,
      importance: null,
      card_no: "",
      discount_pct: 0,
      staff_note: "",
      labels: [],
      altegio_id: null,
      no_online: false,
      sms_opt_out: true,
      email_opt_out: true,
      push_opt_out: true,
      marketing_opt_out: true,
      notify_off: [...CLIENT_KINDS],
      merged_into: null,
    });
    expect(new Date(c.anonymised_at as string).getTime()).toBe(NOW);
    // nothing that names him is left in his row
    for (const s of ["Anna", "Anonüüm", "0601", "0602", "example.test", "CARD", "VIP", "музык", "altegio-test"]) expect(JSON.stringify(c), s).not.toContain(s);

    // his photo, files and the comments about him are gone
    for (const table of ["client_photo", "client_files", "client_comments"]) expect(await query(`select 1 from ${table} where client_id = $1`, [id]), table).toHaveLength(0);
    expect(await listComments(query, demo.business.id, id)).toEqual([]);
    expect(await listFiles(query, demo.business.id, id)).toEqual([]);

    // his visit stays, with its barber, service, price and status; what was written on it goes
    const [v] = await query<{ client_id: string; staff_id: string; status: string; total_cents: number; client_comment: string; staff_note: string }>(
      "select client_id, staff_id, status, total_cents, client_comment, staff_note from appointments where id = $1",
      [came.id],
    );
    expect(v).toEqual({ client_id: id, staff_id: demo.staff.renat, status: "done", total_cents: came.totalCents, client_comment: "", staff_note: "" });
    expect(await query("select 1 from appointment_services where appointment_id = $1", [came.id])).toHaveLength(1);
    // the sale stays his, for the barber's invoice
    expect(await query("select client_id, total_cents from product_sales where ref = 'anon-test-sale-01'")).toEqual([{ client_id: id, total_cents: 1500 }]);

    // his card opens from his visits: the placeholder, his numbers and history as they were
    const after = (await clientDetail(query, demo.business, id, NOW))!;
    expect(after).toMatchObject({ name: ANON_NAME, phone: null, phone2: null, email: null, note: "", labels: [], birthday: null, cardNo: "", photoV: null, anonymisedAt: NOW });
    expect([after.visits, after.soldCents, after.soldVisits, after.firstVisit, after.lastVisit]).toEqual([before.visits, before.soldCents, before.soldVisits, before.firstVisit, before.lastVisit]);
    expect(after.history.map((h) => h.id)).toEqual(before.history.map((h) => h.id));
    expect((await clientStats(query, demo.business, id, defaultStatsPeriod(TZ, NOW), NOW))?.visits).toBe(1);
    expect(shownName(after.name, "Обезличенный клиент")).toBe("Обезличенный клиент");
    expect(shownName("Anna", "Обезличенный клиент")).toBe("Anna");
  });

  it("the database holds an anonymised row to it: no phone, e-mail, note or name comes back", async () => {
    const { id } = await anna();
    await anonymiseClient(demo.business, id, ACTOR, undefined, NOW);
    for (const set of [`phone_e164 = '${PHONE}'`, `email = '${EMAIL}'`, "staff_note = 'x'", "name = 'Anna Anonüüm'", "birth_day = 1, birth_month = 1"]) {
      await expect(query(`update clients set ${set} where id = $1`, [id]), set).rejects.toThrow();
    }
  });

  it("his visits' links, the phones turned on for them and his reviews' name go; the reviews keep their stars and words", async () => {
    const { id, came } = await anna();
    const token = await mintVisitLink(query, came.id, "sms");
    expect(await findVisit(query, demo.business.id, token)).not.toBeNull();
    await saveClientSubscription(query, demo.business.id, came.id, { endpoint: "https://fcm.googleapis.com/fcm/send/test-anon-phone-0601", p256dh: "p256dh-test", auth: "auth-test", label: "Android" });
    await query(
      "insert into reviews (business_id, rating, body, author_name, client_id, staff_id, appointment_id, created_at) values ($1, 5, 'Отличная стрижка', 'Anna A.', $2, $3, $4, now())",
      [demo.business.id, id, demo.staff.renat, came.id],
    );

    await anonymiseClient(demo.business, id, ACTOR, undefined, NOW);

    expect(await findVisit(query, demo.business.id, token)).toBeNull();
    expect(await query("select 1 from visit_links where appointment_id = $1", [came.id])).toHaveLength(0);
    expect(await query("select manage_token_hash from appointments where id = $1", [came.id])).toEqual([{ manage_token_hash: null }]);
    const [sub] = await query<{ retired_at: Date | null; retired_reason: string | null }>("select retired_at, retired_reason from client_push_subscriptions where appointment_id = $1", [came.id]);
    expect(sub.retired_reason).toBe("anonymised");
    expect(sub.retired_at).not.toBeNull();
    expect(await query("select rating, body, author_name, client_id from reviews")).toEqual([{ rating: 5, body: "Отличная стрижка", author_name: "", client_id: id }]);
  });
});

describe("what is refused", () => {
  it("a client with a visit ahead: the salon cancels or moves it first; nothing is changed until then", async () => {
    const { id } = await anna();
    const ahead = await visit(id, AHEAD, "11:00");
    expect(await anonymiseClient(demo.business, id, ACTOR, undefined, NOW)).toEqual({ ok: false, code: "upcoming" });
    expect((await clientDetail(query, demo.business, id, NOW))!).toMatchObject({ name: "Anna Anonüüm", phone: PHONE, anonymisedAt: null });
    expect(await listComments(query, demo.business.id, id)).toHaveLength(1);
    expect(await query("select 1 from audit where action = 'anonymise'")).toHaveLength(0);

    // a pending one counts too; a visit that has begun does not
    await adminCancelVisit(demo.business, ahead.id, ACTOR);
    const waiting = await visit(id, AHEAD, "15:00");
    await query("update appointments set status = 'pending' where id = $1", [waiting.id]);
    expect(await anonymiseClient(demo.business, id, ACTOR, undefined, NOW)).toEqual({ ok: false, code: "upcoming" });
    await adminCancelVisit(demo.business, waiting.id, ACTOR);
    await visit(id, "2026-11-20", "11:30");
    expect(await anonymiseClient(demo.business, id, ACTOR, undefined, NOW)).toEqual({ ok: true });
  });

  it("without «Удалять клиентов», or a client the login does not see: refused, nothing changed", async () => {
    const desk = await login("admin", "Desk");
    const barber = await login("staff", "Barber");
    const { id } = await anna();
    expect(await anonymiseClient(demo.business, id, desk.id, without(desk, ["clients.delete"]), NOW)).toEqual({ ok: false, code: "forbidden" });
    expect(await anonymiseClient(demo.business, id, barber.id, barber, NOW)).toMatchObject({ ok: false });
    // with the right, but «Показывать клиентов» limited to a barber he never came to
    const limited = { ...desk, rights: { ...desk.rights, values: { ...desk.rights.values, "clients.show": [demo.staff.valentin] } } };
    expect(await anonymiseClient(demo.business, id, desk.id, limited as Holder, NOW)).toEqual({ ok: false, code: "not_found" });
    expect((await clientDetail(query, demo.business, id, NOW))!.name).toBe("Anna Anonüüm");
    expect(await query("select 1 from audit where action = 'anonymise'")).toHaveLength(0);
  });

  it("twice: the second time is «already», with no second audit row; not ours, merged away or no such client: not found", async () => {
    const { id } = await anna();
    expect(await anonymiseClient(demo.business, id, ACTOR, undefined, NOW)).toEqual({ ok: true });
    expect(await anonymiseClient(demo.business, id, ACTOR, undefined, NOW)).toEqual({ ok: false, code: "already" });
    expect(await query("select 1 from audit where action = 'anonymise'")).toHaveLength(1);

    const [other] = await query<{ id: string }>("insert into businesses (slug, name) values ('other-salon', 'Other') returning id");
    const [theirs] = await query<{ id: string }>("insert into clients (business_id, name) values ($1, 'Their Client') returning id", [other.id]);
    expect(await anonymiseClient(demo.business, theirs.id, ACTOR, undefined, NOW)).toEqual({ ok: false, code: "not_found" });
    expect(await anonymiseClient(demo.business, "not-a-uuid", ACTOR, undefined, NOW)).toEqual({ ok: false, code: "not_found" });
    expect(await anonymiseClient(demo.business, "00000000-0000-4000-8000-000000000000", ACTOR, undefined, NOW)).toEqual({ ok: false, code: "not_found" });
    const kept = await add({ name: "Kept One" });
    const old = await add({ name: "Old One" });
    await query("update clients set merged_into = $2 where id = $1", [old, kept]);
    expect(await anonymiseClient(demo.business, old, ACTOR, undefined, NOW)).toEqual({ ok: false, code: "not_found" });
  });

  it("nothing is written to him again: his card, a comment, a photo, a file, the barber's note, a new visit", async () => {
    const { id, came } = await anna();
    await anonymiseClient(demo.business, id, ACTOR, undefined, NOW);
    expect(await saveClient(demo.business, id, { name: "Anna Again" }, ACTOR)).toEqual({ ok: false, field: "id" });
    expect(await saveClient(demo.business, id, { phone: "5555 0601" }, ACTOR)).toEqual({ ok: false, field: "id" });
    expect(await addComment(demo.business, id, "снова", { id: ACTOR, name: "Desk" })).toEqual({ ok: false, field: "id" });
    expect(await saveClientPhoto(demo.business, id, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]), ACTOR)).toEqual({ ok: false, field: "id" });
    expect(await addFile(demo.business, id, { name: "a.txt", type: "text/plain", bytes: new TextEncoder().encode("x") }, { id: ACTOR, name: "Desk" })).toEqual({ ok: false, code: "not_found" });
    expect(await setClientNote(demo.business, demo.staff.renat, ACTOR, id, "новая заметка")).toBe(false);
    const again = await adminCreateVisit(
      demo.business,
      { staffId: demo.staff.renat, start: at(AHEAD, "12:00"), serviceIds: [demo.services.clip], clientId: id, idempotencyKey: `client-anon-again-${Math.random()}`, force: true },
      ACTOR,
    );
    expect(again).toEqual({ ok: false, code: "invalid", field: "client" });
    expect(await query("select 1 from appointments where client_id = $1", [id])).toHaveLength(1);
    expect(came.ok).toBe(true);
    // his old phone is free: a new booking with it is a new client
    expect((await saveClient(demo.business, null, { name: "Anna New", phone: "5555 0601" }, ACTOR)).ok).toBe(true);
  });

  it("nobody may be called by the mark: not on the card, not for a new visit, not online", async () => {
    expect(await saveClient(demo.business, null, { name: ANON_NAME }, ACTOR)).toEqual({ ok: false, field: "name" });
    expect(await saveClient(demo.business, null, { name: `  ${ANON_NAME} ` }, ACTOR)).toEqual({ ok: false, field: "name" });
    const walkIn = await adminCreateVisit(
      demo.business,
      { staffId: demo.staff.renat, start: at(AHEAD, "12:00"), serviceIds: [demo.services.clip], name: ANON_NAME, idempotencyKey: `client-anon-mark-${Math.random()}`, force: true },
      ACTOR,
    );
    expect(walkIn).toEqual({ ok: false, code: "invalid", field: "name" });
    const online: BookingInput = {
      serviceIds: [demo.services.clip],
      staffId: demo.staff.renat,
      startsAt: new Date(at(AHEAD, "12:00")).toISOString(),
      name: ANON_NAME,
      phone: "+372 5555 0603",
      locale: "ru",
      smsReminder: true,
      idempotencyKey: `client-anon-online-${Math.random()}`,
    };
    expect(validateBooking(online)).toEqual({ ok: false, field: "name" });
    expect(validateBooking({ ...online, name: "Anna — Test" }).ok).toBe(true);
  });
});

describe("the clients merged into him", () => {
  it("are anonymised with him: their old names, phones, visits and messages", async () => {
    const { id } = await anna();
    const old = await add({ name: "Anna Old Name", phone: "5555 0604", email: "anna.old@example.test", note: "старая карточка" });
    const oldVisit = await visit(old, "2026-10-20", "12:00");
    await query("update appointments set client_comment = 'Анна, старый номер' where id = $1", [oldVisit.id]);
    await query(
      "insert into notifications (business_id, appointment_id, channel, kind, recipient, locale, payload, status, sent_at) values ($1, $2, 'sms', 'reminder', '+37255550604', 'ru', '{\"client\": \"Anna Old Name\"}', 'sent', now())",
      [demo.business.id, oldVisit.id],
    );
    await query("update clients set merged_into = $2 where id = $1", [old, id]);
    // and one merged into that one
    const older = await add({ name: "Anna Oldest", phone: "5555 0605" });
    await query("update clients set merged_into = $2 where id = $1", [older, old]);

    expect(await anonymiseClient(demo.business, id, ACTOR, undefined, NOW)).toEqual({ ok: true });

    const rows = await query<{ id: string; name: string; phone_e164: string | null; email: string | null; staff_note: string; merged_into: string | null; anonymised: boolean }>(
      "select id, name, phone_e164, email, staff_note, merged_into, anonymised_at is not null as anonymised from clients where id = any($1::uuid[]) order by created_at",
      [[id, old, older]],
    );
    expect(rows).toEqual([
      { id, name: ANON_NAME, phone_e164: null, email: null, staff_note: "", merged_into: null, anonymised: true },
      { id: old, name: ANON_NAME, phone_e164: null, email: null, staff_note: "", merged_into: id, anonymised: true },
      { id: older, name: ANON_NAME, phone_e164: null, email: null, staff_note: "", merged_into: old, anonymised: true },
    ]);
    expect(await query("select client_comment from appointments where id = $1", [oldVisit.id])).toEqual([{ client_comment: "" }]);
    expect(await query("select recipient, payload from notifications where appointment_id = $1", [oldVisit.id])).toEqual([{ recipient: "", payload: {} }]);
    // one audit row each; his own says how many went with him
    const audit = await query<{ entity_id: string; after: unknown }>("select entity_id, after from audit where action = 'anonymise' order by entity_id");
    expect(audit).toHaveLength(3);
    expect(audit.find((a) => a.entity_id === id)?.after).toEqual({ by: "admin", merged: 2 });
  });
});

describe("nobody finds him, nothing offers him for a message", () => {
  it("the list, the calendar's search, the barber's search, the mass message", async () => {
    const owner = await login("owner", "Owner");
    const { id } = await anna();
    const find = async () => ({
      byName: (await listClients(query, demo.business.id, { q: "Anna" }, NOW)).total,
      byPhone: (await listClients(query, demo.business.id, { q: "5555 0601" }, NOW)).total,
      bySecond: (await listClients(query, demo.business.id, { q: "55550602" }, NOW)).total,
      all: (await listClients(query, demo.business.id, {}, NOW)).total,
      calendar: (await searchClients(query, demo.business.id, "Anna")).length + (await searchClients(query, demo.business.id, "5555 0601")).length,
      barber: (await searchMyClients(query, demo.business.id, demo.staff.renat, "Anna")).length + (await searchMyClients(query, demo.business.id, demo.staff.renat, "55550601")).length,
      ticked: await bulkCount(query, demo.business, { ids: [id] }, NOW),
      mass: (await massPreview(query, demo.business, { filter: {} }, NOW, DEV, owner)).clients,
    });
    expect(await find()).toEqual({ byName: 1, byPhone: 1, bySecond: 1, all: 1, calendar: 2, barber: 2, ticked: 1, mass: 1 });

    await anonymiseClient(demo.business, id, owner.id, owner, NOW);

    expect(await find()).toEqual({ byName: 0, byPhone: 0, bySecond: 0, all: 0, calendar: 0, barber: 0, ticked: 0, mass: 0 });
    // the mark itself finds nobody either
    expect((await listClients(query, demo.business.id, { q: ANON_NAME }, NOW)).total).toBe(0);
    expect(await queueMassMessage(demo.business, { ids: [id] }, { text: "Скидки", channels: ["sms", "email"] }, owner, NOW, DEV)).toEqual({ ok: false, code: "nobody" });
    expect(await queueClientMessage(demo.business, id, { text: "Привет", channels: ["email"] }, ACTOR, NOW, DEV)).toMatchObject({ ok: false });
  });
});

describe("the outbox and «Сообщения»", () => {
  it("cancels what has not gone, takes his phone, address, name and the words written to him off what went", async () => {
    const owner = await login("owner", "Owner");
    const barber = await login("staff", "Renat Login");
    const { id, came } = await anna();
    // a letter written to him by hand, still in the queue
    const manual = await queueClientMessage(demo.business, id, { text: "Анна, ваш заказ готов", channels: ["email"] }, ACTOR, NOW, DEV);
    if (!manual.ok) throw new Error(manual.code);
    // a reminder SMS that went in the salon's own words, naming him
    await query(
      "insert into notifications (business_id, appointment_id, channel, kind, recipient, locale, payload, status, sent_at, provider, segments, last_error) values ($1, $2, 'sms', 'reminder', $3, 'ru', $4::jsonb, 'sent', now(), 'messaggio', 1, null)",
      [demo.business.id, came.id, PHONE, JSON.stringify({ client: "Anna", staff: "Renat", template: "Hi {client}" })],
    );
    // a review request about his visit, queued, and one that failed with his number in the error
    await query("insert into notifications (business_id, appointment_id, client_id, channel, kind, recipient, locale, payload) values ($1, $2, $3, 'email', 'review_request', $4, 'ru', '{}')", [demo.business.id, came.id, id, EMAIL]);
    await query("insert into notifications (business_id, client_id, channel, kind, recipient, locale, payload, status, last_error) values ($1, $2, 'sms', 'birthday', $3, 'ru', '{}', 'failed', $4)", [demo.business.id, id, PHONE2, `refused ${PHONE2}`]);
    // the barber's own notification about the visit named him
    await query("insert into notifications (business_id, appointment_id, channel, kind, recipient, user_id, locale, payload, status) values ($1, $2, 'push', 'visit_new', $3, $4, 'ru', $5::jsonb, 'sent')", [
      demo.business.id,
      came.id,
      barber.id,
      barber.id,
      JSON.stringify({ client: "Anna Anonüüm", staff: "Renat", visitId: came.id }),
    ]);
    const all = cleanMessages({ ...defaultMessages("2026-11-20"), from: "2025-01-01", to: "2027-12-31" });
    expect((await listMessageLog(query, demo.business, { ...all, q: "Anna" }, owner)).total).toBe(4);

    await anonymiseClient(demo.business, id, ACTOR, undefined, NOW);

    const rows = await query<{ kind: string; channel: string; status: string; recipient: string; payload: Record<string, unknown>; last_error: string | null; user_id: string | null }>(
      "select kind, channel, status, recipient, payload, last_error, user_id from notifications order by kind",
    );
    expect(rows).toEqual([
      { kind: "birthday", channel: "sms", status: "failed", recipient: "", payload: {}, last_error: null, user_id: null },
      { kind: "manual", channel: "email", status: "cancelled", recipient: "", payload: { subject: demo.business.name }, last_error: null, user_id: null },
      { kind: "reminder", channel: "sms", status: "sent", recipient: "", payload: { staff: "Renat", template: "Hi {client}" }, last_error: null, user_id: null },
      { kind: "review_request", channel: "email", status: "cancelled", recipient: "", payload: {}, last_error: null, user_id: null },
      { kind: "visit_new", channel: "push", status: "sent", recipient: barber.id, payload: { staff: "Renat", visitId: came.id }, last_error: null, user_id: barber.id },
    ]);
    for (const r of rows) for (const s of ["Anna", "0601", "0602", "example.test"]) expect(JSON.stringify(r), `${r.kind}: ${s}`).not.toContain(s);

    // the report keeps the rows, with no phone, no address and no name; his phone or name finds nothing
    const log = await listMessageLog(query, demo.business, all, owner);
    const his = log.rows.filter((r) => !r.toStaff);
    expect(his).toHaveLength(4);
    for (const r of his) expect([r.contact, r.name, r.clientId], r.kind).toEqual([null, null, id]);
    for (const q of ["Anna", "5555 0601", "55550602", "anna.anon"]) expect((await listMessageLog(query, demo.business, { ...all, q }, owner)).total, q).toBe(0);
  });
});

describe("«Изменения данных»", () => {
  it("one row: who anonymised, «anonymise», never whom by name; his older rows lose his name too", async () => {
    const desk = await login("admin", "Desk");
    const owner = await login("owner", "Owner");
    const { id } = await anna();
    const list = async () => (await listChanges(query, demo.business, cleanChanges({ ...defaultChanges("2026-11-23"), from: "2025-01-01", to: "2027-12-31", entity: "client" }), owner)).rows;
    expect((await list()).some((r) => r.object.name === "Anna Anonüüm")).toBe(true);

    await anonymiseClient(demo.business, id, desk.id, desk, NOW);

    const [a] = await query<{ actor: string; entity: string; entity_id: string; action: string; before: unknown; after: unknown }>(
      "select actor, entity, entity_id, action, before, after from audit where action = 'anonymise'",
    );
    expect(a).toEqual({ actor: desk.id, entity: "client", entity_id: id, action: "anonymise", before: null, after: { by: "admin" } });
    const rows = await list();
    const row = rows.find((r) => r.action === "anonymise")!;
    expect(row).toMatchObject({ entity: "client", entityId: id, author: { kind: "login", name: "Desk" }, object: { name: null } });
    expect(row.fields).toEqual([{ key: "by", before: null, after: { t: "text", v: "admin" } }]);
    // every row about him: no name, no phone
    for (const r of rows.filter((x) => x.entityId === id)) expect(JSON.stringify(r)).not.toMatch(/Anna|0601|example\.test/);
  });
});
