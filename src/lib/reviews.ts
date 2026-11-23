/**
 * The clients' reviews (reviews, migration 023; Dim, 20.11.2026: «Import
 * now, show ★ on the booking page»).
 *
 *   staffRatings   each barber's average and count, over the reviews that
 *                  are not hidden: the booking page's stars (catalog.ts).
 *   salonReviewCount, salonReviews  every review on show, the barbers'
 *                  and the salon's own: the count, the average and the
 *                  list on the salon's page («REMPIRE ▾»,
 *                  /api/salon/reviews), as the widget we follow counts
 *                  them (Dim, round 12: «all reviews»).
 *   listReviews   the admin's «Отзывы», as the tool we follow has its
 *                  reviews report: date, client, barber, stars, text.
 *   setReviewHidden  takes one off the booking page or puts it back; a new
 *                  one from the site is approved or turned down by it.
 *   submitReview  a client's own review from the salon's page («Оцените и
 *                  напишите отзыв»; migration 035): checked, limited per
 *                  address and per day, and kept waiting (pending, hidden)
 *                  until the salon approves it. Each one is told by push
 *                  («Новый отзыв», own_review; Dim, round 13) to the
 *                  logins that see «Отзывы», each as he has it switched.
 *   importReviews  the Altegio export, read by scripts/import-reviews.ts:
 *                  an upsert by each review's own key, so a second run of
 *                  the same file changes nothing.
 *
 * Rights (src/lib/auth/rights.ts): «Просматривать отзывы» (reports.reviews)
 * lists them; «Удалять отзывы» (reports.reviews.delete) hides and shows
 * them, as the tool's «Удалить» takes one off its widget, and approves the
 * new ones. The phone of a linked client only with the client base's
 * «contacts in the list».
 *
 * No Next.js here: the pages, the script and the tests call the same code.
 */
import { createHash, createHmac } from "node:crypto";
import type { Business } from "./availability";
import type { Querier } from "./db";
import { can, maskPhone, seenStaff, type Holder } from "./auth/rights";
import { seenClientsSql } from "./admin/client-scope";
import { REVIEW_COMPANY, type ReviewFilter } from "./admin/review-filter";
import { normalizePhone } from "./phone";
import { queuePush } from "./push";
import { loadHolder } from "./auth/rights-store";
import { addDays, isLocalDate, todayIn, zonedToUtc } from "./tz";

/* ---------- the booking page's stars ---------- */

export type StaffRating = { rating: number; count: number };

/** Each barber with at least one review shown: his average (two decimals) and how many. A barber with none is not in the map. */
export async function staffRatings(q: Querier, businessId: string): Promise<Map<string, StaffRating>> {
  const rows = await q<{ staff_id: string; rating: string; n: number }>(
    `select staff_id, round(avg(rating), 2)::text as rating, count(*)::int as n
       from reviews
      where business_id = $1 and staff_id is not null and not hidden
      group by staff_id`,
    [businessId],
  );
  return new Map(rows.map((r) => [r.staff_id, { rating: Number(r.rating), count: Number(r.n) }]));
}

/* ---------- the salon's own page ---------- */

/**
 * One review as the salon's page on the booking site shows it: the name as
 * the review was signed, the stars, the text, when, and the barber it is
 * about (null: the salon itself). Public: no client card, no phone.
 */
export type SalonReview = { id: string; at: number; rating: number; body: string; name: string; staff: string | null };

/** How many reviews are on show, the barbers' and the salon's own: «★ 51 отзыв» on its page (catalog.ts). */
export async function salonReviewCount(q: Querier, businessId: string): Promise<number> {
  return (await salonRating(q, businessId)).count;
}

/**
 * Every review on show, the barbers' and the salon's own, as the widget we
 * follow counts them (Dim, round 12): how many, and their average (two
 * decimals; null with none). «4,9 ★ · 51 отзыв» on its page.
 */
export async function salonRating(q: Querier, businessId: string): Promise<{ count: number; rating: number | null }> {
  const [row] = await q<{ n: number; avg: string | null }>(
    "select count(*)::int as n, round(avg(rating), 2)::text as avg from reviews where business_id = $1 and not hidden",
    [businessId],
  );
  return { count: Number(row?.n ?? 0), rating: row?.avg == null ? null : Number(row.avg) };
}

