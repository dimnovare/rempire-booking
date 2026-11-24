import type { Page } from "@playwright/test";
import { asBarber, B, expect, hydrated, test } from "./helpers";

/**
 * The barber's day without a network: the service worker keeps the last
 * copy (public/b/sw.js). The worker caches only in the production build, so
 * these run with E2E_PROD=yes, on both phones: the iPhone through the https
 * front (playwright.config.ts). Apart from push.spec.ts, which is Chromium
 * only.
 */
test.use(asBarber);
test.skip(process.env.E2E_PROD !== "yes", "the worker caches nothing in `next dev`: run with E2E_PROD=yes");

/** His day, loaded once through the worker after it took the page over: from then on it keeps a copy. */
async function dayThroughTheWorker(page: Page) {
  await page.goto("/b");
  await hydrated(page);
  await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.reload();
  await hydrated(page);
}

test.describe("the service worker", () => {
  test("keeps his day, the app's files and his photo, served through it", async ({ page }) => {
    await dayThroughTheWorker(page);
    // the worker writes its copies after it has answered: wait for them
    const kept = () =>
      page.evaluate(async () => {
        // not the old browsers' polyfills (noModule): a phone of today never loads them
        const scripts = Array.from(document.scripts)
          .filter((s) => !s.noModule)
          .map((s) => s.src)
          .filter((s) => s.includes("/_next/static/"));
        const statics = await caches.open("rb-static-b2");
        return {
          scripts: scripts.length > 0,
          // every script of the page, from its cache
          scriptsKept: (await Promise.all(scripts.map((s) => statics.match(s)))).every(Boolean),
          // his day: only a page the worker answered is in there
          day: !!(await (await caches.open("rb-pages-b2")).match("/b")),
          // the logo and his photo
          images: (await (await caches.open("rb-img-b2")).keys()).length > 0,
        };
      });
    await expect.poll(kept).toEqual({ scripts: true, scriptsKept: true, day: true, images: true });
  });

  test("offline: his day as it was last loaded", async ({ page, context, browserName }) => {
    // Playwright's WebKit stops every request offline before the worker sees
    // it: even a file the worker serves from its own cache fails (checked
    // 24.11). The copies above are the iPhone's part; the page opened
    // offline on a real iPhone is docs/test-plan.md § 10.
    test.skip(browserName === "webkit", "Playwright's WebKit offline mode bypasses the service worker");
    await dayThroughTheWorker(page);
    const first = (await page.locator(".bx-cal .cal-v .bx-cv-txt b").first().innerText()).trim();
    await context.setOffline(true);
    // ten minutes later: the kept copy is old enough to say so (a weak
    // connection, as here, still reports navigator.onLine)
    await page.clock.install({ time: Date.now() + 10 * 60_000 });
    try {
      await page.reload();
      await expect(page.locator(".bx-cal .cal-v .bx-cv-txt b").first()).toHaveText(first);
      await expect(page.locator(".bx-state.is-off")).toHaveText(B.offline);
      // the logo and his photo from the kept copies
      for (const img of await page.locator("img:visible").all()) {
        await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      }
      // a page never loaded: the day instead
      await page.goto("/b/week");
      await expect(page.locator(".bx-cal .cal-v").first()).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
