/**
 * Every page lives under a language: /ru, /et, /en. A path without one is
 * sent to the browser's language (Russian if none of ours). The redirect
 * carries the noindex header too (src/lib/indexing.ts).
 */
import { NextResponse, type NextRequest } from "next/server";
import { isLocale, pickLocale } from "@/lib/i18n";
import { indexingAllowed, NOINDEX_HEADER } from "@/lib/indexing";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
