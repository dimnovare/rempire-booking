/**
 * The two dashboards of «Отчёты» (src/lib/admin/dashboards.ts):
 * «Основные показатели» (each figure against the period before, new and
 * lost clients, sales, the fill rate) and «Визиты» (the visits ahead and
 * behind, the feed of bookings). Fake people only, on the demo seed.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  changePct,
  cleanPeriod,
  dashVisitForSheet,
  kpiClients,
  kpiReport,
  listDashVisits,
  listFeed,
  LOST_DAYS,
  periodDays,
  previousPeriod,
} from "@/lib/admin/dashboards";
import type { Holder } from "@/lib/auth/rights";
import { legacyHolder } from "@/lib/auth/rights-store";
import { closeDb, query } from "@/lib/db";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
/** Friday 20 November 2026, 15:00 in Tallinn: the last 30 days are 22.10–20.11, the 30 before them 22.09–21.10. */
const NOW = at("2026-11-20", "15:00");
const MIN = 60_000;

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
  const phone = `+3725550${String(1000 + ++phoneNo)}`;
  return (await query<{ id: string }>("insert into clients (business_id, name, phone_e164, source) values ($1, $2, $3, 'admin') returning id", [demo.business.id, name, phone]))[0].id;
}

async function visit(staff: string, clientId: string, date: string, time: string, min: number, status: string, cents: number, source = "admin"): Promise<string> {
  const start = at(date, time);
  const [row] = await query<{ id: string }>(
    `insert into appointments (business_id, location_id, staff_id, client_id, starts_at, ends_at, blocked_until, status, source, total_cents)
     select $1, s.location_id, s.id, $3, $4, $5, $5, $6, $7, $8 from staff s where s.id = $2 returning id`,
    [demo.business.id, staff, clientId, new Date(start), new Date(start + min * MIN), status, source, cents],
  );
  return row.id;
}

let ref = 0;
async function sale(staff: string, date: string, cents: number, opts: { status?: string; reverses?: string; qty?: number } = {}): Promise<string> {
  const [row] = await query<{ id: string }>(
    `insert into product_sales (business_id, ref, staff_id, mode, shop_product_id, name, qty, unit_cents, list_cents, vat_bp, total_cents, status, reverses_id, sync_status, created_at)
     values ($1, $2, $3, 'client', 'test-product', 'Воск для волос', $4, $5, $5, 2400, $6, $7, $8, 'none', $9) returning id`,
    [demo.business.id, `dash-test-${++ref}-000`, staff, opts.qty ?? 1, cents, cents * (opts.qty ?? 1), opts.status ?? "done", opts.reverses ?? null, new Date(at(date, "12:00"))],
  );
  return row.id;
}

/* ---------- the period ---------- */

describe("the period and the change", () => {
  it("opens on the last 30 days up to today; two days in either order; at most a year", () => {
    expect(cleanPeriod(undefined, undefined, "2026-11-20")).toEqual({ from: "2026-10-22", to: "2026-11-20" });
    expect(cleanPeriod("2026-11-10", "2026-11-01", "2026-11-20")).toEqual({ from: "2026-11-01", to: "2026-11-10" });
    expect(cleanPeriod("2026-11-05", "nope", "2026-11-20")).toEqual({ from: "2026-11-05", to: "2026-11-20" });
    expect(cleanPeriod("2026-02-30", "2026-11-20", "2026-11-20")).toEqual({ from: "2026-10-22", to: "2026-11-20" });
    expect(periodDays(cleanPeriod("2020-01-01", "2026-11-20", "2026-11-20"))).toBe(366);
  });

  it("the period before has the same length and ends the day before", () => {
    expect(previousPeriod({ from: "2026-10-22", to: "2026-11-20" })).toEqual({ from: "2026-09-22", to: "2026-10-21" });
    expect(previousPeriod({ from: "2026-11-20", to: "2026-11-20" })).toEqual({ from: "2026-11-19", to: "2026-11-19" });
  });

  it("the change is in whole per cent; nothing before and nothing now is 0; something now from nothing has no base", () => {
    expect(changePct(81, 88)).toBe(-8);
    expect(changePct(9, 13)).toBe(-31);
    expect(changePct(20, 18)).toBe(11);
    expect(changePct(0, 0)).toBe(0);
    expect(changePct(5, 0)).toBeNull();
    expect(changePct(0, 5)).toBe(-100);
  });
});

