#!/usr/bin/env node
/**
 * Demo data for staging and tests: REMPIRE, Mardi 1, the five barbers'
 * public first names (as on rempire.ee), the services from the mock with
 * EXAMPLE prices, durations and hours. No clients, no visits.
 *
 *   node tools/seed-demo.mjs               # against DATABASE_URL
 *   node tools/seed-demo.mjs --if-enabled  # only when SEED_DEMO=yes (postbuild)
 *
 * Safe to run again: it only adds what is missing and never overwrites a
 * row Renat has since edited in the admin.
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { sslFor } from "./migrate.mjs";

const T = (ru, et, en) => ({ ru, et, en });

export const DEMO = {
  business: { slug: "rempire", name: "REMPIRE", timezone: "Europe/Tallinn", default_locale: "ru" },
  location: { slug: "mardi-1", name: "REMPIRE", address: "Mardi 1, Tallinn" },
  services: [
    { slug: "clip", d: 45, name: T("Стрижка машинкой и ножницами", "Juukselõikus masina ja kääridega", "Haircut, clippers + scissors") },
    { slug: "long", d: 60, name: T("Стрижка ножницами, длинные волосы", "Pikad juuksed, kääridega", "Long hair, scissors") },
    { slug: "buzz", d: 30, name: T("Стрижка машинкой (buzzcut)", "Masinalõikus (buzzcut)", "Buzzcut, clippers") },
    { slug: "cutbeard", d: 75, name: T("Стрижка + борода", "Juukselõikus + habe", "Haircut + beard trim") },
    { slug: "beard", d: 30, name: T("Оформление бороды", "Habeme piiramine", "Beard trim") },
    { slug: "grey", d: 30, name: T("Камуфляж седины", "Hallide juuste katmine", "Grey hair coverage") },
    { slug: "kid", d: 45, name: T("Детская стрижка", "Lapse juukselõikus", "Kid's haircut") },
    { slug: "fs", d: 90, name: T("Отец и сын", "Isa ja poeg", "Father and son") },
  ],
  // price in euros per service; a missing service = the barber does not do it.
  // Photos: the portraits from rempire.ee/en/barbershop, 480 x 640, grey
  // (public/barbers/, 17.11.2026).
  staff: [
    { slug: "renat", name: "Renat", p: { clip: 40, long: 45, buzz: 35, cutbeard: 60, beard: 28, grey: 35, kid: 35, fs: 65 } },
    { slug: "valentin", name: "Valentin", p: { clip: 40, long: 45, buzz: 35, cutbeard: 60, beard: 28, grey: 30, kid: 35, fs: 65 } },
    { slug: "jevgeni", name: "Jevgeni", p: { clip: 38, long: 43, buzz: 33, cutbeard: 57, beard: 26, grey: 30, fs: 62 } },
    { slug: "slava", name: "Slava", p: { clip: 38, long: 43, buzz: 33, cutbeard: 57, beard: 26, grey: 30, kid: 33, fs: 62 } },
    { slug: "milena", name: "Milena", p: { clip: 35, long: 40, buzz: 30, grey: 30, kid: 30, fs: 60 } },
  ],
  // example week: Mon–Fri 10–20, Sat 10–18, Sunday closed
  hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, starts: "10:00", ends: "20:00" })).concat([{ weekday: 6, starts: "10:00", ends: "18:00" }]),
};

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

/** @param {{query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}>}} db */
export async function seedDemo(db) {
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const b = DEMO.business;
  const biz = await one(
    `insert into businesses (id, slug, name, timezone, default_locale) values ($5, $1, $2, $3, $4)
     on conflict (slug) do update set slug = excluded.slug returning id`,
    [b.slug, b.name, b.timezone, b.default_locale, demoId("business", b.slug)],
  );
  const loc = await one(
    `insert into locations (id, business_id, slug, name, address, timezone) values ($6, $1, $2, $3, $4, $5)
     on conflict (business_id, slug) do update set slug = excluded.slug returning id`,
    [biz.id, DEMO.location.slug, DEMO.location.name, DEMO.location.address, b.timezone, demoId("location", DEMO.location.slug)],
  );
  const svc = {};
  for (const [i, s] of DEMO.services.entries()) {
    const prices = DEMO.staff.map((st) => st.p[s.slug]).filter((x) => x != null);
    const row = await one(
      `insert into services (id, business_id, slug, name, duration_min, price_cents, sort) values ($7, $1, $2, $3::jsonb, $4, $5, $6)
       on conflict (business_id, slug) do update set slug = excluded.slug returning id`,
      [biz.id, s.slug, JSON.stringify(s.name), s.d, Math.min(...prices) * 100, i, demoId("service", s.slug)],
    );
    svc[s.slug] = row.id;
  }
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
    for (const [slug, eur] of Object.entries(st.p)) {
      await db.query(
        `insert into staff_services (staff_id, service_id, price_cents) values ($1, $2, $3) on conflict do nothing`,
        [staffId, svc[slug], eur * 100],
      );
    }
    // hours only for a barber who has none yet
    if (inserted) {
      for (const h of DEMO.hours) {
        await db.query("insert into staff_hours (staff_id, weekday, starts, ends) values ($1, $2, $3, $4)", [staffId, h.weekday, h.starts, h.ends]);
      }
    }
  }
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
 * add their own rows for fixed dates.
 */
