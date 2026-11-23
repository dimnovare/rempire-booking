import path from "node:path";
import type { Page } from "@playwright/test";
import { COPY } from "../src/lib/i18n";
import { DEMO_REVIEWS } from "../tools/demo-structure.mjs";
import { OUT } from "./env";
import { A, asBarber, B, expect, expectNoSideScroll, hydrated, test } from "./helpers";

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
  // the policy's link opens the policy in a new tab and leaves the tick and the form as they were
  const policy = page.locator("#f-consent-words a");
  await expect(policy).toHaveAttribute("href", "/ru/privacy");
  const [tab] = await Promise.all([page.context().waitForEvent("page"), policy.click()]);
  await tab.close();
  await expect(page.locator("#f-consent")).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("#f-name")).toHaveValue("App Test Client");
  await page.locator("#f-consent").click();
  await expect(page.locator("#f-consent")).toHaveAttribute("aria-checked", "true");
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

test.describe("moving a visit", () => {
  test("from its own link: another time, the same barber; then its page says so", async ({ page }, info) => {
    const iphone = info.project.name === "iphone";
    await bookMilena(page, `+372 5555 04${iphone ? "06" : "05"}`, 5);
    await page.goto("/ru");
    await hydrated(page);
    await page.locator(".next").click();
    await page.waitForURL((u) => /^\/ru\/visit\/[^/]+$/.test(u.pathname));
    await hydrated(page);
    const when = page.locator(".sum-row").nth(1);
    const before = await when.innerText();

    // «Перенести»: the day and time step alone, for this visit
    await page.getByRole("link", { name: c.moveBtn, exact: true }).click();
    await page.waitForURL((u) => /^\/ru\/visit\/[^/]+\/move$/.test(u.pathname));
    await hydrated(page);
    await expect(page.getByRole("heading", { name: c.movingTitle })).toBeVisible();
    await expect(page.locator(".slots .slot").first()).toBeVisible();
    // nothing to press until a time is picked
    await expect(page.getByRole("button", { name: c.moveHere })).toHaveCount(0);
    await page.locator(".slots .slot:not([disabled])").first().click();
    await expectNoSideScroll(page);
    await shot(page, "move");
    await page.getByRole("button", { name: c.moveHere }).click();

    // back on the visit's page, at the new time
    await page.waitForURL((u) => /^\/ru\/visit\/[^/]+$/.test(u.pathname) && u.searchParams.get("moved") === "1");
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: c.movedTitle })).toBeVisible();
    expect(await when.innerText()).not.toBe(before);
    await expectNoSideScroll(page);
    await shot(page, "moved");

    // and it can still be cancelled
    await page.getByRole("button", { name: c.cancel }).click();
    await page.getByRole("button", { name: c.cancelYes }).click();
    await expect(page.getByRole("heading", { level: 1, name: c.cancelled })).toBeVisible();
  });
});

