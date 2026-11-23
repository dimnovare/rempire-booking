/**
 * The letters: to a client about a visit (confirmed, moved, cancelled, the
 * reminder, the review request), the birthday greeting and the invitation
 * after a missed visit, the staff login code, an invoice to a barber's
 * company.
 *
 * The look is the light design canvas Dim approved in round 13 (src/lib/
 * letter-kit.ts): the order of REMPIRE's letters today (what happened, the
 * buttons, who, when, what, where, the rules), in the booking's colours,
 * with our own words and icons. Never another system's name or logo.
 *
 * Each client letter can carry the salon's own text for its kind,
 * «Дополнительная информация в Email» on «Настройки → Уведомления»
 * (`extra`), under the visit's details. Every letter has a plain-text part
 * with the same words. Every value from the database goes through esc();
 * links are built here from the app's own address.
 */
import type { Business } from "./availability";
import type { Attachment, LetterBody } from "./email";
import { COPY, INTL, eur, pick, type Locale } from "./i18n";
import { visitIcsFor } from "./ics";
import * as K from "./letter-kit";
import { localParts } from "./tz";
import type { VisitView } from "./visits";

export const esc = K.esc;

export type Letter = LetterBody & { subject: string; html: string };

const pad2 = (n: number) => String(n).padStart(2, "0");

/** A tap-to-call link for a phone inside a sentence. */
const telLink = (phone: string) => `<a href="tel:${esc(phone.replace(/[^\d+]/g, ""))}" style="color:${K.C.ink2};white-space:nowrap;">${esc(phone)}</a>`;
/** A sentence of escaped copy with the phone as a link in it. */
const withTel = (sentence: (p: string) => string, phone: string) => esc(sentence("\u0000")).replace("\u0000", telLink(phone));