const SALON_PAGE = 6;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The reviews on show, the barbers' and the salon's own, newest first, `limit` at a time (6,
 * as the widget shows them; 1 to 50). `before` is the id of the last one
 * given: the page goes on after it («Ещё отзывы»). `more` says whether
 * there are any after these. An id that is not one gives nothing.
 */
export async function salonReviews(
  q: Querier,
  businessId: string,
  opts: { limit?: number; before?: string | null } = {},
): Promise<{ rows: SalonReview[]; more: boolean }> {
  const limit = Math.min(Math.max(Math.trunc(Number(opts.limit) || SALON_PAGE), 1), 50);
  const params: unknown[] = [businessId, limit + 1];
  let after = "";
  if (opts.before != null) {
    if (!UUID.test(opts.before)) return { rows: [], more: false };
    params.push(opts.before);
    // the order's own key, read from the review itself: two at the same moment keep their order
    after = " and (r.created_at, r.id) < (select b.created_at, b.id from reviews b where b.id = $3 and b.business_id = $1)";
  }
  const rows = await q<{ id: string; created_at: Date | string; rating: number; body: string; author_name: string; staff: string | null }>(
    `select r.id, r.created_at, r.rating, r.body, r.author_name, s.display_name as staff
       from reviews r left join staff s on s.id = r.staff_id
      where r.business_id = $1 and not r.hidden${after}
      order by r.created_at desc, r.id desc
      limit $2`,
    params,
  );
  return {
    rows: rows.slice(0, limit).map((r) => ({ id: r.id, at: new Date(r.created_at).getTime(), rating: Number(r.rating), body: r.body, name: r.author_name, staff: r.staff ?? null })),
    more: rows.length > limit,
  };
}

/* ---------- a client's own review, from the salon's page ---------- */

/** What one review may hold; the sheet's fields say the same (src/app/[locale]/salon-review.tsx). */
export const REVIEW_MAX = { name: 60, body: 1000 } as const;
/**
 * How many reviews may come: from one address three an hour and five a
 * day; from the whole site fifty a day, so no crowd of addresses can bury
 * the salon's list.
 */
export const REVIEW_LIMITS = { perHour: 3, perDay: 5, siteDay: 50 } as const;
/** Sent faster than this after the sheet opened: no person writes a review so fast. */
export const REVIEW_MIN_MS = 2500;
/** How long an address's hash is kept for the limit. */
const HASH_KEEP_MS = 2 * 24 * 60 * 60 * 1000;

/** What the salon's page sends: every field as typed. `website` is the field no person sees; `ms` how long the sheet was open. */
export type ReviewInput = { rating?: unknown; staffId?: unknown; name?: unknown; text?: unknown; website?: unknown; ms?: unknown };
export type CleanReview = { rating: number; staffId: string | null; name: string; body: string };
export type ReviewField = "rating" | "staff" | "name" | "text" | "link";
export type ReviewSent = { ok: true } | { ok: false; code: "invalid"; field: ReviewField } | { ok: false; code: "too_many" };

/* control characters out; a line break kept only in the text */
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;
/** A link or an address of a site: «https://…», «www.…», «name.com». Spam is links; a review needs none. */
const LINK = /(?:https?:\/\/|www\.|\b[a-z0-9-]{2,63}\.(?:com|net|org|info|biz|ru|ee|io|me|xyz|top|site|online|shop|club|pro|link|click)\b)/i;

/**
 * The review as it will be kept, or the first field that is wrong: 1 to 5
 * whole stars; the barber's id, or nobody for the salon itself; a name of 1
 * to 60 with a letter in it, on one line; a text of up to 1000, its
 * paragraphs kept. No links in either.
 */
