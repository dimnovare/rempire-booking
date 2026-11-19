/**
 * A barber's own time and prices (B4): breaks, days off, special time,
 * weekly hours and prices, under Renat's two switches; Renat's yes or no in
 * «Запросы»; and never a step outside his own column. Fake people only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addTimeOff } from "@/lib/admin/visits";
import { adminCreateVisit } from "@/lib/admin/visits";
import { readSettings } from "@/lib/settings";
import {
  answerRequest,
  barberAddSpecial,
  barberRemoveSpecial,
  barberRemoveTimeOff,
  barberSetHours,
  barberSetPrice,
  barberTimeOff,
  barberWithdraw,
  listRequests,
  myTime,
  openRequestCount,
  setBarberSelf,
  specialSpans,
  timeOffSpan,
  weeklyHours,
  type Who,
} from "@/lib/barber/requests";
import { requestWords, weekWords } from "@/lib/barber/request-words";
import { getBusiness, type Business } from "@/lib/availability";
import { closeDb, query } from "@/lib/db";
import { saveSubscription } from "@/lib/push";
import { pushText } from "@/lib/push-kinds";
import { localParts, startOfDay, zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const hm = (ms: number) => localParts(ms, TZ).time;
// a Monday ahead of the real clock; Tuesday 1.12 is the day in question
const NOW = at("2026-11-30", "12:00");
const DAY = "2026-12-01";

let demo: Demo;
let owner: string;
let val: Who;
let jev: Who;

async function login(email: string, role: string, staff: string | null): Promise<string> {
  const [u] = await query<{ id: string }>("insert into users (business_id, email, role, staff_id, locale) values ($1, $2, $3, $4, 'ru') returning id", [
    demo.business.id,
    email,
    role,
    staff ? demo.staff[staff] : null,
  ]);
  await saveSubscription(query, u.id, { endpoint: `https://push.example.test/${email}`, p256dh: "p256", auth: "auth", label: "test" });
  return u.id;
}

/** The business as it is now (after a switch). */
const biz = async (): Promise<Business> => (await getBusiness(query, "rempire"))!;
async function switchTo(time: "now" | "ask", price: "now" | "ask") {
  await setBarberSelf(demo.business, owner, "barber_self_time", time);
  await setBarberSelf(demo.business, owner, "barber_self_price", price);
  return biz();
}
const pushes = () =>
  query<{ user_id: string; kind: string; payload: Record<string, unknown> }>("select user_id, kind, payload from notifications where channel = 'push' order by created_at, kind");
const offRow = (id: string) => query<{ status: string }>("select status from time_off where id = $1", [id]).then((r) => r[0]?.status ?? null);
const reqRow = (id: string) => query<{ status: string; time_off_id: string | null }>("select status, time_off_id from staff_requests where id = $1", [id]).then((r) => r[0]);
const offOf = async (requestId: string) => (await reqRow(requestId)).time_off_id!;

beforeEach(async () => {
  demo = await freshDemo();
  owner = await login("owner@example.test", "owner", null);
  val = { userId: await login("valentin@example.test", "staff", "valentin"), staffId: demo.staff.valentin, staffName: "Valentin", viewing: false };
  jev = { userId: await login("jevgeni@example.test", "staff", "jevgeni"), staffId: demo.staff.jevgeni, staffName: "Jevgeni", viewing: false };
});
afterAll(closeDb);

describe("the switches", () => {
  it("start as Dim set them until Renat answers: time at once, prices ask", () => {
    const s = readSettings({});
    expect([s.barber_self_time, s.barber_self_price]).toEqual(["now", "ask"]);
    expect(readSettings({ barber_self_time: "ask", barber_self_price: "maybe" })).toMatchObject({ barber_self_time: "ask", barber_self_price: "ask" });
  });

  it("Renat flips them; anything else is refused", async () => {
    expect(await setBarberSelf(demo.business, owner, "barber_self_price", "now")).toBe(true);
    expect((await biz()).settings.barber_self_price).toBe("now");
    expect(await setBarberSelf(demo.business, owner, "slot_step_min", "now")).toBe(false);
    expect(await setBarberSelf(demo.business, owner, "barber_self_time", "later")).toBe(false);
    // the other settings stay
    expect((await biz()).settings.slot_step_min).toBe(demo.business.settings.slot_step_min);
  });
});

