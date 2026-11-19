/**
 * «Избранное» in the admin's sidebar: the pages a login has starred
 * (users.favourites, migration 017), in the order they were added. Each
 * login has its own.
 *
 * A page is one of the admin's sections, by its key. The words are the
 * section's own (copy `nav`), so a starred page is always named in the
 * login's language. No server-only code here: the browser reads the list of
 * pages too.
 */
import type { Querier } from "../db";

/** The pages that can be starred, in the menu's order, and where each lives. */
export const FAV_HREF = {
  clients: "/admin/clients",
  staff: "/admin/staff",
  services: "/admin/services",
  catalogue: "/admin/catalogue",
  requests: "/admin/requests",
  invoices: "/admin/invoices",
  account: "/admin/account",
} as const;

export type FavPage = keyof typeof FAV_HREF;
export const FAV_PAGES = Object.keys(FAV_HREF) as FavPage[];
export const isFavPage = (v: unknown): v is FavPage => typeof v === "string" && Object.hasOwn(FAV_HREF, v);

/** Only pages we know, none twice, in the order given. */
export function cleanFavourites(list: unknown): FavPage[] {
  const out: FavPage[] = [];
  if (!Array.isArray(list)) return out;
  for (const v of list) if (isFavPage(v) && !out.includes(v)) out.push(v);
  return out;
}

export async function listFavourites(q: Querier, userId: string): Promise<FavPage[]> {
  const [row] = await q<{ favourites: string[] }>("select favourites from users where id = $1", [userId]);
  return cleanFavourites(row?.favourites);
}

/**
 * Star a page or take the star off; returns the login's list after it.
 * Null for a page that cannot be starred. A page starred twice stays where
 * it was in the list.
 */
export async function setFavourite(q: Querier, userId: string, page: unknown, on: boolean): Promise<FavPage[] | null> {
  if (!isFavPage(page)) return null;
  const [row] = await q<{ favourites: string[] }>(
    `update users
        set favourites = case when $3::boolean and not ($2::text = any(favourites)) then array_append(favourites, $2::text)
                              when not $3::boolean then array_remove(favourites, $2::text)
                              else favourites end
      where id = $1 returning favourites`,
    [userId, page, on === true],
  );
  return row ? cleanFavourites(row.favourites) : null;
}
