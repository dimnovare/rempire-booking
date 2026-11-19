/**
 * «Клиенты»: the salon's client base in the admin (Dim, decisions round 8,
 * 19.11.2026: Altegio's «Клиенты», «a list of every client with phone,
 * visit history, notes and categories»).
 *
 *   - the list: a search by name, phone digits or e-mail, one category as a
 *     filter, 25 a page, each client with his numbers;
 *   - one client: his fields and his visits with every barber;
 *   - add a client, change one.
 *
 * The numbers of a client:
 *   visits      his visits that are not cancelled, the ones ahead included
 *               (the same count the calendar's «new visit» search shows);
 *   first, last his first and his latest visit that has begun;
 *   sold        the sum of his visits that have begun and were neither
 *               cancelled nor a no-show.
 *
 * A category is a free word (clients.labels, migration 016). The note is
 * the one shared note the barbers read and write too
 * (src/lib/barber/clients.ts). A client merged into another
 * (clients.merged_into) is not listed and cannot be opened.
 *
 * The import from Altegio will fill the same table later; nothing here
 * imports.
 */
import type { Business } from "../availability";
import { NOTE_MAX } from "../barber/clients";
import type { L10n } from "../catalog";
import { query, withTx, type Querier } from "../db";
import { isLocale, type Locale } from "../i18n";
import { normalizePhone } from "../phone";
import { isUuid } from "./visits";

export { NOTE_MAX };
/** Clients on one page of the list. */
export const PAGE_SIZE = 25;
/** One category: at most this many characters. */
export const LABEL_MAX = 30;
/** Categories on one client. */
export const LABELS_MAX = 12;
/** The visits one client's page shows, newest first. */
export const VISITS_MAX = 200;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ms = (d: Date | string) => new Date(d).getTime();
const pgCode = (err: unknown) => (err as { code?: string })?.code;
const text = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);
/** % and _ mean themselves in a search. */
const likeText = (s: string) => s.replace(/[%_\\]/g, (m) => "\\" + m);

/**
 * A client's numbers, as a lateral join on `c`. `$NOW` is replaced by the
 * placeholder of «now»: a visit counts as his once it has begun.
 */
const STATS = `left join lateral (
    select count(*)::int as visits,
           min(a.starts_at) filter (where a.starts_at <= $NOW) as first_visit,
           max(a.starts_at) filter (where a.starts_at <= $NOW) as last_visit,
           coalesce(sum(a.total_cents) filter (where a.starts_at <= $NOW and a.status <> 'no_show'), 0)::int as sold
      from appointments a
     where a.client_id = c.id and a.status <> 'cancelled'
  ) v on true`;

export type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  labels: string[];
  visits: number;
  firstVisit: number | null;
  lastVisit: number | null;
  soldCents: number;
};

export type ClientFilter = {
  /** a name, phone digits or an e-mail, or a part of one */
  q?: string | null;
  /** only clients of this category */
  label?: string | null;
  /** from 1; a page past the end is the last one */
  page?: number | null;
};

export type ClientList = {
  rows: ClientRow[];
  /** how many clients the search and the filter leave, on every page together */
  total: number;
  page: number;
  pages: number;
  /** every category in use, for the filter and for the «add» field */
  labels: string[];
};

type StatsRow = { visits: number; first_visit: Date | null; last_visit: Date | null; sold: number };

/**
 * What was typed in the search field, as a WHERE part: looked for inside
 * the name and inside the e-mail. Mostly digits is a phone as well («5555
 * 0903», «+372 55»), whatever spaces and brackets it was typed with: its
 * digits are looked for inside the stored number.
 */
function searchPart(raw: unknown, params: unknown[]): string {
  const s = text(raw, 60);
  if (!s) return "";
  params.push(likeText(s));
  const words = `c.name ilike '%' || $${params.length} || '%' or coalesce(c.email, '') ilike '%' || $${params.length} || '%'`;
  const digits = s.replace(/\D/g, "");
  const byPhone = digits.length >= 3 && digits.length >= s.replace(/[\s+()-]/g, "").length - 1;
  if (!byPhone) return ` and (${words})`;
  // «00372…» is «+372…»
  params.push(digits.replace(/^00/, ""));
  return ` and (${words} or replace(coalesce(c.phone_e164, ''), '+', '') like '%' || $${params.length} || '%')`;
}

