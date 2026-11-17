import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as cronGet } from "@/app/api/cron/outbox/route";
import { adminCancelVisit, adminCreateVisit, adminUpdateVisit, type AdminVisitInput } from "@/lib/admin/visits";
import { closeDb, query } from "@/lib/db";
import { enqueue, OUTBOX, planReminders, runOutbox, type Senders } from "@/lib/outbox";
import { sendSms, sentSms, SmsDisabled, smsSegments, smsTransport } from "@/lib/sms";
import { sendEmail } from "@/lib/email";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const NOW = at("2026-11-16", "10:00");
const TUE = "2026-11-17";
const DEV = { NODE_ENV: "test", VITEST: "true" };
const PROD = { NODE_ENV: "production", VITEST: "true" };

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
  sentSms.length = 0;
});
afterAll(closeDb);

let n = 0;
const book = async (o: Partial<AdminVisitInput> & { time?: string } = {}) => {
  const r = await adminCreateVisit(
    demo.business,
    {
      staffId: demo.staff.renat,
      start: at(TUE, o.time ?? "12:00"),
      serviceIds: [demo.services.clip],
      clientId: null,
      name: "Test Client",
      phone: o.phone === undefined ? "+372 5555 0301" : o.phone,
      smsReminder: o.smsReminder ?? true,
      idempotencyKey: `outbox-${++n}-${Math.random()}`,
    },
    "test",
  );
  if (!r.ok) throw new Error(`booking failed: ${JSON.stringify(r)}`);
  return r.id;
};

const rows = (appointmentId?: string) =>
  query<{ id: string; status: string; send_at: Date; recipient: string; kind: string; attempts: number; segments: number | null; last_error: string | null }>(
    `select id, status, send_at, recipient, kind, attempts, segments, last_error from notifications
      ${appointmentId ? "where appointment_id = $1" : ""} order by created_at`,
    appointmentId ? [appointmentId] : [],
  );

describe("sms: encoding and parts", () => {
  it("counts GSM-7 and UCS-2 parts the way operators bill them", () => {
    expect(smsSegments("Hello")).toEqual({ encoding: "gsm7", units: 5, segments: 1 });
    expect(smsSegments("a".repeat(160)).segments).toBe(1);
    expect(smsSegments("a".repeat(161)).segments).toBe(2);
    expect(smsSegments("a".repeat(306)).segments).toBe(2);
    expect(smsSegments("a".repeat(307)).segments).toBe(3);
    // € is in the extension table: two septets
    expect(smsSegments("€".repeat(80))).toMatchObject({ encoding: "gsm7", units: 160, segments: 1 });
    // Cyrillic and Estonian õ/š/ž need UCS-2
    expect(smsSegments("Привет")).toMatchObject({ encoding: "ucs2", segments: 1 });
    expect(smsSegments("ж".repeat(70)).segments).toBe(1);
    expect(smsSegments("ж".repeat(71)).segments).toBe(2);
    expect(smsSegments("Tõnu").encoding).toBe("ucs2");
    expect(smsSegments("Mäe tänav, Öö").encoding).toBe("gsm7");
  });

  it("prints locally and refuses in production until a provider is wired", async () => {
    expect(smsTransport({ NODE_ENV: "development" })).toBe("console");
    expect(smsTransport({ NODE_ENV: "production" })).toBe("disabled");
    expect(smsTransport({ NODE_ENV: "production", SMS_TRANSPORT: "console" })).toBe("console");
    expect(await sendSms("+37255550301", "Hi", DEV)).toEqual({ provider: "console", ref: null, segments: 1 });
    expect(sentSms.at(-1)).toEqual({ to: "+37255550301", text: "Hi" });
    await expect(sendSms("+37255550301", "Hi", PROD)).rejects.toBeInstanceOf(SmsDisabled);
  });
});

describe("outbox: reminders follow the visits", () => {
  it("plans one SMS per booked visit with a phone, at start minus reminder_min", async () => {
    const id = await book();
    expect(await planReminders(query, NOW)).toEqual({ added: 1, cancelled: 0 });
    expect(await planReminders(query, NOW)).toEqual({ added: 0, cancelled: 0 });
    const [r] = await rows(id);
    expect(r).toMatchObject({ status: "queued", kind: "reminder", recipient: "+37255550301" });
    expect(r.send_at.getTime()).toBe(at(TUE, "10:00"));
  });

  it("skips walk-ins without a phone and visits without a reminder", async () => {
    await book({ phone: "", time: "12:00" });
    await book({ smsReminder: false, time: "14:00", phone: "+372 5555 0302" });
    expect(await planReminders(query, NOW)).toEqual({ added: 0, cancelled: 0 });
  });

  it("does not plan too far ahead or too close to the visit", async () => {
    await book();
    // three days before: outside planAheadHours
    expect((await planReminders(query, at("2026-11-14", "10:00"))).added).toBe(0);
    // ten minutes before the visit: too late to be useful
    expect((await planReminders(query, at(TUE, "11:50"))).added).toBe(0);
    // booked an hour before: due at once
    expect((await planReminders(query, at(TUE, "11:00"))).added).toBe(1);
  });

  it("a moved visit gets a new reminder; a cancelled one loses it", async () => {
    const id = await book();
    await planReminders(query, NOW);
    const moved = await adminUpdateVisit(demo.business, id, { start: at(TUE, "15:00") }, "test");
    expect(moved.ok).toBe(true);
    expect(await planReminders(query, NOW)).toEqual({ added: 1, cancelled: 1 });
    const after = await rows(id);
    expect(after.map((r) => r.status)).toEqual(["cancelled", "queued"]);
    expect(after[1].send_at.getTime()).toBe(at(TUE, "13:00"));

    expect(await adminCancelVisit(demo.business, id, "test")).toBe("cancelled");
    expect(await planReminders(query, NOW)).toEqual({ added: 0, cancelled: 1 });
    expect((await rows(id)).map((r) => r.status)).toEqual(["cancelled", "cancelled"]);
  });
});

