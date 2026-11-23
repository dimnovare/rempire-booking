/**
 * The client base's list in full (src/lib/admin/client-filter.ts and the
 * list of src/lib/admin/clients.ts; the owner, 19.11.2026): every condition
 * on its own, two of them joined by «И» and by «Или», the three segments,
 * sorting by a column, the page sizes, and the search over the second
 * phone and the card number. Fake people only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { birthdaysAhead, cleanCond, cleanConds, COND_KINDS, condSql, condsSql, CONDS_MAX, segmentConds, SEGMENTS, type CondInput, type SqlCtx } from "@/lib/admin/client-filter";
import { clientWhere, listClients, saveClient, type ClientFilter, type ClientInput } from "@/lib/admin/clients";
import { adminCancelVisit, adminCreateVisit, adminSetStatus } from "@/lib/admin/visits";
import { closeDb, query } from "@/lib/db";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
// Monday 30.11.2026, noon in Tallinn
const TODAY = "2026-11-30";
const NOW = at(TODAY, "12:00");
const ACTOR = "test-admin";

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});
afterAll(closeDb);

async function add(input: ClientInput): Promise<string> {
  const r = await saveClient(demo.business, null, input, ACTOR);
  if (!r.ok) throw new Error(`client not added: ${r.field}`);
  return r.id;
}

let n = 0;
/**
 * A visit of this client; `force` books it whatever the hours, as the admin
 * may. With no time given each visit gets an hour of its own, so two clients
 * on one day never want the same chair at once.
 */
async function visit(clientId: string, staff: string, date: string, time?: string, service = "clip") {
  const hour = `${String(8 + (++n % 12)).padStart(2, "0")}:00`;
  const r = await adminCreateVisit(
    demo.business,
    { staffId: demo.staff[staff], start: at(date, time ?? hour), serviceIds: [demo.services[service]], clientId, idempotencyKey: `client-base-${n}-${Math.random()}`, force: true },
    ACTOR,
  );
  if (!r.ok) throw new Error(`booking failed: ${r.code}`);
  return r;
}

const list = (filter: ClientFilter) => listClients(query, demo.business.id, filter, NOW, TZ);
const names = async (filter: ClientFilter) => (await list(filter)).rows.map((r) => r.name);
/** Who one condition leaves, by name. */
const only = (cond: CondInput) => names({ conds: [cond] });

/**
 * Five clients who differ in everything a condition asks about:
 *   Anna   female, gold, «VIP», born 05.12.1990; came twice in November (Valentin, clip; Jevgeni, beard)
 *   Boris  male, «дети», born 14.03 (no year); a no-show on 24.11, a visit ahead on 08.12
 *   Carl   nothing set; his one visit was cancelled
 *   Dan    born 30.11.2000 (today), no online booking; no visits
 *   Eve    female, silver; came once, on 01.08 (Renat); a mass message was queued for her
 */
async function five() {
  const anna = await add({ name: "Anna Näidis", phone: "+372 5555 0101", gender: "female", importance: "gold", labels: ["VIP"], birthday: "05.12.1990" });
  const boris = await add({ name: "Boris Sample", phone: "+372 5555 0102", gender: "male", labels: ["дети"], birthday: "14.03" });
  const carl = await add({ name: "Carl Sample" });
  const dan = await add({ name: "Dan Sample", birthday: "30.11.2000", noOnline: true });
  const eve = await add({ name: "Eve Sample", gender: "female", importance: "silver" });
  const a1 = await visit(anna, "valentin", "2026-11-03"); // clip, 40 €
  const a2 = await visit(anna, "jevgeni", "2026-11-10", "12:00", "beard"); // 28 €
  await adminSetStatus(demo.business, a1.id, "done", ACTOR);
  await adminSetStatus(demo.business, a2.id, "arrived", ACTOR);
  const b1 = await visit(boris, "valentin", "2026-11-24");
  await adminSetStatus(demo.business, b1.id, "no_show", ACTOR);
  await visit(boris, "valentin", "2026-12-08");
  const c1 = await visit(carl, "valentin", "2026-11-17");
  await adminCancelVisit(demo.business, c1.id, ACTOR);
  const e1 = await visit(eve, "renat", "2026-08-01");
  await adminSetStatus(demo.business, e1.id, "done", ACTOR);
  await query("update clients set mass_sent_at = $2 where id = $1", [eve, new Date(NOW)]);
  return { anna, boris, carl, dan, eve, a1, a2, e1 };
}

