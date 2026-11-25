import path from "node:path";
import { deflateSync } from "node:zlib";
import type { Locator, Page } from "@playwright/test";
import { OUT } from "./env";
import { A, asOwner, expect, expectNoSideScroll, hydrated, test } from "./helpers";

/**
 * «Настройки → Локация» (settings/; Dim, 20.11.2026): the owner changes the
 * salon's page on the booking site in the admin. On a phone and on a wide
 * screen he opens «Бренд», «Контакты» and «Галерея», changes something on
 * each, sees it saved, and sees it on /ru/about; then he puts it back. The
 * database is shared with every other spec (app.spec.ts reads the same
 * salon page), so each test leaves REMPIRE's details as it found them.
 */
const B = A.loc.brand;
const C = A.loc.contacts;
const G = A.loc.gallery;

const shot = async (page: Page, name: string, wide: boolean) => {
  const file = wide ? `pc-loc-${name}.png` : `${test.info().project.name}-loc-${name}.png`;
  const body = await page.screenshot({ fullPage: true, path: path.join(OUT, "screens", file) });
  await test.info().attach(file, { body, contentType: "image/png" });
};

const open = async (page: Page, url: string, title: string) => {
  await page.goto(url);
  await expect(page.locator("h1.adm-h1:visible", { hasText: title })).toBeVisible();
  await hydrated(page);
};

/** The salon's page as a client opens it. */
const salon = async (page: Page) => {
  await page.goto("/ru/about");
  await hydrated(page);
  const s = page.locator("main.ab-app");
  await expect(s.getByRole("heading", { level: 1 })).toBeVisible();
  return s;
};

/** Auto-save: the change waits a moment, is sent, and the bar says so. */
const saved = async (page: Page) => {
  const st = page.locator(".loc-bar [role=status]:visible");
  await expect(st).toHaveText(A.auto.saving);
  await expect(st).toHaveText(A.saved);
};

/* A real picture the browser can read and shrink: a PNG made here, no file in the repo. */
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function png(w: number, h: number, rgb: (x: number, y: number) => [number, number, number]): Buffer {
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head[8] = 8; // 8 bits a channel
  head[9] = 2; // RGB
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = rgb(x, y);
      raw.set([r, g, b], y * (w * 3 + 1) + 1 + x * 3);
    }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
// a yellow ring on black: a logo-like square
const LOGO = png(160, 160, (x, y) => (Math.abs(Math.hypot(x - 80, y - 80) - 52) < 14 ? [255, 203, 0] : [20, 20, 28]));
// a warm gradient with a dark band: a photo-like picture
const PHOTO = png(480, 360, (x, y) => (y > 230 && y < 270 ? [34, 34, 46] : [200 + Math.round((x / 480) * 55), 150 + Math.round((y / 360) * 60), 90]));

const ours = /^\/api\/salon\/image\/[0-9a-f-]{36}$/;

