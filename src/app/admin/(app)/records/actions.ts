"use server";

/**
 * «Записи»: the list's question, «Отменить выбранные» and the pencil. Each
 * action checks the login itself and copies its arguments by name.
 *
 * The list is asked for by an action, not by a link with `?q=`: what is
 * typed there is a client's name or phone, and those stay out of addresses,
 * the browser's history and the request log. Its file is a route of its
 * own (export/route.ts), a POST for the same reason.
 *
 * Rights (src/lib/auth/rights.ts): all asked in src/lib/admin/records.ts,
 * which is handed the login. Cancelling goes through the calendar's own
 * cancel, so its rights are the calendar's.
 */
import { refresh } from "next/cache";
import type { RecordQuery } from "@/lib/admin/record-filter";
import { cancelRecords, listRecords, visitForSheet, type RecordList, type RecordsCancelled, type VisitForSheet } from "@/lib/admin/records";
import { requireAdmin } from "@/lib/auth/current";
import { query } from "@/lib/db";
import { questionOf } from "./question";

/** One page of the list for this question. */
export async function listRecordsAction(q: RecordQuery): Promise<RecordList> {
  const { user, business } = await requireAdmin();
  return listRecords(query, business, questionOf(q), user);
}

/** «Отменить выбранные»: each ticked visit, through the calendar's own cancel. */
export async function cancelRecordsAction(ids: string[]): Promise<RecordsCancelled> {
  const { user, business } = await requireAdmin();
  const r = await cancelRecords(business, user, Array.isArray(ids) ? ids.slice(0, 1000).map(String) : null);
  if (r.ok && r.cancelled) refresh();
  return r;
}

/** The pencil: one visit, as the calendar's visit sheet wants it. Null: not one this login may open. */
export async function openVisitAction(id: string): Promise<VisitForSheet | null> {
  const { user, business } = await requireAdmin();
  return visitForSheet(business, user, String(id ?? ""));
}
