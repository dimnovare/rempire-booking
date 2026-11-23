import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * The barber app on a real Android phone at BrowserStack: `npm run
 * e2e:browserstack -- android [spec files]`. e2e/browserstack.mjs (and why
 * not an iPhone) starts the e2e server (fake data, as `npm run e2e`) at
 * bs-local.com, logs everyone in on this computer's Chromium («setup»), then
 * runs «phone» through the BrowserStack SDK on the phone in
 * e2e/browserstack/<phone>.yml, over the BrowserStack Local tunnel. The keys are the env vars BROWSERSTACK_USERNAME
 * and BROWSERSTACK_ACCESS_KEY, never in a file.
 *
 * No device emulation: the phone is real. Slower than on this computer (a
 * phone far away, `next dev` compiling), so longer waits.
 */
export default defineConfig({
  ...base,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  use: { ...base.use, actionTimeout: 30_000, navigationTimeout: 120_000, trace: "off" },
  // one project per run: the SDK puts every project on the phone, and the
  // logins need this computer (E2E_SETUP=yes, e2e/browserstack.mjs)
  projects:
    process.env.E2E_SETUP === "yes"
      ? [{ name: "setup", testMatch: /auth\.setup\.ts/ }]
      : [{ name: "phone", testIgnore: /auth\.setup\.ts/, metadata: { barber: process.env.E2E_BARBER || "valentin" } }],
  // e2e/browserstack.mjs starts it, once for the logins and the phone run
  webServer: undefined,
});
