/**
 * The words of the booking flow in Altegio's look (docs/client-flow.md):
 * counts in three languages, the reminder's time, and the rule that a
 * client moves or cancels at any time before the visit.
 */
import { afterAll, describe, expect, it } from "vitest";
import { loadCatalog } from "@/lib/catalog";
import { closeDb, query } from "@/lib/db";
import { COPY, LOCALES, ruPlural } from "@/lib/i18n";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { canChange } from "@/lib/visits";
import { freshDemo } from "./helpers";

afterAll(closeDb);

describe("counts", () => {
  it("Russian: 1 услуга, 2 услуги, 5 услуг; 21 отзыв, 22 отзыва, 11 отзывов", () => {
    expect([1, 2, 4, 5, 11, 12, 21, 22, 25, 101, 111].map((n) => ruPlural(n, "a", "b", "c")).join("")).toBe("abbcccabcac");
    expect(COPY.ru.nServices(1)).toBe("1 услуга");
    expect(COPY.ru.nServices(3)).toBe("3 услуги");
    expect(COPY.ru.nServices(5)).toBe("5 услуг");
    expect(COPY.ru.nReviews(21)).toBe("21 отзыв");
    expect(COPY.ru.nReviews(22)).toBe("22 отзыва");
    expect(COPY.ru.nReviews(38)).toBe("38 отзывов");
  });

  it("English and Estonian: one, or more", () => {
    expect(COPY.en.nServices(1)).toBe("1 service");
    expect(COPY.en.nServices(2)).toBe("2 services");
    expect(COPY.et.nServices(1)).toBe("1 teenus");
    expect(COPY.et.nServices(2)).toBe("2 teenust");
    expect(COPY.en.nReviews(1)).toBe("1 review");
    expect(COPY.et.nReviews(29)).toBe("29 arvustust");
  });
});

describe("the reminder's time", () => {
  it("is said in hours when it is whole hours, else in minutes", () => {
    expect(COPY.ru.remindAt(120)).toBe("За 2 часа до визита");
    expect(COPY.ru.remindAt(60)).toBe("За 1 час до визита");
    expect(COPY.ru.remindAt(300)).toBe("За 5 часов до визита");
    expect(COPY.ru.remindAt(90)).toBe("За 90 минут до визита");
    expect(COPY.en.remindAt(60)).toBe("1 hour before the visit");
    expect(COPY.en.remindAt(120)).toBe("2 hours before the visit");
    expect(COPY.et.remindAt(60)).toBe("1 tund enne külastust");
    expect(COPY.et.remindAt(120)).toBe("2 tundi enne külastust");
    expect(COPY.ru.smsAt(120)).toBe("Напомним по SMS за 2 часа.");
  });

  it("every language has every word of the new path", () => {
    for (const l of LOCALES) {
      const c = COPY[l];
      for (const k of ["anyBarber", "cont", "chooseServices", "noTimeDay", "toNearest", "visitDetails", "consent", "errConsent", "anyTime", "goodDay", "home"] as const) {
        expect(c[k], `${l}.${k}`).toBeTruthy();
      }
      expect(c.byeTitle("Anna")).toContain("Anna");
      expect(c.byeTitle("")).not.toContain("undefined");
    }
  });
});

describe("a client moves or cancels at any time (Renat, 19.11.2026)", () => {
  it("the cutoff starts at 0: a visit an hour away can still be changed, one that has begun cannot", async () => {
    expect(DEFAULT_SETTINGS.cancel_cutoff_min).toBe(0);
    const demo = await freshDemo();
    const business = demo.business;
    const soon = Date.now() + 60 * 60_000;
    expect(canChange({ status: "booked", startsAt: new Date(soon).toISOString() }, business)).toBe(true);
    // started already: not any more
    expect(canChange({ status: "booked", startsAt: new Date(Date.now() - 60_000).toISOString() }, business)).toBe(false);
  });
});

describe("the catalog", () => {
  it("carries each barber's own words for the «i» sheet, empty when there are none", async () => {
    const demo = await freshDemo();
    const before = await loadCatalog(query, demo.business.id);
    expect(before.staff.length).toBeGreaterThan(0);
    for (const s of before.staff) expect(s.bio).toBeTypeOf("object");
    const one = before.staff[0];
    await query("update staff set bio = $2::jsonb where id = $1", [one.id, JSON.stringify({ ru: "Работаю с 2018 года." })]);
    const after = await loadCatalog(query, demo.business.id);
    expect(after.staff.find((s) => s.id === one.id)?.bio).toEqual({ ru: "Работаю с 2018 года." });
  });
});
