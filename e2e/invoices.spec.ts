import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page, type TestInfo } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { euroText } from "../src/lib/money";
import { readXlsx } from "../src/lib/xlsx";
import { authFile, OUT } from "./env";
import { A, asOwner, expect, expectNoSideScroll, hydrated, test, toast } from "./helpers";

/**
 * «Счета» in the invoicing tool's own frame (docs/reference-looks.md; the
 * design boards «Счета, список» and «Счёт, черновик»): the indigo sidebar
 * with the section's six pages and «В салон», the list, «Новый счёт» → the
 * receiver, a draft whose lines are picked from the services and the shop's
 * products or typed, the preview of its PDF, «Выставить и отправить», the
 * banner with its events, «Платежи», a credit invoice and the export.
 *
 * Each phone bills another demo barber, so the runs do not meet; the wide
 * run makes its own receiver («Habe ja Käärid OÜ», no barber, made-up
 * details) and bills only him. The shop is the fake one: demo products.
 * The file the export test downloads lives in the browser's own temporary
 * folder and is gone with it; a preview is read from the answer, never
 * saved.
 */
const I = A.inv;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const MENU = [I.menu.desk, I.menu.list, I.menu.receivers, I.menu.items, I.menu.reports, I.menu.settings];
const UUID_PAGE = /\/admin\/invoices\/[0-9a-f-]{36}$/;

const shot = async (page: Page, name: string) => {
  const body = await page.screenshot({ fullPage: true, path: path.join(OUT, "screens", `${test.info().project.name}-inv-${name}.png`) });
  await test.info().attach(`inv-${name}`, { body, contentType: "image/png" });
};
const wideShot = async (page: Page, name: string) => {
  const body = await page.screenshot({ fullPage: true, path: path.join(OUT, "screens", `pc-inv-${name}.png`) });
  await test.info().attach(`pc-inv-${name}`, { body, contentType: "image/png" });
};

// Next keeps the page that was left in the document, hidden: everything is looked for in the page that shows
const lines = (page: Page) => page.locator(".inv-lines:visible .inv-row");
const total = (page: Page) => page.locator(".inv-totals:visible .tot dd");
const banner = (page: Page) => page.locator(".iv-banner:visible");
const tools = (page: Page) => page.getByRole("button", { name: I.tools });
/** «Показать действия по счёту», opened (it stays open while the page is). */
async function openEvents(page: Page) {
  const chip = banner(page).getByRole("button", { name: I.showEvents });
  if ((await chip.getAttribute("aria-expanded")) !== "true") await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
}

/** «Новый счёт» → the one field finds the receiver → his draft. */
async function newInvoiceFor(page: Page, who: string) {
  await page.goto("/admin/invoices");
  await hydrated(page);
  await page.getByRole("button", { name: I.newInvoice }).click();
  await page.waitForURL(/\/admin\/invoices\/new$/);
  await hydrated(page);
  await page.getByRole("combobox", { name: I.searchReceiver }).fill(who);
  // the one field narrows the list to him
  await expect(page.locator(".inv-pick:visible li")).toHaveCount(1);
  await page.locator(".inv-pick:visible button").click();
  await page.waitForURL(UUID_PAGE);
  await hydrated(page);
}

/** A line typed into the new row: a name that is in neither list, and a price. */
async function typeLine(page: Page, text: string, price: string) {
  const add = page.locator("form.inv-new:visible");
  if (!(await add.count())) await page.getByRole("button", { name: I.addLine }).click();
  await add.getByRole("combobox", { name: I.text }).fill(text);
  await add.getByRole("textbox", { name: I.unit }).fill(price);
  await add.getByRole("button", { name: I.saveLine }).click();
  await expect(add).toHaveCount(0);
}

/** A line picked from the lists: a few letters, then the offered item from that list. */
async function pickLine(page: Page, letters: string, source: "service" | "product", name: string): Promise<string> {
  const add = page.locator("form.inv-new:visible");
  if (!(await add.count())) await page.getByRole("button", { name: I.addLine }).click();
  await add.getByRole("combobox", { name: I.text }).fill(letters);
  const option = add.locator(`.inv-pick li[data-source="${source}"]`, { hasText: name }).first();
  await expect(option).toBeVisible();
  await expect(option.locator("small")).toHaveText(I.pickFrom[source]);
  const price = (await option.locator(".p").innerText()).trim();
  await option.getByRole("button").click();
  // picked: the name and the price are both there, so the line is saved at once
  await expect(add).toHaveCount(0);
  return price;
}

