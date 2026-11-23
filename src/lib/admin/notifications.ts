/**
 * «Уведомления» (Dim, decision page round 11): every message
 * the system sends by itself, grouped by who gets it, with the salon's
 * switch, channels, timing and SMS text for each. The page is
 * src/app/admin/(app)/notifications/; the senders
 * (src/lib/outbox.ts) ask here at send time.
 *
 * **Where the settings live: businesses.settings, one place.** What was a
 * setting before stays where it was, so nothing reads a second copy:
 *   reminder_min        the SMS reminder's lead (src/lib/settings.ts): each visit
 *                       keeps the one it was booked with (appointments.
 *                       reminder_min); a change here is written into the
 *                       visits to come too (notification-store.ts)
 *   reminder_email_min  the e-mail reminder's lead
 *   email_reminder_on   the reminder by e-mail on or off
 *   birthday_on         the birthday greeting on or off
 *   no_show_on          the invitation after a missed visit on or off
 *   client_reminder     the reminder by SMS, by push, or both (moved here
 *                       from «Запросы»)
 * Everything new is one object under the key `notifications`:
 *   off    the types and the channels of a type that are off:
 *          «confirmation», «reminder.sms», «own_barber» …
 *   on     the types that are off until switched on (OFF_BY_DEFAULT,
 *          today «review_request») and are switched on
 *   sms    the salon's own SMS text per type (notification-text.ts)
 *   at     the hour of a daily message: birthday, day_plan, own_plan
 *   delay  minutes after the event: no_show, review_request
 *   email  the salon's own text in a client's letter, per type
 *          («Дополнительная информация в Email», as Altegio has it; Dim,
 *          round 13): plain text, shown under the visit's details in
 *          every language of that letter (src/lib/letter-kit.ts extraBlock)
 * **Nothing stored is today's behaviour, exactly**: every reader falls back
 * to the default below, which is what the code did before the page.
 *
 * Which messages have a switch here: the client's seven (the kinds of
 * src/lib/client-notify.ts), the salon's six and the barbers' five push
 * kinds (src/lib/push-kinds.ts). Round 13 (Dim) added two: the request
 * for a review after a visit («Запрос отзыва после визита»: off, as at
 * REMPIRE today; 3 hours after) and the salon's push about a new review. Not switchable, so not listed as types: a
 * login code, an invoice letter, a message written on a client's card and
 * a mass message (somebody sends each of those by hand).
 *
 * A staff push has two switches: the salon's here (off: nobody gets it) and
 * each login's own in «Ещё» → «Уведомления» (users.notify, with its
 * default per kind, DEFAULT_ON). Both must be on.
 *
 * Pure: no database and no Next.js; the page's browser code reads it too.
 */
import { DEFAULT_ON } from "../push-kinds";
import { isReminderChannel, readSettings, type BusinessSettings, type ReminderChannel } from "../settings";
import { checkTemplate, isSmsType, SMS_TYPES, type SmsType } from "./notification-text";

export type NChannel = "sms" | "email" | "push";
export const N_CHANNELS: readonly NChannel[] = ["sms", "email", "push"];
export const isNChannel = (v: unknown): v is NChannel => v === "sms" || v === "email" || v === "push";

/** Who gets it: the client, the salon (Renat and the front desk), a barber. */
export type Audience = "client" | "salon" | "staff";
export const AUDIENCES: readonly Audience[] = ["client", "salon", "staff"];

export const TYPE_KEYS = [
  // the client's, in the board's order
  "reminder",
  "confirmation",
  "moved",
  "cancelled",
  "birthday",
  "no_show",
  "review_request",
  // the salon's
  "own_online",
  "own_client",
  "own_barber",
  "own_request",
  "own_review",
  "own_plan",
  // a barber's
  "visit_new",
  "visit_moved",
  "visit_cancelled",
  "day_plan",
  "request_answer",
] as const;
export type TypeKey = (typeof TYPE_KEYS)[number];
export const isTypeKey = (v: unknown): v is TypeKey => typeof v === "string" && (TYPE_KEYS as readonly string[]).includes(v);

