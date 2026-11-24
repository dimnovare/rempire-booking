/**
 * The bell in the admin's sidebar head (046_bell.sql, src/lib/bell.ts): the
 * same events as the staff pushes, for every login the push would reach,
 * with a phone or without one; the push's own outbox rows unchanged; a
 * login's own rows only, newest first, in the words of the push in his
 * language; the red dot until he opens it; the evening plan once a day.
 * Fake people and fake keys only.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { anonymiseClient } from "@/lib/admin/clients";
import { adminCancelVisit, adminCreateVisit, adminUpdateVisit, type AdminVisitInput } from "@/lib/admin/visits";
import { BELL, bellFeed, bellUnread, openBell, pruneBell } from "@/lib/bell";
import { bellWhen } from "@/lib/bell-when";
import { book, type BookingInput } from "@/lib/booking";
import { closeDb, query } from "@/lib/db";
import { planEveningBell, planEveningPush, runOutbox } from "@/lib/outbox";
import { queuePush, saveSubscription, setNotify } from "@/lib/push";
import { pushText } from "@/lib/push-kinds";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
// far enough ahead of the real clock that no visit here is «over»
const DAY = "2026-12-01";
const KEYS = { VAPID_PUBLIC_KEY: "test-public-key", VAPID_PRIVATE_KEY: "test-private-key" };
const MIN = 60_000;

let demo: Demo;
type Who = "owner" | "desk" | "valentin" | "jevgeni" | "quiet";
let ids: Record<Who, string>;
/** the logins with a live phone: the only ones the push reaches */
let phones: Set<string>;

async function login(email: string, role: string, staff: string | null, phone: boolean, locale = "ru"): Promise<string> {
  const [u] = await query<{ id: string }>("insert into users (business_id, email, role, staff_id, locale) values ($1, $2, $3, $4, $5) returning id", [
    demo.business.id,
    email,
    role,
    staff ? demo.staff[staff] : null,
    locale,
  ]);
  if (phone) {
    await saveSubscription(query, u.id, { endpoint: `https://push.example.test/${email}`, p256dh: "p256", auth: "auth", label: "test" });
    phones.add(u.id);
  }
  return u.id;
}

beforeEach(async () => {
  demo = await freshDemo();
  Object.assign(process.env, KEYS);
  phones = new Set();
  ids = {
    owner: await login("owner@example.test", "owner", null, true),
    // the front desk, in English, with no phone at all
    desk: await login("desk@example.test", "admin", null, false, "en"),
    valentin: await login("valentin@example.test", "staff", "valentin", true),
    jevgeni: await login("jevgeni@example.test", "staff", "jevgeni", true),
    // a barber login with no phone: no push, but the bell
    quiet: await login("slava@example.test", "staff", "slava", false),
  };
});
afterEach(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});
afterAll(closeDb);

const name = (userId: string) => Object.entries(ids).find(([, id]) => id === userId)?.[0] ?? "?";
const pushRows = () => query<{ user_id: string; kind: string }>("select user_id, kind from notifications where channel = 'push' order by created_at, kind");
const bellRows = () =>
  query<{ user_id: string; kind: string; payload: Record<string, unknown>; appointment_id: string | null }>("select user_id, kind, payload, appointment_id from bell order by id");
const who = (rows: { user_id: string; kind: string }[]) => rows.map((r) => `${name(r.user_id)}:${r.kind}`).sort();
/** The push's audience is the bell's, less the logins with no phone. */
async function expectPushIsBellWithPhones() {
  const bell = (await bellRows()).filter((r) => phones.has(r.user_id));
  expect(who(await pushRows())).toEqual(who(bell));
}

