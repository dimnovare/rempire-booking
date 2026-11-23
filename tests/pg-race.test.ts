/**
 * Two people, one time, on a real Postgres (docs/test-plan.md § 2 items 2
 * and 3). PGlite has one connection, so there two bookings never meet; here
 * they do, through the pool, as on Vercel with Railway.
 *
 * Runs only with PG_TEST_URL, a local database whose name ends in «_test»:
 * it is emptied and migrated from nothing first. CI starts one (postgres:18
 * service, .github/workflows/ci.yml). Locally:
 *
 *   docker run -d --rm --name booking-pg-test -p 127.0.0.1:55432:5432 \
 *     -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=booking_test postgres:18
 *   PG_TEST_URL=postgres://postgres@127.0.0.1:55432/booking_test npx vitest run tests/pg-race.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// the confirmation letter goes out after the response; nothing to send here
vi.mock("next/server", () => ({ connection: async () => {}, after: () => {} }));

import pg from "pg";
import { POST as bookRoute } from "@/app/api/bookings/route";
import { getBusiness, loadAvailability, type Business } from "@/lib/availability";
import { closeDb, dbKind, query } from "@/lib/db";
import { localParts } from "@/lib/tz";
import { migrate } from "../tools/migrate.mjs";
import { seedDemo } from "../tools/seed-demo.mjs";

const URL_ = process.env.PG_TEST_URL ?? "";
const TZ = "Europe/Tallinn";

/** Only a local database meant for this: never staging, never the shop. */
function safe(url: string): boolean {
  try {
    const u = new URL(url);
    return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) && /_test$/.test(u.pathname.slice(1));
  } catch {
    return false;
  }
}

const saved = { DB_DRIVER: process.env.DB_DRIVER, DATABASE_URL: process.env.DATABASE_URL, DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX };
let business: Business;
let services: Record<string, string>;
let staff: Record<string, string>;

