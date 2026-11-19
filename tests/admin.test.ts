import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadAvailability } from "@/lib/availability";
import { loadCalendar, searchClients } from "@/lib/admin/calendar";
import { gridBounds, hhmm, momentAt, snap, weekStart } from "@/lib/admin/grid";
import { listServices, saveService } from "@/lib/admin/services";
import { PHOTO_MAX_BYTES, addSpecialTime, cleanSpans, imageMime, listStaff, saveStaffOffers, saveStaffPhoto, saveStaffProfile, saveWeeklyHours, setDayOverride, slugify, staffDetail, staffPhoto } from "@/lib/admin/staff";
import { adminCancelVisit, adminCreateVisit, adminSetStatus, adminUpdateVisit, addTimeOff, removeTimeOff, type AdminVisitInput } from "@/lib/admin/visits";
import { closeDb, query } from "@/lib/db";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const NOW = at("2026-11-16", "10:00");
// Tuesday 17.11.2026, as in the salon's own schedule (tools/altegio-structure.json): Renat and
// Jevgeni 10:00–19:00, Slava 10:00–18:30; Valentin and Milena are off
const TUE = "2026-11-17";
const ACTOR = "test-admin";

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});
afterAll(closeDb);

let n = 0;
const visit = (o: Partial<AdminVisitInput> & { staff?: string; services?: string[]; time?: string; date?: string } = {}): AdminVisitInput => ({
  staffId: o.staffId ?? demo.staff[o.staff ?? "renat"],
  start: o.start ?? at(o.date ?? TUE, o.time ?? "12:00"),
  serviceIds: (o.services ?? ["clip"]).map((s) => demo.services[s]),
  clientId: o.clientId ?? null,
  name: o.name === undefined ? "Walk In" : o.name,
  phone: o.phone === undefined ? "+372 5555 0201" : o.phone,
  smsReminder: o.smsReminder ?? true,
  idempotencyKey: o.idempotencyKey ?? `admin-key-${++n}-${Math.random()}`,
  force: o.force,
});

