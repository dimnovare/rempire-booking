import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { defaultRecords } from "../src/lib/admin/record-filter";
import { readXlsx } from "../src/lib/xlsx";
import { OUT } from "./env";
import { A, asOwner, demoId, expect, expectNoSideScroll, hydrated, smallTargets, tallinnDate, test, toast } from "./helpers";

/**
 * «Записи» (/admin/records): every visit in one table, the first page of
 * «Отчёты». On a wide screen: the filters, the table, the pencil that opens
 * the calendar's own visit sheet, «Отменить выбранные» and the export to
 * Excel. On a phone: a row per visit and the filters in a sheet.
 *
 * The visits that are changed here are this file's own: four online
 * bookings of one fake client («E2E Records», +372 5555 0611) with Milena,
 * twelve days ahead and on (inside the page's first month, on days of hers
 * no other test goes to). The demo visits are only looked at. Screenshots: e2e/.out/screens/pc-records.png,
 * pc-records-filters.png and <phone>-records.png. The file the export
 * test downloads lives in the browser's own temporary folder and is gone
 * with it.
 */
const R = A.records;
const CLIENT = "E2E Records";
const PHONE = "+37255550611";

// Next keeps the page that was left in the document, hidden: everything is looked for in the page that shows
const root = (page: Page) => page.locator(".rc:visible");
const rows = (page: Page) => root(page).locator(".rc-table tbody tr");
const found = (page: Page) => root(page).locator(".rc-found b");
const filters = (page: Page) => root(page).getByRole("search", { name: R.filters });
const show = (page: Page) => filters(page).getByRole("button", { name: R.show, exact: true });
const menu = (page: Page) => page.getByRole("navigation", { name: A.sections });
const visitSheet = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });
const shot = async (page: Page, name: string) => {
  const body = await page.screenshot({ path: path.join(OUT, "screens", `${name}.png`) });
  await test.info().attach(name, { body, contentType: "image/png" });
};

/** Ask again and wait for the answer: the list is busy while it is asked for. */
async function ask(page: Page) {
  await show(page).click();
  await expect(root(page).locator(".rc-list.is-busy")).toHaveCount(0);
}

/**
 * Book `n` visits online for the fake client with a demo barber: one a day,
 * on the first days from `from` days ahead that have a free time, at a time
 * in the middle of the day's free ones. Through the booking's own API, as
 * the client pages do.
 */
async function bookOnline(page: Page, slug: string, n: number, from = 12): Promise<void> {
  const staff = demoId("staff", slug);
  const service = demoId("service", "clip");
  const res = await page.request.get(`/api/slots?services=${service}&staff=${staff}&from=${tallinnDate(from)}&days=16`);
  expect(res.ok()).toBe(true);
  const days = ((await res.json()) as { days: { d: string; s: [number, string, number][] }[] }).days.filter((d) => d.s.length > 0);
  expect(days.length).toBeGreaterThanOrEqual(n);
  for (const d of days.slice(0, n)) {
    const slot = d.s[Math.floor(d.s.length / 2)];
    const r = await page.request.post("/api/bookings", {
      headers: { "idempotency-key": `e2e-records-${slug}-${d.d}-0000` },
      data: { serviceIds: [service], staffId: staff, startsAt: new Date(slot[0]).toISOString(), extraCents: slot[2], name: CLIENT, phone: PHONE, locale: "ru", smsReminder: false },
    });
    expect([200, 201]).toContain(r.status());
  }
}