export function cleanReviewInput(input: unknown): { ok: true; value: CleanReview } | { ok: false; field: ReviewField } {
  const o = (input && typeof input === "object" ? input : {}) as ReviewInput;
  const rating = typeof o.rating === "number" ? o.rating : typeof o.rating === "string" && /^[1-5]$/.test(o.rating.trim()) ? Number(o.rating) : NaN;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, field: "rating" };
  const who = typeof o.staffId === "string" ? o.staffId.trim() : "";
  if (o.staffId != null && typeof o.staffId !== "string") return { ok: false, field: "staff" };
  if (who && who !== "salon" && !UUID.test(who)) return { ok: false, field: "staff" };
  const name = (typeof o.name === "string" ? o.name : "").normalize("NFC").replace(CTRL, " ").replace(/\s+/g, " ").trim();
  if (!name || [...name].length > REVIEW_MAX.name || !/\p{L}/u.test(name)) return { ok: false, field: "name" };
  const body = (typeof o.text === "string" ? o.text : "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(CTRL, "")
    .replace(/[  ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if ([...body].length > REVIEW_MAX.body) return { ok: false, field: "text" };
  if (LINK.test(name) || LINK.test(body)) return { ok: false, field: "link" };
  return { ok: true, value: { rating, staffId: who && who !== "salon" ? who : null, name, body } };
}

/**
 * The address, unreadable: an HMAC of it and the salon's day, keyed with
 * the database's own random key (review_salt, migration 035). The same
 * address gives one hash a day, so a day's reviews can be counted, and
 * another the next day.
 */
async function addressHash(q: Querier, ip: string, day: string): Promise<string> {
  const [row] = await q<{ salt: string }>("select salt from review_salt limit 1");
  if (!row) throw new Error("review_salt is empty: migration 035 makes it");
  return createHmac("sha256", row.salt).update(`${day}\n${ip.trim().toLowerCase()}`).digest("hex");
}

/**
 * A client's review from the salon's page: kept waiting for the salon
 * (pending and hidden, source «ours»), never shown or counted before it is
 * approved in «Отзывы».
 *
 * A bot is told «thank you» and nothing is written: the field no person
 * sees has something in it, or the sheet was sent within REVIEW_MIN_MS of
 * opening. Then the fields (cleanReviewInput), the barber (one of this
 * salon's, active and bookable), and the limits (REVIEW_LIMITS): «too_many»
 * once they are reached. The sender's address is kept only as a hash, two
 * days; older hashes are cleared on the way.
 */
export async function submitReview(q: Querier, business: Pick<Business, "id" | "timezone">, input: ReviewInput, ctx: { ip: string; now?: number }): Promise<ReviewSent> {
  const o = (input && typeof input === "object" ? input : {}) as ReviewInput;
  if ((typeof o.website === "string" && o.website.trim()) || (typeof o.ms === "number" && o.ms < REVIEW_MIN_MS)) return { ok: true };
  const c = cleanReviewInput(o);
  if (!c.ok) return { ok: false, code: "invalid", field: c.field };
  const v = c.value;
  if (v.staffId) {
    const [s] = await q("select id from staff where id = $1 and business_id = $2 and active and bookable", [v.staffId, business.id]);
    if (!s) return { ok: false, code: "invalid", field: "staff" };
  }
  const now = ctx.now ?? Date.now();
  const at = (ms: number) => new Date(ms).toISOString();
  await q("update reviews set ip_hash = null where ip_hash is not null and created_at < $1::timestamptz", [at(now - HASH_KEEP_MS)]);
  const hash = await addressHash(q, ctx.ip, todayIn(business.timezone, now));
  const [n] = await q<{ hour: number; day: number; site: number }>(
    `select count(*) filter (where ip_hash = $2 and created_at > $3::timestamptz)::int as hour,
            count(*) filter (where ip_hash = $2)::int as day,
            count(*)::int as site
       from reviews
      where business_id = $1 and source = 'ours' and created_at > $4::timestamptz`,
    [business.id, hash, at(now - 60 * 60 * 1000), at(now - 24 * 60 * 60 * 1000)],
  );
  if (n && (n.hour >= REVIEW_LIMITS.perHour || n.day >= REVIEW_LIMITS.perDay || n.site >= REVIEW_LIMITS.siteDay)) return { ok: false, code: "too_many" };
  const [made] = await q<{ id: string; staff: string | null }>(
    `insert into reviews (business_id, rating, body, author_name, staff_id, created_at, source, hidden, pending, ip_hash)
     values ($1, $2, $3, $4, $5, $6::timestamptz, 'ours', true, true, $7)
     returning id, (select display_name from staff where id = $5) as staff`,
    [business.id, v.rating, v.body, v.name, v.staffId, at(now), hash],
  );
  if (made) await tellNewReview(q, business.id, { reviewId: made.id, rating: v.rating, staff: made.staff ?? null }, now);
  return { ok: true };
}

/**
 * «Новый отзыв» (own_review): a push to each login of the salon that sees
 * «Отзывы» («Просматривать отзывы»), where the new one waits for its OK.
 * Each login's own switch decides on top (on unless he turned it off), and
 * the salon's in «Уведомления» when it goes. Never the review's words: a
 * lock screen is public. A push that cannot be queued loses nothing: the
 * review is kept and «Отзывы» shows it.
 */
async function tellNewReview(q: Querier, businessId: string, payload: { reviewId: string; rating: number; staff: string | null }, now: number): Promise<number> {
  try {
    const logins = await q<{ id: string }>("select id from users where business_id = $1 and active and role in ('owner', 'admin')", [businessId]);
    const may: string[] = [];
    for (const u of logins) {
      const h = await loadHolder(q, businessId, u.id);
      if (h && can(h, "reports.reviews")) may.push(u.id);
    }
    if (!may.length) return 0;
    return await queuePush(q, { businessId, kind: "own_review", to: "owners", onlyUserIds: may, payload, now });
  } catch {
    return 0;
  }
}

/* ---------- the admin's list ---------- */

export type ReviewRow = {
  id: string;
  /** when the client left it, ms */
  createdAt: number;
  rating: number;
  body: string;
  /** the name as the review shows it */
  authorName: string;
  /** the client's card, when he is known */
  clientId: string | null;
  /** the card's phone: masked without the right to contacts */
  clientPhone: string | null;
  /** null: «О компании» */
  staffId: string | null;
  staffName: string | null;
  staffPhoto: string | null;
  source: "altegio" | "ours";
  hidden: boolean;
  /** sent from the site and not looked at yet: hidden until approved (migration 035) */
  pending: boolean;
};

export type ReviewList = {
  total: number;
  page: number;
  pages: number;
  /** the average of what was found, hidden ones included; null when nothing was */
  average: number | null;
  rows: ReviewRow[];
  /** the new ones waiting for the salon, whatever the filter: «2 новых отзыва ждут проверки» */
  waiting: number;
};

export type ReviewsMay = { open: boolean; hide: boolean; phones: boolean };

export function reviewsMay(who: Holder | null | undefined): ReviewsMay {
  const open = can(who, "reports.reviews");
  return { open, hide: open && can(who, "reports.reviews.delete"), phones: open && can(who, "clients.list_contacts") };
}

const NONE: ReviewList = { total: 0, page: 1, pages: 0, average: null, rows: [], waiting: 0 };

/** One page of the list for this filter, newest first. `who` null: no cut (the tests, the script). */
/**
 * A WHERE part over `reviews r` for the barbers a login sees, as the other
 * reports have it: empty for «all», else only those barbers' reviews (a
 * review of the salon itself belongs to no barber, so a limited login does
 * not get it).
 */
function seenReviewsSql(who: Holder | null | undefined, p: (value: unknown) => string): string {
  const seen = who ? seenStaff(who) : "all";
  if (seen === "all") return "";
  if (!seen.length) return " and false";
  return ` and r.staff_id = any(${p([...seen])}::uuid[])`;
}

export async function listReviews(q: Querier, business: Pick<Business, "id" | "timezone">, f: ReviewFilter, who: Holder | null = null): Promise<ReviewList> {
  if (who && !can(who, "reports.reviews")) return NONE;
  const params: unknown[] = [business.id];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  let where = "r.business_id = $1";
  if (f.from) where += ` and r.created_at >= ${p(new Date(zonedToUtc(f.from, "00:00", business.timezone)).toISOString())}::timestamptz`;
  if (f.to) where += ` and r.created_at < ${p(new Date(zonedToUtc(addDays(f.to, 1), "00:00", business.timezone)).toISOString())}::timestamptz`;
  if (f.staffId === REVIEW_COMPANY) where += " and r.staff_id is null";
  else if (f.staffId) where += ` and r.staff_id = ${p(f.staffId)}::uuid`;
  if (f.rating) where += ` and r.rating = ${p(f.rating)}`;
  if (f.shown === "shown") where += " and not r.hidden";
  else if (f.shown === "hidden") where += " and r.hidden and not r.pending";
  else if (f.shown === "pending") where += " and r.pending";
  const seen = seenReviewsSql(who, p);
  where += seen;

  const [head] = await q<{ n: number; avg: string | null; waiting: number }>(
    `select count(*)::int as n, round(avg(r.rating), 2)::text as avg,
            (select count(*)::int from reviews r where r.business_id = $1 and r.pending${seen}) as waiting
       from reviews r where ${where}`,
    params,
  );
  const total = Number(head?.n ?? 0);
  const waiting = Number(head?.waiting ?? 0);
  if (!total) return { ...NONE, page: f.page, waiting };
  const pages = Math.ceil(total / f.size);
  const page = Math.min(f.page, pages);
  const rows = await q<{
    id: string;
    created_at: Date | string;
    rating: number;
    body: string;
    author_name: string;
    client_id: string | null;
    phone_e164: string | null;
    staff_id: string | null;
    display_name: string | null;
    photo_url: string | null;
    source: "altegio" | "ours";
    hidden: boolean;
    pending: boolean;
    client_seen: boolean;
  }>(
    `select r.id, r.created_at, r.rating, r.body, r.author_name, r.client_id, c.phone_e164,
            (c.id is not null${seenClientsSql(who, p)}) as client_seen,
            r.staff_id, s.display_name, s.photo_url, r.source, r.hidden, r.pending
       from reviews r
       left join clients c on c.id = r.client_id
       left join staff s on s.id = r.staff_id
      where ${where}
      order by r.pending desc, r.created_at desc, r.id
      limit ${p(f.size)} offset ${p((page - 1) * f.size)}`,
    params,
  );
  const phones = !who || can(who, "clients.list_contacts");
  return {
    total,
    page,
    pages,
    average: head?.avg == null ? null : Number(head.avg),
    waiting,
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: new Date(r.created_at).getTime(),
      rating: Number(r.rating),
      body: r.body,
      authorName: r.author_name,
      // a client the login does not see: the name the review was signed with, no card and no phone
      clientId: r.client_seen ? r.client_id : null,
      clientPhone: !r.client_seen ? null : phones ? r.phone_e164 : maskPhone(r.phone_e164),
      staffId: r.staff_id,
      staffName: r.display_name,
      staffPhoto: r.photo_url,
      source: r.source,
      hidden: r.hidden,
      pending: r.pending,
    })),
  };
}

