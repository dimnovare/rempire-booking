/**
 * «Сообщения» (decision 29; src/lib/admin/message-log.ts): the outbox as a
 * log. Its rights (reports.messages, reports.messages.phones), the masked
 * contacts, the barber scope, the filters, the pages, «Содержание» from the
 * pure builders, and a login code that never shows its code. Fake people only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cleanMessages, defaultMessages, messageQuestion, MESSAGE_Q_MAX } from "@/lib/admin/message-filter";
import { listMessageLog, messageContent, messagesMay, type ContentInput } from "@/lib/admin/message-log";
import { maskEmail, maskPhone, type Holder } from "@/lib/auth/rights";
import { legacyHolder } from "@/lib/auth/rights-store";
import { closeDb, query } from "@/lib/db";
import { freshDemo, type Demo } from "./helpers";

afterAll(closeDb);

const PHONE = "+37255500123";
const EMAIL = "anna@example.test";
const CODE = "482915";
let demo: Demo;
let anna: string;
let login: string;
/** one demo visit of each barber */
let valVisit: string;
let jevVisit: string;

beforeEach(async () => {
  demo = await freshDemo();
  await query("delete from notifications where business_id = $1", [demo.business.id]);
  [{ id: anna }] = await query<{ id: string }>("insert into clients (business_id, name, phone_e164, email) values ($1, 'Анна Тест', $2, $3) returning id", [
    demo.business.id,
    PHONE,
    EMAIL,
  ]);
  [{ id: login }] = await query<{ id: string }>("insert into users (business_id, email, name, role, staff_id) values ($1, 'desk-msg@example.test', 'Логин Тест', 'admin', null) returning id", [demo.business.id]);
  valVisit = await visitOf(demo.staff.valentin, "2026-11-11T08:00:00Z");
  jevVisit = await visitOf(demo.staff.jevgeni, "2026-11-11T09:00:00Z");
});

/** A visit of Anna's with this barber, straight into the table. */
async function visitOf(staff: string, startsAt: string): Promise<string> {
  const [row] = await query<{ id: string }>(
    `insert into appointments (business_id, location_id, staff_id, client_id, starts_at, ends_at, blocked_until, source)
     select $1, s.location_id, s.id, $2, $3::timestamptz, $3::timestamptz + interval '30 minutes', $3::timestamptz + interval '30 minutes', 'admin'
       from staff s where s.id = $4 returning id`,
    [demo.business.id, anna, startsAt, staff],
  );
  return row.id;
}

type Add = {
  kind: string;
  channel?: "sms" | "email" | "push";
  to?: string;
  visit?: string | null;
  client?: string | null;
  user?: string | null;
  payload?: Record<string, unknown>;
  status?: string;
  at?: string;
  sendAt?: string;
  sentAt?: string | null;
  openedAt?: string | null;
  locale?: string;
  provider?: string | null;
  segments?: number | null;
};

/** One outbox row straight into the table, as the outbox would have it. */
async function add(o: Add): Promise<string> {
  const at = o.at ?? "2026-11-10T10:00:00Z";
  const [row] = await query<{ id: string }>(
    `insert into notifications (business_id, appointment_id, client_id, user_id, channel, kind, recipient, locale, payload, status,
                                send_at, sent_at, opened_at, created_at, provider, segments)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::timestamptz, $12::timestamptz, $13::timestamptz, $14::timestamptz, $15, $16) returning id`,
    [
      demo.business.id,
      o.visit ?? null,
      o.client === undefined ? (o.user ? null : anna) : o.client,
      o.user ?? null,
      o.channel ?? "sms",
      o.kind,
      o.to ?? (o.channel === "email" ? EMAIL : o.channel === "push" ? "push" : PHONE),
      o.locale ?? "ru",
      JSON.stringify(o.payload ?? {}),
      o.status ?? "sent",
      o.sendAt ?? at,
      o.sentAt === undefined ? ((o.status ?? "sent") === "sent" ? at : null) : o.sentAt,
      o.openedAt ?? null,
      at,
      o.provider ?? null,
      o.segments ?? null,
    ],
  );
  return row.id;
}

