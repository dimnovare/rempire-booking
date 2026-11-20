/**
 * The barber app's shell (B1): where a login may land, the /b gate in the
 * proxy, the manifest, and that every dictionary has every word.
 */
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { COPY } from "@/app/b/copy";
import { GET as manifest } from "@/app/b/manifest.webmanifest/route";
import { detectPlatform } from "@/app/b/use-install";
import { afterLogin, loginPageFor, safeBarberPath, safeStaffPath, SESSION_COOKIE, START_PATH, VIEW_AS_COOKIE } from "@/lib/auth/cookie";
import { appKind, SIDE_COOKIE, sideOf, startPath } from "@/lib/auth/side";
import { proxy } from "@/proxy";

describe("login «next» paths", () => {
  it("keeps a barber app path and refuses everything else", () => {
    expect(safeBarberPath("/b")).toBe("/b");
    expect(safeBarberPath("/b/week?d=2026-11-17")).toBe("/b/week?d=2026-11-17");
    for (const bad of ["/admin", "//evil.example", "/b//evil", "https://evil.example/b", "/b/login", "/bad", "", null, 5]) {
      expect(safeBarberPath(bad)).toBe("/b");
    }
  });

  it("sends each app's path back to its own app", () => {
    expect(safeStaffPath("/b/more")).toBe("/b/more");
    expect(safeStaffPath("/admin/staff")).toBe("/admin/staff");
    expect(safeStaffPath("/bogus")).toBe("/admin");
    expect(loginPageFor("/b")).toBe("/b/login");
    expect(loginPageFor("/b?d=2026-11-17")).toBe("/b/login");
    expect(loginPageFor("/admin")).toBe("/admin/login");
    expect(loginPageFor("/bogus")).toBe("/admin/login");
  });
});

describe("the staff app's start (docs/apps.md)", () => {
  it("a barber lands on his day, whatever the device remembers", () => {
    expect(startPath({ role: "staff", staffId: "x" })).toBe("/b");
    expect(startPath({ role: "staff", staffId: "x" }, "admin")).toBe("/b");
  });

  it("an owner or the front desk linked to a barber: what the device had open last of «Мой день» and «Журнал»; the first time, «Мой день»", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(startPath({ role, staffId: "x" })).toBe("/b");
      expect(startPath({ role, staffId: "x" }, "")).toBe("/b");
      expect(startPath({ role, staffId: "x" }, "b")).toBe("/b");
      expect(startPath({ role, staffId: "x" }, "admin")).toBe("/admin");
      expect(startPath({ role, staffId: "x" }, "elsewhere")).toBe("/b");
    }
  });

  it("an owner or the front desk not linked to a barber: the journal, whatever the device remembers", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(startPath({ role, staffId: null })).toBe("/admin");
      expect(startPath({ role, staffId: null }, "")).toBe("/admin");
      expect(startPath({ role, staffId: null }, "admin")).toBe("/admin");
      // (until 19.11.2026 «b» took such a login to the barber picker: the side switch's «Барбер»)
      expect(startPath({ role, staffId: null }, "b")).toBe("/admin");
      expect(startPath({ role, staffId: null }, "elsewhere")).toBe("/admin");
    }
  });

  it("how the app is put together for a login", () => {
    expect(appKind({ role: "staff", staffId: "x" })).toBe("barber");
    expect(appKind({ role: "owner", staffId: "x" })).toBe("own");
    expect(appKind({ role: "admin", staffId: "x" })).toBe("own");
    expect(appKind({ role: "owner", staffId: null })).toBe("salon");
    expect(appKind({ role: "admin", staffId: null })).toBe("salon");
  });

  it("a login with no page in mind goes to the start; a real page is kept", () => {
    for (const none of ["/admin", "/b", "", null, "/bogus", "//evil.example"]) expect(afterLogin(none)).toBe(START_PATH);
    expect(afterLogin("/admin/staff")).toBe("/admin/staff");
    expect(afterLogin("/b/week?d=2026-11-17")).toBe("/b/week?d=2026-11-17");
  });

  it("the proxy notes the side a device has open, but not on the start or a login page", () => {
    const side = (path: string, cookie = `${SESSION_COOKIE}=x`) => proxy(new NextRequest(`http://localhost:3400${path}`, { headers: { cookie } })).cookies.get(SIDE_COOKIE)?.value;
    expect(sideOf("/admin/staff")).toBe("admin");
    expect(sideOf("/b/week")).toBe("b");
    expect(side("/admin/requests")).toBe("admin");
    expect(side("/b/time")).toBe("b");
    // the page a phone was after, even before it is logged in
    expect(side("/admin", "")).toBe("admin");
    // nothing to say: already noted, the start itself, a login page
    expect(side("/admin", `${SESSION_COOKIE}=x; ${SIDE_COOKIE}=admin`)).toBeUndefined();
    expect(side(START_PATH)).toBeUndefined();
    expect(side("/b/login")).toBeUndefined();
    expect(side("/admin/login")).toBeUndefined();
  });

  it("a salon page ends «looking at a barber's app»; a page of the barber's half keeps it", () => {
    const viewAs = (path: string, cookie: string) => proxy(new NextRequest(`http://localhost:3400${path}`, { headers: { cookie } })).cookies.get(VIEW_AS_COOKIE);
    const looking = `${SESSION_COOKIE}=x; ${VIEW_AS_COOKIE}=11111111-1111-4111-8111-111111111111`;
    // forgotten: the cookie is sent back empty and already expired
    for (const path of ["/admin", "/admin/staff", "/admin/more"]) {
      expect(viewAs(path, looking)?.value).toBe("");
      expect(new Date(viewAs(path, looking)?.expires ?? Number.NaN).getTime()).toBeLessThan(Date.now());
    }
    for (const path of ["/b", "/b/time", "/b/more", START_PATH]) expect(viewAs(path, looking)).toBeUndefined();
    // nothing to forget, and a login page is not the salon yet
    expect(viewAs("/admin", `${SESSION_COOKIE}=x`)).toBeUndefined();
    expect(viewAs("/admin/login", looking)).toBeUndefined();
  });
});

