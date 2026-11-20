/**
 * Services in the admin: «Услуги», as the table of the admin we follow (Dim,
 * decisions round 11; src/app/admin/(app)/services/). A service has a base
 * price and time, a category (migration 036), and each barber's own price
 * and time. In the admin those are changed here, in the service's window,
 * and nowhere else: the barber page shows them read-only. A barber changes
 * his own in his app (src/lib/barber/requests.ts), on the same rows.
 * Services are switched off, never deleted: past visits point at them.
 *
 * Rights (src/lib/auth/rights.ts), asked when a login is handed in: a new
 * service is «Создание услуг» (with «Редактирование услуг»); a change is
 * «Редактирование услуг», and its name, its price and «online» each have a
 * right of their own under it; switching a service off is our «Удаление
 * услуг»; a barber's row in the window (whether he does it, his price, his
 * time) is «Изменять услуги сотрудников и их длительность». A category
 * rides on «Редактирование услуг»: the list's own «Категория услуги» stays
 * locked in the rights' catalogue until Dim says otherwise.
 */
import { can, type Holder } from "../auth/rights";
import type { Business } from "../availability";
import type { L10n } from "../catalog";
import { withTx, type Querier } from "../db";
import { effective, followBase, MAX_LENGTH, MIN_LENGTH, sameEff, sameStored, toStore, type Base, type Stored } from "./service-board";
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
  /** its group in «Услуги» (migration 036); null: «Без категории» */
  categoryId: string | null;
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
    category_id: string | null;
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
    categoryId: r.category_id ?? null,
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
 * «Услуги» changes.
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

/* ---------- «Услуги», the table and a service's window ---------- */

export type BoardCategory = { id: string; name: L10n };
/** A barber who works here: a row in every service's window. */
export type BoardBarber = { id: string; name: string; role: L10n; photoUrl: string | null };
/** His row for one service, as stored: null is «the base». `offered`: he does it. */
export type BoardOffer = Stored & { staffId: string; offered: boolean };
export type BoardService = ServiceRow & { offers: BoardOffer[] };
export type ServicesBoard = { categories: BoardCategory[]; services: BoardService[]; barbers: BoardBarber[] };

/** Everything «Услуги» shows: the categories in their order, every service with each working barber's row, and the barbers. */
export async function servicesBoard(q: Querier, businessId: string): Promise<ServicesBoard> {
  const [categories, services, barbers, offers] = await Promise.all([
    q<{ id: string; name: L10n }>("select id, name from service_categories where business_id = $1 order by sort, created_at, id", [businessId]),
    listServices(q, businessId),
    q<{ id: string; display_name: string; role: L10n; photo_url: string | null }>(
      "select id, display_name, role, photo_url from staff where business_id = $1 and active order by sort, display_name",
      [businessId],
    ),
    q<{ staff_id: string; service_id: string; price_cents: number | null; price_max_cents: number | null; duration_min: number | null; active: boolean }>(
      `select ss.staff_id, ss.service_id, ss.price_cents, ss.price_max_cents, ss.duration_min, ss.active
         from staff_services ss join staff s on s.id = ss.staff_id
        where s.business_id = $1 and s.active`,
      [businessId],
    ),
  ]);
  const order = new Map(barbers.map((b, i) => [b.id, i]));
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name ?? {} })),
    services: services.map((s) => ({
      ...s,
      offers: offers
        .filter((o) => o.service_id === s.id)
        .sort((a, b) => (order.get(a.staff_id) ?? 0) - (order.get(b.staff_id) ?? 0))
        .map((o) => ({ staffId: o.staff_id, offered: o.active, priceCents: o.price_cents, priceMaxCents: o.price_max_cents, durationMin: o.duration_min })),
    })),
    barbers: barbers.map((b) => ({ id: b.id, name: b.display_name, role: b.role ?? {}, photoUrl: b.photo_url })),
  };
}

/** A barber's row in a service's window: whether he does it, and his price and time as the window shows them. */
export type BarberInput = { staffId: string; offered: boolean; priceCents: number; durationMin: number };

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
  /** its category: one of the business's by its id, a new one by its name, or none. Left out, it stays as it is (a new service: none) */
  category?: { id: string } | { name: L10n } | null;
  /** the barbers' rows of the window. Left out, nobody's row changes, save that a row with the old base's number follows the base */
  barbers?: BarberInput[];
};

export type SaveResult = { ok: true; id: string } | { ok: false; field: string };

const int = (v: unknown, lo: number, hi: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : null);
/** The longest name of a category. */
export const CATEGORY_MAX = 60;

