/**
 * «Клиенты»: the salon's client base in the admin (Dim, decisions round 8,
 * 19.11.2026: Altegio's «Клиенты», «a list of every client with phone,
 * visit history, notes and categories»).
 *
 *   - the list: a search by name, the digits of either phone, e-mail or
 *     card number, one category as a filter, the conditions of the client
 *     base (client-filter.ts) joined by «И» or «Или», sorted by a column,
 *     10, 25, 50 or 100 a page, each client with his numbers;
 *   - one client: his fields and his visits with every barber;
 *   - add a client, change one, delete one who has no history.
 *
 * The card's other parts (comments, photo, files, messages, statistics)
 * are in client-card.ts; what is done to many clients at once (a mass
 * message, a category, deleting) in client-bulk.ts.
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
 * The fields of the full card (018_client_card.sql; the owner, 19.11.2026):
 * a second phone, the birthday, gender, importance class, card number,
 * discount, «no online booking», and what he lets us send him.
 *
 *   - **The birthday may have no year** («14.03»): it is kept as day, month
 *     and year, the year null when nobody knows it (src/lib/birthday.ts).
 *   - **The discount is stored and shown only.** It changes no price
 *     anywhere: not a booking's total, not a sale, not an invoice.
 *   - «No online booking» is acted on by src/lib/booking.ts, the switches
 *     of «Уведомления» by src/lib/client-notify.ts and the outbox.
 *
 * The import from Altegio will fill the same table later; nothing here
 * imports.
 *
 * Rights (src/lib/auth/rights.ts): a function handed a login (`who`) asks
 * them itself. Which clients it sees is «Показывать клиентов»
 * (client-scope.ts); phones and e-mails are masked in the list and on the
 * card without their two rights, and then cannot be searched by either;
 * the note, the visit history, changing the card and deleting each have a
 * right. Without `who` nothing is asked: the caller is the system or a test.
 */
import { can, maskEmail, maskPhone, type Holder } from "../auth/rights";
import type { Business } from "../availability";
import { NOTE_MAX } from "../barber/clients";
import { birthdayText, parseBirthday, type Birthday } from "../birthday";
import type { L10n } from "../catalog";
import { CLIENT_KINDS, isClientKind, type ClientKind } from "../client-notify";
import { query, withTx, type Querier } from "../db";
import { isLocale, type Locale } from "../i18n";
import { normalizePhone } from "../phone";
import { todayIn } from "../tz";
import { cleanConds, condsSql, isClientSort, isJoin, PAGE_SIZE, PAGE_SIZES, type ClientSort, type Join } from "./client-filter";
import { clientSeen, seenClientsSql } from "./client-scope";
import { isUuid } from "./visits";

export { NOTE_MAX };
// the list's page sizes and sort columns are in client-filter.ts: the list in the browser reads them too
export { isClientSort, PAGE_SIZE, PAGE_SIZES, SORTS, type ClientSort, type SortDir } from "./client-filter";
/** The salon's time zone when nobody says another. */
const TZ = "Europe/Tallinn";
/** One category: at most this many characters. */
export const LABEL_MAX = 30;
/** Categories on one client. */
export const LABELS_MAX = 12;
/** The visits one client's page shows, newest first. */
export const VISITS_MAX = 200;
/** The card number: at most this many characters. */
export const CARD_NO_MAX = 40;

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];
export const IMPORTANCE = ["bronze", "silver", "gold"] as const;
export type Importance = (typeof IMPORTANCE)[number];

// the birthday's own rules are in src/lib/birthday.ts: the card's form in the browser checks with them too
export { birthdayText, parseBirthday, type Birthday };

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
           coalesce(sum(a.total_cents) filter (where a.starts_at <= $NOW and a.status <> 'no_show'), 0)::int as sold,
           (count(*) filter (where a.starts_at <= $NOW and a.status <> 'no_show'))::int as sold_visits
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
  /** whole percent, 0 to 100; stored and shown only */
  discountPct: number;
};