describe("a condition is cleaned before it asks", () => {
  it("what is not whole, or not a condition at all, is none", () => {
    const bad: unknown[] = [
      null,
      "hasVisits",
      { kind: "nope", value: "yes" },
      { kind: "hasVisits", value: "maybe" },
      { kind: "hasVisits", value: "yes", from: "2026-02-30" },
      { kind: "visitStatus", value: "booked" },
      { kind: "visitCount", min: "", max: "" },
      { kind: "visitCount", min: "two" },
      { kind: "visitCount", min: "-1" },
      { kind: "period", from: "", to: "" },
      { kind: "period", from: "yesterday" },
      { kind: "barber", value: "" },
      { kind: "barber", value: "1 or 1=1" },
      { kind: "services", ids: [] },
      { kind: "services", ids: ["not-a-uuid"] },
      { kind: "services", ids: "all" },
      { kind: "serviceSum", min: "12,345" },
      { kind: "serviceSum", min: "ten" },
      { kind: "gender", value: "other" },
      { kind: "category", value: "  " },
      { kind: "sold" },
      { kind: "importance", value: "platinum" },
      { kind: "birthday", mode: "month", value: "13" },
      { kind: "birthday", mode: "month", value: "0" },
      { kind: "birthday", mode: "days", value: "400" },
      { kind: "birthday", mode: "week", value: "1" },
      { kind: "birthday", mode: "days", value: "" },
      { kind: "age", min: "200" },
      { kind: "massSent", value: "" },
      { kind: "noOnline", value: "1" },
    ];
    for (const b of bad) expect(cleanCond(b), JSON.stringify(b)).toBeNull();
    expect(cleanConds(bad)).toEqual([]);
    expect(cleanConds("hasVisits")).toEqual([]);
  });

  it("what is whole comes out typed: days as days, euros as cents, a range the right way round", () => {
    expect(cleanCond({ kind: "hasVisits", value: "no", from: "2026-11-10", to: "2026-11-01" })).toEqual({ kind: "hasVisits", has: false, from: "2026-11-01", to: "2026-11-10" });
    expect(cleanCond({ kind: "hasVisits", value: "yes" })).toEqual({ kind: "hasVisits", has: true, from: null, to: null });
    expect(cleanCond({ kind: "visitCount", min: " 5 ", max: "2" })).toEqual({ kind: "visitCount", min: 2, max: 5 });
    expect(cleanCond({ kind: "serviceSum", min: "25,5", max: "" })).toEqual({ kind: "serviceSum", min: 2550, max: null });
    expect(cleanCond({ kind: "sold", min: "", max: "1 200.05 €" })).toEqual({ kind: "sold", min: null, max: 120005 });
    expect(cleanCond({ kind: "birthday", mode: "days", value: "7" })).toEqual({ kind: "birthday", month: null, days: 7 });
    expect(cleanCond({ kind: "birthday", mode: "month", value: "3" })).toEqual({ kind: "birthday", month: 3, days: null });
    const id = "0b7c1f0e-8a52-4c0b-9d1e-3f2a6b7c8d90";
    expect(cleanCond({ kind: "services", ids: [id, id] })).toEqual({ kind: "services", ids: [id] });
    // every kind has a unit, and no more conditions than the limit are read
    expect(COND_KINDS).toHaveLength(15);
    expect(cleanConds(Array.from({ length: CONDS_MAX + 5 }, () => ({ kind: "massSent", value: "yes" })))).toHaveLength(CONDS_MAX);
  });

  it("a value never gets into the SQL text: it is a placeholder, and the value is kept beside it", () => {
    const params: unknown[] = [];
    const x: SqlCtx = { p: (v) => `$${params.push(v)}`, now: NOW, tz: TZ };
    const evil = "x'; drop table clients; --";
    const sql = condsSql(cleanConds([{ kind: "category", value: evil }, { kind: "gender", value: "male" }, { kind: "visitCount", min: "3" }]), "or", x);
    expect(sql).not.toContain("drop table");
    expect(sql).not.toContain("male");
    expect(sql).toMatch(/^ and \(\(\$1 = any\(c\.labels\)\) or \(c\.gender = \$2\) or \(.+ >= \$3\)\)\)$/);
    expect(params).toEqual([evil, "male", 3]);
    expect(condsSql([], "and", x)).toBe("");
    expect(condSql({ kind: "noOnline", value: true }, x)).toBe("c.no_online");
  });
});

