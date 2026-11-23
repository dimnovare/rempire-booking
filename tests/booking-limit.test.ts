/**
 * The limit per address on the online booking and on the client's own move
 * (src/lib/booking-limit.ts, migration 041; docs/test-plan.md § 11 «Spam
 * bookings»).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// the confirmation letter goes out after the response; nothing to send here
vi.mock("next/server", () => ({ connection: async () => {}, after: () => {} }));

import { POST as bookRoute } from "@/app/api/bookings/route";
import { POST as moveRoute } from "@/app/api/visit/[token]/move/route";
import { loadAvailability } from "@/lib/availability";
import { book } from "@/lib/booking";
import { BOOKING_LIMITS, noteBooking, withinBookingLimit } from "@/lib/booking-limit";
import { closeDb, query } from "@/lib/db";
import { localParts } from "@/lib/tz";
import { freshDemo, zonedToUtc, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const MIN = 60_000;
const NOW = zonedToUtc("2026-11-16", "10:00", TZ);
const IP = "203.0.113.7";

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});
afterAll(closeDb);

const note = (n: number, o: { ip?: string; kind?: "book" | "move"; at?: number; step?: number } = {}) =>
  (async () => {
    for (let i = 0; i < n; i++) await noteBooking(query, demo.business, o.kind ?? "book", o.ip ?? IP, (o.at ?? NOW) + i * (o.step ?? MIN));
  })();
const within = (o: { ip?: string; kind?: "book" | "move"; now?: number; idempotencyKey?: string } = {}) =>
  withinBookingLimit(query, demo.business, o.kind ?? "book", o.ip ?? IP, { now: o.now ?? NOW + 30 * MIN, idempotencyKey: o.idempotencyKey });

describe("the count", () => {
  it(`lets ${BOOKING_LIMITS.bookPerHour} bookings an hour through from one address, then says no; another address is free`, async () => {
    await note(BOOKING_LIMITS.bookPerHour - 1);
    expect(await within()).toBe(true);
    await note(1, { at: NOW + 10 * MIN });
    expect(await within()).toBe(false);
    expect(await within({ ip: "198.51.100.4" })).toBe(true);
    // an hour after the first ones, the hour's count is down again
    expect(await within({ now: NOW + 75 * MIN })).toBe(true);
  });

  it(`and ${BOOKING_LIMITS.bookPerDay} a day, spread over the hours`, async () => {
    await note(BOOKING_LIMITS.bookPerDay, { step: 25 * MIN });
    const later = NOW + BOOKING_LIMITS.bookPerDay * 25 * MIN + 61 * MIN;
    // the same salon day, an hour after the last one
    expect(localParts(later, TZ).date).toBe(localParts(NOW, TZ).date);
    expect(await within({ now: later })).toBe(false);
  });

  it(`moves count apart: ${BOOKING_LIMITS.movePerHour} an hour, and bookings do not use them up`, async () => {
    await note(BOOKING_LIMITS.bookPerHour);
    expect(await within({ kind: "move" })).toBe(true);
    await note(BOOKING_LIMITS.movePerHour, { kind: "move" });
    expect(await within({ kind: "move", now: NOW + 15 * MIN })).toBe(false);
  });

  it("never limits a request with no address, or from this machine (Next's local server says ::1), and writes nothing for it", async () => {
    for (const ip of ["", "::1", "127.0.0.1", "::ffff:127.0.0.1"]) {
      await note(BOOKING_LIMITS.bookPerDay + 1, { ip });
      expect(await within({ ip }), ip).toBe(true);
    }
    expect(await query("select id from booking_limit")).toHaveLength(0);
    // an address that only starts like one is counted
    await note(1, { ip: "127.0.0.1.example" });
    expect(await query("select id from booking_limit")).toHaveLength(1);
  });

  it("keeps only a code of the address, and only two days", async () => {
    await note(1);
    const [row] = await query<{ ip_hash: string; whole: string }>("select ip_hash, row_to_json(b)::text as whole from booking_limit b");
    expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.whole).not.toContain(IP);
    await note(1, { ip: "198.51.100.4", at: NOW + 2 * 24 * 60 * MIN + MIN });
    expect(await query("select id from booking_limit")).toHaveLength(1);
  });

  it("lets the same tap again through at the limit: its key already booked a visit", async () => {
    await note(BOOKING_LIMITS.bookPerHour);
    const [slot] = (await loadAvailability(query, { business: demo.business, serviceIds: [demo.services.clip], staffId: demo.staff.renat, from: "2026-11-17", days: 1, now: NOW })).days[0].slots;
    const key = `limit-replay-${Math.random()}`;
    const r = await book(
      query,
      demo.business,
      { serviceIds: [demo.services.clip], staffId: demo.staff.renat, startsAt: new Date(slot.start).toISOString(), name: "Test Client", phone: "+372 5555 0601", email: null, comment: "", locale: "ru", smsReminder: false, idempotencyKey: key },
      { now: NOW },
    );
    expect(r.ok).toBe(true);
    expect(await within({ idempotencyKey: key })).toBe(true);
    expect(await within({ idempotencyKey: `limit-other-${Math.random()}` })).toBe(false);
  });
});

/** Free starts for a cut with Renat, from the real clock, 90 minutes apart or more, from tomorrow on: one booked takes none of the others. */
async function freeStarts(n: number): Promise<number[]> {
  const now = Date.now();
  const look = await loadAvailability(query, { business: demo.business, serviceIds: [demo.services.clip], staffId: demo.staff.renat, from: localParts(now, TZ).date, days: 21, now });
  const out: number[] = [];
  for (const d of look.days.slice(1)) {
    let last = -Infinity;
    for (const s of d.slots) {
      if (s.start - last < 90 * MIN) continue;
      out.push(s.start);
      last = s.start;
      if (out.length === n) return out;
    }
  }
  throw new Error(`only ${out.length} free starts`);
}

