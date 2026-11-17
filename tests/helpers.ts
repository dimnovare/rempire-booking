/**
 * A fresh, migrated, demo-seeded PGlite behind src/lib/db.ts for each test.
 * Migrating once and copying the data directory keeps every test fast.
 */
import { closeDb, query } from "@/lib/db";
import { getBusiness, type Business } from "@/lib/availability";
import { migrate, newPglite } from "../tools/migrate.mjs";
import { seedDemo } from "../tools/seed-demo.mjs";

const g = globalThis as unknown as { __bookingPgliteSeed?: Blob };
let snapshot: Blob | undefined;

export type Demo = {
  business: Business;
  services: Record<string, string>;
  staff: Record<string, string>;
};

/** Reset the database to «migrated + demo seed» and return the demo ids. */
export async function freshDemo(): Promise<Demo> {
  if (!snapshot) {
    const db = await newPglite();
    await migrate(db);
    await seedDemo(db);
    snapshot = (await db.dumpDataDir("none")) as Blob;
    await db.close();
  }
  await closeDb();
  process.env.DB_DRIVER = "pglite";
  g.__bookingPgliteSeed = snapshot;
  const business = (await getBusiness(query, "rempire"))!;
  const svc = await query<{ slug: string; id: string }>("select slug, id from services");
  const st = await query<{ slug: string; id: string }>("select slug, id from staff");
  return {
    business,
    services: Object.fromEntries(svc.map((r) => [r.slug, r.id])),
    staff: Object.fromEntries(st.map((r) => [r.slug, r.id])),
  };
}

/** Local Tallinn wall time → ISO moment, for readable tests. */
export { zonedToUtc } from "@/lib/tz";