describe("«По визитам»: each condition on its own", () => {
  it("has visits or has none, in all time or in some days", async () => {
    await five();
    // a cancelled visit is no visit; one ahead is
    expect(await only({ kind: "hasVisits", value: "yes" })).toEqual(["Anna Näidis", "Boris Sample", "Eve Sample"]);
    expect(await only({ kind: "hasVisits", value: "no" })).toEqual(["Carl Sample", "Dan Sample"]);
    expect(await only({ kind: "hasVisits", value: "yes", from: "2026-11-01", to: "2026-11-15" })).toEqual(["Anna Näidis"]);
    expect(await only({ kind: "hasVisits", value: "no", from: "2026-11-20" })).toEqual(["Anna Näidis", "Carl Sample", "Dan Sample", "Eve Sample"]);
    expect(await only({ kind: "hasVisits", value: "yes", to: "2026-08-31" })).toEqual(["Eve Sample"]);
    // a day is whole: the last day of a period holds its visits, the day after it does not
    expect(await only({ kind: "hasVisits", value: "yes", from: "2026-11-10", to: "2026-11-10" })).toEqual(["Anna Näidis"]);
    expect(await only({ kind: "hasVisits", value: "yes", from: "2026-11-11", to: "2026-11-23" })).toEqual([]);
  });

  it("the status of his visits: came, or did not come", async () => {
    await five();
    expect(await only({ kind: "visitStatus", value: "came" })).toEqual(["Anna Näidis", "Eve Sample"]);
    expect(await only({ kind: "visitStatus", value: "noShow" })).toEqual(["Boris Sample"]);
  });

  it("how many visits, as the column counts them", async () => {
    await five();
    expect(await only({ kind: "visitCount", min: "2" })).toEqual(["Anna Näidis", "Boris Sample"]);
    expect(await only({ kind: "visitCount", max: "0" })).toEqual(["Carl Sample", "Dan Sample"]);
    expect(await only({ kind: "visitCount", min: "1", max: "1" })).toEqual(["Eve Sample"]);
    const rows = (await list({ conds: [{ kind: "visitCount", min: "1" }] })).rows;
    expect(rows.map((r) => r.visits)).toEqual([2, 2, 1]);
  });

  it("visited between two days", async () => {
    await five();
    expect(await only({ kind: "period", from: "2026-12-01", to: "2026-12-31" })).toEqual(["Boris Sample"]);
    expect(await only({ kind: "period", from: "2026-11-01", to: "2026-11-30" })).toEqual(["Anna Näidis", "Boris Sample"]);
    expect(await only({ kind: "period", to: "2026-10-31" })).toEqual(["Eve Sample"]);
  });

  it("the barber", async () => {
    await five();
    expect(await only({ kind: "barber", value: demo.staff.jevgeni })).toEqual(["Anna Näidis"]);
    expect(await only({ kind: "barber", value: demo.staff.renat })).toEqual(["Eve Sample"]);
    expect(await only({ kind: "barber", value: demo.staff.valentin })).toEqual(["Anna Näidis", "Boris Sample"]);
  });

  it("the services: a visit with any of the chosen ones", async () => {
    await five();
    expect(await only({ kind: "services", ids: [demo.services.beard] })).toEqual(["Anna Näidis"]);
    expect(await only({ kind: "services", ids: [demo.services.beard, demo.services.clip] })).toEqual(["Anna Näidis", "Boris Sample", "Eve Sample"]);
    expect(await only({ kind: "services", ids: [demo.services.kid] })).toEqual([]);
  });

  it("the sum of his services: the visits that took place, by what the services cost", async () => {
    const { a1 } = await five();
    // a special-time extra is in the visit's total, not in what the service costs
    await query("update appointments set total_cents = total_cents + 500 where id = $1", [a1.id]);
    expect(await only({ kind: "serviceSum", min: "68", max: "68" })).toEqual(["Anna Näidis"]);
    expect(await only({ kind: "serviceSum", min: "69" })).toEqual([]);
    // a no-show and a visit ahead are worth nothing yet
    expect(await only({ kind: "serviceSum", max: "0" })).toEqual(["Boris Sample", "Carl Sample", "Dan Sample"]);
    expect(await only({ kind: "serviceSum", min: "0,01", max: "67.99" })).toEqual(["Eve Sample"]);
  });
});

