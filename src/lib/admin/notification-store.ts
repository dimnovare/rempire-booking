/**
 * «Уведомления» with the database: who may open and change it,
 * what its two pages show, and the one save (src/lib/admin/notifications.ts
 * holds the rules, notification-text.ts the SMS words).
 *
 * **Rights.** The catalogue had two rights waiting for this page,
 * «Доступ к разделу SMS-уведомления» (notify.sms) and «… Email-уведомления»
 * (notify.email), in the group «Уведомления»; 033_notification_rights.sql
 * gives both to every login that has «Доступ к настройкам локации»
 * (settings.location), as the brief asked. The third, «Доступ к разделу
 * Типы уведомлений» (notify.types; Dim, round 13), opens the page; a change
 * to a type's SMS needs notify.sms, to its e-mail notify.email, to its push
 * either of them. «SMS, push or both» for the reminder stays «Доступ к
 * системным настройкам» (settings.system), as it was on «Запросы».
 *
 * **One save.** A change is read against the settings as they are, inside
 * a transaction that holds the business row, and only what differs is
 * written (`settings || patch`), with one audit row: entity «business»,
 * action «settings», as the other salon switches write, so «Изменения
 * данных» shows it.
 */
import { can, type Holder } from "../auth/rights";
import type { Business } from "../availability";
import { withTx, type Querier } from "../db";
import { emailTransport } from "../email";
import { LOCALES, type Locale } from "../i18n";
import { EXTRA_MARK } from "../letter-kit";
import { birthdayLetter, noShowLetter, reviewFormUrl, reviewLetter, visitLetter } from "../letters";
import { clientReminderText } from "../outbox";
import { pushConfigured } from "../push";
import { clientPushText, pushText, type PushText } from "../push-kinds";
import { smsTransport } from "../sms";
import { testRun } from "../test-run";
import { addDays, todayIn, zonedToUtc } from "../tz";
import type { VisitView } from "../visits";
import { DEFAULT_SMS, VARS_OF, isSmsType, type SmsValues, type SmsVar } from "./notification-text";
import {
  AT_OPTIONS,
  AT_TYPES,
  EMAIL_TEXT_MAX,
  LEAD_OPTIONS,
  TYPES,
  applyChange,
  atOf,
  channelOn,
  channelsTouched,
  delayOf,
  delayOptions,
  emailText,
  hasEmailText,
  isDelayType,
  isTypeKey,
  offForLogins,
  optionsWith,
  readNotify,
  smsTemplate,
  timing,
  typeDef,
  typeOn,
  type AtType,
  type Audience,
  type NChannel,
  type NotifySettings,
  type Timing,
  type TypeChange,
  type TypeKey,
} from "./notifications";

type Env = Record<string, string | undefined>;

/* ---------- rights ---------- */

export type NotifyMay = { open: boolean; sms: boolean; email: boolean; push: boolean; system: boolean };

export function notifyMay(user: Holder | null | undefined): NotifyMay {
  // «Доступ к разделу Типы уведомлений» is the door (Dim, round 13); each channel needs its own right on top
  const open = can(user, "notify.types");
  const sms = open && can(user, "notify.sms");
  const email = open && can(user, "notify.email");
  return { open, sms, email, push: sms || email, system: can(user, "settings.system") };
}

/** May this login make this change? Each channel it touches by its own right; the reminder's «SMS, push or both» by «Доступ к системным настройкам». */
export function mayChange(may: NotifyMay, type: TypeKey, c: TypeChange): boolean {
  if (!may.open) return false;
  if (c.mode !== undefined && !may.system) return false;
  return channelsTouched(type, c).every((ch) => may[ch]);
}

/** May he change anything of this type at all (its switch on the list)? */
const mayType = (may: NotifyMay, type: TypeKey) => typeDef(type).channels.every((ch) => may[ch]);

/* ---------- the save ---------- */

export type SaveResult = { ok: true; changed: string[] } | { ok: false; field: string };

/** What the audit row names for a change, before and after, by the keys «Изменения данных» knows. */
const AUDIT_KEY: Record<string, string> = {
  on: "on",
  "channel.sms": "channel_sms",
  "channel.email": "channel_email",
  "channel.push": "channel_push",
  "lead.sms": "reminder_min",
  "lead.email": "reminder_email_min",
  at: "at",
  delay: "delay",
  mode: "client_reminder",
  sms: "sms_text",
  email: "email_text",
};

function auditValue(ns: NotifySettings, type: TypeKey, what: string): unknown {
  if (what === "on") return typeOn(ns, type);
  if (what.startsWith("channel.")) return channelOn(ns, type, what.slice(8) as NChannel);
  if (what === "lead.sms") return ns.base.reminder_min;
  if (what === "lead.email") return ns.base.reminder_email_min;
  if (what === "at") return atOf(ns, type as AtType);
  if (what === "delay") return isDelayType(type) ? delayOf(ns, type) : null;
  if (what === "mode") return ns.base.client_reminder;
  if (what === "sms") return isSmsType(type) ? smsTemplate(ns, type) : null;
  if (what === "email") return emailText(ns, type);
  return null;
}

