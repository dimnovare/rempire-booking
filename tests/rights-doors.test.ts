/**
 * The server's doors: for every right that works here, one test that the
 * server refuses without it and allows with it.
 *
 * These go through the real Server Actions and route handlers, as a browser
 * would, with a real session in a real (in-memory) database. Only Next's
 * own request plumbing is stood in for: the cookie jar, «refresh», and
 * «redirect». What a page shows a login (its phones, its columns, its day's
 * sums) is cut by plain functions the pages call, tested here directly.
 *
 * `both` runs the same call twice on a fresh database: once with the
 * login's rights as its role had them and the one right on, once with that
 * one right off. Fake people only.
 */
import { afterAll, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ cookies: {} as Record<string, string> }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.cookies[name] ? { name, value: jar.cookies[name] } : undefined),
    set: (name: string, value: string) => void (jar.cookies[name] = value),
    delete: (name: string) => void delete jar.cookies[name],
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("next/cache", () => ({ refresh: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/server", () => ({ connection: async () => {}, after: () => {} }));

import * as account from "@/app/admin/(app)/account/actions";
import * as cal from "@/app/admin/(app)/actions";
import * as analytics from "@/app/admin/(app)/analytics/actions";
import * as changesActs from "@/app/admin/(app)/changes/actions";
import * as clients from "@/app/admin/(app)/clients/actions";
import { cardFieldsOf } from "@/app/admin/(app)/clients/card-fields";
import * as dash from "@/app/admin/(app)/dashboard/actions";
import { POST as exportRoute } from "@/app/admin/(app)/clients/export/route";
import { GET as fileRoute } from "@/app/admin/(app)/clients/[id]/files/[fileId]/route";
import { POST as uploadRoute } from "@/app/admin/(app)/clients/[id]/files/route";
import * as frame from "@/app/admin/(app)/frame-actions";
import * as invoices from "@/app/admin/(app)/invoices/actions";
import * as messagesActs from "@/app/admin/(app)/messages/actions";
import * as records from "@/app/admin/(app)/records/actions";
import { POST as recordsExportRoute } from "@/app/admin/(app)/records/export/route";
import * as reviewsActs from "@/app/admin/(app)/reviews/actions";
import * as requests from "@/app/admin/(app)/requests/actions";
import * as schedule from "@/app/admin/(app)/schedule/actions";
import * as services from "@/app/admin/(app)/services/actions";
import * as settingsActs from "@/app/admin/(app)/settings/actions";
import * as notif from "@/app/admin/(app)/notifications/actions";
import * as staffActs from "@/app/admin/(app)/staff/actions";
import * as bSell from "@/app/b/(app)/sell/actions";
import * as bTime from "@/app/b/(app)/time/actions";
import * as bVisit from "@/app/b/(app)/visit-actions";
import { calendarFor, calendarMay, loadCalendar } from "@/lib/admin/calendar";
import { addComment, addFile, listComments, listFiles } from "@/lib/admin/client-card";
import { clientDetail, saveClient } from "@/lib/admin/clients";
import { adminCreateVisit, adminSetStatus } from "@/lib/admin/visits";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import type { RightKey } from "@/lib/auth/rights";
import { rightDef, RIGHTS, groupKey, type RightValue } from "@/lib/auth/rights-catalogue";
import { backfillRights, loadHolder } from "@/lib/auth/rights-store";
import { createSession } from "@/lib/auth/sessions";
import { barberDaysFor, barberMay, loadBarberDays } from "@/lib/barber/day";
import { closeDb, query } from "@/lib/db";
import { FAKE_PRODUCTS } from "@/lib/shop";
import { addDays, todayIn, zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

afterAll(closeDb);

const TZ = "Europe/Tallinn";
const PHONE = "+37255500111";
type Who = "owner" | "desk" | "barber";

type Ctx = {
  demo: Demo;
  /** login ids */
  owner: string;
  desk: string;
  barber: string;
  /** the login that asks */
  me: string;
  /** Valentin's column (the barber's own) and Jevgeni's */
  val: string;
  jev: string;
  /** Anna: a client with a phone, a note and one visit tomorrow in Valentin's column */
  anna: string;
  visit: string;
  today: string;
  tomorrow: string;
};

let seq = 0;
const key = () => `rights-doors-${++seq}-${Math.random().toString(36).slice(2)}-0000`;
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);

async function fresh(who: Who): Promise<Ctx> {
  const demo = await freshDemo();
  await query("delete from users where business_id = $1", [demo.business.id]).catch(() => []);
  const add = async (email: string, name: string, role: string, staff: string | null) =>
    (await query<{ id: string }>("insert into users (business_id, email, name, role, staff_id) values ($1, $2, $3, $4, $5) returning id", [demo.business.id, email, name, role, staff]))[0].id;
  const owner = await add("owner@example.test", "Owner", "owner", null);
  const desk = await add("desk@example.test", "Desk", "admin", null);
  const barber = await add("valentin@example.test", "Valentin", "staff", demo.staff.valentin);
  await backfillRights(query, demo.business.id);
  const today = todayIn(TZ);
  const tomorrow = addDays(today, 1);
  const saved = await saveClient(demo.business, null, { name: "Anna Näidis", phone: PHONE, email: "anna@example.test", note: "стрижёт коротко" }, owner);
  if (!saved.ok) throw new Error(`client: ${saved.field}`);
  const v = await adminCreateVisit(demo.business, { staffId: demo.staff.valentin, start: at(tomorrow, "10:00"), serviceIds: [demo.services.clip], clientId: saved.id, idempotencyKey: key(), force: true }, owner);
  if (!v.ok) throw new Error(`visit: ${v.code}`);
  const me = { owner, desk, barber }[who];
  jar.cookies = { [SESSION_COOKIE]: await createSession(query, me) };
  return { demo, owner, desk, barber, me, val: demo.staff.valentin, jev: demo.staff.jevgeni, anna: saved.id, visit: v.id, today, tomorrow };
}

/** Switch one right of a login: on with everything it is nested under and its group, or off (it alone). */
async function grant(id: string, right: string, on: boolean) {
  if (!on) return void (await query("update users set rights = array_remove(rights, $2) where id = $1", [id, right]));
  const keys: string[] = [];
  for (let k: string | null = right; k; k = rightDef(k)?.parent ?? null) keys.push(k);
  const group = rightDef(right)?.group;
  if (group && group !== "single") keys.push(groupKey(group));
  await query("update users set rights = (select array_agg(distinct x) from unnest(rights || $2::text[]) x) where id = $1", [id, keys]);
}
const setValue = (id: string, right: string, v: RightValue) => query("update users set rights_values = rights_values || $2::jsonb where id = $1", [id, JSON.stringify({ [right]: v })]);
const holder = async (c: Ctx) => (await loadHolder(query, c.demo.business.id, c.me))!;

type Opts = { also?: RightKey[]; without?: RightKey[] };

/** One right, both ways, through a door. `ok` says whether the server did what was asked. */
function both<T>(right: RightKey, who: Who, run: (c: Ctx) => Promise<T>, ok: (r: T, c: Ctx) => boolean | Promise<boolean>, opts: Opts = {}) {
  it(`${right}: refused without it, allowed with it (${who})`, async () => {
    for (const has of [true, false]) {
      const c = await fresh(who);
      for (const k of opts.also ?? []) await grant(c.me, k, true);
      for (const k of opts.without ?? []) await grant(c.me, k, false);
      await grant(c.me, right, has);
      expect(await ok(await run(c), c), `${right}, ${has ? "with" : "without"} it`).toBe(has);
    }
  });
  covered.add(right);
}
const covered = new Set<string>();
const cover = (right: RightKey) => void covered.add(right);

const newVisit = (c: Ctx, over: Partial<cal.NewVisit> = {}): cal.NewVisit => ({
  staffId: c.val,
  start: at(c.tomorrow, "14:00"),
  serviceIds: [c.demo.services.clip],
  clientId: null,
  name: "Борис Образец",
  phone: "",
  comment: "",
  staffNote: "",
  smsReminder: false,
  idempotencyKey: key(),
  force: true,
  ...over,
});
/** Make the fixture's visit one the client has come to. */
const came = async (c: Ctx) => {
  if (!(await adminSetStatus(c.demo.business, c.visit, "arrived", c.owner))) throw new Error("status");
};
const statusOf = async (id: string) => (await query<{ status: string }>("select status from appointments where id = $1", [id]))[0].status;
/** Another service the barber does, for «change the services». */
const otherService = async (c: Ctx) =>
  (await query<{ service_id: string }>("select ss.service_id from staff_services ss join services s on s.id = ss.service_id where ss.staff_id = $1 and ss.active and s.active and ss.service_id <> $2 limit 1", [c.val, c.demo.services.clip]))[0].service_id;

/* ------------------------------------------------------------------ 1. Журнал записей */

describe("Журнал записей", () => {
  it("journal.staff: a column the login does not see is not shown and takes no visit from it; one it sees does", async () => {
    for (const sees of [true, false]) {
      const c = await fresh("desk");
      await setValue(c.me, "journal.staff", sees ? "all" : [c.jev]);
      const data = calendarFor(await holder(c), await loadCalendar(query, c.demo.business, c.tomorrow, 1), c.today);
      expect(data.staff.some((s) => s.id === c.val), "the column").toBe(sees);
      expect(data.visits.some((v) => v.id === c.visit), "its visit").toBe(sees);
      const r = await cal.createVisit(newVisit(c));
      expect(r.ok, "a new visit in it").toBe(sees);
      if (!sees) expect(r).toEqual({ ok: false, code: "forbidden" });
      // moving a visit into it, or out of a hidden one
      expect(await cal.setVisitStatus(c.visit, "arrived"), "a visit's status").toBe(sees);
    }
    cover("journal.staff");
  });

  it("journal.history: days before the limit are not shown; without a limit they are", async () => {
    for (const free of [true, false]) {
      const c = await fresh("desk");
      const yesterday = addDays(c.today, -1);
      const old = await adminCreateVisit(c.demo.business, { staffId: c.val, start: at(yesterday, "10:00"), serviceIds: [c.demo.services.clip], clientId: c.anna, idempotencyKey: key(), force: true }, c.owner);
      if (!old.ok) throw new Error(old.code);
      await setValue(c.me, "journal.history", free ? null : 0);
      const me = await holder(c);
      const data = calendarFor(me, await loadCalendar(query, c.demo.business, yesterday, 3), c.today);
      expect(data.visits.some((v) => v.id === old.id), "yesterday's visit").toBe(free);
      expect(data.visits.some((v) => v.id === c.visit), "tomorrow's visit").toBe(true);
      expect(calendarMay(me, c.today).from).toBe(free ? null : c.today);
      // the barber app's days are cut the same way
      const days = barberDaysFor(me, c.val, await loadBarberDays(query, c.demo.business, c.val, yesterday, 3), c.today);
      expect(days[0].visits.length > 0).toBe(free);
      expect(days[2].visits.length).toBe(1);
    }
    cover("journal.history");
  });

  both(
    "journal.schedule",
    "desk",
    (c) => cal.addBlock({ staffId: c.val, from: at(c.tomorrow, "15:00"), to: at(c.tomorrow, "16:00"), kind: "block", note: "" }),
    (r) => r.ok,
  );

  it("journal.schedule, for a barber: with it his own time applies at once; without it, it waits for an answer", async () => {
    for (const has of [true, false]) {
      const c = await fresh("barber");
      await grant(c.me, "journal.schedule", has);
      const r = await bTime.addOff({ offKind: "block", date: c.tomorrow, start: "15:00", end: "16:00" });
      expect(r).toMatchObject({ ok: true, status: has ? "applied" : "requested" });
      // answering the request is making the change: the front desk needs the same right
      if (!has) {
        jar.cookies = { [SESSION_COOKIE]: await createSession(query, c.desk) };
        await grant(c.desk, "journal.schedule", false);
        expect(await requests.answer(r.ok ? r.id : "", "approved", "")).toEqual({ ok: false, code: "forbidden" });
        await grant(c.desk, "journal.schedule", true);
        expect(await requests.answer(r.ok ? r.id : "", "approved", "")).toEqual({ ok: true });
      }
    }
  });

  it("journal.phones: the phone in the calendar and in the barber's day is whole with it, masked without", async () => {
    for (const has of [true, false]) {
      const c = await fresh("barber");
      await grant(c.me, "journal.phones", has);
      const me = await holder(c);
      const [day] = barberDaysFor(me, c.val, await loadBarberDays(query, c.demo.business, c.val, c.tomorrow, 1), c.today);
      expect(day.visits[0].clientPhone).toBe(has ? PHONE : "+3725•••••11");
      expect(barberMay(me, c.val, c.today).call).toBe(has);
      const data = calendarFor(me, await loadCalendar(query, c.demo.business, c.tomorrow, 1), c.today);
      expect(data.visits[0].clientPhone).toBe(has ? PHONE : "+3725•••••11");
      expect(calendarMay(me, c.today).call).toBe(has);
    }
    cover("journal.phones");
  });

  both("journal.move", "desk", (c) => cal.updateVisit(c.visit, { staffId: c.val, start: at(c.tomorrow, "12:00"), force: true }), (r) => r.ok, { without: ["visit.edit.staff_time"] });

  it("journal.stats: the day's sum is there with it, not without", async () => {
    for (const has of [true, false]) {
      const c = await fresh("barber");
      await grant(c.me, "journal.stats", has);
      const me = await holder(c);
      const [day] = barberDaysFor(me, c.val, await loadBarberDays(query, c.demo.business, c.val, c.tomorrow, 1), c.today);
      expect(day.count).toBe(1);
      expect(day.totalCents > 0).toBe(has);
      expect(barberMay(me, c.val, c.today).stats).toBe(has);
      expect(calendarMay(me, c.today).stats).toBe(has);
    }
    cover("journal.stats");
  });
});

/* ------------------------------------------------------------------ 2. Окно записи */

describe("Окно записи", () => {
  it("visit.client_data: the phone, the client's note and his card in a visit", async () => {
    for (const has of [true, false]) {
      const c = await fresh("barber");
      await grant(c.me, "visit.client_data", has);
      const me = await holder(c);
      const [day] = barberDaysFor(me, c.val, await loadBarberDays(query, c.demo.business, c.val, c.tomorrow, 1), c.today);
      expect(day.visits[0].clientPhone).toBe(has ? PHONE : null);
      expect(day.visits[0].clientNote).toBe(has ? "стрижёт коротко" : "");
      const card = await bVisit.loadClientCard(c.anna);
      expect(card !== null).toBe(has);
    }
    cover("visit.client_data");
  });

  both("visit.client_create", "desk", (c) => cal.createVisit(newVisit(c)), (r) => r.ok);

  it("visit.client_create: without it a visit for a client picked from the list is still booked", async () => {
    const c = await fresh("desk");
    await grant(c.me, "visit.client_create", false);
    expect((await cal.createVisit(newVisit(c, { clientId: c.anna, name: "", phone: "" }))).ok).toBe(true);
  });

  both("visit.client_list", "desk", () => cal.findClients("Anna"), (r) => r.length === 1);
  both("visit.client_list.phones", "desk", () => cal.findClients("Anna"), (r) => r[0]?.phone === PHONE);

  it("visit.client_list.phones: without it a phone's digits find nobody", async () => {
    const c = await fresh("desk");
    expect(await cal.findClients("5550011")).toHaveLength(1);
    await grant(c.me, "visit.client_list.phones", false);
    expect(await cal.findClients("5550011")).toEqual([]);
    expect((await cal.findClients("Anna"))[0].phone).toBe("+3725•••••11");
  });

  both("visit.create", "desk", (c) => cal.createVisit(newVisit(c)), (r) => r.ok);
  both("visit.create", "barber", (c) => bVisit.bookVisit({ start: at(c.tomorrow, "14:00"), serviceIds: [c.demo.services.clip], name: "Борис Образец", key: key(), force: true }), (r) => r.ok);

  both("visit.edit", "desk", (c) => cal.setVisitStatus(c.visit, "arrived"), (r) => r === true);
  both(
    "visit.edit.arrived",
    "desk",
    async (c) => {
      await came(c);
      return cal.setVisitStatus(c.visit, "done");
    },
    (r) => r === true,
  );
  both("visit.edit.staff_time", "desk", (c) => cal.updateVisit(c.visit, { staffId: c.val, start: at(c.tomorrow, "12:00"), force: true }), (r) => r.ok, { without: ["journal.move"] });
  both("visit.edit.comment", "desk", (c) => cal.updateVisit(c.visit, { staffNote: "принести воск" }), (r) => r.ok);
  both("visit.edit.comment", "barber", (c) => bVisit.saveVisitNote(c.visit, "принести воск"), (r) => r === true);
  both("visit.edit.services", "desk", async (c) => cal.updateVisit(c.visit, { serviceIds: [await otherService(c)], force: true }), (r) => r.ok);

  it("visit.edit with «today only»: a visit of an earlier day is not changed, today's is", async () => {
    const c = await fresh("desk");
    const yesterday = addDays(c.today, -1);
    const old = await adminCreateVisit(c.demo.business, { staffId: c.val, start: at(yesterday, "10:00"), serviceIds: [c.demo.services.clip], clientId: c.anna, idempotencyKey: key(), force: true }, c.owner);
    if (!old.ok) throw new Error(old.code);
    await setValue(c.me, "visit.edit", "today");
    expect(await cal.setVisitStatus(old.id, "done")).toBe(false);
    expect((await cal.updateVisit(old.id, { staffNote: "поздно" })).ok).toBe(false);
    expect(await cal.setVisitStatus(c.visit, "arrived")).toBe(true);
    await setValue(c.me, "visit.edit", "all");
    expect(await cal.setVisitStatus(old.id, "done")).toBe(true);
  });

  both("visit.delete", "desk", (c) => cal.cancelVisit(c.visit), (r) => r === "cancelled");
  both("visit.delete", "barber", (c) => bVisit.cancelVisit(c.visit, "заболел"), (r) => r === "cancelled");
  both(
    "visit.delete.arrived",
    "desk",
    async (c) => {
      await came(c);
      return cal.cancelVisit(c.visit);
    },
    (r) => r === "cancelled",
  );

  it("a refused cancel leaves the visit as it was", async () => {
    const c = await fresh("desk");
    await grant(c.me, "visit.delete", false);
    expect(await cal.cancelVisit(c.visit)).toBe("forbidden");
    expect(await statusOf(c.visit)).toBe("booked");
  });

  const paste = FAKE_PRODUCTS[0];
  const sale = (c: Ctx) => frame.sellAction({ ref: key(), staffId: c.val, productId: paste.productId, variant: paste.variant, qty: 1, expectCents: paste.priceCents, clientId: null, at: null });
  const barberSale = (ref: string) => bSell.sellAction({ ref, productId: paste.productId, variant: paste.variant, mode: "client", qty: 1, expectCents: paste.priceCents });

  both("visit.sell", "barber", () => bSell.searchAction("matte paste"), (r) => r.ok && r.items.length === 1);
  both("visit.sell.create", "desk", sale, (r) => r.ok);
  both("visit.sell.create", "barber", () => barberSale(key()), (r) => r.ok);
  both(
    "visit.sell.edit",
    "barber",
    async () => {
      const ref = key();
      const sold = await barberSale(ref);
      if (!sold.ok) throw new Error(`sale: ${sold.code}`);
      return bSell.undoAction(ref);
    },
    (r) => r.ok,
  );
  both(
    "visit.sell.edit",
    "desk",
    async (c) => {
      const sold = await sale(c);
      if (!sold.ok) throw new Error(`sale: ${sold.code}`);
      const [row] = await query<{ id: string }>("select id from product_sales where ref = $1", [sold.ref]);
      return invoices.reverseSaleAction(row.id, "ошибка");
    },
    (r) => r.ok,
  );

  it("visit.sell.edit with «today only»: a sale made on an earlier day is not taken back, today's is", async () => {
    const c = await fresh("desk");
    const idOf = async (ref: string) => (await query<{ id: string }>("select id from product_sales where ref = $1", [ref]))[0].id;
    const old = await sale(c);
    const now = await sale(c);
    if (!old.ok || !now.ok) throw new Error("sale");
    await query("update product_sales set created_at = created_at - interval '2 days' where ref = $1", [old.ref]);
    await setValue(c.me, "visit.sell.edit", "today");
    expect(await invoices.reverseSaleAction(await idOf(old.ref), "ошибка")).toEqual({ ok: false, code: "forbidden" });
    expect((await invoices.reverseSaleAction(await idOf(now.ref), "ошибка")).ok).toBe(true);
    await setValue(c.me, "visit.sell.edit", "all");
    expect((await invoices.reverseSaleAction(await idOf(old.ref), "ошибка")).ok).toBe(true);
  });

  it("visit.sell.create with «today only»: a sale dated yesterday is refused, one of today is taken", async () => {
    const c = await fresh("desk");
    await setValue(c.me, "visit.sell.create", "today");
    const dated = (when: number | null) => frame.sellAction({ ref: key(), staffId: c.val, productId: paste.productId, variant: paste.variant, qty: 1, expectCents: paste.priceCents, clientId: null, at: when });
    expect(await dated(at(addDays(c.today, -1), "12:00"))).toEqual({ ok: false, code: "invalid", field: "forbidden" });
    expect((await dated(null)).ok).toBe(true);
    await setValue(c.me, "visit.sell.create", "all");
    expect((await dated(at(addDays(c.today, -1), "12:00"))).ok).toBe(true);
  });

  both("visit.edit", "desk", (c) => cal.setVisitStatus(c.visit, "booked", true), (r) => r === true);
});

/* ------------------------------------------------------------------ 4b. the visit window's own data (visitWindowAction) */

describe("Окно визита: what the window shows beside the visit", () => {
  const extras = (c: Ctx, id = c.visit) => cal.visitWindowAction(id);
  /** A visit of Anna's `daysAgo` days ago with Valentin, that she came to. */
  const before = async (c: Ctx, daysAgo: number, serviceId: string) => {
    const r = await adminCreateVisit(c.demo.business, { staffId: c.val, start: at(addDays(c.today, -daysAgo), "10:00"), serviceIds: [serviceId], clientId: c.anna, idempotencyKey: key(), force: true }, c.owner);
    if (!r.ok) throw new Error(r.code);
    if (!(await adminSetStatus(c.demo.business, r.id, "done", c.owner))) throw new Error("status");
    return r;
  };

  it("is the visit's: who made it, from where, what happened to it; nothing for a visit that is not there", async () => {
    const c = await fresh("desk");
    expect(await cal.setVisitStatus(c.visit, "booked", true)).toBe(true);
    const x = (await extras(c))!;
    expect(x.source).toBe("admin");
    expect(x.by).toEqual({ kind: "user", name: "Owner" });
    // the newest first, with who did it
    expect(x.log.map((r) => r.action)).toEqual(["status", "create"]);
    expect(x.log[0]).toMatchObject({ status: "booked", confirmed: true, by: { kind: "user", name: "Desk" } });
    expect(x.messages.every((m) => typeof m.kind === "string")).toBe(true);
    expect(await extras(c, "not-a-visit")).toBeNull();
    expect(await extras(c, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("journal.staff: nothing for a visit in a column the login does not see", async () => {
    for (const sees of [true, false]) {
      const c = await fresh("desk");
      await setValue(c.me, "journal.staff", sees ? "all" : [c.jev]);
      expect((await extras(c)) !== null).toBe(sees);
    }
  });

  it("journal.history: nothing for a visit of a day before the login's limit", async () => {
    for (const free of [true, false]) {
      const c = await fresh("desk");
      const old = await before(c, 3, c.demo.services.clip);
      await setValue(c.me, "journal.history", free ? null : 0);
      expect((await extras(c, old.id)) !== null, "three days ago").toBe(free);
      expect(await extras(c), "tomorrow").not.toBeNull();
    }
  });

  it("visit.client_data and clients.show: the client's part only for a login that sees his data and is shown him", async () => {
    for (const [data, shown] of [
      [true, true],
      [false, true],
      [true, false],
    ]) {
      const c = await fresh("desk");
      await grant(c.me, "visit.client_data", data);
      // Anna came to Valentin only
      if (!shown) await setValue(c.me, "clients.show", [c.jev]);
      const x = await extras(c);
      expect(x, "the visit's own part").not.toBeNull();
      expect(x!.client !== null, `data ${data}, shown ${shown}`).toBe(data && shown);
    }
    cover("visit.client_data");
  });

  it("clients.history: his numbers and his last visit's services come with it; his comments with or without", async () => {
    for (const has of [true, false]) {
      const c = await fresh("desk");
      const svc = await otherService(c);
      const prev = await before(c, 20, svc);
      await addComment(c.demo.business, c.anna, "любит кофе", { id: c.owner, name: "Owner" });
      await grant(c.me, "clients.history", has);
      const client = (await extras(c))!.client!;
      expect(client.comments.map((m) => m.text)).toEqual(["любит кофе"]);
      expect(client.commentAdd).toBe(true);
      expect(client.card).toEqual({ history: has, notify: true });
      if (!has) {
        expect(client).toMatchObject({ stats: null, lastServiceIds: [], awayDays: null });
        continue;
      }
      // the visit ahead is counted, not yet sold; the one she came to is
      expect(client.stats).toEqual({ lastVisit: prev.start, visits: 2, noShows: 0, soldCents: prev.totalCents });
      expect(client.lastServiceIds).toEqual([svc]);
      // tomorrow is 21 days after it
      expect(client.awayDays).toBe(21);
      // a visit five days ago: «Не посещал» is not said under two weeks
      await before(c, 5, c.demo.services.clip);
      expect((await extras(c))!.client).toMatchObject({ awayDays: null, lastServiceIds: [c.demo.services.clip] });
    }
  });

  it("clients.comments_add: «Добавить примечание» is offered only with it", async () => {
    for (const has of [true, false]) {
      const c = await fresh("desk");
      await grant(c.me, "clients.comments_add", has);
      expect((await extras(c))!.client!.commentAdd).toBe(has);
    }
  });
});

/* ------------------------------------------------------------------ 5. Сотрудники, 6. Услуги */

describe("Сотрудники", () => {
  const profile = (over: Partial<Parameters<typeof staffActs.saveProfile>[1]> = {}) => ({ name: "Valentin", role: { ru: "Барбер", et: "Barber", en: "Barber" }, photoUrl: "", bookable: true, active: true, ...over });
  both("staff.create", "desk", () => staffActs.saveProfile(null, profile({ name: "Новый барбер" })), (r) => r.ok);
  both("staff.edit", "desk", (c) => staffActs.saveProfile(c.val, profile({ name: "Valentin V." })), (r) => r.ok);
  both("staff.dismiss", "desk", (c) => staffActs.saveProfile(c.val, profile({ active: false })), (r) => r.ok);
  both("staff.schedule", "desk", (c) => staffActs.saveHours(c.val, { 1: [["10:00", "18:00"]], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }), (r) => r.ok);

  it("staff.schedule: every part of a barber's schedule is behind it", async () => {
    const c = await fresh("desk");
    await grant(c.me, "staff.schedule", false);
    expect(await staffActs.saveDay(c.val, c.tomorrow, [], "")).toEqual({ ok: false, field: "forbidden" });
    expect(await staffActs.addOff({ staffId: c.val, from: at(c.tomorrow, "15:00"), to: at(c.tomorrow, "16:00"), kind: "block", note: "" })).toEqual({ ok: false, field: "forbidden" });
    expect(await staffActs.addSpecial({ staffId: c.val, from: at(c.tomorrow, "19:00"), to: at(c.tomorrow, "21:00"), extraCents: 1000, note: "" })).toEqual({ ok: false, field: "forbidden" });
    // the profile is another right, and stays
    expect((await staffActs.saveProfile(c.val, profile())).ok).toBe(true);
  });
});

describe("Услуги", () => {
  const formOf = async (c: Ctx) => {
    const [s] = await query<{ name: { ru?: string; et?: string; en?: string }; duration_min: number; price_cents: number; price_max_cents: number | null; buffer_after_min: number; online: boolean; active: boolean }>(
      "select name, duration_min, price_cents, price_max_cents, buffer_after_min, online, active from services where id = $1",
      [c.demo.services.clip],
    );
    return { name: { ru: s.name.ru ?? "", et: s.name.et ?? "", en: s.name.en ?? "" }, durationMin: s.duration_min, priceCents: s.price_cents, priceMaxCents: s.price_max_cents, bufferMin: s.buffer_after_min, online: s.online, active: s.active, allBarbers: false };
  };
  const save = async (c: Ctx, change: (f: Awaited<ReturnType<typeof formOf>>) => Partial<Awaited<ReturnType<typeof formOf>>>) => {
    const f = await formOf(c);
    return services.saveServiceAction(c.demo.services.clip, { ...f, ...change(f) });
  };
  const fresh1 = { name: { ru: "Новая услуга", et: "", en: "" }, durationMin: 30, priceCents: 1500, priceMaxCents: null, bufferMin: 0, online: true, active: true, allBarbers: false };

  both("services.create", "desk", () => services.saveServiceAction(null, fresh1), (r) => r.ok);
  both("services.edit", "desk", (c) => save(c, (f) => ({ durationMin: f.durationMin + 5 })), (r) => r.ok);
  both("services.edit.name", "desk", (c) => save(c, (f) => ({ name: { ...f.name, ru: `${f.name.ru} плюс` } })), (r) => r.ok);
  both("services.edit.price", "desk", (c) => save(c, (f) => ({ priceCents: f.priceCents + 100, priceMaxCents: null })), (r) => r.ok);
  both("services.edit.online", "desk", (c) => save(c, (f) => ({ online: !f.online })), (r) => r.ok);
  both("services.delete", "desk", (c) => save(c, () => ({ active: false })), (r) => r.ok);
  // «Категория услуги» (its own since round 13): another category for a service there is
  const otherCategory = async (c: Ctx) => {
    const [s] = await query<{ category_id: string | null }>("select category_id from services where id = $1", [c.demo.services.clip]);
    const [o] = await query<{ id: string }>("select id from service_categories where business_id = $1 and id is distinct from $2 limit 1", [c.demo.business.id, s.category_id]);
    if (!o && !s.category_id) throw new Error("no category to move to");
    return o ? { id: o.id } : null;
  };
  both("services.edit.category", "desk", async (c) => services.saveServiceAction(c.demo.services.clip, { ...(await formOf(c)), category: await otherCategory(c) }), (r) => r.ok);

  it("services.edit.category: a new category and a category's pencil need it too; a new service may still go into one there is", async () => {
    const c = await fresh("desk");
    await grant(c.me, "services.edit.category", false);
    const [cat] = await query<{ id: string }>("select id from service_categories where business_id = $1 limit 1", [c.demo.business.id]);
    expect(await services.renameCategoryAction(cat.id, "ru", "Бороды")).toEqual({ ok: false, field: "forbidden" });
    expect(await services.saveServiceAction(null, { ...fresh1, category: { name: { ru: "Новая категория", et: "", en: "" } } })).toEqual({ ok: false, field: "forbidden" });
    expect(await services.saveServiceAction(c.demo.services.clip, { ...(await formOf(c)), category: { name: { ru: "Новая категория", et: "", en: "" } } })).toEqual({ ok: false, field: "forbidden" });
    expect((await services.saveServiceAction(null, { ...fresh1, category: { id: cat.id } })).ok).toBe(true);
    // the window sends no category when it may not change it: the rest saves
    expect((await save(c, (f) => ({ durationMin: f.durationMin + 5 }))).ok).toBe(true);
    const [now] = await query<{ category_id: string | null }>("select category_id from services where id = $1", [c.demo.services.clip]);
    expect((await services.saveServiceAction(c.demo.services.clip, { ...(await formOf(c)), category: now.category_id ? { id: now.category_id } : null })).ok).toBe(true);
  });
  // a barber's row in the service's window: his price and time, or whether he does it
  both("services.staff", "desk", async (c) => services.saveServiceAction(c.demo.services.clip, { ...(await formOf(c)), barbers: [{ staffId: c.val, offered: true, priceCents: 2600, durationMin: 30 }] }), (r) => r.ok);

  it("services.staff: the window's other changes need it only when a barber's row changes", async () => {
    const c = await fresh("desk");
    await grant(c.me, "services.staff", false);
    const f = await formOf(c);
    const [row] = await query<{ price_cents: number | null; duration_min: number | null }>("select price_cents, duration_min from staff_services where staff_id = $1 and service_id = $2", [c.val, c.demo.services.clip]);
    const same = { staffId: c.val, offered: true, priceCents: row.price_cents ?? f.priceCents, durationMin: row.duration_min ?? f.durationMin };
    // his row as it is, with the buffer changed: allowed
    expect((await services.saveServiceAction(c.demo.services.clip, { ...f, bufferMin: f.bufferMin + 5, barbers: [same] })).ok).toBe(true);
    // the base's length moves, and his, which was the base's, moves with it in the window: allowed
    const longer = f.durationMin + 5;
    expect(same.durationMin).toBe(f.durationMin);
    expect((await services.saveServiceAction(c.demo.services.clip, { ...(await formOf(c)), durationMin: longer, barbers: [{ ...same, durationMin: longer }] })).ok).toBe(true);
    // his own length, other than the base's, is his row's change
    expect(await services.saveServiceAction(c.demo.services.clip, { ...(await formOf(c)), barbers: [{ ...same, durationMin: longer + 10 }] })).toEqual({ ok: false, field: "forbidden" });
    // switching him off is a change of his row
    expect(await services.saveServiceAction(c.demo.services.clip, { ...(await formOf(c)), barbers: [{ ...same, offered: false }] })).toEqual({ ok: false, field: "forbidden" });
  });

  it("the table's own changes ask the same rights: the switch, the price in place, a category's name", async () => {
    for (const has of [true, false]) {
      const c = await fresh("desk");
      await grant(c.me, "services.edit.online", has);
      await grant(c.me, "services.edit.price", has);
      const f = await formOf(c);
      expect((await services.setOnlineAction(c.demo.services.clip, !f.online)).ok, `online, ${has}`).toBe(has);
      expect((await services.setPriceAction(c.demo.services.clip, f.priceCents + 100)).ok, `price, ${has}`).toBe(has);
    }
    const c = await fresh("desk");
    const [cat] = await query<{ id: string }>("select id from service_categories where business_id = $1 limit 1", [c.demo.business.id]);
    expect((await services.renameCategoryAction(cat.id, "ru", "Стрижки")).ok).toBe(true);
    await grant(c.me, "services.edit", false);
    expect(await services.renameCategoryAction(cat.id, "ru", "Бороды")).toEqual({ ok: false, field: "forbidden" });
  });

  it("services.edit: a save that changes nothing of the three needs none of them", async () => {
    const c = await fresh("desk");
    for (const k of ["services.edit.name", "services.edit.price", "services.edit.online", "services.delete"] as const) await grant(c.me, k, false);
    expect((await save(c, (f) => ({ durationMin: f.durationMin + 5 }))).ok).toBe(true);
    expect(await save(c, (f) => ({ priceCents: f.priceCents + 100 }))).toEqual({ ok: false, field: "forbidden" });
  });

  it("services.staff, for a barber: with it his own price applies at once; without it, it waits", async () => {
    for (const has of [true, false]) {
      const c = await fresh("barber");
      await grant(c.me, "services.staff", has);
      const r = await bTime.setPrice({ serviceId: c.demo.services.clip, priceCents: 3300, durationMin: 30 });
      expect(r).toMatchObject({ ok: true, status: has ? "applied" : "requested" });
    }
  });
});

/* ------------------------------------------------------------------ 7. Уведомления */

describe("Уведомления", () => {
  // «Доступ к разделу Типы уведомлений» opens «Уведомления» (round 13); each of the other two changes its own channel of a type
  both("notify.types", "owner", () => notif.saveTypeAction("visit_new", { on: false }), (r) => r.ok === true);
  both("notify.sms", "owner", () => notif.saveTypeAction("reminder", { lead: { sms: 60 } }), (r) => r.ok === true);
  both("notify.email", "owner", () => notif.saveTypeAction("confirmation", { on: false }), (r) => r.ok === true);
});

/* ------------------------------------------------------------------ 8. Настройки */

describe("Настройки", () => {
  // the reminder by SMS, by push or both, on «Уведомления» (once on «Запросы»)
  both("settings.system", "owner", () => notif.saveTypeAction("reminder", { mode: "sms" }), (r) => r.ok === true);
  both("settings.users", "owner", (c) => account.linkUserStaff(c.desk, c.jev), (r) => r === true);
  both("settings.users.remove", "owner", (c) => account.toggleUser(c.desk, false), (r) => r === true);
  both(
    "settings.users.invite",
    "owner",
    (c) => {
      const f = new FormData();
      f.set("email", "new@example.test");
      f.set("name", "New");
      f.set("role", "staff");
      f.set("staffId", c.jev);
      return account.addUser(f);
    },
    (r) => r.ok,
  );
  both(
    "settings.users.rights",
    "owner",
    async (c) => {
      const set = (await query<{ rights_preset: string; rights: string[]; rights_values: Record<string, RightValue> }>("select rights_preset, rights, rights_values from users where id = $1", [c.barber]))[0];
      return account.saveRightsAction(c.barber, { preset: set.rights_preset, on: set.rights.filter((k) => k !== "journal.phones"), values: set.rights_values });
    },
    (r) => r.ok,
  );

  it("settings.users.rights: copying another login's rights is behind it too", async () => {
    const c = await fresh("owner");
    expect(await account.copyRightsAction(c.desk, c.barber)).not.toBeNull();
    await grant(c.me, "settings.users.rights", false);
    expect(await account.copyRightsAction(c.desk, c.barber)).toBeNull();
  });

  both("settings.categories", "desk", (c) => clients.bulkLabelAction({ ids: [c.anna] }, "Постоянные"), (r) => r.ok);

  // «Бренд», «Контакты», «Галерея»: the owner's by default; a front desk login once it is given
  both("settings.location", "owner", () => settingsActs.saveContactsAction({ address: "Fake street 2, Tallinn", schedule: { ru: "пн–пт 10–18" } }), (r) => r.ok);
  it("settings.location: a front desk login without it is refused at every door of the salon's page", async () => {
    const c = await fresh("desk");
    const png = () => {
      const f = new FormData();
      f.set("image", new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])], { type: "image/png" }), "x.png");
      return f;
    };
    const no = { ok: false, field: "forbidden" };
    expect(await settingsActs.saveBrandAction({ name: "Other", about: { ru: "", et: "", en: "" } })).toEqual(no);
    expect(await settingsActs.saveContactsAction({ address: "Fake street 3" })).toEqual(no);
    expect(await settingsActs.uploadLogoAction(png())).toEqual(no);
    expect(await settingsActs.removeLogoAction()).toEqual(no);
    expect(await settingsActs.addPhotoAction(png())).toEqual(no);
    expect(await settingsActs.removePhotoAction("/x.svg")).toEqual(no);
    expect(await settingsActs.orderPhotosAction([])).toEqual(no);
    // «Найти» asks the geocoder for nobody without it
    expect(await settingsActs.geocodeAction("Mardi 1, Tallinn", "EE")).toEqual({ ok: false, why: "failed" });
    await grant(c.me, "settings.location", true);
    expect(await settingsActs.addPhotoAction(png())).toMatchObject({ ok: true });
    // with it, the e2e server's stand-in answers: nothing goes out from a test
    process.env.GEOCODER = "fake";
    try {
      expect(await settingsActs.geocodeAction("Mardi 1, Tallinn", "EE")).toMatchObject({ ok: true, hit: { lat: 59.430883, lng: 24.761967, postcode: "10145" } });
    } finally {
      delete process.env.GEOCODER;
    }
    const [row] = await query<{ name: string }>("select name from locations where business_id = $1", [c.demo.business.id]);
    expect(row.name).toBe("REMPIRE");
  });

  it("settings.categories: without it a category that is in use is still given", async () => {
    const c = await fresh("desk");
    await saveClient(c.demo.business, c.anna, { labels: ["VIP"] }, c.owner);
    await grant(c.me, "settings.categories", false);
    const other = await saveClient(c.demo.business, null, { name: "Борис Образец" }, c.owner);
    if (!other.ok) throw new Error(other.field);
    expect((await clients.bulkLabelAction({ ids: [other.id] }, "vip")).ok).toBe(true);
    expect(await clients.bulkLabelAction({ ids: [other.id] }, "Новые слова")).toEqual({ ok: false, field: "forbidden" });
  });
});

/* ------------------------------------------------------------------ 9. Клиентская база */

describe("Клиентская база", () => {
  const list = () => clients.listClientsAction({ q: "", label: "", page: 1 });
  const cardOf = async (c: Ctx) => clientDetail(query, c.demo.business, c.anna, Date.now(), await holder(c));
  const request = (url: string, init: RequestInit = {}) => new Request(`http://localhost${url}`, { ...init, headers: { origin: "http://localhost", host: "localhost", ...(init.headers ?? {}) } });

  both("clients.list_contacts", "desk", list, (r, c) => r.rows.find((x) => x.id === c.anna)?.phone === PHONE && r.rows.find((x) => x.id === c.anna)?.email === "anna@example.test");

  it("clients.list_contacts: without it the list shows masks, and neither a phone's digits nor an e-mail find anyone", async () => {
    const c = await fresh("desk");
    await grant(c.me, "clients.list_contacts", false);
    const row = (await list()).rows.find((x) => x.id === c.anna)!;
    expect([row.phone, row.email]).toEqual(["+3725•••••11", "a•••@example.test"]);
    expect((await clients.listClientsAction({ q: "5550011", label: "", page: 1 })).total).toBe(0);
    expect((await clients.listClientsAction({ q: "anna@example", label: "", page: 1 })).total).toBe(0);
    expect((await clients.listClientsAction({ q: "Näidis", label: "", page: 1 })).total).toBe(1);
  });

  both("clients.card_contacts", "desk", cardOf, (d) => d?.phone === PHONE && d?.email === "anna@example.test");

  it("clients.card_contacts: masked contacts are never saved back over the real ones", async () => {
    const c = await fresh("desk");
    await grant(c.me, "clients.card_contacts", false);
    const d = (await cardOf(c))!;
    expect([d.phone, d.email]).toEqual(["+3725•••••11", "a•••@example.test"]);
    const r = await clients.saveCardAction(c.anna, { ...cardFieldsOf(d), cardNo: "A-17" });
    expect(r.ok).toBe(true);
    const [row] = await query<{ phone_e164: string; email: string; card_no: string }>("select phone_e164, email, card_no from clients where id = $1", [c.anna]);
    expect(row).toEqual({ phone_e164: PHONE, email: "anna@example.test", card_no: "A-17" });
  });

  both("clients.edit", "desk", () => clients.saveClientAction(null, { name: "Новый клиент" }), (r) => r.ok);
  both("clients.edit", "desk", async (c) => clients.saveCardAction(c.anna, { ...cardFieldsOf((await cardOf(c))!), cardNo: "A-17" }), (r) => r.ok);
  both("clients.note", "desk", cardOf, (d) => d?.note === "стрижёт коротко");
  both("clients.note.edit", "desk", async (c) => clients.saveCardAction(c.anna, { ...cardFieldsOf((await cardOf(c))!), note: "теперь длиннее" }), (r) => r.ok);
  both("clients.note.edit", "barber", (c) => bVisit.saveClientNote(c.anna, "теперь длиннее"), (r) => r === true);

  it("clients.note.edit: the note alone needs no right to the rest of the card, and the other way round", async () => {
    const c = await fresh("desk");
    await grant(c.me, "clients.edit", false);
    const d = (await cardOf(c))!;
    expect((await clients.saveCardAction(c.anna, { ...cardFieldsOf(d), note: "только примечание" })).ok).toBe(true);
    expect(await clients.saveCardAction(c.anna, { ...cardFieldsOf(d), note: "только примечание", cardNo: "A-17" })).toMatchObject({ ok: false, field: "forbidden" });
  });

  const lonely = async (c: Ctx) => {
    const r = await saveClient(c.demo.business, null, { name: "Без истории" }, c.owner);
    if (!r.ok) throw new Error(r.field);
    return r.id;
  };
  both("clients.delete", "desk", async (c) => clients.deleteClientAction(await lonely(c)), (r) => r.ok);

  it("clients.delete: «Обезличить» is the same door", async () => {
    for (const has of [true, false]) {
      const c = await fresh("desk");
      await grant(c.me, "clients.delete", has);
      expect(await clients.anonymiseClientAction(await lonely(c)), has ? "with it" : "without it").toEqual(has ? { ok: true } : { ok: false, code: "forbidden" });
    }
  });

  it("clients.delete: many at once stays the owner's, with the right or without", async () => {
    const c = await fresh("desk");
    const id = await lonely(c);
    expect(await clients.bulkDeleteAction({ ids: [id] })).toEqual({ ok: false, code: "forbidden" });
    jar.cookies = { [SESSION_COOKIE]: await createSession(query, c.owner) };
    expect(await clients.bulkDeleteAction({ ids: [id] })).toMatchObject({ ok: true, deleted: 1 });
    const again = await lonely(c);
    await grant(c.owner, "clients.delete", false);
    expect(await clients.bulkDeleteAction({ ids: [again] })).toEqual({ ok: false, code: "forbidden" });
  });

  both("clients.export", "owner", async () => (await exportRoute(request("/admin/clients/export", { method: "POST", body: "{}" }))).status, (status) => status === 200);

  it("clients.export: the file leaves out phones and e-mails for a login that does not see them in the list", async () => {
    const c = await fresh("owner");
    const cols = async () => (await query<{ after: { columns: string[] } }>("select after from audit where entity = 'client' and action = 'export' order by id desc limit 1"))[0].after.columns;
    await exportRoute(request("/admin/clients/export", { method: "POST", body: "{}" }));
    expect(await cols()).toEqual(expect.arrayContaining(["name", "phone", "email"]));
    await grant(c.me, "clients.list_contacts", false);
    await exportRoute(request("/admin/clients/export", { method: "POST", body: "{}" }));
    expect(await cols()).not.toEqual(expect.arrayContaining(["phone"]));
    expect(await cols()).not.toEqual(expect.arrayContaining(["email"]));
  });

  both(
    "clients.comments",
    "desk",
    async (c) => {
      await addComment(c.demo.business, c.anna, "просил перезвонить", { id: c.owner, name: "Owner" });
      return listComments(query, c.demo.business.id, c.anna, await holder(c));
    },
    (r) => r.length === 1,
  );
  both("clients.comments_add", "desk", (c) => clients.addCommentAction(c.anna, "просил перезвонить"), (r) => r.ok);
  both(
    "clients.comments_delete_own",
    "desk",
    async (c) => {
      const mine = await addComment(c.demo.business, c.anna, "мой", { id: c.me, name: "Desk" });
      return clients.deleteCommentAction(c.anna, mine.ok ? mine.id : "");
    },
    (r) => r === true,
    { without: ["clients.comments_delete_others"] },
  );
  both(
    "clients.comments_delete_others",
    "desk",
    async (c) => {
      const his = await addComment(c.demo.business, c.anna, "чужой", { id: c.owner, name: "Owner" });
      return clients.deleteCommentAction(c.anna, his.ok ? his.id : "");
    },
    (r) => r === true,
    { without: ["clients.comments_delete_own"] },
  );

  const fileOf = async (c: Ctx) => {
    const f = await addFile(c.demo.business, c.anna, { name: "note.txt", type: "text/plain", bytes: new TextEncoder().encode("привет") }, { id: c.owner, name: "Owner" });
    if (!f.ok) throw new Error(f.code);
    return f.id;
  };
  both(
    "clients.files",
    "desk",
    async (c) => {
      const fileId = await fileOf(c);
      const res = await fileRoute(request(`/admin/clients/${c.anna}/files/${fileId}`), { params: Promise.resolve({ id: c.anna, fileId }) });
      return { status: res.status, listed: (await listFiles(query, c.demo.business.id, c.anna, await holder(c))).length };
    },
    (r) => r.status === 200 && r.listed === 1,
  );
  both(
    "clients.files.upload",
    "desk",
    async (c) => {
      const body = new FormData();
      body.set("file", new File([new TextEncoder().encode("привет")], "note.txt", { type: "text/plain" }));
      return (await uploadRoute(request(`/admin/clients/${c.anna}/files`, { method: "POST", body }), { params: Promise.resolve({ id: c.anna }) })).status;
    },
    (status) => status === 201,
  );
  both("clients.files.delete", "desk", async (c) => clients.deleteFileAction(c.anna, await fileOf(c)), (r) => r === true);

  it("clients.show: all clients, or only those who came to the chosen barbers", async () => {
    for (const all of [true, false]) {
      const c = await fresh("desk");
      // Anna has a visit with Valentin; the login is shown Jevgeni's clients only
      await setValue(c.me, "clients.show", all ? "all" : [c.jev]);
      expect((await list()).rows.some((x) => x.id === c.anna), "in the list").toBe(all);
      expect((await cardOf(c)) !== null, "her card").toBe(all);
      expect((await cal.findClients("Anna")).length === 1, "in the calendar's search").toBe(all);
      expect((await clients.saveCardAction(c.anna, { name: "Anna", phone: PHONE, phone2: "", email: "", birthday: "", gender: "", importance: "", cardNo: "", discount: "", locale: "ru", noOnline: false, note: "", labels: [] })).ok, "saving her card").toBe(all);
      expect((await clients.massPreviewAction({ ids: [c.anna] }))?.clients, "as a mass message's target").toBe(all ? 1 : 0);
    }
    cover("clients.show");
  });

  both("clients.history", "desk", (c) => clients.clientStatsAction(c.anna, "", ""), (r) => r !== null);

  it("clients.history: the card's visits come with it, and a barber's past visits with his client", async () => {
    for (const has of [true, false]) {
      const c = await fresh("desk");
      await grant(c.me, "clients.history", has);
      expect((await cardOf(c))!.history.length).toBe(has ? 1 : 0);
    }
  });
});

/* ------------------------------------------------------------------ the single right */

describe("Совершать SMS рассылки клиентам", () => {
  both("single.bulk_sms", "desk", (c) => clients.massSendAction({ ids: [c.anna] }, { text: "Привет", channels: ["sms"] }), (r) => r.ok);
  both("single.bulk_sms", "desk", (c) => clients.sendMessageAction(c.anna, { text: "Привет", channels: ["sms"] }), (r) => r.ok);
  both("single.bulk_sms", "desk", (c) => clients.massPreviewAction({ ids: [c.anna] }), (r) => r !== null);
});

/* ------------------------------------------------------------------ the sections themselves, and the whole list */

describe("a section whose group switch is off", () => {
  it("«Клиентская база»: the list is empty and every action inside refuses", async () => {
    const c = await fresh("desk");
    await grant(c.me, groupKey("clients"), false);
    expect(await clients.listClientsAction({ q: "", label: "", page: 1 })).toMatchObject({ rows: [], total: 0 });
    expect(await clients.saveClientAction(null, { name: "Новый" })).toEqual({ ok: false, field: "forbidden" });
    expect(await clients.addCommentAction(c.anna, "x")).toEqual({ ok: false, field: "forbidden" });
    expect(await clients.deleteClientAction(c.anna)).toEqual({ ok: false, code: "forbidden" });
  });

  it("«Услуги»: the list of services is not given", async () => {
    const c = await fresh("desk");
    expect((await frame.serviceListAction()).length).toBeGreaterThan(0);
    await grant(c.me, groupKey("services"), false);
    expect(await frame.serviceListAction()).toEqual([]);
  });

  it("a barber's login has no way into the admin's doors, whatever its rights", async () => {
    const c = await fresh("barber");
    await grant(c.me, "clients.export", true);
    await expect(clients.listClientsAction({ q: "", label: "", page: 1 })).rejects.toThrow("REDIRECT /b");
  });
});

/* ------------------------------------------------------------------ 10. Отчёты: «Записи»; and «График работы» */

describe("Отчёты: «Отзывы»", () => {
  /** One review of Valentin's, fake. */
  const review = async (c: Ctx) =>
    (await query<{ id: string }>("insert into reviews (business_id, rating, body, author_name, staff_id, created_at) values ($1, 5, 'Хорошо', 'Тест', $2, now()) returning id", [c.demo.business.id, c.val]))[0].id;
  const EVER = { from: "2020-01-01", to: "2099-12-31" };

  both("reports.reviews", "desk", async (c) => {
    await review(c);
    return reviewsActs.listReviewsAction(EVER);
  }, (r) => r.total === 1);
  both("reports.reviews", "desk", async (c) => reviewsActs.setReviewHiddenAction(await review(c), true), (r) => r.ok, { also: ["reports.reviews.delete"] });
  both("reports.reviews.delete", "desk", async (c) => reviewsActs.setReviewHiddenAction(await review(c), true), (r) => r.ok);

  it("reports.reviews.delete: without it the review stays on the booking page", async () => {
    const c = await fresh("desk");
    await grant(c.me, "reports.reviews.delete", false);
    const id = await review(c);
    expect(await reviewsActs.setReviewHiddenAction(id, true)).toEqual({ ok: false, code: "forbidden" });
    expect((await query<{ hidden: boolean }>("select hidden from reviews where id = $1", [id]))[0].hidden).toBe(false);
  });
});

describe("Отчёты: «Основные показатели» and «Визиты»", () => {
  both("reports.dashboard", "desk", () => analytics.kpiClientsAction({ kind: "clients" }), (r) => r !== null);
  // Anna's visit tomorrow: ahead in the left panel, made in the feed, open in the visit window
  both("reports.visits", "desk", () => dash.listVisitsAction({ when: "upcoming" }), (r, c) => r.upcoming === 1 && r.rows[0]?.id === c.visit);
  both("reports.visits", "desk", () => dash.feedAction({ filter: "all" }), (r, c) => r.entries.some((e) => e.id === c.visit));
  both("reports.visits", "desk", (c) => dash.openVisitAction(c.visit), (r) => r !== null);
  both("reports.visits.phones", "desk", async () => (await dash.listVisitsAction({})).rows[0]?.clientPhone, (phone) => phone === PHONE);
});

describe("Отчёты: «Сообщения» and «Изменения данных»", () => {
  const EVER = { from: "2020-01-01", to: "2099-12-31" };
  /** One reminder by SMS about Anna's visit, fake. */
  const sms = (c: Ctx) =>
    query("insert into notifications (business_id, appointment_id, channel, kind, recipient, payload) values ($1, $2, 'sms', 'reminder', $3, '{}'::jsonb)", [c.demo.business.id, c.visit, PHONE]);

  both("reports.messages", "desk", async (c) => {
    await sms(c);
    return messagesActs.listMessagesAction(EVER);
  }, (r) => r.rows.some((m) => m.kind === "reminder"));
  both("reports.messages.phones", "desk", async (c) => {
    await sms(c);
    return (await messagesActs.listMessagesAction({ ...EVER, kind: "reminder" })).rows[0]?.contact;
  }, (contact) => contact === PHONE);

  it("«Изменения данных»: the owner's alone; the front desk gets nothing with every right it has", async () => {
    const desk = await fresh("desk");
    expect(await query<{ n: number }>("select count(*)::int as n from audit").then((r) => r[0].n)).toBeGreaterThan(0);
    expect(await changesActs.listChangesAction(EVER)).toMatchObject({ total: 0, rows: [] });
    await grant(desk.me, "clients.list_contacts", true);
    expect((await changesActs.listChangesAction(EVER)).total).toBe(0);
    await fresh("owner");
    expect((await changesActs.listChangesAction(EVER)).total).toBeGreaterThan(0);
  });
});

describe("Отчёты: «Записи»", () => {
  /** Every visit there is, whenever it is. */
  const ALL = { visitFrom: "2020-01-01", visitTo: "2099-12-31" };
  const request = (url: string, init: RequestInit = {}) => new Request(`http://localhost${url}`, { ...init, headers: { origin: "http://localhost", host: "localhost", ...(init.headers ?? {}) } });
  const file = async (body = JSON.stringify(ALL)) => recordsExportRoute(request("/admin/records/export", { method: "POST", body }));
  const statusOfVisit = async (id: string) => (await query<{ status: string }>("select status from appointments where id = $1", [id]))[0].status;

  both("reports.bookings", "desk", () => records.listRecordsAction(ALL), (r, c) => r.total === 1 && r.rows[0]?.id === c.visit);
  both("reports.bookings", "desk", (c) => records.openVisitAction(c.visit), (r) => r !== null);
  both("reports.bookings", "desk", (c) => records.cancelRecordsAction([c.visit]), (r) => r.ok);
  both("reports.bookings.export", "desk", async () => (await file()).status, (status) => status === 200);
  both("reports.bookings.phones", "desk", async () => (await records.listRecordsAction(ALL)).rows[0]?.clientPhone, (phone) => phone === PHONE);

  it("reports.bookings: without it the file is refused too, and nothing is cancelled", async () => {
    const c = await fresh("desk");
    await grant(c.me, "reports.bookings", false);
    expect((await file()).status).toBe(403);
    expect(await records.cancelRecordsAction([c.visit])).toEqual({ ok: false, code: "forbidden" });
    expect(await statusOfVisit(c.visit)).toBe("booked");
  });

  it("the file is ours alone: a request from another site is refused, and each export is in the audit", async () => {
    const c = await fresh("desk");
    expect((await recordsExportRoute(new Request("http://localhost/admin/records/export", { method: "POST", body: "{}", headers: { origin: "https://elsewhere.example", host: "localhost" } }))).status).toBe(403);
    expect((await recordsExportRoute(new Request("http://localhost/admin/records/export", { method: "POST", body: "{}", headers: { host: "localhost" } }))).status).toBe(403);
    const ok = await file();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("x-rows")).toBe("1");
    expect(ok.headers.get("content-disposition")).toMatch(/^attachment; filename="rempire-records-\d{4}-\d{2}-\d{2}\.xlsx"$/);
    expect(await query("select 1 from audit where actor = $1 and entity = 'appointment' and action = 'export'", [c.me])).toHaveLength(1);
  });

  it("journal.staff: the list, its file, the pencil and «Отменить выбранные» have only the barbers the login sees", async () => {
    for (const sees of [true, false]) {
      const c = await fresh("desk");
      // the fixture's visit is in Valentin's column
      await setValue(c.me, "journal.staff", sees ? "all" : [c.jev]);
      expect((await records.listRecordsAction(ALL)).total, "in the list").toBe(sees ? 1 : 0);
      // a question that names him is answered as one that names nobody
      expect((await records.listRecordsAction({ ...ALL, staffId: c.val })).total, "asked for by name").toBe(sees ? 1 : 0);
      expect((await file()).headers.get("x-rows"), "in the file").toBe(sees ? "1" : "0");
      expect((await records.openVisitAction(c.visit)) !== null, "the pencil").toBe(sees);
      expect(await records.cancelRecordsAction([c.visit]), "cancelling").toEqual({ ok: true, cancelled: sees ? 1 : 0, refused: { already: 0, forbidden: 0, notFound: sees ? 0 : 1 } });
      expect(await statusOfVisit(c.visit)).toBe(sees ? "cancelled" : "booked");
    }
  });

  it("clients.show: a visit of a client the login is not shown is not in the list, not in the file and not cancelled", async () => {
    for (const all of [true, false]) {
      const c = await fresh("desk");
      // Anna came to Valentin; the login is shown Jevgeni's clients only
      await setValue(c.me, "clients.show", all ? "all" : [c.jev]);
      expect((await records.listRecordsAction(ALL)).total, "in the list").toBe(all ? 1 : 0);
      expect((await file()).headers.get("x-rows"), "in the file").toBe(all ? "1" : "0");
      expect((await records.openVisitAction(c.visit)) !== null, "the pencil").toBe(all);
      expect((await records.cancelRecordsAction([c.visit])), "cancelling").toMatchObject({ ok: true, cancelled: all ? 1 : 0 });
    }
  });

  it("visit.delete: «Отменить выбранные» asks the calendar's own right", async () => {
    for (const has of [true, false]) {
      const c = await fresh("desk");
      await grant(c.me, "visit.delete", has);
      expect(await records.cancelRecordsAction([c.visit])).toEqual({ ok: true, cancelled: has ? 1 : 0, refused: { already: 0, forbidden: has ? 0 : 1, notFound: 0 } });
    }
  });
});

describe("Сотрудники: «График работы»", () => {
  /** A day far enough ahead to have no visit on it. */
  const far = (c: Ctx, days = 40) => addDays(c.today, days);
  const off = (c: Ctx, staffId: string) => schedule.saveCellsAction({ cells: [{ staffId, date: far(c) }], kind: "off" });
  const template = (c: Ctx, staffIds: string[]) => schedule.templateAction({ staffIds, mode: "weekdays", dateFrom: far(c), dateTo: far(c, 46), weekdays: [1, 2, 3, 4, 5, 6, 7], from: "10:00", to: "19:00" });
  const copy = (c: Ctx, from: string, to: string[]) => schedule.copyAction({ fromStaffId: from, toStaffIds: to, dateFrom: c.today, dateTo: addDays(c.today, 6), breaks: true });
  const dated = async (staffId: string) => (await query("select 1 from staff_day_overrides where staff_id = $1 and day >= $2::date", [staffId, todayIn(TZ)])).length;

  both("staff.schedule", "desk", (c) => off(c, c.val), (r) => r.ok);
  both("staff.schedule", "desk", (c) => template(c, [c.val]), (r) => r.ok);
  both("staff.schedule", "desk", (c) => copy(c, c.val, [c.jev]), (r) => r.ok);

  it("journal.staff: a login changes only the days of the barbers it sees: a cell, a template, a copy from him, a copy to him", async () => {
    for (const sees of [true, false]) {
      const c = await fresh("desk");
      const before = { val: await dated(c.val), jev: await dated(c.jev) };
      // Jevgeni's column only, or everyone's
      await setValue(c.me, "journal.staff", sees ? "all" : [c.jev]);
      const NO = { ok: false, code: "forbidden" };
      const want = (r: unknown, what: string) => (sees ? expect(r, what).toMatchObject({ ok: true }) : expect(r, what).toEqual(NO));
      want(await off(c, c.val), "a cell of Valentin");
      want(await template(c, [c.jev, c.val]), "a template for both");
      want(await copy(c, c.val, [c.jev]), "a copy from Valentin");
      want(await copy(c, c.jev, [c.val]), "a copy to Valentin");
      if (!sees) {
        // nothing of Valentin's was written, and nothing of Jevgeni's by the refused ones
        expect(await dated(c.val)).toBe(before.val);
        expect(await dated(c.jev)).toBe(before.jev);
        // his own barber he still changes
        expect(await off(c, c.jev)).toMatchObject({ ok: true, written: 1 });
      }
    }
  });

  it("the refusal does not say whether a barber has visits: his day with a visit is «forbidden», not «has visits»", async () => {
    const c = await fresh("desk");
    await setValue(c.me, "journal.staff", [c.jev]);
    // the fixture's visit is Valentin's, tomorrow
    expect(await schedule.saveCellsAction({ cells: [{ staffId: c.val, date: c.tomorrow }], kind: "off" })).toEqual({ ok: false, code: "forbidden" });
    await setValue(c.me, "journal.staff", "all");
    expect(await schedule.saveCellsAction({ cells: [{ staffId: c.val, date: c.tomorrow }], kind: "off" })).toEqual({ ok: false, code: "visits", refused: [{ staffId: c.val, date: c.tomorrow, visits: 1 }] });
  });
});

describe("every right that works has a door test", () => {
  it("none is left out", () => {
    expect(RIGHTS.filter((r) => r.built && !covered.has(r.key)).map((r) => r.key)).toEqual([]);
  });
});

/* Found by the security review of the rights commit (19.11.2026): three doors that asked the right but not the scope. */
describe("what a login does not see stays closed", () => {
  it("a comment of a client the login is not shown is not deleted", async () => {
    for (const all of [true, false]) {
      const c = await fresh("desk");
      await grant(c.me, "clients.comments_delete_own", true);
      const mine = await addComment(c.demo.business, c.anna, "мой", { id: c.me, name: "Desk" });
      // Anna came to Valentin; the login is shown Jevgeni's clients only
      await setValue(c.me, "clients.show", all ? "all" : [c.jev]);
      expect(await clients.deleteCommentAction(c.anna, mine.ok ? mine.id : ""), all ? "shown" : "not shown").toBe(all);
      expect((await listComments(query, c.demo.business.id, c.anna)).length, "comments left").toBe(all ? 0 : 1);
    }
  });

  it("«этот телефон занят» names the client who has it only to a login that is shown him", async () => {
    for (const all of [true, false]) {
      const c = await fresh("desk");
      await setValue(c.me, "clients.show", all ? "all" : [c.jev]);
      const r = await clients.saveClientAction(null, { name: "Другая Анна", phone: PHONE });
      expect(r).toMatchObject({ ok: false, field: "phoneTaken" });
      expect(r.ok ? null : (r.clientId ?? null), all ? "named" : "not named").toBe(all ? c.anna : null);
    }
  });

  it("a barber's price request is answered only by a login that sees his column", { timeout: 120000 }, async () => {
    for (const sees of [true, false]) {
      const c = await fresh("barber");
      await grant(c.me, "services.staff", false);
      expect(await bTime.setPrice({ serviceId: c.demo.services.clip, priceCents: 3300, durationMin: 30 })).toMatchObject({ ok: true, status: "requested" });
      const [asked] = await query<{ id: string }>("select id from staff_requests where staff_id = $1 and status = 'requested'", [c.val]);
      // the front desk answers: it has the right to change a barber's services, and sees Valentin's column or only Jevgeni's
      await grant(c.desk, "services.staff", true);
      await setValue(c.desk, "journal.staff", sees ? "all" : [c.jev]);
      jar.cookies = { [SESSION_COOKIE]: await createSession(query, c.desk) };
      const r = await requests.answer(asked.id, "approved", "");
      expect(r.ok, sees ? "sees his column" : "does not see it").toBe(sees);
      if (!r.ok) expect(r.code).toBe("forbidden");
    }
  });
});
