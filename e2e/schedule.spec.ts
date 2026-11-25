import path from "node:path";
import type { Page } from "@playwright/test";
import { monthDays, monthStart, weekDays } from "../src/lib/admin/schedule-plan";
import { addDays, isoWeekday } from "../src/lib/tz";
import { demoHours } from "../tools/demo-structure.mjs";
import { OUT } from "./env";
import { A, asOwner, demoId, expect, expectNoSideScroll, hydrated, openFolds, smallTargets, tallinnDate, test, toast } from "./helpers";

/**
 * «График работы» (/admin/schedule): the month grid of shifts. On a wide
 * screen: the board's sizes and colours, the toolbar, and editing: a free
 * day made a working day, a break, a day with a visit that refuses to
 * become a day off, a template by weekdays, the copy window. On a phone:
 * the grid scrolls inside its own box and a tap edits a day.
 *
 * Whatever is changed here is changed four months ahead, past every day
 * another test goes to and past the demo's dated shifts: there only the
 * weekly hours stand behind a day. Each test has its own barber. The copy
 * is opened and asked about, never run: it would rewrite the next two
 * weeks, which other tests live in. Screenshots: e2e/.out/screens/
 * pc-schedule.png, pc-schedule-edit.png, pc-schedule-template.png and
 * <phone>-schedule.png.
 */
const S = A.schedule;
const TODAY = tallinnDate(0);
/** The month the edits are made in: the fourth from now. */
const FAR = monthStart(TODAY, 4);
const FAR_DAYS = monthDays(FAR.slice(0, 7));
// the board's colours, as a browser reports them
const GREEN = "rgb(205, 244, 205)";
const GREEN_INK = "rgb(25, 128, 59)";
const YELLOW_CHIP = "rgb(255, 217, 64)";
const LINE = "rgb(224, 227, 235)";
const INK = "rgb(43, 49, 52)";

const noon = (date: string) => new Date(`${date}T12:00:00Z`);
const monthTitle = (date: string) => A.frame.month(noon(date));
const ddmm = (date: string) => `${date.slice(8)}.${date.slice(5, 7)}`;
/** The first day of the far month a demo barber has no weekly hours on. */
const freeDay = (slug: string, nth = 0) => FAR_DAYS.filter((d) => demoHours(slug, d).length === 0)[nth];

// Next keeps the page that was left in the document, hidden: everything is looked for in the page that shows
const root = (page: Page) => page.locator(".sc:visible");
const bar = (page: Page) => root(page).getByRole("toolbar", { name: S.title });
const rowOf = (page: Page, slug: string) => root(page).locator(`.sc-row[data-staff="${demoId("staff", slug)}"]`);
const cell = (page: Page, slug: string, date: string) => rowOf(page, slug).locator(`.sc-cell[data-date="${date}"]`);
const panel = (page: Page) => page.getByRole("dialog", { name: S.panel });
const menu = (page: Page) => page.getByRole("navigation", { name: A.sections });
const shot = async (page: Page, name: string) => {
  const body = await page.screenshot({ path: path.join(OUT, "screens", `${name}.png`) });
  await test.info().attach(name, { body, contentType: "image/png" });
};

async function open(page: Page, query = "") {
  await page.goto(`/admin/schedule${query}`);
  await hydrated(page);
  await expect(root(page).locator(".sc-box")).toBeVisible();
}

