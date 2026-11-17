"use server";

/**
 * The barber app's account actions. Each checks the login itself and copies
 * its arguments by name.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { VIEW_AS_COOKIE } from "@/lib/auth/cookie";
import { currentStaffUser, endSession, requireStaffUser } from "@/lib/auth/current";
import { setUserLocale } from "@/lib/auth/locale";
import { isStaffOf } from "@/lib/barber/account";
import { query } from "@/lib/db";
import { removeSubscription } from "@/lib/push";

/** Log out on this phone; `endpoint`, this phone's push, is switched off with it. */
export async function logout(endpoint?: string | null): Promise<void> {
  if (typeof endpoint === "string" && endpoint) {
    const user = await currentStaffUser();
    if (user) await removeSubscription(query, user.id, endpoint, "logout").catch(() => false);
  }
  await endSession();
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect("/b/login");
}

export async function setLanguage(lang: string): Promise<void> {
  const { user, business } = await requireStaffUser();
  if (await setUserLocale(query, business.id, user.id, String(lang))) refresh();
}

/** Renat or the front desk: look at the app as this barber. */
export async function viewAs(staffId: string): Promise<void> {
  const { user, business } = await requireStaffUser();
  if (user.role === "staff") redirect("/b");
  if (!(await isStaffOf(query, business.id, String(staffId)))) return;
  (await cookies()).set(VIEW_AS_COOKIE, String(staffId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86_400,
  });
  redirect("/b");
}
