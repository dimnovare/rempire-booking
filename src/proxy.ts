/**
 * Every client page lives under a language: /ru, /et, /en. A path without
 * one is sent to the browser's language (Russian if none of ours). The
 * redirect carries the noindex header too (src/lib/indexing.ts).
 *
 * /admin is Renat's admin, in Russian and outside the languages. Without a
 * session cookie it goes to /admin/login; whether the cookie is valid is
 * checked by the page itself (src/lib/auth/current.ts). The admin is never
 * indexed, even after the move to rempire.ee.
 *
 * /b is the barber app (Phase B), the same way: no cookie → /b/login. Its
 * manifest, icons and service worker have a file extension, so they never
 * come here and need no login.
 *
 * The two are one staff app with two sides (docs/apps.md). Each request
 * notes which side this device has open, so the app's start, /b/start,
 * comes back to it.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE, START_PATH } from "@/lib/auth/cookie";
import { SIDE_COOKIE, sideOf } from "@/lib/auth/side";
import { isLocale, pickLocale } from "@/lib/i18n";
import { indexingAllowed, NOINDEX_HEADER } from "@/lib/indexing";

/** /admin and the barber app /b: without a session cookie, their own login page. */
function staffArea(request: NextRequest, root: "/admin" | "/b"): NextResponse {
  const { pathname, search } = request.nextUrl;
  const login = `${root}/login`;
  // the barber app's install guide works before the login too
  const open = pathname === login || pathname.startsWith(`${login}/`) || pathname === "/b/install";
  let res: NextResponse;
  if (!open && !request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = login;
    url.search = pathname === root && !search ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    res = NextResponse.redirect(url, 307);
  } else res = NextResponse.next();
  // which side of the staff app this device has open, for the app's start
  // (/b/start reads it, so it never writes it; a login page is no side yet)
  const side = sideOf(pathname);
  if (!open && pathname !== START_PATH && request.cookies.get(SIDE_COOKIE)?.value !== side) {
    res.cookies.set(SIDE_COOKIE, side, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_COOKIE_MAX_AGE });
  }
  res.headers.set("X-Robots-Tag", NOINDEX_HEADER);
  return res;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return staffArea(request, "/admin");
  if (pathname === "/b" || pathname.startsWith("/b/")) return staffArea(request, "/b");
  // the SMS reminder's short link picks the visit's own language (src/app/v)
  if (pathname.startsWith("/v/")) return NextResponse.next();
  if (isLocale(pathname.split("/")[1])) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = `/${pickLocale(request.headers.get("accept-language"))}${pathname === "/" ? "" : pathname}`;
  const res = NextResponse.redirect(url, 307);
  if (!indexingAllowed()) res.headers.set("X-Robots-Tag", NOINDEX_HEADER);
  return res;
}

export const config = {
  // not the API, Next's own files, or any file with an extension (logo, robots.txt)
  matcher: ["/((?!api/|_next/|.*\\.[a-z0-9]+$).*)"],
};