/* ---------- «Основные показатели» ---------- */

/**
 * The fixture (22.10–20.11 against 22.09–21.10):
 *   A  first visit ever 02.11 and again 10.11 (Valentin): new;
 *   B  came 25.09 (Valentin, new then) and 05.11 (Jevgeni): not new now;
 *   C  last came 01.08: 61 days later is 01.10, so the period before lost him;
 *   D  last came 01.09: 61 days later is 01.11, so this period lost him;
 *   E  came 10.09 and 15.10: never 60 days away;
 *   F  a visit left waiting (12.11), one cancelled (13.11), a no-show (14.11), one ahead (25.11).
 */
async function fixture() {
  const c = { a: await client("Тест Один"), b: await client("Тест Два"), c: await client("Тест Три"), d: await client("Тест Четыре"), e: await client("Тест Пять"), f: await client("Тест Шесть") };
  await visit(val, c.a, "2026-11-02", "10:00", 60, "done", 3000);
  await visit(val, c.a, "2026-11-10", "10:00", 45, "arrived", 2500);
  await visit(val, c.b, "2026-09-25", "11:00", 60, "done", 2000);
  await visit(jev, c.b, "2026-11-05", "11:00", 60, "done", 3500);
  await visit(val, c.c, "2026-08-01", "12:00", 30, "done", 1800);
  await visit(val, c.d, "2026-09-01", "12:00", 30, "done", 1800);
  await visit(jev, c.e, "2026-09-10", "13:00", 30, "done", 1500);
  await visit(jev, c.e, "2026-10-15", "13:00", 30, "done", 1500);
  await visit(val, c.f, "2026-11-12", "15:00", 60, "booked", 2000);
  await visit(val, c.f, "2026-11-13", "15:00", 60, "cancelled", 2000);
  await visit(val, c.f, "2026-11-14", "15:00", 60, "no_show", 2000);
  await visit(val, c.f, "2026-11-25", "15:00", 60, "booked", 2000);
  // goods: one sale, one undone, one taken back on the next day by a minus row
  await sale(val, "2026-11-03", 2400);
  await sale(val, "2026-11-04", 900, { status: "undone" });
  const back = await sale(jev, "2026-11-06", 1000);
  await sale(jev, "2026-11-07", 1000, { qty: -1, reverses: back });
  return c;
}

const report = async (raw: Parameters<typeof kpiReport>[2] = {}, who?: Holder) => (await kpiReport(query, demo.business, raw, who, NOW))!;

describe("«Посещаемость»", () => {
  it("clients, visits and records, each against the 30 days before", async () => {
    await fixture();
    const r = await report();
    expect(r.period).toEqual({ from: "2026-10-22", to: "2026-11-20" });
    expect(r.prev).toEqual({ from: "2026-09-22", to: "2026-10-21" });
    const A = r.attendance;
    // A twice and B once came; F's three do not count; the one ahead is after the period
    expect(A.visits).toEqual({ cur: 3, prev: 2, change: 50 });
    expect(A.clients).toEqual({ cur: 2, prev: 2, change: 0 });
    // every booking that starts in the period, the cancelled one too
    expect(A.records).toEqual({ cur: 6, prev: 2, change: 200 });
  });

  it("new and not new: a client's first visit ever is in the period, or before it", async () => {
    await fixture();
    const A = (await report()).attendance;
    // now A is new and B is not; before, B was new and E was not
    expect(A.fresh).toEqual({ cur: 1, prev: 1, change: 0 });
    expect(A.regular).toEqual({ cur: 1, prev: 1, change: 0 });
    expect(A.fresh.cur + A.regular.cur).toBe(A.clients.cur);
  });

  it(`lost: the ${LOST_DAYS} days after the last visit ran out inside the period`, async () => {
    await fixture();
    expect((await report()).attendance.lost).toEqual({ cur: 1, prev: 1, change: 0 });
    // a period of one day: 01.11 loses exactly D, 31.10 nobody
    expect((await report({ from: "2026-11-01", to: "2026-11-01" })).attendance.lost.cur).toBe(1);
    expect((await report({ from: "2026-10-31", to: "2026-10-31" })).attendance.lost.cur).toBe(0);
  });

  it("a client who came back is not lost", async () => {
    const c = await fixture();
    await visit(jev, c.d, "2026-10-20", "16:00", 30, "done", 1500);
    const A = (await report()).attendance;
    expect(A.lost.cur).toBe(0);
    // and the visit is in the period before: D is one of its clients, not a new one
    expect(A.clients.prev).toBe(3);
    expect(A.regular.prev).toBe(2);
  });

  it("the chart: per day, new clients under the others", async () => {
    await fixture();
    const days = (await report()).attendance.days;
    expect(days).toHaveLength(30);
    expect(days.find((d) => d.date === "2026-11-02")).toEqual({ date: "2026-11-02", fresh: 1, regular: 0 });
    // A's second visit: he is not new on that day any more
    expect(days.find((d) => d.date === "2026-11-10")).toEqual({ date: "2026-11-10", fresh: 0, regular: 1 });
    expect(days.find((d) => d.date === "2026-11-05")).toEqual({ date: "2026-11-05", fresh: 0, regular: 1 });
    expect(days.reduce((n, d) => n + d.fresh + d.regular, 0)).toBe(3);
  });

  it("«Посмотреть клиентов»: the names behind each card, the latest visit first", async () => {
    const c = await fixture();
    const list = async (kind: string) => (await kpiClients(query, demo.business, { kind }, undefined, NOW))!;
    expect((await list("clients")).rows.map((r) => r.id)).toEqual([c.a, c.b]);
    expect((await list("clients")).rows[0]).toMatchObject({ name: "Тест Один", visits: 2 });
    expect((await list("fresh")).rows.map((r) => r.id)).toEqual([c.a]);
    expect((await list("regular")).rows.map((r) => r.id)).toEqual([c.b]);
    expect((await list("lost")).rows.map((r) => r.id)).toEqual([c.d]);
    expect((await list("lost")).total).toBe(1);
    expect(await kpiClients(query, demo.business, { kind: "nope" }, undefined, NOW)).toBeNull();
  });
});

