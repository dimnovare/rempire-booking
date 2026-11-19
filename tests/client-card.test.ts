/**
 * The client's full card (018_client_card.sql; src/lib/admin/clients.ts,
 * client-card.ts, src/lib/client-notify.ts): the new fields and the
 * birthday without a year, «no online booking», the notification switches
 * in the outbox, comments, the photo, files with their limits and kinds,
 * messages written by hand, statistics, and deleting a client. Fake people
 * only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as bookRoute } from "@/app/api/bookings/route";
import {
  addComment,
  addFile,
  checkFile,
  cleanFileName,
  cleanStatsPeriod,
  clientFile,
  clientPhoto,
  clientReach,
  clientStats,
  COMMENT_MAX,
  defaultStatsPeriod,
  deleteComment,
  deleteFile,
  FILE_MAX_BYTES,
  FILES_MAX,
  listComments,
  listFiles,
  listMessages,
  MESSAGE_MAX,
  queueClientMessage,
  removeClientPhoto,
  saveClientPhoto,
  STATS_MONTHS_MAX,
} from "@/lib/admin/client-card";
import { clientDetail, deleteClient, listClients, saveClient, type ClientInput } from "@/lib/admin/clients";
import { adminCancelVisit, adminCreateVisit, adminSetStatus, adminUpdateVisit } from "@/lib/admin/visits";
import { birthdayText, parseBirthday } from "@/lib/birthday";
import { book, type BookingInput } from "@/lib/booking";
import { CLIENT_KINDS } from "@/lib/client-notify";
import { saveClientSubscription } from "@/lib/client-push";
import { closeDb, query } from "@/lib/db";
import { sentToConsole } from "@/lib/email";
import { planReminders, runOutbox, sendForVisit, type Senders } from "@/lib/outbox";
import type { PushText } from "@/lib/push-kinds";
import { sentSms } from "@/lib/sms";
import { TEST_INBOX } from "@/lib/test-run";
import { addDays, todayIn, zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
// Monday 16.11.2026, 10:00 in Tallinn; Renat works the Tuesday after it
const NOW = at("2026-11-16", "10:00");
const TUE = "2026-11-17";
const LATER = at("2026-11-30", "12:00");
const ACTOR = "test-admin";
const DEV = { NODE_ENV: "test", VITEST: "true", ALLOW_INDEXING: "yes" };
// test values only: pushConfigured() needs both to be there, nothing is sent with them
const KEYS = { VAPID_PUBLIC_KEY: "test-public-key", VAPID_PRIVATE_KEY: "test-private-key" };
const PHONE = { endpoint: "https://fcm.googleapis.com/fcm/send/test-client-phone-0018", p256dh: "p256dh-test", auth: "auth-test", label: "Android" };

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
  sentSms.length = 0;
  sentToConsole.length = 0;
});
afterAll(closeDb);

async function add(input: ClientInput): Promise<string> {
  const r = await saveClient(demo.business, null, input, ACTOR);
  if (!r.ok) throw new Error(`client not added: ${r.field}`);
  return r.id;
}
const card = async (id: string, now = LATER) => (await clientDetail(query, demo.business, id, now))!;

/** A login, for what keeps who did it by id. */
async function login(role: "owner" | "admin" | "staff", name: string): Promise<{ id: string; name: string; role: string }> {
  const [u] = await query<{ id: string }>("insert into users (business_id, email, name, role) values ($1, $2, $3, $4) returning id", [demo.business.id, `${name.toLowerCase()}@example.test`, name, role]);
  return { id: u.id, name, role };
}

let n = 0;
/** A visit made by the staff; `force` books it whatever the hours, as the admin may. */
async function visit(clientId: string, o: { staff?: string; date?: string; time?: string; service?: string } = {}) {
  const r = await adminCreateVisit(
    demo.business,
    { staffId: demo.staff[o.staff ?? "renat"], start: at(o.date ?? TUE, o.time ?? "12:00"), serviceIds: [demo.services[o.service ?? "clip"]], clientId, idempotencyKey: `client-card-${++n}-${Math.random()}`, force: true },
    ACTOR,
  );
  if (!r.ok) throw new Error(`booking failed: ${r.code}`);
  return r;
}

/** An online booking, as the booking page sends it. */
const online = (o: Partial<BookingInput> & { date?: string; time?: string } = {}): BookingInput => ({
  serviceIds: [demo.services.clip],
  staffId: demo.staff.renat,
  startsAt: new Date(at(o.date ?? TUE, o.time ?? "12:00")).toISOString(),
  name: "Test Client",
  phone: "+372 5555 0101",
  email: null,
  comment: "",
  locale: "ru",
  smsReminder: true,
  idempotencyKey: `client-card-online-${++n}-${Math.random()}`,
  ...o,
});

const outbox = (kind?: string) =>
  query<{ id: string; kind: string; channel: string; status: string; recipient: string; client_id: string | null; appointment_id: string | null; payload: Record<string, unknown> }>(
    `select id, kind, channel, status, recipient, client_id, appointment_id, payload from notifications ${kind ? "where kind = $1" : ""} order by created_at, channel`,
    kind ? [kind] : [],
  );

describe("the birthday: the year may be unknown", () => {
  const TODAY = "2026-11-19";
  const ok = (value: unknown) => ({ ok: true, value });

  it("reads what is typed, with a year or without", () => {
    expect(parseBirthday("14.03.1990", TODAY)).toEqual(ok({ day: 14, month: 3, year: 1990 }));
    expect(parseBirthday("14.03", TODAY)).toEqual(ok({ day: 14, month: 3, year: null }));
    expect(parseBirthday("14.03.", TODAY)).toEqual(ok({ day: 14, month: 3, year: null }));
    expect(parseBirthday("  1/2/2000 ", TODAY)).toEqual(ok({ day: 1, month: 2, year: 2000 }));
    expect(parseBirthday("7 . 9", TODAY)).toEqual(ok({ day: 7, month: 9, year: null }));
    // what a date picker gives
    expect(parseBirthday("1990-03-14", TODAY)).toEqual(ok({ day: 14, month: 3, year: 1990 }));
    // nothing typed is «no birthday», not an error
    expect(parseBirthday("", TODAY)).toEqual(ok(null));
    expect(parseBirthday("   ", TODAY)).toEqual(ok(null));
    expect(parseBirthday(null, TODAY)).toEqual(ok(null));
  });

  it("29 February: fine without a year, with a year only in a leap one", () => {
    expect(parseBirthday("29.02", TODAY)).toEqual(ok({ day: 29, month: 2, year: null }));
    expect(parseBirthday("29.02.2024", TODAY)).toEqual(ok({ day: 29, month: 2, year: 2024 }));
    expect(parseBirthday("29.02.2000", TODAY)).toEqual(ok({ day: 29, month: 2, year: 2000 }));
    expect(parseBirthday("29.02.2023", TODAY)).toEqual({ ok: false });
    expect(parseBirthday("29.02.1900", TODAY)).toEqual({ ok: false });
  });

  it("refuses what is not a day of the calendar, a two-digit year, a year too far back and a day still to come", () => {
    for (const bad of ["31.04", "30.02", "0.5", "5.0", "12.13", "32.01", "14.03.90", "14.03.1899", "14 марта", "abc", "14", "14.03.1990.1"]) {
      expect(parseBirthday(bad, TODAY), bad).toEqual({ ok: false });
    }
    // today is the last day anyone can have been born
    expect(parseBirthday("19.11.2026", TODAY)).toEqual(ok({ day: 19, month: 11, year: 2026 }));
    expect(parseBirthday("20.11.2026", TODAY)).toEqual({ ok: false });
    // without a year a day «still to come» is somebody's birthday
    expect(parseBirthday("31.12", TODAY)).toEqual(ok({ day: 31, month: 12, year: null }));
  });

  it("is written as it was typed", () => {
    expect(birthdayText({ day: 4, month: 3, year: 1990 })).toBe("04.03.1990");
    expect(birthdayText({ day: 4, month: 3, year: null })).toBe("04.03");
    expect(birthdayText(null)).toBe("");
  });

  it("is kept on the client: no year is no year, not a made-up one", async () => {
    const id = await add({ name: "Anna Näidis", birthday: "14.03" });
    expect((await card(id)).birthday).toEqual({ day: 14, month: 3, year: null });
    expect(await query("select birth_day, birth_month, birth_year from clients where id = $1", [id])).toEqual([{ birth_day: 14, birth_month: 3, birth_year: null }]);
    // the year is learnt later
    expect(await saveClient(demo.business, id, { birthday: "14.03.1990" }, ACTOR)).toEqual({ ok: true, id });
    expect((await card(id)).birthday).toEqual({ day: 14, month: 3, year: 1990 });
    // and taken out again
    expect(await saveClient(demo.business, id, { birthday: "" }, ACTOR)).toEqual({ ok: true, id });
    expect((await card(id)).birthday).toBeNull();
    expect(await saveClient(demo.business, id, { birthday: "30.02" }, ACTOR)).toEqual({ ok: false, field: "birthday" });
    // «tomorrow» is by the salon's clock at the moment of saving
    const tomorrow = addDays(todayIn(TZ, NOW), 1).split("-").reverse().join(".");
    expect(await saveClient(demo.business, id, { birthday: tomorrow }, ACTOR, NOW)).toEqual({ ok: false, field: "birthday" });
    // the database refuses a day that is none, whatever the code does
    await expect(query("update clients set birth_day = 31, birth_month = 4 where id = $1", [id])).rejects.toThrow();
    await expect(query("update clients set birth_year = 1990 where id = $1", [id])).rejects.toThrow();
  });
});