describe("outbox: sending", () => {
  it("sends only what is due, with the visit's time and barber, and records the parts", async () => {
    const id = await book();
    expect(await runOutbox(query, NOW, DEV)).toMatchObject({ planned: 1, sent: 0, waiting: 0 });
    const res = await runOutbox(query, at(TUE, "10:00"), DEV);
    expect(res).toMatchObject({ planned: 0, sent: 1, retry: 0, failed: 0, waiting: 0 });
    const [r] = await rows(id);
    expect(r).toMatchObject({ status: "sent", attempts: 1 });
    expect(r.segments).toBeGreaterThanOrEqual(1);
    expect(sentSms).toHaveLength(1);
    expect(sentSms[0].to).toBe("+37255550301");
    expect(sentSms[0].text).toContain("17.11 в 12:00");
    expect(sentSms[0].text).toContain("Renat");
    // a second run sends nothing more
    expect((await runOutbox(query, at(TUE, "10:05"), DEV)).sent).toBe(0);
  });

  it("writes the reminder in the visit's language", async () => {
    await enqueue(query, {
      businessId: demo.business.id,
      channel: "sms",
      kind: "reminder",
      recipient: "+37255550303",
      locale: "et",
      payload: { startsAt: new Date(at(TUE, "12:00")).toISOString(), staff: "Renat", business: "REMPIRE", tz: TZ },
      sendAt: NOW,
    });
    await runOutbox(query, NOW, DEV);
    expect(sentSms[0].text).toBe("REMPIRE: meeldetuletus, Teie aeg 17.11 kell 12:00, Renat.");
  });

  it("retries a failing send with backoff, then gives up", async () => {
    const id = await book();
    let calls = 0;
    const failing: Senders = {
      sms: async () => {
        calls++;
        throw new Error("provider down");
      },
      email: sendEmail,
    };
    let t = at(TUE, "10:00");
    expect((await runOutbox(query, t, DEV, failing)).retry).toBe(1);
    let [r] = await rows(id);
    expect(r).toMatchObject({ status: "queued", attempts: 1, last_error: "provider down" });
    expect(r.send_at.getTime()).toBe(t + 2 * 60_000);
    // not due again yet
    expect((await runOutbox(query, t + 60_000, DEV, failing)).retry).toBe(0);
    for (let i = 1; i < OUTBOX.maxAttempts; i++) {
      [r] = await rows(id);
      t = r.send_at.getTime();
      await runOutbox(query, t, DEV, failing);
    }
    [r] = await rows(id);
    expect(r).toMatchObject({ status: "failed", attempts: OUTBOX.maxAttempts });
    expect(calls).toBe(OUTBOX.maxAttempts);
  });

  it("in production without a provider the SMS rows wait, untouched", async () => {
    const id = await book();
    const res = await runOutbox(query, at(TUE, "10:00"), PROD);
    expect(res).toMatchObject({ planned: 1, sent: 0, waiting: 1 });
    const [r] = await rows(id);
    expect(r).toMatchObject({ status: "queued", attempts: 0 });
  });

  it("skips a reminder whose visit has already started", async () => {
    const id = await book();
    await planReminders(query, NOW);
    expect((await runOutbox(query, at(TUE, "12:01"), DEV)).skipped).toBe(1);
    expect((await rows(id))[0].status).toBe("skipped");
    expect(sentSms).toHaveLength(0);
  });

  it("two runs at once send a message once", async () => {
    await book();
    await planReminders(query, NOW);
    const t = at(TUE, "10:00");
    const [a, b] = await Promise.all([runOutbox(query, t, DEV), runOutbox(query, t, DEV)]);
    expect(a.sent + b.sent).toBe(1);
    expect(sentSms).toHaveLength(1);
  });

  it("a run that died leaves its row to the next run after the lock", async () => {
    const id = await book();
    await planReminders(query, NOW);
    const t = at(TUE, "10:00");
    await query(`update notifications set status = 'sending', locked_until = $2, attempts = 1 where appointment_id = $1`, [id, new Date(t + OUTBOX.lockMin * 60_000)]);
    expect((await runOutbox(query, t + 60_000, DEV)).sent).toBe(0);
    expect((await runOutbox(query, t + (OUTBOX.lockMin + 1) * 60_000, DEV)).sent).toBe(1);
  });
});

describe("/api/cron/outbox", () => {
  const call = (auth?: string) => cronGet(new Request("http://localhost/api/cron/outbox", { headers: auth ? { authorization: auth } : {} }));

  it("does nothing without CRON_SECRET, and refuses a wrong one", async () => {
    const saved = process.env.CRON_SECRET;
    try {
      delete process.env.CRON_SECRET;
      expect((await call("Bearer x")).status).toBe(503);
      process.env.CRON_SECRET = "test-cron-secret-value";
      expect((await call()).status).toBe(401);
      expect((await call("Bearer wrong")).status).toBe(401);
      const ok = await call("Bearer test-cron-secret-value");
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ sent: expect.any(Number), waiting: expect.any(Number) });
    } finally {
      if (saved === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = saved;
    }
  });
});
