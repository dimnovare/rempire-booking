import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { eur } from "../src/app/admin/copy.shared";
import { DEMO } from "../tools/demo-structure.mjs";
import { OUT } from "./env";
import { A, asOwner, demoId, expect, expectNoSideScroll, hydrated, smallTargets, test } from "./helpers";

/**
 * «Услуги» as the table of the admin we follow (Dim, decisions round 11;
 * the boards «Услуги, таблица» and «Услуга, окно»), on the demo's eight
 * services and five barbers (tools/demo-structure.mjs): fake, as everything
 * here. Every change a test makes it puts back, as the next spec sees the
 * same database. Its screenshots are e2e/.out/screens/pc-services*.png and
 * <phone>-services*.png.
 */
const S = A.services;
const name = (slug: string) => DEMO.services.find((s: { slug: string }) => s.slug === slug)!.name.ru as string;
const CLIP = name("clip");
const BUZZ = name("buzz");
const CUTBEARD = name("cutbeard");
const GREY = name("grey");
const KID = name("kid");
const FS = name("fs");

const shot = async (page: Page, what: string) => {
  const body = await page.screenshot({ path: path.join(OUT, "screens", `${test.info().project.name === "android" && page.viewportSize()!.width >= 900 ? "pc" : test.info().project.name}-services-${what}.png`) });
  await test.info().attach(`services-${what}`, { body, contentType: "image/png" });
};
/** A service's row in the table. */
const row = (page: Page, service: string) => page.locator(".sv-row:visible").filter({ has: page.getByRole("button", { name: service, exact: true }) });
/** A service's window: its name is its title. */
const win = (page: Page, title: string) => page.getByRole("dialog", { name: title, exact: true });
const barber = (w: Locator, who: string) => w.locator(".sv-srow").filter({ hasText: who });