export type ClientFilter = {
  /** a name, phone digits, an e-mail or a card number, or a part of one */
  q?: string | null;
  /** only clients of this category */
  label?: string | null;
  /** the conditions of the client base, as the list sent them (client-filter.ts); what is not whole is left out */
  conds?: unknown;
  /** how the conditions are joined: «and» unless «or» */
  join?: unknown;
  /** the column to sort by: name, unless one of `SORTS` */
  sort?: unknown;
  /** «asc» unless «desc» */
  dir?: unknown;
  /** from 1; a page past the end is the last one */
  page?: number | null;
  /** clients a page: one of `PAGE_SIZES`, else 25 */
  size?: number | null;
};

export type ClientList = {
  rows: ClientRow[];
  /** how many clients the search and the filter leave, on every page together */
  total: number;
  page: number;
  pages: number;
  /** clients a page, as it was answered */
  size: number;
  /** every category in use, for the filter and for the «add» field */
  labels: string[];
};

type StatsRow = { visits: number; first_visit: Date | null; last_visit: Date | null; sold: number; sold_visits: number };

/**
 * What was typed in the search field, as a WHERE part: looked for inside
 * the name, the e-mail and the card number. Mostly digits is a phone as
 * well («5555 0903», «+372 55»), whatever spaces and brackets it was typed
 * with: its digits are looked for inside both stored numbers.
 * `contacts` false (a login that does not see phones and e-mails in the
 * list): only the name and the card number are searched, so nobody finds
 * out a number by trying its digits.
 */
function searchPart(raw: unknown, params: unknown[], contacts = true): string {
  const s = text(raw, 60);
  if (!s) return "";
  params.push(likeText(s));
  const at = `'%' || $${params.length} || '%'`;
  if (!contacts) return ` and (c.name ilike ${at} or c.card_no ilike ${at})`;
  const words = `c.name ilike ${at} or coalesce(c.email, '') ilike ${at} or c.card_no ilike ${at}`;
  const digits = s.replace(/\D/g, "");
  const byPhone = digits.length >= 3 && digits.length >= s.replace(/[\s+()-]/g, "").length - 1;
  if (!byPhone) return ` and (${words})`;
  // «00372…» is «+372…»
  params.push(digits.replace(/^00/, ""));
  const has = `like '%' || $${params.length} || '%'`;
  return ` and (${words} or replace(coalesce(c.phone_e164, ''), '+', '') ${has} or replace(coalesce(c.phone2_e164, ''), '+', '') ${has})`;
}

/**
 * Which clients a filter leaves, as a WHERE over `clients c` with its
 * values: this business's, not merged away, then the search, the category
 * and the conditions. The list, the export and the bulk actions all ask
 * with this one, so they always mean the same clients. Paging and sorting
 * are not part of it. With a login (`who`): only the clients it sees.
 */
export function clientWhere(businessId: string, filter: ClientFilter = {}, now = Date.now(), tz = TZ, who?: Holder): { where: string; params: unknown[] } {
  const params: unknown[] = [businessId];
  let where = "c.business_id = $1 and c.merged_into is null";
  where += seenClientsSql(who, (value) => {
    params.push(value);
    return `$${params.length}`;
  });
  where += searchPart(filter.q, params, !who || can(who, "clients.list_contacts"));
  const label = text(filter.label, LABEL_MAX);
  if (label) {
    params.push(label);
    where += ` and $${params.length} = any(c.labels)`;
  }
  const p = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  where += condsSql(cleanConds(filter.conds), isJoin(filter.join) ? (filter.join as Join) : "and", { p, now, tz });
  return { where, params };
}

/**
 * ORDER BY for the list. Only names from this map ever get into the text.
 * A client with no visit at all comes last when the list is sorted by a
 * visit's date, whichever way; ties go by name.
 */
const ORDER: Record<ClientSort, (dir: string) => string> = {
  name: (dir) => `lower(c.name) ${dir}, c.name ${dir}, c.id`,
  visits: (dir) => `v.visits ${dir}, lower(c.name), c.name, c.id`,
  sold: (dir) => `v.sold ${dir}, lower(c.name), c.name, c.id`,
  last: (dir) => `v.last_visit ${dir} nulls last, lower(c.name), c.name, c.id`,
  first: (dir) => `v.first_visit ${dir} nulls last, lower(c.name), c.name, c.id`,
};

