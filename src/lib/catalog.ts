/**
 * What screen 1 shows: barbers, services, and each barber's own price and
 * time for each service; and the salon's own page («REMPIRE ▾»): its
 * contacts, words, photos, pin and how many reviews it has. Plain data,
 * safe to send to the browser.
 *
 * Read fresh on every request (the pages await connection() first), so a
 * review hidden in the admin is gone from the counts on the next load.
 */
import type { Querier } from "./db";
import { phonesOf, type PhoneEntry } from "./admin/location-form";
import { salonRating, staffRatings } from "./reviews";
import { readSettings } from "./settings";

export type L10n = { ru?: string; et?: string; en?: string };

export type CatalogService = {
  id: string;
  slug: string;
  name: L10n;
  durationMin: number;
  sort: number;
};

export type CatalogStaff = {
  id: string;
  slug: string;
  name: string;
  role: L10n;
  /** his own words about himself: the «i» button opens them; {} = no button */
  bio: L10n;
  photoUrl: string | null;
  /** the average of his reviews on show (src/lib/reviews.ts); null: none, and no stars */
  rating: number | null;
  reviewCount: number;
  /** serviceId → [price in cents, minutes]; a missing id = not offered */
  offers: Record<string, [number, number]>;
};

/** The salon's page (db/migrations/028_location_profile.sql). '' or {} is «not set»: that row is left out. */
export type CatalogLocation = {
  name: string;
  /** the salon's own logo (db/migrations/031_location_images.sql); '' keeps REMPIRE's mark */
  logo: string;
  address: string;
  /** ISO code and postcode, under the address in «Как нас найти» (migration 034) */
  country: string;
  postcode: string;
  /** the main number: letters, SMS and «Позвонить» show it; the first of `phones` */
  phone: string;
  /** every number with its label, the main one first: «Контакты» lists them all */
  phones: PhoneEntry[];
  /** the opening hours as the salon writes them */
  schedule: L10n;
  website: string;
  /** the salon's own words */
  about: L10n;
  /** the gallery, in order: image addresses on this site or https */
  photos: string[];
  /** the map's pin; null: no map */
  pin: { lat: number; lng: number } | null;
  instagram: string;
  facebook: string;
  whatsapp: string;
  telegram: string;
  viber: string;
  /** the reviews about the salon itself on show (no barber) */
  reviewCount: number;
  /** their average, two decimals; null with none */
  rating: number | null;
};

export type Catalog = {
  business: { name: string; timezone: string };
  /**
   * «Любой специалист» (businesses.settings.any_staff_on, «Настройки →
   * Онлайн-запись»): the first step offers «Любой свободный барбер». Off:
   * only the barbers, and /api/slots and the booking refuse «anyone».
   */
  anyStaff: boolean;
  location: CatalogLocation;
  services: CatalogService[];
  staff: CatalogStaff[];
};

type LocationRow = {
  name: string;
  logo: string;
  address: string;
  country: string;
  postcode: string;
  phone: string;
  phones: unknown;
  schedule: L10n | null;
  website: string;
  about: L10n | null;
  photos: unknown;
  lat: number | string | null;
  lng: number | string | null;
  instagram: string;
  facebook: string;
  whatsapp: string;
  telegram: string;
  viber: string;
};

const NO_LOCATION: LocationRow = {
  name: "",
  logo: "",
  address: "",
  country: "",
  postcode: "",
  phone: "",
  phones: [],
  schedule: {},
  website: "",
  about: {},
  photos: [],
  lat: null,
  lng: null,
  instagram: "",
  facebook: "",
  whatsapp: "",
  telegram: "",
  viber: "",
};

/** Only the languages' own strings: a stray key or a number never reaches the page. */
function l10n(v: unknown): L10n {
  const out: L10n = {};
  if (!v || typeof v !== "object") return out;
  for (const k of ["ru", "et", "en"] as const) {
    const s = (v as Record<string, unknown>)[k];
    if (typeof s === "string" && s.trim()) out[k] = s.trim();
  }
  return out;
}