let n = 0;
const visit = (staff: string, time: string, o: Partial<AdminVisitInput> = {}): AdminVisitInput => ({
  staffId: demo.staff[staff],
  start: at(DAY, time),
  serviceIds: [demo.services.clip],
  name: "Test Client",
  phone: `+372 5555 0${600 + ++n}`,
  idempotencyKey: `bell-test-${n}-${Math.random()}`,
  ...o,
});
const online = (staff: string, time: string): BookingInput => ({
  serviceIds: [demo.services.clip],
  staffId: demo.staff[staff],
  startsAt: new Date(at(DAY, time)).toISOString(),
  name: "Bell Client",
  phone: `+372 5555 0${600 + ++n}`,
  email: null,
  comment: "",
  locale: "ru",
  smsReminder: true,
  idempotencyKey: `bell-book-${n}-${Math.random()}`,
});

describe("bell: who gets a row", () => {
  it("a login without a phone gets the row its push would have been", async () => {
    const r = await adminCreateVisit(demo.business, visit("slava", "10:00"), ids.owner);
    expect(r.ok).toBe(true);
    // no push to slava (no phone), but his bell has it
    expect(who(await pushRows())).toEqual([]);
    const rows = await bellRows();
    expect(who(rows)).toEqual(["quiet:visit_new"]);
    expect(rows[0]).toMatchObject({ appointment_id: r.ok ? r.id : null, payload: { client: "Test Client", staff: "Slava" } });
  });

  it("an online booking: the barber, and Renat and the front desk, as the push; the outbox rows as before", async () => {
    expect((await book(query, demo.business, online("valentin", "11:00"), { source: "online" })).ok).toBe(true);
    // the push exactly as push.test.ts has it: no row for the desk, who has no phone
    expect(who(await pushRows())).toEqual(["owner:own_online", "valentin:visit_new"]);
    expect(who(await bellRows())).toEqual(["desk:own_online", "owner:own_online", "valentin:visit_new"]);
    await expectPushIsBellWithPhones();
  });

  it("the one who made the change hears nothing; a move tells both columns; a switched-off kind and an inactive login: no row", async () => {
    const r = await adminCreateVisit(demo.business, visit("valentin", "12:00"), ids.owner);
    if (!r.ok) throw new Error(r.code);
    await adminUpdateVisit(demo.business, r.id, { staffId: demo.staff.jevgeni, start: at(DAY, "15:00") }, ids.owner);
    await adminCancelVisit(demo.business, r.id, ids.owner);
    // the same list as push.test.ts «Renat's change»
    expect(who(await pushRows())).toEqual(["jevgeni:visit_cancelled", "jevgeni:visit_moved", "valentin:visit_moved", "valentin:visit_new"]);
    expect(who(await bellRows())).toEqual(["jevgeni:visit_cancelled", "jevgeni:visit_moved", "valentin:visit_moved", "valentin:visit_new"]);

    await query("delete from bell");
    await query("delete from notifications");
    await setNotify(query, demo.business.id, ids.quiet, "visit_new", false);
    await query("update users set active = false where id = $1", [ids.jevgeni]);
    await adminCreateVisit(demo.business, visit("slava", "13:00"), ids.owner);
    await adminCreateVisit(demo.business, visit("jevgeni", "13:00"), ids.owner);
    expect(await bellRows()).toEqual([]);
    expect(await pushRows()).toEqual([]);
  });

  it("a barber's own cancel: Renat and the desk once they switch it on, never the barber himself", async () => {
    const r = await adminCreateVisit(demo.business, visit("valentin", "12:00"), ids.owner);
    if (!r.ok) throw new Error(r.code);
    await query("delete from bell");
    await query("delete from notifications");
    // off from the start (Renat, 18.11): nobody yet
    expect(await adminCancelVisit(demo.business, r.id, ids.valentin, { onlyStaffId: demo.staff.valentin, reason: "заболел" })).toBe("cancelled");
    expect(who(await bellRows())).toEqual([]);

    const s = await adminCreateVisit(demo.business, visit("valentin", "14:00"), ids.owner);
    if (!s.ok) throw new Error(s.code);
    await setNotify(query, demo.business.id, ids.owner, "own_barber", true);
    await setNotify(query, demo.business.id, ids.desk, "own_barber", true);
    await query("delete from bell");
    await query("delete from notifications");
    await adminCancelVisit(demo.business, s.id, ids.valentin, { onlyStaffId: demo.staff.valentin, reason: "заболел" });
    expect(who(await bellRows())).toEqual(["desk:own_barber", "owner:own_barber"]);
    await expectPushIsBellWithPhones();
  });

  it("Renat with a column of his own hears of it once, as the barber, in the bell too", async () => {
    await query("update users set staff_id = $2 where id = $1", [ids.owner, demo.staff.renat]);
    expect((await book(query, demo.business, online("renat", "11:00"), { source: "online" })).ok).toBe(true);
    expect(who(await pushRows())).toEqual(["owner:visit_new"]);
    expect(who(await bellRows())).toEqual(["desk:own_online", "owner:visit_new"]);
  });

  it("queuePush (a barber's request, Renat's answer, a review): the same rules, onlyUserIds kept", async () => {
    const payload = { reviewId: "r1", rating: 5, staff: null };
    await queuePush(query, { businessId: demo.business.id, kind: "own_review", to: "owners", onlyUserIds: [ids.desk], payload });
    expect(who(await bellRows())).toEqual(["desk:own_review"]);
    // the desk has no phone: no push
    expect(who(await pushRows())).toEqual([]);
    const answer = { requestId: "q1", answer: "approved", tz: TZ, what: { kind: "time_off", offKind: "vacation", from: DAY, to: DAY } };
    await queuePush(query, { businessId: demo.business.id, kind: "request_answer", to: { staffId: demo.staff.slava }, exceptUserId: ids.owner, payload: answer });
    expect(who(await bellRows())).toEqual(["desk:own_review", "quiet:request_answer"]);
  });

  it("without the push keys: no outbox row, the bell still rings", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    expect((await book(query, demo.business, online("valentin", "16:00"), { source: "online" })).ok).toBe(true);
    expect(await pushRows()).toEqual([]);
    expect(who(await bellRows())).toEqual(["desk:own_online", "owner:own_online", "valentin:visit_new"]);
  });

  it("«Обезличить клиента» takes his name out of the bell as out of the pushes", async () => {
    const r = await adminCreateVisit(demo.business, visit("slava", "10:00", { name: "Private Person" }), ids.owner);
    if (!r.ok) throw new Error(r.code);
    const [v] = await query<{ client_id: string }>("select client_id from appointments where id = $1", [r.id]);
    // a visit still ahead is cancelled first (anonymiseClient refuses it otherwise)
    expect(await adminCancelVisit(demo.business, r.id, ids.owner)).toBe("cancelled");
    expect((await bellRows()).map((x) => x.payload.client)).toEqual(["Private Person", "Private Person"]);
    expect(await anonymiseClient(demo.business, v.client_id, ids.owner)).toEqual({ ok: true });
    expect((await bellRows()).map((x) => x.payload.client)).toEqual([undefined, undefined]);
    const items = await bellFeed(query, ids.quiet, demo.business.id, "ru");
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.body).toContain("Клиент");
      expect(item.body).not.toContain("Private");
    }
  });
});

