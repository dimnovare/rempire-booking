import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { PRESETS } from "../src/lib/auth/rights-catalogue";
import { authFile, E2E_URL, OUT } from "./env";
import { A, asBarber, asOwner, B, demoId, expect, expectNoSideScroll, hydrated, loginByCode, nextWorkday, openFolds, phoneOf, setSwitch, sheet, smallTargets, test, toast, TZ } from "./helpers";

/**
 * One staff app (docs/apps.md, «One app for Renat»): «Мой день» is a tab,
 * not a mode. There is no «Мой день | Салон» switch any more.
 *
 *   - `boss` is the demo owner who cuts too: his login is linked to the
 *     barber Renat. A phone: Мой день · Журнал · Клиенты · Отчёты · Ещё on
 *     every screen of both halves of the app. A wide screen: «Мой день |
 *     Весь салон» in the journal's bar, with the panel «Моё»;
 *   - `owner` is not linked to a barber: the salon's four tabs and «Ещё»,
 *     and a barber's own app opened from «Барберы»;
 *   - a barber keeps his own bar and has no way into the salon.
 *
 * The looks are the design boards «A» (SideA, SideA2, SideADesk).
 */
const M = A.more;
/** The old switch's own name, for «it is gone». */
const OLD_SWITCH = "Мой день или салон";
const RENAT = demoId("staff", "renat");
const OWN_BAR = [A.nav.mine, A.nav.calendar, A.nav.clients, A.nav.reports, A.nav.more];
const SALON_BAR = [A.nav.calendar, A.nav.clients, A.nav.reports, A.nav.invoices, A.nav.more];
const BARBER_BAR = [B.nav.day, B.nav.time, B.nav.sell, B.nav.more];

/** e2e/.out/screens/<phone>-a-<name>.png, or pc-a-<name>.png from a wide screen. */
const shot = async (page: Page, name: string, device = test.info().project.name) => {
  const body = await page.screenshot({ path: path.join(OUT, "screens", `${device}-a-${name}.png`) });
  await test.info().attach(`a-${name}`, { body, contentType: "image/png" });
};
/** A wide screen's picture, once the line that says what was just done has gone. */
const wideShot = async (page: Page, name: string) => {
  await expect(page.locator(".adm-toast:visible")).toHaveCount(0);
  await shot(page, name, "pc");
};
/** The bottom bar: both halves name it «Разделы». */
const bar = (page: Page) => page.getByRole("navigation", { name: A.sections });
/** A fresh device: no half remembered yet. */
const forgetSide = (page: Page) => page.context().clearCookies({ name: "rb_side" });
// the project's own address: the iPhone's is https on the production build (playwright.config.ts)
const rememberSide = (page: Page, side: "b" | "admin") => page.context().addCookies([{ name: "rb_side", value: side, url: test.info().project.use.baseURL ?? E2E_URL }]);
/** What the browser made of an element: its box and the styles the boards give. */
const look = (el: Locator) =>
  el.first().evaluate((node) => {
    const r = node.getBoundingClientRect();
    const cs = getComputedStyle(node);
    return { w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, color: cs.color, font: `${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight}`, radius: cs.borderTopLeftRadius };
  });

/** The one app's frame on a phone: the top bar with the mark and the name only, the five tabs, one of them lit, no switch. */
async function expectOneFrame(page: Page, tabs: string[], lit: string) {
  const top = page.locator(".adm-top:visible");
  await expect(top).toHaveCount(1);
  await expect(top).toHaveClass(/one-top/);
  await expect(top.locator(".one-name")).toHaveText("REMPIRE");
  // «Доступ» and «Выйти» are rows of «Ещё» now
  await expect(top.getByRole("link", { name: A.nav.account })).toHaveCount(0);
  await expect(top.getByRole("button", { name: A.account.logout })).toHaveCount(0);
  await expect(bar(page).getByRole("link")).toHaveText(tabs);
  await expect(bar(page).getByRole("link", { name: lit, exact: true })).toHaveAttribute("aria-current", "page");
  await expect(bar(page).locator('a[aria-current="page"]:visible')).toHaveCount(1);
  await expectNoSwitch(page);
}

async function expectNoSwitch(page: Page) {
  await expect(page.getByRole("navigation", { name: OLD_SWITCH })).toHaveCount(0);
  await expect(page.locator(".adm-side, .sb-side")).toHaveCount(0);
  await expect(page.locator('a[href="/b/mine"]')).toHaveCount(0);
}

