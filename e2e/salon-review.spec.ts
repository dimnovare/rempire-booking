import path from "node:path";
import type { Page } from "@playwright/test";
import { COPY } from "../src/lib/i18n";
import { OUT } from "./env";
import { A, asOwner, expect, expectNoSideScroll, hydrated, test, toast } from "./helpers";

/**
 * «Оцените и напишите отзыв» (Dim, 20.11.2026, decision page round 11): a
 * client rates the salon on its page, writes a few words and sends them;
 * the review waits, out of sight, until the owner approves it in «Отзывы»
 * («Новый», «Одобрить»); then it is on the salon's page. At the end the
 * owner hides it again, so the salon's count is as app.spec.ts expects.
 *
 * One review a phone: the server takes three an hour from one address, and
 * every test here comes from the same one. No OpenStreetMap tile is
 * fetched: the map's tiles are turned away, and the map shows its ground.
 */
const c = COPY.ru;
const V = A.reviews;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const shot = async (page: Page, name: string) => {
  const file = `${test.info().project.name}-salon-${name}.png`;
  const body = await page.screenshot({ path: path.join(OUT, "screens", file) });
  await test.info().attach(file, { body, contentType: "image/png" });
};

test.describe("a client's review of the salon", () => {
  test.use(asOwner);
  test.beforeEach(async ({ page }) => {
    await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  });

  test("rated and written on the salon's page, approved in «Отзывы», shown; then hidden again", async ({ page }) => {
    const who = `Тест Клиент ${test.info().project.name}`;
    const words = `Проверка отзыва e2e ${test.info().project.name}.`;
    await page.goto("/ru/about");
    await hydrated(page);
    const s = page.locator("main.ab-app");

    // the card: five empty stars under «Отзывы»
    const card = s.getByRole("region", { name: c.salon.rate });
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByRole("button")).toHaveCount(5);
    await expectNoSideScroll(page);
    await shot(page, "review-card");

    // a tap on the fourth opens the sheet with four lit
    await card.getByRole("button", { name: c.salon.rateN(4) }).click();
    // the sheet is named by its heading: «Ваш отзыв», then «Спасибо за отзыв!»
    const sheet = page.getByRole("dialog");
    await expect(page.getByRole("dialog", { name: c.salon.yours })).toBeVisible();
    await expect(sheet.getByRole("radio", { name: c.rated("4") })).toHaveAttribute("aria-checked", "true");
    await expect(sheet.getByText(c.salon.words[3], { exact: true })).toBeVisible();
    await expect(sheet.getByText(c.salon.afterCheck)).toBeVisible();
    // about the salon unless a barber is picked
    await expect(sheet.getByRole("radio", { name: c.salon.whomSalon, exact: true })).toHaveAttribute("aria-checked", "true");

    // five after all, from the stars in the sheet
    await sheet.getByRole("radio", { name: c.rated("5") }).click();
    await expect(sheet.getByText(c.salon.words[4], { exact: true })).toBeVisible();

    // no name: said under the field, nothing sent
    await sheet.getByRole("button", { name: c.salon.send }).click();
    await expect(sheet.getByText(c.salon.errName)).toBeVisible();
    await sheet.getByLabel(c.salon.name, { exact: true }).fill(who);
    await sheet.getByLabel(c.salon.text, { exact: true }).fill(words);
    await expect(sheet.getByText(c.salon.errName)).toHaveCount(0);
    await expectNoSideScroll(page);
    await shot(page, "review-sheet");
    // a person takes a few seconds to write: one sent sooner is taken for a bot's and dropped
    await page.waitForTimeout(2600);
    await sheet.getByRole("button", { name: c.salon.send }).click();

    // thank you; closed, the card says it went to the salon
    await expect(sheet.getByRole("heading", { name: c.salon.thanks })).toBeVisible();
    await shot(page, "review-thanks");
    await sheet.getByRole("button", { name: c.salon.done }).click();
    await expect(sheet).toHaveCount(0);
    await expect(card.getByText(c.salon.sent)).toBeVisible();

    // not on the page before the salon has looked at it
    await page.reload();
    await hydrated(page);
    await expect(page.locator("main.ab-app").getByText(words)).toHaveCount(0);

    // «Отзывы»: «1 новый отзыв ждёт проверки», «Показать новые», the new one with «Новый»
    await page.goto("/admin/reviews");
    await expect(page.locator("h1.adm-h1:visible", { hasText: V.title })).toBeVisible();
    await hydrated(page);
    await expect(page.locator(".rv-waiting")).toContainText(V.waiting(1));
    await page.getByRole("button", { name: V.showWaiting }).click();
    const row = page.locator(".rv-item:visible, .rv-table tbody tr:visible").filter({ hasText: words });
    await expect(row).toHaveCount(1);
    await expect(row.getByText(V.newTag, { exact: true })).toBeVisible();
    await expect(page.locator(".rv-waiting")).toHaveCount(0);
    await shot(page, "review-new");
    await row.getByRole("button", { name: new RegExp(`^${esc(V.approveFor(who, ""))}`) }).click();
    await expect(toast(page)).toContainText(V.approved);
    await expect(row.getByText(V.newTag, { exact: true })).toHaveCount(0);

    // on the salon's page now, the newest first
    await page.goto("/ru/about");
    await hydrated(page);
    const first = page.locator("main.ab-app .rv").first();
    await expect(first).toContainText(who);
    await expect(first).toContainText(words);
    await expect(first.getByRole("img", { name: c.rated("5") })).toBeVisible();

    // and off it again: the salon's reviews as the other specs know them
    await page.goto("/admin/reviews");
    await hydrated(page);
    const again = page.locator(".rv-item:visible, .rv-table tbody tr:visible").filter({ hasText: words });
    await again.getByRole("button", { name: new RegExp(`^${esc(V.hideFor(who, ""))}`) }).click();
    await expect(toast(page)).toContainText(V.hidden);
    await page.goto("/ru/about");
    await hydrated(page);
    await expect(page.locator("main.ab-app").getByText(words)).toHaveCount(0);
  });
});
