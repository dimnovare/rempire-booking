/**
 * The barber app's own account bits: for Renat and the front desk, the
 * barbers to look at. No Next.js here. (The login's language:
 * lib/auth/locale.ts.)
 */
import type { Querier } from "../db";

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
