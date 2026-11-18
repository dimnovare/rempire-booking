import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  exchangeGoogleCode,
  googleAuthUrl,
  googleLoginConfigured,
  loginWithGoogle,
  newGoogleAttempt,
  packAttempt,
  readGoogleIdToken,
  sameState,
  unpackAttempt,
} from "@/lib/auth/google";
import { createUser, setUserActive } from "@/lib/auth/login";
import { closeDb, query } from "@/lib/db";
import { freshDemo, type Demo } from "./helpers";

const CLIENT = "test-client.apps.googleusercontent.com";
const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});
afterAll(closeDb);

/** An unsigned token with the given claims: the callback trusts TLS, not the signature. */
const token = (claims: Record<string, unknown>) =>
  [
    Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url"),
    Buffer.from(
      JSON.stringify({ iss: "https://accounts.google.com", aud: CLIENT, exp: NOW / 1000 + 600, sub: "1234567890", email: "Owner@Example.test", email_verified: true, ...claims }),
    ).toString("base64url"),
    "sig",
  ].join(".");

describe("google: the request to Google", () => {
  it("is on only with both env vars", () => {
    expect(googleLoginConfigured({})).toBe(false);
    expect(googleLoginConfigured({ GOOGLE_CLIENT_ID: CLIENT })).toBe(false);
    expect(googleLoginConfigured({ GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: "x" })).toBe(true);
  });

  it("asks for openid + email with PKCE S256 and our state", () => {
    const a = newGoogleAttempt();
    expect(a.challenge).toBe(createHash("sha256").update(a.verifier).digest("base64url"));
    expect(newGoogleAttempt().state).not.toBe(a.state);
    const u = new URL(googleAuthUrl({ clientId: CLIENT, redirectUri: "http://localhost:3400/api/auth/google/callback", state: a.state, challenge: a.challenge }));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: CLIENT,
      redirect_uri: "http://localhost:3400/api/auth/google/callback",
      response_type: "code",
      scope: "openid email",
      state: a.state,
      code_challenge: a.challenge,
      code_challenge_method: "S256",
    });
  });

  it("carries the attempt in one cookie and refuses anything else", () => {
    const a = { state: "s1", verifier: "v1", next: "/admin/staff" };
    expect(unpackAttempt(packAttempt(a))).toEqual(a);
    expect(unpackAttempt(undefined)).toBeNull();
    expect(unpackAttempt("not-json")).toBeNull();
    expect(unpackAttempt(Buffer.from(JSON.stringify({ state: "s" })).toString("base64url"))).toBeNull();
    expect(sameState("abc", "abc")).toBe(true);
    expect(sameState("abc", "abd")).toBe(false);
    expect(sameState("", "")).toBe(false);
  });
});

describe("google: the answer", () => {
  it("swaps the code with our secret and the PKCE verifier", async () => {
    let sent: URLSearchParams | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      expect(url).toBe("https://oauth2.googleapis.com/token");
      sent = new URLSearchParams(String(init.body));
      return new Response(JSON.stringify({ id_token: "a.b.c", access_token: "unused" }), { status: 200 });
    }) as unknown as typeof fetch;
    const env = { GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: "test-secret" };
    expect(await exchangeGoogleCode({ code: "the-code", verifier: "the-verifier", redirectUri: "http://localhost:3400/cb" }, env, fake)).toBe("a.b.c");
    expect(Object.fromEntries(sent!)).toEqual({
      code: "the-code",
      client_id: CLIENT,
      client_secret: "test-secret",
      redirect_uri: "http://localhost:3400/cb",
      grant_type: "authorization_code",
      code_verifier: "the-verifier",
    });
    const failing = (async () => new Response("{}", { status: 400 })) as unknown as typeof fetch;
    await expect(exchangeGoogleCode({ code: "x", verifier: "y", redirectUri: "z" }, env, failing)).rejects.toThrow("400");
    // Google's short reason goes into the log; anything else it sends does not
    const grant = (async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Bad Request" }), { status: 400 })) as unknown as typeof fetch;
    await expect(exchangeGoogleCode({ code: "x", verifier: "y", redirectUri: "z" }, env, grant)).rejects.toThrow("Google token endpoint answered 400 (invalid_grant)");
    const odd = (async () => new Response(JSON.stringify({ error: "<b>not a code</b>" }), { status: 400 })) as unknown as typeof fetch;
    await expect(exchangeGoogleCode({ code: "x", verifier: "y", redirectUri: "z" }, env, odd)).rejects.toThrow(/answered 400$/);
  });

  it("reads the ID token only if it is ours, fresh and verified", () => {
    expect(readGoogleIdToken(token({}), CLIENT, NOW)).toEqual({ sub: "1234567890", email: "owner@example.test" });
    expect(readGoogleIdToken(token({ iss: "accounts.google.com" }), CLIENT, NOW)).not.toBeNull();
    expect(readGoogleIdToken(token({ iss: "https://evil.example" }), CLIENT, NOW)).toBeNull();
    expect(readGoogleIdToken(token({ aud: "someone-else" }), CLIENT, NOW)).toBeNull();
    expect(readGoogleIdToken(token({}), "", NOW)).toBeNull();
    expect(readGoogleIdToken(token({ exp: NOW / 1000 - 1 }), CLIENT, NOW)).toBeNull();
    expect(readGoogleIdToken(token({ email_verified: false }), CLIENT, NOW)).toBeNull();
    expect(readGoogleIdToken(token({ sub: "" }), CLIENT, NOW)).toBeNull();
    expect(readGoogleIdToken("garbage", CLIENT, NOW)).toBeNull();
  });
});

describe("google: who gets in", () => {
  const add = async (email: string) => {
    const r = await createUser(query, demo.business.id, { email, name: "", role: "owner", staffId: null, password: null });
    if (!r.ok) throw new Error("createUser");
    return r.id;
  };

  it("links the first Google login by e-mail, then knows it by its id", async () => {
    const id = await add("owner@example.test");
    expect(await loginWithGoogle(query, { sub: "g-1", email: "owner@example.test" })).toEqual({ ok: true, userId: id });
    const [u] = await query<{ google_sub: string }>("select google_sub from users where id = $1", [id]);
    expect(u.google_sub).toBe("g-1");
    // the Google account's e-mail may change later; the id still matches
    expect(await loginWithGoogle(query, { sub: "g-1", email: "renamed@example.test" })).toEqual({ ok: true, userId: id });
  });

  it("never creates a login, and refuses a second Google account for one login", async () => {
    expect(await loginWithGoogle(query, { sub: "g-x", email: "stranger@example.test" })).toEqual({ ok: false, code: "unknown" });
    expect((await query("select 1 from users where email = 'stranger@example.test'")).length).toBe(0);
    await add("owner@example.test");
    await loginWithGoogle(query, { sub: "g-1", email: "owner@example.test" });
    expect(await loginWithGoogle(query, { sub: "g-2", email: "owner@example.test" })).toEqual({ ok: false, code: "other_google" });
  });

  it("a switched-off login stays out", async () => {
    const id = await add("owner@example.test");
    await loginWithGoogle(query, { sub: "g-1", email: "owner@example.test" });
    await setUserActive(query, demo.business.id, id, false);
    expect(await loginWithGoogle(query, { sub: "g-1", email: "owner@example.test" })).toEqual({ ok: false, code: "off" });
    const id2 = await add("front@example.test");
    await setUserActive(query, demo.business.id, id2, false);
    expect(await loginWithGoogle(query, { sub: "g-9", email: "front@example.test" })).toEqual({ ok: false, code: "off" });
  });
});