/** Every category in use in the business, A to Z. */
export async function clientLabels(q: Querier, businessId: string): Promise<string[]> {
  const rows = await q<{ label: string }>(
    `select label from (select distinct unnest(labels) as label from clients where business_id = $1 and merged_into is null) t
      order by lower(label), label`,
    [businessId],
  );
  return rows.map((r) => r.label);
}

/** One page of the client base, by name. */
export async function listClients(q: Querier, businessId: string, filter: ClientFilter = {}, now = Date.now()): Promise<ClientList> {
  const params: unknown[] = [businessId];
  let where = "c.business_id = $1 and c.merged_into is null";
  where += searchPart(filter.q, params);
  const label = text(filter.label, LABEL_MAX);
  if (label) {
    params.push(label);
    where += ` and $${params.length} = any(c.labels)`;
  }
  const [labels, [count]] = await Promise.all([clientLabels(q, businessId), q<{ n: number }>(`select count(*)::int as n from clients c where ${where}`, params)]);
  const total = count?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const asked = Number.isInteger(filter.page) ? (filter.page as number) : 1;
  const page = Math.min(Math.max(1, asked), pages);
  const nowAt = params.length + 1;
  const rows = total
    ? await q<{ id: string; name: string; phone_e164: string | null; email: string | null; labels: string[] } & StatsRow>(
        `select c.id, c.name, c.phone_e164, c.email, c.labels, v.visits, v.first_visit, v.last_visit, v.sold
           from clients c ${STATS.replaceAll("$NOW", `$${nowAt}`)}
          where ${where}
          order by lower(c.name), c.name, c.id
          limit $${nowAt + 1} offset $${nowAt + 2}`,
        [...params, new Date(now), PAGE_SIZE, (page - 1) * PAGE_SIZE],
      )
    : [];
  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone_e164,
      email: r.email,
      labels: r.labels ?? [],
      visits: r.visits,
      firstVisit: r.first_visit ? ms(r.first_visit) : null,
      lastVisit: r.last_visit ? ms(r.last_visit) : null,
      soldCents: r.sold,
    })),
    total,
    page,
    pages,
    labels,
  };
}

export type ClientVisit = {
  id: string;
  start: number;
  end: number;
  staffId: string;
  staffName: string;
  services: L10n[];
  status: string;
  totalCents: number;
  /** still to come: booked or waiting, and not begun */
  ahead: boolean;
};

export type ClientDetail = ClientRow & {
  locale: Locale;
  note: string;
  smsOptOut: boolean;
  emailOptOut: boolean;
  /** online, admin or import */
  source: string;
  createdAt: number;
  /** the ones ahead, soonest first; then the rest, newest first (at most `VISITS_MAX`, cancelled ones included) */
  history: ClientVisit[];
};

