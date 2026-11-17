/**
 * Staff login: a password, or a 6-digit code by e-mail as the backup
 * (Dim's choice, kickoff §2). Google comes when its OAuth client exists
 * (src/lib/auth/google.ts).
 *
 * Every answer to a stranger is the same: a wrong e-mail and a wrong
 * password both say «wrong e-mail or password», and «send me a code» always
 * says «sent if the address is known». Tries are counted in auth_attempts:
 *   - password: 8 failures per e-mail or 30 per IP in 15 minutes ⇒ wait;
 *   - code: 5 tries per code, 10 minutes per code;
 *   - sending codes: 3 per e-mail and 10 per IP an hour.
 */
import { createHash, randomInt } from "node:crypto";
import { hashPassword, passwordProblem, verifyPassword } from "../../../tools/password.mjs";
import type { Querier } from "../db";
import { EmailDisabled, sendEmail } from "../email";
import { revokeOtherSessions, type Role } from "./sessions";

const MIN = 60_000;
export const LIMITS = {
  passwordPerEmail: 8,
  passwordPerIp: 30,
  passwordWindowMin: 15,
  codeTries: 5,
  codeTtlMin: 10,
  codeSendsPerEmail: 3,
  codeSendsPerIp: 10,
  codeSendWindowMin: 60,
};

export const normalizeEmail = (s: unknown) => String(s ?? "").trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (s: string) => s.length <= 254 && EMAIL_RE.test(s);

type UserRow = { id: string; password_hash: string | null; active: boolean };

async function failures(q: Querier, kind: string, col: "email" | "ip", value: string, sinceMs: number): Promise<number> {
  if (!value) return 0;
  const [r] = await q<{ n: number }>(`select count(*)::int as n from auth_attempts where kind = $1 and ${col} = $2 and not ok and at > $3`, [kind, value, new Date(sinceMs)]);
  return r?.n ?? 0;
}

async function record(q: Querier, kind: string, email: string, ip: string, ok: boolean, now: number) {
  await q("insert into auth_attempts (at, kind, email, ip, ok) values ($1, $2, $3, $4, $5)", [new Date(now), kind, email.slice(0, 254), ip.slice(0, 64), ok]);
}

export type LoginResult = { ok: true; userId: string } | { ok: false; code: "bad" | "wait" };

export async function loginWithPassword(q: Querier, emailRaw: string, password: string, ip: string, now = Date.now()): Promise<LoginResult> {
  const email = normalizeEmail(emailRaw);
  const since = now - LIMITS.passwordWindowMin * MIN;
  if ((await failures(q, "password", "email", email, since)) >= LIMITS.passwordPerEmail || (await failures(q, "password", "ip", ip, since)) >= LIMITS.passwordPerIp) {
    return { ok: false, code: "wait" };
  }
  const [u] = isEmail(email) ? await q<UserRow>("select id, password_hash, active from users where email = $1", [email]) : [];
  // the same scrypt work whether or not the user exists
  const match = await verifyPassword(String(password ?? ""), u?.password_hash ?? null);
  const ok = !!u && u.active && match;
  await record(q, "password", email, ip, ok, now);
  return ok ? { ok: true, userId: u.id } : { ok: false, code: "bad" };
}

const codeHash = (email: string, code: string) => createHash("sha256").update(`${email}:${code}`).digest("hex");

export type CodeSendResult = "sent" | "wait" | "disabled";

/**
 * «Send me a code». Says «sent» for an unknown address too; only a known,
 * active user gets a letter.
 */
export async function sendLoginCode(q: Querier, emailRaw: string, ip: string, now = Date.now(), send = sendEmail): Promise<CodeSendResult> {
  const email = normalizeEmail(emailRaw);
  if (!isEmail(email)) return "sent";
  const since = now - LIMITS.codeSendWindowMin * MIN;
  const [byEmail] = await q<{ n: number }>("select count(*)::int as n from auth_attempts where kind = 'code_send' and email = $1 and at > $2", [email, new Date(since)]);
  const [byIp] = ip ? await q<{ n: number }>("select count(*)::int as n from auth_attempts where kind = 'code_send' and ip = $1 and at > $2", [ip, new Date(since)]) : [{ n: 0 }];
  if (byEmail.n >= LIMITS.codeSendsPerEmail || byIp.n >= LIMITS.codeSendsPerIp) return "wait";
  await record(q, "code_send", email, ip, true, now);
  const [u] = await q<UserRow>("select id, password_hash, active from users where email = $1", [email]);
  if (!u || !u.active) return "sent";
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // one live code per address: a new one replaces the old
  await q("update login_codes set used_at = $2 where email = $1 and used_at is null", [email, new Date(now)]);
  await q("insert into login_codes (email, code_hash, expires_at, created_at) values ($1, $2, $3, $4)", [email, codeHash(email, code), new Date(now + LIMITS.codeTtlMin * MIN), new Date(now)]);
  try {
    await send(email, `REMPIRE: ${code}`, `Код для входа: ${code}\nLogin code: ${code}\n\nДействует ${LIMITS.codeTtlMin} минут. Valid for ${LIMITS.codeTtlMin} minutes.\nЕсли вы не входили, просто удалите это письмо.`);
  } catch (err) {
    if (err instanceof EmailDisabled) return "disabled";
    throw err;
  }
  return "sent";
}

