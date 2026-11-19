/**
 * The journal's rules (src/lib/admin/journal.ts, daySpan in grid.ts, and
 * the day's goods in calendar.ts): who gets a column on a day, the hours
 * the grid shows, a visit's colours by who made it and by its state, and
 * the day's numbers. Fake people and fake products only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { dayGoodsCents, loadCalendar } from "@/lib/admin/calendar";
import { daySpan } from "@/lib/admin/grid";
import { dayNumbers, dayStaff, visitLook, visitState, VISIT_STATES } from "@/lib/admin/journal";
import { adminSell } from "@/lib/admin/sale";
import { addSpecialTime, saveStaffProfile, setDayOverride } from "@/lib/admin/staff";
import { adminCancelVisit, adminCreateVisit, adminSetStatus, addTimeOff } from "@/lib/admin/visits";
import { closeDb, query } from "@/lib/db";
import { newRef, recordSale, reverseSale, undoSale } from "@/lib/sales";
import { FAKE_PRODUCTS } from "@/lib/shop";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
// Tuesday 17.11.2026 in the salon's own schedule (tools/altegio-structure.json): Renat and Jevgeni
// 10:00–19:00, Slava 10:00–18:30; Valentin and Milena are off
const TUE = "2026-11-17";
const WED = "2026-11-18";
const SUN = "2026-11-22";
const ACTOR = "test-admin";

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});
afterAll(closeDb);

let n = 0;
/** A visit made at the front desk; forced, so it may stand outside the hours. */
async function book(staff: string, date: string, time: string, service = "clip"): Promise<string> {
  const r = await adminCreateVisit(
    demo.business,
    { staffId: demo.staff[staff], start: at(date, time), serviceIds: [demo.services[service]], name: `Walk In ${++n}`, phone: `+372 5555 02${String(n).padStart(2, "0")}`, idempotencyKey: `journal-key-${n}-${Math.random()}`, force: true },
    ACTOR,
  );
  if (!r.ok) throw new Error(`not booked: ${r.code}`);
  return r.id;
}
const names = async (date: string) => {
  const cal = await loadCalendar(query, demo.business, date, 1);
  const shown = dayStaff(cal, date);
  return cal.staff.filter((s) => shown.includes(s.id)).map((s) => s.name);
};

describe("who gets a column on a day", () => {
  it("only the barbers who work that day", async () => {
    expect(await names(TUE)).toEqual(["Renat", "Jevgeni", "Slava"]);
    // a Sunday: nobody
    expect(await names(SUN)).toEqual([]);
  });

  it("a visit on his day off gives a barber a column; cancelled, it takes it away", async () => {
    const id = await book("valentin", TUE, "12:00");
    expect(await names(TUE)).toEqual(["Renat", "Valentin", "Jevgeni", "Slava"]);
    // a visit on another day is not this day's
    await book("milena", WED, "12:00");
    expect(await names(TUE)).toEqual(["Renat", "Valentin", "Jevgeni", "Slava"]);
    await adminCancelVisit(demo.business, id, ACTOR);
    expect(await names(TUE)).toEqual(["Renat", "Jevgeni", "Slava"]);
  });

  it("special time is working time; a day turned into a day off is not", async () => {
    await addSpecialTime(demo.business, { staffId: demo.staff.milena, from: at(TUE, "20:00"), to: at(TUE, "22:00"), extraCents: 2000 }, ACTOR);
    await setDayOverride(demo.business, demo.staff.renat, TUE, [], "dentist", ACTOR);
    expect(await names(TUE)).toEqual(["Jevgeni", "Slava", "Milena"]);
  });

  it("time off does not take the column away: the block is shown in it", async () => {
    await addTimeOff(demo.business, { staffId: demo.staff.slava, from: at(TUE, "00:00"), to: at(WED, "00:00"), kind: "sick" }, ACTOR);
    expect(await names(TUE)).toEqual(["Renat", "Jevgeni", "Slava"]);
  });

  it("a barber who no longer works has a column only for a visit", async () => {
    await book("jevgeni", TUE, "12:00");
    for (const who of ["jevgeni", "slava"]) {
      expect(await saveStaffProfile(demo.business, demo.staff[who], { name: who, bookable: false, active: false }, ACTOR)).toMatchObject({ ok: true });
    }
    expect(await names(TUE)).toEqual(["Renat", "jevgeni"]);
  });
});