/**
 * One type's change from the page. Refused whole when the login may not
 * make it or a value is not of its kind (by the field's name); a change
 * that changes nothing writes nothing.
 *
 * A new SMS lead is the business's for new bookings (reminder_min) and is
 * written into every visit still to come that has the reminder on, so
 * their reminders not sent yet move at the outbox's next run.
 */
export async function saveType(business: Pick<Business, "id">, user: Holder & { id: string }, type: string, c: TypeChange, now = Date.now()): Promise<SaveResult> {
  if (!isTypeKey(type)) return { ok: false, field: "type" };
  if (!mayChange(notifyMay(user), type, c)) return { ok: false, field: "forbidden" };
  return withTx(async (tx) => {
    const [row] = await tx<{ settings: unknown }>("select settings from businesses where id = $1 for update", [business.id]);
    if (!row) return { ok: false, field: "business" };
    const r = applyChange(row.settings, type, c);
    if (!r.ok) return r;
    if (!r.changed.length) return { ok: true, changed: [] };
    await tx("update businesses set settings = coalesce(settings, '{}'::jsonb) || $2::jsonb where id = $1", [business.id, JSON.stringify(r.patch)]);
    if (r.changed.includes("lead.sms"))
      await tx(
        "update appointments set reminder_min = $2 where business_id = $1 and reminder_min is not null and status in ('booked', 'pending') and starts_at > $3",
        [business.id, r.patch.reminder_min, new Date(now)],
      );
    const was = readNotify(row.settings);
    const next = readNotify({ ...((row.settings ?? {}) as object), ...r.patch });
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = { notification: type };
    for (const what of r.changed) {
      before[AUDIT_KEY[what] ?? what] = auditValue(was, type, what);
      after[AUDIT_KEY[what] ?? what] = auditValue(next, type, what);
    }
    await tx("insert into audit (actor, entity, entity_id, action, before, after) values ($1, 'business', $2, 'settings', $3::jsonb, $4::jsonb)", [
      user.id,
      business.id,
      JSON.stringify(before),
      JSON.stringify(after),
    ]);
    return { ok: true, changed: r.changed };
  });
}

/* ---------- what the pages show ---------- */

export type ChannelRow = { ch: NChannel; on: boolean; timing: Timing };

export type TypeRow = {
  key: TypeKey;
  audience: Audience;
  on: boolean;
  channels: ChannelRow[];
  /** the login may switch it */
  may: boolean;
  /** a staff push each login has off until he switches it on («Ещё» → «Уведомления») */
  loginsOff: boolean;
};

function rowOf(ns: NotifySettings, may: NotifyMay, key: TypeKey): TypeRow {
  const def = typeDef(key);
  return {
    key,
    audience: def.audience,
    on: typeOn(ns, key),
    // the reminder by push goes only when the salon offers it (client_reminder not «SMS only»)
    channels: def.channels.map((ch) => ({ ch, on: channelOn(ns, key, ch) && !(key === "reminder" && ch === "push" && ns.base.client_reminder === "sms"), timing: timing(ns, key, ch) })),
    may: mayType(may, key),
    loginsOff: offForLogins(key),
  };
}

export async function loadNotify(q: Querier, businessId: string): Promise<NotifySettings> {
  const [b] = await q<{ settings: unknown }>("select settings from businesses where id = $1", [businessId]);
  return readNotify(b?.settings);
}

/** «Типы уведомлений»: every type, in the order of the board. */
export function typeRows(ns: NotifySettings, may: NotifyMay): TypeRow[] {
  return TYPES.map((t) => rowOf(ns, may, t.key));
}

export type Transport = { ch: NChannel; state: "live" | "console" | "off"; from: string };

/**
 * «Каналы отправки»: how each channel goes from this deployment, by its env
 * (the names only are in the code: MESSAGGIO_LOGIN and MESSAGGIO_SENDER,
 * RESEND_API_KEY and EMAIL_FROM, VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY).
 * `from` is what a client sees as the sender; no key is ever shown.
 */
export function transports(env: Env = process.env): { list: Transport[]; testRun: boolean } {
  const sms = smsTransport(env);
  const email = emailTransport(env);
  return {
    list: [
      { ch: "sms", state: sms === "messaggio" ? "live" : sms === "console" ? "console" : "off", from: sms === "messaggio" ? String(env.MESSAGGIO_SENDER ?? "").trim() : "" },
      { ch: "email", state: email === "resend" ? "live" : email === "console" ? "console" : "off", from: email === "resend" ? String(env.EMAIL_FROM ?? "").trim() : "" },
      { ch: "push", state: pushConfigured(env) ? "live" : "off", from: "" },
    ],
    testRun: testRun(env),
  };
}

