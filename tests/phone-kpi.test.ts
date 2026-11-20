/**
 * «Отчёты» on a phone (src/lib/admin/phone-kpi.ts; Dim, decision round 11):
 * the periods День · Неделя · Месяц · Период, the seven weekday bars, a
 * month against the whole month before, and the rows' figures from
 * «Основные показатели» (dashboards.ts). Fake people only, on the demo seed.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { kpiReport, previousMonth, wholeMonth } from "@/lib/admin/dashboards";
import { bestBar, mondayOf, phoneKpi, phonePeriod, weekdayBars, weekdayOf } from "@/lib/admin/phone-kpi";
import { closeDb, query } from "@/lib/db";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
/** Friday 20 November 2026, 15:00 in Tallinn. */
const NOW = at("2026-11-20", "15:00");
const MIN = 60_000;

describe("the phone's periods", () => {
  it("Monday is 0, Sunday 6; a week starts on its Monday", () => {
    expect(weekdayOf("2026-11-16")).toBe(0);
    expect(weekdayOf("2026-11-20")).toBe(4);
    expect(weekdayOf("2026-11-22")).toBe(6);
    expect(mondayOf("2026-11-22")).toBe("2026-11-16");
    expect(mondayOf("2026-11-16")).toBe("2026-11-16");
    // across a month
    expect(mondayOf("2026-12-02")).toBe("2026-11-30");
  });

  it("a day, its week, its whole month, or two days in either order", () => {
    const today = "2026-11-20";
    expect(phonePeriod("day", "2026-11-03", undefined, today)).toEqual({ from: "2026-11-03", to: "2026-11-03" });
    expect(phonePeriod("day", "nope", undefined, today)).toEqual({ from: today, to: today });
    expect(phonePeriod("week", "2026-11-20", undefined, today)).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(phonePeriod("month", "2026-11-20", undefined, today)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(phonePeriod("month", "2026-02", undefined, today)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(phonePeriod("month", "2028-02-10", undefined, today)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(phonePeriod("range", "2026-11-10", "2026-11-01", today)).toEqual({ from: "2026-11-01", to: "2026-11-10" });
  });

  it("a whole month is compared with the whole month before", () => {
    expect(wholeMonth({ from: "2026-11-01", to: "2026-11-30" })).toBe(true);
    expect(wholeMonth({ from: "2026-11-01", to: "2026-11-29" })).toBe(false);
    expect(wholeMonth({ from: "2026-10-02", to: "2026-11-01" })).toBe(false);
    expect(previousMonth({ from: "2026-11-01", to: "2026-11-30" })).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(previousMonth({ from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(previousMonth({ from: "2026-01-01", to: "2026-01-31" })).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("seven bars, each the sum of its weekday; the best one, or none when all are empty", () => {
    const bars = weekdayBars([
      { date: "2026-11-02", cents: 3000 },
      { date: "2026-11-09", cents: 1000 },
      { date: "2026-11-10", cents: 2500 },
    ]);
    expect(bars.map((b) => b.cents)).toEqual([4000, 2500, 0, 0, 0, 0, 0]);
    expect(bestBar(bars)).toBe(0);
    expect(bestBar(weekdayBars([]))).toBe(-1);
  });
});

describe("the phone's figures", () => {
  let demo: Demo;
  let val: string;
  let jev: string;
  beforeEach(async () => {
    demo = await freshDemo();
    val = demo.staff.valentin;
    jev = demo.staff.jevgeni;
  });
  afterAll(closeDb);

  let phoneNo = 0;
  async function client(name: string): Promise<string> {
    const phone = `+3725551${String(1000 + ++phoneNo)}`;
    return (await query<{ id: string }>("insert into clients (business_id, name, phone_e164, source) values ($1, $2, $3, 'admin') returning id", [demo.business.id, name, phone]))[0].id;
  }
  async function visit(staff: string, clientId: string, date: string, time: string, min: number, status: string, cents: number, source = "admin") {
    const start = at(date, time);
    await query(
      `insert into appointments (business_id, location_id, staff_id, client_id, starts_at, ends_at, blocked_until, status, source, total_cents)
       select $1, s.location_id, s.id, $3, $4, $5, $5, $6, $7, $8 from staff s where s.id = $2`,
      [demo.business.id, staff, clientId, new Date(start), new Date(start + min * MIN), status, source, cents],
    );
  }
  /** November: two visits he came to (one made online), a no-show made online, a cancel. October: two, the first on the 1st. */
  async function fixture() {
    const a = await client("Тест Телефон");
    await visit(val, a, "2026-11-02", "10:00", 60, "done", 3000);
    await visit(val, a, "2026-11-10", "10:00", 45, "arrived", 2500, "online");
    await visit(val, a, "2026-11-14", "15:00", 60, "no_show", 2000, "online");
    await visit(jev, a, "2026-11-13", "15:00", 60, "cancelled", 2000);
    await visit(val, a, "2026-10-01", "12:00", 30, "done", 1000);
    await visit(jev, a, "2026-10-15", "12:00", 30, "done", 4000);
  }

  it("«Записи / Онлайн» and «Не пришли» are figures of «Основные показатели» too", async () => {
    await fixture();
    const r = (await kpiReport(query, demo.business, { from: "2026-11-01", to: "2026-11-30" }, undefined, NOW))!;
    expect(r.attendance.records.cur).toBe(4);
    expect(r.attendance.online.cur).toBe(2);
    expect(r.fill.noShow.cur).toBe(1);
    expect(r.fill.cancelled.cur).toBe(1);
    // the same 30 days compare with the 30 before, which leave out 1 October
    expect(r.prev).toEqual({ from: "2026-10-02", to: "2026-10-31" });
    // a whole month asks for the whole month before
    const m = (await kpiReport(query, demo.business, { from: "2026-11-01", to: "2026-11-30", compare: "month" }, undefined, NOW))!;
    expect(m.prev).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("«Месяц»: November against October, the rows, the bars", async () => {
    await fixture();
    const k = (await phoneKpi(query, demo.business, { per: "month", at: "2026-11-20" }, undefined, NOW))!;
    expect(k.period).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(k.prev).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(k.revenue).toEqual({ cur: 5500, prev: 5000, change: 10 });
    expect(k.clients).toBe(1);
    expect(k.avgCents).toBe(2750);
    expect(k.records).toBe(4);
    expect(k.onlinePct).toBe(50);
    expect(k.noShows).toBe(1);
    expect(k.cancelled).toBe(1);
    expect(k.goods).toBe(0);
    // 2 November is a Monday, 10 November a Tuesday: the Monday is the best
    expect(k.bars.map((b) => b.cents)).toEqual([3000, 2500, 0, 0, 0, 0, 0]);
    expect(k.lit).toBe(0);
    expect(k.loadPct === null || (k.loadPct >= 0 && k.loadPct <= 100)).toBe(true);
  });

  it("«День»: the bars are its week, the day itself yellow; the change is against the day before", async () => {
    await fixture();
    const k = (await phoneKpi(query, demo.business, { per: "day", at: "2026-11-10" }, undefined, NOW))!;
    expect(k.period).toEqual({ from: "2026-11-10", to: "2026-11-10" });
    expect(k.prev).toEqual({ from: "2026-11-09", to: "2026-11-09" });
    expect(k.revenue.cur).toBe(2500);
    expect(k.bars.map((b) => b.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(k.bars.map((b) => b.cents)).toEqual([0, 2500, 0, 0, 0, 0, 0]);
    expect(k.lit).toBe(1);
  });

  it("«Неделя» and one barber; nothing, and the bars are all grey", async () => {
    await fixture();
    const week = (await phoneKpi(query, demo.business, { per: "week", at: "2026-11-12" }, undefined, NOW))!;
    expect(week.period).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(week.revenue.cur).toBe(2500);
    const jevOnly = (await phoneKpi(query, demo.business, { per: "month", at: "2026-11", staffId: jev }, undefined, NOW))!;
    expect(jevOnly.staffId).toBe(jev);
    expect(jevOnly.revenue).toEqual({ cur: 0, prev: 4000, change: -100 });
    expect(jevOnly.cancelled).toBe(1);
    expect(jevOnly.lit).toBe(-1);
    // a kind of period it does not know is a month
    expect((await phoneKpi(query, demo.business, { per: "year" }, undefined, NOW))!.per).toBe("month");
  });
});