export type ReviewHidden = { ok: true; hidden: boolean } | { ok: false; code: "forbidden" | "not_found" };

/**
 * «Скрыть» / «Показать»: off the booking page or back on it. Every change is
 * an audit row. A new review from the site (pending) is looked at by the
 * same tap: «Показать» approves it («approve»), «Скрыть» turns it down
 * («decline»); either way it is no longer new.
 */
export async function setReviewHidden(q: Querier, businessId: string, who: Holder & { id?: string }, id: string, hidden: boolean): Promise<ReviewHidden> {
  if (!can(who, "reports.reviews") || !can(who, "reports.reviews.delete")) return { ok: false, code: "forbidden" };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, code: "not_found" };
  const params: unknown[] = [id, businessId, hidden === true];
  const scope = seenReviewsSql(who, (v) => {
    params.push(v);
    return `$${params.length}`;
  });
  const [row] = await q<{ hidden: boolean; was: boolean; waited: boolean }>(
    `with old as (select r.id, r.hidden, r.pending from reviews r where r.id = $1 and r.business_id = $2${scope} for update)
     update reviews r set hidden = $3, pending = false,
            updated_at = case when old.hidden = $3 and not old.pending then r.updated_at else now() end
       from old where r.id = old.id
     returning r.hidden, old.hidden as was, old.pending as waited`,
    params,
  );
  if (!row) return { ok: false, code: "not_found" };
  if (row.was !== row.hidden || row.waited) {
    await q(`insert into audit (actor, entity, entity_id, action, before, after) values ($1, 'review', $2, $3, $4::jsonb, $5::jsonb)`, [
      who.id ?? "admin",
      id,
      row.waited ? (row.hidden ? "decline" : "approve") : row.hidden ? "hide" : "show",
      JSON.stringify(row.waited ? { hidden: row.was, pending: true } : { hidden: row.was }),
      JSON.stringify(row.waited ? { hidden: row.hidden, pending: false } : { hidden: row.hidden }),
    ]);
  }
  return { ok: true, hidden: row.hidden };
}

