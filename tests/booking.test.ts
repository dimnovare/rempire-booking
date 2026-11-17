import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadAvailability } from "@/lib/availability";
import { book, hashToken, type BookingInput } from "@/lib/booking";
import { closeDb, query } from "@/lib/db";
import { zonedToUtc } from "@/lib/tz";
import { demoId } from "../tools/seed-demo.mjs";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const iso = (date: string, time: string) => new Date(at(date, time)).toISOString();
// Monday 16.11.2026, 10:00 in Tallinn
const NOW = at("2026-11-16", "10:00");
const TUE = "2026-11-17";

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});
afterAll(closeDb);

const slotsOf = async (o: { staff?: string | null; services: string[]; date: string; now?: number }) => {
  const r = await loadAvailability(query, {
    business: demo.business,
    serviceIds: o.services.map((s) => demo.services[s]),
    staffId: o.staff ? demo.staff[o.staff] : null,
    from: o.date,
    days: 1,
    now: o.now ?? NOW,
  });
  return r.days[0]?.slots ?? [];
};

let n = 0;
const input = (o: Partial<BookingInput> & { staff?: string | null; services?: string[]; date?: string; time?: string } = {}): BookingInput => ({
  serviceIds: (o.services ?? ["clip"]).map((s) => demo.services[s]),
  staffId: o.staff === undefined ? demo.staff.renat : o.staff === null ? null : demo.staff[o.staff],
  startsAt: iso(o.date ?? TUE, o.time ?? "10:00"),
  name: o.name ?? "Test Client",
  phone: o.phone ?? "+372 5555 0101",
  email: o.email ?? null,
  comment: o.comment ?? "",
  locale: o.locale ?? "ru",
  smsReminder: o.smsReminder ?? true,
  idempotencyKey: o.idempotencyKey ?? `test-key-${++n}-${Math.random()}`,
  extraCents: o.extraCents,
});

describe("demo seed", () => {
  it("uses the same ids on every instance, so page and API agree", () => {
    expect(demo.staff.renat).toBe(demoId("staff", "renat"));
    expect(demo.services.clip).toBe(demoId("service", "clip"));
    expect(demo.business.id).toBe(demoId("business", "rempire"));
  });
});

describe("database", () => {
  it("refuses two visits on one chair at once, whatever the code does", async () => {
    const client = await query<{ id: string }>(
      "insert into clients (business_id, name, phone_e164) values ($1, 'Test', '+37255550199') returning id",
      [demo.business.id],
    );
    const [loc] = await query<{ id: string }>("select id from locations");
    const ins = (from: string, to: string) =>
      query(
        `insert into appointments (business_id, location_id, staff_id, client_id, starts_at, ends_at, blocked_until)
         values ($1, $2, $3, $4, $5, $6, $6)`,
        [demo.business.id, loc.id, demo.staff.renat, client[0].id, iso(TUE, from), iso(TUE, to)],
      );
    await ins("10:00", "10:45");
    await ins("10:45", "11:30"); // touching is fine
    await expect(ins("11:00", "11:15")).rejects.toMatchObject({ code: "23P01" });
  });
});

