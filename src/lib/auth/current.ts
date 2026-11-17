/**
 * The logged-in staff user for this request: the one place that reads the
 * session cookie (the Data Access Layer of Next's auth guide). Every admin
 * page and every Server Action calls requireAdmin() itself; the check in
 * src/proxy.ts is only a fast redirect for a missing cookie.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import type { Business } from "../availability";
import { currentBusiness } from "../business";
import { query } from "../db";
import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE } from "./cookie";
import { canUseAdmin, createSession, readSession, revokeSession, type StaffUser } from "./sessions";

export const currentStaffUser = cache(async (): Promise<StaffUser | null> => {
  // a session is checked against the clock: always at request time
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? readSession(query, token) : null;
});

/** Renat or the front desk, with the business; anyone else goes to the login page. */
export async function requireAdmin(): Promise<{ user: StaffUser; business: Business }> {
  const user = await currentStaffUser();
  if (!user) redirect("/admin/login");
  if (!canUseAdmin(user)) redirect("/admin/login?e=role");
  const business = await currentBusiness();
  if (!business || business.id !== user.businessId) redirect("/admin/login?e=role");
  return { user, business };
}

export async function requireOwner(): Promise<{ user: StaffUser; business: Business }> {
  const ctx = await requireAdmin();
  if (ctx.user.role !== "owner") redirect("/admin");
  return ctx;
}

/** The client's address. Vercel sets x-real-ip and overwrites x-forwarded-for, so neither can be faked there. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-real-ip") || (h.get("x-forwarded-for") ?? "").split(",")[0] || "").trim().slice(0, 64);
}

/** Start a session and set its cookie. Server Actions only. */
export async function startSession(userId: string): Promise<void> {
  const h = await headers();
  const token = await createSession(query, userId, { userAgent: h.get("user-agent") ?? "", ip: await clientIp() });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
}

/** End this device's session. Server Actions only. */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  await revokeSession(query, jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}