/** The types with an hour of the day («в 10:00») and the one with a delay after the event. */
export const AT_TYPES = ["birthday", "day_plan", "own_plan"] as const;
export type AtType = (typeof AT_TYPES)[number];
const isAtType = (t: string): t is AtType => (AT_TYPES as readonly string[]).includes(t);
/** The types that go so many minutes after their event. */
export const DELAY_TYPES = ["no_show", "review_request"] as const;
export type DelayType = (typeof DELAY_TYPES)[number];
export const isDelayType = (t: string): t is DelayType => (DELAY_TYPES as readonly string[]).includes(t);
/**
 * The types that are off until the salon switches them on: the review
 * request, switched off at REMPIRE in the tool we follow (Dim, round 13).
 * Every other type is on until switched off.
 */
export const OFF_BY_DEFAULT: readonly TypeKey[] = ["review_request"];
const offByDefault = (t: string) => (OFF_BY_DEFAULT as readonly string[]).includes(t);

export type TypeDef = {
  key: TypeKey;
  audience: Audience;
  /** the channels it goes by, in the order the page shows them */
  channels: readonly NChannel[];
  /** the outbox kind of each channel (notifications.kind) */
  kinds: Partial<Record<NChannel, string>>;
};

const push1 = (key: TypeKey, audience: Audience): TypeDef => ({ key, audience, channels: ["push"], kinds: { push: key } });

export const TYPES: readonly TypeDef[] = [
  { key: "reminder", audience: "client", channels: ["sms", "email", "push"], kinds: { sms: "reminder", email: "reminder_email", push: "client_reminder" } },
  { key: "confirmation", audience: "client", channels: ["email"], kinds: { email: "confirmation" } },
  { key: "moved", audience: "client", channels: ["email"], kinds: { email: "moved" } },
  { key: "cancelled", audience: "client", channels: ["email"], kinds: { email: "cancelled" } },
  { key: "birthday", audience: "client", channels: ["email", "push", "sms"], kinds: { email: "birthday", push: "birthday", sms: "birthday" } },
  { key: "no_show", audience: "client", channels: ["email", "push", "sms"], kinds: { email: "no_show", push: "no_show", sms: "no_show" } },
  { key: "review_request", audience: "client", channels: ["email", "push", "sms"], kinds: { email: "review_request", push: "review_request", sms: "review_request" } },
  push1("own_online", "salon"),
  push1("own_client", "salon"),
  push1("own_barber", "salon"),
  push1("own_request", "salon"),
  push1("own_review", "salon"),
  push1("own_plan", "salon"),
  push1("visit_new", "staff"),
  push1("visit_moved", "staff"),
  push1("visit_cancelled", "staff"),
  push1("day_plan", "staff"),
  push1("request_answer", "staff"),
];

const BY_KEY = new Map<string, TypeDef>(TYPES.map((t) => [t.key, t]));
export const typeDef = (key: TypeKey): TypeDef => BY_KEY.get(key)!;

/** The client's types that go by letter: each may carry the salon's own text («Дополнительная информация в Email»). */
export const EMAIL_TEXT_TYPES: readonly TypeKey[] = TYPES.filter((t) => t.audience === "client" && t.channels.includes("email")).map((t) => t.key);
export const hasEmailText = (type: TypeKey): boolean => EMAIL_TEXT_TYPES.includes(type);
/** The longest text a letter takes, in characters. */
export const EMAIL_TEXT_MAX = 1000;

/**
 * The salon's text as it is kept: line ends made one, control characters
 * out, at most one blank line in a row, trimmed. Empty: no text (null).
 * Refused when too long or not a text.
 */
export function cleanEmailText(v: unknown): { ok: true; value: string | null } | { ok: false; code: "long" | "kind" } {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false, code: "kind" };
  const t = v
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if ([...t].length > EMAIL_TEXT_MAX) return { ok: false, code: "long" };
  return { ok: true, value: t || null };
}

/** The type an outbox row of this kind belongs to; undefined for a kind with no switch here. */
export function typeOfKind(kind: string): TypeKey | undefined {
  if (kind === "reminder_email" || kind === "client_reminder") return "reminder";
  return isTypeKey(kind) ? kind : undefined;
}

