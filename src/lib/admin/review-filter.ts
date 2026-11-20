/**
 * «Отзывы»: what the reviews list is asked with (Dim, 20.11.2026; the
 * reviews report of the tool we follow, docs/altegio-pages.md, «Отзывы»):
 *
 *   from, to  between two days of the salon; a new page starts with the
 *             last twelve months (`defaultReviews`);
 *   staffId   one barber, «company» for the reviews about the salon itself
 *             («О компании»), or every review;
 *   rating    one number of stars, or any;
 *   shown     every review, only the new ones from the site that wait for
 *             the salon (migration 035), only those on the booking page, or
 *             only the hidden ones (ours: the tool deletes instead of hiding).
 *
 * The page sends every field as it was picked (`ReviewQuery`); `cleanReviews`
 * reads it, and what is not one of the choices is the same as nothing
 * chosen. No database and no Next.js in here: the page in the browser reads
 * the same sizes and choices.
 */
import { isLocalDate } from "../tz";
import { addMonths } from "./record-filter";

export const REVIEW_PAGE_SIZES = [25, 50, 100] as const;
export const REVIEW_PAGE_SIZE = 25;
export const REVIEW_SHOWN = ["all", "pending", "shown", "hidden"] as const;
export type ReviewShown = (typeof REVIEW_SHOWN)[number];
/** The staff filter's word for the reviews about the salon, not a barber. */
export const REVIEW_COMPANY = "company";

export type ReviewQuery = {
  from?: string;
  to?: string;
  /** a barber's id, «company», or «» for every review */
  staffId?: string;
  /** «1» … «5», or «» for any */
  rating?: string;
  shown?: string;
  page?: number;
  size?: number;
};

export type ReviewFilter = {
  from: string | null;
  to: string | null;
  /** null: every review */
  staffId: string | null;
  rating: number | null;
  shown: ReviewShown;
  page: number;
  size: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const day = (v: unknown) => (isLocalDate(str(v)) ? str(v) : null);

/** What the page opens with: the last twelve months, every barber, every rating. `today` is the salon's day. */
export function defaultReviews(today: string): Required<ReviewQuery> {
  return { from: addMonths(today, -12), to: today, staffId: "", rating: "", shown: "all", page: 1, size: REVIEW_PAGE_SIZE };
}

/** A question as it was sent, every part copied by name and checked. */
export function cleanReviews(raw: unknown): ReviewFilter {
  const f = (raw && typeof raw === "object" ? raw : {}) as ReviewQuery;
  let from = day(f.from);
  let to = day(f.to);
  if (from && to && from > to) [from, to] = [to, from];
  const staffId = str(f.staffId);
  const rating = Number(str(f.rating));
  const shown = str(f.shown);
  const size = Number(f.size);
  const page = Number(f.page);
  return {
    from,
    to,
    staffId: staffId === REVIEW_COMPANY || UUID_RE.test(staffId) ? staffId : null,
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    shown: (REVIEW_SHOWN as readonly string[]).includes(shown) ? (shown as ReviewShown) : "all",
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
    size: (REVIEW_PAGE_SIZES as readonly number[]).includes(size) ? size : REVIEW_PAGE_SIZE,
  };
}

/** The question, copied by name: what the page's action hands on. */
export function reviewQuestion(q: ReviewQuery | null | undefined): ReviewQuery {
  return {
    from: String(q?.from ?? ""),
    to: String(q?.to ?? ""),
    staffId: String(q?.staffId ?? ""),
    rating: String(q?.rating ?? ""),
    shown: String(q?.shown ?? ""),
    page: Number(q?.page),
    size: Number(q?.size),
  };
}
