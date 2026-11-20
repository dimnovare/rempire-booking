/**
 * sendSms(to, text): one small door for every SMS, so the provider can be
 * swapped without touching the callers (Phase A6, docs/phase-a.md).
 *
 * Transports, chosen by env only:
 *   SMS_TRANSPORT=console            ⇒ printed to the server log, nothing sent
 *                                      (wins over everything below);
 *   MESSAGGIO_LOGIN + MESSAGGIO_SENDER ⇒ Messaggio, Renat's own account
 *                                      (decision 30, docs/kickoff.md §8);
 *   neither, outside production      ⇒ console (a local run);
 *   neither, in production           ⇒ SmsDisabled: the outbox leaves SMS
 *                                      rows queued, nothing is lost.
 *
 * Messaggio's HTTP API (its own documentation, «Messaging platform API
 * documentation», and the code samples on messaggio.com/sms-gateway-api/…):
 *   POST https://msg.messaggio.com/api/v1/send, JSON, the project's login in
 *   the header «Messaggio-Login»; body { recipients: [{ phone }], channels:
 *   ["sms"], sms: { from, content: [{ type: "text", text }] }, options:
 *   { external_id } }, the phone in digits without «+». 200 means accepted,
 *   not delivered: { accepted_at, messages: [{ recipient, message_id } or
 *   { recipient, error: { title, detail } }] }. Errors: 400 (validation),
 *   403 (no access), 422 (body unreadable), 500 (repeat the request), with
 *   { title, detail }.
 *
 * How an answer maps onto the outbox's retries (src/lib/outbox.ts):
 *   - accepted, with or without a message id: sent (the id is provider_ref);
 *   - 400, 422, or the number refused in a 200: SmsRejected, which the
 *     outbox marks failed at once: the same request would be refused again;
 *   - anything else (403, 429, 5xx, no answer, the timeout): a plain Error,
 *     retried with the outbox's backoff, then failed after its last try.
 * A timed-out request may still have gone out; a retry may send it twice.
 *
 * The staging test run (src/lib/test-run.ts): until ALLOW_INDEXING=yes, an
 * SMS goes out through Messaggio only to a number in SMS_TEST_TO (the
 * testers' own phones); any other number is printed, as on a local run.
 * Staging's clients are fake, and a fake number may be somebody's.
 */
import { testRun } from "./test-run";

export class SmsDisabled extends Error {
  constructor() {
    super("SMS is not set up (MESSAGGIO_LOGIN, MESSAGGIO_SENDER).");
  }
}

/** The provider refused this message for good: sending it again would not help. */
export class SmsRejected extends Error {
  readonly permanent = true;
}

export type SmsTransport = "messaggio" | "console" | "disabled";

type Env = Record<string, string | undefined>;

export const MESSAGGIO = {
  url: "https://msg.messaggio.com/api/v1/send",
  /** a request this slow is given up and retried by the outbox */
  timeoutMs: 10_000,
};

const filled = (v: string | undefined) => typeof v === "string" && v.trim() !== "";

export function smsTransport(env: Env = process.env): SmsTransport {
  if (env.SMS_TRANSPORT === "console") return "console";
  if (filled(env.MESSAGGIO_LOGIN) && filled(env.MESSAGGIO_SENDER)) return "messaggio";
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

/** The first of these texts that fits one SMS part; the shortest when none does. */
export function oneSmsPart(...candidates: string[]): string {
  const texts = candidates.filter(Boolean);
  return texts.find((t) => smsSegments(t).segments === 1) ?? texts.reduce((a, b) => (smsSegments(b).units < smsSegments(a).units ? b : a), texts[0] ?? "");
}

/** Messages the console transport printed, newest last (tests read it). */
export const sentSms: { to: string; text: string }[] = [];

/** The numbers a staging test run may really text: SMS_TEST_TO, E.164, split by «,» or «;» (spaces inside a number are fine). */
function testNumbers(env: Env): Set<string> {
  return new Set(
    String(env.SMS_TEST_TO ?? "")
      .split(/[,;]+/)
      .map((p) => p.replace(/[^\d+]/g, ""))
      .filter(Boolean),
  );
}

export type SmsSent = { provider: SmsTransport; ref: string | null; segments: number };
export type SmsOptions = {
  /** our own id for the message (the outbox row), sent along as Messaggio's external_id */
  externalId?: string;
};

export async function sendSms(to: string, text: string, env: Env = process.env, opts: SmsOptions = {}): Promise<SmsSent> {
  const transport = smsTransport(env);
  if (transport === "disabled") throw new SmsDisabled();
  const { segments } = smsSegments(text);
  if (transport === "messaggio" && !(testRun(env) && !testNumbers(env).has(to))) {
    return { provider: "messaggio", ref: await sendViaMessaggio(to, text, env, opts), segments };
  }
  sentSms.push({ to, text });
  if (sentSms.length > 50) sentSms.shift();
  if (env.VITEST !== "true") console.log(`[sms:console] to=${to} segments=${segments}\n${text}`);
  return { provider: "console", ref: null, segments };
}

type MessaggioAnswer = {
  title?: unknown;
  detail?: unknown;
  messages?: { message_id?: unknown; error?: { title?: unknown; detail?: unknown } }[];
};

/** The words of a Messaggio error ({ title, detail }), short, for last_error. */
function why(e: { title?: unknown; detail?: unknown } | null | undefined): string {
  const parts = [e?.title, e?.detail].filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return [...new Set(parts)].join(": ").slice(0, 160);
}

/** One SMS through Messaggio; its message id, or null when it said «accepted» without one. */
async function sendViaMessaggio(to: string, text: string, env: Env, opts: SmsOptions): Promise<string | null> {
  const phone = to.replace(/^\+/, "");
  if (!/^[1-9]\d{6,14}$/.test(phone)) throw new SmsRejected("not a phone number");
  const body = {
    recipients: [{ phone }],
    channels: ["sms"],
    sms: { from: String(env.MESSAGGIO_SENDER).trim(), content: [{ type: "text", text }] },
    ...(opts.externalId ? { options: { external_id: opts.externalId } } : {}),
  };
  let res: Response;
  try {
    res = await fetch(MESSAGGIO.url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "Messaggio-Login": String(env.MESSAGGIO_LOGIN).trim() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(MESSAGGIO.timeoutMs),
    });
  } catch (e) {
    // AbortSignal.timeout rejects with a DOMException named «TimeoutError»
    const name = typeof e === "object" && e !== null && "name" in e ? String((e as { name: unknown }).name) : "";
    throw new Error(name === "TimeoutError" || name === "AbortError" ? `Messaggio did not answer in ${MESSAGGIO.timeoutMs / 1000} s` : "Messaggio could not be reached");
  }
  const out = (await res.json().catch(() => null)) as MessaggioAnswer | null;
  if (!res.ok) {
    const words = why(out);
    const line = `Messaggio answered ${res.status}${words ? `: ${words}` : ""}`;
    if (res.status === 400 || res.status === 422) throw new SmsRejected(line);
    throw new Error(line);
  }
  const m = Array.isArray(out?.messages) ? out.messages[0] : undefined;
  if (m && typeof m.message_id === "string" && m.message_id) return m.message_id;
  if (m?.error) throw new SmsRejected(`Messaggio refused the number${why(m.error) ? `: ${why(m.error)}` : ""}`);
  // 200 is «accepted» (its documentation); an answer we cannot read is not a reason to send it again
  return null;
}
