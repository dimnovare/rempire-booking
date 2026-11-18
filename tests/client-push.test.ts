/**
 * The client's reminder as a notification (docs/apps.md, step 4;
 * 012_client_push.sql): turning it on by the visit's own link, the outbox
 * row per visit, and the switch that says how it goes with the SMS.
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
import { zonedToUtc } from "@/lib/tz";
import { cancelByClient, findVisit } from "@/lib/visits";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const NOW = at("2026-11-16", "10:00");
const TUE = "2026-11-17";
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
      startsAt: new Date(at(TUE, "12:00")).toISOString(),
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
  query<{ status: string; channel: string; recipient: string; send_at: Date; last_error: string | null; payload: { dueAt: string } }>(
    "select status, channel, recipient, send_at, last_error, payload from notifications where kind = $1 order by created_at",
    [kind],
  );
const phones = () => query<{ endpoint: string; client_id: string; retired_at: Date | null; label: string }>("select endpoint, client_id, retired_at, label from client_push_subscriptions");

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
  it("the visit's link says whose phone it is; off again; never without a real link or a real phone", async () => {
    const v = await visit();
    const res = await turnOn(v.token);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const [a] = await query<{ client_id: string }>("select client_id from appointments where id = $1", [v.id]);
    expect(await phones()).toMatchObject([{ endpoint: PHONE.endpoint, client_id: a.client_id, retired_at: null, label: "Android" }]);

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

  it("is refused on «SMS only» and on a server without keys", async () => {
    const v = await visit();
    await mode("sms");
    expect((await turnOn(v.token)).status).toBe(409);
    await mode("both");
    delete process.env.VAPID_PUBLIC_KEY;
    expect((await turnOn(v.token)).status).toBe(409);
    expect(await phones()).toHaveLength(0);
  });

  it("a shared phone follows whoever booked on it last", async () => {
    const first = await visit();
    const second = await visit({ phone: "+372 5555 0502", name: "Other Client", startsAt: new Date(at(TUE, "15:00")).toISOString() });
    await turnOn(first.token);
    await turnOn(second.token);
    const [b] = await query<{ client_id: string }>("select client_id from appointments where id = $1", [second.id]);
    expect(await phones()).toMatchObject([{ client_id: b.client_id }]);
  });
});

describe("the reminder in the outbox", () => {
  // what the push service would be asked to show, per client
  const told: { clientId: string; msg: PushText }[] = [];
  const senders = (devices = 1): Senders => ({
    sms: async (to, text) => {
      sentSms.push({ to, text });
      return { provider: "console" as const, ref: null, segments: 1 };
    },
    email: async () => ({ provider: "console" as const, ref: null }),
    pushClient: async (_q, clientId, msg) => {
      if (devices) told.push({ clientId, msg });
      return { devices, sent: devices, failed: 0, gone: 0 };
    },
  });
  beforeEach(() => {
    told.length = 0;
  });
  const DUE = at(TUE, "10:00"); // two hours before 12:00

  it("«both»: a notification a minute before the SMS's time, and the SMS too", async () => {
    const v = await visit();
    await turnOn(v.token);
    expect(await planReminders(query, NOW)).toEqual({ added: 2, cancelled: 0 });
    const [push] = await rows("client_reminder");
    const [sms] = await rows("reminder");
    expect(push).toMatchObject({ status: "queued", channel: "push" });
    expect(new Date(push.send_at).getTime()).toBe(DUE - 60_000);
    expect(new Date(sms.send_at).getTime()).toBe(DUE);
    // planning again adds nothing
    expect(await planReminders(query, NOW)).toEqual({ added: 0, cancelled: 0 });

    await runOutbox(query, DUE + 60_000, ENV, senders());
    expect(told).toHaveLength(1);
    expect(told[0].msg.title).toBe("REMPIRE");
    expect(told[0].msg.body).toBe("Напоминаем о записи 17.11 в 12:00, барбер Slava. Mardi 1, Tallinn.");
    expect(told[0].msg.tag).toBe(`visit-${v.id}`);
    // the notification opens the client's own link
    const token = /^\/v\/([A-Za-z0-9_-]{16})$/.exec(told[0].msg.url)?.[1] ?? "";
    expect((await findVisit(query, demo.business.id, token))?.id).toBe(v.id);
    expect(sentSms).toHaveLength(1);
    expect((await rows("client_reminder"))[0].status).toBe("sent");
    expect((await rows("reminder"))[0].status).toBe("sent");
  });

  it("«push»: the notification went out, so no SMS for that visit; a client without it still gets the SMS", async () => {
    await mode("push");
    const withPhone = await visit();
    await visit({ phone: "+372 5555 0502", name: "Other Client", startsAt: new Date(at(TUE, "12:00")).toISOString(), staffId: demo.staff.renat });
    await turnOn(withPhone.token);
    await runOutbox(query, DUE + 60_000, ENV, senders());
    expect(told).toHaveLength(1);
    expect(sentSms.map((s) => s.to)).toEqual(["+37255550502"]);
    const sms = await rows("reminder");
    expect(sms.map((r) => r.status).sort()).toEqual(["sent", "skipped"]);
    expect(sms.find((r) => r.status === "skipped")?.last_error).toBe("sent as a notification");
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
    await planReminders(query, NOW);
    expect((await rows("client_reminder"))[0].status).toBe("queued");
    await mode("sms");
    await planReminders(query, NOW);
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
    await planReminders(query, NOW);
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
      payload: { startsAt: new Date(at(TUE, "12:00")).toISOString(), staff: "Slava", business: "REMPIRE", address: "Mardi 1, Tallinn", tz: TZ },
    });
    expect(clientReminderText(row("et"), "/v/x")?.body).toBe("Meeldetuletus: Teie aeg 17.11 kell 12:00, Slava. Mardi 1, Tallinn.");
    expect(clientReminderText(row("en"), "/v/x")).toEqual({ title: "REMPIRE", body: "Reminder: your visit on 17.11 at 12:00 with Slava. Mardi 1, Tallinn.", url: "/v/x", tag: "visit-v1" });
    expect(clientReminderText({ locale: "ru", appointment_id: "v1", payload: {} }, "/v/x")).toBeNull();
  });

  it("a client with no live phone sends nothing and does not throw", async () => {
    const v = await visit();
    const [a] = await query<{ client_id: string }>("select client_id from appointments where id = $1", [v.id]);
    expect(await sendPushToClient(query, a.client_id, { title: "t", body: "b", url: "/", tag: "x" }, ENV)).toEqual({ devices: 0, sent: 0, failed: 0, gone: 0 });
    await expect(sendPushToClient(query, a.client_id, { title: "t", body: "b", url: "/", tag: "x" }, { NODE_ENV: "test" })).rejects.toThrow("not configured");
  });
});
