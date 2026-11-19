import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { TABS } from "../src/app/admin/(app)/clients/card-fields";
import { OUT } from "./env";
import { A, asOwner, expect, expectNoSideScroll, hydrated, nextWorkday, smallTargets, test } from "./helpers";

/**
 * «Клиенты», the client base in the admin, and the bar that now holds four
 * sections and «Ещё». The clients are the demo ones (tools/seed-demo.mjs:
 * «Demo client N», +372 5555 09NN): fake, as everything here. Each phone
 * works on its own client, so the two runs do not meet.
 *
 * A client's card (the owner, 19.11.2026): a page on a phone, a 900px
 * drawer over the list on a wide screen, seven tabs. Its screenshots are
 * e2e/.out/screens/<phone>-client-card.png and pc-client-<tab>.png.
 */
const shot = async (page: Page, name: string, fullPage = true) => {
  const body = await page.screenshot({ fullPage, path: path.join(OUT, "screens", `${test.info().project.name}-cl-${name}.png`) });
  await test.info().attach(`cl-${name}`, { body, contentType: "image/png" });
};
const C = A.clients;
const K = C.card;
const bar = (page: Page) => page.getByRole("navigation", { name: A.sections });
/** The rows of the list on a phone (:visible: a page left behind stays in the document, hidden). */
const rows = (page: Page) => page.locator(".cl-item:visible");
const count = (page: Page) => page.locator(".adm-cl p[role=status]:visible");
/** A client's card: his name is its name. */
const cardOf = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });
const CARD_URL = /\/admin\/clients\/[0-9a-f-]{36}$/;
/** The smallest picture there is: one pixel, a PNG. */
const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const LIST_URL = /\/admin\/clients$/;

