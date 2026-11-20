/**
 * «Настройки → Локация» (Dim, 20.11.2026): what the owner may type into the
 * salon's page on the booking site («REMPIRE ▾», src/app/[locale]/booking-flow.tsx;
 * db/migrations/028_location_profile.sql and 031). The three pages of the
 * tool we follow (docs/altegio-pages.md, «Настройки»): «Бренд» (the name,
 * the words, the logo), «Контакты» (the address, the map's pin, the hours,
 * the phone, the site, the socials and messengers) and «Галерея».
 *
 * Here: the limits, the checks and how a value is kept. No database and no
 * Next.js: the forms in the browser check with the same functions the
 * server saves with (src/lib/admin/location.ts).
 *
 * How a value is kept, so the booking page can link it (contactRows there):
 *   phone              as typed, a plausible number with its country code;
 *                      one typed without one gets +372 (normalizePhone)
 *   website            as typed: https://… or a bare domain (www.rempire.ee)
 *   instagram, facebook, telegram
 *                      a full https:// address, or a name kept as «@name»
 *   whatsapp, viber    the number in E.164 (+3725…); a wa.me link gives its number
 *   pin                both or neither; six decimals
 */
import { normalizePhone } from "../phone";

export const LOC_MAX = {
  name: 120,
  about: 2000,
  address: 200,
  schedule: 120,
  phone: 40,
  website: 200,
  social: 200,
} as const;

/** The widget allows eight photos (migration 031 holds the same floor). */
export const MAX_PHOTOS = 8;

export type Text3 = { ru: string; et: string; en: string };
export type Pin = { lat: number; lng: number };

export type BrandInput = { name: string; about: Text3 };
export type ContactsInput = {
  address: string;
  /** what was typed or pasted: «59.43, 24.76», a map's link, or '' for no map */
  pin: string;
  schedule: Text3;
  phone: string;
  website: string;
  facebook: string;
  instagram: string;
  whatsapp: string;
  telegram: string;
  viber: string;
};
export type CleanContacts = Omit<ContactsInput, "pin"> & { pin: Pin | null };

export type Checked<T> = { ok: true; value: T } | { ok: false; field: string };

const LANGS = ["ru", "et", "en"] as const;

/** Control characters out (a line break and a tab stay where `lines` allows them), \r\n as \n. */
function plain(v: unknown, lines: boolean): string {
  const s = String(v ?? "").replace(/\r\n?/g, "\n");
  // eslint-disable-next-line no-control-regex
  const out = lines ? s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "") : s.replace(/[\u0000-\u001f\u007f]+/g, " ");
  return out.trim();
}

/** One line: control characters and runs of spaces become one space. */
const line = (v: unknown) => plain(v, false).replace(/\s+/g, " ");

/** Words in three languages, each trimmed; the line breaks kept where `lines`. */
function text3(v: unknown, lines: boolean): Text3 {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const one = (x: unknown) => (lines ? plain(x, true).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n") : line(x));
  return { ru: one(o.ru), et: one(o.et), en: one(o.en) };
}

/* ---------- the pin ---------- */

export type PinParse = { ok: true; pin: Pin | null } | { ok: false; why: "bad" | "short" | "range" };

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function pinOf(lat: number, lng: number): PinParse {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, why: "bad" };
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { ok: false, why: "range" };
  return { ok: true, pin: { lat: round6(lat), lng: round6(lng) } };
}