const cleanName = (v: unknown, max: number): L10n => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: L10n = {};
  for (const k of ["ru", "et", "en"] as const) {
    const s = String(o[k] ?? "").trim().replace(/\s+/g, " ").slice(0, max);
    if (s) out[k] = s;
  }
  return out;
};
const named = (n: L10n) => !!(n.ru || n.et || n.en);

type Row = Stored & { staff_id: string; active: boolean };

export async function saveService(business: Business, id: string | null, input: ServiceInput, actor: string, who?: Holder): Promise<SaveResult> {
  // a new service needs both rights, as in the list we follow; a change, the second
  if (who && !(id ? can(who, "services.edit") : can(who, "services.create") && can(who, "services.edit"))) return { ok: false, field: "forbidden" };
  const name = cleanName(input.name, 120);
  if (!named(name)) return { ok: false, field: "name" };
  const duration = int(input.durationMin, MIN_LENGTH, MAX_LENGTH);
  if (duration === null) return { ok: false, field: "durationMin" };
  const price = int(input.priceCents, 0, 1_000_000);
  if (price === null) return { ok: false, field: "priceCents" };
  const priceMax = input.priceMaxCents == null ? null : int(input.priceMaxCents, price, 1_000_000);
  if (input.priceMaxCents != null && priceMax === null) return { ok: false, field: "priceMaxCents" };
  const buffer = int(input.bufferMin ?? 0, 0, 120);
  if (buffer === null) return { ok: false, field: "bufferMin" };
  const sort = input.sort == null ? null : int(input.sort, 0, 999);
  const top = priceMax === price ? null : priceMax;

  const cat = input.category;
  const newCategory = cat && "name" in cat ? cleanName(cat.name, CATEGORY_MAX) : null;
  if (cat && "id" in cat && !isUuid(cat.id)) return { ok: false, field: "category" };
  if (newCategory && !named(newCategory)) return { ok: false, field: "category" };

  const barbers = input.barbers ?? null;
  if (barbers) {
    if (!Array.isArray(barbers) || barbers.length > 200) return { ok: false, field: "barbers" };
    const seen = new Set<string>();
    for (const b of barbers) {
      if (!isUuid(b?.staffId) || seen.has(b.staffId)) return { ok: false, field: "barbers" };
      seen.add(b.staffId);
      if (int(b.priceCents, 0, 1_000_000) === null) return { ok: false, field: `price:${b.staffId}` };
      if (int(b.durationMin, MIN_LENGTH, MAX_LENGTH) === null) return { ok: false, field: `duration:${b.staffId}` };
    }
  }
  const base: Base = { priceCents: price, priceMaxCents: top, durationMin: duration };

  return withTx(async (tx) => {
    // ---- everything that can refuse comes before the first write
    if (id && !isUuid(id)) return { ok: false as const, field: "id" };
    const [cur] = id
      ? await tx<{ name: L10n; duration_min: number; price_cents: number; price_max_cents: number | null; online: boolean; active: boolean }>(
          "select name, duration_min, price_cents, price_max_cents, online, active from services where id = $1 and business_id = $2 for update",
          [id, business.id],
        )
      : [];
    if (id && !cur) return { ok: false as const, field: "id" };
    if (cur && who) {
      const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      const names = (n: L10n) => [n.ru ?? "", n.et ?? "", n.en ?? ""];
      if (!same(names(cur.name ?? {}), names(name)) && !can(who, "services.edit.name")) return { ok: false as const, field: "forbidden" };
      if ((cur.price_cents !== price || !same(cur.price_max_cents, top)) && !can(who, "services.edit.price")) return { ok: false as const, field: "forbidden" };
      if (cur.online !== !!input.online && !can(who, "services.edit.online")) return { ok: false as const, field: "forbidden" };
      // a service is never deleted: switching it off is the list's «Удаление услуг»
      if (cur.active && !input.active && !can(who, "services.delete")) return { ok: false as const, field: "forbidden" };
    }
    if (cat && "id" in cat) {
      const [c] = await tx<{ id: string }>("select id from service_categories where id = $1 and business_id = $2", [cat.id, business.id]);
      if (!c) return { ok: false as const, field: "category" };
    }

    // the barbers' rows: as stored, the old base's followers moved with the base, then the window's own
    const old: Base | null = cur ? { priceCents: cur.price_cents, priceMaxCents: cur.price_max_cents, durationMin: cur.duration_min } : null;
    const rows = id
      ? await tx<Row>("select staff_id, price_cents as \"priceCents\", price_max_cents as \"priceMaxCents\", duration_min as \"durationMin\", active from staff_services where service_id = $1 for update", [id])
      : [];
    const byStaff = new Map(rows.map((r) => [r.staff_id, r]));
    const next = new Map<string, Stored & { active: boolean }>();
    for (const r of rows) next.set(r.staff_id, { ...(old ? followBase(old, base, r) : r), active: r.active });
    let staffChanged = false;
    if (barbers) {
      const working = new Set((await tx<{ id: string }>("select id from staff where business_id = $1 and active", [business.id])).map((r) => r.id));
      for (const b of barbers) {
        if (!working.has(b.staffId)) return { ok: false as const, field: "barbers" };
        const was = next.get(b.staffId) ?? null;
        const offered = b.offered === true;
        // switched off: his numbers stay for the day he does it again
        if (!offered) {
          if (was?.active) {
            staffChanged = true;
            next.set(b.staffId, { ...was, active: false });
          }
          continue;
        }
        const stored = toStore(base, was, { priceCents: b.priceCents, durationMin: b.durationMin });
        // a change of his is one the client would see: whether he does it, or what he costs and how long he takes
        if (was?.active && sameEff(effective(base, was), effective(base, stored))) continue;
        // a new service's barbers at its base are part of making it, as «every barber» always was
        if (id || stored.priceCents != null || stored.durationMin != null) staffChanged = true;
        next.set(b.staffId, { ...stored, active: true });
      }
    }
    if (staffChanged && who && !can(who, "services.staff")) return { ok: false as const, field: "forbidden" };

    // ---- the writes
    let categoryId: string | null | undefined = cat === undefined ? undefined : cat === null ? null : "id" in cat ? cat.id : null;
    if (newCategory) {
      const [max] = await tx<{ n: number }>("select coalesce(max(sort), -1)::int + 1 as n from service_categories where business_id = $1", [business.id]);
      const [c] = await tx<{ id: string }>("insert into service_categories (business_id, name, sort) values ($1, $2::jsonb, $3) returning id", [business.id, JSON.stringify(newCategory), max.n]);
      categoryId = c.id;
      await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'service_category', $2, 'create', $3::jsonb)`, [actor, c.id, JSON.stringify({ name: newCategory })]);
    }

    let serviceId: string;
    if (id) {
      const [row] = await tx<{ id: string }>(
        `update services set name = $3::jsonb, duration_min = $4, price_cents = $5, price_max_cents = $6, buffer_after_min = $7,
                online = $8, active = $9, sort = coalesce($10, sort),
                category_id = case when $11::boolean then $12::uuid else category_id end
          where id = $1 and business_id = $2 returning id`,
        [id, business.id, JSON.stringify(name), duration, price, top, buffer, !!input.online, !!input.active, sort, categoryId !== undefined, categoryId ?? null],
      );
      if (!row) return { ok: false as const, field: "id" };
      serviceId = id;
      await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'service', $2, 'edit', $3::jsonb)`, [
        actor,
        id,
        JSON.stringify({ name, duration, price, ...(categoryId !== undefined ? { category: categoryId } : {}) }),
      ]);
    } else {
      const slugBase = slugify(name.en || name.et || name.ru || "service");
      const taken = new Set((await tx<{ slug: string }>("select slug from services where business_id = $1 and slug like $2 || '%'", [business.id, slugBase])).map((r) => r.slug));
      let slug = slugBase;
      for (let i = 2; taken.has(slug); i++) slug = `${slugBase}-${i}`;
      const [max] = await tx<{ n: number }>("select coalesce(max(sort), -1)::int + 1 as n from services where business_id = $1", [business.id]);
      const [row] = await tx<{ id: string }>(
        `insert into services (business_id, slug, name, duration_min, price_cents, price_max_cents, buffer_after_min, online, active, sort, category_id)
         values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
        [business.id, slug, JSON.stringify(name), duration, price, top, buffer, !!input.online, !!input.active, sort ?? max.n, categoryId ?? null],
      );
      serviceId = row.id;
      if (input.allBarbers && !barbers) {
        await tx(
          `insert into staff_services (staff_id, service_id) select id, $2 from staff where business_id = $1 and active
           on conflict do nothing`,
          [business.id, row.id],
        );
      }
      await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'service', $2, 'create', $3::jsonb)`, [actor, row.id, JSON.stringify({ name, slug })]);
    }

    // each barber's row that is not as it was: written, with one line in his log
    for (const [staffId, n] of next) {
      const was = byStaff.get(staffId);
      if (was && was.active === n.active && sameStored(was, n)) continue;
      await tx(
        `insert into staff_services (staff_id, service_id, price_cents, price_max_cents, duration_min, active) values ($1, $2, $3, $4, $5, $6)
         on conflict (staff_id, service_id) do update set price_cents = excluded.price_cents, price_max_cents = excluded.price_max_cents,
                duration_min = excluded.duration_min, active = excluded.active`,
        [staffId, serviceId, n.priceCents, n.priceMaxCents, n.durationMin, n.active],
      );
      await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'staff', $2, 'offers', $3::jsonb)`, [
        actor,
        staffId,
        JSON.stringify([{ serviceId, offered: n.active, priceCents: n.priceCents, durationMin: n.durationMin }]),
      ]);
    }
    return { ok: true as const, id: serviceId };
  });
}

/** «Онлайн-запись» in the table: the switch writes at once. */
export async function setServiceOnline(business: Business, id: string, online: boolean, actor: string, who?: Holder): Promise<{ ok: true } | { ok: false; field: string }> {
  if (who && !(can(who, "services.edit") && can(who, "services.edit.online"))) return { ok: false, field: "forbidden" };
  if (!isUuid(id)) return { ok: false, field: "id" };
  return withTx(async (tx) => {
    const [row] = await tx<{ id: string }>("update services set online = $3 where id = $1 and business_id = $2 returning id", [id, business.id, !!online]);
    if (!row) return { ok: false as const, field: "id" };
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'service', $2, 'edit', $3::jsonb)`, [actor, id, JSON.stringify({ online: !!online })]);
    return { ok: true as const };
  });
}

