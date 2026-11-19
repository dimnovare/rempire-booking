import path from "node:path";
import type { Page } from "@playwright/test";
import { authFile, OUT } from "./env";
import { B, expect, expectNoSideScroll, hydrated, nextWorkday, sheet, smallTargets, test } from "./helpers";

/**
 * Every screen and sheet of the barber app on the narrowest phones (320 px
 * wide, an iPhone SE of the first kind), and on a common one (360 px):
 * nothing to scroll sideways, nothing too small to tap. A screenshot of each
 * goes into the report (e2e/.out/report) and e2e/.out/screens.
 */
for (const width of [320, 360]) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 640 }, storageState: ({}, use, info) => use(authFile(String(info.project.metadata.barber ?? "valentin"))) });

    const check = async (page: Page, name: string) => {
      await expectNoSideScroll(page);
      expect(await smallTargets(page), name).toEqual([]);
      // also as e2e/.out/screens/<phone>-<width>-<name>.png, to leaf through
      const body = await page.screenshot({ fullPage: true, path: path.join(OUT, "screens", `${test.info().project.name}-${width}-${name}.png`) });
      await test.info().attach(`${width}-${name}`, { body, contentType: "image/png" });
    };

    test("the screens", async ({ page, barber }) => {
      for (const [name, url] of [
        ["day", "/b"],
        ["tomorrow", `/b?d=${nextWorkday(barber.slug)}`],
        ["week", "/b/week"],
        ["time", "/b/time"],
        ["more", "/b/more"],
        ["sell", "/b/sell"],
        ["money", "/b/money"],
        ["install", "/b/install"],
      ] as const) {
        await page.goto(url);
        await hydrated(page);
        await check(page, name);
      }
    });

    test("the sheets", async ({ page, barber }) => {
      await page.goto(`/b?d=${nextWorkday(barber.slug)}`);
      await hydrated(page);
      await page.locator(".bx-v", { hasText: "Demo client" }).first().getByRole("button").click();
      await check(page, "visit");
      await sheet(page).getByRole("button", { name: B.client.card }).click();
      await expect(sheet(page).getByText(B.client.past)).toBeVisible();
      await check(page, "client");
      await sheet(page).getByRole("button", { name: B.client.back }).click();
      await sheet(page).getByRole("button", { name: B.book.move }).click();
      await expect(sheet(page).getByRole("group", { name: B.book.time })).toBeVisible();
      await check(page, "move");
      await sheet(page).getByRole("button", { name: B.close }).click();
      await sheet(page).getByRole("button", { name: B.book.cancel }).click();
      await check(page, "cancel");
      await sheet(page).getByRole("button", { name: B.close }).click();
      await sheet(page).getByRole("button", { name: B.close }).click();
      await page.getByRole("button", { name: B.book.new }).click();
      await sheet(page).getByRole("group", { name: B.book.services }).getByRole("button").first().click();
      await expect(sheet(page).getByRole("group", { name: B.book.time })).toBeVisible();
      await check(page, "new");
      await sheet(page).getByRole("button", { name: B.close }).click();

      await page.goto("/b/time");
      await hydrated(page);
      for (const [name, open] of [
        ["break", B.time.add.block],
        ["vacation", B.time.add.vacation],
        ["special", B.time.add.special],
        ["hours", B.time.hoursEdit],
      ] as const) {
        await page.getByRole("button", { name: open, exact: true }).click();
        await expect(sheet(page)).toBeVisible();
        await check(page, name);
        await sheet(page).getByRole("button", { name: B.close }).click();
      }
      await page.locator(".bx-rows button.bx-row").first().click();
      await check(page, "price");
      await sheet(page).getByRole("button", { name: B.close }).click();
      await expect(sheet(page)).toHaveCount(0);

      // the staging test line (Phase C, docs/test-run.md): «Сообщить о проблеме»
      await page.locator(".test-banner").getByRole("button", { name: B.test.report }).click();
      await expect(sheet(page).getByRole("textbox")).toBeVisible();
      await check(page, "report");
      await sheet(page).getByRole("button", { name: B.close }).click();
      await expect(sheet(page)).toHaveCount(0);
    });

    test("the login, logged out", async ({ page }) => {
      await page.context().clearCookies();
      await page.goto("/b/login");
      await hydrated(page);
      await check(page, "login");
      await page.getByRole("button", { name: B.login.byCode }).click();
      await check(page, "login-code");
    });
  });
}