/** A photo the page may load: one of this site's own files, or an https address. */
export const photoOk = (u: unknown): u is string => typeof u === "string" && (/^\/(?!\/)\S+$/.test(u) || /^https:\/\/\S+$/.test(u));

function locationOf(r: LocationRow, reviews: { count: number; rating: number | null }): CatalogLocation {
  const lat = r.lat == null ? null : Number(r.lat);
  const lng = r.lng == null ? null : Number(r.lng);
  return {
    name: r.name,
    logo: photoOk(r.logo) ? r.logo : "",
    address: r.address,
    country: /^[A-Z]{2}$/.test(r.country) ? r.country : "",
    postcode: r.postcode.trim(),
    phone: r.phone,
    // a number with no digits is no link to call
    phones: phonesOf(r.phones, r.phone)
      .filter((p) => /\d/.test(p.number))
      .map((p) => ({ number: p.number.trim(), label: p.label.trim() })),
    schedule: l10n(r.schedule),
    website: r.website.trim(),
    about: l10n(r.about),
    photos: Array.isArray(r.photos) ? r.photos.filter(photoOk) : [],
    pin: lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
    instagram: r.instagram.trim(),
    facebook: r.facebook.trim(),
    whatsapp: r.whatsapp.trim(),
    telegram: r.telegram.trim(),
    viber: r.viber.trim(),
    reviewCount: reviews.count,
    rating: reviews.rating,
  };
}

export async function loadCatalog(q: Querier, businessId: string): Promise<Catalog> {
  const [biz, locs, services, staff, offers, ratings, salonReviews] = await Promise.all([
    q<{ name: string; timezone: string; settings: unknown }>("select name, timezone, settings from businesses where id = $1", [businessId]),
    q<LocationRow>(
      `select name, logo, address, country, postcode, phone, phones, schedule, website, about, photos, lat, lng, instagram, facebook, whatsapp, telegram, viber
         from locations where business_id = $1 and active order by sort, name limit 1`,
      [businessId],
    ),
    q<{ id: string; slug: string; name: L10n; duration_min: number; sort: number }>(
      `select id, slug, name, duration_min, sort from services
        where business_id = $1 and active and online order by sort, slug`,
      [businessId],
    ),
    q<{ id: string; slug: string; display_name: string; role: L10n; bio: L10n | null; photo_url: string | null }>(
      `select id, slug, display_name, role, bio, photo_url from staff
        where business_id = $1 and active and bookable order by sort, display_name`,
      [businessId],
    ),
    q<{ staff_id: string; service_id: string; price_cents: number; duration_min: number }>(
      `select ss.staff_id, ss.service_id,
              coalesce(ss.price_cents, sv.price_cents) as price_cents,
              coalesce(ss.duration_min, sv.duration_min) as duration_min
         from staff_services ss join services sv on sv.id = ss.service_id
        where sv.business_id = $1 and ss.active and sv.active and sv.online`,
      [businessId],
    ),
    staffRatings(q, businessId),
    salonRating(q, businessId),
  ]);
  return {
    business: biz[0] ? { name: biz[0].name, timezone: biz[0].timezone } : { name: "REMPIRE", timezone: "Europe/Tallinn" },
    anyStaff: readSettings(biz[0]?.settings).any_staff_on,
    location: locationOf(locs[0] ?? NO_LOCATION, salonReviews),
    services: services.map((s) => ({ id: s.id, slug: s.slug, name: s.name, durationMin: s.duration_min, sort: s.sort })),
    staff: staff.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.display_name,
      role: s.role,
      bio: s.bio ?? {},
      photoUrl: s.photo_url,
      rating: ratings.get(s.id)?.rating ?? null,
      reviewCount: ratings.get(s.id)?.count ?? 0,
      offers: Object.fromEntries(
        offers.filter((o) => o.staff_id === s.id).map((o) => [o.service_id, [o.price_cents, o.duration_min] as [number, number]]),
      ),
    })),
  };
}
