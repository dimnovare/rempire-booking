/**
 * «Настройки → Онлайн-запись», a barber's «График до» and the staff list's
 * switch (Dim, decisions round 15; docs/altegio-pages.md, Part 4 C):
 *
 * - the page's values: what it may save, by readSettings' own limits, one
 *   audit row, nothing written when nothing changes, and its right (the
 *   switch of the group «Онлайн-запись»);
 * - «Любой специалист» off: the booking page has no «Любой свободный
 *   барбер», /api/slots offers nobody for «anyone» and the booking refuses
 *   it; a named barber is booked as before;
 * - «График до» (migration 042): no day after it on the client's side (the
 *   booking page's days and times, «anyone», the booking, the client's own
 *   move); the journal is not held by it; it is set in the profile, and the
 *   template of «График работы» moves it to its period's end;
 * - the staff list: its order, and the switch «Онлайн-запись» that writes at
 *   once, audited, behind «Редактирование сотрудников».
 *
 * Fake people only. «Now» is Monday 16.11.2026, 10:00 in Tallinn; Slava
 * works Tuesday 17.11 and Wednesday 18.11 (the demo's week).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CUTOFF_OPTIONS, HORIZON_MAX, HORIZON_OPTIONS, NOTICE_OPTIONS, ONLINE_KEYS, onlineOf, STEP_OPTIONS, validOnline, withValue } from "@/lib/admin/online-form";
import { onlineMay, saveOnlineSettings } from "@/lib/admin/online-settings";
import { fillTemplate } from "@/lib/admin/schedule";
import { listStaff, saveStaffProfile, setStaffBookable } from "@/lib/admin/staff";
import { adminCreateVisit } from "@/lib/admin/visits";
import { getBusiness, loadAvailability, type Business } from "@/lib/availability";
import type { Holder } from "@/lib/auth/rights";
import { groupKey } from "@/lib/auth/rights-catalogue";
import { legacyHolder } from "@/lib/auth/rights-store";
import { book, type BookingInput } from "@/lib/booking";
import { loadCatalog } from "@/lib/catalog";
import { moveByClient, moveSlots } from "@/lib/client-move";
import { closeDb, query } from "@/lib/db";
import { DEFAULT_SETTINGS, readSettings } from "@/lib/settings";
import { freshDemo, zonedToUtc, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const NOW = at("2026-11-16", "10:00");
const TUE = "2026-11-17";
const WED = "2026-11-18";

type Who = Holder & { id: string };
let demo: Demo;
let owner: Who;
let desk: Who;

beforeEach(async () => {
  demo = await freshDemo();
  const add = async (email: string, role: string) =>
    (await query<{ id: string }>("insert into users (business_id, email, name, role) values ($1, $2, 'Fake', $3) returning id", [demo.business.id, email, role]))[0].id;
  owner = legacyHolder("owner", await add("owner@example.test", "owner"));
  desk = legacyHolder("admin", await add("desk@example.test", "admin"));
});
afterAll(closeDb);

const without = (who: Who, ...keys: string[]): Who => ({ ...who, rights: { ...who.rights, on: new Set([...who.rights.on].filter((k) => !keys.includes(k))) } });
/** The business as the next request reads it. */
const business = async (): Promise<Business> => (await getBusiness(query, "rempire"))!;
const withSettings = (over: Partial<Business["settings"]>): Business => ({ ...demo.business, settings: { ...demo.business.settings, ...over } });
const stored = async () => (await query<{ settings: Record<string, unknown> }>("select settings from businesses where id = $1", [demo.business.id]))[0].settings;
const audits = (entity: string, action: string, id?: string) =>
  query<{ actor: string; entity_id: string; before: Record<string, unknown> | null; after: Record<string, unknown> }>(
    "select actor, entity_id, before, after from audit where entity = $1 and action = $2 and ($3::uuid is null or entity_id = $3::uuid) order by id",
    [entity, action, id ?? null],
  );
const untilOf = async (staffId: string) => (await query<{ u: string | null }>("select schedule_until::text as u from staff where id = $1", [staffId]))[0].u;
const setUntil = (staffId: string, date: string | null) => query("update staff set schedule_until = $2::date where id = $1", [staffId, date]);

