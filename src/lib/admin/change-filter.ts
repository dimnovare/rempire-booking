/**
 * «Изменения данных»: what the change log is asked with (decision 29,
 * docs/kickoff.md; the change log of the tool we follow,
 * docs/altegio-pages.md, «Изменения данных»):
 *
 *   from, to  the day of the change, between two days of the salon; a new
 *             page starts with the last month (`defaultChanges`);
 *   author    one login (its id), «client» (a client himself, online), or
 *             «system» (the app on its own: the cron, an import, and the
 *             changes made before each login was named);
 *   entity    what was changed: a visit, a client, a barber, … (CHANGE_ENTITIES).
 *
 * The page sends every field as it was picked (`ChangeQuery`); `cleanChanges`
 * reads it, and what is not one of the choices is the same as nothing
 * chosen. No database and no Next.js in here: the page in the browser reads
 * the same sizes and choices.
 */
import { isLocalDate } from "../tz";
import { addMonths } from "./record-filter";

export const CHANGE_PAGE_SIZES = [25, 50, 100] as const;
export const CHANGE_PAGE_SIZE = 25;

/** Every `audit.entity` the app writes, in the menu's order: the calendar, the clients, the team, the money. */
export const CHANGE_ENTITIES = [
  "appointment",
  "client",
  "review",
  "staff",
  "special_time",
  "time_off",
  "staff_request",
  "service",
  "user",
  "product_sale",
  "invoice",
  "invoice_receiver",
  "invoice_issuer",
  "chair_rent",
  "business",
] as const;
export type ChangeEntity = (typeof CHANGE_ENTITIES)[number];

/** The author filter's two words that are not a login. */
export const CHANGE_AUTHORS = ["client", "system"] as const;

export type ChangeQuery = {
  from?: string;
  to?: string;
  /** a login's id, «client», «system», or «» for everyone */
  author?: string;
  entity?: string;
  page?: number;
  size?: number;
};

export type ChangeFilter = {
  from: string | null;
  to: string | null;
  author: string | null;
  entity: ChangeEntity | null;
  page: number;
  size: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const day = (v: unknown) => (isLocalDate(str(v)) ? str(v) : null);

/** What the page opens with: the last month, everyone, everything. `today` is the salon's day. */
export function defaultChanges(today: string): Required<ChangeQuery> {
  return { from: addMonths(today, -1), to: today, author: "", entity: "", page: 1, size: CHANGE_PAGE_SIZE };
}

/** A question as it was sent, every part copied by name and checked. */
export function cleanChanges(raw: unknown): ChangeFilter {
  const f = (raw && typeof raw === "object" ? raw : {}) as ChangeQuery;
  let from = day(f.from);
  let to = day(f.to);
  if (from && to && from > to) [from, to] = [to, from];
  const author = str(f.author);
  const entity = str(f.entity);
  const size = Number(f.size);
  const page = Number(f.page);
  return {
    from,
    to,
    author: UUID_RE.test(author) ? author.toLowerCase() : (CHANGE_AUTHORS as readonly string[]).includes(author) ? author : null,
    entity: (CHANGE_ENTITIES as readonly string[]).includes(entity) ? (entity as ChangeEntity) : null,
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
    size: (CHANGE_PAGE_SIZES as readonly number[]).includes(size) ? size : CHANGE_PAGE_SIZE,
  };
}

/** The question, copied by name: what the page's action hands on. */
export function changeQuestion(q: ChangeQuery | null | undefined): ChangeQuery {
  return {
    from: String(q?.from ?? ""),
    to: String(q?.to ?? ""),
    author: String(q?.author ?? ""),
    entity: String(q?.entity ?? ""),
    page: Number(q?.page),
    size: Number(q?.size),
  };
}
