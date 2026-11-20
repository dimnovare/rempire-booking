import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { OUT } from "./env";
import { A, asOwner, demoId, expect, expectNoSideScroll, hydrated, tallinnDate, test, workdayFrom } from "./helpers";

/**
 * The visit window from 900px (visit-window.tsx; docs/reference-looks.md,
 * «The visit window: built»), as the design board «Окно визита» draws it:
 * a drawer from the right over the dimmed journal, three columns and a
 * white foot. A walk-in of this file's own («Visit Window», a fake phone)
 * is booked with Slava far ahead, on a day no other test books on, marked
 * «Подтвердил», given a second service, and cancelled again.
 * Screenshot: e2e/.out/screens/pc-visit.png.
 */
const W = A.win;
const WHO = "Visit Window";
const PHONE = "+372 5555 0699";

const cal = (page: Page) => page.locator(".cal:visible");
const calToast = (page: Page) => cal(page).locator(".adm-toast");
const frameToast = (page: Page) => page.locator(".adm-frame-toast");
const box = (el: Locator) => el.evaluate((e) => ({ w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height), bg: getComputedStyle(e).backgroundColor, radius: getComputedStyle(e).borderRadius }));

/** Tap a free time of a column: the pixels come from the column's own height, whatever the scale. */
async function tapTime(page: Page, col: Locator, minute: number) {
  const grid = cal(page).locator(".cal-grid");
  const [from, to] = await grid.evaluate((el) => [Number((el as HTMLElement).dataset.from), Number((el as HTMLElement).dataset.to)]);
  const b = (await col.boundingBox())!;
  await col.click({ position: { x: Math.min(40, b.width / 2), y: ((minute - from) * b.height) / (to - from) + 3 } });
}

