/**
 * «Избранное» (src/lib/admin/favourites.ts, migration 017): the pages a
 * login has starred, kept per login in the order they were added.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cleanFavourites, FAV_HREF, FAV_PAGES, isFavPage, listFavourites, setFavourite } from "@/lib/admin/favourites";
import { MENU, SECTIONS } from "@/app/admin/(app)/sections";
import { en } from "@/app/admin/copy.en";
import { et } from "@/app/admin/copy.et";
import { ru } from "@/app/admin/copy.ru";
import { closeDb, query } from "@/lib/db";
import { freshDemo, type Demo } from "./helpers";

let demo: Demo;
let renat: string;
let desk: string;

beforeEach(async () => {
  demo = await freshDemo();
  const add = async (email: string, role: string) => (await query<{ id: string }>("insert into users (business_id, email, role) values ($1, $2, $3) returning id", [demo.business.id, email, role]))[0].id;
  renat = await add("owner@example.test", "owner");
  desk = await add("desk@example.test", "admin");
});
afterAll(closeDb);

describe("the pages that can be starred", () => {
  it("are sections of the admin, each with its address and its word in the three languages", () => {
    const menu = MENU.flatMap((row) => (row.pages ? row.pages.map((p) => p.href) : [row.href]));
    for (const page of FAV_PAGES) {
      // one or two steps under /admin: «Настройки» keeps its pages under /admin/settings/
      expect(FAV_HREF[page]).toMatch(/^\/admin(\/[a-z]+){1,2}$/);
      // every starred page is one the menu has, so it can always be reached without the star too
      expect(menu).toContain(FAV_HREF[page]);
      for (const A of [ru, et, en]) expect(A.nav[page]).toBeTruthy();
    }
    // and the other way round: every page of the menu can be starred
    expect([...menu].sort()).toEqual(Object.values(FAV_HREF).sort());
    // the calendar is the sidebar's own home, and «Ещё» is a phone's list: neither is starred
    expect(isFavPage("calendar")).toBe(false);
    expect(isFavPage("more")).toBe(false);
    expect(SECTIONS.some((s) => s.href === "/admin/catalogue" && !s.bar)).toBe(true);
  });

  it("a list keeps only pages we know, none twice, in the order given", () => {
    expect(cleanFavourites(["services", "nope", "clients", "services", 5, null, "__proto__"])).toEqual(["services", "clients"]);
    expect(cleanFavourites(null)).toEqual([]);
    expect(cleanFavourites("services")).toEqual([]);
    expect(isFavPage("toString")).toBe(false);
  });
});

describe("a login's starred pages", () => {
  it("start empty", async () => {
    expect(await listFavourites(query, renat)).toEqual([]);
  });

  it("are kept in the order they were starred; a star taken off leaves the rest", async () => {
    expect(await setFavourite(query, renat, "services", true)).toEqual(["services"]);
    expect(await setFavourite(query, renat, "clients", true)).toEqual(["services", "clients"]);
    expect(await setFavourite(query, renat, "catalogue", true)).toEqual(["services", "clients", "catalogue"]);
    expect(await listFavourites(query, renat)).toEqual(["services", "clients", "catalogue"]);
    expect(await setFavourite(query, renat, "clients", false)).toEqual(["services", "catalogue"]);
    expect(await listFavourites(query, renat)).toEqual(["services", "catalogue"]);
  });

  it("a page starred twice is there once, where it was; a star taken off twice is no error", async () => {
    await setFavourite(query, renat, "services", true);
    await setFavourite(query, renat, "invoices", true);
    expect(await setFavourite(query, renat, "services", true)).toEqual(["services", "invoices"]);
    expect(await setFavourite(query, renat, "staff", false)).toEqual(["services", "invoices"]);
  });

  it("belong to the login: another login has its own", async () => {
    await setFavourite(query, renat, "services", true);
    await setFavourite(query, desk, "requests", true);
    expect(await listFavourites(query, renat)).toEqual(["services"]);
    expect(await listFavourites(query, desk)).toEqual(["requests"]);
  });

  it("refuse a page that is not one of ours, and a login that is not there", async () => {
    expect(await setFavourite(query, renat, "calendar", true)).toBeNull();
    expect(await setFavourite(query, renat, "/admin/services", true)).toBeNull();
    expect(await setFavourite(query, renat, 7, true)).toBeNull();
    expect(await listFavourites(query, renat)).toEqual([]);
    expect(await setFavourite(query, "00000000-0000-4000-8000-000000000000", "services", true)).toBeNull();
    expect(await listFavourites(query, "00000000-0000-4000-8000-000000000000")).toEqual([]);
  });

  it("a key the code no longer knows is left out of the list, not shown as a broken link", async () => {
    await query("update users set favourites = $2 where id = $1", [renat, ["services", "gone-page", "clients"]]);
    expect(await listFavourites(query, renat)).toEqual(["services", "clients"]);
  });
});
