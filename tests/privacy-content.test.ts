/**
 * The privacy policy (/{locale}/privacy, src/lib/privacy-content.ts): the
 * three languages say the same thing. Russian is the master; Estonian and
 * English have the same sections, the same blocks in the same order, lists
 * of the same length, no empty words, and as many «[to confirm]» markers,
 * so a point settled in one language is settled in all three.
 */
import { describe, expect, it } from "vitest";
import { COPY, LOCALES } from "@/lib/i18n";
import { CONTROLLER, controllerAddress, PRIVACY, PRIVACY_SECTIONS, PRIVACY_TODO, PROCESSORS, type PrivacyBlock, type PrivacyCopy } from "@/lib/privacy-content";

/** Every string in a policy, with where it is. */
function strings(v: unknown, at = ""): [string, string][] {
  if (typeof v === "string") return [[at, v]];
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${at}[${i}]`));
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => strings(x, at ? `${at}.${k}` : k));
  return [];
}

/** A block's kind and, for a list, its length: what must match across the languages. */
const shape = (b: PrivacyBlock) => ("h" in b ? "h" : "p" in b ? "p" : "list" in b ? `list:${b.list.length}` : `slot:${b.slot}`);

const todos = (p: PrivacyCopy) => strings(p).flatMap(([, s]) => s.match(PRIVACY_TODO) ?? []);

describe("the three languages say the same thing", () => {
  it("every language has every section, in the page's order, and no other", () => {
    for (const l of LOCALES) expect(Object.keys(PRIVACY[l].sections), l).toEqual([...PRIVACY_SECTIONS]);
  });

  it("each section has the same blocks in the same order as the Russian, lists of the same length", () => {
    for (const id of PRIVACY_SECTIONS) {
      const master = PRIVACY.ru.sections[id].blocks.map(shape);
      expect(master.length, id).toBeGreaterThan(0);
      for (const l of LOCALES) expect(PRIVACY[l].sections[id].blocks.map(shape), `${l}.${id}`).toEqual(master);
    }
  });

  it("no empty or blank words anywhere, and no «undefined» from a missing copy key", () => {
    for (const l of LOCALES) {
      const all = strings(PRIVACY[l]);
      expect(all.length, l).toBeGreaterThan(50);
      for (const [at, s] of all) {
        expect(s.trim(), `${l}.${at}`).not.toBe("");
        expect(s, `${l}.${at}`).not.toContain("undefined");
      }
    }
  });

  it("the same keys everywhere outside the sections too", () => {
    const keys = (p: PrivacyCopy) => strings({ ...p, sections: null }).map(([at]) => at);
    for (const l of LOCALES) expect(keys(PRIVACY[l]), l).toEqual(keys(PRIVACY.ru));
  });

  it("as many «[to confirm]» markers in each language; the version date is still a placeholder", () => {
    const n = todos(PRIVACY.ru).length;
    expect(n).toBeGreaterThan(0);
    for (const l of LOCALES) {
      expect(todos(PRIVACY[l]).length, l).toBe(n);
      expect(PRIVACY[l].since, l).toContain("[date of launch]");
    }
  });

  it("the words it quotes from the booking pages are the pages' own", () => {
    for (const l of LOCALES) {
      const text = strings(PRIVACY[l]).map(([, s]) => s).join("\n");
      expect(text, l).toContain(`«${COPY[l].remindNone}»`);
      expect(text, l).toContain(`«${COPY[l].remind.off}»`);
      expect(text, l).toContain(`«${COPY[l].yourVisit}»`);
    }
  });
});

describe("the controller", () => {
  it("is the salon's company, Rempire OÜ, not the shop's", () => {
    expect(CONTROLLER.name).toBe("Rempire OÜ");
    expect(CONTROLLER.regCode).toBe("11516876");
    expect(controllerAddress("en")).toBe("Mardi 1, 10145 Tallinn, Estonia");
    expect(controllerAddress("et")).toBe("Mardi 1, 10145 Tallinn, Eesti");
    for (const l of LOCALES) {
      const who = PRIVACY[l].sections.who.blocks;
      expect(who.some((b) => "slot" in b && b.slot === "controller"), l).toBe(true);
      // the shop is named as the other company, with its own policy
      expect(strings(who).some(([, s]) => s.includes("Rempire Store OÜ")), l).toBe(true);
    }
  });

  it("the card has every label; the e-mail is marked until Renat gives one", () => {
    for (const l of LOCALES) {
      const k = PRIVACY[l].controller;
      for (const key of ["label", "company", "reg", "address", "phone", "email", "country"] as const) expect(k[key], `${l}.${key}`).toBeTruthy();
      expect(k.emailTodo, l).toBe("[to confirm with Renat]");
      expect(k.phoneTodo, l).toContain("[to confirm");
    }
  });
});

describe("the processors", () => {
  it("the list is drawn in «who sees your data», in every language", () => {
    for (const l of LOCALES) expect(PRIVACY[l].sections.share.blocks.some((b) => "slot" in b && b.slot === "processors"), l).toBe(true);
  });

  it("each one has its name, what it does and where, in every language", () => {
    for (const l of LOCALES) {
      expect(Object.keys(PRIVACY[l].processors), l).toEqual([...PROCESSORS]);
      for (const id of PROCESSORS) {
        const x = PRIVACY[l].processors[id];
        expect(x.name.trim(), `${l}.${id}.name`).not.toBe("");
        expect(x.what.trim(), `${l}.${id}.what`).not.toBe("");
        expect(x.where.trim(), `${l}.${id}.where`).not.toBe("");
      }
    }
  });

  it("names everyone the booking app sends data to (docs/accounts.md)", () => {
    for (const l of LOCALES) {
      const names = PROCESSORS.map((id) => PRIVACY[l].processors[id].name).join(" | ");
      for (const who of ["Vercel", "Railway", "Resend", "Messaggio", "Apple", "Google", "Mozilla", "Microsoft", "Cloudflare", "OpenStreetMap"]) expect(names, `${l}: ${who}`).toContain(who);
      // the app runs in Frankfurt (vercel.json, fra1)
      expect(PRIVACY[l].processors.vercel.where, l).toMatch(/Frankfur|Франкфурт/);
    }
  });
});

describe("the rights", () => {
  it("every language says where to complain: the Estonian inspectorate", () => {
    for (const l of LOCALES) {
      const text = strings(PRIVACY[l].sections.rights).map(([, s]) => s).join("\n");
      expect(text, l).toContain("Andmekaitse Inspektsioon");
      expect(text, l).toContain("www.aki.ee");
    }
  });
});
