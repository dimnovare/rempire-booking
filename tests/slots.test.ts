/**
 * Free start times as Altegio's «Оптимальный» grid gives them (Dim,
 * 20.11.2026: «Copy Altegio's: 30 min, no notice»): the step grid counted
 * from the start of the barber's day, plus a start where a visit, time off,
 * a break or a price ends. The rule:
 * alteg.io/en/support/knowledge-base/16898106582429. Pure: no database.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, readSettings } from "@/lib/settings";
import { freeStarts, freeStartsPriced, mergeSlots, type Interval, type StaffDay } from "@/lib/slots";
import { localParts, zonedToUtc } from "@/lib/tz";

const TZ = "Europe/Tallinn";
const DAY = "2026-12-01";
const at = (time: string) => zonedToUtc(DAY, time, TZ);
const hm = (ms: number) => localParts(ms, TZ).time;
const span = (from: string, to: string): Interval => [at(from), at(to)];

/** A 30-minute service with a barber who works 10:15–13:15. */
const day = (o: Partial<StaffDay> = {}): StaffDay => ({
  staffId: "a",
  date: DAY,
  windows: [span("10:15", "13:15")],
  busy: [],
  special: [],
  durationMin: 30,
  priceCents: 4000,
  bufferMin: 0,
  bookings: 0,
  sort: 0,
  ...o,
});
const opts = (o: { now?: string; stepMin?: number; noticeMin?: number } = {}) => ({
  tz: TZ,
  stepMin: o.stepMin ?? DEFAULT_SETTINGS.slot_step_min,
  notBefore: at(o.now ?? "00:00") + (o.noticeMin ?? DEFAULT_SETTINGS.min_notice_min) * 60_000,
});
const starts = (d: StaffDay, o: Parameters<typeof opts>[0] = {}) => freeStarts(d, opts(o)).map(hm);

describe("the settings: Altegio's", () => {
  it("a 30-minute step and no notice, unless the salon sets its own", () => {
    expect([DEFAULT_SETTINGS.slot_step_min, DEFAULT_SETTINGS.min_notice_min]).toEqual([30, 0]);
    expect(readSettings({}).min_notice_min).toBe(0);
    expect(readSettings({ slot_step_min: 15, min_notice_min: 30 })).toMatchObject({ slot_step_min: 15, min_notice_min: 30 });
    expect(readSettings({ slot_step_min: 0, min_notice_min: -5 })).toMatchObject({ slot_step_min: 30, min_notice_min: 0 });
  });
});

describe("the grid from the start of his day", () => {
  it("a shift from 10:15: every half hour from 10:15, not from midnight", () => {
    expect(starts(day())).toEqual(["10:15", "10:45", "11:15", "11:45", "12:15", "12:45"]);
  });

  it("a 10:15 shift, a 45-minute visit to 11:45, no notice, at 10:50: 11:45 is the first", () => {
    const d = day({ busy: [span("11:00", "11:45")] });
    expect(starts(d, { now: "10:50" })).toEqual(["11:45", "12:15", "12:45"]);
    // earlier that morning his first half hour is free too
    expect(starts(d, { now: "09:00" })).toEqual(["10:15", "11:45", "12:15", "12:45"]);
  });

  it("Altegio's own example: visits from 9:00 and 11:30 add 9:45 and 13:10, the grid stays", () => {
    const d = day({ windows: [span("09:00", "15:00")], busy: [span("09:00", "09:45"), span("11:30", "13:10")] });
    expect(starts(d)).toEqual(["09:45", "10:00", "10:30", "11:00", "13:10", "13:30", "14:00", "14:30"]);
  });

  it("a visit with its tidy-up, or time off: a start where the chair is free again", () => {
    const d = day({ busy: [span("10:15", "10:40"), span("12:00", "12:20")] });
    expect(starts(d)).toEqual(["10:40", "10:45", "11:15", "12:20", "12:45"]);
  });

  it("a start that is on the grid already is there once", () => {
    expect(starts(day({ busy: [span("10:15", "10:45")] }))).toEqual(["10:45", "11:15", "11:45", "12:15", "12:45"]);
  });

  it("a break: a start where it ends, the grid of his day around it", () => {
    const d = day({ windows: [span("10:15", "12:00"), span("13:10", "15:00")] });
    expect(starts(d)).toEqual(["10:15", "10:45", "11:15", "13:10", "13:15", "13:45", "14:15"]);
  });

  it("the visit must fit before the window ends; the step comes from the settings", () => {
    expect(starts(day({ durationMin: 45 }))).toEqual(["10:15", "10:45", "11:15", "11:45", "12:15"]);
    expect(starts(day(), { stepMin: 60 })).toEqual(["10:15", "11:15", "12:15"]);
    expect(starts(day({ durationMin: 0 }))).toEqual([]);
  });
});