describe("bell: what a login reads", () => {
  it("his own rows only, newest first, in the words of the push and in his language", async () => {
    const t0 = Date.now();
    await book(query, demo.business, online("valentin", "11:00"), { source: "online" });
    const [first] = await query<{ id: string }>("select id from appointments order by created_at desc limit 1");
    // a second one a minute later: it comes first
    await query("update bell set created_at = $1", [new Date(t0 - MIN)]);
    await book(query, demo.business, online("jevgeni", "12:00"), { source: "online" });

    const owner = await bellFeed(query, ids.owner, demo.business.id, "ru");
    expect(owner.map((i) => i.title)).toEqual(["Онлайн-запись", "Онлайн-запись"]);
    expect(owner[0].body).toContain("Jevgeni");
    expect(owner[1].body).toContain("Valentin");
    // the push's own words and its link
    const [row] = await query<{ payload: Record<string, unknown> }>("select payload from bell where user_id = $1 and appointment_id = $2", [ids.owner, first.id]);
    const text = pushText("own_online", row.payload, "ru")!;
    expect(owner[1]).toMatchObject({ title: text.title, body: text.body, url: text.url, unread: true });
    expect(owner[1].url).toBe(`/admin?d=${DAY}`);

    // the desk reads English
    const desk = await bellFeed(query, ids.desk, demo.business.id, "en");
    expect(desk.map((i) => i.title)).toEqual(["Online booking", "Online booking"]);
    expect(desk[0].body).toContain("Tue 01.12, 12:00");

    // a barber sees his own visit only, none of the salon's
    const valentin = await bellFeed(query, ids.valentin, demo.business.id, "ru");
    expect(valentin.map((i) => i.title)).toEqual(["Новая запись"]);
    expect(valentin[0].url).toBe(`/b?d=${DAY}`);
    expect(await bellFeed(query, ids.quiet, demo.business.id, "ru")).toEqual([]);
  });

  it("the dot: unread until he opens it; what came after is unread again", async () => {
    expect(await bellUnread(query, ids.owner, demo.business.id)).toBe(0);
    expect(await openBell(query, ids.owner, demo.business.id, "ru")).toEqual([]);

    await book(query, demo.business, online("valentin", "11:00"), { source: "online" });
    await book(query, demo.business, online("jevgeni", "11:00"), { source: "online" });
    expect(await bellUnread(query, ids.owner, demo.business.id)).toBe(2);
    expect(await bellUnread(query, ids.desk, demo.business.id)).toBe(2);

    const opened = await openBell(query, ids.owner, demo.business.id, "ru");
    expect(opened.map((i) => i.unread)).toEqual([true, true]);
    expect(await bellUnread(query, ids.owner, demo.business.id)).toBe(0);
    // the desk's mark is his own
    expect(await bellUnread(query, ids.desk, demo.business.id)).toBe(2);

    // a minute later, one more
    const r = await book(query, demo.business, online("slava", "11:00"), { source: "online" });
    if (!r.ok) throw new Error(r.code);
    await query("update bell set created_at = created_at + interval '1 minute' where appointment_id = $1", [r.visit.id]);
    expect(await bellUnread(query, ids.owner, demo.business.id)).toBe(1);
    const again = await openBell(query, ids.owner, demo.business.id, "ru");
    expect(again.map((i) => i.unread)).toEqual([true, false, false]);
    expect(await bellUnread(query, ids.owner, demo.business.id)).toBe(0);
    // opening again changes nothing
    expect((await openBell(query, ids.owner, demo.business.id, "ru")).map((i) => i.unread)).toEqual([false, false, false]);
  });

  it("a kind the salon switched off for push on «Уведомления» is left out, as the push leaves it out", async () => {
    await book(query, demo.business, online("valentin", "11:00"), { source: "online" });
    expect(await bellUnread(query, ids.owner, demo.business.id)).toBe(1);
    await query(`update businesses set settings = settings || '{"notifications": {"off": ["own_online"]}}'::jsonb where id = $1`, [demo.business.id]);
    expect(await bellFeed(query, ids.owner, demo.business.id, "ru")).toEqual([]);
    expect(await bellUnread(query, ids.owner, demo.business.id)).toBe(0);
    // the barber's own kind is still on
    expect((await bellFeed(query, ids.valentin, demo.business.id, "ru")).length).toBe(1);
  });

  it("bounded: the newest 30 of the last 30 days; the cron prunes the rest", async () => {
    const now = Date.now();
    for (let i = 0; i < BELL.limit + 5; i++) {
      await query("insert into bell (business_id, user_id, kind, payload, created_at) values ($1, $2, 'own_review', $3::jsonb, $4)", [
        demo.business.id,
        ids.owner,
        JSON.stringify({ reviewId: `r${i}`, rating: 4 }),
        new Date(now - i * MIN),
      ]);
    }
    await query("insert into bell (business_id, user_id, kind, payload, created_at) values ($1, $2, 'own_review', $3::jsonb, $4)", [
      demo.business.id,
      ids.owner,
      JSON.stringify({ reviewId: "old", rating: 4 }),
      new Date(now - (BELL.days + 1) * 86_400_000),
    ]);
    const feed = await bellFeed(query, ids.owner, demo.business.id, "ru", now);
    expect(feed).toHaveLength(BELL.limit);
    expect(feed[0].title).toBe("Новый отзыв");
    expect(Date.parse(feed[0].at)).toBe(now);
    expect(await bellUnread(query, ids.owner, demo.business.id, now)).toBe(BELL.limit);
    expect(await pruneBell(query, now)).toBe(1);
    const [left] = await query<{ n: number }>("select count(*)::int as n from bell");
    expect(left.n).toBe(BELL.limit + 5);
  });
});

