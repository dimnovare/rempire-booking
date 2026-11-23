/**
 * The salon's own page on the booking site («REMPIRE ▾», docs/client-flow.md):
 * its reviews (every one on show, the barbers' and the salon's own, as the
 * widget we follow counts them, Dim round 12; newest first, six at a time,
 * nothing private), what the catalog carries for it, migration 028
 * filling REMPIRE's public details in a database that has REMPIRE already,
 * and the local demo's made-up reviews. Fake people only.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadCatalog } from "@/lib/catalog";
import { closeDb, query } from "@/lib/db";
import { salonReviewCount, salonReviews } from "@/lib/reviews";
import { migrate, migrationFiles, newPglite } from "../tools/migrate.mjs";
import { DEMO, DEMO_REVIEWS, seedDemoReviews } from "../tools/seed-demo.mjs";
import { freshDemo, type Demo } from "./helpers";

afterAll(closeDb);

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});

const db = { query: async (sql: string, params?: unknown[]) => ({ rows: await query(sql, params) }) };

/** One review straight into the table, as ours would be written. */
async function add(staff: string | null, rating: number, at: string, opts: { hidden?: boolean; body?: string; name?: string; client?: string } = {}) {
  const [row] = await query<{ id: string }>(
    `insert into reviews (business_id, rating, body, author_name, staff_id, client_id, created_at, hidden)
     values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8) returning id`,
    [demo.business.id, rating, opts.body ?? "", opts.name ?? "Test Person", staff ? demo.staff[staff] : null, opts.client ?? null, at, opts.hidden ?? false],
  );
  return row.id;
}

describe("the salon's reviews", () => {
  it("every one on show, the barbers' and the salon's own, newest first, each with the barber it is about", async () => {
    const a = await add(null, 5, "2026-05-18T10:00:00Z", { name: "Anna T." });
    const b = await add(null, 4, "2026-02-09T10:00:00Z", { body: "Hea." });
    await add(null, 1, "2026-06-01T10:00:00Z", { hidden: true });
    const v = await add("valentin", 5, "2026-07-01T10:00:00Z");
    await add("valentin", 2, "2026-07-02T10:00:00Z", { hidden: true });
    const c = await add(null, 5, "2025-07-31T10:00:00Z", { body: "Coolest guys in town" });
    const [val] = await query<{ display_name: string }>("select display_name from staff where id = $1", [demo.staff.valentin]);

    expect(await salonReviewCount(query, demo.business.id)).toBe(4);
    const page = await salonReviews(query, demo.business.id);
    expect(page.rows.map((r) => r.id)).toEqual([v, a, b, c]);
    expect(page.more).toBe(false);
    expect(page.rows[0]).toMatchObject({ id: v, staff: val.display_name });
    expect(page.rows[1]).toEqual({ id: a, at: Date.parse("2026-05-18T10:00:00Z"), rating: 5, body: "", name: "Anna T.", staff: null });
    expect(page.rows[2]).toMatchObject({ rating: 4, body: "Hea.", staff: null });
  });

  it("gives nothing private: the name as signed, never the client's card or phone", async () => {
    const [client] = await query<{ id: string }>("insert into clients (business_id, name, phone_e164, source) values ($1, 'Real Name Elsewhere', '+37255500999', 'admin') returning id", [demo.business.id]);
    await add(null, 5, "2026-05-18T10:00:00Z", { name: "R.", client: client.id });
    const { rows } = await salonReviews(query, demo.business.id);
    expect(Object.keys(rows[0]).sort()).toEqual(["at", "body", "id", "name", "rating", "staff"]);
    expect(JSON.stringify(rows)).not.toMatch(/37255500999|Real Name|clientId|phone/);
    expect(rows[0].name).toBe("R.");
  });

  it("six at a time; «Ещё отзывы» goes on after the last one given, until there are none", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 14; i++) ids.push(await add(null, 5, new Date(Date.UTC(2026, 0, 1 + i, 12)).toISOString()));
    const newest = [...ids].reverse();
    const one = await salonReviews(query, demo.business.id);
    expect(one.rows.map((r) => r.id)).toEqual(newest.slice(0, 6));
    expect(one.more).toBe(true);
    const two = await salonReviews(query, demo.business.id, { before: one.rows[5].id });
    expect(two.rows.map((r) => r.id)).toEqual(newest.slice(6, 12));
    expect(two.more).toBe(true);
    const three = await salonReviews(query, demo.business.id, { limit: 6, before: two.rows[5].id });
    expect(three.rows.map((r) => r.id)).toEqual(newest.slice(12));
    expect(three.more).toBe(false);
    // the limit stays between 1 and 50
    expect((await salonReviews(query, demo.business.id, { limit: 2 })).rows).toHaveLength(2);
    expect((await salonReviews(query, demo.business.id, { limit: 500 })).rows).toHaveLength(14);
    expect((await salonReviews(query, demo.business.id, { limit: 0 })).rows).toHaveLength(6);
  });

  it("two at the same moment keep one order across pages", async () => {
    const same = "2026-03-03T12:00:00Z";
    const ids = [await add(null, 5, same), await add(null, 4, same), await add(null, 3, same)];
    const order = (await salonReviews(query, demo.business.id, { limit: 3 })).rows.map((r) => r.id);
    expect([...order].sort()).toEqual([...ids].sort());
    const first = await salonReviews(query, demo.business.id, { limit: 1 });
    const rest = await salonReviews(query, demo.business.id, { limit: 5, before: first.rows[0].id });
    expect([...first.rows, ...rest.rows].map((r) => r.id)).toEqual(order);
  });

  it("a «before» that is no review's id gives nothing; another salon's reviews never show", async () => {
    await add(null, 5, "2026-05-18T10:00:00Z");
    expect(await salonReviews(query, demo.business.id, { before: "not-an-id" })).toEqual({ rows: [], more: false });
    expect(await salonReviews(query, demo.business.id, { before: "00000000-0000-4000-8000-000000000000" })).toEqual({ rows: [], more: false });
    const [other] = await query<{ id: string }>("insert into businesses (slug, name) values ('other-demo', 'Other Demo') returning id");
    await query("insert into reviews (business_id, rating, created_at) values ($1, 5, now())", [other.id]);
    expect(await salonReviewCount(query, demo.business.id)).toBe(1);
    expect((await salonReviews(query, other.id)).rows).toHaveLength(1);
    expect((await salonReviews(query, demo.business.id)).rows).toHaveLength(1);
  });
});

