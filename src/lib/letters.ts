/**
 * The letters, in REMPIRE's look (docs/brand.md): a black page, white text,
 * lime (#e9fc53) only for the one thing to do, square edges, uppercase
 * headings with wide spacing, a 2 px lime rule left of the key line.
 *
 * Written for mail clients, not browsers: tables and inline styles, no web
 * fonts (Questrial where installed, else Helvetica or Arial), no SVG (the
 * logo is the PNG the app serves), a hidden preheader, and a plain-text
 * part with the same words. Every value from the database goes through
 * esc(); links are built here from the app's own address.
 */
import type { Business } from "./availability";
import type { Attachment, LetterBody } from "./email";
import { COPY, INTL, eur, pick, type Locale } from "./i18n";
import { visitIcsFor } from "./ics";
import { localParts } from "./tz";
import type { VisitView } from "./visits";

export type Letter = LetterBody & { subject: string; html: string };

const INK = "#000000";
const FG = "#ffffff";
const LIME = "#e9fc53";
const LINE = "#262624";
const LINE2 = "#3b3c36";
const SOFT = "#b4b4ac";
const DIM = "#86867f";
const FONT = "Questrial, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'SF Mono', SFMono-Regular, Menlo, Consolas, 'Courier New', monospace";

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

// ---- pieces: each one is a <tr> of the 520 px column ----------------------

const PX = "padding-left:36px;padding-right:36px;";

function eyebrow(text: string) {
  return `<tr><td class="px" style="${PX}padding-bottom:10px;font:700 12px/16px ${FONT};letter-spacing:3px;text-transform:uppercase;color:${LIME};">${esc(text)}</td></tr>`;
}

function heading(text: string) {
  return `<tr><td class="px h1" style="${PX}padding-bottom:22px;font:700 28px/34px ${FONT};letter-spacing:3px;text-transform:uppercase;color:${FG};">${esc(text)}</td></tr>`;
}

/** The one line that matters (the code, the time), behind the lime rule. */
function keyLine(inner: string, style = `font:20px/28px ${FONT};color:${FG};`) {
  return `<tr><td class="px" style="${PX}padding-bottom:24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:2px solid ${LIME};padding:4px 0 4px 18px;${style}">${inner}</td></tr></table></td></tr>`;
}

function para(html: string, color = FG, size = 16) {
  return `<tr><td class="px" style="${PX}padding-bottom:14px;font:${size}px/${Math.round(size * 1.5)}px ${FONT};color:${color};">${html}</td></tr>`;
}

/** Label over value, one per row, a thin rule between: reads well at 320 px. */
function details(rows: [label: string, valueHtml: string][]) {
  const cells = rows
    .map(
      ([k, v], i) =>
        `<tr><td style="padding:12px 0;${i ? `border-top:1px solid ${LINE};` : ""}"><div style="font:700 11px/16px ${FONT};letter-spacing:2px;text-transform:uppercase;color:${DIM};padding-bottom:3px;">${esc(k)}</div><div style="font:16px/24px ${FONT};color:${FG};">${v}</div></td></tr>`,
    )
    .join("");
  return `<tr><td class="px" style="${PX}padding-bottom:22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${LINE2};border-bottom:1px solid ${LINE2};">${cells}</table></td></tr>`;
}

/** A full-width square button; `main` is lime, the other is outlined. */
function button(href: string, label: string, main: boolean) {
  const cell = main ? `background-color:${LIME};border:1px solid ${LIME};` : `border:1px solid ${LINE2};`;
  return `<tr><td class="px" style="${PX}padding-bottom:12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center"${main ? ` bgcolor="${LIME}"` : ""} style="${cell}"><a href="${esc(href)}" style="display:block;padding:15px 20px;font:700 14px/18px ${FONT};letter-spacing:2px;text-transform:uppercase;text-align:center;text-decoration:none;color:${main ? INK : FG};">${esc(label)}</a></td></tr></table></td></tr>`;
}

