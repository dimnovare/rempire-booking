/**
 * GET /api/auth/google?next=/admin/… (or /b…, the barber app): start «Sign in with Google»
 * (src/lib/auth/google.ts). Without the OAuth client it sends the user back
 * to the login page, which then shows no Google button anyway.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { GOOGLE_COOKIE, loginPageFor, safeStaffPath } from "@/lib/auth/cookie";
import { GOOGLE, googleAuthUrl, googleLoginConfigured, newGoogleAttempt, packAttempt } from "@/lib/auth/google";

export async function GET(request: Request) {
  // env, cookies and a fresh state: never prerendered
  await connection();
  const url = new URL(request.url);
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
      redirectUri: `${url.origin}/api/auth/google/callback`,
      state: a.state,
      challenge: a.challenge,
    }),
  );
}
