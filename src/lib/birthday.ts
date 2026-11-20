/**
 * A client's birthday (018_client_card.sql). The year may be unknown:
 * people say «14 марта» and stop there. So it is three numbers, day, month
 * and year, the year null when nobody knows it; never a date with a made-up
 * year in it.
 *
 * Nothing but arithmetic here: the card's form in the browser checks a
 * birthday with the same function the server does.
 */

/** A birthday: the year is null when it is not known. */
export type Birthday = { day: number; month: number; year: number | null };

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const two = (n: number) => String(n).padStart(2, "0");
const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DMY = /^(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*[./-]\s*(\d{4}))?\.?$/;

/**
 * A birthday as it is typed: «14.03.1990», «14.03» (the year not known),
 * «14/3/1990», or the «1990-03-14» a date picker gives. Nothing typed is
 * «no birthday» (value null). Not a day of the calendar, a year before 1900
 * or a day after `today` (YYYY-MM-DD) is refused; 29 February without a
 * year is fine, with a year only in a leap one.
 */
export function parseBirthday(raw: unknown, today: string): { ok: true; value: Birthday | null } | { ok: false } {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: true, value: null };
  let day: number;
  let month: number;
  let year: number | null;
  const iso = ISO.exec(s);
  const dmy = DMY.exec(s);
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [day, month, year] = [Number(dmy[1]), Number(dmy[2]), dmy[3] ? Number(dmy[3]) : null];
  else return { ok: false };
  if (month < 1 || month > 12 || day < 1 || day > MONTH_DAYS[month - 1]) return { ok: false };
  if (year !== null) {
    if (year < 1900 || (month === 2 && day === 29 && !leap(year))) return { ok: false };
    if (`${year}-${two(month)}-${two(day)}` > today) return { ok: false };
  }
  return { ok: true, value: { day, month, year } };
}

/**
 * Whose birthday is it on this local day (YYYY-MM-DD)? The day and month to
 * look for, and `feb29`: in a year without 29 February, the clients born on
 * it are greeted on the 28th (src/lib/outbox.ts, the birthday greeting).
 */
export function birthdayMatch(date: string): { month: number; day: number; feb29: boolean } {
  const [y, month, day] = date.split("-").map(Number);
  return { month, day, feb29: month === 2 && day === 28 && !leap(y) };
}

/** Is this the birthday's day in that local day (YYYY-MM-DD)? */
export function isBirthdayOn(b: Pick<Birthday, "day" | "month"> | null | undefined, date: string): boolean {
  if (!b) return false;
  const m = birthdayMatch(date);
  return (b.month === m.month && b.day === m.day) || (m.feb29 && b.month === 2 && b.day === 29);
}

/** «14.03.1990», or «14.03» when the year is not known; "" for none. */
export function birthdayText(b: Birthday | null | undefined): string {
  return b ? `${two(b.day)}.${two(b.month)}${b.year ? `.${b.year}` : ""}` : "";
}
