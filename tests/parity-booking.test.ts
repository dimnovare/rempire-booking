/**
 * Parity with Altegio: behaviours that were built but that no test walked
 * through end to end. The barber's and the service's «online booking»
 * switches, the comment and e-mail typed in a booking, the client's own
 * cancel and move from his link, and a staff push switched off on
 * «Уведомления».
 *
 * Fake people, phones and addresses only. Letters go to the console
 * transport; pushes to a fake sender or nowhere (the keys are never checked
 * without a real send). Most of it runs on a fixed clock (Monday
 * 16.11.2026, 10:00 in Tallinn); the move runs on the real clock, because
 * the staff's move it goes through asks Date.now() for the letter and the
 * push, so its visit is found some days ahead on any day.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCalendar, loadVisitData } from "@/lib/admin/calendar";
import { saveType } from "@/lib/admin/notification-store";
import { setServiceOnline } from "@/lib/admin/services";
import { saveStaffProfile } from "@/lib/admin/staff";
import { adminCreateVisit, type AdminVisitInput } from "@/lib/admin/visits";
import { backfillRights, loadHolder } from "@/lib/auth/rights-store";
import { loadAvailability } from "@/lib/availability";
import { book, CHANGE_LETTER_DELAY_MS, type BookingInput } from "@/lib/booking";
import { loadCatalog } from "@/lib/catalog";
import { moveByClient } from "@/lib/client-move";
import { closeDb, query } from "@/lib/db";
import { sendEmail, sentToConsole } from "@/lib/email";
import { runOutbox, sendForVisit, type Senders } from "@/lib/outbox";
import { saveSubscription, setNotify } from "@/lib/push";
import type { PushText } from "@/lib/push-kinds";
import { sendSms } from "@/lib/sms";
import { addDays, todayIn } from "@/lib/tz";
import { cancelByClient, findVisit } from "@/lib/visits";
import { freshDemo, zonedToUtc, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const iso = (ms: number) => new Date(ms).toISOString();
// Monday 16.11.2026, 10:00 in Tallinn
const NOW = at("2026-11-16", "10:00");
// Tuesday 17.11.2026: Renat and Jevgeni 10:00–19:00, Slava 10:00–18:30; Valentin and Milena are off
const TUE = "2026-11-17";
const HOUR = 3_600_000;
const KEYS = { VAPID_PUBLIC_KEY: "test-public-key", VAPID_PRIVATE_KEY: "test-private-key" };
const PUSH_ENV = { NODE_ENV: "test", VITEST: "true", ...KEYS };
const MAIL_ENV = { NODE_ENV: "test", VITEST: "true", SITE_URL: "https://broneeri.rempire.ee", ALLOW_INDEXING: "yes" };

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
  sentToConsole.length = 0;
});
afterAll(closeDb);

let n = 0;
const input = (o: Partial<BookingInput> & { staff?: string | null; services?: string[]; date?: string; time?: string } = {}): BookingInput => ({
  serviceIds: (o.services ?? ["clip"]).map((s) => demo.services[s]),
  staffId: o.staff === undefined ? demo.staff.renat : o.staff === null ? null : demo.staff[o.staff],
  startsAt: o.startsAt ?? iso(at(o.date ?? TUE, o.time ?? "10:00")),
  name: o.name ?? "Test Client",
  phone: o.phone ?? "+372 5555 0801",
  email: o.email ?? null,
  comment: o.comment ?? "",
  locale: o.locale ?? "ru",
  smsReminder: o.smsReminder ?? false,
  idempotencyKey: o.idempotencyKey ?? `parity-booking-${++n}-${Math.random()}`,
});

const adminVisit = (o: Partial<AdminVisitInput> & { staff?: string; time?: string; services?: string[] } = {}): AdminVisitInput => ({
  staffId: demo.staff[o.staff ?? "renat"],
  start: o.start ?? at(TUE, o.time ?? "15:00"),
  serviceIds: (o.services ?? ["clip"]).map((s) => demo.services[s]),
  name: o.name ?? "Test Client",
  phone: o.phone ?? "+372 5555 0899",
  email: o.email ?? null,
  idempotencyKey: `parity-admin-${++n}-${Math.random()}`,
});

/** The free starts the booking page offers for these services on one local day. */
const starts = async (o: { staff?: string | null; services?: string[]; date?: string; now?: number } = {}) => {
  const r = await loadAvailability(query, {
    business: demo.business,
    serviceIds: (o.services ?? ["clip"]).map((s) => demo.services[s]),
    staffId: o.staff ? demo.staff[o.staff] : null,
    from: o.date ?? TUE,
    days: 1,
    now: o.now ?? NOW,
  });
  return r.days[0]?.slots ?? [];
};

