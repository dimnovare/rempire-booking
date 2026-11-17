/**
 * The one database door, as in the shop (rempire-web/src/lib/db.ts): plain
 * SQL with $1 placeholders through query() and withTx(), no ORM.
 *
 *   const rows = await query<{ id: string }>("select id from staff where slug = $1", [slug]);
 *   await withTx(async (q) => { await q("select … for update", [id]); await q("insert …"); });
 *
 * Two drivers:
 *   - Postgres via `pg` (default). One pool on globalThis, so a warm
 *     serverless instance and Next's dev reloads reuse it.
 *   - PGlite (in-memory Postgres) when DB_DRIVER=pglite: tests, and a local
 *     run without a server.
 *
 * jsonb: pass jsonbParam(value) and cast in SQL ($1::jsonb).
 */
import path from "node:path";
import type { Pool, PoolClient } from "pg";

export type Row = Record<string, unknown>;
export type Querier = <T = Row>(sql: string, params?: unknown[]) => Promise<T[]>;

type Raw = {
  kind: "pg" | "pglite";
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  batch: (sql: string) => Promise<void>;
  tx: <T>(fn: (q: Querier) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};

const g = globalThis as unknown as { __bookingDb?: Promise<Raw>; __bookingPgliteSeed?: Blob };

/* Postgres refuses U+0000 in text and jsonb; nothing here needs it. */
const NUL_RE = new RegExp(String.fromCharCode(0), "g");
export function stripNul<T>(value: T): T {
  if (typeof value === "string") return value.replace(NUL_RE, "") as T;
  if (Array.isArray(value)) return value.map(stripNul) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[stripNul(k)] = stripNul(v);
    return out as T;
  }
  return value;
}

/** JSON for a `$n::jsonb` parameter. */
export function jsonbParam(value: unknown): string {
  return JSON.stringify(stripNul(value) ?? null);
}

function cleanParams(params?: unknown[]): unknown[] | undefined {
  return params?.map((p) => (typeof p === "string" || Array.isArray(p) ? stripNul(p) : p));
}

/**
 * TLS to the database, decided by env only (the shop's rule):
 *   a local host or ?sslmode=disable ⇒ no TLS;
 *   DATABASE_SSL_CA (PEM)            ⇒ the chain must end in that CA;
 *   DATABASE_SSL_NO_VERIFY=1         ⇒ encrypted, not verified.
 *
 * With DATABASE_SSL_CA the host name is not compared. Railway's Postgres makes
 * its own CA on first start (root.key never leaves the volume) and names its
 * certificate only localhost and postgres.railway.internal, never the public
 * proxy host Vercel dials. A CA that signs this one database and nothing else
 * already proves which server answered; the name check would only fail.
 * Same words as tools/migrate.mjs sslFor().
 */
export function sslFor(url: string, env: Record<string, string | undefined> = process.env) {
  if (/localhost|127\.0\.0\.1|\[::1\]/.test(url)) return undefined;
  if (/[?&]sslmode=disable/.test(url)) return undefined;
  const ca = (env.DATABASE_SSL_CA ?? "").trim();
  if (env.DATABASE_SSL_NO_VERIFY === "1") return { rejectUnauthorized: false };
  return ca ? { rejectUnauthorized: true, ca, checkServerIdentity: () => undefined } : { rejectUnauthorized: true };
}

