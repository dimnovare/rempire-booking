import { describe, expect, it } from "vitest";
import { addDays, isLocalDate, isoWeekday, localParts, offsetMinutes, startOfDay, zonedToUtc } from "@/lib/tz";

const TZ = "Europe/Tallinn";
const iso = (ms: number) => new Date(ms).toISOString();

describe("tz", () => {
  it("knows Tallinn's two offsets", () => {
    expect(offsetMinutes(Date.parse("2026-01-15T12:00:00Z"), TZ)).toBe(120);
    expect(offsetMinutes(Date.parse("2026-07-15T12:00:00Z"), TZ)).toBe(180);
  });

  it("converts an ordinary working hour", () => {
    expect(iso(zonedToUtc("2026-11-17", "10:00", TZ))).toBe("2026-11-17T08:00:00.000Z");
    expect(iso(zonedToUtc("2026-06-01", "10:00", TZ))).toBe("2026-06-01T07:00:00.000Z");
  });

  it("spring day 29.03.2026: 23 hours, working hours still right", () => {
    expect(iso(zonedToUtc("2026-03-28", "10:00", TZ))).toBe("2026-03-28T08:00:00.000Z");
    expect(iso(zonedToUtc("2026-03-29", "10:00", TZ))).toBe("2026-03-29T07:00:00.000Z");
    expect(iso(zonedToUtc("2026-03-29", "02:59", TZ))).toBe("2026-03-29T00:59:00.000Z");
    expect(iso(zonedToUtc("2026-03-29", "04:00", TZ))).toBe("2026-03-29T01:00:00.000Z");
    // 03:30 does not exist; it reads forward to 04:30
    expect(iso(zonedToUtc("2026-03-29", "03:30", TZ))).toBe("2026-03-29T01:30:00.000Z");
    expect(startOfDay("2026-03-30", TZ) - startOfDay("2026-03-29", TZ)).toBe(23 * 3_600_000);
  });

  it("autumn day 25.10.2026: 25 hours, the doubled hour is the first one", () => {
    expect(iso(zonedToUtc("2026-10-24", "10:00", TZ))).toBe("2026-10-24T07:00:00.000Z");
    expect(iso(zonedToUtc("2026-10-25", "10:00", TZ))).toBe("2026-10-25T08:00:00.000Z");
    expect(iso(zonedToUtc("2026-10-25", "03:30", TZ))).toBe("2026-10-25T00:30:00.000Z");
    expect(startOfDay("2026-10-26", TZ) - startOfDay("2026-10-25", TZ)).toBe(25 * 3_600_000);
  });

  it("reads a moment back as wall-clock time", () => {
    expect(localParts(Date.parse("2026-03-29T07:00:00Z"), TZ)).toEqual({ date: "2026-03-29", time: "10:00", weekday: 7, minutes: 600 });
    expect(localParts(Date.parse("2026-11-16T22:30:00Z"), TZ).date).toBe("2026-11-17");
  });

  it("does calendar maths without a zone", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(isoWeekday("2026-11-16")).toBe(1);
    expect(isoWeekday("2026-11-22")).toBe(7);
    expect(isLocalDate("2026-02-30")).toBe(false);
    expect(isLocalDate("2026-02-28")).toBe(true);
  });
});