describe("the card's new fields", () => {
  it("keeps each of them, cleaned; the audit names the columns, never the values", async () => {
    const id = await add({ name: "Anna Näidis", phone: "+372 5555 0101" });
    expect(await card(id)).toMatchObject({ phone2: null, birthday: null, gender: null, importance: null, cardNo: "", discountPct: 0, noOnline: false, marketingOptOut: false, pushOptOut: false, notifyOff: [], photoV: null });
    expect(
      await saveClient(
        demo.business,
        id,
        { phone2: "5555 0102", birthday: "14.03", gender: "female", importance: "gold", cardNo: "  A   17 ", discountPct: 15, noOnline: true, marketingOptOut: true, pushOptOut: true, notifyOff: ["cancelled", "reminder", "reminder"] },
        ACTOR,
      ),
    ).toEqual({ ok: true, id });
    expect(await card(id)).toMatchObject({
      phone: "+37255550101",
      phone2: "+37255550102",
      birthday: { day: 14, month: 3, year: null },
      gender: "female",
      importance: "gold",
      cardNo: "A 17",
      discountPct: 15,
      noOnline: true,
      marketingOptOut: true,
      pushOptOut: true,
      // in the list's own order, each once
      notifyOff: ["reminder", "cancelled"],
    });
    // emptied again
    expect(await saveClient(demo.business, id, { phone2: "", gender: "", importance: null, cardNo: "", discountPct: 0, noOnline: false, notifyOff: [] }, ACTOR)).toEqual({ ok: true, id });
    expect(await card(id)).toMatchObject({ phone2: null, gender: null, importance: null, cardNo: "", discountPct: 0, noOnline: false, notifyOff: [], marketingOptOut: true });

    const audit = await query<{ action: string; after: { changed?: string[] } }>("select action, after from audit where entity = 'client' and entity_id = $1 order by id", [id]);
    expect(audit.map((a) => [a.action, a.after.changed ?? null])).toEqual([
      ["create", null],
      ["edit", ["phone2_e164", "birth_day", "birth_month", "gender", "importance", "card_no", "discount_pct", "no_online", "marketing_opt_out", "push_opt_out", "notify_off"]],
      ["edit", ["phone2_e164", "gender", "importance", "card_no", "discount_pct", "no_online", "notify_off"]],
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/Anna|5555|A 17/);
  });

  it("a new client may come with all of them", async () => {
    const id = await add({ name: "Boris Sample", phone: "5555 0103", phone2: "5555 0104", birthday: "01.02.1985", gender: "male", importance: "bronze", cardNo: "77", discountPct: 100, noOnline: true, notifyOff: ["moved"] });
    expect(await card(id)).toMatchObject({ phone2: "+37255550104", birthday: { day: 1, month: 2, year: 1985 }, gender: "male", importance: "bronze", cardNo: "77", discountPct: 100, noOnline: true, notifyOff: ["moved"] });
  });

  it("refuses what cannot be saved, by the field's name, and saves none of the change", async () => {
    const id = await add({ name: "Anna Näidis", phone: "+372 5555 0101" });
    const bad = (input: ClientInput) => saveClient(demo.business, id, { name: "Changed", ...input }, ACTOR);
    expect(await bad({ phone2: "12" })).toEqual({ ok: false, field: "phone2" });
    expect(await bad({ birthday: "31.02" })).toEqual({ ok: false, field: "birthday" });
    expect(await bad({ gender: "other" })).toEqual({ ok: false, field: "gender" });
    expect(await bad({ importance: "platinum" })).toEqual({ ok: false, field: "importance" });
    expect(await bad({ cardNo: "9".repeat(41) })).toEqual({ ok: false, field: "cardNo" });
    for (const pct of [-1, 101, 12.5, Number.NaN, "15" as unknown as number]) expect(await bad({ discountPct: pct }), String(pct)).toEqual({ ok: false, field: "discount" });
    expect(await bad({ notifyOff: ["manual"] })).toEqual({ ok: false, field: "notify" });
    expect(await bad({ notifyOff: "reminder" as unknown as string[] })).toEqual({ ok: false, field: "notify" });
    expect((await card(id)).name).toBe("Anna Näidis");
    // the longest card number that fits, and both ends of the discount
    expect(await bad({ cardNo: "9".repeat(40), discountPct: 0 })).toEqual({ ok: true, id });
    expect(await bad({ discountPct: 100 })).toEqual({ ok: true, id });
  });

  it("the second phone is another number than the first", async () => {
    const id = await add({ name: "Anna Näidis", phone: "+372 5555 0101", phone2: "5555 0101" });
    expect((await card(id)).phone2).toBeNull();
    expect(await saveClient(demo.business, id, { phone2: "+372 5555 0102" }, ACTOR)).toEqual({ ok: true, id });
    // the first phone becomes the second's number: one number, kept once
    expect(await saveClient(demo.business, id, { phone: "5555 0102" }, ACTOR)).toEqual({ ok: true, id });
    expect(await card(id)).toMatchObject({ phone: "+37255550102", phone2: null });
    // two clients may share a second phone (a parent's): it is not a key
    const other = await add({ name: "Boris Sample", phone2: "+372 5555 0102" });
    expect((await card(other)).phone2).toBe("+37255550102");
  });

  it("the discount is stored and shown only: a visit costs what it costs", async () => {
    const id = await add({ name: "Anna Näidis", phone: "+372 5555 0101", discountPct: 50 });
    const plain = await add({ name: "Boris Sample" });
    // booked by the staff
    expect((await visit(id, { time: "12:00" })).totalCents).toBe((await visit(plain, { time: "14:00" })).totalCents);
    // booked online with his phone
    const r = await book(query, demo.business, online({ phone: "5555 0101", time: "16:00" }), { now: NOW });
    expect(r.ok && r.visit.totalCents).toBe(4000);
    expect((await card(id)).discountPct).toBe(50);
  });
});

describe("«Запретить записываться через онлайн-запись»", () => {
  const visits = () => query<{ id: string }>("select id from appointments");

  it("an online booking with his phone is refused, and never says why", async () => {
    await add({ name: "Anna Näidis", phone: "+372 5555 0101", phone2: "+372 5555 0102", noOnline: true });
    // «invalid» with no field: what the booking page shows as its plain «something went wrong»
    expect(await book(query, demo.business, online({ phone: "5555 0101" }), { now: NOW })).toEqual({ ok: false, code: "invalid" });
    // his second phone is his too
    expect(await book(query, demo.business, online({ phone: "+372 5555 0102" }), { now: NOW })).toEqual({ ok: false, code: "invalid" });
    expect(await visits()).toHaveLength(0);
    expect(await outbox()).toHaveLength(0);
    // a time that is taken gets the same answer: the refusal says nothing about the calendar either
    const other = await add({ name: "Boris Sample" });
    await visit(other, { time: "12:00" });
    expect(await book(query, demo.business, online({ phone: "5555 0101", time: "12:00" }), { now: NOW })).toEqual({ ok: false, code: "invalid" });
  });

  it("the route answers as for any refused request: 422, «invalid», no field, no reason", async () => {
    await add({ name: "Anna Näidis", phone: "+372 5555 0101", noOnline: true });
    // the route books on the real clock: a day Renat works, a week or more ahead
    let day = addDays(todayIn(TZ), 7);
    while (new Date(`${day}T12:00:00Z`).getUTCDay() !== 2) day = addDays(day, 1);
    const body = (phone: string) => ({ serviceIds: [demo.services.clip], staffId: demo.staff.renat, startsAt: new Date(at(day, "12:00")).toISOString(), name: "Test Client", phone, locale: "ru" });
    const post = (phone: string) => bookRoute(new Request("http://x/api/bookings", { method: "POST", headers: { "idempotency-key": `card-route-${Math.random()}-0001` }, body: JSON.stringify(body(phone)) }));
    const res = await post("+372 5555 0101");
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "invalid" });
    expect(await visits()).toHaveLength(0);
    // anyone else books that very time
    const r = await book(query, demo.business, { ...online({ phone: "+372 5555 0199" }), startsAt: body("").startsAt }, { now: Date.now() });
    expect(r.ok).toBe(true);
  });

  it("the staff still book him; another phone books; the ban lifted, he books again", async () => {
    const id = await add({ name: "Anna Näidis", phone: "+372 5555 0101", noOnline: true });
    // the staff, by picking him and by typing his phone
    await visit(id, { time: "10:00" });
    const typed = await adminCreateVisit(demo.business, { staffId: demo.staff.renat, start: at(TUE, "11:00"), serviceIds: [demo.services.clip], clientId: null, name: "Anna", phone: "5555 0101", idempotencyKey: `client-card-typed-${Math.random()}` }, ACTOR);
    expect(typed.ok).toBe(true);
    expect((await card(id)).visits).toBe(2);
    // somebody else, online
    expect((await book(query, demo.business, online({ phone: "5555 0177", time: "13:00" }), { now: NOW })).ok).toBe(true);
    // the switch off again
    expect(await saveClient(demo.business, id, { noOnline: false }, ACTOR)).toEqual({ ok: true, id });
    expect((await book(query, demo.business, online({ phone: "5555 0101", time: "14:00" }), { now: NOW })).ok).toBe(true);
    expect((await card(id)).visits).toBe(3);
  });

  it("another business's ban is not ours", async () => {
    const [other] = await query<{ id: string }>("insert into businesses (slug, name) values ('other-salon', 'Other') returning id");
    await query("insert into clients (business_id, name, phone_e164, no_online) values ($1, 'Their Client', '+37255550101', true)", [other.id]);
    expect((await book(query, demo.business, online({ phone: "5555 0101" }), { now: NOW })).ok).toBe(true);
  });
});