/** The free starts of a cut on one local day: with this barber, or anyone (null). */
async function free(b: Business, staffId: string | null, date: string, now = NOW) {
  const r = await loadAvailability(query, { business: b, serviceIds: [demo.services.clip], staffId, from: date, days: 1, now });
  return { quotes: r.quotes, day: r.days[0], starts: r.days[0]?.slots.map((s) => s.start) ?? [], who: new Set(r.days[0]?.slots.flatMap((s) => s.staffIds) ?? []) };
}

let n = 0;
const input = (staffId: string | null, start: number, phone = "+372 5555 0701"): BookingInput => ({
  serviceIds: [demo.services.clip],
  staffId,
  startsAt: new Date(start).toISOString(),
  name: "Online Test Client",
  phone,
  email: null,
  comment: "",
  locale: "ru",
  smsReminder: false,
  idempotencyKey: `online-settings-${++n}-${Math.random()}`,
});

describe("«Онлайн-запись»: what the page may save", () => {
  it("the options are values the server keeps, and a value saved before is offered too", () => {
    for (const v of STEP_OPTIONS) expect(validOnline("slot_step_min", v), `step ${v}`).toBe(true);
    for (const v of NOTICE_OPTIONS) expect(validOnline("min_notice_min", v), `notice ${v}`).toBe(true);
    for (const v of HORIZON_OPTIONS) expect(validOnline("horizon_days", v), `horizon ${v}`).toBe(true);
    for (const v of CUTOFF_OPTIONS) expect(validOnline("cancel_cutoff_min", v), `cutoff ${v}`).toBe(true);
    expect(STEP_OPTIONS[0]).toBe(5);
    expect(STEP_OPTIONS[STEP_OPTIONS.length - 1]).toBe(120);
    expect(NOTICE_OPTIONS[0]).toBe(0);
    expect(CUTOFF_OPTIONS[0]).toBe(0);
    expect(Math.max(...HORIZON_OPTIONS)).toBe(HORIZON_MAX);
    expect(withValue(STEP_OPTIONS, 25)).toEqual([5, 10, 15, 20, 25, 30, 45, 60, 90, 120]);
    expect(withValue(STEP_OPTIONS, 30)).toEqual([...STEP_OPTIONS]);
  });

  it("refuses what is not of its kind: off the five-minute grid, outside the limits, a horizon past 90 days, a cut-off in minutes, a switch that is no boolean", () => {
    for (const v of [0, 3, 7, 125, 30.5, "30", null]) expect(validOnline("slot_step_min", v), `step ${v}`).toBe(false);
    for (const v of [-1, 7 * 24 * 60 + 1, 1.5]) expect(validOnline("min_notice_min", v), `notice ${v}`).toBe(false);
    for (const v of [0, 91, 365]) expect(validOnline("horizon_days", v), `horizon ${v}`).toBe(false);
    for (const v of [30, 90, -60, 7 * 24 * 60 + 60]) expect(validOnline("cancel_cutoff_min", v), `cutoff ${v}`).toBe(false);
    for (const v of ["yes", 1, null, undefined]) expect(validOnline("any_staff_on", v), `switch ${v}`).toBe(false);
    expect(validOnline("any_staff_on", false)).toBe(true);
  });

  it("«Любой специалист» is on unless stored off; anything else stored is the default", () => {
    expect(DEFAULT_SETTINGS.any_staff_on).toBe(true);
    expect(readSettings({}).any_staff_on).toBe(true);
    expect(readSettings({ any_staff_on: false }).any_staff_on).toBe(false);
    expect(readSettings({ any_staff_on: "no" }).any_staff_on).toBe(true);
    expect(onlineOf({ slot_step_min: 15, horizon_days: 14, any_staff_on: false })).toEqual({ slot_step_min: 15, min_notice_min: 0, horizon_days: 14, cancel_cutoff_min: 0, any_staff_on: false });
    expect(ONLINE_KEYS).toEqual(["slot_step_min", "min_notice_min", "horizon_days", "cancel_cutoff_min", "any_staff_on"]);
  });

  it("saves what changed, with one audit row of the keys before and after; the next request reads it", async () => {
    const r = await saveOnlineSettings(demo.business, owner, { slot_step_min: 15, min_notice_min: 120, horizon_days: 30, cancel_cutoff_min: 24 * 60, any_staff_on: false });
    expect(r).toEqual({ ok: true, changed: ["slot_step_min", "min_notice_min", "horizon_days", "cancel_cutoff_min", "any_staff_on"] });
    expect(onlineOf((await business()).settings)).toEqual({ slot_step_min: 15, min_notice_min: 120, horizon_days: 30, cancel_cutoff_min: 1440, any_staff_on: false });
    const [a] = await audits("business", "settings");
    expect(a.actor).toBe(owner.id);
    expect(a.entity_id).toBe(demo.business.id);
    expect(a.before).toEqual({ slot_step_min: DEFAULT_SETTINGS.slot_step_min, min_notice_min: 0, horizon_days: DEFAULT_SETTINGS.horizon_days, cancel_cutoff_min: 0, any_staff_on: true });
    expect(a.after).toEqual({ slot_step_min: 15, min_notice_min: 120, horizon_days: 30, cancel_cutoff_min: 1440, any_staff_on: false });
  });

  it("keeps the other settings, and a key not sent stays as it is", async () => {
    await query("update businesses set settings = coalesce(settings, '{}'::jsonb) || '{\"reminder_min\": 180, \"horizon_days\": 45}'::jsonb where id = $1", [demo.business.id]);
    expect(await saveOnlineSettings(demo.business, owner, { slot_step_min: 20 })).toEqual({ ok: true, changed: ["slot_step_min"] });
    const s = await stored();
    expect(s).toMatchObject({ reminder_min: 180, horizon_days: 45, slot_step_min: 20 });
    const [a] = await audits("business", "settings");
    expect(a.before).toEqual({ slot_step_min: DEFAULT_SETTINGS.slot_step_min });
    expect(a.after).toEqual({ slot_step_min: 20 });
  });

  it("a save that changes nothing writes nothing", async () => {
    const before = await stored();
    expect(await saveOnlineSettings(demo.business, owner, onlineOf(demo.business.settings))).toEqual({ ok: true, changed: [] });
    expect(await saveOnlineSettings(demo.business, owner, {})).toEqual({ ok: true, changed: [] });
    expect(await stored()).toEqual(before);
    expect(await audits("business", "settings")).toHaveLength(0);
  });

  it("a value not of its kind refuses the whole save, by the key's name", async () => {
    const before = await stored();
    expect(await saveOnlineSettings(demo.business, owner, { slot_step_min: 15, horizon_days: 120 })).toEqual({ ok: false, field: "horizon_days" });
    expect(await saveOnlineSettings(demo.business, owner, { slot_step_min: 7 })).toEqual({ ok: false, field: "slot_step_min" });
    expect(await saveOnlineSettings(demo.business, owner, { cancel_cutoff_min: 90 })).toEqual({ ok: false, field: "cancel_cutoff_min" });
    expect(await saveOnlineSettings(demo.business, owner, { any_staff_on: "off" })).toEqual({ ok: false, field: "any_staff_on" });
    expect(await stored()).toEqual(before);
    expect(await audits("business", "settings")).toHaveLength(0);
  });

  it("its right is the switch of the group «Онлайн-запись»: the owner has it, the front desk not, and without it nothing is written", async () => {
    expect(onlineMay(owner)).toBe(true);
    expect(onlineMay(desk)).toBe(false);
    expect(onlineMay(null)).toBe(false);
    const off = without(owner, groupKey("online"));
    expect(onlineMay(off)).toBe(false);
    const before = await stored();
    expect(await saveOnlineSettings(demo.business, off, { slot_step_min: 15 })).toEqual({ ok: false, field: "forbidden" });
    expect(await saveOnlineSettings(demo.business, desk, { any_staff_on: false })).toEqual({ ok: false, field: "forbidden" });
    expect(await stored()).toEqual(before);
    // the location's own right is another one: without it, this page still saves
    expect(await saveOnlineSettings(demo.business, without(owner, "settings.location"), { slot_step_min: 15 })).toMatchObject({ ok: true });
  });

  it("the step it saves is the step of the booking page's times", async () => {
    const [before] = (await free(await business(), demo.staff.slava, TUE)).starts;
    await saveOnlineSettings(demo.business, owner, { slot_step_min: 15 });
    const starts = (await free(await business(), demo.staff.slava, TUE)).starts;
    expect(starts[0]).toBe(before);
    expect(starts[1] - starts[0]).toBe(15 * 60_000);
  });
});

