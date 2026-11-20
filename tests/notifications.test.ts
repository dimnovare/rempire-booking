/**
 * «Настройки → Уведомления» (decision page round 11): the rules
 * (src/lib/admin/notifications.ts), the SMS words (notification-text.ts),
 * the save (notification-store.ts) and what the outbox does with them.
 * The first rule of all: nothing stored is today's behaviour, exactly.
 * Fake clients, phones and addresses only; SMS and letters go to the
 * console transports.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { notifyMay, loadSample, previews, saveType, transports, typeDetail, typeRows } from "@/lib/admin/notification-store";
import { checkTemplate, DEFAULT_SMS, renderSms, smsCount, smsWords, standardSms, tokensIn } from "@/lib/admin/notification-text";
import {
  applyChange,
  atOf,
  channelOn,
  cleanStored,
  NOTIFY_DEFAULTS,
  noShowDelay,
  readNotify,
  sends,
  sendsKind,
  timing,
  TYPE_KEYS,
  TYPES,
  typeOn,
  typeOfKind,
} from "@/lib/admin/notifications";
import { adminCreateVisit, type AdminVisitInput } from "@/lib/admin/visits";
import { loadHolder, backfillRights } from "@/lib/auth/rights-store";
import { book, type BookingInput } from "@/lib/booking";
import { closeDb, query } from "@/lib/db";
import { sentToConsole } from "@/lib/email";
import { messageText, OUTBOX, planBirthdays, planEveningPush, planNoShow, planReminders, runOutbox, sendForVisit } from "@/lib/outbox";
import { saveSubscription } from "@/lib/push";
import { DEFAULT_SETTINGS, readSettings } from "@/lib/settings";
import { sentSms, smsSegments } from "@/lib/sms";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const NOW = at("2026-11-16", "10:00");
const TUE = "2026-11-17";
const DEV = { NODE_ENV: "test", VITEST: "true", ALLOW_INDEXING: "yes" };
const ORIGIN = "https://rempire-booking.diipsolutions.eu";

let demo: Demo;
let owner: string;
let desk: string;
beforeEach(async () => {
  demo = await freshDemo();
  sentSms.length = 0;
  sentToConsole.length = 0;
  await query("delete from users where business_id = $1", [demo.business.id]).catch(() => []);
  const add = async (email: string, role: string) => (await query<{ id: string }>("insert into users (business_id, email, name, role) values ($1, $2, $3, $4) returning id", [demo.business.id, email, email.split("@")[0], role]))[0].id;
  owner = await add("owner@example.test", "owner");
  desk = await add("desk@example.test", "admin");
  await backfillRights(query, demo.business.id);
});
afterAll(closeDb);

const me = async (id = owner) => (await loadHolder(query, demo.business.id, id))!;
const stored = async () => (await query<{ settings: Record<string, unknown> }>("select settings from businesses where id = $1", [demo.business.id]))[0].settings;

let n = 0;
const visit = async (o: Partial<AdminVisitInput> & { time?: string } = {}) => {
  const r = await adminCreateVisit(
    demo.business,
    {
      staffId: demo.staff.renat,
      start: at(TUE, o.time ?? "12:00"),
      serviceIds: [demo.services.clip],
      clientId: null,
      name: "Test Client",
      phone: "+372 5555 0701",
      smsReminder: true,
      idempotencyKey: `notifications-${++n}-${Math.random()}`,
    },
    "test",
  );
  if (!r.ok) throw new Error(`booking failed: ${JSON.stringify(r)}`);
  return r.id;
};
const rows = (kind: string) =>
  query<{ channel: string; status: string; send_at: Date; last_error: string | null; payload: Record<string, unknown> }>(
    "select channel, status, send_at, last_error, payload from notifications where kind = $1 order by channel, created_at",
    [kind],
  );

/* ---------------------------------------------------------------- nothing stored */