describe("breaks and days off", () => {
  it("checks the times: a break within a day, whole days off, nothing in the past, at most 92 days", () => {
    expect(timeOffSpan({ offKind: "block", date: DAY, start: "13:00", end: "14:00" }, TZ, NOW)).toEqual({ from: at(DAY, "13:00"), to: at(DAY, "14:00") });
    expect(timeOffSpan({ offKind: "block", date: DAY, start: "22:00", end: "24:00" }, TZ, NOW)).toEqual({ from: at(DAY, "22:00"), to: at("2026-12-02", "00:00") });
    expect(timeOffSpan({ offKind: "block", date: DAY, start: "14:00", end: "13:00" }, TZ, NOW)).toEqual({ code: "invalid" });
    expect(timeOffSpan({ offKind: "block", date: "2026-11-30", start: "09:00", end: "11:00" }, TZ, NOW)).toEqual({ code: "past" });
    expect(timeOffSpan({ offKind: "vacation", fromDate: DAY, toDate: "2026-12-14" }, TZ, NOW)).toEqual({ from: startOfDay(DAY, TZ), to: startOfDay("2026-12-15", TZ) });
    expect(timeOffSpan({ offKind: "sick", fromDate: "2026-11-30", toDate: "2026-11-30" }, TZ, NOW)).toEqual({ from: startOfDay("2026-11-30", TZ), to: startOfDay(DAY, TZ) });
    expect(timeOffSpan({ offKind: "vacation", fromDate: "2026-11-29", toDate: DAY }, TZ, NOW)).toEqual({ code: "past" });
    expect(timeOffSpan({ offKind: "vacation", fromDate: DAY, toDate: "2027-03-15" }, TZ, NOW)).toEqual({ code: "too_long" });
    expect(timeOffSpan({ offKind: "vacation", fromDate: DAY, toDate: "2026-11-30" }, TZ, NOW)).toEqual({ code: "invalid" });
    expect(timeOffSpan({ offKind: "nap" } as never, TZ, NOW)).toEqual({ code: "invalid" });
  });

  it("with time «now» a break applies at once, and Renat gets no push for a break", async () => {
    const r = await barberTimeOff(demo.business, val, { offKind: "block", date: DAY, start: "13:00", end: "14:00", note: "обед" }, NOW);
    expect(r).toMatchObject({ ok: true, status: "applied", visitsInside: 0 });
    if (!r.ok) return;
    expect(await offRow(await offOf(r.id))).toBe("approved");
    expect(await pushes()).toEqual([]);
  });

  it("sick days apply at once, and Renat's push counts the visits inside (no phone in it)", async () => {
    const v = await adminCreateVisit(
      demo.business,
      { staffId: demo.staff.valentin, start: at(DAY, "11:00"), serviceIds: [demo.services.clip], name: "Test Client", phone: "+372 5555 0701", idempotencyKey: `req-${Math.random()}` },
      "test-admin",
    );
    expect(v.ok).toBe(true);
    const r = await barberTimeOff(demo.business, val, { offKind: "sick", fromDate: DAY, toDate: DAY }, NOW);
    expect(r).toMatchObject({ ok: true, status: "applied", visitsInside: 1 });
    const p = (await pushes()).filter((x) => x.kind === "own_request");
    expect(p.map((x) => x.user_id)).toEqual([owner]);
    const text = pushText("own_request", p[0].payload, "ru")!;
    expect(text.title).toBe("Valentin: изменение");
    expect(text.body).toBe("Больничный · вт 1.12 · 1 запись");
    expect(text.url).toBe("/admin/requests");
    expect(JSON.stringify(text)).not.toMatch(/5555/);
  });

  it("with time «ask» a vacation holds its days at once and waits for Renat", async () => {
    const b = await switchTo("ask", "ask");
    const r = await barberTimeOff(b, val, { offKind: "vacation", fromDate: DAY, toDate: "2026-12-07" }, NOW);
    expect(r).toMatchObject({ ok: true, status: "requested" });
    if (!r.ok) return;
    expect(await offRow(await offOf(r.id))).toBe("requested");
    expect(await openRequestCount(query, b.id)).toBe(1);
    const p = (await pushes()).filter((x) => x.kind === "own_request");
    expect(pushText("own_request", p[0].payload, "ru")).toMatchObject({ title: "Запрос: Valentin", body: "Отпуск · 1.12–7.12" });
    // in the barber's own push language too
    expect(pushText("own_request", p[0].payload, "et")!.body).toBe("Puhkus · 1.12–7.12");
  });

  it("Renat's yes keeps the days off; the barber gets a push with the answer", async () => {
    const b = await switchTo("ask", "ask");
    const r = await barberTimeOff(b, val, { offKind: "vacation", fromDate: DAY, toDate: "2026-12-07" }, NOW);
    if (!r.ok) throw new Error("no request");
    const off = await offOf(r.id);
    expect(await answerRequest(b, owner, r.id, "approved", "Хорошего отдыха", NOW)).toEqual({ ok: true });
    expect(await offRow(off)).toBe("approved");
    expect((await reqRow(r.id)).status).toBe("approved");
    expect((await listRequests(query, b.id, { staffId: val.staffId, now: NOW })).find((x) => x.id === r.id)?.answerNote).toBe("Хорошего отдыха");
    const a = (await pushes()).filter((x) => x.kind === "request_answer");
    expect(a.map((x) => x.user_id)).toEqual([val.userId]);
    expect(pushText("request_answer", a[0].payload, "ru")).toMatchObject({ title: "Запрос согласован", body: "Отпуск · 1.12–7.12 · «Хорошего отдыха»", url: "/b/time" });
    // answered once only
    expect(await answerRequest(b, owner, r.id, "declined", "", NOW)).toEqual({ ok: false, code: "done" });
  });

  it("Renat's no frees the days again", async () => {
    const b = await switchTo("ask", "ask");
    const r = await barberTimeOff(b, val, { offKind: "vacation", fromDate: DAY, toDate: DAY }, NOW);
    if (!r.ok) throw new Error("no request");
    const off = await offOf(r.id);
    expect(await answerRequest(b, owner, r.id, "declined", "", NOW)).toEqual({ ok: true });
    expect(await offRow(off)).toBe("declined");
    expect(await openRequestCount(query, b.id)).toBe(0);
  });

  it("a request taken back frees its days and leaves nothing for Renat to answer", async () => {
    const b = await switchTo("ask", "ask");
    const r = await barberTimeOff(b, val, { offKind: "vacation", fromDate: DAY, toDate: DAY }, NOW);
    if (!r.ok) throw new Error("no request");
    const off = await offOf(r.id);
    // not another barber's to take back
    expect(await barberWithdraw(b, jev, r.id)).toBe(false);
    expect(await barberWithdraw(b, val, r.id)).toBe(true);
    expect(await offRow(off)).toBe(null);
    expect((await reqRow(r.id)).status).toBe("withdrawn");
    expect(await answerRequest(b, owner, r.id, "approved", "", NOW)).toEqual({ ok: false, code: "done" });
  });

  it("removing a waiting day off from the list withdraws its request too", async () => {
    const b = await switchTo("ask", "ask");
    const r = await barberTimeOff(b, val, { offKind: "vacation", fromDate: DAY, toDate: DAY }, NOW);
    if (!r.ok) throw new Error("no request");
    expect(await barberRemoveTimeOff(b, val, await offOf(r.id), NOW)).toEqual({ ok: true });
    expect((await reqRow(r.id)).status).toBe("withdrawn");
  });

  it("he removes his own time off at once, never Renat's or another barber's", async () => {
    const r = await barberTimeOff(demo.business, val, { offKind: "vacation", fromDate: DAY, toDate: DAY }, NOW);
    if (!r.ok) throw new Error("no time off");
    const off = await offOf(r.id);
    expect(await barberRemoveTimeOff(demo.business, jev, off, NOW)).toEqual({ ok: false, code: "not_found" });
    expect(await barberRemoveTimeOff(demo.business, val, off, NOW)).toEqual({ ok: true });
    expect(await offRow(off)).toBe(null);
    const list = await listRequests(query, demo.business.id, { staffId: val.staffId, now: NOW });
    expect(list.map((x) => [x.what.kind, "action" in x.what ? x.what.action : "", x.status])).toEqual([
      ["time_off", "remove", "applied"],
      ["time_off", "add", "applied"],
    ]);
    const renats = await addTimeOff(demo.business, { staffId: demo.staff.valentin, from: at(DAY, "16:00"), to: at(DAY, "17:00"), kind: "block" }, owner);
    if (!renats.ok) throw new Error("no block");
    expect(await barberRemoveTimeOff(demo.business, val, renats.id, NOW)).toEqual({ ok: false, code: "not_yours" });
    // Renat looking at the app as Valentin is the admin
    expect(await barberRemoveTimeOff(demo.business, { ...val, userId: owner, viewing: true }, renats.id, NOW)).toEqual({ ok: true });
  });
});

