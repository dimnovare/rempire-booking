import path from "node:path";
import type { Page } from "@playwright/test";
import { OUT } from "./env";
import { A, asOwner, demoId, expect, expectNoSideScroll, hydrated, smallTargets, tallinnDate, test, toast } from "./helpers";

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
/** The fake client of the feed's test, and the comment he books with. */
const FEED_CLIENT = "E2E Visits";
const FEED_PHONE = "+37255550631";
const FEED_NOTE = "Коротко по бокам";

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

const K = A.kpiPhone;

const checks = (wide: boolean) => {
  if (wide)
    test("«Основные показатели»: sales, attendance and fill rate", async ({ page }) => {
      await open(page, "/admin/analytics", D.kpi);
      for (const h of [D.sales, D.attendance, D.fill]) {
        await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
      }
      await expectNoSideScroll(page);
      await shot(page, "kpi", wide);
    });
  else
    test("«Отчёты» on a phone: the period, a barber, the revenue and its rows", async ({ page }) => {
      await page.goto("/admin");
      await hydrated(page);
      // the tab bar's «Отчёты» opens the phone page
      await page.getByRole("navigation", { name: A.sections }).getByRole("link", { name: A.nav.reports }).click();
      await page.waitForURL(/\/admin\/analytics$/);
      const pk = page.locator(".pk:visible");
      await expect(pk.getByRole("heading", { level: 1, name: K.title })).toBeVisible();
      await hydrated(page);
      // a month by default, against the month before
      const seg = pk.getByRole("group", { name: K.perLabel });
      await expect(seg.getByRole("button")).toHaveText([K.pers.day, K.pers.week, K.pers.month, K.pers.range]);
      await expect(seg.getByRole("button", { name: K.pers.month })).toHaveAttribute("aria-pressed", "true");
      const rev = pk.locator(".pk-rev");
      await expect(rev).toHaveAccessibleName(/^Выручка за /);
      await expect(rev.locator(".pk-sum")).toHaveText(/ €$/);
      await expect(rev.locator(".pk-bars span")).toHaveCount(7);
      await expect(rev.locator(".pk-bars")).toHaveAccessibleName(new RegExp(`^${K.bars}: `));
      await expect(pk.locator(".pk-rows dt b")).toHaveText([K.clients, K.records, K.noShows, K.goods, K.load]);
      await expect(pk.locator(".pk-rows dt small")).toHaveText([K.avg, K.online, K.cancelled, K.goodsSold, K.loadHint]);
      await expect(pk.locator(".pk-rows dd b").first()).toHaveText(/^\d+$/);
      await expectNoSideScroll(page);
      expect(await smallTargets(page)).toEqual([]);
      await shot(page, "kpi", wide);

      // a day: its own revenue
      await seg.getByRole("button", { name: K.pers.day }).click();
      await expect(seg.getByRole("button", { name: K.pers.day })).toHaveAttribute("aria-pressed", "true");
      await expect(pk).toHaveAttribute("aria-busy", "false");
      await expect(pk.locator(".pk-pick input")).toHaveAttribute("type", "date");

      // one barber
      await expect(pk.locator(".pk-staff b")).toHaveText(K.allStaff);
      await pk.locator(".pk-staff").click();
      const list = page.getByRole("dialog", { name: K.staff }).getByRole("group", { name: K.staff });
      await expect(list.getByRole("button", { name: K.allStaff })).toHaveAttribute("aria-pressed", "true");
      const one = list.getByRole("button").nth(1);
      const name = (await one.innerText()).trim();
      await one.click();
      await expect(page.getByRole("dialog", { name: K.staff })).toHaveCount(0);
      await expect(pk.locator(".pk-staff b")).toHaveText(name);
      await expect(pk).toHaveAttribute("aria-busy", "false");

      // «Период» asks for two dates first
      await seg.getByRole("button", { name: K.pers.range }).click();
      const range = page.getByRole("dialog", { name: K.pers.range });
      await expect(range.getByLabel(K.from)).toBeVisible();
      await expect(range.getByLabel(K.to)).toBeVisible();
      await range.getByRole("button", { name: K.show }).click();
      await expect(range).toHaveCount(0);
      await expect(seg.getByRole("button", { name: K.pers.range })).toHaveAttribute("aria-pressed", "true");
      await expect(rev).toHaveAccessibleName(K.revenueRange);
      await expectNoSideScroll(page);
    });

  test("«Визиты»: the day's visits and the booking feed", async ({ page }) => {
    await open(page, "/admin/dashboard", D.visitsTitle);
    const tabs = page.locator(".dsv-tabs:visible button");
    if (wide) {
      // both panels side by side, no tabs
      await expect(page.getByRole("heading", { level: 2, name: D.visitsTitle })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: D.feedTitle })).toBeVisible();
      await expect(tabs).toHaveCount(0);
    } else {
      // a phone: two tabs, «Визиты (N)» and «Лента · N новые», one panel at a time
      await expect(tabs).toHaveCount(2);
      await expect(tabs.nth(0)).toHaveText(/^\S+ \(\d+\)$/);
      await expect(tabs.nth(0)).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".dsv-left:visible")).toHaveCount(1);
      await expect(page.locator(".dsv-feed:visible")).toHaveCount(0);
      await tabs.nth(1).click();
      await expect(tabs.nth(1)).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".dsv-feed:visible")).toHaveCount(1);
      await expect(page.locator(".dsv-left:visible")).toHaveCount(0);
      await expect(page.getByRole("button", { name: D.feedFilters.online, exact: true })).toBeVisible();
      expect(await smallTargets(page)).toEqual([]);
      await shot(page, "visits-feed");
      await tabs.nth(0).click();
      await expect(page.locator(".dsv-left:visible")).toHaveCount(1);
    }
    // each day of the visits has its heading and its whole count («12 визитов · пришли 3»); the demo may have none ahead
    const rows = page.locator(".dsv-row:visible");
    if (await rows.count()) {
      await expect(page.locator(".dsv-left .dsv-day-head span:visible").first()).toHaveText(/\d/);
      await expect(rows.first().locator(".dsv-pill")).toHaveText(new RegExp(Object.values(D.pill).join("|")));
    }
    expect(await smallTargets(page)).toEqual([]);
    await page.getByRole("button", { name: D.past }).click();
    await expect(page.getByRole("button", { name: D.past })).toHaveAttribute("aria-pressed", "true");
    // the past visits come from the server: the panel is busy until they are in
    await expect(page.locator(".dsv-left:visible")).toHaveAttribute("aria-busy", "false");
    await expectNoSideScroll(page);
    await shot(page, "visits", wide);
  });

  test("«Визиты»: an online booking in the feed, new until ✓ confirms it", async ({ page }, info) => {
    // booked online for a fake client through the booking's own API, far enough ahead that no other spec takes the time
    const from = 30 + (wide ? 10 : 0) + (info.project.name === "iphone" ? 20 : 0);
    const staff = demoId("staff", "slava");
    const service = demoId("service", "clip");
    const res = await page.request.get(`/api/slots?services=${service}&staff=${staff}&from=${tallinnDate(from)}&days=10`);
    expect(res.ok()).toBe(true);
    const day = ((await res.json()) as { days: { d: string; s: [number, string, number][] }[] }).days.find((d) => d.s.length > 0);
    expect(day).toBeTruthy();
    const slot = day!.s[Math.floor(day!.s.length / 2)];
    const booked = await page.request.post("/api/bookings", {
      headers: { "idempotency-key": `e2e-reports-feed-${info.project.name}-${wide ? "wide" : "phone"}` },
      data: { serviceIds: [service], staffId: staff, startsAt: new Date(slot[0]).toISOString(), extraCents: slot[2], name: FEED_CLIENT, phone: FEED_PHONE, comment: FEED_NOTE, locale: "ru", smsReminder: false },
    });
    expect([200, 201]).toContain(booked.status());

    await open(page, "/admin/dashboard", D.visitsTitle);
    if (!wide) {
      // the feed's tab counts the new ones
      const feedTab = page.locator(".dsv-tabs:visible button").nth(1);
      await expect(feedTab).toHaveText(new RegExp(`^${D.tabFeed(0)} · \\d+`));
      await feedTab.click();
    }
    const entry = page.locator("article.dsv-entry:visible", { hasText: FEED_CLIENT }).first();
    await expect(entry.locator(".dsv-tag")).toHaveText(D.tags.online);
    // its history, a line a row: the client booked online, with the comment
    await expect(entry.locator(".dsv-log > li").first().locator("p").last()).toHaveText(`${D.what.online}. ${D.comment(FEED_NOTE)}`);
    await expectNoSideScroll(page);
    await shot(page, "visits-feed-new", wide);
    // ✓ on a wide screen, the big «Подтвердить» on a phone: the same action
    const confirm = entry.getByRole("button", { name: new RegExp(`^${D.confirm}: ${FEED_CLIENT}`) });
    await expect(confirm).toHaveCount(1);
    if (!wide) await expect(confirm).toHaveText(D.confirmShort);
    await confirm.click();
    await expect(toast(page)).toContainText(D.confirmed);
    await expect(confirm).toHaveCount(0);
    await expect(entry.locator(".dsv-log > li").first().locator("p").last()).toContainText(D.what.confirmed);
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
