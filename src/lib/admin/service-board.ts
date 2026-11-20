/**
 * «Услуги» as a table (Dim, decisions round 11; the design boards «Услуги,
 * таблица» and «Услуга, окно»): what a row and a service's window say about
 * the barbers who do it. No database and no Next.js: the page, the window,
 * the server's save and the tests read the same functions.
 *
 * A barber's row (staff_services) keeps his own price and time, or null for
 * «the service's base». The window shows each barber's price and time as
 * numbers and marks «своя» where it differs from the base; a number equal
 * to the base is stored as null, so it moves when the base moves («По
 * умолчанию берутся базовые»).
 */

/** The service's own price and time. */
export type Base = { priceCents: number; priceMaxCents: number | null; durationMin: number };
/** A barber's row as stored: null is «the base». */
export type Stored = { priceCents: number | null; priceMaxCents: number | null; durationMin: number | null };
/** What the client pays and how long it takes with him. */
export type Eff = { priceCents: number; priceMaxCents: number | null; durationMin: number };

/**
 * A barber's price and time. Without a price of his own he has the base's
 * price with its top («30–35 €»); with one, his own top if it is above it.
 * The same rule as «Список услуг» (serviceList) and the booking's sums.
 */
export function effective(base: Base, o: Stored): Eff {
  const durationMin = o.durationMin ?? base.durationMin;
  if (o.priceCents == null) return { priceCents: base.priceCents, priceMaxCents: base.priceMaxCents != null && base.priceMaxCents > base.priceCents ? base.priceMaxCents : null, durationMin };
  return { priceCents: o.priceCents, priceMaxCents: o.priceMaxCents != null && o.priceMaxCents > o.priceCents ? o.priceMaxCents : null, durationMin };
}

/** The table's «Цена»: one price, the base's range, or «от» the lowest when the barbers' differ. */
export type PriceSum = { kind: "one"; cents: number } | { kind: "range"; from: number; to: number } | { kind: "from"; from: number };
/** The table's «Длительность»: one time, or «Индивидуально» when the barbers' differ. */
export type TimeSum = { kind: "one"; min: number } | { kind: "each"; from: number; to: number };

/**
 * «Итоговая цена» and «Итоговая длительность» over the barbers who do the
 * service. Nobody does it: the base's own.
 */
export function sumUp(base: Base, offered: readonly Eff[]): { price: PriceSum; time: TimeSum; nobody: boolean } {
  const list: Eff[] = offered.length ? [...offered] : [effective(base, { priceCents: null, priceMaxCents: null, durationMin: null })];
  const first = list[0];
  const samePrice = list.every((e) => e.priceCents === first.priceCents && (e.priceMaxCents ?? null) === (first.priceMaxCents ?? null));
  const price: PriceSum = !samePrice
    ? { kind: "from", from: Math.min(...list.map((e) => e.priceCents)) }
    : first.priceMaxCents != null && first.priceMaxCents > first.priceCents
      ? { kind: "range", from: first.priceCents, to: first.priceMaxCents }
      : { kind: "one", cents: first.priceCents };
  const mins = list.map((e) => e.durationMin);
  const lo = Math.min(...mins);
  const hi = Math.max(...mins);
  return { price, time: lo === hi ? { kind: "one", min: lo } : { kind: "each", from: lo, to: hi }, nobody: offered.length === 0 };
}

/** «своя»: his price or time is not the base's. */
export const ownPrice = (base: Base, e: Eff) => e.priceCents !== base.priceCents || (e.priceMaxCents ?? null) !== (base.priceMaxCents != null && base.priceMaxCents > base.priceCents ? base.priceMaxCents : null);
export const ownTime = (base: Base, e: Eff) => e.durationMin !== base.durationMin;

/**
 * What to store for a barber whose price and time are typed as numbers: the
 * base's own number is «the base» (null). His own top («до») stays while it
 * is above his price; a price of the base drops it, as the barber app does.
 */
export function toStore(base: Base, cur: Stored | null, typed: { priceCents: number; durationMin: number }): Stored {
  const durationMin = typed.durationMin === base.durationMin ? null : typed.durationMin;
  if (typed.priceCents === base.priceCents) return { priceCents: null, priceMaxCents: null, durationMin };
  const top = cur?.priceCents != null && cur.priceMaxCents != null && cur.priceMaxCents > typed.priceCents ? cur.priceMaxCents : null;
  return { priceCents: typed.priceCents, priceMaxCents: top, durationMin };
}

/**
 * When the base moves, a row that had the old base's own number follows it:
 * it is stored as null and moves with the base. A row with a number of its
 * own keeps it, and a part of the base that did not move changes nothing.
 */
export function followBase(old: Base, next: Base, cur: Stored): Stored {
  const priceMoved = old.priceCents !== next.priceCents || (old.priceMaxCents ?? null) !== (next.priceMaxCents ?? null);
  const follows = priceMoved && cur.priceCents != null && cur.priceCents === old.priceCents && (cur.priceMaxCents == null || cur.priceMaxCents === old.priceMaxCents);
  const timeFollows = old.durationMin !== next.durationMin && cur.durationMin != null && cur.durationMin === old.durationMin;
  return {
    priceCents: follows ? null : cur.priceCents,
    priceMaxCents: follows ? null : cur.priceMaxCents,
    durationMin: timeFollows ? null : cur.durationMin,
  };
}

export const sameStored = (a: Stored, b: Stored) => (a.priceCents ?? null) === (b.priceCents ?? null) && (a.priceMaxCents ?? null) === (b.priceMaxCents ?? null) && (a.durationMin ?? null) === (b.durationMin ?? null);
export const sameEff = (a: Eff, b: Eff) => a.priceCents === b.priceCents && (a.priceMaxCents ?? null) === (b.priceMaxCents ?? null) && a.durationMin === b.durationMin;

/** The lengths a barber's time picks from: every 5 minutes to 4 hours, then every 15 to 12 hours. */
export const LENGTHS: readonly number[] = [...Array.from({ length: 48 }, (_, i) => (i + 1) * 5), ...Array.from({ length: 32 }, (_, i) => 240 + (i + 1) * 15)];

/** The choices for a time, with the one it has now when it is not among them. */
export const lengthsWith = (min: number) => (LENGTHS.includes(min) ? LENGTHS : [...LENGTHS, min].sort((a, b) => a - b));

/** A service's length in the window: 0–12 hours and 0–55 minutes in fives; 5 minutes to 12 hours in all. */
export const HOURS: readonly number[] = Array.from({ length: 13 }, (_, i) => i);
export const MINUTES: readonly number[] = Array.from({ length: 12 }, (_, i) => i * 5);
export const MIN_LENGTH = 5;
export const MAX_LENGTH = 720;

/** The tidy-up time after a visit, as the window offers it. */
export const BUFFERS: readonly number[] = [0, 5, 10, 15, 20, 30];