describe("free slots", () => {
  it("a 45-minute cut fits from 10:00 to the last start at 19:15", async () => {
    const s = await slotsOf({ staff: "renat", services: ["clip"], date: TUE });
    expect(s[0].start).toBe(at(TUE, "10:00"));
    expect(s[s.length - 1].start).toBe(at(TUE, "19:15"));
    expect(s.length).toBe(38);
  });

  it("nothing before now plus the 30-minute notice", async () => {
    const s = await slotsOf({ staff: "renat", services: ["clip"], date: TUE, now: at(TUE, "10:05") });
    expect(s[0].start).toBe(at(TUE, "10:45"));
  });

  it("Sunday is closed and a barber without the service is left out", async () => {
    expect(await slotsOf({ services: ["clip"], date: "2026-11-22" })).toEqual([]);
    expect(await slotsOf({ staff: "milena", services: ["beard"], date: TUE })).toEqual([]);
  });

  it("two services add up to the barber's own total time", async () => {
    const s = await slotsOf({ staff: "renat", services: ["clip", "beard"], date: TUE });
    expect(s[s.length - 1].start).toBe(at(TUE, "18:45")); // 75 min to 20:00
  });

  it("time off and a changed day are respected", async () => {
    await query("insert into time_off (staff_id, starts_at, ends_at, kind) values ($1, $2, $3, 'block')", [
      demo.staff.renat,
      iso(TUE, "13:00"),
      iso(TUE, "14:00"),
    ]);
    const s = (await slotsOf({ staff: "renat", services: ["clip"], date: TUE })).map((x) => x.start);
    expect(s).toContain(at(TUE, "12:15"));
    expect(s).not.toContain(at(TUE, "12:30"));
    expect(s).not.toContain(at(TUE, "13:30"));
    expect(s).toContain(at(TUE, "14:00"));

    await query("insert into staff_day_overrides (staff_id, day, intervals) values ($1, $2, '[]')", [demo.staff.renat, TUE]);
    expect(await slotsOf({ staff: "renat", services: ["clip"], date: TUE })).toEqual([]);
  });

  it("DST day 25.10.2026: a 10:00–12:00 shift is 08:00–10:00 UTC", async () => {
    const day = "2026-10-25";
    await query(`insert into staff_day_overrides (staff_id, day, intervals) values ($1, $2, '[["10:00","12:00"]]')`, [demo.staff.renat, day]);
    const s = await slotsOf({ staff: "renat", services: ["clip"], date: day, now: at("2026-10-20", "12:00") });
    expect(new Date(s[0].start).toISOString()).toBe("2026-10-25T08:00:00.000Z");
    expect(new Date(s[s.length - 1].start).toISOString()).toBe("2026-10-25T09:15:00.000Z");
  });

  it("a tidy-up buffer keeps the chair busy after the visit", async () => {
    await query("update services set buffer_after_min = 10 where id = $1", [demo.services.clip]);
    expect((await book(query, demo.business, input({ time: "10:00" }), { now: NOW })).ok).toBe(true);
    const s = (await slotsOf({ staff: "renat", services: ["clip"], date: TUE })).map((x) => x.start);
    expect(s[0]).toBe(at(TUE, "11:00"));
  });

  it("days past the 60-day horizon are empty", async () => {
    expect(await slotsOf({ staff: "renat", services: ["clip"], date: "2027-02-02" })).toEqual([]);
  });
});

