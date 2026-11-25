import { en } from "../src/app/b/copy.en";
import { authFile } from "./env";
import { B, expect, expectNoSideScroll, hydrated, L, smallTargets, test } from "./helpers";

/** B1: the app's shell, before and around the login. */
test.describe("shell, logged out", () => {
  test("/b sends a phone without a session to the login, noindex", async ({ page }) => {
    const res = await page.goto("/b");
    expect(new URL(page.url()).pathname).toBe("/b/login");
    expect(res?.headers()["x-robots-tag"]).toMatch(/noindex/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByRole("heading", { name: L.title })).toBeVisible();
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
  });

  test.describe(() => {
    // its own address (TEST-NET), so the code letters it asks for leave the
    // other tests' hourly limit alone; on Vercel x-real-ip is Vercel's own
    test.use({ extraHTTPHeaders: { "x-real-ip": "203.0.113.7" } });

    // a known address and a stranger's: the same answer, never «no such login»
    for (const email of ["milena@example.test", "stranger@example.test"]) {
      test(`a wrong code is refused, and says so (${email.split("@")[0]})`, async ({ page }) => {
        await page.goto("/b/login");
        await hydrated(page);
        // the code first: no tab to press
        await page.locator('input[name="email"]').fill(email);
        await page.getByRole("button", { name: L.sendCode }).click();
        await expect(page.getByText(L.sentTo)).toContainText(email);
        await page.locator('input[name="code"]').fill("000000");
        await page.locator('input[name="code"]').press("Enter");
        await expect(page.getByText(L.err.badCode)).toBeVisible();
        expect(new URL(page.url()).pathname).toBe("/b/login");
      });
    }

    test("a code already sent survives a reload; «Другой e-mail» starts again", async ({ page }) => {
      await page.goto("/b/login");
      await hydrated(page);
      await page.locator('input[name="email"]').fill("stranger2@example.test");
      await page.getByRole("button", { name: L.sendCode }).click();
      await expect(page.locator('input[name="code"]')).toBeVisible();
      // the resend waits its minute
      await expect(page.getByText(L.resendIn("0:"), { exact: false })).toBeVisible();
      // an iPhone app reloads when the mail app was opened: back on the code
      await page.reload();
      await hydrated(page);
      await expect(page.locator('input[name="code"]')).toBeVisible();
      await expect(page.getByText(L.sentTo)).toContainText("stranger2@example.test");
      await page.getByRole("button", { name: L.otherEmail }).click();
      await expect(page.locator('input[name="email"]')).toBeFocused();
      await expect(page.locator('input[name="code"]')).toHaveCount(0);
    });
  });

  test("the password is the second tab; the language is picked on the page", async ({ page }) => {
    await page.goto("/b/login");
    await hydrated(page);
    await page.getByRole("button", { name: L.tabPassword }).click();
    await expect(page.getByLabel(L.password, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: L.forgot }).click();
    await expect(page.getByRole("button", { name: L.sendCode })).toBeVisible();
    await page.getByRole("button", { name: "Eesti" }).click();
    await expect(page.getByRole("heading", { name: "Sisselogimine" })).toBeVisible();
    // the same choice on the admin's login, on this device
    await page.goto("/admin/login");
    await expect(page.getByRole("heading", { name: "Sisselogimine" })).toBeVisible();
    await hydrated(page);
    await page.getByRole("button", { name: "Русский" }).click();
    await expect(page.getByRole("heading", { name: L.title })).toBeVisible();
  });

  test("the manifest: one staff app for both sides, standalone, with icons that load", async ({ page, request }) => {
    await page.goto("/b/login");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBeTruthy();
    const res = await request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/manifest\+json|application\/json/);
    const m = await res.json();
    expect(m.scope).toBe("/");
    expect(m.start_url).toBe("/b/start");
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
    await hydrated(page);
    // the phone's own system is chosen already; only its steps show
    const phone = page.getByRole("group", { name: B.install.phone });
    const android = test.info().project.name === "android";
    await expect(phone.getByRole("button", { name: android ? B.install.android : B.install.iphone })).toHaveAttribute("aria-pressed", "true");
    await phone.getByRole("button", { name: B.install.iphone }).click();
    await expect(page.getByText(B.install.iphoneSteps[1])).toBeVisible();
    await expect(page.getByText(B.install.androidSteps[0])).toHaveCount(0);
    await phone.getByRole("button", { name: B.install.android }).click();
    await expect(page.getByText(B.install.androidSteps[0])).toBeVisible();
    await expect(page.getByText(B.install.iphoneSteps[1])).toHaveCount(0);
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    // the language on the page itself, without a login
    await page.getByRole("combobox", { name: B.more.language }).selectOption("en");
    await expect(page.getByRole("heading", { level: 1, name: en.install.title })).toBeVisible();
    await expect(page.getByRole("group", { name: en.install.phone })).toBeVisible();
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