describe("nothing stored is today's behaviour", () => {
  const ns = readNotify({});

  it("every type and channel on, the settings' defaults, the hours and delays of before", () => {
    for (const t of TYPES) {
      expect(typeOn(ns, t.key), t.key).toBe(true);
      for (const ch of t.channels) expect(channelOn(ns, t.key, ch), `${t.key}.${ch}`).toBe(true);
    }
    expect(ns.base).toEqual(DEFAULT_SETTINGS);
    expect(ns.stored).toEqual({ off: [], sms: {}, at: {}, delay: {} });
    expect(timing(ns, "reminder", "sms")).toEqual({ kind: "lead", min: 120 });
    expect(timing(ns, "reminder", "email")).toEqual({ kind: "lead", min: 720 });
    expect(timing(ns, "reminder", "push")).toEqual({ kind: "withSms", min: 120 });
    expect(timing(ns, "birthday", "email")).toEqual({ kind: "at", time: "10:00" });
    expect(timing(ns, "birthday", "sms")).toEqual({ kind: "fallback", time: "10:00", min: 40 });
    expect(timing(ns, "no_show", "sms")).toEqual({ kind: "delay", min: 2 });
    expect(timing(ns, "moved", "email")).toEqual({ kind: "delay", min: 2 });
    expect(timing(ns, "day_plan", "push")).toEqual({ kind: "at", time: "20:00" });
    expect(timing(ns, "visit_new", "push")).toEqual({ kind: "now" });
    // the outbox takes its hours and delays from the same defaults
    expect([OUTBOX.planAt, OUTBOX.birthdayAt, OUTBOX.fallbackMin, OUTBOX.noShowDelayMin]).toEqual(["20:00", "10:00", 40, 2]);
    expect(atOf(ns, "own_plan")).toBe("20:00");
    expect(noShowDelay(ns)).toBe(NOTIFY_DEFAULTS.noShowDelayMin);
  });

  it("the old flat switches still decide, as before the page", () => {
    const old = readNotify({ email_reminder_on: false, birthday_on: false, no_show_on: false, client_reminder: "sms" });
    expect(sends(old, "reminder", "email")).toBe(false);
    expect(sends(old, "reminder", "sms")).toBe(true);
    expect(sends(old, "reminder", "push")).toBe(false);
    expect(sends(old, "birthday", "email")).toBe(false);
    expect(sends(old, "no_show", "sms")).toBe(false);
    expect(sends(readNotify({ client_reminder: "push" }), "reminder", "push")).toBe(true);
  });

  it("a kind with no switch here always goes: login codes, invoices, hand-written and mass messages", () => {
    const off = readNotify({ notifications: { off: TYPE_KEYS } });
    for (const kind of ["login_code", "invoice", "manual", "mass"]) expect(sendsKind(off, kind, "email"), kind).toBe(true);
    expect(sendsKind(off, "confirmation", "email")).toBe(false);
    expect(typeOfKind("reminder_email")).toBe("reminder");
    expect(typeOfKind("client_reminder")).toBe("reminder");
    expect(typeOfKind("manual")).toBeUndefined();
  });

  it("the standard SMS words are exactly the outbox's of before", () => {
    const link = `${ORIGIN}/v/${"x".repeat(16)}`;
    const v = { salon: "REMPIRE", date: "17.11", time: "14:00", master: "Valentin", address: "Mardi 1, Tallinn", link };
    expect(standardSms("reminder", v)).toBe(`REMPIRE: reminder of your visit on 17.11 at 14:00 with Valentin. Mardi 1, Tallinn. Change or cancel: ${link}`);
    expect(standardSms("reminder", { ...v, master: "Ренат", address: "" })).toBe(`REMPIRE: reminder of your visit on 17.11 at 14:00. Change or cancel: ${link}`);
    expect(standardSms("birthday", { salon: "REMPIRE", link: `${ORIGIN}/en` })).toBe(`Happy birthday from REMPIRE! Wishing you a great year ahead. Book your next visit: ${ORIGIN}/en`);
    expect(standardSms("no_show", { salon: "REMPIRE", date: "17.11", time: "12:00", link: `${ORIGIN}/ru` })).toBe(`REMPIRE: we missed you on 17.11 at 12:00. Book a new time: ${ORIGIN}/ru`);
    expect(standardSms("reminder", { salon: "REMPIRE" })).toBeNull();
    // no text of its own: the standard words, through the same door the outbox uses
    expect(smsWords("reminder", v, null)).toBe(standardSms("reminder", v));
    const startsAt = new Date(at(TUE, "14:00")).toISOString();
    expect(messageText({ kind: "reminder", locale: "ru", payload: { startsAt, tz: TZ, staff: "Valentin", business: "REMPIRE", address: "Mardi 1, Tallinn" } }, link)).toBe(standardSms("reminder", v));
  });

  it("the page shows the standard text with every variable; it renders to the words of before", () => {
    const v = { salon: "REMPIRE", date: "17.11", time: "14:00", master: "Valentin", address: "Mardi 1, Tallinn", link: "https://x.test/v/1" };
    expect(renderSms(DEFAULT_SMS.reminder, v)).toBe(standardSms("reminder", v));
    expect(renderSms(DEFAULT_SMS.no_show, v)).toBe(standardSms("no_show", v));
    expect(renderSms(DEFAULT_SMS.birthday, v)).toBe(standardSms("birthday", v));
  });

  it("the outbox with nothing stored: the reminder at its time, in its words", async () => {
    const id = await visit();
    expect(await planReminders(query, NOW)).toEqual({ added: 1, cancelled: 0 });
    const [r] = await rows("reminder");
    expect(new Date(r.send_at).getTime()).toBe(at(TUE, "10:00"));
    await runOutbox(query, at(TUE, "10:00"), DEV);
    expect(sentSms).toHaveLength(1);
    expect(sentSms[0].text).toMatch(/^REMPIRE: reminder of your visit on 17\.11 at 12:00 with Renat\./);
    expect((await rows("reminder"))[0].payload.template).toBeUndefined();
    expect(id).toBeTruthy();
  });
});