test.describe("clients", () => {
  test.use(asOwner);

  test("the bar: four sections and «Ещё», which lists the rest and stays lit on them", async ({ page }) => {
    await page.goto("/admin/clients");
    await hydrated(page);
    await expect(bar(page).getByRole("link")).toHaveText([A.nav.calendar, A.nav.clients, A.nav.requests, A.nav.invoices, A.nav.more]);
    await expect(bar(page).getByRole("link", { name: A.nav.clients })).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveTitle(`${A.nav.clients} · REMPIRE`);

    await bar(page).getByRole("link", { name: A.nav.more }).click();
    await page.waitForURL(/\/admin\/more$/);
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: A.more.title })).toBeVisible();
    const others = page.locator(".adm-more .adm-item:visible");
    // (the last two are the sidebar's tiles on a wide screen: e2e/frame.spec.ts)
    await expect(others).toHaveText([A.nav.staff, A.nav.services, A.nav.catalogue, A.sale.title]);
    await expect(bar(page).getByRole("link", { name: A.nav.more })).toHaveAttribute("aria-current", "page");
    await expect(bar(page).locator('a[aria-current="page"]:visible')).toHaveCount(1);
    await expect(page).toHaveTitle(`${A.nav.more} · REMPIRE`);
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    await shot(page, "more");

    // a section behind «Ещё»: its page opens, the tab says its name, «Ещё» stays lit
    for (const [name, url, title] of [
      [A.nav.services, /\/admin\/services$/, A.services.title],
      [A.nav.staff, /\/admin\/staff$/, A.staff.title],
    ] as const) {
      await page.goto("/admin/more");
      await hydrated(page);
      await page.locator(".adm-more .adm-item:visible", { hasText: name }).click();
      await page.waitForURL(url);
      await expect(page.getByRole("heading", { level: 1, name: title }).first()).toBeVisible();
      await expect(bar(page).getByRole("link", { name: A.nav.more })).toHaveAttribute("aria-current", "page");
      await expect(bar(page).locator('a[aria-current="page"]:visible')).toHaveCount(1);
      await expect(page).toHaveTitle(`${name} · REMPIRE`);
    }
    // and a section with a tab of its own lights its own
    await bar(page).getByRole("link", { name: A.nav.requests }).click();
    await page.waitForURL(/\/admin\/requests$/);
    await expect(bar(page).getByRole("link", { name: A.nav.requests })).toHaveAttribute("aria-current", "page");
    await expect(bar(page).getByRole("link", { name: A.nav.more })).not.toHaveAttribute("aria-current", "page");
  });

  test("the list and its search; a client's card is a page with seven tabs: a category and a note are kept by «Сохранить», his visit is there", async ({ page }, info) => {
    // two of Renat's demo clients of his next working day (tools/seed-demo.mjs, the second day: 26 at 10:00, 28 before lunch).
    // That day, not today: a fixed visit of today is left out when the «in 20 minutes» demo visit has its time.
    const k = info.project.name === "iphone" ? 28 : 26;
    const name = `Demo client ${k}`;
    const label = `E2E ${info.project.name}`;
    const note = `E2E заметка: ${info.project.name}`;

    await page.goto("/admin/clients");
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: C.title })).toBeVisible();
    // the first of several pages, by name: the demo clients, and whoever the other tests have booked
    await expect(rows(page)).toHaveCount(25);
    await expect(rows(page).filter({ hasText: "Demo client" }).first()).toBeVisible();
    const total = Number((await count(page).innerText()).replace(/\D/g, ""));
    expect(total).toBeGreaterThan(25);
    await expect(count(page)).toHaveText(C.count(total, false));
    const pages = page.getByRole("navigation", { name: C.pages });
    const last = Math.ceil(total / 25);
    await expect(pages).toContainText(C.page(1, last));
    await expect(pages.getByRole("button", { name: C.prev })).toBeDisabled();
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    await shot(page, "list");

    // the next page: other clients
    const first = await rows(page).first().innerText();
    await pages.getByRole("button", { name: C.next }).click();
    await expect(pages).toContainText(C.page(2, last));
    await expect(rows(page).first()).not.toHaveText(first);
    await pages.getByRole("button", { name: C.prev }).click();
    await expect(pages).toContainText(C.page(1, last));

    // the search narrows it: a name that nobody has, then his phone, typed with a space
    const search = page.getByRole("searchbox", { name: C.search });
    await search.fill("Nobody Atall");
    await expect(page.getByText(C.nothing)).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await page.getByRole("button", { name: C.reset }).click();
    await expect(search).toHaveValue("");
    await expect(rows(page)).toHaveCount(25);
    await search.fill(name);
    await expect(rows(page).first()).toContainText(name);
    expect(await rows(page).count()).toBeLessThan(25);
    await search.fill(`5555 09${k}`);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText(name);
    await expect(count(page)).toHaveText(C.count(1, true));
    // what was typed is not in the address
    expect(new URL(page.url()).search).toBe("");

    // his card: on a phone it is the page, and the list is put away behind it
    const card = cardOf(page, name);
    await rows(page).click();
    await page.waitForURL(CARD_URL);
    await hydrated(page);
    await expect(card.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    expect(await card.evaluate((el) => getComputedStyle(el).position)).toBe("static");
    // «back»: the list is as it was left, the search still in its field
    await page.goBack();
    await page.waitForURL(LIST_URL);
    await expect(search).toHaveValue(/5555 09/);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText(name);
    await rows(page).click();
    await page.waitForURL(CARD_URL);
    await hydrated(page);
    await expect(card.getByRole("textbox", { name: A.visit.name })).toHaveValue(name);

    // the seven tabs are one row of chips that scrolls sideways; the page itself never does
    const tabs = card.getByRole("tab");
    await expect(tabs).toHaveText(TABS.map((t) => K.tabs[t]));
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    expect(await card.getByRole("tablist").evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    // (what the phone shows: in a picture of the whole page the foot and the bottom bar land in the middle)
    const body = await page.screenshot({ path: path.join(OUT, "screens", `${info.project.name}-client-card.png`) });
    await info.attach("client-card", { body, contentType: "image/png" });
    // each tab opens (the chip is scrolled to), shows its part and fits the phone
    for (const t of [...TABS].reverse()) {
      await card.getByRole("tab", { name: K.tabs[t], exact: true }).click();
      await expect(card.getByRole("tab", { name: K.tabs[t], exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(card.getByRole("tabpanel", { name: K.tabs[t], exact: true })).toBeVisible();
      await expect(card.getByRole("tabpanel")).toHaveCount(1);
      expect(new URL(page.url()).search).toBe(t === "card" ? "" : `?tab=${t}`);
      await expectNoSideScroll(page);
      expect(await smallTargets(page), t).toEqual([]);
    }

    // the history: the demo visit, on Renat's next working day, in the calendar's words; it opens its day in the calendar
    await card.getByRole("tab", { name: K.tabs.history, exact: true }).click();
    const history = card.getByRole("tabpanel", { name: K.tabs.history, exact: true });
    const visit = history.locator(".cc-visit");
    await expect(visit).toHaveCount(1);
    await expect(visit).toContainText("Renat");
    await expect(visit.locator(".st")).toHaveText(A.visit.status.booked);
    await expect(visit.getByRole("link", { name: K.toDay })).toHaveAttribute("href", `/admin?d=${nextWorkday("renat")}`);
    // the filter: he has none cancelled, and the one ahead is «upcoming»
    await history.getByRole("combobox", { name: K.show }).selectOption("cancelled");
    await expect(history.getByText(K.noneShown)).toBeVisible();
    await history.getByRole("combobox", { name: K.show }).selectOption("ahead");
    await expect(visit).toHaveCount(1);
    await shot(page, "card-history");

    // a category, added as a chip, and the note: kept by «Сохранить», not by themselves
    await card.getByRole("tab", { name: K.tabs.card, exact: true }).click();
    const cats = card.locator(".cc-labels");
    const save = card.getByRole("button", { name: A.save, exact: true });
    const saved = card.locator(".cc-foot:visible").getByRole("status");
    await expect(cats.locator(".cc-chips li")).toHaveCount(0);
    await cats.getByRole("combobox", { name: C.labels, exact: true }).fill(`  ${label} `);
    await cats.getByRole("combobox", { name: C.labels, exact: true }).press("Enter");
    await expect(cats.locator(".cc-chips li")).toHaveText([label]);
    await card.getByRole("textbox", { name: K.note, exact: true }).fill(note);
    await expect(saved).toHaveText("");
    await save.click();
    await expect(saved).toHaveText(A.saved);

    // both are there after a reload
    await page.reload();
    await hydrated(page);
    await expect(cats.locator(".cc-chips li")).toHaveText([label]);
    await expect(card.getByRole("textbox", { name: K.note, exact: true })).toHaveValue(note);
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    await shot(page, "card");

    // back in the list the category is a filter, and it finds him
    await card.getByRole("button", { name: K.toList }).click();
    await page.waitForURL(LIST_URL);
    await hydrated(page);
    await page.getByRole("combobox", { name: C.label, exact: true }).selectOption(label);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText(name);
    await expect(rows(page).locator(".adm-tag")).toHaveText([label]);
    await shot(page, "filtered");

    // the chip's cross takes the category off again
    await rows(page).click();
    await page.waitForURL(CARD_URL);
    await hydrated(page);
    await cats.getByRole("button", { name: C.labelRemove(label) }).click();
    await expect(cats.locator(".cc-chips li")).toHaveCount(0);
    await save.click();
    await expect(saved).toHaveText(A.saved);
    // put back with the plus, so the other phone's run finds it among the ready ones
    await cats.getByRole("combobox", { name: C.labels, exact: true }).fill(label);
    await cats.getByRole("button", { name: C.labelNew }).click();
    await expect(cats.locator(".cc-chips li")).toHaveText([label]);
    await save.click();
    await expect(saved).toHaveText(A.saved);
  });

  test("«Добавить клиента»: his card opens; the same phone again is refused by name", async ({ page }, info) => {
    const who = `E2E Klient ${info.project.name}`;
    const phone = info.project.name === "iphone" ? "5555 0702" : "5555 0701";
    await page.goto("/admin/clients");
    await hydrated(page);
    const button = page.getByRole("button", { name: C.add });
    // the one main action of the page: yellow
    await expect(button).toHaveCSS("background-color", "rgb(255, 203, 0)");
    await button.click();
    const sheet = page.getByRole("dialog", { name: A.visit.newClient });
    await sheet.getByRole("textbox", { name: A.visit.name }).fill(who);
    await sheet.getByRole("textbox", { name: A.visit.phone }).fill(phone);
    await expectNoSideScroll(page);
    // (the sheet is fixed to the screen: the screen, not the whole page)
    await shot(page, "new", false);
    await sheet.getByRole("button", { name: C.add }).click();
    await page.waitForURL(CARD_URL);
    await hydrated(page);
    const card = cardOf(page, who);
    await expect(card.getByRole("heading", { level: 1, name: who })).toBeVisible();
    await expect(card.getByRole("textbox", { name: A.visit.phone, exact: true })).toHaveValue(`+372${phone.replace(" ", "")}`);
    await card.getByRole("tab", { name: K.tabs.history, exact: true }).click();
    await expect(card.getByRole("tabpanel", { name: K.tabs.history, exact: true }).getByText(C.noHistory)).toBeVisible();
    const url = page.url().replace(/\?.*$/, "");

    // once more with the same phone: said in words, with the way to the client who has it
    await page.goto("/admin/clients");
    await hydrated(page);
    await page.getByRole("button", { name: C.add }).click();
    await sheet.getByRole("textbox", { name: A.visit.name }).fill(`${who} 2`);
    await sheet.getByRole("textbox", { name: A.visit.phone }).fill(`+372 ${phone}`);
    await sheet.getByRole("button", { name: C.add }).click();
    await expect(sheet.getByRole("alert")).toContainText(C.taken);
    await sheet.getByRole("link", { name: C.openHim }).click();
    await page.waitForURL(url);
    await expect(card.getByRole("heading", { level: 1, name: who, exact: true })).toBeVisible();
  });

  test.describe("on the narrowest phone", () => {
    test.use({ viewport: { width: 320, height: 640 } });

    test("the list, a card with its tabs and «Ещё» fit 320 px", async ({ page }) => {
      for (const url of ["/admin/clients", "/admin/more"]) {
        await page.goto(url);
        await hydrated(page);
        await expectNoSideScroll(page);
        expect(await smallTargets(page), url).toEqual([]);
      }
      await page.goto("/admin/clients");
      await hydrated(page);
      await rows(page).first().click();
      await page.waitForURL(CARD_URL);
      await hydrated(page);
      const card = page.locator(".cc:visible");
      await expect(card.getByRole("tab")).toHaveCount(TABS.length);
      await expectNoSideScroll(page);
      expect(await smallTargets(page)).toEqual([]);
      await shot(page, "card-320");
      for (const t of TABS) {
        await card.getByRole("tab", { name: K.tabs[t], exact: true }).click();
        await expect(card.getByRole("tabpanel", { name: K.tabs[t], exact: true })).toBeVisible();
        await expectNoSideScroll(page);
        expect(await smallTargets(page), t).toEqual([]);
      }
    });
  });

  test.describe("on a wide screen", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("the sidebar's menu has every section; the list is a table; a card opens over it", async ({ page }, info) => {
      test.skip(info.project.name !== "android", "one wide run is enough");
      await page.goto("/admin/clients");
      await hydrated(page);
      // opened on this page, the sidebar is the menu (e2e/frame.spec.ts): every section and no «Ещё»;
      // «Клиенты» is a group, open on its page «Клиентская база»; «Товары» is the other group, shut
      await expect(bar(page).getByRole("link")).toHaveText([A.nav.clientBase, A.nav.staff, A.nav.services, A.nav.requests, A.nav.invoices, A.nav.account]);
      await expect(bar(page).getByRole("button")).toHaveText([A.nav.clients, A.nav.goods]);
      await expect(bar(page).getByRole("link", { name: A.nav.clientBase })).toHaveAttribute("aria-current", "page");
      const cols = C.cols;
      await expect(page.locator(".cl-table thead th")).toHaveText([cols.name, cols.phone, cols.email, cols.visits, cols.last, cols.first, cols.sold]);
      await expect(page.locator(".cl-table tbody tr")).toHaveCount(25);
      await expect(page.locator(".cl-item:visible")).toHaveCount(0);
      await expectNoSideScroll(page);
      await page.screenshot({ path: path.join(OUT, "screens", "pc-cl-list.png") });

      // a small laptop: the table still fits beside the sidebar
      await page.setViewportSize({ width: 1024, height: 768 });
      await expect(page.locator(".cl-table thead th:visible")).toHaveText([cols.name, cols.phone, cols.visits, cols.last, cols.sold]);
      await expectNoSideScroll(page);
      expect(await page.locator(".cl-card").evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(OUT, "screens", "pc-cl-list-1024.png") });
      // and a card there takes what the sidebar leaves, its two columns side by side
      await page.locator(".cl-table tbody a").first().click();
      await page.waitForURL(CARD_URL);
      await hydrated(page);
      const small = page.locator(".cc:visible");
      expect((await small.boundingBox())!.width).toBe(1024 - 220);
      const [l, r] = await Promise.all([small.locator(".cc-left").boundingBox(), small.locator(".cc-right").boundingBox()]);
      expect(r!.x).toBeGreaterThan(l!.x + l!.width - 1);
      expect(await small.locator(".cc-scroll:visible").evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      await expectNoSideScroll(page);
      await page.screenshot({ path: path.join(OUT, "screens", "pc-client-card-1024.png") });
      await small.getByRole("button", { name: A.close }).click();
      await page.waitForURL(LIST_URL);
      await page.setViewportSize({ width: 1440, height: 900 });

      // «Ещё» by its address still works here: the same rows
      await page.goto("/admin/more");
      await hydrated(page);
      await expect(page.locator(".adm-more .adm-item:visible")).toHaveText([A.nav.staff, A.nav.services, A.nav.catalogue, A.sale.title]);
    });

    test("a client's card is a 900px drawer over the list: its seven tabs, «Сохранить», the question before leaving, a comment, a file, a message", async ({ page, browser }, info) => {
      test.skip(info.project.name !== "android", "one wide run is enough");
      // the first demo client of today (tools/seed-demo.mjs): once his visit has begun, his history and numbers are not empty
      const name = "Demo client 1";
      const pc = (tab: string) => page.screenshot({ path: path.join(OUT, "screens", `pc-client-${tab}.png`) });
      await page.goto("/admin/clients");
      await hydrated(page);
      const search = page.getByRole("searchbox", { name: C.search });
      await search.fill("5555 0901");
      const row = page.locator(".cl-table tbody tr");
      await expect(row).toHaveCount(1);
      await row.getByRole("link", { name, exact: true }).click();
      await page.waitForURL(CARD_URL);
      await hydrated(page);
      const card = cardOf(page, name);
      await expect(card).toBeVisible();

      // 900px on the right, down to the bottom; the list stays in view behind it, and his row is outlined in yellow
      const box = (await card.boundingBox())!;
      expect([box.width, box.x, box.y + box.height]).toEqual([900, 540, 900]);
      await expect(card).toHaveCSS("position", "fixed");
      await expect(card).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await expect(page.locator(".cl-table")).toBeVisible();
      await expect(search).toHaveValue("5555 0901");
      await expect(row).toHaveClass(/is-open/);
      await expect(row).toHaveCSS("outline-color", "rgb(255, 203, 0)");
      await expect(row).toHaveCSS("outline-style", "solid");
      await expect(row).toHaveCSS("outline-width", "2px");
      expect((await row.boundingBox())!.x).toBeLessThan(box.x);
      await expectNoSideScroll(page);

      // the board's measures: the name as the title, chip tabs, 32px fields, the two columns, the foot with its two buttons
      const title = card.getByRole("heading", { level: 1, name, exact: true });
      await expect(title).toHaveCSS("font-size", "20px");
      await expect(title).toHaveCSS("font-weight", "500");
      const tabs = card.getByRole("tab");
      await expect(tabs).toHaveText(TABS.map((t) => K.tabs[t]));
      await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
      await expect(tabs.first()).toHaveCSS("background-color", "rgb(240, 243, 248)");
      await expect(tabs.nth(1)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      expect((await tabs.first().boundingBox())!.height).toBe(32);
      const nameField = card.getByRole("textbox", { name: A.visit.name });
      expect(await nameField.boundingBox()).toMatchObject({ width: 558, height: 32, x: box.x + 24 });
      await expect(nameField).toHaveCSS("border-radius", "8px");
      await expect(nameField).toHaveCSS("border-top-color", "rgb(224, 227, 235)");
      await expect(nameField).toHaveCSS("font-size", "14px");
      const right = (await card.locator(".cc-right").boundingBox())!;
      expect(right.x).toBe(box.x + 24 + 558 + 32);
      const foot = card.locator(".cc-foot:visible");
      expect(await foot.boundingBox()).toMatchObject({ height: 64, y: 900 - 64 });
      const save = card.getByRole("button", { name: A.save, exact: true });
      const remove = card.getByRole("button", { name: A.remove, exact: true });
      const saved = foot.getByRole("status");
      await expect(save).toHaveCSS("background-color", "rgb(255, 203, 0)");
      expect((await save.boundingBox())!.height).toBe(32);
      expect((await remove.boundingBox())!.x).toBe(box.x + 24);
      expect(Math.round((await save.boundingBox())!.x + (await save.boundingBox())!.width)).toBe(1440 - 24);
      const noOnline = card.getByRole("switch", { name: K.noOnline });
      expect(await noOnline.boundingBox()).toMatchObject({ width: 42, height: 24 });
      await expect(noOnline).toHaveCSS("background-color", "rgb(224, 227, 235)");

      // several fields are changed; «Сохранить» keeps them, and they are there after a reload
      const cardNo = card.getByRole("textbox", { name: K.cardNo });
      const birthday = card.getByRole("textbox", { name: K.birthday });
      const discount = card.getByRole("textbox", { name: K.discount });
      const phone2 = card.getByRole("textbox", { name: K.phone2 });
      await cardNo.fill("E2E 1701");
      await birthday.fill("14.3");
      await discount.fill("10");
      await phone2.fill("5555 0777");
      await card.getByRole("combobox", { name: K.gender }).selectOption("male");
      await card.getByRole("combobox", { name: K.importance }).selectOption("gold");
      // a day that is none is said before anything is sent
      await birthday.fill("31.02");
      await save.click();
      await expect(foot.getByRole("alert")).toHaveText(A.visit.invalid("birthday"));
      await birthday.fill("14.3");
      await save.click();
      await expect(saved).toHaveText(A.saved);
      // as it was kept: the phone in full, the birthday with its zeros and still no year
      await expect(phone2).toHaveValue("+37255550777");
      await expect(birthday).toHaveValue("14.03");
      await page.reload();
      await hydrated(page);
      await expect(card).toBeVisible();
      await expect(cardNo).toHaveValue("E2E 1701");
      await expect(birthday).toHaveValue("14.03");
      await expect(discount).toHaveValue("10");
      await expect(phone2).toHaveValue("+37255550777");
      await expect(card.getByRole("combobox", { name: K.gender })).toHaveValue("male");
      await expect(card.getByRole("combobox", { name: K.importance })).toHaveValue("gold");
      // the list came back with the page, and he is on its first page: still outlined
      await expect(page.locator(".cl-table tbody tr.is-open")).toContainText(name);

      // leaving with changes that are not saved asks: the cross, a link of the page, Escape
      const note = card.getByRole("textbox", { name: K.note, exact: true });
      const before = await note.inputValue();
      await note.fill("E2E: не сохранять");
      const ask = page.getByRole("alertdialog", { name: K.unsavedTitle });
      await card.getByRole("button", { name: A.close }).click();
      await expect(ask).toContainText(K.unsaved);
      await ask.getByRole("button", { name: K.stay }).click();
      await expect(ask).toBeHidden();
      await expect(card).toBeVisible();
      await expect(note).toHaveValue("E2E: не сохранять");
      await bar(page).getByRole("link", { name: A.nav.services }).click();
      await expect(ask).toBeVisible();
      await ask.getByRole("button", { name: K.stay }).click();
      expect(page.url()).toMatch(CARD_URL);
      // another tab of the card is not «leaving»: what was typed waits there
      await card.getByRole("tab", { name: K.tabs.files, exact: true }).click();
      await expect(ask).toBeHidden();
      await card.getByRole("tab", { name: K.tabs.card, exact: true }).click();
      await expect(note).toHaveValue("E2E: не сохранять");
      await page.keyboard.press("Escape");
      await expect(ask).toBeVisible();
      await ask.getByRole("button", { name: K.leave }).click();
      await page.waitForURL(LIST_URL);
      await expect(card).toBeHidden();
      await expect(page.locator(".cl-table tbody tr.is-open")).toHaveCount(0);
      // opened again: what was not saved is not there, what was saved is
      await page.locator(".cl-table tbody tr").getByRole("link", { name, exact: true }).click();
      await page.waitForURL(CARD_URL);
      await hydrated(page);
      await expect(note).toHaveValue(before);
      await expect(cardNo).toHaveValue("E2E 1701");
      // with nothing changed the cross just closes, and Escape too
      await card.getByRole("button", { name: A.close }).click();
      await page.waitForURL(LIST_URL);
      await expect(ask).toBeHidden();
      await page.locator(".cl-table tbody tr").getByRole("link", { name, exact: true }).click();
      await page.waitForURL(CARD_URL);
      await hydrated(page);

      // a comment is added: who, when, the words; a second one is deleted after a question
      const comments = card.getByRole("region", { name: K.comments });
      await expect(comments.getByText(K.commentNone)).toBeVisible();
      await comments.getByRole("textbox", { name: K.commentNew }).fill("E2E: просил звонить после шести");
      await comments.getByRole("button", { name: A.add, exact: true }).click();
      const list = comments.locator(".cc-comment-list li");
      await expect(list).toHaveCount(1);
      await expect(list).toContainText("E2E: просил звонить после шести");
      await expect(list).toContainText("Owner (demo)");
      await expect(comments.getByRole("textbox", { name: K.commentNew })).toHaveValue("");
      await comments.getByRole("textbox", { name: K.commentNew }).fill("E2E: лишний");
      await comments.getByRole("button", { name: A.add, exact: true }).click();
      await expect(list).toHaveCount(2);
      await list.filter({ hasText: "E2E: лишний" }).getByRole("button", { name: K.commentDelete }).click();
      const sure = page.getByRole("alertdialog", { name: K.commentDelete });
      await expect(sure).toContainText(K.commentAsk);
      await sure.getByRole("button", { name: A.remove, exact: true }).click();
      await expect(list).toHaveCount(1);
      await expect(list).toContainText("E2E: просил звонить после шести");
      // the numbers nobody types, and the way to the history
      await expect(card.locator(".cc-sums dt")).toHaveText([K.sold, C.cols.first, C.cols.last]);
      // «Удалить» asks first; he has a visit, so he is refused, plainly, and stays
      await remove.click();
      const del = page.getByRole("alertdialog", { name: K.deleteTitle });
      await expect(del).toContainText(K.deleteAsk(name));
      await del.getByRole("button", { name: K.deleteYes }).click();
      await expect(del.getByRole("alert")).toHaveText(K.deleteRefused);
      await expect(del.getByRole("button", { name: K.deleteYes })).toHaveCount(0);
      await del.getByRole("button", { name: A.close }).click();
      await expect(card).toBeVisible();
      await pc("card");

      // his photo: made a small JPEG in the browser, kept at once, shown by a route of the admin's own; then taken off
      const photo = card.locator(".cc-photo");
      await expect(photo.locator("img")).toHaveCount(0);
      await photo.locator('input[type="file"]').setInputFiles({ name: "face.png", mimeType: "image/png", buffer: Buffer.from(PIXEL, "base64") });
      await expect(photo.locator("img")).toHaveAttribute("src", /^\/admin\/clients\/[0-9a-f-]{36}\/photo\?v=\d+$/);
      const shown = await page.request.get((await photo.locator("img").getAttribute("src"))!);
      expect(shown.status()).toBe(200);
      expect(shown.headers()["content-type"]).toBe("image/jpeg");
      expect(shown.headers()["cache-control"]).toContain("no-store");
      expect(shown.headers()["x-content-type-options"]).toBe("nosniff");
      await expect(photo.getByRole("button", { name: K.photoChange })).toBeVisible();
      await photo.getByRole("button", { name: K.photoRemove }).click();
      await expect(photo.locator("img")).toHaveCount(0);
      await expect(photo.getByRole("button", { name: K.photoAdd })).toBeVisible();

      // «История визитов»: its own address; a filter, and a table under a line per day
      await card.getByRole("button", { name: K.seeHistory }).click();
      await expect(page).toHaveURL(/\?tab=history$/);
      const history = card.getByRole("tabpanel", { name: K.tabs.history, exact: true });
      await expect(history).toBeVisible();
      await expect(card.getByRole("tab", { name: K.tabs.history, exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(card.getByRole("tabpanel")).toHaveCount(1);
      await expect(history.getByRole("combobox", { name: K.show })).toHaveValue("all");
      await expect(history.locator(".cc-visits thead th")).toHaveText([K.cols.barber, K.cols.status, K.cols.service, K.cols.cost]);
      const visits = history.locator(".cc-visit");
      await expect(visits).toHaveCount(1);
      await expect(history.locator(".cc-day")).toHaveCount(1);
      await expect(visits.locator(".cc-dot")).toBeVisible();
      await expect(visits.getByRole("link", { name: K.toDay })).toHaveAttribute("href", /^\/admin\?d=\d{4}-\d{2}-\d{2}$/);
      expect((await history.locator(".cc-visits thead th").first().boundingBox())!.height).toBe(48);
      expect((await visits.boundingBox())!.height).toBe(69);
      await history.getByRole("combobox", { name: K.show }).selectOption("cancelled");
      await expect(history.getByText(K.noneShown)).toBeVisible();
      await history.getByRole("combobox", { name: K.show }).selectOption("all");
      await expect(visits).toHaveCount(1);
      await pc("history");

      // «Статистика»: a period, then three cards; another period is asked for and answered
      await card.getByRole("tab", { name: K.tabs.stats, exact: true }).click();
      await expect(page).toHaveURL(/\?tab=stats$/);
      const stats = card.getByRole("tabpanel", { name: K.tabs.stats, exact: true });
      const period = stats.getByRole("group", { name: K.period });
      await expect(period.getByLabel(K.from, { exact: true })).toHaveValue(/^\d{4}-\d{2}-01$/);
      await expect(stats.getByRole("heading", { level: 2 })).toHaveText([K.revenue, K.services, K.barbers]);
      await expect(stats.locator(".cc-stat")).toHaveCount(3);
      const total = stats.locator(".cc-stat-total");
      await expect(total).toHaveText(/€/);
      await pc("stats");
      // ten years back is cut to five years; a period before his first visit is empty
      await period.getByLabel(K.from, { exact: true }).fill("2016-01-01");
      await expect(period.getByLabel(K.from, { exact: true })).not.toHaveValue("2016-01-01");
      await period.getByLabel(K.to, { exact: true }).fill("2025-01-31");
      await expect(total).toHaveText(K.soldFor("0 €", 0));
      await expect(stats.getByText(K.statsNone).first()).toBeVisible();

      // «Сообщения»: nothing was sent to him yet
      await card.getByRole("tab", { name: K.tabs.messages, exact: true }).click();
      await expect(page).toHaveURL(/\?tab=messages$/);
      const messages = card.getByRole("tabpanel", { name: K.tabs.messages, exact: true });
      await expect(messages.getByText(K.msgNone)).toBeVisible();

      // «Отправить сообщение»: a text with its SMS parts, the channels he can be reached by, the yellow button
      await card.getByRole("tab", { name: K.tabs.send, exact: true }).click();
      await expect(page).toHaveURL(/\?tab=send$/);
      const send = card.getByRole("tabpanel", { name: K.tabs.send, exact: true });
      const text = "E2E: ждём вас в субботу в 12:00";
      await expect(send.getByText(K.msgCount(0, 0))).toBeVisible();
      await send.getByRole("textbox", { name: K.msgText }).fill(text);
      // Cyrillic: one part of 70 characters
      await expect(send.getByText(K.msgCount(text.length, 1))).toBeVisible();
      // he has a phone and no e-mail; no notification is turned on, so push is not offered at all
      await expect(send.getByRole("checkbox")).toHaveCount(2);
      await expect(send.getByRole("checkbox", { name: new RegExp(K.channels.email) })).toBeDisabled();
      await expect(send.getByText(K.noWay.email)).toBeVisible();
      const button = send.getByRole("button", { name: K.sendBtn, exact: true });
      await expect(button).toHaveCSS("background-color", "rgb(255, 203, 0)");
      await button.click();
      await expect(send.getByRole("alert")).toHaveText(K.msgNeedChannel);
      await send.getByRole("checkbox", { name: K.channels.sms }).check();
      await pc("send");
      await button.click();
      await expect(send.getByRole("status")).toHaveText(K.msgQueued);
      await expect(send.getByRole("textbox", { name: K.msgText })).toHaveValue("");
      // and it is under «Сообщения»: the words, when, the kind, queued, by SMS
      await card.getByRole("tab", { name: K.tabs.messages, exact: true }).click();
      await expect(messages.locator(".cc-msgs thead th")).toHaveText([K.msgCols.text, K.msgCols.at, K.msgCols.kind, K.msgCols.status, K.msgCols.channel]);
      const sent = messages.locator(".cc-msgs tbody tr");
      await expect(sent).toHaveCount(1);
      await expect(sent.locator(".txt")).toHaveText(text);
      await expect(sent.locator(".kind")).toHaveText(K.kinds.manual);
      await expect(sent.locator(".st")).toHaveText(K.statuses.queued);
      await expect(sent.locator(".ch")).toHaveText(K.channels.sms);
      await pc("messages");

      // «Уведомления»: the tick, the three channels, a switch per kind we send; saved by its own «Сохранить»
      await card.getByRole("tab", { name: K.tabs.notify, exact: true }).click();
      await expect(page).toHaveURL(/\?tab=notify$/);
      const notify = card.getByRole("tabpanel", { name: K.tabs.notify, exact: true });
      await expect(notify.getByRole("heading", { level: 2, name: K.notifyTitle })).toBeVisible();
      await expect(notify.getByRole("group")).toHaveCount(3);
      await expect(notify.getByRole("group", { name: K.ads }).getByRole("checkbox", { name: K.adsNo })).not.toBeChecked();
      const channels = notify.getByRole("group", { name: K.chTitle }).getByRole("checkbox");
      await expect(channels).toHaveCount(3);
      for (const c of await channels.all()) await expect(c).toBeChecked();
      const kinds = notify.getByRole("group", { name: K.kindsTitle }).getByRole("switch");
      await expect(kinds).toHaveCount(4);
      for (const k of await kinds.all()) await expect(k).toBeChecked();
      await expect(kinds.first()).toHaveCSS("background-color", "rgb(255, 203, 0)");
      await pc("notify");
      const reminder = notify.getByRole("switch", { name: K.switches.reminder });
      await reminder.uncheck();
      await notify.getByRole("checkbox", { name: K.channels.email }).uncheck();
      await notify.getByRole("button", { name: A.save, exact: true }).click();
      await expect(notify.getByRole("status")).toHaveText(A.saved);
      // a tab's address is its own: after a reload the card is on this tab, with what was saved
      await page.reload();
      await hydrated(page);
      await expect(notify).toBeVisible();
      await expect(card.getByRole("tab", { name: K.tabs.notify, exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(reminder).not.toBeChecked();
      await expect(notify.getByRole("checkbox", { name: K.channels.email })).not.toBeChecked();
      await expect(notify.getByRole("switch", { name: K.switches.confirmation })).toBeChecked();
      // back as they were, for whoever comes after
      await reminder.check();
      await notify.getByRole("checkbox", { name: K.channels.email }).check();
      await notify.getByRole("button", { name: A.save, exact: true }).click();
      await expect(notify.getByRole("status")).toHaveText(A.saved);

      // «Файлы»: the note with the kinds and the size; nothing yet
      await card.getByRole("tab", { name: K.tabs.files, exact: true }).click();
      await expect(page).toHaveURL(/\?tab=files$/);
      const files = card.getByRole("tabpanel", { name: K.tabs.files, exact: true });
      await expect(files.locator(".cc-note")).toHaveText(K.filesNote("jpeg, jpg, png, gif, pdf, doc, docx, xls, xlsx, txt", 5, 20));
      await expect(files.getByText(K.filesNone)).toBeVisible();
      await expect(files.getByRole("button", { name: K.upload })).toHaveCSS("background-color", "rgb(255, 203, 0)");
      await pc("files-empty");
      // a small text file is uploaded and listed; a kind that is not allowed is named and not kept
      const picker = files.locator('input[type="file"]');
      const words = "E2E: файл клиента, строка первая\n";
      await picker.setInputFiles([
        { name: "e2e-заметка.txt", mimeType: "text/plain", buffer: Buffer.from(words, "utf8") },
        { name: "e2e.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") },
      ]);
      const listed = files.locator(".cc-files li");
      await expect(listed).toHaveCount(1);
      await expect(listed).toContainText("e2e-заметка.txt");
      await expect(listed).toContainText("Owner (demo)");
      await expect(files.getByRole("alert")).toHaveText(K.fileNot("e2e.exe", K.fileBad.type));
      await expect(files.getByText(K.filesNone)).toHaveCount(0);
      await pc("files");
      // downloaded: under its own name, with its own bytes
      const link = listed.getByRole("link", { name: K.download });
      const href = (await link.getAttribute("href"))!;
      expect(href).toMatch(/^\/admin\/clients\/[0-9a-f-]{36}\/files\/[0-9a-f-]{36}$/);
      const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
      expect(download.suggestedFilename()).toBe("e2e-заметка.txt");
      expect(readFileSync(await download.path(), "utf8")).toBe(words);
      // the route: always a download, never sniffed, kept by no cache; and nothing without a login
      const res = await page.request.get(href);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename="e2e-_______\.txt"; filename\*=UTF-8''e2e-%D0%B7/);
      expect(res.headers()["x-content-type-options"]).toBe("nosniff");
      expect(res.headers()["content-type"]).toBe("text/plain");
      expect(res.headers()["cache-control"]).toContain("no-store");
      // (a context of its own takes this file's login unless it is told to have none)
      const anon = await browser.newContext({ baseURL: info.project.use.baseURL, storageState: { cookies: [], origins: [] } });
      for (const url of [href, href.replace(/\/files\/.*$/, "/photo")]) {
        const refused = await anon.request.get(url, { maxRedirects: 0 });
        expect(refused.status(), url).toBe(307);
        expect(refused.headers().location, url).toContain("/admin/login");
      }
      // an upload from another site's page is refused, login or not
      const foreign = await page.request.post(href.replace(/\/[0-9a-f-]{36}$/, ""), { headers: { origin: "https://example.test" }, multipart: { file: { name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("x") } } });
      expect(foreign.status()).toBe(403);
      await anon.close();
      // deleted, after a question
      await listed.getByRole("button", { name: K.fileDelete("e2e-заметка.txt") }).click();
      const gone = page.getByRole("alertdialog", { name: K.fileDelete("e2e-заметка.txt") });
      await expect(gone).toContainText(K.fileAsk("e2e-заметка.txt"));
      await gone.getByRole("button", { name: A.remove, exact: true }).click();
      await expect(listed).toHaveCount(0);
      await expect(files.getByText(K.filesNone)).toBeVisible();
      expect((await page.request.get(href)).status()).toBe(404);
      await expectNoSideScroll(page);

      // a client with no history is deleted for good: asked first, then back in the list without him
      await card.getByRole("button", { name: A.close }).click();
      await page.waitForURL(LIST_URL);
      await page.getByRole("button", { name: C.add }).click();
      const sheet = page.getByRole("dialog", { name: A.visit.newClient });
      await sheet.getByRole("textbox", { name: A.visit.name }).fill("E2E Udalit");
      await sheet.getByRole("button", { name: C.add }).click();
      await page.waitForURL(CARD_URL);
      await hydrated(page);
      const temp = cardOf(page, "E2E Udalit");
      await temp.getByRole("button", { name: A.remove, exact: true }).click();
      await del.getByRole("button", { name: K.deleteYes }).click();
      await page.waitForURL(LIST_URL);
      await expect(temp).toBeHidden();
      await search.fill("E2E Udalit");
      await expect(page.getByText(C.nothing)).toBeVisible();
    });
  });
});