/** Defaults: today's behaviour. src/lib/outbox.ts takes its hours and delays from here. */
export const NOTIFY_DEFAULTS = {
  at: { birthday: "10:00", day_plan: "20:00", own_plan: "20:00" } as Record<AtType, string>,
  /** «Не пришёл» → the invitation, this much later: a mis-tap put right sends nothing */
  noShowDelayMin: 2,
  /** a «moved» letter waits this long, so quick moves make one letter (src/lib/booking.ts) */
  movedDelayMin: 2,
  /** the birthday SMS waits this long for the letter or the notification */
  birthdaySmsAfterMin: 40,
  /** a visit marked «Пришёл» → the request for a review, this long after its end (the tool's 3 h) */
  reviewDelayMin: 180,
  /** the review request's SMS waits this long for the letter or the notification, as the birthday's */
  reviewSmsAfterMin: 40,
};

/** What the page offers. A value stored by other means is offered too (optionsWith). */
export const LEAD_OPTIONS = [30, 60, 120, 180, 240, 360, 720, 1440, 2880] as const;
export const AT_OPTIONS: Record<AtType, readonly string[]> = {
  birthday: ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
  day_plan: ["17:00", "18:00", "19:00", "20:00", "21:00", "22:00"],
  own_plan: ["17:00", "18:00", "19:00", "20:00", "21:00", "22:00"],
};
export const DELAY_OPTIONS = [2, 30, 60, 180, 1440] as const;
/** The review request's: from an hour after the visit to the next day. */
export const REVIEW_DELAY_OPTIONS = [60, 120, 180, 360, 720, 1440] as const;
export const delayOptions = (t: DelayType): readonly number[] => (t === "review_request" ? REVIEW_DELAY_OPTIONS : DELAY_OPTIONS);

/** A lead within what src/lib/settings.ts takes for reminder_min and reminder_email_min. */
export const LEAD_LIMITS = [15, 48 * 60] as const;
/** An hour of a daily message, on the salon's clock. */
const AT_RE = /^(?:0[6-9]|1\d|2[0-3]):[0-5]\d$/;
export const DELAY_LIMITS = [1, 3 * 24 * 60] as const;

export function optionsWith<T extends string | number>(options: readonly T[], current: T): T[] {
  return options.includes(current) ? [...options] : [...options, current].sort((a, b) => (typeof a === "number" ? (a as number) - (b as number) : String(a).localeCompare(String(b))));
}

/* ---------- what is stored ---------- */

export type Stored = {
  off: string[];
  /** the types of OFF_BY_DEFAULT that are switched on */
  on: string[];
  sms: Partial<Record<SmsType, string>>;
  at: Partial<Record<AtType, string>>;
  delay: Partial<Record<DelayType, number>>;
  email: Partial<Record<TypeKey, string>>;
};

const OFF_KEYS = new Set<string>([...TYPES.map((t) => t.key as string), ...TYPES.flatMap((t) => t.channels.map((c) => `${t.key}.${c}`))]);
/** Kept elsewhere (the flat keys above, or `on`), so never in `off`. */
const NOT_IN_OFF = new Set<string>(["birthday", "no_show", "reminder.email", ...OFF_BY_DEFAULT]);

/** The `notifications` object as it may be stored: known keys only, each value of its kind. */
export function cleanStored(raw: unknown): Stored {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const off = Array.isArray(o.off) ? [...new Set(o.off.map(String))].filter((k) => OFF_KEYS.has(k) && !NOT_IN_OFF.has(k)).sort() : [];
  const on = Array.isArray(o.on) ? [...new Set(o.on.map(String))].filter(offByDefault).sort() : [];
  const sms: Stored["sms"] = {};
  const rawSms = (o.sms && typeof o.sms === "object" ? o.sms : {}) as Record<string, unknown>;
  for (const t of SMS_TYPES) {
    const c = typeof rawSms[t] === "string" ? checkTemplate(t, rawSms[t]) : null;
    if (c?.ok && c.value) sms[t] = c.value;
  }
  const at: Stored["at"] = {};
  const rawAt = (o.at && typeof o.at === "object" ? o.at : {}) as Record<string, unknown>;
  for (const t of AT_TYPES) if (typeof rawAt[t] === "string" && AT_RE.test(rawAt[t] as string)) at[t] = rawAt[t] as string;
  const delay: Stored["delay"] = {};
  const rawDelay = (o.delay && typeof o.delay === "object" ? o.delay : {}) as Record<string, unknown>;
  for (const t of DELAY_TYPES) {
    const d = rawDelay[t];
    if (typeof d === "number" && Number.isInteger(d) && d >= DELAY_LIMITS[0] && d <= DELAY_LIMITS[1]) delay[t] = d;
  }
  const email: Stored["email"] = {};
  const rawEmail = (o.email && typeof o.email === "object" ? o.email : {}) as Record<string, unknown>;
  for (const t of EMAIL_TEXT_TYPES) {
    const c = cleanEmailText(rawEmail[t]);
    if (c.ok && c.value) email[t] = c.value;
  }
  return { off, on, sms, at, delay, email };
}