describe("the notification switches in the outbox", () => {
  /** the first Tuesday at least a week from today: the letters work on the real clock */
  const tuesday = () => {
    let d = addDays(todayIn(TZ), 7);
    while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 2) d = addDays(d, 1);
    return d;
  };
  const statuses = async (kind: string) => (await outbox(kind)).map((r) => r.status);

  it("the kinds are the four we send a client by ourselves", () => {
    expect([...CLIENT_KINDS]).toEqual(["confirmation", "reminder", "moved", "cancelled"]);
  });

  it("the SMS reminder: not queued while «reminder» is off; queued once it is on; cancelled when it goes off again", async () => {
    const id = await add({ name: "Anna Näidis", phone: "+372 5555 0101", notifyOff: ["reminder"] });
    await visit(id);
    expect(await planReminders(query, NOW)).toEqual({ added: 0, cancelled: 0 });
    expect(await outbox("reminder")).toHaveLength(0);

    await saveClient(demo.business, id, { notifyOff: [] }, ACTOR);
    expect(await planReminders(query, NOW)).toEqual({ added: 1, cancelled: 0 });
    expect(await statuses("reminder")).toEqual(["queued"]);

    await saveClient(demo.business, id, { notifyOff: ["reminder"] }, ACTOR);
    expect(await planReminders(query, NOW)).toEqual({ added: 0, cancelled: 1 });
    expect(await statuses("reminder")).toEqual(["cancelled"]);
    // and it does not come back by itself
    expect(await planReminders(query, NOW)).toEqual({ added: 0, cancelled: 0 });
    // another kind switched off is not this one
    await saveClient(demo.business, id, { notifyOff: ["confirmation", "moved", "cancelled"] }, ACTOR);
    expect(await planReminders(query, NOW)).toEqual({ added: 1, cancelled: 0 });
    expect(await statuses("reminder")).toEqual(["cancelled", "queued"]);
  });

  it("the SMS channel off: no reminder, and a queued one is cancelled", async () => {
    const id = await add({ name: "Anna Näidis", phone: "+372 5555 0101" });
    await visit(id);
    expect(await planReminders(query, NOW)).toEqual({ added: 1, cancelled: 0 });
    await saveClient(demo.business, id, { smsOptOut: true }, ACTOR);
    expect(await planReminders(query, NOW)).toEqual({ added: 0, cancelled: 1 });
    expect(await statuses("reminder")).toEqual(["cancelled"]);
    // nothing is sent when its time comes
    const out = await runOutbox(query, at(TUE, "10:05"), DEV);
    expect(out.sent).toBe(0);
    expect(sentSms).toHaveLength(0);
  });

  it("the reminder as a notification: not queued for a client who takes no push, or no reminders", async () => {
    const a = await book(query, demo.business, online({ phone: "5555 0101", time: "12:00" }), { now: NOW });
    const b = await book(query, demo.business, online({ phone: "5555 0102", time: "14:00" }), { now: NOW });
    const c = await book(query, demo.business, online({ phone: "5555 0103", time: "16:00" }), { now: NOW });
    if (!a.ok || !b.ok || !c.ok) throw new Error("book");
    for (const [i, v] of [a, b, c].entries()) await saveClientSubscription(query, demo.business.id, v.visit.id, { ...PHONE, endpoint: `${PHONE.endpoint}-${i}` });
    const [{ client_id: noPush }] = await query<{ client_id: string }>("select client_id from appointments where id = $1", [b.visit.id]);
    const [{ client_id: noReminders }] = await query<{ client_id: string }>("select client_id from appointments where id = $1", [c.visit.id]);
    await saveClient(demo.business, noPush, { pushOptOut: true }, ACTOR);
    await saveClient(demo.business, noReminders, { notifyOff: ["reminder"] }, ACTOR);

    await planReminders(query, NOW);
    // the first client: both; the second: the SMS only; the third: nothing
    expect((await outbox()).map((r) => [r.kind, r.appointment_id]).sort()).toEqual(
      [
        ["client_reminder", a.visit.id],
        ["reminder", a.visit.id],
        ["reminder", b.visit.id],
      ].sort(),
    );
    // switched off after it was queued: cancelled at the next run
    const [{ client_id: first }] = await query<{ client_id: string }>("select client_id from appointments where id = $1", [a.visit.id]);
    await saveClient(demo.business, first, { pushOptOut: true }, ACTOR);
    expect(await planReminders(query, NOW)).toEqual({ added: 0, cancelled: 1 });
    expect(await statuses("client_reminder")).toEqual(["cancelled"]);
    expect(await statuses("reminder")).toEqual(["queued", "queued"]);
  });

  it("the confirmation letter: not queued with «confirmation» off, nor with letters off; the visit is booked all the same", async () => {
    const day = tuesday();
    const off = await add({ name: "No Confirmations", phone: "+372 5555 0101", notifyOff: ["confirmation"] });
    const noMail = await add({ name: "No Letters", phone: "+372 5555 0102", emailOptOut: true });
    const yes = await add({ name: "Takes Them", phone: "+372 5555 0103", notifyOff: ["reminder", "moved", "cancelled"] });
    const go = async (phone: string, time: string) => {
      const r = await book(query, demo.business, online({ phone, time, date: day, email: "client@example.test", smsReminder: false }), { now: Date.now() });
      if (!r.ok) throw new Error(r.code);
      return r.visit.id;
    };
    const a = await go("5555 0101", "12:00");
    const b = await go("5555 0102", "13:00");
    const c = await go("5555 0103", "14:00");
    expect((await outbox("confirmation")).map((r) => r.appointment_id)).toEqual([c]);
    // nothing to send for the two, a letter for the third
    expect((await sendForVisit(query, a, Date.now(), DEV)).sent).toBe(0);
    expect((await sendForVisit(query, b, Date.now(), DEV)).sent).toBe(0);
    expect((await sendForVisit(query, c, Date.now(), DEV)).sent).toBe(1);
    expect(sentToConsole.map((l) => l.to)).toEqual(["client@example.test"]);
    for (const id of [off, noMail, yes]) expect((await card(id)).visits).toBe(1);
  });

  it("the letters when the salon moves or cancels: each has its own switch", async () => {
    const day = tuesday();
    const booked = async (phone: string, time: string) => {
      const r = await book(query, demo.business, online({ phone, time, date: day, email: `${phone.replace(/\D/g, "")}@example.test`, smsReminder: false }), { now: Date.now() });
      if (!r.ok) throw new Error(r.code);
      // the confirmation has gone: only then is a change told by letter
      expect((await sendForVisit(query, r.visit.id, Date.now(), DEV)).sent).toBe(1);
      const [{ client_id }] = await query<{ client_id: string }>("select client_id from appointments where id = $1", [r.visit.id]);
      return { id: r.visit.id, clientId: client_id };
    };
    const quiet = await booked("5555 0101", "10:00");
    const loud = await booked("5555 0102", "12:00");
    await saveClient(demo.business, quiet.clientId, { notifyOff: ["moved", "cancelled"] }, ACTOR);

    for (const v of [quiet, loud]) expect((await adminUpdateVisit(demo.business, v.id, { start: at(day, v === quiet ? "15:00" : "16:00") }, ACTOR)).ok).toBe(true);
    expect((await outbox("moved")).map((r) => r.appointment_id)).toEqual([loud.id]);
    for (const v of [quiet, loud]) expect(await adminCancelVisit(demo.business, v.id, ACTOR)).toBe("cancelled");
    expect((await outbox("cancelled")).map((r) => r.appointment_id)).toEqual([loud.id]);

    // only «moved» off: the cancelling is still told
    const half = await booked("5555 0103", "11:00");
    await saveClient(demo.business, half.clientId, { notifyOff: ["moved"] }, ACTOR);
    expect((await adminUpdateVisit(demo.business, half.id, { start: at(day, "17:00") }, ACTOR)).ok).toBe(true);
    expect(await adminCancelVisit(demo.business, half.id, ACTOR)).toBe("cancelled");
    expect((await outbox("moved")).map((r) => r.appointment_id)).toEqual([loud.id]);
    expect((await outbox("cancelled")).map((r) => r.appointment_id)).toEqual([loud.id, half.id]);
  });
});

