/**
 * Barbers in the admin: profile, which services each does at what price and
 * time, the weekly hours with breaks, one-off days, and special time.
 * Blocked time and vacations are src/lib/admin/visits.ts addTimeOff().
 */
import type { Business } from "../availability";
import type { L10n } from "../catalog";
import { withTx, type Querier } from "../db";
import { cleanExtra } from "../slots";
import { addDays, isLocalDate, startOfDay, timeToMinutes } from "../tz";
import { isUuid } from "./visits";

export type StaffRow = {
  id: string;
  slug: string;
  name: string;
  role: L10n;
  bio: L10n;
  photoUrl: string | null;
  bookable: boolean;
  active: boolean;
  sort: number;
  services: number;
};

export async function listStaff(q: Querier, businessId: string): Promise<StaffRow[]> {
  const rows = await q<{ id: string; slug: string; display_name: string; role: L10n; bio: L10n; photo_url: string | null; bookable: boolean; active: boolean; sort: number; services: number }>(
    `select s.id, s.slug, s.display_name, s.role, s.bio, s.photo_url, s.bookable, s.active, s.sort,
            (select count(*)::int from staff_services ss where ss.staff_id = s.id and ss.active) as services
       from staff s where s.business_id = $1 order by s.active desc, s.sort, s.display_name`,
    [businessId],
  );
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.display_name, role: r.role, bio: r.bio, photoUrl: r.photo_url, bookable: r.bookable, active: r.active, sort: r.sort, services: r.services }));
}

export type Offer = { serviceId: string; name: L10n; defaultMin: number; defaultCents: number; active: boolean; offered: boolean; durationMin: number | null; priceCents: number | null };
export type HoursDay = { weekday: number; spans: [string, string][] };
export type DayOverride = { date: string; spans: [string, string][]; note: string };
export type TimeOffRow = { id: string; from: number; to: number; kind: string; note: string };
/** Special time with its extra as written: an amount (extraCents) or a percent of the visit's price (extraPct), never both. */
export type SpecialRow = { id: string; from: number; to: number; extraCents: number; extraPct: number; note: string };

export type StaffDetail = StaffRow & {
  offers: Offer[];
  hours: HoursDay[];
  overrides: DayOverride[];
  timeOff: TimeOffRow[];
  special: SpecialRow[];
};

const ms = (v: unknown) => (v instanceof Date ? v.getTime() : Date.parse(String(v)));

/** Everything the barber page shows; past days off and special time are left out. */
export async function staffDetail(q: Querier, business: Business, staffId: string, today: string): Promise<StaffDetail | null> {
  if (!isUuid(staffId)) return null;
  const all = await listStaff(q, business.id);
  const base = all.find((s) => s.id === staffId);
  if (!base) return null;
  const now = startOfDay(today, business.timezone);
  const [offers, hours, overrides, off, special] = await Promise.all([
    q<{ id: string; name: L10n; duration_min: number; price_cents: number; active: boolean; ss_active: boolean | null; ss_min: number | null; ss_cents: number | null }>(
      `select sv.id, sv.name, sv.duration_min, sv.price_cents, sv.active,
              ss.active as ss_active, ss.duration_min as ss_min, ss.price_cents as ss_cents
         from services sv left join staff_services ss on ss.service_id = sv.id and ss.staff_id = $2
        where sv.business_id = $1 order by sv.active desc, sv.sort, sv.slug`,
      [business.id, staffId],
    ),
    q<{ weekday: number; starts: string; ends: string }>(
      `select weekday, to_char(starts, 'HH24:MI') as starts, to_char(ends, 'HH24:MI') as ends from staff_hours
        where staff_id = $1 and valid_from is null and valid_to is null order by weekday, starts`,
      [staffId],
    ),
    q<{ day: string; intervals: [string, string][]; note: string }>(
      "select day::text as day, intervals, note from staff_day_overrides where staff_id = $1 and day >= $2::date order by day",
      [staffId, today],
    ),
    q<{ id: string; starts_at: Date; ends_at: Date; kind: string; note: string }>(
      "select id, starts_at, ends_at, kind, note from time_off where staff_id = $1 and ends_at > $2 and status <> 'declined' order by starts_at",
      [staffId, new Date(now)],
    ),
    q<{ id: string; starts_at: Date; ends_at: Date; extra_cents: number; extra_pct: number; note: string }>(
      "select id, starts_at, ends_at, extra_cents, extra_pct, note from special_time where staff_id = $1 and ends_at > $2 order by starts_at",
      [staffId, new Date(now)],
    ),
  ]);
  return {
    ...base,
    offers: offers.map((o) => ({
      serviceId: o.id,
      name: o.name,
      defaultMin: o.duration_min,
      defaultCents: o.price_cents,
      active: o.active,
      offered: o.ss_active === true,
      durationMin: o.ss_min,
      priceCents: o.ss_cents,
    })),
    hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, spans: hours.filter((h) => h.weekday === weekday).map((h) => [h.starts, h.ends] as [string, string]) })),
    overrides: overrides.map((o) => ({ date: o.day, spans: o.intervals, note: o.note })),
    timeOff: off.map((t) => ({ id: t.id, from: ms(t.starts_at), to: ms(t.ends_at), kind: t.kind, note: t.note })),
    special: special.map((x) => ({ id: x.id, from: ms(x.starts_at), to: ms(x.ends_at), extraCents: x.extra_cents, extraPct: x.extra_pct, note: x.note })),
  };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Spans of one day: valid "HH:MM", each end after its start, no overlaps; sorted. */
