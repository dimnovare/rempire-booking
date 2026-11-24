/**
 * Who is signed in, as the frame says it (docs/apps.md, «One app for
 * Renat»): the name, the picture of the barber the login is linked to, and
 * the role in words, «Владелец и барбер» for an owner who cuts too. The
 * head of «Ещё» shows the role; the sidebar's foot shows the name and the
 * e-mail, as the admin we follow, with the role on a hover.
 */
import { PRESETS, isRoleCode } from "@/lib/auth/rights-catalogue";
import type { StaffUser } from "@/lib/auth/sessions";
import { query } from "@/lib/db";
import type { Copy } from "../copy";

export type Who = { name: string; email: string; role: string; photoUrl: string | null };

/** «Владелец», «Администратор»: the login's preset by its name, as «Доступ» has it; «… и барбер» when it is linked to a barber. */
export function roleWords(A: Copy, user: Pick<StaffUser, "role" | "staffId" | "rights">): string {
  const role = user.role !== "staff" && isRoleCode(user.rights.preset) ? PRESETS[user.rights.preset][A.lang] : (A.account.roles[user.role] ?? user.role);
  return user.role !== "staff" && user.staffId ? A.more.andBarber(role) : role;
}

export async function whoAmI(A: Copy, user: StaffUser): Promise<Who> {
  // (a picture that cannot be read is no picture: the initial stands in)
  const [s] = user.staffId
    ? await query<{ photo_url: string | null }>("select photo_url from staff where id = $1 and business_id = $2", [user.staffId, user.businessId]).catch(() => [])
    : [];
  return { name: user.name || user.email, email: user.email, role: roleWords(A, user), photoUrl: s?.photo_url ?? null };
}
