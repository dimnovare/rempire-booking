// Search-engine indexing: one switch for the whole app.
//
// Staging (rempire-booking.diipsolutions.eu) must never be indexed
// (CLAUDE.md, hard rules). Three things say so, and all three read this file:
//   - the <meta name="robots"> tag (src/app/[locale]/layout.tsx);
//   - the language redirect from / (src/proxy.ts);
//   - robots.txt (src/app/robots.ts);
//   - the X-Robots-Tag header on every response (next.config.ts).
//
// Indexing turns on only when ALLOW_INDEXING is exactly "yes". It is set by
// hand in Vercel when the app moves to rempire.ee. Unset, empty, "true", "1"
// or a typo all keep the app hidden, so a forgotten variable fails safe.

type Env = Record<string, string | undefined>;

export function indexingAllowed(env: Env = process.env): boolean {
  return env.ALLOW_INDEXING === "yes";
}

export const NOINDEX_HEADER = "noindex, nofollow, noarchive";

/** The robots part of the page metadata (src/app/[locale]/layout.tsx). */
export function robotsMeta(env: Env = process.env) {
  const on = indexingAllowed(env);
  return { index: on, follow: on, nocache: !on, googleBot: { index: on, follow: on } };
}

/**
 * Messengers fetch a shared link to show its title and picture. They do not
 * index anything, and some of them (Facebook's, so WhatsApp's; X's) skip a
 * page robots.txt closes. Search engines stay out: `*` is still
 * Disallow: /, and every page still says noindex (meta and header).
 */
export const PREVIEW_BOTS = ["facebookexternalhit", "WhatsApp", "TelegramBot", "Twitterbot", "Slackbot-LinkExpanding", "Discordbot"];
