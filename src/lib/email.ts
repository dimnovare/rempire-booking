/**
 * sendEmail(to, subject, text): one small door for every letter, so the
 * provider can change without touching the callers.
 *
 * Transports, chosen by env only:
 *   RESEND_API_KEY set          ⇒ Resend (EMAIL_FROM is the sender);
 *   EMAIL_TRANSPORT=console     ⇒ printed to the server log, nothing sent;
 *   neither, outside production ⇒ console (a local run);
 *   neither, in production      ⇒ EmailDisabled: callers say «not set up yet».
 *
 * The console transport prints the whole letter, login codes included, so
 * it is never the default in production.
 */

export class EmailDisabled extends Error {
  constructor() {
    super("E-mail is not set up (RESEND_API_KEY).");
  }
}

export type EmailTransport = "resend" | "console" | "disabled";

type Env = Record<string, string | undefined>;

export function emailTransport(env: Env = process.env): EmailTransport {
  if (env.RESEND_API_KEY) return "resend";
  if (env.EMAIL_TRANSPORT === "console") return "console";
  if (env.NODE_ENV !== "production") return "console";
  return "disabled";
}

/** Letters the console transport printed, newest last (tests read it). */
export const sentToConsole: { to: string; subject: string; text: string }[] = [];

export async function sendEmail(to: string, subject: string, text: string, env: Env = process.env): Promise<{ provider: EmailTransport; ref: string | null }> {
  const transport = emailTransport(env);
  if (transport === "disabled") throw new EmailDisabled();
  if (transport === "console") {
    sentToConsole.push({ to, subject, text });
    if (sentToConsole.length > 50) sentToConsole.shift();
    if (env.VITEST !== "true") console.log(`[email:console] to=${to} subject=${JSON.stringify(subject)}\n${text}`);
    return { provider: "console", ref: null };
  }
  // Resend's REST API (https://resend.com/docs/api-reference/emails/send-email).
  // Wired when Dim makes the booking account; untested until then.
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM || "REMPIRE <booking@rempire.ee>", to: [to], subject, text }),
  });
  if (!res.ok) throw new Error(`Resend answered ${res.status}`);
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return { provider: "resend", ref: body.id ?? null };
}