function layout(o: { lang: Locale; title: string; preheader: string; origin: string; body: string; footer: string[] }): string {
  const logo = `${o.origin}/brand/rempire-logo-white.png`;
  // the preheader is followed by invisible padding so the inbox preview shows nothing else
  const pad = "&#847;&zwnj;&nbsp;".repeat(60);
  return `<!doctype html>
<html lang="${o.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(o.title)}</title>
<style>
@media (max-width: 540px) { .px { padding-left: 22px !important; padding-right: 22px !important; } .h1 { font-size: 24px !important; line-height: 30px !important; } }
a { color: ${LIME}; }
</style>
</head>
<body style="margin:0;padding:0;background-color:${INK};color:${FG};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${INK};">${esc(o.preheader)}${pad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${INK}" style="background-color:${INK};">
<tr><td align="center" style="padding:28px 0 44px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr><td class="px" style="${PX}padding-top:8px;padding-bottom:36px;"><img src="${esc(logo)}" width="132" height="32" alt="REMPIRE" style="display:block;border:0;outline:none;width:132px;height:auto;font:700 20px/32px ${FONT};letter-spacing:4px;color:${FG};"></td></tr>
${o.body}
<tr><td class="px" style="${PX}padding-top:30px;"><div style="border-top:1px solid ${LINE};font-size:0;line-height:0;">&nbsp;</div></td></tr>
${o.footer.map((f, i) => `<tr><td class="px" style="${PX}padding-top:${i ? 4 : 16}px;font:13px/20px ${FONT};color:${DIM};">${f}</td></tr>`).join("\n")}
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ---- the staff login code (A4) ------------------------------------------

export function loginCodeLetter(code: string, ttlMin: number, origin: string): Letter {
  const subject = `${code} — код для входа в REMPIRE`;
  const text = [
    `Код для входа в REMPIRE: ${code}`,
    "",
    `Действует ${ttlMin} минут, один раз.`,
    "Если вы не запрашивали код, просто удалите это письмо.",
    "",
    `Your REMPIRE login code: ${code} (valid for ${ttlMin} minutes, once).`,
  ].join("\n");
  const body = [
    eyebrow("Вход для команды"),
    heading("Ваш код"),
    keyLine(esc(code), `font:700 40px/48px ${MONO};letter-spacing:10px;color:${FG};`),
    para(`Введите его на странице входа. Код действует ${ttlMin}&nbsp;минут и&nbsp;подходит один раз.`),
    para("Если вы не запрашивали код, просто удалите это письмо.", SOFT),
    para(`Your REMPIRE login code. Valid for ${ttlMin} minutes, once.`, DIM, 13),
  ].join("\n");
  const html = layout({
    lang: "ru",
    title: subject,
    preheader: `Действует ${ttlMin} минут.`,
    origin,
    body,
    footer: ["REMPIRE · Tallinn", "Письмо отправлено автоматически, отвечать на него не нужно."],
  });
  return { subject, text, html };
}

// ---- the booking confirmation (A6) --------------------------------------

type ConfirmCopy = {
  subject: (day: string, time: string) => string;
  eyebrow: string;
  hello: string;
  services: string;
  cutoff: (span: string) => string;
  call: (phone: string) => string;
  why: string;
  hours: (h: number) => string;
  minutes: (m: number) => string;
};

const CONFIRM: Record<Locale, ConfirmCopy> = {
  ru: {
    subject: (d, t) => `Вы записаны в REMPIRE: ${d}, ${t}`,
    eyebrow: "Подтверждение записи",
    hello: "Ждём вас!",
    services: "Услуги",
    cutoff: (s) => `Перенести или отменить онлайн можно не позже чем за ${s} до визита.`,
    call: (p) => `Позже — по телефону ${p}.`,
    why: "Письмо пришло, потому что вы записаны в REMPIRE.",
    hours: (h) => `${h} ч`,
    minutes: (m) => `${m} мин`,
  },
  et: {
    subject: (d, t) => `Aeg on broneeritud: REMPIRE ${d} kell ${t}`,
    eyebrow: "Broneeringu kinnitus",
    hello: "Ootame sind!",
    services: "Teenused",
    cutoff: (s) => `Veebis saab aega muuta või tühistada kuni ${s} enne külastust.`,
    call: (p) => `Hiljem helista: ${p}.`,
    why: "Said selle kirja, sest sul on aeg REMPIRE'is.",
    hours: (h) => `${h} h`,
    minutes: (m) => `${m} min`,
  },
  en: {
    subject: (d, t) => `You're booked at REMPIRE: ${d}, ${t}`,
    eyebrow: "Booking confirmation",
    hello: "See you soon!",
    services: "Services",
    cutoff: (s) => `You can change or cancel online up to ${s} before your visit.`,
    call: (p) => `After that, please call ${p}.`,
    why: "You get this e-mail because you have a booking at REMPIRE.",
    hours: (h) => `${h} h`,
    minutes: (m) => `${m} min`,
  },
};

