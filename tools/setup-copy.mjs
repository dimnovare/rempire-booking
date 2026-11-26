#!/usr/bin/env node
/**
 * The salon's setup, from staging to production (docs/move-log.md, D3).
 *
 * Staging's database holds two kinds of rows: the salon's setup (barbers,
 * services, prices and times, hours, shifts, the «Настройки» switches, the
 * profile and gallery), filled from Altegio and edited on staging since, and
 * made-up rows (demo clients, visits, sales, invoices, logins, the logs).
 * Production starts empty. This copies the first kind only, in two steps,
 * so the two database addresses are never in one shell at once:
 *
 *   DATABASE_URL=<staging>    node tools/setup-copy.mjs export --out <file> [--with-invoices] [--business rempire]
 *   DATABASE_URL=<production> node tools/setup-copy.mjs import <file> --dry-run
 *   DATABASE_URL=<production> node tools/setup-copy.mjs import <file>
 *
 * Rules:
 * - Every table is either SETUP (copied) or DATA (never). A test fails when
 *   a migration adds a table that is in neither (tests/setup-copy.test.ts).
 * - Rows keep their ids, so every link between them still holds; links to
 *   rows that are not copied (a login that made a row) become empty.
 * - Shifts and online hours are copied from today on; past days are history.
 * - The invoice setup (the salon's company, the barbers' companies, chair
 *   rents) comes along only with --with-invoices, and the export refuses it
 *   while any of it is still the demo's «Näidis» rows.
 * - The file must be written outside this repository: it is public, and the
 *   file holds the barbers' business details.
 * - Import only into a migrated, empty database at the same migration as
 *   the file (each import starts from an empty one: docs/launch.md, the
 *   dress rehearsal and the real move). One transaction: all or nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sslFor } from "./migrate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

export const FORMAT = 1;

const OF_BUSINESS = "business_id = $1";
const OF_STAFF = "staff_id in (select id from staff where business_id = $1)";
const TODAY = "(select (now() at time zone timezone)::date from businesses where id = $1)";

/**
 * Copied, in this order (a table only points at tables above it).
 * `where` picks the business's rows ($1 is its id); `empty` lists columns
 * that point at rows not copied; `invoices` marks the invoice setup.
 */
export const SETUP = [
  { table: "businesses", where: "id = $1" },
  { table: "locations", where: OF_BUSINESS },
  { table: "location_images", where: "location_id in (select id from locations where business_id = $1)" },
  { table: "service_categories", where: OF_BUSINESS },
  { table: "services", where: OF_BUSINESS },
  { table: "staff", where: OF_BUSINESS },
  { table: "staff_photo", where: OF_STAFF },
  { table: "staff_services", where: OF_STAFF },
  { table: "staff_hours", where: OF_STAFF },
  { table: "staff_day_overrides", where: `${OF_STAFF} and day >= ${TODAY}` },
  { table: "staff_online_hours", where: `${OF_STAFF} and day >= ${TODAY}` },
  { table: "invoice_issuers", where: OF_BUSINESS, invoices: true },
  { table: "invoice_receivers", where: OF_BUSINESS, invoices: true },
  { table: "chair_rents", where: OF_BUSINESS, invoices: true, empty: ["created_by"] },
];

/** Never copied: clients and what they did, staging's test rows, logins, logs, secrets. */
export const DATA = [
  // clients and visits (the Altegio import brings the real ones: D5)
  "clients", "client_photo", "client_comments", "client_files", "client_push_subscriptions",
  "appointments", "appointment_services", "visit_links", "reviews",
  // staging's test rows: time off, special time, requests, sales, invoices
  "time_off", "special_time", "staff_requests", "product_sales", "invoices", "invoice_lines", "invoice_counters",
  // logins and their traces (production gets its own: D4)
  "users", "sessions", "login_codes", "auth_attempts", "push_subscriptions",
  // messages, the bell, logs, the test run, rate limits, Renat's questions page (D7)
  "notifications", "bell", "audit", "problem_reports", "heartbeats", "booking_limit", "geocoder_gate",
  "qa_forms", "qa_answers", "qa_answer_log",
  // a secret: production makes its own
  "review_salt",
  // the migration runner's own list
  "_migrations",
];

