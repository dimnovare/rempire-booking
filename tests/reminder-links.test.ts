import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as shortLink } from "@/app/v/[token]/route";
import { adminCreateVisit } from "@/lib/admin/visits";
import { book, type BookingInput } from "@/lib/booking";
import { closeDb, query } from "@/lib/db";
import { sentToConsole } from "@/lib/email";
import { runOutbox } from "@/lib/outbox";
import { sentSms, smsSegments } from "@/lib/sms";
import { addDays, todayIn, zonedToUtc } from "@/lib/tz";
import { findVisit } from "@/lib/visits";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const NOW = at("2026-11-16", "10:00");
const TUE = "2026-11-17";
// the final address is not chosen yet; this is the longer of the two candidates
const LIVE = { NODE_ENV: "test", VITEST: "true", SITE_URL: "https://broneeri.rempire.ee" };
const LINK_RE = /https:\/\/broneeri\.rempire\.ee\/v\/([A-Za-z0-9_-]{16})(?![A-Za-z0-9_-])/;

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
  sentSms.length = 0;
  sentToConsole.length = 0;
});
afterAll(closeDb);

let n = 0;
const input = (o: Partial<BookingInput> & { time?: string } = {}): BookingInput => ({
  serviceIds: [demo.services.clip],
  staffId: demo.staff.renat,
  startsAt: new Date(at(TUE, o.time ?? "12:00")).toISOString(),
  name: "Test Client",
  phone: o.phone ?? "+372 5555 0201",
  email: o.email ?? null,
  comment: "",
  locale: o.locale ?? "ru",
  smsReminder: true,
  idempotencyKey: `links-${++n}-${Math.random()}`,
});

const open = (token: string) => shortLink(new Request(`http://localhost/v/${token}`), { params: Promise.resolve({ token }) } as never);

describe("SMS reminder: short change link (Dim, 17.11.2026)", () => {
  it("Russian: a working /v/ link and still 2 SMS parts", async () => {
    const r = await book(query, demo.business, input(), { now: NOW });
    if (!r.ok) throw new Error(r.code);
    // the reminder is due 2 hours before 12:00
    await runOutbox(query, at(TUE, "10:01"), LIVE);
    expect(sentSms).toHaveLength(1);
    const text = sentSms[0].text;
    const token = LINK_RE.exec(text)?.[1] ?? "";
    expect(token).toHaveLength(16);
    expect(text).toContain("Перенести/отменить: https://broneeri.rempire.ee/v/");
    expect(smsSegments(text).segments).toBe(2);
    expect((await findVisit(query, demo.business.id, token))?.id).toBe(r.visit.id);
    const [link] = await query<{ purpose: string }>("select purpose from visit_links where appointment_id = $1", [r.visit.id]);
    expect(link.purpose).toBe("sms");

    const res = await open(token);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`/ru/visit/${token}`);
  });

  it("Estonian stays GSM-7, so the address fits beside the link", async () => {
    const r = await book(query, demo.business, input({ locale: "et" }), { now: NOW });
    if (!r.ok) throw new Error(r.code);
    await runOutbox(query, at(TUE, "10:01"), LIVE);
    const text = sentSms[0].text;
    expect(text).toMatch(/Mardi 1, Tallinn\. Muuda\/tühista: https:\/\/broneeri\.rempire\.ee\/v\//);
    expect(smsSegments(text)).toMatchObject({ encoding: "gsm7", segments: 1 });
    const token = LINK_RE.exec(text)?.[1] ?? "";
    expect((await open(token)).headers.get("location")).toBe(`/et/visit/${token}`);
  });

  it("/v/ refuses junk and forwards an unknown token to the visit page, which says it is gone", async () => {
    expect((await open("bad token!")).status).toBe(404);
    expect((await open("short")).status).toBe(404);
    const res = await open("AAAAAAAAAAAAAAAA");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/ru/visit/AAAAAAAAAAAAAAAA");
  });
});

describe("admin bookings get the confirmation letter too (Dim, 17.11.2026)", () => {
  // the admin books on the real clock: a week from today, past any hours check
  const WEEK = () => addDays(todayIn(TZ), 7);
  const adminBook = (phone: string, time: string) =>
    adminCreateVisit(
      demo.business,
      {
        staffId: demo.staff.renat,
        start: at(WEEK(), time),
        force: true,
        serviceIds: [demo.services.clip],
        clientId: null,
        name: "Walk In",
        phone,
        smsReminder: false,
        idempotencyKey: `admin-links-${++n}-${Math.random()}`,
      },
      "test",
    );

  it("a client with an e-mail on file gets it, in the language of their earlier booking; the cron sends it", async () => {
    const first = await book(query, demo.business, input({ phone: "+372 5555 0202", email: "known@example.test", locale: "et" }), { now: NOW });
    if (!first.ok) throw new Error(first.code);
    const r = await adminBook("+372 5555 0202", "15:00");
    if (!r.ok) throw new Error(r.code);
    const rows = await query<{ recipient: string; locale: string; status: string }>(
      "select recipient, locale, status from notifications where appointment_id = $1 and kind = 'confirmation'",
      [r.id],
    );
    expect(rows).toEqual([{ recipient: "known@example.test", locale: "et", status: "queued" }]);

    await runOutbox(query, Date.now() + 60_000, LIVE);
    const letter = sentToConsole.find((l) => l.subject.includes("kell 15:00"));
    expect(letter?.subject).toMatch(/^Aeg on broneeritud: REMPIRE \d\d\.\d\d kell 15:00$/);
    expect(letter?.html).toContain("sest sul on aeg REMPIRE");
  });

  it("no e-mail on file, no letter", async () => {
    const r = await adminBook("+372 5555 0203", "16:00");
    if (!r.ok) throw new Error(r.code);
    const [q] = await query<{ n: number }>("select count(*)::int as n from notifications where appointment_id = $1 and kind = 'confirmation'", [r.id]);
    expect(q.n).toBe(0);
  });
});
