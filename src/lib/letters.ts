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

const pad2 = (n: number) => String(n).padStart(2, "0");

export type VisitLetterKind = "confirmation" | "moved" | "cancelled";

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
 * The letter about one visit: its confirmation, or that the salon moved or
 * cancelled it. All three show the visit as it is now; none carries the
 * client's name (see below).
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

  const copy = kind === "moved" ? MOVED[L] : kind === "cancelled" ? CANCELLED[L] : null;
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

  // a cancelled visit's file says METHOD:CANCEL, so a calendar app can drop it
  const calendar = visitIcsFor(v, { businessName: o.business.name, origin: o.origin, token: o.token, locale: L, now: o.now });
  const method = v.status === "cancelled" ? "CANCEL" : "PUBLISH";
  return { subject, text, html, attachments: [{ filename: "rempire.ics", content: calendar, contentType: `text/calendar; charset=utf-8; method=${method}` }] };
}