/**
 * Besides the SETUP tables, an empty database has none of these. The rest
 * of DATA may hold rows before any import: the migrations write the review
 * salt, the geocoder's gate and audit lines; a first visit to the site
 * writes heartbeats and rate-limit rows.
 */
const MUST_BE_EMPTY = ["users", "clients", "appointments", "product_sales", "invoices"];

/** businesses.settings keys the demo seed keeps for itself. */
const DEMO_SETTING = /^demo/;
/** The demo seed's invoice rows (tools/seed-demo.mjs, DEMO_MONEY). */
const looksDemo = (r) => /^Näidis/i.test(r.legal_name ?? "") || /^0+\d$/.test(r.reg_code ?? "") || r.email === "delivered@resend.dev";

const rowsOf = async (db, sql, params) => ((await db.query(sql, params)) || {}).rows || [];

/** Every applied migration's name, in order. */
async function migrations(db) {
  return (await rowsOf(db, "select name from _migrations order by name")).map((r) => r.name);
}

/**
 * Read the business's setup. Returns the dump (plain JSON, Postgres's own
 * text for every value) or throws with the reason.
 * @param {{query: Function}} db
 * @param {{business?: string, withInvoices?: boolean}} [opts]
 */
export async function exportSetup(db, opts = {}) {
  const slug = opts.business || "rempire";
  const [biz] = await rowsOf(db, "select id from businesses where slug = $1", [slug]);
  if (!biz) throw new Error(`No business «${slug}» in this database.`);
  /** @type {Record<string, any[]>} */
  const tables = {};
  for (const t of SETUP) {
    if (t.invoices && !opts.withInvoices) continue;
    const [r] = await rowsOf(db, `select coalesce(json_agg(x), '[]'::json) as rows from (select * from ${t.table} where ${t.where}) x`, [biz.id]);
    let rows = typeof r.rows === "string" ? JSON.parse(r.rows) : r.rows;
    for (const col of t.empty || []) rows = rows.map((row) => ({ ...row, [col]: null }));
    tables[t.table] = rows;
  }
  for (const b of tables.businesses) {
    b.settings = Object.fromEntries(Object.entries(b.settings || {}).filter(([k]) => !DEMO_SETTING.test(k)));
  }
  if (opts.withInvoices) {
    const demo = [...tables.invoice_issuers, ...tables.invoice_receivers].filter(looksDemo);
    if (demo.length) {
      throw new Error(
        `The invoice setup still holds the demo's rows: ${demo.map((r) => r.legal_name).join(", ")}. ` +
          "Enter the real details on staging first, or export without --with-invoices.",
      );
    }
  }
  return { format: FORMAT, business: slug, exportedAt: new Date().toISOString(), migrations: await migrations(db), withInvoices: Boolean(opts.withInvoices), tables };
}

/** Text values that name staging's host: a copied address would point production at staging. */
function stagingAddresses(dump) {
  const hits = [];
  for (const [table, rows] of Object.entries(dump.tables)) {
    for (const row of rows) {
      for (const [col, v] of Object.entries(row)) {
        const s = typeof v === "string" ? v : v && typeof v === "object" ? JSON.stringify(v) : "";
        if (!s.startsWith("\\x") && /diipsolutions\.eu/i.test(s)) hits.push(`${table}.${col}`);
      }
    }
  }
  return [...new Set(hits)];
}

/** What the file holds, for the dry run and the export's own report. */
export function summary(dump) {
  const out = [`Setup of «${dump.business}», exported ${dump.exportedAt}, ${dump.migrations.length} migrations, invoice setup ${dump.withInvoices ? "included" : "not included"}.`];
  for (const [table, rows] of Object.entries(dump.tables)) out.push(`  ${table.padEnd(20)} ${String(rows.length).padStart(4)}`);
  const staff = dump.tables.staff || [];
  out.push(`  barbers: ${staff.map((s) => `${s.display_name}${s.active ? "" : " (off)"}`).join(", ") || "none"}`);
  const services = dump.tables.services || [];
  out.push(`  services: ${services.filter((s) => s.active).length} on, ${services.filter((s) => !s.active).length} off`);
  out.push(`  settings keys: ${Object.keys(dump.tables.businesses?.[0]?.settings || {}).sort().join(", ") || "none"}`);
  const hosts = stagingAddresses(dump);
  if (hosts.length) out.push(`  WARNING: staging's address in ${hosts.join(", ")}: fix it on staging first, or after the import in production`);
  return out;
}