describe("the hours the grid shows", () => {
  it("from the earliest start to the latest end among the barbers shown", async () => {
    const cal = await loadCalendar(query, demo.business, TUE, 1);
    const spans = dayStaff(cal, TUE).flatMap((id) => cal.work[id][TUE].map(([from, to]) => ({ from, to })));
    // Renat and Jevgeni to 19:00, Slava to 18:30
    expect(daySpan([TUE], TZ, spans)).toEqual([10 * 60, 19 * 60]);
    // only Slava: his own day
    expect(daySpan([TUE], TZ, cal.work[demo.staff.slava][TUE].map(([from, to]) => ({ from, to })))).toEqual([10 * 60, 18 * 60 + 30]);
  });

  it("goes out to the half hour, and around a visit outside the hours", () => {
    expect(daySpan([TUE], TZ, [{ from: at(TUE, "10:15"), to: at(TUE, "18:40") }])).toEqual([10 * 60, 19 * 60]);
    expect(
      daySpan([TUE], TZ, [
        { from: at(TUE, "10:00"), to: at(TUE, "19:00") },
        { from: at(TUE, "19:30"), to: at(TUE, "20:15") },
        { from: at(TUE, "08:45"), to: at(TUE, "09:15") },
      ]),
    ).toEqual([8 * 60 + 30, 20 * 60 + 30]);
  });

  it("stays inside the day, and is never under an hour", () => {
    // from the evening before into the morning after
    expect(daySpan([TUE], TZ, [{ from: at("2026-11-16", "22:00"), to: at(WED, "02:00") }])).toEqual([0, 24 * 60]);
    expect(daySpan([TUE], TZ, [{ from: at(TUE, "12:00"), to: at(TUE, "12:15") }])).toEqual([12 * 60, 13 * 60]);
    expect(daySpan([TUE], TZ, [{ from: at(TUE, "23:30"), to: at(TUE, "23:45") }])).toEqual([23 * 60, 24 * 60]);
  });

  it("a week is as long as its longest day; an empty one is 10–19", () => {
    const week = ["2026-11-16", TUE, WED, "2026-11-19", "2026-11-20", "2026-11-21", SUN];
    expect(
      daySpan(week, TZ, [
        { from: at(TUE, "10:00"), to: at(TUE, "18:00") },
        { from: at("2026-11-20", "09:00"), to: at("2026-11-20", "17:00") },
        { from: at("2026-11-21", "11:00"), to: at("2026-11-21", "20:00") },
      ]),
    ).toEqual([9 * 60, 20 * 60]);
    expect(daySpan(week, TZ, [])).toEqual([10 * 60, 19 * 60]);
    // a span of another week changes nothing
    expect(daySpan(week, TZ, [{ from: at("2026-11-24", "06:00"), to: at("2026-11-24", "23:00") }])).toEqual([10 * 60, 19 * 60]);
  });
});

describe("a visit's colours", () => {
  const ONLINE = "#907b9f";
  const STAFF = "#1ab394";

  it("waiting: the strip and the body by who made it", () => {
    expect(visitLook("booked", "online")).toEqual({ maker: "online", state: "online", strip: ONLINE, body: "rgba(195,165,214,.8)", name: "#765c88" });
    expect(visitLook("booked", "admin")).toEqual({ maker: "staff", state: "staff", strip: STAFF, body: "rgba(134,223,205,.8)", name: "#4b7b72" });
    // a booking that still waits for the barber's yes is waiting too
    expect(visitLook("pending", "online")).toMatchObject({ state: "online", strip: ONLINE, body: "rgba(195,165,214,.8)" });
    expect(visitLook("pending", "admin")).toMatchObject({ state: "staff", strip: STAFF });
    // the import from the old system is the salon's
    expect(visitLook("booked", "import")).toMatchObject({ maker: "staff", state: "staff", strip: STAFF });
  });

  it("came or done: orange, the strip still by who made it", () => {
    for (const status of ["arrived", "done"]) {
      expect(visitLook(status, "online")).toEqual({ maker: "online", state: "came", strip: ONLINE, body: "rgba(255,153,88,.8)", name: "#854e0e" });
      expect(visitLook(status, "admin")).toEqual({ maker: "staff", state: "came", strip: STAFF, body: "rgba(255,153,88,.8)", name: "#854e0e" });
    }
  });

  it("did not come: red, the strip still by who made it", () => {
    expect(visitLook("no_show", "online")).toEqual({ maker: "online", state: "noshow", strip: ONLINE, body: "rgba(255,107,107,.8)", name: "#7a1f1f" });
    expect(visitLook("no_show", "admin")).toMatchObject({ maker: "staff", state: "noshow", strip: STAFF, body: "rgba(255,107,107,.8)" });
  });

  it("every status the calendar can hold lands on one of the four states", () => {
    for (const status of ["pending", "booked", "arrived", "done", "no_show"]) {
      for (const source of ["online", "admin", "import"]) expect(VISIT_STATES).toContain(visitState(status, source));
    }
    expect(VISIT_STATES).toEqual(["online", "staff", "came", "noshow"]);
  });
});

