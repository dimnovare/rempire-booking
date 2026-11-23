#!/usr/bin/env node
/**
 * Demo data for staging and tests: REMPIRE, Mardi 1, the five barbers'
 * public first names (as on rempire.ee) and the salon's structure as it
 * stands in Altegio (tools/altegio-structure.json, read 19.11.2026): the
 * eight services, each barber's own time and price for them, the weekly
 * hours and the dated shifts. tools/demo-structure.mjs works that out as
 * DEMO; here it goes into the database. No clients, no visits.
 *
 *   node tools/seed-demo.mjs               # against DATABASE_URL
 *   node tools/seed-demo.mjs --if-enabled  # only when SEED_DEMO=yes (postbuild)
 *
 * With SEED_BUSY=yes (staging only, never tests) it also fills the calendar
 * with generated visits of fake clients: seedDemoBusy below.
 *
 * Safe to run again: it only adds what is missing and never overwrites a
 * row Renat has since edited in the admin. One exception: when the structure
 * itself is a new one (DEMO.version is not the one the database has), the
 * demo services, the barbers' lines, weekly hours and dated shifts are
 * written over once, and the version is kept in businesses.settings.
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { addDays, DAY_MS, DEMO, DEMO_REVIEWS, demoWorkday, T, toMin, toTime, weekdayOf } from "./demo-structure.mjs";
import { sslFor } from "./migrate.mjs";

export { addDays, datedDays, DEMO, DEMO_REVIEWS, demoHours, demoWorkday, weekdayOf, weeklyTemplate } from "./demo-structure.mjs";

const ROLE = T("Барбер", "Barber", "Barber");

/**
 * Fixed ids, derived from the slugs. Each serverless instance of the
 * in-memory demo database (DB_DRIVER=auto, no DATABASE_URL) seeds itself,
 * and the page and the API must agree on what a barber or service id is.
 */