describe("«Продажи»", () => {
  it("services are the visits the client came to; goods the sales not taken back", async () => {
    await fixture();
    const S = (await report()).sales;
    expect(S.services).toEqual({ cur: 9000, prev: 3500, change: 157 });
    expect(S.servicesOps).toEqual({ cur: 3, prev: 2, change: 50 });
    // 24 € sold; the undone one and the one taken back are not
    expect(S.goods).toEqual({ cur: 2400, prev: 0, change: null });
    expect(S.goodsOps).toEqual({ cur: 1, prev: 0, change: null });
    expect(S.total).toEqual({ cur: 11400, prev: 3500, change: 226 });
    expect(S.totalOps).toEqual({ cur: 4, prev: 2, change: 100 });
  });

  it("the averages: «Итого» per visit, services per operation, goods per sale", async () => {
    await fixture();
    const S = (await report()).sales;
    expect(S.avgVisit).toEqual({ cur: 3800, prev: 1750, change: 117 });
    expect(S.avgService).toEqual({ cur: 3000, prev: 1750, change: 71 });
    expect(S.avgGoods).toEqual({ cur: 2400, prev: 0, change: null });
  });

  it("the chart: each day's services and goods", async () => {
    await fixture();
    const days = (await report()).sales.days;
    expect(days.find((d) => d.date === "2026-11-02")).toEqual({ date: "2026-11-02", servicesCents: 3000, goodsCents: 0 });
    expect(days.find((d) => d.date === "2026-11-03")).toEqual({ date: "2026-11-03", servicesCents: 0, goodsCents: 2400 });
    // the day of the sale that was taken back, and the day of the minus row: nothing
    expect(days.find((d) => d.date === "2026-11-06")?.goodsCents).toBe(0);
    expect(days.find((d) => d.date === "2026-11-07")?.goodsCents).toBe(0);
  });

  it("nothing at all: every figure is 0 and every change 0 %", async () => {
    const r = await report();
    for (const f of [r.sales.total, r.sales.goods, r.sales.avgVisit, r.attendance.clients, r.attendance.lost, r.fill.done, r.fill.avg]) expect(f).toEqual({ cur: 0, prev: 0, change: 0 });
  });
});