describe("admin: new visit", () => {
  it("books inside the hours at the barber's own price, from the admin", async () => {
    // Renat's own: 35 € for grey hair (the service's price is 30 €), 45 minutes for a cut (the others take 60)
    const r = await adminCreateVisit(demo.business, visit({ services: ["grey"] }), ACTOR);
    expect(r).toMatchObject({ ok: true, totalCents: 3500, extraCents: 0 });
    if (!r.ok) return;
    expect(r.end - r.start).toBe(30 * 60_000);
    const cut = await adminCreateVisit(demo.business, visit({ time: "14:00", phone: "+372 5555 0203" }), ACTOR);
    expect(cut).toMatchObject({ ok: true, totalCents: 4000, extraCents: 0 });
    expect(cut.ok && cut.end - cut.start).toBe(45 * 60_000);
    const [a] = await query<{ source: string; status: string; reminder_min: number | null; manage_token_hash: string | null }>(
      "select source, status, reminder_min, manage_token_hash from appointments where id = $1",
      [r.id],
    );
    expect(a).toEqual({ source: "admin", status: "booked", reminder_min: 120, manage_token_hash: null });
    const [log] = await query<{ actor: string; action: string }>("select actor, action from audit where entity_id = $1", [r.id]);
    expect(log).toEqual({ actor: ACTOR, action: "create" });
  });

  it("never puts two visits on one chair", async () => {
    expect((await adminCreateVisit(demo.business, visit({ time: "12:00" }), ACTOR)).ok).toBe(true);
    expect(await adminCreateVisit(demo.business, visit({ time: "12:30", phone: "+372 5555 0202" }), ACTOR)).toEqual({ ok: false, code: "overlap" });
    // even when forced
    expect(await adminCreateVisit(demo.business, visit({ time: "12:30", force: true }), ACTOR)).toEqual({ ok: false, code: "overlap" });
    // right after is fine
    expect((await adminCreateVisit(demo.business, visit({ time: "12:45" }), ACTOR)).ok).toBe(true);
  });

  it("asks before booking outside the hours, then books when told to", async () => {
    expect(await adminCreateVisit(demo.business, visit({ time: "20:30" }), ACTOR)).toEqual({ ok: false, code: "outside_hours" });
    // his day ends at 19:00: a cut from 18:45 would run past it
    expect(await adminCreateVisit(demo.business, visit({ time: "18:45" }), ACTOR)).toEqual({ ok: false, code: "outside_hours" });
    expect((await adminCreateVisit(demo.business, visit({ time: "20:30", force: true }), ACTOR)).ok).toBe(true);
  });

  it("asks before booking over blocked time", async () => {
    const b = await addTimeOff(demo.business, { staffId: demo.staff.renat, from: at(TUE, "13:00"), to: at(TUE, "14:00"), kind: "block", note: "lunch" }, ACTOR);
    expect(b).toMatchObject({ ok: true, visitsInside: 0 });
    expect(await adminCreateVisit(demo.business, visit({ time: "12:30" }), ACTOR)).toEqual({ ok: false, code: "time_off" });
    expect((await adminCreateVisit(demo.business, visit({ time: "12:30", force: true }), ACTOR)).ok).toBe(true);
    // the client flow no longer offers 13:00
    const look = await loadAvailability(query, { business: demo.business, serviceIds: [demo.services.clip], staffId: demo.staff.renat, from: TUE, days: 1, now: NOW });
    expect(look.days[0].slots.map((s) => s.start)).not.toContain(at(TUE, "13:00"));
  });

  it("books a lunch break away and back again", async () => {
    const b = await addTimeOff(demo.business, { staffId: demo.staff.renat, from: at(TUE, "13:00"), to: at(TUE, "14:00"), kind: "block" }, ACTOR);
    if (!b.ok) throw new Error("no block");
    expect(await removeTimeOff(demo.business, b.id, ACTOR)).toBe(true);
    expect((await adminCreateVisit(demo.business, visit({ time: "13:00" }), ACTOR)).ok).toBe(true);
  });

  it("a double tap books once", async () => {
    const v = visit({ idempotencyKey: "same-tap-0123456789" });
    const a = await adminCreateVisit(demo.business, v, ACTOR);
    const b = await adminCreateVisit(demo.business, v, ACTOR);
    expect(a.ok && b.ok && a.id === b.id).toBe(true);
    expect(b).toMatchObject({ replay: true });
  });

  it("takes a walk-in with a name and no phone, and finds a known client by phone", async () => {
    const w = await adminCreateVisit(demo.business, visit({ phone: null, name: "Walk-in", smsReminder: true }), ACTOR);
    expect(w.ok).toBe(true);
    const [c] = await query<{ phone_e164: string | null; reminder_min: number | null }>(
      "select c.phone_e164, a.reminder_min from appointments a join clients c on c.id = a.client_id where a.id = $1",
      [w.ok ? w.id : ""],
    );
    expect(c).toEqual({ phone_e164: null, reminder_min: null });

    await adminCreateVisit(demo.business, visit({ time: "14:00", phone: "5555 0301", name: "Known" }), ACTOR);
    await adminCreateVisit(demo.business, visit({ time: "16:00", phone: "+3725555 0301", name: "Other name" }), ACTOR);
    const rows = await query<{ name: string }>("select name from clients where phone_e164 = '+37255550301'");
    expect(rows).toEqual([{ name: "Known" }]);
    expect(await adminCreateVisit(demo.business, visit({ phone: "12", name: "" }), ACTOR)).toMatchObject({ ok: false, field: "phone" });
    expect(await adminCreateVisit(demo.business, visit({ phone: null, name: "" }), ACTOR)).toMatchObject({ ok: false, field: "name" });
  });

  it("a visit that starts in special time carries that window's extra", async () => {
    await addSpecialTime(demo.business, { staffId: demo.staff.valentin, from: at(TUE, "20:00"), to: at(TUE, "22:00"), extraCents: 2000 }, ACTOR);
    const r = await adminCreateVisit(demo.business, visit({ staff: "valentin", time: "20:00" }), ACTOR);
    expect(r).toMatchObject({ ok: true, extraCents: 2000, totalCents: 6000 });
  });

  it("refuses a service the barber does not do", async () => {
    expect(await adminCreateVisit(demo.business, visit({ staff: "renat", services: ["beard"] }), ACTOR)).toMatchObject({ ok: false, code: "not_offered" });
  });
});

