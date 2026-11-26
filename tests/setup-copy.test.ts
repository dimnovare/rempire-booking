/**
 * The setup copy (tools/setup-copy.mjs, docs/move-log.md D3): staging's
 * setup into an empty production database, and nothing made-up with it.
 * Two PGlites stand in for staging and production.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { migrate, MIGRATIONS_DIR, newPglite } from "../tools/migrate.mjs";
import { seedDemo, seedDemoLogins, seedDemoVisits } from "../tools/seed-demo.mjs";
import { checkTarget, DATA, exportSetup, importSetup, outsideRepo, SETUP, summary } from "../tools/setup-copy.mjs";

type Db = Awaited<ReturnType<typeof newPglite>>;
const open: Db[] = [];
const fresh = async () => {
  const db = await newPglite();
  open.push(db);
  await migrate(db);
  return db;
};
afterEach(async () => {
  for (const db of open.splice(0)) await db.close();
});
const count = async (db: Db, table: string) => Number(((await db.query(`select count(*)::int as n from ${table}`)).rows[0] as { n: number }).n);

/** Every table the migrations make, and what its columns point at. */
function schema() {
  const tables = new Map<string, string[]>();
  for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8").replace(/--.*$/gm, "");
    for (const m of sql.matchAll(/create table (?:if not exists )?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
      const refs = tables.get(m[1]) ?? [];
      for (const line of m[2].split("\n")) {
        const c = line.trim().match(/^(\w+)\s+\w+.*references (\w+)/i);
        if (c) refs.push(`${c[1]}>${c[2]}`);
      }
      tables.set(m[1], refs);
    }
    for (const m of sql.matchAll(/alter table (\w+)([\s\S]*?);/gi)) {
      for (const a of m[2].matchAll(/add column (?:if not exists )?(\w+)[^,]*?references (\w+)/gi)) tables.get(m[1])?.push(`${a[1]}>${a[2]}`);
    }
  }
  return tables;
}

describe("every table is sorted", () => {
  const tables = schema();
  const setup = SETUP.map((t) => t.table);

  it("each table the migrations make is SETUP or DATA, once", () => {
    const sorted = [...setup, ...DATA.filter((t) => t !== "_migrations")];
    expect(new Set(sorted).size).toBe(sorted.length);
    // a new table fails here until it is put in SETUP or DATA in tools/setup-copy.mjs
    expect([...tables.keys()].filter((t) => !sorted.includes(t))).toEqual([]);
    expect(sorted.filter((t) => !tables.has(t))).toEqual([]);
  });

  it("a SETUP table points only at tables copied before it, or the link is emptied", () => {
    for (const [i, t] of SETUP.entries()) {
      for (const ref of tables.get(t.table) ?? []) {
        const [col, to] = ref.split(">");
        const ok = setup.slice(0, i + 1).includes(to) || (t.empty ?? []).includes(col);
        expect(ok, `${t.table}.${col} → ${to}`).toBe(true);
      }
    }
  });
});

describe("staging's setup into an empty database", () => {
  let staging: Db;
  beforeAll(async () => {
    staging = await newPglite();
    await migrate(staging);
    await seedDemo(staging);
    await seedDemoVisits(staging);
    await seedDemoLogins(staging);
    // a photo (bytes), a past and a future shift
    const [st] = (await staging.query("select id from staff order by sort limit 1")).rows as { id: string }[];
    await staging.query("insert into staff_photo (staff_id, mime, bytes) values ($1, 'image/png', '\\x89504e470d0a1a0a') on conflict (staff_id) do update set bytes = excluded.bytes", [st.id]);
    await staging.query("insert into staff_day_overrides (staff_id, day, intervals) values ($1, current_date - 3, '[]'), ($1, current_date + 30, '[[600, 720]]') on conflict do nothing", [st.id]);
    return () => staging.close();
  }, 60_000);

  it("copies the setup, keeps ids and bytes, and nothing made-up comes along", async () => {
    expect(await count(staging, "appointments")).toBeGreaterThan(0);
    const dump = JSON.parse(JSON.stringify(await exportSetup(staging)));
    const prod = await fresh();
    expect(await checkTarget(prod, dump)).toEqual([]);
    const counts = await importSetup(prod, dump);

    for (const t of ["businesses", "locations", "services", "staff", "staff_services", "staff_hours"]) {
      expect(counts[t], t).toBe(await count(staging, t));
      expect(await count(prod, t), t).toBe(counts[t]);
    }
    expect((await prod.query("select id, display_name from staff order by id")).rows).toEqual((await staging.query("select id, display_name from staff order by id")).rows);
    const photo = (await prod.query("select encode(bytes, 'hex') as hex from staff_photo")).rows as { hex: string }[];
    expect(photo).toEqual([{ hex: "89504e470d0a1a0a" }]);
    // only from today on
    const days = (await prod.query("select day >= current_date as ahead from staff_day_overrides")).rows as { ahead: boolean }[];
    expect(days.length).toBeGreaterThan(0);
    expect(days.every((d) => d.ahead)).toBe(true);
    // the demo's own key stays behind
    const [biz] = (await prod.query("select settings from businesses")).rows as { settings: Record<string, unknown> }[];
    expect(Object.keys(biz.settings).filter((k) => k.startsWith("demo"))).toEqual([]);
    // no clients, visits, logins or invoice setup
    for (const t of ["clients", "appointments", "users", "invoice_issuers", "invoice_receivers", "chair_rents"]) expect(await count(prod, t), t).toBe(0);
  }, 60_000);

  it("a second import, or one into a database at another migration, is refused and writes nothing", async () => {
    const dump = JSON.parse(JSON.stringify(await exportSetup(staging)));
    const prod = await fresh();
    await importSetup(prod, dump);
    await expect(importSetup(prod, dump)).rejects.toThrow(/not empty/);
    expect(await count(prod, "staff")).toBe(await count(staging, "staff"));

    const behind = await fresh();
    await expect(importSetup(behind, { ...dump, migrations: [...dump.migrations, "999_later.sql"] })).rejects.toThrow(/Migrations differ/);
    expect(await count(behind, "businesses")).toBe(0);
  }, 60_000);

  it("the invoice setup comes only on request, and never while it is the demo's", async () => {
    await expect(exportSetup(staging, { withInvoices: true })).rejects.toThrow(/Näidis/);
    const dump = await exportSetup(staging);
    expect(dump.tables.invoice_issuers).toBeUndefined();
    expect(summary(dump).join("\n")).toMatch(/invoice setup not included/);
  });

  it("an address of staging's host in the setup is flagged", async () => {
    const dump = JSON.parse(JSON.stringify(await exportSetup(staging)));
    dump.tables.locations[0].website = "https://rempire-booking.diipsolutions.eu/ru";
    expect(summary(dump).join("\n")).toMatch(/WARNING: staging's address in locations\.website/);
  });
});

it("the file is written only outside the repository", () => {
  const repo = path.resolve(__dirname, "..");
  expect(outsideRepo(path.join(repo, "setup.json"), repo)).toBe(false);
  expect(outsideRepo(path.join(repo, "tmp", "setup.json"), repo)).toBe(false);
  expect(outsideRepo(path.join(repo, "..", "setup.json"), repo)).toBe(true);
});