export function cleanSpans(spans: unknown): [string, string][] | null {
  if (!Array.isArray(spans) || spans.length > 6) return null;
  const out: [string, string][] = [];
  for (const s of spans) {
    if (!Array.isArray(s) || s.length !== 2) return null;
    const [a, b] = s.map(String);
    // 24:00 is allowed as an end only
    if (!TIME_RE.test(a) || !(TIME_RE.test(b) || b === "24:00")) return null;
    if ((b === "24:00" ? 1440 : timeToMinutes(b)) <= timeToMinutes(a)) return null;
    out.push([a, b]);
  }
  out.sort((x, y) => x[0].localeCompare(y[0]));
  for (let i = 1; i < out.length; i++) if (out[i][0] < out[i - 1][1]) return null;
  return out;
}

const t = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);
const l10n = (v: unknown, max: number): L10n => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: L10n = {};
  for (const k of ["ru", "et", "en"] as const) {
    const s = t(o[k], max);
    if (s) out[k] = s;
  }
  return out;
};

const TRANSLIT: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ы: "y", э: "e", ю: "yu", я: "ya", õ: "o", ä: "a", ö: "o", ü: "u", š: "s", ž: "z" };

/** "Jevgeni Hair" → "jevgeni-hair"; Cyrillic is transliterated. */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .split("")
      .map((c) => TRANSLIT[c] ?? c)
      .join("")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "x"
  );
}

export type StaffProfileInput = { name: string; role?: L10n; bio?: L10n; photoUrl?: string | null; bookable: boolean; active: boolean; sort?: number | null };

/** Add (id null) or change a barber. A new barber gets the template week of nothing: Renat sets the hours next. */
export async function saveStaffProfile(business: Business, id: string | null, input: StaffProfileInput, actor: string): Promise<{ ok: true; id: string } | { ok: false; field: string }> {
  const name = t(input.name, 60).replace(/\s+/g, " ");
  if (!name) return { ok: false, field: "name" };
  const photo = t(input.photoUrl, 500);
  if (photo && !/^(\/|https:\/\/)[^\s"'<>]+$/.test(photo)) return { ok: false, field: "photoUrl" };
  const role = l10n(input.role, 40);
  const bio = l10n(input.bio, 600);
  const sort = Number.isInteger(input.sort) ? Math.max(0, Math.min(999, input.sort as number)) : null;
  return withTx(async (tx) => {
    if (id) {
      if (!isUuid(id)) return { ok: false as const, field: "id" };
      const [row] = await tx<{ id: string }>(
        `update staff set display_name = $3, role = $4::jsonb, bio = $5::jsonb, photo_url = $6, bookable = $7, active = $8,
                sort = coalesce($9, sort)
          where id = $1 and business_id = $2 returning id`,
        [id, business.id, name, JSON.stringify(role), JSON.stringify(bio), photo || null, !!input.bookable, !!input.active, sort],
      );
      if (!row) return { ok: false as const, field: "id" };
      await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'staff', $2, 'edit', $3::jsonb)`, [actor, id, JSON.stringify({ name, bookable: !!input.bookable, active: !!input.active })]);
      return { ok: true as const, id };
    }
    const [loc] = await tx<{ id: string }>("select id from locations where business_id = $1 and active order by sort, name limit 1", [business.id]);
    if (!loc) return { ok: false as const, field: "location" };
    const base = slugify(name);
    const taken = new Set((await tx<{ slug: string }>("select slug from staff where business_id = $1 and slug like $2 || '%'", [business.id, base])).map((r) => r.slug));
    let slug = base;
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
    const [max] = await tx<{ n: number }>("select coalesce(max(sort), -1)::int + 1 as n from staff where business_id = $1", [business.id]);
    const [row] = await tx<{ id: string }>(
      `insert into staff (business_id, location_id, slug, display_name, role, bio, photo_url, bookable, active, sort)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10) returning id`,
      [business.id, loc.id, slug, name, JSON.stringify(Object.keys(role).length ? role : { ru: "Барбер", et: "Barber", en: "Barber" }), JSON.stringify(bio), photo || null, !!input.bookable, !!input.active, sort ?? max.n],
    );
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'staff', $2, 'create', $3::jsonb)`, [actor, row.id, JSON.stringify({ name, slug })]);
    return { ok: true as const, id: row.id };
  });
}

