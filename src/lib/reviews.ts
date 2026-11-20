/**
 * The clients' reviews (reviews, migration 023; Dim, 20.11.2026: «Import
 * now, show ★ on the booking page»).
 *
 *   staffRatings   each barber's average and count, over the reviews that
 *                  are not hidden: the booking page's stars (catalog.ts).
 *   salonReviewCount, salonReviews  the reviews about the salon itself
 *                  (no barber) on show: the count and the list on the
 *                  salon's page («REMPIRE ▾», /api/salon/reviews).
 *   listReviews   the admin's «Отзывы», as the tool we follow has its
 *                  reviews report: date, client, barber, stars, text.
 *   setReviewHidden  takes one off the booking page or puts it back.
 *   importReviews  the Altegio export, read by scripts/import-reviews.ts:
 *                  an upsert by each review's own key, so a second run of
 *                  the same file changes nothing.
 *
 * Rights (src/lib/auth/rights.ts): «Просматривать отзывы» (reports.reviews)
 * lists them; «Удалять отзывы» (reports.reviews.delete) hides and shows
 * them, as the tool's «Удалить» takes one off its widget. The phone of a
 * linked client only with the client base's «contacts in the list».
 *
 * No Next.js here: the pages, the script and the tests call the same code.
 */
import { createHash } from "node:crypto";
import type { Business } from "./availability";
import type { Querier } from "./db";
import { can, maskPhone, seenStaff, type Holder } from "./auth/rights";
import { seenClientsSql } from "./admin/client-scope";
import { REVIEW_COMPANY, type ReviewFilter } from "./admin/review-filter";
import { normalizePhone } from "./phone";
import { addDays, isLocalDate, zonedToUtc } from "./tz";

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
 * One review about the salon itself (no barber), as its page on the booking
 * site shows it: the name as the review was signed, the stars, the text and
 * when. Public: no client card, no phone.
 */
export type SalonReview = { id: string; at: number; rating: number; body: string; name: string };

/** How many reviews about the salon itself are on show: «★ 7 отзывов» on its page (catalog.ts). */
export async function salonReviewCount(q: Querier, businessId: string): Promise<number> {
  const [row] = await q<{ n: number }>("select count(*)::int as n from reviews where business_id = $1 and staff_id is null and not hidden", [businessId]);
  return Number(row?.n ?? 0);
}

const SALON_PAGE = 6;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The reviews about the salon on show, newest first, `limit` at a time (6,
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
    after = " and (created_at, id) < (select b.created_at, b.id from reviews b where b.id = $3 and b.business_id = $1)";
  }
  const rows = await q<{ id: string; created_at: Date | string; rating: number; body: string; author_name: string }>(
    `select id, created_at, rating, body, author_name from reviews
      where business_id = $1 and staff_id is null and not hidden${after}
      order by created_at desc, id desc
      limit $2`,
    params,
  );
  return {
    rows: rows.slice(0, limit).map((r) => ({ id: r.id, at: new Date(r.created_at).getTime(), rating: Number(r.rating), body: r.body, name: r.author_name })),
    more: rows.length > limit,
  };
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
};

export type ReviewList = {
  total: number;
  page: number;
  pages: number;
  /** the average of what was found, hidden ones included; null when nothing was */
  average: number | null;
  rows: ReviewRow[];
};

export type ReviewsMay = { open: boolean; hide: boolean; phones: boolean };

export function reviewsMay(who: Holder | null | undefined): ReviewsMay {
  const open = can(who, "reports.reviews");
  return { open, hide: open && can(who, "reports.reviews.delete"), phones: open && can(who, "clients.list_contacts") };
}

const NONE: ReviewList = { total: 0, page: 1, pages: 0, average: null, rows: [] };

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
  else if (f.shown === "hidden") where += " and r.hidden";
  where += seenReviewsSql(who, p);

  const [head] = await q<{ n: number; avg: string | null }>(`select count(*)::int as n, round(avg(r.rating), 2)::text as avg from reviews r where ${where}`, params);
  const total = Number(head?.n ?? 0);
  if (!total) return { ...NONE, page: f.page };
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
    client_seen: boolean;
  }>(
    `select r.id, r.created_at, r.rating, r.body, r.author_name, r.client_id, c.phone_e164,
            (c.id is not null${seenClientsSql(who, p)}) as client_seen,
            r.staff_id, s.display_name, s.photo_url, r.source, r.hidden
       from reviews r
       left join clients c on c.id = r.client_id
       left join staff s on s.id = r.staff_id
      where ${where}
      order by r.created_at desc, r.id
      limit ${p(f.size)} offset ${p((page - 1) * f.size)}`,
    params,
  );
  const phones = !who || can(who, "clients.list_contacts");
  return {
    total,
    page,
    pages,
    average: head?.avg == null ? null : Number(head.avg),
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
    })),
  };
}

export type ReviewHidden = { ok: true; hidden: boolean } | { ok: false; code: "forbidden" | "not_found" };

/** «Скрыть» / «Показать»: off the booking page or back on it. Every change is an audit row. */
export async function setReviewHidden(q: Querier, businessId: string, who: Holder & { id?: string }, id: string, hidden: boolean): Promise<ReviewHidden> {
  if (!can(who, "reports.reviews") || !can(who, "reports.reviews.delete")) return { ok: false, code: "forbidden" };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, code: "not_found" };
  const params: unknown[] = [id, businessId, hidden === true];
  const scope = seenReviewsSql(who, (v) => {
    params.push(v);
    return `$${params.length}`;
  });
  const [row] = await q<{ hidden: boolean; was: boolean }>(
    `with old as (select r.id, r.hidden from reviews r where r.id = $1 and r.business_id = $2${scope} for update)
     update reviews r set hidden = $3, updated_at = case when old.hidden = $3 then r.updated_at else now() end
       from old where r.id = old.id
     returning r.hidden, old.hidden as was`,
    params,
  );
  if (!row) return { ok: false, code: "not_found" };
  if (row.was !== row.hidden) {
    await q(`insert into audit (actor, entity, entity_id, action, before, after) values ($1, 'review', $2, $3, $4::jsonb, $5::jsonb)`, [
      who.id ?? "admin",
      id,
      row.hidden ? "hide" : "show",
      JSON.stringify({ hidden: row.was }),
      JSON.stringify({ hidden: row.hidden }),
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