/* ---------- the import ---------- */

/**
 * One review as the import file has it (scripts/import-reviews.ts):
 *   date    «2026-11-20», «2026-11-20 14:32», «20.11.2026», «20.11.2026 14:32»
 *           (the salon's own clock), or a full ISO moment with its offset;
 *   rating  1 to 5;
 *   text    what the client wrote (may be empty);
 *   name    the name the review shows;
 *   barber  the barber's name as Altegio writes it; empty or «О компании»
 *           for a review about the salon;
 *   phone   the client's phone, when the export has it: links his card.
 */
export type ReviewImportItem = {
  date: string;
  rating: number | string;
  text?: string | null;
  name?: string | null;
  barber?: string | null;
  phone?: string | null;
};

export type ReviewImportReport = {
  read: number;
  inserted: number;
  updated: number;
  unchanged: number;
  /** the item's place in the file (from 0) and why it was left out */
  skipped: { at: number; why: string }[];
  /** a barber's name that matched nobody, and how many reviews had it: imported as «О компании» until he is found */
  staffMissed: Record<string, number>;
  /** reviews linked to a client's card by phone */
  clientsFound: number;
  /** a phone given that matched no card */
  phonesMissed: number;
  /** reviews about the salon itself (no barber named) */
  company: number;
};

const COMPANY_WORDS = new Set(["", "о компании", "компания", "company", "about the company", "ettevõttest", "ettevõte", "rempire"]);

