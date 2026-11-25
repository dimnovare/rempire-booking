import path from "node:path";
import type { Page } from "@playwright/test";
import { OUT } from "./env";
import { A, asOwner, demoId, expect, expectNoSideScroll, hydrated, smallTargets, tallinnDate, test } from "./helpers";

/**
 * «Настройки → Уведомления» (decision page round 11): the owner sees every
 * message the system sends, by who gets it, and opens one to change when
 * it goes and what its SMS says. The reminder's «SMS, push or both» moved
 * here from «Запросы».
 *
 * The database is shared with every other spec, and the reminder's
 * settings decide what app.spec.ts and visit.spec.ts see: so the tests
 * that save run on Android only, and each puts back what it changed. The
 * SMS text is typed and looked at, never saved here (tests/notifications
 * .test.ts saves it).
 */
const N = A.notif;
const LIST = "/admin/notifications";

const shot = async (page: Page, name: string, wide = false) => {
  const file = wide ? `pc-notif-${name}.png` : `${test.info().project.name}-notif-${name}.png`;
  const body = await page.screenshot({ fullPage: true, path: path.join(OUT, "screens", file) });
  await test.info().attach(file, { body, contentType: "image/png" });
};

const open = async (page: Page, url: string, title: string) => {
  await page.goto(url);
  await expect(page.locator("h1.adm-h1:visible", { hasText: title })).toBeVisible();
  await hydrated(page);
};

const group = (page: Page, name: string) => page.locator(".ntf-group:visible", { has: page.locator(".ntf-group-name", { hasText: name }) });
const row = (page: Page, type: string) => page.locator(".ntf-row:visible", { has: page.locator(`a[href="${LIST}/${type}"]`) });

