/**
 * «Sign in with Google» for staff (A4). The OAuth client lives in the shop's
 * Google account (Dim, 17.11.2026); its env vars, values in Vercel only:
 *
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *
 * Authorized redirect URIs on the client:
 *   https://rempire-booking.diipsolutions.eu/api/auth/google/callback
 *   http://localhost:3400/api/auth/google/callback
 *   (later the staff address, STAFF_URL: staff.rempire.ee; on the staging
 *   trial of the two addresses, staff-rempire.diipsolutions.eu)
 *
 * The way back is always on the staff address when the two addresses are
 * split (src/lib/hosts.ts): a start on the client address is first sent
 * there, so the attempt's cookie and the session land on the staff host.
 * Any other host (today's staging, localhost) keeps its own way back.
 *
 * The flow (authorization code + PKCE, scope «openid email»):
 *   1. /api/auth/google puts `state`, the PKCE verifier and the page to
 *      return to in a short httpOnly cookie and redirects to Google.
 *   2. /api/auth/google/callback checks `state`, swaps the code for tokens
 *      server to server, and reads the ID token.
 *   3. loginWithGoogle() logs in an active user by users.google_sub, or
 *      links the first Google login to the active user with that e-mail.
 *      It never creates a user: the owner adds logins under «Доступ».
 *
 * The ID token comes straight from Google's token endpoint over TLS, in
 * exchange for our client secret, so its signature is not checked again
 * (OpenID Connect Core 3.1.3.7, step 6); issuer, audience, expiry and
 * email_verified are.
 *
 * Still to try on a real iPhone: that a home-screen PWA lands back in the
 * app after Google (docs/data-model.md). If it does not, the barber app
 * offers the password and the e-mail code first there.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Querier } from "../db";
import { originFor } from "../hosts";
import { normalizeEmail } from "./login";

type Env = Record<string, string | undefined>;

/** Where Google sends the user back, for a request that came to `requestUrl`: the staff address's callback. Both legs must use the same one. */
export function googleRedirectUri(requestUrl: URL, env: Env = process.env): string {
  return `${originFor("staff", requestUrl, env)}/api/auth/google/callback`;
}

export const GOOGLE = {
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  issuers: ["https://accounts.google.com", "accounts.google.com"],
  /** how long the round trip to Google may take */
  cookieMaxAge: 10 * 60,
};

export function googleLoginConfigured(env: Env = process.env): boolean {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

const b64url = (b: Buffer) => b.toString("base64url");

/** A fresh `state`, PKCE verifier and its S256 challenge. */
export function newGoogleAttempt(): { state: string; verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  return { state: b64url(randomBytes(24)), verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

export function googleAuthUrl(o: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const u = new URL(GOOGLE.authUrl);
  u.search = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: "code",
    scope: "openid email",
    state: o.state,
    code_challenge: o.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return u.toString();
}

/** The short cookie that carries one attempt across the round trip. */
export function packAttempt(a: { state: string; verifier: string; next: string }): string {
  return b64url(Buffer.from(JSON.stringify([a.state, a.verifier, a.next])));
}

export function unpackAttempt(raw: string | undefined): { state: string; verifier: string; next: string } | null {
  if (!raw || raw.length > 1000) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "string")) return { state: v[0], verifier: v[1], next: v[2] };
  } catch {
    /* fall through */
  }
  return null;
}

export function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

/** Swap the authorization code for Google's ID token, server to server. */
export async function exchangeGoogleCode(
  o: { code: string; verifier: string; redirectUri: string },
  env: Env = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchFn(GOOGLE.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: o.code,
      client_id: env.GOOGLE_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: o.redirectUri,
      grant_type: "authorization_code",
      code_verifier: o.verifier,
    }).toString(),
  });
  if (!res.ok) {
    // Google's own reason, for the server log: a short code such as invalid_grant
    // (a code used twice or too old) or redirect_uri_mismatch; never a secret
    const why = (await res.json().catch(() => ({}))) as { error?: unknown };
    const reason = typeof why.error === "string" && /^[a-z_]{1,40}$/.test(why.error) ? ` (${why.error})` : "";
    throw new Error(`Google token endpoint answered ${res.status}${reason}`);
  }
  const body = (await res.json().catch(() => ({}))) as { id_token?: unknown };
  if (typeof body.id_token !== "string") throw new Error("Google sent no ID token");
  return body.id_token;
}

export type GoogleClaims = { sub: string; email: string };

/** The claims we use, or null if the token is not for us, expired or unverified. */
export function readGoogleIdToken(idToken: string, clientId: string, now = Date.now()): GoogleClaims | null {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (!GOOGLE.issuers.includes(String(p.iss))) return null;
  if (!clientId || !aud.includes(clientId)) return null;
  if (typeof p.exp !== "number" || p.exp * 1000 <= now) return null;
  if (p.email_verified !== true && p.email_verified !== "true") return null;
  if (typeof p.sub !== "string" || !p.sub || typeof p.email !== "string") return null;
  return { sub: p.sub, email: normalizeEmail(p.email) };
}

export type GoogleLoginResult = { ok: true; userId: string } | { ok: false; code: "unknown" | "off" | "other_google" };

/**
 * The user behind a Google account: by google_sub, or (first time) by
 * e-mail, which then links the account. Never creates a user.
 */
export async function loginWithGoogle(q: Querier, claims: GoogleClaims): Promise<GoogleLoginResult> {
  const [bySub] = await q<{ id: string; active: boolean }>("select id, active from users where google_sub = $1", [claims.sub]);
  if (bySub) return bySub.active ? { ok: true, userId: bySub.id } : { ok: false, code: "off" };
  const [byEmail] = await q<{ id: string; active: boolean; google_sub: string | null }>("select id, active, google_sub from users where email = $1", [claims.email]);
  if (!byEmail) return { ok: false, code: "unknown" };
  if (!byEmail.active) return { ok: false, code: "off" };
  // that login is already tied to another Google account
  if (byEmail.google_sub) return { ok: false, code: "other_google" };
  const linked = await q<{ id: string }>("update users set google_sub = $2, updated_at = now() where id = $1 and google_sub is null returning id", [byEmail.id, claims.sub]);
  return linked.length ? { ok: true, userId: byEmail.id } : { ok: false, code: "other_google" };
}
