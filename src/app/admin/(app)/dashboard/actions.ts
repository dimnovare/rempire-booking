"use server";

/**
 * «Визиты»: the left panel's pages, the feed's pages and a visit opened
 * from either. Each action checks the login itself and copies its
 * arguments by name. Confirming (✓) and cancelling (the bin) are the
 * calendar's own actions (../actions.ts), with the calendar's rights.
 */
import { listDashVisits, listFeed, dashVisitForSheet, type DashVisits, type Feed } from "@/lib/admin/dashboards";
import type { VisitForSheet } from "@/lib/admin/records";
import { requireAdmin } from "@/lib/auth/current";
import { query } from "@/lib/db";

/** «предстоящие» / «прошедшие», and «Подробнее» (an offset and a page size). */
export async function listVisitsAction(raw: { when?: string; offset?: number; limit?: number }): Promise<DashVisits> {
  const { user, business } = await requireAdmin();
  return listDashVisits(query, business, { when: raw?.when, offset: raw?.offset, limit: raw?.limit }, user);
}

/** «Лента активности по записям»: a filter, and its next page. */
export async function feedAction(raw: { filter?: string; offset?: number }): Promise<Feed> {
  const { user, business } = await requireAdmin();
  return listFeed(query, business, { filter: raw?.filter, offset: raw?.offset }, user);
}

/** A visit as the journal's visit window wants it. Null: not one this login may open. */
export async function openVisitAction(id: string): Promise<VisitForSheet | null> {
  const { user, business } = await requireAdmin();
  return dashVisitForSheet(query, business, user, String(id ?? ""));
}
