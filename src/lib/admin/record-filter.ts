/**
 * «Записи»: what the list of every visit is asked with (the owner,
 * 19.11.2026; docs/altegio-pages.md, «Записи»). The page sends a question
 * with every field as it was typed or picked (`RecordQuery`); `cleanRecords`
 * reads it into the filter the list is made with (`RecordFilter`), and what
 * is not one of the choices is the same as nothing chosen.
 *
 *   created   between two days of the salon, both optional;
 *   visit     between two days; a new page starts with the last month to
 *             one month ahead (`defaultRecords`);
 *   barber    one of them;
 *   by        who made it: the client himself online, or a login;
 *   cancelled both, only cancelled, only not cancelled;
 *   status    waiting (our «ждёт» and «записан», not confirmed), confirmed by
 *             the client, arrived, done, no-show;
 *   q         the client, by a part of his name or by his phone's digits;
 *   services  a visit with any one of them;
 *   source    online, the salon's own, or the import.
 *
 * A day is the salon's own («2026-11-19» in its time zone): a period runs
 * from the first moment of its first day to the last of its last.
 *
 * No database and no Next.js in here: the page in the browser reads the
 * same sizes and choices.
 */
import { isLocalDate } from "../tz";

/** Visits on one page: one of these, the first unless another is asked for. */
export const RECORD_PAGE_SIZES = [25, 50, 100] as const;
export const RECORD_PAGE_SIZE = 25;
/** Services in one question, at most. */
export const RECORD_SERVICES_MAX = 50;

export const RECORD_CANCELLED = ["all", "yes", "no"] as const;
export type RecordCancelled = (typeof RECORD_CANCELLED)[number];
/**
 * «waiting» is two of our statuses, «ждёт» and «записан», while the client has
 * not confirmed; «confirmed» is «записан» with his confirmation (021): the
 * tool we follow has «Ожидание» and «Клиент подтвердил» apart. A cancelled
 * visit has its own choice. «Готово» is not one any more (Dim, decision
 * round 11): «arrived» finds the visits marked «done» before too.
 */
export const RECORD_STATUSES = ["waiting", "confirmed", "arrived", "no_show"] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];
export const RECORD_SOURCES = ["online", "admin", "import"] as const;
export type RecordSource = (typeof RECORD_SOURCES)[number];

/** The question as the page sends it. */
export type RecordQuery = {
  createdFrom?: string;
  createdTo?: string;
  visitFrom?: string;
  visitTo?: string;
  /** a barber's id; «» is every barber */
  staffId?: string;
  /** «client», a login's id, or «» */
  by?: string;
  cancelled?: string;
  status?: string;
  q?: string;
  serviceIds?: string[];
  source?: string;
  page?: number;
  size?: number;
};

/** The question, read: every part is one of its choices or null. */
export type RecordFilter = {
  createdFrom: string | null;
  createdTo: string | null;
  visitFrom: string | null;
  visitTo: string | null;
  staffId: string | null;
  /** «client»: booked online by the client himself; else the login's id */
  by: string | null;
  cancelled: RecordCancelled;
  status: RecordStatus | null;
  q: string;
  serviceIds: string[];
  source: RecordSource | null;
  page: number;
  size: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pad = (n: number) => String(n).padStart(2, "0");
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const day = (v: unknown) => {
  const s = str(v);
  return isLocalDate(s) ? s : null;
};
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null => (list as readonly string[]).includes(str(v)) ? (str(v) as T) : null;

/** The same day of the month `by` months on; the 31st of a shorter month is its last day. */
export function addMonths(date: string, by: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + by, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}

/** What the page opens with: visits from a month ago to a month ahead, everything else open. `today` is the salon's day. */
export function defaultRecords(today: string): Required<RecordQuery> {
  return { createdFrom: "", createdTo: "", visitFrom: addMonths(today, -1), visitTo: addMonths(today, 1), staffId: "", by: "", cancelled: "all", status: "", q: "", serviceIds: [], source: "", page: 1, size: RECORD_PAGE_SIZE };
}

/** Two days, the earlier first; either may be missing. */
function period(from: unknown, to: unknown): [string | null, string | null] {
  const a = day(from);
  const b = day(to);
  return a && b && a > b ? [b, a] : [a, b];
}

/** A question as it was sent, every part copied by name and checked. */
export function cleanRecords(raw: unknown): RecordFilter {
  const f = (raw && typeof raw === "object" ? raw : {}) as RecordQuery;
  const [createdFrom, createdTo] = period(f.createdFrom, f.createdTo);
  const [visitFrom, visitTo] = period(f.visitFrom, f.visitTo);
  const staffId = str(f.staffId);
  const by = str(f.by);
  const ids = Array.isArray(f.serviceIds) ? [...new Set(f.serviceIds.map(str))].filter((id) => UUID_RE.test(id)).slice(0, RECORD_SERVICES_MAX) : [];
  const size = Number(f.size);
  const page = Number(f.page);
  return {
    createdFrom,
    createdTo,
    visitFrom,
    visitTo,
    staffId: UUID_RE.test(staffId) ? staffId : null,
    by: by === "client" || UUID_RE.test(by) ? by : null,
    cancelled: oneOf(RECORD_CANCELLED, f.cancelled) ?? "all",
    status: oneOf(RECORD_STATUSES, f.status),
    q: str(f.q).slice(0, 60),
    serviceIds: ids,
    source: oneOf(RECORD_SOURCES, f.source),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    size: (RECORD_PAGE_SIZES as readonly number[]).includes(size) ? size : RECORD_PAGE_SIZE,
  };
}
