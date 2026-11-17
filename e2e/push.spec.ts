import type { BrowserContext, CDPSession, Page } from "@playwright/test";
import { pushText } from "../src/lib/push-kinds";
import { E2E_URL } from "./env";
import { asBarber, B, expect, hydrated, nextWorkday, test, TZ } from "./helpers";

/**
 * B5 on the phone's side, without a phone: the service worker gets a push
 * straight from Chromium's DevTools protocol (no push service, no keys) and
 * must show it as the server wrote it. Chromium only (playwright.config.ts).
 * The real path through Apple's and Google's push services stays for the
 * real-phone test (docs/phase-b-phone-test.md).
 */

type Shown = { title: string; body: string; tag: string; url: string | undefined };

async function workerId(context: BrowserContext, page: Page): Promise<{ cdp: CDPSession; id: string }> {
  const cdp = await context.newCDPSession(page);
  const regs = new Map<string, { scopeURL: string; isDeleted: boolean }>();
  cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => {
    for (const r of e.registrations) regs.set(r.registrationId, r);
  });
  await cdp.send("ServiceWorker.enable");
  let id = "";
  await expect
    .poll(() => {
      id = [...regs].find(([, r]) => r.scopeURL === `${E2E_URL}/b` && !r.isDeleted)?.[0] ?? "";
      return id;
    })
    .not.toBe("");
  return { cdp, id };
}

const shown = (page: Page) =>
  page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration("/b");
    const list = reg ? await reg.getNotifications() : [];
    return list.map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: (n.data as { url?: string } | null)?.url }));
  }) as Promise<Shown[]>;

// the full Chromium: the headless shell refuses notifications even when granted
test.use({ ...asBarber, channel: "chromium", permissions: ["notifications"] });

test.describe("push in the service worker", () => {
  test("the worker controls /b, shows the server's words, and a tap opens the visit's day", async ({ page, context }) => {
    await page.goto("/b/time");
    await hydrated(page);
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toBe(`${E2E_URL}/b`);
    // after the first visit the worker controls the page (clients.claim)
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    const { cdp, id } = await workerId(context, page);
    const day = nextWorkday();
    const msg = pushText(
      "visit_new",
      { visitId: "e2e", startsAt: new Date(`${day}T10:00:00Z`).toISOString(), tz: TZ, client: "Demo client 1", services: [{ ru: "Стрижка" }], staff: "Valentin" },
      "ru",
    )!;
    // a lock screen is public: never a phone number
    expect(`${msg.title} ${msg.body}`).not.toMatch(/\+372|\d{5}/);
    await cdp.send("ServiceWorker.deliverPushMessage", { origin: E2E_URL, registrationId: id, data: JSON.stringify(msg) });
    await expect.poll(() => shown(page)).toEqual([{ title: msg.title, body: msg.body, tag: msg.tag, url: msg.url }]);

    // the same visit again: one line, the newer replaces the older (tag)
    const moved = { ...msg, title: "E2E перенесли" };
    await cdp.send("ServiceWorker.deliverPushMessage", { origin: E2E_URL, registrationId: id, data: JSON.stringify(moved) });
    await expect.poll(async () => (await shown(page)).map((n) => n.title)).toEqual(["E2E перенесли"]);

    // a tap: the open window of the app goes to the visit's day. A script
    // can't make a trusted click, so waitUntil() refuses; the navigation it
    // started still runs.
    const [sw] = context.serviceWorkers().filter((w) => w.url().includes("/b/sw.js"));
    expect(sw).toBeTruthy();
    await sw.evaluate(async () => {
      // the worker's own globals (the DOM lib types don't have them)
      const g = self as unknown as { registration: ServiceWorkerRegistration; dispatchEvent: (e: Event) => boolean; NotificationEvent: new (type: string, init: { notification: Notification }) => Event };
      const [n] = await g.registration.getNotifications();
      try {
        g.dispatchEvent(new g.NotificationEvent("notificationclick", { notification: n }));
      } catch {
        /* waitUntil on a synthetic event */
      }
    });
    await page.waitForURL((u) => u.pathname === "/b" && u.searchParams.get("d") === day);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("a push it cannot read still shows something (iOS stops a worker that shows nothing)", async ({ page, context }) => {
    await page.goto("/b");
    await hydrated(page);
    await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    const { cdp, id } = await workerId(context, page);
    await cdp.send("ServiceWorker.deliverPushMessage", { origin: E2E_URL, registrationId: id, data: "not json" });
    await expect.poll(() => shown(page)).toEqual([{ title: "REMPIRE", body: "", tag: "rempire", url: "/b" }]);
  });

  test("offline: his day as it was last loaded (production build only)", async ({ page, context }) => {
    test.skip(process.env.E2E_PROD !== "yes", "the worker caches nothing in `next dev`: run with E2E_PROD=yes");
    await page.goto("/b");
    await hydrated(page);
    await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    // a load through the worker keeps a copy
    await page.reload();
    await hydrated(page);
    const first = (await page.locator(".bx-v .bx-v-main b").first().innerText()).trim();
    await context.setOffline(true);
    // ten minutes later: the kept copy is old enough to say so (a weak
    // connection, as here, still reports navigator.onLine)
    await page.clock.install({ time: Date.now() + 10 * 60_000 });
    try {
      await page.reload();
      await expect(page.locator(".bx-v .bx-v-main b").first()).toHaveText(first);
      await expect(page.locator(".bx-state.is-off")).toHaveText(B.offline);
      // the logo and his photo from the kept copies
      for (const img of await page.locator("img:visible").all()) {
        await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      }
      // a page never loaded: the day instead
      await page.goto("/b/week");
      await expect(page.locator(".bx-v").first()).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
