/**
 * The logged-in staff user for this request: the one place that reads the
 * session cookie (the Data Access Layer of Next's auth guide). Every admin
 * page and every Server Action calls requireAdmin() itself, every barber
 * app page and action requireStaff(); the check in src/proxy.ts is only a
 * fast redirect for a missing cookie.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import type { Business } from "../availability";
import { currentBusiness } from "../business";
import { query } from "../db";
import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE, VIEW_AS_COOKIE } from "./cookie";
import { canUseAdmin, createSession, readSession, revokeSession, type StaffUser } from "./sessions";

export const currentStaffUser = cache(async (): Promise<StaffUser | null> => {
  // a session is checked against the clock: always at request time
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? readSession(query, token) : null;
});

/** Renat or the front desk, with the business; a barber goes to his app, anyone else to the login page. */
export async function requireAdmin(): Promise<{ user: StaffUser; business: Business }> {
  const user = await currentStaffUser();
  if (!user) redirect("/admin/login");
  if (!canUseAdmin(user)) redirect(user.role === "staff" ? "/b" : "/admin/login?e=role");
  const business = await currentBusiness();
  if (!business || business.id !== user.businessId) redirect("/admin/login?e=role");
  return { user, business };
}

/** Any logged-in login of this business (the barber app's own pages: settings, the barber picker). */
export async function requireStaffUser(): Promise<{ user: StaffUser; business: Business }> {
  const user = await currentStaffUser();
  if (!user) redirect("/b/login");
  const business = await currentBusiness();
  if (!business || business.id !== user.businessId) redirect("/b/login?e=role");
  return { user, business };
}

export type BarberCtx = {
  user: StaffUser;
  business: Business;
  /** the one column this request may see and change */
  staff: { id: string; name: string; photoUrl: string | null };
  /** Renat or the front desk looking at the barber app as this barber */
  viewing: boolean;
};

/**
 * The barber app (Phase B): a barber gets his own column and nothing else;
 * every barber page and Server Action calls this and works only on
 * `staff.id`. An owner or admin picks a barber first (/b/pick), so Renat
 * sees what that barber sees.
 */
export async function requireStaff(): Promise<BarberCtx> {
  const { user, business } = await requireStaffUser();
  let staffId: string | null = null;
  if (user.role === "staff") {
    if (!user.staffId) redirect("/b/login?e=nostaff");
    staffId = user.staffId;
  } else {
    staffId = (await cookies()).get(VIEW_AS_COOKIE)?.value ?? null;
    if (!staffId || !/^[0-9a-f-]{36}$/i.test(staffId)) redirect("/b/pick");
  }
  const [s] = await query<{ id: string; display_name: string; photo_url: string | null; active: boolean }>(
    "select id, display_name, photo_url, active from staff where id = $1 and business_id = $2",
    [staffId, business.id],
  );
  if (!s || (user.role === "staff" && !s.active)) redirect(user.role === "staff" ? "/b/login?e=nostaff" : "/b/pick");
  return { user, business, staff: { id: s.id, name: s.display_name, photoUrl: s.photo_url }, viewing: user.role !== "staff" };
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
