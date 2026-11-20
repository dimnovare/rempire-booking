import path from "node:path";
import type { Page } from "@playwright/test";
import { OUT } from "./env";
import { A, asOwner, expect, expectNoSideScroll, hydrated, test } from "./helpers";

/**
 * The reports Dim asked for in round 10 (20.11): «Основные показатели»
 * (sales, attendance, fill rate), «Визиты» (today's visits and the booking
 * feed) and «Отзывы»; then «Сообщения» (every message the app sent) and
 * «Изменения данных» (the change log, the owner's), decision 29. The owner
 * opens each on a phone and on a wide screen; the page has its title and its
 * cards, and nothing scrolls sideways. The demo has no reviews in the last
 * twelve months, so «Отзывы» says there are none unless salon-review.spec.ts
 * has sent one; it and the two logs hold whatever the other specs did, so
 * they show their count, and a change unfolds when there is one.
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

  test("«Отзывы»: none in the demo's last twelve months, or the ones salon-review.spec.ts sent", async ({ page }) => {
    await open(page, "/admin/reviews", A.reviews.title);
    const found = page.locator(".rc-found:visible");
    await expect(found).toBeVisible();
    const n = Number(await found.locator("b").textContent());
    if (n > 0) await expect(page.locator(wide ? ".rv-table tbody tr:visible" : ".rv-rows li:visible").first()).toBeVisible();
    else await expect(page.getByText(A.reviews.none)).toBeVisible();
    await expectNoSideScroll(page);
    await shot(page, "reviews", wide);
  });

  test("«Сообщения»: the log of what was sent", async ({ page }) => {
    await open(page, "/admin/messages", A.messages.title);
    const found = page.locator(".rc-found:visible");
    await expect(found).toBeVisible();
    const n = Number(await found.locator("b").textContent());
    if (n > 0) await expect(page.locator(wide ? ".msg-table tbody tr:visible" : ".msg-rows li:visible").first()).toBeVisible();
    else await expect(page.getByText(A.messages.none)).toBeVisible();
    await expectNoSideScroll(page);
    await shot(page, "messages", wide);
  });

  test("«Изменения данных»: the change log, a row unfolds", async ({ page }) => {
    await open(page, "/admin/changes", A.changes.title);
    const found = page.locator(".rc-found:visible");
    await expect(found).toBeVisible();
    const n = Number(await found.locator("b").textContent());
    if (n > 0) {
      const fold = page.locator("button[aria-controls^='chg-']:visible").first();
      await fold.click();
      await expect(fold).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator(`#${await fold.getAttribute("aria-controls")}`)).toBeVisible();
    } else await expect(page.getByText(A.changes.none)).toBeVisible();
    await expectNoSideScroll(page);
    await shot(page, "changes", wide);
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
