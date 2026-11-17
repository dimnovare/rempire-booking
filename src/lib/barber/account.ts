/**
 * The barber app's own account bits: the login's language and, for Renat
 * and the front desk, the barbers to look at. No Next.js here.
 */
import type { Querier } from "../db";
import { isLocale } from "../i18n";

export async function setLoginLocale(q: Querier, businessId: string, userId: string, locale: string): Promise<boolean> {
  if (!isLocale(locale)) return false;
  const rows = await q<{ id: string }>("update users set locale = $3, updated_at = now() where id = $1 and business_id = $2 returning id", [userId, businessId, locale]);
  return rows.length > 0;
}

export type PickStaff = { id: string; name: string; photoUrl: string | null; active: boolean };

/** Every barber of the business, working ones first. */
export async function staffToPick(q: Querier, businessId: string): Promise<PickStaff[]> {
  const rows = await q<{ id: string; display_name: string; photo_url: string | null; active: boolean }>(
    "select id, display_name, photo_url, active from staff where business_id = $1 order by active desc, sort, display_name",
    [businessId],
  );
  return rows.map((r) => ({ id: r.id, name: r.display_name, photoUrl: r.photo_url, active: r.active }));
}

/** Is this a barber of the business? (the barber Renat picks to look at) */
export async function isStaffOf(q: Querier, businessId: string, staffId: string): Promise<boolean> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staffId)) return false;
  const [r] = await q<{ id: string }>("select id from staff where id = $1 and business_id = $2", [staffId, businessId]);
  return !!r;
}
