import { cap, dateWords } from "../src/app/b/copy.shared";
import { asBarber, B, expect, expectNoSideScroll, hydrated, nextWorkday, sheet, smallTargets, tallinnDate, test } from "./helpers";

/**
 * B2: his day and his week. His day is one column of the salon's journal
 * (board MyDay-Grid): the dark bar with the day, a row with him and the day's
 * numbers, the grid, the week floating at the bottom.
 */
test.describe("his day", () => {
  test.use(asBarber);

  test("today: his one column of the journal; a tap on a visit opens the visit sheet, «Пришёл» marks it, «Ожидание» back; no «Готово»", async ({ page, barber }) => {
    await page.goto("/b");
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: B.day.today })).toBeVisible();
    // one column, his: his name over it, the day's visits and, on a working day, how full it is
    // (the demo gives today's visits even on his day off: then the line says «Выходной» instead)
    await expect(page.locator(".bx-cal .cal-col")).toHaveCount(1);
    await expect(page.locator(".bx-cal-sum b")).toHaveText(barber.name);
    await expect(page.locator(".bx-cal-sum p")).toHaveText(/^\d+ запис/);
    const sumLine = (await page.locator(".bx-cal-sum p").innerText()).trim();
    if (sumLine.endsWith(B.day.off)) await expect(page.locator(".bx-cal-load")).toHaveCount(0);
    else await expect(page.locator(".bx-cal-load small")).toHaveText(new RegExp(`^${B.day.busy(0).replace("0", "\\d+")}$`));
    // today is in the strip: no «Сегодня» in the bar
    await expect(page.locator(".bx-cal .cal-bar").getByRole("button", { name: B.day.today, exact: true })).toHaveCount(0);

    // a visit still waiting: the app's one visit sheet, its four chips
    const visit = page.locator(".bx-cal .cal-v.st-booked", { hasText: "Demo client" }).first();
    const times = (await visit.locator(".t span").first().innerText()).trim();
    const same = page.locator(".bx-cal .cal-v").filter({ has: page.locator(".t span", { hasText: times }) });
    await visit.click();
    const s = sheet(page);
    await expect(s.locator(".vs-time")).toHaveText(new RegExp(`^${times} · `));
    const chips = s.getByRole("group", { name: B.vs.status });
    await expect(chips.getByRole("button")).toHaveText([B.vs.chips.booked, B.vs.chips.arrived, B.vs.chips.no_show, B.vs.chips.confirmed]);
    await expect(s.getByRole("button", { name: "Готово" })).toHaveCount(0);
    const arrived = chips.getByRole("button", { name: B.vs.chips.arrived, exact: true });
    await arrived.click();
    await expect(arrived).toHaveAttribute("aria-pressed", "true");
    await expect(same).toHaveClass(/st-arrived/);
    // «Ожидание» takes it back
    const waiting = chips.getByRole("button", { name: B.vs.chips.booked, exact: true });
    await waiting.click();
    await expect(waiting).toHaveAttribute("aria-pressed", "true");
    await expect(same).toHaveClass(/st-booked/);
    await s.getByRole("button", { name: B.close }).click();
    await expect(s).toHaveCount(0);
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
  });

  test("another day: the strip, or the date in the bar for another week; the visits, the lunch break; «Сегодня» back", async ({ page, barber }) => {
    // his next working day: the second day of the demo visits
    const day = nextWorkday(barber.slug);
    await page.goto("/b");
    await hydrated(page);
    const strip = page.getByRole("navigation", { name: B.day.days });
    await expect(strip.getByRole("button")).toHaveCount(7);
    await expect(strip.getByRole("button", { pressed: true })).toHaveCount(1);
    // the strip's buttons carry the day's words; `day` may be in a later week (he may be away for a week)
    const button = strip.getByRole("button", { name: new RegExp(`^${cap(dateWords(day, "ru", { weekday: "long", day: "numeric", month: "long" }))}`) });
    if (await button.count()) await button.click();
    else await page.locator(".bx-cal .cal-bar").getByLabel(B.day.pickDate).fill(day);
    await expect(page).toHaveURL(new RegExp(`d=${day}`));
    await expect(page.locator(".bx-cal .cal-bar").getByLabel(B.day.pickDate)).toHaveValue(day);
    // the five demo visits of that day in his column, and the lunch break
    const visits = page.locator(".bx-cal .cal-v:visible", { hasText: "Demo client" });
    await expect(visits).toHaveCount(5);
    await expect(visits.first().locator(".t span").first()).toHaveText(/^\d\d:\d\d–\d\d:\d\d$/);
    await expect(visits.first().locator(".bx-cv-sum")).toContainText("€");
    await expect(page.locator(".bx-cal .cal-off", { hasText: B.day.kinds.block })).toBeVisible();
    await expect(page.locator(".bx-cal-sum p")).toContainText("€");
    // back to today: the bar's «Сегодня» when today is in another week, else the strip
    const toToday = page.locator(".bx-cal .cal-bar").getByRole("button", { name: B.day.today, exact: true });
    if (await toToday.count()) await toToday.click();
    else await strip.locator("button.is-today").click();
    await expect(page.getByRole("heading", { level: 1, name: B.day.today })).toBeVisible();
  });

  test("a swipe on the strip is the next week; the bar's «Сегодня» comes back", async ({ page }) => {
    await page.goto("/b");
    await hydrated(page);
    const strip = page.getByRole("navigation", { name: B.day.days });
    const b = (await strip.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.75, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.2, b.y + b.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForURL((u) => u.searchParams.get("d") === tallinnDate(7));
    await hydrated(page);
    const toToday = page.locator(".bx-cal .cal-bar").getByRole("button", { name: B.day.today, exact: true });
    await expect(toToday).toBeVisible();
    await toToday.click();
    await page.waitForURL((u) => u.pathname === "/b" && !u.searchParams.has("d"));
    await expect(page.getByRole("heading", { level: 1, name: B.day.today })).toBeVisible();
  });

  test("a visit's sheet: the time, the services, the total, the four chips", async ({ page, barber }) => {
    await page.goto(`/b?d=${nextWorkday(barber.slug)}`);
    await hydrated(page);
    await page.locator(".bx-cal .cal-v").first().click();
    const s = sheet(page);
    await expect(s.locator(".vs-time")).toHaveText(/^\d\d:\d\d–\d\d:\d\d · /);
    await expect(s.locator(".vs-total b")).toContainText("€");
    await expect(s.getByRole("group", { name: B.vs.status }).getByRole("button")).toHaveText([B.vs.chips.booked, B.vs.chips.arrived, B.vs.chips.no_show, B.vs.chips.confirmed]);
    await expect(s.getByRole("button", { name: B.book.move })).toBeVisible();
    await expect(s.getByRole("button", { name: B.client.card })).toBeVisible();
    expect(await smallTargets(page)).toEqual([]);
    await s.getByRole("button", { name: B.close }).click();
    await expect(s).toHaveCount(0);
  });

  test("the week: the day's own head, seven days with their visits, the weeks before and after", async ({ page }) => {
    await page.goto("/b");
    await hydrated(page);
    const segAt = async () => (await page.locator(".cal-bar:visible .bx-own-seg").boundingBox())!;
    const onDay = await segAt();
    await page.locator(".cal-bar:visible").getByRole("navigation", { name: B.own.view }).getByRole("link", { name: B.own.week }).click();
    await page.waitForURL((u) => u.pathname === "/b/week");
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // option А (Dim, 26.11): «День | Неделя» stays in the dark bar, in the same place as on the day
    const bar = page.locator(".cal-bar:visible");
    await expect(bar.getByRole("navigation", { name: B.own.view }).getByRole("link", { name: B.own.week })).toHaveAttribute("aria-current", "page");
    const onWeek = await segAt();
    expect([Math.round(onWeek.x), Math.round(onWeek.y), Math.round(onWeek.width)]).toEqual([Math.round(onDay.x), Math.round(onDay.y), Math.round(onDay.width)]);
    // the bar's title is the week; its ▾ picks a date; «Сегодня» only off this week
    await expect(bar.locator(".cal-title")).toContainText(/\d/);
    await expect(bar.getByLabel(B.day.pickDate)).toHaveCount(1);
    await expect(bar.getByRole("button", { name: B.day.today, exact: true })).toHaveCount(0);
    // his row: the week's visits and money, how full it is
    await expect(page.locator(".bx-wkv .bx-cal-sum p")).toContainText(new RegExp(`^${B.week.total}: \\d+ `));
    await expect(page.locator(".bx-wkv .bx-cal-load")).toBeVisible();
    // seven days, today marked; «Мой день» in the tabs stays lit
    await expect(page.locator(".bx-wk > li")).toHaveCount(7);
    await expect(page.locator(".bx-wk > li.is-today .bx-wk-now")).toHaveText(B.day.today);
    await expect(page.getByRole("navigation", { name: B.nav.label }).getByRole("link", { name: B.nav.day, exact: true })).toHaveAttribute("aria-current", "page");
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);

    // the weeks float at the bottom: the next one, then «Сегодня» brings this week back
    const weeks = page.getByRole("navigation", { name: B.week.weeks });
    await expect(weeks.locator("small")).toHaveText(B.week.thisWeek);
    await weeks.getByRole("link", { name: B.day.nextWeek }).click();
    await page.waitForURL((u) => u.pathname === "/b/week" && u.searchParams.has("d"));
    await hydrated(page);
    await expect(page.locator(".bx-wk > li.is-today")).toHaveCount(0);
    await expect(weeks.locator("small")).toHaveCount(0);
    await bar.getByRole("button", { name: B.day.today, exact: true }).click();
    await page.waitForURL((u) => u.pathname === "/b/week" && !u.search);
    await hydrated(page);
    await expect(page.locator(".bx-wk > li.is-today")).toHaveCount(1);

    // a day's card opens that day
    await page.locator(".bx-wk > li.is-today a").click();
    await page.waitForURL((u) => u.pathname === "/b" && !u.search);
    await expect(page.locator(".cal-bar:visible .bx-own-seg [aria-current='page']")).toHaveText(B.own.day);
  });

  test("the bottom bar takes him everywhere", async ({ page }) => {
    await page.goto("/b");
    await hydrated(page);
    // (the dark bar's «День | Неделя» has the same words: the tabs are the «Разделы» ones)
    const tabs = page.getByRole("navigation", { name: B.nav.label });
    // four tabs: the week is «День | Неделя» in the dark bar, not a tab (Dim, round 13)
    await expect(tabs.getByRole("link")).toHaveText([B.nav.day, B.nav.time, B.nav.sell, B.nav.more]);
    for (const [name, path] of [
      [B.nav.time, "/b/time"],
      [B.nav.sell, "/b/sell"],
      [B.nav.more, "/b/more"],
      [B.nav.day, "/b"],
    ] as const) {
      await tabs.getByRole("link", { name, exact: true }).click();
      await page.waitForURL((u) => u.pathname === path);
      await expectNoSideScroll(page);
    }
  });
});
