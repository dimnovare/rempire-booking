/**
 * Nothing changes for anyone on the day the rights ship: every login's
 * starting set (src/lib/auth/rights-store.ts, legacyRights) lets it do
 * exactly what its role could the day before.
 *
 * WAS below walks the permission checks the code made until 19.11.2026,
 * one row per right that works here, written as the old rule: who passed
 * requireOwner(), who passed requireAdmin(), what the barber app gave a
 * barber in his own column, and what the salon's two switches
 * (barber_self_time, barber_self_price) made of his own changes. The test
 * asks the door the same question for an owner, the front desk and a
 * barber under every value of each switch, and wants the same answer.
 *
 * One change since: Renat, 18.11.2026, a barber changes his prices and
 * times himself too, so with the price switch not set they apply at once.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { can, seenClients, seenStaff, type Holder, type RightKey, type Scope } from "@/lib/auth/rights";
import { RIGHTS } from "@/lib/auth/rights-catalogue";
import { backfillRights, legacyHolder, legacyRights, loadRights } from "@/lib/auth/rights-store";
import { createSession, readSession } from "@/lib/auth/sessions";
import { createUser } from "@/lib/auth/login";
import { closeDb, query } from "@/lib/db";
import { freshDemo, type Demo } from "./helpers";

type Role = "owner" | "admin" | "staff";
type Switch = "now" | "ask" | undefined;
type Sw = { time: Switch; price: Switch };

const MINE = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const owner = (r: Role) => r === "owner";
/** requireAdmin(): Renat and the front desk. */
const desk = (r: Role) => r !== "staff";
const anyone = () => true;
/** The switches' defaults: time at once (src/lib/settings.ts as it was); prices at once since Renat's answer (18.11), were «ask». */
const timeNow = (s: Sw) => s.time !== "ask";
const priceNow = (s: Sw) => s.price !== "ask";