async function makePg(): Promise<Raw> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. For a database-free run use DB_DRIVER=pglite.");
  const ssl = sslFor(url);
  if (ssl && ssl.rejectUnauthorized === false) console.warn("[db] DATABASE_SSL_NO_VERIFY=1: the database certificate is NOT verified.");
  const pg = (await import("pg")).default;
  const pool: Pool = new pg.Pool({
    connectionString: url,
    ssl,
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (err) => console.error("[db] idle client error:", err.message));
  return {
    kind: "pg",
    query: (sql, params) => pool.query(sql, cleanParams(params) as unknown[]),
    batch: async (sql) => {
      await pool.query(sql);
    },
    async tx<T>(fn: (q: Querier) => Promise<T>): Promise<T> {
      const client: PoolClient = await pool.connect();
      try {
        await client.query("begin");
        const q: Querier = async <T2>(sql: string, params?: unknown[]) =>
          (await client.query(sql, cleanParams(params) as unknown[])).rows as T2[];
        const out = await fn(q);
        await client.query("commit");
        return out;
      } catch (err) {
        try {
          await client.query("rollback");
        } catch {
          /* the connection is gone; the transaction died with it */
        }
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

type PgliteTx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
type PgliteDb = PgliteTx & {
  exec: (sql: string) => Promise<unknown>;
  transaction: <T>(fn: (tx: PgliteTx) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};

/*
 * PGlite: Postgres in memory (or in PGLITE_PATH). Tests hand in a migrated
 * snapshot (tests/helpers.ts). Otherwise it migrates itself on start and,
 * with SEED_DEMO=yes, loads the demo data: a local run, or staging before
 * it has a real database. Everything in it is gone on a restart.
 */
async function makePglite(): Promise<Raw> {
  const tools = await import("../../tools/migrate.mjs");
  const seed = g.__bookingPgliteSeed;
  let db: PgliteDb;
  if (seed) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
    db = new PGlite({ loadDataDir: seed, extensions: { btree_gist } }) as unknown as PgliteDb;
  } else {
    db = (await tools.newPglite(process.env.PGLITE_PATH || undefined)) as unknown as PgliteDb;
    await tools.migrate(db, { dir: path.join(process.cwd(), "db", "migrations") });
    if (process.env.SEED_DEMO === "yes") {
      const { seedDemo, seedDemoSpecial, seedDemoSales, seedOwnerQa, OWNER_QA, DEMO_QA } = await import("../../tools/seed-demo.mjs");
      await seedDemo(db);
      await seedDemoSpecial(db);
      await seedDemoSales(db);
      await seedOwnerQa(db, [...OWNER_QA, DEMO_QA]);
      // a local run: logins at example.test, by e-mail code, and fake visits
      // for today and tomorrow (tools/seed-demo.mjs)
      if (process.env.DEMO_LOGINS === "yes") {
        const local = await import("../../tools/seed-demo.mjs");
        await local.seedDemoLogins(db);
        await local.seedDemoVisits(db);
      }
    }
    // the first owner login, from ADMIN_BOOTSTRAP_* (a local run)
    const { bootstrapOwner } = await import("../../tools/bootstrap-owner.mjs");
    await bootstrapOwner(db);
  }
  return {
    kind: "pglite",
    query: (sql, params) => db.query(sql, cleanParams(params) as unknown[]),
    batch: async (sql) => {
      await db.exec(sql);
    },
    async tx<T>(fn: (q: Querier) => Promise<T>): Promise<T> {
      return db.transaction(async (tx) => {
        const q: Querier = async <T2>(sql: string, params?: unknown[]) =>
          (await tx.query(sql, cleanParams(params) as unknown[])).rows as T2[];
        return fn(q);
      });
    },
    close: () => db.close(),
  };
}

/**
 * DB_DRIVER: "pg" (default) needs DATABASE_URL; "pglite" is in-memory;
 * "auto" is pg when DATABASE_URL is set, else in-memory (staging before A3).
 */
export function dbKind(env: Record<string, string | undefined> = process.env): "pg" | "pglite" {
  const d = env.DB_DRIVER;
  if (d === "pglite") return "pglite";
  if (d === "auto") return env.DATABASE_URL ? "pg" : "pglite";
  return "pg";
}

/** True when a database can be reached at all. */
export function dbConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return dbKind(env) === "pglite" || !!env.DATABASE_URL;
}

function driver(): Promise<Raw> {
  if (!g.__bookingDb) {
    g.__bookingDb = (dbKind() === "pglite" ? makePglite() : makePg()).catch((err) => {
      g.__bookingDb = undefined; // never cache a failed connection
      throw err;
    });
  }
  return g.__bookingDb;
}

/** Run one statement; returns its rows. */
export async function query<T = Row>(sql: string, params?: unknown[]): Promise<T[]> {
  const res = await (await driver()).query(sql, params);
  return (res.rows || []) as T[];
}

/** Run a batch of statements. No parameters: never build one from input. */
export async function exec(sql: string): Promise<void> {
  await (await driver()).batch(sql);
}

/** Several statements as one transaction; a throw rolls it all back. */
export async function withTx<T>(fn: (q: Querier) => Promise<T>): Promise<T> {
  return (await driver()).tx(fn);
}

/** Close the pool (tests, scripts). */
export async function closeDb(): Promise<void> {
  const pending = g.__bookingDb;
  g.__bookingDb = undefined;
  if (pending) await (await pending).close();
}
