import { mkdirSync } from "node:fs";
import path from "node:path";
import { test as setup } from "@playwright/test";
import { authFile } from "./env";
import { loginByCode } from "./helpers";

/** One login each for the whole run, by e-mail code as on a phone. */
// boss: an owner who cuts too, as Renat does (tools/seed-demo.mjs)
for (const who of ["owner", "boss", "valentin", "jevgeni"]) {
  setup(`log in ${who}`, async ({ page }) => {
    await loginByCode(page, `${who}@example.test`);
    mkdirSync(path.dirname(authFile(who)), { recursive: true });
    await page.context().storageState({ path: authFile(who) });
  });
}