/** «Вторник, 25 ноября» in the visit's timezone. */
function longDay(ms: number, L: Locale, tz: string) {
  const long = new Intl.DateTimeFormat(INTL[L], { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(ms);
  return long.charAt(0).toUpperCase() + long.slice(1);
}

/**
 * The day inside a sentence: «на пятницу, 27 ноября» (the weekdays in -а
 * take -у after «на»), «reede, 27. november», «Friday 27 November».
 */
function inSentence(dayLong: string, L: Locale) {
  if (L === "en") return dayLong;
  const low = dayLong.charAt(0).toLowerCase() + dayLong.slice(1);
  return L === "ru" ? low.replace(/^([а-яё]+)а(?=,)/, "$1у") : low;
}

/* ---------- the words every visit letter shares ---------- */

type LookCopy = {
  details: string;
  services: string;
  findUs: string;
  openMap: string;
  cancel: string;
  move: string;
  priceNote: string;
  extraFee: string;
  auto: string;
  dur: (min: number) => string;
};

const hm = (min: number, h: string, m: string) => {
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  return [hours ? `${hours} ${h}` : "", rest || !hours ? `${rest} ${m}` : ""].filter(Boolean).join(" ");
};

const LOOK: Record<Locale, LookCopy> = {
  ru: {
    details: "Детали записи",
    services: "Услуги",
    findUs: "Как нас найти",
    openMap: "открыть карту",
    cancel: "Отменить",
    move: "Перенести",
    priceNote: "Цены по прайс-листу. Итоговую стоимость барбер назовёт на месте.",
    extraFee: "Доплата за время вне графика",
    auto: "Письмо отправлено автоматически, отвечать на него не нужно.",
    dur: (m) => hm(m, "ч", "мин"),
  },
  et: {
    details: "Broneeringu andmed",
    services: "Teenused",
    findUs: "Kuidas meid leida",
    openMap: "ava kaart",
    cancel: "Tühista",
    move: "Muuda aega",
    priceNote: "Hinnad hinnakirja järgi. Lõpliku hinna ütleb meister kohapeal.",
    extraFee: "Lisatasu väljaspool tööaega",
    auto: "Kiri saadeti automaatselt, sellele pole vaja vastata.",
    dur: (m) => hm(m, "h", "min"),
  },
  en: {
    details: "Booking details",
    services: "Services",
    findUs: "How to find us",
    openMap: "open map",
    cancel: "Cancel",
    move: "Reschedule",
    priceNote: "Prices as on the price list. Your barber confirms the final price at the salon.",
    extraFee: "Out-of-hours fee",
    auto: "This e-mail was sent automatically; there is no need to reply.",
    dur: (m) => hm(m, "h", "min"),
  },
};

/** One kind of visit letter: its subject, its pill, its title and lead. `day` is already in its sentence form. */
type VisitCopy = {
  subject: (day: string, time: string) => string;
  pill: string;
  title: (day: string, time: string, salon: string) => string;
  lead: (salon: string, phone: boolean) => string;
};

// ---- the booking confirmation (A6) ----------------------------------------

const CONFIRM: Record<Locale, VisitCopy & { cutoff: (span: string) => string; call: (phone: string) => string; hours: (h: number) => string; minutes: (m: number) => string }> = {
  ru: {
    subject: (d, t) => `Вы записаны в REMPIRE: ${d}, ${t}`,
    pill: "Запись подтверждена",
    title: (d, t) => `Вы записаны на ${d}, в\u00a0${t}`,
    lead: (s) => `Ждём вас в ${s}. Если планы изменятся, перенесите или отмените запись здесь.`,
    cutoff: (s) => `Перенести или отменить онлайн можно не позже чем за ${s} до визита.`,
    call: (p) => `Позже — по телефону ${p}.`,
    hours: (h) => `${h} ч`,
    minutes: (m) => `${m} мин`,
  },
  et: {
    subject: (d, t) => `Aeg on broneeritud: REMPIRE ${d} kell ${t}`,
    pill: "Broneering kinnitatud",
    title: (d, t) => `Sinu aeg on broneeritud: ${d} kell\u00a0${t}`,
    lead: () => "Ootame sind! Kui plaanid muutuvad, muuda või tühista aeg siin.",
    cutoff: (s) => `Veebis saab aega muuta või tühistada kuni ${s} enne külastust.`,
    call: (p) => `Hiljem helista: ${p}.`,
    hours: (h) => `${h} h`,
    minutes: (m) => `${m} min`,
  },
  en: {
    subject: (d, t) => `You're booked at REMPIRE: ${d}, ${t}`,
    pill: "Booking confirmed",
    title: (d, t) => `You're booked for ${d} at\u00a0${t}`,
    lead: (s) => `See you at ${s}. If your plans change, move or cancel your booking here.`,
    cutoff: (s) => `You can change or cancel online up to ${s} before your visit.`,
    call: (p) => `After that, please call ${p}.`,
    hours: (h) => `${h} h`,
    minutes: (m) => `${m} min`,
  },
};

// ---- a visit changed by the salon: moved or cancelled (A6) ----------------

const MOVED: Record<Locale, VisitCopy & { was: (when: string) => string }> = {
  ru: {
    subject: (d, t) => `Запись перенесена: ${d}, ${t}`,
    pill: "Запись перенесена",
    title: (d, t) => `Ваша запись перенесена на ${d}, в\u00a0${t}`,
    lead: () => "Мы изменили вашу запись. Новое время и детали — ниже.",
    was: (w) => `Было: ${w}`,
  },
  et: {
    subject: (d, t) => `Aeg on muudetud: REMPIRE ${d} kell ${t}`,
    pill: "Aeg on muudetud",
    title: (d, t) => `Sinu uus aeg: ${d} kell\u00a0${t}`,
    lead: () => "Muutsime sinu broneeringut. Uus aeg ja andmed on allpool.",
    was: (w) => `Enne: ${w}`,
  },
  en: {
    subject: (d, t) => `Your REMPIRE booking has moved: ${d}, ${t}`,
    pill: "Booking moved",
    title: (d, t) => `Your booking has moved to ${d} at\u00a0${t}`,
    lead: () => "We have changed your booking. The new time and the details are below.",
    was: (w) => `Was: ${w}`,
  },
};

const CANCELLED: Record<Locale, VisitCopy & { call: (phone: string) => string; why: string }> = {
  ru: {
    subject: (d, t) => `Запись отменена: ${d}, ${t}`,
    pill: "Запись отменена",
    title: (d, t) => `Ваша запись на ${d}, в\u00a0${t} отменена`,
    lead: (_, p) => `Выберите другое время, это займёт минуту.${p ? " Если отмена — ошибка, позвоните нам." : ""}`,
    call: (p) => `Вопросы — по телефону ${p}.`,
    why: "Письмо пришло, потому что у вас была запись в REMPIRE.",
  },
  et: {
    subject: (d, t) => `Aeg on tühistatud: REMPIRE ${d} kell ${t}`,
    pill: "Aeg on tühistatud",
    title: (d, t) => `Sinu aeg on tühistatud: ${d} kell\u00a0${t}`,
    lead: (_, p) => `Vali uus aeg, see võtab minuti.${p ? " Kui tühistamine oli viga, helista meile." : ""}`,
    call: (p) => `Küsimuste korral helista: ${p}.`,
    why: "Said selle kirja, sest sul oli aeg REMPIRE'is.",
  },
  en: {
    subject: (d, t) => `Your REMPIRE booking is cancelled: ${d}, ${t}`,
    pill: "Booking cancelled",
    title: (d, t) => `Your booking for ${d} at\u00a0${t} is cancelled`,
    lead: (_, p) => `Pick another time, it only takes a minute.${p ? " If this was a mistake, give us a call." : ""}`,
    call: (p) => `Questions? Call ${p}.`,
    why: "You get this e-mail because you had a booking at REMPIRE.",
  },
};

// ---- the reminder before a visit (type 1: 12 hours before) ------------------

const REMINDER: Record<Locale, VisitCopy> = {
  ru: {
    subject: (d, t) => `Напоминание о записи в REMPIRE: ${d}, ${t}`,
    pill: "Напоминание",
    title: (_, __, s) => `Скоро ваш визит в\u00a0${s}`,
    lead: () => "Напоминаем о вашей записи.",
  },
  et: {
    subject: (d, t) => `Meeldetuletus: REMPIRE ${d} kell ${t}`,
    pill: "Meeldetuletus",
    title: (_, __, s) => `Peagi näeme ${s}'is`,
    lead: () => "Tuletame meelde sinu broneeringut.",
  },
  en: {
    subject: (d, t) => `Reminder: your REMPIRE visit on ${d} at ${t}`,
    pill: "Reminder",
    title: (_, __, s) => `Your visit to ${s} is coming up`,
    lead: () => "A reminder of your booking.",
  },
};

export type VisitLetterKind = "confirmation" | "moved" | "cancelled" | "reminder";

type VisitLetterOptions = {
  business: Pick<Business, "name" | "timezone" | "settings">;
  origin: string;
  token: string;
  locale: Locale;
  now?: number;
  /** moved: where the visit was before, for the «Было» line */
  from?: { startsAt: string; staffName?: string };
  /** the salon's own text for this kind of letter («Дополнительная информация в Email») */
  extra?: string | null;
};

export function confirmationLetter(v: VisitView, o: VisitLetterOptions): Letter & { attachments: Attachment[] } {
  return visitLetter("confirmation", v, o);
}

/** The pieces every letter about one visit draws from. */
function visitParts(v: VisitView, L: Locale, origin: string, tz: string, salon: string) {
  const c = COPY[L];
  const start = Date.parse(v.startsAt);
  const s = localParts(start, tz);
  const e = localParts(Date.parse(v.endsAt), tz);
  const dayLong = longDay(start, L, tz);
  const phone = v.location.phone;
  const place = [v.location.name, v.location.address].filter(Boolean).join(", ");
  const maps = v.location.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.location.address)}` : "";
  const barber = K.discRow({ origin, disc: { initial: K.initial(v.staffName) }, title: esc(v.staffName), sub: esc(c.barberK) });
  const mapRow = v.location.address
    ? K.discRow({ origin, disc: { icon: "pin" }, title: esc(v.location.name || salon), sub: `${esc(v.location.address)} · ${esc(LOOK[L].openMap)}`, href: maps })
    : "";
  const phoneRow = phone ? K.discRow({ origin, disc: { icon: "phone", px: 19 }, title: esc(phone), href: `tel:${phone.replace(/[^\d+]/g, "")}`, chevron: false, bold: false }) : "";
  const foot = K.footLine(salon, v.location.address, v.location.website);
  return { c, start, s, e, dayLong, phone, place, maps, barber, mapRow, phoneRow, foot };
}

/**
 * The letter about one visit: its confirmation, its reminder, or that the
 * salon moved or cancelled it. All show the visit as it is now; none
 * carries the client's name (see below). The reminder carries no .ics: the
 * confirmation brought it.
 */
export function visitLetter(kind: VisitLetterKind, v: VisitView, o: VisitLetterOptions): Letter & { attachments: Attachment[] } {
  const L = o.locale;
  const k = CONFIRM[L];
  const look = LOOK[L];
  const tz = o.business.timezone;
  const salon = o.business.name || "REMPIRE";
  const { c, start, s, e, dayLong, phone, place, barber, mapRow, phoneRow, foot } = visitParts(v, L, o.origin, tz, salon);
  const [, mm, dd] = s.date.split("-").map(Number);
  const short = `${pad2(dd)}.${pad2(mm)}`;
  const when = `${dayLong}, ${s.time}–${e.time}`;

  const manage = `${o.origin}/${L}/visit/${o.token}`;
  const ics = `${o.origin}/api/ics/${o.token}?lang=${L}`;
  const again = `${o.origin}/${L}`;
  const services = v.services.map((x) => pick(x.name, L));
  const total = eur(v.totalCents);
  const extraFee = v.extraCents > 0 ? c.plusSpecial(eur(v.totalCents - v.extraCents), eur(v.extraCents)) : "";
  const cut = o.business.settings.cancel_cutoff_min;
  const span = cut >= 60 && cut % 60 === 0 ? k.hours(cut / 60) : k.minutes(cut);

  let fromWhen = "";
  if (kind === "moved" && o.from) {
    const f = Date.parse(o.from.startsAt);
    const at = `${longDay(f, L, tz)}, ${localParts(f, tz).time}`;
    fromWhen = o.from.staffName && o.from.staffName !== v.staffName ? `${at} · ${o.from.staffName}` : at;
  }
  const wasLine = fromWhen ? MOVED[L].was(fromWhen) : "";

  const copy = kind === "moved" ? MOVED[L] : kind === "cancelled" ? CANCELLED[L] : kind === "reminder" ? REMINDER[L] : CONFIRM[L];
  const subject = copy.subject(short, s.time);
  const title = copy.title(inSentence(dayLong, L), s.time, salon);
  const lead = copy.lead(salon, !!phone);
  const extra = (o.extra ?? "").trim();
  const rules = kind === "cancelled" ? [phone ? CANCELLED[L].call(phone) : ""].filter(Boolean) : [cut > 0 ? k.cutoff(span) : "", phone ? k.call(phone) : ""].filter(Boolean);
  const rulesHtml = (kind === "cancelled" ? [] : [cut > 0 ? esc(k.cutoff(span)) : "", phone ? withTel(k.call, phone) : ""]).filter(Boolean).join(" ");

  const text = [
    title,
    "",
    lead,
    ...(wasLine ? [wasLine] : []),
    "",
    when,
    `${c.barberK}: ${v.staffName}`,
    `${look.services}: ${services.join(" + ")}`,
    ...(kind === "cancelled" ? [] : [`${c.total}: ${total}${extraFee ? ` (${extraFee})` : ""}`]),
    `${c.whereK}: ${place}`,
    "",
    ...(kind === "cancelled" ? [`${c.again}: ${again}`] : [`${c.changeCancel}: ${manage}`, ...(kind === "reminder" ? [] : [`${c.addCal}: ${ics}`])]),
    ...(extra ? ["", extra] : []),
    ...(rules.length ? ["", rules.join(" ")] : []),
  ].join("\n");

  // No client name anywhere: the stored one belongs to the phone, and anyone
  // can book with any phone and any e-mail, so it would tell a stranger whose
  // number it is. Nothing the booker typed goes into the letter either.
  const lines: [string, string][] = [...v.services.map((x): [string, string] => [pick(x.name, L), eur(x.priceCents)]), ...(v.extraCents > 0 ? [[look.extraFee, eur(v.extraCents)] as [string, string]] : [])];
  const priceList = (pad?: number) => K.prices(lines, [c.total, total], pad);
  const timeRow = K.discRow({ origin: o.origin, disc: { icon: "clock" }, title: esc(dayLong), sub: esc(`${s.time}–${e.time} · ${look.dur(Math.round((Date.parse(v.endsAt) - start) / 60_000))}`) });
  const rulesBlock = rulesHtml ? K.block(K.small(rulesHtml)) : "";

  let body: string[];
  if (kind === "reminder") {
    body = [
      K.intro({ origin: o.origin, pill: ["bell", copy.pill], title }),
      K.block(K.timeBox({ origin: o.origin, day: dayLong, time: `${s.time}–${e.time}`, person: v.staffName, role: c.barberK })),
      K.block(priceList(8)),
      K.block(K.button({ origin: o.origin, href: manage, label: c.changeCancel, dark: true })),
      K.extraBlock(extra),
      ...(mapRow || phoneRow ? [K.block(K.divider()), K.block(K.stack([mapRow, phoneRow], 12))] : []),
      rulesBlock,
    ];
  } else if (kind === "cancelled") {
    body = [
      K.intro({ origin: o.origin, pill: ["off", copy.pill], title, lead: esc(lead) }),
      K.block(K.struck(when, `${services.join(" + ")} · ${v.staffName}`)),
      K.block(K.button({ origin: o.origin, href: again, label: c.again, dark: true })),
      K.extraBlock(extra),
      phoneRow ? K.block(phoneRow) : "",
    ];
  } else {
    const was = fromWhen ? esc(MOVED[L].was("\u0000")).replace("\u0000", `<span style="text-decoration:line-through;">${esc(fromWhen)}</span>`) : undefined;
    body = [
      K.intro({ origin: o.origin, pill: [kind === "moved" ? "moved" : "ok", copy.pill], title, lead: esc(lead), after: was }),
      K.block(
        K.buttonPair(
          K.button({ origin: o.origin, href: manage, label: look.cancel, icon: "btn-cancel" }),
          K.button({ origin: o.origin, href: `${manage}/move`, label: look.move, icon: "btn-move" }),
        ) +
          K.space(8) +
          K.button({ origin: o.origin, href: ics, label: c.addCal, dark: true, icon: "btn-cal" }),
      ),
      K.block(K.divider()),
      K.block(K.h2(look.details) + K.space(16) + K.stack([barber, timeRow, priceList(), K.note(o.origin, look.priceNote)], 16)),
      K.extraBlock(extra),
      ...(mapRow || phoneRow ? [K.block(K.divider()), K.block(K.h2(look.findUs, 16) + K.stack([mapRow, phoneRow], 12))] : []),
      rulesBlock,
    ];
  }

  const html = K.layout({
    lang: L,
    title: subject,
    preheader: kind === "moved" && wasLine ? `${when} · ${wasLine}` : `${when} · ${v.staffName}`,
    origin: o.origin,
    salon,
    address: v.location.address,
    body: body.filter(Boolean),
    footer: [esc(kind === "cancelled" ? CANCELLED[L].why : look.auto), foot],
  });

  if (kind === "reminder") return { subject, text, html, attachments: [] };
  // a cancelled visit's file says METHOD:CANCEL, so a calendar app can drop it
  const calendar = visitIcsFor(v, { businessName: o.business.name, origin: o.origin, token: o.token, locale: L, now: o.now });
  const method = v.status === "cancelled" ? "CANCEL" : "PUBLISH";
  return { subject, text, html, attachments: [{ filename: "rempire.ics", content: calendar, contentType: `text/calendar; charset=utf-8; method=${method}` }] };
}

// ---- the review request after a visit (round 13: built, off as today) ------

type ReviewCopy = { subject: string; pill: string; title: (salon: string) => string; lead: string; write: string; stars: string; why: string };

const REVIEW: Record<Locale, ReviewCopy> = {
  ru: {
    subject: "Как прошёл визит в REMPIRE?",
    pill: "Как всё прошло?",
    title: (s) => `Оцените визит в\u00a0${s}`,
    lead: "Спасибо, что выбрали нас. Расскажите, как всё прошло: это займёт минуту, а другим поможет выбрать барбера.",
    write: "Оставить отзыв",
    stars: "Оценка от 1 до 5",
    why: "Письмо пришло, потому что у вас была запись в REMPIRE.",
  },
  et: {
    subject: "Kuidas sulle REMPIRE'is meeldis?",
    pill: "Kuidas läks?",
    title: () => "Hinda oma külastust",
    lead: "Aitäh, et valisid meid. Kirjuta, kuidas läks: see võtab minuti ja aitab teistel meistrit valida.",
    write: "Kirjuta arvustus",
    stars: "Hinne 1 kuni 5",
    why: "Said selle kirja, sest sul oli aeg REMPIRE'is.",
  },
  en: {
    subject: "How was your visit to REMPIRE?",
    pill: "How was it?",
    title: (s) => `Rate your visit to ${s}`,
    lead: "Thank you for choosing us. Tell us how it went: it takes a minute and helps others choose a barber.",
    write: "Write a review",
    stars: "Rating from 1 to 5",
    why: "You get this e-mail because you had a booking at REMPIRE.",
  },
};

type InviteOptions = { business: Pick<Business, "name" | "timezone">; origin: string; locale: Locale; extra?: string | null };

/** Where a review is written: the salon's page, at its card «Оцените и напишите отзыв» (src/app/[locale]/booking-flow.tsx). */
export const reviewFormUrl = (origin: string, locale: Locale) => `${origin}/${locale}/about#ab-reviews`;

/**
 * After a visit: who served him and when, five stars and the button, all
 * to the review form on the salon's page. No client name. The outbox
 * sends it as «review_request» (src/lib/outbox.ts), off until the salon
 * switches it on in «Уведомления».
 */
export function reviewLetter(v: VisitView, o: InviteOptions): Letter {
  const L = o.locale;
  const k = REVIEW[L] ?? REVIEW.ru;
  const salon = o.business.name || "REMPIRE";
  const { dayLong, foot } = visitParts(v, L, o.origin, o.business.timezone, salon);
  const services = v.services.map((x) => pick(x.name, L)).join(" + ");
  const url = reviewFormUrl(o.origin, L);
  const extra = (o.extra ?? "").trim();
  const text = [k.title(salon), "", k.lead, "", `${v.staffName} · ${dayLong} · ${services}`, "", `${k.write}: ${url}`, ...(extra ? ["", extra] : [])].join("\n");
  const body = [
    K.intro({ origin: o.origin, pill: ["star", k.pill], title: k.title(salon), lead: esc(k.lead) }),
    K.block(K.discRow({ origin: o.origin, disc: { initial: K.initial(v.staffName) }, title: esc(v.staffName), sub: esc(`${dayLong} · ${services}`) })),
    K.block(K.stars(o.origin, url, k.stars) + K.space(20) + K.button({ origin: o.origin, href: url, label: k.write, dark: true })),
    K.extraBlock(extra),
  ];
  const html = K.layout({
    lang: L,
    title: k.subject,
    preheader: `${dayLong} · ${v.staffName}`,
    origin: o.origin,
    salon,
    address: v.location.address,
    body: body.filter(Boolean),
    footer: [esc(k.why), foot],
  });
  return { subject: k.subject, text, html };
}

// ---- «Приглашение недошедших»: the visit was marked «Не пришёл» (type 72) ----

type NoShowCopy = {
  subject: string;
  pill: string;
  heading: string;
  lead: (when: string) => string;
  book: string;
  call: (phone: string) => string;
  why: string;
};

const NO_SHOW: Record<Locale, NoShowCopy> = {
  ru: {
    subject: "Мы вас ждали в REMPIRE",
    pill: "Приглашение",
    heading: "Мы вас ждали",
    lead: (w) => `Вы не пришли на запись ${w}. Ничего страшного: выберите новое время, будем рады вас видеть.`,
    book: "Записаться снова",
    call: (p) => `Удобнее по телефону — ${p}.`,
    why: "Письмо пришло, потому что у вас была запись в REMPIRE.",
  },
  et: {
    subject: "Ootasime sind REMPIRE'is",
    pill: "Kutse",
    heading: "Ootasime sind",
    lead: (w) => `Sa ei jõudnud oma ajale ${w}. Pole hullu: vali uus aeg, ootame sind.`,
    book: "Broneeri uus aeg",
    call: (p) => `Telefoni teel: ${p}.`,
    why: "Said selle kirja, sest sul oli aeg REMPIRE'is.",
  },
  en: {
    subject: "We missed you at REMPIRE",
    pill: "Invitation",
    heading: "We missed you",
    lead: (w) => `You did not make it to your visit on ${w}. No problem: pick a new time, we would be glad to see you.`,
    book: "Book a new time",
    call: (p) => `Prefer to call? ${p}.`,
    why: "You get this e-mail because you had a booking at REMPIRE.",
  },
};

/**
 * The invitation after a missed visit: when it was, with whom, and the
 * booking page. No change link (the visit is over) and no client name.
 */
export function noShowLetter(v: VisitView, o: InviteOptions): Letter {
  const L = o.locale;
  const c = COPY[L];
  const k = NO_SHOW[L] ?? NO_SHOW.ru;
  const salon = o.business.name || "REMPIRE";
  const { s, dayLong, phone, place, barber, phoneRow, foot } = visitParts(v, L, o.origin, o.business.timezone, salon);
  // inside a sentence: «вторник, 17 ноября, 12:00»; English keeps its capital weekday
  const when = `${L === "en" ? dayLong : dayLong.charAt(0).toLowerCase() + dayLong.slice(1)}, ${s.time}`;
  const book = `${o.origin}/${L}`;
  const extra = (o.extra ?? "").trim();
  const text = [
    k.heading,
    "",
    k.lead(when),
    "",
    `${c.barberK}: ${v.staffName}`,
    `${c.whereK}: ${place}`,
    "",
    `${k.book}: ${book}`,
    ...(extra ? ["", extra] : []),
    ...(phone ? ["", k.call(phone)] : []),
  ].join("\n");
  const timeRow = K.discRow({ origin: o.origin, disc: { icon: "clock" }, title: esc(dayLong), sub: esc(s.time) });
  const body = [
    K.intro({ origin: o.origin, pill: ["cal", k.pill], title: k.heading, lead: esc(k.lead(when)) }),
    K.block(K.stack([barber, timeRow], 16)),
    K.block(K.button({ origin: o.origin, href: book, label: k.book, dark: true })),
    K.extraBlock(extra),
    phoneRow ? K.block(phoneRow) : "",
  ];
  const html = K.layout({
    lang: L,
    title: k.subject,
    preheader: `${dayLong}, ${s.time} · ${v.staffName}`,
    origin: o.origin,
    salon,
    address: v.location.address,
    body: body.filter(Boolean),
    footer: [esc(k.why), foot],
  });
  return { subject: k.subject, text, html };
}

// ---- the birthday greeting (type 3: 10:00 on the day) --------------------

type BirthdayCopy = { subject: string; pill: string; heading: string; lead: string; book: string; why: string };

const BIRTHDAY: Record<Locale, BirthdayCopy> = {
  ru: {
    subject: "С днём рождения от REMPIRE!",
    pill: "Поздравление",
    heading: "С днём рождения!",
    lead: "Поздравляем вас с днём рождения! Желаем отличного года, и ждём в гости.",
    book: "Записаться",
    why: "Письмо пришло, потому что вы клиент REMPIRE.",
  },
  et: {
    subject: "Palju õnne sünnipäevaks, soovib REMPIRE!",
    pill: "Õnnitlus",
    heading: "Palju õnne!",
    lead: "Palju õnne sünnipäevaks! Soovime sulle toredat aastat ja ootame sind külla.",
    book: "Broneeri aeg",
    why: "Said selle kirja, sest oled REMPIRE'i klient.",
  },
  en: {
    subject: "Happy birthday from REMPIRE!",
    pill: "Greetings",
    heading: "Happy birthday!",
    lead: "Happy birthday from all of us! We wish you a great year ahead, and hope to see you soon.",
    book: "Book a visit",
    why: "You get this e-mail because you are a REMPIRE client.",
  },
};

/** The birthday greeting: no name (the stored one may not be his), the booking page as the one thing to do. */
export function birthdayLetter(o: { locale: Locale; origin: string; business: Pick<Business, "name">; address?: string; website?: string; extra?: string | null }): Letter {
  const L = o.locale;
  const k = BIRTHDAY[L] ?? BIRTHDAY.ru;
  const salon = o.business.name || "REMPIRE";
  const book = `${o.origin}/${L}`;
  const extra = (o.extra ?? "").trim();
  const text = [k.heading, "", k.lead, "", `${k.book}: ${book}`, ...(extra ? ["", extra] : [])].join("\n");
  const body = [
    K.intro({ origin: o.origin, pill: ["gift", k.pill], title: k.heading, lead: esc(k.lead) }),
    K.block(K.button({ origin: o.origin, href: book, label: k.book, dark: true })),
    K.extraBlock(extra),
  ];
  const html = K.layout({
    lang: L,
    title: k.subject,
    preheader: k.lead,
    origin: o.origin,
    salon,
    address: o.address ?? "",
    body: body.filter(Boolean),
    footer: [esc(k.why), K.footLine(o.business.name, o.address, o.website)],
  });
  return { subject: k.subject, text, html };
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
    K.intro({ origin, pill: ["key", "Вход для команды"], title: "Ваш код" }),
    K.block(K.codeBox(code)),
    K.block(
      K.para(`Введите его на странице входа. Код действует ${ttlMin}&nbsp;минут и&nbsp;подходит один раз.`) +
        K.space(12) +
        K.small("Если вы не запрашивали код, просто удалите это письмо.") +
        K.space(12) +
        `<p lang="en" style="margin:0;${K.text(13, 19, K.C.ink2)}">${esc(`Your REMPIRE login code. Valid for ${ttlMin} minutes, once.`)}</p>`,
    ),
  ];
  const html = K.layout({
    lang: "ru",
    title: subject,
    preheader: `Действует ${ttlMin} минут.`,
    origin,
    salon: "REMPIRE",
    address: "",
    body,
    footer: ["Письмо отправлено автоматически, отвечать на него не нужно.", "REMPIRE · Tallinn"],
  });
  return { subject, text, html };
}

