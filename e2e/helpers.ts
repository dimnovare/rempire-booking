import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test as base, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { ru as A } from "../src/app/admin/copy.ru";
import { ru as B } from "../src/app/b/copy.ru";
import { GROUPS, rightDef, type RightKey } from "../src/lib/auth/rights-catalogue";
import { addDays, demoWorkday } from "../tools/demo-structure.mjs";
import { authFile, SERVER_LOG } from "./env";

export { A, B, expect };

/**
 * The tests' `test`: `next dev`'s own badge (bottom left) is hidden, as it
 * sits over the bottom bar's «День»; `barber` is this phone's barber.
 */
export const test = base.extend<{ barber: ReturnType<typeof barberOf> }>({
  barber: async ({}, use, info) => use(barberOf(info)),
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        s.textContent = "nextjs-portal{display:none!important}";
        document.head.append(s);
      });
    });
    await use(page);
  },
});

/**
 * A second phone in the same test: Renat's (or another login's), the same
 * model as this project's. Close its context at the end.
 */
export async function phoneOf(browser: Browser, info: TestInfo, who: string): Promise<Page> {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId } = info.project.use;
  const ctx = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, baseURL: info.project.use.baseURL, storageState: authFile(who) });
  await ctx.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
  return ctx.newPage();
}

/** The rights page of a login: «Доступ» → «Права» beside its e-mail (src/app/admin/(app)/account/[id]/). */
export async function openRights(owner: Page, email: string): Promise<void> {
  await owner.goto("/admin/account");
  await hydrated(owner);
  await owner.getByRole("link", { name: `${A.rights.open}: ${email}` }).click();
  await owner.waitForURL((u) => /^\/admin\/account\/[0-9a-f-]{36}$/.test(u.pathname));
  await expect(owner.locator("h1:visible", { hasText: A.rights.title })).toBeVisible();
  await hydrated(owner);
}

/** A group's block on the rights page, opened. */
export async function rightsGroup(page: Page, group: keyof typeof GROUPS) {
  const block = page.locator(`.rt-group[data-group="${group}"]:visible`);
  const head = block.locator(".rt-gtitle");
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "true");
  return block;
}

/** «Сохранить» on the rights page, and the line that says it is saved. */
export async function saveRights(page: Page): Promise<void> {
  await page.locator(".rt-save:visible").getByRole("button", { name: A.save, exact: true }).click();
  await expect(page.locator(".rt-save:visible .rt-note")).toHaveText(A.saved);
}

/**
 * Switch one right of a login on or off on its rights page, and save. With
 * it on, its group's switch goes on first. Nothing is saved when it is as
 * asked already.
 */
export async function setRight(owner: Page, email: string, right: RightKey, on: boolean): Promise<void> {
  await openRights(owner, email);
  const def = rightDef(right)!;
  const block = await rightsGroup(owner, def.group);
  const groupSwitch = block.getByRole("switch", { name: A.rights.groupOn(GROUPS[def.group].ru) });
  if (on && def.group !== "single" && !(await groupSwitch.isChecked())) await groupSwitch.check();
  const sw = block.locator(`[data-right="${right}"]`).getByRole("switch");
  if ((await sw.isChecked()) === on) {
    // as asked already; a group switched on just now is not kept either
    return;
  }
  await sw.setChecked(on);
  await saveRights(owner);
}

/**
 * What a barber changes himself, «Сразу» or «С моего ОК». Until 19.11.2026
 * these were Renat's two switches on /admin/requests; now each barber's own
 * login has a right for each (src/lib/barber/requests.ts), so this sets the
 * right of this phone's barber on his rights page.
 * `which`: A.req.time or A.req.price; `to`: A.req.now or A.req.ask.
 */
export async function setSwitch(owner: Page, which: string, to: string): Promise<void> {
  const barber = barberOf(base.info());
  await setRight(owner, barber.email, which === A.req.price ? "services.staff" : "journal.schedule", to === A.req.now);
}

/** Log this file's tests in as this phone's barber. */
export const asBarber = { storageState: async ({}, use: (s: string) => Promise<void>, info: TestInfo) => use(authFile(barberOf(info).slug)) };
/** …or as Renat (the owner). */
export const asOwner = { storageState: authFile("owner") };

export const TZ = "Europe/Tallinn";

