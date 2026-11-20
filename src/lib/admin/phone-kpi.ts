/**
 * «Отчёты» on a phone (Dim, decision round 11: «Отчёты» is a tab of
 * Renat's phone; the design board «Отчёты как вкладка телефона»): the
 * phone's «Основные показатели» as one screen. A wide screen keeps the full
 * page (analytics/kpi-view.tsx); both read the same figures
 * (dashboards.ts, kpiReport), so a number means the same on either.
 *
 *   День · Неделя · Месяц · Период   the period: one day, its week (Monday
 *                    to Sunday), a whole calendar month, or two days;
 *   «Сотрудник»      everyone the login sees in the journal, or one of them;
 *   «Выручка»        «Итого» of the wide page, against the period before:
 *                    the day before, the week before, the whole month before
 *                    («к октябрю»), or the same number of days before;
 *   the bars         seven, Monday first: a day shows its week, the day
 *                    itself yellow; a week its seven days, a month and a
 *                    period the sum of each weekday, the best one yellow;
 *   the rows         Клиенты / Средний чек («Средняя стоимость визита»),
 *                    Записи / Онлайн (the share made online), Не пришли /
 *                    Отменили, Товары / Продано барберами (the barbers'
 *                    sales, their count and sum), Загрузка (the minutes
 *                    booked over the minutes worked, the whole period).
 *
 * No Next.js in here: the page and the action call it, the tests too.
 */
import type { Holder } from "../auth/rights";
import type { Business } from "../availability";
import type { Querier } from "../db";
import { addDays, isLocalDate, todayIn } from "../tz";
import { cleanPeriod, kpiReport, periodDates, type Figure, type Period } from "./dashboards";

export const PHONE_PERS = ["day", "week", "month", "range"] as const;
export type PhonePer = (typeof PHONE_PERS)[number];

/** What the phone asks: the kind of period, a day in it («2026-11-20»; a month may be «2026-11»), the end of «Период», a barber. */
export type PhoneKpiQuery = { per?: unknown; at?: unknown; to?: unknown; staffId?: unknown };

/** A bar: the weekday (0 Monday … 6 Sunday) and its revenue in cents. */
export type PhoneBar = { weekday: number; cents: number };

export type PhoneKpi = {
  per: PhonePer;
  period: Period;
  prev: Period;
  /** the barber picked, as applied; null: everyone the login sees */
  staffId: string | null;
  /** «Выручка»: services and goods, cents */
  revenue: Figure;
  bars: PhoneBar[];
  /** the yellow bar's index, -1 for none */
  lit: number;
  clients: number;
  /** «Средний чек», cents */
  avgCents: number;
  records: number;
  /** the share of the records made online, whole per cent */
  onlinePct: number;
  noShows: number;
  cancelled: number;
  /** the barbers' product sales: how many, and their sum in cents */
  goods: number;
  goodsCents: number;
  /** the booked share of the working time, whole per cent; null when nobody worked */
  loadPct: number | null;
};

/** Monday 0 … Sunday 6. */
export const weekdayOf = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
/** The Monday of a day's week. */
export const mondayOf = (date: string) => addDays(date, -weekdayOf(date));
const lastOfMonth = (first: string) => addDays(addDays(first, 32).slice(0, 8) + "01", -1);

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null => ((list as readonly string[]).includes(v as string) ? (v as T) : null);

/**
 * The days a phone period covers. A day that is not one is today; a month
 * may be asked as «2026-11» or by any of its days.
 */
export function phonePeriod(per: PhonePer, at: unknown, to: unknown, today: string): Period {
  const month = typeof at === "string" && /^\d{4}-\d{2}$/.test(at) ? `${at}-01` : null;
  const day = isLocalDate(at) ? at : (month ?? today);
  if (per === "day") return { from: day, to: day };
  if (per === "week") return { from: mondayOf(day), to: addDays(mondayOf(day), 6) };
  if (per === "month") {
    const first = day.slice(0, 8) + "01";
    return { from: first, to: lastOfMonth(first) };
  }
  return cleanPeriod(isLocalDate(at) ? at : null, to, today);
}

/** Seven bars, Monday first: the sum of each weekday's revenue over the days given. */
export function weekdayBars(days: { date: string; cents: number }[]): PhoneBar[] {
  const bars = Array.from({ length: 7 }, (_, weekday) => ({ weekday, cents: 0 }));
  for (const d of days) bars[weekdayOf(d.date)].cents += d.cents;
  return bars;
}

/** The best bar, or -1 when every bar is empty. */
export const bestBar = (bars: PhoneBar[]) => bars.reduce((best, b, i) => (b.cents > 0 && (best < 0 || b.cents > bars[best].cents) ? i : best), -1);

/**
 * The phone's figures for a period. With a login: null without «Основные
 * показатели», and only the barbers it sees (kpiReport's own rule).
 */
export async function phoneKpi(q: Querier, business: Business, raw: PhoneKpiQuery, who?: Holder, now = Date.now()): Promise<PhoneKpi | null> {
  const today = todayIn(business.timezone, now);
  const per = oneOf(PHONE_PERS, raw?.per) ?? "month";
  const period = phonePeriod(per, raw?.at, raw?.to, today);
  const report = await kpiReport(q, business, { from: period.from, to: period.to, staffId: raw?.staffId, compare: per === "month" ? "month" : undefined }, who, now);
  if (!report) return null;
  const S = report.sales;
  const byDay = S.days.map((d) => ({ date: d.date, cents: d.servicesCents + d.goodsCents }));

  let bars: PhoneBar[];
  let lit: number;
  if (per === "day") {
    // one day: its whole week, the day itself yellow
    const week = { from: mondayOf(period.from), to: addDays(mondayOf(period.from), 6) };
    const around = await kpiReport(q, business, { from: week.from, to: week.to, staffId: report.staffId }, who, now);
    const cents = new Map((around?.sales.days ?? []).map((d) => [d.date, d.servicesCents + d.goodsCents]));
    bars = periodDates(week).map((date) => ({ weekday: weekdayOf(date), cents: cents.get(date) ?? 0 }));
    lit = weekdayOf(period.from);
  } else {
    bars = weekdayBars(byDay);
    lit = bestBar(bars);
  }

  const F = report.fill;
  const shift = F.days.reduce((n, d) => n + d.shiftMin, 0);
  const busy = F.days.reduce((n, d) => n + d.busyMin, 0);
  const records = report.attendance.records.cur;
  return {
    per,
    period: report.period,
    prev: report.prev,
    staffId: report.staffId,
    revenue: S.total,
    bars,
    lit,
    clients: report.attendance.clients.cur,
    avgCents: S.avgVisit.cur,
    records,
    onlinePct: records ? Math.round((report.attendance.online.cur * 100) / records) : 0,
    noShows: F.noShow.cur,
    cancelled: F.cancelled.cur,
    goods: S.goodsOps.cur,
    goodsCents: S.goods.cur,
    loadPct: shift > 0 ? Math.round(Math.min(100, (busy * 100) / shift)) : null,
  };
}
