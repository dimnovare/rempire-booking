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

const pad2 = (n: number) => String(n).padStart(2, "0");

export function confirmationLetter(
  v: VisitView,
  o: { business: Pick<Business, "name" | "timezone" | "settings">; origin: string; token: string; locale: Locale; now?: number },
): Letter & { attachments: Attachment[] } {
  const L = o.locale;
  const c = COPY[L];
  const k = CONFIRM[L];
  const tz = o.business.timezone;
  const start = Date.parse(v.startsAt);
  const s = localParts(start, tz);
  const e = localParts(Date.parse(v.endsAt), tz);
  const [, mm, dd] = s.date.split("-").map(Number);
  const short = `${pad2(dd)}.${pad2(mm)}`;
  const long = new Intl.DateTimeFormat(INTL[L], { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(start);
  const dayLong = long.charAt(0).toUpperCase() + long.slice(1);
  const when = `${dayLong}, ${s.time}–${e.time}`;

  const manage = `${o.origin}/${L}/visit/${o.token}`;
  const ics = `${o.origin}/api/ics/${o.token}?lang=${L}`;
  const services = v.services.map((x) => pick(x.name, L));
  const place = [v.location.name, v.location.address].filter(Boolean).join(", ");
  const maps = v.location.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.location.address)}` : "";
  const total = eur(v.totalCents);
  const extra = v.extraCents > 0 ? c.plusSpecial(eur(v.totalCents - v.extraCents), eur(v.extraCents)) : "";
  const cut = o.business.settings.cancel_cutoff_min;
  const span = cut >= 60 && cut % 60 === 0 ? k.hours(cut / 60) : k.minutes(cut);
  const rules = [cut > 0 ? k.cutoff(span) : "", v.location.phone ? k.call(v.location.phone) : ""].filter(Boolean);
  const subject = k.subject(short, s.time);

  const text = [
    c.booked,
    "",
    when,
    `${c.barberK}: ${v.staffName}`,
    `${k.services}: ${services.join(" + ")}`,
    `${c.total}: ${total}${extra ? ` (${extra})` : ""}`,
    `${c.whereK}: ${place}`,
    "",
    `${c.changeCancel}: ${manage}`,
    `${c.addCal}: ${ics}`,
    ...(rules.length ? ["", rules.join(" ")] : []),
  ].join("\n");

  // the same rules as the text part, with the phone as a tap-to-call link
  const tel = v.location.phone ? `<a href="tel:${esc(v.location.phone.replace(/[^\d+]/g, ""))}" style="color:${SOFT};white-space:nowrap;">${esc(v.location.phone)}</a>` : "";
  const rulesHtml = [cut > 0 ? esc(k.cutoff(span)) : "", tel ? esc(k.call("\u0000")).replace("\u0000", tel) : ""].filter(Boolean).join(" ");
  const body = [
    eyebrow(k.eyebrow),
    heading(c.booked),
    keyLine(`${esc(dayLong)}<br><span style="font-size:28px;line-height:36px;letter-spacing:1px;">${esc(s.time)}–${esc(e.time)}</span>`),
    // No client name: the stored one belongs to the phone, and anyone can
    // book with any phone and any e-mail, so it would tell a stranger whose
    // number it is. Nothing the booker typed goes into the letter either.
    para(esc(k.hello)),
    details([
      [c.barberK, esc(v.staffName)],
      [k.services, services.map(esc).join("<br>")],
      [c.total, `${esc(total)}${extra ? `<div style="font:13px/20px ${FONT};color:${SOFT};">${esc(extra)}</div>` : ""}`],
      [c.whereK, maps ? `<a href="${esc(maps)}" style="color:${FG};text-decoration:underline;">${esc(place)}</a>` : esc(place)],
    ]),
    button(manage, c.changeCancel, true),
    button(ics, c.addCal, false),
    ...(rulesHtml ? [`<tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>`, para(rulesHtml, SOFT, 14)] : []),
  ];

  const html = layout({
    lang: L,
    title: subject,
    preheader: `${when} · ${v.staffName}`,
    origin: o.origin,
    body: body.join("\n"),
    footer: [esc([o.business.name, v.location.address].filter(Boolean).join(" · ")), esc(k.why)],
  });

  const calendar = visitIcsFor(v, { businessName: o.business.name, origin: o.origin, token: o.token, locale: L, now: o.now });
  return { subject, text, html, attachments: [{ filename: "rempire.ics", content: calendar, contentType: "text/calendar; charset=utf-8; method=PUBLISH" }] };
}
