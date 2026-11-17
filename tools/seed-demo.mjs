#!/usr/bin/env node
/**
 * Demo data for staging and tests: REMPIRE, Mardi 1, the five barbers'
 * public first names (as on rempire.ee), the services from the mock with
 * EXAMPLE prices, durations and hours. No clients, no visits.
 *
 *   node tools/seed-demo.mjs               # against DATABASE_URL
 *   node tools/seed-demo.mjs --if-enabled  # only when SEED_DEMO=yes (postbuild)
 *
 * Safe to run again: it only adds what is missing and never overwrites a
 * row Renat has since edited in the admin.
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { sslFor } from "./migrate.mjs";

const T = (ru, et, en) => ({ ru, et, en });

export const DEMO = {
  business: { slug: "rempire", name: "REMPIRE", timezone: "Europe/Tallinn", default_locale: "ru" },
  location: { slug: "mardi-1", name: "REMPIRE", address: "Mardi 1, Tallinn" },
  services: [
    { slug: "clip", d: 45, name: T("Стрижка машинкой и ножницами", "Juukselõikus masina ja kääridega", "Haircut, clippers + scissors") },
    { slug: "long", d: 60, name: T("Стрижка ножницами, длинные волосы", "Pikad juuksed, kääridega", "Long hair, scissors") },
    { slug: "buzz", d: 30, name: T("Стрижка машинкой (buzzcut)", "Masinalõikus (buzzcut)", "Buzzcut, clippers") },
    { slug: "cutbeard", d: 75, name: T("Стрижка + борода", "Juukselõikus + habe", "Haircut + beard trim") },
    { slug: "beard", d: 30, name: T("Оформление бороды", "Habeme piiramine", "Beard trim") },
    { slug: "grey", d: 30, name: T("Камуфляж седины", "Hallide juuste katmine", "Grey hair coverage") },
    { slug: "kid", d: 45, name: T("Детская стрижка", "Lapse juukselõikus", "Kid's haircut") },
    { slug: "fs", d: 90, name: T("Отец и сын", "Isa ja poeg", "Father and son") },
  ],
  // price in euros per service; a missing service = the barber does not do it
  staff: [
    { slug: "renat", name: "Renat", p: { clip: 40, long: 45, buzz: 35, cutbeard: 60, beard: 28, grey: 35, kid: 35, fs: 65 } },
    { slug: "valentin", name: "Valentin", p: { clip: 40, long: 45, buzz: 35, cutbeard: 60, beard: 28, grey: 30, kid: 35, fs: 65 } },
    { slug: "jevgeni", name: "Jevgeni", p: { clip: 38, long: 43, buzz: 33, cutbeard: 57, beard: 26, grey: 30, fs: 62 } },
    { slug: "slava", name: "Slava", p: { clip: 38, long: 43, buzz: 33, cutbeard: 57, beard: 26, grey: 30, kid: 33, fs: 62 } },
    { slug: "milena", name: "Milena", p: { clip: 35, long: 40, buzz: 30, grey: 30, kid: 30, fs: 60 } },
  ],
  // example week: Mon–Fri 10–20, Sat 10–18, Sunday closed
  hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, starts: "10:00", ends: "20:00" })).concat([{ weekday: 6, starts: "10:00", ends: "18:00" }]),
};

const ROLE = T("Барбер", "Barber", "Barber");

/**
 * Fixed ids, derived from the slugs. Each serverless instance of the
 * in-memory demo database (DB_DRIVER=auto, no DATABASE_URL) seeds itself,
 * and the page and the API must agree on what a barber or service id is.
 */
export function demoId(kind, slug) {
  const h = createHash("sha256").update(`rempire-demo:${kind}:${slug}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** @param {{query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}>}} db */
export async function seedDemo(db) {
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const b = DEMO.business;
  const biz = await one(
    `insert into businesses (id, slug, name, timezone, default_locale) values ($5, $1, $2, $3, $4)
     on conflict (slug) do update set slug = excluded.slug returning id`,
    [b.slug, b.name, b.timezone, b.default_locale, demoId("business", b.slug)],
  );
  const loc = await one(
    `insert into locations (id, business_id, slug, name, address, timezone) values ($6, $1, $2, $3, $4, $5)
     on conflict (business_id, slug) do update set slug = excluded.slug returning id`,
    [biz.id, DEMO.location.slug, DEMO.location.name, DEMO.location.address, b.timezone, demoId("location", DEMO.location.slug)],
  );
  const svc = {};
  for (const [i, s] of DEMO.services.entries()) {
    const prices = DEMO.staff.map((st) => st.p[s.slug]).filter((x) => x != null);
    const row = await one(
      `insert into services (id, business_id, slug, name, duration_min, price_cents, sort) values ($7, $1, $2, $3::jsonb, $4, $5, $6)
       on conflict (business_id, slug) do update set slug = excluded.slug returning id`,
      [biz.id, s.slug, JSON.stringify(s.name), s.d, Math.min(...prices) * 100, i, demoId("service", s.slug)],
    );
    svc[s.slug] = row.id;
  }
  for (const [i, st] of DEMO.staff.entries()) {
    const inserted = await one(
      `insert into staff (id, business_id, location_id, slug, display_name, role, sort) values ($7, $1, $2, $3, $4, $5::jsonb, $6)
       on conflict (business_id, slug) do nothing returning id`,
      [biz.id, loc.id, st.slug, st.name, JSON.stringify(ROLE), i, demoId("staff", st.slug)],
    );
    const staffId = inserted?.id ?? (await one("select id from staff where business_id = $1 and slug = $2", [biz.id, st.slug])).id;
    for (const [slug, eur] of Object.entries(st.p)) {
      await db.query(
        `insert into staff_services (staff_id, service_id, price_cents) values ($1, $2, $3) on conflict do nothing`,
        [staffId, svc[slug], eur * 100],
      );
    }
    // hours only for a barber who has none yet
    if (inserted) {
      for (const h of DEMO.hours) {
        await db.query("insert into staff_hours (staff_id, weekday, starts, ends) values ($1, $2, $3, $4)", [staffId, h.weekday, h.starts, h.ends]);
      }
    }
  }
  return { businessId: biz.id, locationId: loc.id, services: svc };
}

async function main() {
  if (process.argv.includes("--if-enabled") && process.env.SEED_DEMO !== "yes") {
    console.log("Demo seed skipped (SEED_DEMO is not yes).");
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url && process.argv.includes("--if-enabled")) {
    console.log("Demo seed skipped (DATABASE_URL is not set).");
    return;
  }
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: sslFor(url) });
  await client.connect();
  try {
    await seedDemo(client);
    console.log("Demo seed done.");
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
