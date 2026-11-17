#!/usr/bin/env node
/**
 * Migration runner, as in the shop (rempire-web/tools/migrate.mjs).
 * Plain SQL files in db/migrations/NNN_name.sql, applied in filename order,
 * each recorded in _migrations so it never runs twice. A whole file runs as
 * one batch, so $$ blocks and semicolons inside strings are safe.
 *
 *   npm run migrate                    # against DATABASE_URL
 *   DB_DRIVER=pglite npm run migrate   # a throwaway in-memory PGlite (smoke test)
 *   node tools/migrate.mjs --if-configured   # postbuild: skips when DATABASE_URL is unset
 *
 * Tests import { migrate } and hand it their own PGlite. On Vercel the
 * postbuild step migrates before the new build goes live, so a migration
 * must keep the previous build working (add columns, never rename).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.join(HERE, "..", "db", "migrations");

async function rows(db, sql, params) {
  const res = await db.query(sql, params);
  return (res && res.rows) || [];
}

async function runBatch(db, sql) {
  if (typeof db.exec === "function") return db.exec(sql); // PGlite
  return db.query(sql); // node-postgres: simple query protocol, several statements
}

/** Every migration file, LF line ends, in order. */
export function migrationFiles(dir = MIGRATIONS_DIR) {
  return fs
    .readdirSync(/* turbopackIgnore: true */ dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(/* turbopackIgnore: true */ path.join(dir, name), "utf8").replace(/\r\n/g, "\n") }));
}

/**
 * Apply every pending migration; returns the names applied.
 * @param {{query: Function, exec?: Function}} db
 * @param {{dir?: string, log?: (msg: string) => void}} [opts]
 */
export async function migrate(db, opts = {}) {
  const log = opts.log || (() => {});
  await runBatch(db, `create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now());`);
  const done = new Set((await rows(db, "select name from _migrations")).map((r) => r.name));
  const applied = [];
  for (const m of migrationFiles(opts.dir)) {
    if (done.has(m.name)) continue;
    log(`→ ${m.name}`);
    await runBatch(db, m.sql);
    await db.query("insert into _migrations (name) values ($1)", [m.name]);
    applied.push(m.name);
  }
  return applied;
}

/**
 * Same rule as src/lib/db.ts sslFor(); keep the two in step. With
 * DATABASE_SSL_CA the chain must end in that CA and the host name is not
 * compared (Railway's certificate never names the public proxy host).
 */
export function sslFor(url, env = process.env) {
  if (/localhost|127\.0\.0\.1|\[::1\]/.test(url)) return undefined;
  if (/[?&]sslmode=disable/.test(url)) return undefined;
  const ca = (env.DATABASE_SSL_CA ?? "").trim();
  if (env.DATABASE_SSL_NO_VERIFY === "1") return { rejectUnauthorized: false };
  return ca ? { rejectUnauthorized: true, ca, checkServerIdentity: () => undefined } : { rejectUnauthorized: true };
}

/** A PGlite with the extensions the migrations need. */
export async function newPglite(dataDir) {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  // options-only form: PGlite(undefined, opts) would drop the options
  return new PGlite({ ...(dataDir ? { dataDir } : {}), extensions: { btree_gist } });
}

async function main() {
  const log = (m) => console.log(m);
  if ((process.env.DB_DRIVER || "pg") === "pglite") {
    const db = await newPglite(process.env.PGLITE_PATH || undefined);
    const applied = await migrate(db, { log });
    console.log(applied.length ? `Applied ${applied.length} migration(s) to PGlite.` : "PGlite already up to date.");
    await db.close();
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url && process.argv.includes("--if-configured")) {
    console.log("Migrations skipped (DATABASE_URL is not set).");
    return;
  }
  if (!url) {
    console.error("DATABASE_URL is not set. Put it in .env.local, or run with DB_DRIVER=pglite.");
    process.exit(1);
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: sslFor(url) });
  await client.connect();
  try {
    const applied = await migrate(client, { log });
    console.log(applied.length ? `Applied ${applied.length} migration(s).` : "Database already up to date.");
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
