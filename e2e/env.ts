import path from "node:path";

/** The e2e server's port: neither the app's 3400 nor the shop's 3300. */
export const E2E_PORT = Number(process.env.E2E_PORT) || 3420;
const E2E_HOST = "localhost";
export const E2E_URL = `http://${E2E_HOST}:${E2E_PORT}`;
/**
 * The https front of the production build (E2E_PROD=yes, e2e/server.mjs),
 * for the iPhone: there the login cookie is __Host- (Secure), and WebKit
 * keeps no Secure cookie over plain http, not even on localhost.
 */
export const E2E_HTTPS_PORT = Number(process.env.E2E_HTTPS_PORT) || E2E_PORT + 1;
export const E2E_HTTPS_URL = `https://${E2E_HOST}:${E2E_HTTPS_PORT}`;
/** Where e2e/server.mjs writes the server's log (the login codes are in it). */
export const OUT = path.join(__dirname, ".out");
export const SERVER_LOG = path.join(OUT, "server.log");
export const authFile = (who: string) => path.join(OUT, "auth", `${who}.json`);