describe("«Любой специалист» off", () => {
  it("the booking page does not offer «Любой свободный барбер»", async () => {
    expect((await loadCatalog(query, demo.business.id)).anyStaff).toBe(true);
    await saveOnlineSettings(demo.business, owner, { any_staff_on: false });
    expect((await loadCatalog(query, demo.business.id)).anyStaff).toBe(false);
  });

  it("nobody is offered for «anyone»; a named barber is, as before", async () => {
    const on = await free(demo.business, null, TUE);
    expect(on.starts.length).toBeGreaterThan(0);
    const b = withSettings({ any_staff_on: false });
    const any = await free(b, null, TUE);
    expect(any.quotes).toEqual([]);
    expect(any.starts).toEqual([]);
    expect(any.day.open).toBe(false);
    expect((await free(b, demo.staff.slava, TUE)).starts).toEqual((await free(demo.business, demo.staff.slava, TUE)).starts);
  });

  it("a booking for «anyone» is refused as not offered; one with a named barber goes through", async () => {
    const b = withSettings({ any_staff_on: false });
    const [start] = (await free(demo.business, demo.staff.slava, TUE)).starts;
    expect(await book(query, b, input(null, start), { now: NOW })).toEqual({ ok: false, code: "not_offered", field: "staff" });
    expect(await query("select 1 from appointments where starts_at = $1", [new Date(start)])).toHaveLength(0);
    expect(await book(query, b, input(demo.staff.slava, start), { now: NOW })).toMatchObject({ ok: true });
    // on again: «anyone» books
    const [later] = (await free(demo.business, null, WED)).starts;
    expect(await book(query, demo.business, input(null, later, "+372 5555 0702"), { now: NOW })).toMatchObject({ ok: true });
  });
});

