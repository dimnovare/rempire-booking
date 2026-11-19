/**
 * Services in the admin. A service has a default time and price; each
 * barber may have his own (src/lib/admin/staff.ts saveStaffOffers).
 * Services are switched off, never deleted: past visits point at them.
 */
import type { Business } from "../availability";
import type { L10n } from "../catalog";
import { withTx, type Querier } from "../db";
import { slugify } from "./staff";
import { isUuid } from "./visits";

export type ServiceRow = {
  id: string;
  slug: string;
  name: L10n;
  description: L10n;
  durationMin: number;
  priceCents: number;
  priceMaxCents: number | null;
  bufferMin: number;
  online: boolean;
  active: boolean;
  sort: number;
  barbers: number;
};

export async function listServices(q: Querier, businessId: string): Promise<ServiceRow[]> {
  const rows = await q<{
    id: string;
    slug: string;
    name: L10n;
    description: L10n;
    duration_min: number;
    price_cents: number;
    price_max_cents: number | null;
    buffer_after_min: number;
    online: boolean;
    active: boolean;
    sort: number;
    barbers: number;
  }>(
    `select sv.*, (select count(*)::int from staff_services ss join staff s on s.id = ss.staff_id
                    where ss.service_id = sv.id and ss.active and s.active) as barbers
       from services sv where sv.business_id = $1 order by sv.active desc, sv.sort, sv.slug`,
    [businessId],
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    durationMin: r.duration_min,
    priceCents: r.price_cents,
    priceMaxCents: r.price_max_cents,
    bufferMin: r.buffer_after_min,
    online: r.online,
    active: r.active,
    sort: r.sort,
    barbers: r.barbers,
  }));
}

/** A service as the sidebar's «Список услуг» shows it: the range over the barbers who do it, and each barber's own. */
export type ServiceListRow = {
  id: string;
  name: L10n;
  /** the lowest and the highest price and time among its barbers; the service's own when nobody does it */
  priceFromCents: number;
  priceToCents: number;
  minFrom: number;
  minTo: number;
  online: boolean;
  barbers: { id: string; name: string; priceCents: number; priceMaxCents: number | null; durationMin: number }[];
};

/**
 * The working services with each working barber's own price and time (a
 * barber's empty field is the service's default). Read-only: the same rows
 * «Услуги» and the barbers' pages change.
 */
export async function serviceList(q: Querier, businessId: string): Promise<ServiceListRow[]> {
  const [services, offers] = await Promise.all([
    q<{ id: string; name: L10n; duration_min: number; price_cents: number; price_max_cents: number | null; online: boolean }>(
      "select id, name, duration_min, price_cents, price_max_cents, online from services where business_id = $1 and active order by sort, slug",
      [businessId],
    ),
    q<{ service_id: string; staff_id: string; staff_name: string; price_cents: number; price_max_cents: number | null; duration_min: number }>(
      `select ss.service_id, s.id as staff_id, s.display_name as staff_name,
              coalesce(ss.price_cents, sv.price_cents) as price_cents,
              case when ss.price_cents is null then sv.price_max_cents else ss.price_max_cents end as price_max_cents,
              coalesce(ss.duration_min, sv.duration_min) as duration_min
         from staff_services ss join services sv on sv.id = ss.service_id join staff s on s.id = ss.staff_id
        where sv.business_id = $1 and sv.active and ss.active and s.active
        order by s.sort, s.display_name`,
      [businessId],
    ),
  ]);
  return services.map((sv) => {
    const barbers = offers
      .filter((o) => o.service_id === sv.id)
      .map((o) => ({ id: o.staff_id, name: o.staff_name, priceCents: o.price_cents, priceMaxCents: o.price_max_cents != null && o.price_max_cents > o.price_cents ? o.price_max_cents : null, durationMin: o.duration_min }));
    const prices = barbers.length ? barbers.flatMap((b) => [b.priceCents, b.priceMaxCents ?? b.priceCents]) : [sv.price_cents, sv.price_max_cents ?? sv.price_cents];
    const mins = barbers.length ? barbers.map((b) => b.durationMin) : [sv.duration_min];
    return { id: sv.id, name: sv.name, priceFromCents: Math.min(...prices), priceToCents: Math.max(...prices), minFrom: Math.min(...mins), minTo: Math.max(...mins), online: sv.online, barbers };
  });
}

