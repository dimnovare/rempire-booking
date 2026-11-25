/**
 * GET /api/auth/google/callback: Google sends the user back here
 * (src/lib/auth/google.ts). Any failure lands on the login page with a
 * short reason, never with Google's raw error text.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { afterLogin, GOOGLE_COOKIE, loginPageFor, safeStaffPath, START_PATH } from "@/lib/auth/cookie";
import { currentStaffUser, startSession } from "@/lib/auth/current";
import { exchangeGoogleCode, googleLoginConfigured, googleRedirectUri, loginWithGoogle, readGoogleIdToken, sameState, unpackAttempt } from "@/lib/auth/google";
import { dbConfigured, query } from "@/lib/db";
import { requestUrlOf } from "@/lib/hosts";

export async function GET(request: Request) {
  // env, cookies and a fresh state: never prerendered
  await connection();
  if (!googleLoginConfigured() || !dbConfigured()) redirect("/admin/login");
  // the host asked for, from the Host header (src/lib/hosts.ts)
  const url = requestUrlOf(request);
  const jar = await cookies();
  const attempt = unpackAttempt(jar.get(GOOGLE_COOKIE)?.value);
  jar.delete(GOOGLE_COOKIE);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  // the login page the attempt started from: the admin's or the barber app's
  const login = loginPageFor(attempt ? safeStaffPath(attempt.next) : "");
  // «Cancel» on Google's screen, an old tab, or a forged request. Google's
  // answer opened a second time («Back», a reload, the installed app taking
  // the same link) finds the login already done: on into the app, no error.
  if (!attempt || !code || !sameState(state, attempt.state)) redirect((await currentStaffUser()) ? START_PATH : `${login}?e=google`);

  let userId: string | null = null;
  let reason = "google";
  try {
    const idToken = await exchangeGoogleCode({ code, verifier: attempt.verifier, redirectUri: googleRedirectUri(url) });
    const claims = readGoogleIdToken(idToken, process.env.GOOGLE_CLIENT_ID ?? "");
    if (claims) {
      const r = await loginWithGoogle(query, claims);
      if (r.ok) userId = r.userId;
      else reason = r.code === "unknown" ? "googleUnknown" : r.code === "off" ? "bad" : "googleOther";
    }
  } catch (err) {
    console.error("google login:", err instanceof Error ? err.message : err);
  }
  // Google takes a code once: a second copy of the same answer fails there, though the first one logged in
  if (!userId && reason === "google" && (await currentStaffUser())) redirect(afterLogin(attempt.next));
  if (!userId) redirect(`${login}?e=${reason}`);
  await startSession(userId);
  redirect(afterLogin(attempt.next));
}
