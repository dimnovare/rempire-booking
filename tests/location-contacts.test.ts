/**
 * «Настройки → Контакты» as the tool we follow has it (Dim, 20.11.2026,
 * decision page round 11): several phones, the country and the postcode
 * (src/lib/admin/location-form.ts, location.ts), what the booking page gets
 * of them (catalog.ts), migration 034, the address found on OpenStreetMap's
 * Nominatim (src/lib/geocode.ts: its question, its answer, one request a
 * second for the whole app, the e2e server's stand-in, the kept answers),
 * and the tile maths of our own map (src/lib/mercator.ts). Fake people
 * only; the salon's own public details are REMPIRE's. Nothing is sent out:
 * the geocoder is handed a stand-in for fetch.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadLocationSettings, saveContacts } from "@/lib/admin/location";
import { cleanContacts, cleanCountry, cleanPhones, cleanPostcode, MAX_PHONES, phonesOf, type ContactsInput } from "@/lib/admin/location-form";
import type { Holder } from "@/lib/auth/rights";
import { legacyHolder } from "@/lib/auth/rights-store";
import { loadCatalog } from "@/lib/catalog";
import { closeDb, query } from "@/lib/db";
import { forgetGeocodes, geocode, GEO_USER_AGENT, nominatimUrl, readNominatim, takeGeocoderTurn } from "@/lib/geocode";
import { clampZoom, fromView, MAX_ZOOM, MIN_ZOOM, project, round6, TILE, tilesFor, toView, unproject } from "@/lib/mercator";
import { migrate, migrationFiles, newPglite } from "../tools/migrate.mjs";
import { freshDemo, type Demo } from "./helpers";

afterAll(closeDb);

let demo: Demo;
let me: string;
beforeEach(async () => {
  demo = await freshDemo();
  forgetGeocodes();
  await query("delete from audit");
  [{ id: me }] = await query<{ id: string }>("insert into users (business_id, email, name, role) values ($1, 'owner-cx@example.test', 'Владелец Тест', 'owner') returning id", [demo.business.id]);
});

const owner = (): Holder & { id: string } => legacyHolder("owner", me);
const T3 = (ru = "", et = "", en = "") => ({ ru, et, en });
const contacts = (over: Partial<ContactsInput> = {}): ContactsInput => ({
  address: "Mardi 1, Tallinn",
  country: "EE",
  postcode: "",
  pin: "59.430883, 24.761967",
  schedule: T3("пн–сб 10:00–19:00", "E–L 10:00–19:00", "Mon–Sat 10:00–19:00"),
  phone: "+372 5623 7237",
  website: "www.rempire.ee",
  facebook: "",
  instagram: "",
  whatsapp: "",
  telegram: "",
  viber: "",
  ...over,
});

describe("the phones, the country and the postcode as typed", () => {
  it("phones: as cleanPhone keeps them, the label on one line; an empty row is dropped", () => {
    expect(
      cleanPhones([
        { number: "+372 5623 7237", label: "" },
        { number: "", label: "" },
        { number: "0037255500123", label: "  Тату \n студия " },
        { number: "55500124", label: "Администратор" },
      ]),
    ).toEqual([
      { number: "+372 5623 7237", label: "" },
      { number: "+37255500123", label: "Тату студия" },
      { number: "+37255500124", label: "Администратор" },
    ]);
    expect(cleanPhones([])).toEqual([]);
    expect(cleanPhones([{ number: "", label: "" }])).toEqual([]);
  });

  it("phones: a label with no number, a word for a number, the same number twice or a sixth is refused", () => {
    expect(cleanPhones([{ number: "", label: "Тату" }])).toBeNull();
    expect(cleanPhones([{ number: "call us", label: "" }])).toBeNull();
    // the same number however it is written
    expect(cleanPhones([{ number: "+372 5550 0123", label: "" }, { number: "0037255500123", label: "Тату" }])).toBeNull();
    expect(cleanPhones([{ number: "+37255500123", label: "x".repeat(31) }])).toBeNull();
    const six = Array.from({ length: MAX_PHONES + 1 }, (_, i) => ({ number: `+3725550012${i}`, label: "" }));
    expect(cleanPhones(six)).toBeNull();
    expect(cleanPhones(six.slice(0, MAX_PHONES))).toHaveLength(MAX_PHONES);
    expect(cleanPhones("+37255500123")).toBeNull();
    expect(cleanPhones(Array.from({ length: 11 }, () => ({ number: "", label: "" })))).toBeNull();
  });

  it("phones as stored: the list when it has numbers, else the one main number; anything else in it is left out", () => {
    expect(phonesOf([{ number: "+37255500123", label: "Тату" }], "+37255500123")).toEqual([{ number: "+37255500123", label: "Тату" }]);
    expect(phonesOf([], "+372 5623 7237")).toEqual([{ number: "+372 5623 7237", label: "" }]);
    expect(phonesOf(null, "")).toEqual([]);
    expect(phonesOf([{ number: 5 }, "x", { number: " " }, { number: "+37255500123", label: 7 }], "")).toEqual([{ number: "+37255500123", label: "" }]);
  });

  it("the country: two letters, upper case; none is Estonia", () => {
    expect(cleanCountry("ee")).toBe("EE");
    expect(cleanCountry(" lv ")).toBe("LV");
    expect(cleanCountry("")).toBe("EE");
    expect(cleanCountry(undefined)).toBe("EE");
    for (const bad of ["EST", "E", "1E", "Эстония"]) expect(cleanCountry(bad)).toBeNull();
  });

  it("the postcode: letters, digits, a space or a dash, twelve at most", () => {
    expect(cleanPostcode("10145")).toBe("10145");
    expect(cleanPostcode(" SW1A 1AA ")).toBe("SW1A 1AA");
    expect(cleanPostcode("LV-1050")).toBe("LV-1050");
    expect(cleanPostcode("")).toBe("");
    for (const bad of ["-10145", "10145-", "101#45", "1".repeat(13), "10145<b>"]) expect(cleanPostcode(bad)).toBeNull();
  });

  it("the whole card: the main number is the list's first; a wrong one names its field", () => {
    const r = cleanContacts(contacts({ phones: [{ number: "+372 5550 0124", label: "Тату" }, { number: "+372 5623 7237", label: "" }], postcode: "10145" }));
    expect(r).toMatchObject({ ok: true, value: { phone: "+372 5550 0124", phones: [{ number: "+372 5550 0124", label: "Тату" }, { number: "+372 5623 7237", label: "" }], country: "EE", postcode: "10145" } });
    // an older page that sends one phone and no country: as before
    expect(cleanContacts(contacts({ country: undefined, postcode: undefined }))).toMatchObject({ ok: true, value: { phone: "+372 5623 7237", phones: [{ number: "+372 5623 7237", label: "" }], country: "EE", postcode: "" } });
    expect(cleanContacts(contacts({ phones: [] }))).toMatchObject({ ok: true, value: { phone: "", phones: [] } });
    expect(cleanContacts(contacts({ phones: [{ number: "", label: "Тату" }] }))).toEqual({ ok: false, field: "phone" });
    expect(cleanContacts(contacts({ country: "Estonia" }))).toEqual({ ok: false, field: "country" });
    expect(cleanContacts(contacts({ postcode: "10 145 !" }))).toEqual({ ok: false, field: "postcode" });
  });
});

describe("saving «Контакты» with several phones", () => {
  it("keeps the list, the main number as `phone`, the country and the postcode; the audit row names them", async () => {
    const r = await saveContacts(
      demo.business,
      contacts({ postcode: "10145", phones: [{ number: "+372 5623 7237", label: "" }, { number: "+372 5550 0124", label: "Тату" }] }),
      owner(),
    );
    expect(r).toEqual({ ok: true });
    const [row] = await query<{ phone: string; phones: unknown; country: string; postcode: string }>("select phone, phones, country, postcode from locations where business_id = $1", [demo.business.id]);
    expect(row).toEqual({
      phone: "+372 5623 7237",
      phones: [
        { number: "+372 5623 7237", label: "" },
        { number: "+372 5550 0124", label: "Тату" },
      ],
      country: "EE",
      postcode: "10145",
    });
    const [a] = await query<{ before: Record<string, unknown>; after: Record<string, unknown> }>("select before, after from audit where entity = 'location'");
    expect(a.before).toEqual({ phones: "+372 5623 7237", postcode: "" });
    expect(a.after).toEqual({ phones: "+372 5623 7237; +372 5550 0124 (Тату)", postcode: "10145" });

    // the settings page reads them back as saved
    expect(await loadLocationSettings(query, demo.business.id, owner())).toMatchObject({
      phones: [
        { number: "+372 5623 7237", label: "" },
        { number: "+372 5550 0124", label: "Тату" },
      ],
      country: "EE",
      postcode: "10145",
    });

    // the main one swapped: `phone` follows the list
    await saveContacts(demo.business, contacts({ postcode: "10145", phones: [{ number: "+372 5550 0124", label: "Тату" }] }), owner());
    const [after] = await query<{ phone: string }>("select phone from locations where business_id = $1", [demo.business.id]);
    expect(after.phone).toBe("+372 5550 0124");
  });

  it("the booking page gets every number with a digit, the main one first, and the postcode and country", async () => {
    await saveContacts(demo.business, contacts({ postcode: "10145", phones: [{ number: "+372 5623 7237", label: "" }, { number: "+372 5550 0124", label: "Тату" }] }), owner());
    const L = (await loadCatalog(query, demo.business.id)).location;
    expect(L.phone).toBe("+372 5623 7237");
    expect(L.phones).toEqual([
      { number: "+372 5623 7237", label: "" },
      { number: "+372 5550 0124", label: "Тату" },
    ]);
    expect(L.country).toBe("EE");
    expect(L.postcode).toBe("10145");
  });

  it("the database itself holds the main number to the list's first, and five at most", async () => {
    const [loc] = await query<{ id: string }>("select id from locations where business_id = $1", [demo.business.id]);
    await expect(query(`update locations set phones = '[{"number": "+37255500999", "label": ""}]'::jsonb where id = $1`, [loc.id])).rejects.toThrow();
    const six = JSON.stringify(Array.from({ length: 6 }, (_, i) => ({ number: i ? `+3725550012${i}` : "+372 5623 7237", label: "" })));
    await expect(query("update locations set phones = $2::jsonb where id = $1", [loc.id, six])).rejects.toThrow();
    await expect(query(`update locations set phones = '{}'::jsonb where id = $1`, [loc.id])).rejects.toThrow();
    await expect(query("update locations set country = 'est' where id = $1", [loc.id])).rejects.toThrow();
  });
});

describe("migration 034", () => {
  it("moves the phone into the list, fills REMPIRE's postcode, and makes the geocoder's one-row gate", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "booking-034-"));
    const pg = await newPglite();
    try {
      for (const m of migrationFiles()) if (m.name < "034") writeFileSync(path.join(dir, m.name), m.sql);
      await migrate(pg, { dir });
      const [biz] = (await pg.query<{ id: string }>("select id from businesses where slug = 'rempire'")).rows.length
        ? (await pg.query<{ id: string }>("select id from businesses where slug = 'rempire'")).rows
        : (await pg.query<{ id: string }>("insert into businesses (slug, name) values ('rempire', 'REMPIRE') returning id")).rows;
      const [other] = (await pg.query<{ id: string }>("insert into businesses (slug, name) values ('loc-034', 'Test Salon') returning id")).rows;
      await pg.query("delete from locations where business_id = $1", [biz.id]);
      await pg.query("insert into locations (business_id, slug, name, address, phone) values ($1, 'main', 'REMPIRE', 'Mardi 1, Tallinn', '+372 5623 7237')", [biz.id]);
      await pg.query("insert into locations (business_id, slug, name, address, phone) values ($1, 'one', 'Test Salon', 'Mardi 1, Tallinn', '')", [other.id]);
      expect(await migrate(pg)).toContain("034_location_contacts.sql");

      const rows = (await pg.query<{ business_id: string; phone: string; phones: unknown; country: string; postcode: string }>("select business_id, phone, phones, country, postcode from locations order by name")).rows;
      expect(rows.find((r) => r.business_id === biz.id)).toMatchObject({ phone: "+372 5623 7237", phones: [{ number: "+372 5623 7237", label: "" }], country: "EE", postcode: "10145" });
      // no phone, no list; another business's Mardi 1 is not REMPIRE's
      expect(rows.find((r) => r.business_id === other.id)).toMatchObject({ phone: "", phones: [], country: "EE", postcode: "" });

      expect((await pg.query("select id from geocoder_gate")).rows).toEqual([{ id: true }]);
      await expect(pg.query("insert into geocoder_gate (id) values (false)")).rejects.toThrow();
    } finally {
      await pg.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the geocoder", () => {
  /** Nominatim's answer for Mardi 1, as its jsonv2 has it (trimmed). */
  const MARDI = [
    {
      lat: "59.4308830",
      lon: "24.7619670",
      display_name: "1, Mardi, Kesklinn, Tallinn, Harju maakond, 10145, Eesti",
      address: { house_number: "1", road: "Mardi", city: "Tallinn", postcode: "10145", country: "Eesti", country_code: "ee" },
    },
  ];
  const answer = (body: unknown, status = 200) => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    return { fetcher, calls };
  };
  // each test starts with the gate open: a second ago is long past
  const openGate = () => query("update geocoder_gate set last_at = '-infinity'");

  it("asks for one place with its address parts, in the page's language, in the country first", () => {
    const u = new URL(nominatimUrl("Mardi 1, Tallinn", "EE", "ru"));
    expect(u.origin + u.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(Object.fromEntries(u.searchParams)).toEqual({ q: "Mardi 1, Tallinn", format: "jsonv2", limit: "1", addressdetails: "1", countrycodes: "ee", "accept-language": "ru" });
    // nothing it does not know is passed on
    const v = new URL(nominatimUrl("x".repeat(300), "Estonia", "de"));
    expect(v.searchParams.get("q")).toHaveLength(200);
    expect(v.searchParams.has("countrycodes")).toBe(false);
    expect(v.searchParams.has("accept-language")).toBe(false);
  });

  it("reads the first place: its pin to six decimals, the postcode and the country; anything else is no place", () => {
    expect(readNominatim(MARDI)).toEqual({ lat: 59.430883, lng: 24.761967, postcode: "10145", country: "EE", label: "1, Mardi, Kesklinn, Tallinn, Harju maakond, 10145, Eesti" });
    expect(readNominatim([])).toBeNull();
    expect(readNominatim({ error: "Unable to geocode" })).toBeNull();
    expect(readNominatim([{ lat: "91", lon: "24" }])).toBeNull();
    expect(readNominatim([{ lat: "59.43", lon: "abc" }])).toBeNull();
    expect(readNominatim([{ lat: "59.43; drop", lon: "24.76" }])).toBeNull();
    // a strange postcode or country is left out, not passed on
    expect(readNominatim([{ lat: "59.43", lon: "24.76", address: { postcode: "<b>1</b>", country_code: "eee" }, display_name: "a\u0000b" }])).toEqual({ lat: 59.43, lng: 24.76, postcode: "", country: "", label: "a b" });
  });

  it("asks with a plain name of its own and no cookie, and gives the place found", async () => {
    await openGate();
    const { fetcher, calls } = answer(MARDI);
    const r = await geocode(query, "Mardi 1, Tallinn", "EE", "et", { fetcher, fake: false });
    expect(r).toEqual({ ok: true, hit: expect.objectContaining({ lat: 59.430883, lng: 24.761967, postcode: "10145", country: "EE" }) });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("accept-language=et");
    const h = new Headers(calls[0].init?.headers);
    expect(h.get("user-agent")).toBe(GEO_USER_AGENT);
    expect(GEO_USER_AGENT).toBe("rempire-booking/1.0");
    expect(h.get("cookie")).toBeNull();
  });

  it("an address it does not know, a failed answer and an empty address", async () => {
    await openGate();
    expect(await geocode(query, "Nowhere street 999", "EE", "ru", { fetcher: answer([]).fetcher, fake: false })).toEqual({ ok: false, why: "none" });
    await openGate();
    expect(await geocode(query, "Mardi 2, Tallinn", "EE", "ru", { fetcher: answer({}, 503).fetcher, fake: false })).toEqual({ ok: false, why: "failed" });
    await openGate();
    const down = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await geocode(query, "Mardi 3, Tallinn", "EE", "ru", { fetcher: down, fake: false })).toEqual({ ok: false, why: "failed" });
    const { fetcher, calls } = answer(MARDI);
    expect(await geocode(query, "   ", "EE", "ru", { fetcher, fake: false })).toEqual({ ok: false, why: "empty" });
    expect(calls).toHaveLength(0);
  });

  it("one request a second for the whole app: the second tap in the same second waits, then is told «busy» if the turn is still taken", async () => {
    await openGate();
    expect(await takeGeocoderTurn(query)).toBe(true);
    expect(await takeGeocoderTurn(query)).toBe(false);
    // another instance asked just now: this one waits for the next second once, then gives up
    const { fetcher, calls } = answer(MARDI);
    await query("update geocoder_gate set last_at = clock_timestamp() + interval '10 seconds'");
    expect(await geocode(query, "Mardi 1, Tallinn", "EE", "ru", { fetcher, fake: false, retryMs: 5 })).toEqual({ ok: false, why: "busy" });
    expect(calls).toHaveLength(0);
    // the second gone by: its turn
    await query("update geocoder_gate set last_at = clock_timestamp() - interval '1.2 seconds'");
    expect(await geocode(query, "Mardi 1, Tallinn", "EE", "ru", { fetcher, fake: false, retryMs: 5 })).toMatchObject({ ok: true });
    expect(calls).toHaveLength(1);
  });

  it("an answer is kept a day: the same address again asks nobody", async () => {
    await openGate();
    const { fetcher, calls } = answer(MARDI);
    let t = Date.parse("2026-11-20T10:00:00Z");
    const now = () => t;
    await geocode(query, "Mardi 1, Tallinn", "EE", "ru", { fetcher, fake: false, now });
    await query("update geocoder_gate set last_at = clock_timestamp() + interval '10 seconds'");
    // the gate is shut, yet the kept answer comes back at once
    expect(await geocode(query, "  mardi 1,   TALLINN ", "EE", "ru", { fetcher, fake: false, now, retryMs: 5 })).toMatchObject({ ok: true, hit: { lat: 59.430883 } });
    expect(calls).toHaveLength(1);
    // a day later it is asked again
    t += 24 * 60 * 60 * 1000 + 1;
    await openGate();
    await geocode(query, "Mardi 1, Tallinn", "EE", "ru", { fetcher, fake: false, now });
    expect(calls).toHaveLength(2);
  });

  it("the e2e server's stand-in: Mardi 1 where it is, «nowhere» nowhere, anything else near Tallinn; it never calls out", async () => {
    const { fetcher, calls } = answer(MARDI);
    await openGate();
    expect(await geocode(query, "Mardi 1, Tallinn", "EE", "ru", { fetcher, fake: true })).toEqual({
      ok: true,
      hit: { lat: 59.430883, lng: 24.761967, postcode: "10145", country: "EE", label: "Mardi 1, Kesklinn, Tallinn, 10145, Eesti" },
    });
    await openGate();
    expect(await geocode(query, "Nowhere 5", "EE", "ru", { fetcher, fake: true })).toEqual({ ok: false, why: "none" });
    await openGate();
    const r = await geocode(query, "Fake street 7", "EE", "ru", { fetcher, fake: true });
    expect(r.ok && Math.abs(r.hit.lat - 59.43) < 0.01 && Math.abs(r.hit.lng - 24.75) < 0.02).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe("the map's tiles", () => {
  const MARDI = { lat: 59.430883, lng: 24.761967 };

  it("Web Mercator there and back, to six decimals", () => {
    for (const z of [2, 13, 16, 19]) {
      const back = unproject(project(MARDI, z), z);
      expect(round6(back.lat)).toBe(MARDI.lat);
      expect(round6(back.lng)).toBe(MARDI.lng);
    }
    // the world at zoom 0 is one tile; the null meridian and the equator are its middle
    expect(project({ lat: 0, lng: 0 }, 0)).toEqual({ x: TILE / 2, y: TILE / 2 });
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(25)).toBe(MAX_ZOOM);
  });

  it("the tiles that cover the view, each where it goes, OpenStreetMap's own addresses", () => {
    const c = project(MARDI, 16);
    const tiles = tilesFor(c, 568, 227, 16);
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) expect(t.url).toMatch(/^https:\/\/tile\.openstreetmap\.org\/16\/\d+\/\d+\.png$/);
    // the tile under the pin is the one Mardi 1 is on (x 37275, y 19237 at zoom 16)
    const x = Math.floor(c.x / TILE);
    const y = Math.floor(c.y / TILE);
    expect([x, y]).toEqual([37275, 19237]);
    const under = tiles.find((t) => t.url.endsWith(`/16/${x}/${y}.png`));
    expect(under).toBeDefined();
    // every tile placed so the whole view is covered
    expect(Math.min(...tiles.map((t) => t.left))).toBeLessThanOrEqual(0);
    expect(Math.min(...tiles.map((t) => t.top))).toBeLessThanOrEqual(0);
    expect(Math.max(...tiles.map((t) => t.left + TILE))).toBeGreaterThanOrEqual(568);
    expect(Math.max(...tiles.map((t) => t.top + TILE))).toBeGreaterThanOrEqual(227);
    // no tile above the north edge of the world
    expect(tilesFor(project({ lat: 85, lng: 0 }, 2), 1024, 1024, 2).every((t) => /\/2\/\d+\/[0-3]\.png$/.test(t.url))).toBe(true);
  });

  it("the pin in the view's pixels: the middle when it is the centre; a point in the view comes back as the same place", () => {
    const c = project(MARDI, 17);
    expect(toView(MARDI, c, 400, 200, 17)).toEqual({ x: 200, y: 100 });
    const p = fromView({ x: 260, y: 40 }, c, 400, 200, 17);
    const at = toView(p, c, 400, 200, 17);
    expect(Math.round(at.x)).toBe(260);
    expect(Math.round(at.y)).toBe(40);
    // across the date line the nearer copy of the world is used
    const pacific = project({ lat: 0, lng: 179.9 }, 4);
    const v = toView({ lat: 0, lng: -179.9 }, pacific, 400, 200, 4);
    expect(v.x).toBeGreaterThan(200);
    expect(v.x).toBeLessThan(220);
  });
});