/* ---------------------------------------------------------------- the SMS text */

describe("the salon's own SMS text", () => {
  it("is checked: not empty, not too long, only the variables this SMS knows", () => {
    expect(checkTemplate("reminder", "  ")).toEqual({ ok: false, code: "empty" });
    expect(checkTemplate("reminder", "a".repeat(601))).toEqual({ ok: false, code: "long" });
    expect(checkTemplate("birthday", "Hi {client}, see you {date}")).toEqual({ ok: false, code: "unknown", token: "date" });
    expect(checkTemplate("reminder", "Hi {nope}")).toEqual({ ok: false, code: "unknown", token: "nope" });
    expect(checkTemplate("reminder", "Hi {client}!\r\nSee you at {time}.  ")).toEqual({ ok: true, value: "Hi {client}!\nSee you at {time}." });
    // the standard text itself is «no text of its own»
    expect(checkTemplate("reminder", ` ${DEFAULT_SMS.reminder} `)).toEqual({ ok: true, value: null });
    expect(tokensIn("{a} {b} {a}")).toEqual(["a", "b"]);
  });

  it("fills its variables; one with nothing to say leaves no gap", () => {
    expect(renderSms("{salon}: {date} at {time} with {master}. {address}. Change: {link}", { salon: "REMPIRE", date: "17.11", time: "12:00", master: "Renat", address: "", link: "L" })).toBe(
      "REMPIRE: 17.11 at 12:00 with Renat. Change: L",
    );
    expect(renderSms("Hi {client} , bye", { client: "" })).toBe("Hi, bye");
    expect(renderSms("Wait...", {})).toBe("Wait...");
  });

  it("counts characters and parts as the operators bill them", () => {
    expect(smsCount("a".repeat(160))).toEqual({ chars: 160, limit: 160, parts: 1, unicode: false });
    expect(smsCount("a".repeat(161))).toEqual({ chars: 161, limit: 306, parts: 2, unicode: false });
    expect(smsCount("Привет")).toMatchObject({ limit: 70, parts: 1, unicode: true });
  });

  it("goes as written with the client's name and the services, and the report keeps its words", async () => {
    await visit();
    const r = await saveType(demo.business, await me(), "reminder", { sms: "{salon}: hi {client}, {service} on {date} at {time}. {link}" });
    expect(r).toEqual({ ok: true, changed: ["sms"] });
    await planReminders(query, NOW);
    await runOutbox(query, at(TUE, "10:00"), DEV);
    expect(sentSms).toHaveLength(1);
    expect(sentSms[0].text).toMatch(/^REMPIRE: hi Test Client, .+ on 17\.11 at 12:00\. https?:\/\/\S+\/v\/[A-Za-z0-9_-]{16}$/);
    const [row] = await rows("reminder");
    expect(row.payload).toMatchObject({ template: "{salon}: hi {client}, {service} on {date} at {time}. {link}", client: "Test Client" });
    // «Стандартный текст»: back to today's words, and nothing stored
    expect(await saveType(demo.business, await me(), "reminder", { sms: null })).toEqual({ ok: true, changed: ["sms"] });
    expect(cleanStored((await stored()).notifications).sms).toEqual({});
  });

  it("the invitation's own text, with the client's name", async () => {
    const r = await book(query, demo.business, bookingInput(), { now: NOW });
    if (!r.ok) throw new Error(r.code);
    await saveType(demo.business, await me(), "no_show", { sms: "{client}, we missed you at {time}. {link}" });
    await query("update appointments set status = 'no_show' where id = $1", [r.visit.id]);
    const later = at(TUE, "12:30");
    await planNoShow(query, demo.business, r.visit.id, "no_show", later);
    await runOutbox(query, later + 2 * 60_000, DEV);
    expect(sentSms.map((s) => s.text)).toEqual([`Test Client, we missed you at 12:00. ${ORIGIN}/ru`]);
  });
});

