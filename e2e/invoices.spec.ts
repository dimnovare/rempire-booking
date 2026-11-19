import path from "node:path";
import type { Page } from "@playwright/test";
import { OUT } from "./env";
import { A, asOwner, expect, expectNoSideScroll, hydrated, test } from "./helpers";

/**
 * «Счета», the way Renat works in Isolta (docs/reference-looks.md): the
 * list, «Новый счёт» → the receiver, the invoice as one sheet, «Выставить и
 * отправить». Each phone bills another demo barber, so the runs do not meet.
 */
const shot = async (page: Page, name: string) => {
  const body = await page.screenshot({ fullPage: true, path: path.join(OUT, "screens", `${test.info().project.name}-inv-${name}.png`) });
  await test.info().attach(`inv-${name}`, { body, contentType: "image/png" });
};

async function newInvoiceFor(page: Page, who: string) {
  await page.goto("/admin/invoices");
  await hydrated(page);
  await page.getByRole("button", { name: A.inv.newInvoice }).click();
  const sheet = page.getByRole("dialog", { name: A.inv.pickReceiver });
  await sheet.getByRole("searchbox").fill(who);
  // the one field narrows the list to him
  await expect(sheet.locator(".inv-pick li")).toHaveCount(1);
  await sheet.locator(".inv-pick button").click();
  await page.waitForURL(/\/admin\/invoices\/[0-9a-f-]{36}$/);
  await hydrated(page);
}

test.describe("invoices", () => {
  test.use(asOwner);

  test("«Новый счёт» → the receiver: the month's draft with the rent; a typed line; issued; in the list", async ({ page }, info) => {
    const who = info.project.name === "iphone" ? "Slava" : "Valentin";
    await page.goto("/admin/invoices");
    await hydrated(page);
    // the section wears Isolta's indigo, not the yellow of the rest
    const button = page.getByRole("button", { name: A.inv.newInvoice });
    await expect(button).toHaveCSS("background-color", "rgb(49, 46, 107)");
    await expect(page.getByRole("navigation", { name: A.inv.title }).getByRole("link")).toHaveText([A.inv.tabs.list, A.inv.tabs.month, A.inv.tabs.receivers, A.inv.tabs.company]);

    await newInvoiceFor(page, who);
    // a draft: no number yet, the rent is there already
    await expect(page.getByRole("heading", { level: 1, name: A.inv.newInvoice })).toBeVisible();
    await expect(page.locator(".inv-party").nth(1)).toContainText(who);
    // (the rent, and the demo barber's product sales of that month)
    const rows = page.locator(".inv-lines .inv-row");
    await expect(rows.first()).toBeVisible();
    const lines = await rows.count();
    const total = page.locator(".inv-totals .tot dd");
    const before = await total.innerText();

    // one more line, typed
    await page.getByRole("button", { name: A.inv.addLine }).click();
    const add = page.locator("form.inv-add");
    await add.getByRole("textbox", { name: A.inv.text }).fill("Lisatöö");
    await add.getByRole("textbox", { name: A.inv.unit }).fill("25");
    await add.getByRole("button", { name: A.inv.addLine }).click();
    await expect(rows).toHaveCount(lines + 1);
    await expect(total).not.toHaveText(before);
    await expectNoSideScroll(page);
    await shot(page, "draft");

    // «Выставить и отправить»: it asks first, then the number is there
    await page.getByRole("button", { name: A.inv.issueSend }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: A.inv.issue, exact: true }).click();
    await expect(page.getByRole("status").first()).toBeVisible();
    // (:visible: the list a visitor came from stays in the page, hidden)
    await expect(page.locator(".inv-st.st-issued:visible").first()).toBeVisible();
    await expect(page.getByRole("link", { name: A.inv.pdf })).toBeVisible();
    await expectNoSideScroll(page);
    await shot(page, "issued");

    // the list has it; the search finds it by the receiver
    await page.goto("/admin/invoices");
    await hydrated(page);
    await page.getByRole("searchbox", { name: A.inv.search }).fill(who);
    await expect(page.locator(".inv-st.st-issued:visible").first()).toBeVisible();
    await expectNoSideScroll(page);
    await shot(page, "list");

    // pressed again for him: the month is invoiced, so it is an empty free invoice
    await newInvoiceFor(page, who);
    await expect(page.locator(".inv-lines .inv-row")).toHaveCount(0);
    await expect(page.getByRole("button", { name: A.inv.issueSend })).toBeDisabled();
    // thrown away, so the next run starts clean
    await page.getByRole("button", { name: A.inv.discard }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: A.inv.discard }).click();
    await page.waitForURL(/\/admin\/invoices$/);
  });

  test.describe("on a wide screen", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("the list is a table, the invoice one sheet with the lines as rows", async ({ page }, info) => {
      test.skip(info.project.name !== "android", "one wide run is enough");
      await newInvoiceFor(page, "Jevgeni");
      await expect(page.locator(".inv-row-head")).toBeVisible();
      await expect(page.locator(".inv-meta")).toBeVisible();
      await page.screenshot({ path: path.join(OUT, "screens", "pc-inv-draft.png") });
      await page.goto("/admin/invoices");
      await hydrated(page);
      await expect(page.locator(".inv-table")).toBeVisible();
      await expect(page.locator(".inv-table thead th")).toHaveText([A.inv.lcols.status, A.inv.lcols.receiver, A.inv.lcols.number, A.inv.lcols.date, A.inv.lcols.due, A.inv.lcols.net, A.inv.lcols.gross]);
      await page.screenshot({ path: path.join(OUT, "screens", "pc-inv-list.png") });
      await page.goto("/admin/invoices/month");
      await hydrated(page);
      await expect(page.locator(".adm-inv-table")).toBeVisible();
    });
  });
});
