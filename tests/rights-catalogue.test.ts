/**
 * The catalogue of rights (src/lib/auth/rights-catalogue.ts) against the
 * list it was made from (docs/altegio-rights.md): every right, in the same
 * order, with the same Russian words, the same nesting and the same roles;
 * the counts per group; and each preset's totals as the list gives them.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeRights } from "@/lib/auth/rights";
import { GROUP_KEYS, GROUP_TOTALS, GROUPS, groupKey, presetRights, PRESETS, RIGHTS, rightDef, rightsOf, ROLE_CODES, type GroupKey, type RoleCode } from "@/lib/auth/rights-catalogue";

/** The list's sizes: 13 groups and the 4 single rights. */
const SIZES: Record<GroupKey, number> = { journal: 8, visit: 31, finance: 38, goods: 39, staff: 8, services: 12, notify: 2, settings: 10, clients: 26, reports: 25, loyalty: 8, licence: 1, online: 1, single: 4 };

type DocRight = { n: number; depth: number; ru: string; on: RoleCode[] | null };

/** The rights of the document, by group in its own order: «N. ↳ Русский — English — … On: AD MG OW.» */
function docRights(): DocRight[][] {
  const text = readFileSync(path.join(__dirname, "..", "docs", "altegio-rights.md"), "utf8").replace(/\r\n/g, "\n");
  const groups: DocRight[][] = [];
  let cur: DocRight[] | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) {
      // «## 1. Журнал записей / Appointment Calendar (8)» … «## 13. …», then «## Single rights (4)»
      cur = /^## (\d+\. .+|Single rights) \(\d+\)$/.test(line) ? [] : null;
      if (cur) groups.push(cur);
      continue;
    }
    if (!cur) continue;
    const m = /^(\d+)\. (↳*) ?(.+)$/.exec(line);
    if (!m) continue;
    const ru = m[3].split(" — ")[0].trim();
    // «On: AD MG OW.» names the roles; «On: all except SP» and the like are checked by the totals instead
    const on = /On: ((?:[A-Z]{2} ?)+)\./.exec(line);
    cur.push({ n: Number(m[1]), depth: m[2].length, ru, on: on ? (on[1].trim().split(" ") as RoleCode[]) : /On: nobody\./.test(line) || /Off for every role\./.test(line) ? [] : null });
  }
  return groups;
}

