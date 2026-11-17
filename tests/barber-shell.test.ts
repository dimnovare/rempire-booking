/**
 * The barber app's shell (B1): where a login may land, the /b gate in the
 * proxy, the manifest, and that every dictionary has every word.
 */
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { COPY } from "@/app/b/copy";
import { GET as manifest } from "@/app/b/manifest.webmanifest/route";
import { detectPlatform } from "@/app/b/use-install";
import { loginPageFor, safeBarberPath, safeStaffPath, SESSION_COOKIE } from "@/lib/auth/cookie";
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
  it("is the barber app, scoped to /b, standalone, with the three icons", async () => {
    const res = manifest();
    expect(res.headers.get("content-type")).toMatch(/application\/manifest\+json/);
    const m = await res.json();
    expect(m).toMatchObject({ id: "/b", start_url: "/b", scope: "/b", display: "standalone" });
    expect(m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`)).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
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