/** What the code allowed before the rights: the right that now stands for it, and the old rule. */
const WAS: { right: RightKey; scope?: Scope; what: string; was: (role: Role, sw: Sw) => boolean }[] = [
  // ---- the calendar and the barber app's day
  { right: "journal.staff", scope: { staffId: MINE }, what: "his own column (requireStaff), any column (the admin's calendar)", was: anyone },
  { right: "journal.staff", scope: { staffId: OTHER }, what: "another barber's column: the admin's calendar and /b/pick only", was: desk },
  { right: "journal.history", scope: { date: "2020-01-01", today: "2026-11-19" }, what: "any past day: /admin?d= and /b?d= took any date", was: anyone },
  { right: "journal.schedule", what: "block time in the calendar (requireAdmin); a barber's own time at once by barber_self_time", was: (r, s) => desk(r) || timeNow(s) },
  { right: "journal.phones", what: "the phone in the calendar and in the barber's day (Dim: shown, tap to call)", was: anyone },
  { right: "journal.move", what: "drag or «Перенести» in the calendar; a barber moved his own visit", was: anyone },
  { right: "journal.stats", what: "the day's numbers; a barber's day and week sums (Dim: prices and his day's total)", was: anyone },
  // ---- a visit
  { right: "visit.client_data", what: "the client's phone, note and card in a visit", was: anyone },
  { right: "visit.client_create", what: "a new visit for a name and a phone typed in", was: anyone },
  { right: "visit.client_list", what: "findClients / findMyClients", was: anyone },
  { right: "visit.client_list.phones", what: "…with phones, and by a phone's digits", was: anyone },
  { right: "visit.create", what: "createVisit; bookVisit in his own column", was: anyone },
  { right: "visit.edit", what: "status, note", was: anyone },
  { right: "visit.edit.arrived", what: "…also of a visit that is «пришёл» or «готово»: nothing refused it", was: anyone },
  { right: "visit.edit.staff_time", what: "the visit sheet's barber and time; a barber's «Перенести»", was: anyone },
  { right: "visit.edit.comment", what: "the visit's note", was: anyone },
  { right: "visit.edit.services", what: "the visit sheet's services: the admin only (barberMove sent a time alone)", was: desk },
  { right: "visit.delete", what: "cancelVisit; a barber's emergency cancel with a reason", was: anyone },
  { right: "visit.delete.arrived", what: "…also one the client has come to: only «cancelled» was refused", was: anyone },
  { right: "visit.sell", what: "«Продажа товара»; the barber's «Продать»", was: anyone },
  { right: "visit.sell.create", what: "sellAction on both sides", was: anyone },
  { right: "visit.sell.edit", what: "reverseSale and retrySale in «Счета»; the barber's own undo", was: anyone },
  // ---- barbers and services
  { right: "staff.create", what: "saveProfile(null): requireAdmin", was: desk },
  { right: "staff.edit", what: "saveProfile(id), the portrait: requireAdmin", was: desk },
  { right: "staff.dismiss", what: "the «active» switch of a barber: requireAdmin", was: desk },
  { right: "staff.schedule", what: "hours, single days, time off, special time on a barber's page: requireAdmin", was: desk },
  { right: "services.create", what: "saveService(null): requireAdmin", was: desk },
  { right: "services.edit", what: "saveService(id): requireAdmin", was: desk },
  { right: "services.edit.name", what: "…its name", was: desk },
  { right: "services.edit.price", what: "…its price", was: desk },
  { right: "services.edit.online", what: "…«online»", was: desk },
  { right: "services.delete", what: "…switching it off", was: desk },
  { right: "services.staff", what: "a barber's services, prices and times (requireAdmin); his own at once by barber_self_price", was: (r, s) => desk(r) || priceNow(s) },
  // ---- settings
  { right: "settings.system", what: "setReminder: requireOwner", was: owner },
  { right: "settings.users", what: "the logins list, linkUserStaff: requireOwner", was: owner },
  { right: "settings.users.remove", what: "toggleUser: requireOwner", was: owner },
  { right: "settings.users.invite", what: "addUser: requireOwner", was: owner },
  { right: "settings.users.rights", what: "the logins were the owner's alone", was: owner },
  { right: "settings.categories", what: "a new category word on a card or on many clients: requireAdmin", was: desk },
  // ---- the client base
  { right: "clients.list_contacts", what: "phones and e-mails in the list: requireAdmin (a barber has no list)", was: desk },
  { right: "clients.card_contacts", what: "the card's phone: the admin's card, and the barber's card of his client", was: anyone },
  { right: "clients.edit", what: "saveCard, saveNotify, the photo, «Добавить клиента»: requireAdmin", was: desk },
  { right: "clients.note", what: "the one shared note: every barber and Renat read it", was: anyone },
  { right: "clients.note.edit", what: "…and write it", was: anyone },
  { right: "clients.delete", what: "the card's «Удалить»: requireAdmin", was: desk },
  { right: "clients.delete", scope: { bulk: true }, what: "«Удалить из базы»: by.role === 'owner'", was: owner },
  { right: "clients.export", what: "the Excel export: by.role === 'owner'", was: owner },
  { right: "clients.comments", what: "the comments on the admin's card", was: desk },
  { right: "clients.comments_add", what: "addComment: requireAdmin", was: desk },
  { right: "clients.comments_delete_own", what: "deleteComment: role owner or admin, anyone's", was: desk },
  { right: "clients.comments_delete_others", what: "deleteComment: role owner or admin, anyone's", was: desk },
  { right: "clients.files", what: "the files tab and the download: requireAdmin", was: desk },
  { right: "clients.files.upload", what: "the upload route: requireAdmin", was: desk },
  { right: "clients.files.delete", what: "deleteFile: requireAdmin", was: desk },
  { right: "clients.show", scope: { staffIds: [MINE] }, what: "a client who came to this barber: his own card; the whole base for the admin", was: anyone },
  { right: "clients.show", scope: { staffIds: [OTHER] }, what: "a client of another barber only: isMyClient refused a barber", was: desk },
  { right: "clients.history", what: "the visit history: the admin's tab; a barber's past visits with his client", was: anyone },
  { right: "single.bulk_sms", what: "the mass message and a message by hand: role owner or admin", was: desk },
  // ---- «Записи» (built after the rights): the salon's side has it as the roles' list gives it, a barber's login has not
  { right: "reports.bookings", what: "the list of every visit: the admin's side, as the calendar was (requireAdmin)", was: desk },
  { right: "reports.bookings.export", what: "its file: «Администратор» has it in the list, unlike the client base's", was: desk },
  { right: "reports.bookings.phones", what: "phones in it: the admin's calendar showed them", was: desk },
  // ---- «Отзывы» (built 20.11, new): the front desk starts with every built right but the owner's own (legacyRights), a barber's login without
  { right: "reports.reviews", what: "the reviews list: new, the admin's side as «Записи» is", was: desk },
  { right: "reports.reviews.delete", what: "hide or show a review: new, the admin's side", was: desk },
  // ---- «Основные показатели» and «Визиты» (built 20.11, new): the same rule; the list's «Администратор» has «Визиты» but not «Основные показатели»
  { right: "reports.dashboard", what: "the KPI dashboard: new, the admin's side (legacyRights gives it every built right but the owner's own)", was: desk },
  { right: "reports.visits", what: "the visits ahead and behind and the bookings' feed: new, the admin's side as «Записи» is", was: desk },
  { right: "reports.visits.phones", what: "phones in it: as in «Записи»", was: desk },
  // ---- «Сообщения» (built 20.11, new): the same rule as «Отзывы»; the list's «Администратор» has neither
  { right: "reports.messages", what: "the log of every message sent: new, the admin's side as «Записи» is", was: desk },
  { right: "reports.messages.phones", what: "the phones and e-mails in it whole: as in «Записи»", was: desk },
];

