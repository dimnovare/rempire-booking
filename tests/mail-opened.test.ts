import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/resend/route";
import { closeDb, query } from "@/lib/db";
import { openedEvent, recordOpen, verifySvix } from "@/lib/mail-opened";
import { freshDemo, type Demo } from "./helpers";

// a made-up endpoint secret, as Resend shows one: «whsec_» + base64
const SECRET = "whsec_" + Buffer.from("fake-secret-for-tests-only-0123").toString("base64");

function sign(body: string, ts: number, id = "msg_test_1", secret = SECRET) {
  const key = Buffer.from(secret.slice(6), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return { id, timestamp: String(ts), signature: `v1,${sig}` };
}

const opened = (emailId: string, at = "2026-11-20T10:00:00.000Z") =>
  JSON.stringify({ type: "email.opened", created_at: at, data: { email_id: emailId, to: ["kaarel@example.test"] } });

describe("the signature", () => {
  const now = Date.UTC(2026, 10, 20, 10, 0, 0);
  const body = opened("re_1");
  const ts = Math.floor(now / 1000);

  it("is accepted when it matches, also among several", () => {
    expect(verifySvix(SECRET, sign(body, ts), body, now)).toBe(true);
    const h = sign(body, ts);
    expect(verifySvix(SECRET, { ...h, signature: `v1,AAAA ${h.signature}` }, body, now)).toBe(true);
  });

  it("is refused when the body, secret, version or time is off", () => {
    expect(verifySvix(SECRET, sign(body, ts), body + " ", now)).toBe(false);
    expect(verifySvix(SECRET, sign(body, ts, "msg_test_1", "whsec_" + Buffer.from("another").toString("base64")), body, now)).toBe(false);
    expect(verifySvix(SECRET, { ...sign(body, ts), signature: sign(body, ts).signature.replace("v1,", "v2,") }, body, now)).toBe(false);
    expect(verifySvix(SECRET, sign(body, ts - 6 * 60), body, now)).toBe(false);
    expect(verifySvix(SECRET, sign(body, ts + 6 * 60), body, now)).toBe(false);
    expect(verifySvix(SECRET, { id: null, timestamp: String(ts), signature: "v1,x" }, body, now)).toBe(false);
  });
});

describe("the event", () => {
  it("is an open with Resend's letter id, nothing else", () => {
    expect(openedEvent(JSON.parse(opened("re_1")))).toEqual({ emailId: "re_1", at: new Date("2026-11-20T10:00:00.000Z") });
    expect(openedEvent({ type: "email.delivered", data: { email_id: "re_1" } })).toBeNull();
    expect(openedEvent({ type: "email.opened", data: {} })).toBeNull();
    expect(openedEvent("nope")).toBeNull();
  });
});

describe("an open", () => {
  let demo: Demo;
  const env = process.env.RESEND_WEBHOOK_SECRET;
  beforeEach(async () => {
    demo = await freshDemo();
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    if (env === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = env;
  });
  afterAll(closeDb);

  const letter = async (ref: string, provider = "resend") =>
    (
      await query<{ id: string }>(
        `insert into notifications (business_id, channel, kind, recipient, status, provider, provider_ref, sent_at)
         values ($1, 'email', 'invoice', 'kaarel@example.test', 'sent', $2, $3, now()) returning id`,
        [demo.business.id, provider, ref],
      )
    )[0].id;
  const openedAt = async (id: string) => (await query<{ opened_at: Date | null }>("select opened_at from notifications where id = $1", [id]))[0].opened_at;

  it("marks the letter, the first open only", async () => {
    const id = await letter("re_42");
    expect(await recordOpen(query, "re_42", new Date("2026-11-20T10:00:00Z"))).toBe(true);
    await recordOpen(query, "re_42", new Date("2026-11-21T09:00:00Z"));
    expect((await openedAt(id))?.toISOString()).toBe("2026-11-20T10:00:00.000Z");
    // an earlier open arriving late wins
    await recordOpen(query, "re_42", new Date("2026-11-20T08:00:00Z"));
    expect((await openedAt(id))?.toISOString()).toBe("2026-11-20T08:00:00.000Z");
  });

  it("never marks another provider's letter or an unknown id", async () => {
    const other = await letter("re_42", "console");
    expect(await recordOpen(query, "re_43", new Date())).toBe(false);
    expect(await recordOpen(query, "re_42", new Date())).toBe(false);
    expect(await openedAt(other)).toBeNull();
  });

  it("comes in through the webhook, signed", async () => {
    const id = await letter("re_7");
    const body = opened("re_7", new Date().toISOString());
    const h = sign(body, Math.floor(Date.now() / 1000));
    const req = (headers: Record<string, string>) => new Request("http://x/api/webhooks/resend", { method: "POST", body, headers });
    const signed = { "svix-id": h.id, "svix-timestamp": h.timestamp, "svix-signature": h.signature };

    expect((await POST(req({ ...signed, "svix-signature": "v1,AAAA" }))).status).toBe(401);
    expect(await openedAt(id)).toBeNull();

    const ok = await POST(req(signed));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, used: true });
    expect(await openedAt(id)).not.toBeNull();

    delete process.env.RESEND_WEBHOOK_SECRET;
    expect((await POST(req(signed))).status).toBe(503);
  });
});
