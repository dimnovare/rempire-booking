/**
 * The language of one login (users.locale: ru, et or en). The admin and,
 * later, the barber app show themselves in it; letters to that person can
 * follow it too.
 */
import type { Querier } from "../db";
import { isLocale } from "../i18n";

export async function setUserLocale(q: Querier, businessId: string, userId: string, locale: string): Promise<boolean> {
  if (!isLocale(locale)) return false;
  const rows = await q<{ id: string }>("update users set locale = $3 where id = $1 and business_id = $2 returning id", [userId, businessId, locale]);
  return rows.length > 0;
}