describe("admin: move, edit, cancel, status", () => {
  it("moves a visit to a free time, keeping its services and price", async () => {
    const r = await adminCreateVisit(demo.business, visit({ time: "12:00" }), ACTOR);
    if (!r.ok) throw new Error("not booked");
    const m = await adminUpdateVisit(demo.business, r.id, { start: at(TUE, "15:00") }, ACTOR);
    expect(m).toMatchObject({ ok: true, start: at(TUE, "15:00"), totalCents: 4000 });
    const [log] = await query<{ action: string }>("select action from audit where entity_id = $1 order by id desc limit 1", [r.id]);
    expect(log.action).toBe("move");
  });

  it("refuses a move onto another visit, asks for one outside the hours", async () => {
    const a = await adminCreateVisit(demo.business, visit({ time: "12:00" }), ACTOR);
    const b = await adminCreateVisit(demo.business, visit({ time: "14:00", phone: "+372 5555 0209" }), ACTOR);
    if (!a.ok || !b.ok) throw new Error("not booked");
    expect(await adminUpdateVisit(demo.business, b.id, { start: at(TUE, "12:30") }, ACTOR)).toEqual({ ok: false, code: "overlap" });
    expect(await adminUpdateVisit(demo.business, b.id, { start: at(TUE, "21:00") }, ACTOR)).toEqual({ ok: false, code: "outside_hours" });
    expect((await adminUpdateVisit(demo.business, b.id, { start: at(TUE, "21:00"), force: true }, ACTOR)).ok).toBe(true);
    // a visit may move by a few minutes over its own old place
    expect((await adminUpdateVisit(demo.business, a.id, { start: at(TUE, "12:15") }, ACTOR)).ok).toBe(true);
  });

  it("moving to another barber takes his price and time", async () => {
    const r = await adminCreateVisit(demo.business, visit({ time: "12:00" }), ACTOR);
    if (!r.ok) throw new Error("not booked");
    // his time: Renat cuts in 45 minutes, Jevgeni in 60, both for 40 €
    expect(r.end - r.start).toBe(45 * 60_000);
    const m = await adminUpdateVisit(demo.business, r.id, { staffId: demo.staff.jevgeni }, ACTOR);
    expect(m).toMatchObject({ ok: true, totalCents: 4000 });
    expect(m.ok && m.end - m.start).toBe(60 * 60_000);
    const [row] = await query<{ staff_id: string }>("select staff_id from appointments where id = $1", [r.id]);
    expect(row.staff_id).toBe(demo.staff.jevgeni);
    // his price: grey hair is 35 € with Renat and 30 € with Valentin (a week later, when both work)
    const g = await adminCreateVisit(demo.business, visit({ date: "2026-11-24", services: ["grey"], phone: "+372 5555 0204" }), ACTOR);
    if (!g.ok) throw new Error("not booked");
    expect(g.totalCents).toBe(3500);
    expect(await adminUpdateVisit(demo.business, g.id, { staffId: demo.staff.valentin }, ACTOR)).toMatchObject({ ok: true, totalCents: 3000 });
    // Jevgeni does no long hair: the move is refused and nothing changes
    const long = await adminCreateVisit(demo.business, visit({ time: "15:00", services: ["long"] }), ACTOR);
    if (!long.ok) throw new Error("not booked");
    expect(await adminUpdateVisit(demo.business, long.id, { staffId: demo.staff.jevgeni }, ACTOR)).toMatchObject({ ok: false, code: "not_offered" });
    const [same] = await query<{ staff_id: string }>("select staff_id from appointments where id = $1", [long.id]);
    expect(same.staff_id).toBe(demo.staff.renat);
  });

  it("changes the services, and the end and price follow", async () => {
    const r = await adminCreateVisit(demo.business, visit({ time: "12:00" }), ACTOR);
    if (!r.ok) throw new Error("not booked");
    const e = await adminUpdateVisit(demo.business, r.id, { serviceIds: [demo.services.clip, demo.services.grey], staffNote: "regular" }, ACTOR);
    expect(e).toMatchObject({ ok: true, totalCents: 7500 });
    if (!e.ok) return;
    expect(e.end - e.start).toBe(75 * 60_000);
    const lines = await query<{ service_id: string }>("select service_id from appointment_services where appointment_id = $1 order by position", [r.id]);
    expect(lines.map((l) => l.service_id)).toEqual([demo.services.clip, demo.services.grey]);
  });

  it("cancels, which frees the chair; a cancelled visit cannot be moved or marked", async () => {
    const r = await adminCreateVisit(demo.business, visit({ time: "12:00" }), ACTOR);
    if (!r.ok) throw new Error("not booked");
    expect(await adminCancelVisit(demo.business, r.id, ACTOR)).toBe("cancelled");
    expect(await adminCancelVisit(demo.business, r.id, ACTOR)).toBe("already");
    expect((await adminCreateVisit(demo.business, visit({ time: "12:00" }), ACTOR)).ok).toBe(true);
    expect(await adminUpdateVisit(demo.business, r.id, { start: at(TUE, "16:00") }, ACTOR)).toEqual({ ok: false, code: "cancelled" });
    expect(await adminSetStatus(demo.business, r.id, "arrived", ACTOR)).toBe(false);
  });

  it("marks arrived, done, no-show; nothing else", async () => {
    const r = await adminCreateVisit(demo.business, visit(), ACTOR);
    if (!r.ok) throw new Error("not booked");
    expect(await adminSetStatus(demo.business, r.id, "arrived", ACTOR)).toBe(true);
    expect(await adminSetStatus(demo.business, r.id, "done", ACTOR)).toBe(true);
    expect(await adminSetStatus(demo.business, r.id, "cancelled", ACTOR)).toBe(false);
    const [row] = await query<{ status: string }>("select status from appointments where id = $1", [r.id]);
    expect(row.status).toBe("done");
  });
});