test.describe("records", () => {
  test.use(asOwner);

  test.describe("on a wide screen", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("the list: its menu, its filters by barber and by status, the pencil, «Отменить выбранные» and the export", async ({ page }, info) => {
      test.skip(info.project.name !== "android", "one wide run is enough");
      await bookOnline(page, "milena", 4);
      await page.goto("/admin/records");
      await hydrated(page);

      /* ---- the page and its place in the menu ---- */
      await expect(root(page).getByRole("heading", { level: 1, name: R.title })).toBeVisible();
      await expect(root(page).locator(".cb-crumb")).toHaveText(R.crumb);
      await expect(page).toHaveTitle(`${R.title} · REMPIRE`);
      // «Отчёты» is the first group of the menu, open on its first page
      await expect(menu(page).getByRole("button").first()).toHaveText(A.nav.reports);
      await expect(menu(page).getByRole("button", { name: A.nav.reports })).toHaveAttribute("aria-expanded", "true");
      await expect(menu(page).getByRole("link", { name: A.nav.records, exact: true })).toHaveAttribute("aria-current", "page");
      // a star beside the title
      const star = root(page).getByRole("button", { name: A.frame.favAdd(A.nav.records) });
      await expect(star).toBeVisible();

      /* ---- the first page: the last month to one month ahead ---- */
      const first = defaultRecords(tallinnDate(0));
      await expect(filters(page).getByLabel(R.visitFrom)).toHaveValue(first.visitFrom);
      await expect(filters(page).getByLabel(R.visitTo)).toHaveValue(first.visitTo);
      await expect(filters(page).getByLabel(R.createdFrom)).toHaveValue("");
      await expect(root(page).locator(".rc-table thead th[scope=col]")).toHaveText([R.cols.staff, R.cols.services, R.cols.client, R.cols.visit, R.cols.by, R.cols.status, R.cols.source]);
      // the demo visits of today and of each barber's next day: more than one page of them
      const total = Number(await found(page).innerText());
      expect(total).toBeGreaterThan(25);
      await expect(rows(page)).toHaveCount(25);
      await expect(root(page).locator(".rc-rows:visible")).toHaveCount(0);
      // the newest visit first
      const times = await rows(page).locator('td[data-col="visit"]').allInnerTexts();
      expect(times[0]).toMatch(/^[А-Я][а-я], \d{2}\.\d{2}, \d{2}:\d{2}$/);
      // the new-style controls: 32px, 8px corners, a 1px #e0e3eb line; the one yellow button
      const look = (sel: string) =>
        root(page)
          .locator(sel)
          .first()
          .evaluate((el) => {
            const cs = getComputedStyle(el);
            return { h: Math.round(el.getBoundingClientRect().height), radius: cs.borderTopLeftRadius, line: `${cs.borderTopWidth} ${cs.borderTopColor}`, bg: cs.backgroundColor };
          });
      expect(await look(".rc-grid select")).toMatchObject({ h: 32, radius: "8px", line: "1px rgb(224, 227, 235)" });
      expect(await look(".rc-date input")).toMatchObject({ h: 32, radius: "8px", line: "1px rgb(224, 227, 235)" });
      expect(await look(".rc-show")).toMatchObject({ h: 32, radius: "8px", bg: "rgb(255, 203, 0)" });
      expect(await look(".rc-head-btns .jr-btn")).toMatchObject({ h: 32, radius: "8px", line: "1px rgb(224, 227, 235)" });
      await expectNoSideScroll(page);
      await shot(page, "pc-records");

      // the pager, at the bottom right: the second page has other visits
      const pager = root(page).getByRole("navigation", { name: A.clients.pages });
      const firstRow = await rows(page).first().getAttribute("data-id");
      await pager.getByRole("button", { name: A.clients.base.pageN(2) }).click();
      await expect(pager.getByRole("button", { name: A.clients.base.pageN(2) })).toHaveAttribute("aria-current", "page");
      await expect(rows(page).first()).not.toHaveAttribute("data-id", firstRow!);
      // 50 a page, at once: all of them, or fifty
      await filters(page).getByLabel(R.perPageLabel).selectOption("50");
      await expect(rows(page)).toHaveCount(Math.min(total, 50));

      /* ---- a filter by barber ---- */
      await filters(page).getByLabel(R.staff, { exact: true }).selectOption({ label: "Milena" });
      await ask(page);
      const hers = Number(await found(page).innerText());
      expect(hers).toBeGreaterThanOrEqual(4);
      expect(hers).toBeLessThan(total);
      await expect(rows(page)).toHaveCount(Math.min(hers, 50));
      expect(new Set(await rows(page).locator('td[data-col="staff"] b').allInnerTexts())).toEqual(new Set(["Milena"]));
      await expect(rows(page).first().locator('td[data-col="staff"] small')).toHaveText("Барбер");
      // what is asked is not in the address: a client's name or phone never is
      expect(new URL(page.url()).search).toBe("");

      /* ---- the client by name: this file's own four visits, booked online by the client himself ---- */
      await filters(page).getByLabel(R.client, { exact: true }).fill("e2e rec");
      await ask(page);
      await expect(found(page)).toHaveText("4");
      await expect(rows(page)).toHaveCount(4);
      await expect(rows(page).locator('td[data-col="client"] span')).toHaveText([CLIENT, CLIENT, CLIENT, CLIENT]);
      // the owner's login sees phones whole
      await expect(rows(page).first().locator('td[data-col="client"] small')).toHaveText(PHONE);
      await expect(rows(page).first().locator('td[data-col="by"] span')).toHaveText(R.madeByClient);
      await expect(rows(page).first().locator('td[data-col="source"]')).toHaveText(R.sources.online);
      await expect(rows(page).first().locator('td[data-col="status"]')).toHaveText(A.visit.status.booked);
      await expect(rows(page).first().locator('td[data-col="services"]')).not.toBeEmpty();
      expect(new URL(page.url()).search).toBe("");
      // by the phone's digits too
      await filters(page).getByLabel(R.client, { exact: true }).fill("5555 0611");
      await ask(page);
      await expect(rows(page)).toHaveCount(4);
      await shot(page, "pc-records-filters");

      /* ---- the pencil: the calendar's own visit sheet; «Пришёл» there is the row's status here ---- */
      const one = rows(page).nth(3);
      const id = await one.getAttribute("data-id");
      await one.getByRole("button", { name: new RegExp(`^${R.open(CLIENT, "")}`) }).click();
      const sheet = visitSheet(page, CLIENT);
      await expect(sheet).toBeVisible();
      await expect(sheet.locator(".adm-time span")).toContainText("Milena");
      await expect(sheet.getByRole("link", { name: new RegExp(`\\${PHONE}`) })).toBeVisible();
      await expect(sheet.locator(".adm-meta")).toContainText(A.visit.source.online);
      // no grid to tap a new time on: «Изменить» is offered, «Перенести» is not
      await expect(sheet.getByRole("button", { name: A.visit.edit, exact: true })).toBeVisible();
      await expect(sheet.getByRole("button", { name: A.visit.move, exact: true })).toHaveCount(0);
      // the table gives the panel room: nothing of it is under the sheet
      const [tableBox, sheetBox] = await Promise.all([root(page).locator(".rc-sheet").boundingBox(), sheet.boundingBox()]);
      expect(tableBox!.x + tableBox!.width).toBeLessThanOrEqual(sheetBox!.x + 1);
      await sheet.getByRole("button", { name: A.visit.status.arrived, exact: true }).click();
      await expect(toast(page).filter({ hasText: A.visit.status.arrived })).toBeVisible();
      await expect(sheet).toHaveCount(0);
      await expect(root(page).locator(`.rc-table tbody tr[data-id="${id}"] td[data-col="status"]`)).toHaveText(A.visit.status.arrived);

      /* ---- a filter by status ---- */
      await filters(page).getByLabel(R.status, { exact: true }).selectOption({ label: R.statuses.arrived });
      await ask(page);
      await expect(found(page)).toHaveText("1");
      await expect(rows(page)).toHaveCount(1);
      await expect(rows(page).first()).toHaveAttribute("data-id", id!);
      await filters(page).getByLabel(R.status, { exact: true }).selectOption({ label: R.statuses.waiting });
      await ask(page);
      await expect(rows(page)).toHaveCount(3);
      await expect(rows(page).locator('td[data-col="status"]')).toHaveText([A.visit.status.booked, A.visit.status.booked, A.visit.status.booked]);
      await filters(page).getByLabel(R.status, { exact: true }).selectOption({ label: R.statuses.no_show });
      await ask(page);
      await expect(found(page)).toHaveText("0");
      await expect(root(page).getByText(R.none)).toBeVisible();
      await filters(page).getByLabel(R.status, { exact: true }).selectOption({ label: R.allStatuses });
      await ask(page);
      await expect(rows(page)).toHaveCount(4);

      /* ---- «Отменить выбранные»: it asks first, then cancels the two ticked visits ---- */
      const cancelBtn = root(page).getByRole("button", { name: R.cancelPicked });
      await expect(cancelBtn).toBeDisabled();
      const waiting = root(page).locator('.rc-table tbody tr[data-status="booked"]');
      await expect(waiting).toHaveCount(3);
      const two = [await waiting.nth(0).getAttribute("data-id"), await waiting.nth(1).getAttribute("data-id")];
      for (const v of two) await root(page).locator(`.rc-table tbody tr[data-id="${v}"]`).getByRole("checkbox").check();
      await expect(cancelBtn).toBeEnabled();
      await cancelBtn.click();
      const question = page.getByRole("alertdialog", { name: R.cancelAsk(2) });
      await expect(question).toContainText(R.cancelLead);
      // «Нет, оставить»: nothing happens
      await question.getByRole("button", { name: A.visit.keep }).click();
      await expect(question).toHaveCount(0);
      await expect(waiting).toHaveCount(3);
      await cancelBtn.click();
      await question.getByRole("button", { name: R.cancelYes }).click();
      await expect(question.getByRole("status")).toHaveText(R.cancelDone(2));
      await question.getByRole("button", { name: A.close }).click();
      // the two rows are pale red with red text, say «Отменён», and have no tick any more
      for (const v of two) {
        const row = root(page).locator(`.rc-table tbody tr[data-id="${v}"]`);
        await expect(row).toHaveAttribute("data-status", "cancelled");
        await expect(row.locator('td[data-col="status"]')).toHaveText(A.visit.status.cancelled);
        await expect(row.getByRole("checkbox")).toHaveCount(0);
        expect(await row.locator('td[data-col="status"]').evaluate((el) => `${getComputedStyle(el).backgroundColor} ${getComputedStyle(el).color}`)).toBe("rgb(253, 238, 238) rgb(180, 35, 24)");
      }
      await expect(cancelBtn).toBeDisabled();
      // a cancelled visit's sheet only shows it: nothing to press
      await root(page).locator(`.rc-table tbody tr[data-id="${two[0]}"]`).getByRole("button").click();
      await expect(visitSheet(page, CLIENT).locator(".adm-gone")).toHaveText(A.visit.status.cancelled);
      await expect(visitSheet(page, CLIENT).locator(".adm-status")).toHaveCount(0);
      await expect(visitSheet(page, CLIENT).getByRole("button", { name: A.visit.cancelVisit })).toHaveCount(0);
      await visitSheet(page, CLIENT).getByRole("button", { name: A.close }).click();
      // cancelled, not cancelled, or both
      await filters(page).getByLabel(R.cancelled, { exact: true }).selectOption({ label: R.cancelledOf.yes });
      await ask(page);
      await expect(rows(page)).toHaveCount(2);
      await filters(page).getByLabel(R.cancelled, { exact: true }).selectOption({ label: R.cancelledOf.no });
      await ask(page);
      await expect(rows(page)).toHaveCount(2);
      await expect(root(page).locator(".rc-table tbody tr.is-cancelled")).toHaveCount(0);
      await filters(page).getByLabel(R.cancelled, { exact: true }).selectOption({ label: R.cancelledOf.all });
      await ask(page);
      await expect(rows(page)).toHaveCount(4);

      /* ---- «Операции с Excel» → «Выгрузить в Excel»: the filtered list as a real file ---- */
      await root(page).getByRole("button", { name: R.excel }).click();
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menu", { name: R.excel }).getByRole("menuitem", { name: R.exportXlsx }).click()]);
      expect(download.suggestedFilename()).toMatch(/^rempire-records-\d{4}-\d{2}-\d{2}\.xlsx$/);
      await expect(toast(page).filter({ hasText: R.exported(4) })).toBeVisible();
      // (the file is in the browser's own temporary folder: read from there, never copied into the repo)
      const file = readXlsx(new Uint8Array(readFileSync(await download.path())));
      expect(file.name).toBe(R.title);
      const X = R.xlsx;
      expect(file.rows[0]).toEqual([X.staff, X.services, X.client, X.phone, X.visit, X.by, X.created, X.status, X.source, X.total]);
      expect(file.rows).toHaveLength(5);
      for (const row of file.rows.slice(1)) {
        expect(row[0]).toBe("Milena");
        expect(row[2]).toBe(CLIENT);
        expect(row[3]).toBe(PHONE);
        expect(typeof row[4]).toBe("number");
        expect(row[5]).toBe(R.madeByClient);
        expect(row[8]).toBe(R.sources.online);
      }
      expect(file.rows.slice(1).map((r) => r[7]).sort()).toEqual([A.visit.status.booked, A.visit.status.arrived, A.visit.status.cancelled, A.visit.status.cancelled].sort());
      // the route is ours alone: a request from another site gets nothing
      expect((await page.request.post("/admin/records/export", { headers: { origin: "https://example.test" }, data: {} })).status()).toBe(403);
      await expectNoSideScroll(page);

      // a small laptop: the table is wider than what the sidebar leaves, so it scrolls inside its sheet, never the page
      await page.setViewportSize({ width: 1024, height: 768 });
      await expect(rows(page)).toHaveCount(4);
      expect(await root(page).locator(".rc-sheet").evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);
      await expectNoSideScroll(page);
      await page.setViewportSize({ width: 1440, height: 900 });
    });
  });

  test("on a phone: a row per visit, the filters in a sheet, a tap opens the visit; reached from «Ещё»", async ({ page, barber }, info) => {
    // from «Ещё»
    await page.goto("/admin/more");
    await hydrated(page);
    await page.locator(".adm-more .adm-item:visible", { hasText: A.nav.records }).click();
    await page.waitForURL(/\/admin\/records$/);
    await hydrated(page);
    await expect(root(page).getByRole("heading", { level: 1, name: R.title })).toBeVisible();
    await expect(menu(page).getByRole("link", { name: A.nav.more })).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveTitle(`${R.title} · REMPIRE`);

    // stacked rows, no table, no ticks, no file, no bulk actions
    const items = root(page).locator(".rc-item:visible");
    await expect(items).toHaveCount(25);
    await expect(root(page).locator(".rc-table:visible")).toHaveCount(0);
    await expect(root(page).getByRole("checkbox")).toHaveCount(0);
    await expect(root(page).getByRole("button", { name: R.cancelPicked })).toBeHidden();
    await expect(root(page).getByRole("button", { name: R.excel })).toBeHidden();
    const total = Number(await root(page).locator(".rc-found b").innerText());
    expect(total).toBeGreaterThan(25);
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    await shot(page, `${info.project.name}-records`);

    // the filters are a sheet: this phone's own barber
    await root(page).getByRole("button", { name: R.filters, exact: true }).click();
    const sheet = page.getByRole("dialog", { name: R.filters });
    await expect(sheet).toBeVisible();
    await sheet.getByLabel(R.staff, { exact: true }).selectOption({ label: barber.name });
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    await sheet.getByRole("button", { name: R.show, exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(root(page).locator(".rc-list.is-busy")).toHaveCount(0);
    const his = Number(await root(page).locator(".rc-found b").innerText());
    expect(his).toBeGreaterThan(0);
    expect(his).toBeLessThan(total);
    await expect(items).toHaveCount(Math.min(his, 25));
    for (const text of await items.allInnerTexts()) expect(text).toContain(barber.name);
    expect(new URL(page.url()).search).toBe("");

    // a tap opens the visit, as the calendar does; closed without a change
    const name = (await items.first().locator("b").innerText()).split(" · ")[1];
    await items.first().click();
    const visit = visitSheet(page, name);
    await expect(visit).toBeVisible();
    await expect(visit.locator(".adm-time span")).toContainText(barber.name);
    await expectNoSideScroll(page);
    await visit.getByRole("button", { name: A.close }).click();
    await expect(visit).toHaveCount(0);
  });
});
