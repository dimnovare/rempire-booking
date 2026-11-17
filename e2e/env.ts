import path from "node:path";

/** The e2e server's port: neither the app's 3400 nor the shop's 3300. */
export const E2E_PORT = Number(process.env.E2E_PORT) || 3420;
export const E2E_URL = `http://localhost:${E2E_PORT}`;
/** Where e2e/server.mjs writes the server's log (the login codes are in it). */
export const OUT = path.join(__dirname, ".out");
export const SERVER_LOG = path.join(OUT, "server.log");
export const authFile = (who: string) => path.join(OUT, "auth", `${who}.json`);
