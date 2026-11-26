import { A, asBarber, asOwner, B, expect, expectNoSideScroll, hydrated, loginByCode, nextWorkday, phoneOf, setSwitch, sheet, smallTargets, test, toast } from "./helpers";
import { ru as ruCopy } from "../src/app/b/copy.ru";
import { et } from "../src/app/b/copy.et";

/** B5 and B1 around the edges: «Ещё», the push panel without keys, the language, logging out; Renat's view. */
test.describe("«Ещё»", () => {
  test.use(asBarber);

  test("his login, push off without the server's keys, his own five kinds", async ({ page, barber }) => {
    await page.goto("/b/more");
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: B.more.title })).toBeVisible();
    await expect(page.getByText(barber.email)).toBeVisible();
    const push = page.getByRole("region", { name: B.push.title });
    // the e2e server has no VAPID keys: the button is grey and does nothing
    await expect(push.getByText(B.push.notConfigured)).toBeVisible();
    await expect(push.getByRole("button", { name: B.push.enable })).toBeDisabled();
    await expect(push.getByRole("button", { name: B.push.enable })).not.toHaveClass(/adm-btn-lime/);
    const kinds = push.getByRole("switch");
    await expect(kinds).toHaveCount(5);
    // a kind switched off stays off after a reload, and back on
    const plan = push.getByRole("switch", { name: B.push.kinds.day_plan });
    await expect(plan).toBeChecked();
    await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), plan.uncheck()]);
    await page.reload();
    await expect(page.getByRole("switch", { name: B.push.kinds.day_plan })).not.toBeChecked();
    await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.getByRole("switch", { name: B.push.kinds.day_plan }).check()]);
    await page.reload();
    await expect(page.getByRole("switch", { name: B.push.kinds.day_plan })).toBeChecked();
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
  });

  test("Eesti, then Русский again: the whole app follows his login", async ({ page }) => {
    await page.goto("/b/more");
    await hydrated(page);
    const lang = page.getByRole("group", { name: ruCopy.more.language });
    await lang.getByRole("button", { name: "Eesti" }).click();
    await expect(page.getByRole("heading", { level: 1, name: et.more.title })).toBeVisible();
    await page.getByRole("link", { name: et.nav.day, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: et.day.today })).toBeVisible();
    await page.goto("/b/more");
    await hydrated(page);
    await page.getByRole("group", { name: et.more.language }).getByRole("button", { name: "Русский" }).click();
    await expect(page.getByRole("heading", { level: 1, name: ruCopy.more.title })).toBeVisible();
  });
});

test.describe("logging out", () => {
  test("«Выйти» ends this phone's session", async ({ page }) => {
    await loginByCode(page, "slava@example.test");
    await page.goto("/b/more");
    await hydrated(page);
    await page.getByRole("button", { name: B.more.logout }).click();
    await page.waitForURL((u) => u.pathname === "/b/login");
    await page.goto("/b");
    await page.waitForURL((u) => u.pathname === "/b/login");
  });
});

test.describe("Renat on /b", () => {
  test.use(asOwner);

  test("picks a barber and sees his day as he does", async ({ page, barber }) => {
    await page.goto("/b/pick");
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: B.pick.title })).toBeVisible();
    await expectNoSideScroll(page);
    // grouped by today (26.11): «Сегодня работают · N», «Сегодня выходной · N»; the demo's today may be anyone's day off
    const groups = await page.locator(".bx-pick .bx-gh").all();
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      const n = await g.locator("xpath=following-sibling::ul[1]/li").count();
      expect([B.pick.working(n), B.pick.offToday(n)]).toContain((await g.textContent())?.trim());
    }
    await page.getByRole("button", { name: barber.name }).click();
    await page.waitForURL((u) => u.pathname === "/b");
    await expect(page.getByRole("link", { name: B.pick.viewing(barber.name) })).toBeVisible();
    await expect(page.locator(".bx-cal .cal-v").first()).toBeVisible();
    await page.goto("/b/more");
    await expect(page.getByRole("link", { name: B.more.toAdmin })).toBeVisible();
    // Renat's own kinds: five, about the salon; on from the start as he answered (18.11): online bookings, a client's move or cancel
    const kinds = page.getByRole("region", { name: B.push.title });
    await expect(kinds.getByRole("switch", { name: B.push.kinds.own_online })).toBeChecked();
    await expect(kinds.getByRole("switch", { name: B.push.kinds.own_client })).toBeChecked();
    await expect(kinds.getByRole("switch", { name: B.push.kinds.own_request })).not.toBeChecked();
  });

  test("his change as a barber applies at once, even with «С моего ОК»", async ({ page, browser, barber }, info) => {
    const owner2 = await phoneOf(browser, info, "owner");
    await setSwitch(owner2, "time", "ask");
    try {
      await page.goto("/b/pick");
      await hydrated(page);
      await page.getByRole("button", { name: barber.name }).click();
      await page.waitForURL((u) => u.pathname === "/b");
      await page.goto("/b/time");
      await hydrated(page);
      await page.getByRole("button", { name: B.time.add.block, exact: true }).click();
      const s = sheet(page);
      await s.getByLabel(B.time.day, { exact: true }).fill(nextWorkday(barber.slug, 2));
      await s.getByLabel(B.time.start, { exact: true }).fill("19:30");
      await s.getByLabel(B.time.end, { exact: true }).fill("19:45");
      await s.getByLabel(B.time.note).fill("E2E от Рената");
      // the admin is not asked: «Сохранить», not «Отправить Ренату»
      await s.getByRole("button", { name: B.time.save, exact: true }).click();
      await expect(toast(page)).toHaveText(B.time.saved);
      const all = page.getByRole("button", { name: /^Показать всё/ });
      if (await all.count()) await all.click();
      await page.getByRole("button", { name: new RegExp(`^${B.time.remove}: ${B.time.add.block}, .*19:30`) }).click();
      await page.getByRole("button", { name: B.time.removeYes }).click();
      await expect(toast(page)).toHaveText(B.time.removed);
    } finally {
      await setSwitch(owner2, "time", "now");
      await owner2.context().close();
    }
  });

  test("«Запросы» on his phone: no sideways scroll, big enough to tap", async ({ page }) => {
    await page.goto("/admin/requests");
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: A.req.title })).toBeVisible();
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
  });
});