describe("a barber's «График до» on the client's side", () => {
  it("no day after it: the booking page's days and times end with it", async () => {
    expect((await free(demo.business, demo.staff.slava, WED)).starts.length).toBeGreaterThan(0);
    await setUntil(demo.staff.slava, TUE);
    expect((await free(demo.business, demo.staff.slava, TUE)).starts.length).toBeGreaterThan(0);
    const wed = await free(demo.business, demo.staff.slava, WED);
    expect(wed.starts).toEqual([]);
    expect(wed.day.open).toBe(false);
    // several days at once, as the booking page asks: only the days up to his date have times
    const r = await loadAvailability(query, { business: demo.business, serviceIds: [demo.services.clip], staffId: demo.staff.slava, from: "2026-11-16", days: 7, now: NOW });
    for (const d of r.days) if (d.date > TUE) expect(d.slots, d.date).toEqual([]);
    expect(r.days.some((d) => d.date <= TUE && d.slots.length > 0)).toBe(true);
  });

  it("«anyone» leaves him out after it, and keeps him up to it", async () => {
    expect((await free(demo.business, null, WED)).who.has(demo.staff.slava)).toBe(true);
    await setUntil(demo.staff.slava, TUE);
    expect((await free(demo.business, null, TUE)).who.has(demo.staff.slava)).toBe(true);
    const wed = await free(demo.business, null, WED);
    expect(wed.who.has(demo.staff.slava)).toBe(false);
    // the others are still there
    expect(wed.starts.length).toBeGreaterThan(0);
  });

  it("a booking after it is refused as a time taken, one on its last day goes through", async () => {
    const [wedStart] = (await free(demo.business, demo.staff.slava, WED)).starts;
    const [tueStart] = (await free(demo.business, demo.staff.slava, TUE)).starts;
    await setUntil(demo.staff.slava, TUE);
    expect(await book(query, demo.business, input(demo.staff.slava, wedStart), { now: NOW })).toEqual({ ok: false, code: "slot_taken" });
    expect(await book(query, demo.business, input(demo.staff.slava, tueStart), { now: NOW })).toMatchObject({ ok: true });
  });

  it("the client's own move: no day after it is offered, and a time after it is refused", async () => {
    const [tueStart] = (await free(demo.business, demo.staff.slava, TUE)).starts;
    const wedStart = (await free(demo.business, demo.staff.slava, WED)).starts[2];
    const r = await book(query, demo.business, input(demo.staff.slava, tueStart), { now: NOW });
    if (!r.ok || !r.manageToken) throw new Error("book");
    await setUntil(demo.staff.slava, TUE);
    const offered = (await moveSlots(demo.business, r.manageToken, 7, NOW))!;
    for (const d of offered.days) if (d.date > TUE) expect(d.slots, d.date).toEqual([]);
    expect(await moveByClient(demo.business, r.manageToken, { startsAt: new Date(wedStart).toISOString() }, NOW)).toEqual({ ok: false, code: "slot_taken" });
    // before it, still free to move
    await setUntil(demo.staff.slava, WED);
    expect(await moveByClient(demo.business, r.manageToken, { startsAt: new Date(wedStart).toISOString() }, NOW)).toMatchObject({ ok: true });
  });

  it("the journal is not held by it: the salon books him after it, within his hours", async () => {
    const wedStart = (await free(demo.business, demo.staff.slava, WED)).starts[1];
    await setUntil(demo.staff.slava, TUE);
    const v = await adminCreateVisit(demo.business, { staffId: demo.staff.slava, start: wedStart, serviceIds: [demo.services.clip], name: "Walk In", phone: null, idempotencyKey: `online-settings-walkin-${Math.random()}` }, owner.id);
    expect(v).toMatchObject({ ok: true });
  });
});

