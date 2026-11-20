import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { DEMO, demoHours, toMin } from "../tools/demo-structure.mjs";
import { OUT } from "./env";
import { A, asOwner, demoId, expect, expectNoSideScroll, hydrated, nextWorkday, tallinnDate, test, workdayFrom } from "./helpers";

/**
 * The admin's calendar as the journal of the product we follow
 * (docs/reference-looks.md, «The journal: built»; the sizes and colours are
 * the design board's): from 900px a white bar of 32px controls, a band of
 * heads for the barbers who work that day, the time on both sides, and a
 * visit as a card whose strip says who made it and whose body says its
 * state. A phone keeps its own bar and sizes and takes the cards' colours.
 *
 * Milena's demo visits of her next working day are the ones marked done and
 * no-show here: no other test looks at their state. Everything that is
 * booked here is booked far ahead, on a day no other test goes to, and
 * cancelled again.
 */
const C = A.cal;

// the board's colours, as a browser reports them
const ONLINE = "rgb(144, 123, 159)";
const STAFF = "rgb(26, 179, 148)";
const LOOK = {
  online: { strip: ONLINE, body: "rgba(195, 165, 214, 0.8)", name: "rgb(118, 92, 136)" },
  staff: { strip: STAFF, body: "rgba(134, 223, 205, 0.8)", name: "rgb(75, 123, 114)" },
  came: { body: "rgba(255, 153, 88, 0.8)", name: "rgb(133, 78, 14)" },
  noshow: { body: "rgba(255, 107, 107, 0.8)", name: "rgb(122, 31, 31)" },
};
const LINE = "rgb(224, 227, 235)";
const INK = "rgb(43, 49, 52)";
const WHITE = "rgb(255, 255, 255)";
const YELLOW = "rgb(255, 203, 0)";

const shot = async (page: Page, name: string) => {
  const body = await page.screenshot({ path: path.join(OUT, "screens", `pc-journal-${name}.png`) });
  await test.info().attach(`journal-${name}`, { body, contentType: "image/png" });
};

/** The demo barbers who work a day, in the calendar's order. */
const working = (date: string) => DEMO.staff.filter((s) => demoHours(s.slug, date).length > 0);
/** The first day from `from` days ahead whose working barbers fit. */
function dayWhere(from: number, fits: (names: string[]) => boolean): string {
  for (let i = from; i < from + 90; i++) {
    const date = tallinnDate(i);
    if (fits(working(date).map((s) => s.name))) return date;
  }
  throw new Error("no such day in the demo schedule");
}
/** The hours a day's grid shows, from the demo schedule: the earliest start to the latest end. */
function hoursOf(date: string): [number, number] {
  const spans = working(date).flatMap((s) => demoHours(s.slug, date));
  return [Math.min(...spans.map((x) => toMin(x[0]))), Math.max(...spans.map((x) => toMin(x[1])))];
}
const words = (date: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", ...o }).format(new Date(`${date}T12:00:00Z`));
/** «19 ноября, четверг» */
const titleOf = (date: string) => `${words(date, { day: "numeric", month: "long" })}, ${words(date, { weekday: "long" })}`;
const plusDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// Next keeps the page that was left in the document, hidden: everything is looked for in the calendar that shows
const cal = (page: Page) => page.locator(".cal:visible");
const bar = (page: Page) => cal(page).locator(".jr-bar");
const column = (page: Page, slug: string, date: string) => cal(page).locator(`[data-col="${demoId("staff", slug)}:${date}"]`);
const calToast = (page: Page) => cal(page).locator(".adm-toast");
const shown = async (page: Page) => (await cal(page).locator(".cal-grid").evaluate((el) => [Number((el as HTMLElement).dataset.from), Number((el as HTMLElement).dataset.to)])) as [number, number];
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

async function open(page: Page, date: string, more = "") {
  await page.goto(`/admin?d=${date}${more}`);
  await hydrated(page);
  await expect(cal(page)).toBeVisible();
}

/** A card's three colours. */
const paint = (card: Locator) =>
  card.evaluate((el) => ({
    strip: getComputedStyle(el.querySelector(".t")!).backgroundColor,
    body: getComputedStyle(el).backgroundColor,
    name: getComputedStyle(el.querySelector("b")!).color,
  }));

/** Tap a free time of a column: the pixels come from the column's own height, whatever the scale. */
async function tapTime(page: Page, col: Locator, minute: number) {
  const [from, to] = await shown(page);
  const box = (await col.boundingBox())!;
  await col.click({ position: { x: Math.min(40, box.width / 2), y: ((minute - from) * box.height) / (to - from) + 3 } });
}

/**
 * Mark a visit with a chip of its window; leaves it alone if it is marked so
 * already. The chip writes at once and the window stays open: Escape closes it.
 */
async function mark(page: Page, card: Locator, chip: "arrived" | "no_show" | "confirmed" | "booked") {
  await card.click();
  const dialog = page.getByRole("dialog");
  const button = dialog.getByRole("group", { name: A.win.status }).getByRole("button", { name: A.win.chips[chip], exact: true });
  await expect(button).toBeVisible();
  if ((await button.getAttribute("aria-pressed")) !== "true") {
    await button.click();
    await expect(page.locator(".adm-frame-toast")).toHaveText(A.win.chips[chip]);
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
}

/**
 * Book a walk-in from the open «Новая запись»: a name, the first service. Returns the price shown.
 * From 900px it is the visit window's drawer (new-visit.tsx), on a phone the bottom sheet.
 */
async function bookFromSheet(page: Page, name: string): Promise<string> {
  const dialog = page.getByRole("dialog", { name: A.visit.new });
  const wide = (page.viewportSize()?.width ?? 0) >= 900;
  await dialog.getByLabel(wide ? A.newVisit.clientName : A.visit.name, { exact: true }).fill(name);
  await dialog.getByRole("group", { name: A.visit.services }).getByRole("button").first().click();
  const price = (await dialog.locator(wide ? ".vw-sum b" : ".adm-bar .sum b").innerText()).trim();
  await dialog.getByRole("button", { name: wide ? A.newVisit.create : A.visit.book, exact: true }).click();
  await expect(calToast(page)).toContainText(C.booked);
  await expect(dialog).toHaveCount(0);
  return price;
}

/** Cancel a visit from its sheet. */
async function cancel(page: Page, card: Locator) {
  await card.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: A.visit.cancelVisit }).click();
  await dialog.getByRole("button", { name: A.visit.cancelYes }).click();
  await expect(calToast(page)).toHaveText(C.cancelled);
}

