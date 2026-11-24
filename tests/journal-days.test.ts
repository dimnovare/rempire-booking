/**
 * The journal's head menu and bar, the pieces of the admin we follow that
 * were missing (Dim, 24.11.2026, decisions round 15; docs/altegio-pages.md,
 * «Журнал»):
 *   - «Добавить сотрудника в расписание» on any day: who it offers
 *     (addableStaff) and the one day it writes (saveDays, the grid's cell);
 *   - «Добавить рабочие дни» / «Убрать рабочие дни» (markDays): picked days
 *     become working days or days off as a template writes them, a day whose
 *     visits would be cut is skipped and named, with the schedule's rights;
 *   - «Изменить время для онлайн-записи» (journal-online.ts, 043): the rules
 *     of the spans (cleanOnline), what is stored, and that the client's
 *     booking honours them (the slots, «Любой», the booking, the client's
 *     move) while the salon's own booking does not;
 *   - the client's e-mail in the visit's hover card, cut as his phone is.
 *
 * The days are of January 2027, past the demo's dated shifts; every test
 * gives its barbers the hours it needs first. Fake people only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { calendarFor, loadCalendar, type CalendarData, type CalStaff } from "@/lib/admin/calendar";
import { addableStaff, cleanOnline, MARK_DAYS_MAX, ONLINE_SPANS_MAX, spansText } from "@/lib/admin/journal";
import { saveOnlineHours } from "@/lib/admin/journal-online";
import { loadSchedule, markDays, saveDays } from "@/lib/admin/schedule";
import { adminCreateVisit, addTimeOff } from "@/lib/admin/visits";
import { loadAvailability } from "@/lib/availability";
import type { Holder } from "@/lib/auth/rights";
import { groupKey } from "@/lib/auth/rights-catalogue";
import { legacyHolder } from "@/lib/auth/rights-store";
import { book } from "@/lib/booking";
import { moveByClient, moveSlots } from "@/lib/client-move";
import { closeDb, query } from "@/lib/db";
import { freeStarts, onlyOnline, type PricedWindow, type StaffDay } from "@/lib/slots";
import { addDays, localParts, zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const hm = (ms: number) => localParts(ms, TZ).time;
const ACTOR = "test-admin";
// Monday 4.1.2027 … Sunday 10.1.2027
const MON = "2027-01-04";
const WED = "2027-01-06";
const THU = "2027-01-07";
const FRI = "2027-01-08";
const SAT = "2027-01-09";
/** «now» for booking: the Monday morning of that week */
const NOW = at(MON, "08:00");

type Who = Holder & { id: string };
let demo: Demo;
let owner: Who;
let slava: string;
let milena: string;

beforeEach(async () => {
  demo = await freshDemo();
  const [u] = await query<{ id: string }>("insert into users (business_id, email, name, role) values ($1, 'owner@example.test', 'Owner', 'owner') returning id", [demo.business.id]);
  owner = legacyHolder("owner", u.id);
  ({ slava, milena } = demo.staff);
});
afterAll(closeDb);

const without = (who: Who, ...keys: string[]): Who => ({ ...who, rights: { ...who.rights, on: new Set([...who.rights.on].filter((k) => !keys.includes(k))) } });
const seeing = (...ids: string[]): Who => ({ ...owner, rights: { ...owner.rights, values: { ...owner.rights.values, "journal.staff": ids } } });

/** A dated working day, as the grid's cell writes it. */
async function works(staffId: string, date: string, from = "10:00", to = "19:00") {
  const r = await saveDays(demo.business, owner, { cells: [{ staffId, date }], kind: "work", from, to, breaks: [] });
  expect(r).toMatchObject({ ok: true });
}
let n = 0;
async function staffVisit(staffId: string, date: string, time: string, force = true) {
  return adminCreateVisit(demo.business, { staffId, start: at(date, time), serviceIds: [demo.services.clip], name: "Walk In", phone: null, idempotencyKey: `journal-days-${++n}-${Math.random()}`, force }, ACTOR);
}
const cellsOf = async (staffId: string, dates: string[]) => (await loadSchedule(query, demo.business, dates)).staff.find((s) => s.id === staffId)!.cells;
const onlineRow = async (staffId: string, date: string) => (await query<{ spans: [string, string][] }>("select spans from staff_online_hours where staff_id = $1 and day = $2::date", [staffId, date]))[0]?.spans ?? null;