const bookingInput = (o: { email?: string | null } = {}): BookingInput => ({
  serviceIds: [demo.services.clip],
  staffId: demo.staff.renat,
  startsAt: new Date(at(TUE, "12:00")).toISOString(),
  name: "Test Client",
  phone: "+372 5555 0702",
  email: o.email === undefined ? "client@example.test" : o.email,
  comment: "",
  locale: "ru",
  smsReminder: true,
  idempotencyKey: `notifications-book-${++n}-${Math.random()}`,
});

/* ---------------------------------------------------------------- a change */

describe("a change from the page", () => {
  it("writes only what differs, each in its one place", () => {
    const off = applyChange({}, "confirmation", { on: false });
    expect(off).toEqual({ ok: true, patch: { notifications: { off: ["confirmation"], sms: {}, at: {}, delay: {} } }, changed: ["on"] });
    // back on: the key goes
    const back = applyChange({ notifications: { off: ["confirmation"] } }, "confirmation", { on: true });
    expect(back).toMatchObject({ ok: true, patch: { notifications: { off: [] } } });
    // the birthday and the invitation keep their switches of 20.11, the e-mail reminder too
    expect(applyChange({}, "birthday", { on: false })).toEqual({ ok: true, patch: { birthday_on: false }, changed: ["on"] });
    expect(applyChange({}, "reminder", { channels: { email: false } })).toEqual({ ok: true, patch: { email_reminder_on: false }, changed: ["channel.email"] });
    expect(applyChange({}, "reminder", { lead: { sms: 60, email: 720 } })).toEqual({ ok: true, patch: { reminder_min: 60 }, changed: ["lead.sms"] });
    expect(applyChange({}, "reminder", { mode: "push" })).toEqual({ ok: true, patch: { client_reminder: "push" }, changed: ["mode"] });
    expect(applyChange({}, "day_plan", { at: "21:00" })).toMatchObject({ ok: true, patch: { notifications: { at: { day_plan: "21:00" } } } });
    // the default hour or delay again: nothing of its own stored
    expect(applyChange({ notifications: { at: { day_plan: "21:00" } } }, "day_plan", { at: "20:00" })).toMatchObject({ ok: true, patch: { notifications: { at: {} } } });
    expect(applyChange({}, "no_show", { delay: 30 })).toMatchObject({ ok: true, patch: { notifications: { delay: { no_show: 30 } } } });
    // nothing changes: nothing written
    expect(applyChange({}, "reminder", { on: true, lead: { sms: 120 }, mode: "both", sms: DEFAULT_SMS.reminder })).toEqual({ ok: true, patch: {}, changed: [] });
  });

  it("refuses what is not of its kind, by the field's name", () => {
    expect(applyChange({}, "reminder", { lead: { sms: 5 } })).toEqual({ ok: false, field: "lead.sms" });
    expect(applyChange({}, "reminder", { lead: { email: 3000 } })).toEqual({ ok: false, field: "lead.email" });
    expect(applyChange({}, "confirmation", { lead: { sms: 60 } })).toEqual({ ok: false, field: "lead" });
    expect(applyChange({}, "confirmation", { channels: { email: false } })).toEqual({ ok: false, field: "channel.email" });
    expect(applyChange({}, "visit_new", { channels: { sms: true } })).toEqual({ ok: false, field: "channel.sms" });
    expect(applyChange({}, "birthday", { at: "25:00" })).toEqual({ ok: false, field: "at" });
    expect(applyChange({}, "birthday", { at: "03:00" })).toEqual({ ok: false, field: "at" });
    expect(applyChange({}, "reminder", { at: "10:00" })).toEqual({ ok: false, field: "at" });
    expect(applyChange({}, "no_show", { delay: 0 })).toEqual({ ok: false, field: "delay" });
    expect(applyChange({}, "reminder", { mode: "email" as never })).toEqual({ ok: false, field: "mode" });
    expect(applyChange({}, "confirmation", { sms: "hi" })).toEqual({ ok: false, field: "sms" });
    expect(applyChange({}, "reminder", { sms: "hi {who}" })).toEqual({ ok: false, field: "sms.unknown.who" });
    expect(applyChange({}, "reminder", { on: "no" as never })).toEqual({ ok: false, field: "on" });
  });

  it("anything else stored is dropped when read", () => {
    expect(cleanStored({ off: ["confirmation", "birthday", "nope", "reminder.email", "reminder.sms", 3], sms: { reminder: "", birthday: "Hi {date}", no_show: "Hi {client}" }, at: { birthday: "9:00", day_plan: "21:30" }, delay: { no_show: 0.5 } })).toEqual({
      off: ["confirmation", "reminder.sms"],
      sms: { no_show: "Hi {client}" },
      at: { day_plan: "21:30" },
      delay: {},
    });
  });

  it("is saved with one audit row; a save that changes nothing writes nothing", async () => {
    expect(await saveType(demo.business, await me(), "own_barber", { on: false })).toEqual({ ok: true, changed: ["on"] });
    expect(await saveType(demo.business, await me(), "own_barber", { on: false })).toEqual({ ok: true, changed: [] });
    const audit = await query<{ actor: string; entity: string; action: string; before: unknown; after: unknown }>("select actor, entity, action, before, after from audit where entity = 'business' and action = 'settings'");
    expect(audit).toEqual([{ actor: owner, entity: "business", action: "settings", before: { on: true }, after: { notification: "own_barber", on: false } }]);
    expect(cleanStored((await stored()).notifications).off).toEqual(["own_barber"]);
    // the other settings stay where they were
    expect(readSettings(await stored())).toEqual(DEFAULT_SETTINGS);
    expect(await saveType(demo.business, await me(), "nope", { on: false })).toEqual({ ok: false, field: "type" });
  });
});

