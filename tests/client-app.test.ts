/**
 * The client app (docs/apps.md): its manifest and icons, apart from the
 * staff app's, and the visit the booking page shows on top.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as clientManifest } from "@/app/[locale]/manifest.webmanifest/route";
import { GET as visitNow } from "@/app/api/visit/[token]/route";
import { GET as staffManifest } from "@/app/b/manifest.webmanifest/route";
import { GET as clientIcon } from "@/app/icons/[name]/route";
import { book } from "@/lib/booking";
import { closeDb, query } from "@/lib/db";
import { COPY, LOCALES } from "@/lib/i18n";
import { cancelByClient } from "@/lib/visits";
import { freshDemo, type Demo } from "./helpers";
import { zonedToUtc } from "@/lib/tz";

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});
afterAll(closeDb);

const manifestOf = async (locale: string) => clientManifest(new Request(`http://x/${locale}/manifest.webmanifest`), { params: Promise.resolve({ locale }) } as never);

describe("the client app's manifest", () => {
  it("is one app in three languages, starting on the booking page of its language", async () => {
    for (const locale of LOCALES) {
      const res = await manifestOf(locale);
      expect(res.headers.get("content-type")).toMatch(/application\/manifest\+json/);
      const m = await res.json();
      expect(m).toMatchObject({ id: "/", short_name: "REMPIRE", lang: locale, start_url: `/${locale}`, scope: "/", display: "standalone" });
      // the start-up screen is all black: no white around the black icon (Dim, 20.11)
      expect(m).toMatchObject({ background_color: "#000000", theme_color: "#000000" });
      expect(m.icons.map((i: { src: string; sizes: string; purpose: string }) => `${i.src} ${i.sizes} ${i.purpose}`)).toEqual([
        "/icons/app-192.png 192x192 any",
        "/icons/app-512.png 512x512 any",
        "/icons/app-maskable-512.png 512x512 maskable",
      ]);
    }
    expect((await manifestOf("de")).status).toBe(404);
  });

  it("is never the staff app: another id, another name, other icons", async () => {
    const client = await (await manifestOf("ru")).json();
    const staff = await staffManifest().json();
    expect(staff.id).not.toBe(client.id);
    expect(staff.short_name).toBe("REMPIRE Team");
    expect(staff.short_name).not.toBe(client.short_name);
    const srcs = (m: { icons: { src: string }[] }) => m.icons.map((i) => i.src);
    expect(srcs(staff).filter((s) => srcs(client).includes(s))).toEqual([]);
  });

  it("serves its three icons and nothing else", async () => {
    const icon = (name: string) => clientIcon(new Request(`http://x/icons/${name}`), { params: Promise.resolve({ name }) } as never);
    for (const name of ["app-192.png", "app-512.png", "app-maskable-512.png"]) {
      const res = await icon(name);
      expect(res.status, name).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
    }
    expect((await icon("icon-192.png")).status).toBe(404);
  });

  it("the install offer has its words in every language", () => {
    for (const locale of LOCALES) {
      const i = COPY[locale].install;
      for (const text of [i.title, i.lead, i.add, i.android, i.later, ...i.ios]) expect(text.length, locale).toBeGreaterThan(3);
      expect(i.ios).toHaveLength(2);
    }
  });
});

describe("GET /api/visit/<token>: the visit as it stands now", () => {
  const TZ = "Europe/Tallinn";
  const NOW = zonedToUtc("2026-11-16", "10:00", TZ);
  const now = (token: string) => visitNow(new Request(`http://x/api/visit/${token}`), { params: Promise.resolve({ token }) } as never);

  it("says when, with whom and what; then that it is cancelled; never who", async () => {
    const r = await book(
      query,
      demo.business,
      {
        serviceIds: [demo.services.clip],
        staffId: demo.staff.slava,
        startsAt: new Date(zonedToUtc("2026-11-17", "12:00", TZ)).toISOString(),
        name: "Test Client",
        phone: "+372 5555 0301",
        email: null,
        comment: "",
        locale: "ru",
        smsReminder: false,
        idempotencyKey: `client-app-${Math.random()}`,
      },
      { now: NOW },
    );
    if (!r.ok || !r.manageToken) throw new Error("book");

    const res = await now(r.manageToken);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
    const j = await res.json();
    expect(j).toMatchObject({ status: "booked", startsAt: r.visit.startsAt, staffId: demo.staff.slava, serviceIds: [demo.services.clip] });
    // the client's own link, but still no name or phone in the answer
    expect(JSON.stringify(j)).not.toMatch(/Test Client|5555/);

    expect(await cancelByClient(demo.business, r.manageToken, NOW)).toBe("cancelled");
    expect((await (await now(r.manageToken)).json()).status).toBe("cancelled");
  });

  it("answers 404 for a token that opens nothing", async () => {
    for (const token of ["nope", "A".repeat(32)]) {
      const res = await now(token);
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });
});
