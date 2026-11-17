/**
 * Staff passwords: scrypt from node:crypto, no native module (docs/data-model.md).
 * One file for the app (src/lib/auth) and the scripts (tools/bootstrap-owner.mjs),
 * so both write and read the same format:
 *
 *   scrypt$<N>$<r>$<p>$<salt base64url>$<hash base64url>
 *
 * The parameters are stored with each hash, so they can be raised later
 * without breaking old passwords.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

/** @returns {Promise<Buffer>} */
function scrypt(password, salt, keylen, opts) {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Too short, too long, or fine (null). */
export function passwordProblem(password) {
  const s = String(password ?? "");
  if (s.length < PASSWORD_MIN) return "short";
  if (s.length > PASSWORD_MAX) return "long";
  return null;
}

/** @param {string} password */
export async function hashPassword(password) {
  const problem = passwordProblem(password);
  if (problem) throw new Error(`password ${problem}`);
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/**
 * True when `password` matches `stored`. A missing or malformed hash is
 * false, after the same work as a real check, so timing tells nothing.
 * @param {string} password
 * @param {string | null | undefined} stored
 */
export async function verifyPassword(password, stored) {
  const parts = String(stored ?? "").split("$");
  const ok = parts.length === 6 && parts[0] === "scrypt";
  const n = ok ? Number(parts[1]) : N;
  const r = ok ? Number(parts[2]) : R;
  const p = ok ? Number(parts[3]) : P;
  const sane = Number.isInteger(n) && n >= 1024 && n <= 1 << 20 && Number.isInteger(r) && r >= 1 && r <= 32 && Number.isInteger(p) && p >= 1 && p <= 16;
  const salt = ok ? Buffer.from(parts[4], "base64url") : Buffer.alloc(16);
  const want = ok ? Buffer.from(parts[5], "base64url") : Buffer.alloc(KEYLEN);
  const s = String(password ?? "").slice(0, PASSWORD_MAX).normalize("NFKC");
  const got = await scrypt(s, salt, want.length || KEYLEN, sane ? { N: n, r, p } : { N, r: R, p: P });
  return ok && sane && want.length > 0 && got.length === want.length && timingSafeEqual(got, want);
}
