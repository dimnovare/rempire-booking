/**
 * sendSms(to, text): one small door for every SMS, so the provider can be
 * chosen later without touching the callers (Phase A6, docs/phase-a.md).
 *
 * Transports, chosen by env only:
 *   SMS_TRANSPORT=console       ⇒ printed to the server log, nothing sent;
 *   outside production          ⇒ console (a local run);
 *   in production               ⇒ SmsDisabled until a provider is wired.
 *
 * No provider is called yet. When Dim picks one, add it here behind its own
 * env vars (names only in .env.example) and keep the console transport for
 * local runs. The outbox leaves SMS rows queued while this says «disabled»,
 * so nothing is lost before then.
 */

export class SmsDisabled extends Error {
  constructor() {
    super("SMS is not set up (no provider yet).");
  }
}

export type SmsTransport = "console" | "disabled";

type Env = Record<string, string | undefined>;

export function smsTransport(env: Env = process.env): SmsTransport {
  if (env.SMS_TRANSPORT === "console") return "console";
  if (env.NODE_ENV !== "production") return "console";
  return "disabled";
}

// GSM 03.38: the basic set costs one septet, the extension set two. Anything
// else (Cyrillic, õ, š, ž, emoji) turns the whole message into UCS-2.
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€\f";

/** How a text is encoded and how many SMS parts it is billed as. */
export function smsSegments(text: string): { encoding: "gsm7" | "ucs2"; units: number; segments: number } {
  let septets = 0;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) septets += 1;
    else if (GSM_EXT.includes(ch)) septets += 2;
    else {
      const units = text.length; // UTF-16 code units, as the network counts them
      return { encoding: "ucs2", units, segments: units <= 70 ? 1 : Math.ceil(units / 67) };
    }
  }
  return { encoding: "gsm7", units: septets, segments: septets <= 160 ? 1 : Math.ceil(septets / 153) };
}

/** Messages the console transport printed, newest last (tests read it). */
export const sentSms: { to: string; text: string }[] = [];

export async function sendSms(
  to: string,
  text: string,
  env: Env = process.env,
): Promise<{ provider: SmsTransport; ref: string | null; segments: number }> {
  const transport = smsTransport(env);
  if (transport === "disabled") throw new SmsDisabled();
  const { segments } = smsSegments(text);
  sentSms.push({ to, text });
  if (sentSms.length > 50) sentSms.shift();
  if (env.VITEST !== "true") console.log(`[sms:console] to=${to} segments=${segments}\n${text}`);
  return { provider: "console", ref: null, segments };
}
