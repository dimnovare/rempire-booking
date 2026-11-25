#!/usr/bin/env node
/**
 * The shop link, end to end, on this computer only (docs/phase-c.md
 * § «Testing the shop link locally»).
 *
 *   npm run test:shop-link
 *   SHOP_DIR=<the shop's booking-partner-api-2 worktree> npm run test:shop-link
 *
 * It starts the shop branch `booking-partner-api-2` (rempire-web) on
 * localhost:3300 and booking on localhost:3400, each with `next dev` on its
 * own local PGlite database. Then a headless browser walks a barber's sales
 * from the phone to the shop's stock and back to Renat's invoice draft.
 * Nothing is pushed. Nothing reaches the live shop, its database or any
 * outside service:
 *
 *   - Each server gets an environment built from nothing: the OS basics and
 *     the values below. No DATABASE_URL, Resend, Telegram, Montonio, R2,
 *     OpenAI, push or cron key of the calling shell gets through.
 *   - It refuses a folder with an .env file (next dev would load it), the
 *     shop's main checkout, a shop on `main`, and a busy port (it must never
 *     talk to a server it did not start).
 *   - The shop's admin password, its session secret and the two partner
 *     keys (read and write, as in production after the move) are random for
 *     each run and live only in this process's memory.
 *   - Booking runs as staging does (no ALLOW_INDEXING): it sells here only
 *     because this shop is on localhost (shopWritesAllowed() in
 *     src/lib/shop.ts).
 *   - The shop's own test switch (E2E_BOOTSTRAP: migrations over HTTP, the
 *     mail sink) works only outside production.
 *
 * Photo identify needs the shop's OpenAI key, so it is not part of this run;
 * its booking side runs against the fake shop in `npm test`.
 *
 * Flags: --keep leaves both servers running at the end (Ctrl+C stops them).
 * SHOP_PORT and BOOKING_PORT pick other ports.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { closeSync, createWriteStream, existsSync, mkdtempSync, openSync, readdirSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const KEEP = process.argv.includes("--keep");
const SHOP_PORT = Number(process.env.SHOP_PORT) || 3300;
const BOOKING_PORT = Number(process.env.BOOKING_PORT) || 3400;
const SHOP = `http://localhost:${SHOP_PORT}`;
const BOOKING = `http://localhost:${BOOKING_PORT}`;
/** booking's sales «minute» in this run (SALES_MINUTE_MS, src/lib/sales.ts): undo 5 s, backoff 2 s */
const MINUTE_MS = 1000;
const UNDO_MS = 5 * MINUTE_MS;
const BARBER = "valentin@example.test";
const OWNER = "owner@example.test";

/* What the browser looks for: src/app/b/copy.ru.ts, src/app/admin/copy.ru.ts
   (the demo logins read Russian). */
const RU = {
  byCode: "Войти по коду из письма",
  sendCode: "Прислать код",
  client: "Клиенту",
  self: "Себе",
  search: "Название товара",
  scan: "Сканировать",
  shopDown: "Магазин сейчас не отвечает",
  makeDrafts: "Сделать черновики",
};

/* ---------- small things ---------- */

const rand = (n = 24) => randomBytes(n).toString("base64url");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const refuse = (msg) => {
  console.error(`\nRefused: ${msg}`);
  process.exit(2);
};
function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

function git(dir, ...args) {
  const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** The shop worktree next to this repository: …/rempire-web/.claude/worktrees/booking-partner-api-2 */
function defaultShopDir() {
  const common = git(ROOT, "rev-parse", "--path-format=absolute", "--git-common-dir");
  return common ? path.resolve(common, "..", "..", "rempire-web", ".claude", "worktrees", "booking-partner-api-2") : "";
}

/** File names only: an .env file is never opened, only noticed. */
const envFiles = (dir) => readdirSync(dir).filter((n) => /^\.env/i.test(n) && n !== ".env.example");

function portBusy(port) {
  const one = (host) =>
    new Promise((resolve) => {
      const s = net.connect({ port, host });
      s.setTimeout(800);
      s.once("connect", () => (s.destroy(), resolve(true)));
      s.once("timeout", () => (s.destroy(), resolve(false)));
      s.once("error", () => resolve(false));
    });
  return Promise.all([one("127.0.0.1"), one("::1")]).then((r) => r.some(Boolean));
}

/** A valid EAN-13 in the in-store range (200…), so it can never be a real product's. */
function ean13() {
  const d = "200" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d[i]) * (i % 2 ? 3 : 1);
  return d + ((10 - (s % 10)) % 10);
}

