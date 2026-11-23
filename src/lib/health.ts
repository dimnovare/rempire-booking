/**
 * Is the booking up? Two answers for the uptime monitor (docs/launch.md,
 * B7; docs/test-plan.md § 11):
 *
 * - `bookingHealth`: the database answers, and it is a real one. On the
 *   live site (indexing on) a throwaway in-memory database counts as down:
 *   bookings made there are lost (DB_DRIVER=auto without DATABASE_URL).
 * - `cronHealth`: the message job (/api/cron/outbox, every 5 minutes) ran
 *   lately and finished. Booking still works without it, but reminders and
 *   pushes stop, so it has a monitor of its own.
 *
 * Neither answer carries an error message or any client's data.
 */
import { dbConfigured, dbKind, type Querier } from "@/lib/db";
import { indexingAllowed } from "@/lib/indexing";

type Env = Record<string, string | undefined>;

export const HEALTH = {
  /** How long the database may take to answer `select 1`. */
  dbTimeoutMs: 3000,
  /** The cron runs every 5 minutes: three missed runs and it is late. */
  cronLateMin: 15,
} as const;

export type BookingHealth = {
  ok: boolean;
  db: "ok" | "down" | "missing";
  store: "postgres" | "memory";
};

export type CronHealth = {
  ok: boolean;
  /** «not_configured»: no CRON_SECRET, so no cron is expected here. */
  state: "ok" | "late" | "failed" | "never" | "not_configured" | "db_down";
  last: string | null;
  minutesAgo: number | null;
};

function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function bookingHealth(q: Querier, env: Env = process.env): Promise<BookingHealth> {
  const store = dbKind(env) === "pglite" ? "memory" : "postgres";
  if (!dbConfigured(env)) return { ok: false, db: "missing", store };
  let db: BookingHealth["db"] = "ok";
  try {
    // a business must be there too: an empty database books nobody
    const rows = await within(q<{ n: number }>("select count(*)::int as n from businesses"), HEALTH.dbTimeoutMs);
    if (!rows[0] || rows[0].n < 1) db = "down";
  } catch {
    db = "down";
  }
  const live = indexingAllowed(env);
  return { ok: db === "ok" && !(live && store === "memory"), db, store };
}

export async function cronHealth(q: Querier, now = Date.now(), env: Env = process.env): Promise<CronHealth> {
  if (!env.CRON_SECRET) return { ok: false, state: "not_configured", last: null, minutesAgo: null };
  let rows: { at: Date | string; ok: boolean }[];
  try {
    rows = await within(q<{ at: Date | string; ok: boolean }>("select at, ok from heartbeats where name = 'cron'"), HEALTH.dbTimeoutMs);
  } catch {
    return { ok: false, state: "db_down", last: null, minutesAgo: null };
  }
  const row = rows[0];
  if (!row) return { ok: false, state: "never", last: null, minutesAgo: null };
  const at = new Date(row.at);
  const minutesAgo = Math.floor((now - at.getTime()) / 60_000);
  const state: CronHealth["state"] = !row.ok ? "failed" : minutesAgo > HEALTH.cronLateMin ? "late" : "ok";
  return { ok: state === "ok", state, last: at.toISOString(), minutesAgo };
}

/** The cron's own stamp, at the end of every run (src/app/api/cron/outbox/route.ts). */
export async function stampHeartbeat(q: Querier, name: string, ok: boolean, detail: Record<string, number | string | boolean> = {}, now = Date.now()): Promise<void> {
  await q(
    `insert into heartbeats (name, at, ok, detail) values ($1, $2, $3, $4::jsonb)
     on conflict (name) do update set at = excluded.at, ok = excluded.ok, detail = excluded.detail`,
    [name, new Date(now), ok, JSON.stringify(detail)],
  );
}
