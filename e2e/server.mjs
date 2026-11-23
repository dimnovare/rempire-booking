/**
 * The e2e server (playwright.config.ts starts it): `next dev`, or `next
 * start` with E2E_PROD=yes, on an in-memory database with the demo data and
 * the demo logins at example.test. Letters and SMS are only printed. Its
 * output goes to e2e/.out/server.log, where e2e/helpers.ts reads the login
 * codes; nothing in it is real.
 */
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const out = path.join(here, ".out");
mkdirSync(out, { recursive: true });
rmSync(path.join(out, "auth"), { recursive: true, force: true });
const log = createWriteStream(path.join(out, "server.log"), { flags: "w" });

const port = process.env.E2E_PORT || "3420";
const prod = process.env.E2E_PROD === "yes";
const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
// E2E_VAPID=yes: a key pair made here and now and kept nowhere, so the
// pages that offer notifications can be looked at (e2e/app.spec.ts). No test
// subscribes a phone with it, so nothing is ever sent.
const vapid = process.env.E2E_VAPID === "yes" ? (await import("web-push")).default.generateVAPIDKeys() : null;

const env = {
  ...process.env,
  DB_DRIVER: "pglite",
  SEED_DEMO: "yes",
  DEMO_LOGINS: "yes",
  // free times and fixed data: never staging's generated visits (tools/seed-demo.mjs)
  SEED_BUSY: "",
  EMAIL_TRANSPORT: "console",
  SMS_TRANSPORT: "console",
  // Blank on purpose: `next dev` also reads .env.development.local, and a
  // key set there would win over EMAIL_TRANSPORT=console (src/lib/email.ts)
  // or call the live shop. Next never fills a variable that is already set,
  // even to "", so these stay off whatever the local files hold.
  RESEND_API_KEY: "",
  EMAIL_FROM: "",
  RESEND_WEBHOOK_SECRET: "",
  TEST_MAIL_TO: "",
  MESSAGGIO_LOGIN: "",
  MESSAGGIO_SENDER: "",
  SMS_TEST_TO: "",
  SHOP_API_URL: "",
  SHOP_API_SECRET: "",
  SHOP_SALES: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  CRON_SECRET: "",
  // «Найти» in «Контакты» answers from src/lib/geocode.ts itself: the e2e server never calls OpenStreetMap's geocoder
  GEOCODER: "fake",
  // no push keys: the e2e server must never call a push service
  VAPID_PUBLIC_KEY: vapid?.publicKey ?? "",
  VAPID_PRIVATE_KEY: vapid?.privateKey ?? "",
  VAPID_SUBJECT: "",
  DATABASE_URL: "",
  NEXT_TELEMETRY_DISABLED: "1",
  // `next start` refuses some local conveniences without it; staging rules stay on
  ...(prod ? { NODE_ENV: "production" } : {}),
};

// E2E_HOST=bs-local.com (e2e/browserstack.mjs): `next dev` serves its own
// scripts only to the host it was started with, besides localhost
const host = process.env.E2E_HOST && process.env.E2E_HOST !== "localhost" ? ["--hostname", process.env.E2E_HOST] : [];
const child = spawn(process.execPath, [next, prod ? "start" : "dev", "--port", port, ...host], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
child.stdout.pipe(log);
child.stderr.pipe(log);
child.stderr.pipe(process.stderr);
const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", stop);
child.on("exit", (code) => process.exit(code ?? 0));