/* ---------- what is in force ---------- */

export type NotifySettings = {
  /** the business's settings as src/lib/settings.ts reads them */
  base: BusinessSettings;
  stored: Stored;
};

/** businesses.settings as stored → what is in force. */
export function readNotify(raw: unknown): NotifySettings {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return { base: readSettings(o), stored: cleanStored(o.notifications) };
}

/** Is the type on? The birthday and the invitation keep their switch of 20.11 (birthday_on, no_show_on). */
export function typeOn(ns: NotifySettings, type: TypeKey): boolean {
  if (type === "birthday") return ns.base.birthday_on;
  if (type === "no_show") return ns.base.no_show_on;
  if (offByDefault(type)) return ns.stored.on.includes(type);
  return !ns.stored.off.includes(type);
}

/** Is this channel of the type on, by itself? The e-mail reminder keeps its switch of 20.11 (email_reminder_on). */
export function channelOn(ns: NotifySettings, type: TypeKey, channel: NChannel): boolean {
  if (!typeDef(type).channels.includes(channel)) return false;
  if (type === "reminder" && channel === "email") return ns.base.email_reminder_on;
  return !ns.stored.off.includes(`${type}.${channel}`);
}

/**
 * Does the salon send this type by this channel? The type and the channel
 * on; the reminder by push also not set to «SMS only» (client_reminder).
 * Each client's own switches (src/lib/client-notify.ts) and each login's
 * (users.notify) still decide for him on top.
 */
export function sends(ns: NotifySettings, type: TypeKey, channel: NChannel): boolean {
  if (!typeOn(ns, type) || !channelOn(ns, type, channel)) return false;
  if (type === "reminder" && channel === "push") return ns.base.client_reminder !== "sms";
  return true;
}

/** The same by an outbox row's kind; a kind with no switch here (a login code, an invoice, a written message) always goes. */
export function sendsKind(ns: NotifySettings, kind: string, channel: NChannel): boolean {
  const t = typeOfKind(kind);
  return t ? sends(ns, t, channel) : true;
}

/** The hour of a daily message. */
export const atOf = (ns: NotifySettings, type: AtType): string => ns.stored.at[type] ?? NOTIFY_DEFAULTS.at[type];
/** How long after «Не пришёл» the invitation goes. */
export const noShowDelay = (ns: NotifySettings): number => ns.stored.delay.no_show ?? NOTIFY_DEFAULTS.noShowDelayMin;
/** How long after the visit's end the review request goes. */
export const reviewDelay = (ns: NotifySettings): number => ns.stored.delay.review_request ?? NOTIFY_DEFAULTS.reviewDelayMin;
/** A delay type's delay in force, and the one nothing stored gives. */
export const delayOf = (ns: NotifySettings, type: DelayType): number => (type === "review_request" ? reviewDelay(ns) : noShowDelay(ns));
const delayDefault = (type: DelayType): number => (type === "review_request" ? NOTIFY_DEFAULTS.reviewDelayMin : NOTIFY_DEFAULTS.noShowDelayMin);
/** The salon's own SMS text of a type, or null: the standard one. */
export const smsTemplate = (ns: NotifySettings, type: SmsType): string | null => ns.stored.sms[type] ?? null;
/** The salon's own text in this type's letter, or null. */
export const emailText = (ns: NotifySettings, type: TypeKey): string | null => ns.stored.email[type] ?? null;