const all = (over: Record<string, unknown> = {}) => cleanMessages({ ...defaultMessages("2026-11-20"), from: "2025-01-01", to: "2026-12-31", ...over });
const list = (over: Record<string, unknown> = {}, who: Holder | null = owner()) => listMessageLog(query, demo.business, all(over), who);

const owner = (): Holder & { id: string } => legacyHolder("owner", "owner-login");
const desk = (): Holder & { id: string } => legacyHolder("admin", "desk-login");
const barber = (): Holder & { id: string } => legacyHolder("staff", "barber-login", demo.staff.valentin);
function without(h: Holder & { id: string }, off: string[]): Holder & { id: string } {
  return { ...h, rights: { ...h.rights, on: new Set([...h.rights.on].filter((k) => !off.includes(k))) } };
}
/** the front desk limited to some barbers' columns */
function deskOf(staff: string[]): Holder & { id: string } {
  const d = desk();
  return { ...d, rights: { ...d.rights, values: { ...d.rights.values, "journal.staff": staff } } };
}

describe("the question", () => {
  it("is copied by name and checked: unknown kinds, statuses and channels are dropped", () => {
    const f = cleanMessages({ from: "2026-11-20", to: "2026-11-01", kind: "nope", status: "lost", channel: "fax", q: "  Анна   Тест ", page: -3, size: 7, extra: 1 });
    expect(f).toEqual({ from: "2026-11-01", to: "2026-11-20", kind: null, status: null, channel: null, q: "Анна Тест", page: 1, size: 25 });
    expect(cleanMessages({ kind: "reminder", status: "opened", channel: "email", size: 100, page: 3 })).toMatchObject({ kind: "reminder", status: "opened", channel: "email", size: 100, page: 3 });
    expect(cleanMessages({ q: "x".repeat(200) }).q).toHaveLength(MESSAGE_Q_MAX);
    expect(cleanMessages(null)).toMatchObject({ from: null, to: null, page: 1, size: 25 });
  });

  it("opens on the last month; the action hands on its known parts only", () => {
    expect(defaultMessages("2026-11-20")).toMatchObject({ from: "2026-10-20", to: "2026-11-20", kind: "", page: 1, size: 25 });
    expect(Object.keys(messageQuestion({ from: "2026-11-01", q: "a", ...({ payload: "x" } as object) })).sort()).toEqual(["channel", "from", "kind", "page", "q", "size", "status", "to"]);
  });
});