/** What the booking page offers for one cut on one day: [start, end] pairs by the clock, and who for each start. */
async function offered(staffId: string | null, date: string) {
  const a = await loadAvailability(query, { business: demo.business, serviceIds: [demo.services.clip], staffId, from: date, days: 1, now: NOW });
  const dur = (staffId ? a.quotes[0] : a.quotes.find((q) => q.staffId === slava))!.durationMin * 60_000;
  return { dur, slots: a.days[0]?.slots ?? [], spans: (a.days[0]?.slots ?? []).map((s) => [hm(s.start), hm(s.start + dur)]) };
}

/* ---------- «Добавить сотрудника в расписание» ---------- */

describe("«Добавить сотрудника в расписание» on any day", () => {
  const st = (id: string, active = true): CalStaff => ({ id, name: id, role: {}, photoUrl: null, sort: 0, bookable: true, active });

  it("offers the active barbers who do not work that day, in the list's order", () => {
    const data: Pick<CalendarData, "staff" | "work"> = {
      staff: [st("a"), st("b"), st("c", false), st("d")],
      work: { a: { [WED]: [[1, 2]] }, b: { [WED]: [] }, d: {} },
    };
    expect(addableStaff(data, WED).map((s) => s.id)).toEqual(["b", "d"]);
    // another day: everyone active
    expect(addableStaff(data, THU).map((s) => s.id)).toEqual(["a", "b", "d"]);
  });

  it("writes that one day as a dated working day for him, with its hours and break, and the journal gives him a column", async () => {
    await saveDays(demo.business, owner, { cells: [{ staffId: slava, date: WED }], kind: "off" });
    await saveDays(demo.business, owner, { cells: [{ staffId: milena, date: WED }], kind: "off" });
    const before = await loadCalendar(query, demo.business, WED, 1);
    expect(addableStaff(before, WED).map((s) => s.id)).toEqual(expect.arrayContaining([slava, milena]));
    // the window: Slava, 11:00–17:00, a break 13:00–14:00
    expect(await saveDays(demo.business, owner, { cells: [{ staffId: slava, date: WED }], kind: "work", from: "11:00", to: "17:00", breaks: [["13:00", "14:00"]] })).toMatchObject({ ok: true, written: 1 });
    expect((await cellsOf(slava, [WED]))[WED]).toMatchObject({ kind: "work", spans: [["11:00", "13:00"], ["14:00", "17:00"]] });
    const after = await loadCalendar(query, demo.business, WED, 1);
    expect(addableStaff(after, WED).map((s) => s.id)).not.toContain(slava);
    expect(addableStaff(after, WED).map((s) => s.id)).toContain(milena);
    // and only with «Редактирование графика работы»
    expect(await saveDays(demo.business, without(owner, "staff.schedule"), { cells: [{ staffId: milena, date: WED }], kind: "work", from: "10:00", to: "19:00", breaks: [] })).toEqual({ ok: false, code: "forbidden" });
  });
});

/* ---------- «Добавить рабочие дни» / «Убрать рабочие дни» ---------- */