describe("the catalog carries the salon's page", () => {
  it("REMPIRE's public details from the demo seed: phone, site, hours, words, photo, pin", async () => {
    const { location: l } = await loadCatalog(query, demo.business.id);
    const p = DEMO.location.profile;
    expect(l).toMatchObject({ name: "REMPIRE", address: DEMO.location.address, phone: "+372 5623 7237", website: "www.rempire.ee" });
    expect(l.schedule).toEqual({ ru: "пн–сб 10:00–19:00", et: "E–L 10:00–19:00", en: "Mon–Sat 10:00–19:00" });
    expect(l.about.en).toBe(p.about.en);
    expect(l.about.ru).toBeTruthy();
    expect(l.about.et).toBeTruthy();
    expect(l.photos).toEqual(["/brand/rempire-photo.svg"]);
    expect(l.pin).toEqual({ lat: 59.430883, lng: 24.761967 });
    expect([l.instagram, l.facebook, l.whatsapp, l.telegram, l.viber]).toEqual(["", "", "", "", ""]);
    expect(l.reviewCount).toBe(0);
  });

  it("the salon's review count is fresh: every one on show, a barber's too", async () => {
    await add(null, 5, "2026-05-18T10:00:00Z");
    const hidden = await add(null, 5, "2026-05-19T10:00:00Z");
    await add("valentin", 5, "2026-05-20T10:00:00Z");
    expect((await loadCatalog(query, demo.business.id)).location.reviewCount).toBe(3);
    await query("update reviews set hidden = true where id = $1", [hidden]);
    expect((await loadCatalog(query, demo.business.id)).location.reviewCount).toBe(2);
  });

  it("leaves out what the page must not load or show: a photo that is no address, a half pin, stray keys", async () => {
    await query(
      `update locations set photos = $2::jsonb, about = $3::jsonb, schedule = '{}'::jsonb, lat = null, lng = null, website = '  ' where business_id = $1`,
      [demo.business.id, JSON.stringify(["/ok.jpg", "javascript:alert(1)", "//elsewhere.test/x.jpg", "http://plain.test/x.jpg", "https://cdn.example.test/y.jpg", 7]), JSON.stringify({ en: " Hi ", de: "Hallo", ru: 5 })],
    );
    const { location: l } = await loadCatalog(query, demo.business.id);
    expect(l.photos).toEqual(["/ok.jpg", "https://cdn.example.test/y.jpg"]);
    expect(l.about).toEqual({ en: "Hi" });
    expect(l.schedule).toEqual({});
    expect(l.pin).toBeNull();
    expect(l.website).toBe("");
    // a pin is both or neither
    await expect(query("update locations set lat = 59.4 where business_id = $1", [demo.business.id])).rejects.toThrow();
  });
});