/* ---------------------------------------------------------------- logins with a phone, for the pushes */

let ids: Record<string, string> = {};
async function login(email: string, role: string, staff: string | null): Promise<string> {
  const [u] = await query<{ id: string }>("insert into users (business_id, email, name, role, staff_id, locale) values ($1, $2, $3, $4, $5, 'ru') returning id", [
    demo.business.id,
    email,
    email.split("@")[0],
    role,
    staff ? demo.staff[staff] : null,
  ]);
  await saveSubscription(query, u.id, { endpoint: `https://push.example.test/${email}`, p256dh: "p256", auth: "auth", label: "test" });
  return u.id;
}
/** Renat's login (no column of his own here) and Jevgeni's, each with a phone; the push keys set. */
async function logins() {
  Object.assign(process.env, KEYS);
  ids = { owner: await login("owner@example.test", "owner", null), jevgeni: await login("jevgeni@example.test", "staff", "jevgeni") };
  await backfillRights(query, demo.business.id);
}
function noKeys() {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
}
const pushRows = (kind?: string) =>
  query<{ user_id: string; kind: string; status: string; last_error: string | null; payload: Record<string, unknown>; appointment_id: string | null }>(
    `select user_id, kind, status, last_error, payload, appointment_id from notifications
      where channel = 'push' and ($1::text is null or kind = $1) order by created_at, kind`,
    [kind ?? null],
  );
const who = (rows: { user_id: string; kind: string }[]) => rows.map((r) => `${Object.entries(ids).find(([, id]) => id === r.user_id)?.[0] ?? "?"}:${r.kind}`).sort();

/* ---------------------------------------------------------------- 1. the barber's switch */

describe("a barber with «online booking» switched off", () => {
  const setBookable = async (slug: string, bookable: boolean) => {
    const [s] = await query<{ display_name: string; role: Record<string, string>; bio: Record<string, string> | null; photo_url: string | null }>(
      "select display_name, role, bio, photo_url from staff where id = $1",
      [demo.staff[slug]],
    );
    const r = await saveStaffProfile(demo.business, demo.staff[slug], { name: s.display_name, role: s.role, bio: s.bio ?? {}, photoUrl: s.photo_url, bookable, active: true }, "test");
    expect(r).toEqual({ ok: true, id: demo.staff[slug] });
  };
  const catalogStaff = async () => (await loadCatalog(query, demo.business.id)).staff.map((s) => s.slug);

  it("is not on the client booking page, is offered no time, and «anyone» never books him", async () => {
    expect(await catalogStaff()).toContain("jevgeni");
    await setBookable("jevgeni", false);

    const list = await catalogStaff();
    expect(list).not.toContain("jevgeni");
    expect(list).toEqual(expect.arrayContaining(["renat", "slava"]));
    // no time with him, and none of «anyone»'s times is his
    expect(await starts({ staff: "jevgeni" })).toEqual([]);
    const anyone = await starts();
    expect(anyone.length).toBeGreaterThan(0);
    expect(anyone.every((s) => !s.staffIds.includes(demo.staff.jevgeni))).toBe(true);
    // a request for him by his id, as a stale page would send it
    expect(await book(query, demo.business, input({ staff: "jevgeni", time: "11:00" }), { now: NOW })).toEqual({ ok: false, code: "not_offered", field: "staff" });

    // three «anyone» at 11:00: Renat and Slava take two, the third is told the time is gone
    const a = await book(query, demo.business, input({ staff: null, time: "11:00", phone: "+372 5555 0811" }), { now: NOW });
    const b = await book(query, demo.business, input({ staff: null, time: "11:00", phone: "+372 5555 0812" }), { now: NOW });
    const c = await book(query, demo.business, input({ staff: null, time: "11:00", phone: "+372 5555 0813" }), { now: NOW });
    expect([a.ok && a.visit.staffId, b.ok && b.visit.staffId].sort()).toEqual([demo.staff.renat, demo.staff.slava].sort());
    expect(c).toEqual({ ok: false, code: "slot_taken" });
    expect(await query("select id from appointments where staff_id = $1", [demo.staff.jevgeni])).toHaveLength(0);
  });

  it("the admin still books him, and his column stays in the calendar", async () => {
    await setBookable("jevgeni", false);
    const r = await adminCreateVisit(demo.business, adminVisit({ staff: "jevgeni", time: "15:00" }), "test");
    expect(r).toMatchObject({ ok: true, start: at(TUE, "15:00") });
    const cal = await loadCalendar(query, demo.business, TUE, 1);
    expect(cal.staff.find((s) => s.id === demo.staff.jevgeni)).toMatchObject({ bookable: false, active: true });
  });

  it("switched back on, he is offered again and «anyone» books him", async () => {
    await setBookable("jevgeni", false);
    for (const phone of ["+372 5555 0821", "+372 5555 0822"]) {
      expect((await book(query, demo.business, input({ staff: null, time: "11:00", phone }), { now: NOW })).ok).toBe(true);
    }
    await setBookable("jevgeni", true);
    expect(await catalogStaff()).toContain("jevgeni");
    expect((await starts({ staff: "jevgeni" })).map((s) => s.start)).toContain(at(TUE, "11:00"));
    // the only chair still free at 11:00 is his
    const r = await book(query, demo.business, input({ staff: null, time: "11:00", phone: "+372 5555 0823" }), { now: NOW });
    expect(r.ok && r.visit.staffId).toBe(demo.staff.jevgeni);
  });
});

