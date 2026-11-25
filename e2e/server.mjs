/**
 * The e2e server (playwright.config.ts starts it): `next dev`, or `next
 * start` with E2E_PROD=yes, on an in-memory database with the demo data and
 * the demo logins at example.test. Letters and SMS are only printed. Its
 * output goes to e2e/.out/server.log, where e2e/helpers.ts reads the login
 * codes; nothing in it is real.
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
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
// E2E_SPLIT=yes: the two addresses (docs/launch.md B3) on this one server, for
// e2e/hosts.spec.ts: 127.0.0.1 is the client address, localhost (where
// e2e/auth.setup.ts logs in) the staff one. Otherwise one address, as on
// staging today: a STAFF_URL in a local .env file never splits a run.
const splitRun = process.env.E2E_SPLIT === "yes";
const split = splitRun ? { SITE_URL: `http://127.0.0.1:${port}`, STAFF_URL: `http://localhost:${port}` } : { STAFF_URL: "" };
// Self-hosted, Next takes http://<--hostname, else localhost>:<port> as every
// request's own address and turns a redirect to that origin into a relative
// one, so a redirect from 127.0.0.1 to localhost would stay on 127.0.0.1
// (on Vercel the two hosts are real and this never happens). "::" binds
// what the default binds, every address, and is neither test host.
const hostArgs = splitRun ? ["--hostname", "::"] : [];

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
  ...split,
  NEXT_TELEMETRY_DISABLED: "1",
  // `next start` refuses some local conveniences without it; staging rules stay on
  ...(prod ? { NODE_ENV: "production" } : {}),
};

const child = spawn(process.execPath, [next, prod ? "start" : "dev", "--port", port, ...hostArgs], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
if (prod) httpsFront();
child.stdout.pipe(log);
child.stderr.pipe(log);
child.stderr.pipe(process.stderr);
const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", stop);
child.on("exit", (code) => process.exit(code ?? 0));

/**
 * E2E_PROD=yes: an https front on E2E_HTTPS_PORT (E2E_PORT + 1) as well,
 * for the iPhone (playwright.config.ts). In production the login cookie is
 * __Host- (Secure), and WebKit keeps no Secure cookie over plain http, not
 * even on localhost. It passes every request on to `next start` as it came,
 * Host included (the server actions compare it with Origin), and says
 * https. The certificate is made here and now by openssl, for this machine's
 * names only, kept in e2e/.out and nowhere else; the iPhone project accepts
 * it (ignoreHTTPSErrors). Android stays on plain http, as before.
 */
function httpsFront() {
  const httpsPort = Number(process.env.E2E_HTTPS_PORT) || Number(port) + 1;
  const dir = path.join(out, "tls");
  mkdirSync(dir, { recursive: true });
  const keyFile = path.join(dir, "key.pem");
  const certFile = path.join(dir, "cert.pem");
  const made = spawnSync(
    "openssl",
    ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certFile, "-days", "2", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  if (made.error || made.status !== 0) {
    console.error(`E2E_PROD=yes needs openssl on PATH (Git for Windows has one) for the iPhone's https front: ${made.error?.message ?? made.stderr}`);
    process.exit(1);
  }
  const front = https.createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, (req, res) => {
    const up = http.request(
      {
        host: "127.0.0.1",
        port: Number(port),
        method: req.method,
        path: req.url,
        headers: { ...req.headers, "x-forwarded-proto": "https", "x-forwarded-port": String(httpsPort) },
      },
      (answer) => {
        const headers = { ...answer.headers };
        delete headers.connection;
        delete headers["keep-alive"];
        res.writeHead(answer.statusCode ?? 502, answer.statusMessage, headers);
        answer.pipe(res);
      },
    );
    up.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.on("aborted", () => up.destroy());
    req.pipe(up);
  });
  front.on("error", (err) => {
    console.error(`the https front on ${httpsPort} did not start: ${err.message}`);
    process.exit(1);
  });
  front.listen(httpsPort, () => log.write(`https front on ${httpsPort} -> ${port}\n`));
  process.on("exit", () => front.close());
}