const checks = (wide: boolean) => {
  test("«Бренд»: the words and the logo, then as they were", async ({ page }) => {
    await open(page, "/admin/settings/brand", A.nav.brand);
    await expect(page.getByLabel(B.name, { exact: true })).toHaveValue("REMPIRE");
    const tabs = page.getByRole("tablist", { name: A.loc.langs });
    await expect(tabs.getByRole("tab")).toHaveText(["RU", "ET", "EN"]);
    await expect(tabs.getByRole("tab", { name: "RU" })).toHaveAttribute("aria-selected", "true");
    const ru = page.getByRole("textbox", { name: `${B.about} (RU)` });
    const was = await ru.inputValue();
    expect(was).toMatch(/^Барберы из Эстонии/);
    const mark = `Проверка e2e ${test.info().project.name}${wide ? " pc" : ""}.`;
    try {
      await ru.fill(`${was}\n\n${mark}`);
      await saved(page);
      // the other languages are a tab away, each with its own words
      await tabs.getByRole("tab", { name: "EN" }).click();
      await expect(page.getByRole("textbox", { name: `${B.about} (EN)` })).toHaveValue(/^Barbers from Estonia/);
      await tabs.getByRole("tab", { name: "RU" }).click();

      // the logo: a picture, shrunk, sent at once, shown in the disc
      const tile = page.locator(".loc-logo-tile:visible");
      await expect(tile).not.toHaveClass(/\bis-own\b/);
      await page.locator(".loc-logo:visible input[type=file]").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: LOGO });
      await expect(page.locator(".loc-logo:visible .adm-ok")).toHaveText(B.logoSaved);
      await expect(tile.locator("img")).toHaveAttribute("src", ours);
      // and the picture itself has come, not only its address
      await expect.poll(() => tile.locator("img").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
      await expect(page.getByRole("button", { name: B.logoRemove })).toBeVisible();
      await expectNoSideScroll(page);
      await shot(page, "brand", wide);
      if (!wide) {
        // a whole-page picture draws the phone's bars mid-page: the logo's card as the phone shows it
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(300);
        const file = `${test.info().project.name}-loc-logo.png`;
        await test.info().attach(file, { body: await page.screenshot({ path: path.join(OUT, "screens", file) }), contentType: "image/png" });
      }

      const s = await salon(page);
      await expect(s.getByText(mark)).toBeVisible();
      await expect(s.locator(".ab-panel .mark-logo.is-own img")).toHaveAttribute("src", ours);
    } finally {
      await open(page, "/admin/settings/brand", A.nav.brand);
      const back = page.getByRole("textbox", { name: `${B.about} (RU)` });
      if ((await back.inputValue()) !== was) {
        await back.fill(was);
        await saved(page);
      }
      const remove = page.getByRole("button", { name: B.logoRemove });
      if (await remove.count()) {
        await remove.click();
        await expect(page.locator(".loc-logo:visible .adm-ok")).toHaveText(B.logoRemoved);
      }
      await expect(page.locator(".loc-logo-tile:visible")).not.toHaveClass(/\bis-own\b/);
    }
    const s = await salon(page);
    await expect(s.getByText(/^Барберы из Эстонии/)).toBeVisible();
    await expect(s.getByText(/Проверка e2e/)).toHaveCount(0);
    await expect(s.locator(".ab-panel .mark-logo")).not.toHaveClass(/\bis-own\b/);
  });

  test("«Контакты»: the address found on the map and the pin dragged, a second phone, the hours, the pin from a map's link; then as they were", async ({ page }) => {
    // no OpenStreetMap tile is fetched: the map shows its ground; the geocoder is the e2e server's own (GEOCODER=fake)
    await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
    await open(page, "/admin/settings/contacts", A.nav.contacts);
    for (const h of [C.where, C.phones, C.hours, C.site, C.socials, C.messengers]) {
      await expect(page.getByRole("heading", { level: 2, name: h, exact: true })).toBeVisible();
    }
    const hours = page.getByRole("textbox", { name: `${C.hours} (RU)` });
    const address = page.getByRole("textbox", { name: C.address, exact: true });
    const country = page.getByRole("combobox", { name: C.country, exact: true });
    const postcode = page.getByRole("textbox", { name: C.postcode, exact: true });
    const point = page.locator("#loc-point:visible");
    const mapPin = page.locator(".lcx-map:visible .osm-pin");
    const geo = page.locator(".lcx-geo:visible");
    const pin = page.getByLabel(C.pin, { exact: true });
    const paste = page.getByRole("button", { name: C.pinPaste });
    await expect(hours).toHaveValue("пн–сб 10:00–19:00");
    await expect(address).toHaveValue("Mardi 1, Tallinn");
    await expect(country).toHaveValue("EE");
    await expect(postcode).toHaveValue("");
    await expect(point).toHaveText(C.pinLine("59.4309, 24.7620"));
    await expect(mapPin).toHaveAttribute("data-lat", "59.430883");
    await expect(mapPin).toHaveAttribute("data-lng", "24.761967");
    await expect(page.getByRole("textbox", { name: C.phoneN(1), exact: true })).toHaveValue("+372 5623 7237");
    // the link-or-numbers field waits behind its button while the pin is fine
    await expect(pin).toHaveCount(0);
    try {
      await hours.fill("пн–сб 10:00–20:00 (e2e)");
      await saved(page);

      // «Найти»: an address it does not know says so; one it knows moves the pin and fills the postcode
      await address.fill("Nowhere street 1, Tallinn");
      await page.getByRole("button", { name: C.find, exact: true }).click();
      await expect(geo).toHaveText(C.findNone);
      await address.fill("Fake street 7, Tallinn");
      await page.getByRole("button", { name: C.find, exact: true }).click();
      await expect(geo).toHaveText(C.found("Fake street 7, Tallinn, Tallinn, Eesti"));
      await expect(postcode).toHaveValue("10111");
      await expect(point).not.toHaveText(C.pinLine("59.4309, 24.7620"));
      await saved(page);
      const found = { lat: Number(await mapPin.getAttribute("data-lat")), lng: Number(await mapPin.getAttribute("data-lng")) };
      expect(Math.abs(found.lat - 59.43)).toBeLessThan(0.01);

      // the pin dragged to the right: further east, at the same height
      await mapPin.scrollIntoViewIfNeeded();
      const box = (await mapPin.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 3;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 30, y, { steps: 6 });
      await page.mouse.move(x + 60, y, { steps: 6 });
      await page.mouse.up();
      await expect.poll(async () => Number(await mapPin.getAttribute("data-lng"))).toBeGreaterThan(found.lng);
      expect(Math.abs(Number(await mapPin.getAttribute("data-lat")) - found.lat)).toBeLessThan(0.0002);
      await saved(page);

      // a second number, with its own word
      await page.getByRole("button", { name: `+ ${C.phoneAdd}` }).click();
      await page.getByRole("textbox", { name: C.phoneN(2), exact: true }).fill("+372 5550 0124");
      await page.getByRole("textbox", { name: C.labelN(2), exact: true }).fill("Тату");
      await saved(page);

      // a short link names no place until it is opened: what to do instead, and nothing is sent
      await paste.click();
      const note = page.locator("#loc-pin-note:visible");
      await pin.fill("https://maps.app.goo.gl/AbCdEf123");
      await expect(note).toHaveText(C.pinShort);
      await expect(page.locator(".loc-bar [role=status]:visible")).toHaveText(C.pinShort);

      // a place's link from Google Maps: its own pin, shown before it is saved, on our map at once
      await pin.fill("https://www.google.com/maps/place/Mardi+1,+Tallinn/@59.43,24.76,17z/data=!3m1!4b1!4m6!3m5!8m2!3d59.4301!4d24.7602");
      await expect(note).toContainText(C.pinIs("59.4301, 24.7602"));
      await expect(note.getByRole("link", { name: C.pinOpen })).toHaveAttribute("href", /openstreetmap\.org\/\?mlat=59\.4301&mlon=24\.7602/);
      await expect(mapPin).toHaveAttribute("data-lat", "59.4301");
      await saved(page);
      await expectNoSideScroll(page);
      await shot(page, "contacts", wide);

      // the salon's page: every number with its word under it, the postcode and the country under the address, the pin on our map
      const s = await salon(page);
      await expect(s.getByText("пн–сб 10:00–20:00 (e2e)")).toBeVisible();
      await expect(s.getByRole("link", { name: "+372 5623 7237" })).toHaveAttribute("href", "tel:+37256237237");
      const second = s.getByRole("link", { name: /^\+372 5550 0124/ });
      await expect(second).toHaveAttribute("href", "tel:+37255500124");
      await expect(second).toContainText("Тату");
      await expect(s.getByText("10111, Эстония")).toBeVisible();
      await expect(s.locator(".ab-map .osm-pin")).toHaveAttribute("data-lat", "59.4301");
      await expect(s.locator(".ab-map .osm-pin")).toHaveAttribute("data-lng", "24.7602");
      await expect(s.locator(".ab-map .osm-credit")).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    } finally {
      await open(page, "/admin/settings/contacts", A.nav.contacts);
      const second = page.getByRole("button", { name: C.phoneRemove(2) });
      const off =
        (await hours.inputValue()) !== "пн–сб 10:00–19:00" ||
        (await address.inputValue()) !== "Mardi 1, Tallinn" ||
        (await postcode.inputValue()) !== "" ||
        (await second.count()) > 0 ||
        (await mapPin.getAttribute("data-lat")) !== "59.430883" ||
        (await mapPin.getAttribute("data-lng")) !== "24.761967";
      if (off) {
        if (await second.count()) await second.click();
        await hours.fill("пн–сб 10:00–19:00");
        await address.fill("Mardi 1, Tallinn");
        await postcode.fill("");
        if (!(await pin.count())) await paste.click();
        await pin.fill("59.430883, 24.761967");
        await saved(page);
      }
    }
    const s = await salon(page);
    await expect(s.getByText("пн–сб 10:00–19:00")).toBeVisible();
    await expect(s.getByRole("link", { name: /\+372 5550 0124/ })).toHaveCount(0);
    await expect(s.locator(".ab-map .osm-pin")).toHaveAttribute("data-lat", "59.430883");
    await expect(s.locator(".ab-map .osm-pin")).toHaveAttribute("data-lng", "24.761967");
  });

  test("«Онлайн-запись»: the booking link to copy, and the QR plaque to print (Renat, 18.11)", async ({ page, context }) => {
    const O = A.online;
    await open(page, "/admin/settings/online", A.nav.online);
    const card = page.getByRole("region", { name: O.link });
    // SITE_URL's start page (src/lib/site.ts): staging's address now, rempire.ee's after the move
    const link = (await card.locator(".onl-link-chip").textContent())!;
    expect(link).toMatch(/^https?:\/\/[^/]+\/$/);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
    await card.getByRole("button", { name: O.copy }).click();
    await expect(card.getByRole("button", { name: O.copied })).toBeVisible();
    // the e2e server is a test run, as staging: the plaque says it is not to be printed yet
    await expect(card.locator(".onl-plaque small")).toHaveText(O.plaqueTest);
    await expectNoSideScroll(page);
    await shot(page, "online-link", wide);

    // the plaque is a page of the admin now (design artifact, 25.11), with the way back
    await card.getByRole("link", { name: O.plaque }).click();
    await expect(page).toHaveURL(/\/admin\/plaque$/);
    const sheet = page;
    await hydrated(sheet);
    await expect(sheet).toHaveTitle(`${A.plaque.title} · REMPIRE`);
    // the plaque sits in the admin's frame (25.11): the sidebar has the same link, the page's own is «‹ Онлайн-запись»
    await expect(sheet.getByRole("main").getByRole("link", { name: A.nav.online })).toHaveAttribute("href", "/admin/settings/online");
    const qr = sheet.getByRole("img", { name: link });
    await expect(qr).toBeVisible();
    expect(await qr.locator("path").getAttribute("d")).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
    await expect(sheet.locator(".pl-host")).toHaveText(new URL(link).host);
    await expect(sheet.locator(".pl-book p")).toHaveText(["Запишитесь онлайн", "Broneeri aeg · Book online"]);
    await expect(sheet.locator(".pl-test")).toHaveText(A.plaque.test);
    // A5 by default; A4 and A6 are the same drawing at another size, the code square in every one
    const sizes = sheet.getByRole("group", { name: A.plaque.size });
    await expect(sizes.getByRole("button", { name: "A5" })).toHaveAttribute("aria-pressed", "true");
    for (const [s, ratio] of [["A4", 210 / 297], ["A6", 105 / 148], ["A5", 148 / 210]] as const) {
      await sizes.getByRole("button", { name: s }).click();
      const box = (await sheet.locator(".pl-sheet").boundingBox())!;
      expect(box.width / box.height).toBeCloseTo(ratio, 2);
      const q = (await qr.boundingBox())!;
      expect(Math.abs(q.width - q.height)).toBeLessThan(1);
      expect(q.width / box.width).toBeCloseTo(0.54, 2);
      // nothing on the sheet is cut off: every line inside its box
      for (const el of await sheet.locator(".pl-face > *, .pl-test").all()) {
        const b = (await el.boundingBox())!;
        expect(b.y).toBeGreaterThanOrEqual(box.y);
        expect(b.y + b.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
      }
    }
    await expectNoSideScroll(sheet);
    // on paper: the sheet alone, at A5 in mm (96 px an inch), the card and the admin's frame gone
    await sheet.emulateMedia({ media: "print" });
    await expect(sheet.locator(".pl-bar")).toBeHidden();
    await expect(sheet.locator(".pl-back")).toBeHidden();
    const paper = (await sheet.locator(".pl-sheet").boundingBox())!;
    expect(Math.round(paper.width)).toBe(Math.round((148 / 25.4) * 96));
    expect(Math.round(paper.height)).toBe(Math.round((210 / 25.4) * 96));
    await sheet.emulateMedia({ media: "screen" });
    await shot(sheet, "plaque", wide);
  });

  test("«Галерея»: a photo added, moved first, seen on the salon's page, deleted", async ({ page }) => {
    await open(page, "/admin/settings/gallery", A.nav.gallery);
    const tiles = page.locator(".loc-photos:visible > li");
    const first = (l: Locator) => l.first().locator("img");
    await expect(tiles).toHaveCount(1);
    await expect(first(tiles)).toHaveAttribute("src", "/brand/rempire-photo.svg");
    await expect(page.getByText(G.count(1, 8))).toBeVisible();
    try {
      await page.locator(".loc-drop:visible input[type=file]").setInputFiles({ name: "salon.png", mimeType: "image/png", buffer: PHOTO });
      await expect(page.locator(".loc:visible .adm-ok")).toHaveText(G.added);
      await expect(tiles).toHaveCount(2);
      await expect(tiles.nth(1).locator("img")).toHaveAttribute("src", ours);
      await expect(page.getByText(G.count(2, 8))).toBeVisible();

      // the new one first: «Фото 1: позже» moves the seeded one back
      await expect(page.getByRole("button", { name: G.earlier(1) })).toBeDisabled();
      await page.getByRole("button", { name: G.later(1) }).click();
      await expect(page.locator(".loc:visible .adm-ok")).toHaveText(G.moved);
      await expect(first(tiles)).toHaveAttribute("src", ours);
      await expect(tiles.nth(1).locator("img")).toHaveAttribute("src", "/brand/rempire-photo.svg");
      await expectNoSideScroll(page);
      await shot(page, "gallery", wide);

      const s = await salon(page);
      await expect(s.locator(".ab-photos img")).toHaveCount(2);
      await expect(s.locator(".ab-photos img").first()).toHaveAttribute("src", ours);
    } finally {
      // every uploaded one out again: the bin asks once, then it goes
      await open(page, "/admin/settings/gallery", A.nav.gallery);
      for (let left = await page.locator(`.loc-photos:visible img[src^="/api/salon/image/"]`).count(); left > 0; left--) {
        const i = await page.locator(".loc-photos:visible > li").evaluateAll((li) => li.findIndex((el) => el.querySelector("img")?.getAttribute("src")?.startsWith("/api/salon/image/")));
        await page.getByRole("button", { name: G.remove(i + 1) }).click();
        await expect(page.getByRole("group", { name: G.ask })).toBeVisible();
        await page.getByRole("button", { name: G.yes, exact: true }).click();
        await expect(page.locator(".loc:visible .adm-ok")).toHaveText(G.removed);
        await expect(page.locator(`.loc-photos:visible img[src^="/api/salon/image/"]`)).toHaveCount(left - 1);
      }
    }
    await expect(page.locator(".loc-photos:visible > li")).toHaveCount(1);
    const s = await salon(page);
    await expect(s.locator(".ab-photos img")).toHaveCount(1);
    await expect(s.locator(".ab-photos img")).toHaveAttribute("src", "/brand/rempire-photo.svg");
  });
};

test.describe("the salon's page in the admin, on a phone", () => {
  test.use(asOwner);
  checks(false);
});

test.describe("the salon's page in the admin, on a wide screen", () => {
  test.use({ ...asOwner, viewport: { width: 1440, height: 900 } });
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "android", "one wide run is enough");
  });
  checks(true);
});