test.describe("the visit window on a wide screen", () => {
  test.use(asOwner);
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "android", "one wide run is enough");
  });

  test("three columns as the board; «Подтвердил» writes at once; a service added is saved; the bin cancels", async ({ page }) => {
    const day = workdayFrom("slava", tallinnDate(74));
    await page.goto(`/admin?d=${day}`);
    await hydrated(page);
    const col = cal(page).locator(`[data-col="${demoId("staff", "slava")}:${day}"]`);
    await expect(col).toBeVisible();

    // a walk-in at 12:00
    await tapTime(page, col, 12 * 60);
    const form = page.getByRole("dialog", { name: A.visit.new });
    await form.getByLabel(A.visit.name, { exact: true }).fill(WHO);
    await form.getByLabel(A.visit.phone, { exact: true }).fill(PHONE);
    await form.getByRole("group", { name: A.visit.services, exact: true }).getByRole("button").first().click();
    await form.getByRole("button", { name: A.visit.book, exact: true }).click();
    await expect(calToast(page)).toContainText(A.cal.booked);
    const card = col.locator(".cal-v", { hasText: WHO });
    await expect(card).toHaveCount(1);

    /* ---- it opens: a drawer from the right, three columns, a foot ---- */
    await card.click();
    const win = page.getByRole("dialog", { name: WHO });
    await expect(win).toBeVisible();
    await expect(win).toHaveAttribute("aria-modal", "true");
    const left = win.getByRole("region", { name: W.cols.visit });
    const mid = win.getByRole("region", { name: W.cols.services });
    const right = win.getByRole("region", { name: W.cols.client });
    await expect(left).toBeVisible();
    await expect(mid).toBeVisible();
    await expect(right).toBeVisible();
    // the board's sizes and colours: 1200px on the pale ground; 228 grey, 584 and 340 white, 8px corners; a 64px foot
    await expect.poll(() => box(win)).toMatchObject({ w: 1200, bg: "rgb(247, 249, 252)" });
    await expect.poll(() => box(left)).toMatchObject({ w: 228, bg: "rgb(238, 241, 246)", radius: "8px" });
    await expect.poll(() => box(mid)).toMatchObject({ w: 584, bg: "rgb(255, 255, 255)", radius: "8px" });
    await expect.poll(() => box(right)).toMatchObject({ w: 340, bg: "rgb(255, 255, 255)", radius: "8px" });
    await expect.poll(() => box(win.locator(".vw-foot"))).toMatchObject({ h: 64, bg: "rgb(255, 255, 255)" });
    await expect(win.locator(".vw-foot h2")).toHaveText(W.title);
    // the drawer is on the right, the dimmed journal on its left
    const drawer = (await win.boundingBox())!;
    expect(Math.round(drawer.x + drawer.width)).toBe(1440);

    // left: the barber, the day and time, «Изменить», the staff note, three tiles
    await expect(left.locator(".vw-who b")).toHaveText("Slava");
    await expect(left.locator(".vw-when small")).toHaveText(/^12:00–\d\d:\d\d · /);
    await expect(left.getByRole("button", { name: W.edit, exact: true })).toBeVisible();
    await expect(left.getByLabel(W.staffNote).first()).toBeVisible();
    await expect(left.locator(".vw-tiles .vw-tile")).toHaveText([W.tiles.fields, W.tiles.notify, W.tiles.log]);
    await expect(left.getByRole("button", { name: A.visit.cancelVisit })).toBeVisible();
    // centre: the four chips, «Ожидание» pressed; the line; «К оплате»; the tabs; the service cards three in a row
    const chips = mid.getByRole("group", { name: W.status }).getByRole("button");
    await expect(chips).toHaveText([W.chips.booked, W.chips.arrived, W.chips.no_show, W.chips.confirmed]);
    await expect(chips.nth(0)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => box(chips.nth(0))).toMatchObject({ h: 32, bg: "rgb(43, 49, 52)" });
    await expect.poll(() => box(chips.nth(1))).toMatchObject({ h: 32, bg: "rgb(234, 238, 244)" });
    await expect(mid.locator(".vw-lines > li")).toHaveCount(1);
    await expect(mid.locator(".vw-pay")).toContainText(W.toPay);
    await expect(mid.getByRole("group", { name: W.tabs }).getByRole("button")).toHaveText([W.tabServices, W.tabGoods]);
    const cards = mid.getByRole("group", { name: A.visit.services, exact: true }).getByRole("button");
    await expect(cards.nth(2)).toBeVisible();
    const [c0, c2] = [(await cards.nth(0).boundingBox())!, (await cards.nth(2).boundingBox())!];
    expect(Math.round(c0.y)).toBe(Math.round(c2.y));
    // no payment yet: it waits for the finance answer
    await expect(win.getByText("Оплатить", { exact: true })).toHaveCount(0);
    // right: the initials, the phone, «Написать:», the card's tiles, the visit's data
    await expect(right.locator(".vw-ini")).toHaveText("VW");
    await expect(right.locator(".vw-who small")).toHaveText(/^\+372/);
    await expect(right.getByRole("link", { name: W.whatsapp })).toHaveAttribute("href", /^https:\/\/wa\.me\/3725555\d+$/);
    await expect(right.getByRole("link", { name: W.telegram })).toHaveAttribute("href", /^https:\/\/t\.me\/\+3725555\d+$/);
    await expect(right.getByRole("link", { name: W.profile })).toHaveAttribute("href", /^\/admin\/clients\/[0-9a-f-]{36}$/);
    await expect(right.getByRole("link", { name: W.history })).toHaveAttribute("href", /\?tab=history$/);
    await expect(right.getByRole("heading", { name: W.stats })).toBeVisible();
    await expect(right.getByRole("heading", { name: W.data })).toBeVisible();
    await expect(right.locator(".vw-grid").last().locator("dd")).toHaveText([/^\d\d\.\d\d \d\d:\d\d$/, A.records.sources.admin, /\S/]);
    // a first visit: no «Не посещал»
    await expect(right.locator(":scope > .vw-tag")).toHaveCount(0);
    // «Сохранить изменения» waits for a change
    const save = win.getByRole("button", { name: A.visit.saveChanges });
    await expect(save).toBeDisabled();
    await expectNoSideScroll(page);

    /* ---- «Подтвердил»: written at once, the window stays; the card has the tick ---- */
    await chips.nth(3).click();
    await expect(frameToast(page)).toHaveText(W.chips.confirmed);
    await expect(chips.nth(3)).toHaveAttribute("aria-pressed", "true");
    await expect(chips.nth(0)).toHaveAttribute("aria-pressed", "false");
    await expect(card.locator("svg.mk-ok")).toHaveCount(1);
    await expect(save).toBeDisabled();

    // «История изменений» slides over the left column, the newest first; «Скрыть» gives it back
    await left.getByRole("button", { name: W.tiles.log }).click();
    const log = left.getByRole("region", { name: W.tiles.log });
    await expect(log.locator(".vw-list li").first()).toContainText(`${W.log.status}: ${W.chips.confirmed}`);
    await expect(log.locator(".vw-list li").last()).toContainText(W.log.create);
    await log.getByRole("button", { name: W.hide }).click();
    await expect(log).toHaveCount(0);

    /* ---- a second service: the window is changed, «Сохранить изменения» saves it ---- */
    const pick = mid.getByRole("group", { name: A.visit.services, exact: true }).getByRole("button", { pressed: false }).first();
    const name = (await pick.locator(".n").innerText()).trim();
    await pick.click();
    await expect(mid.locator(".vw-lines > li")).toHaveCount(2);
    await expect(mid.locator(".vw-lines")).toContainText(name);
    await expect(save).toBeEnabled();
    await page.mouse.move(0, 0);
    // the lines that said «Записано» and «Подтвердил» go after their time: the foot as the board has it
    await expect(calToast(page)).toHaveCount(0, { timeout: 8000 });
    await expect(frameToast(page)).toHaveCount(0, { timeout: 8000 });
    const body = await page.screenshot({ path: path.join(OUT, "screens", "pc-visit.png") });
    await test.info().attach("pc-visit", { body, contentType: "image/png" });

    // narrower: the centre gives way, then the client goes under it; never a sideways scroll
    await page.setViewportSize({ width: 1100, height: 800 });
    await expect.poll(async () => (await box(right)).w).toBe(340);
    expect((await box(mid)).w).toBeGreaterThanOrEqual(360);
    await expectNoSideScroll(page);
    await page.setViewportSize({ width: 960, height: 800 });
    await expectNoSideScroll(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    await save.click();
    // a longer visit that would end after his hours asks first, in the foot
    const anyway = win.getByRole("button", { name: A.visit.anywayMove });
    await expect(calToast(page).filter({ hasText: A.saved }).or(anyway)).toBeVisible();
    if (await anyway.isVisible()) await anyway.click();
    await expect(calToast(page)).toHaveText(A.saved);
    await expect(win).toHaveCount(0);

    // open again: two lines, still confirmed (a change of services keeps it)
    await card.click();
    await expect(win.getByRole("region", { name: W.cols.services }).locator(".vw-lines > li")).toHaveCount(2);
    await expect(win.getByRole("group", { name: W.status }).getByRole("button", { name: W.chips.confirmed })).toHaveAttribute("aria-pressed", "true");
    // the seam's «›» closes it without asking, and so does Escape
    await win.getByRole("button", { name: W.close }).click();
    await expect(win).toHaveCount(0);
    await card.click();
    await page.keyboard.press("Escape");
    await expect(win).toHaveCount(0);

    /* ---- the bin asks once, then cancels ---- */
    await card.click();
    await win.getByRole("button", { name: A.visit.cancelVisit }).click();
    await win.getByRole("button", { name: A.visit.cancelYes }).click();
    await expect(calToast(page)).toHaveText(A.cal.cancelled);
    await expect(col.locator(".cal-v", { hasText: WHO })).toHaveCount(0);
  });
});