describe("special time", () => {
  it("repeats on the same weekday at the same local time, across the clock change", () => {
    const s = specialSpans("2027-03-23", "08:00", "10:00", 2, TZ);
    expect(s.map((x) => [localParts(x.from, TZ).date, hm(x.from), hm(x.to)])).toEqual([
      ["2027-03-23", "08:00", "10:00"],
      ["2027-03-30", "08:00", "10:00"],
    ]);
    expect(s[1].from - s[0].from).toBe(7 * 86_400_000 - 3_600_000);
  });

  it("with time «now» it is there at once, one row a week; he removes his own", async () => {
    const r = await barberAddSpecial(demo.business, val, { date: DAY, start: "08:00", end: "10:00", extraCents: 1500, weeks: 3 }, NOW);
    expect(r).toMatchObject({ ok: true, status: "applied" });
    const t = await myTime(query, demo.business, val.staffId, NOW);
    expect(t.special.map((x) => [localParts(x.from, TZ).date, hm(x.from), hm(x.to), x.extraCents, x.mine])).toEqual([
      ["2026-12-01", "08:00", "10:00", 1500, true],
      ["2026-12-08", "08:00", "10:00", 1500, true],
      ["2026-12-15", "08:00", "10:00", 1500, true],
    ]);
    const p = (await pushes()).filter((x) => x.kind === "own_request");
    expect(pushText("own_request", p[0].payload, "ru")!.body).toBe("Особое время +15 € · вт 1.12, 08:00–10:00 · 3 нед. подряд");
    expect(await barberRemoveSpecial(demo.business, jev, t.special[0].id, NOW)).toEqual({ ok: false, code: "not_found" });
    expect(await barberRemoveSpecial(demo.business, val, t.special[0].id, NOW)).toEqual({ ok: true });
    expect((await myTime(query, demo.business, val.staffId, NOW)).special).toHaveLength(2);
  });

  it("with time «ask» nothing is bookable until Renat says yes", async () => {
    const b = await switchTo("ask", "ask");
    const r = await barberAddSpecial(b, val, { date: DAY, start: "20:00", end: "24:00", extraCents: 2000, weeks: 2 }, NOW);
    if (!r.ok) throw new Error("no request");
    expect(r.status).toBe("requested");
    expect((await myTime(query, b, val.staffId, NOW)).special).toEqual([]);
    expect(await answerRequest(b, owner, r.id, "approved", "", NOW)).toEqual({ ok: true });
    const t = await myTime(query, b, val.staffId, NOW);
    expect(t.special.map((x) => [localParts(x.from, TZ).date, hm(x.from), localParts(x.to, TZ).date, hm(x.to), x.extraCents])).toEqual([
      ["2026-12-01", "20:00", "2026-12-02", "00:00", 2000],
      ["2026-12-08", "20:00", "2026-12-09", "00:00", 2000],
    ]);
  });

  it("refuses wrong input", async () => {
    const bad = [
      { date: DAY, start: "10:00", end: "09:00", extraCents: 0 },
      { date: DAY, start: "10:00", end: "11:00", extraCents: -1 },
      { date: DAY, start: "10:00", end: "11:00", extraCents: 100, weeks: 13 },
      { date: "2026-11-29", start: "10:00", end: "11:00", extraCents: 100 },
    ];
    for (const x of bad) expect((await barberAddSpecial(demo.business, val, x, NOW)).ok).toBe(false);
  });

  it("an amount or a percent: exactly one of the two, a whole percent from 1 to 300", async () => {
    const hour = { date: DAY, start: "10:00", end: "11:00" };
    const bad = [
      { ...hour },
      { ...hour, extraCents: 0 },
      { ...hour, extraPct: 0 },
      { ...hour, extraCents: 1000, extraPct: 50 },
      { ...hour, extraPct: 301 },
      { ...hour, extraPct: -5 },
      { ...hour, extraPct: 12.5 },
      { ...hour, extraPct: NaN },
      { ...hour, extraCents: 100_001 },
    ];
    for (const x of bad) expect(await barberAddSpecial(demo.business, val, x, NOW), JSON.stringify(x)).toEqual({ ok: false, code: "invalid" });
    expect(await query("select id from special_time")).toHaveLength(0);
    expect(await query("select id from staff_requests")).toHaveLength(0);
    expect((await barberAddSpecial(demo.business, val, { ...hour, extraPct: 300 }, NOW)).ok).toBe(true);
    expect((await barberAddSpecial(demo.business, val, { ...hour, extraPct: 1, extraCents: 0 }, NOW)).ok).toBe(true);
    expect((await barberAddSpecial(demo.business, val, { ...hour, extraCents: 100_000, extraPct: 0 }, NOW)).ok).toBe(true);
  });

  it("in percent: «+50 %» in his list, in Renat's push and in all three languages", async () => {
    const r = await barberAddSpecial(demo.business, val, { date: DAY, start: "08:00", end: "10:00", extraPct: 50, weeks: 3 }, NOW);
    expect(r).toMatchObject({ ok: true, status: "applied" });
    const t = await myTime(query, demo.business, val.staffId, NOW);
    expect(t.special.map((x) => [localParts(x.from, TZ).date, hm(x.from), hm(x.to), x.extraCents, x.extraPct, x.mine])).toEqual([
      ["2026-12-01", "08:00", "10:00", 0, 50, true],
      ["2026-12-08", "08:00", "10:00", 0, 50, true],
      ["2026-12-15", "08:00", "10:00", 0, 50, true],
    ]);
    const p = (await pushes()).filter((x) => x.kind === "own_request");
    expect(pushText("own_request", p[0].payload, "ru")!.body).toBe("Особое время +50 % · вт 1.12, 08:00–10:00 · 3 нед. подряд");
    const [added] = await listRequests(query, demo.business.id, { staffId: val.staffId, now: NOW });
    expect(added.what).toEqual({ kind: "special", action: "add", from: at(DAY, "08:00"), to: at(DAY, "10:00"), extraCents: 0, extraPct: 50, weeks: 3 });
    expect(requestWords(added.what, TZ, "ru")).toBe("Особое время +50 % · вт 1.12, 08:00–10:00 · 3 нед. подряд");
    expect(requestWords(added.what, TZ, "et")).toBe("Eriaeg +50 % · T 1.12, 08:00–10:00 · 3 nädalat järjest");
    expect(requestWords(added.what, TZ, "en")).toBe("Special time +50 % · Tue 1.12, 08:00–10:00 · 3 weeks in a row");
    // taking one away names the same window
    expect(await barberRemoveSpecial(demo.business, val, t.special[0].id, NOW)).toEqual({ ok: true });
    const removed = (await listRequests(query, demo.business.id, { staffId: val.staffId, now: NOW })).find((x) => x.what.kind === "special" && x.what.action === "remove")!;
    expect(removed.what).toEqual({ kind: "special", action: "remove", from: at(DAY, "08:00"), to: at(DAY, "10:00"), extraCents: 0, extraPct: 50 });
    expect(requestWords(removed.what, TZ, "ru")).toBe("Убрано: Особое время +50 % · вт 1.12, 08:00–10:00");
    expect(requestWords(removed.what, TZ, "et")).toBe("Eemaldatud: Eriaeg +50 % · T 1.12, 08:00–10:00");
    expect(requestWords(removed.what, TZ, "en")).toBe("Removed: Special time +50 % · Tue 1.12, 08:00–10:00");
  });

  it("an amount request is written as before the percent: no extraPct in it", async () => {
    const r = await barberAddSpecial(demo.business, val, { date: DAY, start: "08:00", end: "10:00", extraCents: 1500 }, NOW);
    if (!r.ok) throw new Error("no request");
    const [row] = await query<{ payload: Record<string, unknown> }>("select payload from staff_requests where id = $1", [r.id]);
    expect(row.payload).toEqual({ kind: "special", action: "add", from: at(DAY, "08:00"), to: at(DAY, "10:00"), extraCents: 1500 });
    expect((await myTime(query, demo.business, val.staffId, NOW)).special.map((x) => [x.extraCents, x.extraPct])).toEqual([[1500, 0]]);
  });

  it("in percent with time «ask»: Renat's yes makes the windows at that percent", async () => {
    const b = await switchTo("ask", "ask");
    const r = await barberAddSpecial(b, val, { date: DAY, start: "20:00", end: "22:00", extraPct: 30, weeks: 2 }, NOW);
    if (!r.ok) throw new Error("no request");
    expect(r.status).toBe("requested");
    expect((await myTime(query, b, val.staffId, NOW)).special).toEqual([]);
    const ask = (await pushes()).filter((x) => x.kind === "own_request");
    expect(pushText("own_request", ask[0].payload, "ru")).toMatchObject({ title: "Запрос: Valentin", body: "Особое время +30 % · вт 1.12, 20:00–22:00 · 2 нед. подряд" });
    expect(await answerRequest(b, owner, r.id, "approved", "", NOW)).toEqual({ ok: true });
    const t = await myTime(query, b, val.staffId, NOW);
    expect(t.special.map((x) => [localParts(x.from, TZ).date, hm(x.from), hm(x.to), x.extraCents, x.extraPct])).toEqual([
      ["2026-12-01", "20:00", "22:00", 0, 30],
      ["2026-12-08", "20:00", "22:00", 0, 30],
    ]);
    const answer = (await pushes()).filter((x) => x.kind === "request_answer");
    expect(pushText("request_answer", answer[0].payload, "et")!.body).toContain("Eriaeg +30 % · T 1.12, 20:00–22:00");
  });

  it("a request kept from before the percent (no extraPct in it) still reads and applies as an amount", async () => {
    const b = await switchTo("ask", "ask");
    const old = { kind: "special", action: "add", from: at(DAY, "08:00"), to: at(DAY, "10:00"), extraCents: 1500, weeks: 2 };
    const [row] = await query<{ id: string }>(
      "insert into staff_requests (business_id, staff_id, kind, payload, status, created_by) values ($1, $2, 'special', $3::jsonb, 'requested', $4) returning id",
      [b.id, val.staffId, JSON.stringify(old), val.userId],
    );
    const [req] = await listRequests(query, b.id, { staffId: val.staffId, now: NOW });
    expect(req.what).toEqual(old);
    expect(requestWords(req.what, TZ, "ru")).toBe("Особое время +15 € · вт 1.12, 08:00–10:00 · 2 нед. подряд");
    expect(requestWords(req.what, TZ, "et")).toBe("Eriaeg +15 € · T 1.12, 08:00–10:00 · 2 nädalat järjest");
    expect(requestWords(req.what, TZ, "en")).toBe("Special time +15 € · Tue 1.12, 08:00–10:00 · 2 weeks in a row");
    expect(await answerRequest(b, owner, row.id, "approved", "", NOW)).toEqual({ ok: true });
    const made = await query<{ extra_cents: number; extra_pct: number }>("select extra_cents, extra_pct from special_time where staff_id = $1 order by starts_at", [val.staffId]);
    expect(made).toEqual([
      { extra_cents: 1500, extra_pct: 0 },
      { extra_cents: 1500, extra_pct: 0 },
    ]);
    // and one from then at +0 € (002 allowed it): more bookable time at the usual price, as it was asked
    const zero = { kind: "special", action: "add", from: at(DAY, "20:00"), to: at(DAY, "22:00"), extraCents: 0 };
    const [z] = await query<{ id: string }>(
      "insert into staff_requests (business_id, staff_id, kind, payload, status, created_by) values ($1, $2, 'special', $3::jsonb, 'requested', $4) returning id",
      [b.id, val.staffId, JSON.stringify(zero), val.userId],
    );
    expect(await answerRequest(b, owner, z.id, "approved", "", NOW)).toEqual({ ok: true });
    expect(await query("select id from special_time where staff_id = $1 and extra_cents = 0 and extra_pct = 0", [val.staffId])).toHaveLength(1);
  });
});

