/**
 * «Настройки → Локация» (Dim, 20.11.2026): the salon's page on the booking
 * site («REMPIRE ▾», src/app/[locale]/booking-flow.tsx), changed in the
 * admin instead of by SQL. Three pages, as the tool we follow has them
 * (docs/altegio-pages.md, «Настройки»): «Бренд», «Контакты», «Галерея».
 * What may be typed and how it is kept is src/lib/admin/location-form.ts.
 *
 * The location is the one the booking page shows (src/lib/catalog.ts): the
 * business's first active one by sort and name.
 *
 * Images: as the barbers' portraits (007, staff.ts), the browser shrinks a
 * picture first and the bytes are kept in the database (031,
 * location_images); here only the kind (by its first bytes) and the size
 * are checked. locations.photos and locations.logo stay the addresses
 * every page reads: an upload adds /api/salon/image/<id>, a new id each
 * time, so a file is never served from an old cache. A replaced logo and a
 * removed photo are deleted, so nothing that is not shown is kept.
 *
 * Rights (src/lib/auth/rights.ts): every function here asks «Доступ к
 * настройкам локации» (settings.location) of the login it is handed, and
 * the actions (src/app/admin/(app)/settings/actions.ts) ask it too. Before
 * the rights only the owner could change the salon's details (by SQL).
 *
 * Every change writes one audit row: entity «location», what changed
 * before → after («edit»), «logo» and «logo_remove», «photo»,
 * «photo_remove» and «photo_order». A save that changes nothing writes
 * nothing.
 */
import { can, type Holder } from "../auth/rights";
import type { Business } from "../availability";
import { withTx, type Querier } from "../db";
import { cleanBrand, cleanContacts, formText3, MAX_PHOTOS, phonesOf, pinText, storedText3, type BrandInput, type ContactsInput, type PhoneEntry, type Pin, type Text3 } from "./location-form";
import { imageMime, PHOTO_MAX_BYTES } from "./staff";
import { isUuid } from "./visits";

type Who = Holder & { id: string };
type Fail = { ok: false; field: string };
export type LocResult = { ok: true } | Fail;

const NO: Fail = { ok: false, field: "forbidden" };
const GONE: Fail = { ok: false, field: "location" };

/** May this login change the salon's page? The pages, their actions and the functions below ask the same. */
export const locationMay = (who: Holder | null | undefined) => can(who, "settings.location");

/** What the three pages show and edit, as stored. */
export type LocationSettings = {
  id: string;
  name: string;
  about: Text3;
  /** the uploaded logo's address; '' is none (the booking page keeps REMPIRE's mark) */
  logo: string;
  address: string;
  /** ISO code (migration 034) */
  country: string;
  postcode: string;
  pin: Pin | null;
  schedule: Text3;
  /** the main number: the first of `phones` */
  phone: string;
  /** every number, the main one first (migration 034) */
  phones: PhoneEntry[];
  website: string;
  facebook: string;
  instagram: string;
  whatsapp: string;
  telegram: string;
  viber: string;
  /** the gallery, in order */
  photos: string[];
};

type Row = {
  id: string;
  name: string;
  about: unknown;
  logo: string;
  address: string;
  country: string;
  postcode: string;
  lat: number | string | null;
  lng: number | string | null;
  schedule: unknown;
  phone: string;
  phones: unknown;
  website: string;
  facebook: string;
  instagram: string;
  whatsapp: string;
  telegram: string;
  viber: string;
  photos: unknown;
};

const COLUMNS = "id, name, about, logo, address, country, postcode, lat, lng, schedule, phone, phones, website, facebook, instagram, whatsapp, telegram, viber, photos";

/** The booking page's location (catalog.ts reads the same one); locked for the change when `lock`. */
async function salonLocation(q: Querier, businessId: string, lock = false): Promise<Row | null> {
  const [row] = await q<Row>(`select ${COLUMNS} from locations where business_id = $1 and active order by sort, name limit 1${lock ? " for update" : ""}`, [businessId]);
  return row ?? null;
}

const photosOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((u): u is string => typeof u === "string") : []);

function settingsOf(r: Row): LocationSettings {
  const lat = r.lat == null ? null : Number(r.lat);
  const lng = r.lng == null ? null : Number(r.lng);
  return {
    id: r.id,
    name: r.name,
    about: formText3(r.about),
    logo: r.logo,
    address: r.address,
    country: r.country,
    postcode: r.postcode,
    pin: lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
    schedule: formText3(r.schedule),
    phone: r.phone,
    phones: phonesOf(r.phones, r.phone),
    website: r.website,
    facebook: r.facebook,
    instagram: r.instagram,
    whatsapp: r.whatsapp,
    telegram: r.telegram,
    viber: r.viber,
    photos: photosOf(r.photos),
  };
}

/** The salon's page as the three pages edit it; null without the right, or with no location. */
export async function loadLocationSettings(q: Querier, businessId: string, who: Holder): Promise<LocationSettings | null> {
  if (!locationMay(who)) return null;
  const row = await salonLocation(q, businessId);
  return row ? settingsOf(row) : null;
}