/* ---------------------------------------------------------------- 2. the service's switch */

describe("a service with «online booking» switched off", () => {
  it("is not in the client catalog, and an online booking of it is refused", async () => {
    expect((await loadCatalog(query, demo.business.id)).services.map((s) => s.id)).toContain(demo.services.clip);
    expect(await setServiceOnline(demo.business, demo.services.clip, false, "test")).toEqual({ ok: true });

    const cat = await loadCatalog(query, demo.business.id);
    expect(cat.services.map((s) => s.id)).not.toContain(demo.services.clip);
    expect(cat.services.length).toBeGreaterThan(0);
    // and no barber's card offers it
    expect(cat.staff.every((s) => !(demo.services.clip in s.offers))).toBe(true);

    expect(await starts({ staff: "renat" })).toEqual([]);
    expect(await starts()).toEqual([]);
    expect(await book(query, demo.business, input({ staff: "renat", time: "10:00" }), { now: NOW })).toEqual({ ok: false, code: "not_offered", field: "staff" });
    expect(await book(query, demo.business, input({ staff: null, time: "10:00" }), { now: NOW })).toEqual({ ok: false, code: "not_offered", field: "services" });
    // with a service that is still online, as a basket made before the switch
    expect(await book(query, demo.business, input({ staff: "renat", services: ["clip", "grey"], time: "10:00" }), { now: NOW })).toMatchObject({ ok: false, code: "not_offered" });
    expect(await query("select id from appointments")).toHaveLength(0);
    // the other services are booked as before
    expect((await book(query, demo.business, input({ staff: "renat", services: ["grey"], time: "10:00" }), { now: NOW })).ok).toBe(true);
  });

  it("the admin still books it from the calendar, where it is still listed", async () => {
    await setServiceOnline(demo.business, demo.services.clip, false, "test");
    expect((await loadCalendar(query, demo.business, TUE, 1)).services.map((s) => s.id)).toContain(demo.services.clip);
    const r = await adminCreateVisit(demo.business, adminVisit({ staff: "renat", time: "12:00" }), "test");
    expect(r).toMatchObject({ ok: true, start: at(TUE, "12:00"), totalCents: 4000 });
    if (!r.ok) return;
    const [row] = await query<{ source: string }>("select source from appointments where id = $1", [r.id]);
    expect(row.source).toBe("admin");
    expect(await query<{ service_id: string }>("select service_id from appointment_services where appointment_id = $1", [r.id])).toEqual([{ service_id: demo.services.clip }]);
  });

  it("switched back on, it is in the catalog and booked online again", async () => {
    await setServiceOnline(demo.business, demo.services.clip, false, "test");
    await setServiceOnline(demo.business, demo.services.clip, true, "test");
    expect((await loadCatalog(query, demo.business.id)).services.map((s) => s.id)).toContain(demo.services.clip);
    expect(await book(query, demo.business, input({ staff: "renat", time: "10:00" }), { now: NOW })).toMatchObject({ ok: true });
  });
});