test.describe("the booking path", () => {
  test("a link with ?b= opens with that barber picked; the language opens as a sheet", async ({ page }) => {
    await page.goto("/ru?b=milena");
    await hydrated(page);
    await expect(page.getByRole("radio", { name: /Milena/ })).toHaveAttribute("aria-checked", "true");
    await expect(cont(page)).toBeEnabled();

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
 * The salon's own page (docs/client-flow.md, «The salon's page»): «REMPIRE ▾»
 * opens it at /ru/about over the step the client is on, as the widget opens
 * its «about» page. The demo has REMPIRE's public details and made-up
 * reviews of the salon (tools/seed-demo.mjs, DEMO_REVIEWS: one hidden).
 */
test.describe("the salon's page", () => {
  const shown = DEMO_REVIEWS.filter((r) => !r.hidden);
  const salon = (page: Page) => page.locator("main.ab-app");
  /**
   * For the picture only: the map scrolled into view and its tiles loaded
   * or failed (or 8 s gone by, on a machine that cannot reach
   * OpenStreetMap), then back to the top. Nothing is asserted about the
   * tiles themselves.
   */
  const mapShown = async (page: Page) => {
    const map = salon(page).locator(".ab-map .osm");
    await map.scrollIntoViewIfNeeded();
    await map.evaluate(
      (el) =>
        new Promise<void>((done) => {
          setTimeout(done, 8000);
          const wait = [...el.querySelectorAll("img")].map((i) => (i.complete ? null : new Promise((ok) => (i.addEventListener("load", ok), i.addEventListener("error", ok)))));
          void Promise.all(wait).then(() => done());
        }),
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(salon(page).locator(".ab-bar")).not.toHaveClass(/\bsolid\b/);
    await page.waitForTimeout(300); // the bar's name has faded out
  };

  test("«REMPIRE ▾» opens it: contacts, words, photo, map, reviews six at a time; back returns to the step, the phone's back too", async ({ page }) => {
    await page.goto("/ru?b=milena");
    await hydrated(page);
    await page.getByRole("button", { name: "REMPIRE" }).click();
    await expect(page).toHaveURL(/\/ru\/about$/);
    const s = salon(page);
    await expect(s.getByRole("heading", { level: 1, name: "REMPIRE" })).toBeVisible();
    // the step under it is out of sight, its button too; «Записаться» instead
    await expect(page.getByRole("radio", { name: /Milena/ })).toHaveCount(0);
    await expect(cont(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: c.book, exact: true })).toBeVisible();

    // where, when, how to reach it
    for (const h of [c.salon.contacts, c.salon.about, c.salon.photos, c.salon.where, c.salon.reviews]) {
      await expect(s.getByRole("heading", { level: 2, name: h, exact: true })).toBeVisible();
    }
    await expect(s.getByText("пн–сб 10:00–19:00")).toBeVisible();
    await expect(s.getByRole("link", { name: "+372 5623 7237" })).toHaveAttribute("href", "tel:+37256237237");
    await expect(s.getByRole("link", { name: "www.rempire.ee" })).toHaveAttribute("href", "https://www.rempire.ee");
    await expect(s.getByText(/^Барберы из Эстонии/)).toBeVisible();
    await expect(s.locator(".ab-photos img")).toHaveCount(1);
    // our own map of OpenStreetMap's tiles, the pin where the salon is, the copyright line a link of its own
    const map = s.locator(".ab-map .osm");
    await expect(map.locator(".osm-pin")).toHaveAttribute("data-lat", "59.430883");
    await expect(map.locator(".osm-pin")).toHaveAttribute("data-lng", "24.761967");
    await expect(map.locator(".osm-tiles img").first()).toHaveAttribute("src", /^https:\/\/tile\.openstreetmap\.org\/16\/\d+\/\d+\.png$/);
    await expect(map.getByRole("link", { name: "© OpenStreetMap" })).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    // «Отзывы» opens with the card to write one
    await expect(s.getByRole("region", { name: c.salon.rate }).getByRole("button", { name: c.salon.rateN(5) })).toBeVisible();
    await expect(s.getByRole("link", { name: new RegExp(`^${c.salon.openMap}`) })).toHaveAttribute("href", /google\.com\/maps\/search\/\?api=1&query=59\.430883,24\.761967$/);

    // «★ 8 отзывов» leads down to them: six, the newest first, the hidden one never
    await s.getByRole("button", { name: new RegExp(`^${c.nReviews(shown.length)}`) }).click();
    await expect(s.getByRole("heading", { level: 2, name: c.salon.reviews })).toBeInViewport();
    const rows = s.locator(".rv");
    await expect(rows).toHaveCount(6);
    await expect(rows.first()).toContainText(shown[0].name);
    await expect(rows.first()).toContainText("2 октября 2025");
    await expect(rows.first()).toContainText(shown[0].body);
    await expect(rows.first().getByRole("img", { name: c.rated("5") })).toBeVisible();
    await expect(s.getByText("Hidden Example")).toHaveCount(0);
    await expectNoSideScroll(page);
    // scrolled down (the smooth scroll over), the top bar is white and names the salon
    await page.waitForFunction(() => new Promise<boolean>((done) => ((y) => setTimeout(() => done(window.scrollY === y), 250))(window.scrollY)));
    await expect(s.locator(".ab-bar")).toHaveClass(/\bnamed\b/);
    await expect(s.locator(".ab-bar")).toContainText("REMPIRE");
    const bar = await page.screenshot({ path: path.join(OUT, "screens", `${test.info().project.name}-app-salon-bar.png`) });
    await test.info().attach("app-salon-bar", { body: bar, contentType: "image/png" });
    await mapShown(page);
    await expect(s.locator(".ab-bar")).not.toHaveClass(/\bsolid\b/);
    await shot(page, "salon");

    // «Ещё отзывы»: the rest, and the button is gone. Scrolled up from under
    // «Записаться» first, as a thumb does: the page's end leaves room for it
    const more = s.getByRole("button", { name: c.salon.more });
    await more.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await more.click();
    await expect(rows).toHaveCount(shown.length);
    await expect(rows.last()).toContainText(shown[shown.length - 1].name);
    await expect(s.getByRole("button", { name: c.salon.more })).toHaveCount(0);
    await expectNoSideScroll(page);

    // back: the step as it was, the barber still picked
    await s.getByRole("button", { name: c.back }).click();
    await expect(page).toHaveURL(/\/ru\?b=milena$/);
    await expect(salon(page)).toHaveCount(0);
    await expect(page.getByRole("radio", { name: /Milena/ })).toHaveAttribute("aria-checked", "true");
    await expect(cont(page)).toBeEnabled();

    // the phone's back closes it too, and forward opens it again
    await page.getByRole("button", { name: "REMPIRE" }).click();
    await expect(salon(page)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/ru\?b=milena$/);
    await expect(salon(page)).toHaveCount(0);
    await expect(page.getByRole("radio", { name: /Milena/ })).toHaveAttribute("aria-checked", "true");
    await page.goForward();
    await expect(salon(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(salon(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/ru\?b=milena$/);
  });

  test("from a later step: the header's salon opens it, «Записаться» goes to the start with the choice kept", async ({ page }) => {
    await page.goto("/ru?b=milena");
    await hydrated(page);
    await cont(page).click();
    await page.getByRole("checkbox").first().click();
    await page.locator(".hd-co").click();
    await expect(page).toHaveURL(/\/ru\/about$/);
    await expect(salon(page).getByRole("heading", { level: 1, name: "REMPIRE" })).toBeVisible();
    await expect(page.locator(".basket")).toHaveCount(0);
    await page.getByRole("button", { name: c.book, exact: true }).click();
    await expect(page).toHaveURL(/\/ru\?b=milena$/);
    await expect(salon(page)).toHaveCount(0);
    await expect(page.getByRole("radio", { name: /Milena/ })).toHaveAttribute("aria-checked", "true");
  });

  test("its own address opens it; back goes to the booking start; in Estonian, and on a wide screen", async ({ page }, info) => {
    await page.goto("/et/about");
    await hydrated(page);
    const s = salon(page);
    const e = COPY.et;
    await expect(s.getByRole("heading", { level: 2, name: e.salon.about })).toBeVisible();
    await expect(s.getByText("E–L 10:00–19:00")).toBeVisible();
    await expect(s.getByText(/^Barberid Eestist/)).toBeVisible();
    await expect(s.locator(".rv")).toHaveCount(6);
    await expect(s.locator(".rv").first()).toContainText("2. oktoober 2025");
    await expectNoSideScroll(page);
    await s.getByRole("button", { name: e.back }).click();
    await expect(page).toHaveURL(/\/et$/);
    await expect(page.getByRole("radio", { name: e.anyBarber })).toBeVisible();

    // a wide screen: the same 600 px column, centred
    if (info.project.name !== "android") return;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/ru/about");
    await hydrated(page);
    await expect(salon(page).locator(".rv")).toHaveCount(6);
    const box = await salon(page).boundingBox();
    expect(box && Math.round(box.width)).toBe(600);
    expect(box && Math.round(box.x)).toBe(340);
    await expectNoSideScroll(page);
    // the whole page in one window: a full-page picture beyond the window leaves its end unpainted
    await page.setViewportSize({ width: 1280, height: await page.evaluate(() => document.documentElement.scrollHeight) });
    await mapShown(page);
    const body = await page.screenshot({ path: path.join(OUT, "screens", "pc-app-salon.png") });
    await test.info().attach("pc-app-salon", { body, contentType: "image/png" });
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

  // «SMS, push or both», once on «Запросы», is on «Настройки → Уведомления» now: notifications.spec.ts
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