/** Why this database cannot take the dump; empty when it can. */
export async function checkTarget(db, dump) {
  const problems = [];
  if (dump.format !== FORMAT) problems.push(`The file is format ${dump.format}; this tool reads ${FORMAT}.`);
  const have = await migrations(db).catch(() => null);
  if (!have) return [...problems, "This database has no migrations: deploy production first, so its build migrates it."];
  const want = dump.migrations;
  if (have.join() !== want.join()) {
    const missing = want.filter((m) => !have.includes(m));
    const extra = have.filter((m) => !want.includes(m));
    problems.push(`Migrations differ from the file's${missing.length ? `; missing here: ${missing.join(", ")}` : ""}${extra.length ? `; only here: ${extra.join(", ")}` : ""}. Export again from staging at the same version.`);
  }
  const busy = [];
  for (const table of [...SETUP.map((t) => t.table), ...MUST_BE_EMPTY]) {
    const [r] = await rowsOf(db, `select exists (select 1 from ${table}) as found`).catch(() => [{ found: false }]);
    if (r.found) busy.push(table);
  }
  if (busy.length) problems.push(`This database is not empty (${busy.join(", ")}). The setup goes only into an empty one.`);
  return problems;
}

/**
 * Write the dump into an empty database, in one transaction.
 * Returns the rows written per table.
 */
export async function importSetup(db, dump) {
  const problems = await checkTarget(db, dump);
  if (problems.length) throw new Error(problems.join("\n"));
  /** @type {Record<string, number>} */
  const counts = {};
  await db.query("begin");
  try {
    for (const t of SETUP) {
      const rows = dump.tables[t.table];
      if (!rows) continue;
      if (rows.length) await db.query(`insert into ${t.table} select * from json_populate_recordset(null::${t.table}, $1::json)`, [JSON.stringify(rows)]);
      counts[t.table] = rows.length;
    }
    await db.query("commit");
  } catch (err) {
    await db.query("rollback").catch(() => {});
    throw err;
  }
  return counts;
}

/** The file goes outside the repo: it is public. */
export function outsideRepo(file, repo = REPO) {
  const rel = path.relative(repo, path.resolve(file));
  return rel.startsWith("..") || path.isAbsolute(rel);
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: sslFor(url) });
  await client.connect();
  return client;
}

async function main() {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === "export") {
    const out = arg("--out");
    if (!out) throw new Error("Say where to write the file: --out <file>, outside this repository.");
    if (!outsideRepo(out)) throw new Error("The file must go outside this repository: the repository is public.");
    const db = await connect();
    try {
      const dump = await exportSetup(db, { business: arg("--business"), withInvoices: process.argv.includes("--with-invoices") });
      fs.writeFileSync(out, JSON.stringify(dump));
      for (const line of summary(dump)) console.log(line);
      console.log(`Written: ${out}`);
    } finally {
      await db.end();
    }
    return;
  }
  if (cmd === "import" && file) {
    const dump = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const line of summary(dump)) console.log(line);
    const db = await connect();
    try {
      if (process.argv.includes("--dry-run")) {
        const problems = await checkTarget(db, dump);
        console.log(problems.length ? `Dry run: cannot import.\n${problems.join("\n")}` : "Dry run: this database can take it. Nothing was written.");
        if (problems.length) process.exitCode = 1;
        return;
      }
      const counts = await importSetup(db, dump);
      console.log(`Imported: ${Object.entries(counts).map(([t, n]) => `${t} ${n}`).join(", ")}.`);
    } finally {
      await db.end();
    }
    return;
  }
  console.log("Usage:\n  node tools/setup-copy.mjs export --out <file> [--with-invoices] [--business <slug>]\n  node tools/setup-copy.mjs import <file> [--dry-run]");
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