describe("«По клиентам»: each condition on its own", () => {
  it("gender, category and importance class", async () => {
    await five();
    expect(await only({ kind: "gender", value: "female" })).toEqual(["Anna Näidis", "Eve Sample"]);
    expect(await only({ kind: "gender", value: "male" })).toEqual(["Boris Sample"]);
    expect(await only({ kind: "gender", value: "none" })).toEqual(["Carl Sample", "Dan Sample"]);
    expect(await only({ kind: "category", value: "VIP" })).toEqual(["Anna Näidis"]);
    expect(await only({ kind: "category", value: "дети" })).toEqual(["Boris Sample"]);
    expect(await only({ kind: "category", value: "x'; drop table clients; --" })).toEqual([]);
    expect(await query("select 1 from clients")).toHaveLength(5);
    expect(await only({ kind: "importance", value: "gold" })).toEqual(["Anna Näidis"]);
    expect(await only({ kind: "importance", value: "silver" })).toEqual(["Eve Sample"]);
    expect(await only({ kind: "importance", value: "none" })).toEqual(["Boris Sample", "Carl Sample", "Dan Sample"]);
  });

  it("sold: the «Продано» column", async () => {
    const { a1 } = await five();
    await query("update appointments set total_cents = total_cents + 500 where id = $1", [a1.id]);
    expect(await only({ kind: "sold", min: "73" })).toEqual(["Anna Näidis"]);
    expect(await only({ kind: "sold", max: "0" })).toEqual(["Boris Sample", "Carl Sample", "Dan Sample"]);
    const rows = (await list({ conds: [{ kind: "sold", min: "1" }] })).rows;
    expect(rows.map((r) => [r.name, r.soldCents])).toEqual([
      ["Anna Näidis", 7300],
      ["Eve Sample", rows[1].soldCents],
    ]);
    expect(rows[1].soldCents).toBeGreaterThan(0);
  });

  it("the birthday: a month, or in the next N days", async () => {
    await five();
    expect(await only({ kind: "birthday", mode: "month", value: "12" })).toEqual(["Anna Näidis"]);
    expect(await only({ kind: "birthday", mode: "month", value: "3" })).toEqual(["Boris Sample"]);
    // today is 30.11: Dan today, Anna in five days
    expect(await only({ kind: "birthday", mode: "days", value: "0" })).toEqual(["Dan Sample"]);
    expect(await only({ kind: "birthday", mode: "days", value: "4" })).toEqual(["Dan Sample"]);
    expect(await only({ kind: "birthday", mode: "days", value: "5" })).toEqual(["Anna Näidis", "Dan Sample"]);
    // over the new year, to the middle of March
    expect(await only({ kind: "birthday", mode: "days", value: "104" })).toEqual(["Anna Näidis", "Boris Sample", "Dan Sample"]);
    expect(await only({ kind: "birthday", mode: "days", value: "103" })).toEqual(["Anna Näidis", "Dan Sample"]);
  });

  it("29 February: in a year without one, that birthday counts on the 28th", () => {
    const pairs = (b: { months: number[]; days: number[] }) => b.months.map((m, i) => `${b.days[i]}.${m}`);
    expect(pairs(birthdaysAhead("2027-02-27", 2))).toEqual(["27.2", "28.2", "29.2", "1.3"]);
    expect(pairs(birthdaysAhead("2028-02-27", 2))).toEqual(["27.2", "28.2", "29.2"]);
    expect(pairs(birthdaysAhead("2026-12-31", 1))).toEqual(["31.12", "1.1"]);
  });

  it("the age: whole years today; a client whose year is not known is left out", async () => {
    await five();
    // Anna turns 36 on 05.12, so she is 35 today; Dan is 26 from this morning
    expect(await only({ kind: "age", min: "30" })).toEqual(["Anna Näidis"]);
    expect(await only({ kind: "age", max: "26" })).toEqual(["Dan Sample"]);
    expect(await only({ kind: "age", min: "26", max: "35" })).toEqual(["Anna Näidis", "Dan Sample"]);
    expect(await only({ kind: "age", min: "36" })).toEqual([]);
    expect(await only({ kind: "age", min: "0" })).toEqual(["Anna Näidis", "Dan Sample"]);
    // a week later she has had her birthday
    expect((await listClients(query, demo.business.id, { conds: [{ kind: "age", min: "36" }] }, at("2026-12-07", "12:00"), TZ)).rows.map((r) => r.name)).toEqual(["Anna Näidis"]);
  });

  it("received a mass message; no online booking", async () => {
    await five();
    expect(await only({ kind: "massSent", value: "yes" })).toEqual(["Eve Sample"]);
    expect(await only({ kind: "massSent", value: "no" })).toEqual(["Anna Näidis", "Boris Sample", "Carl Sample", "Dan Sample"]);
    expect(await only({ kind: "noOnline", value: "yes" })).toEqual(["Dan Sample"]);
    expect(await only({ kind: "noOnline", value: "no" })).toEqual(["Anna Näidis", "Boris Sample", "Carl Sample", "Eve Sample"]);
  });
});

