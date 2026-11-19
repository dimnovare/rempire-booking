/**
 * «График работы» (src/lib/admin/schedule.ts, schedule-plan.ts): the month
 * grid of shifts. A day on the grid is the day booking sees (weekly hours,
 * a dated day, a day off, a vacation, a break); the marked cells are saved
 * as dated days and time off; a visit is never cut; the two templates and
 * the copy; and a shift on the day the clocks change. Fake people only.
 *
 * The days are of January to March 2027: past the demo's dated shifts, so
 * only the weekly hours stand behind them. Renat works Tuesday to Saturday,
 * 10:00–19:00; 1.1.2027 is a Friday.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cutVisits, daysBetween, daySpans, endOfNextMonth, monthDays, monthStart, panelOf, shiftDays, totalsOf, weekdayDays, weekDays } from "@/lib/admin/schedule-plan";
import { copySchedule, fillTemplate, loadSchedule, saveDays, type ScheduleCell } from "@/lib/admin/schedule";
import { setDayOverride } from "@/lib/admin/staff";
import { adminCancelVisit, adminCreateVisit, addTimeOff } from "@/lib/admin/visits";
import { loadAvailability } from "@/lib/availability";
import type { Holder } from "@/lib/auth/rights";
import { groupKey } from "@/lib/auth/rights-catalogue";
import { legacyHolder } from "@/lib/auth/rights-store";
import { closeDb, query } from "@/lib/db";
import { localParts, zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const ACTOR = "test-admin";
// the week the tests live in: Monday 4.1.2027 … Sunday 10.1.2027
const MON = "2027-01-04";
const TUE = "2027-01-05";
const WED = "2027-01-06";
const THU = "2027-01-07";
const FRI = "2027-01-08";
const SAT = "2027-01-09";
const SUN = "2027-01-10";
const WEEK = [MON, TUE, WED, THU, FRI, SAT, SUN];
/** «now» for booking and for the copy: the Monday morning of that week */
const NOW = at(MON, "08:00");

type Who = Holder & { id: string };
let demo: Demo;
let owner: Who;
let renat: string;
let slava: string;
let milena: string;

beforeEach(async () => {
  demo = await freshDemo();
  const [u] = await query<{ id: string }>("insert into users (business_id, email, name, role) values ($1, 'owner@example.test', 'Owner', 'owner') returning id", [demo.business.id]);
  owner = legacyHolder("owner", u.id);
  ({ renat, slava, milena } = demo.staff);
});
afterAll(closeDb);

const without = (who: Who, ...keys: string[]): Who => ({ ...who, rights: { ...who.rights, on: new Set([...who.rights.on].filter((k) => !keys.includes(k))) } });

/** A barber's days on the grid. */
async function grid(staffId: string, dates: string[]): Promise<Record<string, ScheduleCell>> {
  const data = await loadSchedule(query, demo.business, dates);
  return data.staff.find((s) => s.id === staffId)!.cells;
}
const cellOf = async (staffId: string, date: string) => (await grid(staffId, [date]))[date];

/**
 * The same day as online booking answers it: every free start of an hour's
 * cut with this barber, put together as the time he can be booked in.
 */
async function bookingDay(staffId: string, date: string, now = NOW): Promise<[string, string][]> {
  const a = await loadAvailability(query, { business: demo.business, serviceIds: [demo.services.clip], staffId, from: date, days: 1, now });
  const dur = a.quotes[0].durationMin * 60_000;
  const spans: [number, number][] = [];
  for (const s of a.days[0]?.slots ?? []) {
    const last = spans[spans.length - 1];
    if (last && s.start <= last[1]) last[1] = Math.max(last[1], s.start + dur);
    else spans.push([s.start, s.start + dur]);
  }
  return spans.map(([x, y]) => [localParts(x, TZ).time, localParts(y, TZ).time]);
}

let n = 0;
async function visit(staffId: string, date: string, time: string, force = true): Promise<string> {
  const r = await adminCreateVisit(demo.business, { staffId, start: at(date, time), serviceIds: [demo.services.clip], name: "Walk In", phone: null, idempotencyKey: `schedule-${++n}-${Math.random()}`, force }, ACTOR);
  if (!r.ok) throw new Error(`booking failed: ${r.code}`);
  return r.id;
}
const overrideOf = async (staffId: string, date: string) => (await query<{ intervals: [string, string][] }>("select intervals from staff_day_overrides where staff_id = $1 and day = $2::date", [staffId, date]))[0]?.intervals ?? null;
const awayRows = async (staffId: string) =>
  (await query<{ starts_at: Date; ends_at: Date; kind: string; status: string }>("select starts_at, ends_at, kind, status from time_off where staff_id = $1 and kind in ('vacation', 'sick') order by starts_at", [staffId])).map((t) => ({
    from: localParts(new Date(t.starts_at).getTime(), TZ),
    to: localParts(new Date(t.ends_at).getTime(), TZ),
    kind: t.kind,
    status: t.status,
  }));
const day = (staffId: string, date: string) => ({ staffId, date });

