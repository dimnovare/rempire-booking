import path from "node:path";
import { OUT } from "./env";
import { asBarber, B, expect, expectNoSideScroll, hydrated, smallTargets, test } from "./helpers";

/**
 * «Продать» → «Сканировать»: the live shop's scanner engine behind a sheet
 * (src/app/b/(app)/sell/scan-engine.ts). No camera at all — the e2e
 * browser's own state, and the path a phone without one takes: the error
 * line, the field with the focus, a typed code, a handheld scanner's burst.
 * The camera itself: scanner-camera.spec.ts. The codes are the fake shop's
 * (src/lib/shop.ts, FAKE_PRODUCTS).
 */
test.describe("the scanner", () => {
  test.use(asBarber);

  const open = async (page: import("@playwright/test").Page) => {
    await page.goto("/b/sell");
    await hydrated(page);
    await page.getByRole("button", { name: B.sell.scan, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: B.sell.scanning });
    await expect(dialog).toBeVisible();
    // no camera here: one line says so, and the field is the scanner
    await expect(dialog.getByRole("alert")).toBeVisible();
    const field = dialog.getByRole("textbox", { name: B.sell.codeLabel });
    await expect(field).toBeFocused();
    return { dialog, field };
  };

  test("a typed code finds the product and closes the sheet", async ({ page }) => {
    const { dialog, field } = await open(page);
    await field.fill("2000000000015");
    await field.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/Matte Paste/).first()).toBeVisible();
  });

  test("a handheld scanner's burst is read without the field", async ({ page }) => {
    const { dialog, field } = await open(page);
    await field.blur();
    await page.keyboard.type("2000000000022", { delay: 5 });
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/Sea Salt Spray/).first()).toBeVisible();
  });

  test("a code the shop has not linked says how to find the product instead", async ({ page }) => {
    const { dialog, field } = await open(page);
    await field.fill("2000000009999");
    await dialog.getByRole("button", { name: B.sell.codeFind }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(B.sell.notFound)).toBeVisible();
  });

  test("«Закрыть» lets go of the sheet", async ({ page }) => {
    const { dialog } = await open(page);
    await dialog.getByRole("button", { name: B.close, exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test.describe("on the narrowest phone", () => {
    test.use({ viewport: { width: 320, height: 640 } });

    test("the sheet fits: nothing to scroll sideways, nothing too small to tap", async ({ page }) => {
      await open(page);
      await expectNoSideScroll(page);
      expect(await smallTargets(page)).toEqual([]);
      const body = await page.screenshot({ path: path.join(OUT, "screens", `${test.info().project.name}-320-scanner.png`) });
      await test.info().attach("320-scanner", { body, contentType: "image/png" });
    });
  });
});
