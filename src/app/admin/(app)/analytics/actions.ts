"use server";

/**
 * «Основные показатели»: «Посмотреть клиентов», the names behind a card of
 * «Посещаемость». The figures themselves come with the page; the period and
 * the barber are in its address. The action checks the login itself and
 * copies its arguments by name.
 */
import { kpiClients, type KpiClients } from "@/lib/admin/dashboards";
import { requireAdmin } from "@/lib/auth/current";
import { query } from "@/lib/db";

export async function kpiClientsAction(raw: { from?: string; to?: string; staffId?: string | null; kind?: string }): Promise<KpiClients | null> {
  const { user, business } = await requireAdmin();
  return kpiClients(query, business, { from: raw?.from, to: raw?.to, staffId: raw?.staffId ?? null, kind: raw?.kind }, user);
}
