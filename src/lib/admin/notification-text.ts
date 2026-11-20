/**
 * The SMS we write ourselves, as words (decision 30, docs/kickoff.md: in
 * English for everyone and one part): the reminder before a visit, the
 * birthday greeting and the invitation after a missed visit.
 *
 * Two ways to the words of one SMS:
 *   - the standard text, exactly today's: each drops what it can spare
 *     (the address first) until it fits one part (`standardSms`);
 *   - the salon's own text from «Настройки → Уведомления», with variables
 *     such as {time} filled in (`renderSms`). It is sent as written: the
 *     page shows its characters and parts while it is typed.
 * No stored text is the standard one. The outbox (src/lib/outbox.ts) builds
 * the words at send time; the settings page shows the same words live.
 *
 * Pure: no database and no Next.js, so the browser runs it too.
 */
import { oneSmsPart, smsSegments } from "../sms";

export { smsSegments };

export const SMS_TYPES = ["reminder", "birthday", "no_show"] as const;
export type SmsType = (typeof SMS_TYPES)[number];
export const isSmsType = (v: unknown): v is SmsType => typeof v === "string" && (SMS_TYPES as readonly string[]).includes(v);

/** What a text may name, as {name}. */
export const SMS_VARS = ["time", "date", "master", "service", "client", "salon", "address", "link"] as const;
export type SmsVar = (typeof SMS_VARS)[number];
export type SmsValues = Partial<Record<SmsVar, string>>;

/**
 * The variables each SMS knows when it goes. The reminder's {link} is the
 * visit's own short change link; the other two link the booking page.
 */
export const VARS_OF: Record<SmsType, readonly SmsVar[]> = {
  reminder: ["time", "date", "master", "service", "client", "salon", "address", "link"],
  birthday: ["client", "salon", "link"],
  no_show: ["date", "time", "master", "client", "salon", "link"],
};

/** The standard texts as the page shows them: today's words with every part in. */
export const DEFAULT_SMS: Record<SmsType, string> = {
  reminder: "{salon}: reminder of your visit on {date} at {time} with {master}. {address}. Change or cancel: {link}",
  birthday: "Happy birthday from {salon}! Wishing you a great year ahead. Book your next visit: {link}",
  no_show: "{salon}: we missed you on {date} at {time}. Book a new time: {link}",
};

/** A salon's own text is at most this long (four parts in GSM-7). */
export const TEMPLATE_MAX = 600;

/**
 * Today's words, exactly as the outbox wrote them before the settings page:
 * the first of the texts that fits one part (src/lib/sms.ts, oneSmsPart).
 * `salon` falls back to REMPIRE; a reminder or an invitation without its
 * date and time is null.
 */
export function standardSms(type: SmsType, v: SmsValues): string | null {
  const name = v.salon || "REMPIRE";
  const link = v.link ?? "";
  if (type === "reminder") {
    if (!v.date || !v.time) return null;
    const bare = `${name}: reminder of your visit on ${v.date} at ${v.time}`;
    const head = `${bare}${v.master ? ` with ${v.master}` : ""}.`;
    const place = v.address ? ` ${v.address}.` : "";
    const tail = link ? ` Change or cancel: ${link}` : "";
    return oneSmsPart(`${head}${place}${tail}`, `${head}${tail}`, `${bare}.${tail}`, `${head}${place}`, head, `${bare}.`);
  }
  if (type === "birthday") {
    const head = `Happy birthday from ${name}! Wishing you a great year ahead.`;
    return oneSmsPart(link ? `${head} Book your next visit: ${link}` : "", head);
  }
  if (!v.date || !v.time) return null;
  const head = `${name}: we missed you on ${v.date} at ${v.time}.`;
  return oneSmsPart(link ? `${head} Book a new time: ${link}` : "", head);
}

const TOKEN = /\{([a-z_]+)\}/g;

/**
 * A salon's own text with its variables filled in. A variable with nothing
 * to say (a visit without an address) leaves no gap: «with Jevgeni. .
 * Change» keeps one full stop, the space before a full stop or a comma
 * goes, and so do double spaces.
 */
export function renderSms(template: string, v: SmsValues): string {
  const filled = template.replace(TOKEN, (m, name: string) => ((SMS_VARS as readonly string[]).includes(name) ? (v[name as SmsVar] ?? "") : m));
  return filled
    .replace(/([.,;:])[ \t]+(?=[.,;:])/g, "")
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/** The words of one SMS: the salon's own text when it has one, else the standard. */
export function smsWords(type: SmsType, v: SmsValues, template: string | null | undefined): string | null {
  if (template) return renderSms(template, v);
  return standardSms(type, v);
}

/** The variables a text names, in order, each once. */
export function tokensIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TOKEN)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

export type TemplateCheck = { ok: true; value: string | null } | { ok: false; code: "empty" | "long" | "unknown"; token?: string };

/**
 * A text as the page sends it: its line ends made plain and its ends
 * trimmed. Empty, too long or naming a variable this SMS does not know is
 * refused; the standard text itself is «no text of its own» (null).
 */
export function checkTemplate(type: SmsType, raw: unknown): TemplateCheck {
  const text = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!text) return { ok: false, code: "empty" };
  if (text.length > TEMPLATE_MAX) return { ok: false, code: "long" };
  const unknown = tokensIn(text).find((t) => !(VARS_OF[type] as readonly string[]).includes(t));
  if (unknown) return { ok: false, code: "unknown", token: unknown };
  return { ok: true, value: text === DEFAULT_SMS[type] ? null : text };
}

/** Characters, the limit of one part and the parts, as the page shows them under the text. */
export function smsCount(text: string): { chars: number; limit: number; parts: number; unicode: boolean } {
  const s = smsSegments(text);
  const unicode = s.encoding === "ucs2";
  const one = unicode ? 70 : 160;
  const many = unicode ? 67 : 153;
  return { chars: s.units, limit: s.segments <= 1 ? one : s.segments * many, parts: Math.max(1, s.segments), unicode };
}
