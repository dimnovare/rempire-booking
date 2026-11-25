/**
 * Two addresses (docs/launch.md B3): SITE_URL for clients, STAFF_URL for
 * staff. Which host serves which half (src/lib/hosts.ts), what the proxy
 * does about it (src/proxy.ts), and which address each kind of link is
 * built on: staff letters and Google's way back on STAFF_URL, everything a
 * client gets on SITE_URL.
 */
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as icsRoute } from "@/app/api/ics/[token]/route";
import { createUser, sendLoginCode } from "@/lib/auth/login";
import { SESSION_COOKIE, START_PATH } from "@/lib/auth/cookie";
import { googleRedirectUri } from "@/lib/auth/google";
import { book, type BookingInput } from "@/lib/booking";
import { closeDb, query } from "@/lib/db";
import { sentToConsole, type LetterBody } from "@/lib/email";
import { hostRedirect, hostRole, isStaffPath, originFor, requestUrlOf, splitHosts, STAFF_ROBOTS } from "@/lib/hosts";
import { NOINDEX_HEADER } from "@/lib/indexing";
import { runOutbox, sendForVisit } from "@/lib/outbox";
import { siteUrl, STAGING_URL, staffUrl } from "@/lib/site";
import { sentSms } from "@/lib/sms";
import { addDays, todayIn, zonedToUtc } from "@/lib/tz";
import { config, proxy } from "@/proxy";
import { freshDemo, type Demo } from "./helpers";

const BOOK = "https://book.example.test";
const STAFF = "https://staff.example.test";
const SPLIT = { SITE_URL: BOOK, STAFF_URL: STAFF };

describe("the two addresses", () => {
  it("STAFF_URL falls back to SITE_URL, and that to staging", () => {
    expect(staffUrl({}).href).toBe(`${STAGING_URL}/`);
    expect(staffUrl({ NODE_ENV: "development" }).href).toBe("http://localhost:3400/");
    expect(staffUrl({ SITE_URL: BOOK }).href).toBe(`${BOOK}/`);
    expect(staffUrl({ SITE_URL: BOOK, STAFF_URL: " " }).href).toBe(`${BOOK}/`);
    expect(staffUrl({ SITE_URL: BOOK, STAFF_URL: "staff.example.test" }).href).toBe(`${BOOK}/`);
    expect(staffUrl(SPLIT).href).toBe(`${STAFF}/`);
    // the client address never moves to the staff one
    expect(siteUrl(SPLIT).href).toBe(`${BOOK}/`);
  });

  it("is split only with both set, both addresses, on different hosts", () => {
    expect(splitHosts({})).toBeNull();
    expect(splitHosts({ SITE_URL: BOOK })).toBeNull();
    expect(splitHosts({ STAFF_URL: STAFF })).toBeNull();
    expect(splitHosts({ SITE_URL: BOOK, STAFF_URL: `${BOOK}/` })).toBeNull();
    expect(splitHosts({ SITE_URL: BOOK, STAFF_URL: "https://BOOK.example.test" })).toBeNull();
    // a typo in either keeps one address for everything: never staging as the client host
    expect(splitHosts({ SITE_URL: "book.example.test", STAFF_URL: STAFF })).toBeNull();
    expect(splitHosts({ SITE_URL: BOOK, STAFF_URL: "staff example" })).toBeNull();
    expect(splitHosts(SPLIT)?.booking.host).toBe("book.example.test");
    expect(splitHosts(SPLIT)?.staff.host).toBe("staff.example.test");
    // the same name on two ports is two hosts (a local trial)
    expect(splitHosts({ SITE_URL: "http://localhost:3430", STAFF_URL: "http://127.0.0.1:3430" })).not.toBeNull();
  });

  it("hostRole: the client host, the staff host, and every other host serving both", () => {
    expect(hostRole("book.example.test", SPLIT)).toBe("booking");
    expect(hostRole("Staff.Example.Test", SPLIT)).toBe("staff");
    for (const other of ["rempire-booking.diipsolutions.eu", "localhost:3400", "rempire-booking-git-x.vercel.app", "book.example.test:8443", "", null, undefined]) {
      expect(hostRole(other, SPLIT)).toBe("all");
    }
    // off: every host is everything
    expect(hostRole("book.example.test", { SITE_URL: BOOK })).toBe("all");
    expect(hostRole("staff.example.test", { SITE_URL: BOOK })).toBe("all");
    expect(hostRole("localhost:3430", { SITE_URL: "http://localhost:3430", STAFF_URL: "http://127.0.0.1:3430" })).toBe("booking");
    expect(hostRole("127.0.0.1:3430", { SITE_URL: "http://localhost:3430", STAFF_URL: "http://127.0.0.1:3430" })).toBe("staff");
  });

  it("the staff half is /admin and /b, nothing that only starts like them", () => {
    for (const p of ["/admin", "/admin/", "/admin/clients", "/admin/login", "/b", "/b/", "/b/start", "/b/login", "/b/install"]) expect(isStaffPath(p)).toBe(true);
    for (const p of ["/", "/ru", "/v/abc", "/administrator", "/bar", "/ru/admin", "/en/b"]) expect(isStaffPath(p)).toBe(false);
  });
});

