/**
 * The staff app is one app (docs/apps.md, «One app for Renat»). Its pages
 * live in two halves, the barber's at /b and the salon's at /admin, and who
 * is logged in decides how they are put together:
 *
 *   - a barber: his own app, the pages at /b;
 *   - an owner or the front desk linked to a barber (Renat cuts too):
 *     «Мой день» is a tab beside «Журнал», and it is his own day at /b;
 *   - an owner or the front desk not linked to a barber: the salon alone.
 *
 * The phone remembers which half was open last, so the app comes back
 * where it was left.
 *
 * No Next.js here: src/proxy.ts keeps the cookie, /b/start reads it.
 */
import type { StaffUser } from "./sessions";

export type Side = "b" | "admin";

/** The half this device had open last. Not a secret and not a permission: every page checks the login itself. */
export const SIDE_COOKIE = "rb_side";

/**
 * A wide screen has both «Мой день» and «Журнал» on one page, the journal,
 * with «Мой день | Весь салон» in its bar. What this device chose there
 * last ("1" his day, "0" the whole salon), so a new tab opens the same way
 * and the server draws the page right the first time. Written by the
 * control itself in the browser (src/app/admin/(app)/calendar.tsx): not a
 * secret and not a permission either.
 */
export const MINE_COOKIE = "rb_mine";

export const sideOf = (pathname: string): Side => (pathname === "/admin" || pathname.startsWith("/admin/") ? "admin" : "b");

/** How the app is put together for a login: a barber's own app, the salon with «Мой день» as a tab, or the salon alone. */
export type AppKind = "barber" | "own" | "salon";

export const appKind = (user: Pick<StaffUser, "role" | "staffId">): AppKind => (user.role === "staff" ? "barber" : user.staffId ? "own" : "salon");

/**
 * Where a login lands when it opens the app with no page in mind:
 *   - a barber: his day;
 *   - an owner or the front desk linked to a barber: what this device had
 *     open last of «Мой день» (/b) and «Журнал» (/admin); the first time,
 *     «Мой день». A wide screen has no page at /b for such a login: /b
 *     itself sends it on to the journal with «Мой день» chosen
 *     (src/app/b/(app)/wide-own.tsx);
 *   - an owner or the front desk not linked to a barber: the journal,
 *     whatever the device remembers.
 */
export function startPath(user: Pick<StaffUser, "role" | "staffId">, last?: string | null): "/b" | "/admin" {
  const kind = appKind(user);
  if (kind === "barber") return "/b";
  if (kind === "salon") return "/admin";
  return last === "admin" ? "/admin" : "/b";
}