describe("several conditions", () => {
  it("joined by «И» every one must hold, by «Или» any one", async () => {
    await five();
    const two: CondInput[] = [
      { kind: "gender", value: "female" },
      { kind: "visitCount", min: "2" },
    ];
    expect(await names({ conds: two })).toEqual(["Anna Näidis"]);
    expect(await names({ conds: two, join: "and" })).toEqual(["Anna Näidis"]);
    expect(await names({ conds: two, join: "or" })).toEqual(["Anna Näidis", "Boris Sample", "Eve Sample"]);
    // one from each dropdown
    const mixed: CondInput[] = [
      { kind: "visitStatus", value: "noShow" },
      { kind: "importance", value: "gold" },
    ];
    expect(await names({ conds: mixed, join: "and" })).toEqual([]);
    expect(await names({ conds: mixed, join: "or" })).toEqual(["Anna Näidis", "Boris Sample"]);
    // nonsense for the join is «И»
    expect(await names({ conds: two, join: "xor" })).toEqual(["Anna Näidis"]);
  });

  it("the search and the category still narrow whatever the conditions leave, «Или» too", async () => {
    await five();
    const either: CondInput[] = [
      { kind: "gender", value: "female" },
      { kind: "gender", value: "male" },
    ];
    expect(await names({ conds: either, join: "or" })).toEqual(["Anna Näidis", "Boris Sample", "Eve Sample"]);
    expect(await names({ conds: either, join: "or", q: "sample" })).toEqual(["Boris Sample", "Eve Sample"]);
    expect(await names({ conds: either, join: "or", label: "VIP" })).toEqual(["Anna Näidis"]);
    const found = await list({ conds: either, join: "or", q: "sample" });
    expect([found.total, found.pages]).toEqual([2, 1]);
    // a condition that is not whole is left out, the others still hold
    expect(await names({ conds: [{ kind: "barber", value: "" }, { kind: "gender", value: "male" }] })).toEqual(["Boris Sample"]);
  });

  it("only this business's clients, whatever is asked", async () => {
    await five();
    const [other] = await query<{ id: string }>("insert into businesses (slug, name) values ('other-salon', 'Other') returning id");
    await query("insert into clients (business_id, name, gender) values ($1, 'Their Client', 'female')", [other.id]);
    expect(await only({ kind: "hasVisits", value: "no" })).toEqual(["Carl Sample", "Dan Sample"]);
    expect(await names({ conds: [{ kind: "gender", value: "female" }, { kind: "hasVisits", value: "no" }], join: "or" })).toEqual(["Anna Näidis", "Carl Sample", "Dan Sample", "Eve Sample"]);
    expect(clientWhere(demo.business.id, { conds: [{ kind: "gender", value: "female" }], join: "or" }, NOW, TZ).where).toMatch(/^c\.business_id = \$1 and c\.merged_into is null and c\.anonymised_at is null and \(/);
  });
});

describe("the segments", () => {
  /**
   *   Nina   first visit 03.11                       new
   *   Nora   first visit 31.10, 30 days ago          new (the first day that counts)
   *   Rita   01.09 and 20.11                          returning
   *   Lena   01.08 only                               lost
   *   Lars   01.08 and one ahead on 10.12             not lost: he is coming
   *   Olga   30.10 only, 31 days ago                  in no segment yet
   *   Zero   no visits                                in no segment
   */
  async function seven() {
    const mk = async (name: string, dates: string[]) => {
      const id = await add({ name });
      for (const d of dates) await visit(id, "valentin", d);
      return id;
    };
    await mk("Nina New", ["2026-11-03"]);
    await mk("Nora New", ["2026-10-31"]);
    await mk("Rita Returning", ["2026-09-01", "2026-11-20"]);
    await mk("Lena Lost", ["2026-08-01"]);
    await mk("Lars Coming", ["2026-08-01", "2026-12-10"]);
    await mk("Olga Between", ["2026-10-30"]);
    await mk("Zero Visits", []);
  }
  const seg = (s: (typeof SEGMENTS)[number]) => names({ conds: segmentConds(s, TODAY), join: "and" });

  it("new: a first visit in the last 30 days", async () => {
    await seven();
    expect(await seg("new")).toEqual(["Nina New", "Nora New"]);
  });

  it("returning: a visit in the last 30 days and one before them", async () => {
    await seven();
    expect(await seg("returning")).toEqual(["Rita Returning"]);
  });

  it("lost: has visits, none in the last 60 days and none ahead", async () => {
    await seven();
    expect(await seg("lost")).toEqual(["Lena Lost"]);
    // a cancelled visit ahead does not bring him back
    const [lena] = (await list({ q: "Lena" })).rows;
    const ahead = await visit(lena.id, "valentin", "2026-12-15");
    expect(await seg("lost")).toEqual([]);
    await adminCancelVisit(demo.business, ahead.id, ACTOR);
    expect(await seg("lost")).toEqual(["Lena Lost"]);
  });

  it("a segment is conditions of the list and nothing else: each is whole, and they are filled in for today", () => {
    for (const s of SEGMENTS) {
      const conds = segmentConds(s, TODAY);
      expect(conds.length).toBe(2);
      expect(cleanConds(conds)).toHaveLength(2);
      expect(conds.every((c) => c.kind === "hasVisits")).toBe(true);
    }
    expect(segmentConds("new", TODAY)).toEqual([
      { kind: "hasVisits", value: "yes", from: "2026-10-31", to: "2026-11-30" },
      { kind: "hasVisits", value: "no", from: "", to: "2026-10-30" },
    ]);
    expect(segmentConds("lost", TODAY)[1]).toEqual({ kind: "hasVisits", value: "no", from: "2026-10-01", to: "" });
  });
});

describe("sorting, the page size, the search", () => {
  it("by a column, either way; a client with no visit comes last by a visit's date", async () => {
    await five();
    const by = (sort: string, dir?: string) => names({ sort, dir });
    expect(await by("name")).toEqual(["Anna Näidis", "Boris Sample", "Carl Sample", "Dan Sample", "Eve Sample"]);
    expect(await by("name", "desc")).toEqual(["Eve Sample", "Dan Sample", "Carl Sample", "Boris Sample", "Anna Näidis"]);
    // ties go by name
    expect(await by("visits", "desc")).toEqual(["Anna Näidis", "Boris Sample", "Eve Sample", "Carl Sample", "Dan Sample"]);
    expect(await by("visits", "asc")).toEqual(["Carl Sample", "Dan Sample", "Eve Sample", "Anna Näidis", "Boris Sample"]);
    expect((await by("sold", "desc")).slice(0, 2)).toEqual(["Anna Näidis", "Eve Sample"]);
    // the last visit that has begun: Boris 24.11, Anna 10.11, Eve 01.08
    expect(await by("last", "desc")).toEqual(["Boris Sample", "Anna Näidis", "Eve Sample", "Carl Sample", "Dan Sample"]);
    expect(await by("last", "asc")).toEqual(["Eve Sample", "Anna Näidis", "Boris Sample", "Carl Sample", "Dan Sample"]);
    expect(await by("first", "asc")).toEqual(["Eve Sample", "Anna Näidis", "Boris Sample", "Carl Sample", "Dan Sample"]);
    expect(await by("first", "desc")).toEqual(["Boris Sample", "Anna Näidis", "Eve Sample", "Carl Sample", "Dan Sample"]);
    // a column that is none, or a direction that is none: by name, A to Z
    expect(await by("phone; drop table clients", "sideways")).toEqual(["Anna Näidis", "Boris Sample", "Carl Sample", "Dan Sample", "Eve Sample"]);
    // the order holds with a condition too
    expect(await names({ sort: "name", dir: "desc", conds: [{ kind: "hasVisits", value: "yes" }] })).toEqual(["Eve Sample", "Boris Sample", "Anna Näidis"]);
  });

  it("10, 25, 50 or 100 a page; anything else is 25", async () => {
    for (let i = 1; i <= 30; i++) await add({ name: `Sample ${String(i).padStart(2, "0")}` });
    const ten = await list({ size: 10, page: 3 });
    expect([ten.size, ten.total, ten.page, ten.pages, ten.rows.length, ten.rows[0].name]).toEqual([10, 30, 3, 3, 10, "Sample 21"]);
    const fifty = await list({ size: 50 });
    expect([fifty.size, fifty.pages, fifty.rows.length]).toEqual([50, 1, 30]);
    expect((await list({ size: 100 })).size).toBe(100);
    for (const size of [7, 0, 1000, Number.NaN]) expect((await list({ size })).size).toBe(25);
    expect((await list({})).rows).toHaveLength(25);
    // a page past the end of a smaller page size is its last
    expect((await list({ size: 10, page: 9 })).page).toBe(3);
  });

  it("the search also reads the second phone and the card number; each row has its discount", async () => {
    await add({ name: "Anna Näidis", phone: "+372 5555 0101", phone2: "+372 5555 0777", cardNo: "GOLD-0042", discountPct: 15 });
    await add({ name: "Boris Sample", phone: "+372 5555 0102" });
    expect(await names({ q: "5555 0777" })).toEqual(["Anna Näidis"]);
    expect(await names({ q: "gold-00" })).toEqual(["Anna Näidis"]);
    expect(await names({ q: "0042" })).toEqual(["Anna Näidis"]);
    expect(await names({ q: "5555 01" })).toEqual(["Anna Näidis", "Boris Sample"]);
    expect((await list({})).rows.map((r) => r.discountPct)).toEqual([15, 0]);
  });
});