/** The draft's preview as the server gives it: a PDF whose title says it is a draft. */
async function previewTitle(page: Page): Promise<string> {
  const res = await page.request.get(`${new URL(page.url()).pathname}/preview`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  return (await PDFDocument.load(await res.body())).getTitle() ?? "";
}

/**
 * pc-inv-preview.png as a browser with a PDF viewer shows the window: the
 * draft's PDF inside it. The suite's own browser (the headless shell) has
 * no viewer, so the window there offers the PDF by its link; the picture is
 * therefore taken in the full browser, when that one is installed. False if
 * it is not: the caller then keeps the suite's own picture.
 */
async function previewShot(info: TestInfo, draftUrl: string): Promise<boolean> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ channel: "chromium" });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: info.project.use.baseURL, storageState: authFile("owner"), locale: "ru-RU", timezoneId: "Europe/Tallinn" });
    // (`next dev`'s own badge is kept out of the picture, as helpers.ts does for the suite's pages)
    await ctx.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        s.textContent = "nextjs-portal{display:none!important}";
        document.head.append(s);
      });
    });
    const page = await ctx.newPage();
    await page.goto(draftUrl);
    await hydrated(page);
    await page.getByRole("button", { name: I.preview }).click();
    await page.getByRole("dialog", { name: I.previewTitle }).locator("iframe.inv-preview").waitFor({ state: "visible", timeout: 15_000 });
    // (the viewer draws the page a moment after the frame is there, and says so nowhere)
    await page.waitForTimeout(3000);
    const body = await page.screenshot({ path: path.join(OUT, "screens", "pc-inv-preview.png") });
    await info.attach("pc-inv-preview", { body, contentType: "image/png" });
    return true;
  } catch {
    return false;
  } finally {
    await browser?.close();
  }
}

