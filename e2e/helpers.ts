import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test as base, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { ru as A } from "../src/app/admin/copy.ru";
import { ru as B } from "../src/app/b/copy.ru";
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

/**
 * Renat sets one of his two switches on /admin/requests; it saves by itself.
 * `which`: A.req.time or A.req.price; `to`: A.req.now or A.req.ask.
 */
export async function setSwitch(owner: Page, which: string, to: string): Promise<void> {
  await owner.goto("/admin/requests");
  await hydrated(owner);
  const group = owner.getByRole("group", { name: which });
  const button = group.getByRole("button", { name: to, exact: true });
  if ((await button.getAttribute("aria-pressed")) === "true") return;
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(owner.locator(".adm-card", { has: group }).getByText(B.saved, { exact: true }).first()).toBeVisible();
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

/** The next day the demo salon works (Monday to Saturday), at least `from` days ahead. */
export function nextWorkday(from = 1): string {
  for (let i = from; i < from + 7; i++) {
    const d = tallinnDate(i);
    if (new Date(`${d}T12:00:00Z`).getUTCDay() !== 0) return d;
  }
  throw new Error("no workday");
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