describe("a day on the grid is the day booking sees", () => {
  it("the weekly hours", async () => {
    expect(await cellOf(renat, TUE)).toEqual({ kind: "work", spans: [["10:00", "19:00"]], minutes: 540, visits: 0 });
    expect(await bookingDay(renat, TUE)).toEqual([["10:00", "19:00"]]);
    // no hours that weekday: an empty cell, and nothing to book
    expect(await cellOf(renat, SUN)).toEqual({ kind: "off", spans: [], minutes: 0, visits: 0 });
    expect(await bookingDay(renat, SUN)).toEqual([]);
  });

  it("a dated day instead of the weekly hours, and a dated day off", async () => {
    await setDayOverride(demo.business, renat, WED, [["12:00", "16:00"]], "", ACTOR);
    await setDayOverride(demo.business, renat, THU, [], "", ACTOR);
    const cells = await grid(renat, WEEK);
    expect(cells[WED]).toMatchObject({ kind: "work", spans: [["12:00", "16:00"]], minutes: 240 });
    expect(await bookingDay(renat, WED)).toEqual(cells[WED].spans);
    expect(cells[THU]).toMatchObject({ kind: "off", spans: [], minutes: 0 });
    expect(await bookingDay(renat, THU)).toEqual([]);
    // a dated day on a weekday he has no hours for
    await setDayOverride(demo.business, renat, SUN, [["11:00", "15:00"]], "", ACTOR);
    expect((await cellOf(renat, SUN)).spans).toEqual([["11:00", "15:00"]]);
    expect(await bookingDay(renat, SUN)).toEqual([["11:00", "15:00"]]);
  });

  it("a vacation and a sick day: no shift, and nothing to book", async () => {
    await addTimeOff(demo.business, { staffId: renat, from: at(FRI, "00:00"), to: at(SAT, "00:00"), kind: "vacation" }, ACTOR);
    await addTimeOff(demo.business, { staffId: renat, from: at(SAT, "00:00"), to: at(SUN, "00:00"), kind: "sick" }, ACTOR);
    const cells = await grid(renat, WEEK);
    expect(cells[FRI]).toMatchObject({ kind: "vacation", spans: [], minutes: 0 });
    expect(cells[SAT]).toMatchObject({ kind: "sick", spans: [] });
    expect(await bookingDay(renat, FRI)).toEqual([]);
    expect(await bookingDay(renat, SAT)).toEqual([]);
    // the day before is as it was
    expect(cells[THU]).toMatchObject({ kind: "work", spans: [["10:00", "19:00"]] });
    // a vacation that takes only the afternoon leaves the morning's shift
    await addTimeOff(demo.business, { staffId: renat, from: at(TUE, "14:00"), to: at(TUE, "23:00"), kind: "vacation" }, ACTOR);
    expect(await cellOf(renat, TUE)).toMatchObject({ kind: "work", spans: [["10:00", "14:00"]], minutes: 240 });
    expect(await bookingDay(renat, TUE)).toEqual([["10:00", "14:00"]]);
  });

  it("a break: two pieces with a gap, whether it is blocked in the calendar or written in the day's hours", async () => {
    await addTimeOff(demo.business, { staffId: renat, from: at(TUE, "13:00"), to: at(TUE, "14:00"), kind: "block" }, ACTOR);
    await setDayOverride(demo.business, renat, WED, [["10:00", "12:00"], ["12:30", "18:00"]], "", ACTOR);
    const cells = await grid(renat, WEEK);
    expect(cells[TUE]).toMatchObject({ kind: "work", spans: [["10:00", "13:00"], ["14:00", "19:00"]], minutes: 480 });
    expect(await bookingDay(renat, TUE)).toEqual(cells[TUE].spans);
    expect(cells[WED].spans).toEqual([["10:00", "12:00"], ["12:30", "18:00"]]);
    expect(await bookingDay(renat, WED)).toEqual(cells[WED].spans);
    // a block over the whole day leaves nothing; it is no vacation
    await addTimeOff(demo.business, { staffId: renat, from: at(THU, "00:00"), to: at(FRI, "00:00"), kind: "block" }, ACTOR);
    expect(await cellOf(renat, THU)).toMatchObject({ kind: "off", spans: [] });
  });

  it("counts a day's visits, not the cancelled ones; and «Итого» is the shifts and their hours", async () => {
    await visit(renat, TUE, "12:00");
    const gone = await visit(renat, TUE, "15:00");
    await adminCancelVisit(demo.business, gone, ACTOR);
    await visit(renat, WED, "10:00");
    const cells = await grid(renat, WEEK);
    expect(cells[TUE].visits).toBe(1);
    expect(cells[WED].visits).toBe(1);
    expect(cells[THU].visits).toBe(0);
    // Tuesday to Saturday, nine hours each
    expect(totalsOf(cells, WEEK)).toEqual({ shifts: 5, minutes: 5 * 540 });
    expect(totalsOf(cells, [SUN, MON])).toEqual({ shifts: 0, minutes: 0 });
    // every working barber has a row, in the list's order
    const all = await loadSchedule(query, demo.business, WEEK, owner);
    expect(all.staff.map((s) => s.name)).toEqual(["Renat", "Valentin", "Jevgeni", "Slava", "Milena"]);
    expect(all.staff.find((s) => s.id === renat)!.cells[TUE].visits).toBe(1);
  });
});

