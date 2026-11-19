/**
 * The columns of the client table that a login keeps (users.client_columns,
 * migration 019), beside its starred pages (favourites.ts). Each login has
 * its own choice; one that has never chosen sees them all.
 *
 * The name is not a column to choose: it is always there, as the way into
 * the client's card. No server-only code here: the table in the browser
 * reads the list of columns too.
 */
import type { Querier } from "../db";

/** The columns that can be hidden, in the table's order. */
export const CLIENT_COLUMNS = ["phone", "email", "sold", "visits", "discount", "last", "first"] as const;
export type ClientColumn = (typeof CLIENT_COLUMNS)[number];
export const isClientColumn = (v: unknown): v is ClientColumn => typeof v === "string" && (CLIENT_COLUMNS as readonly string[]).includes(v);

/** Only columns we know, none twice, in the table's order. Not a list at all: every column. */
export function cleanColumns(list: unknown): ClientColumn[] {
  if (!Array.isArray(list)) return [...CLIENT_COLUMNS];
  return CLIENT_COLUMNS.filter((c) => list.includes(c));
}

/** The columns this login shows: all of them until it has chosen. */
export async function listClientColumns(q: Querier, userId: string): Promise<ClientColumn[]> {
  const [row] = await q<{ client_columns: string[] | null }>("select client_columns from users where id = $1", [userId]);
  return cleanColumns(row?.client_columns);
}

/** Keep the login's choice; returns it as it is kept. Null: not a list, or no such login. */
export async function setClientColumns(q: Querier, userId: string, columns: unknown): Promise<ClientColumn[] | null> {
  if (!Array.isArray(columns)) return null;
  const [row] = await q<{ client_columns: string[] | null }>("update users set client_columns = $2::text[] where id = $1 returning client_columns", [userId, cleanColumns(columns)]);
  return row ? cleanColumns(row.client_columns) : null;
}