/**
 * «Цена» in the table, typed in place: the base price. A barber who had the
 * old base's price follows it; one with his own keeps his. A top («до»)
 * that is not above the new price goes.
 */
export async function setServicePrice(business: Business, id: string, priceCents: number, actor: string, who?: Holder): Promise<{ ok: true } | { ok: false; field: string }> {
  if (who && !(can(who, "services.edit") && can(who, "services.edit.price"))) return { ok: false, field: "forbidden" };
  if (!isUuid(id)) return { ok: false, field: "id" };
  const price = int(priceCents, 0, 1_000_000);
  if (price === null) return { ok: false, field: "priceCents" };
  return withTx(async (tx) => {
    const [cur] = await tx<{ duration_min: number; price_cents: number; price_max_cents: number | null }>(
      "select duration_min, price_cents, price_max_cents from services where id = $1 and business_id = $2 for update",
      [id, business.id],
    );
    if (!cur) return { ok: false as const, field: "id" };
    const old: Base = { priceCents: cur.price_cents, priceMaxCents: cur.price_max_cents, durationMin: cur.duration_min };
    const next: Base = { priceCents: price, priceMaxCents: cur.price_max_cents != null && cur.price_max_cents > price ? cur.price_max_cents : null, durationMin: cur.duration_min };
    if (old.priceCents === next.priceCents && old.priceMaxCents === next.priceMaxCents) return { ok: true as const };
    await tx("update services set price_cents = $2, price_max_cents = $3 where id = $1", [id, next.priceCents, next.priceMaxCents]);
    const rows = await tx<Row>("select staff_id, price_cents as \"priceCents\", price_max_cents as \"priceMaxCents\", duration_min as \"durationMin\", active from staff_services where service_id = $1 for update", [id]);
    for (const r of rows) {
      const n = followBase(old, next, r);
      if (sameStored(r, n)) continue;
      await tx("update staff_services set price_cents = $3, price_max_cents = $4, duration_min = $5 where staff_id = $1 and service_id = $2", [r.staff_id, id, n.priceCents, n.priceMaxCents, n.durationMin]);
    }
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'service', $2, 'price', $3::jsonb)`, [actor, id, JSON.stringify({ price: next.priceCents, priceMax: next.priceMaxCents })]);
    return { ok: true as const };
  });
}

/** A category's pencil: its name in one language; the other two stay. */
export async function renameCategory(business: Business, id: string, lang: "ru" | "et" | "en", text: string, actor: string, who?: Holder): Promise<{ ok: true } | { ok: false; field: string }> {
  if (who && !can(who, "services.edit")) return { ok: false, field: "forbidden" };
  if (!isUuid(id)) return { ok: false, field: "id" };
  if (!["ru", "et", "en"].includes(lang)) return { ok: false, field: "lang" };
  const name = String(text ?? "").trim().replace(/\s+/g, " ").slice(0, CATEGORY_MAX);
  if (!name) return { ok: false, field: "name" };
  return withTx(async (tx) => {
    const [row] = await tx<{ id: string; name: L10n }>(
      "update service_categories set name = name || jsonb_build_object($3::text, $4::text) where id = $1 and business_id = $2 returning id, name",
      [id, business.id, lang, name],
    );
    if (!row) return { ok: false as const, field: "id" };
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'service_category', $2, 'edit', $3::jsonb)`, [actor, id, JSON.stringify({ name: row.name })]);
    return { ok: true as const };
  });
}
