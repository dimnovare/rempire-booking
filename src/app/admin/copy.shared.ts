/** What the three dictionaries share. No words here. */

/** Russian: 1 запись, 2 записи, 5 записей. */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Estonian and English: 1 broneering, 2 broneeringut; 1 visit, 2 visits. */
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
