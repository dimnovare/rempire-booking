import path from "node:path";

/** The e2e server's port: neither the app's 3400 nor the shop's 3300. */
export const E2E_PORT = Number(process.env.E2E_PORT) || 3420;
/**
 * The e2e server's host name: localhost, or bs-local.com for real phones at
 * BrowserStack (e2e/browserstack.mjs), whose iPhones cannot open localhost
 * through its tunnel. bs-local.com is 127.0.0.1 here too.
 */
export const E2E_HOST = process.env.E2E_HOST || "localhost";
export const E2E_URL = `http://${E2E_HOST}:${E2E_PORT}`;
/** Where e2e/server.mjs writes the server's log (the login codes are in it). */
export const OUT = path.join(__dirname, ".out");
export const SERVER_LOG = path.join(OUT, "server.log");
export const authFile = (who: string) => path.join(OUT, "auth", `${who}.json`);
