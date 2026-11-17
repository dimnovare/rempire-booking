/**
 * The staff session cookie. `__Host-` in production: HTTPS only, this host
 * only, path "/", so no other subdomain of diipsolutions.eu or rempire.ee
 * can set or read it. Plain name on http://localhost.
 * Read by src/proxy.ts (is there one at all?) and src/lib/auth/current.ts
 * (is it valid?).
 */
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-rb_staff" : "rb_staff";

/** One «Sign in with Google» round trip: state, PKCE verifier, page to return to (10 minutes). */
export const GOOGLE_COOKIE = process.env.NODE_ENV === "production" ? "__Host-rb_google" : "rb_google";

/** Browsers cap a cookie at 400 days; the database decides when it really ends. */
export const SESSION_COOKIE_MAX_AGE = 400 * 86_400;

/** Only a path inside the admin may be a «next» after login: never another site. */
export function safeAdminPath(next: unknown): string {
  const s = typeof next === "string" ? next : "";
  return /^\/admin(\/[A-Za-z0-9/_\-.?=&%]*)?$/.test(s) && !s.startsWith("/admin/login") && !s.includes("//") ? s : "/admin";
}

/** A path in the barber app (/b, Phase B) for a «next» after login, else /b. */
export function safeBarberPath(next: unknown): string {
  const s = typeof next === "string" ? next : "";
  return /^\/b([/?][A-Za-z0-9/_\-.?=&%#]*)?$/.test(s) && !s.startsWith("/b/login") && !s.includes("//") ? s : "/b";
}

/** «next» for either app: the barber app's paths stay there, everything else is the admin's. */
export function safeStaffPath(next: unknown): string {
  return typeof next === "string" && /^\/b([/?]|$)/.test(next) ? safeBarberPath(next) : safeAdminPath(next);
}

/** The login page that belongs to a «next» path. */
export const loginPageFor = (next: string) => (/^\/b([/?]|$)/.test(next) ? "/b/login" : "/admin/login");

/** Renat looking at the barber app as one barber (src/lib/auth/current.ts requireStaff). */
export const VIEW_AS_COOKIE = "rb_view_as";
