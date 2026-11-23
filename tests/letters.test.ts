import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { book, CONFIRMATIONS_PER_DAY, type BookingInput } from "@/lib/booking";
import { closeDb, query } from "@/lib/db";
import { sentToConsole } from "@/lib/email";
import { EXTRA_MARK, extraBlock, richText } from "@/lib/letter-kit";
import { birthdayLetter, confirmationLetter, invoiceLetter, letterSubject, loginCodeLetter, noShowLetter, reviewLetter, visitLetter } from "@/lib/letters";
import { runOutbox, sendForVisit } from "@/lib/outbox";
import { zonedToUtc } from "@/lib/tz";
import { cancelByClient, findVisit, type VisitView } from "@/lib/visits";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
// Monday 16.11.2026, 10:00 in Tallinn
const NOW = at("2026-11-16", "10:00");
const TUE = "2026-11-17";
const DEV = { NODE_ENV: "test", VITEST: "true", ALLOW_INDEXING: "yes" };
const PROD = { NODE_ENV: "production", VITEST: "true" };
const ORIGIN = "https://rempire-booking.diipsolutions.eu";

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
  sentToConsole.length = 0;
});
afterAll(closeDb);

let n = 0;
const input = (o: Partial<BookingInput> & { time?: string } = {}): BookingInput => ({
  serviceIds: [demo.services.clip],
  staffId: demo.staff.renat,
  startsAt: new Date(at(TUE, o.time ?? "10:00")).toISOString(),
  name: o.name ?? "Test Client",
  phone: o.phone ?? "+372 5555 0101",
  email: o.email === undefined ? "client@example.test" : o.email,
  comment: "",
  locale: o.locale ?? "ru",
  smsReminder: false,
  idempotencyKey: o.idempotencyKey ?? `letters-${++n}-${Math.random()}`,
});

const confirmations = (appointmentId: string) =>
  query<{ status: string; recipient: string; locale: string; last_error: string | null }>(
    "select status, recipient, locale, last_error from notifications where appointment_id = $1 and kind = 'confirmation'",
    [appointmentId],
  );

const visit = (o: Partial<VisitView> = {}): VisitView => ({
  id: "00000000-0000-4000-8000-000000000001",
  status: "booked",
  startsAt: new Date(at(TUE, "14:00")).toISOString(),
  endsAt: new Date(at(TUE, "15:00")).toISOString(),
  totalCents: 3500,
  extraCents: 0,
  staffId: "s",
  staffName: "Renat",
  anyStaff: false,
  clientName: "Test Client",
  locale: "ru",
  reminder: false,
  services: [{ serviceId: "x", name: { ru: "Стрижка", et: "Lõikus", en: "Haircut" }, durationMin: 60, priceCents: 3500 }],
  location: { name: "REMPIRE", address: "Mardi 1, Tallinn", phone: "+372 5555 0000" },
  ...o,
});
const business = { name: "REMPIRE", timezone: TZ, settings: { cancel_cutoff_min: 24 * 60 } } as Parameters<typeof confirmationLetter>[1]["business"];

