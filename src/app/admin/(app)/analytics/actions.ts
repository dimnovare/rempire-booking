"use server";

/**
 * «Основные показатели»: «Посмотреть клиентов», the names behind a card of
 * «Посещаемость», and the phone's «Отчёты» for another period or barber
 * (phone-kpi.tsx). The wide page's figures come with the page; the period
 * and the barber are in its address. Each action checks the login itself
 * and copies its arguments by name.
 */
import { kpiClients, type KpiClients } from "@/lib/admin/dashboards";
import { phoneKpi, type PhoneKpi } from "@/lib/admin/phone-kpi";
import { requireAdmin } from "@/lib/auth/current";
import { query } from "@/lib/db";

export async function kpiClientsAction(raw: { from?: string; to?: string; staffId?: string | null; kind?: string }): Promise<KpiClients | null> {
  const { user, business } = await requireAdmin();
  return kpiClients(query, business, { from: raw?.from, to: raw?.to, staffId: raw?.staffId ?? null, kind: raw?.kind }, user);
}

/** The phone's figures: null without «Основные показатели». */
export async function phoneKpiAction(raw: { per?: string; at?: string; to?: string; staffId?: string | null }): Promise<PhoneKpi | null> {
  const { user, business } = await requireAdmin();
  return phoneKpi(query, business, { per: raw?.per, at: raw?.at, to: raw?.to, staffId: raw?.staffId ?? null }, user);
}