test.describe("«Уведомления» on a phone", () => {
  test.use(asOwner);

  test("every message by who gets it, with its switch, channels and timing; «Каналы отправки»", async ({ page }) => {
    await open(page, LIST, A.nav.notifications);
    await expect(page.getByRole("tab")).toHaveText([N.tabs.types, N.tabs.channels]);
    await expect(page.getByRole("tab", { name: N.tabs.types })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".ntf-group:visible .ntf-group-name")).toHaveText([N.groups.client, N.groups.salon, N.groups.staff]);
    await expect(page.getByRole("heading", { level: 2, name: N.groups.client })).toBeVisible();
    await expect(group(page, N.groups.client).locator(".ntf-row")).toHaveCount(7);
    await expect(group(page, N.groups.salon).locator(".ntf-row")).toHaveCount(6);
    await expect(group(page, N.groups.staff).locator(".ntf-row")).toHaveCount(5);
    await expect(group(page, N.groups.client).locator(".ntf-name b")).toHaveText(
      ["reminder", "confirmation", "moved", "cancelled", "birthday", "no_show", "review_request"].map((k) => N.types[k]),
    );
    // the review request waits to be switched on, three hours after the visit; «Новый отзыв» to the salon is on
    await expect(row(page, "review_request").getByRole("switch", { name: N.types.review_request })).not.toBeChecked();
    await expect(row(page, "review_request").locator(".ntf-name small")).toContainText(N.sub.review(N.dur(180)));
    await expect(row(page, "own_review").getByRole("switch", { name: N.types.own_review })).toBeChecked();
    await expect(group(page, N.groups.client).locator(".ntf-count")).toHaveText(N.count(6, 7));
    // the reminder: its channels and when each goes
    const reminder = row(page, "reminder");
    await expect(reminder.locator(".ntf-chip")).toHaveText([N.ch.sms, N.ch.email, N.ch.push]);
    await expect(reminder.locator(".ntf-name small")).toContainText(`${N.chLow.sms} ${N.lead(N.dur(120))}`);
    await expect(reminder.locator(".ntf-name small")).toContainText(`${N.chLow.email} ${N.lead(N.dur(720))}`);
    await expect(row(page, "birthday").locator(".ntf-name small")).toHaveText(N.sub.birthday("10:00"));
    await expect(row(page, "confirmation").locator(".ntf-name small")).toHaveText(N.sub.confirmation);
    await expect(row(page, "day_plan").locator(".ntf-name small")).toHaveText(N.sub.plan("20:00"));
    await expect(reminder.getByRole("switch", { name: N.types.reminder })).toBeChecked();
    await expect(page.getByText(N.foot[0])).toBeVisible();
    await expectNoSideScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    await shot(page, "list");

    await page.getByRole("tab", { name: N.tabs.channels }).click();
    await expect(page.locator(".ntf-tr-card h2")).toHaveText([N.ch.sms, N.ch.email, N.ch.push]);
    // the e2e server prints SMS and letters to its log
    await expect(page.locator(".ntf-tr-card .ntf-state").first()).toHaveText(N.tr.state.console);
    await expectNoSideScroll(page);
    await shot(page, "channels");
  });

  test("a type's page: its timing, the SMS text with its variables and length, the preview", async ({ page }) => {
    await open(page, LIST, A.nav.notifications);
    await row(page, "reminder").locator(".ntf-link").click();
    await expect(page.locator("h1.adm-h1:visible", { hasText: N.types.reminder })).toBeVisible();
    await hydrated(page);
    await expect(page.getByText(N.about.reminder)).toBeVisible();
    await expect(page.getByRole("heading", { name: `${N.ch.sms} — ${N.leadLong(N.dur(120))}` })).toBeVisible();
    await expect(page.getByRole("heading", { name: `${N.ch.email} — ${N.leadLong(N.dur(720))}` })).toBeVisible();
    await expect(page.getByRole("group", { name: N.mode }).getByRole("button")).toHaveText([N.modeBy.sms, N.modeBy.push, N.modeBy.both]);

    // the standard text, drawn with the made-up visit: one SMS
    const box = page.getByRole("textbox", { name: N.smsText });
    await expect(box).toHaveValue("{salon}: reminder of your visit on {date} at {time} with {master}. {address}. Change or cancel: {link}");
    const bubble = page.locator(".ntf-bubble");
    await expect(bubble).toContainText(/reminder of your visit on \d\d\.\d\d at 14:30/);
    await expect(page.locator(".ntf-meter")).toContainText(/ · 1 SMS$/);
    await expect(page.getByRole("button", { name: N.standard })).toHaveCount(0);
    const save = page.getByRole("button", { name: N.save, exact: true });
    await expect(save).toBeDisabled();

    // its own words: a variable inserted where the cursor is, the preview and the count follow
    await box.fill("Hi , see you at {time}. {link}");
    await box.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(3, 3));
    await page.getByRole("button", { name: `{client} ${N.vars.client}` }).click();
    await expect(box).toHaveValue("Hi {client}, see you at {time}. {link}");
    await expect(bubble).toContainText(/^Hi Demo client, see you at 14:30\. https?:\/\/\S+\/v\/\w{16}$/);
    await expect(page.getByRole("heading", { name: `${N.ch.sms} — ${N.leadLong(N.dur(120))}` }).locator("xpath=following-sibling::p")).toHaveText(N.chSub.smsOwn);
    await expect(save).toBeEnabled();
    // a variable this SMS does not know cannot be saved
    await box.fill("Hi {nope}");
    await expect(page.getByText(N.bad.unknown("nope"))).toBeVisible();
    await expect(save).toBeDisabled();
    // «Стандартный текст» puts today's back
    await page.getByRole("button", { name: N.standard }).click();
    await expect(box).toHaveValue(/^\{salon\}: reminder of your visit/);
    await expect(save).toBeDisabled();

    // the letter and the push in each language
    await page.getByRole("tab", { name: N.ch.email }).click();
    await expect(page.locator(".ntf-subj b")).toHaveText(/^Напоминание о записи в /);
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.locator(".ntf-subj b")).toHaveText(/^Reminder: your /);
    // «Дополнительная информация в Email»: typed, it is in the letter at once; put back, never saved here
    const extra = page.locator("details.ntf-extra");
    await expect(extra.locator("summary small")).toHaveText(N.extra.none);
    await extra.locator("summary").click();
    const words = "Parking in the yard behind the house.";
    const extraBox = page.getByRole("textbox", { name: N.extra.title });
    await extraBox.fill(words);
    await expect(extra.locator(".ntf-extra-count")).toHaveText(new RegExp(`^${words.length} / `));
    await expect.poll(() => page.locator(".ntf-frame").getAttribute("srcdoc")).toContain(words);
    await expect(save).toBeEnabled();
    await extraBox.fill("");
    await expect.poll(() => page.locator(".ntf-frame").getAttribute("srcdoc")).not.toContain(words);
    await expect(save).toBeDisabled();
    await page.getByRole("tab", { name: N.ch.push }).click();
    await expect(page.locator(".ntf-push p")).toHaveText(/^Reminder: your visit on \d\d\.\d\d at 14:30/);
    await expectNoSideScroll(page);
    await shot(page, "type");

    // back to the list
    await page.locator("a.ntf-back").click();
    await expect(page.locator("h1.adm-h1:visible", { hasText: A.nav.notifications })).toBeVisible();
  });

  test("«SMS, push or both» is here now, and no longer on «Запросы»; it saves with «Сохранить»", async ({ page }, info) => {
    test.skip(info.project.name !== "android", "the reminder's switch is shared by every spec: one browser changes it");
    await open(page, "/admin/requests", A.req.title);
    await expect(page.getByRole("group", { name: N.mode })).toHaveCount(0);

    await open(page, `${LIST}/reminder`, N.types.reminder);
    const mode = page.getByRole("group", { name: N.mode });
    await expect(mode.getByRole("button", { name: N.modeBy.both, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(N.modeHint.both)).toBeVisible();
    try {
      await mode.getByRole("button", { name: N.modeBy.push, exact: true }).click();
      await expect(page.getByText(N.modeHint.push)).toBeVisible();
      await page.getByRole("button", { name: N.save, exact: true }).click();
      await expect(page.locator(".ntf-bar [role=status]")).toHaveText(N.saved);
      await page.reload();
      await hydrated(page);
      await expect(page.getByRole("group", { name: N.mode }).getByRole("button", { name: N.modeBy.push, exact: true })).toHaveAttribute("aria-pressed", "true");
    } finally {
      // back to «both» for every other test
      const g = page.getByRole("group", { name: N.mode });
      if ((await g.getByRole("button", { name: N.modeBy.both, exact: true }).getAttribute("aria-pressed")) !== "true") {
        await g.getByRole("button", { name: N.modeBy.both, exact: true }).click();
        await page.getByRole("button", { name: N.save, exact: true }).click();
        await expect(page.locator(".ntf-bar [role=status]")).toHaveText(N.saved);
      }
    }
  });

  test("a switch on the list saves by itself", async ({ page }, info) => {
    test.skip(info.project.name !== "android", "the salon's switches are shared: one browser changes them");
    await open(page, LIST, A.nav.notifications);
    // the evening plan for the salon: sent only at 20:00, so no other spec waits for it
    const plan = row(page, "own_plan");
    const sw = plan.getByRole("switch", { name: N.types.own_plan });
    await expect(sw).toBeChecked();
    await expect(group(page, N.groups.salon).locator(".ntf-count")).toHaveText(N.count(6, 6));
    try {
      await sw.uncheck();
      await expect(group(page, N.groups.salon).locator(".ntf-count")).toHaveText(N.count(5, 6));
      await expect(plan.getByRole("status")).toHaveText(A.saved);
      await page.reload();
      await hydrated(page);
      await expect(row(page, "own_plan").getByRole("switch")).not.toBeChecked();
      await expect(row(page, "own_plan")).toHaveClass(/is-off/);
    } finally {
      const back = row(page, "own_plan").getByRole("switch");
      if (!(await back.isChecked())) {
        await back.check();
        await expect(row(page, "own_plan").getByRole("status")).toHaveText(A.saved);
      }
    }
  });
});

