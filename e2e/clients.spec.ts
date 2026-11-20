import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { TABS } from "../src/app/admin/(app)/clients/card-fields";
import { readXlsx } from "../src/lib/xlsx";
import { OUT } from "./env";
import { A, asOwner, expect, expectNoSideScroll, hydrated, nextWorkday, smallTargets, test, toast } from "./helpers";

/**
 * «Клиенты», the client base in the admin, and the bar that now holds four
 * sections and «Ещё». The clients are the demo ones (tools/seed-demo.mjs:
 * «Demo client N», +372 5555 09NN): fake, as everything here. Each phone
 * works on its own client, so the two runs do not meet.
 *
 * A client's card (the owner, 19.11.2026): a page on a phone, a 900px
 * drawer over the list on a wide screen, seven tabs. Its screenshots are
 * e2e/.out/screens/<phone>-client-card.png and pc-client-<tab>.png.
 *
 * The client base in full (the owner, 19.11.2026): from 900px the
 * segments, the conditions, the column chooser, sorting, «Действия» with a
 * mass message, a category and deleting, and the export to Excel; a phone
 * takes only the segments. Its screenshots are pc-clients-<what>.png and
 * <phone>-clients-list.png. The file the export test downloads lives in
 * the browser's own temporary folder and is gone with it.
 */
