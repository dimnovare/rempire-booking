import type { Page } from "@playwright/test";
import { A, asBarber, asOwner, B, demoId, expect, expectNoSideScroll, hydrated, nextWorkday, phoneOf, setSwitch, sheet, smallTargets, test, toast } from "./helpers";

/** B4: «Моё время» on his phone, and Renat's «Запросы» in the admin. */

const T = B.time;

/** Open /b/time with everything ahead shown. */
async function openTime(page: Page) {
  await page.goto("/b/time");
  await hydrated(page);
  const all = page.getByRole("button", { name: /^Показать всё/ });
  if (await all.count()) await all.click();
}

/** Remove one of his entries in «Впереди» by its kind and its words. */
async function removeAhead(page: Page, title: string, when: RegExp) {
  await page.getByRole("button", { name: new RegExp(`^${T.remove}: ${title}, ${when.source}`) }).click();
  await page.getByRole("button", { name: T.removeYes }).click();
  await expect(toast(page)).toHaveText(T.removed);
}

test.describe("his time", () => {
  test.use(asBarber);

  test("the page: four ways to add, his hours, his prices, no sideways scroll", async ({ page }) => {
    await openTime(page);
    await expect(page.getByRole("heading", { level: 1, name: T.title })).toBeVisible();
    const add = page.getByRole("group", { name: T.title });
    for (const k of [T.add.block, T.add.vacation, T.add.sick, T.add.special]) await expect(add.getByRole("button", { name: k })).toBeVisible();
    await expect(page.getByRole("heading", { name: T.hours })).toBeVisible();
    await expect(page.getByRole("heading", { name: T.prices })).toBeVisible();
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
  });

  test("a break applies at once, shows on his day, and goes away again", async ({ page, browser }, info) => {
    const owner = await phoneOf(browser, info, "owner");
    await setSwitch(owner, A.req.time, A.req.now);
    const day = nextWorkday();
    await openTime(page);
    await page.getByRole("button", { name: T.add.block, exact: true }).click();
    const s = sheet(page);
    await s.getByLabel(T.day, { exact: true }).fill(day);
    await s.getByLabel(T.start, { exact: true }).fill("19:00");
    await s.getByLabel(T.end, { exact: true }).fill("19:30");
    await s.getByLabel(T.note).fill("E2E перерыв");
    await s.getByRole("button", { name: T.save, exact: true }).click();
    await expect(toast(page)).toHaveText(T.saved);
    await expect(page.getByText("E2E перерыв")).toBeVisible();

    await page.goto(`/b?d=${day}`);
    await expect(page.locator(".bx-blk", { hasText: "E2E перерыв" })).toContainText("19:00");

    await openTime(page);
    await removeAhead(page, T.add.block, /.*19:00/);
    await expect(page.getByText("E2E перерыв")).toHaveCount(0);
    await owner.context().close();
  });

  test("with «С моего ОК» a vacation waits; Renat approves it with an answer", async ({ page, browser, barber }, info) => {
    const owner = await phoneOf(browser, info, "owner");
    await setSwitch(owner, A.req.time, A.req.ask);
    try {
      const day = nextWorkday(4);
      const note = `E2E отпуск ${barber.name}`;
      await openTime(page);
      await expect(page.getByText(T.modeTime.ask)).toBeVisible();
      await page.getByRole("button", { name: T.add.vacation, exact: true }).click();
      const s = sheet(page);
      await s.getByLabel(T.from, { exact: true }).fill(day);
      await s.getByLabel(T.to, { exact: true }).fill(day);
      await s.getByLabel(T.note).fill(note);
      await s.getByRole("button", { name: T.send }).click();
      await expect(toast(page)).toHaveText(T.sent);
      const mine = page.locator(".bx-rows li", { hasText: note });
      await expect(mine.getByText(T.waiting, { exact: true })).toBeVisible();
      // a waiting vacation already holds the day
      await page.goto(`/b?d=${day}`);
      await expect(page.locator(".bx-sum")).toContainText(B.day.kinds.vacation);

      // Renat: waiting, with the barber's name and his words
      await owner.goto("/admin/requests");
      await hydrated(owner);
      const row = owner.locator(".adm-req li", { hasText: note });
      await expect(row).toContainText(barber.name);
      await row.getByLabel(A.req.note).fill("E2E хорошо");
      await row.getByRole("button", { name: A.req.approve }).click();
      await expect(owner.locator(".adm-toast")).toHaveText(A.req.approved);
      await owner.reload();
      const done = owner.locator(".adm-req li", { hasText: note });
      await expect(done).toContainText(A.req.status.approved);
      await expect(done).toContainText("E2E хорошо");
      await expectNoSideScroll(owner);

      // the barber sees the answer
      await openTime(page);
      await expect(page.getByText(T.answer("E2E хорошо"))).toBeVisible();
      await expect(page.locator(".bx-rows li", { hasText: note }).getByText(T.waiting, { exact: true })).toHaveCount(0);
      // taking time back always applies at once
      await removeAhead(page, T.add.vacation, /.*/);
    } finally {
      await setSwitch(owner, A.req.time, A.req.now);
      await owner.context().close();
    }
  });

  test("a new price waits for Renat; he declines it and the price stays", async ({ page, browser, barber }, info) => {
    const owner = await phoneOf(browser, info, "owner");
    await setSwitch(owner, A.req.price, A.req.ask);
    await openTime(page);
    const first = page.locator(".bx-rows button.bx-row").first();
    const name = (await first.locator(".plain").innerText()).trim();
    const before = (await first.locator(".price").innerText()).trim();
    await first.click();
    const s = sheet(page);
    const price = s.getByLabel(T.price);
    await price.fill(String(Number((await price.inputValue()).replace(",", ".")) + 1));
    await s.getByRole("button", { name: T.send }).click();
    await expect(toast(page)).toHaveText(T.sent);
    const row = page.locator(".bx-rows button.bx-row", { hasText: name });
    await expect(row).toContainText(/ждёт ответа: /);

    await owner.goto("/admin/requests");
    await hydrated(owner);
    const req = owner.locator(".adm-req li", { hasText: barber.name }).filter({ hasText: name }).filter({ has: owner.getByRole("button", { name: A.req.decline }) });
    await req.getByRole("button", { name: A.req.decline }).click();
    await expect(owner.locator(".adm-toast")).toHaveText(A.req.declined);

    await openTime(page);
    await expect(row.locator(".price")).toHaveText(before);
    await expect(row).not.toContainText(/ждёт ответа: /);
    await expect(page.locator(".bx-rows li", { hasText: name }).getByText(T.status.declined)).toBeVisible();
    await owner.context().close();
  });

  test("a request he regrets: «Отозвать»", async ({ page }) => {
    await openTime(page);
    const first = page.locator(".bx-rows button.bx-row").first();
    await first.click();
    const s = sheet(page);
    await s.getByRole("button", { name: "+5" }).click();
    await s.getByRole("button", { name: T.send }).click();
    await expect(toast(page)).toHaveText(T.sent);
    await page.getByRole("button", { name: T.withdraw }).first().click();
    await expect(toast(page)).toHaveText(T.withdrawn);
    await expect(page.getByText(T.status.withdrawn).first()).toBeVisible();
  });

  test("his hours: saving the same week says nothing changed", async ({ page }) => {
    await openTime(page);
    await page.getByRole("button", { name: T.hoursEdit }).click();
    const s = sheet(page);
    await expect(s.getByRole("heading", { name: T.hours })).toBeVisible();
    await expectNoSideScroll(page);
    await s.getByRole("button", { name: T.save, exact: true }).click();
    await expect(s.getByRole("alert")).toHaveText(T.same);
  });

  test("special time in percent: «%» next to the number, «+50 %» ahead and on his day, money for a visit", async ({ page, browser }, info) => {
    const owner = await phoneOf(browser, info, "owner");
    await setSwitch(owner, A.req.time, A.req.now);
    await owner.context().close();
    // early morning well ahead: no demo visit and no other test is there
    const day = nextWorkday(9);
    await openTime(page);
    await page.getByRole("button", { name: T.add.special, exact: true }).click();
    const s = sheet(page);
    await s.getByLabel(T.day, { exact: true }).fill(day);
    await s.getByLabel(T.start, { exact: true }).fill("06:00");
    await s.getByLabel(T.end, { exact: true }).fill("08:00");
    // euros first, as it was; «%» has its own number and its own hint
    const unit = s.getByRole("group", { name: T.extraUnit });
    const field = s.getByLabel(T.extra, { exact: true });
    await expect(unit.getByRole("button", { name: "€" })).toHaveAttribute("aria-pressed", "true");
    await expect(s.getByText(T.extraHint)).toBeVisible();
    await unit.getByRole("button", { name: "%" }).click();
    await expect(unit.getByRole("button", { name: "%" })).toHaveAttribute("aria-pressed", "true");
    await expect(s.getByText(T.extraHintPct)).toBeVisible();
    await expect(field).toHaveValue("50");
    // a whole percent from 1 to 300, nothing else
    const save = s.getByRole("button", { name: T.save, exact: true });
    for (const bad of ["0", "301", "12.5", ""]) {
      await field.fill(bad);
      await expect(save).toBeDisabled();
    }
    await field.fill("50");
    await expect(save).toBeEnabled();
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    await save.click();
    await expect(toast(page)).toHaveText(T.saved);

    // «Впереди»: the window as he set it; «Запросы» says the same in words
    await openTime(page);
    const ahead = page.locator("section.adm-card", { has: page.getByRole("heading", { name: T.ahead }) }).locator(".bx-rows li", { hasText: "06:00–08:00" });
    await expect(ahead).toContainText(`${T.add.special} +50 %`);
    const asked = page.locator("section.adm-card", { has: page.getByRole("heading", { name: T.requests }) }).locator(".bx-rows li", { hasText: "06:00–08:00" });
    await expect(asked).toContainText(`${T.add.special} +50 % ·`);

    // his day: the window and its free time say the percent; no money yet
    await page.goto(`/b?d=${day}`);
    await hydrated(page);
    await expect(page.locator(".bx-sp", { hasText: "06:00–08:00" })).toContainText("+50 %");
    await expect(page.locator(".bx-gap.is-sp", { hasText: "06:00" })).toContainText("+50 %");

    // a visit there: the percent of this service's price, in euros
    await page.getByRole("button", { name: B.book.new }).click();
    const first = sheet(page).getByRole("group", { name: B.book.services }).getByRole("button").first();
    const price = Number(/· ([\d.]+) €/.exec(await first.innerText())![1]);
    await first.click();
    const half = price / 2;
    const at6 = sheet(page).getByRole("group", { name: B.book.time }).getByRole("button", { name: /^06:00/ });
    await expect(at6).toHaveClass(/is-sp/);
    await expect(at6.locator("small")).toHaveText(`+${Number.isInteger(half) ? half : half.toFixed(2)} €`);
    await sheet(page).getByRole("button", { name: B.close }).click();

    await openTime(page);
    await removeAhead(page, T.add.special, /.*06:00/);
    await expect(ahead).toHaveCount(0);
  });
});