describe("hostRedirect", () => {
  const go = (url: string, env: Record<string, string | undefined> = SPLIT) => {
    const r = hostRedirect(new URL(url), env);
    return r && { to: r.to.href, status: r.status };
  };

  it("the client host sends the staff pages to the staff host, path and query kept, 308", () => {
    expect(go(`${BOOK}/admin`)).toEqual({ to: `${STAFF}/admin`, status: 308 });
    expect(go(`${BOOK}/admin/clients?q=1&barber=x`)).toEqual({ to: `${STAFF}/admin/clients?q=1&barber=x`, status: 308 });
    expect(go(`${BOOK}/b/week?d=2026-11-17`)).toEqual({ to: `${STAFF}/b/week?d=2026-11-17`, status: 308 });
    expect(go(`${BOOK}/b/login?next=%2Fb%2Ftime`)).toEqual({ to: `${STAFF}/b/login?next=%2Fb%2Ftime`, status: 308 });
    // its own pages stay
    for (const p of ["/", "/ru", "/en/about", "/et/visit/abc", "/v/abcdefghijklmnop", "/ru/q/token", "/nothing-here"]) expect(go(`${BOOK}${p}`)).toBeNull();
  });

  it("the staff host sends the client pages to the client host, and / to the staff app's start", () => {
    expect(go(`${STAFF}/`)).toEqual({ to: `${STAFF}${START_PATH}`, status: 307 });
    expect(go(`${STAFF}/?utm=x`)).toEqual({ to: `${STAFF}${START_PATH}`, status: 307 });
    expect(go(`${STAFF}/ru`)).toEqual({ to: `${BOOK}/ru`, status: 308 });
    expect(go(`${STAFF}/en/visit/abc?moved=1`)).toEqual({ to: `${BOOK}/en/visit/abc?moved=1`, status: 308 });
    expect(go(`${STAFF}/v/abcdefghijklmnop`)).toEqual({ to: `${BOOK}/v/abcdefghijklmnop`, status: 308 });
    expect(go(`${STAFF}/nothing-here`)).toEqual({ to: `${BOOK}/nothing-here`, status: 308 });
    // its own pages stay
    for (const p of ["/admin", "/admin/login", "/b", "/b/start", "/b/install"]) expect(go(`${STAFF}${p}`)).toBeNull();
  });

  it("every other host, and every host while the split is off, keeps everything", () => {
    for (const host of [STAGING_URL, "http://localhost:3400", "https://rempire-booking-git-x.vercel.app"]) {
      for (const p of ["/", "/ru", "/admin", "/b/start", "/v/abcdefghijklmnop"]) expect(go(`${host}${p}`)).toBeNull();
    }
    for (const env of [{}, { SITE_URL: BOOK }, { SITE_URL: BOOK, STAFF_URL: BOOK }]) {
      expect(go(`${BOOK}/admin`, env)).toBeNull();
      expect(go(`${BOOK}/ru`, env)).toBeNull();
    }
    expect(go(`${STAFF}/ru`, { SITE_URL: BOOK })).toBeNull();
  });
});