test.describe("«Услуги»", () => {
  test.use(asOwner);

  test.describe("on a wide screen", () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test.beforeEach(({}, info) => {
      test.skip(info.project.name !== "android", "one wide run is enough");
    });

    test("the table: the head, a category with its count, the columns, the sums of the barbers; search and fold", async ({ page }) => {
      await page.goto("/admin/services");
      await hydrated(page);
      await expect(page.getByRole("heading", { level: 1, name: S.title })).toBeVisible();
      await expect(page.locator(".adm-star:visible")).toHaveCount(1);
      await expect(page.locator(".sv-crumb:visible")).toHaveText(S.crumb);
      await expect(page.getByRole("searchbox", { name: S.search })).toBeVisible();
      const add = page.getByRole("button", { name: S.add });
      await expect(add).toHaveCSS("background-color", "rgb(255, 203, 0)");

      // one category, «Барберинг · 8 услуг», a grey head
      const head = page.locator(".sv-ghead:visible");
      await expect(head).toHaveCount(1);
      await expect(head).toHaveText(new RegExp(`^Барберинг\\s*· ${S.servicesN(8)}`));
      await expect(head).toHaveCSS("background-color", "rgb(240, 243, 248)");
      // 56px, its name in the middle as its pencil and chevron are
      const [hb, nb] = await Promise.all([head.boundingBox(), head.locator(".sv-gname").boundingBox()]);
      expect(Math.round(hb!.height)).toBe(56);
      expect(Math.abs(nb!.y + nb!.height / 2 - (hb!.y + hb!.height / 2))).toBeLessThan(2);
      await expect(page.locator(".sv-cols:visible [role=columnheader]")).toHaveText([S.cols.name, S.cols.online, S.cols.price, S.cols.time, S.cols.barbers, ""]);
      await expect(page.locator(".sv-row:visible")).toHaveCount(8);
      expect(Math.round((await row(page, CLIP).boundingBox())!.height)).toBe(52);

      // the barbers' sums: Renat's 35 € and Valentin's 30–35 € for the grey, Renat's 45 minutes for the cut
      await expect(row(page, GREY).locator(".sv-price")).toHaveText(S.from(eur(3000)));
      await expect(row(page, CLIP).locator(".sv-c-time")).toHaveText(S.each);
      await expect(row(page, BUZZ).locator(".sv-c-time")).toHaveText(A.mins(45));
      await expect(row(page, BUZZ).locator(".sv-price")).toHaveText(eur(3500));
      // five barbers cut: four tiles and «+1»; the fathers and sons are Valentin's alone
      await expect(row(page, CLIP).locator(".sv-tile")).toHaveText(["R", "V", "J", "S", "+1"]);
      await expect(row(page, FS).locator(".sv-tile")).toHaveText(["V"]);
      await expectNoSideScroll(page);
      await shot(page, "table");

      // the search leaves out what does not match, across the languages
      const search = page.getByRole("searchbox", { name: S.search });
      await search.fill("бород");
      await expect(page.locator(".sv-row:visible")).toHaveCount(2);
      await search.fill("Isa ja poeg");
      await expect(page.locator(".sv-row:visible")).toHaveCount(1);
      await search.fill("нет такой");
      await expect(page.getByRole("status").filter({ hasText: S.nothing })).toBeVisible();
      await search.fill("");

      // the chevron folds the category, and it stays folded for this tab
      await page.getByRole("button", { name: S.fold("Барберинг") }).click();
      await expect(page.locator(".sv-row:visible")).toHaveCount(0);
      await page.reload();
      await hydrated(page);
      await expect(page.locator(".sv-row:visible")).toHaveCount(0);
      await page.getByRole("button", { name: S.unfold("Барберинг") }).click();
      await expect(page.locator(".sv-row:visible")).toHaveCount(8);

      // a small laptop: the columns give way, and the table scrolls inside its card, never the page
      await page.setViewportSize({ width: 1024, height: 768 });
      await expectNoSideScroll(page);
      await expect(row(page, CLIP).getByRole("button", { name: S.open(CLIP) })).toBeVisible();
    });

    test("the switch and the price in place write at once", async ({ page }) => {
      await page.goto("/admin/services");
      await hydrated(page);
      const sw = page.getByRole("switch", { name: S.onlineOf(KID) });
      await expect(sw).toBeChecked();
      await sw.click();
      await expect(sw).not.toBeChecked();
      await expect(row(page, KID).locator(".sv-onl")).toContainText(S.off);
      await page.reload();
      await hydrated(page);
      await expect(page.getByRole("switch", { name: S.onlineOf(KID) })).not.toBeChecked();
      await page.getByRole("switch", { name: S.onlineOf(KID) }).click();
      await expect(page.getByRole("switch", { name: S.onlineOf(KID) })).toBeChecked();
      await page.reload();
      await hydrated(page);
      await expect(page.getByRole("switch", { name: S.onlineOf(KID) })).toBeChecked();

      // the price: a dashed link; a click makes it a field with a yellow frame; Enter saves, Escape drops
      const price = row(page, BUZZ).locator(".sv-price");
      await expect(price).toHaveCSS("border-bottom-style", "dashed");
      await price.click();
      const field = page.getByRole("textbox", { name: S.priceOf(BUZZ) });
      await expect(field).toHaveValue("35");
      await expect(row(page, BUZZ).locator(".sv-pin")).toHaveCSS("border-top-color", "rgb(255, 203, 0)");
      await field.fill("99");
      await field.press("Escape");
      await expect(price).toHaveText(eur(3500));
      await price.click();
      await field.fill("36");
      await field.press("Enter");
      // every barber had the base's price, so all follow it: one price still
      await expect(row(page, BUZZ).locator(".sv-price")).toHaveText(eur(3600));
      await page.reload();
      await hydrated(page);
      await expect(row(page, BUZZ).locator(".sv-price")).toHaveText(eur(3600));
      await row(page, BUZZ).locator(".sv-price").click();
      await page.getByRole("textbox", { name: S.priceOf(BUZZ) }).fill("abc");
      await page.getByRole("textbox", { name: S.priceOf(BUZZ) }).press("Enter");
      await expect(page.getByRole("alert").filter({ hasText: S.badPrice })).toBeVisible();
      await page.getByRole("textbox", { name: S.priceOf(BUZZ) }).fill("35");
      await page.getByRole("textbox", { name: S.priceOf(BUZZ) }).press("Enter");
      await expect(row(page, BUZZ).locator(".sv-price")).toHaveText(eur(3500));
    });

    test("a service's window: 900px from the right; the barbers' own prices and times; a save changes the row", async ({ page }) => {
      await page.goto("/admin/services");
      await hydrated(page);
      await row(page, CUTBEARD).getByRole("button", { name: CUTBEARD, exact: true }).click();
      const w = win(page, CUTBEARD);
      await expect(w).toBeVisible();
      const box = (await w.boundingBox())!;
      expect([Math.round(box.width), Math.round(box.x + box.width), Math.round(box.height)]).toEqual([900, 1440, 900]);
      await expect(page.locator(".sv-wrap")).toHaveCSS("background-color", "rgba(43, 49, 52, 0.45)");
      await expect(row(page, CUTBEARD)).toHaveClass(/is-open/);
      await expect(w.locator(".sv-whead p")).toHaveText(S.subtitle("Барберинг", 5));
      await expect(w.getByRole("tab", { name: S.tabMain })).toHaveAttribute("aria-selected", "true");
      await expect(w.getByLabel(S.category)).toHaveValue(demoId("category", "barbering"));
      await expect(w.getByRole("textbox", { name: S.basePrice })).toHaveValue("60");
      await expect(w.getByRole("combobox", { name: S.hours })).toHaveValue("1");
      await expect(w.getByRole("combobox", { name: S.minutes })).toHaveValue("15");

      // five barbers; Valentin and Jevgeni take 90 minutes, their own
      await expect(w.locator(".sv-srow")).toHaveCount(5);
      for (const who of ["Valentin", "Jevgeni"]) await expect(barber(w, who).locator(".sv-own")).toHaveText([S.own]);
      for (const who of ["Renat", "Slava", "Milena"]) await expect(barber(w, who).locator(".sv-own")).toHaveCount(0);
      await expect(w.getByRole("combobox", { name: S.timeFor("Valentin") })).toHaveValue("90");
      await expect(w.locator(".sv-sum b")).toHaveText([eur(6000), S.each]);
      await shot(page, "window");

      // Milena's own price, and Slava does not do it
      await w.getByRole("textbox", { name: S.priceFor("Milena") }).fill("65");
      await expect(barber(w, "Milena").locator(".sv-own")).toHaveText([S.own]);
      await w.getByRole("switch", { name: S.doesOf("Slava") }).click();
      await expect(barber(w, "Slava")).toHaveClass(/is-off/);
      await expect(barber(w, "Slava")).toContainText(S.doesNot);
      await expect(w.locator(".sv-whead p")).toHaveText(S.subtitle("Барберинг", 4));
      await expect(w.locator(".sv-sum b")).toHaveText([S.from(eur(6000)), S.each]);

      // Escape with changes asks first; «Вернуться» keeps the window
      await page.keyboard.press("Escape");
      const ask = page.getByRole("alertdialog", { name: S.unsaved });
      await expect(ask).toBeVisible();
      await ask.getByRole("button", { name: S.stay }).click();
      await expect(ask).toHaveCount(0);
      await expect(w).toBeVisible();

      await w.getByRole("button", { name: A.save, exact: true }).click();
      await expect(w).toHaveCount(0);
      await expect(row(page, CUTBEARD).locator(".sv-price")).toHaveText(S.from(eur(6000)));
      await expect(row(page, CUTBEARD).locator(".sv-tile")).toHaveText(["R", "V", "J", "M"]);

      // and back as it was
      await row(page, CUTBEARD).getByRole("button", { name: S.open(CUTBEARD) }).click();
      await expect(w).toBeVisible();
      await expect(w.getByRole("textbox", { name: S.priceFor("Milena") })).toHaveValue("65");
      await expect(w.getByRole("textbox", { name: S.priceFor("Slava") })).toBeDisabled();
      await w.getByRole("textbox", { name: S.priceFor("Milena") }).fill("60");
      await w.getByRole("switch", { name: S.doesOf("Slava") }).click();
      await w.getByRole("button", { name: A.save, exact: true }).click();
      await expect(w).toHaveCount(0);
      await expect(row(page, CUTBEARD).locator(".sv-price")).toHaveText(eur(6000));
      await expect(row(page, CUTBEARD).locator(".sv-tile")).toHaveText(["R", "V", "J", "S", "+1"]);
    });

    test("«Добавить услугу» opens a new one; «?open=» opens a service; the round «›» closes it", async ({ page }) => {
      await page.goto("/admin/services");
      await hydrated(page);
      await page.getByRole("button", { name: S.add }).click();
      const fresh = win(page, S.newTitle);
      await expect(fresh).toBeVisible();
      // every barber does a new service at its base, in the first category
      await expect(fresh.getByRole("switch", { name: S.doesOf("Renat") })).toBeChecked();
      await expect(fresh.locator(".sv-whead p")).toHaveText(S.subtitle("Барберинг", 5));
      await expect(fresh.getByText(S.range)).toBeVisible();
      await fresh.getByRole("button", { name: A.cancel }).click();
      await expect(fresh).toHaveCount(0);

      await page.goto(`/admin/services?open=${demoId("service", "fs")}`);
      await hydrated(page);
      const w = win(page, FS);
      await expect(w).toBeVisible();
      await expect(w.locator(".sv-whead p")).toHaveText(S.subtitle("Барберинг", 1));
      // the online tab: the switch and the names in the other languages
      await w.getByRole("tab", { name: S.tabOnline }).click();
      await expect(w.getByLabel(S.nameIn.et)).toHaveValue("Isa ja poeg");
      // nothing changed: «Сохранить» waits, and the seam closes it without asking
      await expect(w.getByRole("button", { name: A.save, exact: true })).toBeDisabled();
      const seam = w.locator(".sv-seam");
      await expect(seam).toHaveCSS("border-radius", "50%");
      await seam.click();
      await expect(w).toHaveCount(0);
      await expect(page).toHaveURL(/\/admin\/services$/);
    });

    test("the barber page shows his services and prices only; each opens its window", async ({ page }) => {
      await page.goto(`/admin/staff/${demoId("staff", "renat")}`);
      await hydrated(page);
      const part = page.getByRole("region", { name: A.staff.offersRow });
      await expect(part).toBeVisible();
      await expect(part.getByText(S.onStaff.hint)).toBeVisible();
      await expect(part.locator("input")).toHaveCount(0);
      // his cut takes 45 minutes, his own
      const clip = part.getByRole("link", { name: new RegExp(CLIP) });
      await expect(clip).toHaveAttribute("href", `/admin/services?open=${demoId("service", "clip")}`);
      await expect(clip).toContainText(A.mins(45));
      await expect(clip).toContainText(S.onStaff.own);
      await expect(clip).toContainText(eur(4000));
      await expect(part.getByRole("link", { name: S.onStaff.all })).toHaveAttribute("href", "/admin/services");
      await clip.click();
      await page.waitForURL((u) => u.pathname === "/admin/services");
      await expect(win(page, CLIP)).toBeVisible();
      await expect(win(page, CLIP).getByRole("combobox", { name: S.timeFor("Renat") })).toHaveValue("45");
    });
  });

  test("on a phone: a row is the name with its price and time; the window is a full-screen sheet", async ({ page }) => {
    await page.goto("/admin/services");
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: S.title })).toBeVisible();
    await expect(page.locator(".sv-cols:visible")).toHaveCount(0);
    await expect(row(page, CLIP).locator("small")).toHaveText(`${eur(4000)} · ${S.each}`);
    await expect(row(page, GREY).locator("small")).toHaveText(`${S.from(eur(3000))} · ${A.mins(30)}`);
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    await shot(page, "list");

    await row(page, CUTBEARD).getByRole("button", { name: CUTBEARD, exact: true }).click();
    const w = win(page, CUTBEARD);
    await expect(w).toBeVisible();
    const vp = page.viewportSize()!;
    const box = (await w.boundingBox())!;
    expect([Math.round(box.x), Math.round(box.width), Math.round(box.height)]).toEqual([0, vp.width, vp.height]);
    await expect(w.getByRole("switch", { name: S.doesOf("Milena") })).toBeChecked();
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    await shot(page, "window");
    await w.getByRole("button", { name: A.close }).click();
    await expect(w).toHaveCount(0);
  });
});