describe("whose days: only the barbers a login sees in the journal", () => {
  /** The owner's rights, but «Просматривать расписание и записи сотрудников» only for these barbers. */
  const seeing = (...ids: string[]): Who => ({ ...owner, rights: { ...owner.rights, values: { ...owner.rights.values, "journal.staff": ids } } });
  const NO = { ok: false, code: "forbidden" };
  const dated = async (staffId: string) => (await query("select 1 from staff_day_overrides where staff_id = $1 and day >= '2027-01-01'", [staffId])).length;

  it("the grid has a row only for them: nothing of the others is drawn, counted or summed", async () => {
    await visit(renat, TUE, "12:00");
    const one = await loadSchedule(query, demo.business, WEEK, seeing(slava));
    expect(one.staff.map((s) => s.name)).toEqual(["Slava"]);
    expect(JSON.stringify(one)).not.toContain(renat);
    const two = await loadSchedule(query, demo.business, WEEK, seeing(milena, renat));
    expect(two.staff.map((s) => s.name)).toEqual(["Renat", "Milena"]);
    expect(two.staff[0].cells[TUE].visits).toBe(1);
    // «all» has everyone; a login that sees no column (the journal's group off) has nobody
    expect((await loadSchedule(query, demo.business, WEEK, owner)).staff).toHaveLength(5);
    expect((await loadSchedule(query, demo.business, WEEK, seeing())).staff).toEqual([]);
    expect((await loadSchedule(query, demo.business, WEEK, without(owner, groupKey("journal")))).staff).toEqual([]);
  });

  it("a marked cell of another barber is refused, and with it the whole change; the refusal says nothing of his visits", async () => {
    const one = seeing(slava);
    // Renat has visits that Tuesday: a login that does not see him is not told so
    await visit(renat, TUE, "12:00");
    expect(await saveDays(demo.business, one, { cells: [day(renat, TUE)], kind: "off" })).toEqual(NO);
    expect(await saveDays(demo.business, one, { cells: [day(renat, WED)], kind: "work", from: "10:00", to: "15:00", breaks: [] })).toEqual(NO);
    expect(await saveDays(demo.business, one, { cells: [day(slava, WED), day(renat, WED)], kind: "off" })).toEqual(NO);
    // a barber who does not exist is refused the same way: the answer does not say who is there
    expect(await saveDays(demo.business, one, { cells: [day("00000000-0000-4000-8000-000000000000", WED)], kind: "off" })).toEqual(NO);
    expect(await dated(renat)).toBe(0);
    expect(await dated(slava)).toBe(0);
    // his own barber he changes; the same login with «all» changes Renat's too
    expect(await saveDays(demo.business, one, { cells: [day(slava, WED)], kind: "off" })).toEqual({ ok: true, written: 1, skipped: [] });
    expect(await saveDays(demo.business, owner, { cells: [day(renat, WED)], kind: "off" })).toEqual({ ok: true, written: 1, skipped: [] });
    expect(await saveDays(demo.business, owner, { cells: [day(renat, TUE)], kind: "off" })).toMatchObject({ ok: false, code: "visits" });
  });

  it("a template for another barber is refused, alone or among the login's own", async () => {
    const one = seeing(slava);
    const ask = { mode: "weekdays", dateFrom: "2027-02-01", dateTo: "2027-02-07", weekdays: [1, 2, 3], from: "11:00", to: "20:00" };
    expect(await fillTemplate(demo.business, one, { ...ask, staffIds: [renat] })).toEqual(NO);
    expect(await fillTemplate(demo.business, one, { ...ask, staffIds: [slava, renat] })).toEqual(NO);
    expect(await fillTemplate(demo.business, one, { ...ask, mode: "shifts", on: 2, off: 2, staffIds: [renat] })).toEqual(NO);
    expect(await dated(renat)).toBe(0);
    expect(await dated(slava)).toBe(0);
    expect(await fillTemplate(demo.business, one, { ...ask, staffIds: [slava] })).toEqual({ ok: true, written: 3, skipped: [] });
    expect(await fillTemplate(demo.business, owner, { ...ask, staffIds: [slava, renat] })).toEqual({ ok: true, written: 6, skipped: [] });
  });

  it("a copy needs the barber it is taken from and every barber it is given to", async () => {
    const ask = { dateFrom: MON, dateTo: SUN, breaks: true };
    // taken from a barber the login does not see: his days would be read
    expect(await copySchedule(demo.business, seeing(slava), { ...ask, fromStaffId: renat, toStaffIds: [slava] }, NOW)).toEqual(NO);
    // given to one it does not see, alone or among others
    expect(await copySchedule(demo.business, seeing(slava), { ...ask, fromStaffId: slava, toStaffIds: [renat] }, NOW)).toEqual(NO);
    expect(await copySchedule(demo.business, seeing(slava, milena), { ...ask, fromStaffId: slava, toStaffIds: [milena, renat] }, NOW)).toEqual(NO);
    expect(await dated(renat)).toBe(0);
    expect(await dated(milena)).toBe(0);
    // both its own: it goes; and with «all» anyone to anyone
    expect(await copySchedule(demo.business, seeing(slava, milena), { ...ask, fromStaffId: slava, toStaffIds: [milena] }, NOW)).toEqual({ ok: true, written: 7, skipped: [] });
    expect(await copySchedule(demo.business, owner, { ...ask, fromStaffId: renat, toStaffIds: [slava] }, NOW)).toEqual({ ok: true, written: 7, skipped: [] });
  });
});

