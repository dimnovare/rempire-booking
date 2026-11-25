/**
 * GET /api/auth/google?next=/admin/… (or /b…, the barber app): start «Sign in with Google»
 * (src/lib/auth/google.ts). Without the OAuth client it sends the user back
 * to the login page, which then shows no Google button anyway.
 *
 * With the two addresses split (src/lib/hosts.ts) a start on the client
 * address goes to the staff address first: the attempt's cookie is this
 * host's only, and Google comes back to the staff address.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { GOOGLE_COOKIE, loginPageFor, safeStaffPath } from "@/lib/auth/cookie";
import { GOOGLE, googleAuthUrl, googleLoginConfigured, googleRedirectUri, newGoogleAttempt, packAttempt } from "@/lib/auth/google";
import { hostRole, requestUrlOf, splitHosts } from "@/lib/hosts";

export async function GET(request: Request) {
  // env, cookies and a fresh state: never prerendered
  await connection();
  // the host asked for, from the Host header (src/lib/hosts.ts)
  const url = requestUrlOf(request);
  const split = splitHosts();
  if (split && hostRole(url.host) === "booking") redirect(new URL(url.pathname + url.search, split.staff).href);
  const next = safeStaffPath(url.searchParams.get("next") ?? "");
  if (!googleLoginConfigured()) redirect(loginPageFor(next));
  const a = newGoogleAttempt();
  (await cookies()).set(GOOGLE_COOKIE, packAttempt({ state: a.state, verifier: a.verifier, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Google comes back with a top-level GET, which lax allows
    sameSite: "lax",
    path: "/",
    maxAge: GOOGLE.cookieMaxAge,
  });
  redirect(
    googleAuthUrl({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      redirectUri: googleRedirectUri(url),
      state: a.state,
      challenge: a.challenge,
    }),
  );
}
