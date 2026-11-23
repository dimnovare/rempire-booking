/**
 * The barber app on a real phone at BrowserStack:
 *
 *   npm run e2e:browserstack -- android e2e/day.spec.ts e2e/more.spec.ts
 *
 * Android only. BrowserStack's Playwright on a real iPhone (iOS 26, tried
 * 23.11.2026) timed out opening a page with a login and could not read
 * Playwright's role selectors (getByRole …), which every spec uses.
 *
 * Starts the e2e server (e2e/server.mjs: fake data, nothing sent) at
 * bs-local.com, logs everyone in on this computer's Chromium (project
 * «setup»), then runs project «phone» on the phone in
 * e2e/browserstack/<phone>.yml through the BrowserStack SDK and its Local
 * tunnel. One phone at a time: both would book on the same server.
 *
 * Needs the env vars BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY (the
 * Automate username and access key, never in a file). Each run uses
 * BrowserStack minutes: pass only the spec files that matter.
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const BARBER = { android: "valentin" };

const [phone, ...rest] = process.argv.slice(2);
if (!Object.hasOwn(BARBER, phone)) {
  console.error("usage: npm run e2e:browserstack -- android [spec files, playwright options]");
  process.exit(2);
}
for (const v of ["BROWSERSTACK_USERNAME", "BROWSERSTACK_ACCESS_KEY"]) {
  if (!process.env[v]) {
    console.error(`${v} is not set. It is an env var, never a file.`);
    process.exit(2);
  }
}

const host = "bs-local.com";
const port = process.env.E2E_PORT || "3420";
const env = {
  ...process.env,
  E2E_HOST: host,
  E2E_PORT: port,
  E2E_BARBER: BARBER[phone],
  BROWSERSTACK_CONFIG_FILE: path.join(here, "browserstack", `${phone}.yml`),
};

// the server's output goes to e2e/.out/server.log, as with `npm run e2e`
const server = spawn(process.execPath, [path.join(here, "server.mjs")], { cwd: root, env, stdio: "ignore" });
let stopped = false;
function stop() {
  if (stopped) return;
  stopped = true;
  // on Windows kill() ends only server.mjs and leaves `next dev` running
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill();
}
process.on("exit", stop);
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));

const url = `http://${host}:${port}/b/login`;
const until = Date.now() + 240_000;
for (;;) {
  try {
    const r = await fetch(url, { redirect: "manual" });
    if (r.status < 500) break;
  } catch {
    // not up yet
  }
  if (Date.now() > until) {
    console.error(`The e2e server did not answer at ${url}; see e2e/.out/server.log`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 2000));
}

const run = (args, extra = {}) =>
  new Promise((done) => {
    const c = spawn("npx", args, { cwd: root, env: { ...env, ...extra }, stdio: "inherit", shell: process.platform === "win32" });
    c.on("exit", (code) => done(code ?? 1));
  });
// `--config=` in one piece: the SDK drops a separate `-c <file>`
const config = "--config=playwright.browserstack.config.ts";
let code = await run(["playwright", "test", config], { E2E_SETUP: "yes" });
// E2E_REAL_PHONE: the phone gets those logins as cookies (e2e/helpers.ts)
if (code === 0) code = await run(["browserstack-node-sdk", "playwright", "test", config, ...rest], { E2E_REAL_PHONE: "yes" });
process.exit(code);
