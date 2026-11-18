import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminCancelVisit, adminSetStatus, adminUpdateVisit } from "@/lib/admin/visits";
import { book, CHANGE_LETTER_DELAY_MS, type BookingInput } from "@/lib/booking";
import { closeDb, query } from "@/lib/db";
import { sentToConsole } from "@/lib/email";
import { runOutbox, sendForVisit } from "@/lib/outbox";
import { sentSms } from "@/lib/sms";
import { addDays, todayIn, zonedToUtc } from "@/lib/tz";
import { findVisit } from "@/lib/visits";
import { freshDemo, type Demo } from "./helpers";

// The admin works on the real clock, so these visits are a week or more ahead.
const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const ENV = { NODE_ENV: "test", VITEST: "true", SITE_URL: "https://broneeri.rempire.ee", ALLOW_INDEXING: "yes" };

/** the first Tuesday at least a week from today */
function tuesday(): string {
  let d = addDays(todayIn(TZ), 7);
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 2) d = addDays(d, 1);
  return d;
}

let demo: Demo;
let DAY: string;
beforeEach(async () => {
  demo = await freshDemo();
  DAY = tuesday();
  sentSms.length = 0;
  sentToConsole.length = 0;
});
afterAll(closeDb);

let n = 0;
const input = (o: { time?: string; email?: string | null; locale?: "ru" | "et" | "en"; phone?: string } = {}): BookingInput => ({
  serviceIds: [demo.services.clip],
  staffId: demo.staff.renat,
  startsAt: new Date(at(DAY, o.time ?? "12:00")).toISOString(),
  name: "Test Client",
  phone: o.phone ?? "+372 5555 0301",
  email: o.email === undefined ? "client@example.test" : o.email,
  comment: "",
  locale: o.locale ?? "ru",
  smsReminder: false,
  idempotencyKey: `change-${++n}-${Math.random()}`,
});

/** an online booking whose confirmation letter has gone */
async function confirmed(o: Parameters<typeof input>[0] = {}) {
  const r = await book(query, demo.business, input(o), { now: Date.now() });
  if (!r.ok) throw new Error(r.code);
  if (o.email !== null) {
    const sent = await sendForVisit(query, r.visit.id, Date.now(), ENV);
    expect(sent.sent).toBe(1);
  }
  sentToConsole.length = 0;
  return r.visit.id;
}

const rows = (id: string, kind: string) =>
  query<{ recipient: string; locale: string; status: string; send_at: Date; last_error: string | null }>(
    "select recipient, locale, status, send_at, last_error from notifications where appointment_id = $1 and kind = $2 order by created_at",
    [id, kind],
  );
const move = async (id: string, patch: Parameters<typeof adminUpdateVisit>[2]) => {
  const r = await adminUpdateVisit(demo.business, id, patch, "test");
  if (!r.ok) throw new Error(r.code);
};
// the cron, once the moved letter's 2 minutes are up
const cronLater = () => runOutbox(query, Date.now() + CHANGE_LETTER_DELAY_MS + 60_000, ENV);
const tokenIn = (html: string) => /\/ru\/visit\/([A-Za-z0-9_-]{32})/.exec(html)?.[1] ?? "";