describe("«Добавить рабочие дни» and «Убрать рабочие дни»", () => {
  it("add: the picked days become working days with those hours and breaks", async () => {
    const r = await markDays(demo.business, owner, { staffId: slava, dates: [FRI, THU], kind: "work", from: "11:00", to: "16:00", breaks: [["13:00", "14:00"]] });
    expect(r).toEqual({ ok: true, written: 2, skipped: [] });
    const cells = await cellsOf(slava, [THU, FRI]);
    for (const d of [THU, FRI]) expect(cells[d]).toMatchObject({ kind: "work", spans: [["11:00", "13:00"], ["14:00", "16:00"]] });
    // what the client's booking sees is the same day
    const { spans } = await offered(slava, THU);
    expect(spans[0][0]).toBe("11:00");
    expect(spans.every(([a, b]) => b <= "13:00" || a >= "14:00")).toBe(true);
    // the journal wrote it, and said from where
    const [log] = await query<{ after: { via: string; days: number } }>("select after from audit where entity = 'staff' and entity_id = $1 and action = 'schedule' order by at desc limit 1", [slava]);
    expect(log.after).toMatchObject({ via: "journal-add", days: 2 });
  });

  it("add: a day whose visits the new hours would cut is left as it was and named; the others are written", async () => {
    await works(slava, WED);
    expect((await staffVisit(slava, WED, "17:00")).ok).toBe(true);
    const r = await markDays(demo.business, owner, { staffId: slava, dates: [WED, THU], kind: "work", from: "10:00", to: "15:00" });
    expect(r).toEqual({ ok: true, written: 1, skipped: [{ staffId: slava, date: WED, visits: 1 }] });
    const cells = await cellsOf(slava, [WED, THU]);
    expect(cells[WED].spans).toEqual([["10:00", "19:00"]]);
    expect(cells[THU].spans).toEqual([["10:00", "15:00"]]);
  });

  it("remove: the picked days become days off; a day with a visit stays a working day and is named", async () => {
    await works(slava, WED);
    await works(slava, SAT);
    expect((await staffVisit(slava, WED, "12:00")).ok).toBe(true);
    const r = await markDays(demo.business, owner, { staffId: slava, dates: [WED, SAT], kind: "off" });
    expect(r).toEqual({ ok: true, written: 1, skipped: [{ staffId: slava, date: WED, visits: 1 }] });
    const cells = await cellsOf(slava, [WED, SAT]);
    expect(cells[WED].kind).toBe("work");
    expect(cells[SAT]).toMatchObject({ kind: "off", spans: [] });
    expect((await offered(slava, SAT)).slots).toEqual([]);
  });

  it("as a template writes: dated days only, so a vacation stays where it is", async () => {
    await addTimeOff(demo.business, { staffId: slava, from: at(FRI, "00:00"), to: at(SAT, "00:00"), kind: "vacation" }, ACTOR);
    expect(await markDays(demo.business, owner, { staffId: slava, dates: [FRI], kind: "work", from: "10:00", to: "18:00" })).toMatchObject({ ok: true, written: 1 });
    expect((await cellsOf(slava, [FRI]))[FRI].kind).toBe("vacation");
    expect(await query("select 1 from time_off where staff_id = $1 and kind = 'vacation'", [slava])).toHaveLength(1);
  });

  it("needs «Редактирование графика работы» and the barber's column", async () => {
    const ask = { staffId: slava, dates: [THU], kind: "off" };
    expect(await markDays(demo.business, without(owner, "staff.schedule"), ask)).toEqual({ ok: false, code: "forbidden" });
    expect(await markDays(demo.business, without(owner, groupKey("staff")), ask)).toEqual({ ok: false, code: "forbidden" });
    expect(await markDays(demo.business, seeing(milena), ask)).toEqual({ ok: false, code: "forbidden" });
    expect(await markDays(demo.business, seeing(slava), ask)).toMatchObject({ ok: true, written: 1 });
  });

  it("a whole question: the kind, some days and not too many, real days, hours that are hours, a barber of the salon", async () => {
    const bad = (field: string) => ({ ok: false, code: "invalid", field });
    expect(await markDays(demo.business, owner, { staffId: slava, dates: [THU], kind: "vacation" })).toEqual(bad("kind"));
    expect(await markDays(demo.business, owner, { staffId: slava, dates: [], kind: "off" })).toEqual(bad("days"));
    const many = Array.from({ length: MARK_DAYS_MAX + 1 }, (_, i) => addDays(MON, i));
    expect(await markDays(demo.business, owner, { staffId: slava, dates: many, kind: "off" })).toEqual(bad("days"));
    // the same day twice is one day
    expect(await markDays(demo.business, owner, { staffId: slava, dates: [THU, THU], kind: "off" })).toMatchObject({ ok: true, written: 1 });
    expect(await markDays(demo.business, owner, { staffId: slava, dates: ["2027-02-30"], kind: "off" })).toEqual(bad("date"));
    expect(await markDays(demo.business, owner, { staffId: slava, dates: [THU], kind: "work", from: "18:00", to: "10:00" })).toEqual(bad("spans"));
    expect(await markDays(demo.business, owner, { staffId: slava, dates: [THU], kind: "work", from: "10:00", to: "18:00", breaks: [["09:00", "11:00"]] })).toEqual(bad("spans"));
    expect(await markDays(demo.business, owner, { staffId: "nobody", dates: [THU], kind: "off" })).toEqual(bad("staff"));
    expect(await markDays(demo.business, owner, { staffId: "00000000-0000-4000-8000-000000000000", dates: [THU], kind: "off" })).toEqual(bad("staff"));
  });
});