const NUM = String.raw`[-+]?\d{1,3}(?:\.\d+)?`;
/** «59.430883, 24.761967», «59.430883 24.761967», «59.430883;24.761967» */
// (the separators do not overlap, so a long run of spaces cannot make the match slow)
const PAIR = new RegExp(String.raw`^(${NUM})(?:\s*[,;]\s*|\s+)(${NUM})$`);
/** «59,430883; 24,761967» or «59,430883, 24,761967»: decimal commas, so the two need a ; a space or «, » between them */
const PAIR_COMMA = /^([-+]?\d{1,3}(?:,\d+)?)(?:\s*;\s*|\s*,\s+|\s+)([-+]?\d{1,3}(?:,\d+)?)$/;
/** Longer than any map link: refused before a pattern reads it. */
const PIN_MAX = 2000;
/** «59.4308° N, 24.7619° E», as a map shows a place */
const HEMI = /^(\d{1,3}(?:[.,]\d+)?)\s*°?\s*([NS])[\s,;]+(\d{1,3}(?:[.,]\d+)?)\s*°?\s*([EW])$/i;
/** «59°25'51.2"N 24°45'43.1"E», as Google Maps shows a place */
const DMS = /^(\d{1,3})\s*°\s*(\d{1,2})\s*['′’]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:["″”]|'')?\s*([NS])[\s,;]*(\d{1,3})\s*°\s*(\d{1,2})\s*['′’]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:["″”]|'')?\s*([EW])$/i;

const dec = (s: string) => Number(s.replace(",", "."));

/** Two numbers in a piece of a link: «59.43,24.76», «59.43, 24.76», «loc:59.43+24.76». */
function pairIn(s: string | null | undefined): Pin | null {
  if (!s) return null;
  const m = new RegExp(String.raw`^(?:loc:)?\s*(${NUM})\s*(?:,|\+|\s)\s*\+?\s*(${NUM})`).exec(s.trim());
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

/** The pin in a link from Google Maps or OpenStreetMap, or in a geo: address. */
function pinInLink(raw: string): PinParse {
  if (/^geo:/i.test(raw)) {
    const p = pairIn(raw.slice(4));
    return p ? pinOf(p.lat, p.lng) : { ok: false, why: "bad" };
  }
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, why: "bad" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, why: "bad" };
  const host = url.hostname.toLowerCase();
  // a short link names the place only once it is opened, and this page opens nothing
  if (host === "goo.gl" || host.endsWith(".goo.gl") || (host === "osm.org" && url.pathname.startsWith("/go/"))) return { ok: false, why: "short" };
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // a stray «%» in a link: read it as it is
  }
  const q = url.searchParams;
  const found = (p: Pin | null) => (p ? pinOf(p.lat, p.lng) : null);

  if (/(^|\.)google\.[a-z.]+$/.test(host) || host === "maps.google.com") {
    // a place's own pin (!3d…!4d…) comes before where the map was looking (@…)
    const place = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(raw);
    const r =
      (place && found({ lat: Number(place[1]), lng: Number(place[2]) })) ||
      found(pairIn(q.get("q"))) ||
      found(pairIn(q.get("query"))) ||
      found(pairIn(q.get("ll"))) ||
      found(pairIn(q.get("center"))) ||
      found(pairIn(q.get("destination"))) ||
      found(pairIn(q.get("daddr"))) ||
      found(pairIn(/\/(?:place|search)\/([^/]+)/.exec(path)?.[1])) ||
      found(pairIn(/@([^/]+)/.exec(path)?.[1]));
    return r ?? { ok: false, why: "bad" };
  }
  if (host === "openstreetmap.org" || host.endsWith(".openstreetmap.org") || host === "osm.org") {
    const mlat = q.get("mlat") ?? q.get("lat");
    const mlon = q.get("mlon") ?? q.get("lon");
    if (mlat && mlon && /^-?\d+(?:\.\d+)?$/.test(mlat) && /^-?\d+(?:\.\d+)?$/.test(mlon)) return pinOf(Number(mlat), Number(mlon));
    const m = /map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(url.hash);
    if (m) return pinOf(Number(m[1]), Number(m[2]));
    return { ok: false, why: "bad" };
  }
  return { ok: false, why: "bad" };
}

/**
 * Where the map's pin goes, from what the owner typed or pasted: two
 * numbers («59.43088, 24.76197»; decimal commas too, when a ; a space or
 * «, » parts them), the same with N/E or in degrees, minutes and seconds,
 * or a link from Google Maps or OpenStreetMap. '' is «no pin, no map».
 */
