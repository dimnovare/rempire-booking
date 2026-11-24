import path from "node:path";
import type { Page } from "@playwright/test";
import { OUT } from "./env";
import { A, asOwner, B, demoId, expect, expectNoSideScroll, hydrated, nextWorkday, smallTargets, tallinnDate, test } from "./helpers";

/**
 * The admin's frame from 900px (docs/reference-looks.md, «Sidebar and
 * tiles»): the sidebar's month with a ring per day, the tiles, «Избранное»,
 * the menu behind «Все разделы», the two drawers and «Каталог товаров». A
 * phone keeps its bar and gets two more rows on «Ещё».
 *
 * The shop is the fake one (no SHOP_API_URL on the e2e server): demo
 * products, and a sale stays in booking. The barber sold for is Milena,
 * whom no other test bills or counts.
 */
const F = A.frame;
const SELLER = "Milena";
const PRODUCT = "Demo Grooming Matte Paste 100 ml";
const shot = async (page: Page, name: string) => {
  const body = await page.screenshot({ path: path.join(OUT, "screens", `pc-frame-${name}.png`) });
  await test.info().attach(`frame-${name}`, { body, contentType: "image/png" });
};
const phoneShot = async (page: Page, name: string) => {
  const body = await page.screenshot({ path: path.join(OUT, "screens", `${test.info().project.name}-frame-${name}.png`) });
  await test.info().attach(`frame-${name}`, { body, contentType: "image/png" });
};
const sb = (page: Page) => page.locator(".sb");
const menu = (page: Page) => page.getByRole("navigation", { name: A.sections });
const month = (page: Page) => page.locator(".sb-month");
const day = (page: Page, date: string) => month(page).locator(`a[href="/admin?d=${date}"]`);
const monthName = (m: string) => F.month(new Date(`${m}-01T12:00:00Z`));
const tile = (page: Page, name: string) => page.getByRole("group", { name: F.tiles }).getByRole(name === A.nav.catalogue ? "link" : "button", { name });