describe("proxy: /b", () => {
  it("sends a phone without a session to the barber login, noindex", () => {
    const res = proxy(new NextRequest("http://localhost:3400/b/week?d=2026-11-17"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3400/b/login?next=%2Fb%2Fweek%3Fd%3D2026-11-17");
    expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(proxy(new NextRequest("http://localhost:3400/b")).headers.get("location")).toBe("http://localhost:3400/b/login");
  });

  it("lets the login page and the install guide open without one", () => {
    for (const p of ["/b/login", "/b/install"]) {
      const res = proxy(new NextRequest(`http://localhost:3400${p}`));
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
    }
  });

  it("lets a phone with a session cookie through (the page checks it)", () => {
    const res = proxy(new NextRequest("http://localhost:3400/b", { headers: { cookie: `${SESSION_COOKIE}=x` } }));
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("manifest", () => {
  it("is the one staff app: starts at /b/start, covers both sides, standalone, with the three icons", async () => {
    const res = manifest();
    expect(res.headers.get("content-type")).toMatch(/application\/manifest\+json/);
    const m = await res.json();
    // the id stays /b, so a phone that installed the barber app keeps its app
    expect(m).toMatchObject({ id: "/b", start_url: "/b/start", scope: "/", display: "standalone" });
    expect(m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`)).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
  });

  it("starts on pure white, the white of its icon's square (src/app/b/icons), so no edge shows (Dim, 20.11)", async () => {
    const m = await manifest().json();
    expect(m).toMatchObject({ background_color: "#ffffff", theme_color: "#ffffff" });
  });
});

describe("install guide", () => {
  it("tells an iPhone from an Android", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe("other");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android");
  });
});

describe("words", () => {
  // every key of the Russian reference exists in ET and EN, all the way down
  const shape = (v: unknown): unknown =>
    Array.isArray(v) ? v.length : typeof v === "function" ? "fn" : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])) : typeof v;
  it("ET and EN have the same words as RU", () => {
    expect(shape({ ...COPY.et, lang: "ru" })).toEqual(shape(COPY.ru));
    expect(shape({ ...COPY.en, lang: "ru" })).toEqual(shape(COPY.ru));
  });
});
