/**
 * The kinds of push (B5, docs/phase-b.md) and their words. Pure: the outbox
 * builds the text at send time in the reader's language, from what the row
 * carries; the barber app lists the same kinds as switches.
 *
 * A lock screen is public: the text never carries a client's phone, and a
 * client «name» with three digits in a row (a phone typed as the name) is
 * left out.
 */
import { requestWords, isRequestWhat, type RequestWhat } from "./barber/request-words";
import { INTL, type Locale } from "./i18n";
import { localParts } from "./tz";

/** What a barber gets about his own column. */
export const STAFF_KINDS = ["visit_new", "visit_moved", "visit_cancelled", "day_plan", "request_answer"] as const;
/** What Renat and the front desk get about the salon. */
export const OWNER_KINDS = ["own_online", "own_client", "own_barber", "own_request", "own_plan"] as const;
export type PushKind = (typeof STAFF_KINDS)[number] | (typeof OWNER_KINDS)[number];

/**
 * On until switched off, or off until switched on. Renat's: until he answers
 * question 4 («Уведомления тебе»), the barbers' requests and a barber's
 * cancel or move are on, the rest off (Phase B brief, 17.11.2026).
 */
export const DEFAULT_ON: Record<PushKind, boolean> = {
  visit_new: true,
  visit_moved: true,
  visit_cancelled: true,
  day_plan: true,
  request_answer: true,
  own_online: false,
  own_client: false,
  own_barber: true,
  own_request: true,
  own_plan: false,
};

export const isPushKind = (k: unknown): k is PushKind => typeof k === "string" && k in DEFAULT_ON;

/**
 * The switches a login sees. Renat (or the front desk) with a column of his
 * own (`users.staff_id`) gets his column's too; never «answer to my request»,
 * since he is the one who answers.
 */
export function kindsFor(role: string, ownColumn = false): readonly PushKind[] {
  if (role === "staff") return STAFF_KINDS;
  return ownColumn ? [...STAFF_KINDS.filter((k) => k !== "request_answer"), ...OWNER_KINDS] : OWNER_KINDS;
}

/** Does this login want this kind? `notify` is users.notify. */
export function wants(notify: Record<string, unknown> | null | undefined, kind: PushKind): boolean {
  const v = notify?.[kind];
  return typeof v === "boolean" ? v : DEFAULT_ON[kind];
}

export type PushText = { title: string; body: string; url: string; tag: string };

type Text3 = { ru?: string; et?: string; en?: string };

/** What a visit push row carries (a snapshot at the change). */
export type VisitPayload = {
  visitId: string;
  startsAt: string;
  tz: string;
  client: string;
  services: Text3[];
  staff: string;
  /** moved: where it was */
  fromStart?: string;
  fromStaff?: string;
  /** own_client / own_barber: what happened */
  action?: "moved" | "cancelled";
  /** a barber's emergency cancel */
  reason?: string;
};

export type PlanPayload = {
  date: string;
  tz: string;
  count: number;
  firstAt?: string | null;
  totalCents?: number;
  /** own_plan: «Renat 5, Valentin 4» */
  perStaff?: { name: string; n: number }[];
};

/** own_request: a barber's change, waiting for Renat or applied at once (B4). */
export type RequestPayload = { requestId: string; staff: string; status: "requested" | "applied"; tz: string; what: RequestWhat; visitsInside?: number };
/** request_answer: Renat's yes or no to the barber. */
export type AnswerPayload = { requestId: string; answer: "approved" | "declined"; tz: string; what: RequestWhat; note?: string };