describe("letters", () => {
  it("login code: the code in the subject, the text and the HTML, the logo from the app", () => {
    const l = loginCodeLetter("042917", 10, ORIGIN);
    expect(l.subject).toContain("042917");
    expect(l.text).toMatch(/^Код для входа в REMPIRE: 042917/);
    expect(l.html).toContain("042917");
    expect(l.html).toContain(`${ORIGIN}/brand/rempire-logo-white.png`);
    expect(l.html).toContain('lang="ru"');
  });

  it("confirmation: escapes what came from the database, links with the letter's token, attaches the .ics", () => {
    const l = confirmationLetter(visit({ clientName: "Stored Name", staffName: '<img src=x onerror="alert(1)">' }), {
      business,
      origin: ORIGIN,
      token: "tok_abcdefghijklmnopqrstuvwx",
      locale: "ru",
      now: NOW,
    });
    expect(l.html).not.toContain("<img src=x");
    expect(l.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    // the stored name belongs to the phone; anyone may book with any phone
    expect(l.html).not.toContain("Stored Name");
    expect(l.text).not.toContain("Stored Name");
    expect(l.html).toContain(`href="${ORIGIN}/ru/visit/tok_abcdefghijklmnopqrstuvwx"`);
    expect(l.html).toContain(`${ORIGIN}/api/ics/tok_abcdefghijklmnopqrstuvwx?lang=ru`);
    expect(l.html).toContain('href="tel:+37255550000"');
    expect(l.subject).toBe("Вы записаны в REMPIRE: 17.11, 14:00");
    expect(l.text).toContain("Вторник, 17 ноября, 14:00–15:00");
    expect(l.text).toContain("за 24 ч до визита");
    expect(l.attachments).toHaveLength(1);
    expect(l.attachments[0].filename).toBe("rempire.ics");
    expect(l.attachments[0].content).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(l.attachments[0].content).toContain("DTSTART:20261117T120000Z");
  });

  it("confirmation in Estonian and English", () => {
    const et = confirmationLetter(visit(), { business, origin: ORIGIN, token: "tok_abcdefghijklmnopqrstuvwx", locale: "et" });
    expect(et.subject).toBe("Aeg on broneeritud: REMPIRE 17.11 kell 14:00");
    expect(et.html).toContain("Lõikus");
    expect(et.html).toContain('lang="et"');
    const en = confirmationLetter(visit(), { business, origin: ORIGIN, token: "tok_abcdefghijklmnopqrstuvwx", locale: "en" });
    expect(en.subject).toBe("You're booked at REMPIRE: 17.11, 14:00");
    expect(en.text).toContain("Tuesday 17 November, 14:00–15:00");
  });
});

/* The light look of the design canvas Dim approved in round 13 (src/lib/letter-kit.ts). */
describe("the letters' look", () => {
  const TOKEN = "tok_abcdefghijklmnopqrstuvwx";
  const o = (locale: "ru" | "et" | "en" = "ru") => ({ business, origin: ORIGIN, token: TOKEN, locale });
  const all = (locale: "ru" | "et" | "en") => [
    visitLetter("confirmation", visit(), o(locale)),
    visitLetter("moved", visit(), { ...o(locale), from: { startsAt: new Date(at("2026-11-16", "12:00")).toISOString(), staffName: "Jevgeni" } }),
    visitLetter("cancelled", visit({ status: "cancelled" }), o(locale)),
    visitLetter("reminder", visit(), o(locale)),
    reviewLetter(visit({ status: "done" }), { business, origin: ORIGIN, locale }),
    noShowLetter(visit({ status: "no_show" }), { business, origin: ORIGIN, locale }),
    birthdayLetter({ locale, origin: ORIGIN, business, address: "Mardi 1, Tallinn", website: "www.rempire.ee" }),
    invoiceLetter(
      { kind: "invoice", number: "423", periodFrom: "2026-11-01", periodTo: "2026-11-30", dueOn: "2026-12-07", grossCents: 12345, sellerName: "REMPIRE OÜ" },
      { locale, origin: ORIGIN, pdf: { filename: "a.pdf", content: new Uint8Array() } },
    ),
  ];

  it("light and mail-safe: tables and inline styles, no SVG, no flex or grid, images with sizes from the app", () => {
    for (const locale of ["ru", "et", "en"] as const) {
      for (const l of [...all(locale), loginCodeLetter("042917", 10, ORIGIN)]) {
        expect(l.html).toMatch(/^<!doctype html>/);
        expect(l.html).toContain('<body bgcolor="#f2f2f2"');
        expect(l.html).toContain('<meta name="color-scheme" content="light only">');
        expect(l.html).toContain("max-width:600px");
        expect(l.html).toContain("border-radius:24px");
        expect(l.html).not.toMatch(/<svg|display:\s*(flex|grid)|#e9fc53|background-color:#000/i);
        // the thin REMPIRE on its dark disc, every picture with its size and alt text
        expect(l.html).toContain(`bgcolor="#060f07"`);
        expect(l.html).toContain(`${ORIGIN}/brand/rempire-logo-white.png`);
        for (const img of l.html.match(/<img [^>]*>/g) ?? []) {
          expect(img).toMatch(/ width="\d+"/);
          expect(img).toMatch(/ height="\d+"/);
          expect(img).toMatch(/ alt="[^"]*"/);
          expect(img).toMatch(new RegExp(`src="${ORIGIN}/(brand|mail)/[a-z-]+\\.png"`));
        }
        // nothing of another system
        expect(l.html).not.toMatch(/altegio|fresha|isolta/i);
      }
    }
  });

  it("the confirmation as drawn: pill, title, three buttons, details with prices, how to find us, the rule", () => {
    const l = confirmationLetter(visit({ startsAt: new Date(at("2026-11-20", "12:30")).toISOString(), endsAt: new Date(at("2026-11-20", "14:00")).toISOString() }), o());
    expect(l.html).toContain("Запись подтверждена");
    // «на пятницу»: the weekday after «на»; the time never alone on a line
    expect(l.html).toContain("Вы записаны на пятницу, 20 ноября, в 12:30");
    expect(l.html).toContain("Ждём вас в REMPIRE.");
    expect(l.html).toContain(`href="${ORIGIN}/ru/visit/${TOKEN}"`);
    expect(l.html).toContain(`href="${ORIGIN}/ru/visit/${TOKEN}/move"`);
    expect(l.html).toContain(`href="${ORIGIN}/api/ics/${TOKEN}?lang=ru"`);
    expect(l.html).toMatch(/Отменить<\/span>[\s\S]*Перенести<\/span>[\s\S]*Добавить в календарь<\/span>/);
    expect(l.html).toContain("Детали записи");
    expect(l.html).toContain("Пятница, 20 ноября");
    expect(l.html).toContain("12:30–14:00 · 1 ч 30 мин");
    expect(l.html).toMatch(/>Стрижка<\/td><td[^>]*>35 €<\/td>/);
    expect(l.html).toMatch(/>Итого<\/td><td[^>]*>35 €<\/td>/);
    expect(l.html).toContain("Цены по прайс-листу.");
    expect(l.html).toContain("Как нас найти");
    expect(l.html).toContain("https://www.google.com/maps/search/?api=1&amp;query=Mardi%201%2C%20Tallinn");
    expect(l.html).toContain("открыть карту");
    expect(l.html).toContain('href="tel:+37255550000"');
    expect(l.html).toContain("Письмо отправлено автоматически, отвечать на него не нужно.");
    expect(l.text).toContain("Вы записаны на пятницу, 20 ноября, в 12:30");
  });

  it("the weekday after «на» in Russian: среду, пятницу, субботу; the others as they are", () => {
    const on = (day: string) => visitLetter("confirmation", visit({ startsAt: new Date(at(day, "10:00")).toISOString(), endsAt: new Date(at(day, "11:00")).toISOString() }), o()).html;
    expect(on("2026-11-18")).toContain("на среду, 18 ноября");
    expect(on("2026-11-21")).toContain("на субботу, 21 ноября");
    expect(on("2026-11-17")).toContain("на вторник, 17 ноября");
    expect(on("2026-11-22")).toContain("на воскресенье, 22 ноября");
  });

  it("a special-time extra is a line of its own above the total", () => {
    const l = confirmationLetter(visit({ totalCents: 4500, extraCents: 1000 }), o("en"));
    expect(l.html).toMatch(/>Out-of-hours fee<\/td><td[^>]*>10 €<\/td>/);
    expect(l.html).toMatch(/>Total<\/td><td[^>]*>45 €<\/td>/);
  });

  it("moved: its pill, the new time in the title, the old one struck through", () => {
    const l = visitLetter("moved", visit(), { ...o(), from: { startsAt: new Date(at("2026-11-16", "12:00")).toISOString(), staffName: "Jevgeni" } });
    expect(l.html).toContain("Запись перенесена");
    expect(l.html).toContain("Ваша запись перенесена на вторник, 17 ноября, в 14:00");
    expect(l.html).toContain('Было: <span style="text-decoration:line-through;">Понедельник, 16 ноября, 12:00 · Jevgeni</span>');
    expect(l.text).toContain("Было: Понедельник, 16 ноября, 12:00 · Jevgeni");
  });

  it("cancelled: struck through in a dashed frame, «book again», the phone; no change link", () => {
    const l = visitLetter("cancelled", visit({ status: "cancelled" }), o());
    expect(l.html).toContain("Ваша запись на вторник, 17 ноября, в 14:00 отменена");
    expect(l.html).toContain("border:1px dashed");
    expect(l.html).toContain("text-decoration:line-through;\">Вторник, 17 ноября, 14:00–15:00");
    expect(l.html).toContain("Стрижка · Renat");
    expect(l.html).toContain(`href="${ORIGIN}/ru"`);
    expect(l.html).toContain("Записаться снова");
    expect(l.html).not.toContain("/visit/");
    expect(l.html).toContain("Если отмена — ошибка, позвоните нам.");
    expect(l.html).toContain('href="tel:+37255550000"');
    // with no phone there is nobody to call
    expect(visitLetter("cancelled", visit({ status: "cancelled", location: { name: "REMPIRE", address: "Mardi 1, Tallinn", phone: "" } }), o()).html).not.toContain("позвоните");
    expect(l.attachments[0].contentType).toContain("method=CANCEL");
  });

  it("the reminder: the time large on grey with the barber, one button, no calendar file", () => {
    const l = visitLetter("reminder", visit(), o("et"));
    expect(l.html).toContain("Meeldetuletus");
    expect(l.html).toContain("Peagi näeme REMPIRE&#39;is");
    expect(l.html).toMatch(/font-size:34px[^"]*">14:00–15:00/);
    expect(l.html).toContain(`href="${ORIGIN}/et/visit/${TOKEN}"`);
    expect(l.html).not.toContain("/api/ics/");
    expect(l.attachments).toEqual([]);
  });

  it("the review request: who and when, five stars and the button to the salon page's form; no client name", () => {
    for (const locale of ["ru", "et", "en"] as const) {
      const l = reviewLetter(visit({ status: "done", clientName: "Stored Name" }), { business, origin: ORIGIN, locale });
      expect(l.subject).toBe(letterSubject("review", locale));
      expect(letterSubject("review_request", locale)).toBe(l.subject);
      expect(l.html.match(new RegExp(`href="${ORIGIN}/${locale}/about#ab-reviews"`, "g"))?.length).toBe(6);
      expect(l.html.match(/star-fill\.png/g)).toHaveLength(5);
      expect(l.html).toContain("Renat");
      expect(l.html).not.toContain("Stored Name");
      expect(l.text).toContain(`${ORIGIN}/${locale}/about`);
    }
    expect(reviewLetter(visit(), { business, origin: ORIGIN, locale: "ru" }).html).toContain("Оцените визит в REMPIRE");
  });

  it("the footer: the salon, its address and its site as a link", () => {
    const l = confirmationLetter(visit({ location: { name: "REMPIRE", address: "Mardi 1, Tallinn", phone: "", website: "www.rempire.ee" } }), o());
    expect(l.html).toContain('REMPIRE · Mardi 1, Tallinn · <a href="https://www.rempire.ee"');
    expect(l.html).toContain(">www.rempire.ee</a>");
    // no phone: no phone row and no «позже по телефону»
    expect(l.html).not.toContain("tel:");
  });
});

/* «Дополнительная информация в Email»: the salon's own text in a letter of one kind. */
describe("the salon's own text in a letter", () => {
  const TOKEN = "tok_abcdefghijklmnopqrstuvwx";
  const extra = "Parking in the yard <b>free</b>.\nEnter from Mardi.\n\nMore: https://rempire.ee/kontakt.";

  it("under the details, escaped, its addresses links, its blank lines paragraphs; in the text part too", () => {
    const l = confirmationLetter(visit(), { business, origin: ORIGIN, token: TOKEN, locale: "en", extra });
    expect(l.html).toContain("Parking in the yard &lt;b&gt;free&lt;/b&gt;.<br>Enter from Mardi.</p>");
    expect(l.html).toContain('More: <a href="https://rempire.ee/kontakt" style="color:#262626;text-decoration:underline;word-break:break-all;">https://rempire.ee/kontakt</a>.</p>');
    expect(l.html).not.toContain("<b>free</b>");
    // after the details, before «how to find us»
    expect(l.html.indexOf("Parking in the yard")).toBeGreaterThan(l.html.indexOf("Booking details"));
    expect(l.html.indexOf("Parking in the yard")).toBeLessThan(l.html.indexOf("How to find us"));
    expect(l.text).toContain(extra);
  });

  it("in every kind that takes it, in each language", () => {
    for (const locale of ["ru", "et", "en"] as const) {
      const v = visit();
      for (const l of [
        visitLetter("confirmation", v, { business, origin: ORIGIN, token: TOKEN, locale, extra }),
        visitLetter("moved", v, { business, origin: ORIGIN, token: TOKEN, locale, extra }),
        visitLetter("cancelled", visit({ status: "cancelled" }), { business, origin: ORIGIN, token: TOKEN, locale, extra }),
        visitLetter("reminder", v, { business, origin: ORIGIN, token: TOKEN, locale, extra }),
        reviewLetter(v, { business, origin: ORIGIN, locale, extra }),
        noShowLetter(v, { business, origin: ORIGIN, locale, extra }),
        birthdayLetter({ locale, origin: ORIGIN, business, extra }),
      ])
        expect(l.html).toContain("Enter from Mardi.");
    }
  });

  it("none, empty or blank: nothing at all", () => {
    const none = confirmationLetter(visit(), { business, origin: ORIGIN, token: TOKEN, locale: "ru" }).html;
    expect(confirmationLetter(visit(), { business, origin: ORIGIN, token: TOKEN, locale: "ru", extra: " \n\n " }).html).toBe(none);
    expect(confirmationLetter(visit(), { business, origin: ORIGIN, token: TOKEN, locale: "ru", extra: null }).html).toBe(none);
    expect(extraBlock("")).toBe("");
    expect(richText("a\n\n\nb")).toBe(richText("a\n\nb"));
  });

  it("the page's preview swaps the mark for the text being typed", () => {
    const l = confirmationLetter(visit(), { business, origin: ORIGIN, token: TOKEN, locale: "ru", extra: EXTRA_MARK });
    expect(l.html.split(extraBlock(EXTRA_MARK))).toHaveLength(2);
    const typed = l.html.split(extraBlock(EXTRA_MARK)).join(extraBlock("Typed <i>here</i>"));
    expect(typed).toBe(confirmationLetter(visit(), { business, origin: ORIGIN, token: TOKEN, locale: "ru", extra: "Typed <i>here</i>" }).html);
    expect(l.html.split(extraBlock(EXTRA_MARK)).join(extraBlock(""))).toBe(confirmationLetter(visit(), { business, origin: ORIGIN, token: TOKEN, locale: "ru" }).html);
  });
});

describe("booking confirmation (A6)", () => {
  it("a booking with an e-mail queues one confirmation; a double tap does not add another", async () => {
    const i = input();
    const r = await book(query, demo.business, i, { now: NOW });
    if (!r.ok) throw new Error(r.code);
    expect(await confirmations(r.visit.id)).toEqual([{ status: "queued", recipient: "client@example.test", locale: "ru", last_error: null }]);
    const again = await book(query, demo.business, i, { now: NOW });
    expect(again.ok && again.replay).toBe(true);
    expect(await confirmations(r.visit.id)).toHaveLength(1);
  });

  it(`one address gets at most ${CONFIRMATIONS_PER_DAY} letters a day; the visits are booked anyway`, async () => {
    const times = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00"];
    const ids: string[] = [];
    for (const time of times) {
      const r = await book(query, demo.business, input({ time }), { now: NOW });
      if (!r.ok) throw new Error(`${time}: ${r.code}`);
      ids.push(r.visit.id);
    }
    const [q] = await query<{ n: number }>("select count(*)::int as n from notifications where kind = 'confirmation' and recipient = 'client@example.test'");
    expect(ids).toHaveLength(times.length);
    expect(q.n).toBe(CONFIRMATIONS_PER_DAY);
    expect(await confirmations(ids[times.length - 1])).toEqual([]);
    // a day later the address gets letters again
    const later = await book(query, demo.business, input({ time: "16:00" }), { now: NOW + 25 * 3_600_000 });
    if (!later.ok) throw new Error(later.code);
    expect(await confirmations(later.visit.id)).toHaveLength(1);
  });

  it("no e-mail, no letter", async () => {
    const r = await book(query, demo.business, input({ email: null }), { now: NOW });
    if (!r.ok) throw new Error(r.code);
    expect(await confirmations(r.visit.id)).toEqual([]);
  });

  it("sends the branded letter with its own working change link; the booking screen's link still works", async () => {
    const r = await book(query, demo.business, input({ locale: "en" }), { now: NOW });
    if (!r.ok) throw new Error(r.code);
    const res = await sendForVisit(query, r.visit.id, NOW, DEV);
    expect(res.sent).toBe(1);
    expect(await confirmations(r.visit.id)).toMatchObject([{ status: "sent" }]);

    const letter = sentToConsole[sentToConsole.length - 1];
    expect(letter.to).toBe("client@example.test");
    expect(letter.subject).toBe("You're booked at REMPIRE: 17.11, 10:00");
    expect(letter.html).toContain("REMPIRE");
    expect(letter.attachments?.[0].content).toContain("BEGIN:VEVENT");

    const token = /\/en\/visit\/([A-Za-z0-9_-]+)/.exec(letter.text)?.[1] ?? "";
    expect(token).not.toBe(r.manageToken);
    expect((await findVisit(query, demo.business.id, token))?.id).toBe(r.visit.id);
    expect((await findVisit(query, demo.business.id, r.manageToken!))?.id).toBe(r.visit.id);
    // only the hash is kept
    const [link] = await query<{ token_hash: string; purpose: string }>("select token_hash, purpose from visit_links where appointment_id = $1", [r.visit.id]);
    expect(link.purpose).toBe("email");
    expect(link.token_hash).not.toContain(token);

    // the letter's link can cancel, like the booking screen's
    expect(await cancelByClient(demo.business, token, NOW)).toBe("cancelled");
    expect(await cancelByClient(demo.business, r.manageToken!, NOW)).toBe("already");
  });

  it("a visit cancelled before the letter went gets no letter", async () => {
    const r = await book(query, demo.business, input(), { now: NOW });
    if (!r.ok) throw new Error(r.code);
    expect(await cancelByClient(demo.business, r.manageToken!, NOW)).toBe("cancelled");
    const res = await sendForVisit(query, r.visit.id, NOW, DEV);
    expect(res).toMatchObject({ sent: 0, skipped: 1 });
    expect(await confirmations(r.visit.id)).toMatchObject([{ status: "skipped", last_error: "visit cancelled" }]);
    expect(sentToConsole).toHaveLength(0);
  });

  it("with no e-mail provider in production the row waits; the cron sends it once there is one", async () => {
    const r = await book(query, demo.business, input(), { now: NOW });
    if (!r.ok) throw new Error(r.code);
    expect(await sendForVisit(query, r.visit.id, NOW, PROD)).toMatchObject({ sent: 0, skipped: 0 });
    expect(await confirmations(r.visit.id)).toMatchObject([{ status: "queued" }]);
    const run = await runOutbox(query, NOW + 60_000, DEV);
    expect(run.sent).toBe(1);
    expect(await confirmations(r.visit.id)).toMatchObject([{ status: "sent" }]);
  });

  it("sendForVisit touches only its own visit", async () => {
    const a = await book(query, demo.business, input({ time: "10:00" }), { now: NOW });
    const b = await book(query, demo.business, input({ time: "12:00", phone: "+372 5555 0102" }), { now: NOW });
    if (!a.ok || !b.ok) throw new Error("booking failed");
    await sendForVisit(query, a.visit.id, NOW, DEV);
    expect(await confirmations(a.visit.id)).toMatchObject([{ status: "sent" }]);
    expect(await confirmations(b.visit.id)).toMatchObject([{ status: "queued" }]);
  });
});
