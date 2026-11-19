import path from "node:path";
import type { Page } from "@playwright/test";
import { OUT } from "./env";
import { A, asOwner, expect, expectNoSideScroll, hydrated, nextWorkday, smallTargets, test } from "./helpers";

/**
 * «Клиенты», the client base in the admin, and the bar that now holds four
 * sections and «Ещё». The clients are the demo ones (tools/seed-demo.mjs:
 * «Demo client N», +372 5555 09NN): fake, as everything here. Each phone
 * works on its own client, so the two runs do not meet.
 */
const shot = async (page: Page, name: string, fullPage = true) => {
  const body = await page.screenshot({ fullPage, path: path.join(OUT, "screens", `${test.info().project.name}-cl-${name}.png`) });
  await test.info().attach(`cl-${name}`, { body, contentType: "image/png" });
};
const C = A.clients;
const bar = (page: Page) => page.getByRole("navigation", { name: A.sections });
/** The rows of the list on a phone (:visible: a page left behind stays in the document, hidden). */
const rows = (page: Page) => page.locator(".cl-item:visible");
const count = (page: Page) => page.locator(".adm-cl p[role=status]:visible");
const part = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

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
    await expect(others).toHaveText([A.nav.staff, A.nav.services]);
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

  test("the list and its search; a client's card: a category and a note are kept, his visit is there", async ({ page }, info) => {
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

    // his card
    await rows(page).click();
    await page.waitForURL(/\/admin\/clients\/[0-9a-f-]{36}$/);
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
    // «back»: the list is as it was left, the search still in its field
    await page.goBack();
    await page.waitForURL(/\/admin\/clients$/);
    await expect(search).toHaveValue(/5555 09/);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText(name);
    await rows(page).click();
    await page.waitForURL(/\/admin\/clients\/[0-9a-f-]{36}$/);
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
    await expect(part(page, C.data).getByRole("textbox", { name: A.visit.name })).toHaveValue(name);
    // the history: the demo visit, on Renat's next working day, in the calendar's words; it opens its day in the calendar
    const visit = part(page, C.history).locator(".cl-visit").first();
    await expect(visit).toContainText("Renat");
    await expect(visit.locator(".cl-st")).toHaveText(A.visit.status.booked);
    await expect(visit).toHaveAttribute("href", `/admin?d=${nextWorkday("renat")}`);

    // a category, added as a chip; it saves by itself
    const cats = part(page, C.labels);
    await expect(cats.getByText(C.noLabels)).toBeVisible();
    await cats.getByRole("textbox", { name: C.labelNew }).fill(`  ${label} `);
    await cats.getByRole("button", { name: A.add, exact: true }).click();
    await expect(cats.locator(".cl-chip")).toHaveText([label]);
    await expect(cats.getByRole("status")).toContainText(A.saved);
    // the note
    const notes = part(page, C.note);
    await notes.getByRole("textbox", { name: C.note }).fill(note);
    await expect(notes.getByRole("status")).toContainText(A.saved);

    // both are there after a reload
    await page.reload();
    await hydrated(page);
    await expect(part(page, C.labels).locator(".cl-chip")).toHaveText([label]);
    await expect(part(page, C.note).getByRole("textbox", { name: C.note })).toHaveValue(note);
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    await shot(page, "card");

    // back in the list the category is a filter, and it finds him
    await page.locator(".adm-back:visible").click();
    await page.waitForURL(/\/admin\/clients$/);
    await hydrated(page);
    await page.getByRole("combobox", { name: C.label }).selectOption(label);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText(name);
    await expect(rows(page).locator(".adm-tag")).toHaveText([label]);
    await shot(page, "filtered");

    // the chip's cross takes the category off again
    await rows(page).click();
    await page.waitForURL(/\/admin\/clients\/[0-9a-f-]{36}$/);
    await hydrated(page);
    const again = part(page, C.labels);
    await again.getByRole("button", { name: C.labelRemove(label) }).click();
    await expect(again.locator(".cl-chip")).toHaveCount(0);
    await expect(again.getByRole("status")).toContainText(A.saved);
    // put back with Enter, so the other phone's run finds it among the ready ones, one tap away
    await again.getByRole("textbox", { name: C.labelNew }).fill(label);
    await again.getByRole("textbox", { name: C.labelNew }).press("Enter");
    await expect(again.locator(".cl-chip")).toHaveText([label]);
    await expect(again.getByRole("status")).toContainText(A.saved);
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
    await page.waitForURL(/\/admin\/clients\/[0-9a-f-]{36}$/);
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: who })).toBeVisible();
    await expect(part(page, C.data).getByRole("textbox", { name: A.visit.phone })).toHaveValue(`+372${phone.replace(" ", "")}`);
    await expect(part(page, C.history).getByText(C.noHistory)).toBeVisible();
    const card = page.url();

    // once more with the same phone: said in words, with the way to the client who has it
    await page.goto("/admin/clients");
    await hydrated(page);
    await page.getByRole("button", { name: C.add }).click();
    await sheet.getByRole("textbox", { name: A.visit.name }).fill(`${who} 2`);
    await sheet.getByRole("textbox", { name: A.visit.phone }).fill(`+372 ${phone}`);
    await sheet.getByRole("button", { name: C.add }).click();
    await expect(sheet.getByRole("alert")).toContainText(C.taken);
    await sheet.getByRole("link", { name: C.openHim }).click();
    await page.waitForURL(card);
    await expect(page.getByRole("heading", { level: 1, name: who, exact: true })).toBeVisible();
  });

  test.describe("on the narrowest phone", () => {
    test.use({ viewport: { width: 320, height: 640 } });

    test("the list, a card and «Ещё» fit 320 px", async ({ page }) => {
      for (const url of ["/admin/clients", "/admin/more"]) {
        await page.goto(url);
        await hydrated(page);
        await expectNoSideScroll(page);
        expect(await smallTargets(page), url).toEqual([]);
      }
      await page.goto("/admin/clients");
      await hydrated(page);
      await rows(page).first().click();
      await page.waitForURL(/\/admin\/clients\/[0-9a-f-]{36}$/);
      await hydrated(page);
      await expect(part(page, C.history)).toBeVisible();
      await expectNoSideScroll(page);
      expect(await smallTargets(page)).toEqual([]);
      await shot(page, "card-320");
    });
  });

  test.describe("on a wide screen", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("the sidebar lists every section; the list is a table; a card's parts stand side by side", async ({ page }, info) => {
      test.skip(info.project.name !== "android", "one wide run is enough");
      await page.goto("/admin/clients");
      await hydrated(page);
      // every section, and no «Ещё»
      await expect(bar(page).getByRole("link")).toHaveText([A.nav.calendar, A.nav.clients, A.nav.staff, A.nav.services, A.nav.requests, A.nav.invoices]);
      await expect(bar(page).getByRole("link", { name: A.nav.clients })).toHaveAttribute("aria-current", "page");
      const K = C.cols;
      await expect(page.locator(".cl-table thead th")).toHaveText([K.name, K.phone, K.email, K.visits, K.last, K.first, K.sold]);
      await expect(page.locator(".cl-table tbody tr")).toHaveCount(25);
      await expect(page.locator(".cl-item:visible")).toHaveCount(0);
      await expectNoSideScroll(page);
      await page.screenshot({ path: path.join(OUT, "screens", "pc-cl-list.png") });

      // a small laptop: the table still fits beside the sidebar
      await page.setViewportSize({ width: 1024, height: 768 });
      await expect(page.locator(".cl-table thead th:visible")).toHaveText([K.name, K.phone, K.visits, K.last, K.sold]);
      await expectNoSideScroll(page);
      expect(await page.locator(".cl-card").evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(OUT, "screens", "pc-cl-list-1024.png") });
      await page.setViewportSize({ width: 1440, height: 900 });

      await page.locator(".cl-table tbody a").first().click();
      await page.waitForURL(/\/admin\/clients\/[0-9a-f-]{36}$/);
      await hydrated(page);
      await expect(part(page, C.history)).toBeVisible();
      const [a, b] = await Promise.all([part(page, C.data).boundingBox(), part(page, C.labels).boundingBox()]);
      expect(b!.x).toBeGreaterThan(a!.x + a!.width - 1);
      await expectNoSideScroll(page);
      await page.screenshot({ fullPage: true, path: path.join(OUT, "screens", "pc-cl-card.png") });
      // «Ещё» by its address still works here: the same two rows
      await page.goto("/admin/more");
      await hydrated(page);
      await expect(page.locator(".adm-more .adm-item:visible")).toHaveText([A.nav.staff, A.nav.services]);
    });
  });
});
