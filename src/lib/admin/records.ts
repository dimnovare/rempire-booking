/**
 * «Записи»: every visit in one list (the owner, 19.11.2026; the page of the
 * same name under «Отчёты» in the tool we follow, docs/altegio-pages.md).
 *
 *   listRecords     one page of the visits a question leaves, the newest
 *                   visit first, with who made each and when;
 *   exportRecords   the same visits, every page of them, as an .xlsx file,
 *                   and an audit row about it (never the rows);
 *   cancelRecords   the ticked visits, cancelled one by one through the
 *                   calendar's own cancel (src/lib/admin/visits.ts), so the
 *                   letters, the pushes and the rights are the calendar's;
 *   visitForSheet   one visit as the calendar's visit sheet wants it.
 *
 * **Who made a visit** is not a column of its own: a visit booked online is
 * the client's, and for the others the audit's «create» row names the
 * login (the admin, or a barber in his app). A visit from before the audit
 * knew, or made by the system, says «the salon».
 *
 * A condition is text with placeholders and its values beside it: nothing a
 * login typed is ever put into the SQL itself (as the client base does,
 * client-filter.ts).
 *
 * Rights (src/lib/auth/rights.ts), asked here whenever a login is handed
 * in: the list itself is «Просматривать список записей»; the file
 * «Выгружать список записей в Excel»; a phone is whole only with
 * «Показывать номера телефонов в записях», else masked, and its digits
 * then find nobody.
 *
 * **Whose visits** (`scopeSql`, one place for the list, its count, its
 * file, «Отменить выбранные» and the pencil): only the barbers whose column
 * the login sees in the journal (journal.staff), nothing before its history
 * limit (journal.history), and only the clients it is shown (clients.show:
 * all, or those who came to the chosen barbers), as the client base has
 * it. A filter that names a barber the login does not see leaves nothing,
 * exactly as one that names nobody at all: no answer says he is there. A
 * ticked visit outside all this is «not found».
 */
import { can, historyFrom, maskPhone, seenStaff, type Holder } from "../auth/rights";
import type { Business } from "../availability";
import type { L10n } from "../catalog";
import { query, withTx, type Querier } from "../db";
import { addDays, startOfDay, todayIn } from "../tz";
import { excelSerial, writeXlsx, type XCell } from "../xlsx";
import { calendarFor, calendarMay, loadVisitData, type CalendarData, type CalMay } from "./calendar";
import { seenClientsSql } from "./client-scope";
import { cleanRecords, RECORD_PAGE_SIZE, type RecordFilter } from "./record-filter";
import { adminCancelVisit, isUuid } from "./visits";

export type { RecordFilter };

/** Who made a visit: the client himself online, a login (its name), the salon when no login is known, or the import. */
export type RecordMaker = { kind: "client" | "user" | "salon" | "import"; name: string };

export type RecordRow = {
  id: string;
  staffId: string;
  staffName: string;
  /** the label under the barber's name: «Барбер» */
  staffRole: L10n;
  staffPhoto: string | null;
  /** the names of its services, in their order */
  services: L10n[];
  clientId: string;
  clientName: string;
  /** whole, masked, or none: by the login's rights */
  clientPhone: string | null;
  start: number;
  end: number;
  createdAt: number;
  by: RecordMaker;
  /** our status; «cancelled» is the pale red row */
  status: string;
  source: string;
  totalCents: number;
};

export type RecordList = {
  rows: RecordRow[];
  /** how many visits the question leaves, on every page together */
  total: number;
  page: number;
  pages: number;
  size: number;
};

/** What the page offers a login, each a right of its own. The screen only hides by these. */
export type RecordsMay = {
  /** the list itself */
  open: boolean;
  /** «Операции с Excel» → «Выгрузить в Excel» */
  export: boolean;
  /** phones are shown whole */
  phones: boolean;
  /** «Отменить выбранные»: the calendar's own right to cancel */
  cancel: boolean;
};

export function recordsMay(who: Holder): RecordsMay {
  return { open: can(who, "reports.bookings"), export: can(who, "reports.bookings.export"), phones: can(who, "reports.bookings.phones"), cancel: can(who, "visit.delete") };
}

/**
 * The logins the «Кто создал» filter picks from: by name, or by the part of
 * the e-mail before the @ when a login has no name (never the whole address).
 */
export async function recordMakers(q: Querier, businessId: string): Promise<{ id: string; name: string }[]> {
  const rows = await q<{ id: string; name: string; email: string }>("select id, name, email from users where business_id = $1 order by lower(name), email", [businessId]);
  return rows.map((u) => ({ id: u.id, name: u.name || u.email.split("@")[0] }));
}

const ms = (v: unknown) => (v instanceof Date ? v.getTime() : Date.parse(String(v)));
/** % and _ mean themselves in a search. */
const likeText = (s: string) => s.replace(/[%_\\]/g, (m) => "\\" + m);