export type ServiceInput = {
  name: L10n;
  durationMin: number;
  priceCents: number;
  priceMaxCents?: number | null;
  bufferMin?: number;
  online: boolean;
  active: boolean;
  sort?: number | null;
  /** a new service: every active barber does it at the default price */
  allBarbers?: boolean;
};

const int = (v: unknown, lo: number, hi: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : null);

export async function saveService(business: Business, id: string | null, input: ServiceInput, actor: string): Promise<{ ok: true; id: string } | { ok: false; field: string }> {
  const name: L10n = {};
  for (const k of ["ru", "et", "en"] as const) {
    const s = String(input.name?.[k] ?? "").trim().slice(0, 120);
    if (s) name[k] = s;
  }
  if (!name.ru && !name.et && !name.en) return { ok: false, field: "name" };
  const duration = int(input.durationMin, 5, 720);
  if (duration === null) return { ok: false, field: "durationMin" };
  const price = int(input.priceCents, 0, 1_000_000);
  if (price === null) return { ok: false, field: "priceCents" };
  const priceMax = input.priceMaxCents == null ? null : int(input.priceMaxCents, price, 1_000_000);
  if (input.priceMaxCents != null && priceMax === null) return { ok: false, field: "priceMaxCents" };
  const buffer = int(input.bufferMin ?? 0, 0, 120);
  if (buffer === null) return { ok: false, field: "bufferMin" };
  const sort = input.sort == null ? null : int(input.sort, 0, 999);

  return withTx(async (tx) => {
    if (id) {
      if (!isUuid(id)) return { ok: false as const, field: "id" };
      const [row] = await tx<{ id: string }>(
        `update services set name = $3::jsonb, duration_min = $4, price_cents = $5, price_max_cents = $6, buffer_after_min = $7,
                online = $8, active = $9, sort = coalesce($10, sort)
          where id = $1 and business_id = $2 returning id`,
        [id, business.id, JSON.stringify(name), duration, price, priceMax === price ? null : priceMax, buffer, !!input.online, !!input.active, sort],
      );
      if (!row) return { ok: false as const, field: "id" };
      await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'service', $2, 'edit', $3::jsonb)`, [actor, id, JSON.stringify({ name, duration, price })]);
      return { ok: true as const, id };
    }
    const base = slugify(name.en || name.et || name.ru || "service");
    const taken = new Set((await tx<{ slug: string }>("select slug from services where business_id = $1 and slug like $2 || '%'", [business.id, base])).map((r) => r.slug));
    let slug = base;
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
    const [max] = await tx<{ n: number }>("select coalesce(max(sort), -1)::int + 1 as n from services where business_id = $1", [business.id]);
    const [row] = await tx<{ id: string }>(
      `insert into services (business_id, slug, name, duration_min, price_cents, price_max_cents, buffer_after_min, online, active, sort)
       values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [business.id, slug, JSON.stringify(name), duration, price, priceMax === price ? null : priceMax, buffer, !!input.online, !!input.active, sort ?? max.n],
    );
    if (input.allBarbers) {
      await tx(
        `insert into staff_services (staff_id, service_id) select id, $2 from staff where business_id = $1 and active
         on conflict do nothing`,
        [business.id, row.id],
      );
    }
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'service', $2, 'create', $3::jsonb)`, [actor, row.id, JSON.stringify({ name, slug })]);
    return { ok: true as const, id: row.id };
  });
}
