/**
 * «Настройки → Локация» (src/lib/admin/location.ts, location-form.ts): what
 * the owner may type into the salon's page and how it is kept; the saves
 * and their audit rows; the right; the logo and the gallery with their
 * limits; the public image route; what the booking page and «Изменения
 * данных» make of it; and migration 031. Fake people only; the salon's own
 * public details are REMPIRE's.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));

import { GET as imageRoute } from "@/app/api/salon/image/[id]/route";
import { cleanChanges, defaultChanges } from "@/lib/admin/change-filter";
import { listChanges } from "@/lib/admin/change-log";
import { addPhoto, loadLocationSettings, locationImage, orderPhotos, removeLogo, removePhoto, saveBrand, saveContacts, saveLogo } from "@/lib/admin/location";
import { cleanBrand, cleanChatNumber, cleanContacts, cleanPhone, cleanSocial, cleanWebsite, LOC_MAX, MAX_PHOTOS, parsePin, pinLink, pinText, type ContactsInput } from "@/lib/admin/location-form";
import type { Holder } from "@/lib/auth/rights";
import { legacyHolder } from "@/lib/auth/rights-store";
import { loadCatalog } from "@/lib/catalog";
import { closeDb, query } from "@/lib/db";
import { migrate, migrationFiles, newPglite } from "../tools/migrate.mjs";
import { freshDemo, type Demo } from "./helpers";

afterAll(closeDb);

let demo: Demo;
let me: string;
beforeEach(async () => {
  demo = await freshDemo();
  await query("delete from audit");
  [{ id: me }] = await query<{ id: string }>("insert into users (business_id, email, name, role) values ($1, 'owner-loc@example.test', 'Владелец Тест', 'owner') returning id", [demo.business.id]);
});

const owner = (): Holder & { id: string } => legacyHolder("owner", me);
const desk = (): Holder & { id: string } => legacyHolder("admin", "desk-login");
const T3 = (ru = "", et = "", en = "") => ({ ru, et, en });

/** The tiniest files that pass the first-bytes check. */
const PNG = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const JPEG = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 1, 2, 3]);
const WEBP = () => new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2]);

