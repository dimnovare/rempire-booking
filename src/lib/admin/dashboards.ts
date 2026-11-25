/**
 * The two dashboards of «Отчёты» (Dim, 20.11.2026: copy the tool's two
 * dashboards now; docs/altegio-pages.md, «D. Dashboards»):
 *
 *   «Основные показатели» (/admin/analytics)
 *     kpiReport    a period's sales, attendance and fill rate, each figure
 *                  against the period just before it of the same length,
 *                  and a figure per day for the three charts;
 *     kpiClients   the clients behind a card («Посмотреть клиентов»);
 *   «Визиты» (/admin/dashboard), the first page of «Отчёты» in the tool
 *     listDashVisits  the visits ahead («предстоящие») or behind
 *                     («прошедшие»), in time order, with each listed day's
 *                     whole count for its heading («12 визитов · пришли 3»);
 *     listFeed        «Лента активности по записям»: the bookings something
 *                     happened to, the latest first, each with its history
 *                     from the audit log;
 *     dashVisitForSheet  one of them for the journal's own visit window.
 *
 * **What the figures mean** (the tool shows them, we count them so):
 *   - a visit **came** when its status is «arrived» or «done»: the client
 *     was in the chair (the journal's «Выполнено на сумму», the client
 *     base's «came»). The tool's «завершённые записи» are the same: of its
 *     762 records in 30 days, the 81 closed ones are exactly its 81
 *     «Визиты» and its 81 sales;
 *   - «Записи»: every booking that starts in the period, cancelled ones too;
 *   - «Визиты»: the bookings of the period the client came to; «Клиенты»:
 *     the different clients among them;
 *   - «Новые клиенты»: of those, the ones whose first visit ever is in the
 *     period; «Не новых клиентов»: the rest;
 *   - «Потерянные клиенты»: as the tool's own setting reads («Считать
 *     потерянными клиентов, не посещавших более: 60 дней»), a client whose
 *     last visit up to the period's last day lies more than LOST_DAYS days
 *     back, and whose 60 days ran out inside the period: last visit on day
 *     D, D + 61 in the period. So a period counts the clients it lost, and
 *     the period before counts its own;
 *   - «Продажи»: no visit is paid in this app yet, so «Услуги» is what the
 *     visits the client came to cost as booked (services and any special
 *     time's extra), one «операция» each; «Товары» the product sales of the
 *     period that were not taken back (the journal's «Товаров на сумму»),
 *     one row each; «Итого» both. «Средняя стоимость визита» is «Итого»
 *     over «Визиты», «…услуги» «Услуги» over its operations, «…товара»
 *     «Товары» over its rows;
 *   - «Заполненность»: «Завершённые» came, «Отменённые» cancelled,
 *     «Незавершённые» the rest (waiting, confirmed or not, and no-shows),
 *     each also as a share of «Записи». Per day, «Всего занято рабочего
 *     времени» is the minutes of the visits that were neither cancelled nor
 *     a no-show over the barbers' working minutes that day (their hours
 *     less their time off: the sidebar month's rule, month-load.ts), and
 *     «Неявки» the no-shows' minutes over the same. «Средняя
 *     заполненность» is the mean of the first over the days someone works;
 *   - the change: (now − before) / before, rounded to a whole per cent; 0
 *     when both are 0; null when only the period before is 0 (no base to
 *     compare with: the page shows «—»).
 * Days are the salon's own (business.timezone).
 *
 * **Whose** (src/lib/auth/rights.ts): «Основные показатели» needs its right
 * and counts only the barbers whose column the login sees in the journal
 * (journal.staff), narrowed to the one picked in «Фильтры»; the names
 * behind a card also only the clients it is shown (clients.show). «Визиты»
 * needs its right and lists exactly what «Записи» would show the login (its
 * scope, records.ts recordWhere): the columns it sees, nothing before its
 * history limit, the clients it is shown; a phone whole only with
 * «Показывать номера телефонов в сводке», else masked.
 */
import { can, maskPhone, seenStaff, type Holder } from "../auth/rights";
import type { Business } from "../availability";
import type { L10n } from "../catalog";
import type { Querier } from "../db";
import { mergeIntervals, subtractIntervals, workWindows, type HoursRow, type Interval } from "../slots";
import { addDays, isLocalDate, startOfDay, todayIn } from "../tz";
import { calendarFor, calendarMay, loadVisitData } from "./calendar";
import { seenClientsSql } from "./client-scope";
import { cleanRecords } from "./record-filter";
import { recordWhere, type RecordMaker, type VisitForSheet } from "./records";
import { isUuid } from "./visits";

const CAME = new Set(["arrived", "done"]);
const ms = (v: unknown) => (v instanceof Date ? v.getTime() : Date.parse(String(v)));
const dayNo = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

/* ---------- the period ---------- */

/** A period of the salon's days, both ends in it. */
export type Period = { from: string; to: string };

