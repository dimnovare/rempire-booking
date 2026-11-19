import { asBarber, B, expect, expectNoSideScroll, hydrated, nextWorkday, sheet, smallTargets, test, toast } from "./helpers";

/** B3: booking, moving and cancelling from his phone, in his own column. Fake names only. */
test.describe("booking from the phone", () => {
  test.use(asBarber);
  // every test here is on his next working day: the demo visits are there, inside his hours

  test("«+»: a new client on a free time, then moved, then cancelled with a reason", async ({ page, barber }, info) => {
    const day = nextWorkday(barber.slug);
    const who = `E2E ${info.project.name} один`;
    await page.goto(`/b?d=${day}`);
    await hydrated(page);
    await page.getByRole("button", { name: B.book.new }).click();
    const s = sheet(page);
    await expect(s.getByRole("heading", { name: B.book.new })).toBeVisible();
    await expect(s.getByLabel(B.book.day, { exact: true })).toHaveValue(day);
    const book = s.getByRole("button", { name: B.book.book, exact: true });
    await expect(book).toBeDisabled();
    await s.getByRole("group", { name: B.book.services }).getByRole("button").first().click();
    const times = s.getByRole("group", { name: B.book.time });
    await times.getByRole("button").first().click();
    await s.getByLabel(B.book.name, { exact: true }).fill(who);
    expect(await smallTargets(page)).toEqual([]);
    await expectNoSideScroll(page);
    await book.click();
    await expect(toast(page)).toContainText(B.book.booked("").trim());
    const row = page.locator(".bx-v", { hasText: who });
    await expect(row).toBeVisible();
    const was = await row.locator(".bx-t b").innerText();

    // move it to another free time the same day
    await row.getByRole("button").click();
    await sheet(page).getByRole("button", { name: B.book.move }).click();
    const m = sheet(page);
    await expect(m.getByRole("heading", { name: B.book.moveTitle })).toBeVisible();
    await m.getByRole("group", { name: B.book.time }).getByRole("button", { disabled: false }).last().click();
    await m.getByRole("button", { name: /^Перенести на / }).click();
    await expect(toast(page)).toContainText(B.book.moved("").trim());
    await expect(row.locator(".bx-t b")).not.toHaveText(was);

    // cancel it: not without a reason
    await row.getByRole("button").click();
    await sheet(page).getByRole("button", { name: B.book.cancel }).click();
    const c = sheet(page);
    await expect(c.getByRole("heading", { name: B.book.cancelTitle })).toBeVisible();
    const go = c.getByRole("button", { name: B.book.cancelGo });
    await expect(go).toBeDisabled();
    await c.getByRole("group", { name: B.book.reason }).getByRole("button", { name: B.book.reasons[0] }).click();
    await expect(go).toBeEnabled();
    await go.click();
    await expect(toast(page)).toContainText(B.book.cancelled);
    await expect(row).toHaveCount(0);
  });

  test("a tap on free time books into that gap", async ({ page, barber }, info) => {
    const day = nextWorkday(barber.slug);
    const who = `E2E ${info.project.name} два`;
    await page.goto(`/b?d=${day}`);
    await hydrated(page);
    // «Свободно · 1 ч 15 мин» in minutes
    const minutes = (t: string) => Number(/(\d+)\s*ч/.exec(t)?.[1] ?? 0) * 60 + Number(/(\d+)\s*мин/.exec(t)?.[1] ?? 0);
    // the first gap with room for a 30-minute service
    const gaps = page.locator(".bx-gap button");
    await gaps.first().waitFor();
    const lens = (await gaps.locator(".bx-gap-main").allInnerTexts()).map(minutes);
    const gap = gaps.nth(lens.findIndex((n) => n >= 30));
    const at = (await gap.locator(".bx-t b").innerText()).trim();
    await gap.click();
    const s = sheet(page);
    // the shortest service
    const svcs = s.getByRole("group", { name: B.book.services }).getByRole("button");
    await svcs.first().waitFor();
    const mins = (await svcs.locator("small").allInnerTexts()).map((t) => minutes(t.split("·")[0]));
    await svcs.nth(mins.indexOf(Math.min(...mins))).click();
    await expect(s.getByRole("group", { name: B.book.time }).getByRole("button", { pressed: true })).toContainText(at);
    await s.getByLabel(B.book.name, { exact: true }).fill(who);
    await s.getByRole("button", { name: B.book.book, exact: true }).click();
    await expect(toast(page)).toContainText(at);
    await expect(page.locator(".bx-v", { hasText: who }).locator(".bx-t b")).toHaveText(at);
  });

  test("free time too short for any of his services shows, with no «+»", async ({ page, barber }) => {
    const day = nextWorkday(barber.slug);
    await page.goto(`/b?d=${day}`);
    await hydrated(page);
    const minutes = (t: string) => Number(/(\d+)\s*ч/.exec(t)?.[1] ?? 0) * 60 + Number(/(\d+)\s*мин/.exec(t)?.[1] ?? 0);
    // his shortest service, from the «+» sheet
    await page.getByRole("button", { name: B.book.new }).click();
    const svcs = sheet(page).getByRole("group", { name: B.book.services }).getByRole("button");
    await svcs.first().waitFor();
    const shortest = Math.min(...(await svcs.locator("small").allInnerTexts()).map((t) => minutes(t.split("·")[0])));
    await sheet(page).getByRole("button", { name: B.close }).click();

    // the demo day has a 15-minute gap after the first visit: seen, not tappable
    const short = page.locator(".bx-gap > div");
    await expect(short.first()).toBeVisible();
    await expect(page.locator(".bx-gap > div .bx-gap-add")).toHaveCount(0);
    // every gap with a «+» holds at least his shortest service
    for (const t of await page.locator(".bx-gap > button .bx-gap-main").allInnerTexts()) expect(minutes(t)).toBeGreaterThanOrEqual(shortest);
  });

  test("a taken time is refused; outside his hours asks first", async ({ page, barber }) => {
    const day = nextWorkday(barber.slug);
    await page.goto(`/b?d=${day}`);
    await hydrated(page);
    await page.getByRole("button", { name: B.book.new }).click();
    const s = sheet(page);
    await s.getByRole("group", { name: B.book.services }).getByRole("button").first().click();
    await s.getByRole("button", { name: B.book.otherTime }).click();
    await s.getByLabel(B.book.name, { exact: true }).fill("E2E занято");
    // 10:00: the demo client's visit
    await s.getByLabel(B.book.otherTime).fill("10:00");
    await s.getByRole("button", { name: B.book.book, exact: true }).click();
    await expect(s.getByRole("alert")).toHaveText(B.book.overlap);
    // 22:30: after his day (and after Valentin's demo special time, 20:00–22:00)
    await s.getByLabel(B.book.otherTime).fill("22:30");
    await s.getByRole("button", { name: B.book.book, exact: true }).click();
    await expect(s.getByRole("alert")).toHaveText(B.book.outsideHours);
    await s.getByRole("button", { name: B.cancel, exact: true }).click();
    await s.getByRole("button", { name: B.close }).click();
    await expect(page.locator(".bx-v", { hasText: "E2E занято" })).toHaveCount(0);
  });
});