describe("weekly hours", () => {
  const week = { "1": [], "2": [["10:00", "14:00"], ["15:00", "20:00"]], "3": [["10:00", "20:00"]], "4": [["10:00", "20:00"]], "5": [["10:00", "20:00"]], "6": [["11:00", "18:00"]], "7": [] };

  it("with time «now» they replace his template; the same hours again change nothing", async () => {
    const r = await barberSetHours(demo.business, val, week);
    expect(r).toMatchObject({ ok: true, status: "applied" });
    expect(await weeklyHours(query, val.staffId)).toEqual(week);
    expect(await barberSetHours(demo.business, val, week)).toEqual({ ok: false, code: "same" });
    // nobody else's
    expect(await weeklyHours(query, jev.staffId)).not.toEqual(week);
    expect(weekWords(week as never, "ru")).toBe("пн выходной, вт 10:00–14:00, 15:00–20:00, ср–пт 10:00–20:00, сб 11:00–18:00, вс выходной");
  });

  it("with time «ask» they wait; a newer request replaces the waiting one; a yes applies it", async () => {
    const b = await switchTo("ask", "ask");
    const before = await weeklyHours(query, val.staffId);
    const first = await barberSetHours(b, val, { ...week, "6": [] });
    const second = await barberSetHours(b, val, week);
    if (!first.ok || !second.ok) throw new Error("no request");
    expect((await reqRow(first.id)).status).toBe("withdrawn");
    expect(await weeklyHours(query, val.staffId)).toEqual(before);
    expect(await answerRequest(b, owner, second.id, "approved", "", NOW)).toEqual({ ok: true });
    expect(await weeklyHours(query, val.staffId)).toEqual(week);
  });

  it("refuses overlapping spans and more than three a day", async () => {
    expect(await barberSetHours(demo.business, val, { ...week, "3": [["10:00", "14:00"], ["13:00", "20:00"]] })).toEqual({ ok: false, code: "invalid" });
    expect(await barberSetHours(demo.business, val, { ...week, "3": [["08:00", "09:00"], ["10:00", "11:00"], ["12:00", "13:00"], ["14:00", "15:00"]] })).toEqual({ ok: false, code: "invalid" });
  });
});

