"use server";

/**
 * «Доступ»: my own login, the salon's logins, and a login's rights.
 *
 * Rights (src/lib/auth/rights.ts), each asked here: the logins themselves
 * are «Управлять пользователями»; a new one «Приглашение пользователей…»;
 * switching one off or on «Удалять пользователей»; a login's rights
 * «Управлять правами пользователей» (the rules of a save are
 * src/lib/auth/rights-store.ts). Until 19.11.2026 all of it was the
 * owner's alone; the owner's login started with these rights and nobody
 * else's did.
 */
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { VIEW_AS_COOKIE } from "@/lib/auth/cookie";
import { setUserLocale } from "@/lib/auth/locale";
import { changePassword, createUser, setUserActive, setUserStaff } from "@/lib/auth/login";
import { currentStaffUser, endSession, requireAdmin } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";
import { loadRights, mayAddLogin, rightsToCopy, saveRights, type RightsInput, type RightsSaved } from "@/lib/auth/rights-store";
import type { StoredRights } from "@/lib/auth/rights";
import { query } from "@/lib/db";
import { isUuid } from "@/lib/admin/visits";
import { isLocale, type Locale } from "@/lib/i18n";
import { removeSubscription } from "@/lib/push";
import { rememberLang } from "../../lang-server";

export async function logout(): Promise<void> {
  await endSession();
  redirect("/admin/login");
}

/**
 * «Выйти» on a phone's «Ещё»: ends this device's session, and with it this
 * device's push (`endpoint`), as «Выйти» in the barber app does, so nothing
 * reaches a phone that left the app.
 */
export async function logoutDevice(endpoint?: string | null): Promise<void> {
  if (typeof endpoint === "string" && endpoint) {
    const user = await currentStaffUser();
    if (user) await removeSubscription(query, user.id, endpoint, "logout").catch(() => false);
  }
  await endSession();
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect("/admin/login");
}

/** Passwords travel in FormData only: plain arguments would show in the dev server's action log. */
const field = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

export async function changeMyPassword(form: FormData): Promise<"ok" | "short" | "long" | "wrong"> {
  const { user } = await requireAdmin();
  const current = field(form, "current");
  return changePassword(query, user.id, user.sessionId, current || null, field(form, "next"));
}

/**
 * Add a login for a barber or the front desk. An owner or admin who cuts
 * too is linked to his barber. The new login starts with what its role had
 * before the rights; whoever adds it must hold all of that himself, unless
 * he is an owner, and only an owner adds an owner.
 */
export async function addUser(form: FormData): Promise<{ ok: true } | { ok: false; field: string }> {
  const { user, business } = await requireAdmin();
  if (!can(user, "settings.users.invite")) return { ok: false, field: "forbidden" };
  const u = { email: field(form, "email"), name: field(form, "name"), role: field(form, "role"), staffId: field(form, "staffId"), password: field(form, "password"), locale: field(form, "locale") };
  const role = u.role === "owner" || u.role === "admin" || u.role === "staff" ? u.role : "staff";
  const staffId = isUuid(u.staffId) ? u.staffId : null;
  if (staffId) {
    const [s] = await query<{ id: string }>("select id from staff where id = $1 and business_id = $2", [staffId, business.id]);
    if (!s) return { ok: false, field: "staff" };
  }
  if (!(await mayAddLogin(query, business.id, user, role, staffId))) return { ok: false, field: "forbidden" };
  const r = await createUser(query, business.id, { email: u.email, name: u.name, role, staffId, password: u.password || null });
  if (!r.ok) return r;
  // the new login starts in the language the owner picked for it (Russian if none)
  if (isLocale(u.locale)) await setUserLocale(query, business.id, r.id, u.locale);
  refresh();
  return { ok: true };
}

/** My own login's language. This device remembers it for the login page too. */
export async function setMyLang(lang: Locale): Promise<void> {
  const { user, business } = await requireAdmin();
  if (!isLocale(lang)) return;
  await setUserLocale(query, business.id, user.id, lang);
  await rememberLang(lang);
  refresh();
}

/** «Управлять пользователями»: link an owner's or admin's login (his own too) to the barber he is, or unlink it (""). */
export async function linkUserStaff(id: string, staffId: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  if (!can(user, "settings.users")) return false;
  if (!isUuid(id) || (staffId !== "" && !isUuid(staffId))) return false;
  if (!(await setUserStaff(query, business.id, id, staffId === "" ? null : staffId))) return false;
  refresh();
  return true;
}

/**
 * «Удалять пользователей»: switch a login off (its sessions end) or on.
 * Never your own, never the last owner, and an owner's login only by an
 * owner.
 */
export async function toggleUser(id: string, active: boolean): Promise<boolean> {
  const { user, business } = await requireAdmin();
  if (!can(user, "settings.users.remove")) return false;
  if (!isUuid(id) || id === user.id) return false;
  if (user.role !== "owner") {
    const [t] = await query<{ role: string }>("select role from users where id = $1 and business_id = $2", [id, business.id]);
    if (!t || t.role === "owner") return false;
  }
  if (!(await setUserActive(query, business.id, id, active === true))) return false;
  refresh();
  return true;
}

/* ---------- a login's rights ---------- */

/** «Сохранить»: a login's whole set at once (src/lib/auth/rights-store.ts keeps the rules). */
export async function saveRightsAction(id: string, input: RightsInput): Promise<RightsSaved> {
  const { user, business } = await requireAdmin();
  const r = await saveRights(business, user, String(id ?? ""), {
    preset: input?.preset,
    on: Array.isArray(input?.on) ? input.on.slice(0, 600).map(String) : [],
    values: input?.values && typeof input.values === "object" ? input.values : {},
  });
  if (r.ok) refresh();
  return r;
}

/**
 * «Скопировать права»: another login's set, to fill this login's form
 * with. Nothing is saved here. Null: no right to it, or no such login.
 */
export async function copyRightsAction(fromId: string, toId: string): Promise<StoredRights | null> {
  const { user, business } = await requireAdmin();
  if (!can(user, "settings.users.rights")) return null;
  if (!isUuid(fromId) || !isUuid(toId) || fromId === toId) return null;
  if (!(await loadRights(query, business.id, toId))) return null;
  return rightsToCopy(query, business.id, fromId, toId);
}
