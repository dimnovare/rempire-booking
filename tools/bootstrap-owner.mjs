#!/usr/bin/env node
/**
 * The first owner login (Renat, or Dim while building), from two env vars:
 *
 *   ADMIN_BOOTSTRAP_EMAIL     the owner's e-mail (Config)
 *   ADMIN_BOOTSTRAP_PASSWORD  their first password (Secret), 8+ characters
 *
 * Dim puts the values into Vercel; they never go into git or chat.
 * postbuild runs this after the migrations and the demo seed:
 *
 *   node tools/bootstrap-owner.mjs --if-configured
 *
 * It only adds what is missing: a new owner, or a password for an owner who
 * has none. A password changed since in the admin is never overwritten, so
 * the env var can be deleted once the owner has logged in.
 */
import { pathToFileURL } from "node:url";
import { sslFor } from "./migrate.mjs";
import { hashPassword, passwordProblem } from "./password.mjs";

/**
 * @param {{query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}>}} db
 * @param {Record<string, string | undefined>} [env]
 * @param {(msg: string) => void} [log]
 * @returns {Promise<"created" | "password_set" | "kept" | "skipped">}
 */
export async function bootstrapOwner(db, env = process.env, log = () => {}) {
  const email = String(env.ADMIN_BOOTSTRAP_EMAIL ?? "").trim().toLowerCase();
  const password = String(env.ADMIN_BOOTSTRAP_PASSWORD ?? "");
  if (!email || !password) return "skipped";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    log("Owner bootstrap skipped: ADMIN_BOOTSTRAP_EMAIL is not an e-mail address.");
    return "skipped";
  }
  if (passwordProblem(password)) {
    log("Owner bootstrap skipped: ADMIN_BOOTSTRAP_PASSWORD needs 8 to 200 characters.");
    return "skipped";
  }
  const slug = env.BUSINESS_SLUG || "rempire";
  const biz = (await db.query("select id from businesses where slug = $1", [slug])).rows[0];
  if (!biz) {
    log(`Owner bootstrap skipped: no business «${slug}» yet.`);
    return "skipped";
  }
  const user = (await db.query("select id, password_hash from users where email = $1", [email])).rows[0];
  if (user && user.password_hash) return "kept";
  const hash = await hashPassword(password);
  if (user) {
    await db.query("update users set password_hash = $2, updated_at = now() where id = $1 and password_hash is null", [user.id, hash]);
    return "password_set";
  }
  await db.query(
    `insert into users (business_id, email, name, password_hash, role) values ($1, $2, '', $3, 'owner')
     on conflict (email) do nothing`,
    [biz.id, email, hash],
  );
  return "created";
}

async function main() {
  const env = process.env;
  if (!env.ADMIN_BOOTSTRAP_EMAIL || !env.ADMIN_BOOTSTRAP_PASSWORD) {
    console.log("Owner bootstrap skipped (ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD not set).");
    return;
  }
  const url = env.DATABASE_URL;
  if (!url) {
    if (process.argv.includes("--if-configured")) {
      console.log("Owner bootstrap skipped (DATABASE_URL is not set).");
      return;
    }
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: sslFor(url) });
  await client.connect();
  try {
    const out = await bootstrapOwner(client, env, (m) => console.log(m));
    // never print the e-mail or the password: build logs are read by others
    console.log(`Owner bootstrap: ${out}.`);
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