export type TypeDetail = TypeRow & {
  rights: NotifyMay;
  /** the reminder's leads and what the page offers */
  lead?: { sms: number; email: number; options: number[]; emailOptions: number[] };
  at?: { value: string; options: string[] };
  delay?: { value: number; options: number[] };
  mode?: string;
  sms?: { template: string | null; standard: string; vars: readonly SmsVar[] };
  /** «Дополнительная информация в Email»: the salon's text in this type's letter ("" none) */
  email?: { text: string; max: number };
};

/** One type's page: its switches, timing and SMS text as they are now. */
export function typeDetail(ns: NotifySettings, may: NotifyMay, key: TypeKey): TypeDetail {
  const row = rowOf(ns, may, key);
  const out: TypeDetail = { ...row, rights: may };
  if (key === "reminder") {
    const sms = ns.base.reminder_min;
    const email = ns.base.reminder_email_min;
    out.lead = { sms, email, options: optionsWith([...LEAD_OPTIONS], sms), emailOptions: optionsWith([...LEAD_OPTIONS], email) };
    out.mode = ns.base.client_reminder;
  }
  if ((AT_TYPES as readonly string[]).includes(key)) {
    const t = key as AtType;
    out.at = { value: atOf(ns, t), options: optionsWith([...AT_OPTIONS[t]], atOf(ns, t)) };
  }
  if (isDelayType(key)) out.delay = { value: delayOf(ns, key), options: optionsWith([...delayOptions(key)], delayOf(ns, key)) };
  if (isSmsType(key)) out.sms = { template: smsTemplate(ns, key), standard: DEFAULT_SMS[key], vars: VARS_OF[key] };
  if (hasEmailText(key)) out.email = { text: emailText(ns, key) ?? "", max: EMAIL_TEXT_MAX };
  return out;
}

/**
 * The made-up visit the previews show: the salon's own name and address,
 * its first barber and service, tomorrow at 14:30, «Demo client» and links
 * of the shape the messages carry. Nothing of a real client.
 */
export type Sample = {
  values: SmsValues;
  /** the reminder's {link}: a visit's short change link */
  visitLink: string;
  /** the birthday's and the invitation's {link}: the booking page, as the SMS is in English */
  bookLink: string;
  /** the review request's {link}: the salon's page at its review card */
  reviewLink: string;
  staff: string;
  service: { ru: string; et: string; en: string; cents: number; min: number };
  address: string;
  /** the salon's number and site, as the letters show them */
  phone: string;
  website: string;
  day: string;
  startsAt: string;
  tz: string;
};

export async function loadSample(q: Querier, business: Pick<Business, "id" | "name" | "timezone">, origin: string, now = Date.now()): Promise<Sample> {
  const [loc] = await q<{ address: string; timezone: string; phone: string; website: string }>(
    "select address, timezone, phone, website from locations where business_id = $1 and active order by sort, name limit 1",
    [business.id],
  );
  const [st] = await q<{ name: string }>("select display_name as name from staff where business_id = $1 and active order by sort, display_name limit 1", [business.id]);
  const [sv] = await q<{ name: Record<string, string> | null; price_cents: number; duration_min: number }>(
    "select name, price_cents, duration_min from services where business_id = $1 and active order by sort, slug limit 1",
    [business.id],
  );
  const tz = loc?.timezone || business.timezone || "Europe/Tallinn";
  const n = sv?.name ?? {};
  const service = { ru: n.ru || n.en || n.et || "", et: n.et || n.en || n.ru || "", en: n.en || n.ru || n.et || "", cents: sv?.price_cents ?? 0, min: sv?.duration_min ?? 45 };
  const staff = st?.name || "Jevgeni";
  const address = loc?.address ?? "";
  // tomorrow at 14:30 on the salon's clock
  const day = addDays(todayIn(tz, now), 1);
  const startsAt = new Date(zonedToUtc(day, "14:30", tz)).toISOString();
  const [, m, d] = day.split("-");
  const visitLink = `${origin}/v/k3Fq9xT2mB7pW4sZ`;
  return {
    values: { salon: business.name || "REMPIRE", master: staff, address, client: "Demo client", service: service.en, date: `${d}.${m}`, time: "14:30", link: visitLink },
    visitLink,
    bookLink: `${origin}/en`,
    reviewLink: reviewFormUrl(origin, "en"),
    staff,
    service,
    address,
    phone: loc?.phone ?? "",
    website: loc?.website ?? "",
    day,
    startsAt,
    tz,
  };
}

