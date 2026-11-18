/**
 * The staging test run (docs/test-run.md): Renat and the barbers use
 * staging on their own phones, with the live shop's products, before the
 * move to rempire.ee.
 *
 * One switch says «this is not the real thing yet»: the same one that keeps
 * staging out of search engines (src/lib/indexing.ts). Until
 * ALLOW_INDEXING=yes is set at the move, every one of these is on:
 *
 *   - the «Тестовая версия» line on every page (src/components/test-banner.tsx);
 *   - the mail guard (mailGuard below, used by src/lib/outbox.ts);
 *   - TEST-… invoice numbers from a counter of their own, and the «ТЕСТ /
 *     NÄIDIS» stamp on every PDF (src/lib/billing/);
 *   - «Сообщить о проблеме» (src/lib/problem-reports.ts).
 *
 * The shop link has its own switch, SHOP_SALES (src/lib/sales.ts): reading
 * the live shop's products is fine on staging, selling into it is not.
 */
import type { Querier } from "./db";
import { indexingAllowed } from "./indexing";

type Env = Record<string, string | undefined>;

export function testRun(env: Env = process.env): boolean {
  return !indexingAllowed(env);
}

/** Where a staging letter goes when its real reader is not on the staff (docs/accounts.md). */
export const TEST_INBOX = "rempireshopinfo@gmail.com";

export const TEST_NUMBER_PREFIX = "TEST-";

/**
 * Who a letter really goes to on staging. Login codes never come through
 * here (they go straight to the person, src/lib/auth/login.ts).
 *   - A staff login's own address (a barber, Renat, the front desk): as is,
 *     the subject marked «[ТЕСТ]».
 *   - Anyone else (a client, a company on an invoice): to the shop inbox,
 *     with who it was for in the subject and on the first line.
 * In production it changes nothing.
 */
export async function mailGuard(
  q: Querier,
  to: string,
  subject: string,
  text: string,
  env: Env = process.env,
): Promise<{ to: string; subject: string; text: string; redirected: boolean }> {
  if (!testRun(env)) return { to, subject, text, redirected: false };
  const addr = to.trim().toLowerCase();
  const [staff] = addr ? await q("select 1 from users where email = $1 and active", [addr]) : [];
  if (staff) return { to, subject: `[ТЕСТ] ${subject}`, text, redirected: false };
  const inbox = (env.TEST_MAIL_TO ?? "").trim() || TEST_INBOX;
  return {
    to: inbox,
    subject: `[ТЕСТ → ${addr || "?"}] ${subject}`,
    text: `Тестовая версия: это письмо было для ${addr || "?"}. Оно пришло сюда, а не к нему.\n\n${text}`,
    redirected: true,
  };
}