/** The shop's ADMIN_PASSWORD_HASH format (rempire-web tools/hash-password.mjs). */
function scryptHash(password) {
  const P = { N: 16384, r: 8, p: 1 };
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, { ...P, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", P.N, P.r, P.p, salt.toString("base64"), key.toString("base64")].join("$");
}

const tallinnMonth = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Tallinn" }).format(new Date()).slice(0, 7);

/* ---------- clean environments ---------- */

const OS_KEYS = [
  "PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "windir", "WINDIR", "ComSpec", "COMSPEC",
  "TEMP", "TMP", "TMPDIR", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "HOME", "APPDATA", "LOCALAPPDATA",
  "ProgramData", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "CommonProgramFiles",
  "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS", "LANG", "TERM", "USER", "USERNAME", "LOGNAME", "SHELL",
];
/** Names that must never reach either server from the calling shell. */
const FORBIDDEN = /^(DATABASE_URL|POSTGRES|PG(HOST|USER|PASSWORD|DATABASE|PORT)$|RESEND_|TELEGRAM_|MONTONIO_|R2_|OPENAI_|CRON_SECRET$|DEPLOY_HOOK|GSC_|VAPID_|GOOGLE_|SMTP|SENTRY|VERCEL|BLOB_|KV_|REDIS|STRIPE|ADMIN_BOOTSTRAP|SHOP_API_|BOOKING_API_)/;

function cleanEnv(extra, allowed = []) {
  const env = {};
  for (const k of OS_KEYS) if (process.env[k] != null) env[k] = process.env[k];
  Object.assign(env, { NEXT_TELEMETRY_DISABLED: "1" }, extra);
  const leaked = Object.keys(env).filter((k) => FORBIDDEN.test(k) && !allowed.includes(k));
  if (leaked.length) refuse(`${leaked.join(", ")} would reach a server.`);
  return env;
}

/* ---------- the two servers ---------- */

class Server {
  constructor(name, dir, port, env, logDir) {
    Object.assign(this, { name, dir, port, env, lines: [] });
    this.log = createWriteStream(path.join(logDir, `${name}.log`), { flags: "a" });
  }
  start() {
    const next = path.join(this.dir, "node_modules", "next", "dist", "bin", "next");
    const child = spawn(process.execPath, [next, "dev", "--port", String(this.port)], {
      cwd: this.dir,
      env: this.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    const take = (buf) => {
      this.log.write(buf);
      for (const l of buf.toString("utf8").split(/\r?\n/)) if (l) this.lines.push(l);
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    this.child = child;
    this.exited = new Promise((r) => child.once("exit", r));
  }
  /** The whole process tree: next dev starts its own workers. */
  async stop() {
    const c = this.child;
    if (!c || c.exitCode != null) return;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
    else {
      try {
        process.kill(-c.pid, "SIGTERM");
      } catch {
        c.kill("SIGTERM");
      }
    }
    await Promise.race([this.exited, sleep(10_000)]);
    this.child = null;
  }
  mark() {
    return this.lines.length;
  }
  since(mark) {
    return this.lines.slice(mark);
  }
}

async function waitFor(what, fn, timeoutMs = 240_000) {
  const until = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < until) {
    try {
      const r = await fn();
      if (r) return r;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await sleep(1000);
  }
  throw new Error(`timed out waiting for ${what}${last ? ` (${last})` : ""}`);
}

/* ---------- HTTP ---------- */

async function http(base, pathname, { method = "GET", body, cookie, bearer, headers = {} } = {}) {
  const res = await fetch(base + pathname, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(60_000),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, headers: res.headers };
}

/* ---------- the run ---------- */

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}${note ? ` — ${note}` : ""} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name, ok: false, msg });
    console.log(`  ✗ ${name} — ${msg}`);
    throw e;
  }
}