/* ---------- «Изменить время для онлайн-записи» ---------- */

describe("online hours: the rules of the spans", () => {
  const day: [string, string][] = [
    ["10:00", "13:00"],
    ["14:00", "19:00"],
  ];

  it("none is all his hours; spans inside his working day, sorted", () => {
    expect(cleanOnline([], day)).toEqual([]);
    expect(cleanOnline([], [])).toEqual([]);
    expect(
      cleanOnline(
        [
          ["16:00", "19:00"],
          ["10:00", "12:00"],
        ],
        day,
      ),
    ).toEqual([
      ["10:00", "12:00"],
      ["16:00", "19:00"],
    ]);
    // over his break: the overlap with his hours is what clients get
    expect(cleanOnline([["12:00", "15:00"]], day)).toEqual([["12:00", "15:00"]]);
    // touching spans are allowed
    expect(cleanOnline([["10:00", "12:00"], ["12:00", "13:00"]], day)).toHaveLength(2);
  });

  it("refused: outside his day, back to front, over each other, too many, not times, a day he does not work", () => {
    expect(cleanOnline([["09:00", "12:00"]], day)).toBeNull();
    expect(cleanOnline([["15:00", "19:30"]], day)).toBeNull();
    expect(cleanOnline([["12:00", "11:00"]], day)).toBeNull();
    expect(cleanOnline([["12:00", "12:00"]], day)).toBeNull();
    expect(cleanOnline([["10:00", "12:00"], ["11:00", "13:00"]], day)).toBeNull();
    expect(cleanOnline(Array.from({ length: ONLINE_SPANS_MAX + 1 }, (_, i) => [`1${i}:00`, `1${i}:30`]), [["10:00", "19:00"]])).toBeNull();
    expect(cleanOnline([["10:00", "1pm"]], day)).toBeNull();
    expect(cleanOnline("10:00-12:00", day)).toBeNull();
    expect(cleanOnline([["10:00", "12:00"]], [])).toBeNull();
  });

  it("a day to midnight: kept as 23:59, read as midnight", () => {
    expect(cleanOnline([["20:00", "24:00"]], [["18:00", "23:59"]])).toEqual([["20:00", "24:00"]]);
    expect(spansText([["20:00", "23:59"]])).toBe("20:00–24:00");
    expect(spansText([["12:00", "15:00"], ["16:00", "18:00"]])).toBe("12:00–15:00, 16:00–18:00");
  });

  it("onlyOnline: each priced window keeps its overlap with the online hours at its own price; touching spans are one", () => {
    const w: PricedWindow[] = [
      { from: 0, to: 100, extraCents: 0, extraPct: 0 },
      { from: 100, to: 200, extraCents: 500, extraPct: 0 },
    ];
    expect(onlyOnline(w, null)).toBe(w);
    expect(onlyOnline(w, [[50, 120]])).toEqual([
      { from: 50, to: 100, extraCents: 0, extraPct: 0 },
      { from: 100, to: 120, extraCents: 500, extraPct: 0 },
    ]);
    expect(onlyOnline(w, [[10, 20], [20, 30], [300, 400]])).toEqual([{ from: 10, to: 30, extraCents: 0, extraPct: 0 }]);
    expect(onlyOnline(w, [])).toEqual([]);
  });

  it("the free starts: inside the spans, start and end; the grid still counts from the start of his day", () => {
    const base: StaffDay = { staffId: "s", date: WED, windows: [[at(WED, "10:00"), at(WED, "19:00")]], busy: [], durationMin: 60, priceCents: 0, bufferMin: 0, bookings: 0, sort: 0 };
    const opts = { tz: TZ, stepMin: 30, notBefore: 0 };
    expect(freeStarts(base, opts).map(hm)[0]).toBe("10:00");
    const starts = freeStarts({ ...base, online: [[at(WED, "12:10"), at(WED, "14:00")]] }, opts).map(hm);
    // 12:10 (where the online hours begin), then the day's own half hours; the last one ends at 14:00
    expect(starts).toEqual(["12:10", "12:30", "13:00"]);
    expect(freeStarts({ ...base, online: [[at(WED, "12:00"), at(WED, "12:30")]] }, opts)).toEqual([]);
    expect(freeStarts({ ...base, online: null }, opts)).toHaveLength(freeStarts(base, opts).length);
  });
});