const SWITCHES: Switch[] = [undefined, "now", "ask"];
const ROLES: Role[] = ["owner", "admin", "staff"];
const raw = (sw: Sw) => ({ ...(sw.time ? { barber_self_time: sw.time } : {}), ...(sw.price ? { barber_self_price: sw.price } : {}) });

describe("a login's starting set is its role as it was", () => {
  it("walks every right that works here", () => {
    const walked = new Set(WAS.map((w) => w.right));
    expect(RIGHTS.filter((r) => r.built && !walked.has(r.key)).map((r) => r.key)).toEqual([]);
  });

  for (const role of ROLES) {
    for (const time of SWITCHES) {
      for (const price of SWITCHES) {
        it(`${role}, barber_self_time ${time ?? "not set"}, barber_self_price ${price ?? "not set"}`, () => {
          const sw = { time, price };
          const who = legacyHolder(role, "test-login", MINE, raw(sw));
          for (const w of WAS) expect(can(who, w.right, w.scope), `${w.right}${w.scope ? ` ${JSON.stringify(w.scope)}` : ""}: ${w.what}`).toBe(w.was(role, sw));
        });
      }
    }
  }

  it("an owner and the front desk are not touched by the barbers' switches", () => {
    for (const role of ["owner", "admin"] as const) {
      const a = legacyRights(role, {}, null);
      const b = legacyRights(role, { barber_self_time: "ask", barber_self_price: "now" }, null);
      expect(b).toEqual(a);
    }
  });

  it("whose columns and clients: everyone's for the admin's side, his own for a barber", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(seenStaff(legacyHolder(role, "x"))).toBe("all");
      expect(seenClients(legacyHolder(role, "x"))).toBe("all");
    }
    const barber = legacyHolder("staff", "x", MINE);
    expect(seenStaff(barber)).toEqual([MINE]);
    expect(seenClients(barber)).toEqual([MINE]);
    // a barber's login with no barber saw nothing, and still sees nothing
    expect(seenStaff(legacyHolder("staff", "x", null))).toEqual([]);
  });

  it("under the role's own preset: «Владелец», «Администратор», «Специалист»", () => {
    expect(legacyRights("owner", {}, null).preset).toBe("OW");
    expect(legacyRights("admin", {}, null).preset).toBe("AD");
    expect(legacyRights("staff", {}, MINE).preset).toBe("SP");
  });
});

