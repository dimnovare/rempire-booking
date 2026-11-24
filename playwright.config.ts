import { defineConfig, devices } from "@playwright/test";
import { E2E_HTTPS_URL, E2E_PORT, E2E_URL } from "./e2e/env";

/**
 * End-to-end tests of the barber app (/b) and the admin's «Запросы», at
 * phone width. `npm run e2e` starts its own server (e2e/server.mjs) on an
 * empty in-memory database with the demo data and demo logins: fake names,
 * fake phones, nothing sent anywhere, all gone when it stops.
 *
 *   npx playwright install chromium webkit    once, for the browsers
 *   npm run e2e                     `next dev`, both phones
 *   npm run e2e -- --project=android
 *   E2E_PROD=yes npm run e2e        `next start` on the last `npm run build`:
 *                                   the service worker caches only there,
 *                                   so the offline test runs only there.
 *                                   The iPhone goes through an https front
 *                                   (e2e/server.mjs): in production the
 *                                   login cookie is __Host- (Secure), and
 *                                   WebKit keeps no Secure cookie over plain
 *                                   http. Needs openssl on PATH
 *
 * One worker: every test talks to the same server and the same database.
 * Each phone logs in as its own barber (Valentin on Android, Jevgeni on the
 * iPhone), so a booking on one does not take the other's time; Renat's
 * switches are shared, and each test that flips one puts it back.
 */
export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.out/results",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "e2e/.out/report", open: "never" }]],
  use: {
    baseURL: E2E_URL,
    locale: "ru-RU",
    timezoneId: "Europe/Tallinn",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "android",
      use: { ...devices["Pixel 7"] },
      metadata: { barber: "valentin" },
      dependencies: ["setup"],
    },
    {
      name: "iphone",
      use: {
        ...devices["iPhone 13"],
        // the production build: through the https front, with the certificate e2e/server.mjs made
        ...(process.env.E2E_PROD === "yes" ? { baseURL: E2E_HTTPS_URL, ignoreHTTPSErrors: true } : {}),
      },
      metadata: { barber: "jevgeni" },
      dependencies: ["setup"],
      // what only Chromium can do: push through the DevTools protocol
      testIgnore: /push\.spec\.ts/,
    },
  ],
  webServer: {
    command: "node e2e/server.mjs",
    url: `${E2E_URL}/b/login`,
    timeout: 240_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    env: { E2E_PORT: String(E2E_PORT) },
  },
});
