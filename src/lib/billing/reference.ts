/**
 * The reference number for the payment («Viitenumber», Isolta's
 * «Референц-номер для оплаты»), as Isolta fills it by itself: the invoice's
 * number and one check digit (docs/isolta-pages.md, «Reference number
 * rule»). Estonian banks check it by the same 7-3-1 rule as Finnish ones:
 * the digits weighted 7, 3, 1, 7, 3, 1, … from the rightmost one; the check
 * digit is what takes the sum up to the next ten (0 when it is one already).
 * Invoice 423 → 4239.
 *
 * Only the digits of the number count, so «DEMO-2026-0001» has one too
 * (202600017); leading zeros are dropped, as a bank drops them. Computed,
 * never stored: an issued invoice's number never changes, so neither does
 * its reference, and Isolta's imported invoices get theirs the same way.
 *
 * Pure, for the list in the browser as for the PDF on the server.
 */

/** The longest reference Estonian and Finnish banks take: 20 digits with the check digit. */
const MAX = 20;

const WEIGHTS = [7, 3, 1];

/** The 7-3-1 check digit of a string of digits. */
export function checkDigit731(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += Number(digits[digits.length - 1 - i]) * WEIGHTS[i % 3];
  return (10 - (sum % 10)) % 10;
}

/** The reference for an invoice number; "" when the number has no digit other than zeros, or too many. */
export function referenceNumber(number: string | null | undefined): string {
  const base = String(number ?? "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
  if (!base || base.length > MAX - 1) return "";
  return `${base}${checkDigit731(base)}`;
}