/**
 * What of the salon's visits a login may see at all, as a part of a WHERE
 * over `appointments a` joined to its client `c`: the barbers whose column
 * it sees, nothing before its history limit, the clients it is shown.
 * `p` keeps a value and answers with its placeholder. No login: no limit.
 */
function scopeSql(business: Business, who: Holder | undefined, now: number, p: (value: unknown) => string): string {
  if (!who) return "";
  const tz = business.timezone;
  let sql = "";
  const seen = seenStaff(who);
  if (seen !== "all") sql += seen.length ? ` and a.staff_id = any(${p([...seen])}::uuid[])` : " and false";
  const limit = historyFrom(who, todayIn(tz, now));
  if (limit) sql += ` and a.starts_at >= ${p(new Date(startOfDay(limit, tz)))}`;
  return sql + seenClientsSql(who, p);
}

/** Of these visits, the ones the login may see (`scopeSql`): the rest are «not found» to it. */
async function inScope(q: Querier, business: Business, who: Holder, ids: string[], now: number): Promise<Set<string>> {
  const list = ids.filter(isUuid);
  if (!list.length) return new Set();
  const params: unknown[] = [business.id];
  const p = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const rows = await q<{ id: string }>(`select a.id from appointments a join clients c on c.id = a.client_id where a.business_id = $1${scopeSql(business, who, now, p)} and a.id = any(${p(list)}::uuid[])`, params);
  return new Set(rows.map((r) => r.id));
}

/**
 * Which visits a question leaves, as a WHERE over `appointments a` joined
 * to its client `c`, with its values. The list, its count and the export
 * all ask with this one. With a login (`who`): only what it may see
 * (`scopeSql`), whatever the question names.
 */
export function recordWhere(business: Business, f: RecordFilter, who?: Holder, now = Date.now()): { where: string; params: unknown[] } {
  const tz = business.timezone;
  const params: unknown[] = [business.id];
  const p = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const from = (date: string) => p(new Date(startOfDay(date, tz)));
  const until = (date: string) => p(new Date(startOfDay(addDays(date, 1), tz)));
  let where = `a.business_id = $1${scopeSql(business, who, now, p)}`;
  if (f.createdFrom) where += ` and a.created_at >= ${from(f.createdFrom)}`;
  if (f.createdTo) where += ` and a.created_at < ${until(f.createdTo)}`;
  if (f.visitFrom) where += ` and a.starts_at >= ${from(f.visitFrom)}`;
  if (f.visitTo) where += ` and a.starts_at < ${until(f.visitTo)}`;
  if (f.staffId) where += ` and a.staff_id = ${p(f.staffId)}`;
  if (f.by === "client") where += " and a.source = 'online'";
  else if (f.by) where += ` and a.source <> 'online' and exists (select 1 from audit au where au.entity = 'appointment' and au.entity_id = a.id and au.action = 'create' and au.actor = ${p(f.by)})`;
  if (f.cancelled === "yes") where += " and a.status = 'cancelled'";
  if (f.cancelled === "no") where += " and a.status <> 'cancelled'";
  if (f.status === "waiting") where += " and a.status in ('pending', 'booked')";
  else if (f.status) where += ` and a.status = ${p(f.status)}`;
  if (f.q) {
    const at = `'%' || ${p(likeText(f.q))} || '%'`;
    const digits = f.q.replace(/\D/g, "");
    // mostly digits is a phone; a login that sees phones masked finds nobody by them
    const byPhone = digits.length >= 3 && digits.length >= f.q.replace(/[\s+()-]/g, "").length - 1;
    if (byPhone && (!who || can(who, "reports.bookings.phones"))) where += ` and (c.name ilike ${at} or replace(coalesce(c.phone_e164, ''), '+', '') like '%' || ${p(digits.replace(/^00/, ""))} || '%')`;
    else where += ` and c.name ilike ${at}`;
  }
  if (f.serviceIds.length) where += ` and exists (select 1 from appointment_services l where l.appointment_id = a.id and l.service_id = any(${p(f.serviceIds)}::uuid[]))`;
  if (f.source) where += ` and a.source = ${p(f.source)}`;
  return { where, params };
}

type Row = {
  id: string;
  staff_id: string;
  staff_name: string;
  staff_role: L10n;
  staff_photo: string | null;
  client_id: string;
  client_name: string;
  phone_e164: string | null;
  starts_at: Date;
  ends_at: Date;
  created_at: Date;
  status: string;
  source: string;
  total_cents: number;
  made_actor: string | null;
  made_name: string | null;
  made_email: string | null;
  services: L10n[] | string;
};