type ListRow = { id: string; name: string; phone_e164: string | null; email: string | null; labels: string[]; discount_pct: number } & StatsRow;

const rowOf = (r: ListRow): ClientRow => ({
  id: r.id,
  name: r.name,
  phone: r.phone_e164,
  email: r.email,
  labels: r.labels ?? [],
  visits: r.visits,
  firstVisit: r.first_visit ? ms(r.first_visit) : null,
  lastVisit: r.last_visit ? ms(r.last_visit) : null,
  soldCents: r.sold,
  discountPct: r.discount_pct,
});

/** The clients a WHERE leaves, with their numbers, in the asked order: `limit` of them from `offset`. */
export async function clientRows(q: Querier, found: { where: string; params: unknown[] }, order: { sort?: unknown; dir?: unknown }, limit: number, offset: number, now = Date.now()): Promise<ClientRow[]> {
  const nowAt = found.params.length + 1;
  const by = ORDER[isClientSort(order.sort) ? order.sort : "name"](order.dir === "desc" ? "desc" : "asc");
  const rows = await q<ListRow>(
    `select c.id, c.name, c.phone_e164, c.email, c.labels, c.discount_pct, v.visits, v.first_visit, v.last_visit, v.sold
       from clients c ${STATS.replaceAll("$NOW", `$${nowAt}`)}
      where ${found.where}
      order by ${by}
      limit $${nowAt + 1} offset $${nowAt + 2}`,
    [...found.params, new Date(now), limit, offset],
  );
  return rows.map(rowOf);
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

/** How many clients a WHERE leaves. */
export async function countClients(q: Querier, found: { where: string; params: unknown[] }): Promise<number> {
  const [count] = await q<{ n: number }>(`select count(*)::int as n from clients c where ${found.where}`, found.params);
  return count?.n ?? 0;
}

/** One page of the client base: by name unless another column is asked for. `tz` is the salon's, for the conditions' days. */
export async function listClients(q: Querier, businessId: string, filter: ClientFilter = {}, now = Date.now(), tz = TZ, who?: Holder): Promise<ClientList> {
  const found = clientWhere(businessId, filter, now, tz, who);
  const [labels, total] = await Promise.all([clientLabels(q, businessId), countClients(q, found)]);
  const size = (PAGE_SIZES as readonly number[]).includes(filter.size as number) ? (filter.size as number) : PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(total / size));
  const asked = Number.isInteger(filter.page) ? (filter.page as number) : 1;
  const page = Math.min(Math.max(1, asked), pages);
  const rows = total ? await clientRows(q, found, filter, size, (page - 1) * size, now) : [];
  return { rows: who && !can(who, "clients.list_contacts") ? rows.map(maskRow) : rows, total, page, pages, size, labels };
}

/** A row for a login without «Показывать номера телефонов и email в списке клиентов». */
export const maskRow = (r: ClientRow): ClientRow => ({ ...r, phone: maskPhone(r.phone), email: maskEmail(r.email) });

export type ClientVisit = {
  id: string;
  start: number;
  end: number;
  staffId: string;
  staffName: string;
  /** the barber's portrait, as every page shows it (public) */
  staffPhoto: string | null;
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
  /** the visits «sold» is the sum of: begun, neither cancelled nor a no-show */
  soldVisits: number;
  phone2: string | null;
  birthday: Birthday | null;
  gender: Gender | null;
  importance: Importance | null;
  cardNo: string;
  /** whole percent, 0 to 100. Stored and shown only: it changes no price */
  discountPct: number;
  /** an online booking with his phone is refused (src/lib/booking.ts) */
  noOnline: boolean;
  /** «Рекламные сообщения: не отправлять»: a mass message goes to nobody who has it (client-bulk.ts) */
  marketingOptOut: boolean;
  pushOptOut: boolean;
  /** the kinds of message he has switched off (src/lib/client-notify.ts) */
  notifyOff: ClientKind[];
  /** his photo's version, for its link (/admin/clients/<id>/photo?v=…); null: no photo */
  photoV: string | null;
};

/**
 * One client with his visits, or null: not this business's, merged away,
 * no such id, or (with a login) not one of the clients it sees. Without the
 * card's contacts right his phones and e-mail are masked; without the note's
 * right the note is empty; without the history's right so is the history.
 */