describe("«Содержание»", () => {
  const base = (o: Partial<ContentInput>): ContentInput => ({ kind: "reminder", channel: "sms", locale: "ru", payload: {}, visit: null, business: { name: "REMPIRE", timezone: "Europe/Tallinn" }, ...o });
  const visit = { startsAt: "2026-11-21T08:00:00.000Z", staff: "Валентин" };

  it("an SMS: its own text, without the change link", () => {
    const sms = messageContent(base({ payload: { startsAt: "2026-11-21T08:00:00.000Z", staff: "Valentin", business: "REMPIRE" } }));
    expect(sms).toBe("REMPIRE: reminder of your visit on 21.11 at 10:00 with Valentin.");
    // the visit fills what the payload leaves out
    expect(messageContent(base({ visit }))).toContain("21.11 at 10:00");
    expect(messageContent(base({ kind: "birthday" }))).toMatch(/^Happy birthday from REMPIRE!/);
  });

  it("a letter: its subject, in its own language", () => {
    expect(messageContent(base({ kind: "confirmation", channel: "email", visit }))).toBe("Вы записаны в REMPIRE: 21.11, 10:00");
    expect(messageContent(base({ kind: "moved", channel: "email", locale: "en", visit }))).toBe("Your REMPIRE booking has moved: 21.11, 10:00");
    expect(messageContent(base({ kind: "invoice", channel: "email", locale: "et", invoice: { number: "R-2026-0007", credit: false } }))).toBe("Arve R-2026-0007 · REMPIRE");
    expect(messageContent(base({ kind: "invoice", channel: "email", locale: "et", invoice: { number: null, credit: false } }))).toBeNull();
    // a letter about a visit that is gone, with no time kept: its kind alone
    expect(messageContent(base({ kind: "cancelled", channel: "email" }))).toBeNull();
  });

  it("words written by hand, cut short", () => {
    expect(messageContent(base({ kind: "manual", payload: { text: "  Ждём   вас  " } }))).toBe("Ждём вас");
    const long = messageContent(base({ kind: "mass", channel: "email", payload: { text: "а".repeat(500) } }))!;
    expect(long).toHaveLength(200);
    expect(long.endsWith("…")).toBe(true);
  });

  it("a notification: its title and words; the plan its title and day", () => {
    const pushed = messageContent(
      base({ kind: "visit_new", channel: "push", payload: { startsAt: visit.startsAt, visitId: "v1", client: "Анна Тест", services: [{ ru: "Стрижка", et: "Lõikus", en: "Haircut" }] } }),
    );
    expect(pushed).toContain("Анна Тест");
    expect(pushed).toContain("Стрижка");
    expect(messageContent(base({ kind: "day_plan", channel: "push", payload: { date: "2026-11-21", count: 4 } }))).toMatch(/: 21\.11$/);
    expect(messageContent(base({ kind: "day_plan", channel: "push", payload: {} }))).toBeNull();
  });

  it("a login code: nothing but its kind, whatever its payload holds", () => {
    for (const channel of ["sms", "email", "push"] as const) {
      expect(messageContent(base({ kind: "login_code", channel, payload: { code: CODE, text: `${CODE} — код для входа` } }))).toBeNull();
    }
  });
});

describe("the log", () => {
  it("newest first, each status with its own time, its carrier and parts", async () => {
    const sent = await add({ kind: "reminder", visit: valVisit, at: "2026-11-10T10:00:00Z", provider: "messaggio", segments: 2, payload: { startsAt: "2026-11-11T08:00:00Z" } });
    const opened = await add({ kind: "confirmation", channel: "email", visit: valVisit, at: "2026-11-11T10:00:00Z", openedAt: "2026-11-11T12:00:00Z", provider: "resend" });
    const queued = await add({ kind: "reminder", visit: valVisit, status: "queued", at: "2026-11-12T10:00:00Z", sendAt: "2026-11-12T16:00:00Z" });
    const failed = await add({ kind: "birthday", status: "failed", at: "2026-11-13T10:00:00Z", payload: { date: "2026-11-13" } });
    const r = await list();
    expect(r.total).toBe(4);
    expect(r.rows.map((m) => m.id)).toEqual([failed, queued, opened, sent]);
    const by = new Map(r.rows.map((m) => [m.id, m]));
    expect(by.get(sent)).toMatchObject({ status: "sent", statusAt: Date.parse("2026-11-10T10:00:00Z"), provider: "messaggio", segments: 2, contact: PHONE, name: "Анна Тест", clientId: anna, toStaff: false });
    expect(by.get(sent)!.content).toMatch(/^REMPIRE: reminder of your visit on 11.11 at 10:00/);
    expect(by.get(opened)).toMatchObject({ status: "opened", statusAt: Date.parse("2026-11-11T12:00:00Z"), contact: EMAIL, staffName: expect.any(String) });
    expect(by.get(queued)).toMatchObject({ status: "queued", statusAt: Date.parse("2026-11-12T16:00:00Z"), provider: null });
    expect(by.get(failed)).toMatchObject({ status: "failed", statusAt: null, visitAt: null });
    // the payload never leaves the server
    for (const m of r.rows) expect(m).not.toHaveProperty("payload");
  });

  it("a notification to a login's phone: that login's name, no contact", async () => {
    const id = await add({ kind: "visit_new", channel: "push", user: login, visit: valVisit, provider: "webpush", payload: { startsAt: "2026-11-11T08:00:00Z", visitId: valVisit, client: "Анна Тест" } });
    const [m] = (await list()).rows;
    expect(m).toMatchObject({ id, toStaff: true, name: "Логин Тест", contact: null, clientId: null, channel: "push" });
    expect(m.content).toContain("Анна Тест");
  });
});