describe("the marked cells", () => {
  it("a working day with its hours and breaks is a dated day; booking sees the same", async () => {
    const r = await saveDays(demo.business, owner, { cells: [day(renat, SUN), day(renat, MON), day(slava, MON)], kind: "work", from: "09:00", to: "20:00", breaks: [["13:00", "14:00"]] });
    expect(r).toEqual({ ok: true, written: 3, skipped: [] });
    expect(await overrideOf(renat, SUN)).toEqual([["09:00", "13:00"], ["14:00", "20:00"]]);
    for (const [id, date] of [[renat, SUN], [renat, MON], [slava, MON]] as const) {
      expect(await cellOf(id, date)).toMatchObject({ kind: "work", spans: [["09:00", "13:00"], ["14:00", "20:00"]], minutes: 600 });
    }
    expect(await bookingDay(slava, MON)).toEqual([["09:00", "13:00"], ["14:00", "20:00"]]);
    // who did it is in the audit
    const log = await query<{ actor: string; after: { via: string; days: number } }>("select actor, after from audit where entity = 'staff' and action = 'schedule' and entity_id = $1", [renat]);
    expect(log).toEqual([{ actor: owner.id, after: expect.objectContaining({ via: "cells", days: 2, kinds: ["work"] }) }]);
    // the weekly hours are not touched
    expect(await cellOf(renat, "2027-01-12")).toMatchObject({ spans: [["10:00", "19:00"]] });
  });

  it("a day off is a dated day with no hours", async () => {
    expect(await saveDays(demo.business, owner, { cells: [day(renat, TUE)], kind: "off" })).toEqual({ ok: true, written: 1, skipped: [] });
    expect(await overrideOf(renat, TUE)).toEqual([]);
    expect(await cellOf(renat, TUE)).toMatchObject({ kind: "off", spans: [] });
    expect(await bookingDay(renat, TUE)).toEqual([]);
  });

  it("a vacation and a sick day are time off for the whole day; days in a row are one row", async () => {
    expect(await saveDays(demo.business, owner, { cells: [day(renat, TUE), day(renat, WED), day(renat, THU), day(renat, SAT)], kind: "vacation" })).toMatchObject({ ok: true, written: 4 });
    expect(await saveDays(demo.business, owner, { cells: [day(slava, TUE)], kind: "sick" })).toMatchObject({ ok: true, written: 1 });
    expect(await awayRows(renat)).toEqual([
      { from: expect.objectContaining({ date: TUE, time: "00:00" }), to: expect.objectContaining({ date: FRI, time: "00:00" }), kind: "vacation", status: "approved" },
      { from: expect.objectContaining({ date: SAT, time: "00:00" }), to: expect.objectContaining({ date: SUN, time: "00:00" }), kind: "vacation", status: "approved" },
    ]);
    const cells = await grid(renat, WEEK);
    expect(WEEK.map((d) => cells[d].kind)).toEqual(["off", "vacation", "vacation", "vacation", "work", "vacation", "off"]);
    expect((await cellOf(slava, TUE)).kind).toBe("sick");
    expect(await bookingDay(renat, WED)).toEqual([]);
    // no dated day was written for them: when the vacation goes, the weekly hours are back
    expect(await overrideOf(renat, WED)).toBeNull();
  });

  it("giving a day another kind takes the vacation off that day only: a longer one is cut around it", async () => {
    await addTimeOff(demo.business, { staffId: renat, from: at(TUE, "00:00"), to: at(SUN, "00:00"), kind: "vacation", note: "море" }, ACTOR);
    // Thursday is worked after all
    expect(await saveDays(demo.business, owner, { cells: [day(renat, THU)], kind: "work", from: "10:00", to: "15:00", breaks: [] })).toMatchObject({ ok: true, written: 1 });
    const cells = await grid(renat, WEEK);
    expect(WEEK.map((d) => cells[d].kind)).toEqual(["off", "vacation", "vacation", "work", "vacation", "vacation", "off"]);
    expect(cells[THU].spans).toEqual([["10:00", "15:00"]]);
    const rows = await awayRows(renat);
    expect(rows.map((t) => [t.from.date, t.to.date])).toEqual([[TUE, THU], [FRI, SUN]]);
    // both pieces are still that vacation
    expect(await query("select 1 from time_off where staff_id = $1 and kind = 'vacation' and note = 'море'", [renat])).toHaveLength(2);
    // a sick day in place of a vacation day; a day off in place of the last one
    await saveDays(demo.business, owner, { cells: [day(renat, TUE)], kind: "sick" });
    await saveDays(demo.business, owner, { cells: [day(renat, SAT)], kind: "off" });
    const after = await grid(renat, WEEK);
    expect(WEEK.map((d) => after[d].kind)).toEqual(["off", "sick", "vacation", "work", "vacation", "off", "off"]);
    // a break blocked in the calendar is not a vacation: it stays
    await addTimeOff(demo.business, { staffId: slava, from: at(TUE, "13:00"), to: at(TUE, "14:00"), kind: "block" }, ACTOR);
    await saveDays(demo.business, owner, { cells: [day(slava, TUE)], kind: "work", from: "09:00", to: "18:00", breaks: [] });
    expect((await cellOf(slava, TUE)).spans).toEqual([["09:00", "13:00"], ["14:00", "18:00"]]);
  });

  it("needs «Редактирование графика работы», and a whole question", async () => {
    const ask = { cells: [day(renat, TUE)], kind: "off" };
    expect(await saveDays(demo.business, without(owner, "staff.schedule"), ask)).toEqual({ ok: false, code: "forbidden" });
    expect(await saveDays(demo.business, without(owner, groupKey("staff")), ask)).toEqual({ ok: false, code: "forbidden" });
    expect(await overrideOf(renat, TUE)).toBeNull();
    expect(await saveDays(demo.business, owner, { cells: [], kind: "off" })).toEqual({ ok: false, code: "invalid", field: "days" });
    expect(await saveDays(demo.business, owner, { cells: [day(renat, TUE)], kind: "holiday" })).toEqual({ ok: false, code: "invalid", field: "kind" });
    expect(await saveDays(demo.business, owner, { cells: [day(renat, TUE)], kind: "work", from: "19:00", to: "10:00" })).toEqual({ ok: false, code: "invalid", field: "spans" });
    expect(await saveDays(demo.business, owner, { cells: [day(renat, TUE)], kind: "work", from: "10:00", to: "19:00", breaks: [["09:00", "11:00"]] })).toEqual({ ok: false, code: "invalid", field: "spans" });
    expect(await saveDays(demo.business, owner, { cells: [day(renat, "2027-02-30")], kind: "off" })).toEqual({ ok: false, code: "invalid", field: "date" });
    // a barber of no business of ours
    expect(await saveDays(demo.business, owner, { cells: [day("00000000-0000-4000-8000-000000000000", TUE)], kind: "off" })).toEqual({ ok: false, code: "invalid", field: "staff" });
    expect(await overrideOf(renat, TUE)).toBeNull();
  });
});

