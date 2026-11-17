/**
 * Phone numbers to E.164 ("+3725xxxxxxx"), which is how clients are matched.
 * A number typed without a country code is Estonian.
 */
export function normalizePhone(input: string, defaultCountry = "372"): string | null {
  let s = String(input ?? "").trim();
  if (!s) return null;
  s = s.replace(/[\s().\- ]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) {
    if (!/^\d+$/.test(s)) return null;
    // 372 5123 4567 typed without the plus
    if (s.startsWith(defaultCountry) && s.length >= defaultCountry.length + 7) s = "+" + s;
    else s = "+" + defaultCountry + s.replace(/^0+/, "");
  }
  if (!/^\+[1-9]\d{6,14}$/.test(s)) return null;
  // Estonian numbers are 7 or 8 digits after +372.
  if (s.startsWith("+372") && !/^\+372\d{7,8}$/.test(s)) return null;
  return s;
}