// ---- a visit changed by the salon: moved or cancelled (A6) ----------------

type ChangeCopy = {
  subject: (day: string, time: string) => string;
  eyebrow: string;
  heading: string;
  lead: string;
};

const MOVED: Record<Locale, ChangeCopy & { was: (when: string) => string }> = {
  ru: {
    subject: (d, t) => `Запись перенесена: ${d}, ${t}`,
    eyebrow: "Запись изменена",
    heading: "Новое время",
    lead: "Мы изменили вашу запись. Вот как она выглядит теперь.",
    was: (w) => `Было: ${w}`,
  },
  et: {
    subject: (d, t) => `Aeg on muudetud: REMPIRE ${d} kell ${t}`,
    eyebrow: "Broneering muudetud",
    heading: "Uus aeg",
    lead: "Muutsime sinu broneeringut. Nii see nüüd välja näeb.",
    was: (w) => `Enne: ${w}`,
  },
  en: {
    subject: (d, t) => `Your REMPIRE booking has moved: ${d}, ${t}`,
    eyebrow: "Booking changed",
    heading: "New time",
    lead: "We have changed your booking. Here is how it looks now.",
    was: (w) => `Was: ${w}`,
  },
};

const CANCELLED: Record<Locale, ChangeCopy & { call: (phone: string) => string; why: string }> = {
  ru: {
    subject: (d, t) => `Запись отменена: ${d}, ${t}`,
    eyebrow: "Отмена записи",
    heading: "Запись отменена",
    lead: "Мы отменили вашу запись. Если хотите другое время, запишитесь снова.",
    call: (p) => `Вопросы — по телефону ${p}.`,
    why: "Письмо пришло, потому что у вас была запись в REMPIRE.",
  },
  et: {
    subject: (d, t) => `Aeg on tühistatud: REMPIRE ${d} kell ${t}`,
    eyebrow: "Tühistamine",
    heading: "Aeg on tühistatud",
    lead: "Tühistasime sinu aja. Kui soovid uut aega, broneeri uuesti.",
    call: (p) => `Küsimuste korral helista: ${p}.`,
    why: "Said selle kirja, sest sul oli aeg REMPIRE'is.",
  },
  en: {
    subject: (d, t) => `Your REMPIRE booking is cancelled: ${d}, ${t}`,
    eyebrow: "Cancellation",
    heading: "Booking cancelled",
    lead: "We have cancelled your booking. If you would like another time, book again.",
    call: (p) => `Questions? Call ${p}.`,
    why: "You get this e-mail because you had a booking at REMPIRE.",
  },
};

// ---- the reminder before a visit (Altegio's type 1: 12 hours before) ------

const REMINDER: Record<Locale, ChangeCopy> = {
  ru: {
    subject: (d, t) => `Напоминание о записи в REMPIRE: ${d}, ${t}`,
    eyebrow: "Напоминание",
    heading: "Скоро увидимся",
    lead: "Напоминаем о вашей записи.",
  },
  et: {
    subject: (d, t) => `Meeldetuletus: REMPIRE ${d} kell ${t}`,
    eyebrow: "Meeldetuletus",
    heading: "Peagi näeme",
    lead: "Tuletame meelde sinu broneeringut.",
  },
  en: {
    subject: (d, t) => `Reminder: your REMPIRE visit on ${d} at ${t}`,
    eyebrow: "Reminder",
    heading: "See you soon",
    lead: "A reminder of your booking.",
  },
};

const pad2 = (n: number) => String(n).padStart(2, "0");

export type VisitLetterKind = "confirmation" | "moved" | "cancelled" | "reminder";

type VisitLetterOptions = {
  business: Pick<Business, "name" | "timezone" | "settings">;
  origin: string;
  token: string;
  locale: Locale;
  now?: number;
  /** moved: where the visit was before, for the «Было» line */
  from?: { startsAt: string; staffName?: string };
};