/* ---------------------------------------------------------------- rights */

describe("who may", () => {
  it("the owner everything; the front desk nothing until given; each channel by its own right", async () => {
    expect(notifyMay(await me())).toEqual({ open: true, sms: true, email: true, push: true, system: true });
    expect(notifyMay(await me(desk))).toMatchObject({ open: false });
    expect(await saveType(demo.business, await me(desk), "confirmation", { on: false })).toEqual({ ok: false, field: "forbidden" });

    // only «SMS-уведомления»: the SMS side, never the letters
    await query("update users set rights = array_remove(rights, 'notify.email') where id = $1", [owner]);
    const sms = await me();
    expect(notifyMay(sms)).toMatchObject({ open: true, sms: true, email: false, push: true });
    expect(await saveType(demo.business, sms, "confirmation", { on: false })).toEqual({ ok: false, field: "forbidden" });
    expect(await saveType(demo.business, sms, "reminder", { on: false })).toEqual({ ok: false, field: "forbidden" });
    expect(await saveType(demo.business, sms, "reminder", { lead: { sms: 60 } })).toMatchObject({ ok: true });
    expect(await saveType(demo.business, sms, "visit_new", { on: false })).toMatchObject({ ok: true });
    expect(typeRows(readNotify(await stored()), notifyMay(sms)).find((r) => r.key === "confirmation")?.may).toBe(false);

    // «SMS, push or both» is «Доступ к системным настройкам», as on «Запросы» before
    await query("update users set rights = array_remove(rights, 'settings.system') where id = $1", [owner]);
    expect(await saveType(demo.business, await me(), "reminder", { mode: "sms" })).toEqual({ ok: false, field: "forbidden" });
  });
});

/* ---------------------------------------------------------------- the outbox */

