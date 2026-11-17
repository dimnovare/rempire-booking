/**
 * Staff sessions. The browser keeps a random token in an httpOnly cookie;
 * the database keeps only its sha-256 (sessions.token_hash). A session ends
 * after SESSION_IDLE_DAYS without use, on «Log out», or when the user is
 * switched off.
 *
 * No Next.js here: src/lib/auth/current.ts reads the cookie and calls these.
 */
import { randomBytes } from "node:crypto";
import { hashToken } from "../booking";
import type { Querier } from "../db";

export type Role = "owner" | "admin" | "staff";

export type StaffUser = {
  id: string;
  businessId: string;
  email: string;
  name: string;
  role: Role;
  staffId: string | null;
  locale: string;
  hasPassword: boolean;
  sessionId: string;
};

/** Days of no use before a session ends. The barber app stays logged in. */
export const SESSION_IDLE_DAYS = 90;
const DAY = 86_400_000;
const TOKEN_RE = /^[A-Za-z0-9_-]{30,100}$/;

export async function createSession(q: Querier, userId: string, meta: { userAgent?: string; ip?: string } = {}, now = Date.now()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await q(
    `insert into sessions (user_id, token_hash, created_at, last_seen_at, expires_at, user_agent, ip)
     values ($1, $2, $3, $3, $4, $5, $6)`,
    [userId, hashToken(token), new Date(now), new Date(now + SESSION_IDLE_DAYS * DAY), String(meta.userAgent ?? "").slice(0, 300), String(meta.ip ?? "").slice(0, 64)],
  );
  await q("update users set last_login_at = $2 where id = $1", [userId, new Date(now)]);
  return token;
}

type Row = {
  session_id: string;
  expires_at: Date;
  last_seen_at: Date;
  id: string;
  business_id: string;
  email: string;
  name: string;
  role: Role;
  staff_id: string | null;
  locale: string;
  has_password: boolean;
};

/** The user behind a cookie token, or null. A used session slides forward (at most once an hour). */
export async function readSession(q: Querier, token: string | null | undefined, now = Date.now()): Promise<StaffUser | null> {
  if (!token || !TOKEN_RE.test(token)) return null;
  const [r] = await q<Row>(
    `select s.id as session_id, s.expires_at, s.last_seen_at,
            u.id, u.business_id, u.email, u.name, u.role, u.staff_id, u.locale, (u.password_hash is not null) as has_password
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.revoked_at is null and u.active`,
    [hashToken(token)],
  );
  if (!r || new Date(r.expires_at).getTime() <= now) return null;
  if (now - new Date(r.last_seen_at).getTime() > 3_600_000) {
    await q("update sessions set last_seen_at = $2, expires_at = $3 where id = $1", [r.session_id, new Date(now), new Date(now + SESSION_IDLE_DAYS * DAY)]);
  }
  return {
    id: r.id,
    businessId: r.business_id,
    email: r.email,
    name: r.name,
    role: r.role,
    staffId: r.staff_id,
    locale: r.locale,
    hasPassword: r.has_password,
    sessionId: r.session_id,
  };
}

export async function revokeSession(q: Querier, token: string | null | undefined): Promise<void> {
  if (!token || !TOKEN_RE.test(token)) return;
  await q("update sessions set revoked_at = now() where token_hash = $1 and revoked_at is null", [hashToken(token)]);
}

/** Every session of a user but `keepSessionId` (a password change logs the other devices out). */
export async function revokeOtherSessions(q: Querier, userId: string, keepSessionId: string | null): Promise<void> {
  await q("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null and ($2::uuid is null or id <> $2::uuid)", [userId, keepSessionId]);
}

/** Who may open Renat's admin. A barber gets the barber app (Phase B). */
export const canUseAdmin = (u: Pick<StaffUser, "role"> | null): boolean => u?.role === "owner" || u?.role === "admin";
