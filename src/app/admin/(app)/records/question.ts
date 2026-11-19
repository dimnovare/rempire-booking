/**
 * The question «Записи» asks with, copied by name: shared by the page's
 * action and its export route, so both mean the same visits by the same
 * question. What each part may be is checked where it is read
 * (src/lib/admin/record-filter.ts, cleanRecords).
 */
// only a type from the library: this file is read in the browser too
import type { RecordQuery } from "@/lib/admin/record-filter";

export function questionOf(q: RecordQuery | null | undefined): RecordQuery {
  return {
    createdFrom: String(q?.createdFrom ?? ""),
    createdTo: String(q?.createdTo ?? ""),
    visitFrom: String(q?.visitFrom ?? ""),
    visitTo: String(q?.visitTo ?? ""),
    staffId: String(q?.staffId ?? ""),
    by: String(q?.by ?? ""),
    cancelled: String(q?.cancelled ?? ""),
    status: String(q?.status ?? ""),
    q: String(q?.q ?? ""),
    serviceIds: Array.isArray(q?.serviceIds) ? q.serviceIds.slice(0, 100).map(String) : [],
    source: String(q?.source ?? ""),
    page: Number(q?.page),
    size: Number(q?.size),
  };
}