function makerOf(r: Row): RecordMaker {
  if (r.source === "online") return { kind: "client", name: "" };
  if (r.made_name || r.made_email) return { kind: "user", name: r.made_name || (r.made_email ?? "").split("@")[0] };
  return { kind: r.source === "import" ? "import" : "salon", name: "" };
}

const rowOf = (r: Row, phones: boolean): RecordRow => ({
  id: r.id,
  staffId: r.staff_id,
  staffName: r.staff_name,
  staffRole: r.staff_role ?? {},
  staffPhoto: r.staff_photo,
  services: typeof r.services === "string" ? (JSON.parse(r.services) as L10n[]) : (r.services ?? []),
  clientId: r.client_id,
  clientName: r.client_name,
  clientPhone: phones ? r.phone_e164 : maskPhone(r.phone_e164),
  start: ms(r.starts_at),
  end: ms(r.ends_at),
  createdAt: ms(r.created_at),
  by: makerOf(r),
  status: r.status,
  source: r.source,
  totalCents: r.total_cents,
});

/** The visits a WHERE leaves, the newest visit first: `limit` of them from `offset`. */
async function recordRows(q: Querier, found: { where: string; params: unknown[] }, limit: number, offset: number, phones: boolean): Promise<RecordRow[]> {
  const n = found.params.length;
  const rows = await q<Row>(
    `select a.id, a.staff_id, s.display_name as staff_name, s.role as staff_role, s.photo_url as staff_photo,
            a.client_id, c.name as client_name, c.phone_e164,
            a.starts_at, a.ends_at, a.created_at, a.status, a.source, a.total_cents,
            mk.actor as made_actor, mu.name as made_name, mu.email as made_email,
            (select coalesce(json_agg(l.name order by l.position), '[]'::json) from appointment_services l where l.appointment_id = a.id) as services
       from appointments a
       join staff s on s.id = a.staff_id
       join clients c on c.id = a.client_id
       left join lateral (
         select au.actor from audit au
          where au.entity = 'appointment' and au.entity_id = a.id and au.action = 'create'
          order by au.at, au.id limit 1) mk on true
       left join users mu on mu.business_id = a.business_id and mu.id::text = mk.actor
      where ${found.where}
      order by a.starts_at desc, a.id
      limit $${n + 1} offset $${n + 2}`,
    [...found.params, limit, offset],
  );
  return rows.map((r) => rowOf(r, phones));
}

const NONE: RecordList = { rows: [], total: 0, page: 1, pages: 1, size: RECORD_PAGE_SIZE };

/**
 * One page of «Записи». `raw` is the question as the page sent it. With a
 * login: nothing without «Просматривать список записей».
 */
export async function listRecords(q: Querier, business: Business, raw: unknown, who?: Holder, now = Date.now()): Promise<RecordList> {
  if (who && !can(who, "reports.bookings")) return NONE;
  const f = cleanRecords(raw);
  const found = recordWhere(business, f, who, now);
  const [count] = await q<{ n: number }>(`select count(*)::int as n from appointments a join clients c on c.id = a.client_id where ${found.where}`, found.params);
  const total = count?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / f.size));
  const page = Math.min(f.page, pages);
  const rows = total ? await recordRows(q, found, f.size, (page - 1) * f.size, !who || can(who, "reports.bookings.phones")) : [];
  return { rows, total, page, pages, size: f.size };
}

/* ---------- «Выгрузить в Excel» ---------- */

/** Rows in one file, at most. */
export const RECORDS_EXPORT_MAX = 50_000;

export const RECORD_COLUMNS = ["staff", "services", "client", "phone", "visit", "by", "created", "status", "source", "total"] as const;
export type RecordColumn = (typeof RECORD_COLUMNS)[number];

/** The words of the file, in the login's language. */
export type RecordWords = {
  sheet: string;
  cols: Record<RecordColumn, string>;
  /** a status by its key («cancelled» too), a source by its key */
  status: Record<string, string>;
  source: Record<string, string>;
  /** who made it, when it is not a login */
  byClient: string;
  bySalon: string;
  byImport: string;
  /** a service's name in the login's language */
  pick: (name: L10n) => string;
};

export type RecordsExported = { ok: true; bytes: Uint8Array; rows: number; columns: RecordColumn[] } | { ok: false; code: "forbidden" };

const WIDTH: Record<RecordColumn, number> = { staff: 18, services: 44, client: 28, phone: 18, visit: 18, by: 22, created: 18, status: 14, source: 16, total: 10 };

export const makerText = (by: RecordMaker, w: Pick<RecordWords, "byClient" | "bySalon" | "byImport">) => (by.kind === "client" ? w.byClient : by.kind === "user" ? by.name : by.kind === "import" ? w.byImport : w.bySalon);

