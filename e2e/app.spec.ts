import path from "node:path";
import type { Page } from "@playwright/test";
import { COPY } from "../src/lib/i18n";
import { OUT } from "./env";
import { A, asBarber, asOwner, B, expect, expectNoSideScroll, hydrated, test } from "./helpers";

/**
 * The client app (docs/apps.md): the booking site with its own manifest and
 * icon, the install offer after a booking (never before), and the visit
 * this device booked on top of the booking page until it is over or
 * cancelled. A fake client books Milena, whom no other test uses, and
 * cancels at the end.
 *
 * The path is the Altegio widget's (docs/client-flow.md): barber, services,
 * day and time, details, each ending on «Продолжить».
 */
const c = COPY.ru;
const shot = async (page: Page, name: string) => {
  const body = await page.screenshot({ fullPage: true, path: path.join(OUT, "screens", `${test.info().project.name}-app-${name}.png`) });
  await test.info().attach(`app-${name}`, { body, contentType: "image/png" });
};

const cont = (page: Page) => page.getByRole("button", { name: new RegExp(`^${c.cont}`) });

/**
 * A fake client books Milena some days ahead, so the visit can still be
 * cancelled. Ends on the confirmation. `snap` takes a picture of each step.
 */
async function bookMilena(page: Page, phone: string, dayIndex = 3, snap: (name: string) => Promise<void> = async () => {}) {
  await page.goto("/ru");
  await hydrated(page);
  // 1 the barber
  await page.getByRole("radio", { name: /Milena/ }).click();
  await expect(page.getByRole("radio", { name: /Milena/ })).toHaveAttribute("aria-checked", "true");
  await snap("1-barber");
  await cont(page).click();
  // 2 the services: the bar with the count comes with the first tick
  await expect(page.getByRole("heading", { level: 1, name: c.chooseServices })).toBeVisible();
  await expect(page.locator(".basket")).toHaveCount(0);
  await page.getByRole("checkbox").first().click();
  await expect(page.locator(".basket")).toContainText(c.nServices(1));
  await snap("2-services");
  await cont(page).click();
  // 3 the day and the time: a free day some days ahead, in this month or the next
  const free = page.locator(".cal-d:not(.off):not([disabled])");
  await expect(free.first()).toBeVisible();
  if ((await free.count()) <= dayIndex) await page.getByRole("button", { name: c.nextMonth }).click();
  await free.nth(Math.min(dayIndex, (await free.count()) - 1)).click();
  // «Продолжить» only once a time is picked
  await expect(cont(page)).toHaveCount(0);
  await page.locator(".slots .slot").first().click();
  await snap("3-time");
  await cont(page).click();
  // 4 the details: nothing is booked without the tick
  await expect(page.getByRole("heading", { level: 1, name: c.visitDetails })).toBeVisible();
  await page.locator("#f-name").fill("App Test Client");
  await page.locator("#f-phone").fill(phone);
  await page.getByRole("button", { name: c.book, exact: true }).click();
  await expect(page.getByText(c.errConsent)).toBeVisible();
  await page.locator("#f-consent").click();
  await snap("4-details");
  await page.getByRole("button", { name: c.book, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: c.booked })).toBeVisible();
}