describe("the day's numbers", () => {
  it("clients, booked and done, from the day's visits", async () => {
    // Renat's own prices: a cut 40 €, grey hair 35 €; Jevgeni's cut 40 €
    const cut = await book("renat", TUE, "12:00");
    const grey = await book("renat", TUE, "14:00", "grey");
    const other = await book("jevgeni", TUE, "12:00");
    const gone = await book("jevgeni", TUE, "15:00");
    await book("renat", WED, "12:00");
    const numbers = async (date = TUE) => dayNumbers((await loadCalendar(query, demo.business, date, 1)).visits, date, TZ);
    expect(await numbers()).toEqual({ clients: 4, bookedCents: 4000 + 3500 + 4000 + 4000, doneCents: 0 });

    // one came and sits in the chair, one is done, one did not come
    await adminSetStatus(demo.business, cut, "arrived", ACTOR);
    await adminSetStatus(demo.business, grey, "done", ACTOR);
    await adminSetStatus(demo.business, other, "no_show", ACTOR);
    expect(await numbers()).toEqual({ clients: 4, bookedCents: 15500, doneCents: 7500 });

    // a cancelled visit is nobody's
    await adminCancelVisit(demo.business, gone, ACTOR);
    expect(await numbers()).toEqual({ clients: 3, bookedCents: 11500, doneCents: 7500 });
    expect(await numbers(WED)).toEqual({ clients: 1, bookedCents: 4000, doneCents: 0 });
    expect(await numbers(SUN)).toEqual({ clients: 0, bookedCents: 0, doneCents: 0 });
  });

  it("one client twice in a day is one client", () => {
    const visit = (clientId: string, time: string, status = "booked") => ({ clientId, start: at(TUE, time), status, totalCents: 1000 });
    expect(dayNumbers([visit("a", "10:00"), visit("a", "15:00", "done"), visit("b", "11:00"), visit("c", "12:00", "cancelled")], TUE, TZ)).toEqual({ clients: 2, bookedCents: 3000, doneCents: 1000 });
    // a visit that began the evening before is that day's
    expect(dayNumbers([{ clientId: "a", start: at("2026-11-16", "23:30"), status: "done", totalCents: 1000 }], TUE, TZ)).toEqual({ clients: 0, bookedCents: 0, doneCents: 0 });
  });

  it("the day's goods: the sales made that day that still stand", async () => {
    const paste = FAKE_PRODUCTS[0]; // 24,90 €
    const [owner] = await query<{ id: string }>("insert into users (business_id, email, role) values ($1, 'owner@example.test', 'owner') returning id", [demo.business.id]);
    const NOW = at(TUE, "15:00");
    const MINUTE = 60_000;
    const sell = async (staff: string, qty: number, when: number) => {
      const r = await adminSell(demo.business, owner.id, { ref: newRef(), staffId: demo.staff[staff], productId: paste.productId, variant: paste.variant, qty, at: when }, NOW);
      if (!r.ok) throw new Error(`not sold: ${r.code}`);
      return r.sale;
    };
    const goods = (date = TUE) => dayGoodsCents(query, demo.business, date);
    expect(await goods()).toBe(0);

    await sell("renat", 2, at(TUE, "11:00"));
    const taken = await sell("slava", 1, at(TUE, "12:00"));
    const undone = await sell("slava", 1, NOW);
    await sell("milena", 1, at("2026-11-16", "18:00"));
    expect(await goods()).toBe(4 * 2490);
    expect(await goods("2026-11-16")).toBe(2490);
    expect(await goods(WED)).toBe(0);

    // the barber takes his back within the window; Renat reverses the other a day later
    expect(await undoSale(demo.staff.slava, undone.ref, null, NOW + MINUTE)).toEqual({ ok: true });
    expect(await goods()).toBe(3 * 2490);
    expect(await reverseSale(demo.business, taken.id, owner.id)).toMatchObject({ ok: true });
    await query("update product_sales set created_at = $1 where reverses_id = $2", [new Date(at(WED, "10:00")), taken.id]);
    expect(await goods()).toBe(2 * 2490);
    // the minus row is nobody's sale on its own day
    expect(await goods(WED)).toBe(0);

    // a barber's own purchase is goods sold too, at what he pays for it
    const own = await recordSale(demo.business, demo.staff.renat, null, { ref: newRef(), productId: paste.productId, variant: paste.variant, mode: "self", qty: 1 }, at(TUE, "16:00"));
    if (!own.ok) throw new Error(`not sold: ${own.code}`);
    expect(await goods()).toBe(2 * 2490 + own.sale.totalCents);
  });
});