export type OfferInput = { serviceId: string; offered: boolean; priceCents: number | null; durationMin: number | null };

/** Which services the barber does, at his own price and time (null = the service's default). */
export async function saveStaffOffers(business: Business, staffId: string, offers: OfferInput[], actor: string): Promise<{ ok: true } | { ok: false; field: string }> {
  if (!isUuid(staffId)) return { ok: false, field: "staff" };
  for (const o of offers) {
    if (!isUuid(o.serviceId)) return { ok: false, field: "service" };
    if (o.priceCents !== null && !(Number.isInteger(o.priceCents) && o.priceCents >= 0 && o.priceCents <= 1_000_000)) return { ok: false, field: `price:${o.serviceId}` };
    if (o.durationMin !== null && !(Number.isInteger(o.durationMin) && o.durationMin >= 5 && o.durationMin <= 720)) return { ok: false, field: `duration:${o.serviceId}` };
  }
  return withTx(async (tx) => {
    const [st] = await tx<{ id: string }>("select id from staff where id = $1 and business_id = $2 for update", [staffId, business.id]);
    if (!st) return { ok: false as const, field: "staff" };
    const known = new Set((await tx<{ id: string }>("select id from services where business_id = $1", [business.id])).map((r) => r.id));
    for (const o of offers) {
      if (!known.has(o.serviceId)) continue;
      await tx(
        `insert into staff_services (staff_id, service_id, price_cents, duration_min, active) values ($1, $2, $3, $4, $5)
         on conflict (staff_id, service_id) do update set price_cents = excluded.price_cents, duration_min = excluded.duration_min, active = excluded.active`,
        [staffId, o.serviceId, o.priceCents, o.durationMin, !!o.offered],
      );
    }
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'staff', $2, 'offers', $3::jsonb)`, [actor, staffId, JSON.stringify(offers)]);
    return { ok: true as const };
  });
}

/** Replace the weekly template. days[weekday] = spans; a missing or empty day is a day off. */
export async function saveWeeklyHours(business: Business, staffId: string, days: Record<number, unknown>, actor: string): Promise<{ ok: true } | { ok: false; field: string }> {
  if (!isUuid(staffId)) return { ok: false, field: "staff" };
  const clean: [number, [string, string][]][] = [];
  for (let wd = 1; wd <= 7; wd++) {
    const spans = cleanSpans(days[wd] ?? []);
    if (!spans) return { ok: false, field: `day:${wd}` };
    // staff_hours.ends is a time: 24:00 is stored as 23:59 would lose a minute, so cap at 23:59
    clean.push([wd, spans.map(([a, b]) => [a, b === "24:00" ? "23:59" : b])]);
  }
  return withTx(async (tx) => {
    const [st] = await tx<{ id: string }>("select id from staff where id = $1 and business_id = $2 for update", [staffId, business.id]);
    if (!st) return { ok: false as const, field: "staff" };
    await tx("delete from staff_hours where staff_id = $1 and valid_from is null and valid_to is null", [staffId]);
    for (const [wd, spans] of clean) {
      for (const [a, b] of spans) await tx("insert into staff_hours (staff_id, weekday, starts, ends) values ($1, $2, $3, $4)", [staffId, wd, a, b]);
    }
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'staff', $2, 'hours', $3::jsonb)`, [actor, staffId, JSON.stringify(Object.fromEntries(clean))]);
    return { ok: true as const };
  });
}