/** What the page opens with: the last 30 days, today the last of them (the tool's «Выбрано 30 дней»). */
export const PERIOD_DAYS = 30;
/** The longest period asked at once. */
export const PERIOD_MAX = 366;
/** «Считать потерянными клиентов, не посещавших более: 60 дней» (the tool's analytics setting at REMPIRE). */
export const LOST_DAYS = 60;

const okDay = (v: unknown): v is string => isLocalDate(v) && v >= "2000-01-01" && v <= "2100-12-31";

/** How many days a period has. */
export const periodDays = (p: Period) => dayNo(p.to) - dayNo(p.from) + 1;

/**
 * A period as it was asked: two days, the earlier first, at most
 * PERIOD_MAX long (the end is kept); a missing or wrong end is today, a
 * missing start the 30 days up to the end.
 */
export function cleanPeriod(from: unknown, to: unknown, today: string): Period {
  let f = okDay(from) ? from : null;
  let t = okDay(to) ? to : null;
  if (f && t && f > t) [f, t] = [t, f];
  const end = t ?? (f && f > today ? f : today);
  let start = f ?? addDays(end, -(PERIOD_DAYS - 1));
  if (dayNo(end) - dayNo(start) + 1 > PERIOD_MAX) start = addDays(end, -(PERIOD_MAX - 1));
  return { from: start, to: end };
}

/** The period just before, of the same length: what every figure is compared with. */
export function previousPeriod(p: Period): Period {
  const n = periodDays(p);
  return { from: addDays(p.from, -n), to: addDays(p.from, -1) };
}

/** Is the period one whole calendar month, its first day to its last? */
export const wholeMonth = (p: Period) => p.from.endsWith("-01") && addDays(p.to, 1).endsWith("-01") && p.to.slice(0, 7) === p.from.slice(0, 7);

/** The whole calendar month before a period's first day: «к октябрю» for November. */
export function previousMonth(p: Period): Period {
  const to = addDays(p.from.slice(0, 8) + "01", -1);
  return { from: to.slice(0, 8) + "01", to };
}

