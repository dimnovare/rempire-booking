/**
 * «Счета», the list: what a row is, and everything the list does with its
 * rows — the status filter, the search, the period, the sort, the page, the
 * «Сводка» sums, the desk's three figures and the receivers report.
 *
 * Pure: no database and no Next.js. The page hands the rows to the browser,
 * which filters and sorts them here; the .xlsx export asks the same
 * functions on the server (src/lib/billing/export.ts), so the file is the
 * list that was on the screen.
 *
 * Money is integer cents, and every sum is a sum of the invoices' own
 * totals (src/lib/billing/invoices.ts keeps them): nothing is recalculated.
 */

/** A row's status as the list shows it. «overdue» is an issued invoice past its day; «credit» is a credit invoice itself. */
export type ListStatus = "draft" | "issued" | "overdue" | "paid" | "credited" | "credit";

export type ListRow = {
  id: string;
  status: ListStatus;
  receiverId: string;
  receiver: string;
  /** the receiver is a private person (the row's icon) */
  person: boolean;
  /** the barber and the month it bills: searched, and a phone's second line */
  sub: string;
  number: string;
  /** the reference for the payment, from the number (src/lib/billing/reference.ts); "" for a draft, as Isolta's list */
  reference: string;
  /** YYYY-MM-DD; "" for a draft: its date is given when it is issued */
  date: string;
  due: string;
  netCents: number;
  vatCents: number;
  grossCents: number;
};

export type InvoiceLike = {
  id: string;
  status: string;
  kind: "invoice" | "credit";
  receiverId: string;
  number: string | null;
  issuedOn: string | null;
  dueOn: string | null;
  netCents: number;
  vatCents: number;
  grossCents: number;
};

/** The status of an invoice on `today` (YYYY-MM-DD in the salon's zone); null for a draft thrown away. */
export function listStatus(inv: Pick<InvoiceLike, "status" | "kind" | "dueOn">, today: string): ListStatus | null {
  if (inv.status === "discarded") return null;
  if (inv.status === "draft") return "draft";
  if (inv.kind === "credit") return "credit";
  if (inv.status === "credited") return "credited";
  if (inv.status === "paid") return "paid";
  return inv.dueOn && inv.dueOn < today ? "overdue" : "issued";
}

/* ---------- the filter ---------- */