describe("comments: the dated history beside the note", () => {
  it("adds one with who and when; the newest is first; the note is not touched", async () => {
    const id = await add({ name: "Anna Näidis", note: "любит покороче" });
    const renat = await login("owner", "Renat");
    const desk = await login("admin", "Desk");
    const first = await addComment(demo.business, id, "  Просил перезвонить.\r\nВ среду. ", renat, NOW);
    const second = await addComment(demo.business, id, "Перезвонили.", desk, NOW + 3_600_000);
    expect(first.ok && second.ok).toBe(true);
    expect(await listComments(query, demo.business.id, id)).toEqual([
      { id: second.ok && second.id, at: NOW + 3_600_000, author: "Desk", text: "Перезвонили." },
      { id: first.ok && first.id, at: NOW, author: "Renat", text: "Просил перезвонить.\nВ среду." },
    ]);
    expect((await card(id)).note).toBe("любит покороче");
    // the audit says a comment was added and by whom, never its words
    const audit = await query<{ actor: string; action: string; after: unknown }>("select actor, action, after from audit where entity = 'client' and entity_id = $1 and action like 'comment%' order by id", [id]);
    expect(audit.map((a) => [a.actor, a.action])).toEqual([
      [renat.id, "comment_add"],
      [desk.id, "comment_add"],
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/перезвон/i);
  });

  it("refuses an empty one, one too long, and a client that is not ours", async () => {
    const id = await add({ name: "Anna Näidis" });
    const who = await login("admin", "Desk");
    expect(await addComment(demo.business, id, "   ", who)).toEqual({ ok: false, field: "text" });
    expect(await addComment(demo.business, id, "a".repeat(COMMENT_MAX + 1), who)).toEqual({ ok: false, field: "text" });
    expect((await addComment(demo.business, id, "a".repeat(COMMENT_MAX), who)).ok).toBe(true);
    expect(await addComment(demo.business, "not-a-uuid", "x", who)).toEqual({ ok: false, field: "id" });
    expect(await addComment(demo.business, "00000000-0000-4000-8000-000000000000", "x", who)).toEqual({ ok: false, field: "id" });
    const [other] = await query<{ id: string }>("insert into businesses (slug, name) values ('other-salon', 'Other') returning id");
    const [theirs] = await query<{ id: string }>("insert into clients (business_id, name) values ($1, 'Their Client') returning id", [other.id]);
    expect(await addComment(demo.business, theirs.id, "x", who)).toEqual({ ok: false, field: "id" });
    expect(await listComments(query, demo.business.id, theirs.id)).toEqual([]);
    expect(await query("select 1 from client_comments")).toHaveLength(1);
  });

  it("Renat and the front desk delete anyone's; a barber's login deletes none", async () => {
    const id = await add({ name: "Anna Näidis" });
    const renat = await login("owner", "Renat");
    const desk = await login("admin", "Desk");
    const barber = await login("staff", "Barber");
    const mine = await addComment(demo.business, id, "от Рената", renat);
    const hers = await addComment(demo.business, id, "от администратора", desk);
    if (!mine.ok || !hers.ok) throw new Error("comment");
    expect(await deleteComment(demo.business, id, mine.id, barber)).toBe(false);
    // the front desk deletes Renat's, Renat deletes the front desk's
    expect(await deleteComment(demo.business, id, mine.id, desk)).toBe(true);
    expect(await deleteComment(demo.business, id, hers.id, renat)).toBe(true);
    expect(await listComments(query, demo.business.id, id)).toEqual([]);
    // gone already, and never through another client's card
    expect(await deleteComment(demo.business, id, mine.id, renat)).toBe(false);
    const other = await add({ name: "Boris Sample" });
    const his = await addComment(demo.business, other, "чужой", renat);
    expect(his.ok && (await deleteComment(demo.business, id, his.id, renat))).toBe(false);
    expect(await listComments(query, demo.business.id, other)).toHaveLength(1);
  });

  it("a comment says who wrote it after the login is gone", async () => {
    const id = await add({ name: "Anna Näidis" });
    const temp = await login("admin", "Temp");
    await addComment(demo.business, id, "на память", temp);
    await query("delete from users where id = $1", [temp.id]);
    expect(await listComments(query, demo.business.id, id)).toMatchObject([{ author: "Temp", text: "на память" }]);
  });
});

describe("the photo", () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);

  it("is kept in the database, replaced, removed; only this business reads it", async () => {
    const id = await add({ name: "Anna Näidis" });
    expect(await clientPhoto(query, demo.business.id, id)).toBeNull();
    const saved = await saveClientPhoto(demo.business, id, JPEG, ACTOR);
    expect(saved.ok).toBe(true);
    expect((await card(id)).photoV).toBe(saved.ok && saved.v);
    const photo = (await clientPhoto(query, demo.business.id, id))!;
    expect(photo.mime).toBe("image/jpeg");
    expect([...photo.bytes]).toEqual([...JPEG]);
    // one photo a client: a new one takes its place
    expect((await saveClientPhoto(demo.business, id, new Uint8Array([...JPEG, 1, 2, 3]), ACTOR)).ok).toBe(true);
    expect(await query("select 1 from client_photo")).toHaveLength(1);
    expect((await clientPhoto(query, demo.business.id, id))!.bytes).toHaveLength(JPEG.length + 3);
    // another business gets nothing by the same id
    const [other] = await query<{ id: string }>("insert into businesses (slug, name) values ('other-salon', 'Other') returning id");
    expect(await clientPhoto(query, other.id, id)).toBeNull();
    expect(await saveClientPhoto({ ...demo.business, id: other.id }, id, JPEG, ACTOR)).toEqual({ ok: false, field: "id" });
    expect(await removeClientPhoto(demo.business, id, ACTOR)).toBe(true);
    expect(await removeClientPhoto(demo.business, id, ACTOR)).toBe(false);
    expect((await card(id)).photoV).toBeNull();
  });

  it("refuses what is not a picture, and one too large", async () => {
    const id = await add({ name: "Anna Näidis" });
    expect(await saveClientPhoto(demo.business, id, new TextEncoder().encode("<svg onload=alert(1)>"), ACTOR)).toEqual({ ok: false, field: "photo" });
    const big = new Uint8Array(600_001);
    big.set(JPEG);
    expect(await saveClientPhoto(demo.business, id, big, ACTOR)).toEqual({ ok: false, field: "photo" });
    expect(await query("select 1 from client_photo")).toHaveLength(0);
  });
});