describe.skipIf(!URL_)("on Postgres (PG_TEST_URL)", () => {
  beforeAll(async () => {
    if (!safe(URL_)) throw new Error("PG_TEST_URL must be a local database whose name ends in _test: it is emptied");
    const c = new pg.Client({ connectionString: URL_ });
    await c.connect();
    try {
      await c.query("drop schema public cascade; create schema public;");
      // every migration, from an empty database
      await migrate(c);
      await seedDemo(c);
    } finally {
      await c.end();
    }
    await closeDb();
    process.env.DB_DRIVER = "pg";
    process.env.DATABASE_URL = URL_;
    // enough connections for every request below to hold one at once
    process.env.DATABASE_POOL_MAX = "12";
    expect(dbKind()).toBe("pg");
    business = (await getBusiness(query, "rempire"))!;
    services = Object.fromEntries((await query<{ slug: string; id: string }>("select slug, id from services")).map((r) => [r.slug, r.id]));
    staff = Object.fromEntries((await query<{ slug: string; id: string }>("select slug, id from staff")).map((r) => [r.slug, r.id]));
  }, 120_000);

  afterAll(async () => {
    await closeDb();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  let n = 0;
  const post = (o: { start: number; staffId: string | null; key?: string }) =>
    bookRoute(
      new Request("http://x/api/bookings", {
        method: "POST",
        headers: { "idempotency-key": o.key ?? `pg-race-${++n}-${Math.random()}` },
        body: JSON.stringify({
          serviceIds: [services.clip],
          staffId: o.staffId,
          startsAt: new Date(o.start).toISOString(),
          name: "Race Test Client",
          phone: `+372 5555 08${String(n % 100).padStart(2, "0")}`,
          locale: "ru",
          smsReminder: false,
        }),
      }),
    );

  /** The first free start from tomorrow on that `need` barbers can all take (the real clock: the route asks it). */
  async function freeStart(staffId: string | null, need = 1): Promise<{ start: number; staffIds: string[] }> {
    const now = Date.now();
    const look = await loadAvailability(query, { business, serviceIds: [services.clip], staffId, from: localParts(now, TZ).date, days: 21, now });
    for (const d of look.days.slice(1)) {
      const s = d.slots.find((x) => x.staffIds.length >= need && new Set(x.extras).size === 1);
      if (s) return { start: s.start, staffIds: s.staffIds };
    }
    throw new Error(`no free start for ${need} barbers`);
  }

  const visitsAt = (start: number) => query<{ staff_id: string }>("select staff_id from appointments where starts_at = $1 and status <> 'cancelled'", [new Date(start).toISOString()]);

  it("eight people tap one barber's same time at once: one visit, seven «time taken»", async () => {
    const { start } = await freeStart(staff.renat);
    const answers = await Promise.all(Array.from({ length: 8 }, () => post({ start, staffId: staff.renat })));
    const codes = answers.map((r) => r.status).sort();
    expect(codes).toEqual([201, 409, 409, 409, 409, 409, 409, 409]);
    for (const r of answers.filter((a) => a.status === 409)) {
      const j = (await r.json()) as { error: string; alternatives: unknown[] };
      expect(j.error).toBe("slot_taken");
      expect(Array.isArray(j.alternatives)).toBe(true);
      // the time just taken is not offered back
      expect(j.alternatives.map((a) => (a as number[])[0])).not.toContain(start);
    }
    expect(await visitsAt(start)).toHaveLength(1);
  });

  it("«anyone» at a time three or more barbers have free, two more people than barbers at once: one visit per free barber, two «time taken»", async () => {
    const { start, staffIds } = await freeStart(null, 3);
    const free = staffIds.length;
    const before = (await visitsAt(start)).length;
    const answers = await Promise.all(Array.from({ length: free + 2 }, () => post({ start, staffId: null })));
    const codes = answers.map((r) => r.status);
    expect(codes.filter((s) => s === 201)).toHaveLength(free);
    expect(codes.filter((s) => s === 409)).toHaveLength(2);
    const rows = await visitsAt(start);
    expect(rows).toHaveLength(before + free);
    // each chair once: the barbers free then are each booked once
    expect(new Set(rows.map((r) => r.staff_id)).size).toBe(before + free);
    expect(staffIds.every((id) => rows.some((r) => r.staff_id === id))).toBe(true);
  });

  it("ten bookings at once from one address, each at its own free time: six go through, four are «too many»", async () => {
    const now = Date.now();
    const look = await loadAvailability(query, { business, serviceIds: [services.clip], staffId: staff.jevgeni, from: localParts(now, TZ).date, days: 28, now });
    // his free starts, 90 minutes apart or more: one booked takes none of the others
    const starts: number[] = [];
    for (const d of look.days.slice(1)) {
      let last = -Infinity;
      for (const s of d.slots) if (s.start - last >= 90 * 60_000 && starts.length < 10) starts.push((last = s.start));
    }
    expect(starts).toHaveLength(10);
    const ip = "203.0.113.50";
    const answers = await Promise.all(
      starts.map((start) =>
        bookRoute(
          new Request("http://x/api/bookings", {
            method: "POST",
            headers: { "idempotency-key": `pg-race-burst-${++n}-${Math.random()}`, "x-real-ip": ip },
            body: JSON.stringify({ serviceIds: [services.clip], staffId: staff.jevgeni, startsAt: new Date(start).toISOString(), name: "Race Test Client", phone: `+372 5555 09${String(n % 100).padStart(2, "0")}`, locale: "ru", smsReminder: false }),
          }),
        ),
      ),
    );
    const codes = answers.map((r) => r.status).sort();
    expect(codes).toEqual([201, 201, 201, 201, 201, 201, 429, 429, 429, 429]);
    expect(await query("select id from booking_limit")).toHaveLength(6);
  });

  it("the same tap sent three times at once: one visit, and each answer is that visit", async () => {
    const { start } = await freeStart(staff.slava);
    const key = `pg-race-same-${Math.random()}`;
    const answers = await Promise.all(Array.from({ length: 3 }, () => post({ start, staffId: staff.slava, key })));
    for (const r of answers) expect([200, 201]).toContain(r.status);
    expect(answers.filter((r) => r.status === 201)).toHaveLength(1);
    const ids = new Set(await Promise.all(answers.map(async (r) => ((await r.json()) as { visit: { id: string } }).visit.id)));
    expect(ids.size).toBe(1);
    expect((await visitsAt(start)).filter((v) => v.staff_id === staff.slava)).toHaveLength(1);
  });
});
