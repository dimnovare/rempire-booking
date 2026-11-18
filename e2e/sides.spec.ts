import path from "node:path";
import type { Page } from "@playwright/test";
import { authFile, OUT } from "./env";
import { A, asBarber, asOwner, B, expect, expectNoSideScroll, hydrated, test } from "./helpers";

/**
 * The staff app's two sides (docs/apps.md): one start by role, and the
 * «Мой день | Салон» switch for Renat and the front desk. `boss` is the
 * demo owner who cuts too: his login is linked to the barber Renat.
 */
const shot = async (page: Page, name: string) => {
  const body = await page.screenshot({ path: path.join(OUT, "screens", `${test.info().project.name}-side-${name}.png`) });
  await test.info().attach(`side-${name}`, { body, contentType: "image/png" });
};
/** Whose day the barber app shows: the name beside the picture. */
const who = (page: Page) => page.locator(".bx-viewing span:not(.adm-ava)");
const switchOn = (page: Page, label: string) => page.getByRole("navigation", { name: label });
/** A fresh device: no side remembered yet. */
const forgetSide = (page: Page) => page.context().clearCookies({ name: "rb_side" });

test.describe("an owner who cuts too", () => {
  test.use({ storageState: authFile("boss") });

  test("the app starts on his own day; the switch takes him to the salon and back", async ({ page }) => {
    await forgetSide(page);
    await page.goto("/b/start");
    await page.waitForURL((u) => u.pathname === "/b");
    await hydrated(page);
    // his own name, not «Смотрю: …», and his own visits
    await expect(who(page)).toHaveText("Renat");
    await expect(page.locator(".bx-v").first()).toBeVisible();
    const mine = switchOn(page, B.side.label);
    await expect(mine.getByRole("link", { name: B.side.mine })).toHaveAttribute("aria-current", "page");
    await expectNoSideScroll(page);
    await shot(page, "boss-day");

    await mine.getByRole("link", { name: B.side.salon }).click();
    await page.waitForURL((u) => u.pathname === "/admin");
    await hydrated(page);
    const salon = switchOn(page, A.side.label);
    await expect(salon.getByRole("link", { name: A.side.salon })).toHaveAttribute("aria-current", "page");
    await expectNoSideScroll(page);
    // the calendar still fills the screen exactly: the page itself does not scroll
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
    await shot(page, "boss-salon");

    // the app comes back to the side that was open last
    await page.goto("/b/start");
    await page.waitForURL((u) => u.pathname === "/admin");
    await hydrated(page);
    await switchOn(page, A.side.label).getByRole("link", { name: A.side.mine }).click();
    await page.waitForURL((u) => u.pathname === "/b");
    await page.goto("/b/start");
    await page.waitForURL((u) => u.pathname === "/b");
  });

  test("after looking at another barber, «Мой день» is his own day again", async ({ page, barber }) => {
    await page.goto("/b/pick");
    await hydrated(page);
    // himself first, and marked
    await expect(page.locator(".bx-row").first()).toContainText("Renat");
    await expect(page.locator(".bx-row").first()).toContainText(B.pick.mine);
    await page.getByRole("button", { name: barber.name }).click();
    await page.waitForURL((u) => u.pathname === "/b");
    await expect(who(page)).toHaveText(B.pick.viewing(barber.name));
    await switchOn(page, B.side.label).getByRole("link", { name: B.side.mine }).click();
    await page.waitForURL((u) => u.pathname === "/b");
    await expect(who(page)).toHaveText("Renat");
  });

  for (const [name, viewport] of [
    ["tablet", { width: 820, height: 1180 }],
    ["pc", { width: 1366, height: 768 }],
  ] as const) {
    test.describe(name, () => {
      test.use({ viewport });

      test("the switch is in its place on both sides, nothing scrolls sideways", async ({ page }) => {
        const wide = viewport.width >= 900;
        for (const [side, url, label] of [
          ["salon", "/admin", A.side.label],
          ["day", "/b", B.side.label],
        ] as const) {
          await page.goto(url);
          await hydrated(page);
          await expect(switchOn(page, label)).toHaveCount(1);
          // beside the logo on a wide screen, a row under the bar otherwise
          await expect(page.locator(".adm-side-bar")).toBeVisible({ visible: wide });
          await expect(page.locator(".adm-side-row")).toBeVisible({ visible: !wide });
          await expectNoSideScroll(page);
          await shot(page, `boss-${side}-${name}`);
        }
      });
    });
  }
});

test.describe("an owner who does not cut", () => {
  test.use(asOwner);

  test("starts in the salon; «Барбер» opens the list of barbers", async ({ page }) => {
    await forgetSide(page);
    await page.goto("/b/start");
    await page.waitForURL((u) => u.pathname === "/admin");
    await hydrated(page);
    const sw = switchOn(page, A.side.label);
    await expect(sw.getByRole("link", { name: A.side.mine })).toHaveCount(0);
    await sw.getByRole("link", { name: A.side.barber }).click();
    await page.waitForURL((u) => u.pathname === "/b/pick");
    await expect(switchOn(page, B.side.label).getByRole("link", { name: B.side.barber })).toHaveAttribute("aria-current", "page");
    await expectNoSideScroll(page);
    await shot(page, "owner-pick");
  });

  test("«Доступ»: a login is linked to the barber it is, and unlinked again", async ({ page }, info) => {
    const email = `desk-${info.project.name}@example.test`;
    await page.goto("/admin/account");
    await hydrated(page);
    const form = page.locator("form", { has: page.getByRole("button", { name: A.account.addUser }) });
    await form.locator('input[type="email"]').fill(email);
    await form.getByRole("button", { name: A.account.roles.admin, exact: true }).click();
    await form.getByLabel(A.account.alsoBarber).selectOption({ label: "Slava" });
    await expect(form.getByText(A.account.alsoHint)).toBeVisible();
    await form.getByRole("button", { name: A.account.addUser }).click();
    await expect(form.getByText(A.saved, { exact: true })).toBeVisible();

    const link = page.getByLabel(`${A.account.alsoBarber}: ${email}`);
    await expect(link).toHaveValue(/[0-9a-f-]{36}/);
    await expect(link.locator("option:checked")).toHaveText("Slava");
    await link.scrollIntoViewIfNeeded();
    await expectNoSideScroll(page);
    await shot(page, "account");
    // it saves by itself: wait for the save, then it is still unlinked after a reload
    const saved = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/admin/account");
    await link.selectOption({ label: A.account.notBarber });
    await saved;
    await page.reload();
    await hydrated(page);
    await expect(page.getByLabel(`${A.account.alsoBarber}: ${email}`)).toHaveValue("");
  });
});

test.describe("a barber", () => {
  test.use(asBarber);

  test("has one side: no switch, and the start is his day", async ({ page }) => {
    await page.goto("/b/start");
    await page.waitForURL((u) => u.pathname === "/b");
    await hydrated(page);
    await expect(page.locator(".adm-side")).toHaveCount(0);
  });
});
