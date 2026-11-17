/**
 * Push for the barber app (B5): who gets which push, the words (never a
 * phone), the evening plan once a day, and sending through the outbox.
 * No real push service: a fake sender stands in. Fake people and fake
 * keys only (the keys are never checked without a real send).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminCancelVisit, adminCreateVisit, adminUpdateVisit, type AdminVisitInput } from "@/lib/admin/visits";
import { book, type BookingInput } from "@/lib/booking";
import { closeDb, query } from "@/lib/db";
import { OUTBOX, planEveningPush, runOutbox, type Senders } from "@/lib/outbox";
import { cleanSubscription, pushConfigured, queuePush, removeSubscription, saveSubscription, sendPushToUser, setNotify } from "@/lib/push";
import { DEFAULT_ON, kindsFor, OWNER_KINDS, pushText, safeClient, wants, type PushText } from "@/lib/push-kinds";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
// far enough ahead of the real clock that no visit here is «over»
const DAY = "2026-12-01";
const KEYS = { VAPID_PUBLIC_KEY: "test-public-key", VAPID_PRIVATE_KEY: "test-private-key" };
const ENV = { NODE_ENV: "test", VITEST: "true", ...KEYS };

let demo: Demo;
let ids: { owner: string; valentin: string; jevgeni: string; quiet: string };

async function login(email: string, role: string, staff: string | null, phone = true): Promise<string> {
  const [u] = await query<{ id: string }>("insert into users (business_id, email, role, staff_id, locale) values ($1, $2, $3, $4, 'ru') returning id", [
    demo.business.id,
    email,
    role,
    staff ? demo.staff[staff] : null,
  ]);
  if (phone) await saveSubscription(query, u.id, { endpoint: `https://push.example.test/${email}`, p256dh: "p256", auth: "auth", label: "test" });
  return u.id;
}

beforeEach(async () => {
  demo = await freshDemo();
  Object.assign(process.env, KEYS);
  ids = {
    owner: await login("owner@example.test", "owner", null),
    valentin: await login("valentin@example.test", "staff", "valentin"),
    jevgeni: await login("jevgeni@example.test", "staff", "jevgeni"),
    // a barber login with no phone: never gets a row
    quiet: await login("slava@example.test", "staff", "slava", false),
  };
});
afterEach(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});
afterAll(closeDb);

const pushRows = () =>
  query<{ user_id: string; kind: string; status: string; payload: Record<string, unknown>; appointment_id: string | null }>(
    "select user_id, kind, status, payload, appointment_id from notifications where channel = 'push' order by created_at, kind",
  );
const who = (rows: { user_id: string; kind: string }[]) =>
  rows.map((r) => `${Object.entries(ids).find(([, id]) => id === r.user_id)?.[0]}:${r.kind}`).sort();

let n = 0;
const visit = (staff: string, time: string, o: Partial<AdminVisitInput> = {}): AdminVisitInput => ({
  staffId: demo.staff[staff],
  start: at(DAY, time),
  serviceIds: [demo.services.clip],
  name: "Test Client",
  phone: `+372 5555 0${400 + ++n}`,
  idempotencyKey: `push-test-${n}-${Math.random()}`,
  ...o,
});

describe("push: who gets what", () => {
  it("an online booking: the barber, and Renat only if he switched it on", async () => {
    const input: BookingInput = {
      serviceIds: [demo.services.clip],
      staffId: demo.staff.valentin,
      startsAt: new Date(at(DAY, "11:00")).toISOString(),
      name: "Test Client",
      phone: "+372 5555 0501",
      email: null,
      comment: "",
      locale: "ru",
      smsReminder: true,
      idempotencyKey: `push-book-${Math.random()}`,
    };
    const r = await book(query, demo.business, input, { source: "online" });
    expect(r.ok).toBe(true);
    expect(who(await pushRows())).toEqual(["valentin:visit_new"]);

    await setNotify(query, demo.business.id, ids.owner, "own_online", true);
    await book(query, demo.business, { ...input, startsAt: new Date(at(DAY, "13:00")).toISOString(), phone: "+372 5555 0502", idempotencyKey: `push-book-${Math.random()}` }, { source: "online" });
    expect(who(await pushRows())).toEqual(["owner:own_online", "valentin:visit_new", "valentin:visit_new"]);
  });

  it("Renat's change: the barber hears of it, Renat does not hear of his own", async () => {
    const r = await adminCreateVisit(demo.business, visit("valentin", "12:00"), ids.owner);
    if (!r.ok) throw new Error(r.code);
    await adminUpdateVisit(demo.business, r.id, { staffId: demo.staff.jevgeni, start: at(DAY, "15:00") }, ids.owner);
    await adminCancelVisit(demo.business, r.id, ids.owner);
    // moved to another barber: both columns hear; then the new one hears of the cancel
    expect(who(await pushRows())).toEqual(["jevgeni:visit_cancelled", "jevgeni:visit_moved", "valentin:visit_moved", "valentin:visit_new"]);
  });

  it("a barber's own emergency cancel: Renat gets it with the reason, the barber does not get his own", async () => {
    const r = await adminCreateVisit(demo.business, visit("valentin", "12:00"), ids.owner);
    if (!r.ok) throw new Error(r.code);
    await query("delete from notifications");
    expect(await adminCancelVisit(demo.business, r.id, ids.valentin, { onlyStaffId: demo.staff.valentin, reason: "заболел" })).toBe("cancelled");
    const rows = await pushRows();
    expect(who(rows)).toEqual(["owner:own_barber"]);
    expect(rows[0].payload).toMatchObject({ action: "cancelled", reason: "заболел", staff: "Valentin" });
  });

  it("a barber may cancel only in his own column", async () => {
    const r = await adminCreateVisit(demo.business, visit("jevgeni", "12:00"), ids.owner);
    if (!r.ok) throw new Error(r.code);
    expect(await adminCancelVisit(demo.business, r.id, ids.valentin, { onlyStaffId: demo.staff.valentin })).toBe("not_found");
    expect(await adminUpdateVisit(demo.business, r.id, { start: at(DAY, "16:00") }, ids.valentin, { onlyStaffId: demo.staff.valentin })).toEqual({ ok: false, code: "not_found" });
    expect(await adminCreateVisit(demo.business, visit("jevgeni", "17:00"), ids.valentin, { onlyStaffId: demo.staff.valentin })).toEqual({ ok: false, code: "invalid", field: "staff" });
  });

  it("a switched-off kind, a login without a phone, an inactive login: no row", async () => {
    await setNotify(query, demo.business.id, ids.valentin, "visit_new", false);
    await query("update users set active = false where id = $1", [ids.jevgeni]);
    await adminCreateVisit(demo.business, visit("valentin", "10:00"), ids.owner);
    await adminCreateVisit(demo.business, visit("jevgeni", "10:00"), ids.owner);
    await adminCreateVisit(demo.business, visit("slava", "10:00"), ids.owner);
    expect(await pushRows()).toEqual([]);
  });

  it("Renat with a column of his own hears of it as a barber does, and gets his own day's plan", async () => {
    await query("update users set staff_id = $2 where id = $1", [ids.owner, demo.staff.renat]);
    const input: BookingInput = {
      serviceIds: [demo.services.clip],
      staffId: demo.staff.renat,
      startsAt: new Date(at(DAY, "11:00")).toISOString(),
      name: "Test Client",
      phone: "+372 5555 0503",
      locale: "ru",
      smsReminder: true,
      idempotencyKey: `push-book-${Math.random()}`,
    };
    expect((await book(query, demo.business, input, { source: "online" })).ok).toBe(true);
    expect(who(await pushRows())).toEqual(["owner:visit_new"]);
    expect(kindsFor("owner", true)).toEqual(["visit_new", "visit_moved", "visit_cancelled", "day_plan", ...OWNER_KINDS]);
    expect(kindsFor("owner")).toEqual(OWNER_KINDS);

    await query("delete from notifications");
    await planEveningPush(query, at("2026-11-30", "20:05"));
    // own_plan is off until he switches it on
    expect(who(await pushRows()).filter((w) => w.startsWith("owner"))).toEqual(["owner:day_plan"]);
  });

  it("nothing is queued without the keys", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    expect(pushConfigured()).toBe(false);
    await adminCreateVisit(demo.business, visit("valentin", "10:00"), ids.owner);
    expect(await pushRows()).toEqual([]);
  });
});

describe("push: the words", () => {
  const payload = { visitId: "v1", startsAt: new Date(at(DAY, "14:30")).toISOString(), tz: TZ, client: "Test Client", services: [{ ru: "Стрижка", et: "Lõikus", en: "Haircut" }], staff: "Valentin" };

  it("say when, who and what, in the reader's language, and where a tap goes", () => {
    expect(pushText("visit_new", payload, "ru")).toEqual({ title: "Новая запись", body: "вт 01.12, 14:30 · Test Client · Стрижка", url: "/b?d=2026-12-01", tag: "visit-v1" });
    expect(pushText("visit_new", payload, "en")?.body).toBe("Tue 01.12, 14:30 · Test Client · Haircut");
    expect(pushText("visit_moved", { ...payload, fromStart: new Date(at(DAY, "12:00")).toISOString() }, "ru")?.body).toBe("Test Client: вт 01.12, 12:00 → вт 01.12, 14:30");
    expect(pushText("own_barber", { ...payload, action: "cancelled", reason: "заболел" }, "ru")).toMatchObject({ title: "Valentin: отмена записи", url: "/admin?d=2026-12-01" });
    expect(pushText("own_barber", { ...payload, action: "cancelled", reason: "заболел" }, "ru")?.body).toContain("«заболел»");
  });

  it("never show a phone: a «name» with digits becomes «Клиент»", () => {
    expect(safeClient("+372 5555 0101", "ru")).toBe("Клиент");
    expect(safeClient("Ivan 55550101", "et")).toBe("Klient");
    expect(safeClient("Ivan", "en")).toBe("Ivan");
    const t = pushText("visit_new", { ...payload, client: "55550101" }, "ru");
    expect(t?.body).not.toMatch(/\d{4}/);
    // nor a phone typed into a cancel reason
    const c = pushText("own_barber", { ...payload, action: "cancelled", reason: "перенёс, клиент +372 5555 0101 в курсе" }, "ru");
    expect(c?.body).toContain("«перенёс, клиент … в курсе»");
    expect(c?.body.replace(/\d\d\.\d\d, \d\d:\d\d/g, "")).not.toMatch(/\d{3}/);
  });

  it("the plan for tomorrow", () => {
    expect(pushText("day_plan", { date: DAY, tz: TZ, count: 3, firstAt: new Date(at(DAY, "10:00")).toISOString(), totalCents: 12000 }, "ru")?.body).toBe("3 записи, первая в 10:00 · 120 €");
    expect(pushText("day_plan", { date: DAY, tz: TZ, count: 0 }, "en")?.body).toBe("No visits.");
    expect(pushText("own_plan", { date: DAY, tz: TZ, count: 5, perStaff: [{ name: "Renat", n: 3 }, { name: "Valentin", n: 2 }] }, "ru")?.body).toBe("5 записей: Renat 3, Valentin 2");
  });

  it("defaults until Renat answers question 4: requests and a barber's cancel on, the rest off", () => {
    expect(wants({}, "own_barber")).toBe(true);
    expect(wants({}, "own_request")).toBe(true);
    expect(wants({}, "own_online")).toBe(false);
    expect(wants({}, "own_client")).toBe(false);
    expect(wants({}, "own_plan")).toBe(false);
    expect(wants({ own_plan: true }, "own_plan")).toBe(true);
    expect(Object.entries(DEFAULT_ON).filter(([k]) => !k.startsWith("own_")).every(([, on]) => on)).toBe(true);
  });
});

describe("push: subscriptions", () => {
  it("takes the browser's subscription, nested or flat, https only", () => {
    const keys = { p256dh: "BAbc", auth: "xyz" };
    expect(cleanSubscription({ endpoint: "https://web.push.apple.com/abcdef", keys })).toMatchObject({ endpoint: "https://web.push.apple.com/abcdef", ...keys, label: "" });
    expect(cleanSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/x", ...keys }, "Android")).toMatchObject({ label: "Android" });
    expect(cleanSubscription({ endpoint: "https://updates.push.services.mozilla.com/wpush/v2/x", keys })).not.toBeNull();
    expect(cleanSubscription({ endpoint: "https://wns2-par02p.notify.windows.com/w/?token=x", keys })).not.toBeNull();
    expect(cleanSubscription({ endpoint: "http://insecure.example.test/abcdefgh", keys })).toBeNull();
    // the server POSTs to it: never another host, an IP, a port or a login in the address
    for (const endpoint of [
      "https://evil.example.test/fcm/send/abcdef",
      "https://169.254.169.254/latest/meta-data",
      "https://fcm.googleapis.com.evil.example.test/x",
      "https://fcm.googleapis.com:8443/fcm/send/abcdef",
      "https://user:pw@fcm.googleapis.com/fcm/send/abcdef",
      "https://localhost/fcm/send/abcdefgh",
    ]) {
      expect(cleanSubscription({ endpoint, keys }), endpoint).toBeNull();
    }
    expect(cleanSubscription({ endpoint: "https://x.test/1", keys: {} })).toBeNull();
    expect(cleanSubscription("nope")).toBeNull();
  });

  it("a saved row that is not a push service is retired, never called", async () => {
    const r = await sendPushToUser(query, ids.valentin, { title: "t", body: "b", url: "/b", tag: "t" }, ENV);
    expect(r).toEqual({ devices: 1, sent: 0, failed: 0, gone: 1 });
    const [row] = await query<{ retired_reason: string }>("select retired_reason from push_subscriptions where user_id = $1", [ids.valentin]);
    expect(row.retired_reason).toBe("gone");
  });

  it("a login switched off, or a phone logged out, gets nothing more", async () => {
    await query("update users set active = false where id = $1", [ids.valentin]);
    expect(await sendPushToUser(query, ids.valentin, { title: "t", body: "b", url: "/b", tag: "t" }, ENV)).toEqual({ devices: 0, sent: 0, failed: 0, gone: 0 });
    expect(await removeSubscription(query, ids.jevgeni, "https://push.example.test/jevgeni@example.test", "logout")).toBe(true);
    expect(await removeSubscription(query, ids.jevgeni, "https://push.example.test/jevgeni@example.test", "logout")).toBe(false);
    const [row] = await query<{ retired_reason: string }>("select retired_reason from push_subscriptions where user_id = $1", [ids.jevgeni]);
    expect(row.retired_reason).toBe("logout");
  });

  it("one phone, one login: subscribing again from another login moves it", async () => {
    await saveSubscription(query, ids.jevgeni, { endpoint: "https://push.example.test/valentin@example.test", p256dh: "p", auth: "a", label: "" });
    const rows = await query<{ user_id: string; label: string }>("select user_id, label from push_subscriptions where endpoint = 'https://push.example.test/valentin@example.test'");
    expect(rows).toEqual([{ user_id: ids.jevgeni, label: "test" }]);
  });
});

describe("push: the outbox", () => {
  const sent: { userId: string; msg: PushText }[] = [];
  const senders: Senders = {
    sms: sendSms,
    email: sendEmail,
    push: async (_q, userId, msg) => {
      sent.push({ userId, msg });
      return { devices: 1, sent: 1, failed: 0, gone: 0 };
    },
  };
  beforeEach(async () => {
    sent.length = 0;
    // these run on the real clock; after 20:00 in Tallinn the outbox would
    // also plan tomorrow's push. The last test turns it back on.
    await query(`update users set notify = notify || '{"day_plan": false}'::jsonb`);
  });

  it("sends a due push in the reader's language and marks it sent", async () => {
    await query("update users set locale = 'et' where id = $1", [ids.valentin]);
    const r = await adminCreateVisit(demo.business, visit("valentin", "12:00"), ids.owner);
    if (!r.ok) throw new Error(r.code);
    const res = await runOutbox(query, Date.now(), ENV, senders);
    expect(res.sent).toBeGreaterThanOrEqual(1);
    expect(sent).toEqual([{ userId: ids.valentin, msg: expect.objectContaining({ title: "Uus broneering", url: "/b?d=2026-12-01" }) }]);
    expect((await pushRows())[0].status).toBe("sent");
  });

  it("drops a push that is two hours late, and a «new visit» cancelled since", async () => {
    const a = await adminCreateVisit(demo.business, visit("valentin", "12:00"), ids.owner);
    if (!a.ok) throw new Error(a.code);
    await query("update notifications set send_at = now() - interval '3 hours'");
    const b = await adminCreateVisit(demo.business, visit("valentin", "14:00"), ids.owner);
    if (!b.ok) throw new Error(b.code);
    await query("update appointments set status = 'cancelled' where id = $1", [b.id]);
    await runOutbox(query, Date.now(), ENV, senders);
    expect(sent).toEqual([]);
    expect((await pushRows()).map((r) => r.status)).toEqual(["skipped", "skipped"]);
  });

  it("is not claimed at all without the keys: the rows wait", async () => {
    await queuePush(query, { businessId: demo.business.id, kind: "visit_new", to: { staffId: demo.staff.valentin }, payload: {} });
    await runOutbox(query, Date.now(), { NODE_ENV: "test", VITEST: "true" }, senders);
    expect(sent).toEqual([]);
    expect((await pushRows())[0].status).toBe("queued");
  });

  it("queues tomorrow's plan from 20:00, once, and builds it when it goes", async () => {
    await query("update users set notify = '{}'::jsonb");
    await setNotify(query, demo.business.id, ids.owner, "own_plan", true);
    const v = await adminCreateVisit(demo.business, visit("valentin", "10:30"), ids.owner);
    if (!v.ok) throw new Error(v.code);
    await query("delete from notifications");
    const evening = at("2026-11-30", "20:05");
    expect(await planEveningPush(query, at("2026-11-30", "19:55"))).toBe(0);
    expect(await planEveningPush(query, evening)).toBe(3);
    expect(await planEveningPush(query, evening + 30 * 60_000)).toBe(0);
    expect(who(await pushRows())).toEqual(["jevgeni:day_plan", "owner:own_plan", "valentin:day_plan"]);

    await runOutbox(query, evening + 60_000, ENV, senders);
    const byUser = Object.fromEntries(sent.map((s) => [s.userId, s.msg]));
    expect(byUser[ids.valentin]).toMatchObject({ title: "План на завтра", body: expect.stringMatching(/^1 запись, первая в 10:30 · \d+ €$/) });
    expect(byUser[ids.jevgeni]).toMatchObject({ body: "Записей нет." });
    expect(byUser[ids.owner]).toMatchObject({ title: "Завтра в салоне", body: "1 запись: Valentin 1" });
    expect(OUTBOX.planAt).toBe("20:00");
  });
});
