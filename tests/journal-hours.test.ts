/**
 * The journal's «Изменить часы на сегодня» (src/app/admin/(app)/journal-hours.tsx): a new start or end for
 * one day keeps the breaks that still lie inside it (keepBreaks, src/lib/admin/schedule-plan.ts), and the
 * day it writes is the one the schedule stores (daySpans). No database: the writing itself is saveDays,
 * tested in schedule.test.ts.
 */
import { describe, expect, it } from "vitest";
import { daySpans, keepBreaks, panelOf } from "@/lib/admin/schedule-plan";

describe("keepBreaks: a day's breaks when its hours change", () => {
  const lunch: [string, string][] = [["13:00", "14:00"]];

  it("a break inside the new day stays", () => {
    expect(keepBreaks(lunch, "09:00", "20:00")).toEqual(lunch);
    expect(daySpans("09:00", "20:00", keepBreaks(lunch, "09:00", "20:00"))).toEqual([
      ["09:00", "13:00"],
      ["14:00", "20:00"],
    ]);
  });

  it("a break the new start or end falls in, or one outside the day, goes: the times chosen are the day", () => {
    expect(keepBreaks(lunch, "13:30", "19:00")).toEqual([]);
    expect(keepBreaks(lunch, "10:00", "13:30")).toEqual([]);
    expect(keepBreaks(lunch, "14:00", "19:00")).toEqual([]);
    expect(keepBreaks(lunch, "10:00", "13:00")).toEqual([]);
    expect(daySpans("13:30", "19:00", keepBreaks(lunch, "13:30", "19:00"))).toEqual([["13:30", "19:00"]]);
  });

  it("several breaks: each is judged alone; the day may end at midnight", () => {
    const two: [string, string][] = [
      ["12:00", "12:30"],
      ["16:00", "16:15"],
    ];
    expect(keepBreaks(two, "12:15", "24:00")).toEqual([["16:00", "16:15"]]);
    expect(keepBreaks(two, "08:00", "24:00")).toEqual(two);
  });

  it("nothing for times that are no times", () => {
    expect(keepBreaks(lunch, "", "19:00")).toEqual([]);
    expect(keepBreaks(lunch, "10:00", "25:00")).toEqual([]);
    expect(keepBreaks([["14:00", "13:00"]], "10:00", "19:00")).toEqual([]);
  });

  it("round trip: the stored day's panel, new hours, and the spans to store", () => {
    const panel = panelOf([
      ["10:00", "13:00"],
      ["14:00", "19:00"],
    ])!;
    expect(panel).toEqual({ from: "10:00", to: "19:00", breaks: lunch });
    expect(daySpans("11:00", "18:00", keepBreaks(panel.breaks, "11:00", "18:00"))).toEqual([
      ["11:00", "13:00"],
      ["14:00", "18:00"],
    ]);
  });
});
