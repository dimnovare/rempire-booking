/**
 * The app's public address, for the absolute links in link previews
 * (metadataBase). Staging until the move; then SITE_URL is set in Vercel to
 * the rempire.ee address.
 */
export const STAGING_URL = "https://rempire-booking.diipsolutions.eu";

type Env = Record<string, string | undefined>;

export function siteUrl(env: Env = process.env): URL {
  const raw = (env.SITE_URL ?? "").trim();
  if (raw) {
    try {
      return new URL(raw);
    } catch {
      /* a typo falls back to staging */
    }
  }
  return new URL(env.NODE_ENV === "development" ? "http://localhost:3400" : STAGING_URL);
}
