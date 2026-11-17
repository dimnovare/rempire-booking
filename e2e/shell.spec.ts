import { authFile } from "./env";
import { B, expect, expectNoSideScroll, smallTargets, test } from "./helpers";

/** B1: the app's shell, before and around the login. */
test.describe("shell, logged out", () => {
  test("/b sends a phone without a session to the login, noindex", async ({ page }) => {
    const res = await page.goto("/b");
    expect(new URL(page.url()).pathname).toBe("/b/login");
    expect(res?.headers()["x-robots-tag"]).toMatch(/noindex/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByRole("heading", { name: B.login.title })).toBeVisible();
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
  });

  test("a wrong code is refused, and says so", async ({ page }) => {
    await page.goto("/b/login");
    await page.getByRole("button", { name: B.login.byCode }).click();
    await page.locator('input[name="email"]').fill("milena@example.test");
    await page.getByRole("button", { name: B.login.sendCode }).click();
    await expect(page.getByText(B.login.codeSent)).toBeVisible();
    await page.locator('input[name="code"]').fill("000000");
    await page.locator('input[name="code"]').press("Enter");
    await expect(page.getByText(B.login.badCode)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/b/login");
  });

  test("the manifest: scoped to /b, standalone, with icons that load", async ({ page, request }) => {
    await page.goto("/b/login");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBeTruthy();
    const res = await request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/manifest\+json|application\/json/);
    const m = await res.json();
    expect(m.scope).toBe("/b");
    expect(m.start_url).toMatch(/^\/b/);
    expect(m.display).toBe("standalone");
    expect(m.icons.length).toBeGreaterThanOrEqual(3);
    for (const icon of m.icons) {
      const r = await request.get(icon.src);
      expect(r.status(), icon.src).toBe(200);
      expect(r.headers()["content-type"]).toMatch(/image\/png/);
    }
    // the iPhone's home-screen icon and full-screen tags
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
    expect((await request.get(apple!)).status()).toBe(200);
  });

  test("the service worker file: allowed for /b, never cached by the browser", async ({ request }) => {
    const res = await request.get("/b/sw.js");
    expect(res.status()).toBe(200);
    expect(res.headers()["service-worker-allowed"]).toBe("/b");
    expect(res.headers()["content-type"]).toMatch(/javascript/);
    expect(res.headers()["cache-control"] ?? "").toMatch(/no-cache|no-store|max-age=0/);
  });

  test("the install guide opens without a login", async ({ page }) => {
    await page.goto("/b/install");
    await expect(page.getByRole("heading", { name: B.install.title })).toBeVisible();
    await expect(page.getByText(B.install.iphoneSteps[1])).toBeVisible();
    await expectNoSideScroll(page);
  });

  test("robots.txt keeps /b out", async ({ request }) => {
    const txt = await (await request.get("/robots.txt")).text();
    expect(txt).toMatch(/Disallow: \/(\s|$)|Disallow: \/b/);
  });
});

test.describe("shell, a barber's login", () => {
  test.use({ storageState: authFile("valentin") });

  test("a barber cannot open the admin", async ({ page }) => {
    await page.goto("/admin/requests");
    await expect(page.getByRole("heading", { name: "Запросы" })).toHaveCount(0);
  });

  test("a barber has no «Чей день смотреть»: /b/pick sends him to his own day", async ({ page }) => {
    await page.goto("/b/pick");
    await page.waitForURL((u) => u.pathname === "/b");
  });
});