/** Only what differs, flat, for the audit row: «about_ru», «pin»… */
function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    if (JSON.stringify(before[k] ?? null) === JSON.stringify(after[k] ?? null)) continue;
    b[k] = before[k] ?? null;
    a[k] = after[k] ?? null;
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}

const flat3 = (key: string, t: Text3) => ({ [`${key}_ru`]: t.ru, [`${key}_et`]: t.et, [`${key}_en`]: t.en });

async function audit(q: Querier, actor: string, locationId: string, action: string, before: unknown, after: unknown) {
  await q(`insert into audit (actor, entity, entity_id, action, before, after) values ($1, 'location', $2, $3, $4::jsonb, $5::jsonb)`, [
    actor,
    locationId,
    action,
    before == null ? null : JSON.stringify(before),
    after == null ? null : JSON.stringify(after),
  ]);
}

/** «Бренд»: the name the booking page gives the salon and its words in three languages. */
export async function saveBrand(business: Pick<Business, "id">, input: BrandInput, who: Who): Promise<LocResult> {
  if (!locationMay(who)) return NO;
  const c = cleanBrand(input);
  if (!c.ok) return c;
  return withTx(async (tx) => {
    const loc = await salonLocation(tx, business.id, true);
    if (!loc) return GONE;
    const was = settingsOf(loc);
    const d = diff({ name: was.name, ...flat3("about", was.about) }, { name: c.value.name, ...flat3("about", c.value.about) });
    if (!d.changed) return { ok: true as const };
    await tx("update locations set name = $2, about = $3::jsonb where id = $1", [loc.id, c.value.name, JSON.stringify(storedText3(c.value.about))]);
    await audit(tx, who.id, loc.id, "edit", d.before, d.after);
    return { ok: true as const };
  });
}

/** The numbers as one line for the audit row: «+372 5623 7237; +372 5555 0000 (Тату)». */
const phonesText = (list: readonly PhoneEntry[]) => list.map((p) => (p.label ? `${p.number} (${p.label})` : p.number)).join("; ");

/** «Контакты»: the address, its country, postcode and pin, the hours, the phones, the site, the socials and the messengers. */
export async function saveContacts(business: Pick<Business, "id">, input: ContactsInput, who: Who): Promise<LocResult> {
  if (!locationMay(who)) return NO;
  const c = cleanContacts(input);
  if (!c.ok) return c;
  const v = c.value;
  return withTx(async (tx) => {
    const loc = await salonLocation(tx, business.id, true);
    if (!loc) return GONE;
    const was = settingsOf(loc);
    const flat = (s: Omit<LocationSettings, "id" | "name" | "about" | "logo" | "photos">) => ({
      address: s.address,
      country: s.country,
      postcode: s.postcode,
      pin: pinText(s.pin),
      ...flat3("schedule", s.schedule),
      phones: phonesText(s.phones),
      website: s.website,
      facebook: s.facebook,
      instagram: s.instagram,
      whatsapp: s.whatsapp,
      telegram: s.telegram,
      viber: s.viber,
    });
    const d = diff(flat(was), flat(v));
    if (!d.changed) return { ok: true as const };
    // `phone` is the list's first: the one number the booking site, the letters and the SMS show (migration 034)
    await tx(
      `update locations
          set address = $2, lat = $3, lng = $4, schedule = $5::jsonb, phone = $6, website = $7,
              facebook = $8, instagram = $9, whatsapp = $10, telegram = $11, viber = $12,
              phones = $13::jsonb, country = $14, postcode = $15
        where id = $1`,
      [
        loc.id,
        v.address,
        v.pin?.lat ?? null,
        v.pin?.lng ?? null,
        JSON.stringify(storedText3(v.schedule)),
        v.phone,
        v.website,
        v.facebook,
        v.instagram,
        v.whatsapp,
        v.telegram,
        v.viber,
        JSON.stringify(v.phones),
        v.country,
        v.postcode,
      ],
    );
    await audit(tx, who.id, loc.id, "edit", d.before, d.after);
    return { ok: true as const };
  });
}

/* ---------- the logo and the gallery ---------- */

/** /api/salon/image/<id>: an image of ours, so its row can be found and deleted. */
const IMAGE_URL = /^\/api\/salon\/image\/([0-9a-f-]{36})$/i;
const imageUrl = (id: string) => `/api/salon/image/${id}`;
const imageIdOf = (url: string) => {
  const id = IMAGE_URL.exec(url)?.[1];
  return id && isUuid(id) ? id : null;
};

/** A picture the browser has shrunk: JPEG, PNG or WebP by its first bytes, 600 KB at most. */
function checkImage(bytes: Uint8Array): string | null {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > PHOTO_MAX_BYTES) return null;
  return imageMime(bytes);
}

async function putImage(q: Querier, locationId: string, kind: "logo" | "photo", mime: string, bytes: Uint8Array): Promise<string> {
  const [row] = await q<{ id: string }>("insert into location_images (location_id, kind, mime, bytes) values ($1, $2, $3, $4) returning id", [locationId, kind, mime, Buffer.from(bytes)]);
  return row.id;
}