/* ---------------------------------------------------------------- 3. the comment and the e-mail */

describe("an online booking's comment and e-mail", () => {
  const cardEmail = async (phone: string) => (await query<{ email: string | null }>("select email from clients where phone_e164 = $1", [phone]))[0]?.email;

  it("the comment is kept on the visit, trimmed, where the visit window and the calendar read it", async () => {
    const r = await book(query, demo.business, input({ comment: "  Покороче по бокам  " }), { now: NOW });
    if (!r.ok) throw new Error(r.code);
    const [row] = await query<{ client_comment: string }>("select client_comment from appointments where id = $1", [r.visit.id]);
    expect(row.client_comment).toBe("Покороче по бокам");
    expect((await loadVisitData(query, demo.business, r.visit.id))?.visits[0].comment).toBe("Покороче по бокам");
    expect((await loadCalendar(query, demo.business, TUE, 1)).visits.find((v) => v.id === r.visit.id)?.comment).toBe("Покороче по бокам");
    // over 1000 characters: refused by the field's name, nothing booked
    expect(await book(query, demo.business, input({ comment: "x".repeat(1001), time: "12:00", phone: "+372 5555 0802" }), { now: NOW })).toEqual({ ok: false, code: "invalid", field: "comment" });
  });

  it("the e-mail goes on a new client's card, in small letters", async () => {
    expect((await book(query, demo.business, input({ email: "New.Client@Example.TEST" }), { now: NOW })).ok).toBe(true);
    expect(await cardEmail("+37255550801")).toBe("new.client@example.test");
  });

  it("a card without an e-mail gets the one typed; a card with one keeps it, and that visit's letter goes to the one typed", async () => {
    // a walk-in the admin added with no e-mail
    expect((await adminCreateVisit(demo.business, adminVisit({ phone: "+372 5555 0803", time: "15:00" }), "test")).ok).toBe(true);
    expect(await cardEmail("+37255550803")).toBeNull();

    expect((await book(query, demo.business, input({ phone: "+372 5555 0803", email: "first@example.test", time: "10:00" }), { now: NOW })).ok).toBe(true);
    expect(await cardEmail("+37255550803")).toBe("first@example.test");

    const again = await book(query, demo.business, input({ phone: "+372 5555 0803", email: "second@example.test", time: "12:00" }), { now: NOW });
    if (!again.ok) throw new Error(again.code);
    expect(await cardEmail("+37255550803")).toBe("first@example.test");
    const letters = await query<{ recipient: string }>("select recipient from notifications where appointment_id = $1 and kind = 'confirmation'", [again.visit.id]);
    expect(letters).toEqual([{ recipient: "second@example.test" }]);
  });
});

/* ---------------------------------------------------------------- 4. the client's own cancel */

