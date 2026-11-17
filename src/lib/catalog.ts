/**
 * What screen 1 shows: barbers, services, and each barber's own price and
 * time for each service. Plain data, safe to send to the browser.
 */
import type { Querier } from "./db";

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
  photoUrl: string | null;
  rating: number | null;
  reviewCount: number;
  /** serviceId → [price in cents, minutes]; a missing id = not offered */
  offers: Record<string, [number, number]>;
};

export type Catalog = {
  business: { name: string; timezone: string };
  location: { name: string; address: string; phone: string };
  services: CatalogService[];
  staff: CatalogStaff[];
};

export async function loadCatalog(q: Querier, businessId: string): Promise<Catalog> {
  const [biz, locs, services, staff, offers] = await Promise.all([
    q<{ name: string; timezone: string }>("select name, timezone from businesses where id = $1", [businessId]),
    q<{ name: string; address: string; phone: string }>(
      "select name, address, phone from locations where business_id = $1 and active order by sort, name limit 1",
      [businessId],
    ),
    q<{ id: string; slug: string; name: L10n; duration_min: number; sort: number }>(
      `select id, slug, name, duration_min, sort from services
        where business_id = $1 and active and online order by sort, slug`,
      [businessId],
    ),
    q<{ id: string; slug: string; display_name: string; role: L10n; photo_url: string | null; rating: string | null; review_count: number }>(
      `select id, slug, display_name, role, photo_url, rating::text as rating, review_count from staff
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
  ]);
  return {
    business: biz[0] ?? { name: "REMPIRE", timezone: "Europe/Tallinn" },
    location: locs[0] ?? { name: "", address: "", phone: "" },
    services: services.map((s) => ({ id: s.id, slug: s.slug, name: s.name, durationMin: s.duration_min, sort: s.sort })),
    staff: staff.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.display_name,
      role: s.role,
      photoUrl: s.photo_url,
      rating: s.rating == null ? null : Number(s.rating),
      reviewCount: s.review_count,
      offers: Object.fromEntries(
        offers.filter((o) => o.staff_id === s.id).map((o) => [o.service_id, [o.price_cents, o.duration_min] as [number, number]]),
      ),
    })),
  };
}
