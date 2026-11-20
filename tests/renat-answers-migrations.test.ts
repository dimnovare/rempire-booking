/**
 * Renat's answers of 18.11.2026 written into a database that ran before
 * them: 029 (the 17 % from the regular price with VAT) and 030 (a barber
 * changes his schedule, days off, prices and times himself).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { migrate, migrationFiles, newPglite } from "../tools/migrate.mjs";

type Pg = Awaited<ReturnType<typeof newPglite>>;

/** A PGlite with every migration before `upTo`, then the test's rows, then the rest. */
async function before(upTo: string, fill: (pg: Pg) => Promise<void>, check: (pg: Pg, applied: string[]) => Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), `booking-${upTo}-`));
  const pg = await newPglite();
  try {
    for (const m of migrationFiles()) if (m.name < upTo) writeFileSync(path.join(dir, m.name), m.sql);
    await migrate(pg, { dir });
    await fill(pg);
    await check(pg, await migrate(pg));
  } finally {
    await pg.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const biz = async (pg: Pg, slug: string, settings: object) =>
  (await pg.query<{ id: string }>("insert into businesses (slug, name, settings) values ($1, $1, $2::jsonb) returning id", [slug, JSON.stringify(settings)])).rows[0].id;
const settingsOf = async (pg: Pg, id: string) => (await pg.query<{ settings: Record<string, unknown> }>("select settings from businesses where id = $1", [id])).rows[0].settings;

describe("migration 029: the 17 % from the regular price with VAT", () => {
  it("moves a business on the old pick or on none; another basis someone chose stays", async () => {
    let ids: Record<string, string> = {};
    await before(
      "029",
      async (pg) => {
        ids = { old: await biz(pg, "old-pick", { commission_basis: "net-paid", billing_day: 3 }), none: await biz(pg, "no-pick", {}), chosen: await biz(pg, "chosen", { commission_basis: "gross-paid" }) };
      },
      async (pg, applied) => {
        expect(applied).toContain("029_commission_gross_list.sql");
        expect(await settingsOf(pg, ids.old)).toEqual({ commission_basis: "gross-list", billing_day: 3 });
        expect(await settingsOf(pg, ids.none)).toEqual({ commission_basis: "gross-list" });
        expect(await settingsOf(pg, ids.chosen)).toEqual({ commission_basis: "gross-paid" });
      },
    );
  });
});

describe("migration 030: a barber changes his own time, prices and times", () => {
  it("every «Специалист» login gets the three keys with one audit row; other logins and full sets stay; the old switches go", async () => {
    let id = "";
    const users: Record<string, string> = {};
    const add = async (pg: Pg, email: string, role: string, preset: string | null, rights: string[] | null) =>
      (
        await pg.query<{ id: string }>("insert into users (business_id, email, role, rights_preset, rights) values ($1, $2, $3, $4, $5::text[]) returning id", [id, email, role, preset, rights])
      ).rows[0].id;
    await before(
      "030",
      async (pg) => {
        id = await biz(pg, "rempire", { barber_self_time: "now", barber_self_price: "ask", slot_step_min: 30 });
        users.asks = await add(pg, "asks@example.test", "staff", "SP", ["group:journal", "journal.staff", "journal.schedule"]);
        users.full = await add(pg, "full@example.test", "staff", "SP", ["group:services", "journal.schedule", "services.staff"]);
        users.desk = await add(pg, "desk@example.test", "admin", "AD", ["group:journal", "journal.staff"]);
        users.unset = await add(pg, "new@example.test", "staff", null, null);
      },
      async (pg, applied) => {
        expect(applied).toContain("030_barbers_change_own.sql");
        const rights = async (u: string) => (await pg.query<{ rights: string[] | null }>("select rights from users where id = $1", [u])).rows[0].rights;
        expect(await rights(users.asks)).toEqual(["group:journal", "group:services", "journal.schedule", "journal.staff", "services.staff"]);
        expect(await rights(users.full)).toEqual(["group:services", "journal.schedule", "services.staff"]);
        expect(await rights(users.desk)).toEqual(["group:journal", "journal.staff"]);
        // a login with no set yet gets its start later (rights-store.ts, legacyRights): both «now»
        expect(await rights(users.unset)).toBeNull();

        const audit = (await pg.query<{ entity_id: string; actor: string; after: { on: string[]; off: string[] } }>("select entity_id, actor, after from audit where entity = 'user' and action = 'rights'")).rows;
        expect(audit).toHaveLength(1);
        expect(audit[0]).toMatchObject({ entity_id: users.asks, actor: "migration", after: { on: ["group:services", "services.staff"], off: [] } });

        expect(await settingsOf(pg, id)).toEqual({ slot_step_min: 30 });
      },
    );
  });
});
