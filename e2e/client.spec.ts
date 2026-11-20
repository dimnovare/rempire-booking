import { asBarber, B, demoId, expect, expectNoSideScroll, hydrated, nextWorkday, phoneOf, sheet, smallTargets, test, toast, workdayFrom } from "./helpers";

/** B6: the client's card from a visit, the shared note, the visit's note, «Записать снова». */
test.describe("a client", () => {
  test.use(asBarber);
  // every test here starts from a demo visit of his next working day

  test("the card: calls, visits, the shared note Renat sees in the admin", async ({ page, browser, barber }, info) => {
    const day = nextWorkday(barber.slug);
    const note = `E2E заметка ${barber.name}`;
    await page.goto(`/b?d=${day}`);
    await hydrated(page);
    // a demo client with a phone
    const visit = page.locator(".bx-v", { hasText: "Demo client" }).first();
    const client = (await visit.locator(".bx-v-main b").innerText()).trim();
    await visit.getByRole("button").click();
    await sheet(page).getByRole("button", { name: B.client.card }).click();
    const s = sheet(page);
    await expect(s.getByRole("heading", { name: client })).toBeVisible();
    await expect(s.getByRole("link", { name: new RegExp(B.visit.call) })).toHaveAttribute("href", /^tel:\+/);
    await expect(s.getByText(/визит(а|ов)? у вас/)).toBeVisible();
    await expect(s.getByText(B.client.ahead, { exact: true })).toBeVisible();
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);

    await s.getByRole("button", { name: B.client.addNote }).or(s.getByRole("button", { name: B.client.edit })).first().click();
    await s.getByRole("textbox", { name: B.visit.clientNote }).fill(note);
    await s.getByRole("button", { name: B.save, exact: true }).click();
    await expect(toast(page)).toHaveText(B.client.noteSaved);
    await expect(s.getByText(note)).toBeVisible();

    // back on the visit: the same note
    await s.getByRole("button", { name: B.client.back }).click();
    await expect(sheet(page).getByText(note)).toBeVisible();

    // Renat, in the admin calendar, on that visit
    const owner = await phoneOf(browser, info, "owner");
    await owner.goto(`/admin?d=${day}&s=${demoId("staff", barber.slug)}`);
    await hydrated(owner);
    await owner.getByRole("button", { name: new RegExp(client) }).first().click();
    await expect(owner.getByRole("dialog").getByText(note)).toBeVisible();
    await owner.context().close();
  });

  test("a note for this visit only", async ({ page, barber }) => {
    const day = nextWorkday(barber.slug);
    const note = `E2E к записи ${barber.name}`;
    await page.goto(`/b?d=${day}`);
    await hydrated(page);
    await page.locator(".bx-v button").nth(1).click();
    const s = sheet(page);
    await s.locator(".vs-note.is-visit .vs-link").click();
    await s.getByRole("textbox", { name: B.vs.staffNote }).fill(note);
    await s.getByRole("button", { name: B.vs.save, exact: true }).click();
    await expect(toast(page)).toHaveText(B.vs.noteSaved);
    await page.reload();
    await hydrated(page);
    await page.locator(".bx-v button").nth(1).click();
    await expect(sheet(page).getByText(note)).toBeVisible();
  });

  test("«Записать снова»: the same client and services, four weeks on", async ({ page, barber }) => {
    const day = nextWorkday(barber.slug);
    await page.goto(`/b?d=${day}`);
    await hydrated(page);
    const visit = page.locator(".bx-v", { hasText: "Demo client" }).first();
    const client = (await visit.locator(".bx-v-main b").innerText()).trim();
    await visit.getByRole("button").click();
    await sheet(page).getByRole("button", { name: B.book.again }).click();
    const s = sheet(page);
    await expect(s.getByRole("heading", { name: B.book.new })).toBeVisible();
    await expect(s.locator(".adm-client")).toContainText(client);
    await expect(s.getByRole("group", { name: B.book.services }).getByRole("button", { pressed: true })).toHaveCount(1);
    const later = new Date(Date.parse(`${day}T12:00:00Z`) + 28 * 86_400_000).toISOString().slice(0, 10);
    await expect(s.getByLabel(B.book.day, { exact: true })).toHaveValue(later);
    // four weeks on may be a day he does not work (a dated day off, a swapped shift): then the first day after it that he does
    const free = workdayFrom(barber.slug, later);
    if (free !== later) await s.getByLabel(B.book.day, { exact: true }).fill(free);
    await s.getByRole("group", { name: B.book.time }).getByRole("button").first().click();
    await s.getByRole("button", { name: B.book.book, exact: true }).click();
    await expect(toast(page)).toContainText(B.book.booked("").trim());
    await expect(page).toHaveURL(new RegExp(`d=${free}`));
    await expect(page.locator(".bx-v", { hasText: client })).toBeVisible();
  });
});