describe("the rights", () => {
  it("«Просматривать детализацию сообщений» opens it; a barber's login has none", async () => {
    await add({ kind: "reminder", visit: valVisit });
    expect((await list({}, owner())).total).toBe(1);
    expect((await list({}, desk())).total).toBe(1);
    expect(await list({}, barber())).toMatchObject({ total: 0, rows: [] });
    expect(await list({}, without(owner(), ["reports.messages"]))).toMatchObject({ total: 0, rows: [] });
    expect(messagesMay(barber())).toEqual({ open: false, phones: false });
    expect(messagesMay(desk())).toEqual({ open: true, phones: true });
    // the phones' right means nothing without the log's
    expect(messagesMay(without(owner(), ["reports.messages"])).phones).toBe(false);
  });

  it("phones and e-mails whole only with «Показывать номера телефонов в сообщениях»", async () => {
    await add({ kind: "reminder", visit: valVisit, at: "2026-11-10T10:00:00Z" });
    await add({ kind: "confirmation", channel: "email", visit: valVisit, at: "2026-11-10T09:00:00Z" });
    const whole = await list({}, desk());
    expect(whole.rows.map((m) => m.contact)).toEqual([PHONE, EMAIL]);
    const masked = await list({}, without(desk(), ["reports.messages.phones"]));
    expect(masked.rows.map((m) => m.contact)).toEqual([maskPhone(PHONE), maskEmail(EMAIL)]);
    const json = JSON.stringify(masked);
    expect(json).not.toContain(PHONE);
    expect(json).not.toContain(EMAIL);
    // the name stays: it is not a contact
    expect(masked.rows[0].name).toBe("Анна Тест");
  });

  it("a search by phone or e-mail finds only with the phones' right; by name always", async () => {
    await add({ kind: "reminder", visit: valVisit });
    await add({ kind: "confirmation", channel: "email", visit: valVisit });
    expect((await list({ q: "55500123" }, desk())).total).toBe(2);
    expect((await list({ q: "+372 5550 0123" }, desk())).total).toBe(2);
    expect((await list({ q: "anna@example" }, desk())).total).toBe(1);
    const blind = without(desk(), ["reports.messages.phones"]);
    expect((await list({ q: "55500123" }, blind)).total).toBe(0);
    expect((await list({ q: "anna@example" }, blind)).total).toBe(0);
    expect((await list({ q: "Анна" }, blind)).total).toBe(2);
    // a like pattern is text, not a wildcard
    expect((await list({ q: "%" }, desk())).total).toBe(0);
  });

  it("a login limited to some barbers gets their visits' messages only, none about no visit", async () => {
    const val = await add({ kind: "reminder", visit: valVisit, at: "2026-11-10T10:00:00Z" });
    await add({ kind: "reminder", visit: jevVisit, at: "2026-11-10T11:00:00Z" });
    await add({ kind: "birthday", at: "2026-11-10T12:00:00Z", payload: { date: "2026-11-10" } });
    await add({ kind: "login_code", channel: "email", client: null, to: "desk@example.test", at: "2026-11-10T13:00:00Z", payload: { code: CODE } });
    expect((await list({}, desk())).total).toBe(4);
    expect((await list({}, deskOf([demo.staff.valentin]))).rows.map((m) => m.id)).toEqual([val]);
    expect((await list({}, deskOf([demo.staff.valentin, demo.staff.jevgeni]))).total).toBe(2);
    expect((await list({}, deskOf([]))).total).toBe(0);
  });

  it("a client the login may not see: no card link", async () => {
    await add({ kind: "reminder", visit: valVisit });
    const d = desk();
    const noClients = { ...d, rights: { ...d.rights, values: { ...d.rights.values, "clients.show": [demo.staff.milena] } } };
    expect((await list({}, d)).rows[0].clientId).toBe(anna);
    expect((await list({}, noClients)).rows[0].clientId).toBeNull();
  });
});

