import path from "node:path";
import type { Page } from "@playwright/test";
import { GROUPS, PRESETS, rightDef } from "../src/lib/auth/rights-catalogue";
import { OUT } from "./env";
import { A, asOwner, B, expect, expectNoSideScroll, hydrated, nextWorkday, openRights, phoneOf, rightsGroup, saveRights, sheet, smallTargets, test } from "./helpers";

/**
 * A login's access rights («Доступ» → the login; the owner, 19.11.2026:
 * «add all switches»). The owner opens a barber's rights, sees every group
 * with its counter, switches a right and saves; the barber's own app then
 * shows what the right says. A role fills in its defaults only after the
 * question; «Скопировать права» copies; a right whose function we do not
 * have cannot be switched; every save is in the history.
 *
 * Whatever a test changes on a demo barber's login it puts back. What needs
 * a login of its own (a role, a copy) adds one, with this phone's name in
 * its address so the two phones do not meet.
 */
const R = A.rights;
const PHONES = rightDef("journal.phones")!.ru;
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ fullPage, path: path.join(OUT, "screens", `${name}.png`) });
const counter = (page: Page, group: keyof typeof GROUPS) => page.locator(`.rt-group[data-group="${group}"]:visible [data-count]`);
const sw = (block: ReturnType<Page["locator"]>, right: string) => block.locator(`[data-right="${right}"]`).getByRole("switch");
const dirty = (page: Page) => page.locator(".rt-save:visible .rt-note");

/** Add a front-desk login on «Доступ», for a test that changes a login's role or whole set. */
async function addLogin(page: Page, email: string): Promise<void> {
  await page.goto("/admin/account");
  await hydrated(page);
  if (await page.getByRole("link", { name: `${R.open}: ${email}` }).count()) return;
  const form = page.locator("form", { has: page.getByRole("button", { name: A.account.addUser }) });
  await form.getByLabel(A.login.email).fill(email);
  await form.getByRole("button", { name: A.account.roles.admin, exact: true }).click();
  await form.getByRole("button", { name: A.account.addUser }).click();
  await expect(page.getByRole("link", { name: `${R.open}: ${email}` })).toBeVisible();
}

