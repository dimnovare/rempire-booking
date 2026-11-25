/**
 * Staff login: a password, or a 6-digit code by e-mail as the backup
 * (Dim's choice, kickoff §2). Google comes when its OAuth client exists
 * (src/lib/auth/google.ts).
 *
 * Every answer to a stranger is the same: a wrong e-mail and a wrong
 * password both say «wrong e-mail or password», «send me a code» always
 * says «sent if the address is known», and the code form then says «wrong
 * code» and «code expired» to every address alike (a stranger's address
 * gets a code nobody can type). Tries are counted in auth_attempts:
 *   - password: 8 failures per e-mail or 30 per IP in 15 minutes ⇒ wait;
 *   - code: 5 tries per code, 10 minutes per code;
 *   - sending codes: 3 per e-mail and 10 per IP an hour.
 */
import { createHash, randomBytes, randomInt } from "node:crypto";
import { hashPassword, passwordProblem, verifyPassword } from "../../../tools/password.mjs";
import type { Querier } from "../db";
import { EmailDisabled, sendEmail } from "../email";
import { loginCodeLetter } from "../letters";
import { staffUrl } from "../site";
import { backfillRights } from "./rights-store";
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

export type CodeSendResult = "sent" | "wait" | "disabled" | "failed";

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
  const known = !!u && u.active;
  // A stranger's address gets a code too, one that is never sent and never
  // six digits: the code form then says «wrong code» and «code expired»
  // to every address alike, and never tells which ones have a login.
  const code = known ? String(randomInt(0, 1_000_000)).padStart(6, "0") : randomBytes(16).toString("hex");
  // one live code per address: a new one replaces the old
  await q("update login_codes set used_at = $2 where email = $1 and used_at is null", [email, new Date(now)]);
  await q("insert into login_codes (email, code_hash, expires_at, created_at) values ($1, $2, $3, $4)", [email, codeHash(email, code), new Date(now + LIMITS.codeTtlMin * MIN), new Date(now)]);
  if (!known) return "sent";
  try {
    // a letter to staff: its pictures come from the staff address (src/lib/site.ts)
    const letter = loginCodeLetter(code, LIMITS.codeTtlMin, staffUrl().origin);
    await send(email, letter.subject, letter);
  } catch (err) {
    if (err instanceof EmailDisabled) return "disabled";
    // the provider refused (unverified sender, a bad key, an outage): say so, never the address
    console.error("login code e-mail failed:", err instanceof Error ? err.message : err);
    return "failed";
  }
  return "sent";
}

export type CodeLoginResult = { ok: true; userId: string } | { ok: false; code: "bad" | "expired" | "wait" };

export async function loginWithCode(q: Querier, emailRaw: string, codeRaw: string, ip: string, now = Date.now()): Promise<CodeLoginResult> {
  const email = normalizeEmail(emailRaw);
  const code = String(codeRaw ?? "").replace(/\s/g, "");
  const since = now - LIMITS.passwordWindowMin * MIN;
  if ((await failures(q, "code", "ip", ip, since)) >= LIMITS.passwordPerIp || (await failures(q, "code", "email", email, since)) >= LIMITS.passwordPerEmail) {
    return { ok: false, code: "wait" };
  }
  // Claim one try in one statement: parallel requests each take their own
  // try, so a code never gets more than codeTries comparisons.
  const [c] = await q<{ id: string; code_hash: string; attempts: number }>(
    `update login_codes set attempts = attempts + 1
      where id = (select id from login_codes where email = $1 and used_at is null order by created_at desc limit 1 for update)
        and expires_at > $2 and attempts < $3
      returning id, code_hash, attempts`,
    [email, new Date(now), LIMITS.codeTries],
  );
  if (!c) {
    // none, expired, or out of tries: that code is done
    await q("update login_codes set used_at = $2 where email = $1 and used_at is null", [email, new Date(now)]);
    await record(q, "code", email, ip, false, now);
    return { ok: false, code: "expired" };
  }
  if (!/^\d{6}$/.test(code) || codeHash(email, code) !== c.code_hash) {
    await record(q, "code", email, ip, false, now);
    return { ok: false, code: c.attempts >= LIMITS.codeTries ? "expired" : "bad" };
  }
  // single use: of two parallel right answers, only one gets the row
  const [used] = await q<{ id: string }>("update login_codes set used_at = $2 where id = $1 and used_at is null returning id", [c.id, new Date(now)]);
  const [u] = used ? await q<UserRow>("select id, password_hash, active from users where email = $1", [email]) : [];
  await record(q, "code", email, ip, !!u?.active, now);
  return u?.active ? { ok: true, userId: u.id } : { ok: false, code: used ? "bad" : "expired" };
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

/**
 * The owner adds a login (a barber, the front desk). A password is optional:
 * the code works without one. `staffId` is the barber the login is: always
 * for a barber's login, and for an owner or admin who cuts too (Renat), so
 * the app opens on his own day and his column's pushes reach him.
 *
 * The new login starts with the rights its role had before there were
 * rights (src/lib/auth/rights-store.ts): written here, at once. They are
 * then changed on its own page under «Доступ».
 */
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
    [businessId, email, name, input.role, input.staffId || null, pw ? await hashPassword(pw) : null],
  );
  if (!row) return { ok: false, field: "email_taken" };
  await backfillRights(q, businessId);
  return { ok: true, id: row.id };
}