test.describe("an owner who cuts too, on a phone", () => {
  test.use({ storageState: authFile("boss") });

  test("the same five tabs on «Мой день», «Журнал», a client's page and a barber page from «Ещё»; no switch anywhere", async ({ page }) => {
    await forgetSide(page);
    await page.goto("/b/start");
    // the first time: his own day
    await page.waitForURL((u) => u.pathname === "/b");
    await hydrated(page);
    await expectOneFrame(page, OWN_BAR, A.nav.mine);
    // the board MyDay-Grid: the dark bar with the day and «День | Неделя», a row with him, the day's count and sum, the grid, «+»
    await expect(page.getByRole("heading", { level: 1, name: B.own.title })).toBeVisible();
    await expect(page).toHaveTitle(`${B.own.title} · REMPIRE`);
    const line = page.locator(".bx-cal-sum p");
    const visits = await page.locator(".bx-cal .cal-v:visible").count();
    expect(visits).toBeGreaterThan(0);
    await expect(line).toContainText(/\d+ [а-я]+ · /);
    // «· Выходной» follows on a day he doesn't work: the demo's visits are
    // seeded today whatever the day is, and the salon is closed on some days
    await expect(line).toContainText(new RegExp(` · \\d+([.,]\\d\\d)? €( · ${B.day.off})?$`));
    const seg = page.locator(".bx-cal .cal-bar").getByRole("navigation", { name: B.own.view });
    await expect(seg.getByRole("link")).toHaveText([B.own.day, B.own.week]);
    await expect(seg.getByRole("link", { name: B.own.day })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: B.book.new })).toBeVisible();
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);

    // the boards' sizes and colours: the top bar, the bar, the row, a visit's card, «+»
    expect(await look(page.locator(".adm-top:visible"))).toMatchObject({ h: 56, bg: "rgb(34, 34, 46)" });
    expect(await look(page.locator(".one-mark:visible"))).toMatchObject({ w: 24, h: 24, bg: "rgb(255, 255, 255)", radius: "7px" });
    expect(await look(page.locator(".one-name:visible"))).toMatchObject({ color: "rgb(223, 228, 237)", font: "500 16px/24px" });
    expect(await look(bar(page))).toMatchObject({ h: 64, bg: "rgb(34, 34, 46)" });
    expect(await look(bar(page).locator('a[aria-current="page"]'))).toMatchObject({ color: "rgb(255, 203, 0)", font: "500 11px/14px" });
    expect(await look(bar(page).locator("a:not([aria-current])"))).toMatchObject({ color: "rgb(198, 203, 211)", font: "500 11px/14px" });
    expect(await look(bar(page).locator("svg"))).toMatchObject({ w: 22, h: 22 });
    expect(await look(page.locator(".bx-cal .cal-bar"))).toMatchObject({ bg: "rgb(34, 34, 46)" });
    expect(await look(line)).toMatchObject({ color: "rgb(95, 100, 117)", font: "400 12px/16px" });
    expect(await look(seg.locator('a[aria-current="page"]'))).toMatchObject({ h: 40, bg: "rgb(255, 203, 0)", color: "rgb(43, 49, 52)", font: "600 14px/14px" });
    expect(await look(page.locator(".bx-cal .cal-v:visible"))).toMatchObject({ radius: "8px" });
    // the time line of a card tall enough for it: late at night the first card is the short demo visit «in 20 minutes» (24.11, 00:25)
    const cards = page.locator(".bx-cal .cal-v:visible");
    const tallest = await cards.evaluateAll((els) => els.reduce((best, el, i) => (el.getBoundingClientRect().height > els[best].getBoundingClientRect().height ? i : best), 0));
    expect(await look(cards.nth(tallest).locator(".t"))).toMatchObject({ h: 18 });
    expect(await look(page.getByRole("button", { name: B.book.new }))).toMatchObject({ w: 58, h: 58, bg: "rgb(255, 203, 0)", radius: "16px" });
    await shot(page, "myday");

    // «Журнал»: the salon's calendar, in the same frame
    await bar(page).getByRole("link", { name: A.nav.calendar }).click();
    await page.waitForURL((u) => u.pathname === "/admin");
    await hydrated(page);
    await expectOneFrame(page, OWN_BAR, A.nav.calendar);
    await expect(page.locator(".cal-col:visible").first()).toBeVisible();
    // every barber's column, not his alone: «Мой день | Весь салон» is a wide screen's
    expect(await page.locator(".cal-col").count()).toBeGreaterThan(1);
    await expect(page.getByRole("group", { name: A.app.scope })).toBeHidden();
    await expectNoSideScroll(page);
    // the calendar still fills the screen exactly: the page itself does not scroll
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
    expect(await look(page.locator(".adm-top:visible"))).toMatchObject({ h: 56, bg: "rgb(34, 34, 46)" });
    expect(await look(bar(page))).toMatchObject({ h: 64, bg: "rgb(34, 34, 46)" });
    await shot(page, "journal");

    // a client's page
    await bar(page).getByRole("link", { name: A.nav.clients }).click();
    await page.waitForURL(/\/admin\/clients$/);
    await hydrated(page);
    await expectOneFrame(page, OWN_BAR, A.nav.clients);
    await page.locator(".cl-item:visible").first().click();
    await page.waitForURL(/\/admin\/clients\/[0-9a-f-]{36}$/);
    await hydrated(page);
    await expectOneFrame(page, OWN_BAR, A.nav.clients);
    await expectNoSideScroll(page);

    // a barber page opened from «Ещё»: the same frame, «Ещё» lit
    await bar(page).getByRole("link", { name: A.nav.more }).click();
    await page.waitForURL(/\/admin\/more$/);
    await hydrated(page);
    await page.locator(".adm-more .mo-row:visible", { hasText: M.time }).click();
    await page.waitForURL((u) => u.pathname === "/b/time");
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: B.time.title })).toBeVisible();
    await expectOneFrame(page, OWN_BAR, A.nav.more);
    await expectNoSideScroll(page);

    // and back to his day by its tab
    await bar(page).getByRole("link", { name: A.nav.mine }).click();
    await page.waitForURL((u) => u.pathname === "/b");
    await expectOneFrame(page, OWN_BAR, A.nav.mine);
  });

  test("«Мой день» is his day and his week behind one tab, and still the barber's day: a visit opens", async ({ page }) => {
    await page.goto("/b");
    await hydrated(page);
    const seg = page.getByRole("navigation", { name: B.own.view });
    await seg.getByRole("link", { name: B.own.week }).click();
    await page.waitForURL((u) => u.pathname === "/b/week");
    await hydrated(page);
    await expect(page.locator("main:visible").getByRole("heading", { level: 1, name: B.own.title })).toBeVisible();
    await expect(page.locator("main:visible").getByRole("navigation", { name: B.own.view }).getByRole("link", { name: B.own.week })).toHaveAttribute("aria-current", "page");
    // the day's own head (option А, 26.11): his row with the week's visits and money
    await expect(page.locator("main:visible .bx-cal-sum p")).toHaveText(new RegExp(`^${B.week.total}: \\d+ [а-я]+ · \\d+([.,]\\d\\d)? €$`));
    await expect(page.locator(".bx-wk:visible > li")).toHaveCount(7);
    await expectOneFrame(page, OWN_BAR, A.nav.mine);
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    await page.locator("main:visible").getByRole("navigation", { name: B.own.view }).getByRole("link", { name: B.own.day }).click();
    await page.waitForURL((u) => u.pathname === "/b");
    await hydrated(page);
    // his own visits; one opens as in the barber app
    const first = page.locator(".bx-cal .cal-v:visible").first();
    const name = (await first.locator(".bx-cv-txt b").innerText()).trim();
    await first.click();
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByRole("heading", { name })).toBeVisible();
    await sheet(page).getByRole("button", { name: B.close }).click();
    await expect(sheet(page)).toHaveCount(0);
  });

  test("«Ещё» has three groups, and each row opens its page inside the frame", async ({ page }) => {
    await page.goto("/admin/more");
    await hydrated(page);
    await expectOneFrame(page, OWN_BAR, A.nav.more);
    await expect(page).toHaveTitle(`${A.nav.more} · REMPIRE`);
    const more = page.locator(".adm-more:visible");
    // who is signed in: the picture or the initial, the name, the role in words
    await expect(more.locator(".mo-who b")).toHaveText("Owner and barber (demo)");
    await expect(more.locator(".mo-who span:not(.mo-ava)")).toHaveText(M.andBarber(PRESETS.OW.ru));
    await expect(more.getByRole("heading", { level: 2 })).toHaveText([M.mineGroup, M.salonGroup, M.accountGroup]);
    const group = (name: string) => more.getByRole("region", { name });
    await expect(group(M.mineGroup).locator(".mo-row b")).toHaveText([M.time, M.sell, M.money]);
    await expect(group(M.mineGroup).locator(".mo-row small").first()).toHaveText(M.timeHint);
    // «Салон» in the sidebar's order and folds; «Основные показатели» is the tab «Отчёты»; «Запросы» a row
    await openFolds(page);
    await expect(group(M.salonGroup).locator(".mo-row b")).toHaveText([A.nav.reports, A.nav.records, A.nav.reviews, A.nav.visits, A.nav.messages, A.nav.changes, A.nav.team, A.nav.staffList, A.nav.schedule, A.nav.services, A.nav.catalogue, A.nav.requests, A.nav.invoices, M.notifySalon, A.nav.settings, A.nav.brand, A.nav.contacts, A.nav.gallery, A.nav.online, A.sale.title]);
    await expect(group(M.accountGroup).locator(".mo-row b")).toHaveText([M.access, M.notify, M.language]);
    // the way out: apart from the lists, in red
    await expect(more.getByRole("button", { name: M.logout })).toBeVisible();
    await expect(group(M.accountGroup).locator(".mo-row", { hasText: M.language }).locator("small")).toHaveText("Русский");
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);

    // the board's sizes: a 48px round picture, 12px grey titles, white cards with 12px corners, 48px rows
    expect(await look(more.locator(".mo-ava"))).toMatchObject({ w: 48, h: 48, radius: "50%" });
    expect(await look(more.locator(".mo-who b"))).toMatchObject({ font: "600 17px/24px" });
    expect(await look(more.locator(".mo-group h2"))).toMatchObject({ color: "rgb(113, 117, 127)", font: "600 12px/16px" });
    expect(await look(more.locator(".mo-list"))).toMatchObject({ bg: "rgb(255, 255, 255)", radius: "12px" });
    expect(await look(more.locator(".mo-row", { hasText: M.language }))).toMatchObject({ h: 48 });
    expect(await look(more.locator(".mo-row b"))).toMatchObject({ color: "rgb(43, 49, 52)", font: "500 15px/20px" });
    await shot(page, "more");

    /** Open a row of «Ещё» and expect its page, in the frame, with «Ещё» lit. */
    const opens = async (label: string, url: RegExp, heading?: string) => {
      await page.goto("/admin/more");
      await hydrated(page);
      await openFolds(page);
      // a fold's own row («Сотрудники: список, график работы») is a summary, not a page
      await page.locator(".adm-more .mo-row:visible:not(summary)", { hasText: label }).click();
      await page.waitForURL(url);
      await hydrated(page);
      if (heading) await expect(page.locator("h1:visible", { hasText: heading }).first()).toBeVisible();
      await expectOneFrame(page, OWN_BAR, A.nav.more);
      await expectNoSideScroll(page);
    };
    // «Моё, как барбера»: the barber app's own pages
    await opens(M.time, /\/b\/time$/, B.time.title);
    await opens(M.sell, /\/b\/sell$/, B.sell.title);
    await opens(M.money, /\/b\/money$/, B.money.title);
    // «Салон»: every section that has no tab
    await opens(A.nav.staffList, /\/admin\/staff$/, A.staff.title);
    await opens(A.nav.schedule, /\/admin\/schedule$/);
    await opens(A.nav.services, /\/admin\/services$/, A.services.title);
    await opens(A.nav.catalogue, /\/admin\/catalogue$/, A.catalogue.title);
    await opens(A.nav.records, /\/admin\/records$/);
    await opens(A.nav.requests, /\/admin\/requests$/);
    await opens(A.nav.invoices, /\/admin\/invoices$/);
    // «Мой вход»
    await opens(M.access, /\/admin\/account$/, A.account.title);
    // this phone's pushes, apart from the salon's «Уведомления клиентам»
    await opens(M.notify, /\/b\/more$/, B.push.title);
    await expect(page.getByRole("region", { name: B.push.title })).toBeVisible();
    // (the language and the way out are not on this page any more: they are rows of «Ещё»)
    await expect(page.getByRole("button", { name: B.more.logout })).toHaveCount(0);

    // the two rows that open over the page: «Продажа товара» and «Язык»
    await page.goto("/admin/more");
    await hydrated(page);
    await page.locator(".adm-more .mo-row:visible", { hasText: A.sale.title }).click();
    const sale = page.getByRole("dialog", { name: A.sale.title });
    await expect(sale.getByLabel(A.sale.seller)).toBeVisible();
    await sale.getByRole("button", { name: A.close, exact: true }).click();
    await expect(sale).toHaveCount(0);
    await page.locator(".adm-more .mo-row:visible", { hasText: M.language }).click();
    const lang = page.getByRole("dialog", { name: M.language });
    await expect(lang.getByRole("button")).toContainText(["Русский", "Eesti", "English"]);
    await expect(lang.getByRole("button", { name: "Русский" })).toHaveAttribute("aria-pressed", "true");
    await expectNoSideScroll(page);
    await lang.getByRole("button", { name: A.close, exact: true }).click();
    await expect(lang).toHaveCount(0);
  });

  test("a waiting request puts a red dot on «Ещё», in both halves of the app, and its count on the row «Запросы»", async ({ page, browser, barber }, info) => {
    const owner = await phoneOf(browser, info, "owner");
    const phone = await phoneOf(browser, info, barber.slug);
    const dot = () => bar(page).getByRole("link", { name: A.nav.more }).locator(".one-dot");
    /** How many wait, as the dot says it. */
    const waiting = async () => {
      await page.reload();
      await hydrated(page);
      return (await dot().count()) ? Number(/(\d+)$/.exec((await dot().getAttribute("aria-label")) ?? "")?.[1] ?? 0) : 0;
    };
    await setSwitch(owner, "time", "ask");
    try {
      await page.goto("/b");
      const before = await waiting();
      // the barber asks for a day off: it waits for an answer
      const note = `E2E точка ${barber.name}`;
      await phone.goto("/b/time");
      await hydrated(phone);
      await phone.getByRole("button", { name: B.time.add.vacation, exact: true }).click();
      const s = sheet(phone);
      // his sixth working day from tomorrow: no other test is on it
      const day = nextWorkday(barber.slug, 6);
      await s.getByLabel(B.time.from, { exact: true }).fill(day);
      await s.getByLabel(B.time.to, { exact: true }).fill(day);
      await s.getByLabel(B.time.note).fill(note);
      await s.getByRole("button", { name: B.time.send }).click();
      await expect(toast(phone)).toHaveText(B.time.sent);

      // «Мой день»: the dot, red, with its words for a screen reader
      expect(await waiting()).toBe(before + 1);
      await expect(dot()).toHaveAttribute("aria-label", A.app.waiting(before + 1));
      expect(await look(dot())).toMatchObject({ w: 8, h: 8, bg: "rgb(247, 44, 50)", radius: "50%" });
      // the tab's own words are still just «Ещё»
      await expect(bar(page).getByRole("link")).toHaveText(OWN_BAR);
      // «Журнал»: the same dot
      await page.goto("/admin");
      await hydrated(page);
      await expect(dot()).toHaveAttribute("aria-label", A.app.waiting(before + 1));
      await shot(page, "dot");
      // «Ещё» says how many on its row «Запросы», and the request is there behind it
      await bar(page).getByRole("link", { name: A.nav.more }).click();
      await page.waitForURL(/\/admin\/more$/);
      const row = page.locator(".adm-more .mo-row:visible", { hasText: A.nav.requests });
      await expect(row.locator(".mo-count")).toHaveText(String(before + 1));
      await expect(row.locator(".mo-count")).toHaveAttribute("aria-label", A.app.waiting(before + 1));
      await row.click();
      await page.waitForURL(/\/admin\/requests$/);
      await expect(page.locator(".adm-req li:visible", { hasText: note })).toBeVisible();

      // he takes it back: the dot is as it was
      await phone.reload();
      await hydrated(phone);
      const all = phone.getByRole("button", { name: /^Показать всё/ });
      if (await all.count()) await all.click();
      // a waiting day off is withdrawn, not removed (the design, 25.11: «Отозвать запрос» in «Впереди»)
      await phone.locator(".bx-rows li", { hasText: note }).getByRole("button", { name: B.time.withdraw }).click();
      await phone.getByRole("button", { name: B.time.withdrawYes }).click();
      await expect(toast(phone)).toHaveText(B.time.withdrawn);
      expect(await waiting()).toBe(before);
    } finally {
      await setSwitch(owner, "time", "now");
      await owner.context().close();
      await phone.context().close();
    }
  });

  test.describe("a tablet upright", () => {
    test.use({ viewport: { width: 820, height: 1180 } });

    test("is a phone still: the same bar in both halves, nothing scrolls sideways", async ({ page }) => {
      for (const [url, lit] of [
        ["/b", A.nav.mine],
        ["/admin", A.nav.calendar],
        ["/admin/more", A.nav.more],
      ] as const) {
        await page.goto(url);
        await hydrated(page);
        await expectOneFrame(page, OWN_BAR, lit);
        await expect(page.locator(".sb")).toBeHidden();
        await expectNoSideScroll(page);
      }
    });
  });
});

