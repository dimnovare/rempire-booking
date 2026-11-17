/** What the barber app's three dictionaries share. No words here. */
import { INTL, type Locale } from "@/lib/i18n";
import { localParts } from "@/lib/tz";

/** Russian: 1 запись, 2 записи, 5 записей. */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Estonian and English: 1 broneering, 2 broneeringut. */
export const pl = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const eur = (cents: number) => {
  const e = cents / 100;
  return `${Number.isInteger(e) ? e : e.toFixed(2)} €`;
};

/** «1 ч 15 мин», «45 min». */
export const minsText = (n: number, h: string, min: string) => {
  const hours = Math.floor(n / 60);
  const m = n % 60;
  return hours ? `${hours} ${h}${m ? ` ${m} ${min}` : ""}` : `${m} ${min}`;
};

export type Text3 = { ru?: string; et?: string; en?: string } | null | undefined;

/** A jsonb {ru, et, en} text in `lang`, else any. */
export const pick3 = (t: Text3, lang: Locale) => t?.[lang] || t?.ru || t?.et || t?.en || "";

/** «14:00» on the business's wall clock. */
export const hm = (ms: number, tz: string) => localParts(ms, tz).time;

const dateFmt = new Map<string, Intl.DateTimeFormat>();

/** A local date (YYYY-MM-DD) as words: «вт, 17 ноября». Noon UTC, so no zone can move the day. */
export function dateWords(date: string, lang: Locale, o: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "long" }): string {
  const key = `${lang}:${JSON.stringify(o)}`;
  let f = dateFmt.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(INTL[lang], { ...o, timeZone: "UTC" });
    dateFmt.set(key, f);
  }
  return f.format(new Date(`${date}T12:00:00Z`));
}

/** «17.11» */
export const ddmm = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}`;

/** «вт, 17 ноября» → «Вт, 17 ноября» */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
