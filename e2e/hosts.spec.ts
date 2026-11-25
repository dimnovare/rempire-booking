import { E2E_PORT, E2E_URL } from "./env";
import { A, asOwner, expect, hydrated, test } from "./helpers";

/**
 * Two addresses (docs/launch.md B3) on a real server: with E2E_SPLIT=yes
 * the e2e server (e2e/server.mjs) takes 127.0.0.1 as the client address
 * (SITE_URL) and localhost as the staff one (STAFF_URL), so the logins
 * e2e/auth.setup.ts made stay where they were made. Only in that run:
 *
 *   E2E_SPLIT=yes npm run e2e -- e2e/hosts.spec.ts --project=android
 *
 * The default run skips it: one address there, as on staging today.
 */
const STAFF = E2E_URL;
const BOOK = `http://127.0.0.1:${E2E_PORT}`;

test.skip(process.env.E2E_SPLIT !== "yes", "needs the e2e server with E2E_SPLIT=yes");
test.beforeEach(({}, info) => test.skip(info.project.name !== "android", "one phone is enough"));

test.describe("two addresses", () => {
  test("the other half's pages move host with their path and query, noindex; files and the API answer on both", async ({ request }) => {
    // where a redirect leads, as a full address (a same-host one comes relative)
    const hop = async (url: string) => {
      const r = await request.get(url, { maxRedirects: 0 });
      const to = r.headers()["location"];
      return { status: r.status(), to: to ? new URL(to, url).href : null, robots: r.headers()["x-robots-tag"] ?? "" };
    };
    const noindex = expect.stringMatching(/noindex/);
    expect(await hop(`${BOOK}/admin/clients?from=e2e`)).toEqual({ status: 308, to: `${STAFF}/admin/clients?from=e2e`, robots: noindex });
    expect(await hop(`${BOOK}/b/week?d=2026-11-17`)).toEqual({ status: 308, to: `${STAFF}/b/week?d=2026-11-17`, robots: noindex });
    expect(await hop(`${STAFF}/ru/about?from=e2e`)).toEqual({ status: 308, to: `${BOOK}/ru/about?from=e2e`, robots: noindex });
    expect(await hop(`${STAFF}/v/AAAAAAAAAAAAAAAA`)).toEqual({ status: 308, to: `${BOOK}/v/AAAAAAAAAAAAAAAA`, robots: noindex });
    expect(await hop(`${STAFF}/`)).toEqual({ status: 307, to: `${STAFF}/b/start`, robots: noindex });
    // each host's own pages as before: the language, the login gate
    expect((await hop(`${BOOK}/`)).to).toMatch(new RegExp(`^${BOOK}/(ru|et|en)$`));
    expect((await hop(`${STAFF}/b/start`)).to).toBe(`${STAFF}/b/login?next=%2Fb%2Fstart`);
    // Google starts on the staff address, so its cookie and the way back are there
    expect(await hop(`${BOOK}/api/auth/google?next=%2Fb`)).toMatchObject({ status: 307, to: `${STAFF}/api/auth/google?next=%2Fb` });

    // on both hosts, no redirect: the API, the manifests, the workers, the icons
    for (const host of [BOOK, STAFF]) {
      for (const path of ["/api/health", "/b/manifest.webmanifest", "/ru/manifest.webmanifest", "/b/sw.js", "/sw.js", "/b/icons/icon-192.png", "/icons/app-192.png"]) {
        const r = await request.get(`${host}${path}`, { maxRedirects: 0 });
        expect(r.status(), `${host}${path}`).toBe(200);
      }
    }
  });

  test("each manifest belongs to its own host; robots.txt closes the staff address", async ({ request }) => {
    const staffApp = await (await request.get(`${STAFF}/b/manifest.webmanifest`)).json();
    expect(staffApp).toMatchObject({ id: "/b", start_url: "/b/start", scope: "/", name: "REMPIRE · Team" });
    const clientApp = await (await request.get(`${BOOK}/ru/manifest.webmanifest`)).json();
    expect(clientApp).toMatchObject({ id: "/", start_url: "/ru", scope: "/", short_name: "REMPIRE" });
    // resolved against the host they come from, the two apps never share an address
    expect(new URL(staffApp.id, STAFF).origin).not.toBe(new URL(clientApp.id, BOOK).origin);

    const staffRobots = await request.get(`${STAFF}/robots.txt`);
    expect(await staffRobots.text()).toBe("User-agent: *\nDisallow: /\n");
    expect(staffRobots.headers()["x-robots-tag"]).toMatch(/noindex/);
    // the client address keeps robots.ts's (staging: closed, link previews allowed)
    const bookRobots = await (await request.get(`${BOOK}/robots.txt`)).text();
    expect(bookRobots).toMatch(/Disallow: \//);
    expect(bookRobots).toContain("facebookexternalhit");
  });

  test.describe("an owner", () => {
    test.use(asOwner);

    test("the staff address alone opens his app; an admin link on the client address lands on the staff one, logged in", async ({ page }) => {
      await page.goto(`${STAFF}/`);
      await page.waitForURL((u) => u.origin === STAFF && u.pathname === "/admin");
      await hydrated(page);
      // the journal, not a login page: the phone's bar
      await expect(page.getByRole("navigation", { name: A.sections })).toBeVisible();
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/b/manifest.webmanifest");

      await page.goto(`${BOOK}/admin/clients?from=e2e`);
      await page.waitForURL(`${STAFF}/admin/clients?from=e2e`);
      await hydrated(page);
      expect(new URL(page.url()).pathname).toBe("/admin/clients");
    });
  });

  test("a client's link on the staff address lands on the booking at the client address", async ({ page }) => {
    await page.goto(`${STAFF}/ru`);
    await page.waitForURL(`${BOOK}/ru`);
    await hydrated(page);
    await expect(page.getByRole("radio", { name: /Milena/ })).toBeVisible();
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/ru/manifest.webmanifest");
  });
});
