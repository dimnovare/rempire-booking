/**
 * The client messages added 20.11.2026 (Dim: «All three now, as Altegio
 * does»; docs/altegio-pages.md, «Уведомления, per type»): the e-mail
 * reminder 12 hours before, the birthday greeting at 10:00, and the
 * invitation after a no-show. Fake clients and addresses only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminCancelVisit, adminCreateVisit, adminSetStatus, adminUpdateVisit } from "@/lib/admin/visits";
import { birthdayMatch, isBirthdayOn } from "@/lib/birthday";
import { book, type BookingInput } from "@/lib/booking";
import { saveClientSubscription } from "@/lib/client-push";
import { closeDb, query } from "@/lib/db";
import { sendEmail, sentToConsole } from "@/lib/email";
import { birthdayLetter, noShowLetter, visitLetter } from "@/lib/letters";
import { messageText, OUTBOX, planBirthdays, planEmailReminders, planNoShow, runOutbox, sendForVisit, type Senders } from "@/lib/outbox";
import { clientPushText, type PushText } from "@/lib/push-kinds";
import { DEFAULT_SETTINGS, readSettings } from "@/lib/settings";
import { sendSms, sentSms, smsSegments } from "@/lib/sms";
import { zonedToUtc } from "@/lib/tz";
import type { VisitView } from "@/lib/visits";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
// Monday 16.11.2026, 10:00 in Tallinn
const NOW = at("2026-11-16", "10:00");
const TUE = "2026-11-17";
// test values only: pushConfigured() needs both, the phones are mocked
const KEYS = { VAPID_PUBLIC_KEY: "test-public-key", VAPID_PRIVATE_KEY: "test-private-key" };
const DEV = { NODE_ENV: "test", VITEST: "true", ALLOW_INDEXING: "yes" };
const ENV = { ...DEV, ...KEYS };
const ORIGIN = "https://rempire-booking.diipsolutions.eu";
const PHONE = { endpoint: "https://fcm.googleapis.com/fcm/send/test-client-messages-0001", p256dh: "p256dh-test", auth: "auth-test", label: "Android" };

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
  sentSms.length = 0;
  sentToConsole.length = 0;
  told.length = 0;
});
afterAll(closeDb);

let n = 0;
const input = (o: Partial<BookingInput> & { time?: string; date?: string } = {}): BookingInput => ({
  serviceIds: [demo.services.clip],
  staffId: demo.staff.renat,
  startsAt: new Date(at(o.date ?? TUE, o.time ?? "12:00")).toISOString(),
  name: "Test Client",
  phone: o.phone ?? "+372 5555 0601",
  email: o.email === undefined ? "client@example.test" : o.email,
  comment: "",
  locale: o.locale ?? "ru",
  smsReminder: false,
  idempotencyKey: `client-messages-${++n}-${Math.random()}`,
});
/** An online booking whose confirmation letter has gone. */
async function booked(o: Parameters<typeof input>[0] = {}, now = NOW) {
  const r = await book(query, demo.business, input(o), { now });
  if (!r.ok) throw new Error(`booking failed: ${r.code}`);
  if (r.visit && input(o).email) await sendForVisit(query, r.visit.id, now, DEV);
  return r.visit.id;
}
const rows = (kind: string) =>
  query<{ id: string; channel: string; status: string; send_at: Date; recipient: string; locale: string; client_id: string | null; last_error: string | null }>(
    "select id, channel, status, send_at, recipient, locale, client_id, last_error from notifications where kind = $1 order by channel, created_at, recipient",
    [kind],
  );
const setting = (patch: Record<string, unknown>) => query("update businesses set settings = settings || $1::jsonb where id = $2", [JSON.stringify(patch), demo.business.id]);
const business = async () => ({ ...demo.business, settings: readSettings((await query<{ settings: unknown }>("select settings from businesses where id = $1", [demo.business.id]))[0].settings) });

// the phones a client notification was sent to, per visit
const told: { visitId: string; msg: PushText }[] = [];
const senders: Senders = {
  sms: sendSms,
  email: sendEmail,
  pushClient: async (_q, visitId, msg) => {
    told.push({ visitId, msg });
    return { devices: 1, sent: 1, failed: 0, gone: 0 };
  },
};