describe("a visit is never cut", () => {
  it("a day with a visit does not become a day off, a vacation or a sick day; the answer names the day and its visits", async () => {
    await visit(renat, TUE, "12:00");
    await visit(renat, TUE, "15:00");
    for (const kind of ["off", "vacation", "sick"]) {
      expect(await saveDays(demo.business, owner, { cells: [day(renat, TUE)], kind })).toEqual({ ok: false, code: "visits", refused: [{ staffId: renat, date: TUE, visits: 2 }] });
    }
    expect(await overrideOf(renat, TUE)).toBeNull();
    expect(await awayRows(renat)).toEqual([]);
    expect(await cellOf(renat, TUE)).toMatchObject({ kind: "work", spans: [["10:00", "19:00"]], visits: 2 });
  });

  it("all or nothing: one such day among the marked cells, and none is written", async () => {
    await visit(renat, TUE, "12:00");
    const r = await saveDays(demo.business, owner, { cells: [day(renat, TUE), day(renat, WED), day(slava, TUE)], kind: "off" });
    expect(r).toEqual({ ok: false, code: "visits", refused: [{ staffId: renat, date: TUE, visits: 1 }] });
    expect(await overrideOf(renat, WED)).toBeNull();
    expect(await overrideOf(slava, TUE)).toBeNull();
  });

  it("its hours do not shrink from under a visit, by a later start, an earlier end or a break; hours that keep it are fine", async () => {
    await visit(renat, TUE, "12:00"); // an hour: 12:00–13:00
    const work = (from: string, to: string, breaks: [string, string][] = []) => saveDays(demo.business, owner, { cells: [day(renat, TUE)], kind: "work", from, to, breaks });
    const refused = { ok: false, code: "visits", refused: [{ staffId: renat, date: TUE, visits: 1 }] };
    expect(await work("14:00", "19:00")).toEqual(refused);
    expect(await work("10:00", "12:30")).toEqual(refused);
    expect(await work("10:00", "19:00", [["12:30", "13:30"]])).toEqual(refused);
    expect(await overrideOf(renat, TUE)).toBeNull();
    expect(await work("11:00", "14:00", [["13:00", "13:30"]])).toEqual({ ok: true, written: 1, skipped: [] });
    expect(await cellOf(renat, TUE)).toMatchObject({ spans: [["11:00", "13:00"], ["13:30", "14:00"]], visits: 1 });
  });

  it("a cancelled visit holds nothing; a visit booked outside the hours on purpose loses nothing when the hours change", async () => {
    const gone = await visit(renat, WED, "12:00");
    await adminCancelVisit(demo.business, gone, ACTOR);
    expect(await saveDays(demo.business, owner, { cells: [day(renat, WED)], kind: "off" })).toMatchObject({ ok: true });
    // 20:00 is after his day: other hours take nothing from under it, but the day still cannot be given away
    await visit(renat, THU, "20:00");
    expect(await saveDays(demo.business, owner, { cells: [day(renat, THU)], kind: "work", from: "10:00", to: "17:00", breaks: [] })).toMatchObject({ ok: true, written: 1 });
    expect(await saveDays(demo.business, owner, { cells: [day(renat, THU)], kind: "vacation" })).toMatchObject({ ok: false, code: "visits" });
  });
});