describe("the filters and the pages", () => {
  it("by type, channel and status; «sent» takes the opened ones too", async () => {
    await add({ kind: "reminder", visit: valVisit, at: "2026-11-10T10:00:00Z" });
    await add({ kind: "confirmation", channel: "email", visit: valVisit, at: "2026-11-10T11:00:00Z", openedAt: "2026-11-10T12:00:00Z" });
    await add({ kind: "confirmation", channel: "email", visit: jevVisit, at: "2026-11-10T12:00:00Z" });
    await add({ kind: "manual", status: "failed", at: "2026-11-10T13:00:00Z", payload: { text: "Ждём вас" } });
    await add({ kind: "visit_new", channel: "push", user: login, status: "skipped", at: "2026-11-10T14:00:00Z" });
    expect((await list({ kind: "confirmation" })).total).toBe(2);
    expect((await list({ channel: "sms" })).total).toBe(2);
    expect((await list({ channel: "push" })).total).toBe(1);
    expect((await list({ status: "opened" })).rows.map((m) => m.status)).toEqual(["opened"]);
    expect((await list({ status: "sent" })).total).toBe(3);
    expect((await list({ status: "failed" })).rows.map((m) => m.content)).toEqual(["Ждём вас"]);
    expect((await list({ status: "skipped", channel: "push" })).total).toBe(1);
    expect((await list({ kind: "reminder", channel: "email" })).total).toBe(0);
  });

  it("by the salon's days, not UTC's", async () => {
    // 00:30 on 10.11 in Tallinn is still 9.11 in UTC
    const late = await add({ kind: "reminder", visit: valVisit, at: "2026-11-09T22:30:00Z" });
    await add({ kind: "reminder", visit: valVisit, at: "2026-11-11T10:00:00Z" });
    expect((await list({ from: "2026-11-10", to: "2026-11-10" })).rows.map((m) => m.id)).toEqual([late]);
    expect((await list({ from: "2026-11-01", to: "2026-11-09" })).total).toBe(0);
    expect((await list({ from: "2026-11-10", to: "2026-11-11" })).total).toBe(2);
  });

  it("pages of the size asked; a page past the end is the last one", async () => {
    for (let i = 0; i < 30; i++) await add({ kind: "manual", at: new Date(Date.parse("2026-11-10T08:00:00Z") + i * 60_000).toISOString(), payload: { text: `№${i}` } });
    const one = await list({ size: 25 });
    expect(one).toMatchObject({ total: 30, page: 1, pages: 2 });
    expect(one.rows).toHaveLength(25);
    expect(one.rows[0].content).toBe("№29");
    const two = await list({ size: 25, page: 2 });
    expect(two.rows.map((m) => m.content)).toEqual(["№4", "№3", "№2", "№1", "№0"]);
    expect(await list({ size: 25, page: 99 })).toMatchObject({ page: 2, pages: 2 });
    expect((await list({ size: 50 })).rows).toHaveLength(30);
    expect(await list({ kind: "birthday" })).toMatchObject({ total: 0, pages: 0, rows: [] });
  });
});

describe("a login code", () => {
  it("never shows its code: not in the content, not anywhere in the answer", async () => {
    await add({ kind: "login_code", channel: "email", client: null, to: "desk@example.test", payload: { code: CODE, text: `${CODE} — код для входа`, subject: `${CODE} — код` } });
    await add({ kind: "login_code", channel: "sms", client: null, to: PHONE, payload: { code: CODE, text: `Code ${CODE}` } });
    for (const who of [owner(), desk(), without(desk(), ["reports.messages.phones"])]) {
      const r = await list({}, who);
      expect(r.total).toBe(2);
      expect(r.rows.every((m) => m.kind === "login_code" && m.content === null)).toBe(true);
      expect(JSON.stringify(r)).not.toContain(CODE);
    }
    // nor found by it
    expect((await list({ q: CODE })).total).toBe(0);
  });
});
