/**
 * The app's two public addresses (docs/launch.md B3):
 *
 *   SITE_URL   the client side: the booking, the visit pages, the salon
 *              page. Every link meant for a client is built on it (letters,
 *              SMS, .ics, the QR plaque, link previews' metadataBase).
 *   STAFF_URL  the staff side: the admin (/admin) and the barber app (/b).
 *              Every link meant for staff is built on it (the login code
 *              letter, the invoice letter, Google's way back). Unset, it is
 *              SITE_URL: one address for both halves, as on staging today.
 *
 * Staging until the move; then SITE_URL is https://book.rempire.ee and
 * STAFF_URL https://staff.rempire.ee in Vercel. Which host serves which
 * half is decided in src/lib/hosts.ts.
 */
export const STAGING_URL = "https://rempire-booking.diipsolutions.eu";

type Env = Record<string, string | undefined>;

/** An env var holding an address, or null when it is unset or not an address. */
export function urlFrom(raw: string | undefined): URL | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

export function siteUrl(env: Env = process.env): URL {
  // a typo falls back to staging
  return urlFrom(env.SITE_URL) ?? new URL(env.NODE_ENV === "development" ? "http://localhost:3400" : STAGING_URL);
}

/** The staff side's address: STAFF_URL, or the client side's when it is unset (or a typo). */
export function staffUrl(env: Env = process.env): URL {
  return urlFrom(env.STAFF_URL) ?? siteUrl(env);
}