describe("«Заполненность»", () => {
  it("done, not done and cancelled, of all the records", async () => {
    await fixture();
    const F = (await report()).fill;
    expect(F.done).toEqual({ cur: 3, prev: 2, change: 50 });
    // the one left waiting and the no-show
    expect(F.open).toEqual({ cur: 2, prev: 0, change: null });
    expect(F.cancelled).toEqual({ cur: 1, prev: 0, change: null });
  });

  it("a day's busy time and no-shows over the working time, less time off; the mean over the days someone works", async () => {
    const g = await client("Тест Семь");
    // Valentin alone (the filter): 14.11 from 10 to 18 with a 2-hour block, 13.11 from 10 to 14
    await query("insert into staff_day_overrides (staff_id, day, intervals) values ($1, '2026-11-14', $2::jsonb), ($1, '2026-11-13', $3::jsonb) on conflict (staff_id, day) do update set intervals = excluded.intervals", [
      val,
      JSON.stringify([["10:00", "18:00"]]),
      JSON.stringify([["10:00", "14:00"]]),
    ]);
    await query("insert into time_off (staff_id, starts_at, ends_at, kind) values ($1, $2, $3, 'block')", [val, new Date(at("2026-11-14", "12:00")), new Date(at("2026-11-14", "14:00"))]);
    await visit(val, g, "2026-11-14", "10:00", 120, "done", 4000);
    await visit(val, g, "2026-11-14", "15:00", 60, "no_show", 2000);
    await visit(val, g, "2026-11-14", "16:00", 60, "cancelled", 2000);
    await visit(val, g, "2026-11-13", "10:00", 30, "booked", 2000);
    // another barber's day is not in Valentin's figures
    await visit(jev, g, "2026-11-14", "10:00", 300, "done", 9000);
    const r = await report({ from: "2026-11-14", to: "2026-11-14", staffId: val });
    expect(r.prev).toEqual({ from: "2026-11-13", to: "2026-11-13" });
    // 480 minutes less the 120 blocked: 360; busy 120 (33.3 %), no-show 60 (16.7 %), the cancelled one nothing
    expect(r.fill.days).toEqual([{ date: "2026-11-14", shiftMin: 360, busyMin: 120, noShowMin: 60, busyPct: 33.3, noShowPct: 16.7 }]);
    // the day before: 30 of 240 minutes, 12.5 %
    expect(r.fill.avg).toEqual({ cur: 33.3, prev: 12.5, change: 166 });
    expect(r.attendance.visits.cur).toBe(1);
  });

  it("a day nobody works has no share and is not in the mean", async () => {
    await query("insert into staff_day_overrides (staff_id, day, intervals) values ($1, '2026-11-15', '[]'::jsonb), ($1, '2026-11-16', $2::jsonb) on conflict (staff_id, day) do update set intervals = excluded.intervals", [val, JSON.stringify([["10:00", "11:00"]])]);
    const g = await client("Тест Восемь");
    await visit(val, g, "2026-11-16", "10:00", 30, "done", 1000);
    const F = (await report({ from: "2026-11-15", to: "2026-11-16", staffId: val })).fill;
    expect(F.days.map((d) => d.busyPct)).toEqual([null, 50]);
    expect(F.avg.cur).toBe(50);
  });
});

describe("whose figures", () => {
  it("the barber of «Фильтры»: his visits, his sales; new and lost by him", async () => {
    const c = await fixture();
    const v = await report({ staffId: val });
    expect(v.staffId).toBe(val);
    expect(v.attendance.visits.cur).toBe(2);
    expect(v.attendance.clients.cur).toBe(1);
    expect(v.sales.goods.cur).toBe(2400);
    const j = await report({ staffId: jev });
    // B's first visit with Jevgeni is this period's
    expect(j.attendance.fresh.cur).toBe(1);
    expect(j.sales.goods.cur).toBe(0);
    expect((await kpiClients(query, demo.business, { kind: "fresh", staffId: jev }, undefined, NOW))!.rows.map((r) => r.id)).toEqual([c.b]);
  });

  it("a login sees only the barbers whose column it sees, and nothing without the right", async () => {
    await fixture();
    const desk = legacyHolder("admin", "desk-login");
    const onlyJev: Holder = { ...desk, rights: { ...desk.rights, values: { ...desk.rights.values, "journal.staff": [jev] } } };
    const r = await report({}, onlyJev);
    expect(r.attendance.visits.cur).toBe(1);
    // a barber it does not see, picked by hand, is nobody
    expect((await report({ staffId: val }, onlyJev)).attendance.records.cur).toBe(0);
    const without: Holder = { ...desk, rights: { ...desk.rights, on: new Set([...desk.rights.on].filter((k) => k !== "reports.dashboard")) } };
    expect(await kpiReport(query, demo.business, {}, without, NOW)).toBeNull();
    expect(await kpiClients(query, demo.business, { kind: "clients" }, without, NOW)).toBeNull();
  });
});

