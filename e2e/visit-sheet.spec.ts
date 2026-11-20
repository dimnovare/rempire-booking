import path from "node:path";
import type { Page } from "@playwright/test";
import { OUT } from "./env";
import { A, asBarber, B, demoId, expect, expectNoSideScroll, hydrated, phoneOf, setRight, smallTargets, tallinnDate, test, toast, workdayFrom } from "./helpers";

/**
 * One visit sheet for Renat's phone and the barber app (decision round 11,
 * boards Visit-Sheet and Visit-Sheet-Add): four chips that write at a tap,
 * no «Готово», «+ Добавить услугу» for whoever may change the services,
 * cash and card greyed until Renat answers about payment.
 *
 * Each phone books its own walk-in far ahead, on a day no other test goes
 * to, and cancels it again; the barber's right to change services is
 * switched on for the test and off again.
 */
const shot = async (page: Page, name: string) => {
  const file = `${test.info().project.name}-vs-${name}.png`;
  const body = await page.screenshot({ path: path.join(OUT, "screens", file) });
  await test.info().attach(file, { body, contentType: "image/png" });
};

const day = (slug: string, project: string) => workdayFrom(slug, tallinnDate(project === "iphone" ? 36 : 32));

/** A walk-in from his «Новая запись»: the first service, the first free time. */
async function book(page: Page, date: string, who: string) {
  await page.goto(`/b?d=${date}`);
  await hydrated(page);
  await page.getByRole("button", { name: B.book.new }).click();
  const s = page.getByRole("dialog", { name: B.book.new });
  await s.getByRole("group", { name: B.book.services }).getByRole("button").first().click();
  await s.getByRole("group", { name: B.book.time }).getByRole("button").first().click();
  await s.getByLabel(B.book.name, { exact: true }).fill(who);
  await s.getByRole("button", { name: B.book.book, exact: true }).click();
  await expect(toast(page)).toContainText(B.book.booked("").trim());
  await expect(page.locator(".bx-v", { hasText: who })).toBeVisible();
}

async function openIn(page: Page, who: string) {
  await page.locator(".bx-v", { hasText: who }).getByRole("button").click();
  const s = page.getByRole("dialog", { name: who, exact: true });
  await expect(s).toBeVisible();
  return s;
}