function cell(r: RecordRow, col: RecordColumn, tz: string, w: RecordWords): XCell {
  if (col === "staff") return r.staffName;
  if (col === "services") return r.services.map(w.pick).join("; ");
  if (col === "client") return r.clientName;
  if (col === "phone") return r.clientPhone;
  if (col === "visit") return { dateTime: excelSerial(r.start, tz) };
  if (col === "by") return makerText(r.by, w);
  if (col === "created") return { dateTime: excelSerial(r.createdAt, tz) };
  if (col === "status") return w.status[r.status] ?? r.status;
  if (col === "source") return w.source[r.source] ?? r.source;
  return r.totalCents / 100;
}

/**
 * The filtered list as an .xlsx file, every page of it, and the audit row
 * about it: who, when, how many rows and which columns. `by` is the login
 * that asks: without «Показывать номера телефонов в записях» the file has
 * no phone column at all.
 */
export async function exportRecords(business: Business, by: Holder & { id: string }, raw: unknown, words: RecordWords, now = Date.now()): Promise<RecordsExported> {
  if (!can(by, "reports.bookings") || !can(by, "reports.bookings.export")) return { ok: false, code: "forbidden" };
  const phones = can(by, "reports.bookings.phones");
  const columns = RECORD_COLUMNS.filter((c) => phones || c !== "phone");
  return withTx<RecordsExported>(async (tx) => {
    const rows = await recordRows(tx, recordWhere(business, cleanRecords(raw), by, now), RECORDS_EXPORT_MAX, 0, phones);
    const bytes = writeXlsx({
      name: words.sheet,
      header: columns.map((c) => words.cols[c]),
      rows: rows.map((r) => columns.map((c) => cell(r, c, business.timezone, words))),
      widths: columns.map((c) => WIDTH[c]),
    });
    await tx(`insert into audit (actor, entity, action, after) values ($1, 'appointment', 'export', $2::jsonb)`, [by.id, JSON.stringify({ by: "admin", rows: rows.length, columns })]);
    return { ok: true, bytes, rows: rows.length, columns };
  });
}

/* ---------- «Отменить выбранные» ---------- */

/** Visits in one «Отменить выбранные», at most: a page of the list. */
export const CANCEL_MAX = 100;

/**
 * How many were cancelled, and how many were not and why: cancelled
 * already; no right to it (the calendar's «Удалять записи», and for a visit
 * the client has come to its own right); not found (no such visit, or one
 * the login may not see: another barber's column, a day before its history
 * limit, a client it is not shown).
 */
export type RecordsCancelled = { ok: true; cancelled: number; refused: { already: number; forbidden: number; notFound: number } } | { ok: false; code: "forbidden" | "invalid" };

/**
 * Cancel the ticked visits, each through the calendar's own cancel: the
 * client's letter, the barber's push, the audit row and the rights are
 * exactly as from the calendar. One refused visit does not stop the rest.
 */
export async function cancelRecords(business: Business, by: Holder & { id: string }, ids: unknown, now = Date.now()): Promise<RecordsCancelled> {
  if (!can(by, "reports.bookings")) return { ok: false, code: "forbidden" };
  if (!Array.isArray(ids)) return { ok: false, code: "invalid" };
  const list = [...new Set(ids.map(String))];
  if (!list.length || list.length > CANCEL_MAX) return { ok: false, code: "invalid" };
  // only a visit the list itself would show this login is cancelled from it
  const mine = await inScope(query, business, by, list, now);
  const out = { cancelled: 0, refused: { already: 0, forbidden: 0, notFound: 0 } };
  for (const id of list) {
    const r = mine.has(id) ? await adminCancelVisit(business, id, by.id, { who: by }) : "not_found";
    if (r === "cancelled") out.cancelled++;
    else if (r === "already") out.refused.already++;
    else if (r === "forbidden") out.refused.forbidden++;
    else out.refused.notFound++;
  }
  return { ok: true, ...out };
}

/* ---------- the pencil: one visit, for the calendar's visit sheet ---------- */

export type VisitForSheet = { data: CalendarData; may: CalMay };

/**
 * One visit as the calendar's visit sheet wants it: one the list would
 * show this login (`scopeSql`), cut by the calendar's own rules for it
 * (calendarFor: its columns, its history limit, the phone and the note by
 * its rights). Null: no such visit, or not one this login may open.
 */
export async function visitForSheet(business: Business, who: Holder, id: string, now = Date.now()): Promise<VisitForSheet | null> {
  if (!can(who, "reports.bookings")) return null;
  if (!(await inScope(query, business, who, [String(id)], now)).has(String(id))) return null;
  const all = await loadVisitData(query, business, id);
  if (!all) return null;
  const today = todayIn(business.timezone, now);
  const data = calendarFor(who, all, today);
  return data.visits.length ? { data, may: calendarMay(who, today) } : null;
}
