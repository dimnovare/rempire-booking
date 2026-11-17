import { dateWords } from "../src/app/b/copy.shared";
import { asBarber, B, expect, expectNoSideScroll, hydrated, nextWorkday, sheet, smallTargets, test } from "./helpers";

/** B2: his day and his week. */
test.describe("his day", () => {
  test.use(asBarber);

  test("today: the next client on top, one tap for «Пришёл», then «Готово»", async ({ page }) => {
    await page.goto("/b");
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: B.day.today })).toBeVisible();
    const next = page.getByRole("region", { name: B.day.next });
    await expect(next).toBeVisible();
    // the demo client in 20 minutes: «Дальше · через N мин», a call button, «Пришёл»
    await expect(next.getByRole("link", { name: B.visit.call })).toHaveAttribute("href", /^tel:\+/);
    await next.getByRole("button", { name: B.day.quick.arrived }).click();
    await expect(next.getByText(B.day.now, { exact: true })).toBeVisible();
    await next.getByRole("button", { name: B.day.quick.done }).click();
    await expect(page.locator(".bx-v.st-done").first()).toBeVisible();
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
  });

  test("the week strip: another day, then back to today", async ({ page }) => {
    const day = nextWorkday();
    await page.goto("/b");
    await hydrated(page);
    const strip = page.getByRole("navigation", { name: B.day.days });
    // the strip's buttons carry the day's words; `day` may sit in next week's strip
    const button = strip.getByRole("button", { name: new RegExp(`^${dateWords(day, "ru")}`) });
    if (!(await button.count())) await strip.getByRole("link", { name: B.day.nextWeek }).click();
    await button.click();
    await expect(page).toHaveURL(new RegExp(`d=${day}`));
    // four or five demo visits that day, and the lunch break
    await expect(page.locator(".bx-v").nth(3)).toBeVisible();
    await expect(page.locator(".bx-blk", { hasText: B.day.kinds.block })).toBeVisible();
    await expect(page.locator(".bx-sum")).toContainText("€");
    await page.getByRole("button", { name: B.day.toToday }).or(page.getByRole("link", { name: B.day.toToday })).click();
    await expect(page.getByRole("heading", { level: 1, name: B.day.today })).toBeVisible();
  });

  test("next week and back", async ({ page }) => {
    await page.goto("/b");
    await hydrated(page);
    await page.getByRole("link", { name: B.day.nextWeek }).click();
    await expect(page.getByRole("link", { name: B.day.toToday })).toBeVisible();
    await page.getByRole("link", { name: B.day.toToday }).click();
    await expect(page.getByRole("heading", { level: 1, name: B.day.today })).toBeVisible();
  });

  test("a visit's sheet: the time, the services, the total, the status buttons", async ({ page }) => {
    await page.goto(`/b?d=${nextWorkday()}`);
    await hydrated(page);
    await page.locator(".bx-v button").first().click();
    const s = sheet(page);
    await expect(s.locator(".adm-time b")).toHaveText(/^\d\d:\d\d–\d\d:\d\d$/);
    await expect(s.locator(".adm-lines .tot")).toContainText("€");
    await expect(s.getByRole("group", { name: B.visit.setStatus }).getByRole("button")).toHaveCount(3);
    await expect(s.getByRole("button", { name: B.book.move })).toBeVisible();
    await expect(s.getByRole("button", { name: B.client.card })).toBeVisible();
    expect(await smallTargets(page)).toEqual([]);
    await s.getByRole("button", { name: B.close }).click();
    await expect(s).toHaveCount(0);
  });

  test("the week: seven days with their visits and the week's total", async ({ page }) => {
    await page.goto("/b/week");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(B.week.total)).toBeVisible();
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
  });

  test("the bottom bar takes him everywhere", async ({ page }) => {
    await page.goto("/b");
    await hydrated(page);
    for (const [name, path] of [
      [B.nav.week, "/b/week"],
      [B.nav.time, "/b/time"],
      [B.nav.sell, "/b/sell"],
      [B.nav.more, "/b/more"],
      [B.nav.day, "/b"],
    ] as const) {
      await page.getByRole("link", { name, exact: true }).click();
      await page.waitForURL((u) => u.pathname === path);
      await expectNoSideScroll(page);
    }
  });
});
