/**
 * The client base's conditions (the owner, 19.11.2026: the list gets the
 * filters of the tool we follow; docs/altegio-pages.md, «Клиентская база»).
 *
 * A condition is one small unit: `clean` reads what the list sent and
 * answers with the condition, or null when it is not whole (no barber
 * picked, a number that is none); `sql` writes its part of the WHERE as
 * text with placeholders, every value handed to `x.p()` and never put into
 * the text. Conditions are joined by «И» or by «Или», one switch for the
 * whole set.
 *
 *   «По визитам»   hasVisits · visitStatus · visitCount · period · barber ·
 *                  services · serviceSum
 *   «По клиентам»  gender · category · sold · importance · birthday · age ·
 *                  massSent · noOnline
 *
 * What a visit is here is what the list's own numbers say
 * (src/lib/admin/clients.ts): every visit that is not cancelled, the ones
 * ahead too. «Came» and «did not come» are the journal's two states
 * (src/lib/admin/journal.ts). A sum is of the visits that have begun and
 * were neither cancelled nor a no-show, as «Продано» is.
 *
 * A day is the salon's own («2026-11-19» in its time zone): a period runs
 * from the first moment of its first day to the last of its last.
 *
 * A segment is three of these conditions filled in for today
 * (`segmentConds`), nothing more.
 *
 * No database and no Next.js in here: the browser cleans a condition with
 * the same code before it asks.
 */
import { addDays, isLocalDate, startOfDay, todayIn } from "../tz";

export const VISIT_CONDS = ["hasVisits", "visitStatus", "visitCount", "period", "barber", "services", "serviceSum"] as const;
export const CLIENT_CONDS = ["gender", "category", "sold", "importance", "birthday", "age", "massSent", "noOnline"] as const;
export const COND_KINDS = [...VISIT_CONDS, ...CLIENT_CONDS] as const;
export type CondKind = (typeof COND_KINDS)[number];
export const isCondKind = (k: unknown): k is CondKind => typeof k === "string" && (COND_KINDS as readonly string[]).includes(k);

/** Conditions in one question, at most. */
export const CONDS_MAX = 12;
/** Services in one «Услуги» condition, at most. */
export const COND_SERVICES_MAX = 50;
/** «В ближайшие N дней»: at most a year. */
export const BIRTHDAY_DAYS_MAX = 366;

export type Join = "and" | "or";
export const isJoin = (j: unknown): j is Join => j === "and" || j === "or";

/**
 * A condition as the list sends it: every field as it is typed or picked.
 * Which fields a kind reads is said at its unit below.
 */
export type CondInput = {
  kind: string;
  /** one choice: «yes» / «no», a status, a gender, a class, a barber's id, a category, a month or a number of days */
  value?: string;
  /** the birthday: «month» or «days» */
  mode?: string;
  /** days, YYYY-MM-DD */
  from?: string;
  to?: string;
  /** numbers as typed: a count, an age, or euros («25», «25,50») */
  min?: string;
  max?: string;
  /** several ids: the services */
  ids?: string[];
};

export type Cond =
  | { kind: "hasVisits"; has: boolean; from: string | null; to: string | null }
  | { kind: "visitStatus"; status: "came" | "noShow" }
  | { kind: "visitCount"; min: number | null; max: number | null }
  | { kind: "period"; from: string | null; to: string | null }
  | { kind: "barber"; staffId: string }
  | { kind: "services"; ids: string[] }
  | { kind: "serviceSum"; min: number | null; max: number | null }
  | { kind: "gender"; value: "male" | "female" | "none" }
  | { kind: "category"; label: string }
  | { kind: "sold"; min: number | null; max: number | null }
  | { kind: "importance"; value: "bronze" | "silver" | "gold" | "none" }
  | { kind: "birthday"; month: number | null; days: number | null }
  | { kind: "age"; min: number | null; max: number | null }
  | { kind: "massSent"; value: boolean }
  | { kind: "noOnline"; value: boolean };

type Of<K extends CondKind> = Extract<Cond, { kind: K }>;

/** What a unit writes its SQL with: `p` keeps a value and answers with its placeholder. */
export type SqlCtx = { p: (value: unknown) => string; now: number; tz: string };