/** From the booking page: open the visit on top and cancel it. */
async function cancelFromTop(page: Page) {
  await page.goto("/ru");
  await hydrated(page);
  await page.locator(".next").click();
  await page.waitForURL((u) => /^\/ru\/visit\//.test(u.pathname));
  await hydrated(page);
  await page.getByRole("button", { name: c.cancel }).click();
  await page.getByRole("button", { name: c.cancelYes }).click();
  await expect(page.getByRole("heading", { level: 1, name: c.cancelled })).toBeVisible();
}

test.describe("the client app", () => {
  test("its own manifest and icon on every client page, never the staff app's", async ({ page, request }) => {
    for (const locale of ["ru", "et", "en"]) {
      await page.goto(`/${locale}`);
      const href = await page.locator('link[rel="manifest"]').getAttribute("href");
      expect(href).toBe(`/${locale}/manifest.webmanifest`);
      const m = await (await request.get(href!)).json();
      expect(m).toMatchObject({ id: "/", short_name: "REMPIRE", start_url: `/${locale}`, display: "standalone" });
      for (const icon of m.icons) {
        const r = await request.get(icon.src);
        expect(r.status(), icon.src).toBe(200);
        expect(r.headers()["content-type"]).toMatch(/image\/png/);
      }
    }
    // the iPhone's home-screen icon: the client's own, and it loads
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
    expect(apple).toMatch(/^\/en\/apple-icon/);
    expect((await request.get(apple!)).status()).toBe(200);
  });

  test("books; the install offer comes only then; the visit is on top next time, until it is cancelled", async ({ page }, info) => {
    const phone = `+372 5555 04${info.project.name === "iphone" ? "02" : "01"}`;
    await page.goto("/ru");
    await hydrated(page);
    // nothing about installing, and no visit yet
    await expect(page.locator(".install")).toHaveCount(0);
    await expect(page.locator(".next")).toHaveCount(0);

    // barber, services, a time some days ahead, details: booked
    await bookMilena(page, phone, 3, async (name) => {
      await expectNoSideScroll(page);
      await shot(page, name);
    });
    // a client moves or cancels at any time: no cutoff, no «call the salon»
    await expect(page.getByText(c.anyTime)).toBeVisible();

    // this server has no push keys (unless E2E_VAPID=yes), so the reminder as a notification is not offered
    if (process.env.E2E_VAPID !== "yes") await expect(page.locator(".remind")).toHaveCount(0);

    // now the offer, in this phone's own words
    const offer = page.getByRole("region", { name: c.install.title });
    await expect(offer).toBeVisible();
    await expect(offer.getByText(info.project.name === "iphone" ? c.install.ios[1] : c.install.android)).toBeVisible();
    await expectNoSideScroll(page);
    await shot(page, "booked");

    // «Не сейчас»: gone, and it stays gone
    await offer.getByRole("button", { name: c.install.later }).click();
    await expect(page.locator(".install")).toHaveCount(0);

    // the next time the app opens: the visit on top
    await page.goto("/ru");
    await hydrated(page);
    const next = page.locator(".next");
    await expect(next).toBeVisible();
    await expect(next).toContainText(c.yourVisit);
    await expect(next).toContainText("Milena");
    await expect(next).toContainText(c.changeCancel);
    await expectNoSideScroll(page);
    await shot(page, "next-visit");

    // it leads to the visit; cancelled there, it is gone from the booking page
    await next.click();
    await page.waitForURL((u) => /^\/ru\/visit\//.test(u.pathname));
    await hydrated(page);
    await expect(page.getByText(c.anyTime)).toBeVisible();
    await expectNoSideScroll(page);
    await shot(page, "visit");
    await page.getByRole("button", { name: c.cancel }).click();
    await page.getByRole("button", { name: c.cancelYes }).click();
    await expect(page.getByRole("heading", { level: 1, name: c.cancelled })).toBeVisible();
    await page.goto("/ru");
    await hydrated(page);
    await expect(page.locator(".next")).toHaveCount(0);
    await expect(page.locator(".install")).toHaveCount(0);
  });
});

test.describe("the booking path", () => {
  test("a link with ?b= opens with that barber picked; the language and the salon open as sheets", async ({ page }) => {
    await page.goto("/ru?b=milena");
    await hydrated(page);
    await expect(page.getByRole("radio", { name: /Milena/ })).toHaveAttribute("aria-checked", "true");
    await expect(cont(page)).toBeEnabled();

    // the salon
    await page.getByRole("button", { name: "REMPIRE" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toContainText("Mardi 1");
    await sheet.getByRole("button", { name: c.close }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // the language: the page turns Estonian, the barber stays picked
    await page.getByRole("button", { name: new RegExp(`^${c.lang}`) }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eesti" }).click();
    await expect(page.getByRole("button", { name: new RegExp(`^${COPY.et.cont}`) })).toBeVisible();
    await expect(page).toHaveURL(/\/et\?b=milena$/);
    await expect(page.getByRole("radio", { name: /Milena/ })).toHaveAttribute("aria-checked", "true");
    await expectNoSideScroll(page);
  });

  test("without a barber «Продолжить» waits; another barber keeps only the services he does", async ({ page }) => {
    await page.goto("/ru");
    await hydrated(page);
    await expect(cont(page)).toBeDisabled();
    await page.getByRole("radio", { name: c.anyBarber }).click();
    await cont(page).click();
    await page.getByRole("checkbox").first().click();
    await expect(page.locator(".basket")).toContainText(c.nServices(1));
    // back, a barber by name: his own price is on the bar now
    await page.getByRole("button", { name: c.back }).click();
    await page.getByRole("radio", { name: /Milena/ }).click();
    await cont(page).click();
    await expect(page.getByRole("checkbox").first()).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".basket")).toContainText("€");
  });
});

/**
 * The reminder as a notification (docs/apps.md, step 4). The e2e server has
 * no push keys, so clients are not offered it; run with E2E_VAPID=yes to
 * look at the block itself. No phone is subscribed here: that needs a real
 * push service.
 */
test.describe("the reminder as a notification", () => {
  test("with keys: offered on the confirmation and on the visit page, above the install offer", async ({ page }, info) => {
    test.skip(process.env.E2E_VAPID !== "yes", "needs E2E_VAPID=yes: the e2e server has no push keys otherwise");
    const iphone = info.project.name === "iphone";
    await bookMilena(page, `+372 5555 04${iphone ? "04" : "03"}`, 4);
    const remind = page.locator(".remind");
    // an iPhone in Safari: install first; anything else: one button
    if (iphone) await expect(remind).toHaveText(c.remind.iosFirst);
    else {
      await expect(remind.getByRole("button", { name: c.remind.ask })).toBeVisible();
      await expect(remind.getByText(c.remind.lead)).toBeVisible();
    }
    // the reminder first, the install offer under it
    const order = await page.evaluate(() => Array.from(document.querySelectorAll(".remind, .install")).map((el) => el.className));
    expect(order).toEqual(["remind", "install"]);
    await expectNoSideScroll(page);
    const body = await page.screenshot({ fullPage: true, path: path.join(OUT, "screens", `${info.project.name}-app-remind.png`) });
    await info.attach("app-remind", { body, contentType: "image/png" });

    await page.goto("/ru");
    await hydrated(page);
    await page.locator(".next").click();
    await page.waitForURL((u) => /^\/ru\/visit\//.test(u.pathname));
    await expect(page.locator(".remind")).toBeVisible();
    await expectNoSideScroll(page);
    await cancelFromTop(page);
  });

  test.describe("Renat's switch", () => {
    test.use(asOwner);

    test("SMS, notification or both: it saves by itself", async ({ page }) => {
      await page.goto("/admin/requests");
      await hydrated(page);
      const group = page.getByRole("group", { name: A.req.reminder });
      const card = page.locator(".adm-card", { has: group });
      await expect(group.getByRole("button")).toHaveText([A.req.reminderBy.sms, A.req.reminderBy.push, A.req.reminderBy.both]);
      await expect(group.getByRole("button", { name: A.req.reminderBy.both })).toHaveAttribute("aria-pressed", "true");
      await expect(card.getByText(A.req.reminderHint.both)).toBeVisible();
      await expectNoSideScroll(page);
      try {
        await group.getByRole("button", { name: A.req.reminderBy.push }).click();
        await expect(card.getByText(A.req.reminderHint.push)).toBeVisible();
        await expect(card.getByText(B.saved, { exact: true }).first()).toBeVisible();
        await page.reload();
        await hydrated(page);
        await expect(page.getByRole("group", { name: A.req.reminder }).getByRole("button", { name: A.req.reminderBy.push })).toHaveAttribute("aria-pressed", "true");
      } finally {
        // back to «both» for every other test
        const g = page.getByRole("group", { name: A.req.reminder });
        await g.getByRole("button", { name: A.req.reminderBy.both }).click();
        await expect(page.locator(".adm-card", { has: g }).getByText(B.saved, { exact: true }).first()).toBeVisible();
      }
    });
  });
});

/** «Продать»: «Фото» opens the phone's camera; an older picture has its own way in (Dim, 18.11). */
test.describe("a product by photo", () => {
  test.use(asBarber);

  test("«Фото» asks for the camera, «Выбрать из галереи» for a picture", async ({ page }) => {
    await page.goto("/b/sell");
    await hydrated(page);
    await expect(page.getByRole("button", { name: B.sell.photo, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: B.sell.gallery })).toBeVisible();
    const inputs = page.locator('.bx-sell-find input[type="file"]');
    await expect(inputs).toHaveCount(2);
    await expect(inputs.nth(0)).toHaveAttribute("capture", "environment");
    expect(await inputs.nth(1).getAttribute("capture")).toBeNull();
    // each button opens its own chooser
    const [camera] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: B.sell.photo, exact: true }).click()]);
    expect(await camera.element().getAttribute("capture")).toBe("environment");
    const [picture] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: B.sell.gallery }).click()]);
    expect(await picture.element().getAttribute("capture")).toBeNull();
    await expectNoSideScroll(page);
  });
});