describe("online hours: written by the journal", () => {
  it("stored for the day (an end of midnight as 23:59), with an audit row; none gives back all his hours", async () => {
    await works(slava, WED, "10:00", "24:00");
    expect(await saveOnlineHours(demo.business, owner, { staffId: slava, date: WED, spans: [["20:00", "24:00"], ["12:00", "15:00"]] })).toEqual({
      ok: true,
      spans: [
        ["12:00", "15:00"],
        ["20:00", "24:00"],
      ],
    });
    expect(await onlineRow(slava, WED)).toEqual([
      ["12:00", "15:00"],
      ["20:00", "23:59"],
    ]);
    const [log] = await query<{ after: { date: string } }>("select after from audit where entity = 'staff' and entity_id = $1 and action = 'online_hours'", [slava]);
    expect(log.after.date).toBe(WED);
    // the journal reads it back for his head's menu
    const cal = await loadCalendar(query, demo.business, WED, 1);
    expect(cal.online?.[slava]?.[WED]).toEqual([
      ["12:00", "15:00"],
      ["20:00", "23:59"],
    ]);
    // a login that does not see his column does not see his online hours either
    expect(calendarFor(seeing(milena), cal, MON).online?.[slava]).toBeUndefined();
    expect(calendarFor(owner, cal, MON).online?.[slava]?.[WED]).toHaveLength(2);
    // «Всё рабочее время»
    expect(await saveOnlineHours(demo.business, owner, { staffId: slava, date: WED, spans: [] })).toEqual({ ok: true, spans: [] });
    expect(await onlineRow(slava, WED)).toBeNull();
  });

  it("refused: outside his hours, a day he does not work, not a question", async () => {
    await works(slava, WED);
    const bad = (field: string) => ({ ok: false, code: "invalid", field });
    expect(await saveOnlineHours(demo.business, owner, { staffId: slava, date: WED, spans: [["09:00", "12:00"]] })).toEqual(bad("spans"));
    expect(await saveOnlineHours(demo.business, owner, { staffId: slava, date: WED, spans: [["12:00", "14:00"], ["13:00", "15:00"]] })).toEqual(bad("spans"));
    await saveDays(demo.business, owner, { cells: [{ staffId: slava, date: THU }], kind: "off" });
    expect(await saveOnlineHours(demo.business, owner, { staffId: slava, date: THU, spans: [["12:00", "14:00"]] })).toEqual(bad("closed"));
    expect(await saveOnlineHours(demo.business, owner, { staffId: slava, date: "2027-13-01", spans: [] })).toEqual(bad("date"));
    expect(await saveOnlineHours(demo.business, owner, { staffId: "nobody", date: WED, spans: [] })).toEqual(bad("staff"));
    expect(await saveOnlineHours(demo.business, owner, { staffId: "00000000-0000-4000-8000-000000000000", date: WED, spans: [] })).toEqual(bad("staff"));
    expect(await saveOnlineHours(demo.business, owner, { staffId: slava, date: WED, spans: null as unknown as [string, string][] })).toEqual(bad("spans"));
    expect(await onlineRow(slava, WED)).toBeNull();
  });

  it("needs «Редактирование графика работы» and the barber's column", async () => {
    await works(slava, WED);
    const ask = { staffId: slava, date: WED, spans: [["12:00", "15:00"]] as [string, string][] };
    expect(await saveOnlineHours(demo.business, without(owner, "staff.schedule"), ask)).toEqual({ ok: false, code: "forbidden" });
    expect(await saveOnlineHours(demo.business, seeing(milena), ask)).toEqual({ ok: false, code: "forbidden" });
    expect(await onlineRow(slava, WED)).toBeNull();
    expect(await saveOnlineHours(demo.business, seeing(slava), ask)).toMatchObject({ ok: true });
  });
});