test.describe("a login's rights", () => {
  test.use(asOwner);

  test("the owner switches «Показывать номера телефонов» off for a barber: the barber sees no phone on his day and in a visit; then on again; the history has both", async ({ page, browser, barber }, info) => {
    const his = await phoneOf(browser, info, barber.slug);
    // his next working day has the demo visits, the first of them with a phone
    const day = `/b?d=${nextWorkday(barber.slug)}`;
    const openVisit = async () => {
      await his.goto(day);
      await hydrated(his);
      await his.locator(".bx-v button").first().click();
      return sheet(his);
    };
    try {
      // before: the phone is there, and it is a link to call
      const call = (await openVisit()).locator("a.vs-call");
      await expect(call).toHaveAttribute("href", /^tel:\+\d+$/);
      const phone = ((await call.getAttribute("href")) ?? "").slice(4);

      // the owner: every group with its counter, the journal's one counted right fewer after the switch
      await openRights(page, barber.email);
      await expect(page.locator(".rt-group:visible")).toHaveCount(14);
      await expect(page.locator(".rt-group:visible [data-count]")).toHaveCount(14);
      await expect(counter(page, "visit")).toHaveText(/^\d+ из 31 прав$/);
      await expect(counter(page, "finance")).toHaveText(R.count(2, 38));
      const was = Number(((await counter(page, "journal").innerText()).match(/^(\d+) из 8 прав$/) ?? [])[1]);
      expect(was).toBeGreaterThan(0);
      const journal = await rightsGroup(page, "journal");
      const phones = journal.getByRole("switch", { name: PHONES, exact: true });
      await expect(phones).toBeChecked();
      await expect(dirty(page)).toHaveText("");
      await phones.uncheck();
      await expect(counter(page, "journal")).toHaveText(R.count(was - 1, 8));
      await expect(dirty(page)).toHaveText(R.unsaved);
      await saveRights(page);

      // the barber: no number to call on his day or in the visit, and the real one is not on the page at all
      const s = await openVisit();
      await expect(s.locator("a[href^='tel:']")).toHaveCount(0);
      await expect(s.locator(".vs-phone b")).toHaveText(/^\+\d{4}•+\d\d$/);
      await expect(his.locator("a[href^='tel:']")).toHaveCount(0);
      expect(await his.content()).not.toContain(phone);
      await his.goto("/b");
      await hydrated(his);
      await expect(his.locator("a[href^='tel:']")).toHaveCount(0);
      expect(await his.content()).not.toContain(phone);

      // on again: the link to call is back
      await phones.check();
      await expect(counter(page, "journal")).toHaveText(R.count(was, 8));
      await saveRights(page);
      await expect((await openVisit()).locator("a.vs-call")).toHaveAttribute("href", `tel:${phone}`);

      // the history: both saves, the newest first, each with who and what
      const rows = page.locator(".rt-hist:visible li");
      await expect(rows.nth(0).locator("[data-on]")).toHaveText(`${R.turnedOn} ${PHONES}`);
      await expect(rows.nth(1).locator("[data-off]")).toHaveText(`${R.turnedOff} ${PHONES}`);
      await expect(rows.nth(0)).toContainText("Owner (demo)");
      // and it is still there when the page is opened anew
      await openRights(page, barber.email);
      await expect(page.locator(".rt-hist:visible li").nth(1).locator("[data-off]")).toHaveText(`${R.turnedOff} ${PHONES}`);
      await expect((await rightsGroup(page, "journal")).getByRole("switch", { name: PHONES, exact: true })).toBeChecked();
    } finally {
      // whatever happened above, the barber's phones are on for the tests that follow
      await openRights(page, barber.email);
      const again = (await rightsGroup(page, "journal")).getByRole("switch", { name: PHONES, exact: true });
      if (!(await again.isChecked())) {
        await again.check();
        await saveRights(page);
      }
      await his.context().close();
    }
  });

  test("a role fills in its defaults only after the question, and is kept by «Сохранить»", async ({ page }, info) => {
    const email = `rights-role-${info.project.name}@example.test`;
    await addLogin(page, email);
    await openRights(page, email);
    const role = page.locator(".rt:visible").getByLabel(R.role, { exact: true });
    await expect(role).toHaveValue("AD");
    const before = await counter(page, "clients").innerText();

    // «Отмена»: nothing is filled in
    await role.selectOption("MG");
    const ask = page.locator(".cc-ask:visible");
    await expect(ask.getByRole("heading")).toHaveText(R.roleAsk(PRESETS.MG.ru));
    await expect(ask).toContainText(R.replaceText);
    await ask.getByRole("button", { name: A.cancel, exact: true }).click();
    await expect(role).toHaveValue("AD");
    await expect(counter(page, "clients")).toHaveText(before);
    await expect(dirty(page)).toHaveText("");

    // «Заполнить»: the manager's defaults, as the list gives them
    await role.selectOption("MG");
    await page.locator(".cc-ask:visible").getByRole("button", { name: R.roleYes, exact: true }).click();
    await expect(role).toHaveValue("MG");
    await expect(counter(page, "journal")).toHaveText(R.count(8, 8));
    await expect(counter(page, "visit")).toHaveText(R.count(28, 31));
    await expect(counter(page, "clients")).toHaveText(R.count(24, 26));
    await expect(counter(page, "settings")).toHaveText(R.count(8, 10));
    await expect(counter(page, "single")).toHaveText(R.count(3, 4));
    await expect(dirty(page)).toHaveText(R.unsaved);
    await saveRights(page);
    await expect(page.locator(".rt-hist:visible li").first()).toContainText(R.roleChanged(PRESETS.AD.ru, PRESETS.MG.ru));

    // kept: the list of logins names the role, and the page opens with it
    await page.goto("/admin/account");
    await hydrated(page);
    await expect(page.locator(".adm-users li", { hasText: email })).toContainText(PRESETS.MG.ru);
    await openRights(page, email);
    await expect(page.locator(".rt:visible").getByLabel(R.role, { exact: true })).toHaveValue("MG");
    await expect(counter(page, "clients")).toHaveText(R.count(24, 26));
  });

  test("«Скопировать права» copies another login's set, after the question; «Выдать все» and «Убрать все» touch only the rights that work", async ({ page }, info) => {
    const from = `rights-from-${info.project.name}@example.test`;
    const to = `rights-to-${info.project.name}@example.test`;
    await addLogin(page, from);
    await addLogin(page, to);

    // the first login: no «Перенос записи», and none of the working rights of «Сотрудники»
    await openRights(page, from);
    const journal = await rightsGroup(page, "journal");
    await sw(journal, "journal.move").uncheck();
    const staff = page.locator('.rt-group[data-group="staff"]:visible');
    await expect(counter(page, "staff")).toHaveText(R.count(4, 8));
    await staff.getByRole("button", { name: R.menu(GROUPS.staff.ru) }).click();
    await staff.getByRole("menuitem", { name: R.takeAll }).click();
    await expect(counter(page, "staff")).toHaveText(R.count(0, 8));
    // «Выдать все» gives the four that work, never the four we have no function for
    await staff.getByRole("button", { name: R.menu(GROUPS.staff.ru) }).click();
    await staff.getByRole("menuitem", { name: R.giveAll }).click();
    await expect(counter(page, "staff")).toHaveText(R.count(4, 8));
    await staff.getByRole("button", { name: R.menu(GROUPS.staff.ru) }).click();
    await staff.getByRole("menuitem", { name: R.takeAll }).click();
    await saveRights(page);
    const journalCount = await counter(page, "journal").innerText();

    // the second login starts as the front desk does
    await openRights(page, to);
    await expect(sw(await rightsGroup(page, "journal"), "journal.move")).toBeChecked();
    await expect(counter(page, "staff")).toHaveText(R.count(4, 8));
    const tools = page.locator(".rt:visible .rt-tools");
    await tools.getByLabel(R.copyFrom).selectOption({ label: `${from} · ${A.account.roles.admin}` });
    await tools.getByRole("button", { name: R.copy, exact: true }).click();
    const ask = page.locator(".cc-ask:visible");
    await expect(ask.getByRole("heading")).toHaveText(R.copyAsk(`${from} · ${A.account.roles.admin}`));
    await ask.getByRole("button", { name: R.copyYes, exact: true }).click();
    await expect(dirty(page)).toHaveText(R.copied);
    await expect(sw(await rightsGroup(page, "journal"), "journal.move")).not.toBeChecked();
    await expect(counter(page, "journal")).toHaveText(journalCount);
    await expect(counter(page, "staff")).toHaveText(R.count(0, 8));
    await saveRights(page);

    // kept
    await openRights(page, to);
    await expect(sw(await rightsGroup(page, "journal"), "journal.move")).not.toBeChecked();
    await expect(counter(page, "staff")).toHaveText(R.count(0, 8));
    await expect(page.locator(".rt-hist:visible li").first().locator("[data-off]")).toContainText(rightDef("journal.move")!.ru);
  });

  test("a right whose function we do not have is grey, says «нет в системе» and cannot be switched; the search finds rights by their words", async ({ page, barber }) => {
    await openRights(page, barber.email);
    // a whole group we have nothing of: its switch is locked, and so is every right in it
    const finance = await rightsGroup(page, "finance");
    await expect(finance.locator(".rt-gtitle .rt-lock")).toHaveText(R.locked);
    await expect(finance.getByRole("switch", { name: R.groupOn(GROUPS.finance.ru) })).toBeDisabled();
    const flow = finance.locator('[data-right="finance.flow"]');
    await expect(flow).toHaveClass(/is-locked/);
    await expect(flow.locator(".rt-lock")).toHaveText(R.locked);
    await expect(sw(finance, "finance.flow")).toBeDisabled();
    await expect(finance.locator(".rt-row .rt-sw:enabled")).toHaveCount(0);
    // one locked right among working ones: a tap changes nothing, and nothing waits to be saved
    const journal = await rightsGroup(page, "journal");
    const wait = sw(journal, "journal.waitlist");
    await expect(wait).toBeDisabled();
    const state = await wait.isChecked();
    await wait.click({ force: true });
    await journal.locator('[data-right="journal.waitlist"] .rt-toggle').click({ force: true });
    expect(await wait.isChecked()).toBe(state);
    await expect(dirty(page)).toHaveText("");
    // the menu of a group we have nothing of is not offered at all
    await expect(finance.getByRole("button", { name: R.menu(GROUPS.finance.ru) })).toHaveCount(0);

    // the search: only the groups with a match, opened, with what the match is nested under
    const search = page.locator(".rt:visible").getByRole("searchbox", { name: R.search });
    await search.fill("телефон");
    await expect(page.locator(".rt-group:visible")).toHaveCount(4);
    await expect(page.locator('.rt-group[data-group="journal"]:visible .rt-row')).toHaveCount(1);
    await expect(page.locator('.rt-group[data-group="visit"]:visible .rt-row')).toHaveText([new RegExp(rightDef("visit.client_list")!.ru), new RegExp(PHONES)]);
    await search.fill("такого права нет");
    await expect(page.locator(".rt:visible")).toContainText(R.nothing);
    await search.fill("");
    await expect(page.locator(".rt-group:visible")).toHaveCount(14);
  });

  test("a value: whose columns a login sees is a select and a chip per barber", async ({ page }, info) => {
    const email = `rights-value-${info.project.name}@example.test`;
    await addLogin(page, email);
    await openRights(page, email);
    const journal = await rightsGroup(page, "journal");
    const row = journal.locator('[data-right="journal.staff"]');
    const select = row.getByRole("combobox");
    await expect(select).toHaveValue("all");
    await select.selectOption("chosen");
    const chips = row.getByRole("group", { name: R.staffChosen }).getByRole("button");
    await expect(chips.first()).toBeVisible();
    await chips.first().click();
    await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
    // how far back: the list's own choices
    await journal.locator('[data-right="journal.history"]').getByRole("combobox").selectOption({ label: R.historyNone });
    await saveRights(page);
    const hist = page.locator(".rt-hist:visible li").first();
    await expect(hist).toContainText(R.valueChanged);
    await expect(hist).toContainText(rightDef("journal.staff")!.ru);
    await openRights(page, email);
    const again = (await rightsGroup(page, "journal")).locator('[data-right="journal.staff"]');
    await expect(again.getByRole("combobox")).toHaveValue("chosen");
    await expect(again.getByRole("group", { name: R.staffChosen }).getByRole("button", { pressed: true })).toHaveCount(1);
  });

  test.describe("360 px", () => {
    // a common narrow phone, set as the other specs set it (e2e/screens.spec.ts)
    test.use({ viewport: { width: 360, height: 740 } });

    test("on a 360px phone the screen is usable: nothing scrolls sideways, everything is big enough to tap", async ({ page, barber }, info) => {
      await openRights(page, barber.email);
      await expectNoSideScroll(page);
      expect(await smallTargets(page)).toEqual([]);
      const journal = await rightsGroup(page, "journal");
      if (info.project.name === "android") {
        await page.locator(".rt:visible .rt-tools").scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollBy(0, 240));
        await shot(page, "android-rights");
      }
      await rightsGroup(page, "visit");
      await rightsGroup(page, "clients");
      await rightsGroup(page, "goods");
      await expectNoSideScroll(page);
      expect(await smallTargets(page)).toEqual([]);
      // a switch is 42 × 24, and the yellow one is on
      const box = await sw(journal, "journal.stats").boundingBox();
      expect([Math.round(box!.width), Math.round(box!.height)]).toEqual([42, 24]);
      // a group's menu opens inside the screen
      const visit = page.locator('.rt-group[data-group="visit"]:visible');
      await visit.getByRole("button", { name: R.menu(GROUPS.visit.ru) }).click();
      await expect(visit.getByRole("menuitem", { name: R.giveAll })).toBeVisible();
      await expectNoSideScroll(page);
      await page.keyboard.press("Escape");
      await expect(visit.getByRole("menu")).toHaveCount(0);
      // «Сохранить» stays in reach above the bottom bar
      await expect(page.locator(".rt-save:visible").getByRole("button", { name: A.save, exact: true })).toBeInViewport();
      if (info.project.name === "android") {
        // the nested rights of «Окно записи», as a phone shows them
        await page.locator('[data-right="visit.edit"]:visible').scrollIntoViewIfNeeded();
        await shot(page, "android-rights-nested");
      }
    });
  });

  test.describe("on a wide screen", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("the rights page: 32px controls, the groups in one column, a group open", async ({ page, barber }, info) => {
      test.skip(info.project.name !== "android", "one wide run is enough");
      await openRights(page, barber.email);
      await expect(page.locator(".rt-group:visible")).toHaveCount(14);
      await expectNoSideScroll(page);
      const role = page.locator(".rt:visible").getByLabel(R.role, { exact: true });
      expect(Math.round((await role.boundingBox())!.height)).toBe(32);
      expect(Math.round((await page.locator(".rt:visible .rt-tools").getByRole("button", { name: R.copy, exact: true }).boundingBox())!.height)).toBe(32);
      await shot(page, "pc-rights");
      const journal = await rightsGroup(page, "journal");
      await rightsGroup(page, "visit");
      // a nested right stands under its parent, further in
      const parent = (await page.locator('[data-right="visit.edit"]:visible .rt-sw').boundingBox())!;
      const child = (await page.locator('[data-right="visit.edit.arrived"]:visible .rt-sw').boundingBox())!;
      const grandchild = (await page.locator('[data-right="visit.edit.arrived.paid"]:visible .rt-sw').boundingBox())!;
      expect(child.x).toBeGreaterThan(parent.x + 10);
      expect(grandchild.x).toBeGreaterThan(child.x + 10);
      // a switch that is on is yellow
      expect(await sw(journal, "journal.stats").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 203, 0)");
      await journal.scrollIntoViewIfNeeded();
      await shot(page, "pc-rights-group");
      await expectNoSideScroll(page);
    });
  });
});

