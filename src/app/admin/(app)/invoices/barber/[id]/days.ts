/**
 * A barber's month in «Счета» (page.tsx): his sales by the salon's day,
 * and the months named on the page. Pure, so the tests read it as it is.
 */
import type { Sale } from "@/lib/sales";

type DaySale = Pick<Sale, "createdAt" | "status" | "totalCents" | "reversesId">;

/** One day of sales: «6 ноября · 1 продажа · 24,90 €». */
export type SaleDay<S> = { date: string; sales: S[]; count: number; cents: number };

/**
 * Sales by the salon's day, the newest day first; each day keeps the
 * sales in the order given (listSales: the newest first). As the barber's
 * own «Мои расчёты» counts them: `count` is the sales that stand (not
 * undone, not a minus row); `cents` is what stands, a minus row taking its
 * sale back.
 */
export function salesByDay<S extends DaySale>(sales: S[], tz: string): SaleDay<S>[] {
  const f = new Intl.DateTimeFormat("sv-SE", { timeZone: tz });
  const days = new Map<string, SaleDay<S>>();
  for (const s of sales) {
    const date = f.format(new Date(s.createdAt));
    let d = days.get(date);
    if (!d) days.set(date, (d = { date, sales: [], count: 0, cents: 0 }));
    d.sales.push(s);
    if (s.status !== "done") continue;
    d.cents += s.totalCents;
    if (!s.reversesId) d.count++;
  }
  return [...days.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * Months as words, for «Продажи ни в одном счёте · октябрь, ноябрь»: each
 * by its name from `names` (twelve, January first), with its year when it
 * is not the year of the month on the page.
 */
export function monthWords(months: string[], names: readonly string[], pageYear: string): string {
  return months.map((m) => `${names[Number(m.slice(5, 7)) - 1]}${m.slice(0, 4) === pageYear ? "" : ` ${m.slice(0, 4)}`}`).join(", ");
}
