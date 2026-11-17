/**
 * sendEmail(to, subject, body): one small door for every letter, so the
 * provider can change without touching the callers. `body` is plain text,
 * or { text, html, attachments }: the HTML comes from src/lib/letters.ts,
 * and the text part always goes along for clients that show no HTML.
 *
 * Transports, chosen by env only:
 *   RESEND_API_KEY + EMAIL_FROM ⇒ Resend; EMAIL_FROM must be on a domain
 *                                 verified in that Resend account;
 *   EMAIL_TRANSPORT=console     ⇒ printed to the server log, nothing sent;
 *   neither, outside production ⇒ console (a local run);
 *   neither, in production      ⇒ EmailDisabled: callers say «not set up yet»
 *                                 (a key without EMAIL_FROM counts as neither).
 *
 * The console transport prints the text part, login codes included, so it
 * is never the default in production.
 */

export class EmailDisabled extends Error {
  constructor() {
    super("E-mail is not set up (RESEND_API_KEY).");
  }
}

export type EmailTransport = "resend" | "console" | "disabled";

/** A file sent along: a text one such as the visit's .ics, or bytes such as an invoice PDF (Phase C). */
export type Attachment = { filename: string; content: string | Uint8Array; contentType: string };
export type LetterBody = { text: string; html?: string; attachments?: Attachment[] };

type Env = Record<string, string | undefined>;

export function emailTransport(env: Env = process.env): EmailTransport {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) return "resend";
  if (env.EMAIL_TRANSPORT === "console") return "console";
  if (env.NODE_ENV !== "production") return "console";
  return "disabled";
}

/** Letters the console transport printed, newest last (tests read it). */
export const sentToConsole: ({ to: string; subject: string } & LetterBody)[] = [];

export async function sendEmail(
  to: string,
  subject: string,
  body: string | LetterBody,
  env: Env = process.env,
): Promise<{ provider: EmailTransport; ref: string | null }> {
  const letter: LetterBody = typeof body === "string" ? { text: body } : body;
  const transport = emailTransport(env);
  if (transport === "disabled") throw new EmailDisabled();
  if (transport === "console") {
    sentToConsole.push({ to, subject, ...letter });
    if (sentToConsole.length > 50) sentToConsole.shift();
    if (env.VITEST !== "true") {
      const extra = [letter.html ? "html" : "", ...(letter.attachments ?? []).map((a) => a.filename)].filter(Boolean).join(", ");
      console.log(`[email:console] to=${to} subject=${JSON.stringify(subject)}${extra ? ` (+ ${extra})` : ""}\n${letter.text}`);
    }
    return { provider: "console", ref: null };
  }
  // Resend's REST API (https://resend.com/docs/api-reference/emails/send-email).
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject,
      text: letter.text,
      ...(letter.html ? { html: letter.html } : {}),
      ...(letter.attachments?.length
        ? {
            attachments: letter.attachments.map((a) => ({
              filename: a.filename,
              content: (typeof a.content === "string" ? Buffer.from(a.content, "utf8") : Buffer.from(a.content)).toString("base64"),
              content_type: a.contentType,
            })),
          }
        : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend answered ${res.status}`);
  const out = (await res.json().catch(() => ({}))) as { id?: string };
  return { provider: "resend", ref: out.id ?? null };
}
