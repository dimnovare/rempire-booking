/**
 * What the table and a service's window both say: a price, a time, a
 * typed sum of euros, a barber's tile. No React here.
 */
import { effective, sumUp, type Base, type PriceSum, type TimeSum } from "@/lib/admin/service-board";
import type { BoardBarber, BoardService } from "@/lib/admin/services";
import { eur, type Copy } from "../../copy";

/** «35 €», «30–35 €», «от 35 €». */
export const priceText = (A: Copy, p: PriceSum) => (p.kind === "one" ? eur(p.cents) : p.kind === "range" ? `${eur(p.from).replace(" €", "")}–${eur(p.to)}` : A.services.from(eur(p.from)));
/** «45 мин», «1 ч», «Индивидуально». */
export const timeText = (A: Copy, t: TimeSum) => (t.kind === "one" ? A.mins(t.min) : A.services.each);

/** A typed sum of euros («35», «35,5», «35.50») in cents; null when it is not one. */
export function toCents(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
/** Cents as a field shows them: «35», «35.50». */
export const fromCents = (c: number) => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));

/** A tile's letter. */
export const initial = (name: string) => (name.trim().charAt(0) || "?").toUpperCase();

export const baseOf = (s: Pick<BoardService, "priceCents" | "priceMaxCents" | "durationMin">): Base => ({ priceCents: s.priceCents, priceMaxCents: s.priceMaxCents, durationMin: s.durationMin });

/** A row of the table: the barbers who do it (working ones, in their order) and what the row says about them. */
export function rowSum(s: BoardService, barbers: readonly BoardBarber[]) {
  const base = baseOf(s);
  const by = new Map(s.offers.filter((o) => o.offered).map((o) => [o.staffId, o]));
  const who = barbers.filter((b) => by.has(b.id));
  return { who, ...sumUp(base, who.map((b) => effective(base, by.get(b.id)!))) };
}

/** Does a service's name, in any of its languages, have what was typed? */
export const matches = (s: Pick<BoardService, "name">, q: string) => {
  const t = q.trim().toLocaleLowerCase();
  return !t || [s.name.ru, s.name.et, s.name.en].some((n) => n?.toLocaleLowerCase().includes(t));
};