describe("online hours: the client's booking honours them, the salon's does not", () => {
  beforeEach(async () => {
    await works(slava, WED);
    await works(milena, WED);
  });

  it("the booking page offers him only inside the spans, the whole visit; without them, all his day", async () => {
    const all = await offered(slava, WED);
    expect(all.spans[0][0]).toBe("10:00");
    await saveOnlineHours(demo.business, owner, { staffId: slava, date: WED, spans: [["12:00", "15:00"]] });
    const { spans } = await offered(slava, WED);
    expect(spans.length).toBeGreaterThan(0);
    expect(spans[0][0]).toBe("12:00");
    for (const [a, b] of spans) expect(a >= "12:00" && b <= "15:00").toBe(true);
    // another day is his whole day still
    await works(slava, THU);
    expect((await offered(slava, THU)).spans[0][0]).toBe("10:00");
  });

  it("«Любой»: the times outside his spans go to another barber; inside, both", async () => {
    await saveOnlineHours(demo.business, owner, { staffId: slava, date: WED, spans: [["12:00", "15:00"]] });
    const { slots } = await offered(null, WED);
    const ten = slots.find((s) => hm(s.start) === "10:00")!;
    expect(ten.staffIds).toContain(milena);
    expect(ten.staffIds).not.toContain(slava);
    const noon = slots.find((s) => hm(s.start) === "12:00")!;
    expect(noon.staffIds).toEqual(expect.arrayContaining([slava, milena]));
  });

  it("the booking itself: outside the spans the time is taken, inside it is booked; the salon books him at any working time", async () => {
    await saveOnlineHours(demo.business, owner, { staffId: slava, date: WED, spans: [["12:00", "15:00"]] });
    const ask = (time: string) => ({
      serviceIds: [demo.services.clip],
      staffId: slava,
      startsAt: new Date(at(WED, time)).toISOString(),
      name: "Online Test Client",
      phone: `+372 5555 07${String(++n).padStart(2, "0")}`,
      email: null,
      comment: "",
      locale: "ru" as const,
      smsReminder: false,
      idempotencyKey: `journal-days-book-${n}-${Math.random()}`,
    });
    expect(await book(query, demo.business, ask("10:00"), { now: NOW })).toMatchObject({ ok: false, code: "slot_taken" });
    expect(await book(query, demo.business, ask("12:00"), { now: NOW })).toMatchObject({ ok: true });
    // the journal and the barber's app are not limited: 10:00 is inside his hours, nothing asks again
    expect(await staffVisit(slava, WED, "10:00", false)).toMatchObject({ ok: true });
  });

  it("the client's own move: only to a time inside the spans", async () => {
    await saveOnlineHours(demo.business, owner, { staffId: slava, date: WED, spans: [["12:00", "16:00"]] });
    const r = await book(
      query,
      demo.business,
      { serviceIds: [demo.services.clip], staffId: slava, startsAt: new Date(at(WED, "12:00")).toISOString(), name: "Move Test Client", phone: "+372 5555 0799", email: null, comment: "", locale: "ru", smsReminder: false, idempotencyKey: `journal-days-move-${Math.random()}` },
      { now: NOW },
    );
    if (!r.ok || !r.manageToken) throw new Error(`book: ${JSON.stringify(r)}`);
    const offeredMove = (await moveSlots(demo.business, r.manageToken, 7, NOW))!.days.find((d) => d.date === WED)!.slots.map((s) => hm(s.start));
    expect(offeredMove).not.toContain("10:00");
    expect(offeredMove).toContain("13:00");
    expect(await moveByClient(demo.business, r.manageToken, { startsAt: new Date(at(WED, "10:00")).toISOString() }, NOW)).toEqual({ ok: false, code: "slot_taken" });
    expect(await moveByClient(demo.business, r.manageToken, { startsAt: new Date(at(WED, "13:00")).toISOString() }, NOW)).toMatchObject({ ok: true });
  });
});

/* ---------- the client's e-mail in the hover card ---------- */

describe("the visit's hover card: the client's e-mail, cut as his phone is", () => {
  it("whole with «Показывать номера телефонов», masked without, none without the client's data", async () => {
    await works(slava, WED);
    const v = await staffVisit(slava, WED, "12:00");
    if (!v.ok) throw new Error(v.code);
    await query("update clients set email = 'anna.naidis@example.test' where id = (select client_id from appointments where id = $1)", [v.id]);
    const data = await loadCalendar(query, demo.business, WED, 1);
    const mine = (d: CalendarData) => d.visits.find((x) => x.id === v.id)!;
    expect(mine(data).clientEmail).toBe("anna.naidis@example.test");
    expect(mine(calendarFor(owner, data, MON)).clientEmail).toBe("anna.naidis@example.test");
    expect(mine(calendarFor(without(owner, "journal.phones"), data, MON)).clientEmail).toBe("a•••@example.test");
    expect(mine(calendarFor(without(owner, "visit.client_data"), data, MON)).clientEmail).toBeNull();
  });
});
