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
 *
 * «Новая запись» (new-visit.tsx) is the same drawer, as its board draws it:
 * a demo client is found by his number and picked, two services, «Подтвердил»,
 * created; the card has the tick. «Перерыв» blocks time from it.
 * Screenshot: e2e/.out/screens/pc-new-visit.png.
 */
const W = A.win;
const NV = A.newVisit;
const WHO = "Visit Window";
// the number without its code: the field beside «+372»
const NUMBER = "5555 0699";
// a demo client of the e2e data (tools/seed-demo.mjs, DEMO_VISITS), as e2e/clients.spec.ts finds him: «Demo client 1», +372 5555 0901
const FOUND = { name: "Demo client 1", number: "5555 0901", e164: "+37255550901" };

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

    // a walk-in at 12:00, from «Новая запись»
    await tapTime(page, col, 12 * 60);
    const form = page.getByRole("dialog", { name: A.visit.new });
    await form.getByLabel(NV.clientName, { exact: true }).fill(WHO);
    await form.getByLabel(NV.number, { exact: true }).fill(NUMBER);
    await form.getByRole("group", { name: A.visit.services, exact: true }).getByRole("button").first().click();
    await form.getByRole("button", { name: NV.create, exact: true }).click();
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

  test("«Новая запись»: the same three columns; a client found by his number, two services, «Подтвердил», created with its tick; «Перерыв» blocks time", async ({ page }) => {
    const day = workdayFrom("slava", tallinnDate(86));
    await page.goto(`/admin?d=${day}`);
    await hydrated(page);
    const col = cal(page).locator(`[data-col="${demoId("staff", "slava")}:${day}"]`);
    await expect(col).toBeVisible();
    await expect(col.locator(".cal-v")).toHaveCount(0);
    await expect(col.locator(".cal-off")).toHaveCount(0);

    /* ---- a free time opens the drawer: three columns and a foot, as the board ---- */
    await tapTime(page, col, 12 * 60);
    const win = page.getByRole("dialog", { name: A.visit.new });
    await expect(win).toBeVisible();
    await expect(win).toHaveAttribute("aria-modal", "true");
    const left = win.getByRole("region", { name: W.cols.visit });
    const mid = win.getByRole("region", { name: NV.services, exact: true });
    const right = win.getByRole("region", { name: W.cols.client });
    await expect.poll(() => box(win)).toMatchObject({ w: 1200, bg: "rgb(247, 249, 252)" });
    await expect.poll(() => box(left)).toMatchObject({ w: 228, bg: "rgb(238, 241, 246)", radius: "8px" });
    await expect.poll(() => box(mid)).toMatchObject({ w: 584, bg: "rgb(255, 255, 255)", radius: "8px" });
    await expect.poll(() => box(right)).toMatchObject({ w: 340, bg: "rgb(255, 255, 255)", radius: "8px" });
    await expect.poll(() => box(win.locator(".vw-foot"))).toMatchObject({ h: 64, bg: "rgb(255, 255, 255)" });
    await expect(win.locator(".vw-foot h2")).toHaveText(A.visit.new);
    expect(Math.round((await win.boundingBox())!.x + (await win.boundingBox())!.width)).toBe(1440);
    // the journal does not make room for it: it lies over the dimmed page
    await expect(cal(page)).not.toHaveClass(/has-panel/);

    // left: the barber tapped, the day, the start; the end and the length wait for a service
    const specialist = left.getByRole("combobox", { name: NV.specialist, exact: true });
    await expect(specialist).toHaveValue(demoId("staff", "slava"));
    await expect(specialist.locator("option:checked")).toHaveText("Slava");
    await expect(left.getByLabel(A.visit.date, { exact: true })).toHaveValue(day);
    await expect(left.getByLabel(NV.starts, { exact: true })).toHaveValue("12:00");
    await expect(left.getByLabel(NV.ends, { exact: true })).toHaveText("—");
    await expect(left.getByLabel(NV.length, { exact: true })).toHaveText("—");
    await expect(left.getByLabel(W.staffNote, { exact: true })).toBeVisible();
    await expect(left.locator(".vw-tiles .vw-tile")).toHaveText([W.tiles.fields, W.tiles.notify]);
    // centre: the four chips, «Ожидание» chosen; the cards three in a row, no «Последний визит»; no «Товары»
    const chips = mid.getByRole("group", { name: W.status }).getByRole("button");
    await expect(chips).toHaveText([W.chips.booked, W.chips.arrived, W.chips.no_show, W.chips.confirmed]);
    await expect(chips.nth(0)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => box(chips.nth(0))).toMatchObject({ h: 32, bg: "rgb(43, 49, 52)" });
    const cards = mid.getByRole("group", { name: A.visit.services, exact: true }).getByRole("button");
    await expect(cards.nth(2)).toBeVisible();
    const [c0, c2, c3] = [(await cards.nth(0).boundingBox())!, (await cards.nth(2).boundingBox())!, (await cards.nth(3).boundingBox())!];
    expect(Math.round(c0.y)).toBe(Math.round(c2.y));
    expect(c3.y).toBeGreaterThan(c0.y);
    // the board's 96px cards: no row for «Последний визит» in a new visit
    expect(await cards.nth(0).evaluate((e) => getComputedStyle(e).minHeight)).toBe("96px");
    await expect(mid.locator(".vw-tag")).toHaveCount(0);
    await expect(win.getByRole("button", { name: W.tabGoods, exact: true })).toHaveCount(0);
    await expect(mid.getByRole("combobox", { name: W.allServices })).toBeVisible();
    // right: the name with «Иван», «+372» and the number, the e-mail, the reminder on
    await expect(right.getByLabel(NV.clientName, { exact: true })).toHaveAttribute("placeholder", NV.namePlaceholder);
    await expect(right.getByLabel(NV.code, { exact: true })).toHaveValue("+372");
    await expect(right.getByLabel(NV.email, { exact: true })).toBeVisible();
    await expect(right.getByRole("switch", { name: A.visit.sms })).toBeChecked();
    // the foot: «Перерыв» for a login that blocks time; «Создать запись» waits for a service and a client
    const create = win.getByRole("button", { name: NV.create, exact: true });
    await expect(create).toBeDisabled();
    await expect(win.locator(".vw-sum")).toHaveText(A.visit.pickServices);
    await expectNoSideScroll(page);

    /* ---- «Перерыв» is the time-off form; «Запись» is the drawer again ---- */
    await win.getByRole("button", { name: NV.timeOff, exact: true }).click();
    const off = page.getByRole("dialog", { name: A.block.save });
    await expect(off).toBeVisible();
    await expect(off.getByLabel(A.block.from, { exact: true })).toHaveValue("12:00");
    await off.getByRole("button", { name: A.visit.tabVisit, exact: true }).click();
    await expect(off).toHaveCount(0);
    await expect(win.getByRole("region", { name: W.cols.client })).toBeVisible();

    /* ---- a client from the search: his number, the list under the field, picked ---- */
    await right.getByLabel(NV.number, { exact: true }).fill(FOUND.number);
    const found = right.getByRole("list", { name: NV.found });
    const hit = found.getByRole("button", { name: new RegExp(`^${FOUND.name}\\b`) });
    await expect(hit).toBeVisible();
    await expect(hit).toContainText(FOUND.e164);
    await expect(hit.locator(".vw-ini")).toHaveText("DC");
    // the list is under the number, above the e-mail
    expect((await found.boundingBox())!.y).toBeGreaterThan((await right.getByLabel(NV.number, { exact: true }).boundingBox())!.y);
    expect((await found.boundingBox())!.y).toBeLessThan((await right.getByLabel(NV.email, { exact: true }).boundingBox())!.y);
    await hit.click();
    await expect(found).toHaveCount(0);
    await expect(right.locator(".vw-who b")).toHaveText(FOUND.name);
    await expect(right.locator(".vw-who .vw-ini")).toHaveText("DC");
    await expect(right.locator(".vw-who small")).toHaveText(FOUND.e164);
    await expect(right.getByRole("button", { name: NV.pickOther, exact: true })).toBeVisible();
    // a picked client has his own card: no e-mail to type
    await expect(right.getByLabel(NV.email, { exact: true })).toHaveCount(0);
    await expect(create).toBeDisabled();

    /* ---- two services: the yellow line on their cards, the lines with ×, «Итого», the end and the length ---- */
    const first = (await cards.nth(0).locator(".n").innerText()).trim();
    const second = (await cards.nth(1).locator(".n").innerText()).trim();
    await cards.nth(0).click();
    await cards.nth(1).click();
    await expect(cards.nth(0)).toHaveAttribute("aria-pressed", "true");
    await expect(cards.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(cards.nth(2)).toHaveAttribute("aria-pressed", "false");
    expect(await cards.nth(0).evaluate((e) => `${getComputedStyle(e).borderColor} ${getComputedStyle(e).boxShadow}`)).toBe("rgb(255, 203, 0) rgb(255, 203, 0) 0px 0px 0px 1px inset");
    const lines = mid.locator(".vw-lines > li");
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toContainText(first);
    await expect(lines.nth(1)).toContainText(second);
    await expect(lines.nth(0).getByRole("button", { name: `${W.removeService}: ${first}` })).toBeVisible();
    await expect(mid.locator(".vw-pay")).toContainText(A.visit.total);
    await expect(left.getByLabel(NV.ends, { exact: true })).toHaveText(/^1[2-9]:\d\d$/);
    await expect(left.getByLabel(NV.length, { exact: true })).not.toHaveText("—");
    await expect(win.locator(".vw-sum b")).toHaveText(/^€ \d/);
    await expect(create).toBeEnabled();

    // «Подтвердил»: chosen here, written once the visit is there
    await chips.nth(3).click();
    await expect(chips.nth(3)).toHaveAttribute("aria-pressed", "true");
    await expect(chips.nth(0)).toHaveAttribute("aria-pressed", "false");

    // «Уведомления о визите» slides over the left column: the reminder and what it sends; «Скрыть» gives it back
    await left.getByRole("button", { name: W.tiles.notify }).click();
    const notify = left.getByRole("region", { name: W.tiles.notify });
    await expect(notify.getByRole("switch", { name: A.visit.sms })).toBeChecked();
    await expect(notify).toContainText(NV.smsWill);
    await notify.getByRole("button", { name: W.hide }).click();
    await expect(notify).toHaveCount(0);

    await page.mouse.move(0, 0);
    await expectNoSideScroll(page);
    const body = await page.screenshot({ path: path.join(OUT, "screens", "pc-new-visit.png") });
    await test.info().attach("pc-new-visit", { body, contentType: "image/png" });
    // narrower, as the visit window: the client goes under the services; never a sideways scroll
    await page.setViewportSize({ width: 960, height: 800 });
    await expect(right).toBeVisible();
    await expectNoSideScroll(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    /* ---- «Создать запись»: the window closes, the visit is on the grid with the confirmed tick ---- */
    await create.click();
    // two services may run past his hours: the question is in the foot
    const anyway = win.getByRole("button", { name: A.visit.anyway });
    await expect(calToast(page).filter({ hasText: A.cal.booked }).or(anyway)).toBeVisible();
    if (await anyway.isVisible()) await anyway.click();
    await expect(calToast(page)).toContainText(`${A.cal.booked}: 12:00`);
    await expect(win).toHaveCount(0);
    const card = col.getByRole("button", { name: new RegExp(`, ${FOUND.name}, `) });
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAccessibleName(new RegExp(`^12:00–\\d\\d:\\d\\d, ${FOUND.name}, `));
    await expect(card.locator("svg.mk-ok")).toHaveCount(1);
    await expect(card.locator(".s")).toHaveText(`${first}, ${second}`);

    // its window: the two lines, «Подтвердил»; then cancelled again
    await card.click();
    const visit = page.getByRole("dialog", { name: FOUND.name, exact: true });
    await expect(visit.getByRole("region", { name: W.cols.services }).locator(".vw-lines > li")).toHaveCount(2);
    await expect(visit.getByRole("group", { name: W.status }).getByRole("button", { name: W.chips.confirmed })).toHaveAttribute("aria-pressed", "true");
    await visit.getByRole("button", { name: A.visit.cancelVisit }).click();
    await visit.getByRole("button", { name: A.visit.cancelYes }).click();
    await expect(calToast(page)).toHaveText(A.cal.cancelled);
    await expect(card).toHaveCount(0);

    /* ---- «Перерыв» from the drawer blocks an hour; the block is taken away again ---- */
    await tapTime(page, col, 16 * 60);
    await page.getByRole("dialog", { name: A.visit.new }).getByRole("button", { name: NV.timeOff, exact: true }).click();
    const block = page.getByRole("dialog", { name: A.block.save });
    await expect(block.getByLabel(A.block.from, { exact: true })).toHaveValue("16:00");
    await expect(block.getByLabel(A.block.to, { exact: true })).toHaveValue("17:00");
    await block.getByRole("button", { name: A.block.save, exact: true }).click();
    await expect(calToast(page)).toHaveText(A.cal.blocked);
    const blocked = col.locator(".cal-off");
    await expect(blocked).toHaveCount(1);
    await blocked.click();
    await page.getByRole("dialog").getByRole("button", { name: A.block.remove }).click();
    await expect(calToast(page)).toHaveText(A.cal.unblocked);
    await expect(col.locator(".cal-off")).toHaveCount(0);
  });
});
