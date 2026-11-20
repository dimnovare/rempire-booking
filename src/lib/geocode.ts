/**
 * «Найти» in «Настройки → Контакты» (Dim, 20.11.2026, decision page round
 * 11): the address the owner typed, found on OpenStreetMap, so the map's pin
 * lands on it and the country and the postcode come with it, as the tool we
 * follow finds an address on its map.
 *
 * OpenStreetMap's own geocoder, Nominatim: no key and no account. Its usage
 * policy (operations.osmfoundation.org/policies/nominatim) is kept here:
 *   - asked from the server only, and only when the owner taps «Найти»
 *     (never while typing): src/app/admin/(app)/settings/actions.ts;
 *   - one request a second for the whole app: every server instance takes
 *     its turn from one database row first (geocoder_gate, migration 034);
 *     a tap in the same second waits for the next one, once;
 *   - a User-Agent that names the application and nothing about anyone;
 *   - each answer kept a day in this instance, so the same address is not
 *     asked twice;
 *   - one result, in the salon's country first (countrycodes).
 *
 * GEOCODER=fake (the e2e server, e2e/server.mjs) answers from here and
 * never calls out: «Mardi 1» is REMPIRE's pin, «nowhere» finds nothing,
 * anything else a point in Tallinn made from its words.
 */
import type { Querier } from "./db";

export type GeoHit = {
  lat: number;
  lng: number;
  /** '' when the place has none */
  postcode: string;
  /** ISO code, upper case; '' when not told */
  country: string;
  /** the place as the map names it, for «Найдено: …» */
  label: string;
};
export type GeoResult = { ok: true; hit: GeoHit } | { ok: false; why: "empty" | "none" | "busy" | "failed" };

export const NOMINATIM = "https://nominatim.openstreetmap.org/search";
/** The application, as Nominatim asks to be told; no person, no address, no e-mail. */
export const GEO_USER_AGENT = "rempire-booking/1.0";
/** The longest address sent: «Адрес» holds 200. */
const MAX_Q = 200;
const TIMEOUT_MS = 8000;
const CACHE_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 100;

/** The question, as Nominatim's search takes it: one place, its address parts, in this language, in this country first. */
export function nominatimUrl(address: string, country: string, lang: string): string {
  const u = new URL(NOMINATIM);
  u.searchParams.set("q", address.slice(0, MAX_Q));
  u.searchParams.set("format", "jsonv2");
  u.searchParams.set("limit", "1");
  u.searchParams.set("addressdetails", "1");
  if (/^[A-Za-z]{2}$/.test(country)) u.searchParams.set("countrycodes", country.toLowerCase());
  if (/^(ru|et|en)$/.test(lang)) u.searchParams.set("accept-language", lang);
  return u.toString();
}

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^-?\d{1,3}(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN);
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
// eslint-disable-next-line no-control-regex
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * The first place in Nominatim's answer (jsonv2, addressdetails=1), or null:
 * an empty list, or anything that is not a place with a pin in range.
 */
export function readNominatim(body: unknown): GeoHit | null {
  const first = Array.isArray(body) ? body[0] : null;
  if (!first || typeof first !== "object") return null;
  const o = first as Record<string, unknown>;
  const lat = num(o.lat);
  const lng = num(o.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const a = (o.address && typeof o.address === "object" ? o.address : {}) as Record<string, unknown>;
  // read whole, then checked: a code too long is no code, not its first letters
  const postcode = text(a.postcode, 40);
  const country = text(a.country_code, 8).toUpperCase();
  return {
    lat: round6(lat),
    lng: round6(lng),
    postcode: postcode.length <= 12 && /^[A-Za-z0-9](?:[A-Za-z0-9 -]*[A-Za-z0-9])?$/.test(postcode) ? postcode : "",
    country: /^[A-Z]{2}$/.test(country) ? country : "",
    label: text(o.display_name, 200),
  };
}

/**
 * Take this second's turn at Nominatim: true when this instance may ask now.
 * One row for the whole app; the update waits for any other instance's on
 * the same row, then sees its moment, so two never go in the same second.
 */
export async function takeGeocoderTurn(q: Querier): Promise<boolean> {
  const rows = await q("update geocoder_gate set last_at = clock_timestamp() where last_at <= clock_timestamp() - interval '1 second' returning id");
  return rows.length > 0;
}

/** The e2e server's geocoder: never a call out. */
function fakeHit(address: string): GeoHit | null {
  if (/nowhere|нигде|ei kuskil/i.test(address)) return null;
  if (/mardi\s*1\b/i.test(address)) return { lat: 59.430883, lng: 24.761967, postcode: "10145", country: "EE", label: "Mardi 1, Kesklinn, Tallinn, 10145, Eesti" };
  let h = 0;
  for (const ch of address.toLowerCase()) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return { lat: round6(59.43 + ((h % 1000) - 500) / 100000), lng: round6(24.75 + (((h >>> 10) % 1000) - 500) / 50000), postcode: "10111", country: "EE", label: `${address}, Tallinn, Eesti` };
}

const cache = new Map<string, { at: number; hit: GeoHit | null }>();
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

export type GeocodeDeps = {
  /** the request, for the tests; fetch by default */
  fetcher?: typeof fetch;
  now?: () => number;
  /** how long a tap in the same second waits for the next one */
  retryMs?: number;
  fake?: boolean;
};

/** The address found: the first place, in `country` first. Asks Nominatim at most once a second for the whole app. */
export async function geocode(q: Querier, address: string, country: string, lang: string, deps: GeocodeDeps = {}): Promise<GeoResult> {
  const wanted = text(address, MAX_Q);
  if (!wanted) return { ok: false, why: "empty" };
  const now = deps.now ?? Date.now;
  const key = `${country.toUpperCase()}|${lang}|${wanted.toLowerCase()}`;
  const known = cache.get(key);
  if (known && now() - known.at < CACHE_MS) return known.hit ? { ok: true, hit: known.hit } : { ok: false, why: "none" };

  // the gate holds for the fake too, so the e2e runs walk the same path
  if (!(await takeGeocoderTurn(q))) {
    await wait(deps.retryMs ?? 1100);
    if (!(await takeGeocoderTurn(q))) return { ok: false, why: "busy" };
  }

  let hit: GeoHit | null;
  if (deps.fake ?? process.env.GEOCODER === "fake") hit = fakeHit(wanted);
  else {
    try {
      const res = await (deps.fetcher ?? fetch)(nominatimUrl(wanted, country, lang), {
        headers: { "User-Agent": GEO_USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) return { ok: false, why: "failed" };
      hit = readNominatim(await res.json());
    } catch {
      return { ok: false, why: "failed" };
    }
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: now(), hit });
  return hit ? { ok: true, hit } : { ok: false, why: "none" };
}

/** For the tests: forget the answers kept. */
export function forgetGeocodes(): void {
  cache.clear();
}