describe("a template for a period", () => {
  const FEB = { dateFrom: "2027-02-01", dateTo: "2027-02-14" };

  it("«По дням недели»: the ticked weekdays of the period get the hours; the other days stay as they were", async () => {
    const r = await fillTemplate(demo.business, owner, { staffIds: [renat, slava], mode: "weekdays", ...FEB, weekdays: [1, 3, 5], from: "11:00", to: "20:00", breaks: [["15:00", "15:30"]] });
    expect(r).toEqual({ ok: true, written: 12, skipped: [] });
    const dates = daysBetween(FEB.dateFrom, FEB.dateTo)!;
    for (const id of [renat, slava]) {
      const cells = await grid(id, dates);
      // 1.2.2027 is a Monday
      for (const d of ["2027-02-01", "2027-02-03", "2027-02-05", "2027-02-08", "2027-02-10", "2027-02-12"]) expect(cells[d], d).toMatchObject({ kind: "work", spans: [["11:00", "15:00"], ["15:30", "20:00"]] });
    }
    const mine = await grid(renat, dates);
    // a Tuesday is his weekly Tuesday still, a Sunday still free
    expect(mine["2027-02-02"].spans).toEqual([["10:00", "19:00"]]);
    expect(mine["2027-02-07"].kind).toBe("off");
    expect(await overrideOf(renat, "2027-02-02")).toBeNull();
    // and nothing outside the period
    expect(await overrideOf(renat, "2027-02-15")).toBeNull();
    expect(await bookingDay(renat, "2027-02-01", at("2027-01-31", "08:00"))).toEqual([["11:00", "15:00"], ["15:30", "20:00"]]);
  });

  it("never touches a day with visits it would cut, and says which", async () => {
    // Wednesday 3.2, 10:00–11:00: inside his hours now, before the template's 11:00
    await visit(renat, "2027-02-03", "10:00");
    // Friday 5.2, 12:00: inside both
    await visit(renat, "2027-02-05", "12:00");
    const r = await fillTemplate(demo.business, owner, { staffIds: [renat, slava], mode: "weekdays", ...FEB, weekdays: [1, 3, 5], from: "11:00", to: "20:00" });
    expect(r).toEqual({ ok: true, written: 11, skipped: [{ staffId: renat, date: "2027-02-03", visits: 1 }] });
    expect(await overrideOf(renat, "2027-02-03")).toBeNull();
    expect((await cellOf(renat, "2027-02-03")).spans).toEqual([["10:00", "19:00"]]);
    expect((await cellOf(renat, "2027-02-05")).spans).toEqual([["11:00", "20:00"]]);
    expect((await cellOf(slava, "2027-02-03")).spans).toEqual([["11:00", "20:00"]]);
  });

  it("«По сменам»: so many days on, so many off, from the period's first day", async () => {
    const r = await fillTemplate(demo.business, owner, { staffIds: [milena], mode: "shifts", dateFrom: "2027-03-01", dateTo: "2027-03-09", on: 2, off: 2, from: "10:00", to: "22:00" });
    expect(r).toEqual({ ok: true, written: 9, skipped: [] });
    const dates = daysBetween("2027-03-01", "2027-03-09")!;
    const cells = await grid(milena, dates);
    expect(dates.map((d) => cells[d].kind)).toEqual(["work", "work", "off", "off", "work", "work", "off", "off", "work"]);
    expect(cells["2027-03-01"]).toMatchObject({ spans: [["10:00", "22:00"]], minutes: 720 });
    // a day off of the pattern is a dated day off: her weekly Thursday (4.3) is gone for that week
    expect(await overrideOf(milena, "2027-03-04")).toEqual([]);
    // a visit on a day the pattern gives away: that day is left alone
    await visit(milena, "2027-03-15", "12:00");
    const next = await fillTemplate(demo.business, owner, { staffIds: [milena], mode: "shifts", dateFrom: "2027-03-14", dateTo: "2027-03-17", on: 1, off: 3, from: "10:00", to: "22:00" });
    expect(next).toEqual({ ok: true, written: 3, skipped: [{ staffId: milena, date: "2027-03-15", visits: 1 }] });
    expect((await cellOf(milena, "2027-03-15")).kind).toBe("work");
  });

  it("refuses a question that is not whole, and a login without the right", async () => {
    const ask = { staffIds: [renat], mode: "weekdays", ...FEB, weekdays: [1], from: "10:00", to: "19:00" };
    const no = (field: string) => ({ ok: false, code: "invalid", field });
    expect(await fillTemplate(demo.business, without(owner, "staff.schedule"), ask)).toEqual({ ok: false, code: "forbidden" });
    expect(await fillTemplate(demo.business, owner, { ...ask, weekdays: [] })).toEqual(no("weekdays"));
    expect(await fillTemplate(demo.business, owner, { ...ask, weekdays: [9] })).toEqual(no("weekdays"));
    expect(await fillTemplate(demo.business, owner, { ...ask, staffIds: [] })).toEqual(no("staff"));
    expect(await fillTemplate(demo.business, owner, { ...ask, dateFrom: "2027-03-01" })).toEqual(no("period"));
    expect(await fillTemplate(demo.business, owner, { ...ask, dateTo: "2028-02-01" })).toEqual(no("period"));
    expect(await fillTemplate(demo.business, owner, { ...ask, to: "09:00" })).toEqual(no("spans"));
    expect(await fillTemplate(demo.business, owner, { ...ask, mode: "shifts", on: 0, off: 2 })).toEqual(no("on"));
    expect(await fillTemplate(demo.business, owner, { ...ask, mode: "shifts", on: 2, off: 40 })).toEqual(no("off"));
    expect(await fillTemplate(demo.business, owner, { ...ask, mode: "random" })).toEqual(no("mode"));
    expect(await query("select 1 from staff_day_overrides where staff_id = $1 and day >= '2027-01-01'", [renat])).toHaveLength(0);
  });
});