/** The days of a period, in order. */
export function periodDates(p: Period): string[] {
  const out: string[] = [];
  for (let d = p.from; d <= p.to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The change against the period before, in whole per cent; null when there is nothing to compare with. */
export function changePct(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 100);
}

/** One figure, now and in the period before. */
export type Figure = { cur: number; prev: number; change: number | null };
export const figure = (cur: number, prev: number): Figure => ({ cur, prev, change: changePct(cur, prev) });

/**
 * Whose figures: the barbers the login sees in the journal, narrowed to the
 * one picked. Null: everyone's. An empty list: nobody's (a barber the login
 * does not see is nobody, as in «Записи»).
 */
export function staffScope(who: Holder | undefined, picked: string | null): string[] | null {
  const seen = who ? seenStaff(who) : "all";
  if (picked) return seen === "all" || seen.includes(picked) ? [picked] : [];
  return seen === "all" ? null : [...seen];
}

/* ---------- «Основные показатели» ---------- */

/**
 * What the page asks: the period and the barber of «Фильтры». `compare`
 * «month»: a whole calendar month is compared with the whole month before
 * it (the phone's «Отчёты», «к октябрю»), not with the same number of days.
 */
export type KpiQuery = { from?: unknown; to?: unknown; staffId?: unknown; compare?: unknown };

export type SalesDay = { date: string; servicesCents: number; goodsCents: number };
export type VisitorsDay = { date: string; fresh: number; regular: number };
/** The share of the working time that day, in per cent with one decimal; null on a day nobody works. */
export type FillDay = { date: string; shiftMin: number; busyMin: number; noShowMin: number; busyPct: number | null; noShowPct: number | null };

export type KpiReport = {
  period: Period;
  prev: Period;
  /** the barber picked in «Фильтры», as applied; null: all the login sees */
  staffId: string | null;
  sales: {
    /** cents */
    total: Figure;
    services: Figure;
    goods: Figure;
    /** how many operations each sum is */
    totalOps: Figure;
    servicesOps: Figure;
    goodsOps: Figure;
    /** cents, rounded */
    avgVisit: Figure;
    avgService: Figure;
    avgGoods: Figure;
    days: SalesDay[];
  };
  attendance: {
    clients: Figure;
    visits: Figure;
    records: Figure;
    /** the records the client made himself online (cancelled ones too, as «Записи») */
    online: Figure;
    fresh: Figure;
    regular: Figure;
    lost: Figure;
    days: VisitorsDay[];
  };
  fill: {
    done: Figure;
    open: Figure;
    cancelled: Figure;
    /** the no-shows among «Незавершённые» */
    noShow: Figure;
    /** per cent with one decimal */
    avg: Figure;
    days: FillDay[];
  };
};

type VisitRow = { day: string; status: string; source: string; client_id: string; total_cents: number; min: number; first_day: string | null };
type GoodsRow = { day: string; cents: number; n: number };

/** The staff part of a WHERE over `alias`, its value pushed by `p`. */
const staffSql = (alias: string, staff: string[] | null, p: (v: unknown) => string) => (staff ? ` and ${alias}.staff_id = any(${p(staff)}::uuid[])` : "");

/**
 * Every booking that starts in the days `from`–`to`, with its day, and for
 * one the client came to, the day of his first visit ever (with the same
 * barbers): what «Новые клиенты» is told by.
 */
async function loadVisitRows(q: Querier, business: Business, from: string, to: string, staff: string[] | null): Promise<VisitRow[]> {
  const tz = business.timezone;
  const params: unknown[] = [business.id, new Date(startOfDay(from, tz)), new Date(startOfDay(addDays(to, 1), tz)), tz];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const who = staffSql("a", staff, p);
  const whoB = staff ? ` and b.staff_id = any($${params.length}::uuid[])` : "";
  const rows = await q<VisitRow>(
    `select to_char(a.starts_at at time zone $4::text, 'YYYY-MM-DD') as day, a.status, a.source, a.client_id, a.total_cents,
            (extract(epoch from (a.ends_at - a.starts_at)) / 60)::int as min,
            case when a.status in ('arrived', 'done') then (
              select to_char(min(b.starts_at) at time zone $4::text, 'YYYY-MM-DD') from appointments b
               where b.business_id = $1 and b.client_id = a.client_id and b.status in ('arrived', 'done')${whoB}) end as first_day
       from appointments a
      where a.business_id = $1 and a.starts_at >= $2 and a.starts_at < $3${who}`,
    params,
  );
  return rows.map((r) => ({ ...r, total_cents: Number(r.total_cents), min: Number(r.min) }));
}

/** The product sales of the days `from`–`to` that were not taken back, by day: the journal's «Товаров на сумму». */
async function loadGoods(q: Querier, business: Business, from: string, to: string, staff: string[] | null): Promise<GoodsRow[]> {
  const tz = business.timezone;
  const params: unknown[] = [business.id, new Date(startOfDay(from, tz)), new Date(startOfDay(addDays(to, 1), tz)), tz];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const rows = await q<GoodsRow>(
    `select to_char(p.created_at at time zone $4::text, 'YYYY-MM-DD') as day, coalesce(sum(p.total_cents), 0)::int as cents, count(*)::int as n
       from product_sales p
      where p.business_id = $1 and p.status = 'done' and p.reverses_id is null
        and p.created_at >= $2 and p.created_at < $3${staffSql("p", staff, p)}
        and not exists (select 1 from product_sales r where r.reverses_id = p.id)
      group by 1`,
    params,
  );
  return rows.map((r) => ({ day: r.day, cents: Number(r.cents), n: Number(r.n) }));
}

/** The clients a period lost: their last visit up to its last day was on a day D with D + LOST_DAYS + 1 inside it. */
async function countLost(q: Querier, business: Business, period: Period, staff: string[] | null): Promise<number> {
  const tz = business.timezone;
  const params: unknown[] = [
    business.id,
    new Date(startOfDay(addDays(period.from, -(LOST_DAYS + 1)), tz)),
    new Date(startOfDay(addDays(period.to, -LOST_DAYS), tz)),
    new Date(startOfDay(addDays(period.to, 1), tz)),
  ];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const [row] = await q<{ n: number }>(
    `select count(*)::int as n from (
       select a.client_id, max(a.starts_at) as last from appointments a
        where a.business_id = $1 and a.status in ('arrived', 'done') and a.starts_at < $4${staffSql("a", staff, p)}
        group by a.client_id) x
      where x.last >= $2 and x.last < $3`,
    params,
  );
  return Number(row?.n ?? 0);
}

type WorkLoaded = {
  hours: (HoursRow & { staff: string })[];
  overrides: { staff: string; day: string; intervals: [string, string][] }[];
  off: { staff: string; from: number; to: number }[];
};

/**
 * The barbers' working minutes on each day of `from`–`to`: each one's hours
 * that day (the day's own, else the weekly ones), less his time off. The
 * sidebar month's rule (month-load.ts), for any days and any barbers.
 */
async function workMinutes(q: Querier, business: Business, from: string, to: string, staff: string[] | null): Promise<Map<string, number>> {
  const tz = business.timezone;
  const params: unknown[] = [business.id, from, to, new Date(startOfDay(from, tz)), new Date(startOfDay(addDays(to, 1), tz))];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const who = staff ? ` and s.id = any(${p(staff)}::uuid[])` : "";
  const [row] = await q<WorkLoaded>(
    `select
       (select coalesce(json_agg(json_build_object(
                 'staff', h.staff_id, 'weekday', h.weekday,
                 'starts', to_char(h.starts, 'HH24:MI'), 'ends', to_char(h.ends, 'HH24:MI'),
                 'valid_from', h.valid_from::text, 'valid_to', h.valid_to::text)), '[]'::json)
          from staff_hours h join staff s on s.id = h.staff_id
         where s.business_id = $1 and s.active${who}) as hours,
       (select coalesce(json_agg(json_build_object('staff', o.staff_id, 'day', o.day::text, 'intervals', o.intervals)), '[]'::json)
          from staff_day_overrides o join staff s on s.id = o.staff_id
         where s.business_id = $1 and s.active${who} and o.day between $2::date and $3::date) as overrides,
       (select coalesce(json_agg(json_build_object(
                 'staff', t.staff_id,
                 'from', floor(extract(epoch from t.starts_at) * 1000)::bigint,
                 'to', floor(extract(epoch from t.ends_at) * 1000)::bigint)), '[]'::json)
          from time_off t join staff s on s.id = t.staff_id
         where s.business_id = $1 and s.active${who} and t.status <> 'declined' and t.starts_at < $5 and t.ends_at > $4) as off`,
    params,
  );
  const ids = [...new Set([...row.hours.map((h) => h.staff), ...row.overrides.map((o) => o.staff)])];
  const hoursOf = new Map(ids.map((id) => [id, row.hours.filter((h) => h.staff === id)]));
  const offOf = new Map(ids.map((id) => [id, mergeIntervals(row.off.filter((t) => t.staff === id).map((t) => [Number(t.from), Number(t.to)] as Interval))]));
  const out = new Map<string, number>();
  for (let date = from; date <= to; date = addDays(date, 1)) {
    let min = 0;
    for (const id of ids) {
      const ov = row.overrides.find((o) => o.staff === id && o.day === date);
      const work = workWindows(date, tz, hoursOf.get(id) ?? [], ov ? ov.intervals : null);
      for (const [a, b] of subtractIntervals(work, offOf.get(id) ?? [])) min += Math.round((b - a) / 60_000);
    }
    out.set(date, min);
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const avgOf = (sum: number, n: number) => (n > 0 ? Math.round(sum / n) : 0);

/** One period's sums, from the rows of both periods. */
function sumUp(rows: VisitRow[], goods: GoodsRow[], work: Map<string, number>, p: Period) {
  const inP = rows.filter((r) => r.day >= p.from && r.day <= p.to);
  const came = inP.filter((r) => CAME.has(r.status));
  const clients = new Set(came.map((r) => r.client_id));
  const fresh = new Set(came.filter((r) => r.first_day !== null && r.first_day >= p.from).map((r) => r.client_id));
  const cancelled = inP.filter((r) => r.status === "cancelled").length;
  const g = goods.filter((r) => r.day >= p.from && r.day <= p.to);
  const servicesCents = came.reduce((n, r) => n + r.total_cents, 0);
  const goodsCents = g.reduce((n, r) => n + r.cents, 0);
  const goodsOps = g.reduce((n, r) => n + r.n, 0);

  const fill: FillDay[] = periodDates(p).map((date) => {
    const shiftMin = work.get(date) ?? 0;
    const day = inP.filter((r) => r.day === date);
    const busyMin = day.filter((r) => r.status !== "cancelled" && r.status !== "no_show").reduce((n, r) => n + r.min, 0);
    const noShowMin = day.filter((r) => r.status === "no_show").reduce((n, r) => n + r.min, 0);
    const pct = (m: number) => (shiftMin > 0 ? round1(Math.min(100, (m * 100) / shiftMin)) : null);
    return { date, shiftMin, busyMin, noShowMin, busyPct: pct(busyMin), noShowPct: pct(noShowMin) };
  });
  const worked = fill.filter((d) => d.busyPct !== null);
  return {
    records: inP.length,
    online: inP.filter((r) => r.source === "online").length,
    noShow: inP.filter((r) => r.status === "no_show").length,
    visits: came.length,
    clients: clients.size,
    fresh: fresh.size,
    regular: clients.size - fresh.size,
    done: came.length,
    cancelled,
    open: inP.length - came.length - cancelled,
    servicesCents,
    goodsCents,
    goodsOps,
    fill,
    avgFill: worked.length ? round1(worked.reduce((n, d) => n + (d.busyPct ?? 0), 0) / worked.length) : 0,
    came,
    goods: g,
  };
}

/**
 * «Основные показатели» for a period, against the period before. With a
 * login: null without «Основные показатели», and only what it may see.
 */
export async function kpiReport(q: Querier, business: Business, raw: KpiQuery, who?: Holder, now = Date.now()): Promise<KpiReport | null> {
  if (who && !can(who, "reports.dashboard")) return null;
  const period = cleanPeriod(raw?.from, raw?.to, todayIn(business.timezone, now));
  const prev = raw?.compare === "month" && wholeMonth(period) ? previousMonth(period) : previousPeriod(period);
  const asked = raw?.staffId;
  const picked = isUuid(asked) ? asked : null;
  const staff = staffScope(who, picked);
  const [rows, goods, work, lostCur, lostPrev] = await Promise.all([
    loadVisitRows(q, business, prev.from, period.to, staff),
    loadGoods(q, business, prev.from, period.to, staff),
    workMinutes(q, business, prev.from, period.to, staff),
    countLost(q, business, period, staff),
    countLost(q, business, prev, staff),
  ]);
  const a = sumUp(rows, goods, work, period);
  const b = sumUp(rows, goods, work, prev);
  const servicesOpsA = a.visits;
  const servicesOpsB = b.visits;

  const dates = periodDates(period);
  const sales: SalesDay[] = dates.map((date) => ({
    date,
    servicesCents: a.came.filter((r) => r.day === date).reduce((n, r) => n + r.total_cents, 0),
    goodsCents: a.goods.filter((r) => r.day === date).reduce((n, r) => n + r.cents, 0),
  }));
  const visitors: VisitorsDay[] = dates.map((date) => {
    const day = a.came.filter((r) => r.day === date);
    const all = new Set(day.map((r) => r.client_id));
    const fresh = new Set(day.filter((r) => r.first_day === date).map((r) => r.client_id));
    return { date, fresh: fresh.size, regular: all.size - fresh.size };
  });

  return {
    period,
    prev,
    staffId: picked,
    sales: {
      total: figure(a.servicesCents + a.goodsCents, b.servicesCents + b.goodsCents),
      services: figure(a.servicesCents, b.servicesCents),
      goods: figure(a.goodsCents, b.goodsCents),
      totalOps: figure(servicesOpsA + a.goodsOps, servicesOpsB + b.goodsOps),
      servicesOps: figure(servicesOpsA, servicesOpsB),
      goodsOps: figure(a.goodsOps, b.goodsOps),
      avgVisit: figure(avgOf(a.servicesCents + a.goodsCents, a.visits), avgOf(b.servicesCents + b.goodsCents, b.visits)),
      avgService: figure(avgOf(a.servicesCents, servicesOpsA), avgOf(b.servicesCents, servicesOpsB)),
      avgGoods: figure(avgOf(a.goodsCents, a.goodsOps), avgOf(b.goodsCents, b.goodsOps)),
      days: sales,
    },
    attendance: {
      clients: figure(a.clients, b.clients),
      visits: figure(a.visits, b.visits),
      records: figure(a.records, b.records),
      online: figure(a.online, b.online),
      fresh: figure(a.fresh, b.fresh),
      regular: figure(a.regular, b.regular),
      lost: figure(lostCur, lostPrev),
      days: visitors,
    },
    fill: {
      done: figure(a.done, b.done),
      open: figure(a.open, b.open),
      cancelled: figure(a.cancelled, b.cancelled),
      noShow: figure(a.noShow, b.noShow),
      avg: figure(a.avgFill, b.avgFill),
      days: a.fill,
    },
  };
}

/* ---------- «Посмотреть клиентов» ---------- */

export const KPI_CLIENT_KINDS = ["clients", "fresh", "regular", "lost"] as const;
export type KpiClientKind = (typeof KPI_CLIENT_KINDS)[number];
/** Names in one list, at most. */
export const KPI_CLIENTS_MAX = 200;

/** A client behind a card: how often he came in the period, and his last visit (the one that lost him, for «Потерянные»). */
export type KpiClient = { id: string; name: string; visits: number; last: number };
export type KpiClients = { rows: KpiClient[]; total: number };

/**
 * The clients a card of «Посещаемость» counts, by name, the latest visit
 * first. With a login: null without «Основные показатели»; only the
 * barbers it sees and the clients it is shown. No phones.
 */
export async function kpiClients(q: Querier, business: Business, raw: KpiQuery & { kind?: unknown }, who?: Holder, now = Date.now()): Promise<KpiClients | null> {
  if (who && !can(who, "reports.dashboard")) return null;
  const k = raw?.kind;
  const kind = (KPI_CLIENT_KINDS as readonly unknown[]).includes(k) ? (k as KpiClientKind) : null;
  if (!kind) return null;
  const tz = business.timezone;
  const period = cleanPeriod(raw?.from, raw?.to, todayIn(tz, now));
  const asked = raw?.staffId;
  const staff = staffScope(who, isUuid(asked) ? asked : null);
  const params: unknown[] = [business.id];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const end = p(new Date(startOfDay(addDays(period.to, 1), tz)));
  let inner: string;
  let cond: string;
  if (kind === "lost") {
    inner = `select a.client_id, count(*)::int as visits, max(a.starts_at) as last from appointments a
              where a.business_id = $1 and a.status in ('arrived', 'done') and a.starts_at < ${end}${staffSql("a", staff, p)}
              group by a.client_id`;
    cond = ` and x.last >= ${p(new Date(startOfDay(addDays(period.from, -(LOST_DAYS + 1)), tz)))} and x.last < ${p(new Date(startOfDay(addDays(period.to, -LOST_DAYS), tz)))}`;
  } else {
    const start = p(new Date(startOfDay(period.from, tz)));
    const who2 = staffSql("a", staff, p);
    const whoB = staff ? ` and b.staff_id = any($${params.length}::uuid[])` : "";
    inner = `select a.client_id, count(*)::int as visits, max(a.starts_at) as last,
                    (select min(b.starts_at) from appointments b where b.business_id = $1 and b.client_id = a.client_id and b.status in ('arrived', 'done')${whoB}) as first
               from appointments a
              where a.business_id = $1 and a.status in ('arrived', 'done') and a.starts_at >= ${start} and a.starts_at < ${end}${who2}
              group by a.client_id`;
    cond = kind === "fresh" ? ` and x.first >= ${start}` : kind === "regular" ? ` and x.first < ${start}` : "";
  }
  const scope = seenClientsSql(who, p);
  const from = `from (${inner}) x join clients c on c.id = x.client_id where c.business_id = $1${cond}${scope}`;
  const [count] = await q<{ n: number }>(`select count(*)::int as n ${from}`, params);
  const rows = await q<{ id: string; name: string; visits: number; last: Date }>(`select c.id, c.name, x.visits, x.last ${from} order by x.last desc, c.id limit ${KPI_CLIENTS_MAX}`, params);
  return { rows: rows.map((r) => ({ id: r.id, name: r.name, visits: Number(r.visits), last: ms(r.last) })), total: Number(count?.n ?? 0) };
}

/* ---------- «Визиты»: the visits ahead and behind ---------- */

/** Rows the panel opens with (the tool shows six), and how many each «Подробнее» adds. */
export const VISITS_FIRST = 6;
export const VISITS_MORE = 20;

export type DashWhen = "upcoming" | "past";

export type DashVisit = {
  id: string;
  start: number;
  end: number;
  clientId: string;
  clientName: string;
  /** whole, masked, or none: by the login's rights */
  clientPhone: string | null;
  services: L10n[];
  staffId: string;
  staffName: string;
  status: string;
  confirmed: boolean;
  source: string;
};

/**
 * A day of the panel, whole: the visits it has (cancelled ones not), how
 * many of them the client came to and how many were no-shows. The day's
 * heading says it («12 визитов · пришли 3»), however many rows are shown.
 */
export type DashDay = { visits: number; came: number; noShow: number };

/** `days`: each day of `rows` (the salon's own, YYYY-MM-DD) as a whole. */
export type DashVisits = { rows: DashVisit[]; more: boolean; upcoming: number; days: Record<string, DashDay> };

/** What the page offers a login. The screen only hides by these; every action asks again. */
export type DashMay = {
  /** the page itself: «Визиты» */
  open: boolean;
  /** phones whole */
  phones: boolean;
  /** ✓ «Подтвердить запись»: the visit window's own right to change a visit */
  confirm: boolean;
  /** the bin «Отменить запись»: the calendar's cancel, and for a visit the client came to its own */
  cancel: boolean;
  cancelCame: boolean;
};

export function dashMay(who: Holder): DashMay {
  return {
    open: can(who, "reports.visits"),
    phones: can(who, "reports.visits.phones"),
    confirm: can(who, "visit.edit"),
    cancel: can(who, "visit.delete"),
    cancelCame: can(who, "visit.delete.arrived"),
  };
}

type DashRow = {
  id: string;
  staff_id: string;
  staff_name: string;
  client_id: string;
  client_name: string;
  phone_e164: string | null;
  starts_at: Date;
  ends_at: Date;
  status: string;
  confirmed: boolean;
  source: string;
  services: L10n[] | string;
};

const DASH_COLS = `a.id, a.staff_id, s.display_name as staff_name, a.client_id, c.name as client_name, c.phone_e164,
       a.starts_at, a.ends_at, a.status, a.confirmed_at is not null as confirmed, a.source,
       (select coalesce(json_agg(l.name order by l.position), '[]'::json) from appointment_services l where l.appointment_id = a.id) as services`;

const dashOf = (r: DashRow, phones: boolean): DashVisit => ({
  id: r.id,
  start: ms(r.starts_at),
  end: ms(r.ends_at),
  clientId: r.client_id,
  clientName: r.client_name,
  clientPhone: phones ? r.phone_e164 : maskPhone(r.phone_e164),
  services: typeof r.services === "string" ? (JSON.parse(r.services) as L10n[]) : (r.services ?? []),
  staffId: r.staff_id,
  staffName: r.staff_name,
  status: r.status,
  confirmed: r.confirmed === true,
  source: r.source,
});

/** The scope of «Записи» for this login, as a WHERE over `appointments a` joined to `clients c`, and a way to add values. */
function scoped(business: Business, who: Holder | undefined, now: number) {
  const found = recordWhere(business, cleanRecords({}), who, now);
  const params = [...found.params];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  return { where: found.where, params, p };
}

const int = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : dflt;
};

const NO_VISITS: DashVisits = { rows: [], more: false, upcoming: 0, days: {} };

/** The days of `rows` as wholes, in the same scope: what each day's heading counts. */
async function daySums(q: Querier, business: Business, rows: DashVisit[], who: Holder | undefined, now: number): Promise<Record<string, DashDay>> {
  if (!rows.length) return {};
  const tz = business.timezone;
  const keys = [...new Set(rows.map((r) => todayIn(tz, r.start)))].sort();
  const d = scoped(business, who, now);
  const sums = await q<{ day: string; visits: number; came: number; no_show: number }>(
    `select to_char(a.starts_at at time zone ${d.p(tz)}::text, 'YYYY-MM-DD') as day, count(*)::int as visits,
            count(*) filter (where a.status in ('arrived', 'done'))::int as came,
            count(*) filter (where a.status = 'no_show')::int as no_show
       from appointments a join clients c on c.id = a.client_id
      where ${d.where} and a.status <> 'cancelled'
        and a.starts_at >= ${d.p(new Date(startOfDay(keys[0], tz)))} and a.starts_at < ${d.p(new Date(startOfDay(addDays(keys[keys.length - 1], 1), tz)))}
      group by 1`,
    d.params,
  );
  const want = new Set(keys);
  return Object.fromEntries(sums.filter((s) => want.has(s.day)).map((s) => [s.day, { visits: Number(s.visits), came: Number(s.came), noShow: Number(s.no_show) }]));
}

/**
 * The left panel of «Визиты»: the visits ahead (still to end), the soonest
 * first, or behind (ended), the latest first. Cancelled ones are not
 * listed. `upcoming` is how many are ahead, for the switch; `days` each
 * listed day as a whole.
 */
export async function listDashVisits(q: Querier, business: Business, raw: { when?: unknown; offset?: unknown; limit?: unknown }, who?: Holder, now = Date.now()): Promise<DashVisits> {
  if (who && !can(who, "reports.visits")) return NO_VISITS;
  const when: DashWhen = raw?.when === "past" ? "past" : "upcoming";
  const offset = int(raw?.offset, 0, 100_000, 0);
  const limit = int(raw?.limit, 1, 100, VISITS_FIRST);
  const s = scoped(business, who, now);
  const at = s.p(new Date(now));
  const live = `${s.where} and a.status <> 'cancelled'`;
  const [count] = await q<{ n: number }>(`select count(*)::int as n from appointments a join clients c on c.id = a.client_id where ${live} and a.ends_at > ${at}`, s.params);
  const rows = await q<DashRow>(
    `select ${DASH_COLS}
       from appointments a join clients c on c.id = a.client_id join staff s on s.id = a.staff_id
      where ${live} and ${when === "upcoming" ? `a.ends_at > ${at}` : `a.ends_at <= ${at}`}
      order by a.starts_at ${when === "upcoming" ? "asc" : "desc"}, a.id
      limit ${s.p(limit + 1)} offset ${s.p(offset)}`,
    s.params,
  );
  const phones = !who || can(who, "reports.visits.phones");
  const shown = rows.slice(0, limit).map((r) => dashOf(r, phones));
  return { rows: shown, more: rows.length > limit, upcoming: Number(count?.n ?? 0), days: await daySums(q, business, shown, who, now) };
}

/* ---------- «Лента активности по записям» ---------- */

export const FEED_FILTERS = ["fresh", "all", "online", "offline"] as const;
export type FeedFilter = (typeof FEED_FILTERS)[number];
export const FEED_PAGE = 10;
/** A booking's history in the feed, at most this many rows, the latest first. */
export const FEED_LOG_MAX = 20;

/**
 * A row of a booking's history: what happened, when and by whom; for a
 * new or moved booking its time and barber after it (and before it, for a
 * move), for a status the new one.
 */
export type FeedLog = {
  at: number;
  action: string;
  by: RecordMaker;
  start: number | null;
  staffName: string | null;
  fromStart: number | null;
  fromStaffName: string | null;
  status: string | null;
  confirmed: boolean;
};

export type FeedEntry = DashVisit & { comment: string; createdAt: number; lastAt: number; log: FeedLog[] };

/** The feed's page; `fresh` is «новые онлайн (N)»: bookings made online, still ahead, that nobody has confirmed. */
export type Feed = { entries: FeedEntry[]; more: boolean; fresh: number };

/** «новые онлайн»: made online by the client, still waiting and ahead, not confirmed (✓) yet. */
const FRESH_SQL = (at: string) => ` and a.source = 'online' and a.status in ('pending', 'booked') and a.confirmed_at is null and a.starts_at > ${at}`;

/** The audit's actor as a maker: a login by its name, the client, or the salon (visit-window.ts says it the same way). */
function actorOf(actor: string, name: string | null, email: string | null): RecordMaker {
  if (name || email) return { kind: "user", name: name || (email ?? "").split("@")[0] };
  if (actor === "client") return { kind: "client", name: "" };
  return { kind: "salon", name: "" };
}

/**
 * The feed of «Визиты»: the bookings something happened to (an audit row:
 * made, moved, changed, a status, cancelled, a barber's note), the latest
 * first, with their history. A booking that nothing happened to here (one
 * imported) is not in it.
 */
export async function listFeed(q: Querier, business: Business, raw: { filter?: unknown; offset?: unknown }, who?: Holder, now = Date.now()): Promise<Feed> {
  if (who && !can(who, "reports.visits")) return { entries: [], more: false, fresh: 0 };
  const f = raw?.filter;
  const filter: FeedFilter = (FEED_FILTERS as readonly unknown[]).includes(f) ? (f as FeedFilter) : "all";
  const offset = int(raw?.offset, 0, 100_000, 0);
  // two questions with their own values: a value a question does not use has no type for Postgres
  const k = scoped(business, who, now);
  // counted as the filter lists them: bookings with a history here (an imported one has none)
  const [fresh] = await q<{ n: number }>(
    `select count(*)::int as n from appointments a join clients c on c.id = a.client_id
      where ${k.where}${FRESH_SQL(k.p(new Date(now)))}
        and exists (select 1 from audit au where au.entity = 'appointment' and au.entity_id = a.id)`,
    k.params,
  );
  const s = scoped(business, who, now);
  const cond = filter === "fresh" ? FRESH_SQL(s.p(new Date(now))) : filter === "online" ? " and a.source = 'online'" : filter === "offline" ? " and a.source <> 'online'" : "";
  const rows = await q<DashRow & { client_comment: string; created_at: Date; last_at: Date }>(
    `select ${DASH_COLS}, a.client_comment, a.created_at, f.last_at
       from (select au.entity_id as id, max(au.at) as last_at from audit au
              where au.entity = 'appointment' and au.entity_id is not null group by au.entity_id) f
       join appointments a on a.id = f.id
       join clients c on c.id = a.client_id
       join staff s on s.id = a.staff_id
      where ${s.where}${cond}
      order by f.last_at desc, a.id
      limit ${s.p(FEED_PAGE + 1)} offset ${s.p(offset)}`,
    s.params,
  );
  const page = rows.slice(0, FEED_PAGE);
  const ids = page.map((r) => r.id);
  type LogRow = { entity_id: string; at: Date; action: string; actor: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; name: string | null; email: string | null };
  const [logs, staff] = ids.length
    ? await Promise.all([
        q<LogRow>(
          `select au.entity_id, au.at, au.action, au.actor, au.before, au.after, u.name, coalesce(u.deleted_was->>'email', u.email) as email
             from audit au left join users u on u.business_id = $1 and u.id::text = au.actor
            where au.entity = 'appointment' and au.entity_id = any($2::uuid[])
            order by au.at desc, au.id desc`,
          [business.id, ids],
        ),
        q<{ id: string; display_name: string }>("select id, display_name from staff where business_id = $1", [business.id]),
      ])
    : ([[], []] as [LogRow[], { id: string; display_name: string }[]]);
  const staffName = new Map(staff.map((x) => [x.id, x.display_name]));
  const nameOf = (id: unknown) => (typeof id === "string" ? (staffName.get(id) ?? null) : null);
  const time = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : null);
  const phones = !who || can(who, "reports.visits.phones");
  return {
    entries: page.map((r) => ({
      ...dashOf(r, phones),
      comment: r.client_comment ?? "",
      createdAt: ms(r.created_at),
      lastAt: ms(r.last_at),
      log: logs
        .filter((l) => l.entity_id === r.id)
        .slice(0, FEED_LOG_MAX)
        .map((l): FeedLog => {
          const placed = l.action === "create" || l.action === "move" || l.action === "edit";
          const moved = l.action === "move";
          return {
            at: ms(l.at),
            action: l.action,
            by: actorOf(l.actor, l.name, l.email),
            start: placed ? time(l.after?.starts_at) : null,
            staffName: placed ? nameOf(l.after?.staff_id) : null,
            fromStart: moved ? time(l.before?.starts_at) : null,
            fromStaffName: moved ? nameOf(l.before?.staff_id) : null,
            status: l.action === "status" || l.action === "cancel" ? (typeof l.after?.status === "string" ? l.after.status : null) : null,
            confirmed: l.action === "status" && l.after?.confirmed === true,
          };
        }),
    })),
    more: rows.length > FEED_PAGE,
    fresh: Number(fresh?.n ?? 0),
  };
}

/* ---------- one visit, for the journal's visit window ---------- */

/**
 * One visit of «Визиты» as the journal's visit window wants it: one the
 * page would show this login (the scope of «Записи»), cut by the
 * calendar's own rules for it. Null: no such visit, or not one it may open.
 */
export async function dashVisitForSheet(q: Querier, business: Business, who: Holder, id: string, now = Date.now()): Promise<VisitForSheet | null> {
  if (!can(who, "reports.visits") || !isUuid(id)) return null;
  const s = scoped(business, who, now);
  const [hit] = await q<{ id: string }>(`select a.id from appointments a join clients c on c.id = a.client_id where ${s.where} and a.id = ${s.p(id)}`, s.params);
  if (!hit) return null;
  const all = await loadVisitData(q, business, id);
  if (!all) return null;
  const today = todayIn(business.timezone, now);
  const data = calendarFor(who, all, today);
  return data.visits.length ? { data, may: calendarMay(who, today) } : null;
}
