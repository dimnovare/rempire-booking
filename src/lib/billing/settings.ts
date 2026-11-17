/**
 * The owner's money switches in `businesses.settings` (src/lib/settings.ts
 * reads them): the barber's share on a client sale, what it is counted on
 * (Renat Q1), and the day of the month the drafts are made.
 */
import type { Business } from "../availability";
import { withTx } from "../db";
import { isBasis, type Basis } from "../money";

export type MoneySettings = { commission_bp: number; commission_basis: Basis; billing_day: number };

export function cleanMoneySettings(v: Partial<Record<keyof MoneySettings, unknown>>): MoneySettings | { field: string } {
  const bp = Number(v.commission_bp);
  if (!Number.isInteger(bp) || bp < 0 || bp > 5000) return { field: "commission_bp" };
  if (!isBasis(v.commission_basis)) return { field: "commission_basis" };
  const day = Number(v.billing_day);
  if (!Number.isInteger(day) || day < 1 || day > 28) return { field: "billing_day" };
  return { commission_bp: bp, commission_basis: v.commission_basis, billing_day: day };
}

/** Owner only (the action checks). A sale already made keeps the share it was made with. */
export async function saveMoneySettings(business: Business, actor: string, input: Partial<Record<keyof MoneySettings, unknown>>): Promise<{ ok: true } | { ok: false; field: string }> {
  const v = cleanMoneySettings(input);
  if ("field" in v) return { ok: false, field: v.field };
  return withTx(async (tx) => {
    const r = await tx<{ id: string }>("update businesses set settings = settings || $2::jsonb where id = $1 returning id", [business.id, JSON.stringify(v)]);
    if (!r.length) return { ok: false as const, field: "business" };
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'business', $2, 'settings', $3::jsonb)`, [actor, business.id, JSON.stringify(v)]);
    return { ok: true as const };
  });
}