describe("«Скопировать график»", () => {
  /** Renat's week: Tuesday as usual, a short Wednesday, Thursday off, Friday on vacation, a break on Saturday. */
  async function week() {
    await setDayOverride(demo.business, renat, WED, [["12:00", "16:00"]], "", ACTOR);
    await setDayOverride(demo.business, renat, THU, [], "", ACTOR);
    await addTimeOff(demo.business, { staffId: renat, from: at(FRI, "00:00"), to: at(SAT, "00:00"), kind: "vacation" }, ACTOR);
    await addTimeOff(demo.business, { staffId: renat, from: at(SAT, "13:00"), to: at(SAT, "14:00"), kind: "block" }, ACTOR);
  }
  const ask = (over: Partial<Parameters<typeof copySchedule>[2]> = {}) => ({ fromStaffId: renat, toStaffIds: [slava, milena], dateFrom: MON, dateTo: SUN, breaks: true, ...over });

  it("gives the other barbers his days for the period: the hours of a day he works, a day off where he does not", async () => {
    await week();
    expect(await copySchedule(demo.business, owner, ask(), NOW)).toEqual({ ok: true, written: 14, skipped: [] });
    for (const id of [slava, milena]) {
      const cells = await grid(id, WEEK);
      expect(WEEK.map((d) => cells[d].kind), id).toEqual(["off", "work", "work", "off", "off", "work", "off"]);
      expect(cells[TUE].spans).toEqual([["10:00", "19:00"]]);
      expect(cells[WED].spans).toEqual([["12:00", "16:00"]]);
      expect(cells[SAT].spans).toEqual([["10:00", "13:00"], ["14:00", "19:00"]]);
    }
    // only dated days are written: his vacation is his own, and nobody else got one
    expect(await awayRows(slava)).toEqual([]);
    expect(await overrideOf(slava, FRI)).toEqual([]);
    // the week after is everybody's own again
    expect(await overrideOf(slava, "2027-01-12")).toBeNull();
    // he himself is as he was
    expect((await cellOf(renat, FRI)).kind).toBe("vacation");
  });

  it("without the tick a day's breaks are not copied: one piece from its start to its end", async () => {
    await week();
    expect(await copySchedule(demo.business, owner, ask({ toStaffIds: [slava], breaks: false }), NOW)).toMatchObject({ ok: true, written: 7 });
    expect((await cellOf(slava, SAT)).spans).toEqual([["10:00", "19:00"]]);
  });

  it("leaves a day with visits it would cut, and a vacation of the one it is copied to", async () => {
    await week();
    // Slava has a client on the Thursday Renat is off; Milena is on vacation on Tuesday
    await visit(slava, THU, "11:00", false).catch(() => visit(slava, THU, "11:00"));
    await addTimeOff(demo.business, { staffId: milena, from: at(TUE, "00:00"), to: at(WED, "00:00"), kind: "vacation" }, ACTOR);
    const r = await copySchedule(demo.business, owner, ask(), NOW);
    expect(r).toEqual({ ok: true, written: 13, skipped: [{ staffId: slava, date: THU, visits: 1 }] });
    expect(await overrideOf(slava, THU)).toBeNull();
    expect((await cellOf(milena, TUE)).kind).toBe("vacation");
  });

  it("from today on, at most to the end of next month, to someone else, with the right", async () => {
    const no = (field: string) => ({ ok: false, code: "invalid", field });
    expect(endOfNextMonth(MON)).toBe("2027-02-28");
    expect(await copySchedule(demo.business, owner, ask({ dateFrom: "2027-01-03" }), NOW)).toEqual(no("period"));
    expect(await copySchedule(demo.business, owner, ask({ dateTo: "2027-03-01" }), NOW)).toEqual(no("period"));
    expect(await copySchedule(demo.business, owner, ask({ dateFrom: SUN, dateTo: MON }), NOW)).toEqual(no("period"));
    expect(await copySchedule(demo.business, owner, ask({ toStaffIds: [renat] }), NOW)).toEqual(no("to"));
    expect(await copySchedule(demo.business, owner, ask({ toStaffIds: [] }), NOW)).toEqual(no("to"));
    expect(await copySchedule(demo.business, owner, ask({ fromStaffId: "00000000-0000-4000-8000-000000000000" }), NOW)).toEqual(no("staff"));
    expect(await copySchedule(demo.business, without(owner, "staff.schedule"), ask(), NOW)).toEqual({ ok: false, code: "forbidden" });
    // the whole of what is allowed: today to the last day of next month
    expect(await copySchedule(demo.business, owner, ask({ toStaffIds: [slava], dateTo: "2027-02-28" }), NOW)).toMatchObject({ ok: true, written: 56 });
    expect(await query("select 1 from staff_day_overrides where staff_id = $1 and day >= '2027-01-01'", [milena])).toHaveLength(0);
  });
});

describe("the day the clocks change", () => {
  // 28.3.2027: 03:00 becomes 04:00 in Tallinn; 25.10.2026: 04:00 becomes 03:00
  const SPRING = "2027-03-28";
  const AUTUMN = "2026-10-25";

  it("a shift is its wall-clock hours, the same as the day before and the day after", async () => {
    const dates = daysBetween("2027-03-26", "2027-03-30")!;
    expect(await fillTemplate(demo.business, owner, { staffIds: [renat], mode: "weekdays", dateFrom: dates[0], dateTo: dates[4], weekdays: [1, 2, 3, 4, 5, 6, 7], from: "10:00", to: "19:00" })).toMatchObject({ ok: true, written: 5 });
    const cells = await grid(renat, dates);
    for (const d of dates) expect(cells[d], d).toMatchObject({ kind: "work", spans: [["10:00", "19:00"]], minutes: 540 });
    // 10:00 that Sunday is 07:00 UTC (summer time), the day before 08:00: the shift did not move with the clock
    const sun = await loadAvailability(query, { business: demo.business, serviceIds: [demo.services.clip], staffId: renat, from: SPRING, days: 1, now: at("2027-03-26", "08:00") });
    expect(new Date(sun.days[0].slots[0].start).toISOString()).toBe("2027-03-28T07:00:00.000Z");
    expect(await bookingDay(renat, SPRING, at("2027-03-26", "08:00"))).toEqual([["10:00", "19:00"]]);
    expect(await bookingDay(renat, "2027-03-27", at("2027-03-26", "08:00"))).toEqual([["10:00", "19:00"]]);
  });

  it("a shift over the change itself keeps its start and its end; only its length is the real one", async () => {
    await saveDays(demo.business, owner, { cells: [day(renat, SPRING), day(renat, AUTUMN)], kind: "work", from: "01:00", to: "06:00", breaks: [] });
    // an hour that does not exist in spring, an hour that comes twice in autumn
    expect(await cellOf(renat, SPRING)).toMatchObject({ spans: [["01:00", "06:00"]], minutes: 240 });
    expect(await cellOf(renat, AUTUMN)).toMatchObject({ spans: [["01:00", "06:00"]], minutes: 360 });
  });

  it("a vacation day is that day from midnight to midnight, 23 hours long", async () => {
    await saveDays(demo.business, owner, { cells: [day(renat, SPRING)], kind: "vacation" });
    const [t] = await query<{ starts_at: Date; ends_at: Date }>("select starts_at, ends_at from time_off where staff_id = $1 and kind = 'vacation'", [renat]);
    expect(new Date(t.starts_at).toISOString()).toBe("2027-03-27T22:00:00.000Z");
    expect(new Date(t.ends_at).toISOString()).toBe("2027-03-28T21:00:00.000Z");
    const cells = await grid(renat, ["2027-03-27", SPRING, "2027-03-29"]);
    expect(Object.values(cells).map((c) => c.kind)).toEqual(["work", "vacation", "off"]);
  });
});

