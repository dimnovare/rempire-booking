/**
 * The booking page's free times, a page of days at a time. The horizon
 * («Настройки → Онлайн-запись», «Запись открыта на») goes up to 365 days
 * (src/lib/admin/online-form.ts, HORIZON_MAX), so nothing works out all of
 * it up front:
 *
 *   - /api/slots and /api/visit/<token>/slots answer SLOTS_DAYS_MAX days at
 *     most (`days`, from `from`) and say where the next page starts
 *     (`next`), null when the horizon, or the last day anyone asked for may
 *     be offered (his «График до»), ends within this one;
 *   - the booking page (src/app/[locale]/booking-flow.tsx) asks SLOT_PAGE
 *     days first, then one page more only while no free day has been found
 *     yet, or when its calendar shows a month past what it has (pageToAsk).
 *
 * The booking itself and the client's move check one day only
 * (src/lib/booking.ts, src/lib/client-move.ts). No database and no Node:
 * the routes, the page and the tests share these.
 */
import { addDays } from "./tz";

/** The most days one ask answers. */
export const SLOTS_DAYS_MAX = 92;
/** The days the booking page asks at a time: this month and the next, as the horizon of 60 days was asked before. */
export const SLOT_PAGE = 62;

/** The days an ask covers: as asked, 1 to SLOTS_DAYS_MAX; none or nonsense is 60. */
export function pageDays(raw: string | null | undefined): number {
  return Math.min(Math.max(Number(raw || 60) || 60, 1), SLOTS_DAYS_MAX);
}

/** Where the page after `days` days from `from` starts; null when `lastDay` (the last day offered) is inside this page, or none is. */
export function nextPage(from: string, days: number, lastDay: string | null): string | null {
  if (!lastDay) return null;
  const next = addDays(from, days);
  return next <= lastDay ? next : null;
}

/** "2027-02" → "2027-02-28" */
export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** "2026-12" and 1 → "2027-01" */
export function monthStep(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

/**
 * The page the booking page asks for next, or null: the next one there is,
 * while no free day has been found yet (`found`), or when the calendar wants
 * a day in it (`wantTo`: the last day of the month it shows, or the day the
 * client picked, whichever is later).
 */
export function pageToAsk(next: string | null, found: boolean, wantTo: string): string | null {
  if (!next) return null;
  return !found || next <= wantTo ? next : null;
}
