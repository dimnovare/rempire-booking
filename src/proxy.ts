/**
 * Every client page lives under a language: /ru, /et, /en. A path without
 * one is sent to the browser's language (Russian if none of ours). The
 * redirect carries the noindex header too (src/lib/indexing.ts).
 *
 * /admin is Renat's admin, in Russian and outside the languages. Without a
 * session cookie it goes to /admin/login; whether the cookie is valid is
 * checked by the page itself (src/lib/auth/current.ts). The admin is never
 * indexed, even after the move to rempire.ee.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { isLocale, pickLocale } from "@/lib/i18n";
import { indexingAllowed, NOINDEX_HEADER } from "@/lib/indexing";

function admin(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const open = pathname === "/admin/login" || pathname.startsWith("/admin/login/");
  let res: NextResponse;
  if (!open && !request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = pathname === "/admin" && !search ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    res = NextResponse.redirect(url, 307);
  } else res = NextResponse.next();
  res.headers.set("X-Robots-Tag", NOINDEX_HEADER);
  return res;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return admin(request);
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
