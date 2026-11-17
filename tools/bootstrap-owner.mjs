#!/usr/bin/env node
/**
 * The first owner login (Renat, or Dim while building), from two env vars:
 *
 *   ADMIN_BOOTSTRAP_EMAIL     the owner's e-mail (Config); or a list split
 *                             by «;», «,» or spaces: the first address gets
 *                             the password, the others become owners with no
 *                             password (they sign in with the e-mail code or
 *                             Google), so no password is shared
 *   ADMIN_BOOTSTRAP_PASSWORD  the first owner's first password (Secret), 8+ characters
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The addresses in ADMIN_BOOTSTRAP_EMAIL, lower-case, in order, once each. */
export function bootstrapEmails(raw) {
  const out = [];
  for (const part of String(raw ?? "").split(/[;,\s]+/)) {
    const e = part.trim().toLowerCase();
    if (e && !out.includes(e)) out.push(e);
  }
  return out;
}

/**
 * @param {{query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}>}} db
 * @param {Record<string, string | undefined>} [env]
 * @param {(msg: string) => void} [log]
 * @returns {Promise<"created" | "password_set" | "kept" | "skipped">} what happened to the first owner
 */
export async function bootstrapOwner(db, env = process.env, log = () => {}) {
  const all = bootstrapEmails(env.ADMIN_BOOTSTRAP_EMAIL);
  const password = String(env.ADMIN_BOOTSTRAP_PASSWORD ?? "");
  if (!all.length || !password) return "skipped";
  const emails = all.filter((e) => EMAIL_RE.test(e));
  if (emails.length < all.length) log(`Owner bootstrap: ${all.length - emails.length} entry(ies) in ADMIN_BOOTSTRAP_EMAIL are not e-mail addresses and were left out.`);
  if (!emails.length) {
    log("Owner bootstrap skipped: ADMIN_BOOTSTRAP_EMAIL has no e-mail address.");
    return "skipped";
  }
  const [email, ...others] = emails;
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
  // the others: owners without a password; an existing login is left as it is
  let added = 0;
  for (const e of others) {
    const r = await db.query(
      `insert into users (business_id, email, name, role) values ($1, $2, '', 'owner')
       on conflict (email) do nothing returning id`,
      [biz.id, e],
    );
    added += r.rows.length;
  }
  if (others.length) log(`Owner bootstrap: ${added} more owner(s) added without a password, ${others.length - added} already there.`);

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
