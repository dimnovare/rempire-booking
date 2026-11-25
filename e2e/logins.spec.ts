import path from "node:path";
import type { Page } from "@playwright/test";
import { PRESETS } from "../src/lib/auth/rights-catalogue";
import { OUT } from "./env";
import { A, asOwner, expect, expectNoSideScroll, hydrated, loginByCode, test, toast } from "./helpers";

/**
 * «Доступ» → «Входы» → «⋯» → «Удалить вход» (Dim, 25.11.2026, design artifact
 * 53PfD3DxCRkbDyjwLVvBHB). The question says who and what stays; the toast
 * has «Вернуть»; the e-mail is free for a new login at once. A login that is
 * still on is offered «Отключите вход» instead. Nobody deletes his own.
 *
 * Every test adds a front-desk login of its own, with this phone's name in
 * its address so the two phones do not meet.
 */
const T = A.account;
const R = A.rights;
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, "screens", `${name}.png`) });
const roleLink = (page: Page, email: string) => page.getByRole("link", { name: `${R.open}: ${email}` });

async function addLogin(page: Page, email: string, preset: keyof typeof PRESETS = "AD"): Promise<void> {
  await page.goto("/admin/account");
  await hydrated(page);
  if (await roleLink(page, email).count()) return;
  await page.getByRole("button", { name: T.addUser }).click();
  const dw = page.getByRole("dialog", { name: T.newLogin });
  await dw.locator('input[type="email"]').fill(email);
  // by its code: «Менеджер» is also the start of «Менеджер системы»
  await dw.locator(`input[name="preset"][value="${preset}"]`).check();
  await dw.getByRole("button", { name: T.addUser }).click();
  await expect(dw).toHaveCount(0);
  await expect(roleLink(page, email)).toBeVisible();
}

test.use(asOwner);

