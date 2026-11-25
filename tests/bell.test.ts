/**
 * The bell in the admin's sidebar head (046_bell.sql, src/lib/bell.ts): the
 * same events as the staff pushes, for every login the push would reach,
 * with a phone or without one; the push's own outbox rows unchanged; a
 * login's own rows only, newest first, in the words of the push in his
 * language; in two groups, paged, each row read on its own (047); the
 * evening plan once a day.
 * Fake people and fake keys only.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { anonymiseClient } from "@/lib/admin/clients";
import { adminCancelVisit, adminCreateVisit, adminUpdateVisit, type AdminVisitInput } from "@/lib/admin/visits";
import { BELL, bellFeed, bellPage, bellSummary, bellUnread, pruneBell, readBell, readBellGroup } from "@/lib/bell";
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
    expect(owner.map((i) => i.title)).toEqual(["Новая онлайн-запись", "Новая онлайн-запись"]);
    expect(owner.map((i) => i.icon)).toEqual(["online", "online"]);
    expect(owner[0].body).toContain("Jevgeni");
    expect(owner[1].body).toContain("Valentin");
    // the push's own words and its link
    const [row] = await query<{ payload: Record<string, unknown> }>("select payload from bell where user_id = $1 and appointment_id = $2", [ids.owner, first.id]);
    const text = pushText("own_online", row.payload, "ru")!;
    expect(owner[1]).toMatchObject({ title: text.title, body: text.body, url: text.url, unread: true });
    expect(owner[1].url).toBe(`/admin?d=${DAY}`);

    // the desk reads English
    const desk = await bellFeed(query, ids.desk, demo.business.id, "en");
    expect(desk.map((i) => i.title)).toEqual(["New online booking", "New online booking"]);
    expect(desk[0].body).toContain("Tue 01.12, 12:00");

    // a barber sees his own visit only, none of the salon's
    const valentin = await bellFeed(query, ids.valentin, demo.business.id, "ru");
    expect(valentin.map((i) => i.title)).toEqual(["Новая запись"]);
    // booked online: the phone in its circle, as the product we follow
    expect(valentin[0].icon).toBe("online");
    expect(valentin[0].url).toBe(`/b?d=${DAY}`);
    expect(await bellFeed(query, ids.quiet, demo.business.id, "ru")).toEqual([]);
  });

  it("unread until read: opening reads nothing; a row read on its own, a group with «Прочитать все»; each login his own", async () => {
    expect(await bellUnread(query, ids.owner, demo.business.id)).toBe(0);
    expect(await bellSummary(query, ids.owner, demo.business.id, "ru")).toEqual({ visits: { unread: 0, items: [] }, other: { unread: 0, items: [] } });

    await book(query, demo.business, online("valentin", "11:00"), { source: "online" });
    await book(query, demo.business, online("jevgeni", "11:00"), { source: "online" });
    expect(await bellUnread(query, ids.owner, demo.business.id)).toBe(2);
    expect(await bellUnread(query, ids.desk, demo.business.id)).toBe(2);

    // the first view: both rows under «Записи», unread; opening it reads nothing
    const first = await bellSummary(query, ids.owner, demo.business.id, "ru");
    expect(first.visits.unread).toBe(2);
    expect(first.visits.items.map((i) => i.unread)).toEqual([true, true]);
    expect(first.other).toEqual({ unread: 0, items: [] });
    expect(await bellUnread(query, ids.owner, demo.business.id)).toBe(2);

    // one row read on its own (a click, or its mark); an id of another login's row does nothing to it
    await readBell(query, ids.owner, demo.business.id, [first.visits.items[1].id]);
    await readBell(query, ids.desk, demo.business.id, [first.visits.items[0].id]);
    expect((await bellSummary(query, ids.owner, demo.business.id, "ru")).visits.items.map((i) => i.unread)).toEqual([true, false]);
    expect(await bellUnread(query, ids.owner, demo.business.id)).toBe(1);
    expect(await bellUnread(query, ids.desk, demo.business.id, Date.now(), "visits")).toBe(2);

    // a review lands in «Остальные»; «Прочитать все» of «Записи» leaves it unread
    await query("insert into bell (business_id, user_id, kind, payload) values ($1, $2, 'own_review', $3::jsonb)", [demo.business.id, ids.owner, JSON.stringify({ reviewId: "r1", rating: 5 })]);
    expect(await bellUnread(query, ids.owner, demo.business.id, Date.now(), "other")).toBe(1);
    await readBellGroup(query, ids.owner, demo.business.id, "visits");
    const after = await bellSummary(query, ids.owner, demo.business.id, "ru");
    expect(after.visits.unread).toBe(0);
    expect(after.visits.items.map((i) => i.unread)).toEqual([false, false]);
    expect(after.other.unread).toBe(1);
    expect(after.other.items.map((i) => [i.title, i.icon, i.unread])).toEqual([["Новый отзыв", "review", true]]);
    expect(await bellUnread(query, ids.owner, demo.business.id)).toBe(1);
    // the desk's rows are still his own, unread
    expect(await bellUnread(query, ids.desk, demo.business.id)).toBe(2);
  });

  it("the old mark (046): what it had read stays read after 047", async () => {
    await book(query, demo.business, online("valentin", "11:00"), { source: "online" });
    const [row] = await query<{ created_at: Date }>("select created_at from bell where user_id = $1", [ids.owner]);
    await query("update users set bell_seen_at = $2 where id = $1", [ids.owner, row.created_at]);
    // 047's own update, for rows written before it ran
    await query("update bell b set read_at = u.bell_seen_at from users u where u.id = b.user_id and u.bell_seen_at is not null and b.created_at <= u.bell_seen_at");
    expect(await bellUnread(query, ids.owner, demo.business.id)).toBe(0);
    expect(await bellUnread(query, ids.desk, demo.business.id)).toBe(1);
  });

  it("«Показать полностью»: the visits by a filter, paged newest first, every row once", async () => {
    const now = Date.now();
    const add = (kind: string, payload: Record<string, unknown>, minutesAgo: number) =>
      query("insert into bell (business_id, user_id, kind, payload, created_at) values ($1, $2, $3, $4::jsonb, $5)", [
        demo.business.id,
        ids.owner,
        kind,
        JSON.stringify(payload),
        new Date(now - minutesAgo * MIN),
      ]);
    const v = (i: number, extra: Record<string, unknown> = {}) => ({
      visitId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      startsAt: new Date(at(DAY, "12:00")).toISOString(),
      tz: TZ,
      client: "Test Client",
      services: [],
      staff: "Slava",
      ...extra,
    });
    let i = 0;
    for (; i < BELL.page + 5; i++) await add("own_online", v(i), i);
    // two in the same millisecond: the page still splits them right
    await add("own_online", v(i++), 4);
    await add("own_client", v(i++, { action: "moved", fromStart: new Date(at(DAY, "10:00")).toISOString() }), 100);
    await add("own_client", v(i++, { action: "cancelled" }), 101);
    await add("own_barber", v(i++, { action: "cancelled", reason: "x" }), 102);
    await add("own_review", { reviewId: "r9", rating: 4 }, 103);

    const p1 = await bellPage(query, ids.owner, demo.business.id, "ru", "visits", "all", null, now);
    expect(p1.items).toHaveLength(BELL.page);
    expect(p1.next).not.toBeNull();
    const p2 = await bellPage(query, ids.owner, demo.business.id, "ru", "visits", "all", p1.next, now);
    expect(p2.next).toBeNull();
    const all = [...p1.items, ...p2.items];
    expect(all).toHaveLength(BELL.page + 9);
    expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
    const times = all.map((x) => Date.parse(x.at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    // the review is not a visit
    expect(all.some((x) => x.icon === "review")).toBe(false);

    const only = async (f: "new" | "moved" | "cancelled") => (await bellPage(query, ids.owner, demo.business.id, "ru", "visits", f, null, now)).items;
    expect((await only("new")).every((x) => x.icon === "online")).toBe(true);
    expect((await only("moved")).map((x) => [x.title, x.icon])).toEqual([["Клиент перенёс запись", "moved"]]);
    expect((await only("cancelled")).map((x) => [x.title, x.icon])).toEqual([
      ["Клиент отменил запись", "cancelled"],
      ["Slava: отмена записи", "cancelled"],
    ]);
    const other = await bellPage(query, ids.owner, demo.business.id, "ru", "other", "all", null, now);
    expect(other.items.map((x) => x.icon)).toEqual(["review"]);
    expect(other.next).toBeNull();
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

  it("bounded: the last 30 days; the first view the newest few; the cron prunes the rest", async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
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
    expect(feed).toHaveLength(5);
    expect(feed[0].title).toBe("Новый отзыв");
    expect(Date.parse(feed[0].at)).toBe(now);
    expect(await bellUnread(query, ids.owner, demo.business.id, now)).toBe(5);
    expect((await bellSummary(query, ids.owner, demo.business.id, "ru", now)).other.items).toHaveLength(BELL.preview);
    expect(await pruneBell(query, now)).toBe(1);
    const [left] = await query<{ n: number }>("select count(*)::int as n from bell");
    expect(left.n).toBe(5);
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
  it("the time today, the day and month before, the year for another year: on the salon's clock", () => {
    expect(bellWhen(now - 60_000, now, TZ)).toEqual({ kind: "today", time: "14:59" });
    expect(bellWhen(at("2026-11-24", "00:05"), now, TZ)).toEqual({ kind: "today", time: "00:05" });
    expect(bellWhen(at("2026-11-23", "23:50"), now, TZ)).toEqual({ kind: "day", day: 23, month: 10 });
    expect(bellWhen(at("2026-01-02", "08:00"), now, TZ)).toEqual({ kind: "day", day: 2, month: 0 });
    expect(bellWhen(at("2025-12-30", "08:00"), at("2026-01-02", "10:00"), TZ)).toEqual({ kind: "day", day: 30, month: 11, year: 2025 });
  });
});