describe("files: kinds and limits", () => {
  const TXT = new TextEncoder().encode("Справка: стрижётся коротко.");
  const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n");
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
  const GIF = new TextEncoder().encode("GIF89a....");
  const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0]);
  const OLE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const who = { id: ACTOR, name: "Desk" };

  it("the nine kinds pass when the name, the declared type and the first bytes agree", () => {
    const fine: [string, string, Uint8Array, string][] = [
      ["photo.jpeg", "image/jpeg", JPEG, "image/jpeg"],
      ["photo.JPG", "image/jpeg", JPEG, "image/jpeg"],
      ["scan.png", "image/png", PNG, "image/png"],
      ["anim.gif", "image/gif", GIF, "image/gif"],
      ["contract.pdf", "application/pdf", PDF, "application/pdf"],
      ["old.doc", "application/msword", OLE, "application/msword"],
      ["new.docx", DOCX, ZIP, DOCX],
      ["old.xls", "application/vnd.ms-excel", OLE, "application/vnd.ms-excel"],
      ["new.xlsx", XLSX, ZIP, XLSX],
      ["note.txt", "text/plain", TXT, "text/plain"],
      // a browser may add the encoding to the type
      ["note.txt", "Text/Plain; charset=utf-8", TXT, "text/plain"],
    ];
    for (const [name, type, bytes, mime] of fine) expect(checkFile(name, type, bytes), name).toEqual({ ok: true, name, mime });
  });

  it("refuses another kind, and a kind that only says it is one", () => {
    const type = { ok: false, code: "type" };
    // not one of the nine
    expect(checkFile("run.exe", "application/octet-stream", TXT)).toEqual(type);
    expect(checkFile("page.html", "text/html", TXT)).toEqual(type);
    expect(checkFile("drawing.svg", "image/svg+xml", TXT)).toEqual(type);
    expect(checkFile("archive.zip", "application/zip", ZIP)).toEqual(type);
    expect(checkFile("no-ending", "text/plain", TXT)).toEqual(type);
    expect(checkFile(".txt", "text/plain", TXT)).toEqual(type);
    // the name and the declared type disagree, either way
    expect(checkFile("note.txt", "application/pdf", TXT)).toEqual(type);
    expect(checkFile("contract.pdf", "text/plain", PDF)).toEqual(type);
    expect(checkFile("page.html.txt", "text/html", TXT)).toEqual(type);
    expect(checkFile("note.txt", "", TXT)).toEqual(type);
    expect(checkFile("note.txt", null, TXT)).toEqual(type);
    // the first bytes say otherwise
    expect(checkFile("photo.png", "image/png", JPEG)).toEqual(type);
    expect(checkFile("photo.jpg", "image/jpeg", PNG)).toEqual(type);
    expect(checkFile("anim.gif", "image/gif", new TextEncoder().encode("<html>"))).toEqual(type);
    expect(checkFile("contract.pdf", "application/pdf", new TextEncoder().encode("<script>alert(1)</script>"))).toEqual(type);
    expect(checkFile("new.docx", DOCX, TXT)).toEqual(type);
    expect(checkFile("new.xlsx", XLSX, OLE)).toEqual(type);
  });

  it("5 MB is the most; an empty file is none", () => {
    expect(FILE_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(checkFile("note.txt", "text/plain", new Uint8Array(FILE_MAX_BYTES).fill(65))).toMatchObject({ ok: true });
    expect(checkFile("note.txt", "text/plain", new Uint8Array(FILE_MAX_BYTES + 1).fill(65))).toEqual({ ok: false, code: "size" });
    expect(checkFile("note.txt", "text/plain", new Uint8Array(0))).toEqual({ ok: false, code: "empty" });
    // too large is said before anything about its kind
    expect(checkFile("run.exe", "application/octet-stream", new Uint8Array(FILE_MAX_BYTES + 1))).toEqual({ ok: false, code: "size" });
  });

  it("a name comes without its folder and without what a header cannot take", () => {
    expect(cleanFileName("C:\\Users\\Renat\\Desktop\\Договор  2026.PDF")).toBe("Договор 2026.PDF");
    expect(cleanFileName("../../etc/passwd.txt")).toBe("passwd.txt");
    expect(cleanFileName('a"b<c>d:e|f?g*.txt')).toBe("a_b_c_d_e_f_g_.txt");
    expect(cleanFileName("line\r\nbreak\u0000.txt")).toBe("line__break_.txt");
    expect(cleanFileName("...hidden.txt")).toBe("hidden.txt");
    const long = cleanFileName(`${"я".repeat(300)}.docx`);
    expect(long).toHaveLength(120);
    expect(long.endsWith(".docx")).toBe(true);
    expect(checkFile("C:\\fakepath\\Справка.TXT", "text/plain", TXT)).toEqual({ ok: true, name: "Справка.TXT", mime: "text/plain" });
  });

  it("uploads, lists, hands back and deletes; only through its own client and business", async () => {
    const id = await add({ name: "Anna Näidis" });
    const other = await add({ name: "Boris Sample" });
    const desk = await login("admin", "Desk");
    const a = await addFile(demo.business, id, { name: "Справка.txt", type: "text/plain", bytes: TXT }, desk, NOW);
    const b = await addFile(demo.business, id, { name: "contract.pdf", type: "application/pdf", bytes: PDF }, desk, NOW + 60_000);
    if (!a.ok || !b.ok) throw new Error("file");
    // newest first, without the bytes
    expect(await listFiles(query, demo.business.id, id)).toEqual([
      { id: b.id, name: "contract.pdf", mime: "application/pdf", size: PDF.length, at: NOW + 60_000, by: "Desk" },
      { id: a.id, name: "Справка.txt", mime: "text/plain", size: TXT.length, at: NOW, by: "Desk" },
    ]);
    const got = (await clientFile(query, demo.business.id, id, a.id))!;
    expect(got).toMatchObject({ name: "Справка.txt", mime: "text/plain" });
    expect(new TextDecoder().decode(got.bytes)).toBe("Справка: стрижётся коротко.");
    // not by another client's card, not by another business, not by a made-up id
    const [salon] = await query<{ id: string }>("insert into businesses (slug, name) values ('other-salon', 'Other') returning id");
    expect(await clientFile(query, demo.business.id, other, a.id)).toBeNull();
    expect(await clientFile(query, salon.id, id, a.id)).toBeNull();
    expect(await clientFile(query, demo.business.id, id, "not-a-uuid")).toBeNull();
    expect(await listFiles(query, salon.id, id)).toEqual([]);
    expect(await deleteFile(demo.business, other, a.id, ACTOR)).toBe(false);
    expect(await deleteFile({ ...demo.business, id: salon.id }, id, a.id, ACTOR)).toBe(false);
    expect(await addFile({ ...demo.business, id: salon.id }, id, { name: "x.txt", type: "text/plain", bytes: TXT }, who)).toEqual({ ok: false, code: "not_found" });
    // a file that cannot be kept is not kept
    expect(await addFile(demo.business, id, { name: "run.exe", type: "application/octet-stream", bytes: TXT }, who)).toEqual({ ok: false, code: "type" });
    expect(await addFile(demo.business, id, { name: "note.txt", type: "text/plain", bytes: new Uint8Array(0) }, who)).toEqual({ ok: false, code: "empty" });
    expect(await listFiles(query, demo.business.id, id)).toHaveLength(2);
    // deleted for good, once
    expect(await deleteFile(demo.business, id, a.id, ACTOR)).toBe(true);
    expect(await deleteFile(demo.business, id, a.id, ACTOR)).toBe(false);
    expect(await clientFile(query, demo.business.id, id, a.id)).toBeNull();
    expect((await listFiles(query, demo.business.id, id)).map((f) => f.id)).toEqual([b.id]);
    // the audit keeps that it happened, never the file's name
    const audit = await query<{ action: string; after: unknown }>("select action, after from audit where entity = 'client' and entity_id = $1 and action like 'file%' order by id", [id]);
    expect(audit.map((x) => x.action)).toEqual(["file_add", "file_add", "file_delete"]);
    expect(JSON.stringify(audit)).not.toMatch(/Справка|contract/);
  });

  it("20 files a client and no more; a deleted one makes room", async () => {
    expect(FILES_MAX).toBe(20);
    const id = await add({ name: "Anna Näidis" });
    const other = await add({ name: "Boris Sample" });
    const ids: string[] = [];
    for (let i = 0; i < FILES_MAX; i++) {
      const r = await addFile(demo.business, id, { name: `note-${i}.txt`, type: "text/plain", bytes: TXT }, who);
      if (!r.ok) throw new Error(r.code);
      ids.push(r.id);
    }
    expect(await addFile(demo.business, id, { name: "one-more.txt", type: "text/plain", bytes: TXT }, who)).toEqual({ ok: false, code: "full" });
    expect(await listFiles(query, demo.business.id, id)).toHaveLength(FILES_MAX);
    // the limit is a client's own
    expect((await addFile(demo.business, other, { name: "his.txt", type: "text/plain", bytes: TXT }, who)).ok).toBe(true);
    expect(await deleteFile(demo.business, id, ids[0], ACTOR)).toBe(true);
    expect((await addFile(demo.business, id, { name: "one-more.txt", type: "text/plain", bytes: TXT }, who)).ok).toBe(true);
  });
});