test.describe("«Удалить вход» on a phone", () => {
  test("«⋯» opens the row's sheet; the question names the login; deleted, «Вернуть» brings it back; deleted again, its e-mail is free", async ({ page }, info) => {
    const email = `del-${info.project.name}@example.test`;
    const name = email.split("@")[0];
    await addLogin(page, email);
    // «Вход добавлен» gone first: it sits over a sheet's lower rows
    await expect(toast(page)).toHaveCount(0);

    // the card's «⋯»: a sheet with the row's actions, «Удалить вход» last, in red
    await page.getByRole("button", { name: T.actsOf(email) }).click();
    const acts = page.getByRole("dialog", { name });
    const menu = acts.getByRole("menu", { name: T.actsOf(email) });
    await expect(menu.getByRole("menuitem")).toHaveText([R.title, T.offYes, T.delYes]);
    const del = menu.getByRole("menuitem", { name: T.delYes });
    await expect(del).toHaveCSS("color", "rgb(217, 45, 32)");
    expect(Math.round((await del.boundingBox())!.height)).toBeGreaterThanOrEqual(48);
    await expectNoSideScroll(page);
    await shot(page, "logins-phone-sheet");
    await del.click();
    await expect(acts).toHaveCount(0);

    // the question: who, what goes, what stays, and the softer way for a login still on
    const ask = page.getByRole("alertdialog", { name: T.delAsk });
    await expect(ask).toContainText(email);
    await expect(ask).toContainText(PRESETS.AD.ru);
    await expect(ask).toContainText(T.delText);
    await expect(ask).toContainText(T.delKeeps);
    await expect(ask.getByRole("button", { name: T.delSoft[1] })).toBeVisible();
    await expect(ask.getByRole("button", { name: A.cancel })).toBeFocused();
    await expectNoSideScroll(page);
    await shot(page, "logins-phone-delete");
    await ask.getByRole("button", { name: T.delYes }).click();
    await expect(ask).toHaveCount(0);

    // gone from the list; the toast has «Вернуть»
    await expect(toast(page)).toContainText(T.deleted(email));
    await expect(roleLink(page, email)).toHaveCount(0);
    // a sheet opened meanwhile: the toast goes to the top, off the sheet's rows
    await page.locator(".ac-row", { has: page.locator(".ac-tag.is-you") }).getByRole("button", { name: /^Действия: / }).click();
    const own = page.getByRole("dialog");
    await expect(own).toBeVisible();
    const tb = (await toast(page).boundingBox())!;
    expect(tb.y + tb.height).toBeLessThanOrEqual((await own.boundingBox())!.y);
    await page.keyboard.press("Escape");
    await expect(own).toHaveCount(0);
    await toast(page).getByRole("button", { name: T.undo }).click();
    await expect(toast(page)).toHaveText(T.restored(email));
    await expect(roleLink(page, email)).toBeVisible();

    // deleted again: now for good, and the same e-mail can be added anew at once
    await page.getByRole("button", { name: T.actsOf(email) }).click();
    await page.getByRole("dialog", { name }).getByRole("menuitem", { name: T.delYes }).click();
    await page.getByRole("alertdialog", { name: T.delAsk }).getByRole("button", { name: T.delYes }).click();
    await expect(roleLink(page, email)).toHaveCount(0);
    await addLogin(page, email);
    await expect(roleLink(page, email)).toHaveCount(1);
  });

  test("his own row: «Удалить вход» is there but greyed, with the reason", async ({ page }) => {
    await page.goto("/admin/account");
    await hydrated(page);
    const mine = page.locator(".ac-row", { has: page.locator(".ac-tag.is-you") });
    await mine.getByRole("button", { name: /^Действия: / }).click();
    const menu = page.getByRole("dialog").getByRole("menu");
    const del = menu.getByRole("menuitem", { name: T.delYes });
    await expect(del).toBeDisabled();
    await expect(del).toHaveAccessibleDescription(T.ownNoDel);
    // nor switched off
    await expect(menu.getByRole("menuitem", { name: T.offYes })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("a manager, not an owner", () => {
  test("may switch off and delete other logins, but an owner's only greyed, with the reason", async ({ page, browser }, info) => {
    const email = `mgr-${info.project.name}@example.test`;
    await addLogin(page, email, "MG");
    // the manager on a phone of his own («Менеджер» has «Удалять пользователей»)
    const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId } = info.project.use;
    const ctx = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, baseURL: info.project.use.baseURL });
    const mgr = await ctx.newPage();
    try {
      await loginByCode(mgr, email);
      await mgr.goto("/admin/account");
      await hydrated(mgr);
      const owner = mgr.locator(".ac-row", { hasText: "owner@example.test" });
      await expect(owner.getByRole("switch")).toBeDisabled();
      await expect(owner.getByRole("switch")).toHaveAttribute("title", T.ownerOnly);
      await owner.getByRole("button", { name: T.actsOf("owner@example.test") }).click();
      const menu = mgr.getByRole("dialog").getByRole("menu");
      await expect(menu.getByRole("menuitem", { name: T.offYes })).toHaveCount(0);
      const del = menu.getByRole("menuitem", { name: T.delYes });
      await expect(del).toBeDisabled();
      await expect(del).toHaveAccessibleDescription(T.ownerOnly);
      await mgr.keyboard.press("Escape");
      // a barber's login: his to switch
      await expect(mgr.locator(".ac-row", { hasText: "valentin@example.test" }).getByRole("switch")).toBeEnabled();
    } finally {
      await ctx.close();
    }
  });
});

test.describe("«Удалить вход» on a wide screen", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("the row's menu; «Отключите вход» in the question switches it off instead; then deleted, and the toast with «Вернуть»", async ({ page }, info) => {
    test.skip(info.project.name !== "android", "one wide run is enough");
    const email = `del-wide@example.test`;
    await addLogin(page, email);

    const open = async () => {
      await page.getByRole("button", { name: T.actsOf(email) }).click();
      return page.getByRole("menu", { name: T.actsOf(email) });
    };
    let menu = await open();
    await expect(menu.getByRole("menuitem")).toHaveText([R.title, T.offYes, T.delYes]);
    await expect(menu.getByRole("separator")).toHaveCount(1);
    await expect(menu).toHaveCSS("width", "248px");
    const del = menu.getByRole("menuitem", { name: T.delYes });
    await expect(del).toHaveCSS("color", "rgb(217, 45, 32)");
    await del.hover();
    await shot(page, "logins-wide-menu");
    await del.click();

    // the softer way: switched off, its rights kept, still in the list
    let ask = page.getByRole("alertdialog", { name: T.delAsk });
    await expect(ask).toHaveCSS("max-width", "460px");
    await shot(page, "logins-wide-delete");
    await ask.getByRole("button", { name: T.delSoft[1] }).click();
    await expect(ask).toHaveCount(0);
    await expect(toast(page)).toHaveText(T.offDone(email));
    const row = page.locator(".ac-row", { has: roleLink(page, email) });
    await expect(row).toHaveClass(/is-off/);
    await expect(row.getByRole("switch")).not.toBeChecked();

    // off already: the question has no softer way; deleted
    menu = await open();
    await expect(menu.getByRole("menuitem", { name: T.enable })).toBeVisible();
    await menu.getByRole("menuitem", { name: T.delYes }).click();
    ask = page.getByRole("alertdialog", { name: T.delAsk });
    await expect(ask.getByRole("button", { name: T.delSoft[1] })).toHaveCount(0);
    await ask.getByRole("button", { name: T.delYes }).click();
    await expect(toast(page)).toContainText(T.deleted(email));
    await expect(toast(page).getByRole("button", { name: T.undo })).toBeVisible();
    await expect(roleLink(page, email)).toHaveCount(0);
    await expectNoSideScroll(page);
    await shot(page, "logins-wide-deleted");

    // the change history keeps its name: «Удаление» of «Входы и права»
    await page.goto("/admin/changes");
    await hydrated(page);
    await expect(page.locator("main")).toContainText(email.split("@")[0]);
  });
});
