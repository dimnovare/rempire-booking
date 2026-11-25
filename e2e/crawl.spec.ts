/**
 * The whole app, clicked: every page each login reaches by its links, and
 * every button on it that only opens, switches or shows something. Opt-in:
 *
 *   E2E_CRAWL=yes npm run e2e -- e2e/crawl.spec.ts --project=android
 *   E2E_PROD=yes E2E_CRAWL=yes npm run e2e -- e2e/crawl.spec.ts
 *
 * For each page it records what a person would call broken: the error page
 * (`main[role=alert]`), an uncaught script error, a console error, a
 * request the server answered with 500 or more, a page that scrolls
 * sideways on a phone, a link that answers 404. A button that deletes,
 * sends, issues, cancels or logs out is left alone (SKIP): the specs test
 * those on purpose. Everything runs on the e2e server's fake data.
 *
 * The report: e2e/.out/crawl-<login>-<size>.json, and the test fails with
 * the list of problems.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { devices, expect, test, type Browser, type Page } from "@playwright/test";
import { authFile, E2E_URL, OUT } from "./env";

test.skip(process.env.E2E_CRAWL !== "yes", "the crawl runs only with E2E_CRAWL=yes");

/** Buttons never pressed: they change or send something for real, or leave the page's login. */
const SKIP = /выйти|удал|отключ|обезлич|отправ|выстав|кредит|отменить (визит|выбранн|запис)|аннулир|списа|сбросить|google|скан|камер|фото|войти|получить код|сменить пароль|записаться|сообщить о проблеме/i;
/** Links never followed: they leave the app, end the session or download a file (those are fetched instead). */
const NO_FOLLOW = /logout|signout|\/api\/|\.(csv|xlsx|pdf|ics|vcf)(\?|$)|mailto:|tel:|^https?:\/\/(?!localhost)/i;
const MAX_PAGES = 90;
const MAX_CLICKS = 30;

type Login = { who: string | null; seeds: string[]; within: RegExp };
/** Every admin page without an id (src/app/admin): the menu folds on a wide screen, so its links are not all on the page at once. */
const ADMIN = [
  "/admin",
  "/admin/more",
  "/admin/account",
  "/admin/analytics",
  "/admin/catalogue",
  "/admin/changes",
  "/admin/clients",
  "/admin/dashboard",
  "/admin/invoices",
  "/admin/invoices/desk",
  "/admin/invoices/items",
  "/admin/invoices/new",
  "/admin/invoices/receivers",
  "/admin/invoices/reports",
  "/admin/invoices/reports/receivers",
  "/admin/invoices/settings",
  "/admin/messages",
  "/admin/notifications",
  "/admin/plaque",
  "/admin/records",
  "/admin/reports",
  "/admin/requests",
  "/admin/reviews",
  "/admin/schedule",
  "/admin/services",
  "/admin/settings/brand",
  "/admin/settings/contacts",
  "/admin/settings/gallery",
  "/admin/settings/online",
  "/admin/staff",
];
const BARBER = ["/b", "/b/week", "/b/time", "/b/money", "/b/more", "/b/sell", "/b/install"];
/** A page that does not exist: it must be reported (404), or the crawl sees nothing. Taken out of the problems after. */
const CONTROL = "/admin/crawl-control-404";
const LOGINS: Login[] = [
  { who: "owner", seeds: [CONTROL, ...ADMIN, "/b/pick"], within: /^\/(admin|b)(\/|$)/ },
  { who: "boss", seeds: [CONTROL, ...ADMIN, ...BARBER], within: /^\/(admin|b)(\/|$)/ },
  { who: "valentin", seeds: ["/b", "/b/week", "/b/time", "/b/money", "/b/more", "/b/sell", "/b/install", "/admin", "/admin/clients", "/admin/invoices"], within: /^\/b(\/|$)/ },
  { who: null, seeds: ["/ru", "/et", "/en", "/ru/about", "/ru/privacy", "/et/about", "/en/privacy", "/b/login", "/admin/login", "/b/install"], within: /^\/(ru|et|en)(\/|$)|^\/(b|admin)\/login$/ },
];
const SIZES = [
  { name: "phone", use: devices["Pixel 7"] },
  { name: "wide", use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false } },
];

/** One key per kind of page: ids, tokens and dates become «:x», the query goes. */
const pattern = (p: string) =>
  p
    .split("?")[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, "/:token")
    .replace(/\d{4}-\d{2}-\d{2}/g, ":date");