/** «Вторник, 25 ноября» in the visit's timezone. */
function longDay(ms: number, L: Locale, tz: string) {
  const long = new Intl.DateTimeFormat(INTL[L], { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(ms);
  return long.charAt(0).toUpperCase() + long.slice(1);
}

export function confirmationLetter(v: VisitView, o: VisitLetterOptions): Letter & { attachments: Attachment[] } {
  return visitLetter("confirmation", v, o);
}

/**
 * The letter about one visit: its confirmation, its reminder, or that the
 * salon moved or cancelled it. All show the visit as it is now; none
 * carries the client's name (see below). The reminder carries no .ics: the
 * confirmation brought it.
 */
export function visitLetter(kind: VisitLetterKind, v: VisitView, o: VisitLetterOptions): Letter & { attachments: Attachment[] } {
  const L = o.locale;
  const c = COPY[L];
  const k = CONFIRM[L];
  const tz = o.business.timezone;
  const start = Date.parse(v.startsAt);
  const s = localParts(start, tz);
  const e = localParts(Date.parse(v.endsAt), tz);
  const [, mm, dd] = s.date.split("-").map(Number);
  const short = `${pad2(dd)}.${pad2(mm)}`;
  const dayLong = longDay(start, L, tz);
  const when = `${dayLong}, ${s.time}–${e.time}`;

  const manage = `${o.origin}/${L}/visit/${o.token}`;
  const ics = `${o.origin}/api/ics/${o.token}?lang=${L}`;
  const again = `${o.origin}/${L}`;
  const services = v.services.map((x) => pick(x.name, L));
  const place = [v.location.name, v.location.address].filter(Boolean).join(", ");
  const maps = v.location.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.location.address)}` : "";
  const total = eur(v.totalCents);
  const extra = v.extraCents > 0 ? c.plusSpecial(eur(v.totalCents - v.extraCents), eur(v.extraCents)) : "";
  const cut = o.business.settings.cancel_cutoff_min;
  const span = cut >= 60 && cut % 60 === 0 ? k.hours(cut / 60) : k.minutes(cut);
  const phone = v.location.phone;
  // the phone as a tap-to-call link inside a sentence of escaped copy
  const tel = phone ? `<a href="tel:${esc(phone.replace(/[^\d+]/g, ""))}" style="color:${SOFT};white-space:nowrap;">${esc(phone)}</a>` : "";
  const withTel = (sentence: (p: string) => string) => esc(sentence("\u0000")).replace("\u0000", tel);

  let wasLine = "";
  if (kind === "moved" && o.from) {
    const f = Date.parse(o.from.startsAt);
    const fromWhen = `${longDay(f, L, tz)}, ${localParts(f, tz).time}`;
    wasLine = MOVED[L].was(o.from.staffName && o.from.staffName !== v.staffName ? `${fromWhen} · ${o.from.staffName}` : fromWhen);
  }

  const copy = kind === "moved" ? MOVED[L] : kind === "cancelled" ? CANCELLED[L] : kind === "reminder" ? REMINDER[L] : null;
  const subject = copy ? copy.subject(short, s.time) : k.subject(short, s.time);
  const title = copy ? copy.heading : c.booked;
  const rules = kind === "cancelled" ? [phone ? CANCELLED[L].call(phone) : ""].filter(Boolean) : [cut > 0 ? k.cutoff(span) : "", phone ? k.call(phone) : ""].filter(Boolean);
  const rulesHtml = (kind === "cancelled" ? [tel ? withTel(CANCELLED[L].call) : ""] : [cut > 0 ? esc(k.cutoff(span)) : "", tel ? withTel(k.call) : ""])
    .filter(Boolean)
    .join(" ");

  const text = [
    title,
    ...(copy ? ["", copy.lead] : []),
    "",
    when,
    ...(wasLine ? [wasLine] : []),
    `${c.barberK}: ${v.staffName}`,
    `${k.services}: ${services.join(" + ")}`,
    ...(kind === "cancelled" ? [] : [`${c.total}: ${total}${extra ? ` (${extra})` : ""}`]),
    `${c.whereK}: ${place}`,
    "",
    ...(kind === "cancelled" ? [`${c.again}: ${again}`] : [`${c.changeCancel}: ${manage}`, `${c.addCal}: ${ics}`]),
    ...(rules.length ? ["", rules.join(" ")] : []),
  ].join("\n");

  const time =
    kind === "cancelled"
      ? `<span style="color:${SOFT};text-decoration:line-through;">${esc(dayLong)}<br><span style="font-size:28px;line-height:36px;letter-spacing:1px;">${esc(s.time)}–${esc(e.time)}</span></span>`
      : `${esc(dayLong)}<br><span style="font-size:28px;line-height:36px;letter-spacing:1px;">${esc(s.time)}–${esc(e.time)}</span>`;
  const rows: [string, string][] = [
    [c.barberK, esc(v.staffName)],
    [k.services, services.map(esc).join("<br>")],
    ...(kind === "cancelled" ? [] : [[c.total, `${esc(total)}${extra ? `<div style="font:13px/20px ${FONT};color:${SOFT};">${esc(extra)}</div>` : ""}`] as [string, string]]),
    [c.whereK, maps ? `<a href="${esc(maps)}" style="color:${FG};text-decoration:underline;">${esc(place)}</a>` : esc(place)],
  ];
  const body = [
    eyebrow(copy ? copy.eyebrow : k.eyebrow),
    heading(title),
    keyLine(time),
    ...(wasLine ? [para(esc(wasLine), SOFT, 14)] : []),
    // No client name: the stored one belongs to the phone, and anyone can
    // book with any phone and any e-mail, so it would tell a stranger whose
    // number it is. Nothing the booker typed goes into the letter either.
    para(esc(copy ? copy.lead : k.hello)),
    details(rows),
    ...(kind === "cancelled" ? [button(again, c.again, true)] : [button(manage, c.changeCancel, true), button(ics, c.addCal, false)]),
    ...(rulesHtml ? [`<tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>`, para(rulesHtml, SOFT, 14)] : []),
  ];

  const html = layout({
    lang: L,
    title: subject,
    preheader: kind === "moved" && wasLine ? `${when} · ${wasLine}` : `${when} · ${v.staffName}`,
    origin: o.origin,
    body: body.join("\n"),
    footer: [esc([o.business.name, v.location.address].filter(Boolean).join(" · ")), esc(kind === "cancelled" ? CANCELLED[L].why : k.why)],
  });

  if (kind === "reminder") return { subject, text, html, attachments: [] };
  // a cancelled visit's file says METHOD:CANCEL, so a calendar app can drop it
  const calendar = visitIcsFor(v, { businessName: o.business.name, origin: o.origin, token: o.token, locale: L, now: o.now });
  const method = v.status === "cancelled" ? "CANCEL" : "PUBLISH";
  return { subject, text, html, attachments: [{ filename: "rempire.ics", content: calendar, contentType: `text/calendar; charset=utf-8; method=${method}` }] };
}

// ---- «Приглашение недошедших»: the visit was marked «Не пришёл» (type 72) ----

type NoShowCopy = {
  subject: string;
  eyebrow: string;
  heading: string;
  lead: (when: string) => string;
  book: string;
  call: (phone: string) => string;
  why: string;
};

const NO_SHOW: Record<Locale, NoShowCopy> = {
  ru: {
    subject: "Мы вас ждали в REMPIRE",
    eyebrow: "Приглашение",
    heading: "Мы вас ждали",
    lead: (w) => `Вы не пришли на запись ${w}. Ничего страшного: выберите новое время, будем рады вас видеть.`,
    book: "Записаться снова",
    call: (p) => `Удобнее по телефону — ${p}.`,
    why: "Письмо пришло, потому что у вас была запись в REMPIRE.",
  },
  et: {
    subject: "Ootasime sind REMPIRE'is",
    eyebrow: "Kutse",
    heading: "Ootasime sind",
    lead: (w) => `Sa ei jõudnud oma ajale ${w}. Pole hullu: vali uus aeg, ootame sind.`,
    book: "Broneeri uus aeg",
    call: (p) => `Telefoni teel: ${p}.`,
    why: "Said selle kirja, sest sul oli aeg REMPIRE'is.",
  },
  en: {
    subject: "We missed you at REMPIRE",
    eyebrow: "Invitation",
    heading: "We missed you",
    lead: (w) => `You did not make it to your visit on ${w}. No problem: pick a new time, we would be glad to see you.`,
    book: "Book a new time",
    call: (p) => `Prefer to call? ${p}.`,
    why: "You get this e-mail because you had a booking at REMPIRE.",
  },
};

type InviteOptions = { business: Pick<Business, "name" | "timezone">; origin: string; locale: Locale };

/**
 * The invitation after a missed visit: when it was, with whom, and the
 * booking page. No change link (the visit is over) and no client name.
 */
export function noShowLetter(v: VisitView, o: InviteOptions): Letter {
  const L = o.locale;
  const c = COPY[L];
  const k = NO_SHOW[L] ?? NO_SHOW.ru;
  const tz = o.business.timezone;
  const start = Date.parse(v.startsAt);
  const s = localParts(start, tz);
  const dayLong = longDay(start, L, tz);
  // inside a sentence: «вторник, 17 ноября, 12:00»; English keeps its capital weekday
  const when = `${L === "en" ? dayLong : dayLong.charAt(0).toLowerCase() + dayLong.slice(1)}, ${s.time}`;
  const book = `${o.origin}/${L}`;
  const place = [v.location.name, v.location.address].filter(Boolean).join(", ");
  const phone = v.location.phone;
  const tel = phone ? `<a href="tel:${esc(phone.replace(/[^\d+]/g, ""))}" style="color:${SOFT};white-space:nowrap;">${esc(phone)}</a>` : "";
  const text = [
    k.heading,
    "",
    k.lead(when),
    "",
    `${c.barberK}: ${v.staffName}`,
    `${c.whereK}: ${place}`,
    "",
    `${k.book}: ${book}`,
    ...(phone ? ["", k.call(phone)] : []),
  ].join("\n");
  const body = [
    eyebrow(k.eyebrow),
    heading(k.heading),
    keyLine(`${esc(dayLong)}<br><span style="font-size:28px;line-height:36px;letter-spacing:1px;">${esc(s.time)}</span>`),
    para(esc(k.lead(when))),
    details([
      [c.barberK, esc(v.staffName)],
      [c.whereK, esc(place)],
    ]),
    button(book, k.book, true),
    ...(tel ? [`<tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>`, para(esc(k.call("\u0000")).replace("\u0000", tel), SOFT, 14)] : []),
  ];
  const html = layout({
    lang: L,
    title: k.subject,
    preheader: `${dayLong}, ${s.time} · ${v.staffName}`,
    origin: o.origin,
    body: body.join("\n"),
    footer: [esc([o.business.name, v.location.address].filter(Boolean).join(" · ")), esc(k.why)],
  });
  return { subject: k.subject, text, html };
}

// ---- the birthday greeting (type 3: 10:00 on the day) --------------------

type BirthdayCopy = { subject: string; eyebrow: string; heading: string; lead: string; book: string; why: string };

const BIRTHDAY: Record<Locale, BirthdayCopy> = {
  ru: {
    subject: "С днём рождения от REMPIRE!",
    eyebrow: "REMPIRE",
    heading: "С днём рождения!",
    lead: "Поздравляем вас с днём рождения! Желаем отличного года, и ждём в гости.",
    book: "Записаться",
    why: "Письмо пришло, потому что вы клиент REMPIRE.",
  },
  et: {
    subject: "Palju õnne sünnipäevaks, soovib REMPIRE!",
    eyebrow: "REMPIRE",
    heading: "Palju õnne!",
    lead: "Palju õnne sünnipäevaks! Soovime sulle toredat aastat ja ootame sind külla.",
    book: "Broneeri aeg",
    why: "Said selle kirja, sest oled REMPIRE'i klient.",
  },
  en: {
    subject: "Happy birthday from REMPIRE!",
    eyebrow: "REMPIRE",
    heading: "Happy birthday!",
    lead: "Happy birthday from all of us! We wish you a great year ahead, and hope to see you soon.",
    book: "Book a visit",
    why: "You get this e-mail because you are a REMPIRE client.",
  },
};

/** The birthday greeting: no name (the stored one may not be his), the booking page as the one thing to do. */
export function birthdayLetter(o: { locale: Locale; origin: string; business: Pick<Business, "name">; address?: string }): Letter {
  const L = o.locale;
  const k = BIRTHDAY[L] ?? BIRTHDAY.ru;
  const book = `${o.origin}/${L}`;
  const text = [k.heading, "", k.lead, "", `${k.book}: ${book}`].join("\n");
  const body = [eyebrow(k.eyebrow), heading(k.heading), para(esc(k.lead)), `<tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>`, button(book, k.book, true)];
  const html = layout({
    lang: L,
    title: k.subject,
    preheader: k.lead,
    origin: o.origin,
    body: body.join("\n"),
    footer: [esc([o.business.name, o.address].filter(Boolean).join(" · ")), esc(k.why)],
  });
  return { subject: k.subject, text, html };
}

// ---- «Запрос отзыва после визита» (Altegio's types 6 / 20: 3 h after) ----

type ReviewRequestCopy = { subject: string; eyebrow: string; heading: string; lead: (when: string) => string; write: string; why: string };

const REVIEW_REQUEST: Record<Locale, ReviewRequestCopy> = {
  ru: {
    subject: "Как прошёл визит в REMPIRE?",
    eyebrow: "Отзыв",
    heading: "Спасибо за визит!",
    lead: (w) => `Вы были у нас ${w}. Расскажите, как всё прошло: оценка и пара слов помогут нам и другим клиентам.`,
    write: "Оставить отзыв",
    why: "Письмо пришло, потому что у вас была запись в REMPIRE.",
  },
  et: {
    subject: "Kuidas läks REMPIRE'is?",
    eyebrow: "Arvustus",
    heading: "Aitäh külastuse eest!",
    lead: (w) => `Käisid meil ${w}. Räägi, kuidas läks: hinne ja paar sõna aitavad meid ja teisi kliente.`,
    write: "Jäta arvustus",
    why: "Said selle kirja, sest sul oli aeg REMPIRE'is.",
  },
  en: {
    subject: "How was your visit to REMPIRE?",
    eyebrow: "Review",
    heading: "Thank you for your visit!",
    lead: (w) => `You visited us on ${w}. Tell us how it went: a rating and a few words help us and other clients.`,
    write: "Leave a review",
    why: "You get this e-mail because you had a booking at REMPIRE.",
  },
};

/** Where a review is written: the salon's page, at its card «Оцените и напишите отзыв» (src/app/[locale]/booking-flow.tsx). */
export const reviewFormUrl = (origin: string, locale: Locale) => `${origin}/${locale}/about#ab-reviews`;

/**
 * The request for a review after a visit (off until the salon switches it
 * on in «Уведомления»): when it was, with whom, and the salon's page at its
 * review card. No change link (the visit is over) and no client name.
 */
export function reviewRequestLetter(v: VisitView, o: InviteOptions): Letter {
  const L = o.locale;
  const c = COPY[L];
  const k = REVIEW_REQUEST[L] ?? REVIEW_REQUEST.ru;
  const tz = o.business.timezone;
  const start = Date.parse(v.startsAt);
  const s = localParts(start, tz);
  const dayLong = longDay(start, L, tz);
  const when = `${L === "en" ? dayLong : dayLong.charAt(0).toLowerCase() + dayLong.slice(1)}, ${s.time}`;
  const form = reviewFormUrl(o.origin, L);
  const place = [v.location.name, v.location.address].filter(Boolean).join(", ");
  const text = [k.heading, "", k.lead(when), "", `${c.barberK}: ${v.staffName}`, `${c.whereK}: ${place}`, "", `${k.write}: ${form}`].join("\n");
  const body = [
    eyebrow(k.eyebrow),
    heading(k.heading),
    para(esc(k.lead(when))),
    details([
      [c.barberK, esc(v.staffName)],
      [c.whereK, esc(place)],
    ]),
    button(form, k.write, true),
  ];
  const html = layout({
    lang: L,
    title: k.subject,
    preheader: `${dayLong}, ${s.time} · ${v.staffName}`,
    origin: o.origin,
    body: body.join("\n"),
    footer: [esc([o.business.name, v.location.address].filter(Boolean).join(" · ")), esc(k.why)],
  });
  return { subject: k.subject, text, html };
}

// ---- an invoice to a barber's company (Phase C, C5) ---------------------

type InvoiceCopy = {
  subject: (n: string, credit: boolean) => string;
  eyebrow: string;
  heading: (credit: boolean) => string;
  lead: (credit: boolean) => string;
  number: string;
  period: string;
  total: (credit: boolean) => string;
  due: string;
  footer: string;
};

const INVOICE: Record<Locale, InvoiceCopy> = {
  et: {
    subject: (n, c) => `${c ? "Kreeditarve" : "Arve"} ${n} · REMPIRE`,
    eyebrow: "REMPIRE",
    heading: (c) => (c ? "Kreeditarve" : "Arve"),
    lead: (c) => (c ? "Kreeditarve on lisatud PDF-failina." : "Arve on lisatud PDF-failina. Palume tasuda maksetähtajaks."),
    number: "Arve nr",
    period: "Periood",
    total: (c) => (c ? "Tagastatav summa" : "Kokku tasuda"),
    due: "Maksetähtaeg",
    footer: "Kiri saadeti automaatselt. Küsimuste korral vasta sellele kirjale või kirjuta salongi.",
  },
  en: {
    subject: (n, c) => `${c ? "Credit note" : "Invoice"} ${n} · REMPIRE`,
    eyebrow: "REMPIRE",
    heading: (c) => (c ? "Credit note" : "Invoice"),
    lead: (c) => (c ? "The credit note is attached as a PDF." : "The invoice is attached as a PDF. Please pay by the due date."),
    number: "Invoice no",
    period: "Period",
    total: (c) => (c ? "Amount credited" : "Total due"),
    due: "Due date",
    footer: "Sent automatically. With questions, reply to this letter or write to the salon.",
  },
  ru: {
    subject: (n, c) => `${c ? "Кредит-счёт" : "Счёт"} ${n} · REMPIRE`,
    eyebrow: "REMPIRE",
    heading: (c) => (c ? "Кредит-счёт" : "Счёт"),
    lead: (c) => (c ? "Кредит-счёт во вложении, в PDF." : "Счёт во вложении, в PDF. Просим оплатить до срока."),
    number: "№ счёта",
    period: "Период",
    total: (c) => (c ? "Сумма к возврату" : "Итого к оплате"),
    due: "Срок оплаты",
    footer: "Письмо отправлено автоматически. С вопросами ответьте на него или напишите в салон.",
  },
};

const dmy = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};
const eurComma = (cents: number) => `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)},${String(Math.abs(cents) % 100).padStart(2, "0")} €`;