describe("the outbox follows the page", () => {
  it("a new SMS lead moves the reminders not sent yet; the visits already past keep theirs", async () => {
    const id = await visit();
    await planReminders(query, NOW);
    expect(await saveType(demo.business, await me(), "reminder", { lead: { sms: 60 } }, NOW)).toEqual({ ok: true, changed: ["lead.sms"] });
    expect((await stored()).reminder_min).toBe(60);
    expect((await query<{ reminder_min: number }>("select reminder_min from appointments where id = $1", [id]))[0].reminder_min).toBe(60);
    expect(await planReminders(query, NOW)).toEqual({ added: 1, cancelled: 1 });
    const planned = (await rows("reminder")).filter((r) => r.status === "queued");
    expect(planned.map((r) => new Date(r.send_at).getTime())).toEqual([at(TUE, "11:00")]);
  });

  it("the SMS reminder off: the queued ones are cancelled at the next run, none planned", async () => {
    await visit();
    await planReminders(query, NOW);
    await saveType(demo.business, await me(), "reminder", { channels: { sms: false } });
    expect(await planReminders(query, NOW)).toEqual({ added: 0, cancelled: 1 });
    await runOutbox(query, at(TUE, "10:00"), DEV);
    expect(sentSms).toHaveLength(0);
  });

  it("a type off: what was queued before is skipped at send time", async () => {
    const r = await book(query, demo.business, bookingInput(), { now: NOW });
    if (!r.ok) throw new Error(r.code);
    await saveType(demo.business, await me(), "confirmation", { on: false });
    await sendForVisit(query, r.visit.id, NOW, DEV);
    expect(sentToConsole).toHaveLength(0);
    expect(await rows("confirmation")).toMatchObject([{ status: "skipped", last_error: "switched off" }]);
  });

  it("the birthday at the salon's hour", async () => {
    await query("insert into clients (business_id, name, phone_e164, email, locale, birth_day, birth_month) values ($1, 'Fake Birthday', '+37255550703', 'bday@example.test', 'ru', 20, 11)", [demo.business.id]);
    await saveType(demo.business, await me(), "birthday", { at: "12:00" });
    expect(await planBirthdays(query, at("2026-11-20", "10:00"))).toBe(0);
    expect(await planBirthdays(query, at("2026-11-20", "12:00"))).toBe(2);
    // and only by the channels that are on
    await query("delete from notifications");
    await saveType(demo.business, await me(), "birthday", { channels: { sms: false } });
    expect(await planBirthdays(query, at("2026-11-21", "12:00"))).toBe(0);
    await query("update clients set birth_day = 21 where name = 'Fake Birthday'");
    expect(await planBirthdays(query, at("2026-11-21", "12:00"))).toBe(1);
    expect((await rows("birthday")).map((r) => r.channel)).toEqual(["email"]);
  });

  it("the invitation after its delay, by its channels", async () => {
    const r = await book(query, demo.business, bookingInput(), { now: NOW });
    if (!r.ok) throw new Error(r.code);
    await sendForVisit(query, r.visit.id, NOW, DEV);
    await saveType(demo.business, await me(), "no_show", { delay: 30, channels: { sms: false } });
    await query("update appointments set status = 'no_show' where id = $1", [r.visit.id]);
    const later = at(TUE, "12:30");
    expect(await planNoShow(query, demo.business, r.visit.id, "no_show", later)).toBe(1);
    expect((await rows("no_show")).map((x) => [x.channel, new Date(x.send_at).getTime()])).toEqual([["email", later + 30 * 60_000]]);
  });

  it("the evening plan at its hour, and not at all when off", async () => {
    const keys = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };
    try {
      process.env.VAPID_PUBLIC_KEY = "test-public-key";
      process.env.VAPID_PRIVATE_KEY = "test-private-key";
      const [u] = await query<{ id: string }>("insert into users (business_id, email, role, staff_id, locale) values ($1, 'val@example.test', 'staff', $2, 'ru') returning id", [demo.business.id, demo.staff.valentin]);
      await saveSubscription(query, u.id, { endpoint: "https://push.example.test/val", p256dh: "p256", auth: "auth", label: "test" });
      await saveType(demo.business, await me(), "day_plan", { at: "21:00" });
      expect(await planEveningPush(query, at("2026-11-30", "20:05"))).toBe(0);
      expect(await planEveningPush(query, at("2026-11-30", "21:05"))).toBe(1);
      await saveType(demo.business, await me(), "day_plan", { on: false });
      expect(await planEveningPush(query, at("2026-12-01", "21:05"))).toBe(0);
    } finally {
      process.env.VAPID_PUBLIC_KEY = keys.pub;
      process.env.VAPID_PRIVATE_KEY = keys.priv;
      if (keys.pub === undefined) delete process.env.VAPID_PUBLIC_KEY;
      if (keys.priv === undefined) delete process.env.VAPID_PRIVATE_KEY;
    }
  });
});