test.describe("the visit sheet", () => {
  test.use(asBarber);

  test("the barber's: chips write at a tap, no «Готово», payment greyed, «+» only with the right", async ({ page, browser, barber }, info) => {
    const date = day(barber.slug, info.project.name);
    const who = `Sheet ${info.project.name} ${barber.name}`;
    await book(page, date, who);

    let s = await openIn(page, who);
    const chips = s.getByRole("group", { name: B.vs.status });
    await expect(chips.getByRole("button")).toHaveText([B.vs.chips.booked, B.vs.chips.arrived, B.vs.chips.no_show, B.vs.chips.confirmed]);
    await expect(chips.getByRole("button", { name: B.vs.chips.booked })).toHaveAttribute("aria-pressed", "true");
    await expect(s.getByRole("button", { name: "Готово" })).toHaveCount(0);
    // cash and card wait for Renat's answer
    await expect(s.getByRole("button", { name: B.vs.cash })).toBeDisabled();
    await expect(s.getByRole("button", { name: B.vs.payCard })).toBeDisabled();
    await expect(s.getByText(B.vs.payLater)).toBeVisible();
    // a barber starts without «Изменять состав услуг»
    await expect(s.getByRole("button", { name: B.vs.add })).toHaveCount(0);
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);

    // «Подтвердил»: written at once, still there after a reload
    await chips.getByRole("button", { name: B.vs.chips.confirmed }).click();
    await expect(toast(page)).toHaveText(B.vs.chips.confirmed);
    await expect(chips.getByRole("button", { name: B.vs.chips.confirmed })).toHaveAttribute("aria-pressed", "true");
    await shot(page, "barber");

    const owner = await phoneOf(browser, info, "owner");
    try {
      await setRight(owner, barber.email, "visit.edit.services", true);
      await page.reload();
      await hydrated(page);
      s = await openIn(page, who);
      await expect(s.getByRole("group", { name: B.vs.status }).getByRole("button", { name: B.vs.chips.confirmed })).toHaveAttribute("aria-pressed", "true");

      // «+ Добавить услугу»: his own services, the one in the visit marked
      const total = (await s.locator(".vs-total b").innerText()).trim();
      await s.getByRole("button", { name: B.vs.add }).click();
      const add = page.getByRole("dialog", { name: B.vs.addTitle });
      await expect(add.locator(".vs-offer.is-there")).toHaveCount(1);
      await expect(add.locator(".vs-offer.is-there")).toBeDisabled();
      await expect(add.locator(".vs-add-go")).toBeDisabled();
      await add.locator(".vs-offer:not([disabled])").first().click();
      await expect(add.locator(".vs-add-row small")).toContainText("+");
      await shot(page, "add");
      await add.locator(".vs-add-go").click();
      await expect(toast(page)).toHaveText(B.vs.added);
      await expect(add).toHaveCount(0);
      await expect(s.locator(".vs-line")).toHaveCount(2);
      await expect(s.locator(".vs-total b")).not.toHaveText(total);

      // and taken out again
      await s.locator(".vs-line-main").last().click();
      await s.getByRole("button", { name: B.vs.remove }).click();
      await expect(toast(page)).toHaveText(B.vs.removed);
      await expect(s.locator(".vs-line")).toHaveCount(1);
      await expect(s.locator(".vs-total b")).toHaveText(total);
    } finally {
      await setRight(owner, barber.email, "visit.edit.services", false);
      await owner.context().close();
    }

    // «Пришёл», then back to «Ожидание», and cancelled
    s = page.getByRole("dialog", { name: who, exact: true });
    const pressed = (name: string) => s.getByRole("group", { name: B.vs.status }).getByRole("button", { name, exact: true });
    await pressed(B.vs.chips.arrived).click();
    await expect(pressed(B.vs.chips.arrived)).toHaveAttribute("aria-pressed", "true");
    await expect(pressed(B.vs.chips.confirmed)).toHaveAttribute("aria-pressed", "false");
    await pressed(B.vs.chips.booked).click();
    await expect(pressed(B.vs.chips.booked)).toHaveAttribute("aria-pressed", "true");
    await s.getByRole("button", { name: B.book.cancel }).click();
    const c = page.getByRole("dialog", { name: B.book.cancelTitle });
    await c.getByRole("group", { name: B.book.reason }).getByRole("button", { name: B.book.reasons[0] }).click();
    await c.getByRole("button", { name: B.book.cancelGo }).click();
    await expect(toast(page)).toContainText(B.book.cancelled);
    await expect(page.locator(".bx-v", { hasText: who })).toHaveCount(0);
  });

  test("Renat's phone: the same sheet, a chip and «+» write at once, the barber sees them", async ({ page, browser, barber }, info) => {
    const date = day(barber.slug, info.project.name);
    const who = `Sheet admin ${info.project.name} ${barber.name}`;
    await book(page, date, who);

    const owner = await phoneOf(browser, info, "owner");
    try {
      await owner.goto(`/admin?d=${date}&s=${demoId("staff", barber.slug)}`);
      await hydrated(owner);
      await owner.locator(".cal:visible").getByRole("button", { name: new RegExp(who) }).first().click();
      const s = owner.getByRole("dialog", { name: who, exact: true });
      await expect(s.locator(".vs-staff")).toContainText(barber.name);
      const chip = (name: string) => s.getByRole("group", { name: A.vs.status }).getByRole("button", { name, exact: true });
      await expect(s.getByRole("group", { name: A.vs.status }).getByRole("button")).toHaveText([A.vs.chips.booked, A.vs.chips.arrived, A.vs.chips.no_show, A.vs.chips.confirmed]);
      await expect(s.getByRole("button", { name: "Готово" })).toHaveCount(0);
      await expect(s.getByRole("button", { name: A.vs.cash })).toBeDisabled();
      await expect(s.getByRole("button", { name: A.vs.payCard })).toBeDisabled();
      await expectNoSideScroll(owner);
      expect(await smallTargets(owner)).toEqual([]);
      await shot(owner, "admin");

      // «Пришёл» at a tap
      await chip(A.vs.chips.arrived).click();
      await expect(owner.locator(".adm-frame-toast")).toHaveText(A.vs.chips.arrived);
      await expect(chip(A.vs.chips.arrived)).toHaveAttribute("aria-pressed", "true");

      // «+ Добавить услугу» from the barber's services
      await s.getByRole("button", { name: A.vs.add }).click();
      const add = owner.getByRole("dialog", { name: A.vs.addTitle });
      await expect(add.locator(".vs-offer.is-there")).toHaveCount(1);
      await add.locator(".vs-offer:not([disabled])").first().click();
      await add.locator(".vs-add-go").click();
      await expect(owner.locator(".adm-frame-toast")).toHaveText(A.vs.added);
      await expect(s.locator(".vs-line")).toHaveCount(2);

      // the barber's phone shows both
      await page.reload();
      await hydrated(page);
      const mine = await openIn(page, who);
      await expect(mine.getByRole("group", { name: B.vs.status }).getByRole("button", { name: B.vs.chips.arrived, exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(mine.locator(".vs-line")).toHaveCount(2);
      await mine.getByRole("button", { name: B.vs.close }).click();

      // back to «Ожидание», and cancelled from Renat's sheet
      await chip(A.vs.chips.booked).click();
      await expect(chip(A.vs.chips.booked)).toHaveAttribute("aria-pressed", "true");
      await s.getByRole("button", { name: A.vs.cancelVisit }).click();
      await s.getByRole("button", { name: A.vs.cancelYes }).click();
      await expect(s).toHaveCount(0);
      await expect(owner.locator(".cal:visible").getByRole("button", { name: new RegExp(who) })).toHaveCount(0);
    } finally {
      await owner.context().close();
    }
  });
});