export type LetterPreview = { subject: string; html: string };
export type Previews = { email: Partial<Record<Locale, LetterPreview>>; push: Partial<Record<Locale, PushText>> };

/**
 * A type's letter and push in each language, made by the same functions
 * that make the real ones (src/lib/letters.ts, push-kinds.ts, outbox.ts)
 * from the made-up visit. The SMS is drawn in the browser, as it is typed;
 * so is the letter's own text: each letter carries EXTRA_MARK where it
 * goes, and the page puts the text being typed in its place.
 */
export function previews(type: TypeKey, s: Sample, business: Pick<Business, "name" | "timezone" | "settings">, origin: string): Previews {
  const def = typeDef(type);
  const out: Previews = { email: {}, push: {} };
  const start = Date.parse(s.startsAt);
  const iso = (ms: number) => new Date(ms).toISOString();
  for (const locale of LOCALES) {
    const visit: VisitView = {
      id: "00000000-0000-4000-8000-000000000000",
      status: "booked",
      startsAt: s.startsAt,
      endsAt: iso(start + s.service.min * 60_000),
      totalCents: s.service.cents,
      extraCents: 0,
      staffId: "00000000-0000-4000-8000-000000000001",
      staffName: s.staff,
      anyStaff: false,
      clientName: "Demo client",
      locale,
      reminder: true,
      services: [{ serviceId: "00000000-0000-4000-8000-000000000002", name: { ru: s.service.ru, et: s.service.et, en: s.service.en }, durationMin: s.service.min, priceCents: s.service.cents }],
      location: { name: business.name, address: s.address, phone: s.phone, website: s.website },
    };
    const extra = EXTRA_MARK;
    const o = { business, origin, token: "k3Fq9xT2mB7pW4sZk3Fq9xT2mB7pW4sZ", locale, extra };
    if (def.channels.includes("email")) {
      const letter =
        type === "no_show"
          ? noShowLetter(visit, { business, origin, locale, extra })
          : type === "review_request"
            ? reviewLetter(visit, { business, origin, locale, extra })
            : type === "birthday"
              ? birthdayLetter({ locale, origin, business, address: s.address, extra })
            : visitLetter(type === "moved" ? "moved" : type === "cancelled" ? "cancelled" : type === "confirmation" ? "confirmation" : "reminder", visit, type === "moved" ? { ...o, from: { startsAt: iso(start - 24 * 3600_000) } } : o);
      out.email[locale] = { subject: letter.subject, html: letter.html };
    }
    if (def.channels.includes("push")) {
      const p = pushOf(type, s, business.name, locale);
      if (p) out.push[locale] = p;
    }
  }
  return out;
}

function pushOf(type: TypeKey, s: Sample, salon: string, locale: Locale): PushText | null {
  const start = Date.parse(s.startsAt);
  if (type === "reminder") return clientReminderText({ locale, payload: { startsAt: s.startsAt, staff: s.staff, business: salon, address: s.address, tz: s.tz }, appointment_id: null }, "/v/k3Fq9xT2mB7pW4sZ");
  if (type === "birthday") return clientPushText("birthday", { business: salon, date: s.day }, locale);
  if (type === "no_show") return clientPushText("no_show", { business: salon, startsAt: s.startsAt, tz: s.tz, visitId: null }, locale);
  if (type === "review_request") return clientPushText("review_request", { business: salon, startsAt: s.startsAt, tz: s.tz, visitId: null }, locale);
  if (type === "own_review") return pushText(type, { reviewId: "x", rating: 5, staff: s.staff }, locale);
  if (type === "day_plan") return pushText(type, { date: s.day, tz: s.tz, count: 6, firstAt: s.startsAt, totalCents: 6 * s.service.cents }, locale);
  if (type === "own_plan") return pushText(type, { date: s.day, tz: s.tz, count: 6, perStaff: [{ name: s.staff, n: 6 }] }, locale);
  const off = { kind: "time_off", action: "add", offKind: "vacation", from: start + 7 * 24 * 3600_000, to: start + 13 * 24 * 3600_000 };
  if (type === "own_request") return pushText(type, { requestId: "x", staff: s.staff, status: "requested", tz: s.tz, what: off }, locale);
  if (type === "request_answer") return pushText(type, { requestId: "x", answer: "approved", tz: s.tz, what: off }, locale);
  const visit = {
    visitId: "x",
    startsAt: s.startsAt,
    tz: s.tz,
    client: "Demo client",
    services: [{ ru: s.service.ru, et: s.service.et, en: s.service.en }],
    staff: s.staff,
    ...(type === "visit_moved" ? { fromStart: new Date(start - 3600_000).toISOString() } : {}),
    ...(type === "own_client" || type === "own_barber" ? { action: "cancelled" } : {}),
  };
  return pushText(type, visit, locale);
}