/** A new logo in place of the old one (which is deleted). Returns its address. */
export async function saveLogo(business: Pick<Business, "id">, bytes: Uint8Array, who: Who): Promise<{ ok: true; url: string } | Fail> {
  if (!locationMay(who)) return NO;
  const mime = checkImage(bytes);
  if (!mime) return { ok: false, field: "logo" };
  return withTx(async (tx) => {
    const loc = await salonLocation(tx, business.id, true);
    if (!loc) return GONE;
    await tx("delete from location_images where location_id = $1 and kind = 'logo'", [loc.id]);
    const url = imageUrl(await putImage(tx, loc.id, "logo", mime, bytes));
    await tx("update locations set logo = $2 where id = $1", [loc.id, url]);
    await audit(tx, who.id, loc.id, "logo", loc.logo ? { logo: loc.logo } : null, { logo: url, mime, bytes: bytes.length });
    return { ok: true as const, url };
  });
}

/** No logo: the booking page keeps REMPIRE's own mark. */
export async function removeLogo(business: Pick<Business, "id">, who: Who): Promise<LocResult> {
  if (!locationMay(who)) return NO;
  return withTx(async (tx) => {
    const loc = await salonLocation(tx, business.id, true);
    if (!loc) return GONE;
    if (!loc.logo) return { ok: true as const };
    await tx("delete from location_images where location_id = $1 and kind = 'logo'", [loc.id]);
    await tx("update locations set logo = '' where id = $1", [loc.id]);
    await audit(tx, who.id, loc.id, "logo_remove", { logo: loc.logo }, null);
    return { ok: true as const };
  });
}

export type PhotosResult = { ok: true; photos: string[] } | Fail;

/** One more photo at the end of the gallery; «full» when it has eight. Returns the gallery after it. */
export async function addPhoto(business: Pick<Business, "id">, bytes: Uint8Array, who: Who): Promise<PhotosResult> {
  if (!locationMay(who)) return NO;
  const mime = checkImage(bytes);
  if (!mime) return { ok: false, field: "photo" };
  return withTx(async (tx) => {
    const loc = await salonLocation(tx, business.id, true);
    if (!loc) return GONE;
    const photos = photosOf(loc.photos);
    if (photos.length >= MAX_PHOTOS) return { ok: false as const, field: "full" };
    const url = imageUrl(await putImage(tx, loc.id, "photo", mime, bytes));
    const next = [...photos, url];
    await tx("update locations set photos = $2::jsonb where id = $1", [loc.id, JSON.stringify(next)]);
    await audit(tx, who.id, loc.id, "photo", null, { photo: url, mime, bytes: bytes.length });
    return { ok: true as const, photos: next };
  });
}

/** A photo out of the gallery; ours is deleted too. One that is not there is «photo». */
export async function removePhoto(business: Pick<Business, "id">, url: string, who: Who): Promise<PhotosResult> {
  if (!locationMay(who)) return NO;
  return withTx(async (tx) => {
    const loc = await salonLocation(tx, business.id, true);
    if (!loc) return GONE;
    const photos = photosOf(loc.photos);
    if (typeof url !== "string" || !photos.includes(url)) return { ok: false as const, field: "photo" };
    const next = photos.filter((u) => u !== url);
    await tx("update locations set photos = $2::jsonb where id = $1", [loc.id, JSON.stringify(next)]);
    const id = imageIdOf(url);
    // the same address twice is not something the admin makes; its file goes once nothing shows it
    if (id && !next.includes(url)) await tx("delete from location_images where id = $1 and location_id = $2 and kind = 'photo'", [id, loc.id]);
    await audit(tx, who.id, loc.id, "photo_remove", { photo: url }, null);
    return { ok: true as const, photos: next };
  });
}

/** The gallery in a new order: exactly the photos it has, each once. */
export async function orderPhotos(business: Pick<Business, "id">, urls: readonly string[], who: Who): Promise<PhotosResult> {
  if (!locationMay(who)) return NO;
  return withTx(async (tx) => {
    const loc = await salonLocation(tx, business.id, true);
    if (!loc) return GONE;
    const photos = photosOf(loc.photos);
    const asked = Array.isArray(urls) ? urls.filter((u): u is string => typeof u === "string") : [];
    const same = asked.length === photos.length && new Set(asked).size === asked.length && asked.every((u) => photos.includes(u));
    if (!same) return { ok: false as const, field: "photos" };
    if (asked.every((u, i) => u === photos[i])) return { ok: true as const, photos };
    await tx("update locations set photos = $2::jsonb where id = $1", [loc.id, JSON.stringify(asked)]);
    await audit(tx, who.id, loc.id, "photo_order", { photos }, { photos: asked });
    return { ok: true as const, photos: asked };
  });
}

/** An uploaded logo or photo, for /api/salon/image/<id>. Public: clients see it on the salon's page. */
export async function locationImage(q: Querier, id: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
  if (!isUuid(id)) return null;
  const [row] = await q<{ mime: string; bytes: Uint8Array }>("select mime, bytes from location_images where id = $1", [id]);
  return row ? { mime: row.mime, bytes: new Uint8Array(row.bytes) } : null;
}