async function main() {
  /* 1. refuse anything unsafe, before any process starts */
  const SHOP_DIR = path.resolve(process.env.SHOP_DIR || defaultShopDir());
  if (!existsSync(path.join(SHOP_DIR, "src", "app", "api", "partner", "barber-sales", "route.ts"))) {
    refuse(`no shop branch with the partner API at ${SHOP_DIR}. Set SHOP_DIR to the rempire-web worktree of booking-partner-api-2.`);
  }
  const gitDir = git(SHOP_DIR, "rev-parse", "--path-format=absolute", "--git-dir");
  const commonDir = git(SHOP_DIR, "rev-parse", "--path-format=absolute", "--git-common-dir");
  if (!gitDir || !commonDir || path.resolve(gitDir) === path.resolve(commonDir)) {
    refuse(`${SHOP_DIR} is the shop's main checkout, whose .env files may hold production values. Use a worktree of booking-partner-api-2.`);
  }
  const branch = git(SHOP_DIR, "rev-parse", "--abbrev-ref", "HEAD");
  if (!branch || branch === "main" || branch === "HEAD") refuse(`the shop folder is on ${branch ?? "no branch"}, not a feature branch.`);
  for (const [name, dir] of [["shop", SHOP_DIR], ["booking", ROOT]]) {
    const found = envFiles(dir);
    if (found.length) refuse(`the ${name} folder ${dir} has ${found.join(", ")}; next dev would load it. Run from a worktree without .env files.`);
  }
  for (const port of [SHOP_PORT, BOOKING_PORT]) {
    if (await portBusy(port)) refuse(`port ${port} is already in use. This test only talks to servers it starts itself (SHOP_PORT / BOOKING_PORT pick others).`);
  }
  // the shop's build rewrites a few committed files; they are put back after it, so they must start clean
  if (git(SHOP_DIR, "status", "--porcelain", "--untracked-files=no") !== "") refuse(`the shop worktree has uncommitted changes. Commit them first.`);

  /* 2. this run's own secrets, in memory only */
  // two keys, as the shop wants them (its src/lib/partner-auth.ts): the write one 32+ characters and not the read one
  const readSecret = rand(32);
  const writeSecret = rand(32);
  must(writeSecret.length >= 32 && writeSecret !== readSecret, "the write key");
  const shopPassword = rand(18);
  const cronSecret = rand(24);
  const tmp = mkdtempSync(path.join(os.tmpdir(), "rempire-shop-link-"));

  const shopEnv = cleanEnv({
    DB_DRIVER: "pglite",
    // on disk, so the shop keeps its orders and stock across the restart below
    PGLITE_PATH: path.join(tmp, "shop-db"),
    SESSION_SECRET: rand(32),
    ADMIN_PASSWORD_HASH: scryptHash(shopPassword),
    PAYMENT_PROVIDER: "mock",
    SHIPPING_PROVIDER: "mock",
    PUBLIC_BASE_URL: SHOP,
    E2E_BOOTSTRAP: "1",
    // the read key under the name production has had since 18.11.2026
    BOOKING_API_SECRET: readSecret,
    BOOKING_API_WRITE_SECRET: writeSecret,
  }, ["BOOKING_API_SECRET", "BOOKING_API_WRITE_SECRET"]);
  const bookingEnv = cleanEnv({
    DB_DRIVER: "pglite",
    SEED_DEMO: "yes",
    DEMO_LOGINS: "yes",
    EMAIL_TRANSPORT: "console",
    SMS_TRANSPORT: "console",
    SHOP_API_URL: SHOP,
    SHOP_API_SECRET: readSecret,
    SHOP_API_WRITE_SECRET: writeSecret,
    CRON_SECRET: cronSecret,
    SALES_MINUTE_MS: String(MINUTE_MS),
    // the full branch takes sales; on staging (docs/test-run.md) this stays off
    SHOP_SALES: "on",
    // from a worktree whose node_modules is a junction to the main checkout's,
    // Turbopack finds `next` only with the main checkout as its root
    ...(process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT ? { NEXT_PRIVATE_OUTPUT_TRACE_ROOT: process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT } : {}),
  }, ["SHOP_API_URL", "SHOP_API_SECRET", "SHOP_API_WRITE_SECRET", "CRON_SECRET"]);
  must(!("DATABASE_URL" in shopEnv) && !("DATABASE_URL" in bookingEnv), "DATABASE_URL in a server's environment");

  const shop = new Server("shop", SHOP_DIR, SHOP_PORT, shopEnv, tmp);
  const booking = new Server("booking", ROOT, BOOKING_PORT, bookingEnv, tmp);
  let browser = null;
  let failed = false;
  // Ctrl+C: never leave a server behind
  process.once("SIGINT", () => {
    void Promise.all([booking.stop(), shop.stop()]).then(() => process.exit(130));
  });

  console.log(`Shop link, local only. Shop: ${SHOP_DIR} (${branch}). Logs: ${tmp}\n`);
  try {
    await step("shop: generated files (its own e2e build)", async () => {
      const fd = openSync(path.join(tmp, "shop-build.log"), "a");
      const r = spawnSync(process.execPath, ["tools/e2e-build.mjs"], { cwd: SHOP_DIR, env: shopEnv, stdio: ["ignore", fd, fd] });
      closeSync(fd);
      // The prerender and the packers also rewrite a few committed files (for
      // localhost:3417). The committed copies serve a dev server just as well,
      // so they go back: the shop branch stays exactly as committed.
      // from status, not diff: some differ only in line endings, which diff does not list
      const touched = (git(SHOP_DIR, "status", "--porcelain", "--untracked-files=no") ?? "")
        .split("\n")
        .filter(Boolean)
        .map((l) => l.replace(/^\s*\S+\s+/, ""));
      if (touched.length) spawnSync("git", ["-C", SHOP_DIR, "checkout", "--", ...touched], { stdio: "ignore" });
      must(r.status === 0, `e2e-build exited ${r.status} (see shop-build.log)`);
      must(git(SHOP_DIR, "status", "--porcelain", "--untracked-files=no") === "", "the shop branch is not as committed after its build");
      return touched.length ? `${touched.length} committed files put back` : "";
    });

    await step("shop: up on an empty local database, migrated", async () => {
      shop.start();
      const r = await waitFor("the shop", async () => {
        const x = await http(SHOP, "/api/e2e/bootstrap/");
        return x.status === 200 ? x : null;
      });
      return `bootstrap ${r.status}`;
    });

    await step("shop: the partner API answers only this run's keys, each on its own routes", async () => {
      const LOOKUP = "/api/partner/products/lookup?q=sh&limit=1";
      const ok = await http(SHOP, LOOKUP, { bearer: readSecret });
      must(ok.status === 200, `read key: ${ok.status}`);
      const bad = await http(SHOP, LOOKUP, { bearer: rand(32) });
      must(bad.status === 401, `wrong key: ${bad.status}`);
      const none = await http(SHOP, LOOKUP);
      must(none.status === 401, `no key: ${none.status}`);
      const write = await http(SHOP, LOOKUP, { bearer: writeSecret });
      must(write.status === 401, `the write key on a read route: ${write.status}`);
      // a sale with the read key: refused before the body is looked at, so this one is never booked
      const sale = { ref: `t_${rand(12)}`, barber: { ref: randomUUID(), name: "Test Barber" }, mode: "client", items: [{ productId: "x", variant: "", qty: 1, unitCents: 1 }] };
      const ro = await http(SHOP, "/api/partner/barber-sales", { method: "POST", body: sale, bearer: readSecret });
      must(ro.status === 403 && ro.json?.error === "read_only", `the read key on the sale route: ${ro.status} ${JSON.stringify(ro.json)}`);
      const anon = await http(SHOP, "/api/partner/barber-sales", { method: "POST", body: sale });
      must(anon.status === 401, `no key on the sale route: ${anon.status}`);
      return "read 200 · sale with the read key 403";
    });

    const login = await http(SHOP, "/api/admin/login/", { method: "POST", body: { password: shopPassword } });
    must(login.status === 200, `shop admin login: ${login.status}`);
    const shopCookie = (login.headers.get("set-cookie") || "").split(";")[0];
    must(shopCookie, "shop admin login set no cookie");
    const admin = (pathname, opts = {}) => http(SHOP, pathname, { ...opts, cookie: shopCookie });
    const partner = (pathname, opts = {}) => http(SHOP, pathname, { ...opts, bearer: readSecret });
    const partnerWrite = (pathname, opts = {}) => http(SHOP, pathname, { ...opts, bearer: writeSecret });
    const byId = async (p) => (await partner(`/api/partner/products/lookup?id=${encodeURIComponent(p.productId)}&variant=${encodeURIComponent(p.variant)}&lang=ru`)).json?.items?.[0];

    /* 3. fake test data: three on-sale products, each with a made-up barcode, 10 on the shelf and a purchase price */
    const P = [];
    await step("shop: test data (barcodes, stock 10, purchase prices)", async () => {
      for (const word of ["shampoo", "pomade", "wax", "spray", "oil", "paste", "cream", "conditioner", "gel", "clay"]) {
        const items = (await partner(`/api/partner/products/lookup?q=${word}&limit=20&lang=ru`)).json?.items ?? [];
        // one product per word, whose name no other search hit or pick contains, so the
        // phone's list and the money pages can tell the three apart by name
        const lc = (s) => s.toLowerCase();
        const it = items.find(
          (x) =>
            x.priceCents > 0 &&
            x.name &&
            items.filter((y) => lc(y.name).includes(lc(x.name))).length === 1 &&
            !P.some((p) => p.productId === x.productId || lc(p.name).includes(lc(x.name)) || lc(x.name).includes(lc(p.name))),
        );
        if (it) P.push({ ...it, word });
        if (P.length >= 3) break;
      }
      must(P.length === 3, `found ${P.length} products to test with`);
      for (const p of P) {
        p.ean = ean13();
        p.purchaseCents = Math.max(100, Math.round(p.priceCents * 0.4));
        const put = await admin("/api/admin/inventory/", { method: "PUT", body: { productId: p.productId, variant: p.variant, ean: p.ean, purchaseCents: p.purchaseCents } });
        must(put.status === 200, `PUT inventory ${p.productId}: ${put.status} ${JSON.stringify(put.json)}`);
        const set = await admin("/api/admin/inventory/moves/", { method: "POST", body: { productId: p.productId, variant: p.variant, qty: 10 }, headers: { "idempotency-key": randomUUID() } });
        must(set.status === 200, `stock ${p.productId}: ${set.status} ${JSON.stringify(set.json)}`);
      }
      return P.map((p) => `${p.name}${p.variantLabel ? ` ${p.variantLabel}` : ""}`).join(" · ");
    });
    const [A, B, C] = P;

    await step("shop: lookup by barcode, by name and by id", async () => {
      const bc = (await partner(`/api/partner/products/lookup?barcode=${C.ean}&lang=ru`)).json?.items ?? [];
      must(bc.length === 1 && bc[0].productId === C.productId && bc[0].variant === C.variant, `barcode found ${JSON.stringify(bc.map((x) => x.productId))}`);
      const q = (await partner(`/api/partner/products/lookup?q=${A.word}&limit=20&lang=ru`)).json?.items ?? [];
      must(q.some((x) => x.productId === A.productId), "name search misses the product");
      const b = await byId(B);
      must(b && b.purchaseCents === B.purchaseCents && b.stock === 10 && b.barcode === B.ean, `by id: ${JSON.stringify(b)}`);
    });

    /* 4. booking, pointed at this shop */
    await step("booking: up on its demo data, pointed at the local shop", async () => {
      booking.start();
      await waitFor("booking", async () => (await http(BOOKING, "/b/login")).status === 200);
    });

    const { chromium } = await import("@playwright/test");
    browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU", permissions: ["camera"] });
    // the phone's barcode reader, reading whatever the test holds up (window.__scan)
    await phone.addInitScript(() => {
      window.BarcodeDetector = class {
        static async getSupportedFormats() {
          return ["ean_13", "ean_8", "code_128"];
        }
        async detect() {
          return window.__scan ? [{ rawValue: window.__scan, format: "ean_13" }] : [];
        }
      };
    });
    const page = await phone.newPage();

    const codeOf = (email, mark) => {
      for (const l of booking.since(mark).reverse()) {
        const m = new RegExp(`to=${email.replace(/[.@]/g, "\\$&")} subject="(\\d{6})`).exec(l);
        if (m) return m[1];
      }
      return null;
    };
    const hydrated = (pg) =>
      pg.waitForFunction(() => {
        const els = Array.from(document.querySelectorAll("button, a[href], input:not([type=hidden])"));
        return els.length > 0 && els.every((el) => Object.keys(el).some((k) => k.startsWith("__react")));
      }, null, { timeout: 120_000 });
    async function loginByCode(pg, loginPath, email) {
      await pg.goto(BOOKING + loginPath, { timeout: 120_000 });
      await hydrated(pg);
      const byCode = pg.getByRole("button", { name: RU.byCode });
      const email$ = pg.locator('input[name="email"], input[type="email"]').first();
      if (await byCode.isVisible().catch(() => false)) {
        if (await email$.isVisible().catch(() => false)) await email$.fill(email);
        await byCode.click();
      }
      await email$.fill(email);
      const mark = booking.mark();
      await pg.getByRole("button", { name: RU.sendCode }).click();
      const code = await waitFor("the login code", async () => codeOf(email, mark), 60_000);
      const code$ = pg.locator('input[name="code"], input[autocomplete="one-time-code"]').first();
      await code$.fill(code);
      await code$.press("Enter");
      await pg.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 });
    }

    await step("booking: the barber logs in on the phone", async () => {
      await loginByCode(page, "/b/login", BARBER);
    });

    const sales = () => page.locator("li.bx-sale");
    const title = (p) => page.locator("button.bx-row", { hasText: p.name }).filter(p.variantLabel ? { hasText: p.variantLabel } : {});
    async function openSell() {
      await page.goto(BOOKING + "/b/sell", { timeout: 120_000 });
      await hydrated(page);
    }
    async function sellBySearch(p, mode, qty) {
      await page.getByRole("button", { name: mode === "self" ? RU.self : RU.client, exact: true }).click();
      await page.getByLabel(RU.search).fill(p.word);
      await title(p).first().click({ timeout: 30_000 });
      for (let i = 1; i < qty; i++) await page.locator(".bx-pick").getByRole("button", { name: "+" }).click();
      const n = await sales().count();
      await page.locator(".bx-sell-go").click();
      await page.waitForFunction((k) => document.querySelectorAll("li.bx-sale").length > k, n, { timeout: 30_000 });
    }

    await step("booking: «Клиенту» by name search, 2 pieces", async () => {
      await openSell();
      await sellBySearch(A, "client", 2);
      return `${A.name}, ${(A.priceCents * 2) / 100} €`;
    });

    await step("booking: «Себе» at the purchase price × 1.24", async () => {
      const want = Math.round(B.purchaseCents * 1.24);
      await page.getByRole("button", { name: RU.self, exact: true }).click();
      await page.getByLabel(RU.search).fill(B.word);
      await title(B).first().click({ timeout: 30_000 });
      const label = await page.locator(".bx-sell-go").innerText();
      must(label.includes((want / 100).toFixed(2).replace(".", ",")), `button says «${label}», expected ${(want / 100).toFixed(2)}`);
      const n = await sales().count();
      await page.locator(".bx-sell-go").click();
      await page.waitForFunction((k) => document.querySelectorAll("li.bx-sale").length > k, n, { timeout: 30_000 });
      return `${B.name}, ${(want / 100).toFixed(2)} €`;
    });

    await step("booking: «Клиенту» by the camera scanning a barcode", async () => {
      await page.getByRole("button", { name: RU.client, exact: true }).click();
      await page.evaluate((code) => (window.__scan = code), C.ean);
      await page.getByRole("button", { name: RU.scan }).click();
      await page.locator(".bx-pick", { hasText: C.name }).waitFor({ timeout: 30_000 });
      const n = await sales().count();
      await page.locator(".bx-sell-go").click();
      await page.waitForFunction((k) => document.querySelectorAll("li.bx-sale").length > k, n, { timeout: 30_000 });
      await page.evaluate(() => (window.__scan = ""));
      return `EAN ${C.ean}`;
    });

    const cron = async () => {
      const r = await http(BOOKING, "/api/cron/outbox", { bearer: cronSecret });
      must(r.status === 200, `cron: ${r.status}`);
      return r.json?.sales ?? {};
    };
    const mailMark = shop.mark();
    let synced = 0;

    await step("booking → shop: after the undo window the cron sends all three", async () => {
      await sleep(UNDO_MS + 1500);
      const s = await cron();
      must(s.sent === 3 && !s.retry && !s.failed, `cron sales: ${JSON.stringify(s)}`);
      synced = 3;
      const again = await cron();
      must(again.sent === 0, `a second run sent ${again.sent} again`);
      return "sent 3, then 0";
    });

    const barberOrders = async () => ((await admin("/api/admin/orders/?limit=200")).json?.orders ?? []).filter((o) => o.channel === "barber");

    await step("shop: three paid barber orders, stock down with sale_barber", async () => {
      const orders = await barberOrders();
      must(orders.length === synced, `${orders.length} barber orders`);
      must(orders.every((o) => /^R-/.test(o.number) && o.barber && o.barber.name), `order fields: ${JSON.stringify(orders[0])}`);
      must(orders.filter((o) => o.barber.mode === "self").length === 1, "one self sale expected");
      const [a, b, c] = await Promise.all([byId(A), byId(B), byId(C)]);
      must(a.stock === 8 && b.stock === 9 && c.stock === 9, `stock ${a.stock}/${b.stock}/${c.stock}, expected 8/9/9`);
      const moves = (await admin(`/api/admin/inventory/moves/?productId=${encodeURIComponent(A.productId)}&reason=sale_barber&limit=50`)).json?.moves ?? [];
      must(moves.length >= 1, "no sale_barber move for the first product");
      return orders.map((o) => o.number).join(", ");
    });

    await step("shop: no letter, no owner ping, no push for a barber sale", async () => {
      const mails = (await admin("/api/e2e/mail/")).json?.mails;
      must(Array.isArray(mails) && mails.length === 0, `mail sink: ${JSON.stringify(mails)}`);
      const noisy = shop.since(mailMark).filter((l) => /\[(mail|notify|push|telegram)[\]:]/i.test(l));
      must(noisy.length === 0, `shop log: ${noisy.slice(0, 3).join(" | ")}`);
    });

    await step("shop: the same sale sent twice is one order (idempotent by ref)", async () => {
      const before = (await byId(A)).stock;
      const body = { ref: `t_${rand(12)}`, barber: { ref: randomUUID(), name: "Test Barber" }, mode: "client", items: [{ productId: A.productId, variant: A.variant, qty: 1, unitCents: A.priceCents }] };
      const one = await partnerWrite("/api/partner/barber-sales", { method: "POST", body });
      const two = await partnerWrite("/api/partner/barber-sales", { method: "POST", body });
      must(one.status === 200 && one.json?.repeat === false, `first: ${one.status} ${JSON.stringify(one.json)}`);
      must(two.status === 200 && two.json?.repeat === true && two.json?.orderNumber === one.json?.orderNumber, `second: ${two.status} ${JSON.stringify(two.json)}`);
      synced += 1;
      must((await byId(A)).stock === before - 1, "the repeat moved stock again");
      must((await barberOrders()).length === synced, "the repeat made a second order");
      return `${one.json.orderNumber} twice`;
    });

    await step("booking ↔ shop down: the sale waits, retries, and lands once the shop is back", async () => {
      await openSell();
      await sellBySearch(A, "client", 1);
      await shop.stop();
      // while it is down, the phone says so instead of hanging
      await page.getByLabel(RU.search).fill(B.word);
      await page.getByText(RU.shopDown).first().waitFor({ timeout: 30_000 });
      await sleep(UNDO_MS + 1500);
      const down = await cron();
      must(down.sent === 0 && down.retry === 1, `while down: ${JSON.stringify(down)}`);
      shop.start();
      await waitFor("the shop again", async () => (await http(SHOP, "/api/e2e/bootstrap/")).status === 200);
      await sleep(2 * MINUTE_MS + 1500);
      const back = await cron();
      must(back.sent === 1 && !back.failed, `after the restart: ${JSON.stringify(back)}`);
      synced += 1;
      const orders = await barberOrders();
      must(orders.length === synced, `${orders.length} barber orders, expected ${synced}`);
      must((await byId(A)).stock === 6, `stock ${(await byId(A)).stock}, expected 6`);
      return `retry 1, then sent 1; ${synced} orders`;
    });

    await step("shop admin: the order opens with the «Барбер» badge", async () => {
      const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ru-RU" });
      const pg = await desk.newPage();
      await pg.goto(SHOP + "/admin/", { timeout: 120_000 });
      const pw = pg.locator("[data-admpw]");
      await pw.waitFor({ timeout: 60_000 });
      await waitFor("the password field", async () => {
        await pw.fill(shopPassword);
        return (await pw.inputValue()) === shopPassword;
      }, 20_000);
      await pg.locator("[data-admlogin]").click();
      await pg.locator('[data-admtab="orders"][aria-current]:visible').first().click({ timeout: 30_000 });
      const number = (await barberOrders())[0].number;
      await pg.locator("[data-admorderq]").fill(number);
      await pg.locator(`[data-admorder]:has-text("${number}")`).first().click({ timeout: 30_000 });
      const badge = await pg.locator(".adm-badge--big").first().innerText({ timeout: 30_000 });
      must(/Барбер/i.test(badge), `badge «${badge}»`);
      await desk.close();
      return number;
    });

    await step("booking: the barber's «Мои расчёты» shows the sales", async () => {
      await page.goto(BOOKING + "/b/money", { timeout: 120_000 });
      await hydrated(page);
      const text = await page.locator("main").innerText();
      for (const p of [A, B, C]) must(text.includes(p.name), `«${p.name}» missing on /b/money`);
    });

    await step("booking: Renat's invoice draft for this month picks the sales up", async () => {
      const office = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" });
      const pg = await office.newPage();
      await loginByCode(pg, "/admin/login", OWNER);
      const m = tallinnMonth();
      await pg.goto(`${BOOKING}/admin/invoices/reports?m=${m}`, { timeout: 120_000 });
      await hydrated(pg);
      await pg.getByRole("button", { name: RU.makeDrafts }).click();
      await sleep(3000);
      await pg.goto(`${BOOKING}/admin/invoices?m=${m}`, { timeout: 120_000 });
      const hrefs = await pg.locator("a[href^='/admin/invoices/']").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")).filter((h) => /^\/admin\/invoices\/[0-9a-f-]{36}$/.test(h)))]);
      let found = null;
      for (const h of hrefs) {
        await pg.goto(BOOKING + h, { timeout: 120_000 });
        await hydrated(pg);
        // a draft's lines are fields Renat edits, so their text is in input values
        const text = await pg.locator("main").evaluate((m) => [m.innerText, ...Array.from(m.querySelectorAll("input, textarea"), (el) => el.value)].join("\n"));
        if (text.includes(A.name)) {
          found = { h, text };
          break;
        }
      }
      must(found, `no draft of ${m} lists «${A.name}» (${hrefs.length} invoices looked at)`);
      for (const p of [B, C]) must(found.text.includes(p.name), `the draft misses «${p.name}»`);
      await office.close();
      return found.h;
    });
  } catch (e) {
    failed = true;
    // a step already said what failed; anything else is printed here
    if (results.at(-1)?.ok !== false) {
      results.push({ name: "between steps", ok: false });
      console.log(`  ✗ between steps — ${e instanceof Error ? e.stack : String(e)}`);
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (KEEP && !failed) {
      console.log(`\nBoth servers keep running (--keep): shop ${SHOP}, booking ${BOOKING}. Ctrl+C stops them.`);
      await new Promise(() => {});
    }
    await booking.stop();
    await shop.stop();
  }

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${failed ? "FAILED" : "PASSED"}: ${ok} of ${results.length} steps.`);
  if (failed) {
    console.log(`Server logs kept in ${tmp} (fake data only).`);
    process.exit(1);
  }
  rmSync(tmp, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