describe("prices", () => {
  const price = async (who: Who, b: Business, cents: number, min = 45) => barberSetPrice(b, who, { serviceId: demo.services.clip, priceCents: cents, durationMin: min });
  const clipOf = async (staffId: string) => (await myTime(query, await biz(), staffId, NOW)).prices.find((p) => p.serviceId === demo.services.clip)!;

  it("with prices «ask» (the start) a new price waits; a newer one replaces it; a yes applies it", async () => {
    const was = await clipOf(val.staffId);
    const first = await price(val, demo.business, was.cents + 500);
    const second = await price(val, demo.business, was.cents + 1000, 50);
    if (!first.ok || !second.ok) throw new Error("no request");
    expect([first.status, (await reqRow(first.id)).status, second.status]).toEqual(["requested", "withdrawn", "requested"]);
    const waiting = await clipOf(val.staffId);
    expect(waiting).toMatchObject({ cents: was.cents, min: was.min, waiting: { cents: was.cents + 1000, min: 50, requestId: second.id } });
    const own = (await pushes()).filter((x) => x.kind === "own_request").at(-1)!;
    const euros = (c: number) => `${c / 100} €`;
    expect(pushText("own_request", own.payload, "ru")!.body).toBe(`Стрижка машинкой и ножницами: ${euros(was.cents)} → ${euros(was.cents + 1000)}, ${was.min} → 50 мин`);
    expect(await answerRequest(demo.business, owner, second.id, "approved", "", NOW)).toEqual({ ok: true });
    expect(await clipOf(val.staffId)).toMatchObject({ cents: was.cents + 1000, min: 50, waiting: null });
  });

  it("with prices «now» it applies at once; the same price again changes nothing", async () => {
    const b = await switchTo("now", "now");
    const was = await clipOf(val.staffId);
    expect(await price(val, b, was.cents + 300)).toMatchObject({ ok: true, status: "applied" });
    expect((await clipOf(val.staffId)).cents).toBe(was.cents + 300);
    expect(await price(val, b, was.cents + 300, was.min)).toEqual({ ok: false, code: "same" });
  });

  it("only a service he does, in whole 5 minutes", async () => {
    await query("update staff_services set active = false where staff_id = $1 and service_id = $2", [val.staffId, demo.services.clip]);
    expect(await price(val, demo.business, 4000)).toEqual({ ok: false, code: "not_found" });
    expect(await barberSetPrice(demo.business, jev, { serviceId: demo.services.clip, priceCents: 4000, durationMin: 47 })).toEqual({ ok: false, code: "invalid" });
    expect(await barberSetPrice(demo.business, jev, { serviceId: "not-a-uuid", priceCents: 4000, durationMin: 45 })).toEqual({ ok: false, code: "not_found" });
  });

  it("Renat's no leaves the price as it was, and says so to the barber", async () => {
    const was = await clipOf(val.staffId);
    const r = await price(val, demo.business, was.cents + 500);
    if (!r.ok) throw new Error("no request");
    expect(await answerRequest(demo.business, owner, r.id, "declined", "Давай с января", NOW)).toEqual({ ok: true });
    expect((await clipOf(val.staffId)).cents).toBe(was.cents);
    const a = (await pushes()).find((x) => x.kind === "request_answer")!;
    expect(pushText("request_answer", a.payload, "ru")!.title).toBe("Запрос отклонён");
  });
});