type Unit<K extends CondKind> = {
  clean: (i: CondInput) => Of<K> | null;
  /** a boolean expression over the client `c` */
  sql: (c: Of<K>, x: SqlCtx) => string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A whole number as typed: null for nothing typed, NaN for what is not one. */
function whole(v: unknown, max: number): number | null {
  const s = str(v);
  if (!s) return null;
  if (!/^\d{1,9}$/.test(s)) return NaN;
  const n = Number(s);
  return n <= max ? n : NaN;
}

/** Euros as typed («25», «25,5», «25.50») in cents: null for nothing typed, NaN for what is no sum. */
function cents(v: unknown): number | null {
  const s = str(v).replace(/\s+/g, "").replace(/€$/, "");
  if (!s) return null;
  const m = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return NaN;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** «From» and «to»: one of them at least, the smaller first. Null: neither, or one is not a number. */
function range(min: number | null, max: number | null): { min: number | null; max: number | null } | null {
  if (Number.isNaN(min) || Number.isNaN(max)) return null;
  if (min == null && max == null) return null;
  return min != null && max != null && min > max ? { min: max, max: min } : { min, max };
}

/** A day as typed: null for nothing, undefined for what is no day. */
function day(v: unknown): string | null | undefined {
  const s = str(v);
  if (!s) return null;
  return isLocalDate(s) ? s : undefined;
}

/** Two days, the earlier first. Undefined: one of them is no day. */
function days(i: CondInput): { from: string | null; to: string | null } | undefined {
  const from = day(i.from);
  const to = day(i.to);
  if (from === undefined || to === undefined) return undefined;
  return from && to && from > to ? { from: to, to: from } : { from, to };
}

function yesNo(v: unknown): boolean | null {
  const s = str(v);
  return s === "yes" ? true : s === "no" ? false : null;
}

/** «a between min and max» with only the bounds that are set. */
function between(expr: string, r: { min: number | null; max: number | null }, x: SqlCtx): string {
  const parts: string[] = [];
  if (r.min != null) parts.push(`${expr} >= ${x.p(r.min)}`);
  if (r.max != null) parts.push(`${expr} <= ${x.p(r.max)}`);
  return `(${parts.join(" and ")})`;
}

/** His visits that are not cancelled, narrowed by `more` (a condition on the visit `a`). */
const visit = (more = "") => `exists (select 1 from appointments a where a.client_id = c.id and a.status <> 'cancelled'${more})`;

/** A visit `a` whose start is in these days of the salon. */
function inDays(p: { from: string | null; to: string | null }, x: SqlCtx): string {
  let sql = "";
  if (p.from) sql += ` and a.starts_at >= ${x.p(new Date(startOfDay(p.from, x.tz)))}`;
  if (p.to) sql += ` and a.starts_at < ${x.p(new Date(startOfDay(addDays(p.to, 1), x.tz)))}`;
  return sql;
}

/** The visits a sum is of: begun, neither cancelled nor a no-show («Продано»). */
const took = (x: SqlCtx) => `a.client_id = c.id and a.status not in ('cancelled', 'no_show') and a.starts_at <= ${x.p(new Date(x.now))}`;

const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * The birthdays of the next `n` days, today's first: months and days as two
 * lists of one length. In a year without 29 February, a birthday of that
 * day counts on the 28th.
 */
export function birthdaysAhead(today: string, n: number): { months: number[]; days: number[] } {
  const months: number[] = [];
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const [y, m, d] = addDays(today, i).split("-").map(Number);
    months.push(m);
    out.push(d);
    if (m === 2 && d === 28 && !leap(y)) {
      months.push(2);
      out.push(29);
    }
  }
  return { months, days: out };
}

export const UNITS: { [K in CondKind]: Unit<K> } = {
  /** `value` «yes» or «no»; `from`, `to`: the days to look in, both optional. */
  hasVisits: {
    clean(i) {
      const has = yesNo(i.value);
      const p = days(i);
      return has == null || !p ? null : { kind: "hasVisits", has, ...p };
    },
    sql: (c, x) => `${c.has ? "" : "not "}${visit(inDays(c, x))}`,
  },
  /** `value` «came» (he was in the chair: arrived or done) or «noShow». */
  visitStatus: {
    clean(i) {
      const s = str(i.value);
      return s === "came" || s === "noShow" ? { kind: "visitStatus", status: s } : null;
    },
    sql: (c) => visit(c.status === "came" ? " and a.status in ('arrived', 'done')" : " and a.status = 'no_show'"),
  },
  /** `min`, `max`: how many visits, as the «Визиты» column counts them. */
  visitCount: {
    clean(i) {
      const r = range(whole(i.min, 100_000), whole(i.max, 100_000));
      return r && { kind: "visitCount", ...r };
    },
    sql: (c, x) => between(`(select count(*) from appointments a where a.client_id = c.id and a.status <> 'cancelled')`, c, x),
  },
  /** `from`, `to`: he has a visit in these days; one of the two at least. */
  period: {
    clean(i) {
      const p = days(i);
      return !p || (!p.from && !p.to) ? null : { kind: "period", ...p };
    },
    sql: (c, x) => visit(inDays(c, x)),
  },
  /** `value`: the barber's id. */
  barber: {
    clean(i) {
      const id = str(i.value);
      return UUID_RE.test(id) ? { kind: "barber", staffId: id } : null;
    },
    sql: (c, x) => visit(` and a.staff_id = ${x.p(c.staffId)}`),
  },
  /** `ids`: the services; a visit with any one of them. */
  services: {
    clean(i) {
      if (!Array.isArray(i.ids)) return null;
      const ids = [...new Set(i.ids.map(str))];
      return ids.length && ids.length <= COND_SERVICES_MAX && ids.every((id) => UUID_RE.test(id)) ? { kind: "services", ids } : null;
    },
    sql: (c, x) => visit(` and exists (select 1 from appointment_services l where l.appointment_id = a.id and l.service_id = any(${x.p(c.ids)}::uuid[]))`),
  },
  /** `min`, `max` in euros: what his services cost on their own, in the visits that took place. */
  serviceSum: {
    clean(i) {
      const r = range(cents(i.min), cents(i.max));
      return r && { kind: "serviceSum", ...r };
    },
    sql: (c, x) => between(`(select coalesce(sum(l.price_cents), 0) from appointment_services l join appointments a on a.id = l.appointment_id where ${took(x)})`, c, x),
  },
  /** `value` «male», «female» or «none» (not chosen). */
  gender: {
    clean(i) {
      const v = str(i.value);
      return v === "male" || v === "female" || v === "none" ? { kind: "gender", value: v } : null;
    },
    sql: (c, x) => (c.value === "none" ? "c.gender is null" : `c.gender = ${x.p(c.value)}`),
  },
  /** `value`: the category, as it is written on the clients. */
  category: {
    clean(i) {
      const label = str(i.value);
      return label && label.length <= 60 ? { kind: "category", label } : null;
    },
    sql: (c, x) => `${x.p(c.label)} = any(c.labels)`,
  },
  /** `min`, `max` in euros: the «Продано» column. */
  sold: {
    clean(i) {
      const r = range(cents(i.min), cents(i.max));
      return r && { kind: "sold", ...r };
    },
    sql: (c, x) => between(`(select coalesce(sum(a.total_cents), 0) from appointments a where ${took(x)})`, c, x),
  },
  /** `value` «bronze», «silver», «gold» or «none» (no class). */
  importance: {
    clean(i) {
      const v = str(i.value);
      return v === "bronze" || v === "silver" || v === "gold" || v === "none" ? { kind: "importance", value: v } : null;
    },
    sql: (c, x) => (c.value === "none" ? "c.importance is null" : `c.importance = ${x.p(c.value)}`),
  },
  /** `mode` «month» with `value` 1 to 12, or «days» with `value` N: in the next N days, today too. */
  birthday: {
    clean(i) {
      const mode = str(i.mode);
      const n = whole(i.value, BIRTHDAY_DAYS_MAX);
      if (n == null || Number.isNaN(n)) return null;
      if (mode === "month") return n >= 1 && n <= 12 ? { kind: "birthday", month: n, days: null } : null;
      return mode === "days" ? { kind: "birthday", month: null, days: n } : null;
    },
    sql(c, x) {
      if (c.month != null) return `c.birth_month = ${x.p(c.month)}`;
      const ahead = birthdaysAhead(todayIn(x.tz, x.now), c.days ?? 0);
      return `exists (select 1 from unnest(${x.p(ahead.months)}::int[], ${x.p(ahead.days)}::int[]) as b(m, d) where b.m = c.birth_month and b.d = c.birth_day)`;
    },
  },
  /** `min`, `max`: whole years today. A client whose year is not known is left out. */
  age: {
    clean(i) {
      const r = range(whole(i.min, 150), whole(i.max, 150));
      return r && { kind: "age", ...r };
    },
    sql(c, x) {
      const [y, m, d] = todayIn(x.tz, x.now).split("-").map(Number);
      const age = `(${x.p(y)}::int - c.birth_year - case when (c.birth_month, c.birth_day) > (${x.p(m)}::int, ${x.p(d)}::int) then 1 else 0 end)`;
      return `(c.birth_year is not null and ${between(age, c, x)})`;
    },
  },
  /** `value` «yes» or «no»: a mass message was queued for him at least once. */
  massSent: {
    clean(i) {
      const v = yesNo(i.value);
      return v == null ? null : { kind: "massSent", value: v };
    },
    sql: (c) => `c.mass_sent_at is ${c.value ? "not " : ""}null`,
  },
  /** `value` «yes»: he may not book online (his card's switch); «no»: he may. */
  noOnline: {
    clean(i) {
      const v = yesNo(i.value);
      return v == null ? null : { kind: "noOnline", value: v };
    },
    sql: (c) => (c.value ? "c.no_online" : "not c.no_online"),
  },
};

/** One condition as the list sent it; null when it is not whole or not one we know. */
export function cleanCond(raw: unknown): Cond | null {
  const i = raw as CondInput | null;
  if (!i || typeof i !== "object" || !isCondKind(i.kind)) return null;
  return (UNITS[i.kind] as Unit<CondKind>).clean(i);
}

/** The whole conditions of a question, in their order; what is not whole is left out. */
export function cleanConds(raw: unknown): Cond[] {
  if (!Array.isArray(raw)) return [];
  const out: Cond[] = [];
  for (const one of raw.slice(0, CONDS_MAX)) {
    const c = cleanCond(one);
    if (c) out.push(c);
  }
  return out;
}

/** One condition as SQL over the client `c`. */
export function condSql(c: Cond, x: SqlCtx): string {
  return (UNITS[c.kind] as Unit<CondKind>).sql(c, x);
}

/** The conditions as one part of a WHERE: «» for none, else « and (… and|or …)». */
export function condsSql(conds: readonly Cond[], join: Join, x: SqlCtx): string {
  if (!conds.length) return "";
  return ` and (${conds.map((c) => `(${condSql(c, x)})`).join(join === "or" ? " or " : " and ")})`;
}

/* ---------- the list's order and page ---------- */

/** Clients on one page of the list, unless another size is asked for. */
export const PAGE_SIZE = 25;
/** The sizes a page may have. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;
/** The columns the list is sorted by; by name, A to Z, unless asked otherwise. */
export const SORTS = ["name", "visits", "sold", "last", "first"] as const;
export type ClientSort = (typeof SORTS)[number];
export const isClientSort = (s: unknown): s is ClientSort => typeof s === "string" && (SORTS as readonly string[]).includes(s);
export type SortDir = "asc" | "desc";

/* ---------- segments ---------- */

export const SEGMENTS = ["new", "returning", "lost"] as const;
export type Segment = (typeof SEGMENTS)[number];
export const isSegment = (s: unknown): s is Segment => typeof s === "string" && (SEGMENTS as readonly string[]).includes(s);

/** «New» and «returning» look this many days back; «lost» is no visit for this many. */
export const SEGMENT_DAYS = { recent: 30, lost: 60 };

/**
 * A segment as the conditions it fills in, joined by «И»; `today` is the
 * salon's day.
 *
 *   new        a visit in the last 30 days and none before them;
 *   returning  a visit in the last 30 days and one before them;
 *   lost       has visits, none in the last 60 days and none ahead.
 */
export function segmentConds(segment: Segment, today: string): CondInput[] {
  const recent = addDays(today, -SEGMENT_DAYS.recent);
  const before = addDays(recent, -1);
  if (segment === "new")
    return [
      { kind: "hasVisits", value: "yes", from: recent, to: today },
      { kind: "hasVisits", value: "no", from: "", to: before },
    ];
  if (segment === "returning")
    return [
      { kind: "hasVisits", value: "yes", from: recent, to: today },
      { kind: "hasVisits", value: "yes", from: "", to: before },
    ];
  return [
    { kind: "hasVisits", value: "yes", from: "", to: "" },
    { kind: "hasVisits", value: "no", from: addDays(today, -SEGMENT_DAYS.lost), to: "" },
  ];
}