test.describe("the journal", () => {
  test.use(asOwner);

  test.describe("on a wide screen", () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test.beforeEach(({}, info) => {
      test.skip(info.project.name !== "android", "one wide run is enough");
    });

    test("the bar: white, 32px controls, the day as its title; «Сегодня» and the arrows change the day", async ({ page }) => {
      // a day far ahead that some of the five work: nothing is booked on it
      const day = dayWhere(45, (names) => names.length >= 2 && names.length <= 4);
      await open(page, day);
      // a phone's bar is not here
      await expect(cal(page).locator(".cal-bar")).toBeHidden();
      expect(await bar(page).evaluate((el) => [el.getBoundingClientRect().height, getComputedStyle(el).backgroundColor])).toEqual([48, WHITE]);

      // the controls, left to right
      const buttons = bar(page).locator("button:visible");
      const names = await buttons.evaluateAll((els) => els.map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim()));
      // (no «Запись» from 900px: a free time under the mouse books, as the board's)
      expect(names).toEqual([C.today, C.prev, C.next, C.sell, `${C.numbers}: € 0`, C.day, C.week, C.filter, C.scale, C.panel]);
      // every one 32px high, 12px / 500, with a 1px line
      const looks = await buttons.evaluateAll((els) =>
        els.map((el) => {
          const cs = getComputedStyle(el);
          return `${el.getBoundingClientRect().height} ${cs.fontWeight} ${cs.fontSize} ${cs.borderTopWidth} ${cs.borderTopStyle}`;
        }),
      );
      expect(looks).toEqual(names.map(() => "32 500 12px 1px solid"));
      // a plain control: white, 8px corners, the pale line
      const today = bar(page).getByRole("button", { name: C.today, exact: true });
      expect(await today.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).borderTopColor, getComputedStyle(el).borderRadius, getComputedStyle(el).color])).toEqual([WHITE, LINE, "8px", INK]);
      // the square ones are 32 × 32
      for (const name of [C.prev, C.next, C.filter, C.scale, C.panel]) expect((await bar(page).getByRole("button", { name, exact: true }).boundingBox())!.width).toBe(32);
      // 12px in from the edges, 8px between two controls, the title 12px further
      const xs = async (l: Locator) => {
        const b = (await l.boundingBox())!;
        return [b.x, b.x + b.width];
      };
      const [edge, first, prev, next, head, last] = [await xs(bar(page)), await xs(today), await xs(bar(page).getByRole("button", { name: C.prev, exact: true })), await xs(bar(page).getByRole("button", { name: C.next, exact: true })), await xs(bar(page).getByRole("heading", { level: 1 })), await xs(bar(page).getByRole("button", { name: C.panel, exact: true }))];
      expect([first[0] - edge[0], prev[0] - first[1], next[0] - prev[1], head[0] - next[1], edge[1] - last[1]].map((n) => Math.round(n))).toEqual([12, 8, 8, 20, 12]);
      expect(await bar(page).evaluate((el) => `${getComputedStyle(el).padding} ${getComputedStyle(el).columnGap}`)).toBe("8px 12px 8px");
      // «День | Неделя»: the open view dark, the two joined
      const dayView = bar(page).getByRole("button", { name: C.day, exact: true });
      const weekView = bar(page).getByRole("button", { name: C.week, exact: true });
      await expect(dayView).toHaveAttribute("aria-pressed", "true");
      expect(await dayView.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color, getComputedStyle(el).borderRadius])).toEqual([INK, WHITE, "8px 0px 0px 8px"]);
      expect(await weekView.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).borderRadius, getComputedStyle(el).borderLeftWidth])).toEqual([WHITE, "0px 8px 8px 0px", "0px"]);
      expect(Math.round((await weekView.boundingBox())!.x - ((await dayView.boundingBox())!.x + (await dayView.boundingBox())!.width))).toBe(0);
      // nothing in the bar is yellow
      const yellow = await buttons.evaluateAll((els, colour) => els.filter((el) => getComputedStyle(el).backgroundColor === colour).map((el) => el.getAttribute("aria-label")), YELLOW);
      expect(yellow).toEqual([]);

      // the title: the day in the login's language, 20px / 500
      const title = bar(page).getByRole("heading", { level: 1 });
      await expect(title).toHaveText(titleOf(day));
      expect(await title.evaluate((el) => `${getComputedStyle(el).fontWeight} ${getComputedStyle(el).fontSize}/${getComputedStyle(el).lineHeight}`)).toBe("500 20px/24px");
      // the day strip gave way to the sidebar's month
      await expect(cal(page).getByRole("navigation", { name: C.days })).toBeHidden();
      await expect(page.locator(`.sb-month a[href="/admin?d=${day}"]`)).toHaveAttribute("aria-current", "date");
      await expectNoSideScroll(page);

      // › and ‹ go a day on and back
      await bar(page).getByRole("button", { name: C.next, exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get("d") === plusDays(day, 1));
      await expect(bar(page).getByRole("heading", { level: 1 })).toHaveText(titleOf(plusDays(day, 1)));
      await bar(page).getByRole("button", { name: C.prev, exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get("d") === day);
      await bar(page).getByRole("button", { name: C.prev, exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get("d") === plusDays(day, -1));
      await expect(bar(page).getByRole("heading", { level: 1 })).toHaveText(titleOf(plusDays(day, -1)));
      // «Сегодня»
      await bar(page).getByRole("button", { name: C.today, exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get("d") === tallinnDate(0));
      await expect(bar(page).getByRole("heading", { level: 1 })).toHaveText(titleOf(tallinnDate(0)));
      // the title is a way to any day
      await bar(page).getByLabel(C.pickDate).fill(day);
      await page.waitForURL((u) => u.searchParams.get("d") === day);
      await expect(bar(page).getByRole("heading", { level: 1 })).toHaveText(titleOf(day));
    });

    test("only the barbers who work that day have a column; the heads and the time on both sides are the board's", async ({ page }) => {
      const day = dayWhere(45, (names) => names.length >= 2 && names.length <= 4);
      await open(page, day);
      const heads = cal(page).locator(".cal-head");
      await expect(heads.locator("b")).toHaveText(working(day).map((s) => s.name));
      await expect(cal(page).locator(".cal-col")).toHaveCount(working(day).length);
      // a 95px white band; a 24px square photo with 4px corners, the name 12px / 500, the label under it grey
      const head = heads.first();
      expect(await head.evaluate((el) => [el.getBoundingClientRect().height, getComputedStyle(el).backgroundColor])).toEqual([95, WHITE]);
      expect(await head.locator(".cal-ava").evaluate((el) => [el.getBoundingClientRect().width, el.getBoundingClientRect().height, getComputedStyle(el).borderRadius])).toEqual([24, 24, "4px"]);
      expect(await head.locator("b").evaluate((el) => `${getComputedStyle(el).fontWeight} ${getComputedStyle(el).fontSize}/${getComputedStyle(el).lineHeight} ${getComputedStyle(el).color}`)).toBe(`500 12px/16px ${INK}`);
      const role = head.locator("small:visible");
      await expect(role).toHaveText("Барбер");
      expect(await role.evaluate((el) => `${getComputedStyle(el).fontWeight} ${getComputedStyle(el).fontSize}/${getComputedStyle(el).lineHeight} ${getComputedStyle(el).color}`)).toBe("400 12px/16px rgb(113, 117, 127)");
      // the photo 12px in (after the head's 1px line), the name 8px right of it, both in the band's middle
      const [band, photo, name] = [(await head.boundingBox())!, (await head.locator(".cal-ava").boundingBox())!, (await head.locator("b").boundingBox())!];
      expect([photo.x - band.x, name.x - (photo.x + photo.width)]).toEqual([13, 8]);
      expect(Math.abs(photo.y + photo.height / 2 - (band.y + band.height / 2))).toBeLessThanOrEqual(1);
      expect(await head.evaluate((el) => `${getComputedStyle(el).borderLeft} | ${getComputedStyle(el).borderTop}`)).toBe("1px solid rgb(238, 241, 246) | 1px solid rgb(238, 241, 246)");

      // the day runs from the earliest start to the latest end among them, a pixel a minute
      const [from, to] = hoursOf(day);
      expect(await shown(page)).toEqual([from, to]);
      const cols = cal(page).locator(".cal-col");
      expect((await cols.first().boundingBox())!.height).toBe(to - from);
      // 18px of the page's ground between the heads and the grid; each column behind a 1px line
      const bandBox = (await head.boundingBox())!;
      expect((await cols.first().boundingBox())!.y - (bandBox.y + bandBox.height)).toBe(18);
      expect(await cols.first().evaluate((el) => getComputedStyle(el).borderLeft)).toBe(`1px solid ${LINE}`);
      // a stronger line every hour, a pale one every quarter
      const lines = await cols.first().evaluate((el) => [getComputedStyle(el, "::after").backgroundImage, getComputedStyle(el, "::after").backgroundSize]);
      expect(lines[0]).toContain("rgb(223, 227, 234)");
      expect(lines[0]).toContain("rgb(240, 242, 246)");
      expect(lines[1]).toBe("100% 60px, 100% 15px");
      // the columns share the width between the two time axes
      const widths = await cols.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);

      // the time on both sides, 60px each: the hour large with a small «00», the half hour a small grey «30»
      const axes = cal(page).locator(".cal-gutter");
      await expect(axes).toHaveCount(2);
      const grid = (await cal(page).locator(".cal-grid").boundingBox())!;
      const [left, right] = [(await axes.first().boundingBox())!, (await axes.last().boundingBox())!];
      expect([left.width, right.width]).toEqual([60, 60]);
      expect(left.x).toBe(grid.x);
      expect(Math.round(right.x + right.width)).toBe(Math.round(grid.x + grid.width));
      const marks: string[] = [];
      for (let m = from; m < to; m += 30) marks.push(m % 60 === 0 ? `${m / 60}00` : "30");
      for (const axis of [axes.first(), axes.last()]) {
        expect(await axis.locator(".jr-tick").evaluateAll((els) => els.map((el) => el.textContent))).toEqual(marks);
        const hour = axis.locator(".jr-tick:not(.is-half)").first();
        expect(await hour.locator("b").evaluate((el) => `${getComputedStyle(el).fontWeight} ${getComputedStyle(el).fontSize}/${getComputedStyle(el).lineHeight} ${getComputedStyle(el).color}`)).toBe(`500 16px/16px ${INK}`);
        expect(await hour.locator("i").evaluate((el) => `${getComputedStyle(el).fontSize}/${getComputedStyle(el).lineHeight}`)).toBe("9px/11px");
        expect(await axis.locator(".jr-tick.is-half").first().evaluate((el) => getComputedStyle(el).color)).toBe("rgb(154, 163, 177)");
      }
      // a mark is 8px in from the grid's side of its axis: right-aligned on the left, left-aligned on the right
      const firstHour = async (axis: Locator) => [(await axis.boundingBox())!, (await axis.locator(".jr-tick:not(.is-half)").first().boundingBox())!];
      const [la, lt] = await firstHour(axes.first());
      const [ra, rt] = await firstHour(axes.last());
      expect(Math.round(la.x + la.width - (lt.x + lt.width))).toBe(8);
      // (the right axis has a 1px line on its left)
      expect(Math.round(rt.x - ra.x)).toBe(9);
      expect(await axes.last().evaluate((el) => getComputedStyle(el).borderLeft)).toBe(`1px solid ${LINE}`);
      // a mark sits on its line: the second hour is 60px under the first
      const tops = await axes.first().locator(".jr-tick:not(.is-half)").evaluateAll((els) => els.slice(0, 2).map((el) => el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2));
      expect(tops[1] - tops[0]).toBe(60);
      expect(Math.round(tops[0])).toBe(Math.round((await cols.first().boundingBox())!.y + (from % 60 === 0 ? 0 : 30)));
      await expectNoSideScroll(page);
    });

    test("a day nobody works says so: «Настроить график работы», or barbers added for that day; his head's menu changes the day and makes it off again", async ({ page }) => {
      const day = dayWhere(45, (names) => names.length === 0);
      const dayText = words(day, { day: "numeric", month: "long" });
      await open(page, day);
      const empty = cal(page).locator(".jr-empty");
      await expect(empty.getByRole("heading", { level: 2, name: C.noSchedule })).toBeVisible();
      await expect(empty.locator("p")).toHaveText(C.noScheduleLine(dayText));
      await expect(cal(page).locator(".cal-grid")).toHaveCount(0);
      await expect(bar(page).getByRole("heading", { level: 1 })).toHaveText(titleOf(day));
      // the yellow way to that day in «График работы», and the plain one under it
      const link = empty.getByRole("link", { name: C.setHours });
      await expect(link).toHaveAttribute("href", `/admin/schedule?d=${day}`);
      expect(await link.evaluate((el) => `${getComputedStyle(el).backgroundColor} ${el.getBoundingClientRect().height}`)).toBe(`${YELLOW} 32`);
      const add = empty.getByRole("button", { name: C.addStaff });
      expect(await add.evaluate((el) => `${getComputedStyle(el).backgroundColor} ${el.getBoundingClientRect().height}`)).toBe(`${WHITE} 32`);
      await expectNoSideScroll(page);
      await shot(page, "empty");

      // «Добавить сотрудников в день»: every barber to tick, the hours, breaks
      await add.click();
      const dialog = page.getByRole("dialog", { name: C.addStaffTitle });
      await expect(dialog).toBeVisible();
      const boxes = dialog.getByRole("checkbox");
      await expect(boxes).toHaveCount(DEMO.staff.length);
      // nobody ticked: it says so and writes nothing
      await dialog.getByRole("button", { name: C.addStaffGo, exact: true }).click();
      await expect(dialog.getByRole("alert")).toHaveText(C.pickSomeone);
      // «Выбрать всех», and again: nobody
      await dialog.getByRole("button", { name: C.pickAll }).click();
      for (const box of await boxes.all()) await expect(box).toBeChecked();
      await dialog.getByRole("button", { name: C.pickAll }).click();
      for (const box of await boxes.all()) await expect(box).not.toBeChecked();
      // Slava, 11:00–17:00, a break 13:00–14:00
      await dialog.getByRole("checkbox", { name: /Slava/ }).check();
      await dialog.getByRole("combobox", { name: `${C.workTime}: ${C.timeFrom}`, exact: true }).selectOption("11:00");
      await dialog.getByRole("combobox", { name: `${C.workTime}: ${C.timeTo}`, exact: true }).selectOption("17:00");
      await dialog.getByRole("button", { name: A.schedule.addBreak }).click();
      await expect(dialog.getByRole("combobox", { name: A.schedule.breakFrom, exact: true })).toHaveValue("13:00");
      await expect(dialog.getByRole("combobox", { name: A.schedule.breakTo, exact: true })).toHaveValue("14:00");
      await shot(page, "add-staff");
      await dialog.getByRole("button", { name: C.addStaffGo, exact: true }).click();
      await expect(calToast(page)).toHaveText(C.addedN(1));
      await expect(dialog).toHaveCount(0);
      // his column, those hours, the break as time he does not work
      const col = column(page, "slava", day);
      await expect(col).toBeVisible();
      await expect(cal(page).locator(".cal-col")).toHaveCount(1);
      expect(await shown(page)).toEqual([11 * 60, 17 * 60]);
      await expect(col.locator(".cal-work")).toHaveCount(2);

      // his head's menu: his name and hours that day
      const head = cal(page).getByRole("button", { name: C.headMenu("Slava") });
      await head.click();
      const menu = cal(page).getByRole("menu", { name: C.headMenu("Slava") });
      await expect(menu.locator(".jr-head-top b")).toHaveText("Slava");
      await expect(menu.locator(".jr-head-top small")).toHaveText(C.headDay(dayText, "11:00–13:00, 14:00–17:00"));
      await expect(menu.getByRole("menuitem")).toHaveText([C.changeHours(false), C.makeOff, C.openSchedule]);
      await expect(menu.getByRole("menuitem", { name: C.openSchedule })).toHaveAttribute("href", `/admin/schedule?d=${day}`);
      expect(await menu.evaluate((el) => `${el.getBoundingClientRect().width} ${getComputedStyle(el).backgroundColor}`)).toBe(`244 ${WHITE}`);
      await shot(page, "head-menu");
      // Escape closes it, the keyboard back on the head
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(head).toBeFocused();

      // «Изменить часы на этот день»: 10:00–18:00, the break kept
      await head.click();
      await menu.getByRole("menuitem", { name: C.changeHours(false) }).click();
      const hours = menu.getByRole("group", { name: C.changeHours(false) });
      await expect(hours.getByRole("combobox", { name: `${C.workTime}: ${C.timeFrom}`, exact: true })).toHaveValue("11:00");
      await expect(hours.getByRole("combobox", { name: `${C.workTime}: ${C.timeTo}`, exact: true })).toHaveValue("17:00");
      await hours.getByRole("combobox", { name: `${C.workTime}: ${C.timeFrom}`, exact: true }).selectOption("10:00");
      await hours.getByRole("combobox", { name: `${C.workTime}: ${C.timeTo}`, exact: true }).selectOption("18:00");
      await hours.getByRole("button", { name: A.save, exact: true }).click();
      await expect(calToast(page)).toHaveText(C.hoursSaved);
      await expect(menu).toHaveCount(0);
      await expect.poll(() => shown(page)).toEqual([10 * 60, 18 * 60]);
      await expect(col.locator(".cal-work")).toHaveCount(2);

      // «Сделать выходным»: nobody works that day again
      await head.click();
      await menu.getByRole("menuitem", { name: C.makeOff }).click();
      await expect(calToast(page)).toHaveText(C.offSaved);
      await expect(empty.getByRole("heading", { level: 2, name: C.noSchedule })).toBeVisible();
      await expect(cal(page).locator(".cal-grid")).toHaveCount(0);
      await expect(link).toHaveAttribute("href", `/admin/schedule?d=${day}`);
    });

    test("a visit's card: the strip says who made it, the body its state; a break is pale grey with its times", async ({ page }) => {
      const day = nextWorkday("milena");
      await open(page, day);
      const col = column(page, "milena", day);
      // her five demo visits: online, the salon's, online, the salon's (no phone), online
      const cards = col.locator(".cal-v", { hasText: "Demo client" });
      await expect(cards).toHaveCount(5);
      await mark(page, cards.nth(3), "arrived");
      await mark(page, cards.nth(2), "no_show");

      // booked online, waiting: violet on violet
      expect(await paint(cards.nth(0))).toEqual(LOOK.online);
      // made by the salon, waiting: green on teal
      expect(await paint(cards.nth(1))).toEqual(LOOK.staff);
      // the client came: orange, the strip still the salon's green
      expect(await paint(cards.nth(3))).toEqual({ strip: STAFF, ...LOOK.came });
      // did not come: red, the strip still the client's violet
      expect(await paint(cards.nth(2))).toEqual({ strip: ONLINE, ...LOOK.noshow });
      await expect(cards.nth(0)).toHaveClass(/k-online/);
      await expect(cards.nth(3)).toHaveClass(/k-came/);
      await expect(cards.nth(2)).toHaveClass(/k-noshow/);

      // the card: 6px in from its column, 4px corners, a minute a pixel less the 1px between two cards
      const [from] = await shown(page);
      const first = cards.nth(0);
      const times = (await first.locator(".t span").first().innerText()).trim();
      expect(times).toMatch(/^\d\d:\d\d—\d\d:\d\d$/);
      const [start, end] = times.split("—").map((t) => toMin(t));
      const box = await first.evaluate((el) => {
        const c = el.closest("[data-col]")!;
        const [r, o] = [el.getBoundingClientRect(), c.getBoundingClientRect()];
        const line = Number.parseFloat(getComputedStyle(c).borderLeftWidth);
        return { left: r.left - o.left - line, right: o.right - r.right, top: r.top - o.top, height: r.height, radius: getComputedStyle(el).borderRadius };
      });
      expect(box).toEqual({ left: 6, right: 6, top: start - from, height: end - start - 1, radius: "4px" });
      // the strip: 15px, the time in white 9px, a status mark at its right
      const strip = first.locator(".t");
      expect(await strip.evaluate((el) => `${el.getBoundingClientRect().height} ${getComputedStyle(el).fontSize}/${getComputedStyle(el).lineHeight} ${getComputedStyle(el).color}`)).toBe(`15 9px/11px ${WHITE}`);
      const markBox = (await strip.locator("svg.mk").boundingBox())!;
      const stripBox = (await strip.boundingBox())!;
      expect(Math.round(stripBox.x + stripBox.width - (markBox.x + markBox.width))).toBe(4);
      await expect(strip.locator(".dot")).toBeHidden();
      // the name and the phone 10px / 700, the services 9px / 700 in their own dark
      const font = (el: Element) => `${getComputedStyle(el).fontWeight} ${getComputedStyle(el).fontSize}/${getComputedStyle(el).lineHeight}`;
      expect(await first.locator("b").evaluate(font)).toBe("700 10px/11px");
      await expect(first.locator(".p")).toHaveText(/^\+372\d{7,8}$/);
      expect(await first.locator(".p").evaluate(font)).toBe("700 10px/11px");
      expect(await first.locator(".p").evaluate((el) => getComputedStyle(el).color)).toBe(LOOK.online.name);
      expect(await first.locator(".s").evaluate((el) => `${getComputedStyle(el).fontWeight} ${getComputedStyle(el).fontSize}/${getComputedStyle(el).lineHeight} ${getComputedStyle(el).color}`)).toBe("700 9px/11px rgb(39, 58, 73)");
      // a client without a phone has none on the card
      await expect(cards.nth(3).locator(".p")).toHaveCount(0);

      // her lunch: a pale grey block with its times in 9px grey
      const lunch = col.locator(".cal-off");
      await expect(lunch.locator("span:visible")).toHaveText("13:00—14:00 · обед");
      // at its top left, 3px and 6px in, as the board's
      expect(await lunch.evaluate((el) => [el.querySelector("span:last-child")!.getBoundingClientRect().left - el.getBoundingClientRect().left, el.querySelector("span:last-child")!.getBoundingClientRect().top - el.getBoundingClientRect().top])).toEqual([6, 3]);
      expect(await lunch.evaluate((el) => `${getComputedStyle(el).backgroundColor} ${getComputedStyle(el).color} ${getComputedStyle(el).fontSize}/${getComputedStyle(el).lineHeight} ${el.getBoundingClientRect().height}`)).toBe(
        "rgba(224, 227, 235, 0.55) rgb(113, 117, 127) 9px/11px 60",
      );
      await expectNoSideScroll(page);
      // (the line that said «Не пришёл» is gone before the picture)
      await expect(calToast(page)).toHaveCount(0);
      await shot(page, "day");
    });

    test("a visit's hover card: the client, his numbers, four chips that write at once, the services; the mouse may cross to it; Tab shows it", async ({ page }) => {
      const day = nextWorkday("milena");
      await open(page, day);
      const col = column(page, "milena", day);
      // her first demo visit: booked online, waiting
      const visit = col.locator(".cal-v", { hasText: "Demo client" }).nth(0);
      const card = page.locator(".jr-card");
      await expect(card).toHaveCount(0);
      const name = (await visit.locator("b").innerText()).trim();
      const phone = (await visit.locator(".p").innerText()).trim();
      const times = (await visit.locator(".t span").first().innerText()).trim().replace("—", "–");

      await visit.hover();
      await expect(card).toBeVisible();
      await expect(card).toHaveAccessibleName(name);
      // 376px, white, 12px corners, beside the visit
      expect(await card.evaluate((el) => `${el.getBoundingClientRect().width} ${getComputedStyle(el).backgroundColor} ${getComputedStyle(el).borderRadius}`)).toBe(`376 ${WHITE} 12px`);
      const [v, c] = [(await visit.boundingBox())!, (await card.boundingBox())!];
      expect(c.x >= v.x + v.width || c.x + c.width <= v.x).toBe(true);
      // who, his phone with a copy button, when and with whom
      await expect(card.getByRole("heading", { level: 3 })).toHaveText(name);
      await expect(card.locator(".jr-card-phone span")).toHaveText(phone);
      await expect(card.getByRole("button", { name: C.copyPhone })).toBeVisible();
      await expect(card.locator(".jr-card-when b")).toHaveText(times);
      await expect(card.locator(".jr-card-when small")).toHaveText(`Milena · ${C.cardBy.online}`);
      // his numbers, from his history
      await expect(card.locator(".jr-card-nums dt")).toHaveText([C.cardVisits, C.cardNoShows, C.cardSpent]);
      await expect(card.locator(".jr-card-nums dd").nth(0)).toHaveText(/^\d+$/);
      await expect(card.locator(".jr-card-nums dd").nth(1)).toHaveText(/^\d+$/);
      await expect(card.locator(".jr-card-nums dd").nth(2)).toHaveText(/\d/);
      // four chips, his state lit; no «Готово»
      const chips = card.getByRole("group", { name: C.cardStatus }).getByRole("button");
      await expect(chips).toHaveText([C.cardChips.booked, C.cardChips.arrived, C.cardChips.no_show, C.cardChips.confirmed]);
      await expect(chips.nth(0)).toHaveAttribute("aria-pressed", "true");
      await expect(card.getByRole("button", { name: "Готово" })).toHaveCount(0);
      // the services, each with its length and price, and the sum
      const lines = card.locator(".jr-card-svc li");
      expect(await lines.count()).toBeGreaterThan(0);
      for (const line of await lines.all()) await expect(line).toHaveText(/\d.*\d/);
      await expect(card.locator(".jr-card-total")).toContainText(A.visit.total);
      await expect(card.getByRole("button", { name: C.cardOpen })).toBeVisible();
      await shot(page, "hover");

      // the mouse crosses to the card, straight across: it stays; it leaves both: the card goes
      const across = v.y + v.height / 2;
      expect(across).toBeGreaterThan(c.y);
      expect(across).toBeLessThan(c.y + c.height);
      await page.mouse.move(c.x + c.width / 2, across, { steps: 12 });
      await page.waitForTimeout(500);
      await expect(card).toBeVisible();
      const title = (await bar(page).getByRole("heading", { level: 1 }).boundingBox())!;
      await page.mouse.move(title.x + 4, title.y + 4, { steps: 4 });
      await expect(card).toHaveCount(0);

      // a chip writes at once, and back
      await visit.hover();
      await chips.nth(3).click();
      await expect(calToast(page)).toHaveText(C.cardChips.confirmed);
      await expect(chips.nth(3)).toHaveAttribute("aria-pressed", "true");
      await chips.nth(0).click();
      await expect(calToast(page)).toHaveText(C.cardChips.booked);
      await expect(chips.nth(0)).toHaveAttribute("aria-pressed", "true");
      // «Открыть запись»: the visit's window
      await card.getByRole("button", { name: C.cardOpen }).click();
      await expect(page.getByRole("dialog", { name })).toBeVisible();
      await expect(card).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);

      // the keyboard: Tab onto the visit shows the card, Escape hides it
      await page.mouse.move(title.x + 4, title.y + 4);
      await visit.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(visit).toBeFocused();
      await expect(card).toBeVisible();
      await expect(card).toHaveAccessibleName(name);
      await page.keyboard.press("Escape");
      await expect(card).toHaveCount(0);
    });

    test("free time under the mouse: «12:00 Новый сеанс», on the scale's step; a click books at that time", async ({ page }) => {
      const day = workdayFrom("slava", tallinnDate(50));
      await open(page, day);
      const col = column(page, "slava", day);
      await expect(col.locator(".cal-v")).toHaveCount(0);
      const slot = col.locator(".jr-slot:not(.is-mark)");
      const [from, to] = await shown(page);
      // the point of a minute, the grid scrolled to it first
      const pointAt = async (minute: number) => {
        await cal(page)
          .locator(".cal-scroll")
          .evaluate(
            (el, [m, f, t]) => {
              const r = el.querySelector(".cal-col")!.getBoundingClientRect();
              const y = r.top + ((m - f) * r.height) / (t - f);
              const s = el.getBoundingClientRect();
              el.scrollTop += y - (s.top + s.height / 2);
            },
            [minute, from, to],
          );
        const box = (await col.boundingBox())!;
        return { x: box.x + box.width / 2, y: box.y + ((minute - from) * box.height) / (to - from) + 0.5 };
      };
      const scale = async (stop: "1" | "1.5" | "3") => {
        await bar(page).getByRole("button", { name: C.scale, exact: true }).click();
        await bar(page).getByRole("menuitemradio", { name: C.scales[stop], exact: true }).click();
        await page.keyboard.press("Escape");
      };
      const top = async () => Math.round((await slot.boundingBox())!.y - (await col.boundingBox())!.y);

      // 15 minutes a line: 12:07 is 12:00, a 15px green bar
      let p = await pointAt(12 * 60 + 7);
      await page.mouse.move(p.x, p.y);
      await expect(slot).toHaveText(`12:00 ${C.newSlot}`);
      expect(await slot.evaluate((el) => `${el.getBoundingClientRect().height} ${getComputedStyle(el).backgroundColor} ${getComputedStyle(el).color}`)).toBe(`15 rgb(28, 181, 142) ${WHITE}`);
      expect(await top()).toBe(12 * 60 - from);
      await shot(page, "slot");
      // 10 minutes: 12:13 is 12:10
      await scale("1.5");
      p = await pointAt(12 * 60 + 13);
      await page.mouse.move(p.x, p.y);
      await expect(slot).toHaveText(`12:10 ${C.newSlot}`);
      expect(await slot.evaluate((el) => el.getBoundingClientRect().height)).toBe(15);
      expect(await top()).toBe((12 * 60 + 10 - from) * 1.5);
      // 5 minutes: 12:07 is 12:05, and a click books at 12:05
      await scale("3");
      p = await pointAt(12 * 60 + 7);
      await page.mouse.move(p.x, p.y);
      await expect(slot).toHaveText(`12:05 ${C.newSlot}`);
      expect(await slot.evaluate((el) => el.getBoundingClientRect().height)).toBe(15);
      await page.mouse.click(p.x, p.y);
      const form = page.getByRole("dialog", { name: A.visit.new });
      await expect(form.getByLabel(A.newVisit.starts, { exact: true })).toHaveValue("12:05");
      await expect(form.getByRole("combobox", { name: A.newVisit.specialist, exact: true }).locator("option:checked")).toHaveText("Slava");
      await page.keyboard.press("Escape");
      await expect(form).toHaveCount(0);
      // off the grid: no bar
      const title = (await bar(page).getByRole("heading", { level: 1 }).boundingBox())!;
      await page.mouse.move(title.x + 4, title.y + 4);
      await expect(slot).toHaveCount(0);
      await scale("1");
      expect((await col.boundingBox())!.height).toBe(to - from);
    });

    test("today: a dark tag with the time in yellow on the left axis and a line across; the visit running now glows", async ({ page }) => {
      const today = tallinnDate(0);
      await open(page, today);
      // The page's clock is set into one of today's visits (any that is not a no-show), so «now» is on the grid
      // at whatever hour the tests run. The calendar reads its clock once a minute: the page starts a minute
      // before that time, and the minute is then let pass.
      const visit = cal(page).locator(".cal-v:not(.k-noshow)").first();
      const label = (await visit.getAttribute("aria-label"))!;
      const [start, end] = [toMin(label.slice(0, 5)), toMin(label.slice(6, 11))];
      const at = start + Math.min(5, Math.floor((end - start) / 2));
      const real = toMin(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Tallinn", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(Date.now()));
      await page.clock.install({ time: new Date(Math.floor(Date.now() / 60_000) * 60_000 + (at - real - 1) * 60_000) });
      await page.reload();
      await hydrated(page);
      await page.clock.fastForward(61_000);

      const [from] = await shown(page);
      const tag = cal(page).locator(".cal-nowtag");
      await expect(tag).toHaveText(hhmm(at));
      await expect(tag).toHaveCount(1);
      expect(await tag.evaluate((el) => `${getComputedStyle(el).backgroundColor} ${getComputedStyle(el).color} ${getComputedStyle(el).fontWeight} ${getComputedStyle(el).fontSize} ${el.getBoundingClientRect().height} ${getComputedStyle(el).borderRadius}`)).toBe(
        `${INK} ${YELLOW} 700 10px 16 4px`,
      );
      // on the left axis only, 6px in
      const axis = (await cal(page).locator(".cal-gutter").first().boundingBox())!;
      expect((await tag.boundingBox())!.x - axis.x).toBe(6);
      // a 1px line across every column, at that minute and at the tag's middle
      const lines = cal(page).locator(".cal-now");
      await expect(lines).toHaveCount(await cal(page).locator(".cal-col").count());
      expect(await lines.first().evaluate((el) => `${getComputedStyle(el).borderTopWidth} ${getComputedStyle(el).borderTopColor}`)).toBe(`1px ${INK}`);
      const [line, tagBox, colBox] = [(await lines.first().boundingBox())!, (await tag.boundingBox())!, (await cal(page).locator(".cal-col").first().boundingBox())!];
      expect(line.y - colBox.y).toBe(at - from);
      expect(line.y - (tagBox.y + tagBox.height / 2)).toBe(0);
      // the visit that is on now glows; one that is over, or still ahead, does not
      await expect(visit).toHaveClass(/is-now/);
      expect(await visit.evaluate((el) => getComputedStyle(el).boxShadow)).toContain("rgba(226, 131, 14, 0.9) 0px 0px 7px 1px");
      const others = await cal(page)
        .locator(".cal-v:not(.is-now)")
        .evaluateAll((els) => els.map((el) => getComputedStyle(el).boxShadow).filter((shadow) => shadow.includes("226, 131, 14")));
      expect(others).toEqual([]);
      for (const text of await cal(page).locator(".cal-v.is-now").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")!))) {
        expect(toMin(text.slice(0, 5))).toBeLessThanOrEqual(at);
        expect(toMin(text.slice(6, 11))).toBeGreaterThan(at);
      }
      await shot(page, "today");
    });

    test("it still does what it did: a visit opens, a free time books, a drag moves, the sheet cancels", async ({ page }) => {
      const day = workdayFrom("slava", tallinnDate(50));
      const who = "Journal Wide";
      await open(page, day);
      const col = column(page, "slava", day);
      await expect(col.locator(".cal-v")).toHaveCount(0);
      // a free time: the form opens at the time that was tapped, on his column
      await tapTime(page, col, 12 * 60);
      const form = page.getByRole("dialog", { name: A.visit.new });
      await expect(form.getByLabel(A.newVisit.starts, { exact: true })).toHaveValue("12:00");
      await expect(form.getByLabel(A.visit.date, { exact: true })).toHaveValue(day);
      await expect(form.getByRole("combobox", { name: A.newVisit.specialist, exact: true }).locator("option:checked")).toHaveText("Slava");
      await bookFromSheet(page, who);
      const card = col.locator(".cal-v", { hasText: who });
      await expect(card).toHaveCount(1);
      await expect(card).toHaveAccessibleName(new RegExp(`^12:00–\\d\\d:\\d\\d, ${who}, ${A.visit.status.booked}$`));
      // made at the front desk, waiting: green on teal
      expect(await paint(card)).toEqual(LOOK.staff);

      // it opens: the window from the right, the time, the four marks
      await card.click();
      const sheet = page.getByRole("dialog", { name: who });
      await expect(sheet.getByRole("region", { name: A.win.cols.visit }).locator(".vw-when small")).toHaveText(/^12:00–\d\d:\d\d · /);
      await expect(sheet.getByRole("group", { name: A.win.status }).getByRole("button")).toHaveText([A.win.chips.booked, A.win.chips.arrived, A.win.chips.no_show, A.win.chips.confirmed]);
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);

      // dragged an hour down, it is moved
      const box = (await card.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + 50, { steps: 4 });
      await page.mouse.move(box.x + box.width / 2, box.y + 80, { steps: 4 });
      await page.mouse.up();
      await expect(calToast(page)).toHaveText(`${C.moved}: Slava, 13:00`);
      await expect(card).toHaveAccessibleName(new RegExp(`^13:00–`));
      const [from] = await shown(page);
      expect(Math.round((await card.boundingBox())!.y - (await col.boundingBox())!.y)).toBe(13 * 60 - from);

      // «Перенести» and a tap on the new time, as on a phone
      await card.click();
      await page.getByRole("dialog", { name: who }).getByRole("button", { name: A.visit.move, exact: true }).click();
      await expect(cal(page).locator(".cal-moving")).toContainText(who);
      await tapTime(page, col, 15 * 60);
      await expect(calToast(page)).toHaveText(`${C.moved}: Slava, 15:00`);
      await expect(card).toHaveAccessibleName(new RegExp(`^15:00–`));

      // and cancelled: the column is empty again
      await cancel(page, card);
      await expect(col.locator(".cal-v")).toHaveCount(0);
    });

    test("a week: «Неделя» asks for the barber; seven days as heads, the same cards, a day opens", async ({ page }) => {
      const day = nextWorkday("milena");
      const milena = demoId("staff", "milena");
      await open(page, day);
      await bar(page).getByRole("button", { name: C.week, exact: true }).click();
      const menu = bar(page).getByRole("menu", { name: C.weekOf });
      await expect(menu.getByRole("menuitemradio")).toHaveText(DEMO.staff.map((s) => s.name));
      expect(await menu.evaluate((el) => `${getComputedStyle(el).backgroundColor} ${getComputedStyle(el).borderRadius}`)).toBe(`${WHITE} 8px`);
      await menu.getByRole("menuitemradio", { name: "Milena" }).click();
      await page.waitForURL((u) => u.searchParams.get("v") === "week" && u.searchParams.get("s") === milena && u.searchParams.get("d") === day);
      await expect(cal(page)).toHaveClass(/is-week/);

      // the bar: «Неделя» with her name is the dark one, the week is the title, no day's numbers
      const weekView = bar(page).getByRole("button", { name: `${C.week} · Milena`, exact: true });
      await expect(weekView).toHaveAttribute("aria-pressed", "true");
      await expect(weekView).toHaveCSS("background-color", INK);
      await expect(bar(page).getByRole("button", { name: C.day, exact: true })).toHaveAttribute("aria-pressed", "false");
      const monday = plusDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
      await expect(bar(page).getByRole("heading", { level: 1 })).toHaveText(`${words(monday, { day: "numeric", month: "short" })} – ${words(plusDays(monday, 6), { day: "numeric", month: "short" })}`);
      await expect(bar(page).getByRole("button", { name: new RegExp(`^${C.numbers}`) })).toHaveCount(0);
      const all = await bar(page).locator("button:visible").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
      expect(all).toEqual(all.map(() => 32));

      // seven days as heads, the day's name over its date; the time on both sides
      const heads = cal(page).locator(".cal-head");
      await expect(heads).toHaveCount(7);
      await expect(heads.locator("small:visible")).toHaveText(Array.from({ length: 7 }, (_, i) => words(plusDays(monday, i), { day: "numeric", month: "long" })));
      expect(await heads.first().evaluate((el) => el.getBoundingClientRect().height)).toBe(95);
      await expect(cal(page).locator(".cal-gutter")).toHaveCount(2);
      // her visits of that day, in the same colours
      const col = column(page, "milena", day);
      const cards = col.locator(".cal-v", { hasText: "Demo client" });
      await expect(cards).toHaveCount(5);
      expect(await paint(cards.nth(0))).toEqual(LOOK.online);
      expect(await paint(cards.nth(1))).toEqual(LOOK.staff);
      await expectNoSideScroll(page);
      await shot(page, "week");

      // another barber from the same menu; › goes a week on
      await weekView.click();
      await expect(bar(page).getByRole("menuitemradio", { name: "Milena" })).toHaveAttribute("aria-checked", "true");
      await bar(page).getByRole("menuitemradio", { name: "Renat" }).click();
      await page.waitForURL((u) => u.searchParams.get("s") === demoId("staff", "renat"));
      await expect(bar(page).getByRole("button", { name: `${C.week} · Renat`, exact: true })).toBeVisible();
      await bar(page).getByRole("button", { name: C.next, exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get("d") === plusDays(day, 7) && u.searchParams.get("v") === "week");
      // a day's head opens that day
      await cal(page).locator(".cal-head").nth(1).click();
      await page.waitForURL((u) => u.searchParams.get("d") === plusDays(plusDays(monday, 7), 1) && u.searchParams.get("v") === null);
      await expect(cal(page)).not.toHaveClass(/is-week/);
      await expect(bar(page).getByRole("button", { name: C.day, exact: true })).toHaveAttribute("aria-pressed", "true");
    });

    test("«Продать» opens the sale; the day's numbers: clients, booked, done, and the goods sold that day", async ({ page }) => {
      const S = A.sale;
      const euros = (text: string) => Number(text.replace("€", "").replace(",", ".").trim());
      const numbers = () => bar(page).getByRole("button", { name: new RegExp(`^${C.numbers}: € `) });
      const pop = () => bar(page).getByRole("dialog", { name: C.numbers });
      const rowOf = (label: string) => pop().locator("dl > div", { hasText: label }).locator("dd");

      // a day far ahead, his alone to start with
      const day = workdayFrom("renat", tallinnDate(58));
      await open(page, day);
      await expect(numbers()).toHaveText("€ 0");
      await numbers().click();
      await expect(pop().locator("p b")).toHaveText(words(day, { day: "numeric", month: "long" }));
      await expect(pop().locator("p span")).toHaveText(C.clientsN(0));
      await expect(pop().locator("dt")).toHaveText([C.bookedSum, C.doneSum, C.goodsSum]);
      await expect(pop().locator("dd")).toHaveText(["€ 0", "€ 0", "€ 0"]);
      expect(await pop().evaluate((el) => `${getComputedStyle(el).backgroundColor} ${getComputedStyle(el).borderRadius}`)).toBe(`${WHITE} 12px`);
      // a click elsewhere closes it
      const gap = (await bar(page).locator(".jr-space").boundingBox())!;
      await page.mouse.click(gap.x + gap.width / 2, gap.y);
      await expect(pop()).toHaveCount(0);

      // one visit booked: one client, its price as booked, nothing done yet
      const col = column(page, "renat", day);
      await tapTime(page, col, 12 * 60);
      const price = euros(await bookFromSheet(page, "Journal Numbers"));
      expect(price).toBeGreaterThan(0);
      const card = col.locator(".cal-v", { hasText: "Journal Numbers" });
      await expect(card).toHaveCount(1);
      await expect(numbers()).toHaveText("€ 0");
      await numbers().click();
      await expect(pop().locator("p span")).toHaveText(C.clientsN(1));
      await expect(pop().locator("dd")).toHaveText([`€ ${price}`, "€ 0", "€ 0"]);
      await page.keyboard.press("Escape");
      // he came: it is done money, on the button too
      await mark(page, card, "arrived");
      await expect(numbers()).toHaveText(`€ ${price}`);
      await numbers().click();
      await expect(pop().locator("dd")).toHaveText([`€ ${price}`, `€ ${price}`, "€ 0"]);
      await shot(page, "numbers");
      await page.keyboard.press("Escape");
      // he did not come after all: booked, not done
      await mark(page, card, "no_show");
      await expect(numbers()).toHaveText("€ 0");
      await numbers().click();
      await expect(pop().locator("p span")).toHaveText(C.clientsN(1));
      await expect(pop().locator("dd")).toHaveText([`€ ${price}`, "€ 0", "€ 0"]);
      await page.keyboard.press("Escape");
      // cancelled: the day is empty again
      await cancel(page, card);
      await numbers().click();
      await expect(pop().locator("p span")).toHaveText(C.clientsN(0));
      await expect(pop().locator("dd")).toHaveText(["€ 0", "€ 0", "€ 0"]);

      // «Продать»: the sale drawer; a product sold now is in today's goods
      await open(page, tallinnDate(0));
      await numbers().click();
      const before = euros(await rowOf(C.goodsSum).innerText());
      await page.keyboard.press("Escape");
      await bar(page).getByRole("button", { name: C.sell, exact: true }).click();
      const drawer = page.getByRole("dialog", { name: S.title });
      await expect(drawer.getByLabel(S.day, { exact: true })).toHaveValue(tallinnDate(0));
      await drawer.getByLabel(S.seller).selectOption({ label: "Milena" });
      await drawer.getByPlaceholder(S.search).fill("matte");
      await drawer.getByRole("list", { name: S.product }).getByRole("button").click();
      await expect(drawer.locator(".dw-total b")).toHaveText("24,90 €");
      await shot(page, "sell");
      await drawer.getByRole("button", { name: A.save, exact: true }).click();
      await expect(drawer).toHaveCount(0);
      await expect(page.locator(".adm-frame-toast")).toContainText("Demo Grooming Matte Paste 100 ml × 1");
      await numbers().click();
      await expect(rowOf(C.goodsSum)).toHaveText(`€ ${(before + 24.9).toFixed(2).replace(".", ",")}`);
      // they are today's goods only: tomorrow has none (nothing can be sold ahead)
      await page.keyboard.press("Escape");
      await bar(page).getByRole("button", { name: C.next, exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get("d") === tallinnDate(1));
      await numbers().click();
      await expect(rowOf(C.goodsSum)).toHaveText("€ 0");
    });

    test("the status filter: a state without its tick is off the grid, and the tab remembers it", async ({ page }) => {
      const day = nextWorkday("milena");
      await open(page, day);
      const col = column(page, "milena", day);
      const cards = col.locator(".cal-v", { hasText: "Demo client" });
      await expect(cards).toHaveCount(5);
      await mark(page, cards.nth(3), "arrived");
      await mark(page, cards.nth(2), "no_show");
      const [online, staff, noshow, came] = [cards.nth(0), cards.nth(1), cards.nth(2), cards.nth(3)];

      const funnel = bar(page).getByRole("button", { name: C.filter, exact: true });
      await expect(funnel).not.toHaveClass(/is-marked/);
      await funnel.click();
      const menu = bar(page).getByRole("menu", { name: C.filter });
      const ticks = menu.getByRole("menuitemcheckbox");
      await expect(ticks).toHaveText([C.states.online, C.states.staff, C.states.came, C.states.noshow]);
      for (const tick of await ticks.all()) await expect(tick).toHaveAttribute("aria-checked", "true");
      // each state beside its own colour
      expect(await menu.locator(".jr-dot").evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))).toEqual(["rgb(195, 165, 214)", "rgb(134, 223, 205)", "rgb(255, 153, 88)", "rgb(255, 107, 107)"]);

      // «пришёл» off: the orange card is gone, the rest stay
      await menu.getByRole("menuitemcheckbox", { name: C.states.came }).click();
      await expect(menu.getByRole("menuitemcheckbox", { name: C.states.came })).toHaveAttribute("aria-checked", "false");
      await expect(came).toBeHidden();
      for (const card of [online, staff, noshow]) await expect(card).toBeVisible();
      await expect(funnel).toHaveClass(/is-marked/);
      await shot(page, "filter");
      // every other state in turn
      await menu.getByRole("menuitemcheckbox", { name: C.states.noshow }).click();
      await expect(noshow).toBeHidden();
      await menu.getByRole("menuitemcheckbox", { name: C.states.online }).click();
      await expect(online).toBeHidden();
      await expect(cards.nth(4)).toBeHidden();
      await expect(staff).toBeVisible();
      await menu.getByRole("menuitemcheckbox", { name: C.states.staff }).click();
      await expect(col.locator(".cal-v:visible")).toHaveCount(0);
      // back, but for «пришёл»
      for (const k of ["online", "staff", "noshow"] as const) await menu.getByRole("menuitemcheckbox", { name: C.states[k] }).click();
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(col.locator(".cal-v:visible")).toHaveCount(4);

      // kept for the tab: another day and back, and a reload
      await bar(page).getByRole("button", { name: C.next, exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get("d") === plusDays(day, 1));
      await expect(bar(page).getByRole("button", { name: C.filter, exact: true })).toHaveClass(/is-marked/);
      await bar(page).getByRole("button", { name: C.prev, exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get("d") === day);
      await expect(came).toBeHidden();
      await page.reload();
      await hydrated(page);
      await expect(col.locator(".cal-v:visible")).toHaveCount(4);
      await expect(came).toBeHidden();
      // the tick back: everything is on the grid, the dot is gone
      await bar(page).getByRole("button", { name: C.filter, exact: true }).click();
      await expect(bar(page).getByRole("menuitemcheckbox", { name: C.states.came })).toHaveAttribute("aria-checked", "false");
      await bar(page).getByRole("menuitemcheckbox", { name: C.states.came }).click();
      await expect(came).toBeVisible();
      await expect(bar(page).getByRole("button", { name: C.filter, exact: true })).not.toHaveClass(/is-marked/);
    });

    test("the scale: three stops change the pixels a minute, and the tab remembers", async ({ page }) => {
      const day = nextWorkday("milena");
      await open(page, day);
      const col = column(page, "milena", day);
      const card = col.locator(".cal-v", { hasText: "Demo client" }).first();
      const [from, to] = await shown(page);
      const minutes = async () => {
        const [a, b] = (await card.locator(".t span").first().innerText()).trim().split("—").map((t) => toMin(t));
        return b - a;
      };
      const long = await minutes();
      expect((await col.boundingBox())!.height).toBe(to - from);
      expect((await card.boundingBox())!.height).toBe(long - 1);

      const zoom = bar(page).getByRole("button", { name: C.scale, exact: true });
      await zoom.click();
      const stops = bar(page).getByRole("menu", { name: C.scale }).getByRole("menuitemradio");
      await expect(stops).toHaveText([C.scales["3"], C.scales["1.5"], C.scales["1"]]);
      await expect(stops.nth(2)).toHaveAttribute("aria-checked", "true");
      // 10 minutes to a line: a minute is 1.5px
      await stops.nth(1).click();
      await expect(stops.nth(1)).toHaveAttribute("aria-checked", "true");
      expect((await col.boundingBox())!.height).toBe((to - from) * 1.5);
      expect((await card.boundingBox())!.height).toBe(long * 1.5 - 1);
      // 5 minutes to a line: 3px, and the lines are still 15px apart
      await stops.nth(0).click();
      expect((await col.boundingBox())!.height).toBe((to - from) * 3);
      expect((await card.boundingBox())!.height).toBe(long * 3 - 1);
      expect(await col.evaluate((el) => getComputedStyle(el, "::after").backgroundSize)).toBe("100% 180px, 100% 15px");
      // the hours on the axis are 180px apart
      const tops = await cal(page).locator(".cal-gutter").first().locator(".jr-tick:not(.is-half)").evaluateAll((els) => els.slice(0, 2).map((el) => el.getBoundingClientRect().top));
      expect(tops[1] - tops[0]).toBe(180);
      await expectNoSideScroll(page);
      await shot(page, "scale");
      await page.keyboard.press("Escape");

      // a tap still lands on its time: the form opens at 16:30
      const free = Math.min(16 * 60 + 30, to - 60);
      await col.scrollIntoViewIfNeeded();
      await tapTime(page, col, free);
      const form = page.getByRole("dialog", { name: A.visit.new });
      await expect(form.getByLabel(A.newVisit.starts, { exact: true })).toHaveValue(hhmm(free));
      await page.keyboard.press("Escape");
      await expect(form).toHaveCount(0);

      // kept for the tab: a reload, and another day
      await page.reload();
      await hydrated(page);
      await expect.poll(async () => (await col.boundingBox())!.height).toBe((to - from) * 3);
      await bar(page).getByRole("button", { name: C.scale, exact: true }).click();
      await expect(bar(page).getByRole("menuitemradio", { name: C.scales["3"], exact: true })).toHaveAttribute("aria-checked", "true");
      // back to 15 minutes
      await bar(page).getByRole("menuitemradio", { name: C.scales["1"], exact: true }).click();
      expect((await col.boundingBox())!.height).toBe(to - from);
    });

    test("the panel on the right: 321px, one tab; a client is found by name or phone and opens his card", async ({ page }) => {
      const day = nextWorkday("milena");
      await open(page, day);
      const panel = cal(page).getByRole("complementary", { name: C.panel });
      await expect(panel).toHaveCount(0);
      const toggle = bar(page).getByRole("button", { name: C.panel, exact: true });
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      const wide = (await cal(page).locator(".cal-scroll").boundingBox())!.width;
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await expect(panel).toBeVisible();
      // 321px on the page's ground, a 1px line on its left, down the whole height under the bar; the grid gives way
      expect(await panel.evaluate((el) => `${el.getBoundingClientRect().width} ${getComputedStyle(el).backgroundColor} ${getComputedStyle(el).borderLeftWidth} ${getComputedStyle(el).borderLeftColor}`)).toBe(`321 rgb(247, 249, 252) 1px ${LINE}`);
      expect(Math.round((await panel.boundingBox())!.x + 321)).toBe(1440);
      expect(Math.round((await panel.boundingBox())!.y + (await panel.boundingBox())!.height)).toBe(900);
      expect((await cal(page).locator(".cal-scroll").boundingBox())!.width).toBe(wide - 321);
      // one tab, 48px, white
      const tab = panel.getByRole("tab");
      await expect(tab).toHaveText([C.panelTab]);
      expect(await tab.evaluate((el) => `${el.getBoundingClientRect().height} ${getComputedStyle(el).backgroundColor}`)).toBe(`48 ${WHITE}`);
      const search = panel.getByRole("searchbox", { name: C.panelSearch });
      await expect(search).toHaveAttribute("placeholder", C.panelSearch);
      expect((await search.boundingBox())!.height).toBe(32);
      await expect(panel.getByRole("status")).toHaveText(C.panelEmpty);
      await expectNoSideScroll(page);

      // by a name: his visits and his last one
      await search.fill("demo client 2");
      const hits = panel.getByRole("list", { name: C.panelTab }).getByRole("link");
      await expect(hits.first()).toBeVisible();
      expect(await hits.count()).toBeGreaterThan(1);
      for (const text of await hits.locator("b").allInnerTexts()) expect(text.toLowerCase()).toContain("demo client 2");
      // only visits already past are counted: before his demo visit of today (about 11:00) the first may have none yet
      await expect(hits.first().locator("small")).toHaveText(/^(\d+ визит(а|ов)?( · последний \d\d\.\d\d\.\d{4})?|визитов нет)$/);
      await shot(page, "panel");
      // what was typed is not in the address
      expect(page.url()).not.toContain("demo");
      // by a phone, whatever its spaces
      await search.fill("5555 09");
      await expect(hits.first().locator("span")).toHaveText(/^\+3725555 ?09\d\d$/);
      // nobody
      await search.fill("nobody like this");
      await expect(panel.getByRole("status")).toHaveText(C.panelNothing);
      await expect(hits).toHaveCount(0);
      // cleared: the first words again
      await search.fill("");
      await expect(panel.getByRole("status")).toHaveText(C.panelEmpty);

      // an open visit lies over the panel, under its dimmed side, and closing it gives the panel back
      await column(page, "milena", day).locator(".cal-v", { hasText: "Demo client" }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      const covered = await panel.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return !el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      });
      expect(covered).toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(panel).toBeVisible();

      // kept for the tab: another day
      await bar(page).getByRole("button", { name: C.next, exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get("d") === plusDays(day, 1));
      await expect(panel).toBeVisible();
      // a found client opens his card
      await panel.getByRole("searchbox", { name: C.panelSearch }).fill("demo client 2");
      const name = (await hits.first().locator("b").innerText()).trim();
      await hits.first().click();
      await page.waitForURL(/\/admin\/clients\/[0-9a-f-]{36}$/);
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      // back in the calendar the panel is still open; the icon shuts it
      await page.goBack();
      await page.waitForURL((u) => u.pathname === "/admin");
      await hydrated(page);
      await expect(panel).toBeVisible();
      await bar(page).getByRole("button", { name: C.panel, exact: true }).click();
      await expect(panel).toHaveCount(0);
    });

    test("a small laptop: 1024 × 640, the bar and the grid fit beside the sidebar", async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 640 });
      const day = nextWorkday("milena");
      await open(page, day);
      await expect(bar(page).getByRole("button", { name: C.panel, exact: true })).toBeInViewport();
      const boxes = await bar(page).locator("button:visible").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
      expect(boxes).toEqual(boxes.map(() => 32));
      // the page itself does not scroll: the grid scrolls in its own box
      expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
      await expectNoSideScroll(page);
      // with the panel open too
      await bar(page).getByRole("button", { name: C.panel, exact: true }).click();
      await expect(cal(page).getByRole("complementary", { name: C.panel })).toBeVisible();
      await expectNoSideScroll(page);
    });
  });

  test.describe("on a phone", () => {
    const phoneShot = async (page: Page, name: string) => {
      const body = await page.screenshot({ path: path.join(OUT, "screens", `${test.info().project.name}-journal-${name}.png`) });
      await test.info().attach(`journal-${name}`, { body, contentType: "image/png" });
    };

    test("its own bar and day strip; the working barbers' columns; the cards in the journal's colours; nothing scrolls sideways", async ({ page }) => {
      // Slava's next working day: his five demo visits, which no test changes
      const day = nextWorkday("slava");
      await open(page, day);
      // the journal's bar and its second time axis are for 900px
      await expect(bar(page)).toBeHidden();
      await expect(cal(page).locator(".cal-bar")).toBeVisible();
      await expect(cal(page).locator(".cal-gutter:visible")).toHaveCount(1);
      await expect(cal(page).locator(".jr-tick:visible")).toHaveCount(0);
      // the day strip, with this day lit
      const strip = cal(page).getByRole("navigation", { name: C.days });
      await expect(strip.getByRole("button")).toHaveCount(7);
      await expect(strip.getByRole("button", { pressed: true })).toHaveCount(1);
      // as Altegio's phone app (option D): the date in the dark bar on top, lying over the frame's own
      const frameTop = (await page.locator(".one-top").boundingBox())!;
      const dark = cal(page).locator(".cal-bar");
      const darkBox = (await dark.boundingBox())!;
      expect([Math.round(darkBox.y), Math.round(darkBox.height)]).toEqual([Math.round(frameTop.y), Math.round(frameTop.height)]);
      expect(await dark.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(34, 34, 46)");
      await expect(dark.getByLabel(C.pickDate)).toHaveValue(day);
      // and the week floating at the bottom, 8px over the tabs, Saturday and Sunday in orange
      const tabs = (await page.locator(".adm-nav").boundingBox())!;
      const stripBox = (await strip.boundingBox())!;
      expect(Math.round(tabs.y - (stripBox.y + stripBox.height))).toBe(8);
      const weekend = strip.locator("button.is-end:not(.is-today):not([aria-pressed='true']) b");
      if (await weekend.count()) expect(await weekend.first().evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 159, 90)");
      // a column for each barber who works that day; a barber who is off has one only for a visit or for
      // special time (the demo gives Valentin two evening hours of it on weekdays)
      const heads = await cal(page).locator(".cal-head b").allInnerTexts();
      for (const s of working(day)) expect(heads).toContain(s.name);
      for (const s of DEMO.staff.filter((x) => !working(day).includes(x))) {
        if (heads.includes(s.name)) expect(await column(page, s.slug, day).locator(".cal-v, .cal-sp").count()).toBeGreaterThan(0);
      }
      // the head keeps a phone's line: his visits and their sum
      const slavaHead = cal(page).locator(".cal-head", { hasText: "Slava" });
      await slavaHead.scrollIntoViewIfNeeded();
      await expect(slavaHead.locator("small:visible")).toHaveText(/^\d+ запис\S+ · [\d.]+ €$/);

      // his cards: the strip by who made it, the body by its state; a phone's own sizes
      const col = column(page, "slava", day);
      const cards = col.locator(".cal-v", { hasText: "Demo client" });
      await expect(cards).toHaveCount(5);
      expect(await paint(cards.nth(0))).toEqual(LOOK.online);
      expect(await paint(cards.nth(1))).toEqual(LOOK.staff);
      const [from, to] = await shown(page);
      expect(Math.round((await col.boundingBox())!.height)).toBe(Math.round((to - from) * 1.2));
      // no phone number and no status mark on a phone's card
      await expect(cards.nth(0).locator(".p")).toBeHidden();
      await expect(cards.nth(0).locator("svg.mk")).toBeHidden();
      await expectNoSideScroll(page);
      await phoneShot(page, "day");

      // a visit opens
      const client = (await cards.nth(0).locator("b").innerText()).trim();
      await cards.nth(0).click();
      await expect(page.getByRole("dialog", { name: client })).toBeVisible();
      await expectNoSideScroll(page);
      await page.getByRole("dialog", { name: client }).getByRole("button", { name: A.close }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      // the day strip goes to another day of the week
      const other = strip.getByRole("button", { pressed: false }).first();
      await other.click();
      await page.waitForURL((u) => u.pathname === "/admin" && u.searchParams.get("d") !== day && u.searchParams.get("d") !== null);
      await expect(cal(page).getByRole("navigation", { name: C.days }).getByRole("button", { pressed: true })).toHaveCount(1);
      await expectNoSideScroll(page);

      // a swipe to the left on the strip is the next week, the same weekday; to the right, back
      const d0 = new URL(page.url()).searchParams.get("d")!;
      const plus = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
      const swipe = async (from: number, to: number) => {
        const b = (await cal(page).getByRole("navigation", { name: C.days }).boundingBox())!;
        await page.mouse.move(b.x + b.width * from, b.y + b.height / 2);
        await page.mouse.down();
        await page.mouse.move(b.x + b.width * to, b.y + b.height / 2, { steps: 6 });
        await page.mouse.up();
      };
      await swipe(0.75, 0.2);
      await page.waitForURL((u) => u.searchParams.get("d") === plus(d0, 7));
      await swipe(0.2, 0.75);
      await page.waitForURL((u) => u.searchParams.get("d") === d0);
    });

    test("a free time books, «Перенести» moves, a week shows it, the sheet cancels", async ({ page, barber }, info) => {
      // each phone on its own barber's day, far ahead
      const day = workdayFrom(barber.slug, tallinnDate(info.project.name === "iphone" ? 66 : 62));
      const who = `Journal ${barber.name}`;
      await open(page, day);
      const col = column(page, barber.slug, day);
      await col.scrollIntoViewIfNeeded();
      await expect(col.locator(".cal-v")).toHaveCount(0);
      await tapTime(page, col, 12 * 60);
      const form = page.getByRole("dialog", { name: A.visit.new });
      await expect(form.getByLabel(A.visit.time)).toHaveValue("12:00");
      await expect(form.getByRole("group", { name: A.visit.barber }).getByRole("button", { pressed: true })).toHaveText(barber.name);
      await expectNoSideScroll(page);
      await bookFromSheet(page, who);
      const card = col.locator(".cal-v", { hasText: who });
      await expect(card).toHaveCount(1);
      expect(await paint(card)).toEqual(LOOK.staff);

      // «Перенести», then a tap on the new time
      await card.click();
      await page.getByRole("dialog", { name: who }).getByRole("button", { name: A.visit.move, exact: true }).click();
      await expect(cal(page).locator(".cal-moving")).toContainText(who);
      await tapTime(page, col, 15 * 60);
      await expect(calToast(page)).toHaveText(`${C.moved}: ${barber.name}, 15:00`);
      await expect(card).toHaveAccessibleName(new RegExp(`^15:00–`));

      // his week: seven days on one screen, the visit in its day
      await cal(page).locator(".cal-bar").getByRole("button", { name: C.week, exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get("v") === "week");
      await cal(page).locator(".cal-who").getByRole("button", { name: barber.name }).click();
      await page.waitForURL((u) => u.searchParams.get("s") === demoId("staff", barber.slug));
      await expect(cal(page).locator(".cal-head")).toHaveCount(7);
      await expect(column(page, barber.slug, day).locator(".cal-v", { hasText: who })).toHaveCount(1);
      // a week's strip at the bottom is the week before and after
      const weeks = cal(page).locator(".cal-strip.is-weeks");
      await expect(weeks.getByRole("button", { name: C.prev })).toBeVisible();
      await expect(weeks.getByRole("button", { name: C.next })).toBeVisible();
      await expectNoSideScroll(page);
      await phoneShot(page, "week");
      // back to the day, and cancelled
      await cal(page).locator(".cal-bar").getByRole("button", { name: C.day, exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get("v") === null);
      const again = column(page, barber.slug, day).locator(".cal-v", { hasText: who });
      await again.scrollIntoViewIfNeeded();
      await cancel(page, again);
      await expect(column(page, barber.slug, day).locator(".cal-v")).toHaveCount(0);
      await expectNoSideScroll(page);
    });

    test("a day nobody works says so on a phone too", async ({ page }) => {
      const day = dayWhere(45, (names) => names.length === 0);
      await open(page, day);
      await expect(cal(page).getByRole("heading", { level: 2, name: C.noSchedule })).toBeVisible();
      await expect(cal(page).getByRole("link", { name: C.setHours })).toHaveAttribute("href", `/admin/schedule?d=${day}`);
      await expect(cal(page).getByRole("button", { name: C.addStaff })).toBeVisible();
      // «Запись» is still there
      await expect(cal(page).locator(".cal-add")).toBeVisible();
      await expectNoSideScroll(page);
    });
  });
});