test.describe("«Выйти» is a row of «Ещё»", () => {
  // a login of its own: the other tests keep theirs
  test.use({ storageState: { cookies: [], origins: [] } });

  test("it ends this phone's session", async ({ page }) => {
    await loginByCode(page, "boss@example.test");
    await page.goto("/admin/more");
    await hydrated(page);
    await page.getByRole("button", { name: M.logout }).click();
    await page.waitForURL((u) => u.pathname === "/admin/login");
    // neither half opens any more
    await page.goto("/b");
    await page.waitForURL((u) => u.pathname === "/b/login");
    await page.goto("/admin/more");
    await page.waitForURL((u) => u.pathname === "/admin/login");
  });
});

test.describe("an owner who does not cut, on a phone", () => {
  test.use(asOwner);

  test("the salon's four tabs and «Ещё», no «Мой день»; «Ещё» has «Салон» and «Аккаунт»", async ({ page }) => {
    // whatever the device remembers, such a login starts in the journal
    await rememberSide(page, "b");
    await page.goto("/b/start");
    await page.waitForURL((u) => u.pathname === "/admin");
    await hydrated(page);
    await expectOneFrame(page, SALON_BAR, A.nav.calendar);
    await expect(bar(page).getByRole("link", { name: A.nav.mine })).toHaveCount(0);
    await expectNoSideScroll(page);

    await bar(page).getByRole("link", { name: A.nav.more }).click();
    await page.waitForURL(/\/admin\/more$/);
    await hydrated(page);
    await expectOneFrame(page, SALON_BAR, A.nav.more);
    const more = page.locator(".adm-more:visible");
    await expect(more.locator(".mo-who b")).toHaveText("Owner (demo)");
    await expect(more.locator(".mo-who span:not(.mo-ava)")).toHaveText(PRESETS.OW.ru);
    await expect(more.getByRole("heading", { level: 2 })).toHaveText([M.salonGroup, M.accountGroup]);
    await openFolds(page);
    await expect(more.getByRole("region", { name: M.salonGroup }).locator(".mo-row b")).toHaveText([A.nav.reports, A.nav.records, A.nav.reviews, A.nav.visits, A.nav.messages, A.nav.changes, A.nav.team, A.nav.staffList, A.nav.schedule, A.nav.services, A.nav.catalogue, A.nav.requests, M.notifySalon, A.nav.settings, A.nav.brand, A.nav.contacts, A.nav.gallery, A.nav.online, A.sale.title]);
    await expect(more.getByRole("region", { name: M.accountGroup }).locator(".mo-row b")).toHaveText([M.access, M.notify, M.language]);
    await expect(more.locator('a[href^="/b/time"], a[href^="/b/sell"], a[href^="/b/money"]')).toHaveCount(0);
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    await shot(page, "more-salon");

    // this device's notifications: his own page in the barber's half, in the same frame
    await more.locator(".mo-row", { hasText: M.notifyHint }).click();
    await page.waitForURL((u) => u.pathname === "/b/more");
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: B.push.title })).toBeVisible();
    await expectOneFrame(page, SALON_BAR, A.nav.more);
  });

  test("a barber's own app opens from «Барберы», says whose it is, and leads back", async ({ page, barber }) => {
    await page.goto("/admin/staff");
    await hydrated(page);
    await page.locator(".adm-rail:visible .adm-item", { hasText: barber.name }).click();
    await page.waitForURL(/\/admin\/staff\/[0-9a-f-]{36}$/);
    await hydrated(page);
    const staffUrl = new URL(page.url()).pathname;
    const open = page.locator("main:visible").getByRole("button", { name: A.app.openApp });
    await expect(open).toContainText(A.app.openAppHint);
    await open.click();
    await page.waitForURL((u) => u.pathname === "/b");
    await hydrated(page);
    // the barber's own frame: his name on top, his four sections, his visits
    const line = page.getByRole("link", { name: B.pick.viewing(barber.name) });
    await expect(line).toBeVisible();
    await expect(line).toContainText(B.pick.back);
    await expect(page.locator(".bx-me b")).toHaveText(barber.name);
    await expect(bar(page).getByRole("link")).toHaveText(BARBER_BAR);
    await expect(page.locator(".one-top")).toHaveCount(0);
    await expect(page.locator(".bx-cal .cal-v:visible").first()).toBeVisible();
    await expectNoSwitch(page);
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    await shot(page, "support");
    // the line stays on his other screens, and in view when the page is scrolled
    await page.locator("main:visible").getByRole("navigation", { name: B.own.view }).getByRole("link", { name: B.own.week }).click();
    await page.waitForURL((u) => u.pathname === "/b/week");
    await expect(line).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(line).toBeInViewport();

    // the way back: his page under «Барберы», in the salon's frame
    await line.click();
    await page.waitForURL((u) => u.pathname === staffUrl);
    await hydrated(page);
    await expectOneFrame(page, SALON_BAR, A.nav.more);
    // and the look is over: the barber's half has nobody's app to show such a login
    await page.goto("/b");
    await page.waitForURL((u) => u.pathname === "/b/pick");
    await expect(page.getByRole("link", { name: B.pick.viewing(barber.name) })).toHaveCount(0);
  });

  test("«Доступ»: a login is linked to the barber it is, and unlinked again", async ({ page }, info) => {
    const email = `desk-${info.project.name}@example.test`;
    // the row's select is the wide screen's; on a phone «Он же барбер» is in the «⋯» sheet (26.11, e2e/logins.spec.ts)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/account");
    await hydrated(page);
    await page.getByRole("button", { name: A.account.addUser }).click();
    const dw = page.getByRole("dialog", { name: A.account.newLogin });
    await dw.locator('input[type="email"]').fill(email);
    await dw.getByRole("radio", { name: new RegExp(`^${PRESETS.AD.ru}`) }).check();
    await dw.getByLabel(A.account.alsoBarber).selectOption({ label: "Slava" });
    await expect(dw.getByText(A.account.alsoHint)).toBeVisible();
    await dw.getByRole("button", { name: A.account.addUser }).click();
    await expect(dw).toHaveCount(0);
    await expect(toast(page)).toContainText(A.account.added(email));

    const link = page.getByLabel(`${A.account.alsoBarber}: ${email}`);
    await expect(link).toHaveValue(/[0-9a-f-]{36}/);
    await expect(link.locator("option:checked")).toHaveText("Slava");
    await link.scrollIntoViewIfNeeded();
    await expectNoSideScroll(page);
    await shot(page, "account");
    // it saves by itself: wait for the save, then it is still unlinked after a reload
    const saved = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/admin/account");
    await link.selectOption({ label: A.account.notBarber });
    await saved;
    await page.reload();
    await hydrated(page);
    await expect(page.getByLabel(`${A.account.alsoBarber}: ${email}`)).toHaveValue("");
  });
});