test.describe("schedule", () => {
  test.use(asOwner);

  test.describe("on a wide screen", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("the month as on the board: the menu, today's chip, the sizes and colours, the toolbar", async ({ page }, info) => {
      test.skip(info.project.name !== "android", "one wide run is enough");
      await open(page);

      /* ---- the page and its place in the menu ---- */
      await expect(root(page).getByRole("heading", { level: 1, name: S.title })).toBeVisible();
      await expect(page).toHaveTitle(`${S.title} · REMPIRE`);
      await expect(root(page).getByRole("button", { name: A.frame.favAdd(A.nav.schedule) })).toBeVisible();
      // «Сотрудники» is a group: «Список» is the barbers' own page, «График работы» this one
      const team = menu(page).getByRole("button", { name: A.nav.team });
      await expect(team).toHaveAttribute("aria-expanded", "true");
      await expect(menu(page).getByRole("link", { name: A.nav.schedule, exact: true })).toHaveAttribute("aria-current", "page");
      await expect(menu(page).getByRole("link", { name: A.nav.staffList, exact: true })).toHaveAttribute("href", "/admin/staff");

      /* ---- the month, with today's chip ---- */
      await expect(bar(page).getByRole("heading", { level: 2 })).toHaveText(monthTitle(TODAY));
      const days = monthDays(TODAY.slice(0, 7));
      await expect(root(page).locator(".sc-head .sc-day")).toHaveCount(days.length);
      await expect(root(page).locator(".sc-row:not(.sc-head)")).toHaveCount(5);
      await expect(root(page).locator(".sc-badge")).toHaveText("5");
      const chip = root(page).locator(`.sc-head .sc-day[data-date="${TODAY}"] .sc-chip`);
      await expect(root(page).locator(".sc-head .sc-day.is-today")).toHaveCount(1);
      await expect(chip.locator("b")).toHaveText(String(Number(TODAY.slice(8))));
      await expect(chip).toHaveCSS("background-color", YELLOW_CHIP);
      // the whole column under it is tinted
      await expect(cell(page, "renat", TODAY)).toHaveCSS("background-color", "rgba(255, 249, 223, 0.5)");
      // weekends are red
      const sunday = days.find((d) => isoWeekday(d) === 7 && d !== TODAY)!;
      await expect(root(page).locator(`.sc-head .sc-day[data-date="${sunday}"] .sc-chip`)).toHaveCSS("color", "rgb(249, 96, 101)");

      /* ---- the board's sizes, colours and fonts ---- */
      const look = (sel: string) =>
        root(page)
          .locator(sel)
          .first()
          .evaluate((el) => {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, color: cs.color, font: `${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight}`, radius: cs.borderTopLeftRadius, line: `${cs.borderTopWidth} ${cs.borderTopColor}` };
          });
      expect(await look(".adm-h1")).toMatchObject({ font: "500 20px/24px", color: INK });
      expect(await look(".sc-print")).toMatchObject({ h: 36, radius: "8px", line: `2px ${LINE}`, font: "500 12px/16px" });
      expect(await look(".sc-filter")).toMatchObject({ h: 32, radius: "8px", line: "1px rgb(255, 203, 0)", font: "500 12px/16px" });
      expect(await look(".sc-bar > .jr-ibtn")).toMatchObject({ w: 32, h: 32, radius: "8px", line: `1px ${LINE}` });
      expect(await look(".sc-month")).toMatchObject({ font: "500 16px/24px" });
      expect(await look('.sc-seg .jr-btn[aria-pressed="true"]')).toMatchObject({ h: 32, bg: INK, color: "rgb(255, 255, 255)" });
      expect(await look(".sc-box")).toMatchObject({ bg: "rgb(255, 255, 255)", radius: "8px" });
      expect(await look(".sc-head .sc-staff")).toMatchObject({ w: 264, h: 83, font: "500 14px/20px" });
      expect(await look(".sc-head .sc-total")).toMatchObject({ w: 91 });
      expect(await look(".sc-head .sc-total small")).toMatchObject({ font: "400 11px/14px", color: "rgb(113, 117, 127)" });
      expect(await look(".sc-head .sc-day")).toMatchObject({ w: 38, h: 83 });
      expect(await look(".sc-chip")).toMatchObject({ w: 29, h: 40, radius: "6px" });
      expect(await look(".sc-chip b")).toMatchObject({ font: "500 14px/20px" });
      expect(await look(".sc-chip i")).toMatchObject({ font: "400 12px/16px" });
      expect(await look(".sc-count")).toMatchObject({ font: "400 12px/16px", color: "rgb(154, 163, 177)" });
      expect(await look(".sc-badge")).toMatchObject({ h: 20, bg: YELLOW_CHIP, radius: "10px" });
      expect(await look(".sc-row:not(.sc-head) .sc-staff")).toMatchObject({ w: 264, h: 64 });
      expect(await look(".sc-ava")).toMatchObject({ w: 24, h: 24, radius: "4px" });
      expect(await look(".sc-name")).toMatchObject({ font: "500 12px/16px" });
      expect(await look(".sc-row:not(.sc-head) .sc-total")).toMatchObject({ w: 91, color: "rgb(113, 117, 127)", font: "400 12px/16px" });
      expect(await look(".sc-cell")).toMatchObject({ w: 38, h: 64 });
      expect(await look(".sc-cell.k-work .sc-shift")).toMatchObject({ w: 33, h: 60, bg: GREEN, color: GREEN_INK, radius: "4px", font: "500 8px/10px" });
      // the line under a row
      expect(await root(page).locator(".sc-row").first().evaluate((el) => `${getComputedStyle(el).borderBottomWidth} ${getComputedStyle(el).borderBottomColor}`)).toBe("1px rgb(234, 238, 244)");

      // a shift says its start and its end; a day of the demo's visits has their number at its foot
      const shift = root(page).locator(".sc-cell.k-work").first();
      expect((await shift.locator(".sc-shift > span").allInnerTexts()).slice(0, 2).join(" ")).toMatch(/^\d{2}:\d{2} \d{2}:\d{2}$/);
      // any working day with visits: today may be a day the salon is closed (the demo's
      // visits are seeded today whatever the day is, and a day off shows no count)
      await expect(root(page).locator(".sc-cell.k-work .sc-n").filter({ hasText: /^\d+$/ }).first()).toHaveCSS("color", "rgb(41, 194, 53)");
      // «Итого»: his shifts and hours of the month, and how many work each day in the head
      const renat = rowOf(page, "renat");
      const worked = await renat.locator(".sc-cell.k-work").count();
      await expect(renat.locator(".sc-total span").first()).toHaveText(S.shifts(worked));
      await expect(renat.locator(".sc-total span").last()).toHaveText(/^[\d,]+ ч$/);
      const works = await root(page).locator(`.sc-row:not(.sc-head) .sc-cell.k-work[data-date="${TODAY}"]`).count();
      await expect(root(page).locator(`.sc-head .sc-day[data-date="${TODAY}"] .sc-count`)).toHaveText(works ? String(works) : "–");

      // the barbers and «Итого» stay in place while the days scroll; the page itself does not scroll sideways
      const box = root(page).locator(".sc-box");
      expect(await box.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);
      const before = await Promise.all([renat.locator(".sc-staff").boundingBox(), renat.locator(".sc-total").boundingBox()]);
      await box.evaluate((el) => el.scrollTo({ left: 400 }));
      const after = await Promise.all([renat.locator(".sc-staff").boundingBox(), renat.locator(".sc-total").boundingBox()]);
      expect(after.map((b) => Math.round(b!.x))).toEqual(before.map((b) => Math.round(b!.x)));
      expect(Math.round(after[1]!.x - after[0]!.x)).toBe(264);
      await box.evaluate((el) => el.scrollTo({ left: 0 }));
      await expectNoSideScroll(page);
      await shot(page, "pc-schedule");

      /* ---- the month arrows, «Сегодня», «Неделя | Месяц» ---- */
      // (each arrow goes from the month that shows: the next click waits for it)
      const arrow = async (name: string, to: string) => {
        await bar(page).getByRole("button", { name }).click();
        await page.waitForURL((u) => u.searchParams.get("d") === to);
        await expect(bar(page).getByRole("heading", { level: 2 })).toHaveText(monthTitle(to));
        await expect(root(page).locator(".sc-head .sc-day")).toHaveCount(monthDays(to.slice(0, 7)).length);
      };
      await arrow(S.nextMonth, monthStart(TODAY, 1));
      await expect(root(page).locator(".sc-head .sc-day.is-today")).toHaveCount(0);
      await arrow(S.nextMonth, monthStart(TODAY, 2));
      await arrow(S.prevMonth, monthStart(TODAY, 1));
      await arrow(S.prevMonth, monthStart(TODAY, 0));
      await expect(root(page).locator(".sc-head .sc-day.is-today")).toHaveCount(1);
      await arrow(S.prevMonth, monthStart(TODAY, -1));
      await bar(page).getByRole("button", { name: S.today, exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get("d") === TODAY);
      await expect(bar(page).getByRole("heading", { level: 2 })).toHaveText(monthTitle(TODAY));
      await expect(root(page).locator(".sc-head .sc-day.is-today")).toHaveCount(1);
      // a week: its seven days, with today's chip
      await bar(page).getByRole("button", { name: S.week, exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get("v") === "week");
      await expect(root(page).locator(".sc-head .sc-day")).toHaveCount(7);
      expect(await root(page).locator(".sc-head .sc-day").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.date))).toEqual(weekDays(TODAY));
      await expect(root(page).locator(".sc-head .sc-total small")).toHaveText(S.weekTotal);
      await expect(bar(page).getByRole("button", { name: S.week, exact: true })).toHaveAttribute("aria-pressed", "true");
      await expectNoSideScroll(page);
      await bar(page).getByRole("button", { name: S.nextWeek }).click();
      await page.waitForURL((u) => u.searchParams.get("d") === addDays(weekDays(TODAY)[0], 7));
      await bar(page).getByRole("button", { name: S.month, exact: true }).click();
      await expect(root(page).locator(".sc-head .sc-day")).not.toHaveCount(7);

      /* ---- the cog's two switches, and who is shown ---- */
      await open(page);
      await bar(page).getByRole("button", { name: S.settings }).click();
      const set = bar(page).getByRole("dialog", { name: S.settings });
      const totals = set.getByRole("switch", { name: S.showTotals });
      const counts = set.getByRole("switch", { name: S.showCounts });
      await expect(totals).toBeChecked();
      await expect(counts).toBeChecked();
      await totals.uncheck();
      await expect(root(page).locator(".sc-total")).toHaveCount(0);
      await counts.uncheck();
      await expect(root(page).locator(".sc-count")).toHaveCount(0);
      // the choice is the tab's: a reload keeps it
      await page.reload();
      await hydrated(page);
      await expect(root(page).locator(".sc-total")).toHaveCount(0);
      await bar(page).getByRole("button", { name: S.settings }).click();
      await bar(page).getByRole("dialog", { name: S.settings }).getByRole("switch", { name: S.showTotals }).check();
      await bar(page).getByRole("dialog", { name: S.settings }).getByRole("switch", { name: S.showCounts }).check();
      await expect(root(page).locator(".sc-total")).toHaveCount(6);
      await page.keyboard.press("Escape");
      // «Фильтры»: a barber unticked has no row, and the head counts the rest
      await bar(page).getByRole("button", { name: S.filters }).click();
      const who = bar(page).getByRole("menu", { name: S.filterTitle });
      await who.getByRole("menuitemcheckbox", { name: "Slava" }).click();
      await expect(rowOf(page, "slava")).toHaveCount(0);
      await expect(root(page).locator(".sc-badge")).toHaveText("4");
      await who.getByRole("menuitem", { name: S.everyone }).click();
      await expect(rowOf(page, "slava")).toHaveCount(1);
      await expect(root(page).locator(".sc-badge")).toHaveText("5");
      await page.keyboard.press("Escape");

      /* ---- «Печать»: the browser's own print, with the grid alone on the page ---- */
      await page.evaluate(() => {
        const w = window as unknown as { printed: number };
        w.printed = 0;
        window.print = () => void w.printed++;
      });
      await root(page).getByRole("button", { name: S.print }).click();
      expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
      // a landscape A4 page at 96 dots an inch: the sidebar and the toolbar are gone, and every day of the month fits
      await page.setViewportSize({ width: 1062, height: 734 });
      await page.emulateMedia({ media: "print" });
      await expect(page.locator(".sb")).toBeHidden();
      await expect(bar(page).getByRole("button", { name: S.filters })).toBeHidden();
      await expect(root(page).locator(".sc-print")).toBeHidden();
      await expect(bar(page).getByRole("heading", { level: 2 })).toBeVisible();
      expect(await box.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      const last = (await root(page).locator(".sc-head .sc-day").last().boundingBox())!;
      expect(last.x + last.width).toBeLessThanOrEqual(1062);
      await page.emulateMedia({ media: "screen" });
      await page.setViewportSize({ width: 1440, height: 900 });
    });

    test("editing: a free day becomes a working day, gets a break; a day with a visit refuses; a weekday template fills a week; the copy asks first", async ({ page }, info) => {
      test.skip(info.project.name !== "android", "one wide run is enough");
      // Milena's first free day of that month (she works three days a week), and the day after it
      const day = freeDay("milena");
      await open(page, `?d=${FAR}`);
      await expect(bar(page).getByRole("heading", { level: 2 })).toHaveText(monthTitle(FAR));
      const c = cell(page, "milena", day);
      await expect(c).toHaveAttribute("data-kind", "off");
      await expect(c.locator(".sc-shift")).toHaveCount(0);
      await expect(panel(page)).toHaveCount(0);

      /* ---- a click marks the cell and opens the panel; a free day becomes a working day ---- */
      await c.click();
      await expect(c).toHaveAttribute("aria-pressed", "true");
      await expect(c).toHaveCSS("background-color", "rgb(255, 246, 207)");
      await expect(panel(page)).toBeVisible();
      await expect(panel(page)).toContainText(S.picked(1, 1));
      await expect(panel(page).getByLabel(S.kind)).toHaveValue("work");
      await expect(panel(page).getByLabel(S.from, { exact: true })).toHaveValue("10:00");
      await expect(panel(page).getByLabel(S.to, { exact: true })).toHaveValue("19:00");
      // the grid gives the panel room, and stays in reach beside it
      const [gridBox, panelBox] = await Promise.all([root(page).locator(".sc-box").boundingBox(), panel(page).boundingBox()]);
      expect(gridBox!.x + gridBox!.width).toBeLessThanOrEqual(panelBox!.x + 1);
      // a further click marks another cell, of another barber too; again, it is unmarked
      const other = cell(page, "slava", day);
      await other.click();
      await expect(panel(page)).toContainText(S.picked(2, 2));
      await other.click();
      await expect(other).toHaveAttribute("aria-pressed", "false");
      await expect(panel(page)).toContainText(S.picked(1, 1));
      await panel(page).getByLabel(S.to, { exact: true }).fill("18:00");
      await expectNoSideScroll(page);
      await shot(page, "pc-schedule-edit");
      await panel(page).getByRole("button", { name: A.save, exact: true }).click();
      await expect(toast(page).filter({ hasText: S.saved(1) })).toBeVisible();
      await expect(panel(page)).toHaveCount(0);
      await expect(c).toHaveAttribute("data-kind", "work");
      await expect(c).toHaveAttribute("aria-pressed", "false");
      // green after a reload, with its hours on two lines
      await page.reload();
      await hydrated(page);
      await expect(c).toHaveAttribute("data-kind", "work");
      await expect(c.locator(".sc-shift")).toHaveCSS("background-color", GREEN);
      await expect(c.locator(".sc-shift > span").first()).toHaveText("10:00");
      await expect(c.locator(".sc-shift > span").nth(1)).toHaveText("18:00");
      await expect(c.locator(".sc-dot")).toHaveCount(0);

      /* ---- the same day gets a break: the dot ---- */
      await c.click();
      // the panel starts as the day is
      await expect(panel(page).getByLabel(S.to, { exact: true })).toHaveValue("18:00");
      await panel(page).getByRole("button", { name: S.addBreak }).click();
      await panel(page).getByLabel(S.breakFrom).fill("12:30");
      await panel(page).getByLabel(S.breakTo).fill("13:15");
      await panel(page).getByRole("button", { name: A.save, exact: true }).click();
      await expect(toast(page).filter({ hasText: S.saved(1) })).toBeVisible();
      await expect(c.locator(".sc-dot")).toBeVisible();
      await expect(c.locator(".sc-dot")).toHaveCSS("background-color", "rgb(41, 194, 53)");
      await expect(c).toHaveAttribute("aria-label", new RegExp(`10:00–18:00, ${S.withBreak}`));
      // a break that is no break is refused, and says why; «Убрать перерыв» takes it away
      await c.click();
      await expect(panel(page).getByLabel(S.breakFrom)).toHaveValue("12:30");
      await panel(page).getByLabel(S.breakTo).fill("11:00");
      await panel(page).getByRole("button", { name: A.save, exact: true }).click();
      await expect(panel(page).getByRole("alert")).toHaveText(S.bad.spans);
      await panel(page).getByRole("button", { name: A.cancel, exact: true }).click();
      await expect(panel(page)).toHaveCount(0);
      await expect(c).toHaveAttribute("aria-pressed", "false");
      await expect(c.locator(".sc-dot")).toBeVisible();

      /* ---- a vacation day and a sick day: their own pale colours and a short word ---- */
      const away = freeDay("milena", 1);
      await cell(page, "milena", away).click();
      await panel(page).getByLabel(S.kind).selectOption("vacation");
      // a vacation has no hours to set
      await expect(panel(page).getByLabel(S.from, { exact: true })).toHaveCount(0);
      await panel(page).getByRole("button", { name: A.save, exact: true }).click();
      await expect(cell(page, "milena", away)).toHaveAttribute("data-kind", "vacation");
      await expect(cell(page, "milena", away).locator(".sc-shift")).toHaveText(S.short.vacation);
      await expect(cell(page, "milena", away).locator(".sc-shift")).toHaveCSS("background-color", "rgb(230, 225, 253)");
      await cell(page, "milena", away).click();
      await expect(panel(page).getByLabel(S.kind)).toHaveValue("vacation");
      await panel(page).getByLabel(S.kind).selectOption("sick");
      await panel(page).getByRole("button", { name: A.save, exact: true }).click();
      await expect(cell(page, "milena", away).locator(".sc-shift")).toHaveText(S.short.sick);
      await expect(cell(page, "milena", away).locator(".sc-shift")).toHaveCSS("background-color", "rgb(255, 228, 229)");
      // and a day off again
      await cell(page, "milena", away).click();
      await panel(page).getByLabel(S.kind).selectOption("off");
      await panel(page).getByRole("button", { name: A.save, exact: true }).click();
      await expect(cell(page, "milena", away)).toHaveAttribute("data-kind", "off");

      /* ---- a template by weekdays fills a week: Slava, the first whole week of that month ---- */
      const monday = FAR_DAYS.find((d) => isoWeekday(d) === 1)!;
      const week = weekDays(monday);
      const before = await rowOf(page, "slava").locator(`.sc-cell[data-date="${addDays(monday, 7)}"]`).getAttribute("aria-label");
      await cell(page, "slava", monday).click();
      await panel(page).getByRole("button", { name: S.modes.weekdays, exact: true }).click();
      await expect(panel(page)).toContainText(S.forStaff("Slava"));
      const wd = panel(page).getByRole("group", { name: S.weekdays });
      // the marked cell's own weekday is ticked to start with; the rest are ticked here
      await expect(wd.getByRole("button", { pressed: true })).toHaveText([A.staff.weekdays[0]]);
      for (const name of A.staff.weekdays.slice(1)) await wd.getByRole("button", { name, exact: true }).click();
      await expect(wd.getByRole("button", { pressed: true })).toHaveCount(7);
      await expect(panel(page).getByLabel(S.dateFrom)).toHaveValue(monday);
      await panel(page).getByLabel(S.dateTo).fill(week[6]);
      await panel(page).getByLabel(S.from, { exact: true }).fill("11:00");
      await panel(page).getByLabel(S.to, { exact: true }).fill("20:00");
      await shot(page, "pc-schedule-template");
      await panel(page).getByRole("button", { name: S.fill, exact: true }).click();
      await expect(toast(page).filter({ hasText: S.filled(7) })).toBeVisible();
      await expect(panel(page)).toHaveCount(0);
      for (const d of week) {
        await expect(cell(page, "slava", d), d).toHaveAttribute("data-kind", "work");
        await expect(cell(page, "slava", d).locator(".sc-shift > span").first()).toHaveText("11:00");
        await expect(cell(page, "slava", d).locator(".sc-shift > span").nth(1)).toHaveText("20:00");
      }
      // the week after is as it was
      await expect(rowOf(page, "slava").locator(`.sc-cell[data-date="${addDays(monday, 7)}"]`)).toHaveAttribute("aria-label", before!);
      // and it is still there after a reload
      await page.reload();
      await hydrated(page);
      await expect(rowOf(page, "slava").locator(".sc-cell.k-work").filter({ hasText: "11:00" })).toHaveCount(7);
      // «По сменам» has its own fields
      await cell(page, "slava", monday).click();
      await panel(page).getByRole("button", { name: S.modes.shifts, exact: true }).click();
      await expect(panel(page).getByLabel(S.on)).toHaveValue("2");
      await expect(panel(page).getByLabel(S.off)).toHaveValue("2");
      await panel(page).getByLabel(S.on).fill("0");
      await panel(page).getByRole("button", { name: S.fill, exact: true }).click();
      await expect(panel(page).getByRole("alert")).toHaveText(S.bad.on);
      await page.keyboard.press("Escape");
      await expect(panel(page)).toHaveCount(0);

      /* ---- a day with a visit refuses to become a day off: today, where the demo's visits are ---- */
      await open(page);
      const busy = root(page).locator(`.sc-row:not(.sc-head) .sc-cell[data-date="${TODAY}"]:not([data-visits="0"])`).first();
      const visits = Number(await busy.getAttribute("data-visits"));
      expect(visits).toBeGreaterThan(0);
      const was = await busy.getAttribute("data-kind");
      const name = (await busy.locator("xpath=..").locator(".sc-name").innerText()).trim();
      await busy.click();
      await panel(page).getByLabel(S.kind).selectOption("off");
      await panel(page).getByRole("button", { name: A.save, exact: true }).click();
      // it says which day and how many visits, and nothing is written
      await expect(panel(page).getByRole("alert")).toHaveText(S.refused(S.dayVisits(name, ddmm(TODAY), visits)));
      await expect(panel(page)).toBeVisible();
      await expectNoSideScroll(page);
      await panel(page).getByRole("button", { name: A.cancel, exact: true }).click();
      await page.reload();
      await hydrated(page);
      await expect(root(page).locator(`.sc-row:not(.sc-head) .sc-cell[data-date="${TODAY}"]:not([data-visits="0"])`).first()).toHaveAttribute("data-kind", was!);

      /* ---- a barber's «…»: «Скопировать график» asks first; it is not run here ---- */
      await rowOf(page, "slava").getByRole("button", { name: S.menu("Slava") }).click();
      const more = page.getByRole("menu", { name: S.menu("Slava") });
      await expect(more.getByRole("menuitem")).toHaveText([S.copy, S.editStaff]);
      await expect(more.getByRole("menuitem", { name: S.editStaff })).toHaveAttribute("href", `/admin/staff/${demoId("staff", "slava")}`);
      await more.getByRole("menuitem", { name: S.copy }).click();
      const copy = page.getByRole("dialog", { name: S.copyTitle("Slava") });
      await expect(copy).toBeVisible();
      // the next two weeks to start with, at most to the end of next month; breaks are copied unless unticked
      await expect(copy.getByLabel(S.dateFrom)).toHaveValue(TODAY);
      const two = addDays(TODAY, 13);
      const until = addDays(monthStart(TODAY, 2), -1);
      await expect(copy.getByLabel(S.dateTo)).toHaveValue(two > until ? until : two);
      await expect(copy.getByLabel(S.dateTo)).toHaveAttribute("max", until);
      await expect(copy.getByRole("checkbox", { name: S.copyBreaks })).toBeChecked();
      // himself is not among those it can be given to
      await expect(copy.getByRole("group", { name: S.copyTo }).getByRole("checkbox")).toHaveCount(4);
      await expect(copy.getByRole("checkbox", { name: "Slava", exact: true })).toHaveCount(0);
      // nobody chosen: it says so
      await copy.getByRole("button", { name: S.copy, exact: true }).click();
      await expect(copy.getByRole("alert")).toHaveText(S.bad.to);
      await copy.getByRole("checkbox", { name: "Milena", exact: true }).check();
      await copy.getByRole("button", { name: S.copy, exact: true }).click();
      // the question, with what cannot be undone; «Назад» and «Отмена» leave everything as it was
      const sure = page.getByRole("alertdialog", { name: S.copyTitle("Slava") });
      await expect(sure).toContainText("Milena");
      await expect(sure.getByRole("button", { name: S.copyYes })).toBeVisible();
      await sure.getByRole("button", { name: A.back, exact: true }).click();
      await copy.getByRole("button", { name: A.cancel, exact: true }).click();
      await expect(copy).toHaveCount(0);
    });
  });

  test("on a phone: the grid scrolls inside its own box with the barbers in place; a tap edits a day; reached from «Ещё»", async ({ page, barber }, info) => {
    // from «Ещё»
    await page.goto("/admin/more");
    await hydrated(page);
    await openFolds(page);
    await page.locator(".adm-more .adm-item:visible", { hasText: A.nav.schedule }).click();
    await page.waitForURL(/\/admin\/schedule$/);
    await hydrated(page);
    await expect(root(page).getByRole("heading", { level: 1, name: S.title })).toBeVisible();
    await expect(menu(page).getByRole("link", { name: A.nav.more })).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveTitle(`${S.title} · REMPIRE`);
    await expect(bar(page).getByRole("heading", { level: 2 })).toHaveText(monthTitle(TODAY));
    await expect(root(page).locator(".sc-head .sc-day.is-today")).toHaveCount(1);

    // the page does not scroll sideways: the grid does, inside its own box, and the barbers stay in place
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    const box = root(page).locator(".sc-box");
    expect(await box.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(300);
    const mine = rowOf(page, barber.slug);
    const x = Math.round((await mine.locator(".sc-staff").boundingBox())!.x);
    await box.evaluate((el) => el.scrollTo({ left: 300 }));
    expect(Math.round((await mine.locator(".sc-staff").boundingBox())!.x)).toBe(x);
    await expect(mine.locator(".sc-name")).toHaveText(barber.name);
    await expectNoSideScroll(page);
    await box.evaluate((el) => el.scrollTo({ left: 0 }));
    await shot(page, `${info.project.name}-schedule`);

    // what a control opens rests over the bottom bar, inside the screen
    await bar(page).getByRole("button", { name: S.settings }).click();
    const set = bar(page).getByRole("dialog", { name: S.settings });
    await expect(set.getByRole("switch", { name: S.showTotals })).toBeChecked();
    const setBox = (await set.boundingBox())!;
    expect(setBox.x).toBeGreaterThanOrEqual(0);
    expect(setBox.x + setBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await expectNoSideScroll(page);
    await page.keyboard.press("Escape");

    // a tap marks a day of this phone's own barber, four months on; the panel is a sheet behind «Изменить»
    const day = freeDay(barber.slug);
    await open(page, `?d=${FAR}`);
    const c = cell(page, barber.slug, day);
    await c.scrollIntoViewIfNeeded();
    await expect(c).toHaveAttribute("data-kind", "off");
    await c.click();
    await expect(c).toHaveAttribute("aria-pressed", "true");
    await expect(panel(page)).toBeHidden();
    const selbar = root(page).locator(".sc-selbar");
    await expect(selbar).toContainText(S.picked(1, 1));
    await expectNoSideScroll(page);
    await selbar.getByRole("button", { name: S.change }).click();
    await expect(panel(page)).toBeVisible();
    await expect(selbar).toHaveCount(0);
    await expect(panel(page).getByLabel(S.kind)).toHaveValue("work");
    await panel(page).getByLabel(S.from, { exact: true }).fill("12:00");
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    await panel(page).getByRole("button", { name: A.save, exact: true }).click();
    await expect(toast(page).filter({ hasText: S.saved(1) })).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
    await expect(c).toHaveAttribute("data-kind", "work");
    await expect(c.locator(".sc-shift > span").first()).toHaveText("12:00");
    // and «Отмена» in the bar drops a mark without opening anything
    const next = cell(page, barber.slug, freeDay(barber.slug, 1));
    await next.click();
    await root(page).locator(".sc-selbar").getByRole("button", { name: A.cancel, exact: true }).click();
    await expect(next).toHaveAttribute("aria-pressed", "false");
    await expect(root(page).locator(".sc-selbar")).toHaveCount(0);
    await expectNoSideScroll(page);
  });
});