test.describe("who may open a login's rights", () => {
  test("a barber's login never gets there: the admin is not his side", async ({ browser, barber }, info) => {
    const his = await phoneOf(browser, info, barber.slug);
    try {
      await his.goto("/admin/account");
      await his.waitForURL((u) => u.pathname === "/b");
      await expect(his.locator(".rt")).toHaveCount(0);
    } finally {
      await his.context().close();
    }
  });

  test("«Запросы» lists requests only: no card about the rights (Dim, 20.11)", async ({ browser }, info) => {
    const owner = await phoneOf(browser, info, "owner");
    try {
      await owner.goto("/admin/requests");
      await hydrated(owner);
      await expect(owner.getByRole("heading", { level: 2, name: A.req.open })).toBeVisible();
      await expect(owner.getByText(rightDef("journal.schedule")!.ru)).toHaveCount(0);
      await expect(owner.getByRole("link", { name: /«Доступ»/ })).toHaveCount(0);
      await expectNoSideScroll(owner);
    } finally {
      await owner.context().close();
    }
  });

  test("the barber app says so when a login has no right to a page", async ({ browser, barber }, info) => {
    test.skip(info.project.name !== "android", "one run is enough");
    // «Проводить продажу товаров» off: «Продать» is closed to him, and on again it opens
    const owner = await phoneOf(browser, info, "owner");
    const his = await phoneOf(browser, info, barber.slug);
    const visit = async (on: boolean) => {
      await openRights(owner, barber.email);
      const block = await rightsGroup(owner, "visit");
      const s = block.locator('[data-right="visit.sell"]').getByRole("switch");
      if ((await s.isChecked()) !== on) {
        await s.setChecked(on);
        // switched on again, what was nested under it comes back with it only by hand
        if (on) for (const k of ["visit.sell.create", "visit.sell.edit"]) await block.locator(`[data-right="${k}"]`).getByRole("switch").check();
        await saveRights(owner);
      }
    };
    try {
      await visit(false);
      await his.goto("/b/sell");
      await expect(his.getByRole("heading", { level: 1, name: B.rights.none })).toBeVisible();
      await expect(his.getByText(B.rights.noneLead)).toBeVisible();
    } finally {
      await visit(true);
      await his.goto("/b/sell");
      await expect(his.getByRole("heading", { level: 1, name: B.rights.none })).toHaveCount(0);
      await owner.context().close();
      await his.context().close();
    }
  });
});
