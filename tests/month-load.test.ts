/**
 * The mini month's load (src/lib/admin/month-load.ts): the minutes booked a
 * day over the minutes the barbers work that day, and the ring's colour.
 * March 2027 starts on a Monday and holds nothing of the demo's own, so
 * every number here is the test's. Fake people only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { dayLoad, isMonth, monthGrid, monthLoad, shiftMonth, type DayLoad } from "@/lib/admin/month-load";
import { closeDb, query } from "@/lib/db";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => new Date(zonedToUtc(date, time, TZ));
const MARCH = "2027-03";

let demo: Demo;
let clientId: string;

beforeEach(async () => {
  demo = await freshDemo();
  // only the hours written here count
  await query("delete from staff_hours");
  await query("delete from staff_day_overrides");
  const [c] = await query<{ id: string }>("insert into clients (business_id, name, phone_e164) values ($1, 'Test Client', '+37255550001') returning id", [demo.business.id]);
  clientId = c.id;
});
afterAll(closeDb);

/** Weekly hours: the same span on each of these ISO weekdays. */
async function hours(staff: string, weekdays: number[], from: string, to: string) {
  for (const wd of weekdays) await query("insert into staff_hours (staff_id, weekday, starts, ends) values ($1, $2, $3, $4)", [demo.staff[staff], wd, from, to]);
}

/** A visit of so many minutes; returns its id. */
async function visit(staff: string, date: string, time: string, minutes: number, status = "booked"): Promise<string> {
  const from = at(date, time);
  const to = new Date(from.getTime() + minutes * 60_000);
  const [row] = await query<{ id: string }>(
    `insert into appointments (business_id, location_id, staff_id, client_id, starts_at, ends_at, blocked_until, status, source)
     select $1, s.location_id, s.id, $2, $3, $4, $4, $5, 'admin' from staff s where s.id = $6 returning id`,
    [demo.business.id, clientId, from, to, status, demo.staff[staff]],
  );
  return row.id;
}

const load = async (month = MARCH) => Object.fromEntries((await monthLoad(query, demo.business, month)).days.map((d) => [d.date, d])) as Record<string, DayLoad>;

describe("the grid", () => {
  it("is the weeks that hold the month, Monday first", () => {
    // March 2027: Monday the 1st to Wednesday the 31st, so the last week runs to Sunday 4 April
    const march = monthGrid(MARCH);
    expect(march).toHaveLength(35);
    expect(march[0]).toBe("2027-03-01");
    expect(march.at(-1)).toBe("2027-04-04");
    // November 2026 starts on a Sunday: six weeks, from Monday 26 October
    const nov = monthGrid("2026-11");
    expect(nov).toHaveLength(42);
    expect(nov[0]).toBe("2026-10-26");
    expect(nov.at(-1)).toBe("2026-12-06");
    // February 2027 is exactly four weeks
    expect(monthGrid("2027-02")).toHaveLength(28);
  });

  it("steps over a year's end, and knows a month from anything else", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(isMonth("2026-11")).toBe(true);
    for (const bad of ["2026-13", "2026-1", "26-11", "2026-11-01", "", null, 202611]) expect(isMonth(bad)).toBe(false);
  });
});

describe("the ring's colour", () => {
  it("is green under 50 %, yellow from 50 %, red from 75 %", () => {
    expect(dayLoad(0, 100)).toEqual({ pct: 0, band: "green" });
    expect(dayLoad(49, 100)).toEqual({ pct: 49, band: "green" });
    expect(dayLoad(50, 100)).toEqual({ pct: 50, band: "yellow" });
    expect(dayLoad(74, 100)).toEqual({ pct: 74, band: "yellow" });
    expect(dayLoad(75, 100)).toEqual({ pct: 75, band: "red" });
    expect(dayLoad(100, 100)).toEqual({ pct: 100, band: "red" });
  });

  it("goes by the exact share, not the rounded one", () => {
    // 359 of 720 is 49.86 %: drawn at 50, still green; 539 of 720 is 74.86 %: drawn at 75, still yellow
    expect(dayLoad(359, 720)).toEqual({ pct: 50, band: "green" });
    expect(dayLoad(360, 720)).toEqual({ pct: 50, band: "yellow" });
    expect(dayLoad(539, 720)).toEqual({ pct: 75, band: "yellow" });
    expect(dayLoad(540, 720)).toEqual({ pct: 75, band: "red" });
  });

  it("never passes 100 %, and has no ring on a day nobody works", () => {
    expect(dayLoad(900, 720)).toEqual({ pct: 100, band: "red" });
    expect(dayLoad(0, 0)).toBeNull();
    // a visit booked by hand on a day off: a full day, never a free one
    expect(dayLoad(30, 0)).toEqual({ pct: 100, band: "red" });
  });
});

