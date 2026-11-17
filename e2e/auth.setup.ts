import { mkdirSync } from "node:fs";
import path from "node:path";
import { test as setup } from "@playwright/test";
import { authFile } from "./env";
import { loginByCode } from "./helpers";

/** One login each for the whole run, by e-mail code as on a phone. */
for (const who of ["owner", "valentin", "jevgeni"]) {
  setup(`log in ${who}`, async ({ page }) => {
    await loginByCode(page, `${who}@example.test`);
    mkdirSync(path.dirname(authFile(who)), { recursive: true });
    await page.context().storageState({ path: authFile(who) });
  });
}
