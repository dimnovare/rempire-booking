import path from "node:path";
import type { Page } from "@playwright/test";
import { COPY } from "../src/lib/i18n";
import { OUT } from "./env";
import { expect, expectNoSideScroll, hydrated, test } from "./helpers";

/**
 * The client app (docs/apps.md): the booking site with its own manifest and
 * icon, the install offer after a booking (never before), and the visit
 * this device booked on top of the booking page until it is over or
 * cancelled. A fake client books Milena, whom no other test uses, and
 * cancels at the end.
 */
const c = COPY.ru;
const shot = async (page: Page, name: string) => {
  const body = await page.screenshot({ fullPage: true, path: path.join(OUT, "screens", `${test.info().project.name}-app-${name}.png`) });
  await test.info().attach(`app-${name}`, { body, contentType: "image/png" });
};

test.describe("the client app", () => {
  test("its own manifest and icon on every client page, never the staff app's", async ({ page, request }) => {
    for (const locale of ["ru", "et", "en"]) {
      await page.goto(`/${locale}`);
      const href = await page.locator('link[rel="manifest"]').getAttribute("href");
      expect(href).toBe(`/${locale}/manifest.webmanifest`);
      const m = await (await request.get(href!)).json();
      expect(m).toMatchObject({ id: "/", short_name: "REMPIRE", start_url: `/${locale}`, display: "standalone" });
      for (const icon of m.icons) {
        const r = await request.get(icon.src);
        expect(r.status(), icon.src).toBe(200);
        expect(r.headers()["content-type"]).toMatch(/image\/png/);
      }
    }
    // the iPhone's home-screen icon: the client's own, and it loads
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
    expect(apple).toMatch(/^\/en\/apple-icon/);
    expect((await request.get(apple!)).status()).toBe(200);
  });

  test("books; the install offer comes only then; the visit is on top next time, until it is cancelled", async ({ page }, info) => {
    const phone = `+372 5555 04${info.project.name === "iphone" ? "02" : "01"}`;
    await page.goto("/ru");
    await hydrated(page);
    // nothing about installing, and no visit yet
    await expect(page.locator(".install")).toHaveCount(0);
    await expect(page.locator(".next")).toHaveCount(0);

    // barber, service, a time some days ahead (so it can still be cancelled), details
    await page.locator(".chip", { hasText: "Milena" }).click();
    await page.locator(".svc-main").first().click();
    await expect(page.getByRole("heading", { level: 1, name: c.when })).toBeVisible();
    await expect(page.locator(".install")).toHaveCount(0);
    await page.locator(".days .day:not(.off)").nth(3).click();
    await page.locator(".slots button").first().click();
    await page.locator("#f-name").fill("App Test Client");
    await page.locator("#f-phone").fill(phone);
    await page.locator(".bar-go").click();
    await expect(page.getByRole("heading", { level: 1, name: c.booked })).toBeVisible();

    // now the offer, in this phone's own words
    const offer = page.getByRole("region", { name: c.install.title });
    await expect(offer).toBeVisible();
    await expect(offer.getByText(info.project.name === "iphone" ? c.install.ios[1] : c.install.android)).toBeVisible();
    await expectNoSideScroll(page);
    await shot(page, "booked");

    // «Не сейчас»: gone, and it stays gone
    await offer.getByRole("button", { name: c.install.later }).click();
    await expect(page.locator(".install")).toHaveCount(0);

    // the next time the app opens: the visit on top
    await page.goto("/ru");
    await hydrated(page);
    const next = page.locator(".next");
    await expect(next).toBeVisible();
    await expect(next).toContainText(c.yourVisit);
    await expect(next).toContainText("Milena");
    await expect(next).toContainText(c.changeCancel);
    await expectNoSideScroll(page);
    await shot(page, "next-visit");

    // it leads to the visit; cancelled there, it is gone from the booking page
    await next.click();
    await page.waitForURL((u) => /^\/ru\/visit\//.test(u.pathname));
    await hydrated(page);
    await page.getByRole("button", { name: c.cancel }).click();
    await page.getByRole("button", { name: c.cancelYes }).click();
    await expect(page.getByRole("heading", { level: 1, name: c.cancelled })).toBeVisible();
    await page.goto("/ru");
    await hydrated(page);
    await expect(page.locator(".next")).toHaveCount(0);
    await expect(page.locator(".install")).toHaveCount(0);
  });
});