describe("messages: what we sent him, and one written by hand", () => {
  const PROD = { NODE_ENV: "production", VITEST: "true", EMAIL_TRANSPORT: "console", ALLOW_INDEXING: "yes" };

  it("a message by hand is one outbox row per channel, kind «manual», with his name on it", async () => {
    const id = await add({ name: "Anna Näidis", phone: "+372 5555 0101", email: "anna@example.test", locale: "et" });
    const r = await queueClientMessage(demo.business, id, { text: "  Ждём вас в субботу!\r\nREMPIRE ", channels: ["email", "sms"] }, ACTOR, NOW, DEV);
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.ids).toHaveLength(2);
    expect((await outbox("manual")).map(({ id: _id, ...row }) => row)).toEqual([
      { kind: "manual", channel: "email", status: "queued", recipient: "anna@example.test", client_id: id, appointment_id: null, payload: { text: "Ждём вас в субботу!\nREMPIRE", subject: demo.business.name } },
      { kind: "manual", channel: "sms", status: "queued", recipient: "+37255550101", client_id: id, appointment_id: null, payload: { text: "Ждём вас в субботу!\nREMPIRE", subject: demo.business.name } },
    ]);
    // in the client's language, for whatever is built around the words later
    expect(await query("select distinct locale from notifications where kind = 'manual'")).toEqual([{ locale: "et" }]);
    // the audit: who and by which channels, never the words
    const [a] = await query<{ actor: string; after: unknown }>("select actor, after from audit where entity = 'client' and action = 'message'");
    expect(a).toEqual({ actor: ACTOR, after: { by: "admin", channels: ["sms", "email"] } });
  });

  it("with no SMS provider the SMS waits in the queue while the letter goes; the card lists both", async () => {
    const id = await add({ name: "Anna Näidis", phone: "+372 5555 0101", email: "anna@example.test" });
    await queueClientMessage(demo.business, id, { text: "Ждём вас в субботу!", channels: ["sms", "email"] }, ACTOR, NOW, PROD);
    expect((await listMessages(query, demo.business.id, id)).map((m) => [m.channel, m.status, m.kind, m.text, m.visitAt])).toEqual(
      expect.arrayContaining([
        ["sms", "queued", "manual", "Ждём вас в субботу!", null],
        ["email", "queued", "manual", "Ждём вас в субботу!", null],
      ]),
    );
    const out = await runOutbox(query, NOW + 60_000, PROD);
    expect(out).toMatchObject({ sent: 1, failed: 0, retry: 0 });
    expect(sentSms).toHaveLength(0);
    expect(sentToConsole).toMatchObject([{ to: "anna@example.test", subject: demo.business.name, text: "Ждём вас в субботу!" }]);
    const after = await listMessages(query, demo.business.id, id);
    expect(Object.fromEntries(after.map((m) => [m.channel, m.status]))).toEqual({ sms: "queued", email: "sent" });
    // the sent one says when it went
    expect(after.find((m) => m.channel === "email")!.at).toBe(NOW + 60_000);
    // once SMS has a way out (here: the console), the same row goes
    expect((await runOutbox(query, NOW + 120_000, DEV)).sent).toBe(1);
    expect(sentSms).toEqual([{ to: "+37255550101", text: "Ждём вас в субботу!" }]);
  });

  it("on staging the mail guard applies: a client's letter lands in the test inbox", async () => {
    const id = await add({ name: "Anna Näidis", email: "anna@example.test" });
    await queueClientMessage(demo.business, id, { text: "Проверка", channels: ["email"] }, ACTOR, NOW, DEV);
    await runOutbox(query, NOW + 60_000, { NODE_ENV: "production", VITEST: "true", EMAIL_TRANSPORT: "console" });
    expect(sentToConsole).toHaveLength(1);
    expect(sentToConsole[0].to).toBe(TEST_INBOX);
    expect(sentToConsole[0].subject).toContain("anna@example.test");
  });

  it("goes only by a channel he has an address for and accepts; one that cannot refuses the whole message", async () => {
    const id = await add({ name: "Anna Näidis", phone: "+372 5555 0101", email: "anna@example.test", smsOptOut: true });
    expect(await clientReach(query, demo.business, id, NOW, DEV)).toEqual({ sms: "off", email: "ok", push: "none" });
    expect(await queueClientMessage(demo.business, id, { text: "Привет", channels: ["sms", "email"] }, ACTOR, NOW, DEV)).toEqual({ ok: false, code: "refused", channel: "sms" });
    expect(await outbox()).toHaveLength(0);
    expect((await queueClientMessage(demo.business, id, { text: "Привет", channels: ["email"] }, ACTOR, NOW, DEV)).ok).toBe(true);

    const walkIn = await add({ name: "Walk-in Dan" });
    expect(await clientReach(query, demo.business, walkIn, NOW, DEV)).toEqual({ sms: "none", email: "none", push: "none" });
    expect(await queueClientMessage(demo.business, walkIn, { text: "Привет", channels: ["sms"] }, ACTOR, NOW, DEV)).toEqual({ ok: false, code: "refused", channel: "sms" });
    const noMail = await add({ name: "No Letters", email: "no@example.test", emailOptOut: true });
    expect(await queueClientMessage(demo.business, noMail, { text: "Привет", channels: ["email"] }, ACTOR, NOW, DEV)).toEqual({ ok: false, code: "refused", channel: "email" });
    // «no advertising» is kept and shown; it does not stop a message somebody chose to send
    const noAds = await add({ name: "No Ads", email: "ads@example.test", marketingOptOut: true });
    expect((await queueClientMessage(demo.business, noAds, { text: "Привет", channels: ["email"] }, ACTOR, NOW, DEV)).ok).toBe(true);
    // and a kind switched off is about the messages we send by ourselves
    const noKinds = await add({ name: "No Kinds", email: "kinds@example.test", notifyOff: [...CLIENT_KINDS] });
    expect((await queueClientMessage(demo.business, noKinds, { text: "Привет", channels: ["email"] }, ACTOR, NOW, DEV)).ok).toBe(true);
  });

  it("refuses no text, too long a text, no channel, an unknown channel, a client that is not ours", async () => {
    const id = await add({ name: "Anna Näidis", phone: "+372 5555 0101" });
    const send = (text: unknown, channels: unknown, client = id) => queueClientMessage(demo.business, client, { text, channels }, ACTOR, NOW, DEV);
    expect(await send("   ", ["sms"])).toEqual({ ok: false, code: "text" });
    expect(await send("a".repeat(MESSAGE_MAX + 1), ["sms"])).toEqual({ ok: false, code: "text" });
    expect(await send("Привет", [])).toEqual({ ok: false, code: "channels" });
    expect(await send("Привет", "sms")).toEqual({ ok: false, code: "channels" });
    expect(await send("Привет", ["sms", "fax"])).toEqual({ ok: false, code: "channels" });
    expect(await send("Привет", ["sms"], "not-a-uuid")).toEqual({ ok: false, code: "not_found" });
    const [other] = await query<{ id: string }>("insert into businesses (slug, name) values ('other-salon', 'Other') returning id");
    const [theirs] = await query<{ id: string }>("insert into clients (business_id, name, phone_e164) values ($1, 'Their Client', '+37255550177') returning id", [other.id]);
    expect(await send("Привет", ["sms"], theirs.id)).toEqual({ ok: false, code: "not_found" });
    expect(await outbox()).toHaveLength(0);
    expect((await send("a".repeat(MESSAGE_MAX), ["sms"])).ok).toBe(true);
  });

  it("a notification is offered only while he has one turned on for a visit ahead; it goes to that visit's phones", async () => {
    const ENV = { ...DEV, ...KEYS };
    const id = await add({ name: "Anna Näidis", phone: "+372 5555 0101" });
    const v = await visit(id);
    // no phone turned on: not offered, and refused if asked for
    expect((await clientReach(query, demo.business, id, NOW, ENV))!.push).toBe("none");
    expect(await queueClientMessage(demo.business, id, { text: "Привет", channels: ["push"] }, ACTOR, NOW, ENV)).toEqual({ ok: false, code: "refused", channel: "push" });
    await saveClientSubscription(query, demo.business.id, v.id, PHONE);
    expect((await clientReach(query, demo.business, id, NOW, ENV))!.push).toBe("ok");
    // without the push keys nothing can be sent, so it is not offered
    expect((await clientReach(query, demo.business, id, NOW, DEV))!.push).toBe("none");
    // once the visit has begun the phone is not «his» any more
    expect((await clientReach(query, demo.business, id, at(TUE, "12:30"), ENV))!.push).toBe("none");
    // he does not accept push
    await saveClient(demo.business, id, { pushOptOut: true }, ACTOR);
    expect((await clientReach(query, demo.business, id, NOW, ENV))!.push).toBe("off");
    expect(await queueClientMessage(demo.business, id, { text: "Привет", channels: ["push"] }, ACTOR, NOW, ENV)).toEqual({ ok: false, code: "refused", channel: "push" });
    await saveClient(demo.business, id, { pushOptOut: false }, ACTOR);

    expect((await queueClientMessage(demo.business, id, { text: "Ждём вас!", channels: ["push"] }, ACTOR, NOW, ENV)).ok).toBe(true);
    const [row] = await outbox("manual");
    expect(row).toMatchObject({ channel: "push", recipient: v.id, appointment_id: v.id, client_id: id, status: "queued" });
    const told: { visitId: string; msg: PushText }[] = [];
    const senders: Senders = {
      sms: async () => ({ provider: "console" as const, ref: null, segments: 1 }),
      email: async () => ({ provider: "console" as const, ref: null }),
      pushClient: async (_q, visitId, msg) => {
        told.push({ visitId, msg });
        return { devices: 1, sent: 1, failed: 0, gone: 0 };
      },
    };
    await runOutbox(query, NOW + 60_000, ENV, senders);
    expect(told).toHaveLength(1);
    expect(told[0].visitId).toBe(v.id);
    expect(told[0].msg).toMatchObject({ title: demo.business.name, body: "Ждём вас!", tag: `msg-${row.id}` });
    expect(told[0].msg.url).toMatch(/^\/v\/[A-Za-z0-9_-]{16}$/);
    expect((await outbox("manual"))[0].status).toBe("sent");
    // (the same run planned the visit's own reminders; they are his messages too)
    const mine = await listMessages(query, demo.business.id, id);
    expect(mine.filter((m) => m.kind === "manual")).toMatchObject([{ channel: "push", status: "sent", text: "Ждём вас!", visitAt: null }]);
    expect(mine.map((m) => m.kind).sort()).toEqual(["client_reminder", "manual", "reminder"]);
  });

  it("the card lists what his visits sent him too, by their time, and nothing meant for the staff or for anyone else", async () => {
    const id = await add({ name: "Anna Näidis", phone: "+372 5555 0101", email: "anna@example.test" });
    const other = await add({ name: "Boris Sample", phone: "+372 5555 0102" });
    const mine = await visit(id);
    await visit(other, { time: "14:00" });
    // both get a reminder planned
    expect(await planReminders(query, NOW)).toEqual({ added: 2, cancelled: 0 });
    // a push to a login about his visit, and a letter to a barber, are not messages to him
    const renat = await login("owner", "Renat");
    await query(
      `insert into notifications (business_id, appointment_id, channel, kind, recipient, user_id, payload) values ($1, $2, 'push', 'visit_new', $3, $4, '{}'::jsonb)`,
      [demo.business.id, mine.id, renat.id, renat.id],
    );
    await query(`insert into notifications (business_id, channel, kind, recipient) values ($1, 'email', 'invoice', 'anna@example.test')`, [demo.business.id]);
    await queueClientMessage(demo.business, id, { text: "Ждём вас!", channels: ["email"] }, ACTOR, NOW + 1000, DEV);

    const list = await listMessages(query, demo.business.id, id);
    // the reminder still to go (two hours before the visit) is on top, then the message of today
    expect(list.map((m) => [m.kind, m.channel, m.status, m.text, m.visitAt])).toEqual([
      ["reminder", "sms", "queued", null, mine.start],
      ["manual", "email", "queued", "Ждём вас!", null],
    ]);
    expect(list.map((m) => m.at)).toEqual([mine.start - 120 * 60_000, NOW + 1000]);
    expect(await listMessages(query, demo.business.id, other)).toHaveLength(1);
    const [salon] = await query<{ id: string }>("insert into businesses (slug, name) values ('other-salon', 'Other') returning id");
    expect(await listMessages(query, salon.id, id)).toEqual([]);
    expect(await listMessages(query, demo.business.id, "not-a-uuid")).toEqual([]);
  });
});