describe("a month's load", () => {
  beforeEach(async () => {
    // Renat: Monday to Friday, 8 hours. Valentin: Monday to Wednesday, 4 hours.
    await hours("renat", [1, 2, 3, 4, 5], "10:00", "18:00");
    await hours("valentin", [1, 2, 3], "12:00", "16:00");
  });

  it("adds the barbers' minutes of each day; a day nobody works has no load", async () => {
    const m = await monthLoad(query, demo.business, MARCH);
    expect(m.month).toBe(MARCH);
    expect(m.days.map((d) => d.date)).toEqual(monthGrid(MARCH));
    const d = Object.fromEntries(m.days.map((x) => [x.date, x]));
    // Monday: both work
    expect(d["2027-03-01"]).toEqual({ date: "2027-03-01", shiftMin: 720, bookedMin: 0, pct: 0, band: "green" });
    // Thursday: Renat alone
    expect(d["2027-03-04"]).toMatchObject({ shiftMin: 480, pct: 0 });
    // the weekend: nobody
    expect(d["2027-03-06"]).toEqual({ date: "2027-03-06", shiftMin: 0, bookedMin: 0, pct: null, band: null });
    expect(d["2027-03-07"]).toMatchObject({ shiftMin: 0, pct: null, band: null });
    // the days of April that end the last week are counted the same way
    expect(d["2027-04-01"]).toMatchObject({ shiftMin: 480, pct: 0 });
  });

  it("counts the visits of every barber, and never a cancelled one", async () => {
    await visit("renat", "2027-03-01", "10:00", 120);
    await visit("valentin", "2027-03-01", "12:00", 60);
    await visit("valentin", "2027-03-01", "13:00", 60, "cancelled");
    const d = await load();
    expect(d["2027-03-01"]).toMatchObject({ shiftMin: 720, bookedMin: 180, pct: 25, band: "green" });
    // a visit that came, one that did not, one that is over: all were booked time
    await visit("renat", "2027-03-02", "10:00", 60, "arrived");
    await visit("renat", "2027-03-02", "11:00", 60, "no_show");
    await visit("renat", "2027-03-02", "12:00", 60, "done");
    expect((await load())["2027-03-02"]).toMatchObject({ bookedMin: 180 });
  });

  it("a visit cancelled later leaves the day", async () => {
    const id = await visit("renat", "2027-03-04", "10:00", 240);
    expect((await load())["2027-03-04"]).toMatchObject({ bookedMin: 240, pct: 50, band: "yellow" });
    await query("update appointments set status = 'cancelled', cancelled_at = now() where id = $1", [id]);
    expect((await load())["2027-03-04"]).toMatchObject({ bookedMin: 0, pct: 0, band: "green" });
  });

  it("colours a day by its share: the three bands at their edges", async () => {
    // Thursday and Friday: Renat alone, 480 minutes
    await visit("renat", "2027-03-04", "10:00", 239); // 49.8 %
    await visit("renat", "2027-03-05", "10:00", 240); // 50 %
    await visit("renat", "2027-03-11", "10:00", 359); // 74.8 %
    await visit("renat", "2027-03-12", "10:00", 360); // 75 %
    const d = await load();
    expect(d["2027-03-04"]).toMatchObject({ pct: 50, band: "green" });
    expect(d["2027-03-05"]).toMatchObject({ pct: 50, band: "yellow" });
    expect(d["2027-03-11"]).toMatchObject({ pct: 75, band: "yellow" });
    expect(d["2027-03-12"]).toMatchObject({ pct: 75, band: "red" });
  });

  it("a day's own hours win over the weekly ones; an empty day is a day off", async () => {
    // Thursday the 4th: Renat works two hours only. Friday the 5th: he is off. Saturday the 6th: Valentin comes in.
    await query("insert into staff_day_overrides (staff_id, day, intervals) values ($1, '2027-03-04', $2::jsonb)", [demo.staff.renat, JSON.stringify([["10:00", "12:00"]])]);
    await query("insert into staff_day_overrides (staff_id, day, intervals) values ($1, '2027-03-05', '[]'::jsonb)", [demo.staff.renat]);
    await query("insert into staff_day_overrides (staff_id, day, intervals) values ($1, '2027-03-06', $2::jsonb)", [demo.staff.valentin, JSON.stringify([["11:00", "14:00"]])]);
    await visit("renat", "2027-03-04", "10:00", 60);
    const d = await load();
    expect(d["2027-03-04"]).toMatchObject({ shiftMin: 120, bookedMin: 60, pct: 50, band: "yellow" });
    expect(d["2027-03-05"]).toMatchObject({ shiftMin: 0, pct: null, band: null });
    expect(d["2027-03-06"]).toMatchObject({ shiftMin: 180, pct: 0, band: "green" });
  });

  it("a vacation or a break is not working time; a declined one is", async () => {
    const off = (staff: string, from: Date, to: Date, kind: string, status = "approved") =>
      query("insert into time_off (staff_id, starts_at, ends_at, kind, status) values ($1, $2, $3, $4, $5)", [demo.staff[staff], from, to, kind, status]);
    // Renat is away Monday 8th to Wednesday 10th; Valentin has lunch on Monday; a declined day off on Thursday changes nothing
    await off("renat", at("2027-03-08", "00:00"), at("2027-03-11", "00:00"), "vacation");
    await off("valentin", at("2027-03-08", "13:00"), at("2027-03-08", "14:00"), "block");
    await off("renat", at("2027-03-11", "00:00"), at("2027-03-12", "00:00"), "vacation", "declined");
    await visit("valentin", "2027-03-08", "14:00", 90);
    const d = await load();
    // Monday: Valentin alone, 4 hours less lunch
    expect(d["2027-03-08"]).toMatchObject({ shiftMin: 180, bookedMin: 90, pct: 50, band: "yellow" });
    expect(d["2027-03-09"]).toMatchObject({ shiftMin: 240 });
    expect(d["2027-03-11"]).toMatchObject({ shiftMin: 480 });
    // Friday: Renat is back; and with him away and Valentin not working, nobody would work
    await off("renat", at("2027-03-12", "00:00"), at("2027-03-13", "00:00"), "sick");
    expect((await load())["2027-03-12"]).toMatchObject({ shiftMin: 0, pct: null, band: null });
  });

  it("a barber who no longer works is not counted; hours with dates count inside them", async () => {
    await query("update staff set active = false where id = $1", [demo.staff.valentin]);
    expect((await load())["2027-03-01"]).toMatchObject({ shiftMin: 480 });
    // Slava works Saturdays from 20 March on
    await query("insert into staff_hours (staff_id, weekday, starts, ends, valid_from) values ($1, 6, '10:00', '15:00', '2027-03-20')", [demo.staff.slava]);
    const d = await load();
    expect(d["2027-03-13"]).toMatchObject({ shiftMin: 0, pct: null });
    expect(d["2027-03-20"]).toMatchObject({ shiftMin: 300, pct: 0 });
  });

  it("keeps a visit on its own local day, also on the night the clocks change", async () => {
    // Sunday 28 March 2027: 03:00 becomes 04:00 in Tallinn. Slava works that Sunday, 10:00 to 14:00.
    await query("insert into staff_hours (staff_id, weekday, starts, ends) values ($1, 7, '10:00', '14:00')", [demo.staff.slava]);
    await visit("slava", "2027-03-28", "10:00", 60);
    // late on Saturday, local time: still Saturday's
    await query("insert into staff_hours (staff_id, weekday, starts, ends) values ($1, 6, '20:00', '23:59')", [demo.staff.slava]);
    await visit("slava", "2027-03-27", "23:00", 30);
    const d = await load();
    expect(d["2027-03-28"]).toMatchObject({ shiftMin: 240, bookedMin: 60, pct: 25 });
    expect(d["2027-03-27"]).toMatchObject({ bookedMin: 30 });
  });
});
