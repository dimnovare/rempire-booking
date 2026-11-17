/**
 * Booking from the barber's phone (B3): his services at his prices, the
 * free times in his column, his own clients only, and a book, move or
 * emergency cancel that never leaves his column. Fake people only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminCreateVisit, type AdminVisitInput } from "@/lib/admin/visits";
import { barberBook, barberCancel, barberFreeStarts, barberMove, barberOffers, isMyClient, searchMyClients, type NewVisitInput } from "@/lib/barber/book";
import { startsIn } from "@/lib/barber/gaps";
import { closeDb, query } from "@/lib/db";
import { localParts, zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const hm = (ms: number) => localParts(ms, TZ).time;
// a Tuesday ahead of the real clock, and «now» the day before
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
    const s = startsIn(gaps, { durationMin: 30, bufferMin: 0, stepMin: 15 });
    expect(s.map((x) => hm(x.start))).toEqual(["10:00", "10:15", "10:30", "11:20", "11:30"]);
    expect(s.map((x) => x.extraCents)).toEqual([0, 0, 0, 500, 500]);
    expect(startsIn(gaps, { durationMin: 30, bufferMin: 10, stepMin: 15 }).map((x) => hm(x.start))).toEqual(["10:00", "10:15", "11:20"]);
    expect(startsIn(gaps, { durationMin: 90, bufferMin: 0, stepMin: 15 })).toEqual([]);
  });

  it("his services at his own prices; one he does not do is not there", async () => {
    const renat = await barberOffers(query, demo.business.id, demo.staff.renat);
    expect(renat.find((o) => o.id === demo.services.clip)).toMatchObject({ priceCents: 4000, durationMin: 45 });
    const milena = await barberOffers(query, demo.business.id, demo.staff.milena);
    expect(milena.some((o) => o.id === demo.services.beard)).toBe(false);
    expect(milena.find((o) => o.id === demo.services.clip)?.priceCents).toBe(3500);
  });

  it("the free times of his day go round his visits; another barber's visit is not in his way", async () => {
    await adminBook("renat", "12:00");
    await adminBook("jevgeni", "10:00");
    const r = await barberFreeStarts(query, demo.business, demo.staff.renat, DAY, { serviceIds: [demo.services.clip] }, NOW);
    if (!r.ok) throw new Error(r.code);
    const times = r.starts.map((s) => hm(s.start));
    expect(r.durationMin).toBe(45);
    expect(times[0]).toBe("10:00");
    expect(times).toContain("11:15");
    expect(times).not.toContain("11:30");
    expect(times).not.toContain("12:00");
    expect(times).toContain("12:45");
    expect(times.at(-1)).toBe("19:15");
  });

  it("for a move the visit itself is not in the way; someone else's visit is «not found»", async () => {
    const v = await adminBook("renat", "12:00");
    const other = await adminBook("jevgeni", "12:00");
    const r = await barberFreeStarts(query, demo.business, demo.staff.renat, DAY, { visitId: v.id }, NOW);
    expect(r.ok && r.starts.map((s) => hm(s.start))).toContain("12:00");
    expect(await barberFreeStarts(query, demo.business, demo.staff.renat, DAY, { visitId: other.id }, NOW)).toEqual({ ok: false, code: "not_found" });
    expect(await barberFreeStarts(query, demo.business, demo.staff.milena, DAY, { serviceIds: [demo.services.beard] }, NOW)).toEqual({ ok: false, code: "not_offered" });
    expect(await barberFreeStarts(query, demo.business, demo.staff.renat, "1.12.2026", { serviceIds: [demo.services.clip] }, NOW)).toEqual({ ok: false, code: "invalid" });
  });

  it("nothing before now", async () => {
    const r = await barberFreeStarts(query, demo.business, demo.staff.renat, DAY, { serviceIds: [demo.services.clip] }, at(DAY, "14:05"));
    expect(r.ok && hm(r.starts[0].start)).toBe("14:15");
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