export const DEMO_SPECIAL = [
  { staff: "valentin", days: [1, 2, 3, 4, 5], from: "20:00", to: "22:00", extra: 20 },
  { staff: "jevgeni", days: [2, 4], from: "13:00", to: "14:00", extra: 15 },
  { staff: "renat", days: [6], from: "18:00", to: "20:00", extra: 25 },
  { staff: "slava", days: [7], from: "12:00", to: "16:00", extra: 25 },
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
        `insert into special_time (id, business_id, staff_id, starts_at, ends_at, extra_cents, note, created_by)
         select $1, $2, s.id, ($4::date + $5::time) at time zone $7, ($4::date + $6::time) at time zone $7, $8, 'demo', 'demo'
           from staff s where s.business_id = $2 and s.slug = $3
         on conflict (id) do nothing
         returning id`,
        [demoId("special", `${sp.staff}:${date}`), biz.id, sp.staff, date, sp.from, sp.to, tz, sp.extra * 100],
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
 * Logins to try the admin and the barber app on a local run: an owner and
 * one per demo barber, at example.test (a name that can never get mail), with
 * no password: they log in with the e-mail code, which the console transport
 * prints. Only the in-memory database calls this (src/lib/db.ts,
 * DEMO_LOGINS=yes); never a real one.
 * @param {{query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}>}} db
 */
/**
 * Example visits for a LOCAL run only (DEMO_LOGINS=yes, src/lib/db.ts), so
 * the barber app has a day to show: each barber, today and tomorrow, five
 * visits and a lunch break, plus one client in 20 minutes. Fake clients («Demo client N», +372 5555 09xx),
 * never staging and never tests.
 */
export const DEMO_VISITS = [
  { at: "10:00", svc: "clip", src: "online", comment: "Покороче по бокам" },
  { at: "11:00", svc: "cutbeard", src: "admin" },
  { at: "14:30", svc: "buzz", src: "online" },
  { at: "16:00", svc: "beard", src: "admin", noPhone: true },
  { at: "17:30", svc: "kid", src: "online" },
];

/** @param {{query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}>}} db */
export async function seedDemoVisits(db, now = Date.now()) {
  const tz = DEMO.business.timezone;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = today.split("-").map(Number);
  const [biz] = (await db.query("select id from businesses where slug = $1", [DEMO.business.slug])).rows;
  if (!biz) return 0;
  let added = 0;
  // First one client in 20 minutes for each barber, so «Дальше» (and its
  // «Пришёл», from 30 minutes before) shows whenever the app starts; the
  // fixed visits below leave its time alone.
  const soon = Math.ceil((now + 20 * 60_000) / 300_000) * 300_000;
  let j = 2 * DEMO.staff.length * DEMO_VISITS.length;
  for (const st of DEMO.staff) {
    const k = ++j;
    const staffId = demoId("staff", st.slug);
    const [line] = (
      await db.query(
        `select sv.id, sv.name, coalesce(ss.duration_min, sv.duration_min) as dur, coalesce(ss.price_cents, sv.price_cents) as price, sv.buffer_after_min as buf
           from services sv join staff_services ss on ss.service_id = sv.id and ss.staff_id = $1 and ss.active where sv.slug = 'buzz'`,
        [staffId],
      )
    ).rows;
    if (!line) continue;
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
    const date = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    for (const st of DEMO.staff) {
      const staffId = demoId("staff", st.slug);
      await db.query(
        `insert into time_off (id, staff_id, starts_at, ends_at, kind, status, note)
         values ($1, $2, ($3::date + '13:00'::time) at time zone $4, ($3::date + '14:00'::time) at time zone $4, 'block', 'approved', 'обед')
         on conflict (id) do nothing`,
        [demoId("block", `${st.slug}:${date}`), staffId, date, tz],
      );
      for (const v of DEMO_VISITS) {
        k++;
        const [line] = (
          await db.query(
            `select sv.id, sv.name, coalesce(ss.duration_min, sv.duration_min) as dur, coalesce(ss.price_cents, sv.price_cents) as price, sv.buffer_after_min as buf
               from services sv join staff_services ss on ss.service_id = sv.id and ss.staff_id = $1 and ss.active
              where sv.slug = $2`,
            [staffId, v.svc],
          )
        ).rows;
        if (!line) continue;
        const phone = v.noPhone ? null : `+37255550${String(900 + (k % 100)).padStart(3, "0")}`;
        const [client] = (
          await db.query(
            `insert into clients (id, business_id, name, phone_e164, source) values ($1, $2, $3, $4, 'admin')
             on conflict (id) do update set updated_at = now() returning id`,
            [demoId("client", String(k)), biz.id, `Demo client ${k}`, phone],
          )
        ).rows;
        const id = demoId("visit", `${st.slug}:${date}:${v.at}`);
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
          [id, biz.id, client.id, date, v.at, tz, line.dur, line.buf, v.src, v.comment ?? "", phone ? 120 : null, line.price, staffId],
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
  for (const st of DEMO.staff) await add(`${st.slug}@example.test`, st.name, "staff", demoId("staff", st.slug));
  return added;
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