describe("links built while answering a request", () => {
  it("originFor: each half's own address on the two split hosts, the request's own anywhere else", () => {
    expect(originFor("staff", new URL(`${BOOK}/api/x`), SPLIT)).toBe(STAFF);
    expect(originFor("staff", new URL(`${STAFF}/api/x`), SPLIT)).toBe(STAFF);
    expect(originFor("booking", new URL(`${STAFF}/api/x`), SPLIT)).toBe(BOOK);
    expect(originFor("booking", new URL(`${BOOK}/api/x`), SPLIT)).toBe(BOOK);
    expect(originFor("staff", new URL(`${STAGING_URL}/api/x`), SPLIT)).toBe(STAGING_URL);
    expect(originFor("booking", new URL("http://localhost:3400/api/x"), SPLIT)).toBe("http://localhost:3400");
    expect(originFor("staff", new URL(`${BOOK}/api/x`), { SITE_URL: BOOK })).toBe(BOOK);
  });

  it("Google comes back to the staff address; staging and localhost keep their own", () => {
    expect(googleRedirectUri(new URL(`${STAFF}/api/auth/google?next=/b`), SPLIT)).toBe(`${STAFF}/api/auth/google/callback`);
    expect(googleRedirectUri(new URL(`${BOOK}/api/auth/google`), SPLIT)).toBe(`${STAFF}/api/auth/google/callback`);
    expect(googleRedirectUri(new URL(`${STAGING_URL}/api/auth/google`), SPLIT)).toBe(`${STAGING_URL}/api/auth/google/callback`);
    expect(googleRedirectUri(new URL("http://localhost:3400/api/auth/google"), {})).toBe("http://localhost:3400/api/auth/google/callback");
  });
});