export async function clientDetail(q: Querier, business: Business, id: string, now = Date.now(), who?: Holder): Promise<ClientDetail | null> {
  if (!isUuid(id)) return null;
  if (who && !(await clientSeen(q, business.id, who, id))) return null;
  const d = await readDetail(q, business, id, now);
  if (!d || !who) return d;
  const contacts = can(who, "clients.card_contacts");
  return {
    ...d,
    phone: contacts ? d.phone : maskPhone(d.phone),
    phone2: contacts ? d.phone2 : maskPhone(d.phone2),
    email: contacts ? d.email : maskEmail(d.email),
    note: can(who, "clients.note") ? d.note : "",
    history: can(who, "clients.history") ? d.history : [],
  };
}

async function readDetail(q: Querier, business: Business, id: string, now: number): Promise<ClientDetail | null> {
  const [c] = await q<
    {
      id: string;
      name: string;
      phone_e164: string | null;
      email: string | null;
      labels: string[];
      locale: string;
      staff_note: string;
      sms_opt_out: boolean;
      email_opt_out: boolean;
      source: string;
      created_at: Date;
      phone2_e164: string | null;
      birth_day: number | null;
      birth_month: number | null;
      birth_year: number | null;
      gender: string | null;
      importance: string | null;
      card_no: string;
      discount_pct: number;
      no_online: boolean;
      marketing_opt_out: boolean;
      push_opt_out: boolean;
      notify_off: string[] | null;
      photo_v: string | null;
    } & StatsRow
  >(
    `select c.id, c.name, c.phone_e164, c.email, c.labels, c.locale, c.staff_note, c.sms_opt_out, c.email_opt_out, c.source, c.created_at,
            c.phone2_e164, c.birth_day, c.birth_month, c.birth_year, c.gender, c.importance, c.card_no, c.discount_pct,
            c.no_online, c.marketing_opt_out, c.push_opt_out, c.notify_off,
            (select floor(extract(epoch from p.updated_at))::bigint::text from client_photo p where p.client_id = c.id) as photo_v,
            v.visits, v.first_visit, v.last_visit, v.sold, v.sold_visits
       from clients c ${STATS.replaceAll("$NOW", "$3")}
      where c.id = $1 and c.business_id = $2 and c.merged_into is null`,
    [id, business.id, new Date(now)],
  );
  if (!c) return null;
  const rows = await q<{ id: string; starts_at: Date; ends_at: Date; staff_id: string; staff_name: string; staff_photo: string | null; status: string; total_cents: number; services: L10n[] | null }>(
    `select a.id, a.starts_at, a.ends_at, a.staff_id, s.display_name as staff_name, s.photo_url as staff_photo, a.status, a.total_cents,
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
      staffPhoto: r.staff_photo,
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
    soldVisits: c.sold_visits,
    phone2: c.phone2_e164,
    birthday: c.birth_day && c.birth_month ? { day: c.birth_day, month: c.birth_month, year: c.birth_year } : null,
    gender: (GENDERS as readonly string[]).includes(c.gender ?? "") ? (c.gender as Gender) : null,
    importance: (IMPORTANCE as readonly string[]).includes(c.importance ?? "") ? (c.importance as Importance) : null,
    cardNo: c.card_no,
    discountPct: c.discount_pct,
    noOnline: c.no_online,
    marketingOptOut: c.marketing_opt_out,
    pushOptOut: c.push_opt_out,
    notifyOff: (c.notify_off ?? []).filter(isClientKind),
    photoV: c.photo_v,
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
  /** as typed; empty or null = none */
  phone2?: string | null;
  /** as typed: «14.03.1990», «14.03» (the year not known); empty or null = none */
  birthday?: string | null;
  /** «male», «female»; empty or null = not chosen */
  gender?: string | null;
  /** «bronze», «silver», «gold»; empty or null = no class */
  importance?: string | null;
  cardNo?: string;
  /** whole percent, 0 to 100. Stored and shown only: it changes no price */
  discountPct?: number;
  noOnline?: boolean;
  marketingOptOut?: boolean;
  pushOptOut?: boolean;
  /** the kinds of message he does not want (src/lib/client-notify.ts) */
  notifyOff?: string[];
};

/**
 * `field` is what to fix. «phoneTaken»: another client of the business has
 * this phone already; `clientId` is that client (the one he was merged
 * into, if he was). «forbidden»: the login has no right to this change.
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

type Clean = {
  name?: string;
  phone?: string | null;
  email?: string | null;
  locale?: Locale;
  note?: string;
  labels?: string[];
  smsOptOut?: boolean;
  emailOptOut?: boolean;
  phone2?: string | null;
  birthday?: Birthday | null;
  gender?: Gender | null;
  importance?: Importance | null;
  cardNo?: string;
  discountPct?: number;
  noOnline?: boolean;
  marketingOptOut?: boolean;
  pushOptOut?: boolean;
  notifyOff?: ClientKind[];
};

function clean(input: ClientInput, adding: boolean, today: string): { ok: true; v: Clean } | { ok: false; field: string } {
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
  if (input.phone2 !== undefined) {
    const raw = text(input.phone2, 40);
    const phone = raw ? normalizePhone(raw) : null;
    if (raw && !phone) return { ok: false, field: "phone2" };
    v.phone2 = phone;
  }
  if (input.birthday !== undefined) {
    const b = parseBirthday(input.birthday, today);
    if (!b.ok) return { ok: false, field: "birthday" };
    v.birthday = b.value;
  }
  if (input.gender !== undefined) {
    const g = text(input.gender, 20);
    if (g && !(GENDERS as readonly string[]).includes(g)) return { ok: false, field: "gender" };
    v.gender = (g || null) as Gender | null;
  }
  if (input.importance !== undefined) {
    const i = text(input.importance, 20);
    if (i && !(IMPORTANCE as readonly string[]).includes(i)) return { ok: false, field: "importance" };
    v.importance = (i || null) as Importance | null;
  }
  if (input.cardNo !== undefined) {
    const no = String(input.cardNo ?? "").replace(/\s+/g, " ").trim();
    if (no.length > CARD_NO_MAX) return { ok: false, field: "cardNo" };
    v.cardNo = no;
  }
  if (input.discountPct !== undefined) {
    const pct = input.discountPct;
    if (typeof pct !== "number" || !Number.isInteger(pct) || pct < 0 || pct > 100) return { ok: false, field: "discount" };
    v.discountPct = pct;
  }
  if (input.noOnline !== undefined) v.noOnline = input.noOnline === true;
  if (input.marketingOptOut !== undefined) v.marketingOptOut = input.marketingOptOut === true;
  if (input.pushOptOut !== undefined) v.pushOptOut = input.pushOptOut === true;
  if (input.notifyOff !== undefined) {
    const off = input.notifyOff;
    if (!Array.isArray(off) || !off.every(isClientKind)) return { ok: false, field: "notify" };
    // in the list's own order, each once
    v.notifyOff = CLIENT_KINDS.filter((k) => off.includes(k));
  }
  return { ok: true, v };
}

type Stored = {
  name: string;
  phone_e164: string | null;
  email: string | null;
  locale: string;
  staff_note: string;
  labels: string[];
  sms_opt_out: boolean;
  email_opt_out: boolean;
  phone2_e164: string | null;
  birth_day: number | null;
  birth_month: number | null;
  birth_year: number | null;
  gender: string | null;
  importance: string | null;
  card_no: string;
  discount_pct: number;
  no_online: boolean;
  marketing_opt_out: boolean;
  push_opt_out: boolean;
  notify_off: string[];
};
/** The columns that are lists: «none» is an empty one. */
const LISTS = new Set<keyof Stored>(["labels", "notify_off"]);

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
export async function saveClient(business: Business, id: string | null, input: ClientInput, actor: string, now = Date.now(), who?: Holder): Promise<ClientSaved> {
  if (id !== null && !isUuid(id)) return { ok: false, field: "id" };
  if (who && id !== null && !(await clientSeen(query, business.id, who, id))) return { ok: false, field: "id" };
  // the client who holds a phone is named (for the link to his card) only to a login that may see him;
  // to the others the answer is just «this phone is taken», with no id
  // (asked on the connection the caller is on: inside a transaction, on the transaction)
  const named = async (q: Querier, other: string): Promise<{ clientId?: string }> => (!who || (await clientSeen(q, business.id, who, other)) ? { clientId: other } : {});
  // a login that sees the phones and the e-mail masked sends them back masked: they stay as they are
  const asked: ClientInput = who && id !== null && !can(who, "clients.card_contacts") ? { ...(input ?? {}), phone: undefined, phone2: undefined, email: undefined } : (input ?? {});
  const c = clean(asked, id === null, todayIn(business.timezone, now));
  if (!c.ok) return c;
  const v = c.v;
  /** A category nobody has yet is «Настройка списка категорий клиентов». */
  const newLabels = async (tx: Querier, labels: string[] | undefined, had: string[]) => {
    if (!who || !labels?.length || can(who, "settings.categories")) return false;
    const used = new Set([...(await clientLabels(tx, business.id)), ...had].map((l) => l.toLocaleLowerCase()));
    return labels.some((l) => !used.has(l.toLocaleLowerCase()));
  };
  const run = () =>
    withTx<ClientSaved>(async (tx) => {
      if (id === null) {
        if (who && (!can(who, "clients.edit") || (v.note && !can(who, "clients.note.edit")) || (await newLabels(tx, v.labels, [])))) return { ok: false, field: "forbidden" };
        if (v.phone) {
          const other = await phoneHolder(tx, business.id, v.phone, null);
          if (other) return { ok: false, field: "phoneTaken", ...(await named(tx, other)) };
        }
        const phone2 = v.phone2 && v.phone2 !== v.phone ? v.phone2 : null;
        const [row] = await tx<{ id: string }>(
          `insert into clients (business_id, name, phone_e164, email, locale, staff_note, labels, sms_opt_out, email_opt_out, source,
                                phone2_e164, birth_day, birth_month, birth_year, gender, importance, card_no, discount_pct,
                                no_online, marketing_opt_out, push_opt_out, notify_off)
           values ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, 'admin', $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::text[]) returning id`,
          [
            business.id,
            v.name,
            v.phone ?? null,
            v.email ?? null,
            v.locale ?? (isLocale(business.default_locale) ? business.default_locale : "ru"),
            v.note ?? "",
            v.labels ?? [],
            v.smsOptOut ?? false,
            v.emailOptOut ?? false,
            phone2,
            v.birthday?.day ?? null,
            v.birthday?.month ?? null,
            v.birthday?.year ?? null,
            v.gender ?? null,
            v.importance ?? null,
            v.cardNo ?? "",
            v.discountPct ?? 0,
            v.noOnline ?? false,
            v.marketingOptOut ?? false,
            v.pushOptOut ?? false,
            v.notifyOff ?? [],
          ],
        );
        await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'client', $2, 'create', $3::jsonb)`, [actor, row.id, JSON.stringify({ by: "admin", source: "admin" })]);
        return { ok: true, id: row.id };
      }
      const [cur] = await tx<Stored>(
        `select name, phone_e164, email, locale, staff_note, labels, sms_opt_out, email_opt_out,
                phone2_e164, birth_day, birth_month, birth_year, gender, importance, card_no, discount_pct,
                no_online, marketing_opt_out, push_opt_out, notify_off
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
        phone2_e164: v.phone2 === undefined ? cur.phone2_e164 : v.phone2,
        birth_day: v.birthday === undefined ? cur.birth_day : (v.birthday?.day ?? null),
        birth_month: v.birthday === undefined ? cur.birth_month : (v.birthday?.month ?? null),
        birth_year: v.birthday === undefined ? cur.birth_year : (v.birthday?.year ?? null),
        gender: v.gender === undefined ? cur.gender : v.gender,
        importance: v.importance === undefined ? cur.importance : v.importance,
        card_no: v.cardNo ?? cur.card_no,
        discount_pct: v.discountPct ?? cur.discount_pct,
        no_online: v.noOnline ?? cur.no_online,
        marketing_opt_out: v.marketingOptOut ?? cur.marketing_opt_out,
        push_opt_out: v.pushOptOut ?? cur.push_opt_out,
        notify_off: v.notifyOff ?? cur.notify_off ?? [],
      };
      // his second phone is another number than his first
      if (next.phone2_e164 && next.phone2_e164 === next.phone_e164) next.phone2_e164 = null;
      const changed = (Object.keys(next) as (keyof Stored)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(cur[k] ?? (LISTS.has(k) ? [] : null)));
      if (!changed.length) return { ok: true, id };
      if (who) {
        // the note has its own right; everything else on the card is «Редактировать данные клиента»
        if (changed.includes("staff_note") && !can(who, "clients.note.edit")) return { ok: false, field: "forbidden" };
        if (changed.some((k) => k !== "staff_note") && !can(who, "clients.edit")) return { ok: false, field: "forbidden" };
        if (changed.includes("labels") && (await newLabels(tx, next.labels, cur.labels ?? []))) return { ok: false, field: "forbidden" };
      }
      if (next.phone_e164 && next.phone_e164 !== cur.phone_e164) {
        const other = await phoneHolder(tx, business.id, next.phone_e164, id);
        if (other) return { ok: false, field: "phoneTaken", ...(await named(tx, other)) };
      }
      await tx(
        `update clients set name = $2, phone_e164 = $3, email = $4, locale = $5, staff_note = $6, labels = $7::text[],
                sms_opt_out = $8, email_opt_out = $9, phone2_e164 = $10, birth_day = $11, birth_month = $12, birth_year = $13,
                gender = $14, importance = $15, card_no = $16, discount_pct = $17, no_online = $18, marketing_opt_out = $19,
                push_opt_out = $20, notify_off = $21::text[], updated_at = now()
          where id = $1`,
        [
          id,
          next.name,
          next.phone_e164,
          next.email,
          next.locale,
          next.staff_note,
          next.labels,
          next.sms_opt_out,
          next.email_opt_out,
          next.phone2_e164,
          next.birth_day,
          next.birth_month,
          next.birth_year,
          next.gender,
          next.importance,
          next.card_no,
          next.discount_pct,
          next.no_online,
          next.marketing_opt_out,
          next.push_opt_out,
          next.notify_off,
        ],
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
      return { ok: false, field: "phoneTaken", ...(other ? await named(query, other) : {}) };
    }
    throw err;
  }
}

/** `has_history`: he has visits, purchases, or another client merged into him; his history stays, so he stays. `forbidden`: no right to delete clients. */
export type ClientDeleted = { ok: true } | { ok: false; code: "not_found" | "has_history" | "forbidden" };

/**
 * Delete a client: only one with no history. A visit is never deleted
 * (001), cancelled ones included, and each names its client; so does a
 * product sale that named him (017). Such a client is refused, plainly:
 * he stays in the base with his history. His comments, files and photo go
 * with him; a message that was written to him stays in the outbox without
 * his name on it. The audit row says who deleted, never whom by name.
 */
export async function deleteClient(business: Business, id: string, actor: string, who?: Holder): Promise<ClientDeleted> {
  if (!isUuid(id)) return { ok: false, code: "not_found" };
  if (who && !can(who, "clients.delete")) return { ok: false, code: "forbidden" };
  if (who && !(await clientSeen(query, business.id, who, id))) return { ok: false, code: "not_found" };
  try {
    return await withTx<ClientDeleted>(async (tx) => {
      const [c] = await tx<{ id: string }>("select id from clients where id = $1 and business_id = $2 and merged_into is null for update", [id, business.id]);
      if (!c) return { ok: false, code: "not_found" };
      const [used] = await tx<{ n: number }>(
        `select (select count(*) from appointments where client_id = $1)::int
              + (select count(*) from product_sales where client_id = $1)::int
              + (select count(*) from clients where merged_into = $1)::int as n`,
        [id],
      );
      if (used.n > 0) return { ok: false, code: "has_history" };
      await tx("delete from clients where id = $1", [id]);
      await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'client', $2, 'delete', $3::jsonb)`, [actor, id, JSON.stringify({ by: "admin" })]);
      return { ok: true };
    });
  } catch (err) {
    // a visit booked for him while he was being deleted: the database's own reference refused
    if (pgCode(err) === "23503") return { ok: false, code: "has_history" };
    throw err;
  }
}