/** The invoice letter: number, period, total and due date; the PDF goes along. */
export function invoiceLetter(
  inv: { kind: "invoice" | "credit"; number: string; periodFrom: string; periodTo: string; dueOn: string | null; grossCents: number; sellerName: string },
  o: { locale: Locale; origin: string; pdf: { filename: string; content: Uint8Array } },
): Letter & { attachments: Attachment[] } {
  const L = o.locale;
  const k = INVOICE[L] ?? INVOICE.et;
  const credit = inv.kind === "credit";
  const subject = k.subject(inv.number, credit);
  const period = inv.periodFrom === inv.periodTo ? dmy(inv.periodFrom) : `${dmy(inv.periodFrom)}–${dmy(inv.periodTo)}`;
  const rows: [string, string][] = [
    [k.number, esc(inv.number)],
    [k.period, esc(period)],
    [k.total(credit), esc(eurComma(inv.grossCents))],
    ...(!credit && inv.dueOn ? ([[k.due, esc(dmy(inv.dueOn))]] as [string, string][]) : []),
  ];
  const text = [`${k.heading(credit)} ${inv.number}`, "", k.lead(credit), "", ...rows.map(([a, b]) => `${a}: ${b.replace(/&[^;]+;/g, "")}`), "", inv.sellerName].join("\n");
  const body = [eyebrow(k.eyebrow), heading(`${k.heading(credit)} ${inv.number}`), para(esc(k.lead(credit))), details(rows)].join("\n");
  const html = layout({ lang: L, title: subject, preheader: `${period} · ${eurComma(inv.grossCents)}`, origin: o.origin, body, footer: [esc(inv.sellerName), esc(k.footer)] });
  return { subject, text, html, attachments: [{ filename: o.pdf.filename, content: o.pdf.content, contentType: "application/pdf" }] };
}

