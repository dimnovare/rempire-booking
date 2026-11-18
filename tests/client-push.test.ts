/**
 * The client's reminder as a notification (docs/apps.md, step 4;
 * migrations 012 and 013): turning it on by the visit's own link, for that
 * visit only; the outbox row per visit; and the switch that says how it
 * goes with the SMS.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE as pushOff, POST as pushOn } from "@/app/api/visit/[token]/push/route";
import { book, type BookingInput } from "@/lib/booking";
import { clientPushOffered, sendPushToClient, setClientReminder } from "@/lib/client-push";
import { closeDb, query } from "@/lib/db";
import { clientReminderText, planReminders, runOutbox, type Senders } from "@/lib/outbox";
import type { PushText } from "@/lib/push-kinds";
import { DEFAULT_SETTINGS, readSettings } from "@/lib/settings";
import { sentSms } from "@/lib/sms";
import { addDays, todayIn, zonedToUtc } from "@/lib/tz";
import { cancelByClient, findVisit } from "@/lib/visits";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
// The route asks the real clock whether a visit is still ahead, so the visits
// here are on a real day to come: the first Monday to Saturday three or more days on.
const NOW = Date.now();
const DAY = (() => {
  let d = addDays(todayIn(TZ, NOW), 3);
  if (new Date(`${d}T12:00:00Z`).getUTCDay() === 0) d = addDays(d, 1);
  return d;
})();
const DDMM = `${DAY.slice(8, 10)}.${DAY.slice(5, 7)}`;
// when the 12:00 visits are reminded: two hours before. Reminders are planned at most 48 hours ahead.
const DUE = at(DAY, "10:00");
const SOON = DUE - 3_600_000;
// test values only: pushConfigured() needs both to be there, nothing is sent with them
const KEYS = { VAPID_PUBLIC_KEY: "test-public-key", VAPID_PRIVATE_KEY: "test-private-key" };
const ENV = { NODE_ENV: "test", VITEST: "true", ...KEYS };
// a push service's address, as a browser would hand it over
const PHONE = { endpoint: "https://fcm.googleapis.com/fcm/send/test-client-phone-0001", keys: { p256dh: "p256dh-test", auth: "auth-test" } };

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
  sentSms.length = 0;
  Object.assign(process.env, KEYS);
});
afterAll(async () => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  await closeDb();
});

let n = 0;
async function visit(o: Partial<BookingInput> = {}) {
  const r = await book(
    query,
    demo.business,
    {
      serviceIds: [demo.services.clip],
      staffId: demo.staff.slava,
      startsAt: new Date(at(DAY, "12:00")).toISOString(),
      name: "Test Client",
      phone: "+372 5555 0501",
      email: null,
      comment: "",
      locale: "ru",
      smsReminder: true,
      idempotencyKey: `client-push-${++n}-${Math.random()}`,
      ...o,
    },
    { now: NOW },
  );
  if (!r.ok || !r.manageToken) throw new Error("book");
  return { id: r.visit.id, token: r.manageToken };
}

const ctx = (token: string) => ({ params: Promise.resolve({ token }) }) as never;
const turnOn = (token: string, body: unknown = { subscription: PHONE, label: "Android" }) =>
  pushOn(new Request(`http://x/api/visit/${token}/push`, { method: "POST", body: JSON.stringify(body) }), ctx(token));
const turnOff = (token: string, endpoint: string) => pushOff(new Request(`http://x/api/visit/${token}/push`, { method: "DELETE", body: JSON.stringify({ endpoint }) }), ctx(token));
const mode = async (value: string) => {
  expect(await setClientReminder(demo.business, "test", value)).toBe(true);
};
const rows = (kind: string) =>
  query<{ status: string; channel: string; appointment_id: string; send_at: Date; last_error: string | null }>(
    "select status, channel, appointment_id, send_at, last_error from notifications where kind = $1 order by created_at",
    [kind],
  );
const phones = () =>
  query<{ endpoint: string; appointment_id: string; retired_at: Date | null; label: string }>("select endpoint, appointment_id, retired_at, label from client_push_subscriptions order by created_at");

describe("the switch", () => {
  it("is «both» until someone chooses, and takes only its three values", async () => {
    expect(DEFAULT_SETTINGS.client_reminder).toBe("both");
    expect(readSettings({}).client_reminder).toBe("both");
    expect(readSettings({ client_reminder: "push" }).client_reminder).toBe("push");
    expect(readSettings({ client_reminder: "email" }).client_reminder).toBe("both");
    expect(await setClientReminder(demo.business, "test", "email")).toBe(false);
    await mode("sms");
    const [b] = await query<{ settings: unknown }>("select settings from businesses where id = $1", [demo.business.id]);
    expect(readSettings(b.settings).client_reminder).toBe("sms");
    const [a] = await query<{ after: unknown }>("select after from audit where entity = 'business' and action = 'settings' order by at desc limit 1");
    expect(a.after).toEqual({ client_reminder: "sms" });
  });

  it("clients are offered the notification only with keys, and not on «SMS only»", () => {
    expect(clientPushOffered({ client_reminder: "both" }, ENV)).toBe(true);
    expect(clientPushOffered({ client_reminder: "push" }, ENV)).toBe(true);
    expect(clientPushOffered({ client_reminder: "sms" }, ENV)).toBe(false);
    expect(clientPushOffered({ client_reminder: "both" }, { NODE_ENV: "test" })).toBe(false);
  });
});

describe("turning it on: /api/visit/<token>/push", () => {
  it("the phone is on for the link's own visit; off again; never without a real link or a real phone", async () => {
    const v = await visit();
    const res = await turnOn(v.token);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await phones()).toMatchObject([{ endpoint: PHONE.endpoint, appointment_id: v.id, retired_at: null, label: "Android" }]);

    // the same phone again: still one row
    expect((await turnOn(v.token)).status).toBe(200);
    expect(await phones()).toHaveLength(1);

    expect((await turnOn("A".repeat(32))).status).toBe(404);
    expect((await turnOn(v.token, { subscription: { endpoint: "https://evil.example/push", keys: PHONE.keys } })).status).toBe(422);
    expect((await turnOn(v.token, "nonsense")).status).toBe(422);

    expect((await turnOff(v.token, PHONE.endpoint)).status).toBe(200);
    expect((await phones())[0].retired_at).not.toBeNull();
    // and on again: the same row comes back
    expect((await turnOn(v.token)).status).toBe(200);
    expect(await phones()).toMatchObject([{ retired_at: null }]);
  });

  it("is refused on «SMS only», on a server without keys, and for a visit that is over", async () => {
    const v = await visit();
    await mode("sms");
    expect((await turnOn(v.token)).status).toBe(409);
    await mode("both");
    delete process.env.VAPID_PUBLIC_KEY;
    expect((await turnOn(v.token)).status).toBe(409);
    Object.assign(process.env, KEYS);
    expect(await cancelByClient(demo.business, v.token, NOW)).toBe("cancelled");
    const res = await turnOn(v.token);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "over" });
    expect(await phones()).toHaveLength(0);
  });

  // A visit link opens one visit. Anyone can book with someone else's phone
  // number, and so hold a link «of» that client: it must not reach further.
  it("one visit's link never turns the phone on for another visit of the same client", async () => {
    const mine = await visit();
    const other = await visit({ startsAt: new Date(at(DAY, "15:00")).toISOString() });
    const client = await query<{ client_id: string }>("select client_id from appointments where id = any($1::uuid[])", [[mine.id, other.id]]);
    expect(new Set(client.map((c) => c.client_id)).size).toBe(1);

    await turnOn(mine.token);
    expect(await phones()).toMatchObject([{ appointment_id: mine.id }]);
    await planReminders(query, SOON);
    expect((await rows("client_reminder")).map((r) => r.appointment_id)).toEqual([mine.id]);

    // with the other visit's own link the same phone is on for both, a row each
    await turnOn(other.token);
    expect((await phones()).map((p) => p.appointment_id).sort()).toEqual([mine.id, other.id].sort());
    await planReminders(query, SOON);
    expect((await rows("client_reminder")).map((r) => r.appointment_id).sort()).toEqual([mine.id, other.id].sort());
    // off for one leaves the other on
    await turnOff(mine.token, PHONE.endpoint);
    expect((await phones()).filter((p) => !p.retired_at).map((p) => p.appointment_id)).toEqual([other.id]);
  });
});

describe("the reminder in the outbox", () => {
  // what the push service would be asked to show, per visit
  const told: { visitId: string; msg: PushText }[] = [];
  const senders = (devices = 1): Senders => ({
    sms: async (to, text) => {
      sentSms.push({ to, text });
      return { provider: "console" as const, ref: null, segments: 1 };
    },
    email: async () => ({ provider: "console" as const, ref: null }),
    pushClient: async (_q, visitId, msg) => {
      if (devices) told.push({ visitId, msg });
      return { devices, sent: devices, failed: 0, gone: 0 };
    },
  });
  beforeEach(() => {
    told.length = 0;
  });

  it("«both»: a notification a minute before the SMS's time, and the SMS too", async () => {
    const v = await visit();
    await turnOn(v.token);
    expect(await planReminders(query, SOON)).toEqual({ added: 2, cancelled: 0 });
    const [push] = await rows("client_reminder");
    const [sms] = await rows("reminder");
    expect(push).toMatchObject({ status: "queued", channel: "push", appointment_id: v.id });
    expect(new Date(push.send_at).getTime()).toBe(DUE - 60_000);
    expect(new Date(sms.send_at).getTime()).toBe(DUE);
    // planning again adds nothing
    expect(await planReminders(query, SOON)).toEqual({ added: 0, cancelled: 0 });

    await runOutbox(query, DUE + 60_000, ENV, senders());
    expect(told).toHaveLength(1);
    expect(told[0].visitId).toBe(v.id);
    expect(told[0].msg.title).toBe("REMPIRE");
    expect(told[0].msg.body).toBe(`Напоминаем о записи ${DDMM} в 12:00, барбер Slava. Mardi 1, Tallinn.`);
    expect(told[0].msg.tag).toBe(`visit-${v.id}`);
    // the notification opens this visit's own link
    const token = /^\/v\/([A-Za-z0-9_-]{16})$/.exec(told[0].msg.url)?.[1] ?? "";
    expect((await findVisit(query, demo.business.id, token))?.id).toBe(v.id);
    expect(sentSms).toHaveLength(1);
    expect((await rows("client_reminder"))[0].status).toBe("sent");
    expect((await rows("reminder"))[0].status).toBe("sent");
  });

  it("«push»: the notification went out, so no SMS for that visit; a client without it still gets the SMS", async () => {
    await mode("push");
    const withPhone = await visit();
    await visit({ phone: "+372 5555 0502", name: "Other Client", staffId: demo.staff.renat });
    await turnOn(withPhone.token);
    await runOutbox(query, DUE + 60_000, ENV, senders());
    expect(told.map((t) => t.visitId)).toEqual([withPhone.id]);
    expect(sentSms.map((s) => s.to)).toEqual(["+37255550502"]);
    const sms = await rows("reminder");
    expect(sms.map((r) => r.status).sort()).toEqual(["sent", "skipped"]);
    expect(sms.find((r) => r.status === "skipped")).toMatchObject({ appointment_id: withPhone.id, last_error: "sent as a notification" });
  });

  it("«push», but the phone is gone: the SMS goes after all", async () => {
    await mode("push");
    const v = await visit();
    await turnOn(v.token);
    await runOutbox(query, DUE + 60_000, ENV, senders(0));
    expect((await rows("client_reminder"))[0]).toMatchObject({ status: "skipped", last_error: "no phone" });
    expect(sentSms).toHaveLength(1);
  });

  it("«sms»: no notification is planned, and one already queued is taken back", async () => {
    const v = await visit();
    await turnOn(v.token);
    await planReminders(query, SOON);
    expect((await rows("client_reminder"))[0].status).toBe("queued");
    await mode("sms");
    await planReminders(query, SOON);
    expect((await rows("client_reminder")).map((r) => r.status)).toEqual(["cancelled"]);
    await runOutbox(query, DUE + 60_000, ENV, senders());
    expect(told).toHaveLength(0);
    expect(sentSms).toHaveLength(1);
  });

  it("a visit booked without the SMS reminder is still reminded by the notification", async () => {
    const v = await visit({ smsReminder: false });
    await turnOn(v.token);
    await runOutbox(query, DUE + 60_000, ENV, senders());
    expect(told).toHaveLength(1);
    expect(sentSms).toHaveLength(0);
    expect(await rows("reminder")).toHaveLength(0);
  });

  it("a cancelled visit reminds nobody", async () => {
    const v = await visit();
    await turnOn(v.token);
    await planReminders(query, SOON);
    expect(await cancelByClient(demo.business, v.token, NOW)).toBe("cancelled");
    await runOutbox(query, DUE + 60_000, ENV, senders());
    expect(told).toHaveLength(0);
    expect(sentSms).toHaveLength(0);
    expect((await rows("client_reminder")).map((r) => r.status)).toEqual(["cancelled"]);
  });

  it("without keys the notification waits and the SMS goes", async () => {
    const v = await visit();
    await turnOn(v.token);
    await runOutbox(query, DUE + 60_000, { NODE_ENV: "test", VITEST: "true" }, senders());
    expect(told).toHaveLength(0);
    expect(sentSms).toHaveLength(1);
    expect((await rows("client_reminder"))[0].status).toBe("queued");
  });

  it("speaks the visit's language", () => {
    const row = (locale: "ru" | "et" | "en") => ({
      locale,
      appointment_id: "v1",
      payload: { startsAt: new Date(at("2026-11-17", "12:00")).toISOString(), staff: "Slava", business: "REMPIRE", address: "Mardi 1, Tallinn", tz: TZ },
    });
    expect(clientReminderText(row("et"), "/v/x")?.body).toBe("Meeldetuletus: Teie aeg 17.11 kell 12:00, Slava. Mardi 1, Tallinn.");
    expect(clientReminderText(row("en"), "/v/x")).toEqual({ title: "REMPIRE", body: "Reminder: your visit on 17.11 at 12:00 with Slava. Mardi 1, Tallinn.", url: "/v/x", tag: "visit-v1" });
    expect(clientReminderText({ locale: "ru", appointment_id: "v1", payload: {} }, "/v/x")).toBeNull();
  });

  it("a visit with no live phone sends nothing and does not throw", async () => {
    const v = await visit();
    expect(await sendPushToClient(query, v.id, { title: "t", body: "b", url: "/", tag: "x" }, ENV)).toEqual({ devices: 0, sent: 0, failed: 0, gone: 0 });
    await expect(sendPushToClient(query, v.id, { title: "t", body: "b", url: "/", tag: "x" }, { NODE_ENV: "test" })).rejects.toThrow("not configured");
  });
});
