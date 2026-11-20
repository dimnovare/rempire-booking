/**
 * The one staff app's frame for a login (docs/apps.md, «One app for
 * Renat»; src/lib/admin/app-nav.ts): the tabs of a phone's bottom bar, the
 * tab that is lit on a page, and what «Ещё» lists by the login's rights.
 * And the journal's panel «Моё»: who is in the chair and who is next
 * (src/lib/admin/journal.ts, mineNow).
 */
import { describe, expect, it } from "vitest";
import { barOf, litTab, moreOf, offFor, TAB_HREF, type BarKey } from "@/lib/admin/app-nav";
import { mineNow, type MineVisit } from "@/lib/admin/journal";
import { can, normalizeRights, toRights, type Holder } from "@/lib/auth/rights";
import { groupKey, presetRights } from "@/lib/auth/rights-catalogue";
import { legacyHolder } from "@/lib/auth/rights-store";

const RENAT = "11111111-1111-4111-8111-111111111111";

/** The owner's own set without these switches (a group's switch by `groupKey`), linked to a barber or not. */
function ownerWithout(off: string[], staffId: string | null = null): Holder {
  const full = presetRights("OW");
  return { role: "owner", staffId, rights: toRights(normalizeRights({ preset: "OW", on: full.on.filter((k) => !off.includes(k)), values: full.values })) };
}

describe("a phone's bottom bar", () => {
  it("linked to a barber: «Мой день» first, and «Счета» goes behind «Ещё»", () => {
    for (const role of ["owner", "admin"] as const) expect(barOf(legacyHolder(role, "u", RENAT))).toEqual(["mine", "calendar", "clients", "requests", "more"]);
  });

  it("not linked: the salon's four and «Ещё», no «Мой день»", () => {
    for (const role of ["owner", "admin"] as const) expect(barOf(legacyHolder(role, "u", null))).toEqual(["calendar", "clients", "requests", "invoices", "more"]);
  });

  it("a section the login has no right to has no tab; the bar never has more than five", () => {
    const noClients = ownerWithout([groupKey("clients")], RENAT);
    expect(barOf(noClients)).toEqual(["mine", "calendar", "requests", "more"]);
    expect(barOf(ownerWithout([groupKey("clients")]))).toEqual(["calendar", "requests", "invoices", "more"]);
    for (const who of [legacyHolder("owner", "u", RENAT), legacyHolder("admin", "u", null), noClients]) expect(barOf(who).length).toBeLessThanOrEqual(5);
  });

  it("each tab has its page: «Мой день» is the barber app's own day", () => {
    expect(TAB_HREF).toEqual({ mine: "/b", calendar: "/admin", clients: "/admin/clients", requests: "/admin/requests", invoices: "/admin/invoices", more: "/admin/more" });
  });
});

describe("the tab that is lit", () => {
  const own: BarKey[] = ["mine", "calendar", "clients", "requests", "more"];
  const salon: BarKey[] = ["calendar", "clients", "requests", "invoices", "more"];

  it("«Мой день» on his day and his week; «Ещё» on the barber pages it opens", () => {
    expect(litTab("/b", own)).toBe("mine");
    expect(litTab("/b/week", own)).toBe("mine");
    for (const path of ["/b/time", "/b/sell", "/b/money", "/b/more"]) expect(litTab(path, own)).toBe("more");
  });

  it("the salon's tabs on their own pages, and on the pages under them", () => {
    for (const bar of [own, salon]) {
      expect(litTab("/admin", bar)).toBe("calendar");
      expect(litTab("/admin/clients", bar)).toBe("clients");
      expect(litTab("/admin/clients/11111111-1111-4111-8111-111111111111", bar)).toBe("clients");
      expect(litTab("/admin/requests", bar)).toBe("requests");
    }
  });

  it("«Ещё» on its own page and on every page that has no tab in this login's bar", () => {
    for (const bar of [own, salon]) for (const path of ["/admin/more", "/admin/staff", "/admin/schedule", "/admin/services", "/admin/catalogue", "/admin/records", "/admin/account"]) expect(litTab(path, bar)).toBe("more");
    // «Счета» has its tab only without «Мой день»
    expect(litTab("/admin/invoices", salon)).toBe("invoices");
    expect(litTab("/admin/invoices/month", salon)).toBe("invoices");
    expect(litTab("/admin/invoices", own)).toBe("more");
    // a login not linked to a barber, on this device's notifications in the barber's half
    expect(litTab("/b/more", salon)).toBe("more");
    expect(litTab("/b", salon)).toBe("more");
  });

  it("nothing is lit before the page is known, or outside the app", () => {
    expect(litTab("", own)).toBeNull();
    expect(litTab("/ru", own)).toBeNull();
    // a similar address is not a page under a tab
    expect(litTab("/administrator", own)).toBeNull();
    expect(litTab("/admin/clientsx", salon)).toBe("more");
  });
});