// ---- a letter's subject alone (the report «Сообщения») ---------------------

/**
 * The subject a letter of this outbox kind has, in its language, from the
 * same words the letters use: what the report «Сообщения» shows for an
 * e-mail. A visit's letters need its start (`startsAt`, on the salon's
 * clock `tz`), an invoice its number. Null: a kind we write no letter for,
 * or what its subject needs is missing. The login code's letter is never
 * named here: its subject carries the code.
 */
export function letterSubject(kind: string, locale: Locale, o: { startsAt?: string | null; tz?: string; number?: string | null; credit?: boolean } = {}): string | null {
  const L: Locale = locale === "et" || locale === "en" ? locale : "ru";
  if (kind === "birthday") return BIRTHDAY[L].subject;
  if (kind === "no_show") return NO_SHOW[L].subject;
  if (kind === "review_request") return REVIEW_REQUEST[L].subject;
  if (kind === "invoice") return o.number ? (INVOICE[L] ?? INVOICE.et).subject(o.number, o.credit === true) : null;
  const copy = kind === "confirmation" ? CONFIRM[L] : kind === "moved" ? MOVED[L] : kind === "cancelled" ? CANCELLED[L] : kind === "reminder_email" ? REMINDER[L] : null;
  if (!copy || !o.startsAt || Number.isNaN(Date.parse(o.startsAt))) return null;
  const s = localParts(Date.parse(o.startsAt), o.tz || "Europe/Tallinn");
  const [, mm, dd] = s.date.split("-").map(Number);
  return copy.subject(`${pad2(dd)}.${pad2(mm)}`, s.time);
}