describe("admin: special time in percent", () => {
  // Renat, 19.11.2026: a window is an amount in euros or a percent of the visit's price, «+50 %»
  const pct = (staff: string, from: string, to: string, extraPct: number) => addSpecialTime(demo.business, { staffId: demo.staff[staff], from: at(TUE, from), to: at(TUE, to), extraPct }, ACTOR);
  const money = async (id: string) => (await query<{ total_cents: number; extra_cents: number }>("select total_cents, extra_cents from appointments where id = $1", [id]))[0];

  it("a window is an amount or a percent: exactly one, a whole percent from 1 to 300", async () => {
    const add = (extra: { extraCents?: number; extraPct?: number }) => addSpecialTime(demo.business, { staffId: demo.staff.valentin, from: at(TUE, "20:00"), to: at(TUE, "22:00"), ...extra }, ACTOR);
    for (const bad of [{ extraCents: 2000, extraPct: 50 }, {}, { extraCents: 0 }, { extraPct: 0 }, { extraCents: 0, extraPct: 0 }, { extraPct: 301 }, { extraPct: -10 }, { extraPct: 12.5 }, { extraPct: NaN }, { extraCents: 100_001 }, { extraCents: -1 }]) {
      expect(await add(bad), JSON.stringify(bad)).toEqual({ ok: false, field: "extra" });
    }
    expect(await query("select id from special_time")).toHaveLength(0);
    expect((await add({ extraPct: 300 })).ok).toBe(true);
    expect((await add({ extraPct: 1, extraCents: 0 })).ok).toBe(true);
    expect((await add({ extraCents: 2000, extraPct: 0 })).ok).toBe(true);
    const rows = await query<{ extra_cents: number; extra_pct: number }>("select extra_cents, extra_pct from special_time order by extra_pct desc");
    expect(rows.map((r) => [r.extra_cents, r.extra_pct])).toEqual([[0, 300], [0, 1], [2000, 0]]);
  });

  it("the barber page and the calendar get the window as it was set", async () => {
    await pct("valentin", "20:00", "22:00", 50);
    await addSpecialTime(demo.business, { staffId: demo.staff.valentin, from: at(TUE, "08:00"), to: at(TUE, "10:00"), extraCents: 1500 }, ACTOR);
    const d = await staffDetail(query, demo.business, demo.staff.valentin, TUE);
    expect(d?.special.map((s) => [s.extraCents, s.extraPct])).toEqual([[1500, 0], [0, 50]]);
    const cal = await loadCalendar(query, demo.business, TUE, 1);
    expect(cal.special.map((s) => [s.extraCents, s.extraPct])).toEqual([[1500, 0], [0, 50]]);
  });

  it("a new visit in a percent window: that percent of its own price, one service or two", async () => {
    // Valentin: a cut is 60 minutes and 40 €, a beard trim 30 minutes and 28 €
    await pct("valentin", "19:00", "22:00", 50);
    const one = await adminCreateVisit(demo.business, visit({ staff: "valentin", time: "19:00" }), ACTOR);
    expect(one).toMatchObject({ ok: true, extraCents: 2000, totalCents: 6000 });
    const two = await adminCreateVisit(demo.business, visit({ staff: "valentin", time: "20:00", services: ["clip", "beard"], phone: "+372 5555 0211" }), ACTOR);
    expect(two).toMatchObject({ ok: true, extraCents: 3400, totalCents: 10200 });
    if (!one.ok || !two.ok) return;
    expect(await money(one.id)).toEqual({ total_cents: 6000, extra_cents: 2000 });
    expect(await money(two.id)).toEqual({ total_cents: 10200, extra_cents: 3400 });
    // another barber's percent is not his: Jevgeni at the same hour is outside his own hours
    expect(await adminCreateVisit(demo.business, visit({ staff: "jevgeni", time: "20:00", phone: "+372 5555 0212" }), ACTOR)).toEqual({ ok: false, code: "outside_hours" });
    expect(await adminCreateVisit(demo.business, visit({ staff: "jevgeni", time: "20:00", phone: "+372 5555 0212", force: true }), ACTOR)).toMatchObject({ ok: true, extraCents: 0, totalCents: 4000 });
  });

  it("moving in and out of a percent window prices the visit again", async () => {
    await pct("renat", "20:00", "22:00", 50);
    await addSpecialTime(demo.business, { staffId: demo.staff.renat, from: at(TUE, "08:00"), to: at(TUE, "10:00"), extraCents: 1500 }, ACTOR);
    const r = await adminCreateVisit(demo.business, visit({ time: "12:00" }), ACTOR);
    if (!r.ok) throw new Error("not booked");
    expect(r).toMatchObject({ extraCents: 0, totalCents: 4000 });
    // in: +50 % of 40 €
    expect(await adminUpdateVisit(demo.business, r.id, { start: at(TUE, "20:00") }, ACTOR)).toMatchObject({ ok: true, extraCents: 2000, totalCents: 6000 });
    expect(await money(r.id)).toEqual({ total_cents: 6000, extra_cents: 2000 });
    // within the window: the same
    expect(await adminUpdateVisit(demo.business, r.id, { start: at(TUE, "21:00") }, ACTOR)).toMatchObject({ ok: true, extraCents: 2000, totalCents: 6000 });
    // on to an amount window: its euros
    expect(await adminUpdateVisit(demo.business, r.id, { start: at(TUE, "08:00") }, ACTOR)).toMatchObject({ ok: true, extraCents: 1500, totalCents: 5500 });
    // out: the usual price again
    expect(await adminUpdateVisit(demo.business, r.id, { start: at(TUE, "15:00") }, ACTOR)).toMatchObject({ ok: true, extraCents: 0, totalCents: 4000 });
    expect(await money(r.id)).toEqual({ total_cents: 4000, extra_cents: 0 });
  });

  it("other services or another barber in a percent window: the percent of the new price", async () => {
    await pct("renat", "20:00", "22:00", 50);
    await pct("valentin", "20:00", "22:00", 10);
    const r = await adminCreateVisit(demo.business, visit({ time: "20:00" }), ACTOR);
    if (!r.ok) throw new Error("not booked");
    // a note alone changes nothing
    expect(await adminUpdateVisit(demo.business, r.id, { staffNote: "regular" }, ACTOR)).toMatchObject({ ok: true, extraCents: 2000, totalCents: 6000 });
    // + grey hair: 75 € and half of it
    expect(await adminUpdateVisit(demo.business, r.id, { serviceIds: [demo.services.clip, demo.services.grey] }, ACTOR)).toMatchObject({ ok: true, extraCents: 3750, totalCents: 11250 });
    // grey hair alone, 35 € with Renat; then to Valentin: his 30 € and his +10 %
    expect(await adminUpdateVisit(demo.business, r.id, { serviceIds: [demo.services.grey] }, ACTOR)).toMatchObject({ ok: true, extraCents: 1750, totalCents: 5250 });
    expect(await adminUpdateVisit(demo.business, r.id, { staffId: demo.staff.valentin }, ACTOR)).toMatchObject({ ok: true, extraCents: 300, totalCents: 3300 });
    expect(await money(r.id)).toEqual({ total_cents: 3300, extra_cents: 300 });
  });

  it("a move keeps the visit's prices as booked, and the percent is of those", async () => {
    await pct("renat", "20:00", "22:00", 50);
    const r = await adminCreateVisit(demo.business, visit({ time: "12:00" }), ACTOR);
    if (!r.ok) throw new Error("not booked");
    // his cut costs more from now on; this visit was booked at 40 €
    await query("update staff_services set price_cents = 5000 where staff_id = $1 and service_id = $2", [demo.staff.renat, demo.services.clip]);
    expect(await adminUpdateVisit(demo.business, r.id, { start: at(TUE, "20:00") }, ACTOR)).toMatchObject({ ok: true, extraCents: 2000, totalCents: 6000 });
    // a new visit there is at the new price
    expect(await adminCreateVisit(demo.business, visit({ time: "20:45", phone: "+372 5555 0213" }), ACTOR)).toMatchObject({ ok: true, extraCents: 2500, totalCents: 7500 });
  });
});