describe("migration 028", () => {
  it("fills REMPIRE's public details where REMPIRE is already, a phone set before stays; the address stays", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "booking-028-"));
    const pg = await newPglite();
    try {
      for (const m of migrationFiles()) if (m.name < "028") writeFileSync(path.join(dir, m.name), m.sql);
      await migrate(pg, { dir });
      const [biz] = (await pg.query<{ id: string }>("insert into businesses (slug, name) values ('rempire', 'REMPIRE') returning id")).rows;
      await pg.query("insert into locations (business_id, slug, name, address) values ($1, 'mardi-1', 'REMPIRE', 'Fake street 1')", [biz.id]);
      const [other] = (await pg.query<{ id: string }>("insert into businesses (slug, name) values ('other-demo', 'Other') returning id")).rows;
      await pg.query("insert into locations (business_id, slug, name, phone) values ($1, 'x', 'Other', '+372 5000 0000')", [other.id]);
      expect(await migrate(pg)).toContain("028_location_profile.sql");
      const rows = (
        await pg.query<{ slug: string; address: string; phone: string; website: string; schedule: Record<string, string>; about: Record<string, string>; photos: string[]; lat: number | null; lng: number | null }>(
          "select slug, address, phone, website, schedule, about, photos, lat, lng from locations order by slug",
        )
      ).rows;
      expect(rows[0]).toMatchObject({ slug: "mardi-1", address: "Fake street 1", phone: "+372 5623 7237", website: "www.rempire.ee", photos: ["/brand/rempire-photo.svg"], lat: 59.430883, lng: 24.761967 });
      expect(rows[0].schedule.ru).toBe("пн–сб 10:00–19:00");
      expect(rows[0].about).toEqual(DEMO.location.profile.about);
      expect(rows[0].schedule).toEqual(DEMO.location.profile.schedule);
      // another business is not REMPIRE: untouched
      expect(rows[1]).toMatchObject({ slug: "x", phone: "+372 5000 0000", website: "", schedule: {}, about: {}, photos: [], lat: null, lng: null });
    } finally {
      await pg.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the local demo's reviews", () => {
  it("made-up reviews of the salon, one hidden, none a barber's, all older than the admin's twelve months; a second run adds nothing", async () => {
    expect(await seedDemoReviews(db)).toBe(DEMO_REVIEWS.length);
    expect(await seedDemoReviews(db)).toBe(0);
    expect(await salonReviewCount(query, demo.business.id)).toBe(DEMO_REVIEWS.filter((r) => !r.hidden).length);
    const [{ n }] = await query<{ n: number }>("select count(*)::int as n from reviews where staff_id is not null or created_at > now() - interval '12 months'");
    expect(n).toBe(0);
    const { rows, more } = await salonReviews(query, demo.business.id);
    expect(rows).toHaveLength(6);
    expect(more).toBe(true);
    expect(rows.map((r) => r.name)).not.toContain("Hidden Example");
  });
});