describe("proxy with the two addresses", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_URL", BOOK);
    vi.stubEnv("STAFF_URL", STAFF);
  });
  afterEach(() => vi.unstubAllEnvs());
  const req = (url: string, cookie = "") => proxy(new NextRequest(url, { headers: { "accept-language": "et-EE,et;q=0.9", ...(cookie ? { cookie } : {}) } }));

  it("redirects the other half with status, path and query, and says noindex even with indexing on", () => {
    // vitest runs as rempire.ee: ALLOW_INDEXING=yes (vitest.config.ts)
    expect(process.env.ALLOW_INDEXING).toBe("yes");
    const toStaff = req(`${BOOK}/admin/clients?q=1`, `${SESSION_COOKIE}=x`);
    expect(toStaff.status).toBe(308);
    expect(toStaff.headers.get("location")).toBe(`${STAFF}/admin/clients?q=1`);
    expect(toStaff.headers.get("x-robots-tag")).toBe(NOINDEX_HEADER);
    // no cookie is written on the wrong host
    expect(toStaff.headers.get("set-cookie")).toBeNull();
    const toBook = req(`${STAFF}/et/about?x=1`);
    expect(toBook.status).toBe(308);
    expect(toBook.headers.get("location")).toBe(`${BOOK}/et/about?x=1`);
    expect(toBook.headers.get("x-robots-tag")).toBe(NOINDEX_HEADER);
    const start = req(`${STAFF}/`);
    expect(start.status).toBe(307);
    expect(start.headers.get("location")).toBe(`${STAFF}${START_PATH}`);
    expect(start.headers.get("x-robots-tag")).toBe(NOINDEX_HEADER);
  });

  it("each host serves its own half as before", () => {
    // the client host: the language redirect, pages through
    const lang = req(`${BOOK}/`);
    expect(lang.status).toBe(307);
    expect(lang.headers.get("location")).toBe(`${BOOK}/et`);
    expect(req(`${BOOK}/ru`).headers.get("location")).toBeNull();
    expect(req(`${BOOK}/v/abcdefghijklmnop`).headers.get("location")).toBeNull();
    // the staff host: the login gate, the side cookie
    const gate = req(`${STAFF}/b/week?d=2026-11-17`);
    expect(gate.status).toBe(307);
    expect(gate.headers.get("location")).toBe(`${STAFF}/b/login?next=%2Fb%2Fweek%3Fd%3D2026-11-17`);
    const inside = req(`${STAFF}/admin`, `${SESSION_COOKIE}=x`);
    expect(inside.headers.get("location")).toBeNull();
    expect(inside.headers.get("x-robots-tag")).toBe(NOINDEX_HEADER);
    expect(inside.cookies.get("rb_side")?.value).toBe("admin");
    // the start itself, without a login, goes to the login
    expect(req(`${STAFF}${START_PATH}`).headers.get("location")).toBe(`${STAFF}/b/login?next=%2Fb%2Fstart`);
  });

  it("reads the host from the Host header: self-hosted, Next puts localhost into the URL whatever was asked", () => {
    expect(requestUrlOf(new Request("http://localhost:3400/admin?x=1", { headers: { host: "book.example.test" } })).href).toBe("http://book.example.test/admin?x=1");
    expect(requestUrlOf(new Request("http://localhost:3400/admin")).href).toBe("http://localhost:3400/admin");
    const asked = (path: string, host: string) => proxy(new NextRequest(`http://localhost:3400${path}`, { headers: { host } }));
    expect(asked("/admin", "book.example.test").headers.get("location")).toBe(`${STAFF}/admin`);
    expect(asked("/ru", "staff.example.test").headers.get("location")).toBe(`${BOOK}/ru`);
    expect(asked("/admin", "localhost:3400").headers.get("location")).toBe("http://localhost:3400/admin/login");
  });

  it("any other host serves everything exactly as today", () => {
    for (const host of [STAGING_URL, "http://localhost:3400", "https://rempire-booking-abc.vercel.app"]) {
      expect(req(`${host}/`).headers.get("location")).toBe(`${host}/et`);
      expect(req(`${host}/ru`).headers.get("location")).toBeNull();
      expect(req(`${host}/admin`).headers.get("location")).toBe(`${host}/admin/login`);
      expect(req(`${host}/b`, `${SESSION_COOKIE}=x`).headers.get("location")).toBeNull();
      expect(req(`${host}/robots.txt`).headers.get("location")).toBeNull();
      expect(req(`${host}/robots.txt`).headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("robots.txt on the staff host closes everything; the client host's is robots.ts's", async () => {
    const staff = req(`${STAFF}/robots.txt`);
    expect(staff.status).toBe(200);
    expect(await staff.text()).toBe(STAFF_ROBOTS);
    expect(STAFF_ROBOTS).toMatch(/^User-agent: \*\nDisallow: \/\n$/);
    expect(staff.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(staff.headers.get("x-robots-tag")).toBe(NOINDEX_HEADER);
    const book = req(`${BOOK}/robots.txt`);
    expect(book.headers.get("x-middleware-next")).toBe("1");
  });

  it("off (STAFF_URL unset or the same host): the two hosts serve everything", () => {
    vi.stubEnv("STAFF_URL", "");
    expect(req(`${BOOK}/admin`).headers.get("location")).toBe(`${BOOK}/admin/login`);
    expect(req(`${BOOK}/robots.txt`).headers.get("x-middleware-next")).toBe("1");
    vi.stubEnv("STAFF_URL", `${BOOK}/`);
    expect(req(`${BOOK}/b`).headers.get("location")).toBe(`${BOOK}/b/login`);
    expect(req(`${BOOK}/ru`).headers.get("location")).toBeNull();
  });
});

describe("what never passes the proxy, so every host serves it", () => {
  const passes = (path: string) => unstable_doesMiddlewareMatch({ config, url: `${STAFF}${path}` });

  it("the API, Next's own files, manifests, icons and service workers: no redirect on either host", () => {
    for (const p of [
      "/api/slots?date=2026-11-17",
      "/api/auth/google",
      "/api/auth/google/callback",
      "/api/ics/abc",
      "/api/visit/abc/push",
      "/api/health",
      "/_next/static/chunks/main.js",
      "/b/manifest.webmanifest",
      "/ru/manifest.webmanifest",
      "/b/sw.js",
      "/sw.js",
      "/b/icons/icon-192.png",
      "/icons/app-192.png",
      "/mail/info.png",
      "/brand/rempire-logo-white.png",
      "/favicon.ico",
      "/icon.svg",
    ]) {
      expect(passes(p), p).toBe(false);
    }
  });

  it("the pages and robots.txt do", () => {
    for (const p of ["/", "/ru", "/v/abcdefghijklmnop", "/admin", "/admin/clients", "/b", "/b/start", "/robots.txt"]) expect(passes(p), p).toBe(true);
  });
});

describe("letters: staff ones on STAFF_URL, client ones on SITE_URL", () => {
  let demo: Demo;
  beforeEach(async () => {
    demo = await freshDemo();
    sentToConsole.length = 0;
    sentSms.length = 0;
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(closeDb);

  const hosts = (l: LetterBody) => [...new Set([...(l.html ?? "").matchAll(/https:\/\/([a-z0-9.-]+)\//g)].map((m) => m[1]))].sort();

  it("the login code letter: its pictures from the staff address", async () => {
    vi.stubEnv("SITE_URL", BOOK);
    vi.stubEnv("STAFF_URL", STAFF);
    const r = await createUser(query, demo.business.id, { email: "owner@example.test", name: "Owner", role: "owner", staffId: null, password: null });
    if (!r.ok) throw new Error(r.field);
    const sent: LetterBody[] = [];
    expect(
      await sendLoginCode(query, "owner@example.test", "203.0.113.7", Date.now(), async (_to, _subject, body) => {
        sent.push(typeof body === "string" ? { text: body } : body);
        return { provider: "console", ref: null };
      }),
    ).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(hosts(sent[0])).toEqual(["staff.example.test"]);
  });

  const TZ = "Europe/Tallinn";
  const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
  const ENV = { NODE_ENV: "test", VITEST: "true", ALLOW_INDEXING: "yes", ...SPLIT };
  let n = 0;
  const input = (o: Partial<BookingInput> = {}): BookingInput => ({
    serviceIds: [demo.services.clip],
    staffId: demo.staff.renat,
    startsAt: new Date(at("2026-11-17", "12:00")).toISOString(),
    name: "Test Client",
    phone: "+372 5555 0401",
    email: null,
    comment: "",
    locale: "ru",
    smsReminder: false,
    idempotencyKey: `hosts-${++n}-${Math.random()}`,
    ...o,
  });

  /** the first Tuesday at least a week from today: the confirmation goes on the real clock */
  function tuesday(): string {
    let d = addDays(todayIn(TZ), 7);
    while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 2) d = addDays(d, 1);
    return d;
  }

  it("the confirmation letter, its change link and its calendar: the client address only", async () => {
    const r = await book(query, demo.business, input({ email: "client@example.test", startsAt: new Date(at(tuesday(), "12:00")).toISOString() }), { now: Date.now() });
    if (!r.ok) throw new Error(r.code);
    expect((await sendForVisit(query, r.visit.id, Date.now(), ENV)).sent).toBe(1);
    const l = sentToConsole[0];
    expect(hosts(l)).toContain("book.example.test");
    expect(hosts(l)).not.toContain("staff.example.test");
    expect(l.html).toMatch(/https:\/\/book\.example\.test\/ru\/visit\/[A-Za-z0-9_-]+/);
    expect(l.html).toMatch(/https:\/\/book\.example\.test\/api\/ics\//);
    expect(l.html).toMatch(/https:\/\/book\.example\.test\/brand\//);
    const ics = String(l.attachments?.[0].content ?? "").replace(/\r\n /g, "");
    expect(ics).toContain("https://book.example.test/ru/visit/");
    expect(ics).not.toContain("staff.example.test");

    // the .ics link served on any host: its change link is still the client address's
    const token = /\/api\/ics\/([A-Za-z0-9_-]+)/.exec(l.html ?? "")?.[1] ?? "";
    vi.stubEnv("SITE_URL", BOOK);
    vi.stubEnv("STAFF_URL", STAFF);
    // long lines are folded (RFC 5545): unfold before reading
    const fetched = async (origin: string) => (await (await icsRoute(new Request(`${origin}/api/ics/${token}?lang=en`), { params: Promise.resolve({ token }) } as never)).text()).replace(/\r\n /g, "");
    expect(await fetched(STAFF)).toContain(`${BOOK}/en/visit/${token}`);
    expect(await fetched(BOOK)).toContain(`${BOOK}/en/visit/${token}`);
    // today's staging host keeps its own
    expect(await fetched(STAGING_URL)).toContain(`${STAGING_URL}/en/visit/${token}`);
  });

  it("the SMS reminder's short link: the client address", async () => {
    const r = await book(query, demo.business, input({ smsReminder: true }), { now: at("2026-11-16", "10:00") });
    if (!r.ok) throw new Error(r.code);
    await runOutbox(query, at("2026-11-17", "10:01"), ENV);
    expect(sentSms).toHaveLength(1);
    expect(sentSms[0].text).toMatch(/https:\/\/book\.example\.test\/v\/[A-Za-z0-9_-]{16}/);
    expect(sentSms[0].text).not.toContain("staff.example.test");
  });
});