export function demoId(kind, slug) {
  const h = createHash("sha256").update(`rempire-demo:${kind}:${slug}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const zoneFormat = new Map();
/** A zone's clock at a moment: its date parts, as numbers. */
function zoneParts(t, tz) {
  let f = zoneFormat.get(tz);
  if (!f) zoneFormat.set(tz, (f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })));
  const p = {};
  for (const x of f.formatToParts(new Date(t))) p[x.type] = Number(x.value);
  return p;
}

/** Today's local date and the minute of the day in a zone. */
function localNow(now, tz) {
  const p = zoneParts(now, tz);
  const two = (n) => String(n).padStart(2, "0");
  return { today: `${p.year}-${two(p.month)}-${two(p.day)}`, minute: p.hour * 60 + p.minute };
}

/** A local date and minute of the day as a moment (epoch ms). */
function momentOf(date, minute, tz) {
  const [y, m, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, minute);
  const offset = (t) => {
    const p = zoneParts(t, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - t;
  };
  return wall - offset(wall - offset(wall));
}

/** @param {{query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}>}} db */
export async function seedDemo(db) {
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const b = DEMO.business;
  const biz = await one(
    `insert into businesses (id, slug, name, timezone, default_locale) values ($5, $1, $2, $3, $4)
     on conflict (slug) do update set slug = excluded.slug returning id, settings ->> 'demo_structure' as structure`,
    [b.slug, b.name, b.timezone, b.default_locale, demoId("business", b.slug)],
  );
  // a new structure (an empty database too): the demo rows are written as the file has them
  const renew = biz.structure !== DEMO.version;
  const loc = await one(
    `insert into locations (id, business_id, slug, name, address, timezone) values ($6, $1, $2, $3, $4, $5)
     on conflict (business_id, slug) do update set slug = excluded.slug returning id, (xmax = 0) as inserted`,
    [biz.id, DEMO.location.slug, DEMO.location.name, DEMO.location.address, b.timezone, demoId("location", DEMO.location.slug)],
  );
  // the salon's page, for a new location only: one there already has its own
  // (migration 028 filled REMPIRE's; anything edited since stays)
  if (loc.inserted) {
    const p = DEMO.location.profile;
    await db.query(
      "update locations set phone = $2, website = $3, schedule = $4::jsonb, about = $5::jsonb, photos = $6::jsonb, lat = $7, lng = $8 where id = $1",
      [loc.id, p.phone, p.website, JSON.stringify(p.schedule), JSON.stringify(p.about), JSON.stringify(p.photos), p.lat, p.lng],
    );
  }
  const svc = {};
  for (const [i, s] of DEMO.services.entries()) {
    const row = await one(
      `insert into services (id, business_id, slug, name, duration_min, price_cents, price_max_cents, sort) values ($8, $1, $2, $3::jsonb, $4, $5, $6, $7)
       on conflict (business_id, slug) do update set ${
         renew
           ? "name = excluded.name, duration_min = excluded.duration_min, price_cents = excluded.price_cents, price_max_cents = excluded.price_max_cents, sort = excluded.sort, online = true, active = true"
           : "slug = excluded.slug"
       } returning id`,
      [biz.id, s.slug, JSON.stringify(s.name), s.d, s.cents, s.maxCents, i, demoId("service", s.slug)],
    );
    svc[s.slug] = row.id;
  }
  // «Услуги» stands in categories (migration 036): the demo's services in one, as REMPIRE's are; one there already stays
  await db.query(
    `insert into service_categories (id, business_id, name, sort) select $2, $1, $3::jsonb, 0
      where not exists (select 1 from service_categories where business_id = $1)`,
    [biz.id, demoId("category", "barbering"), JSON.stringify({ ru: "Барберинг", et: "Barbering", en: "Barbering" })],
  );
  await db.query(
    `update services set category_id = (select id from service_categories where business_id = $1 order by sort, created_at limit 1)
      where business_id = $1 and category_id is null`,
    [biz.id],
  );
  for (const [i, st] of DEMO.staff.entries()) {
    const photo = `/barbers/${st.slug}.webp`;
    const inserted = await one(
      `insert into staff (id, business_id, location_id, slug, display_name, role, sort, photo_url) values ($7, $1, $2, $3, $4, $5::jsonb, $6, $8)
       on conflict (business_id, slug) do nothing returning id`,
      [biz.id, loc.id, st.slug, st.name, JSON.stringify(ROLE), i, demoId("staff", st.slug), photo],
    );
    const staffId = inserted?.id ?? (await one("select id from staff where business_id = $1 and slug = $2", [biz.id, st.slug])).id;
    // a barber seeded before the photos existed gets one; a photo set since is kept
    if (!inserted) await db.query("update staff set photo_url = $2 where id = $1 and photo_url is null", [staffId, photo]);
    // his lines, hours and dated shifts as the file has them, for a new barber
    // or a new structure; otherwise only a line that is missing is added
    const whole = renew || !!inserted;
    for (const [slug, l] of Object.entries(st.lines)) {
      await db.query(
        `insert into staff_services (staff_id, service_id, duration_min, price_cents, price_max_cents) values ($1, $2, $3, $4, $5)
         on conflict (staff_id, service_id) do ${
           whole ? "update set duration_min = excluded.duration_min, price_cents = excluded.price_cents, price_max_cents = excluded.price_max_cents, active = true" : "nothing"
         }`,
        [staffId, svc[slug], l.d, l.cents, l.maxCents],
      );
    }
    if (!whole) continue;
    // a demo service he does not do: switched off, as the admin does, never deleted
    await db.query("update staff_services set active = false where staff_id = $1 and active and service_id = any($2::uuid[])", [
      staffId,
      DEMO.services.filter((s) => !st.lines[s.slug]).map((s) => svc[s.slug]),
    ]);
    await db.query("delete from staff_hours where staff_id = $1 and valid_from is null and valid_to is null", [staffId]);
    for (const h of st.hours) {
      await db.query("insert into staff_hours (staff_id, weekday, starts, ends) values ($1, $2, $3, $4)", [staffId, h.weekday, h.starts, h.ends]);
    }
    await db.query(
      `insert into staff_day_overrides (staff_id, day, intervals)
       select $1::uuid, x.day::date, x.spans from jsonb_to_recordset($2::jsonb) as x(day text, spans jsonb)
       on conflict (staff_id, day) do update set intervals = excluded.intervals`,
      [staffId, JSON.stringify(st.days)],
    );
  }
  if (renew) await db.query("update businesses set settings = settings || jsonb_build_object('demo_structure', $2::text) where id = $1", [biz.id, DEMO.version]);
  await seedDemoMoney(db, biz.id);
  return { businessId: biz.id, locationId: loc.id, services: svc };
}

/**
 * Phase C demo money (docs/phase-c.md): a made-up issuing company, a
 * made-up FIE or OÜ for four barbers and their chair rent. Every name,
 * registry code, VAT number and IBAN here is fake (codes starting 0000 are
 * never issued); the invoices go to Resend's test inbox. The real details
 * come from Isolta. Only added where missing; nothing Renat edited is
 * touched.
 */
export const DEMO_MONEY = {
  issuer: {
    legal_name: "Näidis Salong OÜ",
    reg_code: "00000001",
    vat_number: "EE000000001",
    address: "Mardi 1, 10145 Tallinn",
    email: "arved@example.test",
    iban: "EE000000000000000000",
    bank_name: "Demo Pank",
    prefix: "DEMO-",
    digits: 4,
    yearly: true,
  },
  receivers: [
    { staff: "valentin", kind: "fie", name: "Näidis FIE (Valentin)", reg: "00000002", vat: "", rent: 40000 },
    { staff: "jevgeni", kind: "ou", name: "Näidis Juuksur OÜ (Jevgeni)", reg: "00000003", vat: "EE000000003", rent: 40000 },
    { staff: "slava", kind: "fie", name: "Näidis FIE (Slava)", reg: "00000004", vat: "", rent: 38000 },
    { staff: "milena", kind: "fie", name: "Näidis FIE (Milena)", reg: "00000005", vat: "", rent: 35000 },
  ],
  rentFrom: "2026-01-01",
  // Resend's test address: «delivered», and nothing reaches anyone
  email: "delivered@resend.dev",
};

/** @param {{query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}>}} db */
export async function seedDemoMoney(db, businessId) {
  const I = DEMO_MONEY.issuer;
  const issuerId = demoId("issuer", "demo");
  await db.query(
    `insert into invoice_issuers (id, business_id, legal_name, reg_code, vat_number, address, email, iban, bank_name, prefix, digits, yearly, is_default)
     select $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, not exists (select 1 from invoice_issuers where business_id = $2 and is_default)
     on conflict (id) do nothing`,
    [issuerId, businessId, I.legal_name, I.reg_code, I.vat_number, I.address, I.email, I.iban, I.bank_name, I.prefix, I.digits, I.yearly],
  );
  for (const r of DEMO_MONEY.receivers) {
    const staffId = demoId("staff", r.staff);
    const [st] = (await db.query("select 1 from staff where id = $1", [staffId])).rows;
    if (!st) continue;
    await db.query(
      `insert into invoice_receivers (id, business_id, staff_id, kind, legal_name, reg_code, vat_number, address, email, locale)
       select $1, $2, $3, $4, $5, $6, $7, 'Tallinn', $8, 'et'
        where not exists (select 1 from invoice_receivers where staff_id = $3 and active)
       on conflict (id) do nothing`,
      [demoId("receiver", r.staff), businessId, staffId, r.kind, r.name, r.reg, r.vat, DEMO_MONEY.email],
    );
    await db.query(
      `insert into chair_rents (business_id, staff_id, amount_cents, valid_from) select $1, $2, $3, $4::date
        where not exists (select 1 from chair_rents where staff_id = $2)`,
      [businessId, staffId, r.rent, DEMO_MONEY.rentFrom],
    );
  }
}

/** Demo products for the demo sales: the fake shop's (src/lib/shop.ts FAKE_PRODUCTS). */
const DEMO_SALE_ITEMS = [
  { id: "demo-matte-paste", variant: "100ml", name: "Demo Grooming Matte Paste 100 ml", price: 2490, purchase: 1150, barcode: "2000000000015" },
  { id: "demo-beard-oil", variant: "30ml", name: "Demo Beard Co Beard Oil Cedar 30 ml", price: 2190, purchase: 900, barcode: "2000000000039" },
  { id: "demo-sea-salt", variant: "200ml", name: "Demo Grooming Sea Salt Spray 200 ml", price: 1990, purchase: 840, barcode: "2000000000022" },
];

/**
 * A few demo sales last month and this month, so staging's statements,
 * drafts and overview are not empty. Marked as already in the (fake) shop:
 * they never go anywhere, whatever SHOP_API_URL is later.
 * 17 % of the price without VAT (24 %), as settings.ts starts.
 */
export async function seedDemoSales(db, now = Date.now()) {
  const [biz] = (await db.query("select id from businesses where slug = $1", [DEMO.business.slug])).rows;
  if (!biz) return 0;
  const tz = DEMO.business.timezone;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m] = today.split("-").map(Number);
  const months = [
    [m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1],
    [y, m],
  ];
  const plan = [
    { staff: "valentin", day: 3, item: 0, qty: 2, mode: "client" },
    { staff: "valentin", day: 9, item: 1, qty: 1, mode: "client" },
    { staff: "valentin", day: 12, item: 2, qty: 1, mode: "self" },
    { staff: "slava", day: 5, item: 1, qty: 1, mode: "client" },
    { staff: "slava", day: 6, item: 0, qty: 1, mode: "client" },
  ];
  let added = 0;
  for (const [yy, mm] of months) {
    const tag = `${yy}${String(mm).padStart(2, "0")}`;
    for (const [n, p] of plan.entries()) {
      const at = new Date(Date.UTC(yy, mm - 1, p.day, 12, 0));
      if (at.getTime() > now) continue;
      const it = DEMO_SALE_ITEMS[p.item];
      const unit = p.mode === "self" ? Math.round((it.purchase * 12400) / 10000) : it.price;
      const commission = p.mode === "self" ? 0 : Math.round((p.qty * unit * 10000 * 1700) / 12400 / 10000);
      const r = await db.query(
        `insert into product_sales (business_id, ref, staff_id, mode, shop_product_id, shop_variant, name, barcode, qty, unit_cents, list_cents,
                                    purchase_cents, vat_bp, commission_bp, commission_basis, commission_cents, total_cents,
                                    sync_status, sync_after, shop_order_ref, synced_at, created_at)
         select $1, $2, s.id, $4, $5, $6, $7, $8, $9, $10, $11, $12, 2400, $13, $14, $15, $16, 'synced', $17, $18, $17, $17
           from staff s where s.id = $3
         on conflict (ref) do nothing returning id`,
        [
          biz.id,
          `demo-sale-${p.staff}-${n}-${tag}`,
          demoId("staff", p.staff),
          p.mode,
          it.id,
          it.variant,
          it.name,
          it.barcode,
          p.qty,
          unit,
          it.price,
          p.mode === "self" ? it.purchase : null,
          p.mode === "self" ? 0 : 1700,
          p.mode === "self" ? null : "net-paid",
          commission,
          p.qty * unit,
          at,
          `DEMO-${tag}-${n}`,
        ],
      );
      added += r.rows.length;
    }
  }
  return added;
}

/**
 * Example special time (Renat, 17.11.2026) for the next 14 days, so staging
 * shows it: after hours, a lunch hour inside the hours, a Saturday evening
 * and a Sunday. Weekday 1 = Monday … 7 = Sunday. Tests leave it out: they
 * add their own rows for fixed dates. `extra` is euros on top; `pct` is a
 * percent of the visit's price instead (Renat, 19.11.2026: «+50 %»).
 */
export const DEMO_SPECIAL = [
  { staff: "valentin", days: [1, 2, 3, 4, 5], from: "20:00", to: "22:00", extra: 20 },
  { staff: "jevgeni", days: [2, 4], from: "13:00", to: "14:00", extra: 15 },
  { staff: "renat", days: [6], from: "18:00", to: "20:00", extra: 25 },
  { staff: "slava", days: [7], from: "12:00", to: "16:00", extra: 25 },
  { staff: "milena", days: [5], from: "19:00", to: "20:30", pct: 50 },
];

/** @param {{query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}>}} db */
export async function seedDemoSpecial(db, now = Date.now()) {
  const tz = DEMO.business.timezone;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = today.split("-").map(Number);
  const biz = (await db.query("select id from businesses where slug = $1", [DEMO.business.slug])).rows[0];
  if (!biz) return 0;
  let added = 0;
  for (let i = 0; i < 14; i++) {
    const day = new Date(Date.UTC(y, m - 1, d + i));
    const date = day.toISOString().slice(0, 10);
    const weekday = ((day.getUTCDay() + 6) % 7) + 1;
    for (const sp of DEMO_SPECIAL) {
      if (!sp.days.includes(weekday)) continue;
      const r = await db.query(
        `insert into special_time (id, business_id, staff_id, starts_at, ends_at, extra_cents, extra_pct, note, created_by)
         select $1, $2, s.id, ($4::date + $5::time) at time zone $7, ($4::date + $6::time) at time zone $7, $8, $9, 'demo', 'demo'
           from staff s where s.business_id = $2 and s.slug = $3
         on conflict (id) do nothing
         returning id`,
        [demoId("special", `${sp.staff}:${date}`), biz.id, sp.staff, date, sp.from, sp.to, tz, (sp.extra ?? 0) * 100, sp.pct ?? 0],
      );
      added += r.rows.length;
    }
  }
  return added;
}

/**
 * Renat's questions page (src/lib/owner-qa.ts). Its link, /ru/q/<token>,
 * went to Dim in chat on 17.11.2026; only the token's SHA-256 is here.
 * DEMO_QA is /ru/q/demo, for the in-memory database only (src/lib/db.ts).
 */
export const OWNER_QA = [{ label: "renat-2026-11", tokenHash: "c618cc254cafdfe4f84eca6b4869199281a8572049133320da006e2c3b7214cd" }];
export const DEMO_QA = { label: "demo", tokenHash: createHash("sha256").update("demo").digest("hex") };

/** @param {{query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}>}} db */
export async function seedOwnerQa(db, forms = OWNER_QA) {
  let added = 0;
  for (const f of forms) {
    const r = await db.query(
      "insert into qa_forms (id, token_hash, label) values ($1, $2, $3) on conflict do nothing returning id",
      [demoId("qa", f.label), f.tokenHash, f.label],
    );
    added += r.rows.length;
  }
  return added;
}

/**
 * Example visits for a LOCAL run only (DEMO_LOGINS=yes, src/lib/db.ts), so
 * the barber app has a day to show: each barber, today and his next working
 * day after it (demoWorkday), five visits and a lunch break, plus one client
 * in 20 minutes. Fake clients («Demo client N», +372 5555 09xx), never
 * staging and never tests.
 *
 * A visit is the first of `svc` the barber does, at `at` or `after` minutes
 * past the visit before. The day starts at 10:00, as every shift does at the
 * latest, and is over by 16:00: on a template day two hours and more stay
 * free after the last visit. The 15 minutes after the first visit are too
 * short for any service. e2e relies on all of this (e2e/book.spec.ts).
 */
export const DEMO_VISITS = [
  { at: "10:00", svc: ["clip"], src: "online", comment: "Покороче по бокам" },
  { after: 15, svc: ["buzz", "long"], src: "admin" },
  { after: 0, svc: ["beard", "grey"], src: "online" },
  { at: "14:00", svc: ["kid", "buzz", "cutbeard"], src: "admin", noPhone: true },
  { after: 0, svc: ["beard", "clip"], src: "online" },
];

/** A barber's own lines, in the services' order. */
async function demoLines(db, staffId) {
  const r = await db.query(
    `select sv.id, sv.slug, sv.name, coalesce(ss.duration_min, sv.duration_min) as dur, coalesce(ss.price_cents, sv.price_cents) as price, sv.buffer_after_min as buf
       from services sv join staff_services ss on ss.service_id = sv.id and ss.staff_id = $1 and ss.active
      where sv.active order by sv.sort, sv.slug`,
    [staffId],
  );
  return r.rows;
}

/** @param {{query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}>}} db */
export async function seedDemoVisits(db, now = Date.now()) {
  const tz = DEMO.business.timezone;
  const { today } = localNow(now, tz);
  const [biz] = (await db.query("select id from businesses where slug = $1", [DEMO.business.slug])).rows;
  if (!biz) return 0;
  let added = 0;
  // First one client in 20 minutes for each barber, so «Дальше» (and its
  // «Пришёл», from 30 minutes before) shows whenever the app starts; the
  // fixed visits below leave its time alone. His shortest service. Late in
  // the evening it would fall on tomorrow, a day whose demo visits the
  // tests count: then there is none (e2e run of 23.11, 23:40).
  const soon = Math.ceil((now + 20 * 60_000) / 300_000) * 300_000;
  let j = 2 * DEMO.staff.length * DEMO_VISITS.length;
  const lines = {};
  for (const st of DEMO.staff) {
    const k = ++j;
    const staffId = demoId("staff", st.slug);
    lines[st.slug] = await demoLines(db, staffId);
    const [line] = [...lines[st.slug]].sort((a, b) => a.dur - b.dur);
    if (!line) continue;
    if (localNow(soon + line.dur * 60_000 - 1, tz).today !== today) continue;
    const [client] = (
      await db.query(
        "insert into clients (business_id, name, phone_e164, source) values ($1, $2, $3, 'admin') on conflict (business_id, phone_e164) do update set updated_at = now() returning id",
        [biz.id, `Demo client ${k}`, `+37255550${800 + k}`],
      )
    ).rows;
    const from = new Date(soon);
    const to = new Date(soon + line.dur * 60_000);
    const r = await db.query(
      `insert into appointments (business_id, location_id, staff_id, client_id, starts_at, ends_at, blocked_until, source, reminder_min, total_cents)
       select $1, s.location_id, s.id, $2, $3, $4, $5, 'online', 120, $6 from staff s
        where s.id = $7 and not exists (
          select 1 from appointments a where a.staff_id = s.id and a.status <> 'cancelled' and tstzrange(a.starts_at, a.blocked_until) && tstzrange($3, $5))
       returning id`,
      [biz.id, client.id, from, to, new Date(to.getTime() + line.buf * 60_000), line.price, staffId],
    );
    if (!r.rows.length) continue;
    await db.query(
      "insert into appointment_services (appointment_id, position, service_id, name, duration_min, price_cents) values ($1, 0, $2, $3::jsonb, $4, $5)",
      [r.rows[0].id, line.id, JSON.stringify(line.name), line.dur, line.price],
    );
    added++;
  }
  let k = 0;
  for (let i = 0; i < 2; i++) {
    for (const st of DEMO.staff) {
      // today whatever the day is, then the next day he works
      const date = i === 0 ? today : demoWorkday(st.slug, addDays(today, 1));
      const staffId = demoId("staff", st.slug);
      await db.query(
        `insert into time_off (id, staff_id, starts_at, ends_at, kind, status, note)
         values ($1, $2, ($3::date + '13:00'::time) at time zone $4, ($3::date + '14:00'::time) at time zone $4, 'block', 'approved', 'обед')
         on conflict (id) do nothing`,
        [demoId("block", `${st.slug}:${date}`), staffId, date, tz],
      );
      let end = 0;
      for (const v of DEMO_VISITS) {
        k++;
        const line = v.svc.map((slug) => lines[st.slug].find((l) => l.slug === slug)).find(Boolean);
        if (!line) continue;
        const at = toTime(v.at ? toMin(v.at) : end + v.after);
        end = toMin(at) + line.dur + line.buf;
        const phone = v.noPhone ? null : `+37255550${String(900 + (k % 100)).padStart(3, "0")}`;
        const [client] = (
          await db.query(
            `insert into clients (id, business_id, name, phone_e164, source) values ($1, $2, $3, $4, 'admin')
             on conflict (id) do update set updated_at = now() returning id`,
            [demoId("client", String(k)), biz.id, `Demo client ${k}`, phone],
          )
        ).rows;
        const id = demoId("visit", `${st.slug}:${date}:${at}`);
        const r = await db.query(
          `insert into appointments (id, business_id, location_id, staff_id, client_id, starts_at, ends_at, blocked_until, source, client_comment, reminder_min, total_cents)
           select $1, $2, s.location_id, s.id, $3,
                  ($4::date + $5::time) at time zone $6,
                  ($4::date + $5::time) at time zone $6 + make_interval(mins => $7),
                  ($4::date + $5::time) at time zone $6 + make_interval(mins => $7 + $8),
                  $9, $10, $11, $12
             from staff s where s.id = $13
              and not exists (
                select 1 from appointments a where a.staff_id = s.id and a.status <> 'cancelled'
                   and tstzrange(a.starts_at, a.blocked_until) &&
                       tstzrange(($4::date + $5::time) at time zone $6, ($4::date + $5::time) at time zone $6 + make_interval(mins => $7 + $8)))
           on conflict (id) do nothing returning id`,
          [id, biz.id, client.id, date, at, tz, line.dur, line.buf, v.src, v.comment ?? "", phone ? 120 : null, line.price, staffId],
        );
        if (!r.rows.length) continue;
        await db.query(
          "insert into appointment_services (appointment_id, position, service_id, name, duration_min, price_cents) values ($1, 0, $2, $3::jsonb, $4, $5)",
          [id, line.id, JSON.stringify(line.name), line.dur, line.price],
        );
        added++;
      }
    }
  }
  return added;
}

/**
 * The made-up reviews of the salon (DEMO_REVIEWS, tools/demo-structure.mjs)
 * for a LOCAL run only (DEMO_LOGINS=yes, src/lib/db.ts), so its page
 * («REMPIRE ▾») has some to show. Never staging (its reviews are the
 * imported ones) and never tests. Safe to run again.
 * @param {{query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}>}} db
 */
export async function seedDemoReviews(db) {
  const [biz] = (await db.query("select id from businesses where slug = $1", [DEMO.business.slug])).rows;
  if (!biz) return 0;
  let added = 0;
  for (const [i, r] of DEMO_REVIEWS.entries()) {
    const res = await db.query(
      `insert into reviews (id, business_id, rating, body, author_name, created_at, hidden) values ($1, $2, $3, $4, $5, $6::date + time '12:00', $7)
       on conflict (id) do nothing returning id`,
      [demoId("review", String(i)), biz.id, r.rating, r.body, r.name, r.at, r.hidden === true],
    );
    added += res.rows.length;
  }
  return added;
}

/**
 * Logins to try the admin and the barber app on a local run: an owner and
 * one per demo barber, at example.test (a name that can never get mail), with
 * no password: they log in with the e-mail code, which the console transport
 * prints. Only the in-memory database calls this (src/lib/db.ts,
 * DEMO_LOGINS=yes); never a real one.
 * @param {{query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}>}} db
 */
export async function seedDemoLogins(db) {
  const [biz] = (await db.query("select id from businesses where slug = $1", [DEMO.business.slug])).rows;
  if (!biz) return 0;
  let added = 0;
  const add = async (email, name, role, staffId) => {
    const r = await db.query(
      "insert into users (business_id, email, name, role, staff_id) values ($1, $2, $3, $4, $5) on conflict (email) do nothing returning id",
      [biz.id, email, name, role, staffId],
    );
    added += r.rows.length;
  };
  await add("owner@example.test", "Owner (demo)", "owner", null);
  // an owner who cuts too, as Renat does: his login is linked to his barber (docs/apps.md)
  await add("boss@example.test", "Owner and barber (demo)", "owner", demoId("staff", DEMO.staff[0].slug));
  for (const st of DEMO.staff) await add(`${st.slug}@example.test`, st.name, "staff", demoId("staff", st.slug));
  return added;
}

/**
 * A busy calendar for STAGING only (Dim, 19.11.2026: «generated visits on
 * the real shifts», docs/kickoff.md): the last 14 days and the next 14 are
 * filled with visits of fake clients, inside each barber's shifts, with his
 * own services, times and prices. Behind its own switch, SEED_BUSY=yes,
 * which only the staging deploy sets (.github/workflows/ci.yml): unit tests
 * and e2e need free times and fixed data, and never get it.
 *
 *   - 60–85 % of each shift is taken, on the 15-minute grid, around what is
 *     already there: other visits (the database refuses two at once anyway),
 *     blocked time and special time.
 *   - A past visit is «Готово», about one in twenty «Не пришёл»; some past
 *     shifts also have one cancelled visit. Ahead everything is «Записан».
 *   - About two thirds were booked online, the rest by the staff.
 *   - Clients: «Demo client 101» … «Demo client 250», +372 5555 0101 …
 *     0250, the demo's own fake names and numbers. A client comes back, most
 *     often to the same barber, and not twice within four days.
 *   - Nothing is ever sent to them: no visit has an SMS reminder
 *     (reminder_min is null), no client has an e-mail, and every client is
 *     marked «no SMS, no e-mail», so a visit a tester books for one of them
 *     later plans no SMS either. The numbers are made up, but a made-up
 *     number can be somebody's.
 *
 * Nothing here is Math.random: every choice comes from a generator seeded
 * with the barber and the date, so a day comes out the same whenever it is
 * made. A barber's day is made once (its visits carry an idempotency_key
 * that starts with «demo-busy:»); a later run adds the days that have come
 * into the 28 days since, and closes the visits that are now behind.
 */
export const BUSY = {
  back: 14,
  ahead: 14,
  /** the share of a shift that is taken: from, to */
  fill: [0.6, 0.85],
  step: 15,
  clients: 150,
  firstClient: 101,
  /** of the visits, booked online */
  online: 2 / 3,
  /** of the past visits, a no-show */
  noShow: 0.05,
  /** of the past shifts, with one cancelled visit as well */
  cancelled: 0.3,
  /** days between two visits of one client, at least */
  apart: 4,
  /** of a barber's visits, his own regulars */
  regulars: 0.7,
  /** how often a service is booked, against the others */
  weights: { clip: 45, cutbeard: 18, buzz: 12, beard: 9, long: 6, kid: 6, grey: 3, fs: 3 },
  comments: ["Покороче по бокам", "Как в прошлый раз", "Могу опоздать на 5 минут", "Буду с ребёнком", "Only clippers on the sides, please"],
  key: "demo-busy:",
};

/** The busy clients, all fake: «Demo client N» and +372 5555 0NNN, as the demo's other clients. */
export function busyClient(i) {
  const n = BUSY.firstClient + i;
  return { id: demoId("client", String(n)), name: `Demo client ${n}`, phone: `+37255550${n}`, locale: i % 10 === 9 ? "en" : i % 10 >= 7 ? "et" : "ru" };
}

/** A seeded generator (mulberry32): numbers from 0 up to 1, the same for the same seed. */
function seeded(seed) {
  let a = createHash("sha256").update(`rempire-demo:busy:${seed}`).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One of `lines`, the popular services more often. */
function pickLine(lines, rand) {
  const w = lines.map((l) => BUSY.weights[l.slug] ?? 3);
  let x = rand() * w.reduce((a, b) => a + b, 0);
  for (const [i, l] of lines.entries()) if ((x -= w[i]) < 0) return l;
  return lines[lines.length - 1];
}

/** [from, to) pieces of `spans` that `busy` leaves, in minutes. */
function freePieces(spans, busy) {
  let out = spans.map(([a, b]) => [a, b]);
  for (const [x, y] of busy) out = out.flatMap(([a, b]) => (y <= a || x >= b ? [[a, b]] : [[a, Math.min(b, x)], [Math.max(a, y), b]].filter(([p, q]) => q > p)));
  return out;
}

/**
 * The visits of one shift: start minutes and lines. `spans` are the working
 * hours, `busy` what is already there ([from, to) minutes), `taken` the
 * minutes of the shift other visits hold. Tried until the share is inside
 * BUSY.fill; a shift too short for that gets the nearest.
 */
export function planShift({ spans, busy, taken, lines, seed }) {
  const { step } = BUSY;
  const up = (m) => Math.ceil(m / step) * step;
  const shift = spans.reduce((n, [a, b]) => n + b - a, 0);
  const lo = BUSY.fill[0] * shift;
  const hi = BUSY.fill[1] * shift;
  const shortest = Math.min(...lines.map((l) => l.dur));
  const mean = lines.reduce((n, l) => n + l.dur, 0) / lines.length;
  const free = freePieces(spans, busy)
    .map(([a, b]) => [up(a), Math.floor(b / step) * step])
    .filter(([a, b]) => b - a >= shortest);
  let best = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const rand = seeded(`${seed}:${attempt}`);
    const target = lo + rand() * (hi - lo);
    const visits = [];
    let filled = taken;
    for (let s = 0; s < free.length; s++) {
      let [cursor, end] = free[s];
      for (;;) {
        const need = target - filled;
        if (need < step) break;
        // the free time that may stay free, spread over the visits still to come
        const left = end - cursor + free.slice(s + 1).reduce((n, [a, b]) => n + b - a, 0);
        const slack = Math.max(0, Math.floor((left - need) / step) * step);
        const ahead = Math.max(1, Math.round(need / mean));
        cursor += Math.min(slack, step * Math.round((rand() * 2 * slack) / (ahead + 1) / step));
        const fit = lines.filter((l) => cursor + up(l.dur + l.buf) <= end && filled + l.dur <= hi);
        if (!fit.length) break;
        const line = pickLine(fit, rand);
        visits.push({ start: cursor, line });
        cursor += up(line.dur + line.buf);
        filled += line.dur;
      }
    }
    const miss = Math.max(0, lo - filled);
    if (!best || miss < best.miss) best = { visits, filled, shift, miss };
    if (!miss) break;
  }
  return best;
}

/**
 * @param {{query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}>}} db
 * @returns {Promise<{visits: number, clients: number, closed: number, shifts: number}>} what this run added
 */
export async function seedDemoBusy(db, now = Date.now()) {
  const none = { visits: 0, clients: 0, closed: 0, shifts: 0 };
  const [biz] = (await db.query("select id, timezone from businesses where slug = $1", [DEMO.business.slug])).rows;
  if (!biz) return none;
  const tz = biz.timezone;
  const { today, minute: nowMin } = localNow(now, tz);
  const first = addDays(today, -BUSY.back);
  const last = addDays(today, BUSY.ahead);
  const from = new Date(momentOf(first, 0, tz));
  const to = new Date(momentOf(addDays(last, 1), 0, tz));

  // 1. Visits made earlier that are now behind: «Готово», or «Не пришёл» as planned (the key's last letter)
  const closed = await db.query(
    `update appointments set status = case when status = 'booked' and right(idempotency_key, 1) = 'n' then 'no_show' else 'done' end, updated_at = ends_at
      where business_id = $1 and idempotency_key like $2 and status in ('booked', 'arrived') and ends_at <= $3 returning id`,
    [biz.id, `${BUSY.key}%`, new Date(now)],
  );

  // 2. The demo barbers, their lines and hours, and what is in the 29 days already
  const staff = (
    await db.query("select id, slug, location_id from staff where business_id = $1 and active and id = any($2::uuid[]) order by sort, slug", [
      biz.id,
      DEMO.staff.map((s) => demoId("staff", s.slug)),
    ])
  ).rows;
  if (!staff.length) return { ...none, closed: closed.rows.length };
  const ids = staff.map((s) => s.id);
  const hours = (
    await db.query(
      `select staff_id, weekday, to_char(starts, 'HH24:MI') as starts, to_char(ends, 'HH24:MI') as ends, valid_from::text as valid_from, valid_to::text as valid_to
         from staff_hours where staff_id = any($1::uuid[])`,
      [ids],
    )
  ).rows;
  const overrides = (await db.query("select staff_id, day::text as day, intervals from staff_day_overrides where staff_id = any($1::uuid[]) and day between $2::date and $3::date", [ids, first, last])).rows;
  const local = (col) => `to_char(${col} at time zone $2, 'YYYY-MM-DD HH24:MI')`;
  const there = (
    await db.query(
      `select 'visit' as kind, a.staff_id, ${local("a.starts_at")} as a, ${local("a.blocked_until")} as b, a.status, a.client_id, a.idempotency_key as key
         from appointments a where a.staff_id = any($1::uuid[]) and a.starts_at < $4 and a.blocked_until > $3
       union all
       select 'off', t.staff_id, ${local("t.starts_at")}, ${local("t.ends_at")}, t.status, null::uuid, null
         from time_off t where t.staff_id = any($1::uuid[]) and t.status <> 'declined' and t.starts_at < $4 and t.ends_at > $3
       union all
       select 'special', x.staff_id, ${local("x.starts_at")}, ${local("x.ends_at")}, '', null::uuid, null
         from special_time x where x.staff_id = any($1::uuid[]) and x.starts_at < $4 and x.ends_at > $3`,
      [ids, tz, from, to],
    )
  ).rows;

  const dayNo = (date) => Math.round(Date.parse(`${date}T12:00:00Z`) / DAY_MS);
  const pool = Array.from({ length: BUSY.clients }, (_, i) => busyClient(i));
  const indexOf = new Map(pool.map((c, i) => [c.id, i]));
  /** the days each client already comes on */
  const seen = pool.map(() => []);
  /** barber-days made by an earlier run */
  const made = new Set();
  for (const r of there) {
    if (r.kind !== "visit" || !r.key?.startsWith(BUSY.key)) continue;
    if (!r.key.endsWith(":c")) made.add(`${r.staff_id}:${r.a.slice(0, 10)}`);
    const i = indexOf.get(r.client_id);
    if (i != null) seen[i].push(dayNo(r.a.slice(0, 10)));
  }
  /** what holds a barber's time on a date: [from, to) minutes, visits apart */
  const heldOn = (staffId, date) => {
    const held = [];
    for (const r of there) {
      if (r.staff_id !== staffId || (r.kind === "visit" && r.status === "cancelled")) continue;
      const [ad, bd] = [r.a.slice(0, 10), r.b.slice(0, 10)];
      if (ad > date || bd < date) continue;
      const span = [ad < date ? 0 : toMin(r.a.slice(11)), bd > date ? 1440 : toMin(r.b.slice(11))];
      if (span[1] > span[0]) held.push({ span, visit: r.kind === "visit" });
    }
    return held;
  };
  const pickClient = (rand, date, seat) => {
    const n = dayNo(date);
    const free = (apart, mine) => pool.map((_, i) => i).filter((i) => (!mine || i % staff.length === seat) && seen[i].every((d) => Math.abs(d - n) >= apart));
    const regular = rand() < BUSY.regulars;
    for (const list of [regular ? free(BUSY.apart, true) : [], free(BUSY.apart, false), free(1, false)]) {
      if (list.length) return list[Math.floor(rand() * list.length)];
    }
    return Math.floor(rand() * pool.length);
  };

  // 3. The plan: every barber's shift in the 29 days that has not been made yet
  const rows = [];
  let shifts = 0;
  const linesOf = new Map();
  for (const st of staff) linesOf.set(st.id, await demoLines(db, st.id));
  for (let date = first; date <= last; date = addDays(date, 1)) {
    for (const [seat, st] of staff.entries()) {
      const lines = linesOf.get(st.id);
      const ov = overrides.find((o) => o.staff_id === st.id && o.day === date);
      const spans = (ov ? ov.intervals : hours.filter((h) => h.staff_id === st.id && h.weekday === weekdayOf(date) && (!h.valid_from || h.valid_from <= date) && (!h.valid_to || h.valid_to >= date)).map((h) => [h.starts, h.ends]))
        .map(([a, b]) => [toMin(a), toMin(b)])
        .filter(([a, b]) => b > a)
        .sort((x, y) => x[0] - y[0]);
      if (!spans.length || !lines.length) continue;
      const row = (start, line, rand, key, status) => {
        // a cancelled visit is made again on every run until its day leaves the 29: its client must not depend on the others
        const c = pool[status === "cancelled" ? Math.floor(rand() * pool.length) : pickClient(rand, date, seat)];
        if (status !== "cancelled") seen[indexOf.get(c.id)].push(dayNo(date));
        const online = rand() < BUSY.online;
        const starts = momentOf(date, start, tz);
        // booked a day to ten days before online, the same day to four days before by the staff; never after «now»
        const lead = online ? 1440 * (1 + Math.floor(rand() * 10)) + Math.floor(rand() * 600) : 1440 * Math.floor(rand() * 5) + 30 + Math.floor(rand() * 270);
        const created = Math.min(starts - lead * 60_000, now - (5 + Math.floor(rand() * 2880)) * 60_000);
        const comment = online && rand() < 0.08 ? BUSY.comments[Math.floor(rand() * BUSY.comments.length)] : "";
        const cancelledAt = status === "cancelled" ? created + Math.floor((starts - created) * (0.2 + 0.7 * rand())) : null;
        rows.push({
          id: demoId("busy", key),
          staff_id: st.id,
          location_id: st.location_id,
          client_id: c.id,
          starts_at: new Date(starts).toISOString(),
          ends_at: new Date(starts + line.dur * 60_000).toISOString(),
          blocked_until: new Date(starts + (line.dur + line.buf) * 60_000).toISOString(),
          status,
          source: online ? "online" : "admin",
          comment,
          price: line.price,
          locale: c.locale,
          key: `${BUSY.key}${key}`,
          created_at: new Date(created).toISOString(),
          cancelled_at: cancelledAt && new Date(cancelledAt).toISOString(),
          cancelled_by: status === "cancelled" ? (online ? "client" : "admin") : null,
          service_id: line.id,
          name: line.name,
          dur: line.dur,
        });
      };
      const begun = (minute) => date < today || (date === today && minute <= nowMin);
      if (!made.has(`${st.id}:${date}`)) {
        const held = heldOn(st.id, date);
        const taken = held.filter((h) => h.visit).reduce((n, h) => n + spans.reduce((m, [a, b]) => m + Math.max(0, Math.min(b, h.span[1]) - Math.max(a, h.span[0])), 0), 0);
        const plan = planShift({ spans, busy: held.map((h) => h.span), taken, lines, seed: `${st.slug}:${date}` });
        const rand = seeded(`${st.slug}:${date}:who`);
        for (const v of plan.visits) {
          const outcome = rand() < BUSY.noShow ? "n" : "d";
          const status = begun(v.start + v.line.dur) ? (outcome === "n" ? "no_show" : "done") : begun(v.start) && outcome === "d" ? "arrived" : "booked";
          row(v.start, v.line, rand, `${st.slug}:${date}:${toTime(v.start)}:${outcome}`, status);
        }
        if (plan.visits.length) shifts++;
      }
      // a cancelled visit of a past shift: it holds no time, so it may sit over another visit
      const rand = seeded(`${st.slug}:${date}:cancelled`);
      if (rand() < BUSY.cancelled) {
        const line = pickLine(lines, rand);
        const [a, b] = spans[Math.floor(rand() * spans.length)];
        const slots = Math.floor((b - a - line.dur) / BUSY.step) + 1;
        const start = slots > 0 ? a + BUSY.step * Math.floor(rand() * slots) : -1;
        if (start >= 0 && begun(start)) row(start, line, rand, `${st.slug}:${date}:${toTime(start)}:c`, "cancelled");
      }
    }
  }
  if (!rows.length) return { ...none, closed: closed.rows.length };

  // 4. The clients of those visits, then the visits with their lines, in one statement each
  const used = [...new Set(rows.map((r) => r.client_id))].map((id) => pool[indexOf.get(id)]);
  const firstBooked = (id) => rows.filter((r) => r.client_id === id).map((r) => r.created_at).sort()[0];
  const firstSource = (id) => rows.filter((r) => r.client_id === id).sort((x, y) => (x.created_at < y.created_at ? -1 : 1))[0].source;
  const clients = await db.query(
    `insert into clients (id, business_id, name, phone_e164, locale, source, sms_opt_out, email_opt_out, created_at, updated_at)
     select x.id, $1::uuid, x.name, x.phone, x.locale, x.source, true, true, x.created_at, x.created_at
       from jsonb_to_recordset($2::jsonb) as x(id uuid, name text, phone text, locale text, source text, created_at timestamptz)
     on conflict do nothing returning id`,
    [biz.id, JSON.stringify(used.map((c) => ({ ...c, source: firstSource(c.id), created_at: firstBooked(c.id) })))],
  );
  // a number someone else already has on this database: his visits go to that client
  const byPhone = new Map((await db.query("select id, phone_e164 from clients where business_id = $1 and phone_e164 = any($2::text[])", [biz.id, used.map((c) => c.phone)])).rows.map((r) => [r.phone_e164, r.id]));
  for (const r of rows) r.client_id = byPhone.get(pool[indexOf.get(r.client_id)].phone) ?? r.client_id;
  const visits = await db.query(
    `with x as (
       select * from jsonb_to_recordset($2::jsonb) as r(
         id uuid, staff_id uuid, location_id uuid, client_id uuid, starts_at timestamptz, ends_at timestamptz, blocked_until timestamptz,
         status text, source text, comment text, price int, locale text, key text, created_at timestamptz,
         cancelled_at timestamptz, cancelled_by text, service_id uuid, name jsonb, dur int)
     ), added as (
       insert into appointments (id, business_id, location_id, staff_id, client_id, starts_at, ends_at, blocked_until, status, source,
                                 client_comment, reminder_min, total_cents, locale, idempotency_key, cancelled_at, cancelled_by, created_at, updated_at)
       select x.id, $1::uuid, x.location_id, x.staff_id, x.client_id, x.starts_at, x.ends_at, x.blocked_until, x.status, x.source,
              x.comment, null::int, x.price, x.locale, x.key, x.cancelled_at, x.cancelled_by, x.created_at, x.created_at
         from x
       on conflict do nothing
       returning id
     )
     insert into appointment_services (appointment_id, position, service_id, name, duration_min, price_cents)
     select x.id, 0, x.service_id, x.name, x.dur, x.price from x join added on added.id = x.id
     returning appointment_id`,
    [biz.id, JSON.stringify(rows)],
  );
  return { visits: visits.rows.length, clients: clients.rows.length, closed: closed.rows.length, shifts };
}

/**
 * The busy calendar is for staging: SEED_BUSY=yes, and never where the app
 * is the real thing (ALLOW_INDEXING=yes, set at the move to rempire.ee).
 * @param {Record<string, string | undefined>} [env]
 */
export function busyEnabled(env = process.env) {
  return env.SEED_BUSY === "yes" && env.ALLOW_INDEXING !== "yes";
}

async function main() {
  if (process.argv.includes("--if-enabled") && process.env.SEED_DEMO !== "yes") {
    console.log("Demo seed skipped (SEED_DEMO is not yes).");
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url && process.argv.includes("--if-enabled")) {
    console.log("Demo seed skipped (DATABASE_URL is not set).");
    return;
  }
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: sslFor(url) });
  await client.connect();
  try {
    await seedDemo(client);
    const special = await seedDemoSpecial(client);
    const qa = await seedOwnerQa(client);
    const sales = await seedDemoSales(client);
    console.log(`Demo seed done (${special} special-time windows, ${qa} question forms, ${sales} demo sales added).`);
    if (busyEnabled()) {
      const busy = await seedDemoBusy(client);
      console.log(`Busy calendar: ${busy.visits} visits of ${busy.clients} new clients in ${busy.shifts} shifts added, ${busy.closed} past visits closed.`);
    }
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