/* ---------- «Визиты» ---------- */

describe("«Визиты»: the visits ahead and behind", () => {
  it("ahead: still to end, the soonest first, cancelled ones left out; behind: the latest first", async () => {
    const g = await client("Тест Девять");
    const now = at("2026-11-20", "12:00");
    const running = await visit(val, g, "2026-11-20", "11:30", 60, "arrived", 2000);
    const next = await visit(jev, g, "2026-11-20", "14:00", 30, "booked", 2000);
    const later = await visit(val, g, "2026-11-23", "10:00", 30, "booked", 2000);
    await visit(val, g, "2026-11-21", "10:00", 30, "cancelled", 2000);
    const before = await visit(val, g, "2026-11-20", "10:00", 60, "done", 2000);
    const earlier = await visit(val, g, "2026-11-19", "10:00", 60, "no_show", 2000);
    const up = await listDashVisits(query, demo.business, { when: "upcoming" }, undefined, now);
    expect(up.rows.map((r) => r.id)).toEqual([running, next, later]);
    expect(up.upcoming).toBe(3);
    expect(up.more).toBe(false);
    expect(up.rows[1]).toMatchObject({ staffName: expect.any(String), clientName: "Тест Девять", status: "booked", confirmed: false, end: up.rows[1].start + 30 * MIN });
    // each listed day as a whole: 20.11 has the one before, the running one and the next (2 came); the cancelled 21.11 is not a day of it
    expect(up.days).toEqual({ "2026-11-20": { visits: 3, came: 2, noShow: 0 }, "2026-11-23": { visits: 1, came: 0, noShow: 0 } });
    const past = await listDashVisits(query, demo.business, { when: "past" }, undefined, now);
    expect(past.rows.map((r) => r.id)).toEqual([before, earlier]);
    expect(past.upcoming).toBe(3);
    expect(past.days).toEqual({ "2026-11-20": { visits: 3, came: 2, noShow: 0 }, "2026-11-19": { visits: 1, came: 0, noShow: 1 } });
    // «Подробнее»: the next ones after the first
    const page = await listDashVisits(query, demo.business, { when: "upcoming", offset: 1, limit: 1 }, undefined, now);
    expect(page.rows.map((r) => r.id)).toEqual([next]);
    expect(page.more).toBe(true);
    // a page's days are whole too, however few of their rows it holds
    expect(page.days).toEqual({ "2026-11-20": { visits: 3, came: 2, noShow: 0 } });
  });

  it("a day's count is in the login's scope: only its barbers' visits", async () => {
    const g = await client("Тест Девять-два");
    await visit(jev, g, "2026-11-21", "10:00", 30, "booked", 2000);
    await visit(val, g, "2026-11-21", "12:00", 30, "booked", 2000);
    await visit(val, g, "2026-11-21", "13:00", 30, "no_show", 2000);
    const desk = legacyHolder("admin", "desk-login");
    const onlyJev: Holder = { ...desk, rights: { ...desk.rights, values: { ...desk.rights.values, "journal.staff": [jev] } } };
    expect((await listDashVisits(query, demo.business, {}, desk, NOW)).days["2026-11-21"]).toEqual({ visits: 3, came: 0, noShow: 1 });
    expect((await listDashVisits(query, demo.business, {}, onlyJev, NOW)).days["2026-11-21"]).toEqual({ visits: 1, came: 0, noShow: 0 });
  });

  it("a phone is whole only with «Показывать номера телефонов в сводке»; nothing without «Визиты»", async () => {
    const g = await client("Тест Десять");
    await visit(val, g, "2026-11-21", "10:00", 30, "booked", 2000);
    const desk = legacyHolder("admin", "desk-login");
    const whole = (await listDashVisits(query, demo.business, {}, desk, NOW)).rows[0].clientPhone;
    expect(whole).toMatch(/^\+3725550\d{4}$/);
    const masked: Holder = { ...desk, rights: { ...desk.rights, on: new Set([...desk.rights.on].filter((k) => k !== "reports.visits.phones")) } };
    expect((await listDashVisits(query, demo.business, {}, masked, NOW)).rows[0].clientPhone).toContain("•");
    const none: Holder = { ...desk, rights: { ...desk.rights, on: new Set([...desk.rights.on].filter((k) => k !== "reports.visits")) } };
    expect(await listDashVisits(query, demo.business, {}, none, NOW)).toEqual({ rows: [], more: false, upcoming: 0, days: {} });
    expect((await listFeed(query, demo.business, {}, none, NOW)).entries).toEqual([]);
  });

  it("a login sees the visits «Записи» would show it: its barbers' columns only, and opens them in the visit window", async () => {
    const g = await client("Тест Одиннадцать");
    const mine = await visit(jev, g, "2026-11-21", "10:00", 30, "booked", 2000);
    const other = await visit(val, g, "2026-11-21", "12:00", 30, "booked", 2000);
    const desk = legacyHolder("admin", "desk-login");
    const onlyJev: Holder = { ...desk, rights: { ...desk.rights, values: { ...desk.rights.values, "journal.staff": [jev] } } };
    expect((await listDashVisits(query, demo.business, {}, onlyJev, NOW)).rows.map((r) => r.id)).toEqual([mine]);
    expect((await dashVisitForSheet(query, demo.business, onlyJev, mine, NOW))?.data.visits[0].id).toBe(mine);
    expect(await dashVisitForSheet(query, demo.business, onlyJev, other, NOW)).toBeNull();
    expect(await dashVisitForSheet(query, demo.business, onlyJev, "not-an-id", NOW)).toBeNull();
  });
});