// ---- an invoice to a barber's company (Phase C, C5) ---------------------

type InvoiceCopy = {
  subject: (n: string, credit: boolean) => string;
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
  const body = [K.intro({ origin: o.origin, title: `${k.heading(credit)} ${inv.number}`, lead: esc(k.lead(credit)) }), K.block(K.facts(rows))];
  const html = K.layout({
    lang: L,
    title: subject,
    preheader: `${period} · ${eurComma(inv.grossCents)}`,
    origin: o.origin,
    salon: "REMPIRE",
    address: "",
    body,
    footer: [esc(inv.sellerName), esc(k.footer)],
  });
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
  if (kind === "review" || kind === "review_request") return REVIEW[L].subject;
  if (kind === "invoice") return o.number ? (INVOICE[L] ?? INVOICE.et).subject(o.number, o.credit === true) : null;
  const copy = kind === "confirmation" ? CONFIRM[L] : kind === "moved" ? MOVED[L] : kind === "cancelled" ? CANCELLED[L] : kind === "reminder_email" ? REMINDER[L] : null;
  if (!copy || !o.startsAt || Number.isNaN(Date.parse(o.startsAt))) return null;
  const s = localParts(Date.parse(o.startsAt), o.tz || "Europe/Tallinn");
  const [, mm, dd] = s.date.split("-").map(Number);
  return copy.subject(`${pad2(dd)}.${pad2(mm)}`, s.time);
}