/** The status select: all, drafts, issued and not due, overdue, paid, credited (a credit invoice goes with what it credits). */
export const STATUS_FILTERS = ["", "draft", "issued", "overdue", "paid", "credited"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const isStatusFilter = (v: unknown): v is StatusFilter => typeof v === "string" && (STATUS_FILTERS as readonly string[]).includes(v);

export const SORT_KEYS = ["status", "receiver", "number", "reference", "date", "due", "net", "gross"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type Sort = { key: SortKey; dir: "asc" | "desc" };
/** As the list opens: the newest date first, drafts on top (they would be dated today). */
export const DEFAULT_SORT: Sort = { key: "date", dir: "desc" };

export const PAGE_SIZES = [10, 25, 50, 100] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

export type ListQuery = {
  q: string;
  status: StatusFilter;
  /** the invoice's date, both ends included; "" is open */
  from: string;
  to: string;
  sort: Sort;
};

export const EMPTY_QUERY: ListQuery = { q: "", status: "", from: "", to: "", sort: DEFAULT_SORT };

/** A question from outside (the address, the export's body), with anything odd dropped. */
export function listQueryOf(raw: unknown): ListQuery {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (r.sort && typeof r.sort === "object" ? r.sort : {}) as Record<string, unknown>;
  const key = (SORT_KEYS as readonly string[]).includes(String(s.key)) ? (s.key as SortKey) : DEFAULT_SORT.key;
  const dir = s.dir === "asc" || s.dir === "desc" ? s.dir : DEFAULT_SORT.dir;
  return {
    q: typeof r.q === "string" ? r.q.slice(0, 120) : "",
    status: isStatusFilter(r.status) ? r.status : "",
    from: isDay(r.from) ? r.from : "",
    to: isDay(r.to) ? r.to : "",
    sort: { key, dir },
  };
}

const fold = (s: string) => s.toLocaleLowerCase();

/** The day a row is filtered and sorted by: its date, and today for a draft. */
const dayOf = (r: Pick<ListRow, "date">, today: string) => r.date || today;

export function matchesStatus(status: ListStatus, f: StatusFilter): boolean {
  if (!f) return true;
  if (f === "credited") return status === "credited" || status === "credit";
  return status === f;
}

export function filterRows<R extends ListRow>(rows: readonly R[], f: Pick<ListQuery, "q" | "status" | "from" | "to">, today: string): R[] {
  const needle = fold(f.q.trim());
  return rows.filter((r) => {
    if (!matchesStatus(r.status, f.status)) return false;
    const day = dayOf(r, today);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    return !needle || fold(r.receiver).includes(needle) || fold(r.number).includes(needle) || r.reference.includes(needle) || fold(r.sub).includes(needle);
  });
}

/* ---------- the sort ---------- */

const RANK: Record<ListStatus, number> = { draft: 0, issued: 1, overdue: 2, paid: 3, credited: 4, credit: 5 };

/** «DEMO-2026-0002» before «DEMO-2026-0010»: the digits inside a number count as numbers. */
const byNumber = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const byName = new Intl.Collator(["ru", "et", "en"], { sensitivity: "base", numeric: true });

function compare(a: ListRow, b: ListRow, key: SortKey, today: string): number {
  switch (key) {
    case "status":
      return RANK[a.status] - RANK[b.status];
    case "receiver":
      return byName.compare(a.receiver, b.receiver);
    case "number":
      // a draft has no number yet: it sorts as the newest
      return a.number && b.number ? byNumber.compare(a.number, b.number) : a.number ? -1 : b.number ? 1 : 0;
    case "reference":
      // all digits: as numbers, a draft (none yet) as the newest
      return a.reference && b.reference ? byNumber.compare(a.reference, b.reference) : a.reference ? -1 : b.reference ? 1 : 0;
    case "date":
      return dayOf(a, today) < dayOf(b, today) ? -1 : dayOf(a, today) > dayOf(b, today) ? 1 : 0;
    case "due":
      return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
    case "net":
      return a.netCents - b.netCents;
    case "gross":
      return a.grossCents - b.grossCents;
  }
}

/** A new array in the asked order. Equal rows keep the list's own order: the newest number first. */
export function sortRows<R extends ListRow>(rows: readonly R[], sort: Sort, today: string): R[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => {
      const c = compare(x.r, y.r, sort.key, today) * sign;
      if (c) return c;
      // the same day, sum or receiver: a draft first, then the newest number
      if (!x.r.number !== !y.r.number) return x.r.number ? 1 : -1;
      return byNumber.compare(y.r.number, x.r.number) || x.i - y.i;
    })
    .map((x) => x.r);
}

/** The header that was clicked: the same one turns round, another starts ascending (dates and sums: the largest first). */
export function nextSort(cur: Sort, key: SortKey): Sort {
  if (cur.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "date" || key === "due" || key === "net" || key === "gross" ? "desc" : "asc" };
}

export function pageOf<R>(rows: readonly R[], page: number, size: number): { rows: R[]; page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (p - 1) * size;
  const slice = rows.slice(start, start + size);
  return { rows: slice, page: p, pages, from: slice.length ? start + 1 : 0, to: start + slice.length };
}

/* ---------- the period control ---------- */

export const GRANS = ["month", "year", "week", "day"] as const;
export type Gran = (typeof GRANS)[number];
export const isGran = (v: unknown): v is Gran => typeof v === "string" && (GRANS as readonly string[]).includes(v);

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (day: string) => new Date(`${day}T12:00:00Z`);

/** The month, year, week (Monday first) or day that holds `day`, moved `by` whole periods. */
export function periodOf(gran: Gran, day: string, by = 0): { from: string; to: string } {
  const d = utc(day);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (gran === "year") return { from: `${y + by}-01-01`, to: `${y + by}-12-31` };
  if (gran === "month") return { from: iso(new Date(Date.UTC(y, m + by, 1, 12))), to: iso(new Date(Date.UTC(y, m + by + 1, 0, 12))) };
  if (gran === "week") {
    const monday = new Date(Date.UTC(y, m, d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + by * 7, 12));
    return { from: iso(monday), to: iso(new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6, 12))) };
  }
  const one = iso(new Date(Date.UTC(y, m, d.getUTCDate() + by, 12)));
  return { from: one, to: one };
}

/* ---------- «Сводка по выбранным счетам» ---------- */

export type Sum = { count: number; netCents: number; grossCents: number };
export type Summary = {
  /** every invoice that has a number, the credited ones too */
  issued: Sum;
  /** the credit invoices: their sums are below zero */
  credits: Sum;
  /** issued and credit invoices together: what was really sold */
  turnover: Sum;
  /** issued, not paid and not credited; the overdue ones are among them */
  unpaid: Sum;
  overdue: Sum;
  drafts: Sum;
};

const zero = (): Sum => ({ count: 0, netCents: 0, grossCents: 0 });
const add = (s: Sum, r: Pick<ListRow, "netCents" | "grossCents">) => {
  s.count++;
  s.netCents += r.netCents;
  s.grossCents += r.grossCents;
};

export function summaryOf(rows: readonly ListRow[]): Summary {
  const s: Summary = { issued: zero(), credits: zero(), turnover: zero(), unpaid: zero(), overdue: zero(), drafts: zero() };
  for (const r of rows) {
    if (r.status === "draft") {
      add(s.drafts, r);
      continue;
    }
    add(r.status === "credit" ? s.credits : s.issued, r);
    add(s.turnover, r);
    if (r.status === "issued" || r.status === "overdue") add(s.unpaid, r);
    if (r.status === "overdue") add(s.overdue, r);
  }
  return s;
}

/* ---------- «Рабочий стол»: the three figures ---------- */

