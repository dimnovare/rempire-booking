import { COPY } from "../src/lib/i18n";
import { SALON_FALLBACK } from "../src/lib/salon-fallback";
import { A, asBarber, asOwner, B, expect, expectNoSideScroll, hydrated, test } from "./helpers";

/**
 * «Такой страницы нет» (round 18, 26.11.2026): an address nobody answers
 * gets its own part's look and language, never Next.js's black English 404.
 * Clients: the booking's head, «Записаться» and «Позвонить в салон»; an old
 * visit link the same; the admin keeps its frame with «Открыть журнал»; the
 * barber app its tabs with «Открыть мой день».
 */
const c = COPY.ru;

test.describe("a client", () => {
  test("a mistyped address: the booking's look, book or call; a bare one goes to Russian", async ({ page }) => {
    for (const path of ["/ru/no-such-page", "/no-such-page"]) {
      const res = await page.goto(path);
      expect(res?.status()).toBe(404);
      await expect(page).toHaveURL(/\/ru\/no-such-page$/);
      await expect(page.getByRole("heading", { level: 1, name: "Такой страницы нет" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Записаться" })).toHaveAttribute("href", "/ru");
      await expect(page.getByRole("link", { name: c.callSalon })).toHaveAttribute("href", `tel:${SALON_FALLBACK.tel}`);
      await expectNoSideScroll(page);
    }
    // in the address's language
    await page.goto("/et/no-such-page");
    await expect(page.getByRole("heading", { level: 1, name: "Sellist lehte pole" })).toBeVisible();
    await expect(page.getByRole("link", { name: COPY.et.callSalon })).toBeVisible();
  });

  test("an old visit link: say so, book anew or call the salon", async ({ page }) => {
    await page.goto("/ru/visit/no-such-token");
    await expect(page.getByText(c.notFound)).toBeVisible();
    await expect(page.getByRole("link", { name: c.again })).toHaveAttribute("href", "/ru");
    await expect(page.getByRole("link", { name: c.callSalon })).toHaveAttribute("href", /^tel:\+?\d+$/);
    await expectNoSideScroll(page);
  });
});

test.describe("the admin", () => {
  test.use(asOwner);

  // the frame streams before the page knows it has nothing, so the status is the frame's 200; the page says it, and robots never see the admin
  test("an address it does not have: its frame stays, «Открыть журнал»", async ({ page }) => {
    await page.goto("/admin/no-such-page");
    await hydrated(page);
    await expect(page.getByRole("link", { name: A.nav.calendar, exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: A.missing.title })).toBeVisible();
    await expect(page).toHaveTitle(`${A.missing.title} · REMPIRE`);
    await expect(page.getByRole("link", { name: A.missing.home })).toHaveAttribute("href", "/admin");
    await expectNoSideScroll(page);
  });
});

test.describe("the barber app", () => {
  test.use(asBarber);

  test("an address it does not have: its tabs stay, «Открыть мой день»", async ({ page }) => {
    await page.goto("/b/no-such-page");
    await hydrated(page);
    await expect(page.getByRole("navigation").last()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: B.missing.title })).toBeVisible();
    await expect(page.getByRole("link", { name: B.missing.home })).toHaveAttribute("href", "/b");
    await expectNoSideScroll(page);
  });
});
