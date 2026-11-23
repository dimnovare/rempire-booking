import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as cronGet } from "@/app/api/cron/outbox/route";
import { GET as healthGet, HEAD as healthHead } from "@/app/api/health/route";
import { GET as cronHealthGet } from "@/app/api/health/cron/route";
import { closeDb, query, type Querier } from "@/lib/db";
import { bookingHealth, cronHealth, HEALTH, stampHeartbeat } from "@/lib/health";
import { freshDemo } from "./helpers";

// the routes ask for a request first (connection()); a test has none
vi.mock("next/server", () => ({ connection: async () => {}, after: () => {} }));

afterAll(closeDb);

const NOW = Date.UTC(2026, 10, 23, 10, 0);

describe("bookingHealth: can the booking take a visit", () => {
  beforeEach(async () => {
    await freshDemo();
  });

  it("ok on a database with the salon in it", async () => {
    expect(await bookingHealth(query, { DB_DRIVER: "pglite" })).toEqual({ ok: true, db: "ok", store: "memory" });
  });

  it("down when the database fails, is slow or holds no salon", async () => {
    const failing: Querier = async () => {
      throw new Error("connect ECONNREFUSED");
    };
    expect(await bookingHealth(failing, { DB_DRIVER: "pglite" })).toMatchObject({ ok: false, db: "down" });
    const empty: Querier = async <T,>() => [{ n: 0 }] as T[];
    expect(await bookingHealth(empty, { DB_DRIVER: "pglite" })).toMatchObject({ ok: false, db: "down" });
    const slow: Querier = <T,>() => new Promise<T[]>((r) => setTimeout(() => r([{ n: 1 }] as T[]), HEALTH.dbTimeoutMs + 500));
    expect(await bookingHealth(slow, { DB_DRIVER: "pglite" })).toMatchObject({ ok: false, db: "down" });
  }, 10_000);

  it("missing without a database; a throwaway one is down on the live site", async () => {
    expect(await bookingHealth(query, { DB_DRIVER: "pg" })).toEqual({ ok: false, db: "missing", store: "postgres" });
    // DB_DRIVER=auto without DATABASE_URL: bookings would be lost
    expect(await bookingHealth(query, { DB_DRIVER: "auto", ALLOW_INDEXING: "yes" })).toEqual({ ok: false, db: "ok", store: "memory" });
    // on staging (indexing off) the demo database is the point
    expect(await bookingHealth(query, { DB_DRIVER: "auto" })).toMatchObject({ ok: true, store: "memory" });
  });

  it("/api/health answers 200 or 503, HEAD with no body", async () => {
    // the tests run as the live site (vitest.config.mts) on an in-memory database: that is 503
    const live = await healthGet();
    expect(live.status).toBe(503);
    expect(await live.json()).toEqual({ ok: false, db: "ok", store: "memory" });
    const saved = process.env.ALLOW_INDEXING;
    try {
      delete process.env.ALLOW_INDEXING;
      const res = await healthGet();
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.json()).toMatchObject({ ok: true, db: "ok" });
      const head = await healthHead();
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
    } finally {
      process.env.ALLOW_INDEXING = saved;
    }
  });
});

describe("cronHealth: did the message job run lately", () => {
  beforeEach(async () => {
    await freshDemo();
  });
  const env = { CRON_SECRET: "x" };

  it("never, then ok, then late after 15 minutes, failed after a failed run", async () => {
    expect(await cronHealth(query, NOW, env)).toMatchObject({ ok: false, state: "never" });
    await stampHeartbeat(query, "cron", true, { sent: 2 }, NOW);
    expect(await cronHealth(query, NOW + 5 * 60_000, env)).toEqual({ ok: true, state: "ok", last: new Date(NOW).toISOString(), minutesAgo: 5 });
    expect(await cronHealth(query, NOW + (HEALTH.cronLateMin + 1) * 60_000, env)).toMatchObject({ ok: false, state: "late" });
    await stampHeartbeat(query, "cron", false, {}, NOW + 60_000);
    expect(await cronHealth(query, NOW + 2 * 60_000, env)).toMatchObject({ ok: false, state: "failed" });
  });

  it("not expected without CRON_SECRET; db_down when the database fails", async () => {
    expect(await cronHealth(query, NOW, {})).toMatchObject({ ok: false, state: "not_configured" });
    const failing: Querier = async () => {
      throw new Error("down");
    };
    expect(await cronHealth(failing, NOW, env)).toMatchObject({ ok: false, state: "db_down" });
  });

  it("a cron run leaves its stamp, and /api/health/cron reads it", async () => {
    const saved = process.env.CRON_SECRET;
    try {
      process.env.CRON_SECRET = "test-cron-secret-value";
      expect((await cronHealthGet()).status).toBe(503);
      const run = await cronGet(new Request("http://localhost/api/cron/outbox", { headers: { authorization: "Bearer test-cron-secret-value" } }));
      expect(run.status).toBe(200);
      const [row] = await query<{ ok: boolean; detail: { sent: number } }>("select ok, detail from heartbeats where name = 'cron'");
      expect(row.ok).toBe(true);
      expect(typeof row.detail.sent).toBe("number");
      const res = await cronHealthGet();
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, state: "ok", minutesAgo: 0 });
    } finally {
      if (saved === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = saved;
    }
  });
});