describe("the lists", () => {
  it("Renat's list: waiting ones first, with the barber's name and the visits inside", async () => {
    const b = await switchTo("ask", "ask");
    await barberTimeOff(b, jev, { offKind: "block", date: DAY, start: "13:00", end: "14:00" }, NOW);
    await adminCreateVisit(
      b,
      { staffId: demo.staff.valentin, start: at(DAY, "11:00"), serviceIds: [demo.services.clip], name: "Test Client", phone: "+372 5555 0702", idempotencyKey: `req-${Math.random()}` },
      "test-admin",
    );
    const v = await barberTimeOff(b, val, { offKind: "vacation", fromDate: DAY, toDate: DAY }, NOW);
    if (!v.ok) throw new Error("no request");
    const blockReq = (await listRequests(query, b.id, { now: NOW })).find((x) => x.staffName === "Jevgeni")!;
    await answerRequest(b, owner, blockReq.id, "approved", "", NOW);
    const list = await listRequests(query, b.id, { now: NOW });
    expect(list.map((x) => [x.staffName, x.status, x.visitsInside])).toEqual([
      ["Valentin", "requested", 1],
      ["Jevgeni", "approved", 0],
    ]);
    expect(requestWords(list[0].what, TZ, "en")).toBe("Vacation · Tue 1.12");
    // his own list has only his
    expect((await listRequests(query, b.id, { staffId: jev.staffId, now: NOW })).map((x) => x.staffName)).toEqual(["Jevgeni"]);
  });

  it("Renat looking at the app as a barber changes it at once, without pushing himself", async () => {
    const b = await switchTo("ask", "ask");
    const r = await barberTimeOff(b, { ...val, userId: owner, viewing: true }, { offKind: "vacation", fromDate: DAY, toDate: DAY }, NOW);
    expect(r).toMatchObject({ ok: true, status: "applied" });
    expect(await pushes()).toEqual([]);
  });
});