test.describe("Renat: special time for a barber", () => {
  test.use(asOwner);

  test("an amount or a percent: «€ | %» next to the number; the list and the calendar say «+50 %»", async ({ page }) => {
    const day = nextWorkday(10);
    await page.goto(`/admin/staff/${demoId("staff", "slava")}`);
    await hydrated(page);
    // on a phone the part opens as a sheet; on a wide screen it is open already
    await page.getByRole("button", { name: new RegExp(`^${A.staff.special}`) }).click();
    const pane = page.getByRole("region", { name: A.staff.special });
    await pane.getByLabel(A.visit.date).fill(day);
    const unit = pane.getByRole("group", { name: A.staff.extraUnit });
    const field = pane.getByLabel(A.staff.extra, { exact: true });
    await expect(unit.getByRole("button", { name: "€" })).toHaveAttribute("aria-pressed", "true");
    await expect(field).toHaveValue("20");
    await unit.getByRole("button", { name: "%" }).click();
    await expect(field).toHaveValue("50");
    await expect(pane.getByText(A.staff.extraPctHint)).toBeVisible();
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);

    // the server's rule: a whole percent from 1 to 300
    const add = pane.getByRole("button", { name: A.add, exact: true });
    await field.fill("301");
    await add.click();
    await expect(pane.getByRole("alert")).toHaveText(A.visit.invalid("extra"));
    await field.fill("50");
    await add.click();
    const row = pane.locator(".adm-mini li", { hasText: "+50 %" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("22:00");

    // the calendar's band for that day says the percent too
    await page.goto(`/admin?d=${day}`);
    await hydrated(page);
    await expect(page.locator(".cal-sp", { hasText: "+50 %" })).toHaveCount(1);

    await page.goto(`/admin/staff/${demoId("staff", "slava")}`);
    await hydrated(page);
    await page.getByRole("button", { name: new RegExp(`^${A.staff.special}`) }).click();
    const again = page.getByRole("region", { name: A.staff.special });
    await again.locator(".adm-mini li", { hasText: "+50 %" }).getByRole("button", { name: A.remove }).click();
    await expect(again.locator(".adm-mini li", { hasText: "+50 %" })).toHaveCount(0);
  });
});