test.describe("the frame", () => {
  test.use(asOwner);

  test.describe("on a wide screen", () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test.beforeEach(({}, info) => {
      test.skip(info.project.name !== "android", "one wide run is enough");
    });

    test("the month: a ring per working day, today lit; a day opens in the calendar; ‹ › change the month", async ({ page }) => {
      const today = tallinnDate(0);
      const thisMonth = today.slice(0, 7);
      await page.goto("/admin");
      await hydrated(page);
      await expect(sb(page)).toBeVisible();
      // 220px wide, the product's dark ground, and the calendar beside it
      expect(await sb(page).evaluate((el) => [el.getBoundingClientRect().width, getComputedStyle(el).backgroundColor])).toEqual([220, "rgb(34, 34, 46)"]);
      await expect(month(page).locator(".sb-month-head span")).toHaveText(monthName(thisMonth));
      // whole weeks, Monday first
      const cells = month(page).locator(".sb-day");
      expect([28, 35, 42]).toContain(await cells.count());
      const first = await cells.first().getAttribute("href");
      expect(new Date(`${first!.slice(-10)}T12:00:00Z`).getUTCDay()).toBe(1);

      // the days somebody works wear a ring, drawn as a conic gradient in one of the three colours
      const ringed = month(page).locator(".sb-day[data-band]");
      expect(await ringed.count()).toBeGreaterThan(10);
      const ring = await ringed.first().evaluate((el) => ({ band: el.getAttribute("data-band"), image: getComputedStyle(el, "::before").backgroundImage, size: el.getBoundingClientRect().width }));
      expect(["green", "yellow", "red"]).toContain(ring.band);
      expect(ring.image).toContain("conic-gradient");
      expect(ring.size).toBe(28);
      // Renat's next working day has his five demo visits: its ring is part filled
      const busy = nextWorkday("renat");
      if (busy.slice(0, 7) !== thisMonth) await month(page).getByRole("button", { name: F.monthNext }).click();
      await expect(day(page, busy)).toHaveAttribute("data-band", /green|yellow|red/);
      expect(Number.parseInt(await day(page, busy).evaluate((el) => (el as HTMLElement).style.getPropertyValue("--p")), 10)).toBeGreaterThan(0);
      if (busy.slice(0, 7) !== thisMonth) await month(page).getByRole("button", { name: F.monthPrev }).click();

      // today, the day the calendar shows: a light disc
      await expect(day(page, today)).toHaveAttribute("aria-current", "date");
      expect(await day(page, today).evaluate((el) => getComputedStyle(el, "::after").backgroundColor)).toBe("rgb(247, 249, 252)");
      await expectNoSideScroll(page);
      await shot(page, "calendar");

      // another day of the month opens in the calendar, and is the lit one beside today
      const other = `${thisMonth}-${today.endsWith("-15") ? "16" : "15"}`;
      await day(page, other).click();
      await page.waitForURL((u) => u.pathname === "/admin" && u.searchParams.get("d") === other);
      await expect(page.locator('.jr-title input[type="date"]:visible')).toHaveValue(other);
      await expect(day(page, other)).toHaveAttribute("aria-current", "date");
      await expect(day(page, today)).not.toHaveAttribute("aria-current", "date");
      await expect(day(page, today)).toHaveClass(/is-lit/);

      // the next month: its own days and rings, asked for when it is shown
      const next = thisMonth.endsWith("-12") ? `${Number(thisMonth.slice(0, 4)) + 1}-01` : `${thisMonth.slice(0, 5)}${String(Number(thisMonth.slice(5)) + 1).padStart(2, "0")}`;
      await month(page).getByRole("button", { name: F.monthNext }).click();
      await expect(month(page).locator(".sb-month-head span")).toHaveText(monthName(next));
      await expect(month(page).locator(".sb-days:not(.is-wait)")).toBeVisible();
      await expect(day(page, `${next}-15`)).toBeVisible();
      expect(await month(page).locator(".sb-day[data-band]").count()).toBeGreaterThan(10);
      await month(page).getByRole("button", { name: F.monthPrev }).click();
      await expect(month(page).locator(".sb-month-head span")).toHaveText(monthName(thisMonth));
    });

    test("the sidebar keeps the board's sizes and colours, in both modes", async ({ page }) => {
      // the rule for a page that asks for less motion would stop the transitions read below
      await page.emulateMedia({ reducedMotion: "no-preference" });
      /** What the browser made of an element: its box, and the styles the board gives. */
      const look = (selector: string, pseudo?: string) =>
        page.locator(selector).first().evaluate((el, pseudo) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el, pseudo ?? undefined);
          return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, bg: cs.backgroundColor, color: cs.color, font: `${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight}`, radius: cs.borderTopLeftRadius };
        }, pseudo);
      await page.goto("/admin");
      await hydrated(page);
      await expect(month(page)).toBeVisible();

      // «till»
      expect(await look(".sb")).toMatchObject({ w: 220, bg: "rgb(34, 34, 46)" });
      // the head: 47px and a 1px line
      expect(await look(".sb-head")).toMatchObject({ w: 220, h: 48 });
      expect(await page.locator(".sb-head").evaluate((el) => getComputedStyle(el).borderBottom)).toBe("1px solid rgb(51, 51, 63)");
      expect(await look(".sb-mark")).toMatchObject({ w: 24, h: 24, bg: "rgb(255, 255, 255)", radius: "6px" });
      expect(await look(".sb-name")).toMatchObject({ color: "rgb(255, 255, 255)", font: "500 14px/20px" });
      // the month: its title row, the weekday letters, a day with its ring and disc
      expect(await look(".sb-month-head")).toMatchObject({ w: 196, h: 28, font: "500 14px/20px" });
      expect(await look(".sb-month-head button")).toMatchObject({ w: 24, h: 24, color: "rgb(198, 203, 211)" });
      expect(await look(".sb-wd")).toMatchObject({ h: 20, color: "rgb(130, 137, 149)", font: "500 13px/20px" });
      expect(await look(".sb-day[data-band]:not(.is-lit)")).toMatchObject({ w: 28, h: 28, color: "rgb(255, 255, 255)", font: "600 11px/20px" });
      expect(await look(".sb-day[data-band]:not(.is-lit)", "::before")).toMatchObject({ radius: "50%" });
      expect(await page.locator(".sb-day[data-band]:not(.is-lit)").first().evaluate((el) => [getComputedStyle(el, "::before").inset, getComputedStyle(el, "::after").inset, getComputedStyle(el, "::after").backgroundColor])).toEqual([
        "1.5px",
        "3px",
        "rgb(34, 34, 46)",
      ]);
      // the three colours and the grey of the rest
      const rings = await page.locator(".sb-day[data-band]").evaluateAll((els) => els.map((el) => `${el.getAttribute("data-band")} ${getComputedStyle(el, "::before").backgroundImage}`));
      for (const r of rings) {
        const [band, ...image] = r.split(" ");
        const colour = { green: "rgb(105, 206, 20)", yellow: "rgb(242, 195, 12)", red: "rgb(209, 5, 11)" }[band];
        expect(image.join(" ")).toContain(`conic-gradient(${colour}`);
        expect(image.join(" ")).toContain("rgb(113, 117, 127)");
      }
      // a day nobody works: no ring, a dim number; a day of another month: dimmed
      expect(await look(".sb-day.is-off:not(.is-out)")).toMatchObject({ color: "rgb(154, 163, 177)" });
      expect(await page.locator(".sb-day.is-off").first().evaluate((el) => getComputedStyle(el, "::before").content)).toBe("none");
      expect(await page.locator(".sb-day.is-out").first().evaluate((el) => getComputedStyle(el).opacity)).toBe("0.45");
      expect(await look(".sb-day.is-lit")).toMatchObject({ color: "rgb(43, 49, 52)" });
      // the tiles: two a row, 100px high
      expect(await look(".sb-tile")).toMatchObject({ w: 98, h: 100, bg: "rgb(20, 20, 28)", radius: "12px", font: "500 12px/16px" });
      expect(await look(".sb-tile svg")).toMatchObject({ w: 22, h: 22 });
      const tiles = await page.locator(".sb-tile").evaluateAll((els) => els.map((el) => [Math.round(el.getBoundingClientRect().x), Math.round(el.getBoundingClientRect().y)]));
      expect(tiles).toHaveLength(3);
      expect([tiles[0][0], tiles[1][0], tiles[2][0]]).toEqual([8, 114, 8]);
      expect(tiles[1][1]).toBe(tiles[0][1]);
      expect(tiles[2][1]).toBe(tiles[0][1] + 108);
      // «Избранное», who is signed in, the yellow bar, the thin row
      expect(await look(".sb-fav-head")).toMatchObject({ w: 204, h: 36, radius: "8px", font: "500 14px/20px" });
      // who: the name and the e-mail, no picture, 8px in; the way out a 24px icon
      expect(await look(".sb-me")).toMatchObject({ w: 220, h: 49 });
      expect(await look(".sb-me b")).toMatchObject({ font: "500 12px/16px" });
      expect(await look(".sb-me .who span")).toMatchObject({ color: "rgb(154, 163, 177)", font: "500 11px/14px" });
      await expect(page.locator(".sb-me .who span")).toHaveText("owner@example.test");
      await expect(page.locator(".sb-me img, .sb-ava")).toHaveCount(0);
      expect(await page.locator(".sb-me b").evaluate((el) => Math.round(el.getBoundingClientRect().x))).toBe(8);
      expect(await look(".sb-out")).toMatchObject({ w: 24, h: 24 });
      expect(await look(".sb-out svg")).toMatchObject({ w: 24, h: 24 });
      expect(await look(".sb-bar")).toMatchObject({ w: 220, h: 44, bg: "rgb(255, 203, 0)", color: "rgb(43, 49, 52)", font: "500 14px/20px", radius: "0px" });
      expect(await look(".sb-foot")).toMatchObject({ w: 220, h: 30, color: "rgb(154, 163, 177)", font: "400 11px/14px" });
      // the foot ends at the bottom of the screen
      expect(await page.locator(".sb-foot").evaluate((el) => window.innerHeight - el.getBoundingClientRect().bottom)).toBe(0);
      // the thin row's «Сообщить о проблеме» opens the test line's own sheet
      await sb(page).getByRole("button", { name: A.test.report }).click();
      const report = page.getByRole("dialog", { name: A.test.report });
      await expect(report.getByRole("textbox")).toBeVisible();
      await report.getByRole("button", { name: A.close }).click();
      await expect(report).toHaveCount(0);
      await test.info().attach("frame-sidebar-till", { body: await sb(page).screenshot({ path: path.join(OUT, "screens", "pc-frame-sidebar-till.png") }), contentType: "image/png" });

      // «menu»
      await sb(page).getByRole("button", { name: F.all }).click();
      await menu(page).getByRole("button", { name: A.nav.clients }).click();
      // the group's opening has run its .25s
      await expect(page.locator(".sb-group.is-open")).toHaveCSS("padding", "4px");
      await expect(page.locator(".sb-group.is-open > .sb-row")).toHaveCSS("background-color", "rgb(255, 217, 64)");
      expect(await look(".sb")).toMatchObject({ w: 220, bg: "rgb(8, 8, 12)" });
      // as Dim's video of the board at 1920 × 1080 (24.11): the head keeps its line; rows of 40px, 12px apart,
      // 10px in from each side, 24px icons, a light 20px chevron
      expect(await look(".sb-head")).toMatchObject({ h: 48 });
      expect(await page.locator(".sb-head").evaluate((el) => getComputedStyle(el).borderBottom)).toBe("1px solid rgb(51, 51, 63)");
      expect(await page.locator(".sb-menu").evaluate((el) => [getComputedStyle(el).padding, getComputedStyle(el).rowGap])).toEqual(["16px 10px", "12px"]);
      expect(await look(".sb-menu > a.sb-row")).toMatchObject({ w: 200, h: 40, radius: "8px", color: "rgb(255, 255, 255)", font: "500 14px/20px" });
      expect(await look(".sb-menu > a.sb-row svg")).toMatchObject({ w: 24, h: 24 });
      expect(await look(".sb-group:not(.is-open) > .sb-row svg:last-child")).toMatchObject({ w: 20, h: 20, color: "rgb(223, 228, 237)" });
      const tops = await page.locator(".sb-menu > *").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().y)));
      const closed = await page.locator(".sb-menu > *").evaluateAll((els) => els.map((el) => !el.classList.contains("is-open")));
      for (let i = 1; i < tops.length; i++) if (closed[i - 1]) expect(tops[i] - tops[i - 1]).toBe(52);
      // the open group: a dark card, its yellow head; its list grows in .25s (the grid's rows, 0fr → 1fr), a shut one has no height and is hidden
      expect(await look(".sb-group.is-open")).toMatchObject({ w: 200, bg: "rgb(34, 34, 46)", radius: "10px" });
      expect(await page.locator(".sb-group.is-open").evaluate((el) => getComputedStyle(el).padding)).toBe("4px");
      expect(await look(".sb-group.is-open > .sb-row")).toMatchObject({ w: 192, h: 40, bg: "rgb(255, 217, 64)", color: "rgb(8, 8, 12)", radius: "8px", font: "500 14px/20px" });
      expect(await look(".sb-group.is-open .sb-sub")).toMatchObject({ h: 40, color: "rgb(198, 203, 211)", font: "500 14px/20px" });
      expect(await page.locator(".sb-group.is-open > .sb-subs").evaluate((el) => [getComputedStyle(el).transitionProperty, getComputedStyle(el).transitionDuration])).toEqual(["grid-template-rows, visibility", "0.25s, 0s"]);
      expect(await page.locator(".sb-group:not(.is-open) > .sb-subs").first().evaluate((el) => [el.getBoundingClientRect().height, getComputedStyle(el).visibility, (el as HTMLElement).inert])).toEqual([0, "hidden", true]);
      expect(await look(".sb-bar")).toMatchObject({ w: 220, h: 44, bg: "rgb(255, 203, 0)" });
      expect(await page.locator(".sb-bar").evaluate((el) => window.innerHeight - el.getBoundingClientRect().bottom)).toBe(0);
      // on its page the group's row is white and heavier
      await menu(page).getByRole("link", { name: A.nav.clientBase }).click();
      await page.waitForURL(/\/admin\/clients$/);
      // (its colour fades in .15s)
      await expect(page.locator('.sb-sub[aria-current="page"]')).toHaveCSS("color", "rgb(255, 255, 255)");
      expect(await look('.sb-sub[aria-current="page"]')).toMatchObject({ color: "rgb(255, 255, 255)", font: "600 14px/20px" });
      await test.info().attach("frame-sidebar-menu", { body: await sb(page).screenshot({ path: path.join(OUT, "screens", "pc-frame-sidebar-menu.png") }), contentType: "image/png" });
    });

    test("a page is starred: it is under «Избранное», still there after a reload, and gone when the star is taken off", async ({ page }) => {
      await page.goto("/admin");
      await hydrated(page);
      // nothing starred yet: one line says how
      const fav = sb(page).getByRole("button", { name: F.fav });
      await expect(fav).toHaveAttribute("aria-expanded", "false");
      await fav.click();
      await expect(sb(page).getByText(F.favEmpty)).toBeVisible();

      // to «Услуги» through the menu, and its star
      await sb(page).getByRole("button", { name: F.all }).click();
      await menu(page).getByRole("link", { name: A.nav.services }).click();
      await page.waitForURL(/\/admin\/services$/);
      await hydrated(page);
      const star = page.getByRole("button", { name: F.favAdd(A.nav.services) });
      await expect(star).toHaveAttribute("aria-pressed", "false");
      // it sits beside the title
      const [h, s] = await Promise.all([page.getByRole("heading", { level: 1, name: A.services.title }).boundingBox(), star.boundingBox()]);
      expect(s!.x).toBeGreaterThanOrEqual(h!.x + h!.width - 1);
      expect(Math.abs(s!.y + s!.height / 2 - (h!.y + h!.height / 2))).toBeLessThan(6);
      await star.click();
      const starred = page.getByRole("button", { name: F.favRemove(A.nav.services) });
      await expect(starred).toHaveAttribute("aria-pressed", "true");
      await expect(starred).toHaveCSS("color", "rgb(255, 203, 0)");

      // back to the calendar: the page is under «Избранное»
      await sb(page).getByRole("link", { name: F.journal }).click();
      await page.waitForURL((u) => u.pathname === "/admin");
      const list = sb(page).getByRole("list", { name: F.fav });
      await expect(list.getByRole("link")).toHaveText([A.nav.services]);
      // and after a reload: the star is saved for the login, the sidebar's mode for the tab
      await page.reload();
      await hydrated(page);
      await expect(month(page)).toBeVisible();
      await expect(list.getByRole("link")).toHaveText([A.nav.services]);
      // it opens the page; the sidebar stays as it was, the page's row is the lit one
      await list.getByRole("link", { name: A.nav.services }).click();
      await page.waitForURL(/\/admin\/services$/);
      await expect(month(page)).toBeVisible();
      await expect(list.getByRole("link", { name: A.nav.services })).toHaveAttribute("aria-current", "page");
      await expect(starred).toHaveAttribute("aria-pressed", "true");
      await page.reload();
      await hydrated(page);
      await expect(starred).toHaveAttribute("aria-pressed", "true");
      await expect(list.getByRole("link")).toHaveText([A.nav.services]);

      // the star taken off: gone from the list, and it stays gone
      await starred.click();
      await expect(star).toHaveAttribute("aria-pressed", "false");
      await expect(sb(page).getByText(F.favEmpty)).toBeVisible();
      await page.reload();
      await hydrated(page);
      await expect(star).toHaveAttribute("aria-pressed", "false");
      await expect(sb(page).getByText(F.favEmpty)).toBeVisible();
    });

    test("«Все разделы» shows the sections as an accordion; «Журнал» goes back to the calendar and the month", async ({ page }) => {
      await page.goto("/admin");
      await hydrated(page);
      await expect(menu(page)).toHaveCount(0);
      const all = sb(page).getByRole("button", { name: F.all });
      await expect(all).toHaveCSS("background-color", "rgb(255, 203, 0)");
      await all.click();
      // black, no month and no tiles; the sections that exist, the four groups shut
      await expect(sb(page)).toHaveCSS("background-color", "rgb(8, 8, 12)");
      await expect(month(page)).toHaveCount(0);
      await expect(page.getByRole("group", { name: F.tiles })).toHaveCount(0);
      await expect(menu(page).getByRole("button")).toHaveText([A.nav.reports, A.nav.team, A.nav.clients, A.nav.goods, A.nav.settings]);
      await expect(menu(page).getByRole("link")).toHaveText([A.nav.services, A.nav.requests, A.nav.invoices, A.nav.notifications, A.nav.account]);
      // «Отчёты» has «Записи»; «Сотрудники» has «Список» (the barbers' page) and «График работы»
      await menu(page).getByRole("button", { name: A.nav.reports }).click();
      await expect(menu(page).getByRole("link", { name: A.nav.records, exact: true })).toHaveAttribute("href", "/admin/records");
      await menu(page).getByRole("button", { name: A.nav.team }).click();
      await expect(menu(page).getByRole("link", { name: A.nav.records, exact: true })).toHaveCount(0);
      await expect(menu(page).getByRole("link", { name: A.nav.staffList, exact: true })).toHaveAttribute("href", "/admin/staff");
      await expect(menu(page).getByRole("link", { name: A.nav.schedule, exact: true })).toHaveAttribute("href", "/admin/schedule");
      await menu(page).getByRole("button", { name: A.nav.team }).click();
      // the «Мой день | Салон» switch is gone (docs/apps.md, «One app for Renat»): the only navigation here is the menu
      await expect(sb(page).getByRole("navigation")).toHaveCount(1);
      await expect(sb(page).locator(".sb-side, .adm-side")).toHaveCount(0);

      // a group opens as a dark card with a yellow head; another one shuts it
      const goods = menu(page).getByRole("button", { name: A.nav.goods });
      await goods.click();
      await expect(goods).toHaveAttribute("aria-expanded", "true");
      await expect(goods).toHaveCSS("background-color", "rgb(255, 217, 64)");
      await expect(menu(page).locator(".sb-group.is-open")).toHaveCSS("background-color", "rgb(34, 34, 46)");
      await menu(page).getByRole("button", { name: A.nav.clients }).click();
      await expect(goods).toHaveAttribute("aria-expanded", "false");
      await expect(menu(page).getByRole("link", { name: A.nav.clientBase })).toBeVisible();
      await expect(menu(page).getByRole("link", { name: A.nav.catalogue })).toHaveCount(0);

      // «Клиентская база»: the page opens, its group stays open, its row is the current one
      await menu(page).getByRole("link", { name: A.nav.clientBase }).click();
      await page.waitForURL(/\/admin\/clients$/);
      await hydrated(page);
      await expect(menu(page).getByRole("link", { name: A.nav.clientBase })).toHaveAttribute("aria-current", "page");
      await expect(menu(page).getByRole("button", { name: A.nav.clients })).toHaveAttribute("aria-expanded", "true");
      await expectNoSideScroll(page);
      await shot(page, "menu");
      // a plain section is the yellow row itself
      await menu(page).getByRole("link", { name: A.nav.requests }).click();
      await page.waitForURL(/\/admin\/requests$/);
      await expect(menu(page).getByRole("link", { name: A.nav.requests })).toHaveCSS("background-color", "rgb(255, 217, 64)");
      // the mode is the tab's: a reload keeps the menu
      await page.reload();
      await hydrated(page);
      await expect(menu(page)).toBeVisible();

      // «Журнал»: the calendar, and the month again
      const journal = sb(page).getByRole("link", { name: F.journal });
      await expect(journal).toHaveCSS("background-color", "rgb(255, 203, 0)");
      await journal.click();
      await page.waitForURL((u) => u.pathname === "/admin");
      await expect(month(page)).toBeVisible();
      await expect(menu(page)).toHaveCount(0);
      await expect(sb(page).getByRole("button", { name: F.all })).toBeVisible();

      // a new tab that opens on another page starts with the menu; one that opens on the calendar with the month
      const tab = await page.context().newPage();
      await tab.goto("/admin/services");
      await hydrated(tab);
      await expect(menu(tab)).toBeVisible();
      await expect(month(tab)).toHaveCount(0);
      await expect(menu(tab).getByRole("link", { name: A.nav.services })).toHaveAttribute("aria-current", "page");
      await tab.goto("/admin");
      await hydrated(tab);
      // (still the menu: this tab chose nothing else)
      await expect(menu(tab)).toBeVisible();
      await tab.close();
      const cal = await page.context().newPage();
      await cal.goto("/admin");
      await hydrated(cal);
      await expect(month(cal)).toBeVisible();
      await cal.close();
    });

    test("«Продажа товара»: the drawer finds a product and saves; the sale is where the barber's sales are", async ({ page }) => {
      const S = A.sale;
      await page.goto("/admin");
      await hydrated(page);
      await tile(page, S.title).click();
      const drawer = page.getByRole("dialog", { name: S.title });
      await expect(drawer).toBeVisible();
      // the day and time are now
      await expect(drawer.getByLabel(S.day, { exact: true })).toHaveValue(tallinnDate(0));
      await expect(drawer.getByLabel(S.time, { exact: true })).toHaveValue(/^\d\d:\d\d$/);
      // nothing can be saved without a barber and a product, and it says which
      const save = drawer.getByRole("button", { name: A.save, exact: true });
      await expect(save).toHaveCSS("background-color", "rgb(255, 203, 0)");
      await save.click();
      await expect(drawer.getByRole("alert")).toHaveText(S.needSeller);
      await drawer.getByLabel(S.seller).selectOption({ label: SELLER });
      await save.click();
      await expect(drawer.getByRole("alert")).toHaveText(S.needProduct);

      // the product, by a part of its name: the shop's price and stock
      await drawer.getByPlaceholder(S.search).fill("matte");
      const found = drawer.getByRole("list", { name: S.product }).getByRole("button");
      await expect(found).toHaveCount(1);
      await expect(found).toContainText(PRODUCT);
      await expect(found).toContainText("24,90 €");
      await expect(found).toContainText(S.stock(12));
      // and by its barcode
      await drawer.getByPlaceholder(S.search).fill("2000000000015");
      await expect(found).toHaveCount(1);
      await expect(found).toContainText(PRODUCT);
      await found.click();
      await drawer.getByRole("button", { name: S.more }).click();
      await expect(drawer.locator(".dw-total b")).toHaveText("49,80 €");
      // the barber's 17 % of the regular price with VAT (Renat, 18.11)
      await expect(drawer.locator(".dw-total small")).toHaveText(S.share("17 %", "8,47 €"));

      // the client: found by his name, or left empty
      await drawer.getByPlaceholder(A.visit.searchHint).fill("Demo client 2");
      const hits = drawer.getByRole("list", { name: S.client }).getByRole("button");
      await expect(hits.first()).toBeVisible();
      const buyer = (await hits.first().locator("b").innerText()).trim();
      await hits.first().click();
      await expect(drawer.locator(".dw-chosen")).toContainText(buyer);
      // the board's drawer: a pale ground, white columns with 8px corners, a white foot
      await expect(drawer).toHaveCSS("background-color", "rgb(247, 249, 252)");
      await expect(drawer.locator(".dw-col").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await expect(drawer.locator(".dw-col").first()).toHaveCSS("border-radius", "8px");
      await expect(drawer.locator(".dw-foot")).toHaveCSS("background-color", "rgb(255, 255, 255)");
      expect(await save.evaluate((el) => window.innerWidth - el.getBoundingClientRect().right)).toBeLessThanOrEqual(16);
      await expectNoSideScroll(page);
      await shot(page, "sale");

      await save.click();
      await expect(drawer).toHaveCount(0);
      await expect(page.locator(".adm-frame-toast")).toHaveText(S.saved(`${PRODUCT} × 2`));

      // in «Счета», the barber's month: the same list his own sales are on, with the client and «тест» (no shop on staging)
      await page.goto(`/admin/invoices/barber/${demoId("staff", SELLER.toLowerCase())}?m=${tallinnDate(0).slice(0, 7)}`);
      await hydrated(page);
      const sold = page.locator(".adm-inv-sales > li", { hasText: `${PRODUCT} × 2` }).first();
      await expect(sold).toBeVisible();
      await expect(sold).toContainText(buyer);
      await expect(sold).toContainText(A.inv.mode.client);
      await expect(sold).toContainText("8,47 €");
      await expect(sold.locator(".adm-tag", { hasText: A.inv.sync.test })).toBeVisible();
      await expect(sold.locator(".end")).toHaveText("49,80 €");
      // and in the barber's own app, on «Продать», among today's
      await page.goto("/b/pick");
      await hydrated(page);
      await page.getByRole("button", { name: SELLER }).click();
      await page.waitForURL((u) => u.pathname === "/b");
      await page.goto("/b/sell");
      await hydrated(page);
      await expect(page.locator(".bx-sale", { hasText: `${PRODUCT} × 2` }).first()).toContainText(B.sell.testSale);
    });

    test("«Каталог товаров» lists the shop's products by a search, read-only", async ({ page }) => {
      const C = A.catalogue;
      await page.goto("/admin");
      await hydrated(page);
      await tile(page, A.nav.catalogue).click();
      await page.waitForURL(/\/admin\/catalogue$/);
      await hydrated(page);
      await expect(page.getByRole("heading", { level: 1, name: C.title })).toBeVisible();
      await expect(page).toHaveTitle(`${C.title} · REMPIRE`);
      // the sidebar stays as it was: the month and the tiles, this page's tile marked
      await expect(month(page)).toBeVisible();
      await expect(tile(page, A.nav.catalogue)).toHaveAttribute("aria-current", "page");
      // no shop is connected here, and the page says so
      await expect(page.getByText(C.demo)).toBeVisible();
      await expect(page.locator(".adm-cat [role=status]:visible")).toHaveText(C.hint);
      await expect(page.locator(".cat-table")).toHaveCount(0);

      const search = page.getByRole("searchbox", { name: C.search });
      await search.fill("demo");
      const rows = page.locator(".cat-table tbody tr");
      await expect(rows).toHaveCount(8);
      await expect(page.locator(".cat-table thead th")).toHaveText([C.cols.name, C.cols.price, C.cols.stock]);
      await expect(page.locator(".adm-cat [role=status]:visible")).toHaveText(C.found(8));
      const paste = rows.filter({ hasText: PRODUCT });
      await expect(paste.locator("td")).toHaveText(["", PRODUCT, "24,90 €", "12"]);
      await expectNoSideScroll(page);
      await shot(page, "catalogue");
      // by a barcode; a word nobody sells
      await search.fill("2000000000022");
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText("Sea Salt Spray");
      await search.fill("nothing like this");
      await expect(page.locator(".adm-cat [role=status]:visible")).toHaveText(C.nothing);
      await expect(rows).toHaveCount(0);
      // read-only, and never a way out to the shop
      await search.fill("demo");
      await expect(rows).toHaveCount(8);
      await expect(page.locator(".adm-cat :is(a, button, input:not([type=search]), select, textarea):visible")).toHaveCount(1);
      await expect(page.locator('.adm-cat a[href^="http"]')).toHaveCount(0);
      // it is in the menu too, under «Товары»
      await sb(page).getByRole("button", { name: F.all }).click();
      await expect(menu(page).getByRole("link", { name: A.nav.catalogue })).toHaveAttribute("aria-current", "page");
    });

    test("«Список услуг»: the services with the range of price and time; a row opens each barber's own; «Изменить» goes to «Услуги»", async ({ page }) => {
      const L = A.svcList;
      await page.goto("/admin");
      await hydrated(page);
      await tile(page, L.title).click();
      const drawer = page.getByRole("dialog", { name: L.title });
      const rows = drawer.locator(".dw-svcs > li");
      await expect(rows).toHaveCount(8);
      // a price and a time on every row, as one number or a range
      for (const text of await rows.locator(".end").allInnerTexts()) expect(text).toMatch(/^[\d.]+(–[\d.]+)? €$/);
      await expect(drawer.locator(".dw-svc-barbers")).toHaveCount(0);
      // a row opened: every barber who does it, with his time and his price
      const row = rows.first();
      await row.getByRole("button").click();
      await expect(row.getByRole("button")).toHaveAttribute("aria-expanded", "true");
      const barbers = row.locator(".dw-svc-barbers li");
      expect(await barbers.count()).toBeGreaterThan(1);
      await expect(barbers.first().locator(".p")).toHaveText(/^[\d.]+(–[\d.]+)? €$/);
      await expect(barbers.first().locator(".t")).toHaveText(/\d+ (ч|мин)/);
      // the range on the row holds every barber's price
      const range = (await row.locator(".end").innerText()).replace(" €", "").split("–").map(Number);
      for (const p of await barbers.locator(".p").allInnerTexts()) {
        const n = Number(p.replace(" €", "").split("–")[0]);
        expect(n).toBeGreaterThanOrEqual(range[0]);
        expect(n).toBeLessThanOrEqual(range[range.length - 1]);
      }
      // nothing to type into: it is a list
      await expect(drawer.locator("input, select, textarea")).toHaveCount(0);
      await expectNoSideScroll(page);
      await shot(page, "services");
      // another row shuts the first
      await rows.nth(1).getByRole("button").click();
      await expect(row.getByRole("button")).toHaveAttribute("aria-expanded", "false");
      // Escape closes it; «Изменить» is the way to change a service
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
      await tile(page, L.title).click();
      const edit = drawer.getByRole("link", { name: L.edit });
      await expect(edit).toHaveAttribute("href", "/admin/services");
      await expect(edit).toHaveCSS("background-color", "rgb(255, 203, 0)");
      await edit.click();
      await page.waitForURL(/\/admin\/services$/);
      await expect(drawer).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1, name: A.services.title })).toBeVisible();
    });

    test("in «Счета» the section's own sidebar stands in place of the salon's, with «В салон» back", async ({ page }) => {
      await page.goto("/admin/invoices");
      await hydrated(page);
      // (e2e/invoices.spec.ts looks at the section's frame itself; here, that the salon's is away and comes back)
      await expect(sb(page)).toHaveCSS("background-color", "rgb(49, 46, 107)");
      await expect(menu(page)).toHaveCount(0);
      await expect(month(page)).toHaveCount(0);
      // the open page is the darker pill, not yellow
      const pages = sb(page).getByRole("navigation", { name: A.inv.title });
      await expect(pages.getByRole("link", { name: A.inv.menu.list, exact: true })).toHaveCSS("background-color", "rgb(37, 36, 66)");
      await expectNoSideScroll(page);
      await shot(page, "invoices");
      await sb(page).getByRole("link", { name: A.inv.toSalon }).click();
      await page.waitForURL(/\/admin$/);
      await expect(month(page)).toBeVisible();
      await expect(sb(page)).toHaveCSS("background-color", "rgb(34, 34, 46)");
      await expect(sb(page).getByRole("button", { name: F.all })).toBeVisible();
    });

    test("a small laptop: the sidebar and its foot fit 1024 × 640, the middle scrolls", async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 640 });
      await page.goto("/admin");
      await hydrated(page);
      const all = sb(page).getByRole("button", { name: F.all });
      await expect(all).toBeInViewport();
      await expect(sb(page).locator(".sb-me")).toBeInViewport();
      await expect(month(page)).toBeInViewport();
      // the page itself does not scroll: the calendar still fills the screen exactly
      expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
      await expectNoSideScroll(page);
    });
  });

  test.describe("on a phone", () => {
    test("the bar: «Отчёты» where «Запросы» was; no sidebar, no star", async ({ page }) => {
      await page.goto("/admin");
      await hydrated(page);
      await expect(menu(page).getByRole("link")).toHaveText([A.nav.calendar, A.nav.clients, A.nav.reports, A.nav.invoices, A.nav.more]);
      await expect(sb(page)).toBeHidden();
      await expect(page.locator(".adm-top")).toBeVisible();
      await expectNoSideScroll(page);
      await page.goto("/admin/services");
      await hydrated(page);
      await expect(page.getByRole("heading", { level: 1, name: A.services.title })).toBeVisible();
      await expect(page.locator(".adm-star:visible")).toHaveCount(0);
      await expectNoSideScroll(page);
    });

    test("«Ещё» has «Каталог товаров» and «Продажа товара»; both open and nothing scrolls sideways", async ({ page }) => {
      const C = A.catalogue;
      await page.goto("/admin/more");
      await hydrated(page);
      const rows = page.locator(".adm-more .adm-item:visible");
      await expect(rows.locator("b")).toHaveText([A.nav.staff, A.nav.schedule, A.nav.services, A.nav.catalogue, A.nav.records, A.nav.reviews, A.nav.visits, A.nav.messages, A.nav.changes, A.nav.requests, A.nav.notifications, A.sale.title]);
      await expectNoSideScroll(page);
      expect(await smallTargets(page)).toEqual([]);
      await phoneShot(page, "more");

      // «Продажа товара»: the same form, on the whole screen
      await rows.filter({ hasText: A.sale.title }).click();
      const drawer = page.getByRole("dialog", { name: A.sale.title });
      await expect(drawer.getByLabel(A.sale.seller)).toBeVisible();
      await drawer.getByPlaceholder(A.sale.search).fill("matte");
      const found = drawer.getByRole("list", { name: A.sale.product }).getByRole("button");
      await expect(found).toHaveCount(1);
      await found.click();
      await expect(drawer.locator(".dw-total b")).toHaveText("24,90 €");
      await expectNoSideScroll(page);
      expect(await smallTargets(page)).toEqual([]);
      // the button is in reach at the bottom
      await expect(drawer.getByRole("button", { name: A.save, exact: true })).toBeInViewport();
      await phoneShot(page, "sale");
      // closed without saving
      await drawer.getByRole("button", { name: A.close, exact: true }).click();
      await expect(drawer).toHaveCount(0);

      // «Каталог товаров»: its page, with «Ещё» lit
      await rows.filter({ hasText: A.nav.catalogue }).click();
      await page.waitForURL(/\/admin\/catalogue$/);
      await hydrated(page);
      await expect(page.getByRole("heading", { level: 1, name: C.title })).toBeVisible();
      await expect(menu(page).getByRole("link", { name: A.nav.more })).toHaveAttribute("aria-current", "page");
      await expect(page).toHaveTitle(`${C.title} · REMPIRE`);
      await expect(page.getByText(C.demo)).toBeVisible();
      await page.getByRole("searchbox", { name: C.search }).fill("demo");
      const items = page.locator(".cat-item:visible");
      await expect(items).toHaveCount(8);
      await expect(items.first()).toContainText("€");
      await expectNoSideScroll(page);
      expect(await smallTargets(page)).toEqual([]);
      await phoneShot(page, "catalogue");
    });

    test.describe("the narrowest", () => {
      test.use({ viewport: { width: 320, height: 640 } });

      test("the sale form and the catalogue fit 320 px", async ({ page }) => {
        await page.goto("/admin/more");
        await hydrated(page);
        await page.locator(".adm-more .adm-item:visible", { hasText: A.sale.title }).click();
        const drawer = page.getByRole("dialog", { name: A.sale.title });
        await drawer.getByPlaceholder(A.sale.search).fill("demo");
        await expect(drawer.getByRole("list", { name: A.sale.product }).getByRole("button")).toHaveCount(8);
        await expectNoSideScroll(page);
        expect(await smallTargets(page)).toEqual([]);
        await page.keyboard.press("Escape");
        await expect(drawer).toHaveCount(0);
        await page.goto("/admin/catalogue");
        await hydrated(page);
        await page.getByRole("searchbox", { name: A.catalogue.search }).fill("demo");
        await expect(page.locator(".cat-item:visible")).toHaveCount(8);
        await expectNoSideScroll(page);
        expect(await smallTargets(page)).toEqual([]);
      });
    });
  });
});
