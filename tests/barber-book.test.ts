/**
 * Booking from the barber's phone (B3): his services at his prices, the
 * free times in his column, his own clients only, and a book, move or
 * emergency cancel that never leaves his column. Fake people only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addSpecialTime } from "@/lib/admin/staff";
import { adminCreateVisit, type AdminVisitInput } from "@/lib/admin/visits";
import { barberBook, barberCancel, barberFreeStarts, barberMove, barberOffers, isMyClient, searchMyClients, type NewVisitInput } from "@/lib/barber/book";
import { loadBarberDays } from "@/lib/barber/day";
import { freeGaps, startsIn } from "@/lib/barber/gaps";
import { closeDb, query } from "@/lib/db";
import { localParts, zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const hm = (ms: number) => localParts(ms, TZ).time;
// a Tuesday ahead of the real clock, and «now» the day before. Renat works 10:00–19:00 that day
// (tools/altegio-structure.json): a cut takes him 45 minutes, grey hair 30, and he does no beard trim
const DAY = "2026-12-01";
const NOW = at("2026-11-30", "12:00");
const ACTOR = "test-admin";

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});
afterAll(closeDb);

let n = 0;
const visit = (staff: string, time: string, o: Partial<AdminVisitInput> = {}): AdminVisitInput => ({
  staffId: demo.staff[staff],
  start: at(DAY, time),
  serviceIds: [demo.services.clip],
  name: "Test Client",
  phone: `+372 5555 0${600 + ++n}`,
  idempotencyKey: `barber-book-${n}-${Math.random()}`,
  ...o,
});
async function adminBook(staff: string, time: string, o: Partial<AdminVisitInput> = {}) {
  const r = await adminCreateVisit(demo.business, visit(staff, time, o), ACTOR);
  if (!r.ok) throw new Error(`booking failed: ${r.code}`);
  return r;
}
const mine = (o: Partial<NewVisitInput> = {}): NewVisitInput => ({
  start: at(DAY, "15:00"),
  serviceIds: [demo.services.clip],
  name: "Walk In",
  phone: "",
  key: `barber-own-${++n}-${Math.random()}`,
  ...o,
});

describe("free start times", () => {
  it("right after the visit before, then on the step grid; the visit and its tidy-up must fit", () => {
    const gaps = [
      { from: at(DAY, "10:00"), to: at(DAY, "11:00"), extraCents: 0 },
      { from: at(DAY, "11:20"), to: at(DAY, "12:00"), extraCents: 500 },
    ];
    const s = startsIn(gaps, { durationMin: 30, bufferMin: 0, stepMin: 15, baseCents: 4000 });
    expect(s.map((x) => hm(x.start))).toEqual(["10:00", "10:15", "10:30", "11:20", "11:30"]);
    expect(s.map((x) => x.extraCents)).toEqual([0, 0, 0, 500, 500]);
    expect(startsIn(gaps, { durationMin: 30, bufferMin: 10, stepMin: 15, baseCents: 4000 }).map((x) => hm(x.start))).toEqual(["10:00", "10:15", "11:20"]);
    expect(startsIn(gaps, { durationMin: 90, bufferMin: 0, stepMin: 15, baseCents: 4000 })).toEqual([]);
  });

  it("count the grid from his day's start, as the clients' times do (Altegio's «Оптимальный»)", () => {
    const grid = at(DAY, "10:15");
    const at30 = (from: string) =>
      startsIn([{ from: at(DAY, from), to: at(DAY, "12:00"), extraCents: 0, grid }], { durationMin: 30, bufferMin: 0, stepMin: 30, baseCents: 4000 }).map((x) => hm(x.start));
    expect(at30("10:15")).toEqual(["10:15", "10:45", "11:15"]);
    // right after a visit that ended at 10:55: that start, then back on his grid
    expect(at30("10:55")).toEqual(["10:55", "11:15"]);
    // his free time: from the next point of his grid once the day is running; a quarter-hour piece still shows
    const day = { windows: [[at(DAY, "10:15"), at(DAY, "19:00")]] as [number, number][], visits: [], blocks: [], special: [] };
    expect(freeGaps(day, { now: at(DAY, "10:50"), stepMin: 30 }).map((g) => [hm(g.from), hm(g.to), hm(g.grid!)])).toEqual([["11:15", "19:00", "10:15"]]);
    expect(freeGaps({ ...day, windows: [[at(DAY, "10:15"), at(DAY, "10:30")]] }, { now: at(DAY, "09:00"), stepMin: 30 })).toHaveLength(1);
  });

  it("a gap priced in percent gives each start that percent of the visit's price, in money", () => {
    const gaps = [
      { from: at(DAY, "10:00"), to: at(DAY, "10:30"), extraCents: 0, extraPct: 0 },
      { from: at(DAY, "11:00"), to: at(DAY, "11:30"), extraCents: 500, extraPct: 0 },
      { from: at(DAY, "12:00"), to: at(DAY, "12:30"), extraCents: 0, extraPct: 50 },
    ];
    const extras = (baseCents: number) => startsIn(gaps, { durationMin: 30, bufferMin: 0, stepMin: 15, baseCents }).map((x) => x.extraCents);
    expect(extras(4000)).toEqual([0, 500, 2000]);
    expect(extras(6800)).toEqual([0, 500, 3400]);
    expect(extras(3333)).toEqual([0, 500, 1667]);
  });

  it("his free times in a percent window: the amount for these services, the one the booking then writes", async () => {
    // right after his day, which ends at 19:00
    await addSpecialTime(demo.business, { staffId: demo.staff.renat, from: at(DAY, "19:00"), to: at(DAY, "21:00"), extraPct: 50 }, ACTOR);
    // the day itself keeps the window as he set it: free time there is «+50 %», no money yet
    const [day] = await loadBarberDays(query, demo.business, demo.staff.renat, DAY, 1);
    expect(day.special.map((s) => [hm(s.from), hm(s.to), s.extraCents, s.extraPct])).toEqual([["19:00", "21:00", 0, 50]]);
    expect(freeGaps(day, { now: NOW, stepMin: 15 }).map((g) => [hm(g.from), hm(g.to), g.extraCents, g.extraPct])).toEqual([
      ["10:00", "19:00", 0, 0],
      ["19:00", "21:00", 0, 50],
    ]);
    const extraAt = async (serviceIds: string[], time: string) => {
      const r = await barberFreeStarts(query, demo.business, demo.staff.renat, DAY, { serviceIds }, NOW);
      if (!r.ok) throw new Error(r.code);
      return r.starts.find((s) => hm(s.start) === time)?.extraCents;
    };
    // the salon's half-hour step (src/lib/settings.ts)
    expect(await extraAt([demo.services.clip], "18:00")).toBe(0);
    expect(await extraAt([demo.services.clip], "18:30")).toBeUndefined(); // would run into the window
    expect(await extraAt([demo.services.clip], "19:00")).toBe(2000);
    // grey hair is 35 € with him; with the cut 75 €
    expect(await extraAt([demo.services.grey], "19:00")).toBe(1750);
    expect(await extraAt([demo.services.clip, demo.services.grey], "19:00")).toBe(3750);
    const r = await barberBook(demo.business, demo.staff.renat, ACTOR, mine({ start: at(DAY, "19:00"), serviceIds: [demo.services.clip, demo.services.grey] }));
    expect(r).toMatchObject({ ok: true, extraCents: 3750, totalCents: 11250 });
  });

  it("a move into a percent window shows and charges the percent of the visit as it was booked", async () => {
    await addSpecialTime(demo.business, { staffId: demo.staff.renat, from: at(DAY, "20:00"), to: at(DAY, "22:00"), extraPct: 50 }, ACTOR);
    const v = await adminBook("renat", "12:00");
    // his price goes up afterwards; the visit keeps its 40 €
    await query("update staff_services set price_cents = 5000 where staff_id = $1 and service_id = $2", [demo.staff.renat, demo.services.clip]);
    const shown = async (what: { visitId: string } | { serviceIds: string[] }) => {
      const r = await barberFreeStarts(query, demo.business, demo.staff.renat, DAY, what, NOW);
      if (!r.ok) throw new Error(r.code);
      return r.starts.find((s) => hm(s.start) === "20:00")?.extraCents;
    };
    expect(await shown({ visitId: v.id })).toBe(2000);
    expect(await shown({ serviceIds: [demo.services.clip] })).toBe(2500);
    expect(await barberMove(demo.business, demo.staff.renat, ACTOR, v.id, at(DAY, "20:00"))).toMatchObject({ ok: true, extraCents: 2000, totalCents: 6000 });
    // and out again
    expect(await barberMove(demo.business, demo.staff.renat, ACTOR, v.id, at(DAY, "15:00"))).toMatchObject({ ok: true, extraCents: 0, totalCents: 4000 });
  });

  it("his services at his own prices; one he does not do is not there", async () => {
    // his own time for a cut (the others take 60 minutes) and his own price for grey hair (Valentin's is 30 €)
    const renat = await barberOffers(query, demo.business.id, demo.staff.renat);
    expect(renat.find((o) => o.id === demo.services.clip)).toMatchObject({ priceCents: 4000, durationMin: 45 });
    expect(renat.find((o) => o.id === demo.services.grey)).toMatchObject({ priceCents: 3500, durationMin: 30 });
    expect(renat.some((o) => o.id === demo.services.beard)).toBe(false);
    const valentin = await barberOffers(query, demo.business.id, demo.staff.valentin);
    expect(valentin.find((o) => o.id === demo.services.clip)).toMatchObject({ priceCents: 4000, durationMin: 60 });
    expect(valentin.find((o) => o.id === demo.services.grey)?.priceCents).toBe(3000);
  });

  it("the free times of his day go round his visits; another barber's visit is not in his way", async () => {
    await adminBook("renat", "12:00");
    await adminBook("jevgeni", "10:00");
    const r = await barberFreeStarts(query, demo.business, demo.staff.renat, DAY, { serviceIds: [demo.services.clip] }, NOW);
    if (!r.ok) throw new Error(r.code);
    const times = r.starts.map((s) => hm(s.start));
    expect(r.durationMin).toBe(45);
    // every half hour (the salon's step), and right after his visit
    expect(times[0]).toBe("10:00");
    expect(times).toContain("11:00");
    expect(times).not.toContain("11:30");
    expect(times).not.toContain("12:00");
    expect(times).toContain("12:45");
    expect(times.at(-1)).toBe("18:00");
  });

  it("for a move the visit itself is not in the way; someone else's visit is «not found»", async () => {
    const v = await adminBook("renat", "12:00");
    const other = await adminBook("jevgeni", "12:00");
    const r = await barberFreeStarts(query, demo.business, demo.staff.renat, DAY, { visitId: v.id }, NOW);
    expect(r.ok && r.starts.map((s) => hm(s.start))).toContain("12:00");
    expect(await barberFreeStarts(query, demo.business, demo.staff.renat, DAY, { visitId: other.id }, NOW)).toEqual({ ok: false, code: "not_found" });
    expect(await barberFreeStarts(query, demo.business, demo.staff.renat, DAY, { serviceIds: [demo.services.beard] }, NOW)).toEqual({ ok: false, code: "not_offered" });
    expect(await barberFreeStarts(query, demo.business, demo.staff.renat, "1.12.2026", { serviceIds: [demo.services.clip] }, NOW)).toEqual({ ok: false, code: "invalid" });
  });

  it("nothing before now", async () => {
    const r = await barberFreeStarts(query, demo.business, demo.staff.renat, DAY, { serviceIds: [demo.services.clip] }, at(DAY, "14:05"));
    expect(r.ok && hm(r.starts[0].start)).toBe("14:30");
  });
});

describe("his own clients only", () => {
  it("finds a client of his by name or phone, never another barber's", async () => {
    await adminBook("renat", "12:00", { name: "Alpha Test", phone: "+372 5555 0701" });
    await adminBook("jevgeni", "12:00", { name: "Beta Test", phone: "+372 5555 0702" });
    const byName = await searchMyClients(query, demo.business.id, demo.staff.renat, "test");
    expect(byName.map((c) => c.name)).toEqual(["Alpha Test"]);
    expect(byName[0]).toMatchObject({ phone: "+37255550701", visits: 1 });
    expect(await searchMyClients(query, demo.business.id, demo.staff.renat, "5555 0702")).toEqual([]);
    expect((await searchMyClients(query, demo.business.id, demo.staff.jevgeni, "0702")).map((c) => c.name)).toEqual(["Beta Test"]);
  });

  it("a client id from the phone is used only if it is his client", async () => {
    await adminBook("renat", "10:00", { name: "Alpha Test", phone: "+372 5555 0711" });
    await adminBook("jevgeni", "10:00", { name: "Beta Test", phone: "+372 5555 0712" });
    const [alpha] = await searchMyClients(query, demo.business.id, demo.staff.renat, "Alpha");
    const [beta] = await searchMyClients(query, demo.business.id, demo.staff.jevgeni, "Beta");
    expect(await isMyClient(query, demo.business.id, demo.staff.renat, alpha.id)).toBe(true);
    expect(await isMyClient(query, demo.business.id, demo.staff.renat, beta.id)).toBe(false);
    expect(await isMyClient(query, demo.business.id, demo.staff.renat, "not-a-uuid")).toBe(false);

    expect(await barberBook(demo.business, demo.staff.renat, ACTOR, mine({ clientId: beta.id }))).toEqual({ ok: false, code: "invalid", field: "client" });
    const again = await barberBook(demo.business, demo.staff.renat, ACTOR, mine({ clientId: alpha.id, start: at(DAY, "16:00") }));
    expect(again.ok).toBe(true);
  });
});

describe("book, move, cancel: in his column only", () => {
  it("a walk-in goes into his column at his price, with his note", async () => {
    const r = await barberBook(demo.business, demo.staff.renat, ACTOR, mine({ note: "short on top" }));
    if (!r.ok) throw new Error(r.code);
    const [row] = await query<{ staff_id: string; total_cents: number; staff_note: string; reminder_min: number | null }>(
      "select staff_id, total_cents, staff_note, reminder_min from appointments where id = $1",
      [r.id],
    );
    expect(row).toEqual({ staff_id: demo.staff.renat, total_cents: 4000, staff_note: "short on top", reminder_min: null });
    // the same key twice is the same visit (a double tap, a retry)
    const key = `barber-own-twice-${Math.random()}`;
    const a = await barberBook(demo.business, demo.staff.renat, ACTOR, mine({ key, start: at(DAY, "17:00") }));
    const b = await barberBook(demo.business, demo.staff.renat, ACTOR, mine({ key, start: at(DAY, "17:00") }));
    expect(a.ok && b.ok && a.id === b.id).toBe(true);
  });

  it("the admin's rules: no double booking; outside his hours only with the second «yes»", async () => {
    await adminBook("renat", "12:00");
    expect(await barberBook(demo.business, demo.staff.renat, ACTOR, mine({ start: at(DAY, "12:30") }))).toEqual({ ok: false, code: "overlap" });
    const late = mine({ start: at(DAY, "20:30") });
    expect(await barberBook(demo.business, demo.staff.renat, ACTOR, late)).toEqual({ ok: false, code: "outside_hours", field: undefined });
    expect((await barberBook(demo.business, demo.staff.renat, ACTOR, { ...late, force: true })).ok).toBe(true);
    expect(await barberBook(demo.business, demo.staff.renat, ACTOR, mine({ name: "", phone: "" }))).toEqual({ ok: false, code: "invalid", field: "name" });
  });

  it("moves his own visit; another barber's is «not found»", async () => {
    const v = await adminBook("renat", "12:00");
    const other = await adminBook("jevgeni", "12:00");
    const r = await barberMove(demo.business, demo.staff.renat, ACTOR, v.id, at(DAY, "14:00"));
    expect(r.ok && hm(r.start)).toBe("14:00");
    expect(await barberMove(demo.business, demo.staff.renat, ACTOR, other.id, at(DAY, "16:00"))).toEqual({ ok: false, code: "not_found" });
    const [o] = await query<{ starts_at: Date }>("select starts_at from appointments where id = $1", [other.id]);
    expect(hm(new Date(o.starts_at).getTime())).toBe("12:00");
  });

  it("an emergency cancel needs a reason, keeps it in the audit, and only in his column", async () => {
    const v = await adminBook("renat", "12:00");
    const other = await adminBook("jevgeni", "12:00");
    expect(await barberCancel(demo.business, demo.staff.renat, ACTOR, v.id, "  ")).toBe("reason");
    expect(await barberCancel(demo.business, demo.staff.renat, ACTOR, v.id, "ok")).toBe("reason");
    expect(await barberCancel(demo.business, demo.staff.renat, ACTOR, other.id, "заболел")).toBe("not_found");
    expect(await barberCancel(demo.business, demo.staff.renat, ACTOR, v.id, " заболел,   температура ")).toBe("cancelled");
    const [a] = await query<{ after: { reason?: string } }>("select after from audit where entity_id = $1 and action = 'cancel'", [v.id]);
    expect(a.after.reason).toBe("заболел, температура");
    const [o] = await query<{ status: string }>("select status from appointments where id = $1", [other.id]);
    expect(o.status).toBe("booked");
  });
});