describe("the client cancels online himself", () => {
  beforeEach(logins);
  afterEach(noKeys);

  const booked = async (time: string, phone: string) => {
    const r = await book(query, demo.business, input({ staff: "jevgeni", time, phone }), { now: NOW });
    if (!r.ok || !r.manageToken) throw new Error(`book: ${JSON.stringify(r)}`);
    return { id: r.visit.id, token: r.manageToken };
  };

  it("the barber gets a «cancelled» push, Renat an «own_client» one, and the time is free again at once", async () => {
    const v = await booked("12:00", "+372 5555 0831");
    expect((await starts({ staff: "jevgeni" })).map((s) => s.start)).not.toContain(at(TUE, "12:00"));
    await query("delete from notifications");

    expect(await cancelByClient(demo.business, v.token, NOW)).toBe("cancelled");
    const [row] = await query<{ status: string; cancelled_by: string }>("select status, cancelled_by from appointments where id = $1", [v.id]);
    expect(row).toEqual({ status: "cancelled", cancelled_by: "client" });

    const rows = await pushRows();
    expect(who(rows)).toEqual(["jevgeni:visit_cancelled", "owner:own_client"]);
    expect(rows.every((r) => r.appointment_id === v.id && r.status === "queued")).toBe(true);
    expect(rows.find((r) => r.kind === "own_client")?.payload).toMatchObject({ action: "cancelled", staff: "Jevgeni", client: "Test Client" });

    // free again for the booking page, and another client books it
    expect((await starts({ staff: "jevgeni" })).map((s) => s.start)).toContain(at(TUE, "12:00"));
    const other = await book(query, demo.business, input({ staff: "jevgeni", time: "12:00", phone: "+372 5555 0832" }), { now: NOW });
    expect(other).toMatchObject({ ok: true, visit: { staffId: demo.staff.jevgeni, startsAt: iso(at(TUE, "12:00")) } });
  });

  it("Renat with «Клиент перенёс или отменил» switched off: only the barber hears of it", async () => {
    await setNotify(query, demo.business.id, ids.owner, "own_client", false);
    const v = await booked("14:00", "+372 5555 0833");
    await query("delete from notifications");
    expect(await cancelByClient(demo.business, v.token, NOW)).toBe("cancelled");
    expect(who(await pushRows())).toEqual(["jevgeni:visit_cancelled"]);
    // a second tap changes nothing and tells nobody again
    expect(await cancelByClient(demo.business, v.token, NOW)).toBe("already");
    expect(await pushRows()).toHaveLength(1);
  });

  it("with an e-mail his confirmation went to, the «cancelled» letter is queued at once, as when the salon cancels (round 15)", async () => {
    const r = await book(query, demo.business, input({ staff: "jevgeni", time: "16:00", phone: "+372 5555 0834", email: "leaver@example.test" }), { now: NOW });
    if (!r.ok || !r.manageToken) throw new Error(`book: ${JSON.stringify(r)}`);
    expect((await sendForVisit(query, r.visit.id, NOW, MAIL_ENV)).sent).toBe(1);
    expect(await cancelByClient(demo.business, r.manageToken, NOW)).toBe("cancelled");
    const letters = await query<{ recipient: string; status: string; send_at: Date }>(
      "select recipient, status, send_at from notifications where appointment_id = $1 and kind = 'cancelled' and channel = 'email'",
      [r.visit.id],
    );
    expect(letters).toHaveLength(1);
    expect(letters[0]).toMatchObject({ recipient: "leaver@example.test", status: "queued" });
    expect(new Date(letters[0].send_at).getTime()).toBe(NOW);
    // a second tap queues no second letter
    expect(await cancelByClient(demo.business, r.manageToken, NOW)).toBe("already");
    expect(await query("select 1 from notifications where appointment_id = $1 and kind = 'cancelled'", [r.visit.id])).toHaveLength(1);
  });

  it("without an e-mail, or before any confirmation went, no letter: nothing to answer", async () => {
    const v = await booked("17:00", "+372 5555 0835");
    expect(await cancelByClient(demo.business, v.token, NOW)).toBe("cancelled");
    expect(await query("select 1 from notifications where appointment_id = $1 and kind = 'cancelled'", [v.id])).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------- 5. the client's own move */

describe("the client moves his visit online", () => {
  beforeEach(logins);
  afterEach(noKeys);

  it("the «moved» letter is queued for his e-mail, the barber and Renat get a push, and the old time is free again", async () => {
    // the real clock: a day some days ahead with two starts two hours apart
    const now = Date.now();
    const ahead = await loadAvailability(query, {
      business: demo.business,
      serviceIds: [demo.services.clip],
      staffId: demo.staff.jevgeni,
      from: addDays(todayIn(TZ), 3),
      days: 21,
      now,
    });
    const day = ahead.days.find((d) => d.slots.length && d.slots.some((s) => s.start >= d.slots[0].start + 2 * HOUR));
    if (!day) throw new Error("Jevgeni has no free day in three weeks");
    const from = day.slots[0].start;
    const to = day.slots.find((s) => s.start >= from + 2 * HOUR)!.start;

    const r = await book(query, demo.business, input({ staff: "jevgeni", startsAt: iso(from), phone: "+372 5555 0841", email: "mover@example.test" }), { now });
    if (!r.ok || !r.manageToken) throw new Error(`book: ${JSON.stringify(r)}`);
    // the confirmation has gone: a moved letter follows it
    expect((await sendForVisit(query, r.visit.id, Date.now(), MAIL_ENV)).sent).toBe(1);
    sentToConsole.length = 0;
    await query("delete from notifications where channel = 'push'");

    const before = Date.now();
    expect(await moveByClient(demo.business, r.manageToken, { startsAt: iso(to), extraCents: 0 }, Date.now())).toMatchObject({ ok: true, startsAt: iso(to) });
    expect((await findVisit(query, demo.business.id, r.manageToken))?.startsAt).toBe(iso(to));

    const [letter] = await query<{ recipient: string; locale: string; status: string; send_at: Date; payload: Record<string, unknown> }>(
      "select recipient, locale, status, send_at, payload from notifications where appointment_id = $1 and kind = 'moved'",
      [r.visit.id],
    );
    expect(letter).toMatchObject({ recipient: "mover@example.test", locale: "ru", status: "queued", payload: { fromStart: iso(from), fromStaffId: demo.staff.jevgeni } });
    expect(new Date(letter.send_at).getTime()).toBeGreaterThanOrEqual(before + CHANGE_LETTER_DELAY_MS);

    const pushes = await pushRows("visit_moved");
    expect(who(pushes)).toEqual(["jevgeni:visit_moved"]);
    expect(pushes[0].payload).toMatchObject({ fromStart: iso(from), startsAt: iso(to), staff: "Jevgeni" });
    // Renat hears of it too, as «Клиент перенёс или отменил» says (fixed 24.11.2026)
    const owner = await pushRows("own_client");
    expect(who(owner)).toEqual(["owner:own_client"]);
    expect(owner[0].payload).toMatchObject({ action: "moved", staff: "Jevgeni" });

    // the old time is offered again and another client takes it; the new one is taken
    const free = (await starts({ staff: "jevgeni", date: day.date, now: Date.now() })).map((s) => s.start);
    expect(free).toContain(from);
    expect(free).not.toContain(to);
    const other = await book(query, demo.business, input({ staff: "jevgeni", startsAt: iso(from), phone: "+372 5555 0842" }), { now: Date.now() });
    expect(other.ok).toBe(true);

    // once its two minutes are up, the letter goes to him with the new time
    await runOutbox(query, Date.now() + CHANGE_LETTER_DELAY_MS + 60_000, MAIL_ENV);
    expect(sentToConsole.map((l) => [l.to, l.subject])).toEqual([["mover@example.test", expect.stringMatching(/^Запись перенесена: /)]]);
  });
});

/* ---------------------------------------------------------------- 6. a staff push switched off */

describe("a staff push switched off on «Уведомления»", () => {
  beforeEach(logins);
  afterEach(noKeys);

  const sent: { userId: string; msg: PushText }[] = [];
  const senders: Senders = {
    sms: sendSms,
    email: sendEmail,
    push: async (_q, userId, msg) => {
      sent.push({ userId, msg });
      return { devices: 1, sent: 1, failed: 0, gone: 0 };
    },
  };
  beforeEach(() => {
    sent.length = 0;
  });
  const owner = async () => (await loadHolder(query, demo.business.id, ids.owner))!;

  it("the barber's «new visit» queued before is skipped when it goes; the salon's own push still goes", async () => {
    const r = await book(query, demo.business, input({ staff: "jevgeni", time: "12:00", phone: "+372 5555 0851" }), { source: "online", now: NOW });
    if (!r.ok) throw new Error(r.code);
    expect(who(await pushRows())).toEqual(["jevgeni:visit_new", "owner:own_online"]);

    expect(await saveType(demo.business, await owner(), "visit_new", { on: false })).toEqual({ ok: true, changed: ["on"] });
    await runOutbox(query, NOW + 60_000, PUSH_ENV, senders);

    expect(sent.map((s) => s.userId)).toEqual([ids.owner]);
    expect(await pushRows("visit_new")).toMatchObject([{ user_id: ids.jevgeni, status: "skipped", last_error: "switched off" }]);
    expect(await pushRows("own_online")).toMatchObject([{ user_id: ids.owner, status: "sent" }]);
  });

  it("switched on again, the next one goes to the barber", async () => {
    await saveType(demo.business, await owner(), "visit_new", { on: false });
    await saveType(demo.business, await owner(), "visit_new", { on: true });
    await setNotify(query, demo.business.id, ids.owner, "own_online", false);
    const r = await book(query, demo.business, input({ staff: "jevgeni", time: "14:00", phone: "+372 5555 0852" }), { source: "online", now: NOW });
    if (!r.ok) throw new Error(r.code);
    await runOutbox(query, NOW + 60_000, PUSH_ENV, senders);
    expect(sent).toEqual([{ userId: ids.jevgeni, msg: expect.objectContaining({ title: "Новая запись" }) }]);
    expect(await pushRows("visit_new")).toMatchObject([{ status: "sent" }]);
  });
});
