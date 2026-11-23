/**
 * The barber's own day and week (B2): only his column leaves the database,
 * the free time, the money, and a status change scoped to his own visits.
 * Fake people only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { weekStart } from "@/lib/admin/grid";
import { adminCreateVisit, adminSetStatus, addTimeOff, type AdminVisitInput } from "@/lib/admin/visits";
import { loadBarberDays } from "@/lib/barber/day";
import { coversDay, freeGaps, hoursText, nextVisit } from "@/lib/barber/gaps";
import { closeDb, query } from "@/lib/db";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";
import { demoWorkday, seedDemoVisits } from "../tools/seed-demo.mjs";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
// Tuesday 17.11.2026 in the salon's own schedule (tools/altegio-structure.json): Renat works 10:00–19:00
const TUE = "2026-11-17";
const ACTOR = "test-admin";
const MIN = 60_000;

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});
afterAll(closeDb);

let n = 0;
const visit = (staff: string, time: string, o: Partial<AdminVisitInput> = {}): AdminVisitInput => ({
  staffId: demo.staff[staff],
  start: at(TUE, time),
  serviceIds: [demo.services.clip],
  name: "Test Client",
  phone: `+372 5555 0${300 + ++n}`,
  smsReminder: true,
  idempotencyKey: `barber-day-${n}-${Math.random()}`,
  ...o,
});

async function book(staff: string, time: string, o: Partial<AdminVisitInput> = {}) {
  const r = await adminCreateVisit(demo.business, visit(staff, time, o), ACTOR);
  if (!r.ok) throw new Error(`booking failed: ${r.code}`);
  return r;
}

describe("barber day: his own column only", () => {
  it("loads his visits, blocks and hours, never another barber's", async () => {
    const mine = await book("renat", "12:00");
    await book("jevgeni", "12:00");
    await book("jevgeni", "15:00");
    await addTimeOff(demo.business, { staffId: demo.staff.jevgeni, from: at(TUE, "13:00"), to: at(TUE, "14:00"), kind: "block" }, ACTOR);
    await addTimeOff(demo.business, { staffId: demo.staff.renat, from: at(TUE, "16:00"), to: at(TUE, "16:30"), kind: "block", note: "coffee" }, ACTOR);

    const [day] = await loadBarberDays(query, demo.business, demo.staff.renat, TUE, 1);
    expect(day.date).toBe(TUE);
    expect(day.visits.map((v) => v.id)).toEqual([mine.id]);
    expect(day.visits[0]).toMatchObject({ clientName: "Test Client", status: "booked", source: "admin", totalCents: mine.totalCents });
    expect(day.visits[0].clientPhone).toMatch(/^\+3725555/);
    expect(day.visits[0].services).toHaveLength(1);
    expect(day.blocks).toEqual([expect.objectContaining({ kind: "block", note: "coffee" })]);
    expect(hoursText(day.windows, TZ)).toBe("10:00–19:00");
    expect(day.count).toBe(1);
    expect(day.totalCents).toBe(mine.totalCents);
  });

  it("a week is seven days from Monday, a cancelled visit is left out, a no-show is not money", async () => {
    const a = await book("renat", "10:00");
    const b = await book("renat", "11:00");
    const c = await book("renat", "12:00");
    await query("update appointments set status = 'cancelled' where id = $1", [b.id]);
    expect(await adminSetStatus(demo.business, c.id, "no_show", ACTOR)).toBe(true);
    const days = await loadBarberDays(query, demo.business, demo.staff.renat, weekStart(TUE), 7);
    expect(days.map((d) => d.date)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    const tue = days[1];
    expect(tue.visits.map((v) => v.id)).toEqual([a.id, c.id]);
    expect(tue.count).toBe(1);
    expect(tue.totalCents).toBe(a.totalCents);
    // Sunday: no hours in the demo
    expect(days[6].windows).toEqual([]);
  });

  it("a vacation over the whole day shows as that, not as a block in the timeline", async () => {
    await addTimeOff(demo.business, { staffId: demo.staff.renat, from: at("2026-11-16", "00:00"), to: at("2026-11-19", "00:00"), kind: "vacation" }, ACTOR);
    const [day] = await loadBarberDays(query, demo.business, demo.staff.renat, TUE, 1);
    expect(day.blocks).toHaveLength(1);
    expect(coversDay(day.blocks[0], TUE, TZ)).toBe(true);
    expect(freeGaps(day, { now: at("2026-11-01", "00:00"), stepMin: 15 })).toEqual([]);
  });
});

describe("barber day: free time and the next client", () => {
  it("is the hours minus visits (with their tidy-up) and blocks, from now on", async () => {
    const v = await book("renat", "12:00");
    await addTimeOff(demo.business, { staffId: demo.staff.renat, from: at(TUE, "14:00"), to: at(TUE, "15:00"), kind: "block" }, ACTOR);
    const [day] = await loadBarberDays(query, demo.business, demo.staff.renat, TUE, 1);
    const blockedUntil = day.visits[0].blockedUntil;
    expect(blockedUntil).toBeGreaterThanOrEqual(v.end);

    const early = freeGaps(day, { now: at(TUE, "08:00"), stepMin: 15 });
    expect(early.map((g) => [g.from, g.to])).toEqual([
      [at(TUE, "10:00"), at(TUE, "12:00")],
      [blockedUntil, at(TUE, "14:00")],
      [at(TUE, "15:00"), at(TUE, "19:00")],
    ]);
    // at 16:07 only what is still ahead, on the step grid
    const late = freeGaps(day, { now: at(TUE, "16:07"), stepMin: 15 });
    expect(late.map((g) => [g.from, g.to])).toEqual([[at(TUE, "16:15"), at(TUE, "19:00")]]);
  });

  it("puts the client in the chair first, then the next one", async () => {
    const a = await book("renat", "12:00");
    const b = await book("renat", "13:00");
    const [day] = await loadBarberDays(query, demo.business, demo.staff.renat, TUE, 1);
    expect(nextVisit(day.visits, at(TUE, "11:00"))?.id).toBe(a.id);
    expect(nextVisit(day.visits, at(TUE, "12:30"))?.id).toBe(a.id);
    expect(nextVisit(day.visits, a.end + MIN)?.id).toBe(b.id);
    expect(nextVisit(day.visits, at(TUE, "19:00"))).toBeNull();
  });
});

describe("status from the barber app", () => {
  it("changes his own visit and refuses another barber's, whatever id the phone sends", async () => {
    const mine = await book("renat", "12:00");
    const theirs = await book("jevgeni", "12:00");
    const scope = { onlyStaffId: demo.staff.renat };
    expect(await adminSetStatus(demo.business, mine.id, "arrived", ACTOR, scope)).toBe(true);
    expect(await adminSetStatus(demo.business, theirs.id, "arrived", ACTOR, scope)).toBe(false);
    const rows = await query<{ id: string; status: string }>("select id, status from appointments where id = any($1::uuid[])", [[mine.id, theirs.id]]);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({ [mine.id]: "arrived", [theirs.id]: "booked" });
  });
});

describe("the demo day (a local run and e2e, tools/seed-demo.mjs)", () => {
  const db = { query: async (sql: string, params?: unknown[]) => ({ rows: await query(sql, params) }) };
  // 09:22, 10:32, 13:22: the client in 20 minutes would sit on the next
  // demo visit (10:00, 11:15, 14:00), which is itself more than 30 minutes
  // away; at 10:32 and 13:57 he sits on two of them
  for (const time of ["07:00", "09:22", "09:35", "10:32", "10:40", "13:22", "13:57", "16:57"]) {
    it(`started at ${time}: «Дальше» is at most 30 minutes away, so «Пришёл» shows; nothing overlaps`, async () => {
      const now = at(TUE, time);
      await seedDemoVisits(db, now);
      for (const slug of ["valentin", "jevgeni"]) {
        const [day] = await loadBarberDays(query, demo.business, demo.staff[slug], TUE, 1);
        const next = nextVisit(day.visits, now);
        expect(next && next.start - now).toBeLessThanOrEqual(30 * MIN);
        const live = day.visits.filter((v) => v.status !== "cancelled").sort((a, b) => a.start - b.start);
        for (let i = 1; i < live.length; i++) expect(live[i].start).toBeGreaterThanOrEqual(live[i - 1].blockedUntil);
        expect(live.length).toBeGreaterThanOrEqual(4);
      }
    });
  }

  it("started at 23:45: no client «in 20 minutes» after midnight, on the next day whose five demo visits the tests count", async () => {
    await seedDemoVisits(db, at(TUE, "23:45"));
    for (const slug of ["renat", "jevgeni"]) {
      const date = demoWorkday(slug, "2026-11-18");
      expect(date, slug).toBe("2026-11-18");
      const [day] = await loadBarberDays(query, demo.business, demo.staff[slug], date, 1);
      expect(day.visits, slug).toHaveLength(5);
      expect(day.visits[0].start, slug).toBe(at(date, "10:00"));
    }
  });

  it("the second demo day is the next day the barber works, whatever the weekday: five visits and lunch inside his hours, two hours free after them", async () => {
    // Valentin is away 17–23.11 and back on Tuesday 24.11; Jevgeni's next day is Wednesday 18.11, 10:00–16:00;
    // Milena works Mondays, Thursdays and Fridays
    for (const [slug, date] of [["valentin", "2026-11-24"], ["jevgeni", "2026-11-18"], ["milena", "2026-11-19"], ["renat", "2026-11-18"]] as const) {
      expect(demoWorkday(slug, "2026-11-18"), slug).toBe(date);
    }
    await seedDemoVisits(db, at(TUE, "07:00"));
    for (const slug of ["renat", "valentin", "jevgeni", "slava", "milena"]) {
      const date = demoWorkday(slug, "2026-11-18");
      const [day] = await loadBarberDays(query, demo.business, demo.staff[slug], date, 1);
      expect(day.windows, slug).toHaveLength(1);
      const [from, to] = day.windows[0];
      expect(day.visits.map((v) => v.status), slug).toEqual(["booked", "booked", "booked", "booked", "booked"]);
      expect(day.visits[0].start, slug).toBe(at(date, "10:00"));
      // the first visit is a cut; 15 minutes after it, too short for any of his services, comes the second
      expect(day.visits[0].services.map((s) => s.serviceId)).toEqual([demo.services.clip]);
      expect(day.visits[1].start - day.visits[0].blockedUntil, slug).toBe(15 * MIN);
      for (const v of day.visits) expect(v.start >= from && v.blockedUntil <= to, `${slug} ${v.start}`).toBe(true);
      expect(day.blocks.map((b) => [b.from, b.to, b.note]), slug).toEqual([[at(date, "13:00"), at(date, "14:00"), "обед"]]);
      const gaps = freeGaps(day, { now: at(TUE, "07:00"), stepMin: 15 });
      const last = gaps.at(-1)!;
      expect(last.to, slug).toBe(to);
      // Jevgeni's Wednesday ends at 16:00, the shortest shift there is: half an hour is left; everywhere else two hours and more
      expect(last.to - last.from, slug).toBeGreaterThanOrEqual((slug === "jevgeni" ? 30 : 120) * MIN);
    }
  });
});