const shot = async (page: Page, name: string, fullPage = true) => {
  const body = await page.screenshot({ fullPage, path: path.join(OUT, "screens", `${test.info().project.name}-cl-${name}.png`) });
  await test.info().attach(`cl-${name}`, { body, contentType: "image/png" });
};
const C = A.clients;
const K = C.card;
/** The words of the client base in full: the segments, the conditions, the table, the bottom bar. */
const BASE = C.base;
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
    await expect(others).toHaveText([A.nav.staff, A.nav.schedule, A.nav.services, A.nav.catalogue, A.nav.analytics, A.nav.records, A.nav.reviews, A.nav.visits, A.nav.messages, A.nav.changes, A.sale.title]);
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

  test("the segments on a phone: one narrows the list, picked again it is taken off; nothing scrolls the page sideways", async ({ page }, info) => {
    await page.goto("/admin/clients");
    await hydrated(page);
    await expect(rows(page)).toHaveCount(25);
    const total = Number((await count(page).innerText()).replace(/\D/g, ""));
    const segs = page.getByRole("group", { name: BASE.segments });
    await expect(segs.getByRole("button")).toHaveText([BASE.segment.new, BASE.segment.returning, BASE.segment.lost]);
    // a phone keeps its simple list: no conditions, no «Найти», no table, no «Действия», no Excel
    for (const name of [BASE.find, BASE.actions, BASE.excel, BASE.byVisits, BASE.clear]) await expect(page.getByRole("button", { name })).toBeHidden();
    await expect(page.locator(".cl-table:visible")).toHaveCount(0);
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);

    // «Новые»: the demo clients whose first visit is today (tools/seed-demo.mjs); the ones booked for another day are not
    const fresh = segs.getByRole("button", { name: BASE.segment.new });
    await fresh.click();
    await expect(fresh).toHaveAttribute("aria-pressed", "true");
    await expect(fresh).toHaveCSS("background-color", "rgb(255, 203, 0)");
    // (the line says «Найдено» at once and its number when the answer comes)
    await expect(count(page)).toHaveText(/^\D+\d+$/);
    await expect(count(page)).not.toHaveText(C.count(total, false));
    await expect(count(page)).not.toHaveText(C.count(total, true));
    const found = Number((await count(page).innerText()).replace(/\D/g, ""));
    expect(found).toBeGreaterThan(0);
    expect(found).toBeLessThan(total);
    await expect(count(page)).toHaveText(C.count(found, true));
    await expect(rows(page).first()).toBeVisible();
    // what was picked is not in the address
    expect(new URL(page.url()).search).toBe("");
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    // (what the phone shows, not the whole page)
    const body = await page.screenshot({ path: path.join(OUT, "screens", `${info.project.name}-clients-list.png`) });
    await info.attach("clients-list", { body, contentType: "image/png" });

    // «Потерянные»: nobody in the demo has gone 60 days without a visit; the other segment is no longer the picked one
    const lost = segs.getByRole("button", { name: BASE.segment.lost });
    await lost.click();
    await expect(page.getByText(C.nothing)).toBeVisible();
    await expect(lost).toHaveAttribute("aria-pressed", "true");
    await expect(fresh).toHaveAttribute("aria-pressed", "false");
    await expectNoSideScroll(page);
    // picked again, it is taken off: everybody is back
    await lost.click();
    await expect(lost).toHaveAttribute("aria-pressed", "false");
    await expect(count(page)).toHaveText(C.count(total, false));
    await expect(rows(page)).toHaveCount(25);
    // «Сбросить поиск» takes a segment off too
    await lost.click();
    await page.getByRole("button", { name: C.reset }).click();
    await expect(lost).toHaveAttribute("aria-pressed", "false");
    await expect(count(page)).toHaveText(C.count(total, false));
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
      // «Клиенты» is a group, open on its page «Клиентская база»; «Отчёты», «Сотрудники» and «Товары» are the other groups, shut
      await expect(bar(page).getByRole("link")).toHaveText([A.nav.clientBase, A.nav.services, A.nav.requests, A.nav.invoices, A.nav.account]);
      await expect(bar(page).getByRole("button")).toHaveText([A.nav.reports, A.nav.team, A.nav.clients, A.nav.goods, A.nav.settings]);
      await expect(bar(page).getByRole("link", { name: A.nav.clientBase })).toHaveAttribute("aria-current", "page");
      const cols = BASE.cols;
      // a tick column, the name, the seven columns a login may hide, and the cog's own cell
      await expect(page.locator(".cl-table thead th[data-col]")).toHaveText([cols.name, cols.phone, cols.email, cols.sold, cols.visits, cols.discount, cols.last, cols.first]);
      await expect(page.locator(".cl-table tbody tr")).toHaveCount(25);
      await expect(page.locator(".cl-item:visible")).toHaveCount(0);
      await expectNoSideScroll(page);
      await page.screenshot({ path: path.join(OUT, "screens", "pc-cl-list.png") });

      // a small laptop: the eight columns do not fit beside the sidebar, so the table scrolls inside its sheet,
      // never the page; the cog stays at the sheet's right end
      await page.setViewportSize({ width: 1024, height: 768 });
      await expect(page.locator(".cl-table thead th[data-col]")).toHaveCount(8);
      await expectNoSideScroll(page);
      const sheet = page.locator(".cl-card:visible");
      expect(await sheet.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);
      const cog = page.getByRole("button", { name: BASE.columns });
      const [cogBox, sheetBox] = await Promise.all([cog.boundingBox(), sheet.boundingBox()]);
      expect(Math.round(sheetBox!.x + sheetBox!.width - (cogBox!.x + cogBox!.width))).toBeLessThanOrEqual(8);
      await sheet.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
      await expect(page.locator('.cl-table thead th[data-col="first"]')).toBeInViewport();
      expect(Math.round((await cog.boundingBox())!.x)).toBe(Math.round(cogBox!.x));
      await sheet.evaluate((el) => el.scrollTo({ left: 0 }));
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
      await expect(page.locator(".adm-more .adm-item:visible")).toHaveText([A.nav.staff, A.nav.schedule, A.nav.services, A.nav.catalogue, A.nav.analytics, A.nav.records, A.nav.reviews, A.nav.visits, A.nav.messages, A.nav.changes, A.sale.title]);
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
      // confirmation, reminder, moved, cancelled, and since 20.11 the birthday greeting and the no-show invitation
      await expect(kinds).toHaveCount(6);
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

    test("the client base in full: its layout, a segment, conditions with «Найти» and the bin, the columns, a sort, a category and a message for the ticked rows, the export, deleting", async ({ page, browser }, info) => {
      test.skip(info.project.name !== "android", "one wide run is enough");
      test.setTimeout(240_000);
      const pc = (what: string) => page.screenshot({ path: path.join(OUT, "screens", `pc-clients-${what}.png`) });
      const cols = BASE.cols;
      await page.goto("/admin/clients");
      await hydrated(page);
      const table = page.locator(".cl-table");
      const trs = table.locator("tbody tr");
      const heads = table.locator("thead th[data-col]");
      const head = (col: string) => table.locator(`thead th[data-col="${col}"]`);
      const names = () => trs.locator("td.c-name a").allInnerTexts();
      const shown = page.locator(".cb-shown");
      /** The bar's count on the first page of a list of `n` clients. */
      const first = (n: number) => BASE.shown(1, Math.min(25, n), n);
      /** «Показаны результаты с 1 до 25 из N»: N */
      const totalOf = async () => Number(/(\d+)\D*$/.exec(await shown.innerText())![1]);
      /** A server action answered: what was clicked is kept. */
      const answered = () => page.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("/admin/clients") && res.ok());

      /* ---- the layout, as the board has it; the controls in the new style ---- */
      const title = page.getByRole("heading", { level: 1, name: BASE.title });
      const excel = page.getByRole("button", { name: BASE.excel });
      const add = page.getByRole("button", { name: C.add });
      const search = page.getByRole("searchbox", { name: C.search });
      const segs = page.getByRole("group", { name: BASE.segments });
      const byVisits = page.getByRole("button", { name: BASE.byVisits });
      const byClients = page.getByRole("button", { name: BASE.byClients });
      const bin = page.getByRole("button", { name: BASE.clear });
      const find = page.getByRole("button", { name: BASE.find, exact: true });
      const bar = page.locator(".cb-bar");
      const actions = bar.getByRole("button", { name: BASE.actions });
      const size = bar.getByRole("combobox", { name: BASE.perPageLabel });
      const pager = bar.getByRole("navigation", { name: C.pages });
      await expect(title).toBeVisible();
      // a client with no visit and no purchase, for what needs one below: a condition he falls out of, and deleting
      const nobody = "E2E Massovo";
      await add.click();
      const sheet = page.getByRole("dialog", { name: A.visit.newClient });
      await sheet.getByRole("textbox", { name: A.visit.name }).fill(nobody);
      await sheet.getByRole("button", { name: C.add }).click();
      await page.waitForURL(CARD_URL);
      await hydrated(page);
      await cardOf(page, nobody).getByRole("button", { name: A.close }).click();
      await page.waitForURL(LIST_URL);
      await expect(cardOf(page, nobody)).toBeHidden();
      await expect(title).toHaveCSS("font-size", "20px");
      await expect(title).toHaveCSS("font-weight", "500");
      await expect(page.locator(".cb-crumb")).toHaveText(C.title);
      await expect(segs.getByRole("button")).toHaveText([BASE.segment.new, BASE.segment.returning, BASE.segment.lost]);
      await expect(heads).toHaveText([cols.name, cols.phone, cols.email, cols.sold, cols.visits, cols.discount, cols.last, cols.first]);
      await expect(trs).toHaveCount(25);
      const total = await totalOf();
      expect(total).toBeGreaterThan(25);
      await expect(shown).toHaveText(first(total));
      // 32px controls with 8px corners, a 1px line and 12px/500 words; yellow only for «Добавить клиента» and «Найти»
      for (const b of [excel, byVisits, byClients, bin, find, actions]) {
        expect((await b.boundingBox())!.height, await b.innerText()).toBe(32);
        await expect(b).toHaveCSS("border-radius", "8px");
        await expect(b).toHaveCSS("border-top-width", "1px");
        await expect(b).toHaveCSS("font-size", "12px");
        await expect(b).toHaveCSS("font-weight", "500");
      }
      for (const b of [excel, byVisits, bin, actions]) {
        await expect(b).toHaveCSS("border-top-color", "rgb(224, 227, 235)");
        await expect(b).toHaveCSS("background-color", "rgb(255, 255, 255)");
      }
      for (const b of [add, find]) await expect(b).toHaveCSS("background-color", "rgb(255, 203, 0)");
      expect((await add.boundingBox())!.height).toBe(32);
      expect((await byVisits.boundingBox())!.width).toBe(224);
      for (const field of [search, size]) {
        expect((await field.boundingBox())!.height).toBe(32);
        await expect(field).toHaveCSS("border-radius", "8px");
        await expect(field).toHaveCSS("border-top-color", "rgb(224, 227, 235)");
      }
      // what sits where: the head, the search across the page, the segments, the filters with «Найти» at the far
      // right, the table, and the bar resting on the bottom of the screen
      const y = async (l: ReturnType<typeof page.locator>) => (await l.first().boundingBox())!.y;
      const order = [await y(title), await y(search), await y(segs), await y(byVisits), await y(table), await y(bar)];
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      const searchBox = (await search.boundingBox())!;
      expect([Math.round(searchBox.x), Math.round(searchBox.x + searchBox.width)]).toEqual([220 + 24, 1440 - 24]);
      const [excelBox, addBox, findBox, binBox, clientsBox] = await Promise.all([excel, add, find, bin, byClients].map((b) => b.boundingBox()));
      expect(Math.round(addBox!.x + addBox!.width)).toBe(1440 - 24);
      expect(excelBox!.x + excelBox!.width).toBeLessThan(addBox!.x);
      expect(Math.round(findBox!.x + findBox!.width)).toBe(1440 - 24);
      expect(binBox!.x).toBeGreaterThan(clientsBox!.x + clientsBox!.width);
      // the table: a tick column, 50px rows, the name as a link, a round cog at the head's right end
      expect(Math.round((await table.locator("thead tr").boundingBox())!.height)).toBe(50);
      expect(Math.round((await trs.first().boundingBox())!.height)).toBe(50);
      expect(Math.round((await trs.nth(7).boundingBox())!.height)).toBe(50);
      await expect(trs.first().getByRole("checkbox")).toBeVisible();
      const cog = page.getByRole("button", { name: BASE.columns });
      await expect(cog).toHaveCSS("border-radius", "50%");
      expect(await cog.boundingBox()).toMatchObject({ width: 32, height: 32 });
      const tableBox = (await page.locator(".cl-card:visible").boundingBox())!;
      expect(Math.round(tableBox.x + tableBox.width - ((await cog.boundingBox())!.x + 32))).toBeLessThanOrEqual(8);
      // a visit's date as the board writes it: «19 ноября 2026 г. в 10:00»
      // (only the clients whose visit has begun have one; early in the day nobody may)
      for (const when of (await table.locator('tbody td[data-col="last"]').allInnerTexts()).filter(Boolean).slice(0, 3)) expect(when).toMatch(/^\d{1,2}\s\S+\s\d{4}\sг\.\sв\s\d{2}:\d{2}$/);
      // the bar: the page size, the pager, the count, «Действия»; it stays at the bottom while the table scrolls
      await expect(bar).toHaveCSS("position", "sticky");
      const barBox = (await bar.boundingBox())!;
      expect(Math.round(barBox.y + barBox.height)).toBe(900);
      await expect(size).toHaveValue("25");
      await expect(size.locator("option")).toHaveText(["10", "25", "50", "100"]);
      await expect(pager.getByRole("button").first()).toHaveText(C.prev);
      await expect(pager.getByRole("button").last()).toHaveText(BASE.forward);
      await expect(pager.getByRole("button", { name: BASE.pageN(1) })).toHaveAttribute("aria-current", "page");
      const [sizeBox, pagerBox, shownBox, actionsBox] = await Promise.all([size, pager, shown, actions].map((b) => b.boundingBox()));
      expect(sizeBox!.x).toBeLessThan(pagerBox!.x);
      expect(pagerBox!.x + pagerBox!.width).toBeLessThan(shownBox!.x);
      expect(shownBox!.x + shownBox!.width).toBeLessThan(actionsBox!.x);
      expect(Math.round(actionsBox!.x + actionsBox!.width)).toBe(1440 - 24);
      await expectNoSideScroll(page);
      await pc("list");
      await page.evaluate(() => window.scrollTo(0, 600));
      await expect(trs.nth(12)).toBeInViewport();
      expect(Math.round((await bar.boundingBox())!.y + barBox.height)).toBe(900);
      await page.evaluate(() => window.scrollTo(0, 0));

      /* ---- the pager and the page size ---- */
      const firstName = (await names())[0];
      await pager.getByRole("button", { name: BASE.forward }).click();
      await expect(shown).toHaveText(BASE.shown(26, Math.min(50, total), total));
      await expect(pager.getByRole("button", { name: BASE.pageN(2) })).toHaveAttribute("aria-current", "page");
      await expect(trs.first().locator("td.c-name a")).not.toHaveText(firstName);
      await pager.getByRole("button", { name: BASE.pageN(1) }).click();
      await expect(shown).toHaveText(first(total));
      await size.selectOption("10");
      await expect(trs).toHaveCount(10);
      await expect(shown).toHaveText(BASE.shown(1, 10, total));
      await size.selectOption("100");
      await expect(trs).toHaveCount(Math.min(100, total));
      await size.selectOption("25");
      await expect(trs).toHaveCount(25);

      /* ---- a segment narrows the list and fills its conditions in; picked again, it is taken off ---- */
      const conds = page.getByRole("list", { name: BASE.conds }).getByRole("group");
      const fresh = segs.getByRole("button", { name: BASE.segment.new });
      await fresh.click();
      await expect(fresh).toHaveAttribute("aria-pressed", "true");
      await expect(conds).toHaveCount(2);
      await expect(shown).not.toHaveText(first(total));
      const fewer = await totalOf();
      expect(fewer).toBeGreaterThan(0);
      expect(fewer).toBeLessThan(total);
      // «a visit in the last 30 days» and «none before them», joined by «И»
      await expect(conds.first().getByRole("combobox")).toHaveValue("yes");
      await expect(conds.nth(1).getByRole("combobox")).toHaveValue("no");
      await expect(conds.first().getByLabel(BASE.dateTo, { exact: true })).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
      await expect(page.getByRole("group", { name: BASE.join }).getByRole("button", { name: BASE.and, exact: true })).toHaveAttribute("aria-pressed", "true");
      expect(new URL(page.url()).search).toBe("");
      await fresh.click();
      await expect(fresh).toHaveAttribute("aria-pressed", "false");
      await expect(conds).toHaveCount(0);
      await expect(shown).toHaveText(first(total));

      /* ---- a condition from each dropdown; «Найти» asks, the bin takes them off ---- */
      await byVisits.click();
      const visitsMenu = page.getByRole("menu", { name: BASE.byVisits });
      await expect(visitsMenu).toHaveCSS("border-radius", "12px");
      await expect(visitsMenu).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await expect(visitsMenu.getByRole("menuitem")).toHaveText([BASE.kinds.hasVisits, BASE.kinds.visitStatus, BASE.kinds.visitCount, BASE.kinds.period, BASE.kinds.barber, BASE.kinds.services, BASE.kinds.serviceSum]);
      await visitsMenu.getByRole("menuitem", { name: BASE.kinds.visitCount }).click();
      await byClients.click();
      const clientsMenu = page.getByRole("menu", { name: BASE.byClients });
      await expect(clientsMenu.getByRole("menuitem")).toHaveText([BASE.kinds.gender, BASE.kinds.category, BASE.kinds.sold, BASE.kinds.importance, BASE.kinds.birthday, BASE.kinds.age, BASE.kinds.massSent, BASE.kinds.noOnline]);
      await clientsMenu.getByRole("menuitem", { name: BASE.kinds.noOnline }).click();
      await expect(conds).toHaveCount(2);
      const visitCount = page.getByRole("group", { name: BASE.kinds.visitCount });
      const noOnline = page.getByRole("group", { name: BASE.kinds.noOnline });
      // a row with its own fields and a cross; nothing is asked before «Найти»
      await expect(visitCount.getByRole("button", { name: BASE.condRemove(BASE.kinds.visitCount) })).toBeVisible();
      await expect(shown).toHaveText(first(total));
      // a condition that is not whole is marked, and nothing is asked
      await find.click();
      await expect(page.getByRole("alert").filter({ hasText: BASE.condBad })).toBeVisible();
      await expect(visitCount).toHaveClass(/is-bad/);
      await expect(shown).toHaveText(first(total));
      const from = visitCount.getByRole("textbox", { name: BASE.from, exact: true });
      expect((await from.boundingBox())!.height).toBe(32);
      await from.fill("1");
      await noOnline.getByRole("combobox").selectOption("no");
      await find.click();
      await expect(page.getByRole("alert").filter({ hasText: BASE.condBad })).toHaveCount(0);
      await expect(shown).not.toHaveText(first(total));
      const visited = await totalOf();
      expect(visited).toBeGreaterThan(0);
      expect(visited).toBeLessThan(total);
      for (const n of await table.locator('tbody td[data-col="visits"]').allInnerTexts()) expect(Number(n)).toBeGreaterThanOrEqual(1);
      await expectNoSideScroll(page);
      await pc("filters");
      // «Или» for the whole set: with a visit, or allowed to book online, is everybody
      const join = page.getByRole("group", { name: BASE.join });
      await join.getByRole("button", { name: BASE.or, exact: true }).click();
      await expect(shown).toHaveText(first(visited));
      await find.click();
      await expect(shown).toHaveText(first(total));
      await join.getByRole("button", { name: BASE.and, exact: true }).click();
      await find.click();
      await expect(shown).toHaveText(first(visited));
      // the cross takes one condition off (asked again at «Найти»), the bin all of them at once
      await noOnline.getByRole("button", { name: BASE.condRemove(BASE.kinds.noOnline) }).click();
      await expect(conds).toHaveCount(1);
      await expect(join).toHaveCount(0);
      await bin.click();
      await expect(conds).toHaveCount(0);
      await expect(shown).toHaveText(first(total));

      /* ---- the columns: picked with the cog, kept for the login ---- */
      await cog.click();
      const colMenu = page.getByRole("menu", { name: BASE.columns });
      await expect(colMenu.getByRole("menuitemcheckbox")).toHaveText([cols.phone, cols.email, cols.sold, cols.visits, cols.discount, cols.last, cols.first]);
      for (const item of await colMenu.getByRole("menuitemcheckbox").all()) await expect(item).toHaveAttribute("aria-checked", "true");
      await pc("columns");
      await Promise.all([answered(), colMenu.getByRole("menuitemcheckbox", { name: cols.email }).click()]);
      await expect(colMenu.getByRole("menuitemcheckbox", { name: cols.email })).toHaveAttribute("aria-checked", "false");
      const without = [cols.name, cols.phone, cols.sold, cols.visits, cols.discount, cols.last, cols.first];
      await expect(heads).toHaveText(without);
      await expect(table.locator('td[data-col="email"]')).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(colMenu).toBeHidden();
      await page.reload();
      await hydrated(page);
      await expect(heads).toHaveText(without);
      await expect(table.locator('td[data-col="email"]')).toHaveCount(0);

      /* ---- a click on a head sorts; again, the other way round ---- */
      await expect(head("name")).toHaveAttribute("aria-sort", "ascending");
      const az = await names();
      await head("name").getByRole("button").click();
      await expect(head("name")).toHaveAttribute("aria-sort", "descending");
      await expect(trs.first().locator("td.c-name a")).not.toHaveText(az[0]);
      expect(await names()).not.toEqual(az);
      await head("visits").getByRole("button").click();
      await expect(head("visits")).toHaveAttribute("aria-sort", "descending");
      await expect(head("name")).not.toHaveAttribute("aria-sort", /./);
      await expect(trs.first().locator('td[data-col="visits"]')).not.toHaveText("0");
      const counts = (await table.locator('tbody td[data-col="visits"]').allInnerTexts()).map(Number);
      expect([...counts].sort((a, b) => b - a)).toEqual(counts);
      // columns that are not sorted by have no button: the phone, the discount
      await expect(head("phone").getByRole("button")).toHaveCount(0);
      await head("name").getByRole("button").click();
      await expect(head("name")).toHaveAttribute("aria-sort", "ascending");
      await expect(trs.first().locator("td.c-name a")).toHaveText(az[0]);

      /* ---- «Действия»: for the whole list, or for the ticked rows; it says first for how many ---- */
      await search.fill("Demo client 3");
      await expect(trs.first()).toContainText("Demo client 3");
      await expect(trs).not.toHaveCount(25);
      const some = await totalOf();
      const actMenu = page.getByRole("menu", { name: BASE.actions });
      await actions.click();
      await expect(actMenu.locator(".cb-who")).toHaveText(BASE.whole(some));
      await expect(actMenu.getByRole("menuitem")).toHaveText([BASE.send, BASE.addLabel, BASE.del]);
      await page.keyboard.press("Escape");
      // two rows are ticked; the head's own tick is neither on nor off
      const two = (await names()).slice(0, 2);
      await trs.nth(0).getByRole("checkbox", { name: BASE.tick(two[0]) }).check();
      await trs.nth(1).getByRole("checkbox", { name: BASE.tick(two[1]) }).check();
      await expect(trs.nth(0)).toHaveClass(/is-ticked/);
      expect(await table.getByRole("checkbox", { name: BASE.tickAll }).evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);
      await actions.click();
      await expect(actMenu.locator(".cb-who")).toHaveText(BASE.chosen(2));
      // the menu opens above the bar, white, with 12px corners
      await expect(actMenu).toHaveCSS("border-radius", "12px");
      expect((await actMenu.boundingBox())!.y + (await actMenu.boundingBox())!.height).toBeLessThanOrEqual((await actions.boundingBox())!.y);
      await pc("actions");

      // «Добавить в категорию»: a new word, on both
      const label = "E2E база";
      await actMenu.getByRole("menuitem", { name: BASE.addLabel }).click();
      const labelBox = page.getByRole("dialog", { name: BASE.addLabel });
      await expect(labelBox).toContainText(BASE.chosen(2));
      await expect(labelBox).toHaveCSS("border-radius", "12px");
      await labelBox.getByRole("button", { name: A.add, exact: true }).click();
      await expect(labelBox.getByRole("alert")).toHaveText(A.visit.invalid("labels"));
      await labelBox.getByRole("combobox", { name: BASE.labelPick }).fill(label);
      await labelBox.getByRole("button", { name: A.add, exact: true }).click();
      await expect(toast(page)).toHaveText(BASE.labelDone({ label, added: 2, had: 0, full: 0 }));
      await expect(labelBox).toBeHidden();
      await expect(trs.filter({ has: page.locator(".adm-tag", { hasText: label }) })).toHaveCount(2);
      expect(await trs.filter({ has: page.locator(".adm-tag", { hasText: label }) }).locator("td.c-name a").allInnerTexts()).toEqual(two);
      // the ticks went with the answer; and the category is a condition now
      await expect(table.getByRole("checkbox", { name: BASE.tickAll })).not.toBeChecked();
      await byClients.click();
      await clientsMenu.getByRole("menuitem", { name: BASE.kinds.category }).click();
      await page.getByRole("group", { name: BASE.kinds.category }).getByRole("combobox").selectOption(label);
      await find.click();
      await expect(trs).toHaveCount(2);
      await expect(shown).toHaveText(BASE.shown(1, 2, 2));
      expect(await names()).toEqual(two);

      // «Отправить сообщение»: for the whole filtered list this time, the two of them
      await actions.click();
      await expect(actMenu.locator(".cb-who")).toHaveText(BASE.whole(2));
      await actMenu.getByRole("menuitem", { name: BASE.send }).click();
      const sendBox = page.getByRole("dialog", { name: BASE.send });
      await expect(sendBox).toContainText(BASE.whole(2));
      // who gets it by each channel: both have a phone, neither an e-mail, and nobody's notifications are on
      const line = (ch: string) => sendBox.locator(`small[data-channel="${ch}"]`);
      await expect(line("sms")).toHaveText(BASE.gets(2));
      await expect(line("email")).toHaveText(`${BASE.gets(0)} · ${BASE.leftNone.email}: 2`);
      await expect(line("push")).toHaveText(`${BASE.gets(0)} · ${BASE.leftNone.push}: 2`);
      const sms = sendBox.getByRole("checkbox", { name: K.channels.sms });
      await expect(sendBox.getByRole("checkbox", { name: K.channels.email })).toBeDisabled();
      await expect(sendBox.getByRole("checkbox", { name: K.channels.push })).toBeDisabled();
      const sendBtn = sendBox.getByRole("button", { name: K.sendBtn, exact: true });
      await expect(sendBtn).toHaveCSS("background-color", "rgb(255, 203, 0)");
      const words = "E2E: в субботу стрижка со скидкой 10 %";
      await sendBtn.click();
      await expect(sendBox.getByRole("alert")).toHaveText(K.msgNeedText);
      await sendBox.getByRole("textbox", { name: K.msgText }).fill(words);
      await expect(sendBox.getByText(K.msgCount(words.length, 1))).toBeVisible();
      await sendBtn.click();
      await expect(sendBox.getByRole("alert")).toHaveText(K.msgNeedChannel);
      await sms.check();
      // the parts: one a message, two in all
      await expect(line("sms")).toHaveText(`${BASE.gets(2)} · ${BASE.smsParts(1, 2)}`);
      await pc("send");
      // the second question, by its numbers; «Назад» goes back with the words kept, and nothing is queued
      await sendBtn.click();
      const sure = page.getByRole("alertdialog", { name: BASE.confirmTitle });
      await expect(sure).toContainText(BASE.confirm({ sms: 2, parts: 2, email: 0, push: 0 }));
      await expect(sure).toContainText(BASE.whole(2));
      await sure.getByRole("button", { name: A.back, exact: true }).click();
      await expect(sure).toBeHidden();
      await expect(sendBox.getByRole("textbox", { name: K.msgText })).toHaveValue(words);
      await expect(sms).toBeChecked();
      await sendBtn.click();
      await sure.getByRole("button", { name: BASE.confirmYes }).click();
      await expect(toast(page)).toHaveText(BASE.queued({ sms: 2, email: 0, push: 0 }));
      await expect(sure).toBeHidden();
      await expect(sendBox).toBeHidden();
      // each of the two is marked: «Получал рассылку» finds them, and only them
      await bin.click();
      await expect(conds).toHaveCount(0);
      await search.fill("");
      await expect(shown).toHaveText(first(total));
      await byClients.click();
      await clientsMenu.getByRole("menuitem", { name: BASE.kinds.massSent }).click();
      await find.click();
      await expect(trs).toHaveCount(2);
      expect(await names()).toEqual(two);
      // and it is among the client's own messages, in the queue
      await trs.first().getByRole("link", { name: two[0], exact: true }).click();
      await page.waitForURL(CARD_URL);
      await hydrated(page);
      const card = cardOf(page, two[0]);
      await card.getByRole("tab", { name: K.tabs.messages, exact: true }).click();
      const sent = card.getByRole("tabpanel", { name: K.tabs.messages, exact: true }).locator(".cc-msgs tbody tr");
      await expect(sent).toHaveCount(1);
      await expect(sent.locator(".txt")).toHaveText(words);
      await expect(sent.locator(".kind")).toHaveText(K.kinds.mass);
      await expect(sent.locator(".st")).toHaveText(K.statuses.queued);
      await expect(sent.locator(".ch")).toHaveText(K.channels.sms);
      await card.getByRole("button", { name: A.close }).click();
      await page.waitForURL(LIST_URL);
      await bin.click();
      await expect(shown).toHaveText(first(total));

      /* ---- «Операции с Excel»: the list as a real file, with the columns as they are chosen ---- */
      await excel.click();
      const excelMenu = page.getByRole("menu", { name: BASE.excel });
      const importItem = excelMenu.getByRole("menuitem", { name: BASE.importXlsx });
      await expect(importItem).toBeDisabled();
      await expect(importItem).toContainText(BASE.soon);
      const [download] = await Promise.all([page.waitForEvent("download"), excelMenu.getByRole("menuitem", { name: BASE.exportXlsx }).click()]);
      expect(download.suggestedFilename()).toMatch(/^rempire-clients-\d{4}-\d{2}-\d{2}\.xlsx$/);
      await expect(toast(page)).toHaveText(BASE.exported(total));
      // (the file is in the browser's own temporary folder: read from there, never copied into the repo)
      const file = readXlsx(new Uint8Array(readFileSync(await download.path())));
      expect(file.name).toBe(A.nav.clients);
      // the e-mail was hidden with the cog, so it is not in the file either
      expect(file.rows[0]).toEqual([cols.name, cols.phone, BASE.xlsx.sold, cols.visits, BASE.xlsx.discount, cols.last, cols.first]);
      expect(file.rows).toHaveLength(total + 1);
      const row = file.rows.find((r) => r[0] === two[0])!;
      expect(row[1]).toMatch(/^\+3725555\d{4}$/);
      expect(typeof row[2]).toBe("number");
      expect(row[3]).toBeGreaterThanOrEqual(1);
      expect(row[4]).toBe(0);
      // with a search the file has only what the list has
      await search.fill("Demo client 3");
      await expect(shown).toHaveText(first(some));
      await excel.click();
      const [part] = await Promise.all([page.waitForEvent("download"), excelMenu.getByRole("menuitem", { name: BASE.exportXlsx }).click()]);
      const partRows = readXlsx(new Uint8Array(readFileSync(await part.path()))).rows;
      expect(partRows).toHaveLength(some + 1);
      for (const r of partRows.slice(1)) expect(r[0]).toContain("Demo client 3");
      // the route itself: nothing without a login, and nothing for a request from another site's page
      const anon = await browser.newContext({ baseURL: info.project.use.baseURL, storageState: { cookies: [], origins: [] } });
      const origin = new URL(page.url()).origin;
      const refused = await anon.request.post("/admin/clients/export", { headers: { origin }, data: {}, maxRedirects: 0 });
      expect(refused.status()).toBe(307);
      expect(refused.headers().location).toContain("/admin/login");
      await anon.close();
      expect((await page.request.post("/admin/clients/export", { headers: { origin: "https://example.test" }, data: {} })).status()).toBe(403);
      const direct = await page.request.post("/admin/clients/export", { headers: { origin }, data: { q: "Demo client 3", label: "", page: 1 } });
      expect(direct.status()).toBe(200);
      expect(direct.headers()["content-type"]).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      expect(direct.headers()["cache-control"]).toContain("no-store");
      expect(direct.headers()["x-rows"]).toBe(String(some));

      /* ---- «Удалить из базы»: only who has no history; the answer says how many went and how many stayed ---- */
      await trs.first().getByRole("checkbox").check();
      await actions.click();
      await actMenu.getByRole("menuitem", { name: BASE.del }).click();
      const delBox = page.getByRole("alertdialog", { name: BASE.del });
      await expect(delBox).toContainText(BASE.chosen(1));
      await expect(delBox).toContainText(BASE.delAsk);
      await delBox.getByRole("button", { name: BASE.delYes }).click();
      // he has a visit: he stays, and it says why
      await expect(delBox.getByRole("status")).toHaveText(`${BASE.delDone(0)} ${BASE.delKept({ visits: 1, sales: 0, merged: 0 })}`);
      await expect(delBox.getByRole("button", { name: BASE.delYes })).toHaveCount(0);
      await delBox.getByRole("button", { name: A.close, exact: true }).click();
      await expect(shown).toHaveText(first(some));
      // the client with nothing to his name is deleted
      await search.fill(nobody);
      await expect(trs).toHaveCount(1);
      await trs.first().getByRole("checkbox").check();
      await actions.click();
      await actMenu.getByRole("menuitem", { name: BASE.del }).click();
      await delBox.getByRole("button", { name: BASE.delYes }).click();
      await expect(delBox.getByRole("status")).toHaveText(BASE.delDone(1));
      await delBox.getByRole("button", { name: A.close, exact: true }).click();
      await expect(page.getByText(C.nothing)).toBeVisible();
      await expect(bar).toBeHidden();

      // the e-mail column back, for whoever comes after; the list is one client shorter
      await page.getByRole("button", { name: C.reset }).click();
      await expect(shown).toHaveText(first(total - 1));
      await cog.click();
      await Promise.all([answered(), colMenu.getByRole("menuitemcheckbox", { name: cols.email }).click()]);
      await expect(heads).toHaveText([cols.name, cols.phone, cols.email, cols.sold, cols.visits, cols.discount, cols.last, cols.first]);
      await expectNoSideScroll(page);
    });
  });
});