/** This phone's barber (playwright.config.ts): Valentin on Android, Jevgeni on the iPhone. */
export function barberOf(info: TestInfo): { slug: string; name: string; email: string } {
  const slug = String(info.project.metadata.barber ?? "valentin");
  return { slug, name: slug[0].toUpperCase() + slug.slice(1), email: `${slug}@example.test` };
}

/** A demo row's fixed id, as tools/seed-demo.mjs makes it (that file can't be imported here). */
export function demoId(kind: string, slug: string): string {
  const h = createHash("sha256").update(`rempire-demo:${kind}:${slug}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** The newest login code the server printed for this address (e2e/server.mjs). */
export function lastCode(email: string): string | null {
  const text = readFileSync(SERVER_LOG, "utf8");
  const marker = `[email:console] to=${email} `;
  const at = text.lastIndexOf(marker);
  if (at < 0) return null;
  const m = /login code: (\d{6})/.exec(text.slice(at, at + 2000));
  return m ? m[1] : null;
}

/** Log in on /b/login by an e-mail code, as a barber does. */
export async function loginByCode(page: Page, email: string): Promise<void> {
  await page.goto("/b/login");
  await hydrated(page);
  await page.getByRole("button", { name: B.login.byCode }).click();
  const before = lastCode(email);
  await page.locator('input[name="email"]').fill(email);
  await page.getByRole("button", { name: B.login.sendCode }).click();
  await expect(page.locator('input[name="code"]')).toBeVisible();
  let code: string | null = null;
  await expect
    .poll(() => {
      code = lastCode(email);
      return code && code !== before ? code : null;
    })
    .not.toBeNull();
  await page.locator('input[name="code"]').fill(code!);
  await page.locator('input[name="code"]').press("Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/b/login"));
}

/** A date in Tallinn as YYYY-MM-DD, `days` from today. */
export function tallinnDate(days = 0, now = Date.now()): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The `nth` day from tomorrow on that this demo barber works: a dated shift
 * of his, or his weekly hours (tools/demo-structure.mjs, the salon's own
 * schedule). Each barber has his own days, and some weeks he is away: a
 * test never counts on a weekday, it asks here, and two tests that must not
 * meet on one day ask for two different numbers.
 * The first one is also the second day of his demo visits (seedDemoVisits
 * in tools/seed-demo.mjs): five of them from 10:00 and lunch at 13:00.
 */
export function nextWorkday(slug: string, nth = 1): string {
  let day = tallinnDate(0);
  for (let i = 0; i < nth; i++) day = workdayFrom(slug, addDays(day, 1));
  return day;
}

/** The first day from `date` on (YYYY-MM-DD) that this demo barber works. */
export function workdayFrom(slug: string, date: string): string {
  return demoWorkday(slug, date);
}

/** The page is no wider than the phone: nothing to scroll sideways. */
export async function expectNoSideScroll(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    const vw = window.innerWidth;
    // the innermost elements that stick out on the right
    const out = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((el) => el.getBoundingClientRect().right > vw + 0.5 && !Array.from(el.children).some((c) => c.getBoundingClientRect().right > vw + 0.5))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className} → ${Math.round(el.getBoundingClientRect().right)}px`);
    return { w: document.documentElement.scrollWidth, vw, out };
  });
  expect(r.w, `page is ${r.w}px wide on a ${r.vw}px screen: ${r.out.join("; ")}`).toBeLessThanOrEqual(r.vw);
}

/** Visible buttons, links and fields smaller than WCAG 2.2's minimum target (24 × 24 CSS px). */
export async function smallTargets(page: Page, min = 24): Promise<string[]> {
  return page.evaluate((min) => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [role=button]"))) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || el.closest("[aria-hidden=true]")) continue;
      if (el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "checkbox")) continue;
      if (r.height < min || r.width < min) out.push(`${el.tagName.toLowerCase()} «${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}» ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return out;
  }, min);
}

/**
 * Wait until React answers taps: every button, link and field on the page is
 * hydrated. Before that a tap or typed text is lost, on a phone as here
 * (React has no listeners yet); WebKit shows it more often than Chromium.
 */
export async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const els = Array.from(document.querySelectorAll("button, a[href], input:not([type=hidden])"));
    return els.length > 0 && els.every((el) => Object.keys(el).some((k) => k.startsWith("__react")));
  });
}

/** The toast or status line after an action. */
export function toast(page: Page) {
  return page.locator(".adm-toast");
}

/** The open sheet (BSheet: role dialog). */
export function sheet(page: Page) {
  return page.getByRole("dialog");
}
