/**
 * Money for Phase C: integer cents and basis points only, never floats in
 * the database (docs/phase-c.md).
 *
 * One convention everywhere: an amount a barber pays has its VAT inside
 * (gross), as the shop's prices do. A line's net and VAT parts are split at
 * the line's own rate; with no VAT the whole amount is net.
 *
 * The 17 % (decision 16, Renat Q1) is taken from one of three bases, a
 * setting (settings.commission_basis):
 *   net-paid    the price paid, VAT taken out (the recommended start);
 *   gross-paid  the price paid, VAT inside;
 *   gross-list  the shop's price, VAT inside, whatever was paid.
 * A barber taking a product for himself pays the purchase price and earns
 * nothing on it.
 */

export type Basis = "net-paid" | "gross-paid" | "gross-list";
export const BASES: readonly Basis[] = ["net-paid", "gross-paid", "gross-list"];
export const isBasis = (v: unknown): v is Basis => typeof v === "string" && (BASES as readonly string[]).includes(v);

/** Round half away from zero, so a minus row is the exact mirror of its sale. */
export function roundHalf(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/** The part of a gross amount that is not VAT. */
export function netOf(grossCents: number, vatBp: number): number {
  if (!vatBp) return grossCents;
  return roundHalf((grossCents * 10000) / (10000 + vatBp));
}

/** gross → { net, vat }: the two always add up to the gross. */
export function splitGross(grossCents: number, vatBp: number): { net: number; vat: number } {
  const net = netOf(grossCents, vatBp);
  return { net, vat: grossCents - net };
}

/** A purchase price (VAT not inside) → what a barber pays for it, VAT inside. */
export function grossOfNet(netCents: number, vatBp: number): number {
  return roundHalf((netCents * (10000 + vatBp)) / 10000);
}

/** The barber's share of a client sale, for the whole row (signed like qty). */
export function commissionFor(s: { qty: number; unitCents: number; listCents: number; vatBp: number; basis: Basis; bp: number }): number {
  const base = s.basis === "gross-list" ? s.listCents : s.basis === "gross-paid" ? s.unitCents : (s.unitCents * 10000) / (10000 + s.vatBp);
  return roundHalf((s.qty * base * s.bp) / 10000);
}

/** A line of an invoice: qty × unit − discount, split at its rate. */
export function lineAmounts(l: { qty: number; unitCents: number; discountCents: number; vatBp: number }): { gross: number; net: number; vat: number } {
  const gross = l.qty * l.unitCents - l.discountCents;
  return { gross, ...splitGross(gross, l.vatBp) };
}

/** «24,90» — comma decimals, as on an Estonian invoice and in the CSV. */
export function amountText(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  return `${neg ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** «24,90 €» */
export const euroText = (cents: number) => `${amountText(cents)} €`;

/** «17 %», «24 %», «13,5 %» */
export function bpText(bp: number): string {
  const p = bp / 100;
  return `${Number.isInteger(p) ? p : String(p).replace(".", ",")} %`;
}

/** «24,90» or «24.90» or «24» → 2490; null if it is not an amount. */
export function parseCents(s: string): number | null {
  const t = String(s ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d{1,7}(\.\d{1,2})?$/.test(t)) return null;
  return roundHalf(Number(t) * 100);
}