/** When one channel of a type goes. */
export type Timing =
  | { kind: "now" }
  /** before the visit */
  | { kind: "lead"; min: number }
  /** the reminder by push: a minute before the SMS's time */
  | { kind: "withSms"; min: number }
  /** after the event */
  | { kind: "delay"; min: number }
  /** at an hour of the day */
  | { kind: "at"; time: string }
  /** the birthday SMS: so much after the hour, only if the letter and the push did not go */
  | { kind: "fallback"; time: string; min: number }
  /** the review request's SMS: `after` minutes after the others' delay, only if the letter and the push did not go */
  | { kind: "delayFallback"; min: number; after: number };

export function timing(ns: NotifySettings, type: TypeKey, channel: NChannel): Timing {
  switch (type) {
    case "reminder":
      if (channel === "email") return { kind: "lead", min: ns.base.reminder_email_min };
      if (channel === "push") return { kind: "withSms", min: ns.base.reminder_min };
      return { kind: "lead", min: ns.base.reminder_min };
    case "moved":
      return { kind: "delay", min: NOTIFY_DEFAULTS.movedDelayMin };
    case "birthday":
      return channel === "sms" ? { kind: "fallback", time: atOf(ns, "birthday"), min: NOTIFY_DEFAULTS.birthdaySmsAfterMin } : { kind: "at", time: atOf(ns, "birthday") };
    case "no_show":
      return { kind: "delay", min: noShowDelay(ns) };
    case "review_request":
      return channel === "sms" ? { kind: "delayFallback", min: reviewDelay(ns), after: NOTIFY_DEFAULTS.reviewSmsAfterMin } : { kind: "delay", min: reviewDelay(ns) };
    case "day_plan":
    case "own_plan":
      return { kind: "at", time: atOf(ns, type) };
    default:
      return { kind: "now" };
  }
}

/** A staff push that each login has off until he switches it on (Renat, 18.11.2026). */
export const offForLogins = (type: TypeKey): boolean => type in DEFAULT_ON && DEFAULT_ON[type as keyof typeof DEFAULT_ON] === false;

/* ---------- a change from the page ---------- */

/** What the type's page saves; every field may be left out. */
export type TypeChange = {
  on?: boolean;
  channels?: Partial<Record<NChannel, boolean>>;
  /** the reminder's leads, minutes */
  lead?: { sms?: number; email?: number };
  /** birthday, day_plan, own_plan: «HH:MM» */
  at?: string;
  /** no_show, review_request: minutes */
  delay?: number;
  /** the reminder: SMS, push or both (src/lib/settings.ts client_reminder) */
  mode?: ReminderChannel;
  /** the salon's own SMS text; null or the standard text: the standard one */
  sms?: string | null;
  /** the salon's own text in the letter («Дополнительная информация в Email»); null or empty: none */
  email?: string | null;
};

export type ChangeResult =
  | { ok: true; patch: Record<string, unknown>; changed: string[] }
  | { ok: false; field: string };

/** The channels a change touches (whose rights it needs); `mode` is «Доступ к системным настройкам» too. */
export function channelsTouched(type: TypeKey, c: TypeChange): NChannel[] {
  const def = typeDef(type);
  const out = new Set<NChannel>();
  if (c.on !== undefined || c.at !== undefined || c.delay !== undefined) def.channels.forEach((ch) => out.add(ch));
  for (const ch of N_CHANNELS) if (c.channels?.[ch] !== undefined) out.add(ch);
  if (c.lead?.sms !== undefined) out.add("sms");
  if (c.lead?.email !== undefined) out.add("email");
  if (c.mode !== undefined) out.add("push");
  if (c.sms !== undefined) out.add("sms");
  if (c.email !== undefined) out.add("email");
  return N_CHANNELS.filter((ch) => out.has(ch));
}

const whole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/**
 * A change to one type as a patch of businesses.settings: the flat keys it
 * sets and, when it touches them, the whole `notifications` object. Only
 * what differs from what is in force goes into the patch, so a save that
 * changes nothing writes nothing. Anything that is not of its kind is
 * refused by its field's name.
 */
