/**
 * GET /api/auth/google/callback: Google sends the user back here
 * (src/lib/auth/google.ts). Any failure lands on the login page with a
 * short reason, never with Google's raw error text.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { GOOGLE_COOKIE, loginPageFor, safeStaffPath } from "@/lib/auth/cookie";
import { startSession } from "@/lib/auth/current";
import { exchangeGoogleCode, googleLoginConfigured, loginWithGoogle, readGoogleIdToken, sameState, unpackAttempt } from "@/lib/auth/google";
import { dbConfigured, query } from "@/lib/db";

export async function GET(request: Request) {
  // env, cookies and a fresh state: never prerendered
  await connection();
  if (!googleLoginConfigured() || !dbConfigured()) redirect("/admin/login");
  const url = new URL(request.url);
  const jar = await cookies();
  const attempt = unpackAttempt(jar.get(GOOGLE_COOKIE)?.value);
  jar.delete(GOOGLE_COOKIE);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  // the login page the attempt started from: the admin's or the barber app's
  const login = loginPageFor(attempt ? safeStaffPath(attempt.next) : "");
  // «Cancel» on Google's screen, an old tab, or a forged request
  if (!attempt || !code || !sameState(state, attempt.state)) redirect(`${login}?e=google`);

  let userId: string | null = null;
  let reason = "google";
  try {
    const idToken = await exchangeGoogleCode({ code, verifier: attempt.verifier, redirectUri: `${url.origin}/api/auth/google/callback` });
    const claims = readGoogleIdToken(idToken, process.env.GOOGLE_CLIENT_ID ?? "");
    if (claims) {
      const r = await loginWithGoogle(query, claims);
      if (r.ok) userId = r.userId;
      else reason = r.code === "unknown" ? "googleUnknown" : r.code === "off" ? "bad" : "googleOther";
    }
  } catch (err) {
    console.error("google login:", err instanceof Error ? err.message : err);
  }
  if (!userId) redirect(`${login}?e=${reason}`);
  await startSession(userId);
  redirect(safeStaffPath(attempt.next));
}