async function settle(page: Page) {
  await page.waitForLoadState("load").catch(() => {});
  // hydrated: every button and link has React's props (e2e/helpers.ts, hydrated)
  await page
    .waitForFunction(
      () => {
        const els = Array.from(document.querySelectorAll("button, a[href], input:not([type=hidden])"));
        return els.length > 0 && els.every((el) => Object.keys(el).some((k) => k.startsWith("__react")));
      },
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(300);
}

async function crawl(browser: Browser, login: Login, size: (typeof SIZES)[number]) {
  const ctx = await browser.newContext({
    ...size.use,
    baseURL: E2E_URL,
    locale: "ru-RU",
    timezoneId: "Europe/Tallinn",
    ...(login.who ? { storageState: authFile(login.who) } : {}),
  });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  const problems: string[] = [];
  const visited: { path: string; status: number; clicks: number; title: string }[] = [];
  let here = "";
  const note = (what: string) => {
    const line = `${here} · ${what}`;
    if (!problems.includes(line)) problems.push(line);
  };
  page.on("pageerror", (e) => note(`script error: ${e.message.slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error") note(`console: ${m.text().slice(0, 200)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) note(`${r.status()} ${new URL(r.url()).pathname}`);
  });

  const queue = [...login.seeds];
  const seen = new Set<string>();
  const fetched = new Set<string>();
  while (queue.length && visited.length < MAX_PAGES) {
    const target = queue.shift()!;
    const key = pattern(target);
    if (seen.has(key)) continue;
    seen.add(key);
    here = target;
    const res = await page.goto(target).catch((e) => (note(`goto failed: ${String(e).slice(0, 120)}`), null));
    const status = res?.status() ?? 0;
    await settle(page);
    const landed = new URL(page.url()).pathname + new URL(page.url()).search;
    if (status >= 400) note(`answers ${status}`);
    if (await page.locator("main[role=alert]").count()) note("the error page");

    // sideways scroll on a phone
    if (size.name === "phone") {
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (wide > 1) note(`scrolls sideways by ${wide}px`);
    }

    // its links: pages to visit, files to fetch
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
    for (const h of hrefs) {
      if (!h || h.startsWith("#")) continue;
      const u = new URL(h, page.url());
      if (u.origin !== new URL(E2E_URL).origin) continue;
      const p = u.pathname + u.search;
      if (/\/api\/|\.(csv|xlsx|pdf|ics)(\?|$)/i.test(p)) {
        if (fetched.has(pattern(p)) || /logout|signout/i.test(p)) continue;
        fetched.add(pattern(p));
        const r = await ctx.request.get(p).catch(() => null);
        if (!r || r.status() >= 400) note(`file ${p.split("?")[0]} answers ${r?.status() ?? "nothing"}`);
        continue;
      }
      if (NO_FOLLOW.test(h)) continue;
      if (login.within.test(u.pathname) && !seen.has(pattern(p))) queue.push(p);
    }

    // its buttons, one by one, each once by its words
    const pressed = new Set<string>();
    let clicks = 0;
    for (let round = 0; round < MAX_CLICKS * 2 && clicks < MAX_CLICKS; round++) {
      const buttons = page.locator("button:visible");
      const n = await buttons.count();
      let next = -1;
      let label = "";
      for (let i = 0; i < n; i++) {
        const b = buttons.nth(i);
        const words = ((await b.getAttribute("aria-label").catch(() => null)) || (await b.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim().slice(0, 60);
        if (!words || pressed.has(words) || SKIP.test(words)) continue;
        if (await b.isDisabled().catch(() => true)) {
          pressed.add(words);
          continue;
        }
        next = i;
        label = words;
        break;
      }
      if (next < 0) break;
      pressed.add(label);
      clicks++;
      here = `${target} [${label}]`;
      await buttons
        .nth(next)
        .click({ timeout: 4_000 })
        .catch((e) => {
          if (!/intercept|not visible|detached|outside of the viewport|Timeout/i.test(String(e))) note(`click failed: ${String(e).slice(0, 120)}`);
        });
      await page.waitForTimeout(400);
      if (await page.locator("main[role=alert]").count()) note("the error page");
      const now = new URL(page.url()).pathname + new URL(page.url()).search;
      if (now !== landed) {
        await page.goto(target).catch(() => {});
        await settle(page);
      } else {
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(150);
        if (await page.locator("[role=dialog]:visible, [role=alertdialog]:visible").count()) {
          await page.goto(target).catch(() => {});
          await settle(page);
        }
      }
      here = target;
    }
    visited.push({ path: target, status, clicks, title: await page.title().catch(() => "") });
  }

  const name = `${login.who ?? "client"}-${size.name}`;
  writeFileSync(path.join(OUT, `crawl-${name}.json`), JSON.stringify({ pages: visited, problems }, null, 2));
  await ctx.close();
  return { visited, problems };
}

test.describe.configure({ mode: "serial" });

for (const login of LOGINS) {
  for (const size of SIZES) {
    // the barber's app and the client's pages are for phones first; the wide run is for the admin and the booking on a computer
    if (size.name === "wide" && login.who === "valentin") continue;
    test(`crawl: ${login.who ?? "client"} on a ${size.name}`, async ({ browser }, info) => {
      test.skip(info.project.name !== "android", "one run of the crawl is enough");
      test.setTimeout(60 * 60_000);
      const { visited, problems } = await crawl(browser, login, size);
      console.log(`${login.who ?? "client"} ${size.name}: ${visited.length} pages, ${visited.reduce((s, v) => s + v.clicks, 0)} buttons`);
      // the control page must have been caught, or the crawl is blind
      if (login.seeds.includes(CONTROL)) expect(problems.some((p) => p.startsWith(`${CONTROL} · answers 404`)), problems.join("\n")).toBe(true);
      const real = problems.filter((p) => !p.startsWith(CONTROL));
      expect(real, real.join("\n")).toEqual([]);
    });
  }
}