test.describe("«Уведомления» on a wide screen", () => {
  test.use({ ...asOwner, viewport: { width: 1440, height: 900 } });
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "android", "one wide run is enough");
  });

  test("two columns as the board, a row of its own in the sidebar, the preview beside the settings", async ({ page }) => {
    await open(page, "/admin/requests", A.req.title);
    const menu = page.getByRole("navigation", { name: A.sections });
    // on a page other than the journal the sidebar already shows the menu
    const all = page.locator(".sb").getByRole("button", { name: A.frame.all });
    if (await all.isVisible()) await all.click();
    // «Уведомления» is the salon's own row (Dim, round 13), no longer under «Настройки»
    await expect(menu.getByRole("link", { name: A.nav.notifications, exact: true })).toHaveAttribute("href", LIST);
    await menu.getByRole("link", { name: A.nav.notifications, exact: true }).click();
    await expect(page.locator("h1.adm-h1:visible", { hasText: A.nav.notifications })).toBeVisible();
    await hydrated(page);
    await expect(page.locator(".cb-crumb:visible")).toHaveText(N.crumb);
    // the client's on the left, the admin's and the barbers' on the right
    const box = async (name: string) => (await group(page, name).boundingBox())!;
    const [client, salon, staff] = [await box(N.groups.client), await box(N.groups.salon), await box(N.groups.staff)];
    expect(client.x).toBeLessThan(salon.x);
    expect(salon.x).toBe(staff.x);
    expect(salon.y).toBeLessThan(staff.y);
    await expectNoSideScroll(page);
    await shot(page, "list", true);

    await open(page, `${LIST}/birthday`, N.types.birthday);
    await expect(page.locator(".cb-crumb:visible")).toHaveText(`${N.crumb} · ${N.groups.client}`);
    const settings = (await page.locator(".ntf-left").boundingBox())!;
    const preview = (await page.locator(".ntf-preview").boundingBox())!;
    expect(preview.x).toBeGreaterThan(settings.x + settings.width - 1);
    await expect(page.getByLabel(N.when)).toHaveValue("10:00");
    await page.getByRole("tab", { name: N.ch.email }).click();
    await expect(page.locator(".ntf-frame")).toBeVisible();
    await expectNoSideScroll(page);
    await shot(page, "type", true);
  });

  test("the bell in the sidebar's head: a red dot for an online booking; its panel at the right edge, as the product we follow", async ({ page }) => {
    // booked online for a fake client through the booking's own API: Renat hears of it (own_online), phone or not
    const CLIENT = "Bell Test Client";
    const staff = demoId("staff", "milena");
    const service = demoId("service", "clip");
    const res = await page.request.get(`/api/slots?services=${service}&staff=${staff}&from=${tallinnDate(40)}&days=10`);
    expect(res.ok()).toBe(true);
    const day = ((await res.json()) as { days: { d: string; s: [number, string, number][] }[] }).days.find((d) => d.s.length > 0);
    expect(day).toBeTruthy();
    const slot = day!.s[Math.floor(day!.s.length / 2)];
    const booked = await page.request.post("/api/bookings", {
      headers: { "idempotency-key": "e2e-bell-online-0000" },
      data: { serviceIds: [service], staffId: staff, startsAt: new Date(slot[0]).toISOString(), extraCents: slot[2], name: CLIENT, phone: "+372 5555 0788", locale: "ru", smsReminder: false },
    });
    expect([200, 201]).toContain(booked.status());

    await page.goto("/admin");
    await hydrated(page);
    const vw = page.viewportSize()!;
    const bell = page.locator(".sb-head").getByRole("button", { name: /^Уведомления/ });
    await expect(bell).toBeVisible();
    await expect(bell).toHaveAttribute("aria-haspopup", "dialog");
    await expect(bell).toHaveAttribute("aria-expanded", "false");
    // at the right end of the head row, the product's 24 × 47, the sidebar's soft grey
    const box = (await bell.boundingBox())!;
    expect([Math.round(box.width), Math.round(box.height)]).toEqual([24, 47]);
    expect(Math.round(box.x + box.width)).toBeGreaterThanOrEqual(200);
    expect(Math.round(box.x + box.width)).toBeLessThanOrEqual(220);
    await expect(bell).toHaveCSS("color", "rgb(198, 203, 211)");
    // the dot: something is unread, the product's red
    const dot = bell.locator(".bell-dot");
    await expect(dot).toBeVisible();
    await expect(dot).toHaveCSS("background-color", "rgb(247, 44, 50)");

    await bell.click();
    await expect(bell).toHaveAttribute("aria-expanded", "true");
    const panel = page.getByRole("dialog", { name: A.nav.notifications });
    await expect(panel.getByRole("heading", { name: A.nav.notifications, level: 2 })).toBeVisible();
    // over the right edge, top to bottom, 321px, white, square, no shade over the page; slid in
    await expect(panel).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
    const pbox = (await panel.boundingBox())!;
    expect([Math.round(pbox.x), Math.round(pbox.y), Math.round(pbox.width), Math.round(pbox.height)]).toEqual([vw.width - 321, 0, 321, vw.height]);
    await expect(panel).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(panel).toHaveCSS("border-radius", "0px");
    await expect(panel).toHaveCSS("animation-duration", "0.3s");
    await expect(page.locator(".adm-sheet-wrap, .iv-dlg-wrap")).toHaveCount(0);

    // «Записи»: its unread count, «Прочитать все», the newest rows in a light-blue box; «Остальные» below
    const visits = panel.getByRole("region", { name: A.bell.visits });
    await expect(visits.getByRole("heading", { name: A.bell.visits, level: 3 })).toHaveCSS("font-size", "16px");
    await expect(visits.locator(".bell-count")).toHaveText(/^(\d+|99\+)$/);
    await expect(visits.getByRole("button", { name: A.bell.readAll })).toBeVisible();
    await expect(visits.locator(".bell-mini")).toHaveCSS("background-color", "rgb(240, 246, 255)");
    expect(await visits.locator(".bell-mini li").count()).toBeLessThanOrEqual(3);
    const mini = visits.locator(".bell-mini-row").first();
    await expect(mini.locator(".bell-mini-title")).toHaveText("Новая онлайн-запись");
    await expect(mini).toHaveAttribute("href", `/admin?d=${day!.d}`);
    await expect(mini.locator("time")).toHaveText(/^\d\d:\d\d$/);
    await expect(mini.locator(".bell-new")).toHaveCSS("background-color", "rgb(255, 203, 0)");
    await expect(panel.getByRole("region", { name: A.bell.other })).toBeVisible();
    await expectNoSideScroll(page);
    await shot(page, "bell", true);

    // a click on the page and on the bell again leave it open; opening read nothing
    await page.locator(".sb-month-head span").click();
    await bell.click();
    await expect(panel).toBeVisible();
    await expect(dot).toBeVisible();

    // «Показать полностью»: «‹ Назад», the group's title, the filters, every row with its words
    await visits.getByRole("button", { name: A.bell.showAll }).click();
    await expect(panel.getByRole("button", { name: A.bell.back })).toBeVisible();
    await expect(panel.getByRole("heading", { name: A.bell.visits, level: 2 })).toHaveCSS("font-size", "20px");
    const chips = panel.getByRole("group", { name: A.bell.filterLabel }).getByRole("button");
    await expect(chips).toHaveText(Object.values(A.bell.filters));
    await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
    await expect(chips.first()).toHaveCSS("background-color", "rgb(68, 73, 81)");
    const row = panel.locator(".bell-item", { hasText: CLIENT });
    await expect(row).toHaveCount(1);
    await expect(row).toHaveClass(/is-unread/);
    await expect(row.locator(".bell-ic")).toHaveCSS("border-radius", "50%");
    // the cancelled ones only: not this one
    await chips.filter({ hasText: A.bell.filters.cancelled }).click();
    await expect(chips.filter({ hasText: A.bell.filters.cancelled })).toHaveAttribute("aria-pressed", "true");
    await expect(panel.locator(".bell-item", { hasText: CLIENT })).toHaveCount(0);
    await chips.filter({ hasText: A.bell.filters.new }).click();
    await expect(row).toHaveCount(1);
    // on hover an unread row trades its dot for its «read» mark
    await row.hover();
    const mark = row.getByRole("button", { name: A.bell.read });
    await expect(mark).toHaveCSS("opacity", "1");
    await mark.click();
    await expect(row).not.toHaveClass(/is-unread/);
    await shot(page, "bell-all", true);

    // back, and «Прочитать все» of each group: the red dot goes
    await panel.getByRole("button", { name: A.bell.back }).click();
    await expect(visits).toBeVisible();
    for (const name of [A.bell.visits, A.bell.other]) {
      const readAll = panel.getByRole("region", { name }).getByRole("button", { name: A.bell.readAll });
      if (await readAll.count()) await readAll.click();
    }
    await expect(dot).toHaveCount(0);
    // this test's own row only: in a full run other tests' bookings may come in after «Прочитать все»
    await expect(visits.locator(`.bell-mini-row[href="/admin?d=${day!.d}"] .bell-new`)).toHaveCount(0);

    // Esc slides it out and gives the focus back
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(bell).toBeFocused();
    await expect(bell).toHaveAttribute("aria-expanded", "false");
    // a row clicked goes where the push's tap goes, and the panel closes
    await bell.press("Enter");
    await panel.getByRole("region", { name: A.bell.visits }).locator(".bell-mini-row").first().click();
    await expect(page).toHaveURL(/\/admin\?d=\d{4}-\d{2}-\d{2}$/);
    await expect(panel).toHaveCount(0);
    // still read after a reload
    await page.reload();
    await hydrated(page);
    await expect(bell).toBeVisible();
    await expect(bell.locator(".bell-dot")).toHaveCount(0);
  });
});
