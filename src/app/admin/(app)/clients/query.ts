/**
 * What the client list asks with, and how the server reads it. Shared by
 * the list in the browser, its actions and the export route, so all three
 * mean the same clients by the same question.
 */
// only types from the server modules: this file is read in the browser too
import type { CondInput } from "@/lib/admin/client-filter";
import type { ClientFilter } from "@/lib/admin/clients";

/**
 * The search, the category and the page are always there; the rest is the
 * client base's own (the journal's panel asks with the first three only).
 */
export type ClientQuery = { q: string; label: string; page: number; size?: number; sort?: string; dir?: string; join?: string; conds?: CondInput[] };

/** A question as it was sent, every part copied by name; what each part may be is checked where it is read. */
export function filterOf(f: ClientQuery | null | undefined): ClientFilter {
  return {
    q: String(f?.q ?? ""),
    label: String(f?.label ?? ""),
    page: Number(f?.page),
    size: Number(f?.size),
    sort: String(f?.sort ?? ""),
    dir: String(f?.dir ?? ""),
    join: String(f?.join ?? ""),
    // each condition is read by its own unit (src/lib/admin/client-filter.ts); what is not whole is left out
    conds: Array.isArray(f?.conds) ? f.conds.slice(0, 50) : [],
  };
}