/** Lower case, no accents, single spaces: «Slava  Krasytel» and «slava krasytel» are one. */
export function nameKey(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The barber a name in the export stands for: his whole name first, else
 * his first name or his slug when only one barber has it («Valentin
 * Nachinov» is our «Valentin»). Null: nobody, or more than one.
 */
export function matchStaff(barber: string, staff: readonly { id: string; slug: string; display_name: string }[]): string | null {
  const want = nameKey(barber);
  if (!want) return null;
  const whole = staff.filter((s) => nameKey(s.display_name) === want);
  if (whole.length === 1) return whole[0].id;
  const first = want.split(" ")[0];
  const byFirst = staff.filter((s) => nameKey(s.display_name).split(" ")[0] === first || nameKey(s.slug) === first);
  return byFirst.length === 1 ? byFirst[0].id : null;
}

/**
 * The date as the salon's clock had it, and the moment: «20.11.2026 14:32»
 * → { key: "2026-11-20T14:32", at }. A day with no time is noon, so no time
 * zone can move it to another day. Null: not a date we read.
 */
export function readReviewDate(input: unknown, tz: string): { key: string; at: number } | null {
  const s = typeof input === "string" ? input.trim() : "";
  if (!s) return null;
  let date: string | null = null;
  let time: string | null = null;
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/.exec(s);
  if (m) {
    date = `${m[1]}-${m[2]}-${m[3]}`;
    if (m[4]) time = `${m[4].padStart(2, "0")}:${m[5]}`;
  } else if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::\d{2})?)?$/.exec(s))) {
    date = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (m[4]) time = `${m[4].padStart(2, "0")}:${m[5]}`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const at = Date.parse(s);
    return Number.isFinite(at) ? { key: new Date(at).toISOString(), at } : null;
  }
  if (!date || !isLocalDate(date)) return null;
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  return { key: time ? `${date}T${time}` : date, at: zonedToUtc(date, time ?? "12:00", tz) };
}

const clean = (v: unknown) => (typeof v === "string" ? v.normalize("NFC").replace(/\r\n?/g, "\n").trim() : "");

/** An imported review's own key: its date, name and text, hashed. The same review in a later export has the same key. */
export function reviewRef(dateKey: string, name: string, text: string): string {
  return createHash("sha256").update(`${dateKey}\n${clean(name)}\n${clean(text)}`).digest("hex");
}

/** A name as staging shows clients (Dim, 19.11.2026: masked until the move to rempire.ee): its first letter and a dot, «Кирилл» → «К.». */
export function maskName(name: string): string {
  const first = [...clean(name)][0];
  return first ? `${first.toLocaleUpperCase()}.` : "";
}