describe("statistics: what he spent in a period", () => {
  it("sums the visits that count, per month, per service and per barber; the empty months are there too", async () => {
    const id = await add({ name: "Anna Näidis" });
    const a = await visit(id, { staff: "valentin", date: "2026-09-08", time: "11:00" }); // clip, 40 €
    const b = await visit(id, { staff: "jevgeni", date: "2026-09-22", time: "12:00", service: "beard" }); // 28 €
    const c = await visit(id, { staff: "valentin", date: "2026-11-03", time: "11:00" }); // clip, 40 €
    const cancelled = await visit(id, { staff: "valentin", date: "2026-11-10", time: "11:00" });
    const noShow = await visit(id, { staff: "valentin", date: "2026-11-17", time: "11:00" });
    await visit(id, { staff: "valentin", date: "2026-12-08", time: "11:00" }); // still ahead on 30.11
    for (const v of [a, b, c]) await adminSetStatus(demo.business, v.id, "done", ACTOR);
    await adminCancelVisit(demo.business, cancelled.id, ACTOR);
    await adminSetStatus(demo.business, noShow.id, "no_show", ACTOR);

    const s = (await clientStats(query, demo.business, id, { from: "2026-08-01", to: "2026-11-30" }, LATER))!;
    expect(s).toMatchObject({ from: "2026-08-01", to: "2026-11-30", visits: 3, totalCents: 4000 + 2800 + 4000 });
    expect(s.months).toEqual([
      { month: "2026-08", cents: 0, visits: 0 },
      { month: "2026-09", cents: 6800, visits: 2 },
      { month: "2026-10", cents: 0, visits: 0 },
      { month: "2026-11", cents: 4000, visits: 1 },
    ]);
    // the largest sum first
    expect(s.services.map((x) => [x.name.en, x.count, x.cents])).toEqual([
      ["Haircut with clippers and scissors", 2, 8000],
      ["Beard trim", 1, 2800],
    ]);
    expect(s.staff.map((x) => [x.name, x.count, x.cents])).toEqual([
      ["Valentin", 2, 8000],
      ["Jevgeni", 1, 2800],
    ]);
    expect(s.staff[0].id).toBe(demo.staff.valentin);
    // the three sums are one sum
    const sum = (rows: { cents: number }[]) => rows.reduce((t, r) => t + r.cents, 0);
    expect([sum(s.months), sum(s.services), sum(s.staff)]).toEqual([10800, 10800, 10800]);
    // it is the card's own «Продано», for a period that holds every visit
    expect((await card(id)).soldCents).toBe(10800);
    expect((await card(id)).soldVisits).toBe(3);
    expect((await listClients(query, demo.business.id, {}, LATER)).rows.find((r) => r.id === id)!.soldCents).toBe(10800);
  });

  it("the period cuts at its days, in the salon's time; the December visit counts once it has begun", async () => {
    const id = await add({ name: "Anna Näidis" });
    await visit(id, { staff: "valentin", date: "2026-09-30", time: "23:00" });
    await visit(id, { staff: "valentin", date: "2026-10-01", time: "00:30" });
    await visit(id, { staff: "valentin", date: "2026-12-08", time: "11:00" });
    const stats = (from: string, to: string, now = LATER) => clientStats(query, demo.business, id, { from, to }, now);
    expect((await stats("2026-09-01", "2026-09-30"))!.months).toEqual([{ month: "2026-09", cents: 4000, visits: 1 }]);
    expect((await stats("2026-10-01", "2026-10-01"))!).toMatchObject({ visits: 1, totalCents: 4000 });
    expect((await stats("2026-10-02", "2026-11-30"))!).toMatchObject({ visits: 0, totalCents: 0, services: [], staff: [] });
    // ahead on 30.11: not spent yet
    expect((await stats("2026-12-01", "2026-12-31"))!.visits).toBe(0);
    expect((await stats("2026-12-01", "2026-12-31", at("2026-12-09", "12:00")))!).toMatchObject({ visits: 1, totalCents: 4000 });
  });

  it("the period it opens with is this month and the eleven before; two dates the wrong way round are turned; a long one is cut", async () => {
    expect(defaultStatsPeriod(TZ, LATER)).toEqual({ from: "2025-12-01", to: "2026-11-30" });
    expect(defaultStatsPeriod(TZ, at("2026-01-15", "12:00"))).toEqual({ from: "2025-02-01", to: "2026-01-15" });
    expect(cleanStatsPeriod("2026-11-30", "2026-08-01", TZ, LATER)).toEqual({ from: "2026-08-01", to: "2026-11-30" });
    expect(cleanStatsPeriod("nonsense", "", TZ, LATER)).toEqual({ from: "2025-12-01", to: "2026-11-30" });
    const long = cleanStatsPeriod("2000-01-01", "2026-11-30", TZ, LATER);
    expect(long).toEqual({ from: "2021-12-01", to: "2026-11-30" });
    const id = await add({ name: "Anna Näidis" });
    const s = (await clientStats(query, demo.business, id, { from: "2000-01-01", to: "2026-11-30" }, LATER))!;
    expect(s.months).toHaveLength(STATS_MONTHS_MAX);
    expect([s.months[0].month, s.months.at(-1)!.month]).toEqual(["2021-12", "2026-11"]);
    // not ours: nothing
    const [other] = await query<{ id: string }>("insert into businesses (slug, name) values ('other-salon', 'Other') returning id");
    expect(await clientStats(query, { ...demo.business, id: other.id }, id, defaultStatsPeriod(TZ, LATER), LATER)).toBeNull();
    expect(await clientStats(query, demo.business, "not-a-uuid", defaultStatsPeriod(TZ, LATER), LATER)).toBeNull();
  });
});