describe("bell: the evening plan", () => {
  const evening = at("2026-11-30", "20:05");

  it("tomorrow's plan for every login the push would reach, phone or not, once a day, with its numbers", async () => {
    await adminCreateVisit(demo.business, visit("slava", "10:00"), ids.owner);
    await adminCreateVisit(demo.business, visit("slava", "12:00"), ids.owner);
    await query("delete from bell");
    await query("delete from notifications");

    await planEveningPush(query, evening);
    expect(await planEveningBell(query, evening)).toBe(3);
    // own_plan is off until switched on; the barbers each their own day
    expect(who(await pushRows())).toEqual(["jevgeni:day_plan", "valentin:day_plan"]);
    expect(who(await bellRows())).toEqual(["jevgeni:day_plan", "quiet:day_plan", "valentin:day_plan"]);
    await expectPushIsBellWithPhones();

    // once a day, however often the cron runs
    expect(await planEveningBell(query, evening + 5 * MIN)).toBe(0);
    expect(await bellRows()).toHaveLength(3);

    const [plan] = await bellFeed(query, ids.quiet, demo.business.id, "ru", evening);
    expect(plan).toMatchObject({ title: "План на завтра", url: `/b?d=${DAY}` });
    expect(plan.body).toMatch(/^2 записи, первая в 10:00/);

    // the salon's plan once Renat and the desk switch it on
    await setNotify(query, demo.business.id, ids.owner, "own_plan", true);
    await setNotify(query, demo.business.id, ids.desk, "own_plan", true);
    expect(await planEveningBell(query, evening + 10 * MIN)).toBe(2);
    const [salon] = await bellFeed(query, ids.desk, demo.business.id, "en", evening + 10 * MIN);
    expect(salon).toMatchObject({ title: "Tomorrow at the salon", url: "/admin" });
    expect(salon.body).toContain("Slava 2");
  });

  it("before the hour nothing; without the push keys the cron still writes the bell's, and no push", async () => {
    expect(await planEveningBell(query, at("2026-11-30", "19:55"))).toBe(0);
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    await runOutbox(query, evening, { NODE_ENV: "test", VITEST: "true" });
    expect(await pushRows()).toEqual([]);
    expect(who(await bellRows())).toEqual(["jevgeni:day_plan", "quiet:day_plan", "valentin:day_plan"]);
  });
});

describe("bell: when, as it says it", () => {
  const now = at("2026-11-24", "15:00");
  it("just now, minutes, today, yesterday, then the day", () => {
    expect(bellWhen(now - 20_000, now, TZ)).toEqual({ kind: "now" });
    expect(bellWhen(now - 5 * MIN, now, TZ)).toEqual({ kind: "min", n: 5 });
    expect(bellWhen(now - 59 * MIN, now, TZ)).toEqual({ kind: "min", n: 59 });
    expect(bellWhen(at("2026-11-24", "09:05"), now, TZ)).toEqual({ kind: "today", time: "09:05" });
    expect(bellWhen(at("2026-11-23", "18:20"), now, TZ)).toEqual({ kind: "yesterday", time: "18:20" });
    expect(bellWhen(at("2026-11-02", "08:00"), now, TZ)).toEqual({ kind: "day", date: "02.11", time: "08:00" });
    expect(bellWhen(at("2025-12-30", "08:00"), at("2026-01-02", "10:00"), TZ)).toEqual({ kind: "day", date: "30.12.2025", time: "08:00" });
  });
});