export type ReviewImportOptions = {
  /**
   * On unless asked otherwise: the author's name is kept as its first
   * letter and a dot. The key is always made from the name as written, so
   * the real import at the move updates the same rows with the whole names.
   */
  mask?: boolean;
};

/**
 * Write the file's reviews: each one inserted, or updated in place when its
 * key is already there. A hidden review stays hidden. A phone only finds
 * the client's card; it is never written. Run it in one transaction
 * (withTx): the script does.
 */
export async function importReviews(q: Querier, business: Pick<Business, "id" | "timezone">, items: unknown, opts: ReviewImportOptions = {}): Promise<ReviewImportReport> {
  const mask = opts.mask !== false;
  const report: ReviewImportReport = { read: 0, inserted: 0, updated: 0, unchanged: 0, skipped: [], staffMissed: {}, clientsFound: 0, phonesMissed: 0, company: 0 };
  if (!Array.isArray(items)) throw new Error("The file must hold a JSON array of reviews.");
  report.read = items.length;
  const staff = await q<{ id: string; slug: string; display_name: string }>("select id, slug, display_name from staff where business_id = $1", [business.id]);
  const seen = new Set<string>();

  for (let at = 0; at < items.length; at++) {
    const raw = items[at];
    const skip = (why: string) => report.skipped.push({ at, why });
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      skip("not an object");
      continue;
    }
    const it = raw as Partial<ReviewImportItem>;
    const rating = typeof it.rating === "number" ? it.rating : typeof it.rating === "string" && it.rating.trim() ? Number(it.rating.trim().replace(",", ".")) : NaN;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      skip("rating must be a whole number from 1 to 5");
      continue;
    }
    const when = readReviewDate(it.date, business.timezone);
    if (!when) {
      skip("date not understood");
      continue;
    }
    const name = clean(it.name);
    const text = clean(it.text);
    if (name.length > 120) {
      skip("name longer than 120 characters");
      continue;
    }
    if (text.length > 4000) {
      skip("text longer than 4000 characters");
      continue;
    }
    const ref = reviewRef(when.key, name, text);
    if (seen.has(ref)) {
      skip("the same review twice in the file");
      continue;
    }
    seen.add(ref);

    const barber = clean(it.barber);
    let staffId: string | null = null;
    if (COMPANY_WORDS.has(nameKey(barber))) report.company++;
    else {
      staffId = matchStaff(barber, staff);
      if (!staffId) report.staffMissed[barber] = (report.staffMissed[barber] ?? 0) + 1;
    }

    let clientId: string | null = null;
    const phone = clean(it.phone);
    if (phone) {
      const e164 = normalizePhone(phone);
      const [c] = e164 ? await q<{ id: string }>("select coalesce(merged_into, id) as id from clients where business_id = $1 and phone_e164 = $2", [business.id, e164]) : [];
      if (c) {
        clientId = c.id;
        report.clientsFound++;
      } else report.phonesMissed++;
    }

    const [row] = await q<{ inserted: boolean }>(
      `insert into reviews (business_id, rating, body, author_name, client_id, staff_id, created_at, source, source_ref)
       values ($1, $2, $3, $4, $5, $6, $7::timestamptz, 'altegio', $8)
       on conflict (business_id, source, source_ref) do update
          set rating = excluded.rating, body = excluded.body, author_name = excluded.author_name,
              client_id = coalesce(excluded.client_id, reviews.client_id), staff_id = excluded.staff_id,
              created_at = excluded.created_at, updated_at = now()
        where (reviews.rating, reviews.body, reviews.author_name, reviews.staff_id, reviews.created_at, reviews.client_id)
              is distinct from
              (excluded.rating, excluded.body, excluded.author_name, excluded.staff_id, excluded.created_at, coalesce(excluded.client_id, reviews.client_id))
       returning (xmax = 0) as inserted`,
      [business.id, rating, text, mask ? maskName(name) : name, clientId, staffId, new Date(when.at).toISOString(), ref],
    );
    if (!row) report.unchanged++;
    else if (row.inserted) report.inserted++;
    else report.updated++;
  }
  return report;
}