const W = {
  ru: {
    new: "Новая запись",
    moved: "Запись перенесена",
    cancelled: "Запись отменена",
    online: "Онлайн-запись",
    clientMoved: "Клиент перенёс запись",
    clientCancelled: "Клиент отменил запись",
    barberMoved: (s: string) => `${s}: перенос записи`,
    barberCancelled: (s: string) => `${s}: отмена записи`,
    plan: "План на завтра",
    salonPlan: "Завтра в салоне",
    visits: (n: number) => `${n} ${ruPlural(n, "запись", "записи", "записей")}`,
    first: (t: string) => `первая в ${t}`,
    none: "Записей нет.",
    approved: "Запрос согласован",
    declined: "Запрос отклонён",
    client: "Клиент",
    requestFrom: (s: string) => `Запрос: ${s}`,
    changed: (s: string) => `${s}: изменение`,
  },
  et: {
    new: "Uus broneering",
    moved: "Broneering on viidud",
    cancelled: "Broneering on tühistatud",
    online: "Veebibroneering",
    clientMoved: "Klient muutis aega",
    clientCancelled: "Klient tühistas",
    barberMoved: (s: string) => `${s} muutis aega`,
    barberCancelled: (s: string) => `${s} tühistas`,
    plan: "Homne päev",
    salonPlan: "Homme salongis",
    visits: (n: number) => `${n} ${n === 1 ? "broneering" : "broneeringut"}`,
    first: (t: string) => `esimene kell ${t}`,
    none: "Broneeringuid pole.",
    approved: "Taotlus kinnitatud",
    declined: "Taotlus tagasi lükatud",
    client: "Klient",
    requestFrom: (s: string) => `Taotlus: ${s}`,
    changed: (s: string) => `${s}: muudatus`,
  },
  en: {
    new: "New visit",
    moved: "Visit moved",
    cancelled: "Visit cancelled",
    online: "Online booking",
    clientMoved: "A client moved a visit",
    clientCancelled: "A client cancelled",
    barberMoved: (s: string) => `${s}: a visit moved`,
    barberCancelled: (s: string) => `${s}: a visit cancelled`,
    plan: "Tomorrow",
    salonPlan: "Tomorrow at the salon",
    visits: (n: number) => `${n} ${n === 1 ? "visit" : "visits"}`,
    first: (t: string) => `first at ${t}`,
    none: "No visits.",
    approved: "Request approved",
    declined: "Request declined",
    client: "Client",
    requestFrom: (s: string) => `Request: ${s}`,
    changed: (s: string) => `${s}: a change`,
  },
} satisfies Record<Locale, unknown>;

function ruPlural(n: number, one: string, few: string, many: string) {
  const a = n % 10;
  const b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
}

const DIGITS = /\d{3}/;

/** The client as a lock screen may show it. */
export function safeClient(name: string, locale: Locale): string {
  const n = String(name ?? "").trim().replace(/\s+/g, " ");
  return !n || DIGITS.test(n) ? W[locale].client : n.slice(0, 40);
}

