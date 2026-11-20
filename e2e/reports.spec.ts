import path from "node:path";
import type { Page } from "@playwright/test";
import { OUT } from "./env";
import { A, asOwner, expect, expectNoSideScroll, hydrated, test } from "./helpers";

/**
 * The reports Dim asked for in round 10 (20.11): «Основные показатели»
 * (sales, attendance, fill rate), «Визиты» (today's visits and the booking
 * feed) and «Отзывы». The owner opens each on a phone and on a wide screen;
 * the page has its title and its cards, and nothing scrolls sideways. The
 * demo has no reviews, so «Отзывы» says there are none.
 */
const D = A.dash;

const shot = async (page: Page, name: string, wide = false) => {
  const file = wide ? `pc-rep-${name}.png` : `${test.info().project.name}-rep-${name}.png`;
  const body = await page.screenshot({ fullPage: true, path: path.join(OUT, "screens", file) });
  await test.info().attach(file, { body, contentType: "image/png" });
};

const open = async (page: Page, url: string, title: string) => {
  await page.goto(url);
  await expect(page.locator("h1.adm-h1:visible", { hasText: title })).toBeVisible();
  await hydrated(page);
};

const checks = (wide: boolean) => {
  test("«Основные показатели»: sales, attendance and fill rate", async ({ page }) => {
    await open(page, "/admin/analytics", D.kpi);
    for (const h of [D.sales, D.attendance, D.fill]) {
      await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
    }
    await expectNoSideScroll(page);
    await shot(page, "kpi", wide);
  });

  test("«Визиты»: the day's visits and the booking feed", async ({ page }) => {
    await open(page, "/admin/dashboard", D.visitsTitle);
    await expect(page.getByRole("heading", { level: 2, name: D.visitsTitle })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: D.feedTitle })).toBeVisible();
    await page.getByRole("button", { name: D.past }).click();
    await expect(page.getByRole("button", { name: D.past })).toHaveAttribute("aria-pressed", "true");
    // the past visits come from the server: the panel is busy until they are in
    await expect(page.locator(".dsv-left:visible")).toHaveAttribute("aria-busy", "false");
    await expectNoSideScroll(page);
    await shot(page, "visits", wide);
  });

  test("«Отзывы»: none yet in the demo", async ({ page }) => {
    await open(page, "/admin/reviews", A.reviews.title);
    await expect(page.getByText(A.reviews.none)).toBeVisible();
    await expectNoSideScroll(page);
    await shot(page, "reviews", wide);
  });
};

test.describe("the reports, on a phone", () => {
  test.use(asOwner);
  checks(false);
});

test.describe("the reports, on a wide screen", () => {
  test.use({ ...asOwner, viewport: { width: 1440, height: 900 } });
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "android", "one wide run is enough");
  });
  checks(true);
});