describe("the switches", () => {
  it("each new message is on by default, the e-mail 12 hours before; Renat can switch each off", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ reminder_email_min: 720, email_reminder_on: true, birthday_on: true, no_show_on: true });
    expect(readSettings({ reminder_email_min: 600, birthday_on: false })).toMatchObject({ reminder_email_min: 600, birthday_on: false, no_show_on: true });
    // out of bounds or of the wrong kind: the default
    expect(readSettings({ reminder_email_min: 5, no_show_on: "no", email_reminder_on: 0 })).toMatchObject({ reminder_email_min: 720, no_show_on: true, email_reminder_on: true });
    expect(readSettings({ reminder_email_min: 49 * 60 }).reminder_email_min).toBe(720);
  });
});

describe("e-mail reminder (type 1: 12 hours before)", () => {
  it("planned once the confirmation went, to its address, in its language; sent at its time, with the change link", async () => {
    const r = await book(query, demo.business, input({ locale: "et" }), { now: NOW });
    if (!r.ok) throw new Error(r.code);
    // the confirmation has not gone yet: nothing
    expect(await planEmailReminders(query, NOW)).toEqual({ added: 0, cancelled: 0 });
    await sendForVisit(query, r.visit.id, NOW, DEV);
    expect(await planEmailReminders(query, NOW)).toEqual({ added: 1, cancelled: 0 });
    expect(await planEmailReminders(query, NOW)).toEqual({ added: 0, cancelled: 0 });
    const [row] = await rows("reminder_email");
    expect(row).toMatchObject({ channel: "email", status: "queued", recipient: "client@example.test", locale: "et" });
    expect(row.send_at.getTime()).toBe(at(TUE, "00:00"));

    sentToConsole.length = 0;
    expect((await runOutbox(query, at(TUE, "00:00"), DEV)).sent).toBe(1);
    const [letter] = sentToConsole;
    expect(letter.to).toBe("client@example.test");
    expect(letter.subject).toBe("Meeldetuletus: REMPIRE 17.11 kell 12:00");
    expect(letter.html).toContain(`${ORIGIN}/et/visit/`);
    expect(letter.html).toContain("Peagi näeme");
    expect(letter.html).not.toContain("Test Client");
    expect(letter.attachments ?? []).toHaveLength(0);
    expect((await rows("reminder_email"))[0].status).toBe("sent");
  });

  it("a moved visit gets it at the new time; a cancelled one loses it", async () => {
    const id = await booked();
    await planEmailReminders(query, NOW);
    expect((await adminUpdateVisit(demo.business, id, { start: at(TUE, "15:00") }, "test")).ok).toBe(true);
    expect(await planEmailReminders(query, NOW)).toEqual({ added: 1, cancelled: 1 });
    const after = await rows("reminder_email");
    expect(after.map((x) => x.status)).toEqual(["cancelled", "queued"]);
    expect(after[1].send_at.getTime()).toBe(at(TUE, "03:00"));
    expect(await adminCancelVisit(demo.business, id, "test")).toBe("cancelled");
    expect(await planEmailReminders(query, NOW)).toEqual({ added: 0, cancelled: 1 });
  });

  it("none for a visit booked after its time: the confirmation has just told it", async () => {
    const late = at(TUE, "08:00");
    await booked({}, late);
    expect(await planEmailReminders(query, late)).toEqual({ added: 0, cancelled: 0 });
  });

  it("follows the business's lead and switch, and the client's «reminder»", async () => {
    const id = await booked();
    await planEmailReminders(query, NOW);
    await setting({ reminder_email_min: 600 });
    expect(await planEmailReminders(query, NOW)).toEqual({ added: 1, cancelled: 1 });
    expect((await rows("reminder_email"))[1].send_at.getTime()).toBe(at(TUE, "02:00"));

    await setting({ email_reminder_on: false });
    expect(await planEmailReminders(query, NOW)).toEqual({ added: 0, cancelled: 1 });
    await setting({ email_reminder_on: true });
    expect((await planEmailReminders(query, NOW)).added).toBe(1);

    await query("update clients set notify_off = '{reminder}' where id = (select client_id from appointments where id = $1)", [id]);
    expect(await planEmailReminders(query, NOW)).toEqual({ added: 0, cancelled: 1 });
  });
});