describe("deleting a client", () => {
  it("one with no history goes, with his comments, files and photo; a message written to him stays without his name", async () => {
    const id = await add({ name: "Anna Näidis", phone: "+372 5555 0101", email: "anna@example.test" });
    const desk = await login("admin", "Desk");
    await addComment(demo.business, id, "на память", desk);
    await addFile(demo.business, id, { name: "note.txt", type: "text/plain", bytes: new TextEncoder().encode("x") }, desk);
    await saveClientPhoto(demo.business, id, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]), ACTOR);
    await queueClientMessage(demo.business, id, { text: "Привет", channels: ["email"] }, ACTOR, NOW, DEV);

    expect(await deleteClient(demo.business, id, desk.id)).toEqual({ ok: true });
    expect(await clientDetail(query, demo.business, id, LATER)).toBeNull();
    for (const table of ["clients", "client_comments", "client_files", "client_photo"]) expect(await query(`select 1 from ${table}`), table).toHaveLength(0);
    expect(await query("select client_id, status from notifications where kind = 'manual'")).toEqual([{ client_id: null, status: "queued" }]);
    // who deleted, never whom by name
    const [a] = await query<{ actor: string; after: unknown }>("select actor, after from audit where entity = 'client' and entity_id = $1 and action = 'delete'", [id]);
    expect(a).toEqual({ actor: desk.id, after: { by: "admin" } });
    expect(await deleteClient(demo.business, id, desk.id)).toEqual({ ok: false, code: "not_found" });
    // his phone is free for a new client
    expect((await saveClient(demo.business, null, { name: "Anna Again", phone: "5555 0101" }, ACTOR)).ok).toBe(true);
  });

  it("one with a visit is refused, plainly, and stays with everything: a visit ahead, one behind, even a cancelled one", async () => {
    const ahead = await add({ name: "Has One Ahead" });
    const behind = await add({ name: "Has One Behind" });
    const off = await add({ name: "Had One Cancelled" });
    await visit(ahead, { date: "2026-12-08", time: "11:00" });
    const done = await visit(behind, { date: "2026-11-03", time: "11:00" });
    await adminSetStatus(demo.business, done.id, "done", ACTOR);
    const gone = await visit(off, { date: "2026-11-10", time: "11:00" });
    await adminCancelVisit(demo.business, gone.id, ACTOR);
    await addComment(demo.business, behind, "постоянный", { id: ACTOR, name: "Desk" });
    for (const id of [ahead, behind, off]) {
      expect(await deleteClient(demo.business, id, ACTOR)).toEqual({ ok: false, code: "has_history" });
      expect(await clientDetail(query, demo.business, id, LATER)).not.toBeNull();
    }
    expect(await listComments(query, demo.business.id, behind)).toHaveLength(1);
    expect(await query("select 1 from audit where entity = 'client' and action = 'delete'")).toHaveLength(0);
  });

  it("one who was sold a product, or has another client merged into him, stays too", async () => {
    const buyer = await add({ name: "Bought Wax" });
    await query(
      `insert into product_sales (business_id, ref, staff_id, mode, shop_product_id, name, qty, unit_cents, list_cents, vat_bp, total_cents, client_id)
       values ($1, 'card-test-sale-01', $2, 'client', 'p1', 'Wax', 1, 1500, 1500, 2400, 1500, $3)`,
      [demo.business.id, demo.staff.renat, buyer],
    );
    expect(await deleteClient(demo.business, buyer, ACTOR)).toEqual({ ok: false, code: "has_history" });
    const kept = await add({ name: "Anna Näidis" });
    const old = await add({ name: "Anna Old" });
    await query("update clients set merged_into = $2 where id = $1", [old, kept]);
    expect(await deleteClient(demo.business, kept, ACTOR)).toEqual({ ok: false, code: "has_history" });
    // a client who was merged away is not there to delete
    expect(await deleteClient(demo.business, old, ACTOR)).toEqual({ ok: false, code: "not_found" });
  });

  it("not ours, or no such client: not found, nothing deleted", async () => {
    const [other] = await query<{ id: string }>("insert into businesses (slug, name) values ('other-salon', 'Other') returning id");
    const [theirs] = await query<{ id: string }>("insert into clients (business_id, name) values ($1, 'Their Client') returning id", [other.id]);
    expect(await deleteClient(demo.business, theirs.id, ACTOR)).toEqual({ ok: false, code: "not_found" });
    expect(await deleteClient(demo.business, "not-a-uuid", ACTOR)).toEqual({ ok: false, code: "not_found" });
    expect(await deleteClient(demo.business, "00000000-0000-4000-8000-000000000000", ACTOR)).toEqual({ ok: false, code: "not_found" });
    expect(await query("select 1 from clients")).toHaveLength(1);
  });
});