export type CodeLoginResult = { ok: true; userId: string } | { ok: false; code: "bad" | "expired" | "wait" };

export async function loginWithCode(q: Querier, emailRaw: string, codeRaw: string, ip: string, now = Date.now()): Promise<CodeLoginResult> {
  const email = normalizeEmail(emailRaw);
  const code = String(codeRaw ?? "").replace(/\s/g, "");
  if ((await failures(q, "code", "ip", ip, now - LIMITS.passwordWindowMin * MIN)) >= LIMITS.passwordPerIp) return { ok: false, code: "wait" };
  const [c] = await q<{ id: string; code_hash: string; expires_at: Date; attempts: number }>(
    "select id, code_hash, expires_at, attempts from login_codes where email = $1 and used_at is null order by created_at desc limit 1",
    [email],
  );
  if (!c) {
    await record(q, "code", email, ip, false, now);
    return { ok: false, code: "expired" };
  }
  if (new Date(c.expires_at).getTime() <= now || c.attempts >= LIMITS.codeTries) {
    await q("update login_codes set used_at = $2 where id = $1", [c.id, new Date(now)]);
    await record(q, "code", email, ip, false, now);
    return { ok: false, code: "expired" };
  }
  if (!/^\d{6}$/.test(code) || codeHash(email, code) !== c.code_hash) {
    await q("update login_codes set attempts = attempts + 1 where id = $1", [c.id]);
    await record(q, "code", email, ip, false, now);
    return { ok: false, code: c.attempts + 1 >= LIMITS.codeTries ? "expired" : "bad" };
  }
  const [u] = await q<UserRow>("select id, password_hash, active from users where email = $1", [email]);
  await q("update login_codes set used_at = $2 where id = $1", [c.id, new Date(now)]);
  await record(q, "code", email, ip, !!u?.active, now);
  return u?.active ? { ok: true, userId: u.id } : { ok: false, code: "bad" };
}

/** A new password for a logged-in user; their other devices are logged out. */
export async function changePassword(
  q: Querier,
  userId: string,
  sessionId: string | null,
  current: string | null,
  next: string,
): Promise<"ok" | "short" | "long" | "wrong"> {
  const problem = passwordProblem(next);
  if (problem) return problem as "short" | "long";
  const [u] = await q<UserRow>("select id, password_hash, active from users where id = $1", [userId]);
  if (!u) return "wrong";
  // a user who logged in by code and has no password yet sets one without the old
  if (u.password_hash && !(await verifyPassword(String(current ?? ""), u.password_hash))) return "wrong";
  await q("update users set password_hash = $2, updated_at = now() where id = $1", [userId, await hashPassword(next)]);
  await revokeOtherSessions(q, userId, sessionId);
  return "ok";
}

export type UserInput = { email: string; name: string; role: Role; staffId: string | null; password?: string | null };

/** The owner adds a login (a barber, the front desk). A password is optional: the code works without one. */
export async function createUser(q: Querier, businessId: string, input: UserInput): Promise<{ ok: true; id: string } | { ok: false; field: string }> {
  const email = normalizeEmail(input.email);
  if (!isEmail(email)) return { ok: false, field: "email" };
  if (!["owner", "admin", "staff"].includes(input.role)) return { ok: false, field: "role" };
  const name = String(input.name ?? "").trim().slice(0, 120);
  const pw = input.password ? String(input.password) : "";
  if (pw && passwordProblem(pw)) return { ok: false, field: "password" };
  const [row] = await q<{ id: string }>(
    `insert into users (business_id, email, name, role, staff_id, password_hash)
     values ($1, $2, $3, $4, $5, $6) on conflict (email) do nothing returning id`,
    [businessId, email, name, input.role, input.role === "staff" ? input.staffId : null, pw ? await hashPassword(pw) : null],
  );
  return row ? { ok: true, id: row.id } : { ok: false, field: "email_taken" };
}

/** Switch a login on or off. Off ends its sessions. */
export async function setUserActive(q: Querier, businessId: string, userId: string, active: boolean): Promise<void> {
  await q("update users set active = $3, updated_at = now() where id = $1 and business_id = $2", [userId, businessId, active]);
  if (!active) await revokeOtherSessions(q, userId, null);
}

export type UserListItem = { id: string; email: string; name: string; role: Role; staffId: string | null; active: boolean; hasPassword: boolean; lastLoginAt: string | null };

export async function listUsers(q: Querier, businessId: string): Promise<UserListItem[]> {
  const rows = await q<{ id: string; email: string; name: string; role: Role; staff_id: string | null; active: boolean; has_password: boolean; last_login_at: Date | null }>(
    `select id, email, name, role, staff_id, active, (password_hash is not null) as has_password, last_login_at
       from users where business_id = $1 order by active desc, role, email`,
    [businessId],
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    staffId: r.staff_id,
    active: r.active,
    hasPassword: r.has_password,
    lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
  }));
}