describe("the one-time backfill", () => {
  let demo: Demo;
  beforeEach(async () => {
    demo = await freshDemo();
  });
  afterAll(closeDb);

  const add = async (email: string, role: Role, staff: string | null = null) =>
    (await query<{ id: string }>("insert into users (business_id, email, role, staff_id) values ($1, $2, $3, $4) returning id", [demo.business.id, email, role, staff ? demo.staff[staff] : null]))[0].id;
  const setSwitches = (json: Record<string, unknown>) => query("update businesses set settings = settings || $2::jsonb where id = $1", [demo.business.id, JSON.stringify(json)]);
  const stored = async (id: string) => (await query<{ rights_preset: string | null; rights: string[] | null }>("select rights_preset, rights from users where id = $1", [id]))[0];

  it("a login from before the rights has none until it is first read; then its role's set, written once", async () => {
    const id = await add("valentin@example.test", "staff", "valentin");
    expect((await stored(id)).rights).toBeNull();
    const user = await readSession(query, await createSession(query, id));
    expect(user).not.toBeNull();
    const want = legacyRights("staff", {}, demo.staff.valentin);
    expect([...user!.rights.on].sort()).toEqual([...want.on].sort());
    expect(user!.rights.values).toEqual(want.values);
    expect((await stored(id)).rights_preset).toBe("SP");
    expect(can(user, "journal.schedule")).toBe(true);
    // Renat, 18.11: his prices and times at once too
    expect(can(user, "services.staff")).toBe(true);
  });

  it("reads the salon's two switches as they stand, for every barber at once", async () => {
    await setSwitches({ barber_self_time: "ask", barber_self_price: "now" });
    const val = await add("valentin@example.test", "staff", "valentin");
    const jev = await add("jevgeni@example.test", "staff", "jevgeni");
    const own = await add("owner@example.test", "owner");
    // the first read of any login writes every login's set
    await readSession(query, await createSession(query, own));
    for (const id of [val, jev]) {
      const h: Holder = { role: "staff", staffId: null, rights: { preset: "SP", on: new Set((await stored(id)).rights ?? []), values: {} } };
      expect(h.rights.on.has("journal.schedule")).toBe(false);
      expect(h.rights.on.has("services.staff")).toBe(true);
    }
    expect((await stored(own)).rights_preset).toBe("OW");
  });

  it("is once: the switches mean nothing to a login that has its set", async () => {
    const id = await add("valentin@example.test", "staff", "valentin");
    expect(await backfillRights(query, demo.business.id)).toBeGreaterThan(0);
    const before = await loadRights(query, demo.business.id, id);
    await setSwitches({ barber_self_time: "ask", barber_self_price: "now" });
    expect(await backfillRights(query, demo.business.id)).toBe(0);
    expect(await loadRights(query, demo.business.id, id)).toEqual(before);
    expect(before!.on).toContain("journal.schedule");
  });

  it("a login added later starts as its role did, at once", async () => {
    const r = await createUser(query, demo.business.id, { email: "desk@example.test", name: "Desk", role: "admin", staffId: null });
    if (!r.ok) throw new Error(r.field);
    const row = await stored(r.id);
    expect(row.rights_preset).toBe("AD");
    expect([...(row.rights ?? [])].sort()).toEqual([...legacyRights("admin", {}, null).on].sort());
  });

  it("the demo logins of the seed come out as their roles", async () => {
    await backfillRights(query, demo.business.id);
    const rows = await query<{ role: string; rights_preset: string }>("select role, rights_preset from users where business_id = $1", [demo.business.id]);
    for (const r of rows) expect(r.rights_preset).toBe(r.role === "owner" ? "OW" : r.role === "admin" ? "AD" : "SP");
  });
});