describe("admin: calendar data", () => {
  it("has every barber's day: hours, visits with their lines, blocks and special time", async () => {
    await adminCreateVisit(demo.business, visit({ time: "12:00", services: ["clip", "grey"] }), ACTOR);
    await addTimeOff(demo.business, { staffId: demo.staff.slava, from: at(TUE, "00:00"), to: at("2026-11-18", "00:00"), kind: "sick" }, ACTOR);
    await addSpecialTime(demo.business, { staffId: demo.staff.valentin, from: at(TUE, "20:00"), to: at(TUE, "22:00"), extraCents: 2000 }, ACTOR);
    const cal = await loadCalendar(query, demo.business, TUE, 1);
    expect(cal.staff.map((s) => s.name)).toEqual(["Renat", "Valentin", "Jevgeni", "Slava", "Milena"]);
    expect(cal.work[demo.staff.renat][TUE]).toEqual([[at(TUE, "10:00"), at(TUE, "19:00")]]);
    // a dated shift that is not the template's (Tuesday to 18:00), and a dated day off
    expect(cal.work[demo.staff.slava][TUE]).toEqual([[at(TUE, "10:00"), at(TUE, "18:30")]]);
    expect(cal.work[demo.staff.valentin][TUE]).toEqual([]);
    expect(cal.visits).toHaveLength(1);
    expect(cal.visits[0]).toMatchObject({ clientName: "Walk In", clientPhone: "+37255550201", totalCents: 7500 });
    expect(cal.visits[0].services.map((s) => s.durationMin)).toEqual([45, 30]);
    expect(cal.blocks).toMatchObject([{ staffId: demo.staff.slava, kind: "sick" }]);
    expect(cal.special).toMatchObject([{ staffId: demo.staff.valentin, extraCents: 2000 }]);
    expect(cal.services.find((s) => s.id === demo.services.clip)?.offers[demo.staff.jevgeni]).toEqual([4000, 60]);
    expect(cal.services.find((s) => s.id === demo.services.clip)?.offers[demo.staff.renat]).toEqual([4000, 45]);
  });

  it("a week is seven days; Sunday has no hours", async () => {
    const cal = await loadCalendar(query, demo.business, weekStart(TUE), 7);
    expect(cal.dates).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(cal.work[demo.staff.renat]["2026-11-21"]).toEqual([[at("2026-11-21", "10:00"), at("2026-11-21", "19:00")]]);
    expect(cal.work[demo.staff.renat]["2026-11-22"]).toEqual([]);
  });

  it("finds clients by phone digits or by name", async () => {
    await adminCreateVisit(demo.business, visit({ phone: "+372 5123 4567", name: "Mart Tamm" }), ACTOR);
    expect((await searchClients(query, demo.business.id, "4567")).map((c) => c.name)).toEqual(["Mart Tamm"]);
    expect((await searchClients(query, demo.business.id, "tamm")).map((c) => c.visits)).toEqual([1]);
    expect(await searchClients(query, demo.business.id, "x")).toEqual([]);
    expect(await searchClients(query, demo.business.id, "50%")).toEqual([]);
  });
});