const contacts = (over: Partial<ContactsInput> = {}): ContactsInput => ({
  address: "Mardi 1, Tallinn",
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

const audits = () => query<{ action: string; entity: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }>("select action, entity, before, after from audit order by id");
const locRow = async () => (await query<{ id: string; name: string; logo: string; photos: string[]; lat: number | null; lng: number | null; schedule: Record<string, string> }>("select id, name, logo, photos, lat, lng, schedule from locations where business_id = $1", [demo.business.id]))[0];

describe("the pin, from what the owner types or pastes", () => {
  const at = (lat: number, lng: number) => ({ ok: true, pin: { lat, lng } });

  it("two numbers: a point, a comma, a space, a semicolon; decimal commas too", () => {
    expect(parsePin("59.430883, 24.761967")).toEqual(at(59.430883, 24.761967));
    expect(parsePin(" 59.430883 24.761967 ")).toEqual(at(59.430883, 24.761967));
    expect(parsePin("59.430883;24.761967")).toEqual(at(59.430883, 24.761967));
    expect(parsePin("59,430883; 24,761967")).toEqual(at(59.430883, 24.761967));
    expect(parsePin("59,430883, 24,761967")).toEqual(at(59.430883, 24.761967));
    expect(parsePin("-33.8688, 151.2093")).toEqual(at(-33.8688, 151.2093));
    // six decimals are kept, the rest rounded
    expect(parsePin("59.43088349, 24.76196712")).toEqual(at(59.430883, 24.761967));
  });

  it("as a map shows a place: N/E, and degrees, minutes, seconds", () => {
    expect(parsePin("59.4309° N, 24.762° E")).toEqual(at(59.4309, 24.762));
    expect(parsePin("33.8688 S 151.2093 E")).toEqual(at(-33.8688, 151.2093));
    const p = parsePin(`59°25'51.2"N 24°45'43.1"E`);
    expect(p.ok && p.pin).toEqual({ lat: 59.430889, lng: 24.761972 });
  });

  it("a link from Google Maps: the place's own pin before where the map was looking", () => {
    expect(parsePin("https://www.google.com/maps/place/Mardi+1,+Tallinn/@59.4301,24.7601,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d59.430883!4d24.761967")).toEqual(at(59.430883, 24.761967));
    expect(parsePin("https://www.google.com/maps/@59.4301,24.7601,17z")).toEqual(at(59.4301, 24.7601));
    expect(parsePin("https://maps.google.com/?q=59.430883,24.761967")).toEqual(at(59.430883, 24.761967));
    expect(parsePin("https://www.google.com/maps/search/?api=1&query=59.430883%2C24.761967")).toEqual(at(59.430883, 24.761967));
    expect(parsePin("https://www.google.com/maps/dir/?api=1&destination=59.430883,24.761967")).toEqual(at(59.430883, 24.761967));
    expect(parsePin("https://www.google.ee/maps/place/59.430883,24.761967")).toEqual(at(59.430883, 24.761967));
    expect(parsePin("google.com/maps/@59.4301,24.7601,17z")).toEqual(at(59.4301, 24.7601));
  });

  it("a link from OpenStreetMap, and a geo: address", () => {
    expect(parsePin("https://www.openstreetmap.org/?mlat=59.430883&mlon=24.761967#map=18/59.43/24.76")).toEqual(at(59.430883, 24.761967));
    expect(parsePin("https://www.openstreetmap.org/#map=18/59.430883/24.761967")).toEqual(at(59.430883, 24.761967));
    expect(parsePin("geo:59.430883,24.761967?z=18")).toEqual(at(59.430883, 24.761967));
    // pinLink, «Открыть на карте», is read back the same
    expect(parsePin(pinLink({ lat: 59.430883, lng: 24.761967 }))).toEqual(at(59.430883, 24.761967));
  });

  it("nothing is «no map»; a short link, a far-off number and words are refused, each with its reason", () => {
    expect(parsePin("")).toEqual({ ok: true, pin: null });
    expect(parsePin("   ")).toEqual({ ok: true, pin: null });
    expect(parsePin("https://maps.app.goo.gl/AbCdEf123")).toEqual({ ok: false, why: "short" });
    expect(parsePin("https://goo.gl/maps/AbCdEf123")).toEqual({ ok: false, why: "short" });
    expect(parsePin("91, 24")).toEqual({ ok: false, why: "range" });
    expect(parsePin("59, 181")).toEqual({ ok: false, why: "range" });
    expect(parsePin("Mardi 1, Tallinn")).toEqual({ ok: false, why: "bad" });
    expect(parsePin("https://www.google.com/maps/place/Mardi+1")).toEqual({ ok: false, why: "bad" });
    expect(parsePin("https://example.test/?q=59.43,24.76")).toEqual({ ok: false, why: "bad" });
    expect(parsePin("javascript:alert(1)")).toEqual({ ok: false, why: "bad" });
    expect(parsePin("https://www.google.com/maps/%E0%A4%A")).toEqual({ ok: false, why: "bad" });
  });

  it("the field shows a pin as two numbers, which read back as the same pin", () => {
    expect(pinText({ lat: 59.430883, lng: 24.761967 })).toBe("59.430883, 24.761967");
    expect(pinText(null)).toBe("");
  });
});

describe("the contacts, one by one", () => {
  it("a phone: with its country code, as typed; without one, Estonian in E.164; else refused", () => {
    expect(cleanPhone("+372 5623 7237")).toBe("+372 5623 7237");
    expect(cleanPhone("00372 5623 7237")).toBe("+372 5623 7237");
    expect(cleanPhone("5623 7237")).toBe("+37256237237");
    expect(cleanPhone("+358 40 123 4567")).toBe("+358 40 123 4567");
    expect(cleanPhone("")).toBe("");
    expect(cleanPhone("call us")).toBeNull();
    expect(cleanPhone("+372 12")).toBeNull();
    expect(cleanPhone(`+372 5623 7237${" 0".repeat(20)}`)).toBeNull();
  });

  it("a site: https://… or a bare domain, kept as typed; another scheme or no domain is refused", () => {
    expect(cleanWebsite("www.rempire.ee")).toBe("www.rempire.ee");
    expect(cleanWebsite("https://rempire.ee/ru")).toBe("https://rempire.ee/ru");
    expect(cleanWebsite("http://rempire.ee")).toBe("http://rempire.ee");
    expect(cleanWebsite("")).toBe("");
    expect(cleanWebsite("javascript:alert(1)")).toBeNull();
    expect(cleanWebsite("ftp://rempire.ee")).toBeNull();
    expect(cleanWebsite("rempire")).toBeNull();
    expect(cleanWebsite("https://user:pw@rempire.ee")).toBeNull();
    expect(cleanWebsite("rempire .ee")).toBeNull();
    expect(cleanWebsite(`https://${"a".repeat(LOC_MAX.website)}.ee`)).toBeNull();
  });

  it("socials and Telegram: a full address, the network's own without https://, or a name kept as «@name»", () => {
    expect(cleanSocial("instagram", "https://www.instagram.com/rempire.ee/")).toBe("https://www.instagram.com/rempire.ee/");
    expect(cleanSocial("instagram", "instagram.com/rempire.ee")).toBe("https://instagram.com/rempire.ee");
    expect(cleanSocial("instagram", "@rempire.ee")).toBe("@rempire.ee");
    expect(cleanSocial("instagram", "rempire.ee")).toBe("@rempire.ee");
    expect(cleanSocial("facebook", "facebook.com/rempire")).toBe("https://facebook.com/rempire");
    expect(cleanSocial("telegram", "t.me/rempire")).toBe("https://t.me/rempire");
    expect(cleanSocial("telegram", "@rempire_test")).toBe("@rempire_test");
    expect(cleanSocial("facebook", "")).toBe("");
    expect(cleanSocial("instagram", "two words")).toBeNull();
    expect(cleanSocial("instagram", "javascript:alert(1)")).toBeNull();
    expect(cleanSocial("instagram", "@...")).toBeNull();
    expect(cleanSocial("instagram", "https://bad host/x")).toBeNull();
  });

  it("WhatsApp and Viber: a number, or a wa.me link, kept in E.164", () => {
    expect(cleanChatNumber("+372 5623 7237")).toBe("+37256237237");
    expect(cleanChatNumber("5623 7237")).toBe("+37256237237");
    expect(cleanChatNumber("https://wa.me/37256237237")).toBe("+37256237237");
    expect(cleanChatNumber("wa.me/+37256237237")).toBe("+37256237237");
    expect(cleanChatNumber("https://api.whatsapp.com/send?phone=37256237237")).toBe("+37256237237");
    expect(cleanChatNumber("")).toBe("");
    expect(cleanChatNumber("rempire")).toBeNull();
  });

  it("the page whole: the first field that is wrong is named; text is cut to its lines and limits", () => {
    expect(cleanContacts(contacts())).toMatchObject({ ok: true, value: { pin: { lat: 59.430883, lng: 24.761967 }, phone: "+372 5623 7237" } });
    expect(cleanContacts(contacts({ address: "x".repeat(LOC_MAX.address + 1) }))).toEqual({ ok: false, field: "address" });
    expect(cleanContacts(contacts({ pin: "Mardi 1" }))).toEqual({ ok: false, field: "pin" });
    expect(cleanContacts(contacts({ schedule: T3("x".repeat(LOC_MAX.schedule + 1)) }))).toEqual({ ok: false, field: "schedule" });
    expect(cleanContacts(contacts({ phone: "nope" }))).toEqual({ ok: false, field: "phone" });
    expect(cleanContacts(contacts({ website: "javascript:x" }))).toEqual({ ok: false, field: "website" });
    expect(cleanContacts(contacts({ facebook: "a b" }))).toEqual({ ok: false, field: "facebook" });
    expect(cleanContacts(contacts({ instagram: "a b" }))).toEqual({ ok: false, field: "instagram" });
    expect(cleanContacts(contacts({ whatsapp: "x" }))).toEqual({ ok: false, field: "whatsapp" });
    expect(cleanContacts(contacts({ telegram: "a b" }))).toEqual({ ok: false, field: "telegram" });
    expect(cleanContacts(contacts({ viber: "x" }))).toEqual({ ok: false, field: "viber" });
    // one line each: a pasted line break and runs of spaces become one space
    const r = cleanContacts(contacts({ address: "  Mardi 1,\n  Tallinn ", schedule: T3("пн–сб\t10–19") }));
    expect(r.ok && [r.value.address, r.value.schedule.ru]).toEqual(["Mardi 1, Tallinn", "пн–сб 10–19"]);
  });

  it("the brand: a name of 1–120 and words that keep their paragraphs", () => {
    expect(cleanBrand({ name: "  ", about: T3() })).toEqual({ ok: false, field: "name" });
    expect(cleanBrand({ name: "x".repeat(LOC_MAX.name + 1), about: T3() })).toEqual({ ok: false, field: "name" });
    expect(cleanBrand({ name: "REMPIRE", about: T3("x".repeat(LOC_MAX.about + 1)) })).toEqual({ ok: false, field: "about" });
    expect(cleanBrand({ name: " REMPIRE ", about: T3("Первый абзац.  \r\n\r\n\r\n\r\nВторой.\u0007", "", " Hi ") })).toEqual({
      ok: true,
      value: { name: "REMPIRE", about: { ru: "Первый абзац.\n\nВторой.", et: "", en: "Hi" } },
    });
  });
});

describe("saving «Бренд» and «Контакты»", () => {
  it("only what changed goes into the audit row, flat; a save that changes nothing writes nothing", async () => {
    const before = (await loadLocationSettings(query, demo.business.id, owner()))!;
    expect(before.name).toBe("REMPIRE");
    expect(await saveBrand(demo.business, { name: "REMPIRE", about: before.about }, owner())).toEqual({ ok: true });
    expect(await audits()).toEqual([]);

    expect(await saveBrand(demo.business, { name: "REMPIRE Mardi", about: { ...before.about, ru: "Новые слова." } }, owner())).toEqual({ ok: true });
    const [a] = await audits();
    expect(a).toMatchObject({ entity: "location", action: "edit", before: { name: "REMPIRE", about_ru: before.about.ru }, after: { name: "REMPIRE Mardi", about_ru: "Новые слова." } });
    expect(Object.keys(a.after!).sort()).toEqual(["about_ru", "name"]);
    const now = (await loadLocationSettings(query, demo.business.id, owner()))!;
    expect([now.name, now.about.ru, now.about.en]).toEqual(["REMPIRE Mardi", "Новые слова.", before.about.en]);
  });

  it("contacts: the pin from a link, an empty language left out of the stored words, the socials normalised", async () => {
    const r = await saveContacts(
      demo.business,
      contacts({ pin: "https://www.openstreetmap.org/#map=18/59.43/24.76", schedule: T3("пн–пт 10–18", "", ""), instagram: "rempire.ee", whatsapp: "wa.me/37256237237" }),
      owner(),
    );
    expect(r).toEqual({ ok: true });
    const row = await locRow();
    expect([Number(row.lat), Number(row.lng)]).toEqual([59.43, 24.76]);
    expect(row.schedule).toEqual({ ru: "пн–пт 10–18" });
    const s = (await loadLocationSettings(query, demo.business.id, owner()))!;
    expect([s.instagram, s.whatsapp]).toEqual(["@rempire.ee", "+37256237237"]);
    const [a] = await audits();
    expect(a.after).toMatchObject({ pin: "59.43, 24.76", schedule_ru: "пн–пт 10–18", schedule_et: "", instagram: "@rempire.ee", whatsapp: "+37256237237" });
    expect(a.after).not.toHaveProperty("address");
    // no pin: no map
    expect(await saveContacts(demo.business, contacts({ pin: "" }), owner())).toEqual({ ok: true });
    expect((await locRow()).lat).toBeNull();
  });

  it("a wrong field is refused before the database, and nothing is written", async () => {
    expect(await saveContacts(demo.business, contacts({ website: "javascript:alert(1)" }), owner())).toEqual({ ok: false, field: "website" });
    expect(await saveBrand(demo.business, { name: "", about: T3() }, owner())).toEqual({ ok: false, field: "name" });
    expect(await audits()).toEqual([]);
  });

  it("without «Доступ к настройкам локации» nothing is read or changed: the front desk until the owner gives it", async () => {
    expect(await loadLocationSettings(query, demo.business.id, desk())).toBeNull();
    expect(await saveBrand(demo.business, { name: "Other", about: T3() }, desk())).toEqual({ ok: false, field: "forbidden" });
    expect(await saveContacts(demo.business, contacts({ address: "Elsewhere 1" }), desk())).toEqual({ ok: false, field: "forbidden" });
    expect(await saveLogo(demo.business, PNG(), desk())).toEqual({ ok: false, field: "forbidden" });
    expect(await removeLogo(demo.business, desk())).toEqual({ ok: false, field: "forbidden" });
    expect(await addPhoto(demo.business, PNG(), desk())).toEqual({ ok: false, field: "forbidden" });
    expect(await removePhoto(demo.business, "/brand/rempire-photo.svg", desk())).toEqual({ ok: false, field: "forbidden" });
    expect(await orderPhotos(demo.business, ["/brand/rempire-photo.svg"], desk())).toEqual({ ok: false, field: "forbidden" });
    expect((await locRow()).name).toBe("REMPIRE");
    expect(await audits()).toEqual([]);
  });

  it("a business with no location is told so", async () => {
    await query("update locations set active = false where business_id = $1", [demo.business.id]);
    expect(await loadLocationSettings(query, demo.business.id, owner())).toBeNull();
    expect(await saveBrand(demo.business, { name: "X", about: T3() }, owner())).toEqual({ ok: false, field: "location" });
    expect(await addPhoto(demo.business, PNG(), owner())).toEqual({ ok: false, field: "location" });
  });
});

describe("the logo and the gallery", () => {
  it("a logo by its first bytes, 600 KB at most; a new one replaces the old, whose file is deleted", async () => {
    expect(await saveLogo(demo.business, new Uint8Array([0x3c, 0x73, 0x76, 0x67, 1, 2, 3, 4, 5, 6]), owner())).toEqual({ ok: false, field: "logo" });
    const big = new Uint8Array(600_001);
    big.set(PNG());
    expect(await saveLogo(demo.business, big, owner())).toEqual({ ok: false, field: "logo" });
    expect(await saveLogo(demo.business, new Uint8Array(), owner())).toEqual({ ok: false, field: "logo" });

    const first = await saveLogo(demo.business, PNG(), owner());
    if (!first.ok) throw new Error(first.field);
    expect(first.url).toMatch(/^\/api\/salon\/image\/[0-9a-f-]{36}$/);
    const second = await saveLogo(demo.business, WEBP(), owner());
    if (!second.ok) throw new Error(second.field);
    expect(second.url).not.toBe(first.url);
    expect((await locRow()).logo).toBe(second.url);
    expect(await query("select mime from location_images where kind = 'logo'")).toEqual([{ mime: "image/webp" }]);
    expect(await locationImage(query, first.url.split("/").pop()!)).toBeNull();
    // the booking page shows it in the disc
    expect((await loadCatalog(query, demo.business.id)).location.logo).toBe(second.url);

    expect(await removeLogo(demo.business, owner())).toEqual({ ok: true });
    expect((await locRow()).logo).toBe("");
    expect(await query("select id from location_images")).toEqual([]);
    expect((await loadCatalog(query, demo.business.id)).location.logo).toBe("");
    // removing nothing writes nothing more
    expect(await removeLogo(demo.business, owner())).toEqual({ ok: true });
    expect((await audits()).map((a) => a.action)).toEqual(["logo", "logo", "logo_remove"]);
    const [, replaced, removed] = await audits();
    expect(replaced.before).toEqual({ logo: first.url });
    expect(replaced.after).toMatchObject({ logo: second.url, mime: "image/webp", bytes: WEBP().length });
    expect(removed).toMatchObject({ before: { logo: second.url }, after: null });
  });

  it("the catalog keeps only a logo the page may load", async () => {
    await query("update locations set logo = 'javascript:alert(1)' where business_id = $1", [demo.business.id]);
    expect((await loadCatalog(query, demo.business.id)).location.logo).toBe("");
  });

  it("photos: added at the end up to eight, the seeded one kept; then «full»", async () => {
    const seeded = (await locRow()).photos;
    expect(seeded).toEqual(["/brand/rempire-photo.svg"]);
    const added: string[] = [];
    for (let i = seeded.length; i < MAX_PHOTOS; i++) {
      const r = await addPhoto(demo.business, i % 2 ? JPEG() : PNG(), owner());
      if (!r.ok) throw new Error(r.field);
      added.push(r.photos[r.photos.length - 1]);
    }
    expect((await locRow()).photos).toEqual([...seeded, ...added]);
    expect(await addPhoto(demo.business, PNG(), owner())).toEqual({ ok: false, field: "full" });
    expect(await addPhoto(demo.business, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), owner())).toEqual({ ok: false, field: "photo" });
    const [{ n }] = await query<{ n: number }>("select count(*)::int as n from location_images where kind = 'photo'");
    expect(n).toBe(MAX_PHOTOS - seeded.length);
    // the booking page lists them in that order
    expect((await loadCatalog(query, demo.business.id)).location.photos).toEqual([...seeded, ...added]);
  });

  it("a new order is exactly the photos there, each once; removing one deletes its file", async () => {
    const a = await addPhoto(demo.business, PNG(), owner());
    const b = await addPhoto(demo.business, JPEG(), owner());
    if (!a.ok || !b.ok) throw new Error("add");
    const [seed, pa, pb] = b.photos;
    expect(await orderPhotos(demo.business, [pb, seed], owner())).toEqual({ ok: false, field: "photos" });
    expect(await orderPhotos(demo.business, [pb, pb, seed], owner())).toEqual({ ok: false, field: "photos" });
    expect(await orderPhotos(demo.business, [pb, seed, "/elsewhere.jpg"], owner())).toEqual({ ok: false, field: "photos" });
    expect(await orderPhotos(demo.business, [pb, seed, pa], owner())).toEqual({ ok: true, photos: [pb, seed, pa] });
    // the same order again: nothing written
    const n = (await audits()).length;
    expect(await orderPhotos(demo.business, [pb, seed, pa], owner())).toEqual({ ok: true, photos: [pb, seed, pa] });
    expect((await audits()).length).toBe(n);

    expect(await removePhoto(demo.business, "/not-there.jpg", owner())).toEqual({ ok: false, field: "photo" });
    expect(await removePhoto(demo.business, pb, owner())).toEqual({ ok: true, photos: [seed, pa] });
    expect(await locationImage(query, pb.split("/").pop()!)).toBeNull();
    // the seeded picture is a file of the site: it leaves the list, nothing else is touched
    expect(await removePhoto(demo.business, seed, owner())).toEqual({ ok: true, photos: [pa] });
    expect((await audits()).map((x) => x.action)).toEqual(["photo", "photo", "photo_order", "photo_remove", "photo_remove"]);
    const order = (await audits())[2];
    expect(order).toMatchObject({ before: { photos: [seed, pa, pb] }, after: { photos: [pb, seed, pa] } });
  });
});

describe("/api/salon/image/<id>", () => {
  const get = (id: string) => imageRoute(new Request(`http://localhost/api/salon/image/${id}`), { params: Promise.resolve({ id }) });

  it("an uploaded image: its own type, cached for good, never indexed", async () => {
    const r = await addPhoto(demo.business, JPEG(), owner());
    if (!r.ok) throw new Error(r.field);
    const id = r.photos[r.photos.length - 1].split("/").pop()!;
    const res = await get(id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG());
  });

  it("anything else is a 404, not kept in a cache, and not indexed either", async () => {
    for (const id of ["not-a-uuid", "00000000-0000-4000-8000-000000000000"]) {
      const res = await get(id);
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-robots-tag")).toBe("noindex");
    }
  });
});

describe("«Изменения данных»", () => {
  it("a change of the salon's page is listed as «Локация», named by the location's name, with its fields", async () => {
    await saveContacts(demo.business, contacts({ schedule: T3("пн–пт 10–18", "E–R 10–18", "Mon–Fri 10–18") }), owner());
    const filter = cleanChanges({ ...defaultChanges("2026-11-20"), from: "2000-01-01", to: "2100-12-31", entity: "location" });
    const list = await listChanges(query, demo.business, filter, owner(), "ru");
    expect(list.total).toBe(1);
    const [row] = list.rows;
    expect(row).toMatchObject({ entity: "location", action: "edit", object: { name: "REMPIRE" } });
    expect(row.fields.map((f) => f.key).sort()).toEqual(["schedule_en", "schedule_et", "schedule_ru"]);
    // another kind of change is not under «Локация»
    expect((await listChanges(query, demo.business, cleanChanges({ ...filter, entity: "client" }), owner(), "ru")).total).toBe(0);
  });
});

describe("migration 031", () => {
  it("adds the logo ('' for none) and the image table, keeps the gallery, and holds the limits", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "booking-031-"));
    const pg = await newPglite();
    try {
      for (const m of migrationFiles()) if (m.name < "031") writeFileSync(path.join(dir, m.name), m.sql);
      await migrate(pg, { dir });
      const [biz] = (await pg.query<{ id: string }>("insert into businesses (slug, name) values ('loc-031', 'Test Salon') returning id")).rows;
      const [loc] = (await pg.query<{ id: string }>(`insert into locations (business_id, slug, name, address, photos) values ($1, 'one', 'Test Salon', 'Fake street 1', '["/brand/rempire-photo.svg"]'::jsonb) returning id`, [biz.id])).rows;
      expect(await migrate(pg)).toContain("031_location_images.sql");
      const [row] = (await pg.query<{ logo: string; photos: string[] }>("select logo, photos from locations where id = $1", [loc.id])).rows;
      expect(row).toEqual({ logo: "", photos: ["/brand/rempire-photo.svg"] });

      const put = (kind: string, mime: string, bytes: Uint8Array) => pg.query("insert into location_images (location_id, kind, mime, bytes) values ($1, $2, $3, $4)", [loc.id, kind, mime, bytes]);
      await put("photo", "image/png", PNG());
      await put("logo", "image/webp", WEBP());
      await expect(put("banner", "image/png", PNG())).rejects.toThrow();
      await expect(put("photo", "image/svg+xml", PNG())).rejects.toThrow();
      await expect(put("photo", "image/png", new Uint8Array())).rejects.toThrow();
      await expect(put("photo", "image/png", new Uint8Array(600_001))).rejects.toThrow();
      // eight photos at most, and the list stays a list
      await pg.query("update locations set photos = $2::jsonb where id = $1", [loc.id, JSON.stringify(Array.from({ length: 8 }, (_, i) => `/p${i}.jpg`))]);
      await expect(pg.query("update locations set photos = $2::jsonb where id = $1", [loc.id, JSON.stringify(Array.from({ length: 9 }, (_, i) => `/p${i}.jpg`))])).rejects.toThrow();
      await expect(pg.query(`update locations set photos = '{}'::jsonb where id = $1`, [loc.id])).rejects.toThrow();
      await expect(pg.query("update locations set logo = $2 where id = $1", [loc.id, `/${"x".repeat(300)}`])).rejects.toThrow();
      // a location that goes takes its images with it
      await pg.query("delete from locations where id = $1", [loc.id]);
      expect((await pg.query("select id from location_images")).rows).toEqual([]);
    } finally {
      await pg.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