test.describe("invoices", () => {
  test.use(asOwner);

  test("«Новый счёт» → the receiver: the month's draft with the rent; a typed line; issued; in the list", async ({ page }, info) => {
    const who = info.project.name === "iphone" ? "Slava" : "Valentin";
    await page.goto("/admin/invoices");
    await hydrated(page);
    // the section wears the invoicing tool's indigo, not the yellow of the rest
    const button = page.getByRole("button", { name: I.newInvoice });
    await expect(button).toHaveCSS("background-color", "rgb(49, 46, 107)");
    // a phone keeps the app's bars; the section's six pages are a row of chips under the title
    const chips = page.getByRole("navigation", { name: I.title });
    await expect(chips.getByRole("link")).toHaveText(MENU);
    await expect(chips.getByRole("link", { name: I.menu.list, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".sb")).toBeHidden();
    await expect(page.getByRole("navigation", { name: A.sections })).toBeVisible();
    // the row scrolls inside itself, never the page
    expect(await chips.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
    await expectNoSideScroll(page);
    await chips.getByRole("link", { name: I.menu.settings }).click();
    await page.waitForURL(/\/admin\/invoices\/settings$/);
    await expect(page.getByRole("heading", { level: 1, name: I.menu.settings })).toBeVisible();
    await expectNoSideScroll(page);

    await newInvoiceFor(page, who);
    // a draft: no number yet, the rent is there already
    await expect(page.getByRole("heading", { level: 1, name: I.newInvoice })).toBeVisible();
    await expect(page.locator(".inv-party:visible").nth(1)).toContainText(who);
    // (the rent, and the demo barber's product sales of that month)
    await expect(lines(page).first()).toBeVisible();
    const before = { lines: await lines(page).count(), total: await total(page).innerText() };

    // one more line, typed
    await typeLine(page, "Lisatöö", "25");
    await expect(lines(page)).toHaveCount(before.lines + 1);
    await expect(total(page)).not.toHaveText(before.total);
    await expectNoSideScroll(page);
    await shot(page, "draft");

    // «Посмотреть и отправить счёт»: the draft's PDF first, with no number; only its own button issues
    await page.getByRole("button", { name: I.preview }).click();
    const preview = page.getByRole("dialog", { name: I.previewTitle });
    await expect(preview.locator(".inv-st.st-draft")).toHaveText(cap(I.status.draft));
    expect(await previewTitle(page)).toContain("mustand");
    await expectNoSideScroll(page);
    await preview.getByRole("button", { name: I.issueSend }).click();
    await expect(page.getByRole("status").first()).toBeVisible();
    // (:visible: the list a visitor came from stays in the page, hidden)
    await expect(banner(page).locator(".st-issued")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 }).filter({ visible: true })).toHaveText(/DEMO-\d{4}-\d{4}$/);
    // the PDF is under «Инструменты» now
    await tools(page).click();
    await expect(page.getByRole("menuitem", { name: I.savePdf })).toHaveAttribute("href", /\/pdf\?dl=1$/);
    await page.keyboard.press("Escape");
    await expectNoSideScroll(page);
    await shot(page, "issued");

    // the list has it; the search finds it by the receiver
    await page.goto("/admin/invoices");
    await hydrated(page);
    await page.getByRole("searchbox", { name: I.search }).fill(who);
    await expect(page.locator(".inv-st.st-issued:visible").first()).toBeVisible();
    await expectNoSideScroll(page);
    await shot(page, "list");

    // pressed again for him: the month is invoiced, so it is an empty free invoice
    await newInvoiceFor(page, who);
    await expect(lines(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: I.preview })).toBeDisabled();
    // thrown away, so the next run starts clean
    await tools(page).click();
    await page.getByRole("menuitem", { name: I.discard }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: I.discard }).click();
    await page.waitForURL(/\/admin\/invoices$/);
  });

  test.describe("on a wide screen", () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test.describe.configure({ mode: "serial" });
    test.beforeEach(({}, info) => {
      test.skip(info.project.name !== "android", "one wide run is enough");
    });

    const RECEIVER = "Habe ja Käärid OÜ";
    const EMAIL = "arved@example.test";
    const side = (page: Page) => page.locator(".sb.iv-side");
    const sideNav = (page: Page) => side(page).getByRole("navigation", { name: I.title });

    test("the section's own frame: the indigo sidebar with its six pages; «В салон» goes back to the journal", async ({ page }) => {
      await page.goto("/admin/invoices");
      await hydrated(page);
      // 260px of indigo in place of the salon's sidebar: no month, no tiles, no menu of sections
      expect(await side(page).evaluate((el) => [el.getBoundingClientRect().width, getComputedStyle(el).backgroundColor])).toEqual([260, "rgb(49, 46, 107)"]);
      await expect(page.locator(".sb-month, .sb-tiles, .sb-menu")).toHaveCount(0);
      await expect(side(page).locator(".iv-brand")).toContainText("REMPIRE");
      await expect(sideNav(page).getByRole("link")).toHaveText(MENU);
      const here = sideNav(page).getByRole("link", { name: I.menu.list, exact: true });
      await expect(here).toHaveAttribute("aria-current", "page");
      await expect(here).toHaveCSS("background-color", "rgb(37, 36, 66)");
      expect(await here.evaluate((el) => [el.getBoundingClientRect().height, getComputedStyle(el).borderRadius])).toEqual([48, "8px"]);
      // the page: the lilac-grey ground and the white 88px bar with the title and its buttons
      await expect(page.locator("body")).toHaveCSS("background-color", "rgb(243, 243, 247)");
      const bar = page.locator(".iv-top:visible");
      expect(await bar.evaluate((el) => [el.getBoundingClientRect().height, getComputedStyle(el).backgroundColor])).toEqual([88, "rgb(255, 255, 255)"]);
      await expect(bar.getByRole("heading", { level: 1 })).toHaveCSS("font-size", "28px");
      await expect(bar.locator(".iv-acts").getByRole("button")).toHaveText([I.newInvoice, I.summary, I.tools]);
      // the chips are a phone's
      await expect(page.locator(".iv-chips:visible")).toHaveCount(0);
      await expectNoSideScroll(page);

      // «Рабочий стол»: three figures, four tiles, the latest events
      await sideNav(page).getByRole("link", { name: I.menu.desk }).click();
      await page.waitForURL(/\/admin\/invoices\/desk$/);
      await expect(sideNav(page).getByRole("link", { name: I.menu.desk })).toHaveAttribute("aria-current", "page");
      await expect(page.locator(".iv-stat:visible > b")).toHaveText([I.desk.thisMonth, I.desk.lastMonth, I.desk.overdue]);
      await expect(page.locator(".iv-tile:visible")).toHaveText([I.newInvoice, I.desk.showInvoices, I.desk.newReceiver, I.desk.showReceivers]);
      await expect(page.getByRole("region", { name: I.desk.events })).toBeVisible();
      await expectNoSideScroll(page);
      await wideShot(page, "desk");
      // a figure opens the list filtered the same way
      await page.locator(".iv-stat.is-late:visible").click();
      await page.waitForURL(/\/admin\/invoices\?status=overdue$/);
      await hydrated(page);
      await expect(page.getByRole("combobox", { name: I.statusLabel })).toHaveValue("overdue");

      // the two old tab addresses lead to where their content went
      await page.goto("/admin/invoices/month?m=2026-10");
      await page.waitForURL(/\/admin\/invoices\/reports\?m=2026-10$/);
      await expect(page.locator(".adm-inv-table:visible, .iv-empty:visible").first()).toBeVisible();
      await expect(sideNav(page).getByRole("link", { name: I.menu.reports })).toHaveAttribute("aria-current", "page");
      await page.goto("/admin/invoices/company");
      await page.waitForURL(/\/admin\/invoices\/settings$/);
      await hydrated(page);
      await expect(page.getByRole("heading", { level: 2, name: I.company })).toBeVisible();
      await expectNoSideScroll(page);
      await wideShot(page, "settings");

      // «В салон»: the journal, and the salon's own sidebar again
      await side(page).getByRole("link", { name: I.toSalon }).click();
      await page.waitForURL(/\/admin$/);
      await expect(page.locator(".sb.iv-side")).toHaveCount(0);
      expect(await page.locator(".sb").evaluate((el) => [el.getBoundingClientRect().width, getComputedStyle(el).backgroundColor])).toEqual([220, "rgb(34, 34, 46)"]);
      await expect(page.locator("body")).toHaveCSS("background-color", "rgb(247, 249, 252)");
    });

    test("the list is a table, the invoice one sheet with the lines as rows", async ({ page }) => {
      await newInvoiceFor(page, "Jevgeni");
      await expect(page.locator(".inv-row-head:visible")).toBeVisible();
      await expect(page.locator(".inv-meta:visible")).toBeVisible();
      await page.goto("/admin/invoices");
      await hydrated(page);
      await expect(page.locator(".inv-table:visible")).toBeVisible();
      await expect(page.locator(".inv-table:visible thead th")).toHaveText([I.lcols.status, I.lcols.receiver, I.lcols.number, I.lcols.date, I.lcols.due, I.lcols.net, I.lcols.gross]);
      await page.goto("/admin/invoices/month");
      await hydrated(page);
      await expect(page.locator(".adm-inv-table:visible")).toBeVisible();
    });

    test("a receiver → a draft with a line from the services, one from the shop and one typed → preview → issued → events → paid → credited", async ({ page }) => {
      test.setTimeout(240_000);
      /* ---- «Получатели»: the list, and a new one ---- */
      await page.goto("/admin/invoices/receivers");
      await hydrated(page);
      const R = I.rcv;
      await expect(page.locator(".iv-table:visible thead th").filter({ hasText: /./ })).toHaveText([R.cols.name, R.cols.address, R.cols.postcode, R.cols.town, R.cols.invoices]);
      await expect(page.locator(".iv-table:visible tbody tr").first()).toBeVisible();
      await wideShot(page, "receivers");
      await page.getByRole("button", { name: I.newReceiver }).click();
      const form = page.getByRole("dialog", { name: I.newReceiver });
      await form.getByRole("button", { name: I.kinds.ou, exact: true }).click();
      await form.getByLabel(I.legalName).fill(RECEIVER);
      await form.getByLabel(I.regCode).fill("12345678");
      await form.getByLabel(I.address, { exact: true }).fill("Näidise 5, 10111 Tallinn");
      await form.getByLabel(I.email).fill(EMAIL);
      await form.getByLabel(I.terms).fill("14");
      // a company of its own, nobody's barber: its invoices are free ones
      await form.getByLabel(I.staff).selectOption("");
      await form.getByRole("button", { name: I.addReceiver }).click();
      await page.waitForURL(/\/admin\/invoices\/receivers\/[0-9a-f-]{36}$/);
      await hydrated(page);
      await expect(page.getByRole("heading", { level: 1, name: RECEIVER })).toBeVisible();
      await expect(page.getByRole("tab")).toHaveText([R.tabs.log, `${R.tabs.invoices} (0)`]);
      // his journal already says he was added
      await expect(page.locator(".iv-table:visible tbody tr")).toContainText([I.event.receiver_new]);

      /* ---- «Новый счёт» → him: an empty free draft, its first line ready ---- */
      await expect(page.getByRole("button", { name: I.newInvoice })).toBeEnabled();
      await newInvoiceFor(page, "Habe");
      const draft = page.url();
      await expect(page.getByRole("heading", { level: 1, name: I.newInvoice })).toBeVisible();
      const card = page.locator(".inv-rcv:visible");
      await expect(card).toContainText(RECEIVER);
      await expect(card).toContainText("Näidise 5, 10111 Tallinn");
      // × on his card: the field over «Получатели» again, with the others to pick from; left as it is
      await card.getByRole("button", { name: I.changeReceiver }).click();
      await expect(page.getByRole("combobox", { name: I.searchReceiver })).toBeVisible();
      await expect(page.locator(".inv-pick:visible li").first()).toBeVisible();
      await expect(page.locator(".inv-pick:visible li", { hasText: RECEIVER })).toHaveCount(0);
      await page.getByRole("button", { name: I.keepReceiver }).click();
      await expect(card).toContainText(RECEIVER);
      await expect(lines(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: I.preview })).toBeDisabled();

      // a line from the salon's services, one from the shop's products, one typed
      expect(await pickLine(page, "детская", "service", "Детская стрижка")).toBe("35,00 €");
      await expect(lines(page)).toHaveCount(1);
      expect(await pickLine(page, "matte", "product", "Demo Grooming Matte Paste 100 ml")).toBe("24,90 €");
      await expect(lines(page)).toHaveCount(2);
      await typeLine(page, "Lisatöö", "25");
      await expect(lines(page)).toHaveCount(3);
      const names = lines(page).getByRole("combobox", { name: I.text });
      await expect(names.nth(0)).toHaveValue("Детская стрижка");
      await expect(names.nth(1)).toHaveValue("Demo Grooming Matte Paste 100 ml");
      await expect(names.nth(2)).toHaveValue("Lisatöö");
      await expect(lines(page).getByRole("textbox", { name: I.unit })).toHaveCount(3);
      await expect(lines(page).nth(0).getByRole("textbox", { name: I.unit })).toHaveValue("35,00");
      await expect(lines(page).nth(1).getByRole("textbox", { name: I.unit })).toHaveValue("24,90");
      // each line at the invoice's own rule: the demo company charges VAT, so do all three
      await expect(lines(page).nth(1)).toContainText(I.vatOf("24 %"));
      // the totals are the invoice's own: 35,00 + 24,90 + 25,00
      await expect(total(page)).toHaveText(euroText(8490));
      await expect(page.locator(".inv-lines-head:visible h2")).toHaveText(`${I.linesTitle} (3)`);
      // a line changed in place saves by itself
      await lines(page).nth(2).getByRole("textbox", { name: I.qty }).fill("2");
      await lines(page).nth(2).getByRole("textbox", { name: I.qty }).blur();
      await expect(total(page)).toHaveText(euroText(10990));
      // the note is printed under the totals: it shows in its place on the sheet
      await page.getByRole("button", { name: I.note, exact: true }).click();
      const note = page.getByRole("dialog", { name: I.note });
      await note.getByRole("textbox", { name: I.note }).fill("Tasuda ülekandega.");
      await note.getByRole("button", { name: A.save, exact: true }).click();
      await expect(note).toHaveCount(0);
      await expect(page.locator(".inv-after:visible button")).toHaveText("Tasuda ülekandega.");
      // the board's sheet: white, 8px corners, the ruled table and the totals at the right
      await expect(page.locator(".inv-sheet:visible")).toHaveCSS("border-radius", "8px");
      await expect(page.locator(".inv-row-head:visible")).toBeVisible();
      await expectNoSideScroll(page);
      // (the picture is the sheet as it stands: «Сохранено» has gone, and no cell is under the pointer)
      await page.mouse.move(700, 20);
      await expect(page.locator(".adm-savetoast")).toHaveCount(0, { timeout: 12_000 });
      await wideShot(page, "draft");

      /* ---- «Посмотреть и отправить счёт»: the PDF of this draft, and back ---- */
      await page.getByRole("button", { name: I.preview }).click();
      const preview = page.getByRole("dialog", { name: I.previewTitle });
      await expect(preview.locator(".inv-st.st-draft")).toHaveText(cap(I.status.draft));
      await expect(preview).toContainText(EMAIL);
      await expect(preview.getByRole("link", { name: I.previewOpen })).toHaveAttribute("href", `${new URL(draft).pathname}/preview`);
      // no number yet: «mustand / draft» stands where it will be
      expect(await previewTitle(page)).toBe("ARVE / Invoice mustand / draft");
      await wideShot(page, "preview");
      // (the same window with the PDF drawn in it, where a full browser is there to draw it)
      await previewShot(test.info(), draft);
      await preview.getByRole("button", { name: I.backToDraft }).click();
      await expect(preview).toHaveCount(0);
      // looking changed nothing: still the draft, with its three lines
      await page.reload();
      await hydrated(page);
      await expect(page.getByRole("heading", { level: 1, name: I.newInvoice })).toBeVisible();
      await expect(lines(page)).toHaveCount(3);
      await expect(total(page)).toHaveText(euroText(10990));

      /* ---- «Выставить и отправить», from the preview: only now the number ---- */
      await page.getByRole("button", { name: I.preview }).click();
      await preview.getByRole("button", { name: I.issueSend }).click();
      await expect(banner(page).locator(".st-issued")).toHaveText(cap(I.status.issued));
      const title = await page.getByRole("heading", { level: 1 }).filter({ visible: true }).innerText();
      const number = title.replace(I.one(""), "").trim();
      expect(number).toMatch(/DEMO-\d{4}-\d{4}$/);
      await expect(toast(page).filter({ hasText: I.issued(number) })).toBeVisible();
      // the sheet is read only now: nothing to type into, no «Добавить строку»
      await expect(page.locator(".inv-sheet:visible input")).toHaveCount(0);
      await expect(page.getByRole("button", { name: I.addLine })).toHaveCount(0);
      await expect(lines(page)).toHaveCount(3);
      await expect(page.locator(".iv-top:visible .iv-acts").getByRole("button")).toHaveText([I.payments, I.createCredit, I.tools]);
      await expect(page.getByRole("button", { name: I.payments })).toHaveCSS("color", "rgb(15, 138, 113)");
      await expect(page.getByRole("button", { name: I.createCredit })).toHaveCSS("color", "rgb(10, 96, 194)");

      // the banner and «Показать действия по счёту»: issued, then sent to his address
      await expect(banner(page)).toHaveCSS("background-color", "rgb(229, 241, 255)");
      const events = page.getByRole("region", { name: I.eventsTitle });
      await expect(async () => {
        await page.reload();
        await hydrated(page);
        await openEvents(page);
        await expect(events).toContainText(I.event.issued(number));
        await expect(events).toContainText(I.event.sent(number, EMAIL), { timeout: 2000 });
      }).toPass({ timeout: 40_000 });
      await expectNoSideScroll(page);
      await wideShot(page, "sent");

      /* ---- «Платежи»: paid in full, on a day ---- */
      await page.getByRole("button", { name: I.payments }).click();
      const pay = page.getByRole("dialog", { name: I.payments });
      await expect(pay.getByLabel(I.paidSum)).toHaveValue(euroText(10990));
      await expect(pay.getByLabel(I.paidDate)).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
      await pay.getByRole("button", { name: I.addPayment }).click();
      await expect(pay).toHaveCount(0);
      await expect(banner(page).locator(".st-paid")).toHaveText(cap(I.status.paid));
      await expect(banner(page)).toHaveCSS("background-color", "rgb(232, 252, 248)");
      await openEvents(page);
      await expect(events).toContainText(I.event.paid(number));
      // the window now says when, and offers to take the mark off
      await page.getByRole("button", { name: I.payments }).click();
      await expect(pay.getByRole("button", { name: I.unpaid })).toBeVisible();
      await pay.getByRole("button", { name: A.close, exact: true }).last().click();

      /* ---- «Инструменты»: a copy, the PDF, print ---- */
      await tools(page).click();
      await expect(page.getByRole("menuitem")).toHaveText([new RegExp(`^${I.copy}`), I.savePdf, I.print, I.resend]);
      await page.keyboard.press("Escape");

      /* ---- «Создать кредит-счёт»: asked first, then its own invoice ---- */
      await page.getByRole("button", { name: I.createCredit }).click();
      const ask = page.getByRole("alertdialog", { name: I.createCredit });
      await expect(ask).toContainText(I.creditAsk);
      await ask.getByRole("button", { name: I.createCredit }).click();
      await page.waitForURL((u) => UUID_PAGE.test(u.pathname) && u.href !== draft);
      await hydrated(page);
      await expect(page.getByRole("heading", { level: 1 }).filter({ visible: true })).toHaveText(new RegExp(`^${I.oneCredit("")}`));
      await expect(banner(page).getByRole("link", { name: I.creditOf(number) })).toBeVisible();
      await expect(total(page)).toHaveText(euroText(-10990));
      // a credit invoice is neither paid nor credited again
      await expect(page.getByRole("button", { name: I.payments })).toHaveCount(0);
      await expect(page.getByRole("button", { name: I.createCredit })).toHaveCount(0);
      // and the invoice it took back says so
      await banner(page).getByRole("link", { name: I.creditOf(number) }).click();
      await page.waitForURL(draft);
      await hydrated(page);
      await expect(banner(page).locator(".st-credited")).toHaveText(cap(I.status.credited));
      await openEvents(page);
      await expect(events).toContainText(I.event.paid(number));
      await expect(events.locator("li").filter({ hasText: number })).toHaveCount(4);

      /* ---- «Сделать копию счёта»: a new draft with the same lines and no number; thrown away again ---- */
      await tools(page).click();
      await page.getByRole("menuitem", { name: I.copy }).click();
      await page.waitForURL((u) => UUID_PAGE.test(u.pathname) && u.href !== draft);
      await hydrated(page);
      await expect(page.getByRole("heading", { level: 1, name: I.newInvoice })).toBeVisible();
      await expect(lines(page)).toHaveCount(3);
      await expect(total(page)).toHaveText(euroText(10990));
      await tools(page).click();
      await page.getByRole("menuitem", { name: I.discard }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: I.discard }).click();
      await page.waitForURL(/\/admin\/invoices$/);
    });

    test("the list: status filter, sort, «Сводка», the export; then the receivers report and «Товары и услуги»", async ({ page }) => {
      test.setTimeout(180_000);
      await page.goto("/admin/invoices");
      await hydrated(page);
      const table = page.locator(".inv-table:visible");
      const rows = table.locator("tbody tr");
      const pills = table.locator("tbody .inv-st");
      const status = page.getByRole("combobox", { name: I.statusLabel });
      await expect(rows.first()).toBeVisible();
      await expectNoSideScroll(page);
      await wideShot(page, "list");

      /* ---- the status select ---- */
      await expect(status.locator("option")).toHaveText([I.filters[""], I.filters.draft, I.filters.issued, I.filters.overdue, I.filters.paid, I.filters.credited]);
      await status.selectOption("draft");
      await expect(pills.first()).toBeVisible();
      for (const text of await pills.allInnerTexts()) expect(text).toBe(cap(I.status.draft));
      await status.selectOption("issued");
      await expect(pills.first()).toBeVisible();
      for (const text of await pills.allInnerTexts()) expect(text).toBe(cap(I.status.issued));
      // credited: the invoice and the credit invoice that took it back, both the new receiver's
      await status.selectOption("credited");
      await page.getByRole("searchbox", { name: I.search }).fill("Habe");
      await expect(pills).toHaveText([cap(I.status.credit), cap(I.status.credited)]);
      await expect(page.locator(".iv-count:visible")).toHaveText(I.countLine(1, 2, 2));
      // pills as the tool's: outlined, in the status's colour
      await expect(pills.last()).toHaveCSS("border-radius", "16px");

      /* ---- «Сводка по выбранным счетам»: the rows the filters leave ---- */
      await page.getByRole("button", { name: I.summary }).click();
      const sum = page.getByRole("dialog", { name: I.summary });
      const cells = (key: string) => sum.locator(`tr[data-row="${key}"] td`);
      await expect(cells("issued")).toHaveText([I.sum.issued, "1", /€$/, euroText(10990)]);
      await expect(cells("credits")).toHaveText([I.sum.credits, "1", /€$/, euroText(-10990)]);
      await expect(cells("turnover")).toHaveText([I.sum.turnover, "", euroText(0), euroText(0)]);
      await expect(cells("unpaid")).toHaveText([I.sum.unpaid, "0", euroText(0), euroText(0)]);
      await expect(cells("drafts")).toHaveText([I.sum.drafts, "0", euroText(0), euroText(0)]);
      await sum.getByRole("button", { name: A.close, exact: true }).last().click();

      /* ---- «Инструменты» → «Экспорт счетов в таблицу»: the same two rows as a file ---- */
      await tools(page).click();
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menu", { name: I.tools }).getByRole("menuitem", { name: I.exportXlsx }).click()]);
      expect(download.suggestedFilename()).toMatch(/^rempire-invoices-\d{4}-\d{2}-\d{2}\.xlsx$/);
      await expect(toast(page).filter({ hasText: I.exported(2) })).toBeVisible();
      // (the file is in the browser's own temporary folder: read from there, never copied into the repo)
      const file = readXlsx(new Uint8Array(readFileSync(await download.path())));
      const X = I.xlsx;
      expect(file.rows[0]).toEqual([X.status, X.receiver, X.number, X.date, X.due, X.net, X.vat, X.gross]);
      expect(file.rows).toHaveLength(3);
      expect(file.rows.slice(1).map((r) => [r[0], r[1], r[7]])).toEqual([
        [cap(I.status.credit), "Habe ja Käärid OÜ", -109.9],
        [cap(I.status.credited), "Habe ja Käärid OÜ", 109.9],
      ]);
      await download.delete();

      /* ---- every column sorts; a click again turns it round ---- */
      await status.selectOption("");
      await page.getByRole("searchbox", { name: I.search }).fill("");
      const head = (name: string) => table.locator("thead th", { hasText: name });
      // as it opens: the newest date first
      await expect(head(I.lcols.date)).toHaveAttribute("aria-sort", "descending");
      const gross = async () => (await rows.locator("td:last-child").allInnerTexts()).map((t) => Number(t.replace(/[^\d,-]/g, "").replace(",", ".")));
      await head(I.lcols.gross).getByRole("button").click();
      await expect(head(I.lcols.gross)).toHaveAttribute("aria-sort", "descending");
      await expect(head(I.lcols.date)).not.toHaveAttribute("aria-sort", /./);
      let sums = await gross();
      expect(sums.length).toBeGreaterThan(2);
      expect(sums).toEqual([...sums].sort((a, b) => b - a));
      await head(I.lcols.gross).getByRole("button").click();
      await expect(head(I.lcols.gross)).toHaveAttribute("aria-sort", "ascending");
      sums = await gross();
      expect(sums).toEqual([...sums].sort((a, b) => a - b));
      expect(sums[0]).toBe(-109.9);
      await head(I.lcols.receiver).getByRole("button").click();
      await expect(head(I.lcols.receiver)).toHaveAttribute("aria-sort", "ascending");
      const names = await rows.locator("td:nth-child(2)").allInnerTexts();
      expect(names).toEqual([...names].sort(new Intl.Collator(["ru", "et", "en"], { sensitivity: "base", numeric: true }).compare));
      for (const col of [I.lcols.status, I.lcols.number, I.lcols.due, I.lcols.net]) {
        await head(col).getByRole("button").click();
        await expect(head(col)).toHaveAttribute("aria-sort", /ending$/);
      }
      // the foot: rows a page, and a row opens the invoice
      await expect(page.locator(".iv-tfoot:visible select option")).toHaveText(["10", "25", "50", "100"]);
      await rows.first().click();
      await page.waitForURL(UUID_PAGE);

      /* ---- «Отчёты» → «Отчёт по получателям»: this month, the new receiver in it ---- */
      await page.goto("/admin/invoices/reports/receivers");
      await hydrated(page);
      const rep = page.locator(".iv-rep-table:visible tbody tr", { hasText: "Habe ja Käärid OÜ" });
      await expect(rep.locator("td")).toHaveText(["", "Habe ja Käärid OÜ", "1", "1", euroText(10990), euroText(10990), euroText(0), /DEMO-\d{4}-\d{4}, \d\d\.\d\d\.\d{4}$/]);
      // «без НДС»: the same row without the VAT
      await page.getByRole("group", { name: I.vat, exact: true }).getByRole("button", { name: I.rep.net }).click();
      await expect(rep.locator("td").nth(4)).not.toHaveText(euroText(10990));
      await expect(rep.locator("td").nth(6)).toHaveText(euroText(0));
      // a period nobody was invoiced in
      await page.getByRole("button", { name: I.periodPrev }).click();
      await page.getByRole("button", { name: I.periodPrev }).click();
      await page.getByRole("button", { name: I.periodPrev }).click();
      await expect(page.locator(".iv-empty:visible")).toHaveText(I.rep.none);
      await expectNoSideScroll(page);

      /* ---- «Товары и услуги»: two read-only views, no list of its own ---- */
      await page.goto("/admin/invoices/items");
      await hydrated(page);
      await expect(page.getByRole("tab")).toHaveText([I.items.tabs.products, I.items.tabs.services]);
      await expect(page.locator(".iv-note:visible")).toContainText(I.items.whereProducts);
      await expect(page.locator(".iv-note:visible").getByRole("link", { name: I.items.openServices })).toHaveAttribute("href", "/admin/services");
      await page.getByRole("searchbox", { name: A.catalogue.search }).fill("matte");
      const goods = page.locator(".iv-table:visible tbody tr");
      await expect(goods).toHaveCount(1);
      await expect(goods).toContainText("Demo Grooming Matte Paste 100 ml");
      await expect(goods).toContainText("24,90 €");
      await wideShot(page, "items");
      await page.getByRole("tab", { name: I.items.tabs.services }).click();
      await expect(page.locator(".iv-table:visible thead th")).toHaveText([I.items.svcName, I.items.svcTime, I.items.svcPrice]);
      await expect(page.locator(".iv-table:visible tbody tr", { hasText: "Детская стрижка" })).toBeVisible();
      // nothing to change here: the lists are the shop's and «Услуги»
      await expect(page.locator(".iv-card:visible").locator("input, select, textarea")).toHaveCount(0);
      await expectNoSideScroll(page);
    });
  });
});