describe("the catalogue is the list", () => {
  it("has the list's counts: 8, 31, 38, 39, 8, 12, 2, 10, 26, 25, 8, 1, 1, and the 4 single rights", () => {
    for (const g of GROUP_KEYS) {
      expect(rightsOf(g).length, g).toBe(SIZES[g]);
      expect(GROUPS[g].size, g).toBe(SIZES[g]);
    }
    expect(RIGHTS.length).toBe(213);
    expect(RIGHTS.filter((r) => r.group !== "single").length).toBe(209);
  });

  it("every key is there once, and a nested right follows its parent in its own group", () => {
    const keys = RIGHTS.map((r) => r.key as string);
    expect(new Set(keys).size).toBe(keys.length);
    const seen = new Set<string>();
    for (const r of RIGHTS) {
      expect(r.key.startsWith(`${r.group}.`), r.key).toBe(true);
      if (r.parent) {
        expect(seen.has(r.parent), `${r.key} after ${r.parent}`).toBe(true);
        expect(rightDef(r.parent)?.group, r.key).toBe(r.group);
        // a right that works is never nested under one that does not
        if (r.built) expect(rightDef(r.parent)?.built, r.key).toBe(true);
      }
      seen.add(r.key);
    }
  });

  it("every right has its words in three languages, and a role's name too", () => {
    for (const r of RIGHTS) for (const l of ["ru", "et", "en"] as const) expect(r[l].trim().length, `${r.key} ${l}`).toBeGreaterThan(1);
    for (const c of ROLE_CODES) for (const l of ["ru", "et", "en"] as const) expect(PRESETS[c][l].length).toBeGreaterThan(1);
    expect(ROLE_CODES.map((c) => PRESETS[c].ru)).toEqual(["Менеджер системы", "Только просмотр", "Специалист", "Администратор", "Колл-центр", "Бухгалтер", "Менеджер", "Владелец"]);
  });

  it("is the document, right by right: the same order, Russian words, nesting and roles", () => {
    const doc = docRights();
    expect(doc.map((g) => g.length)).toEqual(GROUP_KEYS.map((g) => SIZES[g]));
    GROUP_KEYS.forEach((g, gi) => {
      const ours = rightsOf(g);
      doc[gi].forEach((d, i) => {
        const r = ours[i];
        expect(d.n, `${g} #${i + 1}`).toBe(i + 1);
        expect(r.ru, `${r.key}`).toBe(d.ru);
        // the eight fields of a product (goods 30–37) are listed without arrows, under «Доступ к изменению товаров»
        if (!r.key.startsWith("goods.manage.edit.")) expect(r.depth, `${r.key} depth`).toBe(d.depth);
        if (d.on) expect([...r.on].sort(), `${r.key} roles`).toEqual([...d.on].sort());
      });
    });
  });

  it("the built ones are the 66 our system has a function for", () => {
    const built = (g: GroupKey) => rightsOf(g).filter((r) => r.built).length;
    // settings: «Доступ к настройкам локации» since «Бренд», «Контакты», «Галерея» (20.11.2026)
    // reports: «Записи» (3), «Отзывы» (2), «Основные показатели» and «Визиты» with its phones (3), «Сообщения» with its phones (2)
    expect(Object.fromEntries(GROUP_KEYS.map((g) => [g, built(g)]))).toEqual({ journal: 6, visit: 15, finance: 0, goods: 0, staff: 4, services: 7, notify: 0, settings: 7, clients: 16, reports: 10, loyalty: 0, licence: 0, online: 0, single: 1 });
    expect(RIGHTS.filter((r) => r.built).length).toBe(66);
    // a group's switch does something exactly where a right inside it works
    for (const g of GROUP_KEYS) expect(GROUPS[g].built, g).toBe(built(g) > 0);
  });
});

describe("the eight presets", () => {
  it("each preset's totals are the list's group totals for that role", () => {
    for (const role of ROLE_CODES) {
      const on = new Set(presetRights(role).on);
      for (const g of GROUP_KEYS) {
        expect(rightsOf(g).filter((r) => on.has(r.key)).length, `${role} ${g}`).toBe(GROUP_TOTALS[g][role]);
      }
    }
  });

  it("a group's switch is on wherever the list has the group on, also with no right in it", () => {
    const on = (role: RoleCode, g: GroupKey) => presetRights(role).on.includes(groupKey(g));
    // «AC off» for the journal, «SP off» for goods; «SM 0/12 (group on)» for services; «AD 0/10» for settings; «MG 0 of 1» for the licence
    expect(on("AC", "journal")).toBe(false);
    expect(on("SP", "goods")).toBe(false);
    expect(on("SM", "services")).toBe(true);
    expect(on("AD", "settings")).toBe(true);
    expect(on("MG", "licence")).toBe(true);
    expect(on("SM", "online")).toBe(true);
    expect(on("SP", "visit")).toBe(true);
  });

  it("a preset is a set as it is stored: nothing in it is under a switch that is off", () => {
    for (const role of ROLE_CODES) {
      const p = presetRights(role);
      const n = normalizeRights({ preset: role, ...p });
      expect([...n.on].sort(), role).toEqual([...p.on].sort());
      expect(n.values, role).toEqual(p.values);
    }
  });

  it("values start wide, but «Специалист» starts with no past days", () => {
    expect(presetRights("OW").values).toMatchObject({ "journal.staff": "all", "journal.history": null, "clients.show": "all", "visit.edit": "all" });
    expect(presetRights("SP").values["journal.history"]).toBe(0);
  });

  it("the preset says which side of the app opens", () => {
    expect(ROLE_CODES.map((c) => PRESETS[c].role)).toEqual(["admin", "admin", "staff", "admin", "admin", "admin", "admin", "owner"]);
  });
});