/** One client with his visits, or null: not this business's, merged away, or no such id. */
export async function clientDetail(q: Querier, business: Business, id: string, now = Date.now()): Promise<ClientDetail | null> {
  if (!isUuid(id)) return null;
  const [c] = await q<
    { id: string; name: string; phone_e164: string | null; email: string | null; labels: string[]; locale: string; staff_note: string; sms_opt_out: boolean; email_opt_out: boolean; source: string; created_at: Date } & StatsRow
  >(
    `select c.id, c.name, c.phone_e164, c.email, c.labels, c.locale, c.staff_note, c.sms_opt_out, c.email_opt_out, c.source, c.created_at,
            v.visits, v.first_visit, v.last_visit, v.sold
       from clients c ${STATS.replaceAll("$NOW", "$3")}
      where c.id = $1 and c.business_id = $2 and c.merged_into is null`,
    [id, business.id, new Date(now)],
  );
  if (!c) return null;
  const rows = await q<{ id: string; starts_at: Date; ends_at: Date; staff_id: string; staff_name: string; status: string; total_cents: number; services: L10n[] | null }>(
    `select a.id, a.starts_at, a.ends_at, a.staff_id, s.display_name as staff_name, a.status, a.total_cents,
            (select json_agg(l.name order by l.position) from appointment_services l where l.appointment_id = a.id) as services
       from appointments a join staff s on s.id = a.staff_id
      where a.business_id = $1 and a.client_id = $2
      order by a.starts_at desc
      limit ${VISITS_MAX}`,
    [business.id, id],
  );
  const visits: ClientVisit[] = rows.map((r) => {
    const start = ms(r.starts_at);
    return {
      id: r.id,
      start,
      end: ms(r.ends_at),
      staffId: r.staff_id,
      staffName: r.staff_name,
      services: r.services ?? [],
      status: r.status,
      totalCents: r.total_cents,
      ahead: start > now && (r.status === "booked" || r.status === "pending"),
    };
  });
  return {
    id: c.id,
    name: c.name,
    phone: c.phone_e164,
    email: c.email,
    labels: c.labels ?? [],
    visits: c.visits,
    firstVisit: c.first_visit ? ms(c.first_visit) : null,
    lastVisit: c.last_visit ? ms(c.last_visit) : null,
    soldCents: c.sold,
    locale: isLocale(c.locale) ? c.locale : "ru",
    note: c.staff_note,
    smsOptOut: c.sms_opt_out,
    emailOptOut: c.email_opt_out,
    source: c.source,
    createdAt: ms(c.created_at),
    history: [...visits.filter((v) => v.ahead).reverse(), ...visits.filter((v) => !v.ahead)],
  };
}

/**
 * What the admin may set on a client. Adding one needs a name; changing
 * one, a field left out (undefined) stays as it is, so a part of the page
 * sends only its own fields.
 */
export type ClientInput = {
  name?: string;
  /** as typed; empty or null = no phone (a walk-in) */
  phone?: string | null;
  email?: string | null;
  locale?: string;
  /** the shared note, the barbers' too */
  note?: string;
  labels?: string[];
  smsOptOut?: boolean;
  emailOptOut?: boolean;
};

/**
 * `field` is what to fix. «phoneTaken»: another client of the business has
 * this phone already; `clientId` is that client (the one he was merged
 * into, if he was).
 */
export type ClientSaved = { ok: true; id: string } | { ok: false; field: string; clientId?: string };

/** Trimmed, no word twice (whatever its capitals), the first spelling kept. Null: not a list, or too many. */
export function cleanLabels(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const s = text(String(raw ?? "").replace(/\s+/g, " "), LABEL_MAX).trim();
    const key = s.toLocaleLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.length <= LABELS_MAX ? out : null;
}

type Clean = { name?: string; phone?: string | null; email?: string | null; locale?: Locale; note?: string; labels?: string[]; smsOptOut?: boolean; emailOptOut?: boolean };

function clean(input: ClientInput, adding: boolean): { ok: true; v: Clean } | { ok: false; field: string } {
  const v: Clean = {};
  if (input.name !== undefined || adding) {
    const name = text(input.name, 120).replace(/\s+/g, " ");
    if (!name) return { ok: false, field: "name" };
    v.name = name;
  }
  if (input.phone !== undefined) {
    const raw = text(input.phone, 40);
    const phone = raw ? normalizePhone(raw) : null;
    if (raw && !phone) return { ok: false, field: "phone" };
    v.phone = phone;
  }
  if (input.email !== undefined) {
    const email = String(input.email ?? "").trim();
    if (email && (email.length > 254 || !EMAIL_RE.test(email))) return { ok: false, field: "email" };
    v.email = email || null;
  }
  if (input.locale !== undefined) {
    if (!isLocale(input.locale)) return { ok: false, field: "locale" };
    v.locale = input.locale;
  }
  if (input.note !== undefined) v.note = String(input.note ?? "").replace(/\r\n/g, "\n").trim().slice(0, NOTE_MAX);
  if (input.labels !== undefined) {
    const labels = cleanLabels(input.labels);
    if (!labels) return { ok: false, field: "labels" };
    v.labels = labels;
  }
  if (input.smsOptOut !== undefined) v.smsOptOut = input.smsOptOut === true;
  if (input.emailOptOut !== undefined) v.emailOptOut = input.emailOptOut === true;
  return { ok: true, v };
}