describe("admin: barbers and services", () => {
  it("a new week template is what clients can book", async () => {
    // Tuesday 12–16 with a break 14–15
    const ok = await saveWeeklyHours(demo.business, demo.staff.renat, { 2: [["12:00", "14:00"], ["15:00", "16:00"]] }, ACTOR);
    expect(ok).toEqual({ ok: true });
    // a Tuesday after his dated shifts (they end on 5.12): there the week template is what counts.
    // Grey hair takes him 30 minutes.
    const day = "2026-12-08";
    const look = await loadAvailability(query, { business: demo.business, serviceIds: [demo.services.grey], staffId: demo.staff.renat, from: day, days: 2, now: NOW });
    const starts = look.days[0].slots.map((s) => hhmm((s.start - at(day, "00:00")) / 60_000));
    expect(starts[0]).toBe("12:00");
    expect(starts).toContain("13:30");
    expect(starts).not.toContain("14:00");
    expect(starts[starts.length - 1]).toBe("15:30");
    // Wednesday is now a day off
    expect(look.days[1].slots).toEqual([]);
    expect(await saveWeeklyHours(demo.business, demo.staff.renat, { 2: [["12:00", "14:00"], ["13:00", "16:00"]] }, ACTOR)).toEqual({ ok: false, field: "day:2" });
  });

  it("one day off without touching the template, then back", async () => {
    await setDayOverride(demo.business, demo.staff.renat, TUE, [], "dentist", ACTOR);
    let cal = await loadCalendar(query, demo.business, TUE, 2);
    expect(cal.work[demo.staff.renat][TUE]).toEqual([]);
    expect(cal.work[demo.staff.renat]["2026-11-18"]).toHaveLength(1);
    await setDayOverride(demo.business, demo.staff.renat, TUE, null, "", ACTOR);
    cal = await loadCalendar(query, demo.business, TUE, 1);
    expect(cal.work[demo.staff.renat][TUE]).toHaveLength(1);
  });

  it("a barber's own price and time reach the client flow; switched off, the service is gone", async () => {
    await saveStaffOffers(demo.business, demo.staff.renat, [{ serviceId: demo.services.clip, offered: true, priceCents: 4500, durationMin: 60 }], ACTOR);
    let look = await loadAvailability(query, { business: demo.business, serviceIds: [demo.services.clip], staffId: demo.staff.renat, from: TUE, days: 1, now: NOW });
    expect(look.quotes[0]).toMatchObject({ priceCents: 4500, durationMin: 60 });
    await saveStaffOffers(demo.business, demo.staff.renat, [{ serviceId: demo.services.clip, offered: false, priceCents: null, durationMin: null }], ACTOR);
    look = await loadAvailability(query, { business: demo.business, serviceIds: [demo.services.clip], staffId: demo.staff.renat, from: TUE, days: 1, now: NOW });
    expect(look.quotes).toEqual([]);
    expect(await saveStaffOffers(demo.business, demo.staff.renat, [{ serviceId: demo.services.clip, offered: true, priceCents: -1, durationMin: null }], ACTOR)).toMatchObject({ ok: false });
  });

  it("adds a barber with a fresh slug, then the detail page has it", async () => {
    const a = await saveStaffProfile(demo.business, null, { name: "Дмитрий", bookable: true, active: true }, ACTOR);
    const b = await saveStaffProfile(demo.business, null, { name: "Dmitri", bookable: false, active: true }, ACTOR);
    expect(a.ok && b.ok).toBe(true);
    const list = await listStaff(query, demo.business.id);
    expect(list.filter((s) => s.slug.startsWith("dmitri")).map((s) => s.slug).sort()).toEqual(["dmitri", "dmitrii"]);
    if (!a.ok) return;
    const d = await staffDetail(query, demo.business, a.id, TUE);
    expect(d?.hours.every((h) => h.spans.length === 0)).toBe(true);
    expect(d?.offers.every((o) => !o.offered)).toBe(true);
    expect(await saveStaffProfile(demo.business, null, { name: " ", bookable: true, active: true }, ACTOR)).toEqual({ ok: false, field: "name" });
    expect(await saveStaffProfile(demo.business, a.id, { name: "X", photoUrl: "javascript:alert(1)", bookable: true, active: true }, ACTOR)).toEqual({ ok: false, field: "photoUrl" });
  });

  it("a new service for every barber, at the default price", async () => {
    const r = await saveService(demo.business, null, { name: { ru: "Укладка", en: "Styling" }, durationMin: 20, priceCents: 1500, online: true, active: true, allBarbers: true }, ACTOR);
    if (!r.ok) throw new Error("not saved");
    const list = await listServices(query, demo.business.id);
    expect(list.find((s) => s.id === r.id)).toMatchObject({ slug: "styling", barbers: 5, priceMaxCents: null });
    const look = await loadAvailability(query, { business: demo.business, serviceIds: [r.id], staffId: null, from: TUE, days: 1, now: NOW });
    expect(look.quotes).toHaveLength(5);
    expect(await saveService(demo.business, r.id, { name: { ru: "Укладка" }, durationMin: 25, priceCents: 1500, priceMaxCents: 1000, online: true, active: true }, ACTOR)).toEqual({
      ok: false,
      field: "priceMaxCents",
    });
    expect(await saveService(demo.business, r.id, { name: { ru: "Укладка" }, durationMin: 25, priceCents: 1500, online: false, active: true }, ACTOR)).toEqual({ ok: true, id: r.id });
  });
});

