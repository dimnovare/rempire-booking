/**
 * «Услуги» as a table, and a service's window (Dim, decisions round 11):
 * the sums a row shows, what a barber's typed price and time are stored as,
 * the base that his row follows, the saves of the window and of the table,
 * and migration 036 (the categories). Fake data only: the demo seed.
 * The rights of each change are tested in rights-doors.test.ts.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadAvailability } from "@/lib/availability";
import { effective, followBase, lengthsWith, sumUp, toStore, type Base } from "@/lib/admin/service-board";
import { listServices, renameCategory, saveService, servicesBoard, setServiceOnline, setServicePrice, type BoardService } from "@/lib/admin/services";
import { staffDetail } from "@/lib/admin/staff";
import { closeDb, query } from "@/lib/db";
import { zonedToUtc } from "@/lib/tz";
import { migrate, migrationFiles, newPglite } from "../tools/migrate.mjs";
import { freshDemo, type Demo } from "./helpers";

afterAll(closeDb);

const ACTOR = "test-admin";
const TUE = "2026-11-17";
const NOW = zonedToUtc("2026-11-16", "10:00", "Europe/Tallinn");
const NIL = { priceCents: null, priceMaxCents: null, durationMin: null };

describe("a row's sums and a barber's numbers", () => {
  const base: Base = { priceCents: 3000, priceMaxCents: 3500, durationMin: 30 };

  it("a barber without his own has the base's price with its range; with his own, his", () => {
    expect(effective(base, NIL)).toEqual({ priceCents: 3000, priceMaxCents: 3500, durationMin: 30 });
    expect(effective(base, { priceCents: 3500, priceMaxCents: null, durationMin: 45 })).toEqual({ priceCents: 3500, priceMaxCents: null, durationMin: 45 });
    // a top not above his price is no range
    expect(effective(base, { priceCents: 3500, priceMaxCents: 3500, durationMin: null }).priceMaxCents).toBeNull();
  });

  it("one price, the base's range, or «от» the lowest; one time or «Индивидуально»", () => {
    const one: Base = { priceCents: 4000, priceMaxCents: null, durationMin: 60 };
    expect(sumUp(one, [effective(one, NIL), effective(one, NIL)])).toEqual({ price: { kind: "one", cents: 4000 }, time: { kind: "one", min: 60 }, nobody: false });
    expect(sumUp(base, [effective(base, NIL)]).price).toEqual({ kind: "range", from: 3000, to: 3500 });
    const mixed = sumUp(base, [effective(base, NIL), effective(base, { priceCents: 3500, priceMaxCents: null, durationMin: 45 })]);
    expect(mixed.price).toEqual({ kind: "from", from: 3000 });
    expect(mixed.time).toEqual({ kind: "each", from: 30, to: 45 });
    // nobody does it: the base's own, and the row says so
    expect(sumUp(one, [])).toEqual({ price: { kind: "one", cents: 4000 }, time: { kind: "one", min: 60 }, nobody: true });
  });

  it("a typed number equal to the base is stored as «the base»; his own top stays while it is above his price", () => {
    expect(toStore(base, null, { priceCents: 3000, durationMin: 30 })).toEqual(NIL);
    expect(toStore(base, null, { priceCents: 3200, durationMin: 30 })).toEqual({ priceCents: 3200, priceMaxCents: null, durationMin: null });
    expect(toStore(base, { priceCents: 3200, priceMaxCents: 4000, durationMin: null }, { priceCents: 3300, durationMin: 45 })).toEqual({ priceCents: 3300, priceMaxCents: 4000, durationMin: 45 });
    // typed up to his top: one price, no range
    expect(toStore(base, { priceCents: 3200, priceMaxCents: 4000, durationMin: null }, { priceCents: 4000, durationMin: 30 })).toEqual({ priceCents: 4000, priceMaxCents: null, durationMin: null });
    // the base's price drops his top: the base's range is his again
    expect(toStore(base, { priceCents: 3200, priceMaxCents: 4000, durationMin: null }, { priceCents: 3000, durationMin: 30 })).toEqual(NIL);
  });

  it("when the base moves, a row with the old base's number follows; his own stays; what did not move changes nothing", () => {
    const old: Base = { priceCents: 4000, priceMaxCents: null, durationMin: 60 };
    const next: Base = { priceCents: 4200, priceMaxCents: null, durationMin: 60 };
    expect(followBase(old, next, { priceCents: 4000, priceMaxCents: null, durationMin: 60 })).toEqual({ priceCents: null, priceMaxCents: null, durationMin: 60 });
    expect(followBase(old, next, { priceCents: 4500, priceMaxCents: null, durationMin: 45 })).toEqual({ priceCents: 4500, priceMaxCents: null, durationMin: 45 });
    expect(followBase(old, { ...old, durationMin: 75 }, { priceCents: 4000, priceMaxCents: null, durationMin: 60 })).toEqual({ priceCents: 4000, priceMaxCents: null, durationMin: null });
    expect(followBase(old, next, NIL)).toEqual(NIL);
  });

  it("a barber's time picks from the lengths, with his own when it is odd", () => {
    expect(lengthsWith(45)).not.toContain(47);
    expect(lengthsWith(47)).toContain(47);
    expect(lengthsWith(47).indexOf(47)).toBe(lengthsWith(47).indexOf(50) - 1);
  });
});

describe("«Услуги» on the demo", () => {
  let demo: Demo;
  beforeEach(async () => {
    demo = await freshDemo();
  });
  const board = () => servicesBoard(query, demo.business.id);
  const byId = async (id: string) => (await board()).services.find((s) => s.id === id)!;
  const svc = (slug: string) => byId(demo.services[slug]);
  const sum = (s: BoardService) => {
    const base = { priceCents: s.priceCents, priceMaxCents: s.priceMaxCents, durationMin: s.durationMin };
    return sumUp(base, s.offers.filter((o) => o.offered).map((o) => effective(base, o)));
  };
  const rowOf = async (slug: string, staff: string) => (await query<{ price_cents: number | null; price_max_cents: number | null; duration_min: number | null; active: boolean }>(
    "select price_cents, price_max_cents, duration_min, active from staff_services where service_id = $1 and staff_id = $2",
    [demo.services[slug], demo.staff[staff]],
  ))[0];
  const formOf = (s: BoardService) => ({ name: s.name, durationMin: s.durationMin, priceCents: s.priceCents, priceMaxCents: s.priceMaxCents, bufferMin: s.bufferMin, online: s.online, active: s.active });
  const quote = async (slug: string, staff: string) => (await loadAvailability(query, { business: demo.business, serviceIds: [demo.services[slug]], staffId: demo.staff[staff], from: TUE, days: 1, now: NOW })).quotes[0];

  it("one category, «Барберинг», with the eight services; the barbers in their order; the rows' sums", async () => {
    const b = await board();
    expect(b.categories.map((c) => c.name.ru)).toEqual(["Барберинг"]);
    expect(b.services).toHaveLength(8);
    expect(b.services.every((s) => s.categoryId === b.categories[0].id)).toBe(true);
    expect(b.barbers.map((x) => x.name)).toEqual(["Renat", "Valentin", "Jevgeni", "Slava", "Milena"]);
    const clip = await svc("clip");
    expect(clip.offers.map((o) => o.staffId)).toEqual(b.barbers.map((x) => x.id));
    // Renat cuts in 45 minutes, the others in 60
    expect(sum(clip)).toMatchObject({ price: { kind: "one", cents: 4000 }, time: { kind: "each", from: 45, to: 60 } });
    // Renat's 35 € and Valentin's 30–35 €
    expect(sum(await svc("grey")).price).toEqual({ kind: "from", from: 3000 });
    expect(sum(await svc("buzz"))).toMatchObject({ price: { kind: "one", cents: 3500 }, time: { kind: "one", min: 45 } });
  });

  it("the window's save: his own price is stored, the base's number follows the base, a barber switched off keeps his numbers", async () => {
    const cb = await svc("cutbeard");
    const r = await saveService(
      demo.business,
      cb.id,
      {
        ...formOf(cb),
        barbers: [
          { staffId: demo.staff.milena, offered: true, priceCents: 6500, durationMin: 75 },
          { staffId: demo.staff.valentin, offered: true, priceCents: 6000, durationMin: 75 },
          { staffId: demo.staff.slava, offered: false, priceCents: 6000, durationMin: 75 },
          // as he is: not written
          { staffId: demo.staff.jevgeni, offered: true, priceCents: 6000, durationMin: 90 },
        ],
      },
      ACTOR,
    );
    expect(r).toEqual({ ok: true, id: cb.id });
    expect(await rowOf("cutbeard", "milena")).toMatchObject({ price_cents: 6500, duration_min: null, active: true });
    expect(await rowOf("cutbeard", "valentin")).toMatchObject({ price_cents: null, duration_min: null, active: true });
    expect(await rowOf("cutbeard", "slava")).toMatchObject({ price_cents: 6000, duration_min: 75, active: false });
    expect(await rowOf("cutbeard", "jevgeni")).toMatchObject({ price_cents: 6000, duration_min: 90, active: true });
    const logged = await query<{ entity_id: string }>("select entity_id from audit where entity = 'staff' and action = 'offers' and actor = $1", [ACTOR]);
    expect(logged.map((x) => x.entity_id).sort()).toEqual([demo.staff.milena, demo.staff.slava, demo.staff.valentin].sort());
    // the row now: «от 60 €», «Индивидуально»; the client flow reads the same
    expect(sum(await svc("cutbeard"))).toMatchObject({ price: { kind: "from", from: 6000 }, time: { kind: "each", from: 75, to: 90 } });
    expect(await quote("cutbeard", "milena")).toMatchObject({ priceCents: 6500, durationMin: 75 });
    expect(await quote("cutbeard", "slava")).toBeUndefined();

    // the base moves: Valentin (the base's) moves with it, Milena keeps her own, Jevgeni's explicit 60 € was the old base's and follows
    const moved = await saveService(demo.business, cb.id, { ...formOf(await svc("cutbeard")), priceCents: 6200 }, ACTOR);
    expect(moved.ok).toBe(true);
    expect(await quote("cutbeard", "valentin")).toMatchObject({ priceCents: 6200, durationMin: 75 });
    expect(await quote("cutbeard", "jevgeni")).toMatchObject({ priceCents: 6200, durationMin: 90 });
    expect(await quote("cutbeard", "milena")).toMatchObject({ priceCents: 6500 });
  });

  it("a barber's bad number is refused with his id, before anything is written", async () => {
    const cb = await svc("cutbeard");
    expect(await saveService(demo.business, cb.id, { ...formOf(cb), name: { ru: "Другое" }, barbers: [{ staffId: demo.staff.milena, offered: true, priceCents: -1, durationMin: 75 }] }, ACTOR)).toEqual({
      ok: false,
      field: `price:${demo.staff.milena}`,
    });
    expect(await saveService(demo.business, cb.id, { ...formOf(cb), barbers: [{ staffId: demo.staff.milena, offered: true, priceCents: 6000, durationMin: 3 }] }, ACTOR)).toEqual({
      ok: false,
      field: `duration:${demo.staff.milena}`,
    });
    expect((await svc("cutbeard")).name.ru).toBe(cb.name.ru);
  });

  it("a new service in a new category, with the window's barbers", async () => {
    const r = await saveService(
      demo.business,
      null,
      {
        name: { ru: "Укладка", et: "Soeng", en: "Styling" },
        durationMin: 20,
        priceCents: 1500,
        online: true,
        active: true,
        category: { name: { ru: "Укладки" } },
        barbers: [
          { staffId: demo.staff.renat, offered: true, priceCents: 1500, durationMin: 20 },
          { staffId: demo.staff.milena, offered: true, priceCents: 1800, durationMin: 30 },
          { staffId: demo.staff.slava, offered: false, priceCents: 1500, durationMin: 20 },
        ],
      },
      ACTOR,
    );
    if (!r.ok) throw new Error(r.field);
    const b = await board();
    const s = b.services.find((x) => x.id === r.id)!;
    expect(b.categories.map((c) => c.name.ru)).toEqual(["Барберинг", "Укладки"]);
    expect(s.categoryId).toBe(b.categories[1].id);
    expect(s.offers.map((o) => [o.staffId, o.offered, o.priceCents, o.durationMin])).toEqual([
      [demo.staff.renat, true, null, null],
      [demo.staff.milena, true, 1800, 30],
    ]);
    // a category that is not the business's, and a nameless new one
    expect(await saveService(demo.business, r.id, { ...formOf(s), category: { id: "00000000-0000-4000-8000-000000000000" } }, ACTOR)).toEqual({ ok: false, field: "category" });
    expect(await saveService(demo.business, r.id, { ...formOf(s), category: { name: { ru: " " } } }, ACTOR)).toEqual({ ok: false, field: "category" });
    // left out, the category stays; null takes it away
    await saveService(demo.business, r.id, { ...formOf(s), durationMin: 25 }, ACTOR);
    expect((await byId(r.id)).categoryId).toBe(b.categories[1].id);
    await saveService(demo.business, r.id, { ...formOf(s), category: null }, ACTOR);
    expect((await byId(r.id)).categoryId).toBeNull();
  });

  it("the price typed in the table: the base's barbers follow it, a range's top goes when it is not above it", async () => {
    expect(await setServicePrice(demo.business, demo.services.buzz, 3600, ACTOR)).toEqual({ ok: true });
    expect(await quote("buzz", "milena")).toMatchObject({ priceCents: 3600 });
    expect(await rowOf("buzz", "milena")).toMatchObject({ price_cents: null });
    // grey: 30–35 €; Valentin had the range, Renat his own 35 €
    await setServicePrice(demo.business, demo.services.grey, 3200, ACTOR);
    let grey = await svc("grey");
    expect([grey.priceCents, grey.priceMaxCents]).toEqual([3200, 3500]);
    expect(await rowOf("grey", "valentin")).toMatchObject({ price_cents: null, price_max_cents: null });
    expect(await rowOf("grey", "renat")).toMatchObject({ price_cents: 3500 });
    await setServicePrice(demo.business, demo.services.grey, 4000, ACTOR);
    grey = await svc("grey");
    expect([grey.priceCents, grey.priceMaxCents]).toEqual([4000, null]);
    expect(await setServicePrice(demo.business, demo.services.grey, -5, ACTOR)).toEqual({ ok: false, field: "priceCents" });
    expect(await setServicePrice(demo.business, "nope", 100, ACTOR)).toEqual({ ok: false, field: "id" });
  });

  it("the online switch and a category's pencil", async () => {
    expect(await setServiceOnline(demo.business, demo.services.kid, false, ACTOR)).toEqual({ ok: true });
    expect((await listServices(query, demo.business.id)).find((s) => s.id === demo.services.kid)?.online).toBe(false);
    const [cat] = (await board()).categories;
    expect(await renameCategory(demo.business, cat.id, "ru", "  Стрижки  ", ACTOR)).toEqual({ ok: true });
    expect((await board()).categories[0].name).toEqual({ ru: "Стрижки", et: "Barbering", en: "Barbering" });
    expect(await renameCategory(demo.business, cat.id, "ru", " ", ACTOR)).toEqual({ ok: false, field: "name" });
  });

  it("the barber page reads his numbers and the tops, for its read-only list", async () => {
    const d = await staffDetail(query, demo.business, demo.staff.valentin, TUE);
    const grey = d!.offers.find((o) => o.serviceId === demo.services.grey)!;
    expect(grey).toMatchObject({ offered: true, defaultCents: 3000, defaultMaxCents: 3500, priceCents: 3000, priceMaxCents: 3500, durationMin: 30 });
  });
});

describe("migration 036: categories", () => {
  it("a business with services gets «Барберинг» with all of them in it; one without, none", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "booking-036-"));
    const pg = await newPglite();
    try {
      for (const m of migrationFiles()) if (m.name < "036") writeFileSync(path.join(dir, m.name), m.sql);
      await migrate(pg, { dir });
      const biz = async (slug: string) => (await pg.query<{ id: string }>("insert into businesses (slug, name, settings) values ($1, $1, $2::jsonb) returning id", [slug, "{}"])).rows[0].id;
      const a = await biz("with-services");
      const b = await biz("without");
      for (const slug of ["one", "two"]) {
        await pg.query(`insert into services (business_id, slug, name, duration_min, price_cents) values ($1, $2, '{"ru":"Услуга"}'::jsonb, 30, 1000)`, [a, slug]);
      }
      const applied = await migrate(pg);
      expect(applied).toContain("036_service_categories.sql");
      const cats = await pg.query<{ id: string; business_id: string; name: Record<string, string> }>("select id, business_id, name from service_categories");
      expect(cats.rows).toHaveLength(1);
      expect(cats.rows[0]).toMatchObject({ business_id: a, name: { ru: "Барберинг", et: "Barbering", en: "Barbering" } });
      const svcs = await pg.query<{ category_id: string | null }>("select category_id from services where business_id = $1", [a]);
      expect(svcs.rows.every((s) => s.category_id === cats.rows[0].id)).toBe(true);
      expect((await pg.query("select 1 from service_categories where business_id = $1", [b])).rows).toHaveLength(0);
    } finally {
      await pg.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
