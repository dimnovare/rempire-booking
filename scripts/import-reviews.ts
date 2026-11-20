/**
 * The clients' reviews from Altegio into the reviews table (migration 023;
 * Dim, 20.11.2026: «Import now, show ★ on the booking page»).
 *
 *   DATABASE_URL=… npx tsx scripts/import-reviews.ts <file.json> [--dry-run] [--no-mask] [--business=rempire]
 *
 * The file is a JSON array, one object per review:
 *
 *   [
 *     {
 *       "date":   "20.11.2026 14:32",   // or "2026-11-20", "2026-11-20 14:32", "20.11.2026",
 *                                        // or an ISO moment with its offset; the salon's clock
 *       "rating": 5,                     // a whole number 1–5 ("5" works too)
 *       "text":   "…",                   // what the client wrote; may be "" or left out
 *       "name":   "…",                   // the name the review shows
 *       "barber": "Valentin Nachinov",   // as Altegio writes him; "" or «О компании»: the salon
 *       "phone":  "+372 5…"              // optional: finds the client's card, never stored
 *     }
 *   ]
 *
 * What it does:
 *   - a barber is found by his whole name, else by his first name or slug
 *     when only one barber has it; a name that finds nobody is imported as
 *     «О компании» and listed at the end: fix the name and run it again;
 *   - a phone links the review to the client's card and is then dropped;
 *   - each review's key is a hash of its date, name and text (source_ref),
 *     so a second run of the same file changes nothing, and a corrected
 *     file updates the rows in place. A review hidden in the admin stays
 *     hidden;
 *   - everything in one transaction: any error, and nothing is written.
 *
 * Masked by default (Dim, 19.11.2026: staging gets clients masked; the real
 * data only at the move to rempire.ee). With the mask, the author's name is
 * stored as its first letter and a dot («К.»). The key is made from the
 * name as written, so `--no-mask` at the move updates the same rows with
 * the whole names. Phones are never stored either way.
 *
 *   --dry-run      reads, matches and reports, then rolls everything back
 *   --no-mask      the whole names (the move to rempire.ee only)
 *   --business=    the salon's slug (default: rempire)
 *
 * The data file holds real clients' names: keep it outside the repository.
 * The script refuses a file inside it. Nothing here prints a name or a
 * phone; the report has counts, places in the file and barbers' names.
 */
import fs from "node:fs";
import path from "node:path";
import { getBusiness } from "../src/lib/availability";
import { closeDb, query, withTx } from "../src/lib/db";
import { importReviews, type ReviewImportReport } from "../src/lib/reviews";

const USAGE = "Usage: npx tsx scripts/import-reviews.ts <file.json> [--dry-run] [--no-mask] [--business=rempire]";

class DryRun extends Error {
  constructor(readonly report: ReviewImportReport) {
    super("dry run");
  }
}

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

function print(r: ReviewImportReport, opts: { dry: boolean; mask: boolean }, log: (line: string) => void) {
  const lines = [
    `${opts.dry ? "DRY RUN, nothing written. " : ""}${opts.mask ? "Names masked (first letter)." : "Whole names (--no-mask)."}`,
    `Read ${r.read}: ${r.inserted} new, ${r.updated} updated, ${r.unchanged} unchanged, ${r.skipped.length} skipped.`,
    `About the salon (no barber): ${r.company}. Linked to a client's card by phone: ${r.clientsFound}; phones with no card: ${r.phonesMissed}.`,
  ];
  for (const s of r.skipped) lines.push(`  skipped #${s.at}: ${s.why}`);
  const missed = Object.entries(r.staffMissed);
  if (missed.length) {
    lines.push("Barbers not found (imported as «О компании» until the name matches; fix and run again):");
    for (const [name, n] of missed) lines.push(`  «${name}»: ${n}`);
  }
  log(lines.join("\n"));
}

/** One run, by its arguments (the command line after the script's name). Returns the report; throws with a plain message. */
export async function run(args: readonly string[], log: (line: string) => void = console.log): Promise<ReviewImportReport> {
  const file = args.find((a) => !a.startsWith("--"));
  const dry = args.includes("--dry-run");
  const mask = !args.includes("--no-mask");
  const slug = args.find((a) => a.startsWith("--business="))?.slice("--business=".length) || "rempire";
  const unknown = args.filter((a) => a.startsWith("--") && a !== "--dry-run" && a !== "--no-mask" && !a.startsWith("--business="));
  if (!file || unknown.length) throw new Error(unknown.length ? `Unknown option ${unknown.join(" ")}. ${USAGE}` : USAGE);

  const abs = path.resolve(file);
  const root = repoRoot(process.cwd()) ?? repoRoot(path.dirname(abs));
  if (root && inside(abs, root)) throw new Error("The reviews file holds real clients' names: keep it outside the repository, never commit it.");
  if (!process.env.DATABASE_URL && process.env.DB_DRIVER !== "pglite") throw new Error("Set DATABASE_URL (the database to import into).");

  const items: unknown = JSON.parse(fs.readFileSync(abs, "utf8"));
  if (!Array.isArray(items)) throw new Error("The file must hold a JSON array of reviews.");
  const business = await getBusiness(query, slug);
  if (!business) throw new Error(`No salon with the slug «${slug}».`);

  try {
    const report = await withTx(async (q) => {
      const r = await importReviews(q, business, items, { mask });
      // a dry run: undo it all, and still say what it would have done
      if (dry) throw new DryRun(r);
      return r;
    });
    print(report, { dry, mask }, log);
    return report;
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
    print(err.report, { dry, mask }, log);
    return err.report;
  }
}

// from the command line (npx tsx scripts/import-reviews.ts …); a test imports run() instead
if (/import-reviews\.[cm]?[jt]s$/.test(process.argv[1] ?? "")) {
  run(process.argv.slice(2))
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