/* ---------------------------------------------------------------- the pages' data */

describe("what the pages show", () => {
  it("sixteen types in three groups, each with its channels and timing", () => {
    const list = typeRows(readNotify({}), { open: true, sms: true, email: true, push: true, system: true });
    expect(list.map((r) => r.key)).toEqual([...TYPE_KEYS]);
    expect(list.filter((r) => r.audience === "client")).toHaveLength(6);
    expect(list.filter((r) => r.audience === "salon")).toHaveLength(5);
    expect(list.filter((r) => r.audience === "staff")).toHaveLength(5);
    expect(list.find((r) => r.key === "own_barber")?.loginsOff).toBe(true);
    expect(list.find((r) => r.key === "visit_new")?.loginsOff).toBe(false);
    // «SMS only»: the reminder's push shows off
    const sms = typeRows(readNotify({ client_reminder: "sms" }), { open: true, sms: true, email: true, push: true, system: true });
    expect(sms[0].channels.find((c) => c.ch === "push")?.on).toBe(false);
  });

  it("a type's page: its options, its text, and previews made from a made-up visit", async () => {
    const may = notifyMay(await me());
    const d = typeDetail(readNotify({}), may, "reminder");
    expect(d.lead).toMatchObject({ sms: 120, email: 720 });
    expect(d.lead?.options).toContain(120);
    expect(d.sms).toMatchObject({ template: null, standard: DEFAULT_SMS.reminder });
    expect(typeDetail(readNotify({}), may, "birthday").at).toMatchObject({ value: "10:00" });
    expect(typeDetail(readNotify({ notifications: { delay: { no_show: 45 } } }), may, "no_show").delay?.options).toContain(45);

    const sample = await loadSample(query, demo.business, ORIGIN, NOW);
    expect(sample.values).toMatchObject({ client: "Demo client", time: "14:30", date: "17.11" });
    expect(sample.visitLink).toMatch(/\/v\/[A-Za-z0-9]{16}$/);
    const words = smsWords("reminder", sample.values, null)!;
    expect(smsSegments(words).segments).toBe(1);

    const b = { ...demo.business, settings: DEFAULT_SETTINGS };
    const p = previews("reminder", sample, b, ORIGIN);
    expect(Object.keys(p.email)).toEqual(["ru", "et", "en"]);
    expect(p.email.ru?.html).toContain("<html");
    expect(p.email.ru?.html).not.toContain("Demo client");
    expect(p.push.en?.body).toMatch(/^Reminder: your visit on 17\.11 at 14:30/);
    expect(previews("visit_new", sample, b, ORIGIN).push.ru).toMatchObject({ title: "Новая запись" });
    expect(previews("own_request", sample, b, ORIGIN).push.ru?.title).toBeTruthy();
    expect(previews("day_plan", sample, b, ORIGIN).push.ru?.body).toMatch(/^6 записей/);
    expect(previews("confirmation", sample, b, ORIGIN).push).toEqual({});
  });

  it("how each channel goes from here: by the env, never a key", () => {
    expect(transports({ NODE_ENV: "production" }).list).toEqual([
      { ch: "sms", state: "off", from: "" },
      { ch: "email", state: "off", from: "" },
      { ch: "push", state: "off", from: "" },
    ]);
    const live = transports({ NODE_ENV: "production", MESSAGGIO_LOGIN: "test-login", MESSAGGIO_SENDER: "REMPIRE", RESEND_API_KEY: "test-key", EMAIL_FROM: "hello@example.test", VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b", ALLOW_INDEXING: "yes" });
    expect(live).toEqual({
      list: [
        { ch: "sms", state: "live", from: "REMPIRE" },
        { ch: "email", state: "live", from: "hello@example.test" },
        { ch: "push", state: "live", from: "" },
      ],
      testRun: false,
    });
    expect(JSON.stringify(live)).not.toContain("test-login");
    expect(JSON.stringify(live)).not.toContain("test-key");
    expect(transports({ NODE_ENV: "development" }).list.map((t) => t.state)).toEqual(["console", "console", "off"]);
  });
});