export type DeskStats = { thisMonth: Sum; lastMonth: Sum; overdue: Sum; thisRange: { from: string; to: string }; lastRange: { from: string; to: string } };

/**
 * This month and the month before: the invoices dated in it (how many) and
 * what they come to with the credit invoices of the same month taken off.
 * Overdue: every issued invoice past its day, whenever it was dated.
 */
export function deskStats(rows: readonly ListRow[], today: string): DeskStats {
  const thisRange = periodOf("month", today);
  const lastRange = periodOf("month", today, -1);
  const month = (range: { from: string; to: string }): Sum => {
    const s = summaryOf(rows.filter((r) => r.status !== "draft" && r.date >= range.from && r.date <= range.to));
    return { count: s.issued.count, netCents: s.turnover.netCents, grossCents: s.turnover.grossCents };
  };
  return { thisMonth: month(thisRange), lastMonth: month(lastRange), overdue: summaryOf(rows).overdue, thisRange, lastRange };
}

/** «Рабочий стол», «Неоплаченные счета»: the first `n` of them and what all of them come to. */
export type DeskUnpaid = { rows: ListRow[]; all: Sum; overdue: number };

/**
 * The issued invoices not paid yet (overdue or not due), the longest overdue
 * first: by the due day, then the invoice's date and number. Credit
 * invoices and drafts are not owed.
 */
export function deskUnpaid(rows: readonly ListRow[], n = 5): DeskUnpaid {
  const owed = rows.filter((r) => r.status === "issued" || r.status === "overdue");
  const by = (a: ListRow, b: ListRow) => (a.due || "9999").localeCompare(b.due || "9999") || a.date.localeCompare(b.date) || byNumber.compare(a.number, b.number);
  const s = summaryOf(owed);
  return { rows: [...owed].sort(by).slice(0, Math.max(0, n)), all: s.unpaid, overdue: s.overdue.count };
}

/* ---------- «Отчёт по получателям» ---------- */

export type ReceiverReportRow = {
  receiverId: string;
  name: string;
  person: boolean;
  invoices: number;
  credits: number;
  sold: { netCents: number; grossCents: number };
  /** above zero: what the credit invoices took back */
  credited: { netCents: number; grossCents: number };
  total: { netCents: number; grossCents: number };
  last: { id: string; number: string; date: string } | null;
};
export type ReceiverReport = { rows: ReceiverReportRow[]; receivers: number; invoices: number; credits: number; total: { netCents: number; grossCents: number } };

/** Who was invoiced between two days (both included; "" is open), by name. Drafts are not in it. */
export function receiversReport(rows: readonly ListRow[], from: string, to: string): ReceiverReport {
  const by = new Map<string, ReceiverReportRow>();
  for (const r of rows) {
    if (r.status === "draft" || !r.date || (from && r.date < from) || (to && r.date > to)) continue;
    let x = by.get(r.receiverId);
    if (!x) {
      x = { receiverId: r.receiverId, name: r.receiver, person: r.person, invoices: 0, credits: 0, sold: { netCents: 0, grossCents: 0 }, credited: { netCents: 0, grossCents: 0 }, total: { netCents: 0, grossCents: 0 }, last: null };
      by.set(r.receiverId, x);
    }
    if (r.status === "credit") {
      x.credits++;
      x.credited.netCents -= r.netCents;
      x.credited.grossCents -= r.grossCents;
    } else {
      x.invoices++;
      x.sold.netCents += r.netCents;
      x.sold.grossCents += r.grossCents;
      if (!x.last || r.date > x.last.date || (r.date === x.last.date && byNumber.compare(r.number, x.last.number) > 0)) x.last = { id: r.id, number: r.number, date: r.date };
    }
    x.total.netCents += r.netCents;
    x.total.grossCents += r.grossCents;
  }
  const out = [...by.values()].sort((a, b) => byName.compare(a.name, b.name));
  return {
    rows: out,
    receivers: out.length,
    invoices: out.reduce((n, r) => n + r.invoices, 0),
    credits: out.reduce((n, r) => n + r.credits, 0),
    total: { netCents: out.reduce((n, r) => n + r.total.netCents, 0), grossCents: out.reduce((n, r) => n + r.total.grossCents, 0) },
  };
}

/* ---------- an address in three columns ---------- */

/**
 * «Näidise 5, 10111 Tallinn» → street, postcode, town, for the receivers
 * list. A receiver's address is one line (invoice_receivers.address); what
 * does not read as «…, 12345 Town» stays whole in the first column.
 */
export function splitAddress(address: string): { street: string; postcode: string; town: string } {
  const a = String(address ?? "").trim();
  const m = /^(.*?)[,\s]+(\d{5})\s+([^,]+?)(?:,\s*[^,\d]+)?$/.exec(a);
  if (m && m[1].trim()) return { street: m[1].trim().replace(/,$/, ""), postcode: m[2], town: m[3].trim() };
  const only = /^(\d{5})\s+([^,]+)$/.exec(a);
  if (only) return { street: "", postcode: only[1], town: only[2].trim() };
  return { street: a, postcode: "", town: "" };
}
