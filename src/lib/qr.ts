/**
 * A QR code as one SVG path, drawn on the server: no script in the page,
 * sharp at any print size. The salon's plaque at the reception (Renat,
 * 18.11.2026: «Да, одна на салон», «ресепшн»; src/app/admin/plaque).
 *
 * The encoder is qrcode-generator (MIT, no dependencies). Level M takes up
 * to 15 % of a smudged or scratched code; the quiet zone round it is the
 * four modules the standard asks for, inside the viewBox, so the plaque
 * cannot crowd it.
 */
import qrcode from "qrcode-generator";

export const QR_QUIET = 4;

export type Qr = {
  /** modules a side, the quiet zone included: the viewBox is 0 0 size size */
  size: number;
  /** every dark module as one path, a 1×1 square each */
  d: string;
  /** the matrix itself, row by row (tests decode it back) */
  dark: (row: number, col: number) => boolean;
};

export function qrOf(text: string): Qr {
  const code = qrcode(0, "M");
  code.addData(text, "Byte");
  code.make();
  const n = code.getModuleCount();
  const parts: string[] = [];
  for (let r = 0; r < n; r++) {
    // a run of dark modules in a row is one rectangle: a third of the path a module each would take
    for (let c = 0; c < n; c++) {
      if (!code.isDark(r, c)) continue;
      let end = c;
      while (end + 1 < n && code.isDark(r, end + 1)) end++;
      parts.push(`M${c + QR_QUIET} ${r + QR_QUIET}h${end - c + 1}v1h-${end - c + 1}z`);
      c = end;
    }
  }
  const size = n + 2 * QR_QUIET;
  const dark = (row: number, col: number) => {
    const r = row - QR_QUIET;
    const c = col - QR_QUIET;
    return r >= 0 && c >= 0 && r < n && c < n && code.isDark(r, c);
  };
  return { size, d: parts.join(""), dark };
}
