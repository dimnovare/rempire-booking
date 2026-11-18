/**
 * The staff app has two sides (docs/apps.md): «Мой день», the barber app
 * at /b, and «Салон», the admin at /admin. A barber has only the first.
 * Renat and the front desk have both; the phone remembers which one was
 * open last, so the app comes back where it was left.
 *
 * No Next.js here: src/proxy.ts keeps the cookie, /b/start reads it.
 */
import type { StaffUser } from "./sessions";

export type Side = "b" | "admin";

/** The side this device had open last. Not a secret and not a permission: every page checks the login itself. */
export const SIDE_COOKIE = "rb_side";

export const sideOf = (pathname: string): Side => (pathname === "/admin" || pathname.startsWith("/admin/") ? "admin" : "b");

/**
 * Where a login lands when it opens the app with no page in mind:
 *   - a barber: his day;
 *   - Renat or the front desk: the side this device had open last;
 *   - the first time: his own day if the login is linked to a barber
 *     (Renat cuts too), else the salon.
 */
export function startPath(user: Pick<StaffUser, "role" | "staffId">, last?: string | null): "/b" | "/admin" {
  if (user.role === "staff") return "/b";
  if (last === "admin") return "/admin";
  if (last === "b") return "/b";
  return user.staffId ? "/b" : "/admin";
}