describe("POST /api/bookings and POST /api/visit/<token>/move", () => {
  const post = (start: number, o: { ip?: string; key?: string; i?: number }) =>
    bookRoute(
      new Request("http://x/api/bookings", {
        method: "POST",
        headers: { "idempotency-key": o.key ?? `limit-route-${Math.random()}-0001`, ...(o.ip ? { "x-real-ip": o.ip } : {}) },
        body: JSON.stringify({ serviceIds: [demo.services.clip], staffId: demo.staff.renat, startsAt: new Date(start).toISOString(), name: "Test Client", phone: `+372 5555 07${String(o.i ?? 0).padStart(2, "0")}`, locale: "ru", smsReminder: false }),
      }),
    );

  it("answer 429 too_many past the limit, book nothing, and still give the same tap its visit back", async () => {
    // these run on the real clock (the route asks it)
    const starts = await freeStarts(BOOKING_LIMITS.bookPerHour + 1);
    const first = `limit-route-first-${Math.random()}`;
    for (let i = 0; i < BOOKING_LIMITS.bookPerHour; i++) {
      const res = await post(starts[i], { ip: IP, key: i === 0 ? first : undefined, i });
      expect(res.status, `booking ${i + 1}`).toBe(201);
    }
    const over = await post(starts[BOOKING_LIMITS.bookPerHour], { ip: IP, i: 50 });
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({ error: "too_many" });
    expect(await query("select id from appointments")).toHaveLength(BOOKING_LIMITS.bookPerHour);
    // the first tap again: its visit, not a refusal
    const again = await post(starts[0], { ip: IP, key: first, i: 0 });
    expect(again.status).toBe(200);
    // from another address, the free time books
    expect((await post(starts[BOOKING_LIMITS.bookPerHour], { ip: "198.51.100.4", i: 51 })).status).toBe(201);
    // counted: the visits booked; not the refusal, not the same tap again
    expect(await query("select id from booking_limit")).toHaveLength(BOOKING_LIMITS.bookPerHour + 1);
  });

  it("the move: 429 too_many past the limit, and the visit stays where it was", async () => {
    const [from, to] = await freeStarts(2);
    const res = await post(from, { i: 60 });
    const { manageUrl } = (await res.json()) as { manageUrl: string };
    const token = manageUrl.split("/").pop()!;
    // the moves just before, a millisecond apart: the same salon day as the route's clock
    await note(BOOKING_LIMITS.movePerHour, { kind: "move", at: Date.now() - 1000, step: 1 });
    const moved = await moveRoute(
      new Request(`http://x/api/visit/${token}/move`, { method: "POST", headers: { "Content-Type": "application/json", "x-real-ip": IP }, body: JSON.stringify({ startsAt: new Date(to).toISOString() }) }),
      { params: Promise.resolve({ token }) } as never,
    );
    expect(moved.status).toBe(429);
    expect(await moved.json()).toEqual({ error: "too_many" });
    const [v] = await query<{ starts_at: Date }>("select starts_at from appointments");
    expect(new Date(v.starts_at).getTime()).toBe(from);
  });
});
