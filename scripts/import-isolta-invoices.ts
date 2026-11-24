/**
 * REMPIRE's old invoices from Isolta into «Счета», as history (Dim,
 * 20.11.2026: «Import the issued ones as history»; our numbers go on at
 * 423 after Isolta's last, #422).
 *
 *   DATABASE_URL=… npx tsx scripts/import-isolta-invoices.ts <export.zip | export folder> [--business <slug or id>] [--dry-run]
 *
 * The export is Isolta's «organization-…-export.zip» as it came, or the
 * folder it unpacks to: invoices.csv, contacts.csv and finvoices/*.xml are
 * read; the PDFs are not. How each field lands is src/lib/billing/isolta.ts
 * and db/migrations/027_invoice_import.sql:
 *   - only issued invoices: a draft (no number yet, or «Draft») stays out;
 *   - Isolta's number, dates, both parties, rows and totals as printed;
 *     no payment was ever recorded there, so the list shows the old ones
 *     «просрочен» past their due day, as Isolta did;
 *   - the receiver is ours by registry code, else by name; otherwise one is
 *     made, switched off, and listed in the report;
 *   - the phone of Isolta's contact goes on a receiver made, and on ours
 *     only where it has none (the report counts them, never prints them);
 *   - idempotent: each invoice keeps Isolta's id (source_ref), so a second
 *     run inserts nothing twice and changes nothing that is there;
 *   - our own invoices and the number series are never touched. The report
 *     says whether «Последний номер Isolta» agrees with the highest number
 *     imported.
 * Everything in one transaction: any error, and nothing is written.
 *
 *   --dry-run      reads and matches, prints what it would do, writes nothing
 *   --business     the salon's slug or id (default: the only one, else «rempire»)
 *
 * The export is the salon's real business data: keep it outside the
 * repository (the script refuses a path inside it), never commit it. The
 * report prints counts, years, sums and Isolta's numbers and ids: no
 * receiver's name, code, address, e-mail or phone, and no bank account.
 */
import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import { getBusiness, getBusinessById, type Business } from "../src/lib/availability";
import { applyIsoltaImport, isoltaReport, planIsoltaImport, readIsoltaExport, type IsoltaPlan, type IsoltaResult } from "../src/lib/billing/isolta";
import { closeDb, query, withTx } from "../src/lib/db";

const USAGE = "Usage: npx tsx scripts/import-isolta-invoices.ts <export.zip | export folder> [--business <slug or id>] [--dry-run]";

/** The files that are read: the CSVs and the Finvoice XMLs, never the PDFs. */
const WANTED = /\.(csv|xml)$/i;

/** The repository's own folder: the one with this project's package.json, up from here. */
function repoRoot(from: string): string | null {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { name?: string };
      if (pkg.name === "rempire-booking") return dir;
    } catch {
      /* no package.json here */
    }
    if (path.dirname(dir) === dir) return null;
  }
}

function inside(file: string, dir: string): boolean {
  const rel = path.relative(dir, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** A folder's CSVs and XMLs by their path inside it, three levels down at most; links are not followed. */
function readFolder(root: string): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const walk = (dir: string, rel: string, depth: number) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory() && depth < 3) walk(p, r, depth + 1);
      else if (e.isFile() && WANTED.test(e.name)) files.set(r, new Uint8Array(fs.readFileSync(p)));
    }
  };
  walk(root, "", 0);
  return files;
}

/** A zip's CSVs and XMLs; the PDFs are not even unpacked. */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const out = unzipSync(bytes, { filter: (f) => WANTED.test(f.name) && !f.name.includes("..") });
  return new Map(Object.entries(out));
}

async function businessFor(arg: string | undefined): Promise<Business | null> {
  if (arg) return /^[0-9a-f-]{36}$/i.test(arg) ? getBusinessById(query, arg) : getBusiness(query, arg);
  const all = await query<{ id: string }>("select id from businesses order by created_at");
  return all.length === 1 ? getBusinessById(query, all[0].id) : getBusiness(query, "rempire");
}

export type RunResult = { plan: IsoltaPlan; result: IsoltaResult | null };

/** One run, by its arguments (the command line after the script's name). Returns the plan and what was written; throws with a plain message. */
export async function run(args: readonly string[], log: (line: string) => void = console.log, now = Date.now()): Promise<RunResult> {
  let source: string | undefined;
  let businessArg: string | undefined;
  let dry = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dry-run") dry = true;
    else if (a === "--business") businessArg = args[++i];
    else if (a.startsWith("--business=")) businessArg = a.slice("--business=".length);
    else if (a.startsWith("--")) throw new Error(`Unknown option ${a}. ${USAGE}`);
    else if (source) throw new Error(USAGE);
    else source = a;
  }
  if (!source || (args.includes("--business") && !businessArg)) throw new Error(USAGE);

  const abs = path.resolve(source);
  const root = repoRoot(process.cwd()) ?? repoRoot(path.dirname(abs));
  if (root && inside(abs, root)) throw new Error("The Isolta export is the salon's real data: keep it outside the repository, never commit it.");
  if (!process.env.DATABASE_URL && process.env.DB_DRIVER !== "pglite") throw new Error("Set DATABASE_URL (the database to import into).");
  if (!fs.existsSync(abs)) throw new Error(`No such file or folder: ${source}`);

  const files = fs.statSync(abs).isDirectory() ? readFolder(abs) : readZip(new Uint8Array(fs.readFileSync(abs)));
  const exp = readIsoltaExport(files);
  if (!exp.rows.length) throw new Error(`Nothing to import: ${exp.problems.join("; ") || "invoices.csv has no rows"}.`);

  const business = await businessFor(businessArg);
  if (!business) throw new Error(`No salon «${businessArg ?? "rempire"}».`);

  try {
    const out = dry
      ? { plan: await planIsoltaImport(query, business, exp, now), result: null }
      : await withTx(async (tx) => {
          const plan = await planIsoltaImport(tx, business, exp, now);
          return { plan, result: await applyIsoltaImport(tx, plan) };
        });
    for (const line of isoltaReport(out.plan, out.result)) log(line);
    return out;
  } catch (err) {
    if (err instanceof Error && err.message === "no_issuer") throw new Error("This salon has no invoice issuer yet: add REMPIRE's company in «Счета» → «Настройки» first.");
    throw err;
  }
}

// from the command line (npx tsx scripts/import-isolta-invoices.ts …); a test imports run() instead
if (/import-isolta-invoices\.[cm]?[jt]s$/.test(process.argv[1] ?? "")) {
  run(process.argv.slice(2))
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