describe("admin: grid maths", () => {
  it("the week starts on Monday", () => {
    expect(weekStart("2026-11-17")).toBe("2026-11-16");
    expect(weekStart("2026-11-22")).toBe("2026-11-16");
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
  });
  it("snaps to the step and reads wall time on DST days", () => {
    expect(snap(611, 15)).toBe(600);
    expect(hhmm(615)).toBe("10:15");
    expect(momentAt("2026-10-25", 10 * 60, TZ)).toBe(at("2026-10-25", "10:00"));
  });
  it("shows 09–21, widened to whole hours around the day's spans", () => {
    expect(gridBounds([TUE], TZ, [])).toEqual([540, 1260]);
    expect(gridBounds([TUE], TZ, [{ from: at(TUE, "08:30"), to: at(TUE, "22:15") }])).toEqual([480, 1380]);
    // a span on another day changes nothing
    expect(gridBounds([TUE], TZ, [{ from: at("2026-11-18", "06:00"), to: at("2026-11-18", "07:00") }])).toEqual([540, 1260]);
  });
  it("cleans hour spans", () => {
    expect(cleanSpans([["15:00", "16:00"], ["10:00", "14:00"]])).toEqual([["10:00", "14:00"], ["15:00", "16:00"]]);
    expect(cleanSpans([["10:00", "10:00"]])).toBeNull();
    expect(cleanSpans([["9:00", "10:00"]])).toBeNull();
    expect(cleanSpans("x")).toBeNull();
  });
  it("keeps an uploaded portrait and points the barber's photo at it", async () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 2, 3]);
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    expect(imageMime(jpeg)).toBe("image/jpeg");
    expect(imageMime(png)).toBe("image/png");
    expect(imageMime(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();

    const first = await saveStaffPhoto(demo.business, demo.staff.renat, jpeg, ACTOR);
    if (!first.ok) throw new Error("not saved");
    expect(first.url).toMatch(new RegExp(`^/api/staff-photo/${demo.staff.renat}\\?v=[0-9a-z]+$`));
    expect((await staffDetail(query, demo.business, demo.staff.renat, TUE))?.photoUrl).toBe(first.url);
    expect(await staffPhoto(query, demo.staff.renat)).toEqual({ mime: "image/jpeg", bytes: jpeg });

    // a second upload replaces the first; the profile form can still save that link
    const second = await saveStaffPhoto(demo.business, demo.staff.renat, png, ACTOR);
    if (!second.ok) throw new Error("not saved");
    expect((await staffPhoto(query, demo.staff.renat))?.mime).toBe("image/png");
    expect((await saveStaffProfile(demo.business, demo.staff.renat, { name: "Renat", photoUrl: second.url, bookable: true, active: true }, ACTOR)).ok).toBe(true);

    // not a picture, too big, not a barber here
    expect(await saveStaffPhoto(demo.business, demo.staff.renat, new TextEncoder().encode("hello"), ACTOR)).toEqual({ ok: false, field: "photo" });
    const big = new Uint8Array(PHOTO_MAX_BYTES + 1);
    big.set(jpeg);
    expect(await saveStaffPhoto(demo.business, demo.staff.renat, big, ACTOR)).toEqual({ ok: false, field: "photo" });
    expect(await saveStaffPhoto(demo.business, "00000000-0000-4000-8000-000000000000", jpeg, ACTOR)).toEqual({ ok: false, field: "staff" });
    expect(await staffPhoto(query, demo.staff.valentin)).toBeNull();
  });

  it("transliterates names into slugs", () => {
    expect(slugify("Слава Красытель")).toBe("slava-krasytel");
    expect(slugify("Jõgi Ülo")).toBe("jogi-ulo");
  });
});
