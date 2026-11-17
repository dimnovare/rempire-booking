"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { changePassword, createUser, setUserActive } from "@/lib/auth/login";
import { endSession, requireAdmin, requireOwner } from "@/lib/auth/current";
import { query } from "@/lib/db";
import { isUuid } from "@/lib/admin/visits";

export async function logout(): Promise<void> {
  await endSession();
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

/** Owner only: add a login for a barber or the front desk. */
export async function addUser(form: FormData): Promise<{ ok: true } | { ok: false; field: string }> {
  const { business } = await requireOwner();
  const u = { email: field(form, "email"), name: field(form, "name"), role: field(form, "role"), staffId: field(form, "staffId"), password: field(form, "password") };
  const role = u.role === "owner" || u.role === "admin" || u.role === "staff" ? u.role : "staff";
  const staffId = isUuid(u.staffId) ? u.staffId : null;
  if (role === "staff" && staffId) {
    const [s] = await query<{ id: string }>("select id from staff where id = $1 and business_id = $2", [staffId, business.id]);
    if (!s) return { ok: false, field: "staff" };
  }
  const r = await createUser(query, business.id, { email: u.email, name: u.name, role, staffId, password: u.password || null });
  if (!r.ok) return r;
  refresh();
  return { ok: true };
}

/** Owner only: switch a login off (its sessions end) or on. Never your own. */
export async function toggleUser(id: string, active: boolean): Promise<boolean> {
  const { user, business } = await requireOwner();
  if (!isUuid(id) || id === user.id) return false;
  if (!(await setUserActive(query, business.id, id, active === true))) return false;
  refresh();
  return true;
}