describe("«Ещё» by the login's rights", () => {
  it("an owner linked to a barber: three groups", () => {
    expect(moreOf(legacyHolder("owner", "u", RENAT))).toEqual({
      mine: ["time", "sell", "money"],
      salon: ["staff", "schedule", "services", "catalogue", "analytics", "records", "reviews", "visits", "invoices", "sale"],
      account: ["account", "notify", "language", "logout"],
    });
  });

  it("an owner not linked to a barber: no «Моё», and «Счета» is a tab, not a row", () => {
    expect(moreOf(legacyHolder("owner", "u", null))).toEqual({
      mine: [],
      salon: ["staff", "schedule", "services", "catalogue", "analytics", "records", "reviews", "visits", "sale"],
      account: ["account", "notify", "language", "logout"],
    });
  });

  it("a row is listed only with its right, as the page itself asks", () => {
    // «Сотрудники» off: neither «Барберы» nor «График работы»
    expect(moreOf(ownerWithout([groupKey("staff")])).salon).toEqual(["services", "catalogue", "analytics", "records", "reviews", "visits", "sale"]);
    expect(moreOf(ownerWithout([groupKey("services")])).salon).toEqual(["staff", "schedule", "catalogue", "analytics", "records", "reviews", "visits", "sale"]);
    expect(moreOf(ownerWithout(["reports.bookings"])).salon).toEqual(["staff", "schedule", "services", "catalogue", "analytics", "reviews", "visits", "sale"]);
    expect(moreOf(ownerWithout(["reports.reviews"])).salon).toEqual(["staff", "schedule", "services", "catalogue", "analytics", "records", "visits", "sale"]);
    expect(moreOf(ownerWithout(["reports.dashboard"])).salon).toEqual(["staff", "schedule", "services", "catalogue", "records", "reviews", "visits", "sale"]);
    expect(moreOf(ownerWithout(["reports.visits"])).salon).toEqual(["staff", "schedule", "services", "catalogue", "analytics", "records", "reviews", "sale"]);
    // «Продажа товара» needs both the sale and making one; «Продать товар» of «Моё» the sale
    expect(moreOf(ownerWithout(["visit.sell.create"], RENAT)).salon).not.toContain("sale");
    expect(moreOf(ownerWithout(["visit.sell.create"], RENAT)).mine).toEqual(["time", "sell", "money"]);
    const noSale = ownerWithout(["visit.sell"], RENAT);
    expect(can(noSale, "visit.sell")).toBe(false);
    expect(moreOf(noSale).mine).toEqual(["time", "money"]);
    expect(moreOf(noSale).salon).not.toContain("sale");
    // the catalogue and the account's rows ask for no right of their own
    const bare = ownerWithout([groupKey("staff"), groupKey("services"), groupKey("clients"), groupKey("visit"), groupKey("reports")]);
    expect(moreOf(bare)).toEqual({ mine: [], salon: ["catalogue"], account: ["account", "notify", "language", "logout"] });
  });

  it("the front desk's own set decides, linked or not", () => {
    const desk = legacyHolder("admin", "u", RENAT);
    const rows = moreOf(desk);
    expect(rows.mine).toEqual(["time", ...(can(desk, "visit.sell") ? ["sell"] : []), "money"]);
    // every row of «Салон» is one the menus do not hold back, and none of them has a tab in its bar
    const off = offFor(desk);
    for (const k of rows.salon) {
      expect(off).not.toContain(k);
      expect(barOf(desk) as string[]).not.toContain(k);
    }
    expect(rows.salon).toContain("invoices");
    expect(moreOf(legacyHolder("admin", "u", null)).salon).not.toContain("invoices");
  });
});

describe("«Моё»: who is in the chair, who is next", () => {
  const MIN = 60_000;
  const T0 = Date.UTC(2026, 10, 19, 11, 0);
  const v = (id: string, fromMin: number, toMin: number, status = "booked"): MineVisit => ({ id, start: T0 + fromMin * MIN, end: T0 + toMin * MIN, status, clientName: id, service: null });
  const names = (visits: MineVisit[], atMin: number) => {
    const { chair, next } = mineNow(visits, T0 + atMin * MIN);
    return [chair?.id ?? null, next?.id ?? null];
  };
  const day = [v("Oleg", 0, 45, "done"), v("Pavel", 90, 165), v("Denis", 195, 240), v("Tanel", 240, 270), v("Artem", 300, 360)];

  it("the visit that has begun is in the chair; the one after it is next", () => {
    expect(names(day, 200)).toEqual(["Denis", "Tanel"]);
    // the very minute one ends and the next begins
    expect(names(day, 240)).toEqual(["Tanel", "Artem"]);
  });

  it("between two visits nobody is in the chair", () => {
    expect(names(day, 60)).toEqual([null, "Pavel"]);
    expect(names(day, 280)).toEqual([null, "Artem"]);
  });

  it("a client marked «Пришёл» is in the chair before his time", () => {
    const early = day.map((x) => (x.id === "Pavel" ? { ...x, status: "arrived" } : x));
    expect(names(early, 70)).toEqual(["Pavel", "Denis"]);
  });

  it("a visit that is done, a no-show or over is neither; after the last one there is nobody", () => {
    expect(names([v("A", 0, 30, "done"), v("B", 0, 30, "no_show"), v("C", 40, 70)], 10)).toEqual([null, "C"]);
    expect(names(day, 400)).toEqual([null, null]);
    expect(names([], 0)).toEqual([null, null]);
    // the last one in the chair: nobody next
    expect(names(day, 310)).toEqual(["Artem", null]);
  });

  it("the order given does not matter", () => {
    expect(names([...day].reverse(), 200)).toEqual(["Denis", "Tanel"]);
  });
});