describe("special time on the same grid", () => {
  it("inside his hours: a start where each price begins, the grid of his day kept", () => {
    const d = day({ windows: [span("10:15", "15:15")], special: [{ from: at("12:00"), to: at("13:00"), extraCents: 2000 }] });
    expect(freeStartsPriced(d, opts()).map((p) => [hm(p.start), p.extraCents])).toEqual([
      ["10:15", 0],
      ["10:45", 0],
      ["11:15", 0],
      ["12:00", 2000],
      ["12:15", 2000],
      ["13:00", 0],
      ["13:15", 0],
      ["13:45", 0],
      ["14:15", 0],
      ["14:45", 0],
    ]);
  });

  it("before his hours: the grid of his day does not move", () => {
    const d = day({ special: [{ from: at("08:00"), to: at("10:00"), extraCents: 1000 }] });
    expect(starts(d)).toEqual(["08:00", "08:15", "08:45", "09:15", "10:15", "10:45", "11:15", "11:45", "12:15", "12:45"]);
  });

  it("a day of special time only: his day starts with it", () => {
    const d = day({ windows: [], special: [{ from: at("12:10"), to: at("14:00"), extraCents: 0, extraPct: 50 }] });
    expect(freeStartsPriced(d, opts()).map((p) => [hm(p.start), p.extraCents])).toEqual([
      ["12:10", 2000],
      ["12:40", 2000],
      ["13:10", 2000],
    ]);
  });
});

describe("no notice", () => {
  it("nothing in the past: the grid from now rounded up, the end of a visit only while it is ahead", () => {
    const d = day({ busy: [span("10:15", "11:05")] });
    expect(starts(d, { now: "10:50" })).toEqual(["11:05", "11:15", "11:45", "12:15", "12:45"]);
    expect(starts(d, { now: "11:06" })).toEqual(["11:15", "11:45", "12:15", "12:45"]);
    // a start right now is still ahead
    expect(starts(d, { now: "11:15" })).toEqual(["11:15", "11:45", "12:15", "12:45"]);
    expect(starts(d, { now: "13:00" })).toEqual([]);
  });

  it("a notice, where a salon sets one, cuts the same grid", () => {
    const d = day({ busy: [span("10:15", "11:05")] });
    expect(starts(d, { now: "10:50", noticeMin: 30 })).toEqual(["11:45", "12:15", "12:45"]);
  });
});

describe("«anyone»: each barber on his own grid", () => {
  it("the union of their starts; a shared start goes to the one with fewer visits", () => {
    const a = day({ staffId: "a", windows: [span("10:00", "12:00")] });
    const b = day({ staffId: "b", windows: [span("10:15", "12:00")], busy: [span("10:15", "11:00")], bookings: 1, sort: 1 });
    expect(mergeSlots([a, b], opts()).map((s) => [hm(s.start), s.staffIds.join(" ")])).toEqual([
      ["10:00", "a"],
      ["10:30", "a"],
      ["11:00", "a b"],
      ["11:15", "b"],
      ["11:30", "a"],
    ]);
  });
});