describe("birthday greeting (type 3: 10:00 on the day)", () => {
  const DAY = "2026-11-20";
  async function client(o: { name: string; phone: string | null; email?: string | null; locale?: string; day: number; month: number; year?: number | null }) {
    const [c] = await query<{ id: string }>(
      `insert into clients (business_id, name, phone_e164, email, locale, birth_day, birth_month, birth_year)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [demo.business.id, o.name, o.phone, o.email ?? null, o.locale ?? "ru", o.day, o.month, o.year ?? null],
    );
    return c.id;
  }

  it("from 10:00: the letter at once, the SMS 40 minutes later as the fallback; once a day", async () => {
    await client({ name: "Fake Mail", phone: "+37255550401", email: "mail@example.test", day: 20, month: 11, year: 1990 });
    await client({ name: "Fake Phone", phone: "+37255550402", locale: "en", day: 20, month: 11 });
    await client({ name: "Fake Tomorrow", phone: "+37255550403", day: 21, month: 11 });
    expect(await planBirthdays(query, at(DAY, "09:59"))).toBe(0);
    expect(await planBirthdays(query, at(DAY, "10:00"))).toBe(3);
    expect(await planBirthdays(query, at(DAY, "10:05"))).toBe(0);
    const planned = await rows("birthday");
    expect(planned.map((r) => [r.channel, r.recipient, new Date(r.send_at).getTime()])).toEqual([
      ["email", "mail@example.test", at(DAY, "10:00")],
      // the first has a letter coming: his SMS waits for it
      ["sms", "+37255550401", at(DAY, "10:00") + OUTBOX.fallbackMin * 60_000],
      // nothing else reaches the second: his SMS goes at once
      ["sms", "+37255550402", at(DAY, "10:00")],
    ]);

    await runOutbox(query, at(DAY, "10:00"), DEV);
    expect(sentToConsole.map((l) => [l.to, l.subject])).toEqual([["mail@example.test", "С днём рождения от REMPIRE!"]]);
    expect(sentToConsole[0].html).toContain(`${ORIGIN}/ru`);
    expect(sentToConsole[0].html).not.toContain("Fake Mail");
    expect(sentSms).toEqual([{ to: "+37255550402", text: `Happy birthday from REMPIRE! Wishing you a great year ahead. Book your next visit: ${ORIGIN}/en` }]);
    expect(smsSegments(sentSms[0].text)).toMatchObject({ encoding: "gsm7", segments: 1 });

    // the letter went, so his SMS does not
    await runOutbox(query, at(DAY, "10:41"), DEV);
    expect(sentSms).toHaveLength(1);
    expect((await rows("birthday")).find((r) => r.recipient === "+37255550401")).toMatchObject({ status: "skipped", last_error: "sent by email" });
  });

  it("the SMS goes when the letter could not", async () => {
    await client({ name: "Fake Mail", phone: "+37255550401", email: "mail@example.test", day: 20, month: 11 });
    await planBirthdays(query, at(DAY, "10:00"));
    await query("update notifications set status = 'failed' where kind = 'birthday' and channel = 'email'");
    await runOutbox(query, at(DAY, "10:41"), DEV);
    expect(sentSms.map((s) => s.to)).toEqual(["+37255550401"]);
  });

  it("the notification goes to the phones of his latest visit, and opens the booking page", async () => {
    const id = await client({ name: "Fake Push", phone: "+37255550601", day: 20, month: 11 });
    const visit = await booked({ email: null });
    expect((await query<{ client_id: string }>("select client_id from appointments where id = $1", [visit]))[0].client_id).toBe(id);
    await saveClientSubscription(query, demo.business.id, visit, PHONE);
    expect(await planBirthdays(query, at(DAY, "10:00"))).toBe(2);
    await runOutbox(query, at(DAY, "10:00"), ENV, senders);
    expect(told).toEqual([
      { visitId: visit, msg: { title: "REMPIRE", body: "С днём рождения! Желаем отличного года, ждём вас в гости.", url: "/ru", tag: `birthday-${DAY}` } },
    ]);
    await runOutbox(query, at(DAY, "10:41"), ENV, senders);
    expect(sentSms).toHaveLength(0);
    expect((await rows("birthday")).map((r) => [r.channel, r.status, r.last_error])).toEqual([
      ["push", "sent", null],
      ["sms", "skipped", "sent by push"],
    ]);
  });

  it("29 February is greeted on the 28th in a year without it", async () => {
    await client({ name: "Fake Leap", phone: "+37255550404", day: 29, month: 2, year: 2000 });
    expect(await planBirthdays(query, at("2027-02-28", "10:00"))).toBe(1);
    expect(await planBirthdays(query, at("2028-02-28", "10:00"))).toBe(0);
    expect(await planBirthdays(query, at("2028-02-29", "10:00"))).toBe(1);
    expect(birthdayMatch("2027-02-28")).toEqual({ month: 2, day: 28, feb29: true });
    expect(birthdayMatch("2028-02-28")).toEqual({ month: 2, day: 28, feb29: false });
    expect(isBirthdayOn({ day: 29, month: 2 }, "2027-02-28")).toBe(true);
    expect(isBirthdayOn({ day: 29, month: 2 }, "2028-02-28")).toBe(false);
    expect(isBirthdayOn({ day: 28, month: 2 }, "2027-02-28")).toBe(true);
  });

  it("not for a client who refused it, a channel he does not take, or with the business's switch off", async () => {
    const refused = await client({ name: "Fake No", phone: "+37255550405", email: "no@example.test", day: 20, month: 11 });
    await query("update clients set notify_off = '{birthday}' where id = $1", [refused]);
    const noMail = await client({ name: "Fake No Mail", phone: "+37255550406", email: "nomail@example.test", day: 20, month: 11 });
    await query("update clients set email_opt_out = true where id = $1", [noMail]);
    expect(await planBirthdays(query, at(DAY, "10:00"))).toBe(1);
    expect((await rows("birthday")).map((r) => [r.channel, r.recipient])).toEqual([["sms", "+37255550406"]]);

    await query("delete from notifications");
    await setting({ birthday_on: false });
    expect(await planBirthdays(query, at(DAY, "10:00"))).toBe(0);
  });

  it("a letter that waited past the day is not sent", async () => {
    await client({ name: "Fake Mail", phone: null, email: "mail@example.test", day: 20, month: 11 });
    await planBirthdays(query, at(DAY, "10:00"));
    await runOutbox(query, at("2026-11-21", "10:00"), DEV);
    expect(sentToConsole).toHaveLength(0);
    expect((await rows("birthday"))[0]).toMatchObject({ status: "skipped", last_error: "not the day any more" });
  });
});

describe("«Приглашение недошедших» (type 72)", () => {
  const LATER = at(TUE, "12:30");
  const SEND = LATER + OUTBOX.noShowDelayMin * 60_000;
  async function noShow() {
    const id = await booked();
    await saveClientSubscription(query, demo.business.id, id, PHONE);
    await query("update appointments set status = 'no_show' where id = $1", [id]);
    return id;
  }

  it("e-mail, notification and SMS, a little after the status; each once", async () => {
    const id = await noShow();
    expect(await planNoShow(query, await business(), id, "no_show", LATER)).toBe(3);
    expect(await planNoShow(query, await business(), id, "no_show", LATER)).toBe(0);
    const planned = await rows("no_show");
    expect(planned.map((r) => [r.channel, r.recipient, r.locale])).toEqual([
      ["email", "client@example.test", "ru"],
      ["push", id, "ru"],
      ["sms", "+37255550601", "ru"],
    ]);
    expect(planned.every((r) => new Date(r.send_at).getTime() === SEND)).toBe(true);

    sentToConsole.length = 0;
    expect((await runOutbox(query, SEND, ENV, senders)).sent).toBe(3);
    expect(sentToConsole).toHaveLength(1);
    expect(sentToConsole[0]).toMatchObject({ to: "client@example.test", subject: "Мы вас ждали в REMPIRE" });
    expect(sentToConsole[0].text).toContain("Вы не пришли на запись вторник, 17 ноября, 12:00.");
    expect(sentToConsole[0].text).toContain(`Записаться снова: ${ORIGIN}/ru`);
    expect(sentToConsole[0].html).not.toContain("/visit/");
    expect(told).toEqual([{ visitId: id, msg: { title: "REMPIRE", body: "Мы ждали вас 17.11 в 12:00. Запишитесь на новое время.", url: "/ru", tag: `no-show-${id}` } }]);
    expect(sentSms).toEqual([{ to: "+37255550601", text: `REMPIRE: we missed you on 17.11 at 12:00. Book a new time: ${ORIGIN}/ru` }]);
    expect(smsSegments(sentSms[0].text).segments).toBe(1);
    // sent: marking it again sends nothing more
    await planNoShow(query, await business(), id, "booked", LATER);
    expect(await planNoShow(query, await business(), id, "no_show", LATER)).toBe(0);
  });

  it("the status back before it went drops it; a no-show again invites again", async () => {
    const id = await noShow();
    await planNoShow(query, await business(), id, "no_show", LATER);
    await planNoShow(query, await business(), id, "booked", LATER);
    expect((await rows("no_show")).map((r) => r.status)).toEqual(["cancelled", "cancelled", "cancelled"]);
    expect(await planNoShow(query, await business(), id, "no_show", LATER)).toBe(3);
  });

  it("a status changed some other way is caught at send time", async () => {
    const id = await noShow();
    await planNoShow(query, await business(), id, "no_show", LATER);
    await query("update appointments set status = 'arrived' where id = $1", [id]);
    expect((await runOutbox(query, SEND, ENV, senders)).skipped).toBe(3);
    expect((await rows("no_show")).map((r) => r.last_error)).toEqual(["visit arrived", "visit arrived", "visit arrived"]);
  });

  it("none for a visit still to come, one long past, with the switch off, or a client who refused it", async () => {
    const id = await noShow();
    expect(await planNoShow(query, await business(), id, "no_show", at(TUE, "11:00"))).toBe(0);
    expect(await planNoShow(query, await business(), id, "no_show", at("2026-11-25", "12:00"))).toBe(0);
    await setting({ no_show_on: false });
    expect(await planNoShow(query, await business(), id, "no_show", LATER)).toBe(0);
    await setting({ no_show_on: true });
    await query("update clients set notify_off = '{no_show}' where id = (select client_id from appointments where id = $1)", [id]);
    expect(await planNoShow(query, await business(), id, "no_show", LATER)).toBe(0);
  });

  it("from the admin's and the barber app's status change (adminSetStatus)", async () => {
    // a walk-in an hour ago, by the admin, on the real clock
    const start = Math.floor((Date.now() - 3_600_000) / 300_000) * 300_000;
    const r = await adminCreateVisit(
      demo.business,
      { staffId: demo.staff.renat, start, force: true, serviceIds: [demo.services.clip], clientId: null, name: "Walk In", phone: "+372 5555 0699", smsReminder: false, idempotencyKey: `no-show-${Math.random()}` },
      "test",
    );
    if (!r.ok) throw new Error(`booking failed: ${JSON.stringify(r)}`);
    expect(await adminSetStatus(demo.business, r.id, "no_show", "test")).toBe(true);
    expect((await rows("no_show")).map((x) => [x.channel, x.status])).toEqual([["sms", "queued"]]);
    expect(await adminSetStatus(demo.business, r.id, "booked", "test")).toBe(true);
    expect((await rows("no_show")).map((x) => x.status)).toEqual(["cancelled"]);
    expect(await adminSetStatus(demo.business, r.id, "no_show", "test")).toBe(true);
    expect(await adminSetStatus(demo.business, r.id, "arrived", "test")).toBe(true);
    expect((await rows("no_show")).map((x) => x.status)).toEqual(["cancelled", "cancelled"]);
  });
});

describe("the words", () => {
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
    clientName: "Fake Name",
    locale: "ru",
    reminder: false,
    services: [{ serviceId: "x", name: { ru: "Стрижка", et: "Lõikus", en: "Haircut" }, durationMin: 60, priceCents: 3500 }],
    location: { name: "REMPIRE", address: "Mardi 1, Tallinn", phone: "+372 5555 0000" },
    ...o,
  });
  const b = { name: "REMPIRE", timezone: TZ, settings: DEFAULT_SETTINGS };

  it("the reminder letter in three languages, without the client's name", () => {
    expect(visitLetter("reminder", visit(), { business: b, origin: ORIGIN, token: "t".repeat(32), locale: "ru" }).subject).toBe("Напоминание о записи в REMPIRE: 17.11, 14:00");
    const en = visitLetter("reminder", visit(), { business: b, origin: ORIGIN, token: "t".repeat(32), locale: "en" });
    expect(en.subject).toBe("Reminder: your REMPIRE visit on 17.11 at 14:00");
    expect(en.text).toContain(`${ORIGIN}/en/visit/${"t".repeat(32)}`);
    expect(en.html).not.toContain("Fake Name");
    expect(en.attachments).toEqual([]);
  });

  it("the no-show and birthday letters", () => {
    const en = noShowLetter(visit({ status: "no_show" }), { business: b, origin: ORIGIN, locale: "en" });
    expect(en.subject).toBe("We missed you at REMPIRE");
    expect(en.text).toContain("You did not make it to your visit on Tuesday 17 November, 14:00.");
    expect(en.text).toContain(`Book a new time: ${ORIGIN}/en`);
    expect(en.html).not.toContain("Fake Name");
    expect(noShowLetter(visit(), { business: b, origin: ORIGIN, locale: "et" }).text).toContain("Sa ei jõudnud oma ajale teisipäev, 17. november, 14:00.");
    const et = birthdayLetter({ locale: "et", origin: ORIGIN, business: b, address: "Mardi 1, Tallinn" });
    expect(et.subject).toBe("Palju õnne sünnipäevaks, soovib REMPIRE!");
    expect(et.html).toContain(`${ORIGIN}/et`);
    expect(et.html).toContain("REMPIRE · Mardi 1, Tallinn");
  });

  it("the notifications, in the client's language", () => {
    expect(clientPushText("birthday", { date: "2026-11-20" }, "en")).toEqual({ title: "REMPIRE", body: "Happy birthday! Wishing you a great year, see you soon.", url: "/en", tag: "birthday-2026-11-20" });
    expect(clientPushText("no_show", { startsAt: new Date(at(TUE, "14:00")).toISOString(), tz: TZ, visitId: "v1" }, "et")?.body).toBe("Ootasime sind 17.11 kell 14:00. Broneeri uus aeg.");
    expect(clientPushText("no_show", {}, "ru")).toBeNull();
  });

  it("every SMS is English and one part, with the longest address the app may get", () => {
    const origin = "https://broneeri.rempire.ee";
    const startsAt = new Date(at(TUE, "14:00")).toISOString();
    const reminder = messageText(
      { kind: "reminder", locale: "ru", payload: { startsAt, tz: TZ, staff: "Valentin", business: "REMPIRE", address: "Mardi 1, Tallinn" } },
      `${ORIGIN}/v/${"x".repeat(16)}`,
    )!;
    expect(reminder).toBe(`REMPIRE: reminder of your visit on 17.11 at 14:00 with Valentin. Mardi 1, Tallinn. Change or cancel: ${ORIGIN}/v/${"x".repeat(16)}`);
    expect(smsSegments(reminder)).toMatchObject({ encoding: "gsm7", segments: 1 });
    // a name that would cost UCS-2 or a second part: the address goes first, then the name
    const long = messageText({ kind: "reminder", locale: "et", payload: { startsAt, tz: TZ, staff: "A Very Long Barber Name Indeed", business: "REMPIRE", address: "Mardi 1, Tallinn" } }, `${ORIGIN}/v/${"x".repeat(16)}`)!;
    expect(long).not.toContain("Mardi");
    expect(smsSegments(long).segments).toBe(1);
    const cyrillic = messageText({ kind: "reminder", locale: "ru", payload: { startsAt, tz: TZ, staff: "Ренат", business: "REMPIRE" } }, `${ORIGIN}/v/${"x".repeat(16)}`)!;
    expect(cyrillic).toBe(`REMPIRE: reminder of your visit on 17.11 at 14:00. Change or cancel: ${ORIGIN}/v/${"x".repeat(16)}`);
    for (const kind of ["birthday", "no_show"]) {
      const text = messageText({ kind, locale: "ru", payload: { startsAt, tz: TZ, business: "REMPIRE" } }, `${origin}/ru`)!;
      expect(smsSegments(text)).toMatchObject({ encoding: "gsm7", segments: 1 });
    }
  });
});