test.describe("a barber", () => {
  test.use(asBarber);

  test("keeps his own bar, and has no way into the salon", async ({ page, barber }) => {
    // whatever the device remembers, he starts on his day
    await rememberSide(page, "admin");
    await page.goto("/b/start");
    await page.waitForURL((u) => u.pathname === "/b");
    await hydrated(page);
    await expect(bar(page).getByRole("link")).toHaveText(BARBER_BAR);
    await expect(bar(page).getByRole("link", { name: B.nav.day, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".bx-me b")).toHaveText(barber.name);
    // his own app as it was: no «Мой день» head, no one-app frame, nobody's line
    await expect(page.locator(".one-top, .one-nav, .bx-own-head, .bx-as")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: B.day.today })).toBeVisible();
    await expectNoSwitch(page);
    for (const url of ["/b", "/b/week", "/b/time", "/b/sell", "/b/more"]) {
      await page.goto(url);
      await hydrated(page);
      await expect(bar(page).getByRole("link")).toHaveText(BARBER_BAR);
      await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
    }
    // and the salon's addresses send him back to his day
    for (const url of ["/admin", "/admin/more", "/admin/staff"]) {
      await page.goto(url);
      await page.waitForURL((u) => u.pathname === "/b");
    }
  });
});

test.describe("a wide screen", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "android", "one wide run is enough");
  });

  const scope = (page: Page) => page.getByRole("group", { name: A.app.scope });
  const panel = (page: Page) => page.getByRole("complementary", { name: A.app.panel });
  const cols = (page: Page) => page.locator(".cal-col:visible");

  test.describe("an owner who cuts too", () => {
    test.use({ storageState: authFile("boss") });

    test("starts in the journal with «Мой день» chosen: his column alone and the panel «Моё»; «Весь салон» shows everyone; the choice survives a reload", async ({ page }) => {
      await forgetSide(page);
      await page.goto("/b/start");
      // the first time «Мой день», which on a wide screen is the journal
      await page.waitForURL((u) => u.pathname === "/admin");
      await hydrated(page);
      await expectNoSwitch(page);
      // the month starts right under the sidebar's head, where the switch was
      const [head, month] = await Promise.all([page.locator(".sb-head").boundingBox(), page.locator(".sb-month").boundingBox()]);
      expect(Math.round(month!.y - (head!.y + head!.height))).toBe(0);
      // the foot says the role on a hover; its second line is the e-mail, as the board's
      await expect(page.locator(".sb-me .who")).toHaveAttribute("title", M.andBarber(PRESETS.OW.ru));

      const mine = scope(page).getByRole("button", { name: A.app.mine });
      const salon = scope(page).getByRole("button", { name: A.app.salon });
      await expect(scope(page).getByRole("button")).toHaveText([A.app.mine, A.app.salon]);
      await expect(mine).toHaveAttribute("aria-pressed", "true");
      await expect(salon).toHaveAttribute("aria-pressed", "false");
      // his column alone, with his hours in its head
      await expect(cols(page)).toHaveCount(1);
      await expect(cols(page)).toHaveAttribute("data-col", new RegExp(`^${RENAT}:`));
      await expect(page.locator(".cal-head:visible")).toHaveCount(1);
      await expect(page.locator(".cal-head:visible b")).toHaveText("Renat");
      // the bar is his own: the week is a plain button, and the salon's numbers and panel button are away
      await expect(page.locator(".jr-bar").getByRole("button", { name: A.cal.week, exact: true })).toBeVisible();
      await expect(page.locator(".jr-bar").getByRole("button", { name: A.cal.panel })).toHaveCount(0);
      await expect(page.locator(".jr-bar").getByRole("button", { name: new RegExp(`^${A.cal.numbers}`) })).toHaveCount(0);

      // «Моё»: the chair, the next visit and today's numbers, worked out here from his column's cards
      const now = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(Date.now());
      const cards = (await cols(page).locator(".cal-v").evaluateAll((els) => els.map((el) => ({ label: el.getAttribute("aria-label") ?? "", cls: el.className }))))
        .map((c) => {
          const m = /^(\d\d:\d\d)–(\d\d:\d\d), (.*), [^,]+$/.exec(c.label);
          return { start: m![1], end: m![2], name: m![3], status: /\bst-(\w+)/.exec(c.cls)![1] };
        })
        .sort((a, b) => a.start.localeCompare(b.start));
      expect(cards.length).toBeGreaterThan(0);
      const live = cards.filter((c) => ["booked", "arrived", "pending"].includes(c.status) && c.end > now);
      const chair = live.find((c) => c.status === "arrived" || c.start <= now) ?? null;
      const next = live.find((c) => c !== chair && (!chair || c.start >= chair.start)) ?? null;
      const row = (name: string) => panel(page).locator(`[data-row="${name}"] dd`);
      await expect(panel(page).getByRole("heading", { name: A.app.panel })).toBeVisible();
      await expect(panel(page).locator("dt")).toHaveText([A.app.chair, A.app.next, A.app.today]);
      await expect(row("chair")).toHaveText(chair ? A.app.until(chair.name, chair.end) : A.app.nobody);
      if (next) await expect(row("next")).toContainText(`${next.name} · ${next.start}`);
      else await expect(row("next")).toHaveText(A.app.noNext);
      const counted = cards.filter((c) => c.status !== "no_show").length;
      await expect(row("today")).toContainText(A.cal.visits(counted));
      // (the owner sees sums)
      await expect(row("today")).toHaveText(/ · \d+([.,]\d\d)? €$/);
      const links = panel(page).getByRole("navigation").getByRole("link");
      await expect(links).toHaveText([A.app.myTime, A.app.myMoney, A.app.myClients]);
      await expect(links.nth(0)).toHaveAttribute("href", `/admin/staff/${RENAT}`);
      await expect(links.nth(1)).toHaveAttribute("href", new RegExp(`^/admin/invoices/barber/${RENAT}\\?m=\\d{4}-\\d\\d$`));
      await expect(links.nth(2)).toHaveAttribute("href", `/admin/clients?barber=${RENAT}`);
      await expectNoSideScroll(page);
      expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);

      // a client marked «Пришёл» is in the chair, until when; then back as he was
      const ahead = live[0];
      if (ahead && ahead.status === "booked" && ahead.start > now) {
        const card = () => cols(page).locator(".cal-v", { hasText: ahead.name }).first();
        // a chip of the visit window writes at once; the window stays open until Escape
        const chip = async (c: "arrived" | "booked") => {
          await card().click();
          const button = page.getByRole("dialog", { name: ahead.name }).getByRole("group", { name: A.win.status }).getByRole("button", { name: A.win.chips[c], exact: true });
          await button.click();
          await expect(button).toHaveAttribute("aria-pressed", "true");
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog", { name: ahead.name })).toHaveCount(0);
        };
        await chip("arrived");
        await expect(row("chair")).toHaveText(A.app.until(ahead.name, ahead.end));
        await wideShot(page, "myday");
        await chip("booked");
        await expect(row("chair")).toHaveText(chair ? A.app.until(chair.name, chair.end) : A.app.nobody);
      } else await wideShot(page, "myday");

      // the board's sizes and colours: the control, his column beside the panel
      expect(await look(mine)).toMatchObject({ h: 32, bg: "rgb(255, 203, 0)", color: "rgb(43, 49, 52)", font: "600 12px/16px", radius: "8px" });
      expect(await look(salon)).toMatchObject({ h: 32, bg: "rgb(255, 255, 255)", font: "500 12px/16px" });
      expect(await look(panel(page))).toMatchObject({ bg: "rgb(247, 249, 252)" });
      expect(await look(panel(page).locator("h2"))).toMatchObject({ font: "600 14px/20px" });
      expect(await look(panel(page).locator(".jr-mine-card"))).toMatchObject({ bg: "rgb(255, 255, 255)", radius: "12px" });
      expect(await look(panel(page).locator(".jr-mine-card dd"))).toMatchObject({ font: "600 14px/20px" });
      expect(await look(links)).toMatchObject({ h: 44, font: "500 14px/20px" });
      expect(await look(page.locator(".cal-head:visible"))).toMatchObject({ h: 64 });
      const [colBox, panelBox] = await Promise.all([page.locator(".cal-scroll").boundingBox(), panel(page).boundingBox()]);
      // the two share what the sidebar leaves, as the board's flex does: his column from 480px growing twice as fast as the panel from 300px
      expect(Math.round(colBox!.width + panelBox!.width)).toBe(1440 - 220);
      expect(colBox!.width).toBeGreaterThan(panelBox!.width * 1.5);
      expect(panelBox!.width).toBeGreaterThanOrEqual(300);

      // «Весь салон»: every column, no panel «Моё», the salon's own controls back
      await salon.click();
      await expect(salon).toHaveAttribute("aria-pressed", "true");
      expect(await cols(page).count()).toBeGreaterThan(1);
      await expect(panel(page)).toHaveCount(0);
      await expect(page.locator(".jr-bar").getByRole("button", { name: A.cal.panel })).toBeVisible();
      await expect(page.locator(".cal-head:visible").first()).toBeVisible();
      expect(await look(page.locator(".cal-head:visible"))).toMatchObject({ h: 95 });
      await expectNoSideScroll(page);
      await wideShot(page, "salon");
      // kept for the tab: a reload, another day
      await page.reload();
      await hydrated(page);
      await expect(scope(page).getByRole("button", { name: A.app.salon })).toHaveAttribute("aria-pressed", "true");
      expect(await cols(page).count()).toBeGreaterThan(1);
      await page.locator(".jr-bar").getByRole("button", { name: A.cal.next }).click();
      await page.waitForURL(/\/admin\?d=/);
      await expect(scope(page).getByRole("button", { name: A.app.salon })).toHaveAttribute("aria-pressed", "true");
      await page.locator(".jr-bar").getByRole("button", { name: A.cal.today }).click();
      await page.waitForURL(/\/admin\?d=/);
      // a new tab has no choice of its own yet: it opens the way this device left the journal,
      // and the server already draws it so (the whole salon's columns are in the page as it arrives)
      const tab = await page.context().newPage();
      const html = await (await tab.goto("/admin"))!.text();
      expect(html).not.toContain("is-mine");
      await hydrated(tab);
      await expect(scope(tab).getByRole("button", { name: A.app.salon })).toHaveAttribute("aria-pressed", "true");
      expect(await cols(tab).count()).toBeGreaterThan(1);
      await tab.close();
      // and «Мой день» again, kept as well
      await scope(page).getByRole("button", { name: A.app.mine }).click();
      await expect(cols(page)).toHaveCount(1);
      await expect(panel(page)).toBeVisible();
      await page.reload();
      await hydrated(page);
      await expect(scope(page).getByRole("button", { name: A.app.mine })).toHaveAttribute("aria-pressed", "true");
      await expect(cols(page)).toHaveCount(1);
      await expect(panel(page)).toBeVisible();
    });

    test("«Неделя» in «Мой день» is his own week; the panel's links open his pages in the salon", async ({ page }) => {
      await page.goto("/admin");
      await hydrated(page);
      await scope(page).getByRole("button", { name: A.app.mine }).click();
      await page.locator(".jr-bar").getByRole("button", { name: A.cal.week, exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get("v") === "week" && u.searchParams.get("s") === RENAT);
      await hydrated(page);
      await expect(scope(page).getByRole("button", { name: A.app.mine })).toHaveAttribute("aria-pressed", "true");
      await expect(cols(page)).toHaveCount(7);
      await expect(panel(page)).toBeVisible();
      await expectNoSideScroll(page);

      // «Мои клиенты»: the client base on the clients who came to him
      await panel(page).getByRole("link", { name: A.app.myClients }).click();
      await page.waitForURL((u) => u.pathname === "/admin/clients" && u.searchParams.get("barber") === RENAT);
      await hydrated(page);
      const cond = page.getByRole("group", { name: A.clients.base.kinds.barber });
      await expect(cond.locator("select")).toHaveValue(RENAT);
      await expect(page.locator(".cl-table tbody tr").first()).toBeVisible();
      // «Моё время»: his own page under «Барберы»
      await page.goto("/admin");
      await hydrated(page);
      await panel(page).getByRole("link", { name: A.app.myTime }).click();
      await page.waitForURL((u) => u.pathname === `/admin/staff/${RENAT}`);
      await expect(page.locator("h1:visible", { hasText: "Renat" })).toBeVisible();
      // his own page has no «Открыть его приложение»: his app is «Мой день»
      await expect(page.getByRole("button", { name: A.app.openApp })).toHaveCount(0);
      // «Мои расчёты»: his month under «Счета»
      await page.goto("/admin");
      await hydrated(page);
      await panel(page).getByRole("link", { name: A.app.myMoney }).click();
      await page.waitForURL((u) => u.pathname === `/admin/invoices/barber/${RENAT}`);
    });

    test("his phone-wide pages are not used here: each sends a wide screen on to its place in the salon", async ({ page }) => {
      for (const [from, to] of [
        ["/b", "/admin"],
        ["/b/week", "/admin"],
        ["/b/time", `/admin/staff/${RENAT}`],
        ["/b/money", `/admin/invoices/barber/${RENAT}`],
        ["/b/sell", "/admin"],
      ] as const) {
        await page.goto(from);
        await page.waitForURL((u) => u.pathname === to);
      }
      // «Мой день» by its address opens the journal on his day, whatever the tab had
      await hydrated(page);
      await scope(page).getByRole("button", { name: A.app.salon }).click();
      await expect(scope(page).getByRole("button", { name: A.app.salon })).toHaveAttribute("aria-pressed", "true");
      await page.goto("/b");
      await page.waitForURL((u) => u.pathname === "/admin");
      await hydrated(page);
      await expect(scope(page).getByRole("button", { name: A.app.mine })).toHaveAttribute("aria-pressed", "true");
      await expect(cols(page)).toHaveCount(1);
    });
  });

  test.describe("an owner who does not cut", () => {
    test.use(asOwner);

    test("never sees «Мой день | Весь салон»: the journal is the whole salon", async ({ page }) => {
      await forgetSide(page);
      await page.goto("/b/start");
      await page.waitForURL((u) => u.pathname === "/admin");
      await hydrated(page);
      await expect(page.locator(".jr-bar")).toBeVisible();
      await expect(scope(page)).toHaveCount(0);
      await expect(page.locator(".jr-bar").getByRole("button", { name: A.app.mine })).toHaveCount(0);
      await expect(panel(page)).toHaveCount(0);
      expect(await cols(page).count()).toBeGreaterThan(1);
      await expect(page.locator(".jr-bar").getByRole("button", { name: A.cal.panel })).toBeVisible();
      await expectNoSwitch(page);
      await expect(page.locator(".sb-me .who")).toHaveAttribute("title", PRESETS.OW.ru);
      // a barber's page has «Открыть его приложение» here too
      await page.goto(`/admin/staff/${RENAT}`);
      await hydrated(page);
      await expect(page.locator("main:visible").getByRole("button", { name: A.app.openApp })).toBeVisible();
    });
  });
});

test.describe("the app's start, by who is logged in", () => {
  test.describe("an owner who cuts too", () => {
    test.use({ storageState: authFile("boss") });

    test("comes back to what the phone had open last of «Мой день» and «Журнал»", async ({ page }) => {
      await forgetSide(page);
      await page.goto("/b/start");
      await page.waitForURL((u) => u.pathname === "/b");
      // «Журнал» was open last
      await page.goto("/admin");
      await page.goto("/b/start");
      await page.waitForURL((u) => u.pathname === "/admin");
      // «Мой день» was open last
      await page.goto("/b");
      await page.goto("/b/start");
      await page.waitForURL((u) => u.pathname === "/b");
      // a login with no page in mind lands the same way
      await rememberSide(page, "admin");
      await page.goto("/b/start");
      await page.waitForURL((u) => u.pathname === "/admin");
    });
  });
});
