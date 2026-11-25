/**
 * Which half of the app a host serves (docs/launch.md B3). At the move,
 * clients use book.rempire.ee and staff use staff.rempire.ee: on Android one
 * address installs one app, so a phone could not hold the client booking
 * and the staff app side by side, and the staff side should never show to
 * clients or search engines.
 *
 * The split is ON only when SITE_URL and STAFF_URL are both set, both are
 * addresses, and their hosts differ (src/lib/site.ts). Then:
 *
 *   SITE_URL's host    "booking": the client pages; /admin and /b go to
 *                      STAFF_URL (308, same path and query).
 *   STAFF_URL's host   "staff": /admin and /b; the client pages go to
 *                      SITE_URL (308, same path and query), and / to the
 *                      staff app's start, /b/start (307: what it opens
 *                      depends on the login).
 *   any other host     "all": everything, exactly as before the split.
 *                      Today's staging address, localhost and Vercel's
 *                      *.vercel.app previews, so links already sent keep
 *                      working.
 *
 * Off, every host is "all". The API, Next's own files and every file with
 * an extension (manifests, icons, service workers, letter pictures) never
 * pass the proxy's matcher, so they are served on every host.
 *
 * Several businesses later (docs/multi-business.md, M4): this same function
 * learns the business too, from `business_hosts` rows (other businesses'
 * own domains) and PLATFORM_HOST. REMPIRE's own two hosts stay the ones
 * SITE_URL and STAFF_URL name.
 *
 * No Next.js here: src/proxy.ts and the route handlers call it.
 */
import { START_PATH } from "./auth/cookie";
import { urlFrom } from "./site";

type Env = Record<string, string | undefined>;

export type HostRole = "booking" | "staff" | "all";

/** The client address and the staff address while the split is on; null when it is off. */
export function splitHosts(env: Env = process.env): { booking: URL; staff: URL } | null {
  // both must be real addresses: a typo in either keeps one address for everything
  const booking = urlFrom(env.SITE_URL);
  const staff = urlFrom(env.STAFF_URL);
  if (!booking || !staff || booking.host.toLowerCase() === staff.host.toLowerCase()) return null;
  return { booking, staff };
}

/** What the host a request came to serves. `host` is the request's, with its port if it has one. */
export function hostRole(host: string | null | undefined, env: Env = process.env): HostRole {
  const split = splitHosts(env);
  const h = (host ?? "").trim().toLowerCase();
  if (!split || !h) return "all";
  if (h === split.booking.host.toLowerCase()) return "booking";
  if (h === split.staff.host.toLowerCase()) return "staff";
  return "all";
}

/**
 * The address a request came to, with the host from its Host header. When
 * self-hosted (`next dev`, `next start`), Next writes its own hostname
 * (localhost) into request.url and nextUrl whatever host was asked for;
 * on Vercel the two agree. The path and query are request.url's.
 */
export function requestUrlOf(request: { url: string; headers: Headers }): URL {
  const url = new URL(request.url);
  const host = request.headers.get("host")?.trim();
  if (!host) return url;
  try {
    // the name and the port both: a Host without a port has none
    const asked = new URL(`${url.protocol}//${host}`);
    url.hostname = asked.hostname;
    url.port = asked.port;
  } catch {
    /* an odd Host: the URL's own stays */
  }
  return url;
}

/** The admin and the barber app: the staff half's page paths. */
export const isStaffPath = (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/b" || pathname.startsWith("/b/");

/**
 * Where a page request goes instead, when it came to the wrong half's host;
 * null when it is served here. Only for the paths the proxy sees (pages):
 * the API and files never ask.
 */
export function hostRedirect(url: URL, env: Env = process.env): { to: URL; status: 307 | 308 } | null {
  const split = splitHosts(env);
  if (!split) return null;
  const role = hostRole(url.host, env);
  if (role === "all") return null;
  const staff = isStaffPath(url.pathname);
  if (role === "booking") return staff ? { to: new URL(url.pathname + url.search, split.staff), status: 308 } : null;
  if (staff) return null;
  // the staff address alone opens the staff app, as its installed icon does
  if (url.pathname === "/") return { to: new URL(START_PATH, split.staff), status: 307 };
  return { to: new URL(url.pathname + url.search, split.booking), status: 308 };
}

/**
 * The origin for a link of one half, built while answering a request: that
 * half's own address when the request came to one of the two split hosts,
 * else the request's own origin (today's staging address, localhost, a
 * preview), so a flow that started there also ends there.
 */
export function originFor(half: "booking" | "staff", requestUrl: URL, env: Env = process.env): string {
  const split = splitHosts(env);
  if (!split || hostRole(requestUrl.host, env) === "all") return requestUrl.origin;
  return split[half].origin;
}

/** robots.txt on the staff address: nothing there is for search engines, even after the move. */
export const STAFF_ROBOTS = "User-agent: *\nDisallow: /\n";