/**
 * Link an owner's or admin's login to the barber he is, or unlink it
 * (`staffId` null). Only a barber of the same business. A barber's own
 * login keeps its barber: that one is switched off and added anew.
 */
export async function setUserStaff(q: Querier, businessId: string, userId: string, staffId: string | null): Promise<boolean> {
  const rows = await q<{ id: string }>(
    `update users u set staff_id = $3::uuid, updated_at = now()
      where u.id = $1 and u.business_id = $2 and u.role in ('owner', 'admin') and u.deleted_at is null
        and ($3::uuid is null or exists (select 1 from staff s where s.id = $3::uuid and s.business_id = $2))
      returning u.id`,
    [userId, businessId, staffId],
  );
  return rows.length > 0;
}

/**
 * Switch a login of this business on or off; off ends its sessions. False if no such login here.
 * (That an owner always stays is the door's rule, account/actions.ts: nobody
 * switches himself off, and an owner's login is switched only by an owner.)
 */
export async function setUserActive(q: Querier, businessId: string, userId: string, active: boolean): Promise<boolean> {
  const hit = await q<{ id: string }>("update users set active = $3, updated_at = now() where id = $1 and business_id = $2 and deleted_at is null returning id", [userId, businessId, active]);
  if (!hit.length) return false;
  if (!active) await revokeOtherSessions(q, userId, null);
  return true;
}

/** How long «Вернуть» can bring a deleted login back. The toast shows it for 10 seconds; the server allows a slow click. */
export const RESTORE_MINUTES = 10;

/**
 * «Удалить вход» (048_user_delete.sql): the login leaves every list and can
 * never log in again, but its row stays, for the visits, sales, invoices
 * and history that name it. Its e-mail is freed for a new login (the row's
 * becomes «deleted-<id>@deleted.invalid»: no code or password reaches it),
 * its Google link is cleared, it is off and every session of it ends. What
 * it was is kept in `deleted_was` for «Вернуть». The change history gets a
 * «Удаление» row by `actorId`. False if no such login here.
 * (Whose login may be deleted is the door's rule, account/actions.ts.)
 */
export async function deleteUser(q: Querier, businessId: string, userId: string, actorId: string): Promise<boolean> {
  const hit = await q<{ id: string }>(
    `with d as (
       update users
          set deleted_at = now(),
              deleted_was = jsonb_build_object('email', email, 'google_sub', google_sub, 'active', active),
              email = 'deleted-' || id::text || '@deleted.invalid', google_sub = null, active = false, updated_at = now()
        where id = $1 and business_id = $2 and deleted_at is null
        returning id)
     insert into audit (actor, entity, entity_id, action) select $3, 'user', id, 'delete' from d returning entity_id as id`,
    [userId, businessId, actorId],
  );
  if (!hit.length) return false;
  await revokeOtherSessions(q, userId, null);
  return true;
}

/**
 * «Вернуть» after «Удалить вход»: the login as it was (its e-mail, Google
 * link, on or off, its rights), within RESTORE_MINUTES. "taken": a new
 * login has its e-mail meanwhile; "gone": too late, or no such deleted
 * login here.
 */
export async function restoreUser(q: Querier, businessId: string, userId: string, actorId: string, now = Date.now()): Promise<"ok" | "taken" | "gone"> {
  const [u] = await q<{ was: { email?: string; google_sub?: string | null; active?: boolean }; deleted_at: Date }>(
    "select deleted_was as was, deleted_at from users where id = $1 and business_id = $2 and deleted_at is not null",
    [userId, businessId],
  );
  if (!u || !u.was?.email || now - new Date(u.deleted_at).getTime() > RESTORE_MINUTES * 60_000) return "gone";
  try {
    const hit = await q<{ id: string }>(
      `with r as (
         update users
            set email = $3::text,
                google_sub = case when exists (select 1 from users o where o.google_sub = $4::text) then null else $4::text end,
                active = $5::boolean, deleted_at = null, deleted_was = null, updated_at = now()
          where id = $1 and business_id = $2 and deleted_at is not null
            and not exists (select 1 from users o where o.email = $3::text)
          returning id)
       insert into audit (actor, entity, entity_id, action) select $6, 'user', id, 'restore' from r returning entity_id as id`,
      [userId, businessId, u.was.email, u.was.google_sub ?? null, u.was.active === true, actorId],
    );
    return hit.length ? "ok" : "taken";
  } catch (e) {
    // a new login took the e-mail at the same moment
    if ((e as { code?: string }).code === "23505") return "taken";
    throw e;
  }
}

export type UserListItem = { id: string; email: string; name: string; role: Role; staffId: string | null; active: boolean; hasPassword: boolean; lastLoginAt: string | null };

export async function listUsers(q: Querier, businessId: string): Promise<UserListItem[]> {
  const rows = await q<{ id: string; email: string; name: string; role: Role; staff_id: string | null; active: boolean; has_password: boolean; last_login_at: Date | null }>(
    `select id, email, name, role, staff_id, active, (password_hash is not null) as has_password, last_login_at
       from users where business_id = $1 and deleted_at is null order by active desc, role, email`,
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