describe("booking", () => {
  it("books, hides the slot, and stores a hashed change link", async () => {
    const r = await book(query, demo.business, input(), { now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.visit.startsAt).toBe(iso(TUE, "10:00"));
    expect(r.visit.endsAt).toBe(iso(TUE, "10:45"));
    expect(r.visit.totalCents).toBe(4000);
    expect(r.manageToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const [row] = await query<{ manage_token_hash: string; reminder_min: number }>(
      "select manage_token_hash, reminder_min from appointments where id = $1",
      [r.visit.id],
    );
    expect(row.manage_token_hash).toBe(hashToken(r.manageToken!));
    expect(row.reminder_min).toBe(120);
    const s = (await slotsOf({ staff: "renat", services: ["clip"], date: TUE })).map((x) => x.start);
    expect(s[0]).toBe(at(TUE, "10:45"));
  });

  it("a double tap with the same key books once", async () => {
    const one = input({ idempotencyKey: "double-tap-key-1" });
    const [a, b] = await Promise.all([book(query, demo.business, one, { now: NOW }), book(query, demo.business, one, { now: NOW })]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.visit.id).toBe(b.visit.id);
    expect([a.replay, b.replay].sort()).toEqual([false, true]);
    const [{ count }] = await query<{ count: number }>("select count(*)::int as count from appointments");
    expect(count).toBe(1);
  });

  it("two clients racing for one slot: one gets it, the other is told", async () => {
    const [a, b] = await Promise.all([
      book(query, demo.business, input({ phone: "+372 5555 0102" }), { now: NOW }),
      book(query, demo.business, input({ phone: "+372 5555 0103" }), { now: NOW }),
    ]);
    const outcomes = [a, b].map((r) => (r.ok ? "ok" : r.code)).sort();
    expect(outcomes).toEqual(["ok", "slot_taken"]);
  });

  it("«anyone» goes to the barber with fewer visits that day", async () => {
    await book(query, demo.business, input({ staff: "renat", time: "10:00" }), { now: NOW });
    const a = await book(query, demo.business, input({ staff: null, time: "11:00" }), { now: NOW });
    expect(a.ok && a.visit.staffId).toBe(demo.staff.valentin);
    const b = await book(query, demo.business, input({ staff: null, time: "12:00" }), { now: NOW });
    expect(b.ok && b.visit.staffId).toBe(demo.staff.jevgeni);
    const [row] = await query<{ any_staff: boolean }>("select any_staff from appointments where staff_id = $1", [demo.staff.jevgeni]);
    expect(row.any_staff).toBe(true);
  });

  it("finds the same client by phone however it is typed, and keeps the first name", async () => {
    await book(query, demo.business, input({ phone: "+372 5555 0101", name: "Test Client" }), { now: NOW });
    await book(query, demo.business, input({ phone: "5555 0101", name: "Someone Else", time: "12:00" }), { now: NOW });
    const clients = await query<{ name: string; phone_e164: string }>("select name, phone_e164 from clients");
    expect(clients).toEqual([{ name: "Test Client", phone_e164: "+37255550101" }]);
  });

  it("refuses a start off the grid, in the past, or with bad details", async () => {
    expect(await book(query, demo.business, input({ time: "10:07" }), { now: NOW })).toEqual({ ok: false, code: "slot_taken" });
    expect(await book(query, demo.business, input({ date: "2026-11-16", time: "09:00" }), { now: NOW })).toEqual({ ok: false, code: "slot_taken" });
    expect(await book(query, demo.business, input({ phone: "12" }), { now: NOW })).toMatchObject({ ok: false, field: "phone" });
    expect(await book(query, demo.business, input({ name: "  " }), { now: NOW })).toMatchObject({ ok: false, field: "name" });
    expect(await book(query, demo.business, input({ staff: "milena", services: ["beard"] }), { now: NOW })).toMatchObject({ ok: false, code: "not_offered" });
  });

  it("no SMS reminder when the client switches it off", async () => {
    const r = await book(query, demo.business, input({ smsReminder: false }), { now: NOW });
    const [row] = await query<{ reminder_min: number | null }>("select reminder_min from appointments where id = $1", [r.ok ? r.visit.id : ""]);
    expect(row.reminder_min).toBeNull();
  });

  it("a reused key with another phone reads nothing back", async () => {
    await book(query, demo.business, input({ idempotencyKey: "shared-key-0000001" }), { now: NOW });
    const r = await book(query, demo.business, input({ idempotencyKey: "shared-key-0000001", phone: "+372 5555 0177", time: "12:00" }), { now: NOW });
    expect(r).toEqual({ ok: false, code: "invalid", field: "idempotencyKey" });
  });

  it("a public body cannot mark itself as an admin booking", async () => {
    const body = { ...input(), source: "admin" } as unknown as BookingInput;
    const r = await book(query, demo.business, body, { now: NOW });
    const [row] = await query<{ source: string }>("select source from appointments where id = $1", [r.ok ? r.visit.id : ""]);
    expect(row.source).toBe("online");
    const [audit] = await query<{ actor: string }>("select actor from audit");
    expect(audit.actor).toBe("client");
  });
});

describe("special time", () => {
  // a barber's own higher-priced window (Renat, 17.11.2026)
  const special = (staff: string, date: string, from: string, to: string, euros: number) =>
    query("insert into special_time (business_id, staff_id, starts_at, ends_at, extra_cents) values ($1, $2, $3, $4, $5)", [
      demo.business.id,
      demo.staff[staff],
      iso(date, from),
      iso(date, to),
      euros * 100,
    ]);
  const extraAt = (s: { start: number; extraCents: number }[], time: string) => s.find((x) => x.start === at(TUE, time))?.extraCents;

  it("after hours: adds bookable time at its price, never across the edge", async () => {
    await special("renat", TUE, "20:00", "22:00", 20);
    const s = await slotsOf({ staff: "renat", services: ["clip"], date: TUE });
    expect(extraAt(s, "19:15")).toBe(0);
    expect(extraAt(s, "19:30")).toBeUndefined(); // would run from 19:30 into special time
    expect(extraAt(s, "20:00")).toBe(2000);
    expect(extraAt(s, "21:15")).toBe(2000);
    expect(extraAt(s, "21:30")).toBeUndefined();
  });

  it("inside the hours: replaces the usual price for that time", async () => {
    await special("renat", TUE, "13:00", "14:00", 15);
    const s = await slotsOf({ staff: "renat", services: ["clip"], date: TUE });
    expect(extraAt(s, "12:15")).toBe(0);
    expect(extraAt(s, "12:30")).toBeUndefined();
    expect(extraAt(s, "13:00")).toBe(1500);
    expect(extraAt(s, "13:15")).toBe(1500);
    expect(extraAt(s, "13:30")).toBeUndefined();
    expect(extraAt(s, "14:00")).toBe(0);
  });

  it("opens a closed day, and the earlier of two overlapping windows wins", async () => {
    const SUN = "2026-11-22";
    await special("renat", SUN, "12:00", "14:00", 25);
    await special("renat", SUN, "13:00", "16:00", 30);
    const r = await loadAvailability(query, { business: demo.business, serviceIds: [demo.services.clip], staffId: demo.staff.renat, from: SUN, days: 1, now: NOW });
    expect(r.days[0].open).toBe(true);
    const by = new Map(r.days[0].slots.map((x) => [x.start, x.extraCents]));
    expect(by.get(at(SUN, "12:00"))).toBe(2500);
    expect(by.get(at(SUN, "13:15"))).toBe(2500);
    expect(by.get(at(SUN, "13:30"))).toBeUndefined(); // 25 € then 30 €: no visit across the two
    expect(by.get(at(SUN, "14:00"))).toBe(3000);
    expect(by.get(at(SUN, "15:15"))).toBe(3000);
  });

  it("books at the price shown and keeps the extra apart", async () => {
    await special("renat", TUE, "20:00", "22:00", 20);
    const r = await book(query, demo.business, input({ time: "20:00", extraCents: 2000 }), { now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.visit.totalCents).toBe(6000);
    expect(r.visit.extraCents).toBe(2000);
    const [row] = await query<{ total_cents: number; extra_cents: number }>("select total_cents, extra_cents from appointments where id = $1", [r.visit.id]);
    expect(row).toEqual({ total_cents: 6000, extra_cents: 2000 });
  });

  it("never charges another price than the one shown", async () => {
    await special("renat", TUE, "13:00", "14:00", 15);
    expect(await book(query, demo.business, input({ time: "13:00", extraCents: 0 }), { now: NOW })).toEqual({ ok: false, code: "slot_taken" });
    expect(await book(query, demo.business, input({ time: "13:00", extraCents: -5 }), { now: NOW })).toMatchObject({ ok: false, field: "extraCents" });
  });

  it("«anyone» takes a barber at the usual price before a special one", async () => {
    await special("renat", TUE, "11:00", "12:00", 20);
    const s = await slotsOf({ services: ["clip"], date: TUE });
    const slot = s.find((x) => x.start === at(TUE, "11:00"))!;
    expect(slot.extraCents).toBe(0);
    expect(slot.staffIds[0]).not.toBe(demo.staff.renat);
    const r = await book(query, demo.business, input({ staff: null, time: "11:00" }), { now: NOW });
    expect(r.ok && r.visit.extraCents).toBe(0);
  });
});