export function parsePin(input: unknown): PinParse {
  const raw = String(input ?? "");
  if (raw.length > PIN_MAX) return { ok: false, why: "bad" };
  const s = raw.trim();
  if (!s) return { ok: true, pin: null };
  let m = PAIR.exec(s);
  if (m) return pinOf(Number(m[1]), Number(m[2]));
  m = PAIR_COMMA.exec(s);
  if (m) return pinOf(dec(m[1]), dec(m[2]));
  m = HEMI.exec(s);
  if (m) return pinOf(dec(m[1]) * (m[2].toUpperCase() === "S" ? -1 : 1), dec(m[3]) * (m[4].toUpperCase() === "W" ? -1 : 1));
  m = DMS.exec(s);
  if (m) {
    const deg = (d: string, mi: string, se: string, h: string) => (Number(d) + Number(mi) / 60 + dec(se) / 3600) * (/[SW]/i.test(h) ? -1 : 1);
    return pinOf(deg(m[1], m[2], m[3], m[4]), deg(m[5], m[6], m[7], m[8]));
  }
  if (/^geo:/i.test(s) || /^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/|\?|#|$)/i.test(s)) return pinInLink(s);
  return { ok: false, why: "bad" };
}

/** «59.430883, 24.761967»: the pin as the field shows it. */
export const pinText = (pin: Pin | null) => (pin ? `${pin.lat}, ${pin.lng}` : "");

/** OpenStreetMap at the pin, for «Открыть на карте» beside the field: the owner checks the place. */
export const pinLink = (pin: Pin) => `https://www.openstreetmap.org/?mlat=${pin.lat}&mlon=${pin.lng}#map=18/${pin.lat}/${pin.lng}`;

/* ---------- the contacts ---------- */

/** '' or a plausible number: as typed (spaces kept), with a country code. Null: not a number. */
export function cleanPhone(v: unknown): string | null {
  const s = line(v);
  if (!s) return "";
  const e164 = normalizePhone(s);
  if (!e164 || s.length > LOC_MAX.phone) return null;
  // «00372…» reads as «+372…»; a number typed without its country code is kept as E.164, so the link works abroad too
  if (s.startsWith("00")) return `+${s.slice(2)}`;
  return s.startsWith("+") ? s : e164;
}

/** A WhatsApp or Viber number: E.164, from a number or a wa.me link. Null: neither. */
export function cleanChatNumber(v: unknown): string | null {
  const s = line(v);
  if (!s) return "";
  const wa = /^(?:https?:\/\/)?(?:api\.)?(?:wa\.me|whatsapp\.com\/send\/?\?phone=)\/?\+?(\d{7,15})\/?$/i.exec(s);
  return normalizePhone(wa ? `+${wa[1]}` : s);
}

const HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i;

/** An http(s) address with a real host name and no login in it; null: not one. */
function webAddress(s: string): URL | null {
  if (/\s/.test(s)) return null;
  try {
    const u = new URL(s);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password || !HOST.test(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

/** The site: '' or an http(s) address or a bare domain («www.rempire.ee»), kept as typed. Null: neither. */
export function cleanWebsite(v: unknown): string | null {
  const s = line(v);
  if (!s) return "";
  if (s.length > LOC_MAX.website) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:\/\//i.test(s)) return null;
  return webAddress(/^https?:\/\//i.test(s) ? s : `https://${s}`) ? s : null;
}

export type SocialKind = "instagram" | "facebook" | "telegram";

/** Where each network's own addresses start: typed without https://, they are still links, not names. */
const NETWORK: Record<SocialKind, RegExp> = {
  instagram: /^(www\.)?(instagram\.com|instagr\.am)\//i,
  facebook: /^(www\.|m\.)?(facebook\.com|fb\.com|fb\.me)\//i,
  telegram: /^(www\.)?(t\.me|telegram\.me)\//i,
};

/**
 * A social profile or Telegram: '' , a full address (kept with https://),
 * or a name, kept as «@name» (letters, digits, «.», «_», «-»). Null: neither.
 */
export function cleanSocial(kind: SocialKind, v: unknown): string | null {
  const s = line(v);
  if (!s) return "";
  if (s.length > LOC_MAX.social) return null;
  if (/^https?:\/\//i.test(s)) return webAddress(s) ? s : null;
  if (NETWORK[kind].test(s)) return webAddress(`https://${s}`) ? `https://${s}` : null;
  const name = s.replace(/^@/, "");
  return /^[A-Za-z0-9._-]{1,64}$/.test(name) && /[A-Za-z0-9]/.test(name) ? `@${name}` : null;
}

/* ---------- the pages' values, whole ---------- */

/** «Бренд»: the name (1–120) and the words in three languages. */
export function cleanBrand(input: unknown): Checked<BrandInput> {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const name = line(o.name);
  if (!name || name.length > LOC_MAX.name) return { ok: false, field: "name" };
  const about = text3(o.about, true);
  for (const k of LANGS) if (about[k].length > LOC_MAX.about) return { ok: false, field: "about" };
  return { ok: true, value: { name, about } };
}

/** «Контакты»: every field, or the first one that is wrong. */
export function cleanContacts(input: unknown): Checked<CleanContacts> {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const address = line(o.address);
  if (address.length > LOC_MAX.address) return { ok: false, field: "address" };
  const pin = parsePin(o.pin);
  if (!pin.ok) return { ok: false, field: "pin" };
  const schedule = text3(o.schedule, false);
  for (const k of LANGS) if (schedule[k].length > LOC_MAX.schedule) return { ok: false, field: "schedule" };
  const phone = cleanPhone(o.phone);
  if (phone === null) return { ok: false, field: "phone" };
  const website = cleanWebsite(o.website);
  if (website === null) return { ok: false, field: "website" };
  const facebook = cleanSocial("facebook", o.facebook);
  if (facebook === null) return { ok: false, field: "facebook" };
  const instagram = cleanSocial("instagram", o.instagram);
  if (instagram === null) return { ok: false, field: "instagram" };
  const whatsapp = cleanChatNumber(o.whatsapp);
  if (whatsapp === null) return { ok: false, field: "whatsapp" };
  const telegram = cleanSocial("telegram", o.telegram);
  if (telegram === null) return { ok: false, field: "telegram" };
  const viber = cleanChatNumber(o.viber);
  if (viber === null) return { ok: false, field: "viber" };
  return { ok: true, value: { address, pin: pin.pin, schedule, phone, website, facebook, instagram, whatsapp, telegram, viber } };
}

/** {ru, et, en} as stored: only the languages that have words ('{}' is «not set», as 028 has it). */
export function storedText3(t: Text3): Partial<Text3> {
  const out: Partial<Text3> = {};
  for (const k of LANGS) if (t[k]) out[k] = t[k];
  return out;
}

/** A stored {ru, et, en} as a form's three fields. */
export function formText3(v: unknown): Text3 {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { ru: typeof o.ru === "string" ? o.ru : "", et: typeof o.et === "string" ? o.et : "", en: typeof o.en === "string" ? o.en : "" };
}