/** Free text a barber typed (a cancel reason), with any run of digits that could be a phone taken out. */
export function safeText(s: string, max = 120): string {
  return String(s ?? "")
    .replace(/\+?\d[\d\s().-]{4,}\d/g, "…")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const weekday = new Map<string, Intl.DateTimeFormat>();

/** «ср 18.11, 14:30» on the salon's clock. */
export function when(iso: string, tz: string, locale: Locale): string {
  const ms = Date.parse(iso);
  const p = localParts(ms, tz);
  let f = weekday.get(locale);
  if (!f) {
    f = new Intl.DateTimeFormat(INTL[locale], { weekday: "short", timeZone: "UTC" });
    weekday.set(locale, f);
  }
  const wd = f.format(new Date(`${p.date}T12:00:00Z`)).replace(/\.$/, "");
  return `${wd} ${p.date.slice(8, 10)}.${p.date.slice(5, 7)}, ${p.time}`;
}

const pick3 = (t: Text3, l: Locale) => t?.[l] || t?.ru || t?.et || t?.en || "";

/** The words of one push, or null when the row cannot make any. */
export function pushText(kind: string, payload: Record<string, unknown>, locale: Locale): PushText | null {
  const w = W[locale] ?? W.ru;
  if (kind === "day_plan" || kind === "own_plan") {
    const p = payload as PlanPayload;
    if (!p.date) return null;
    const url = `/b?d=${p.date}`;
    const tag = `${kind}-${p.date}`;
    if (!p.count) return { title: kind === "day_plan" ? w.plan : w.salonPlan, body: w.none, url, tag };
    if (kind === "day_plan") {
      const first = p.firstAt ? `, ${w.first(localParts(Date.parse(p.firstAt), p.tz).time)}` : "";
      const money = p.totalCents ? ` · ${eur(p.totalCents)}` : "";
      return { title: w.plan, body: `${w.visits(p.count)}${first}${money}`, url, tag };
    }
    const per = (p.perStaff ?? []).map((s) => `${s.name} ${s.n}`).join(", ");
    return { title: w.salonPlan, body: `${w.visits(p.count)}${per ? `: ${per}` : ""}`, url: "/admin", tag };
  }
  if (kind === "own_request") {
    const p = payload as RequestPayload;
    if (!isRequestWhat(p.what) || !p.requestId) return null;
    const title = p.status === "applied" ? w.changed(String(p.staff ?? "")) : w.requestFrom(String(p.staff ?? ""));
    const inside = Number.isInteger(p.visitsInside) && p.visitsInside! > 0 ? ` · ${w.visits(p.visitsInside!)}` : "";
    return { title, body: `${requestWords(p.what, p.tz || "Europe/Tallinn", locale)}${inside}`.slice(0, 200), url: "/admin/requests", tag: `req-${p.requestId}` };
  }
  if (kind === "request_answer") {
    const p = payload as AnswerPayload;
    if (!isRequestWhat(p.what) || !p.requestId) return null;
    const note = p.note ? safeText(p.note) : "";
    const body = `${requestWords(p.what, p.tz || "Europe/Tallinn", locale)}${note ? ` · «${note}»` : ""}`;
    return { title: p.answer === "approved" ? w.approved : w.declined, body: body.slice(0, 200), url: "/b/time", tag: `req-${p.requestId}` };
  }
  const p = payload as VisitPayload;
  if (!p.startsAt || !p.visitId) return null;
  const tz = p.tz || "Europe/Tallinn";
  const client = safeClient(p.client, locale);
  const services = (p.services ?? []).map((s) => pick3(s, locale)).filter(Boolean).join(" + ");
  const at = when(p.startsAt, tz, locale);
  const date = localParts(Date.parse(p.startsAt), tz).date;
  const tag = `visit-${p.visitId}`;
  const mine = `/b?d=${date}`;
  const salon = `/admin?d=${date}`;
  const line = [at, client, services].filter(Boolean).join(" · ");
  const moved = p.fromStart ? `${client}: ${when(p.fromStart, tz, locale)} → ${at}` : line;
  switch (kind) {
    case "visit_new":
      return { title: w.new, body: line, url: mine, tag };
    case "visit_moved":
      return { title: w.moved, body: moved, url: mine, tag };
    case "visit_cancelled":
      return { title: w.cancelled, body: line, url: mine, tag };
    case "own_online":
      return { title: w.online, body: `${p.staff} · ${line}`, url: salon, tag };
    case "own_client":
      return p.action === "moved"
        ? { title: w.clientMoved, body: `${p.staff} · ${moved}`, url: salon, tag }
        : { title: w.clientCancelled, body: `${p.staff} · ${line}`, url: salon, tag };
    case "own_barber": {
      const why = p.reason ? safeText(p.reason) : "";
      const reason = why ? ` · «${why}»` : "";
      return p.action === "moved"
        ? { title: w.barberMoved(p.staff), body: moved, url: salon, tag }
        : { title: w.barberCancelled(p.staff), body: `${line}${reason}`, url: salon, tag };
    }
  }
  return null;
}

function eur(cents: number) {
  const e = cents / 100;
  return `${Number.isInteger(e) ? e : e.toFixed(2)} €`;
}