describe("the admin moves a visit (Dim, 17.11.2026)", () => {
  it("the client gets a moved letter at the confirmation's address: new time, the old one, a working link, an updated .ics", async () => {
    const id = await confirmed();
    const before = Date.now();
    await move(id, { start: at(DAY, "14:00") });
    const [row] = await rows(id, "moved");
    expect(row).toMatchObject({ recipient: "client@example.test", locale: "ru", status: "queued" });
    expect(row.send_at.getTime()).toBeGreaterThanOrEqual(before + CHANGE_LETTER_DELAY_MS);

    // not yet: the 2 minutes are for quick second moves
    await runOutbox(query, Date.now(), ENV);
    expect(sentToConsole).toHaveLength(0);

    await cronLater();
    expect(sentToConsole).toHaveLength(1);
    const l = sentToConsole[0];
    expect(l.to).toBe("client@example.test");
    expect(l.subject).toMatch(/^Запись перенесена: \d\d\.\d\d, 14:00$/);
    expect(l.text).toMatch(/Было: [^\n]*, 12:00/);
    expect(l.text).toContain("14:00–14:45");
    expect(l.html).toContain("Новое время");
    expect(l.html).not.toContain("Test Client");
    const token = tokenIn(l.html ?? "");
    expect((await findVisit(query, demo.business.id, token))?.id).toBe(id);
    const ics = String(l.attachments?.[0].content ?? "");
    expect(ics).toContain(`DTSTART:${new Date(at(DAY, "14:00")).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`);
    expect(ics).toMatch(/METHOD:PUBLISH/);
    expect(ics).toMatch(/SEQUENCE:\d+/);
  });

  it("quick moves make one letter, with the final time and the time the client was told first", async () => {
    const id = await confirmed();
    await move(id, { start: at(DAY, "14:00") });
    await move(id, { start: at(DAY, "15:00") });
    expect(await rows(id, "moved")).toHaveLength(1);
    await cronLater();
    expect(sentToConsole).toHaveLength(1);
    expect(sentToConsole[0].subject).toMatch(/, 15:00$/);
    expect(sentToConsole[0].text).toMatch(/Было: [^\n]*, 12:00/);
  });

  it("moved and moved back before the letter went: nothing is sent", async () => {
    const id = await confirmed();
    await move(id, { start: at(DAY, "14:00") });
    await move(id, { start: at(DAY, "12:00") });
    await cronLater();
    expect(sentToConsole).toHaveLength(0);
    expect((await rows(id, "moved"))[0]).toMatchObject({ status: "skipped", last_error: "back where it was" });
  });

  it("another barber at the same time: the letter says who it was", async () => {
    const id = await confirmed({ locale: "et" });
    await move(id, { staffId: demo.staff.valentin });
    await cronLater();
    expect(sentToConsole[0].subject).toMatch(/^Aeg on muudetud: REMPIRE \d\d\.\d\d kell 12:00$/);
    expect(sentToConsole[0].text).toMatch(/Enne: [^\n]*12:00 · Renat/);
    expect(sentToConsole[0].text).toContain("Meister: Valentin");
  });

  it("the confirmation has not gone yet: no moved letter; the confirmation shows the new time", async () => {
    const r = await book(query, demo.business, input(), { now: Date.now() });
    if (!r.ok) throw new Error(r.code);
    await move(r.visit.id, { start: at(DAY, "16:00") });
    expect(await rows(r.visit.id, "moved")).toHaveLength(0);
    await runOutbox(query, Date.now(), ENV);
    expect(sentToConsole).toHaveLength(1);
    expect(sentToConsole[0].subject).toMatch(/^Вы записаны в REMPIRE: \d\d\.\d\d, 16:00$/);
  });

  it("no e-mail with the booking, or a visit already under way: nothing is queued", async () => {
    const none = await confirmed({ email: null, phone: "+372 5555 0302" });
    await move(none, { start: at(DAY, "14:00") });
    expect(await query("select 1 from notifications where appointment_id = $1 and channel = 'email'", [none])).toHaveLength(0);

    const arrived = await confirmed({ time: "17:00" });
    expect(await adminSetStatus(demo.business, arrived, "arrived", "test")).toBe(true);
    await move(arrived, { start: at(DAY, "18:00") });
    expect(await rows(arrived, "moved")).toHaveLength(0);
  });
});

describe("the admin cancels a visit (Dim, 17.11.2026)", () => {
  it("the client gets a cancelled letter right away: the old time struck out, «book again», a CANCEL .ics", async () => {
    const id = await confirmed({ time: "13:00" });
    expect(await adminCancelVisit(demo.business, id, "test")).toBe("cancelled");
    expect((await rows(id, "cancelled"))[0]).toMatchObject({ recipient: "client@example.test", status: "queued" });

    await runOutbox(query, Date.now() + 1_000, ENV);
    expect(sentToConsole).toHaveLength(1);
    const l = sentToConsole[0];
    expect(l.subject).toMatch(/^Запись отменена: \d\d\.\d\d, 13:00$/);
    expect(l.html).toContain("line-through");
    expect(l.html).toContain('href="https://broneeri.rempire.ee/ru"');
    expect(l.html).toContain("Записаться снова");
    expect(l.html).not.toContain("Перенести или отменить");
    expect(l.html).toContain("у вас была запись в REMPIRE");
    expect(l.text).not.toMatch(/Итого|Сумма/);
    expect(l.attachments?.[0].contentType).toContain("method=CANCEL");
    expect(String(l.attachments?.[0].content)).toMatch(/METHOD:CANCEL[\s\S]*STATUS:CANCELLED/);
  });

  it("moved, then cancelled before the moved letter went: only the cancelled letter", async () => {
    const id = await confirmed();
    await move(id, { start: at(DAY, "14:00") });
    expect(await adminCancelVisit(demo.business, id, "test")).toBe("cancelled");
    expect((await rows(id, "moved"))[0].status).toBe("cancelled");
    await cronLater();
    expect(sentToConsole.map((l) => l.subject)).toEqual([expect.stringMatching(/^Запись отменена: .*, 14:00$/)]);
  });

  it("cancelled before its confirmation went: no letter at all", async () => {
    const r = await book(query, demo.business, input(), { now: Date.now() });
    if (!r.ok) throw new Error(r.code);
    expect(await adminCancelVisit(demo.business, r.visit.id, "test")).toBe("cancelled");
    expect(await rows(r.visit.id, "cancelled")).toHaveLength(0);
    await runOutbox(query, Date.now(), ENV);
    expect(sentToConsole).toHaveLength(0);
  });
});