type Stored = { name: string; phone_e164: string | null; email: string | null; locale: string; staff_note: string; labels: string[]; sms_opt_out: boolean; email_opt_out: boolean };

/** Who else in the business has this phone: the client he was merged into, if he was. */
async function phoneHolder(tx: Querier, businessId: string, phone: string, notId: string | null): Promise<string | null> {
  const [row] = await tx<{ id: string }>(
    "select coalesce(merged_into, id) as id from clients where business_id = $1 and phone_e164 = $2 and ($3::uuid is null or id <> $3::uuid) limit 1",
    [businessId, phone, notId],
  );
  return row?.id ?? null;
}

/**
 * Add a client (id null) or change one. The audit row says who did it and
 * which fields changed, never the values: a client's name and phone stay
 * in his own row only.
 */
export async function saveClient(business: Business, id: string | null, input: ClientInput, actor: string): Promise<ClientSaved> {
  if (id !== null && !isUuid(id)) return { ok: false, field: "id" };
  const c = clean(input ?? {}, id === null);
  if (!c.ok) return c;
  const v = c.v;
  const run = () =>
    withTx<ClientSaved>(async (tx) => {
      if (id === null) {
        if (v.phone) {
          const other = await phoneHolder(tx, business.id, v.phone, null);
          if (other) return { ok: false, field: "phoneTaken", clientId: other };
        }
        const [row] = await tx<{ id: string }>(
          `insert into clients (business_id, name, phone_e164, email, locale, staff_note, labels, sms_opt_out, email_opt_out, source)
           values ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, 'admin') returning id`,
          [business.id, v.name, v.phone ?? null, v.email ?? null, v.locale ?? (isLocale(business.default_locale) ? business.default_locale : "ru"), v.note ?? "", v.labels ?? [], v.smsOptOut ?? false, v.emailOptOut ?? false],
        );
        await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'client', $2, 'create', $3::jsonb)`, [actor, row.id, JSON.stringify({ by: "admin", source: "admin" })]);
        return { ok: true, id: row.id };
      }
      const [cur] = await tx<Stored>(
        `select name, phone_e164, email, locale, staff_note, labels, sms_opt_out, email_opt_out
           from clients where id = $1 and business_id = $2 and merged_into is null for update`,
        [id, business.id],
      );
      if (!cur) return { ok: false, field: "id" };
      const next: Stored = {
        name: v.name ?? cur.name,
        phone_e164: v.phone === undefined ? cur.phone_e164 : v.phone,
        email: v.email === undefined ? cur.email : v.email,
        locale: v.locale ?? cur.locale,
        staff_note: v.note ?? cur.staff_note,
        labels: v.labels ?? cur.labels ?? [],
        sms_opt_out: v.smsOptOut ?? cur.sms_opt_out,
        email_opt_out: v.emailOptOut ?? cur.email_opt_out,
      };
      const changed = (Object.keys(next) as (keyof Stored)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(cur[k] ?? (k === "labels" ? [] : null)));
      if (!changed.length) return { ok: true, id };
      if (next.phone_e164 && next.phone_e164 !== cur.phone_e164) {
        const other = await phoneHolder(tx, business.id, next.phone_e164, id);
        if (other) return { ok: false, field: "phoneTaken", clientId: other };
      }
      await tx(
        `update clients set name = $2, phone_e164 = $3, email = $4, locale = $5, staff_note = $6, labels = $7::text[],
                sms_opt_out = $8, email_opt_out = $9, updated_at = now()
          where id = $1`,
        [id, next.name, next.phone_e164, next.email, next.locale, next.staff_note, next.labels, next.sms_opt_out, next.email_opt_out],
      );
      await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'client', $2, 'edit', $3::jsonb)`, [actor, id, JSON.stringify({ by: "admin", changed })]);
      return { ok: true, id };
    });
  try {
    return await run();
  } catch (err) {
    // two saves of the same phone at once: the database's unique (business_id, phone_e164) refused the second
    if (pgCode(err) === "23505" && v.phone) {
      const other = await phoneHolder(query, business.id, v.phone, id);
      return { ok: false, field: "phoneTaken", ...(other ? { clientId: other } : {}) };
    }
    throw err;
  }
}