describe("«График до» in the barber's profile", () => {
  const profile = { name: "Slava", role: { ru: "Барбер" }, photoUrl: "", bookable: true, active: true };

  it("the seed leaves it empty for everyone", async () => {
    const rows = await listStaff(query, demo.business.id);
    expect(rows.length).toBeGreaterThan(0);
    for (const s of rows) expect(s.scheduleUntil, s.name).toBeNull();
  });

  it("is set, kept when not sent, and cleared with an empty value; each change is audited", async () => {
    const id = demo.staff.slava;
    expect(await saveStaffProfile(demo.business, id, { ...profile, scheduleUntil: "2026-12-31" }, owner.id, owner)).toEqual({ ok: true, id });
    expect((await listStaff(query, demo.business.id)).find((s) => s.id === id)!.scheduleUntil).toBe("2026-12-31");
    // a form that does not send it leaves it
    expect(await saveStaffProfile(demo.business, id, { ...profile, name: "Slava S." }, owner.id, owner)).toEqual({ ok: true, id });
    expect(await untilOf(id)).toBe("2026-12-31");
    expect(await saveStaffProfile(demo.business, id, { ...profile, scheduleUntil: "" }, owner.id, owner)).toEqual({ ok: true, id });
    expect(await untilOf(id)).toBeNull();
    const rows = await audits("staff", "edit", id);
    expect(rows.map((r) => r.after.schedule_until)).toEqual(["2026-12-31", undefined, null]);
  });

  it("a date that is no date is refused, and nothing changes", async () => {
    const id = demo.staff.slava;
    await setUntil(id, "2026-12-31");
    for (const bad of ["2026-02-30", "31.12.2026", "tomorrow"]) expect(await saveStaffProfile(demo.business, id, { ...profile, scheduleUntil: bad }, owner.id, owner), bad).toEqual({ ok: false, field: "scheduleUntil" });
    expect(await untilOf(id)).toBe("2026-12-31");
  });

  it("a new barber may start with one", async () => {
    const r = await saveStaffProfile(demo.business, null, { ...profile, name: "Fake New", scheduleUntil: "2027-01-31" }, owner.id, owner);
    if (!r.ok) throw new Error(r.field);
    expect(await untilOf(r.id)).toBe("2027-01-31");
  });
});

