"use server";

/**
 * «Доступ»: my own login, the salon's logins, and a login's rights.
 *
 * Rights (src/lib/auth/rights.ts), each asked here: the logins themselves
 * are «Управлять пользователями»; a new one «Приглашение пользователей…»;
 * switching one off or on, and deleting it, «Удалять пользователей»; a login's rights
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
import { changePassword, createUser, deleteUser, restoreUser, setUserActive, setUserStaff } from "@/lib/auth/login";
import { currentStaffUser, endSession, requireAdmin } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";
import { loadRights, rightsToCopy, saveRights, startingSet, writeStartingSet, type RightsInput, type RightsSaved } from "@/lib/auth/rights-store";
import { isRoleCode, PRESETS, type RoleCode } from "@/lib/auth/rights-catalogue";
import type { StoredRights } from "@/lib/auth/rights";
import type { StaffUser } from "@/lib/auth/sessions";
import { query } from "@/lib/db";
import { isUuid } from "@/lib/admin/visits";
import { isLocale, type Locale } from "@/lib/i18n";
import { removeSubscription } from "@/lib/push";
import { rememberLang } from "@/lib/lang-cookie";

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
 * Add a login: one of the rights page's eight roles (`preset`), a barber
 * for «Специалист» (an owner or admin who cuts too may be linked to his).
 * The new login starts with its role's set (`startingSet`); whoever adds
 * it must hold all of that himself, unless he is an owner, and only an
 * owner adds an owner. No password: the login comes in by the e-mail code.
 */
export async function addUser(form: FormData): Promise<{ ok: true } | { ok: false; field: string }> {
  const { user, business } = await requireAdmin();
  if (!can(user, "settings.users.invite")) return { ok: false, field: "forbidden" };
  const u = { email: field(form, "email"), name: field(form, "name"), preset: field(form, "preset"), staffId: field(form, "staffId"), password: field(form, "password"), locale: field(form, "locale") };
  const code: RoleCode = isRoleCode(u.preset) ? u.preset : "SP";
  const role = PRESETS[code].role;
  const staffId = isUuid(u.staffId) ? u.staffId : null;
  if (role === "staff" && !staffId) return { ok: false, field: "staff" };
  if (staffId) {
    const [s] = await query<{ id: string }>("select id from staff where id = $1 and business_id = $2", [staffId, business.id]);
    if (!s) return { ok: false, field: "staff" };
  }
  const set = await startingSet(query, business.id, user, code, staffId);
  if (!set) return { ok: false, field: "forbidden" };
  const r = await createUser(query, business.id, { email: u.email, name: u.name, role, staffId, password: u.password || null });
  if (!r.ok) return r;
  await writeStartingSet(query, business.id, r.id, set);
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
  if (!(await mayRemove(user, business.id, id))) return false;
  if (!(await setUserActive(query, business.id, id, active === true))) return false;
  refresh();
  return true;
}

/**
 * «Удалять пользователей» → «Удалить вход» (Dim, 25.11.2026): the login
 * leaves the list for good, its e-mail free for a new one; what it did
 * stays (src/lib/auth/login.ts → deleteUser). The same door as switching
 * off.
 */
export async function deleteUserAction(id: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  if (!(await mayRemove(user, business.id, id))) return false;
  if (!(await deleteUser(query, business.id, id, user.id))) return false;
  refresh();
  return true;
}

/** The toast's «Вернуть» after «Удалить вход», within RESTORE_MINUTES. */
export async function restoreUserAction(id: string): Promise<"ok" | "taken" | "gone"> {
  const { user, business } = await requireAdmin();
  if (!(await mayRemove(user, business.id, id))) return "gone";
  const r = await restoreUser(query, business.id, id, user.id);
  if (r === "ok") refresh();
  return r;
}

/** Switching a login off or on, or deleting it: «Удалять пользователей», never one's own, an owner's only by an owner. */
async function mayRemove(user: StaffUser, businessId: string, id: string): Promise<boolean> {
  if (!can(user, "settings.users.remove")) return false;
  if (!isUuid(id) || id === user.id) return false;
  if (user.role === "owner") return true;
  const [t] = await query<{ role: string }>("select role from users where id = $1 and business_id = $2", [id, businessId]);
  return !!t && t.role !== "owner";
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