describe("«Лента активности по записям»", () => {
  const log = (id: string, action: string, when: number, actor: string, before: unknown, after: unknown) =>
    query("insert into audit (at, actor, entity, entity_id, action, before, after) values ($1, $2, 'appointment', $3, $4, $5::jsonb, $6::jsonb)", [new Date(when), actor, id, action, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]);

  it("the latest activity first, with each booking's history; the filters; «новые онлайн»", async () => {
    const g = await client("Тест Двенадцать");
    const online = await visit(val, g, "2026-11-24", "17:15", 45, "booked", 2500, "online");
    const salon = await visit(jev, g, "2026-11-22", "10:00", 30, "booked", 2000);
    const quiet = await visit(jev, g, "2026-11-23", "10:00", 30, "booked", 2000);
    await log(online, "create", at("2026-11-20", "12:01"), "client", null, { staff_id: jev, starts_at: new Date(at("2026-11-24", "16:00")).toISOString() });
    await log(online, "move", at("2026-11-20", "12:13"), "client", { staff_id: jev, starts_at: new Date(at("2026-11-24", "16:00")).toISOString() }, { staff_id: val, starts_at: new Date(at("2026-11-24", "17:15")).toISOString() });
    await log(salon, "create", at("2026-11-20", "12:05"), "admin", null, { staff_id: jev, starts_at: new Date(at("2026-11-22", "10:00")).toISOString() });
    const feed = await listFeed(query, demo.business, { filter: "all" }, undefined, NOW);
    // the quiet one has no history here, so it is not in the feed
    expect(feed.entries.map((e) => e.id)).toEqual([online, salon]);
    expect(feed.entries.map((e) => e.id)).not.toContain(quiet);
    const [e] = feed.entries;
    expect(e.lastAt).toBe(at("2026-11-20", "12:13"));
    expect(e.log.map((l) => l.action)).toEqual(["move", "create"]);
    expect(e.log[0]).toMatchObject({ by: { kind: "client" }, start: at("2026-11-24", "17:15"), fromStart: at("2026-11-24", "16:00"), staffName: expect.any(String), fromStaffName: expect.any(String) });
    expect(e.log[0].staffName).not.toBe(e.log[0].fromStaffName);
    expect(e.log[1]).toMatchObject({ action: "create", start: at("2026-11-24", "16:00"), fromStart: null });
    // the online one is new and not confirmed: «новые онлайн (1)»
    expect(feed.fresh).toBe(1);
    expect((await listFeed(query, demo.business, { filter: "fresh" }, undefined, NOW)).entries.map((x) => x.id)).toEqual([online]);
    expect((await listFeed(query, demo.business, { filter: "online" }, undefined, NOW)).entries.map((x) => x.id)).toEqual([online]);
    expect((await listFeed(query, demo.business, { filter: "offline" }, undefined, NOW)).entries.map((x) => x.id)).toEqual([salon]);
    // once confirmed it is not new any more
    await query("update appointments set confirmed_at = now() where id = $1", [online]);
    expect((await listFeed(query, demo.business, {}, undefined, NOW)).fresh).toBe(0);
  });
});
