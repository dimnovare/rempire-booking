/**
 * The SMS door (src/lib/sms.ts): the Messaggio transport against a mocked
 * fetch (nothing leaves the machine), how its answers map onto the
 * outbox's retries, the staging guard, and the one-part rule.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, query } from "@/lib/db";
import { enqueue, runOutbox } from "@/lib/outbox";
import { MESSAGGIO, oneSmsPart, sendSms, sentSms, SmsDisabled, SmsRejected, smsSegments, smsTransport } from "@/lib/sms";
import { freshDemo, type Demo } from "./helpers";

// test values only: no real login, no real sender; fetch is mocked in every test that sends
const KEYS = { MESSAGGIO_LOGIN: "test-login-not-real", MESSAGGIO_SENDER: "TESTSENDER" };
// production, after the move (no staging guard)
const LIVE = { NODE_ENV: "production", VITEST: "true", ALLOW_INDEXING: "yes", ...KEYS };
// production on staging: the test run is on
const STAGING = { NODE_ENV: "production", VITEST: "true", ...KEYS };
const TO = "+37255550301";

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];
const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function mockFetch(answer: (call: Call) => Response | Promise<Response>) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return answer(call);
  });
}
const accepted = (id = "ff1ca1f9-94f2-4e43-97ed-a4ca672957c1") => reply(200, { accepted_at: "2026-11-20T10-00-00Z", messages: [{ recipient: { phone: "37255550301" }, message_id: id }] });

beforeEach(() => {
  calls.length = 0;
  sentSms.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("which transport", () => {
  it("Messaggio with both env vars; console wins when asked; prints locally; disabled in production without them", () => {
    expect(smsTransport({ NODE_ENV: "production", ...KEYS })).toBe("messaggio");
    expect(smsTransport({ NODE_ENV: "production", ...KEYS, SMS_TRANSPORT: "console" })).toBe("console");
    expect(smsTransport({ NODE_ENV: "production", MESSAGGIO_LOGIN: "x" })).toBe("disabled");
    expect(smsTransport({ NODE_ENV: "production", MESSAGGIO_LOGIN: " ", MESSAGGIO_SENDER: "S" })).toBe("disabled");
    expect(smsTransport({ NODE_ENV: "production" })).toBe("disabled");
    expect(smsTransport({ NODE_ENV: "development" })).toBe("console");
  });

  it("disabled throws, so the outbox leaves the row queued", async () => {
    await expect(sendSms(TO, "Hi", { NODE_ENV: "production", VITEST: "true" })).rejects.toBeInstanceOf(SmsDisabled);
  });
});

describe("Messaggio's send API", () => {
  it("posts one SMS as its documentation shows, and keeps the message id", async () => {
    mockFetch(() => accepted());
    const r = await sendSms(TO, "Hello from the test", LIVE, { externalId: "row-1" });
    expect(r).toEqual({ provider: "messaggio", ref: "ff1ca1f9-94f2-4e43-97ed-a4ca672957c1", segments: 1 });
    expect(calls).toHaveLength(1);
    const [c] = calls;
    expect(c.url).toBe("https://msg.messaggio.com/api/v1/send");
    expect(c.init.method).toBe("POST");
    expect(c.init.headers).toMatchObject({ "Messaggio-Login": "test-login-not-real", "Content-Type": "application/json", Accept: "application/json" });
    expect(c.init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(c.init.body))).toEqual({
      recipients: [{ phone: "37255550301" }],
      channels: ["sms"],
      sms: { from: "TESTSENDER", content: [{ type: "text", text: "Hello from the test" }] },
      options: { external_id: "row-1" },
    });
    // nothing printed: it went to the provider
    expect(sentSms).toHaveLength(0);
  });

  it("no external id, no options", async () => {
    mockFetch(() => accepted());
    await sendSms(TO, "Hi", LIVE);
    expect(JSON.parse(String(calls[0].init.body)).options).toBeUndefined();
  });

  it("a number refused inside a 200 is final", async () => {
    mockFetch(() => reply(200, { accepted_at: "x", messages: [{ recipient: { phone: "37255550301" }, error: { title: "Invalid phone number", detail: "invalid phone number" } }] }));
    const e = await sendSms(TO, "Hi", LIVE).catch((x) => x);
    expect(e).toBeInstanceOf(SmsRejected);
    expect(e.permanent).toBe(true);
    expect(e.message).toBe("Messaggio refused the number: Invalid phone number: invalid phone number");
  });

  it("400 and 422 are final; 403, 429 and 5xx are retried; the login never shows in the error", async () => {
    for (const status of [400, 422]) {
      mockFetch(() => reply(status, { title: "Invalid contents", detail: "sms contents field is empty" }));
      const e = await sendSms(TO, "Hi", LIVE).catch((x) => x);
      expect(e).toBeInstanceOf(SmsRejected);
      expect(e.message).toBe(`Messaggio answered ${status}: Invalid contents: sms contents field is empty`);
      vi.restoreAllMocks();
    }
    for (const status of [403, 429, 500, 503]) {
      mockFetch(() => reply(status, status === 403 ? { title: "Forbidden" } : "not json"));
      const e = await sendSms(TO, "Hi", LIVE).catch((x) => x);
      expect(e).toBeInstanceOf(Error);
      expect(e).not.toBeInstanceOf(SmsRejected);
      expect(e.message).toBe(status === 403 ? "Messaggio answered 403: Forbidden" : `Messaggio answered ${status}`);
      expect(e.message).not.toContain(KEYS.MESSAGGIO_LOGIN);
      vi.restoreAllMocks();
    }
  });

  it("no answer, or none in time: retried", async () => {
    mockFetch(() => Promise.reject(new TypeError("fetch failed")));
    await expect(sendSms(TO, "Hi", LIVE)).rejects.toThrow("Messaggio could not be reached");
    vi.restoreAllMocks();
    mockFetch(() => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")));
    const e = await sendSms(TO, "Hi", LIVE).catch((x) => x);
    expect(e.message).toBe(`Messaggio did not answer in ${MESSAGGIO.timeoutMs / 1000} s`);
    expect(e).not.toBeInstanceOf(SmsRejected);
  });

  it("a 200 it cannot read is taken as accepted, not sent again", async () => {
    mockFetch(() => reply(200, "<html>ok</html>"));
    expect(await sendSms(TO, "Hi", LIVE)).toEqual({ provider: "messaggio", ref: null, segments: 1 });
  });

  it("something that is not a phone number is refused before any request", async () => {
    mockFetch(() => accepted());
    await expect(sendSms("+12", "Hi", LIVE)).rejects.toBeInstanceOf(SmsRejected);
    expect(calls).toHaveLength(0);
  });
});

describe("the staging test run", () => {
  it("only SMS_TEST_TO numbers really get one; the rest is printed", async () => {
    mockFetch(() => accepted());
    expect(await sendSms(TO, "Hi", STAGING)).toEqual({ provider: "console", ref: null, segments: 1 });
    expect(calls).toHaveLength(0);
    expect(sentSms).toEqual([{ to: TO, text: "Hi" }]);
    const tester = { ...STAGING, SMS_TEST_TO: "+372 5555 0999, +372 5555 0301" };
    expect((await sendSms(TO, "Hi", tester)).provider).toBe("messaggio");
    expect(calls).toHaveLength(1);
    expect((await sendSms("+37255550302", "Hi", tester)).provider).toBe("console");
    expect(calls).toHaveLength(1);
  });
});

describe("one part", () => {
  it("takes the first text that fits one part, else the shortest", () => {
    const long = "a".repeat(161);
    expect(oneSmsPart(long, "short", "x")).toBe("short");
    expect(oneSmsPart("", "Hi")).toBe("Hi");
    expect(oneSmsPart(long, "b".repeat(170))).toBe(long);
    expect(smsSegments(oneSmsPart("Привет, это длинный русский текст, который не помещается в одну часть SMS вообще", "Plain")).segments).toBe(1);
  });
});

describe("in the outbox", () => {
  let demo: Demo;
  beforeEach(async () => {
    demo = await freshDemo();
  });
  afterAll(closeDb);

  const row = async (id: string) => (await query<{ status: string; attempts: number; provider: string | null; provider_ref: string | null; last_error: string | null }>("select status, attempts, provider, provider_ref, last_error from notifications where id = $1", [id]))[0];
  const queue = () => enqueue(query, { businessId: demo.business.id, channel: "sms", kind: "manual", recipient: TO, payload: { text: "Test message" }, sendAt: Date.now() - 1000 });

  it("a sent SMS keeps Messaggio's id and our row id goes along as external_id", async () => {
    mockFetch(() => accepted("msg-123"));
    const id = await queue();
    expect((await runOutbox(query, Date.now(), LIVE)).sent).toBe(1);
    expect(await row(id)).toMatchObject({ status: "sent", provider: "messaggio", provider_ref: "msg-123" });
    expect(JSON.parse(String(calls[0].init.body)).options).toEqual({ external_id: id });
  });

  it("a final refusal fails the row at once; a provider error is retried", async () => {
    mockFetch(() => reply(400, { title: "Invalid contents" }));
    const refused = await queue();
    expect((await runOutbox(query, Date.now(), LIVE)).failed).toBe(1);
    expect(await row(refused)).toMatchObject({ status: "failed", attempts: 1, last_error: "Messaggio answered 400: Invalid contents" });
    vi.restoreAllMocks();

    mockFetch(() => reply(500));
    const down = await queue();
    expect((await runOutbox(query, Date.now(), LIVE)).retry).toBe(1);
    expect(await row(down)).toMatchObject({ status: "queued", attempts: 1, last_error: "Messaggio answered 500" });
  });
});
