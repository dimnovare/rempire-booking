import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { book, CONFIRMATIONS_PER_DAY, type BookingInput } from "@/lib/booking";
import { closeDb, query } from "@/lib/db";
import { sentToConsole } from "@/lib/email";
import { confirmationLetter, loginCodeLetter } from "@/lib/letters";
import { runOutbox, sendForVisit } from "@/lib/outbox";
import { zonedToUtc } from "@/lib/tz";
import { cancelByClient, findVisit, type VisitView } from "@/lib/visits";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
// Monday 16.11.2026, 10:00 in Tallinn
const NOW = at("2026-11-16", "10:00");
const TUE = "2026-11-17";
const DEV = { NODE_ENV: "test", VITEST: "true" };
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