/** One day unlike the template: other hours, or a day off ([]). spans null removes the override. */
export async function setDayOverride(business: Business, staffId: string, date: string, spans: unknown, note: string, actor: string): Promise<{ ok: true } | { ok: false; field: string }> {
  if (!isUuid(staffId)) return { ok: false, field: "staff" };
  if (!isLocalDate(date)) return { ok: false, field: "date" };
  const clean = spans === null ? null : cleanSpans(spans);
  if (spans !== null && !clean) return { ok: false, field: "spans" };
  return withTx(async (tx) => {
    const [st] = await tx<{ id: string }>("select id from staff where id = $1 and business_id = $2 for update", [staffId, business.id]);
    if (!st) return { ok: false as const, field: "staff" };
    if (clean === null) await tx("delete from staff_day_overrides where staff_id = $1 and day = $2::date", [staffId, date]);
    else
      await tx(
        `insert into staff_day_overrides (staff_id, day, intervals, note) values ($1, $2::date, $3::jsonb, $4)
         on conflict (staff_id, day) do update set intervals = excluded.intervals, note = excluded.note`,
        [staffId, date, JSON.stringify(clean.map(([a, b]) => [a, b === "24:00" ? "23:59" : b])), t(note, 200)],
      );
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'staff', $2, 'day', $3::jsonb)`, [actor, staffId, JSON.stringify({ date, spans: clean })]);
    return { ok: true as const };
  });
}

/**
 * Special time added by Renat for a barber (the barber adds his own in his
 * app, src/lib/barber/requests.ts). Its extra is an amount (extraCents) or a
 * percent of the visit's price (extraPct, 1–300): exactly one of the two.
 */
export async function addSpecialTime(
  business: Business,
  input: { staffId: string; from: number; to: number; extraCents?: number; extraPct?: number; note?: string | null },
  actor: string,
): Promise<{ ok: true; id: string } | { ok: false; field: string }> {
  if (!isUuid(input.staffId)) return { ok: false, field: "staff" };
  if (!Number.isFinite(input.from) || !Number.isFinite(input.to) || input.to <= input.from || input.to - input.from > 24 * 3_600_000) return { ok: false, field: "to" };
  const extra = cleanExtra(input.extraCents, input.extraPct);
  if (!extra) return { ok: false, field: "extra" };
  return withTx(async (tx) => {
    const [st] = await tx<{ id: string }>("select id from staff where id = $1 and business_id = $2 for update", [input.staffId, business.id]);
    if (!st) return { ok: false as const, field: "staff" };
    const [row] = await tx<{ id: string }>(
      `insert into special_time (business_id, staff_id, starts_at, ends_at, extra_cents, extra_pct, note, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, 'admin') returning id`,
      [business.id, input.staffId, new Date(input.from), new Date(input.to), extra.extraCents, extra.extraPct, t(input.note, 200)],
    );
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'special_time', $2, 'create', $3::jsonb)`, [actor, row.id, JSON.stringify({ ...input, ...extra })]);
    return { ok: true as const, id: row.id };
  });
}

/** Removing special time leaves visits already booked in it as they are. */
export async function removeSpecialTime(business: Business, id: string, actor: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await withTx(async (tx) => {
    const r = await tx<{ id: string }>("delete from special_time where id = $1 and business_id = $2 returning id", [id, business.id]);
    if (r.length) await tx(`insert into audit (actor, entity, entity_id, action) values ($1, 'special_time', $2, 'delete')`, [actor, id]);
    return r;
  });
  return rows.length > 0;
}

/** The dates of the next `n` days from `today`, for pickers. */
export const nextDates = (today: string, n: number) => Array.from({ length: n }, (_, i) => addDays(today, i));

/* ---------- the portrait ---------- */

export const PHOTO_MAX_BYTES = 600_000;

/** image/jpeg, image/png or image/webp by the first bytes; null for anything else. */
export function imageMime(b: Uint8Array): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/**
 * Keep a barber's uploaded portrait and point staff.photo_url at it. The
 * browser has already shrunk it; here only the kind (by its first bytes, not
 * by what the upload calls itself) and the size are checked. The link carries
 * a version, so a new photo is never served from an old cache.
 */
export async function saveStaffPhoto(business: Business, staffId: string, bytes: Uint8Array, actor: string): Promise<{ ok: true; url: string } | { ok: false; field: string }> {
  if (!isUuid(staffId)) return { ok: false, field: "staff" };
  const mime = imageMime(bytes);
  if (!mime || bytes.length > PHOTO_MAX_BYTES) return { ok: false, field: "photo" };
  return withTx(async (tx) => {
    const [st] = await tx<{ id: string }>("select id from staff where id = $1 and business_id = $2 for update", [staffId, business.id]);
    if (!st) return { ok: false as const, field: "staff" };
    await tx(
      `insert into staff_photo (staff_id, mime, bytes) values ($1, $2, $3)
       on conflict (staff_id) do update set mime = excluded.mime, bytes = excluded.bytes, updated_at = now()`,
      [staffId, mime, Buffer.from(bytes)],
    );
    const url = `/api/staff-photo/${staffId}?v=${Date.now().toString(36)}`;
    await tx("update staff set photo_url = $2 where id = $1", [staffId, url]);
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'staff', $2, 'photo', $3::jsonb)`, [actor, staffId, JSON.stringify({ mime, bytes: bytes.length })]);
    return { ok: true as const, url };
  });
}

/** The uploaded portrait, for /api/staff-photo/<id>. Public: clients see it when they book. */
export async function staffPhoto(q: Querier, staffId: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
  if (!isUuid(staffId)) return null;
  const [row] = await q<{ mime: string; bytes: Uint8Array }>("select mime, bytes from staff_photo where staff_id = $1", [staffId]);
  return row ? { mime: row.mime, bytes: new Uint8Array(row.bytes) } : null;
}