describe("the template of «График работы» and «График до»", () => {
  // January 2027: past the demo's dated shifts
  const ask = (staffIds: string[]) => ({ staffIds, mode: "weekdays", dateFrom: "2027-01-04", dateTo: "2027-01-31", weekdays: [1, 2, 3, 4, 5], from: "10:00", to: "18:00" });

  it("an earlier date moves to the period's last day, audited", async () => {
    await setUntil(demo.staff.slava, "2026-12-31");
    expect(await fillTemplate(demo.business, owner, ask([demo.staff.slava]))).toMatchObject({ ok: true });
    expect(await untilOf(demo.staff.slava)).toBe("2027-01-31");
    const rows = (await audits("staff", "edit", demo.staff.slava)).filter((r) => r.after.schedule_until);
    expect(rows).toHaveLength(1);
    expect(rows[0].before).toEqual({ schedule_until: "2026-12-31" });
    expect(rows[0].after).toEqual({ schedule_until: "2027-01-31", via: "weekdays" });
  });

  it("a later date stays, and no date stays none", async () => {
    await setUntil(demo.staff.slava, "2027-03-31");
    expect(await fillTemplate(demo.business, owner, ask([demo.staff.slava, demo.staff.renat]))).toMatchObject({ ok: true });
    expect(await untilOf(demo.staff.slava)).toBe("2027-03-31");
    expect(await untilOf(demo.staff.renat)).toBeNull();
    expect((await audits("staff", "edit")).filter((r) => "schedule_until" in r.after)).toHaveLength(0);
  });

  it("«По сменам» moves it as well; a template that is refused moves nothing", async () => {
    await setUntil(demo.staff.slava, "2027-01-10");
    expect(await fillTemplate(demo.business, owner, { ...ask([demo.staff.slava]), mode: "shifts", on: 2, off: 2 })).toMatchObject({ ok: true });
    expect(await untilOf(demo.staff.slava)).toBe("2027-01-31");
    await setUntil(demo.staff.slava, "2027-01-10");
    expect(await fillTemplate(demo.business, without(owner, "staff.schedule"), ask([demo.staff.slava]))).toEqual({ ok: false, code: "forbidden" });
    expect(await untilOf(demo.staff.slava)).toBe("2027-01-10");
  });
});

describe("the staff list", () => {
  it("the active ones first, then by their place; with his «График до»", async () => {
    await query("update staff set active = false where id = $1", [demo.staff.renat]);
    await setUntil(demo.staff.slava, "2026-12-31");
    const rows = await listStaff(query, demo.business.id);
    const order = await query<{ id: string }>("select id from staff where business_id = $1 order by active desc, sort, display_name", [demo.business.id]);
    expect(rows.map((s) => s.id)).toEqual(order.map((r) => r.id));
    expect(rows[rows.length - 1].id).toBe(demo.staff.renat);
    expect(rows.find((s) => s.id === demo.staff.slava)!.scheduleUntil).toBe("2026-12-31");
  });

  it("the switch «Онлайн-запись» writes at once, with what it was before; a tap that changes nothing writes nothing", async () => {
    const id = demo.staff.slava;
    expect(await setStaffBookable(demo.business, id, false, owner.id, owner)).toEqual({ ok: true });
    expect((await listStaff(query, demo.business.id)).find((s) => s.id === id)!.bookable).toBe(false);
    // the booking page no longer offers him
    expect((await loadCatalog(query, demo.business.id)).staff.some((s) => s.id === id)).toBe(false);
    expect(await setStaffBookable(demo.business, id, false, owner.id, owner)).toEqual({ ok: true });
    const rows = await audits("staff", "edit", id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor: owner.id, before: { bookable: true }, after: { bookable: false } });
    expect(await setStaffBookable(demo.business, id, true, owner.id, owner)).toEqual({ ok: true });
    expect((await audits("staff", "edit", id)).map((r) => r.after.bookable)).toEqual([false, true]);
  });

  it("behind «Редактирование сотрудников»; another business's barber or no barber at all is refused", async () => {
    const id = demo.staff.slava;
    expect(await setStaffBookable(demo.business, id, false, owner.id, without(owner, "staff.edit"))).toEqual({ ok: false, field: "forbidden" });
    expect(await setStaffBookable(demo.business, id, false, owner.id, without(owner, groupKey("staff")))).toEqual({ ok: false, field: "forbidden" });
    expect(await setStaffBookable(demo.business, "not-an-id", false, owner.id, owner)).toEqual({ ok: false, field: "id" });
    expect(await setStaffBookable({ id: "00000000-0000-4000-8000-000000000000" }, id, false, owner.id, owner)).toEqual({ ok: false, field: "id" });
    expect((await listStaff(query, demo.business.id)).find((s) => s.id === id)!.bookable).toBe(true);
    expect(await audits("staff", "edit", id)).toHaveLength(0);
  });
});
