/**
 * Google login: a stub until the OAuth client exists.
 *
 * Open question (docs/phase-a.md A4): whose Google Cloud project owns the
 * OAuth client, the shop's rempireshopinfo@gmail.com or Dim's. Once it
 * exists, its env vars (names only, values in Vercel):
 *
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *
 * The plan, so the build is small when it comes:
 *   1. /api/auth/google redirects to Google with `state` and a PKCE
 *      verifier in short httpOnly cookies; scope "openid email".
 *   2. /api/auth/google/callback swaps the code for tokens, checks the ID
 *      token (issuer, audience, expiry, email_verified).
 *   3. It logs in an existing, active user by users.google_sub, or links
 *      the first Google login to the user with that e-mail. It never makes
 *      a new user: the owner adds logins in the admin.
 *   4. Test on a real iPhone that a home-screen PWA lands back in the app
 *      (docs/data-model.md); if not, the barber app offers password and code
 *      first there.
 */
export function googleLoginConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