export function applyChange(raw: unknown, type: TypeKey, c: TypeChange): ChangeResult {
  const def = typeDef(type);
  const ns = readNotify(raw);
  const flat: Record<string, unknown> = {};
  const next: Stored = { off: [...ns.stored.off], on: [...ns.stored.on], sms: { ...ns.stored.sms }, at: { ...ns.stored.at }, delay: { ...ns.stored.delay }, email: { ...ns.stored.email } };
  const changed: string[] = [];
  const setOff = (key: string, on: boolean) => {
    const has = next.off.includes(key);
    if (on && has) next.off = next.off.filter((k) => k !== key);
    if (!on && !has) next.off = [...next.off, key].sort();
  };

  if (c.on !== undefined) {
    if (typeof c.on !== "boolean") return { ok: false, field: "on" };
    if (c.on !== typeOn(ns, type)) {
      changed.push("on");
      if (type === "birthday") flat.birthday_on = c.on;
      else if (type === "no_show") flat.no_show_on = c.on;
      else if (offByDefault(type)) next.on = c.on ? [...next.on, type].sort() : next.on.filter((k) => k !== type);
      else setOff(type, c.on);
    }
  }
  for (const ch of N_CHANNELS) {
    const v = c.channels?.[ch];
    if (v === undefined) continue;
    if (typeof v !== "boolean" || !def.channels.includes(ch) || def.channels.length < 2) return { ok: false, field: `channel.${ch}` };
    if (v === channelOn(ns, type, ch)) continue;
    changed.push(`channel.${ch}`);
    if (type === "reminder" && ch === "email") flat.email_reminder_on = v;
    else setOff(`${type}.${ch}`, v);
  }
  if (c.lead !== undefined) {
    if (type !== "reminder" || !c.lead || typeof c.lead !== "object") return { ok: false, field: "lead" };
    for (const ch of ["sms", "email"] as const) {
      const v = c.lead[ch];
      if (v === undefined) continue;
      if (!whole(v) || v < LEAD_LIMITS[0] || v > LEAD_LIMITS[1]) return { ok: false, field: `lead.${ch}` };
      // what the page showed: the lead new visits are booked with, or the e-mail's
      const shown = ch === "sms" ? ns.base.reminder_min : ns.base.reminder_email_min;
      if (v === shown) continue;
      flat[ch === "sms" ? "reminder_min" : "reminder_email_min"] = v;
      changed.push(`lead.${ch}`);
    }
  }
  if (c.at !== undefined) {
    if (!isAtType(type) || typeof c.at !== "string" || !AT_RE.test(c.at)) return { ok: false, field: "at" };
    if (c.at !== atOf(ns, type)) {
      if (c.at === NOTIFY_DEFAULTS.at[type]) delete next.at[type];
      else next.at[type] = c.at;
      changed.push("at");
    }
  }
  if (c.delay !== undefined) {
    if (!isDelayType(type) || !whole(c.delay) || c.delay < DELAY_LIMITS[0] || c.delay > DELAY_LIMITS[1]) return { ok: false, field: "delay" };
    if (c.delay !== delayOf(ns, type)) {
      if (c.delay === delayDefault(type)) delete next.delay[type];
      else next.delay[type] = c.delay;
      changed.push("delay");
    }
  }
  if (c.mode !== undefined) {
    if (type !== "reminder" || !isReminderChannel(c.mode)) return { ok: false, field: "mode" };
    if (c.mode !== ns.base.client_reminder) {
      flat.client_reminder = c.mode;
      changed.push("mode");
    }
  }
  if (c.sms !== undefined) {
    if (!isSmsType(type)) return { ok: false, field: "sms" };
    let value: string | null = null;
    if (c.sms !== null) {
      const t = checkTemplate(type, c.sms);
      if (!t.ok) return { ok: false, field: t.code === "unknown" ? `sms.unknown.${t.token}` : `sms.${t.code}` };
      value = t.value;
    }
    if (value !== smsTemplate(ns, type)) {
      if (value === null) delete next.sms[type];
      else next.sms[type] = value;
      changed.push("sms");
    }
  }
  if (c.email !== undefined) {
    if (!hasEmailText(type)) return { ok: false, field: "email" };
    const t = cleanEmailText(c.email);
    if (!t.ok) return { ok: false, field: `email.${t.code}` };
    if (t.value !== emailText(ns, type)) {
      if (t.value === null) delete next.email[type];
      else next.email[type] = t.value;
      changed.push("email");
    }
  }
  const patch: Record<string, unknown> = { ...flat };
  if (JSON.stringify(cleanStored(next)) !== JSON.stringify(ns.stored)) patch.notifications = cleanStored(next);
  return { ok: true, patch, changed };
}