describe("the rules that need no database", () => {
  it("a working day as the panel has it becomes its spans, and back", () => {
    expect(daySpans("10:00", "19:00", [])).toEqual([["10:00", "19:00"]]);
    expect(daySpans("10:00", "19:00", [["15:00", "15:30"], ["12:00", "13:00"]])).toEqual([["10:00", "12:00"], ["13:00", "15:00"], ["15:30", "19:00"]]);
    // a break at the day's edge just moves the edge; one that takes the whole day leaves nothing
    expect(daySpans("10:00", "19:00", [["10:00", "11:00"]])).toEqual([["11:00", "19:00"]]);
    expect(daySpans("10:00", "19:00", [["10:00", "19:00"]])).toBeNull();
    expect(daySpans("00:00", "24:00", [])).toEqual([["00:00", "24:00"]]);
    for (const bad of [daySpans("19:00", "10:00", []), daySpans("10:00", "10:00", []), daySpans("10", "19:00", []), daySpans("10:00", "19:00", [["09:00", "11:00"]]), daySpans("10:00", "19:00", [["12:00", "13:00"], ["12:30", "14:00"]]), daySpans("10:00", "19:00", [["13:00", "12:00"]]), daySpans("10:00", "19:00", "none"), daySpans("10:00", "19:00", Array.from({ length: 6 }, (_, i) => [`1${i}:00`, `1${i}:30`]))]) expect(bad).toBeNull();
    expect(panelOf([["10:00", "12:00"], ["13:00", "15:00"], ["15:30", "19:00"]])).toEqual({ from: "10:00", to: "19:00", breaks: [["12:00", "13:00"], ["15:00", "15:30"]] });
    expect(panelOf([])).toBeNull();
  });

  it("a visit is cut when it has less working time under it than before", () => {
    const h = (a: number, b: number): [number, number] => [a * 3_600_000, b * 3_600_000];
    expect(cutVisits([h(12, 13)], [h(10, 19)], [h(10, 19)])).toBe(0);
    expect(cutVisits([h(12, 13)], [h(10, 19)], [h(11, 14)])).toBe(0);
    expect(cutVisits([h(12, 13)], [h(10, 19)], [h(12.5, 19)])).toBe(1);
    expect(cutVisits([h(12, 13), h(15, 16)], [h(10, 19)], [])).toBe(2);
    expect(cutVisits([h(12, 13), h(15, 16)], [h(10, 19)], [h(10, 14)])).toBe(1);
    // outside the hours already: nothing to lose
    expect(cutVisits([h(20, 21)], [h(10, 19)], [])).toBe(0);
    // half inside: the half must stay
    expect(cutVisits([h(18.5, 19.5)], [h(10, 19)], [h(10, 18.75)])).toBe(1);
    expect(cutVisits([h(18.5, 19.5)], [h(10, 19)], [h(9, 19)])).toBe(0);
  });

  it("the periods and the grid's own dates", () => {
    expect(daysBetween("2027-02-27", "2027-03-02")).toEqual(["2027-02-27", "2027-02-28", "2027-03-01", "2027-03-02"]);
    expect(daysBetween("2027-03-02", "2027-02-27")).toBeNull();
    expect(daysBetween("2027-01-01", "2027-12-31")).toBeNull();
    expect(daysBetween("soon", "2027-01-02")).toBeNull();
    const dates = daysBetween("2027-02-01", "2027-02-10")!;
    expect(weekdayDays(dates, [1, 7])).toEqual(["2027-02-01", "2027-02-07", "2027-02-08"]);
    expect(shiftDays(dates.slice(0, 7), 5, 2).map((d) => d.work)).toEqual([true, true, true, true, true, false, false]);
    expect(shiftDays(dates.slice(0, 5), 1, 1).map((d) => d.work)).toEqual([true, false, true, false, true]);
    expect(monthDays("2027-02")).toHaveLength(28);
    expect(monthDays("2028-02")).toHaveLength(29);
    expect(monthDays("2026-11")[29]).toBe("2026-11-30");
    expect(weekDays("2026-11-19")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(monthStart("2026-11-19")).toBe("2026-11-01");
    expect(monthStart("2026-11-19", 1)).toBe("2026-12-01");
    expect(monthStart("2026-01-31", -1)).toBe("2025-12-01");
    expect(endOfNextMonth("2026-11-19")).toBe("2026-12-31");
    expect(endOfNextMonth("2026-12-31")).toBe("2027-01-31");
  });
});
