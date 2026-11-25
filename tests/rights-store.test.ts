/**
 * A login's rights in the database (src/lib/auth/rights-store.ts): saving a
 * whole set and its four rules, the role that follows the preset, copying
 * from another login, who may add a login, and the history. Fake people
 * only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { can, normalizeRights, type StoredRights } from "@/lib/auth/rights";
import { presetRights } from "@/lib/auth/rights-catalogue";
import { listRightsHistory, loadHolder, loadRights, mayAddLogin, rightsToCopy, saveRights, startingSet, writeStartingSet } from "@/lib/auth/rights-store";
import { closeDb, query } from "@/lib/db";
import { freshDemo, type Demo } from "./helpers";

let demo: Demo;
let owner: string;
let desk: string;
let val: string;
let jev: string;

const add = async (email: string, role: string, staff: string | null = null, name = "") =>
  (await query<{ id: string }>("insert into users (business_id, email, name, role, staff_id) values ($1, $2, $3, $4, $5) returning id", [demo.business.id, email, name, role, staff ? demo.staff[staff] : null]))[0].id;
const holder = async (id: string) => (await loadHolder(query, demo.business.id, id))!;
const setOf = async (id: string) => (await loadRights(query, demo.business.id, id))!;
const roleOf = async (id: string) => (await query<{ role: string }>("select role from users where id = $1", [id]))[0].role;
/** The set with some switches taken off and some put on. */
const change = (s: StoredRights, o: { on?: string[]; off?: string[]; values?: StoredRights["values"]; preset?: StoredRights["preset"] } = {}) => ({
  preset: o.preset ?? s.preset,
  on: [...s.on.filter((k) => !(o.off ?? []).includes(k)), ...(o.on ?? [])],
  values: { ...s.values, ...(o.values ?? {}) },
});
const save = async (by: string, target: string, o: Parameters<typeof change>[1]) => saveRights(demo.business, await holder(by), target, change(await setOf(target), o));
const audits = (id: string) => query<{ actor: string; before: unknown; after: { on: string[]; off: string[]; values: Record<string, unknown>; preset: string; role: string } }>("select actor, before, after from audit where entity = 'user' and action = 'rights' and entity_id = $1 order by id", [id]);

beforeEach(async () => {
  demo = await freshDemo();
  await query("delete from users where business_id = $1 and email like '%@example.test'", [demo.business.id]).catch(() => []);
  owner = await add("owner@example.test", "owner", null, "Owner");
  desk = await add("desk@example.test", "admin", null, "Desk");
  val = await add("valentin@example.test", "staff", "valentin", "Valentin");
  jev = await add("jevgeni@example.test", "staff", "jevgeni", "Jevgeni");
});
afterAll(closeDb);

describe("saving a login's rights", () => {
  it("only a login that holds «Управлять правами пользователей» saves", async () => {
    expect(await save(desk, val, { off: ["journal.phones"] })).toEqual({ ok: false, code: "forbidden" });
    expect(await save(val, val, { on: ["clients.export"] })).toEqual({ ok: false, code: "forbidden" });
    expect((await setOf(val)).on).toContain("journal.phones");
  });

  it("the owner switches a barber's right off and on; each save is one audit row with the keys", async () => {
    expect(await save(owner, val, { off: ["journal.phones"] })).toEqual({ ok: true, role: "staff", changed: true });
    expect(can(await holder(val), "journal.phones")).toBe(false);
    expect(can(await holder(jev), "journal.phones")).toBe(true);
    expect(await save(owner, val, { on: ["journal.phones"] })).toMatchObject({ ok: true, changed: true });
    expect(can(await holder(val), "journal.phones")).toBe(true);
    const rows = await audits(val);
    expect(rows.map((r) => [r.actor, r.after.on, r.after.off])).toEqual([
      [owner, [], ["journal.phones"]],
      [owner, ["journal.phones"], []],
    ]);
  });

  it("nothing changed: nothing written", async () => {
    expect(await save(owner, val, {})).toEqual({ ok: true, role: "staff", changed: false });
    expect(await audits(val)).toEqual([]);
  });

  it("a value is saved and told in the history", async () => {
    expect(await save(owner, val, { values: { "journal.history": 7 } })).toMatchObject({ ok: true, changed: true });
    expect((await setOf(val)).values["journal.history"]).toBe(7);
    const [h] = await listRightsHistory(query, demo.business.id, val);
    expect(h).toMatchObject({ by: "Owner", on: [], off: [], values: ["journal.history"] });
  });

  it("a child goes with its parent, and the history says both", async () => {
    await save(owner, desk, { off: ["visit.edit"] });
    const s = await setOf(desk);
    expect(s.on).not.toContain("visit.edit.arrived");
    expect(s.on).not.toContain("visit.edit.staff_time");
    const [row] = await audits(desk);
    expect(row.after.off).toEqual(expect.arrayContaining(["visit.edit", "visit.edit.arrived", "visit.edit.staff_time", "visit.edit.comment", "visit.edit.services"]));
  });

  it("the role follows the preset: «Владелец» the owner's side, «Специалист» the barber app, the rest the salon's", async () => {
    // a barber becomes the front desk, by the role's own defaults
    expect(await saveRights(demo.business, await holder(owner), val, { preset: "AD", ...presetRights("AD") })).toMatchObject({ ok: true, role: "admin" });
    expect(await roleOf(val)).toBe("admin");
    expect((await setOf(val)).preset).toBe("AD");
    // …a manager, an owner, and a barber again
    expect(await saveRights(demo.business, await holder(owner), val, { preset: "MG", ...presetRights("MG") })).toMatchObject({ ok: true, role: "admin" });
    expect(await saveRights(demo.business, await holder(owner), val, { preset: "OW", ...presetRights("OW") })).toMatchObject({ ok: true, role: "owner" });
    expect(await saveRights(demo.business, await holder(owner), val, { preset: "SP", ...presetRights("SP") })).toMatchObject({ ok: true, role: "staff" });
    expect(await roleOf(val)).toBe("staff");
    // a login that is no barber cannot open the barber app as one
    expect(await saveRights(demo.business, await holder(owner), desk, { preset: "SP", ...presetRights("SP") })).toEqual({ ok: false, code: "needs_barber" });
    expect(await saveRights(demo.business, await holder(owner), desk, { preset: "XX", on: [], values: {} })).toEqual({ ok: false, code: "preset" });
    expect(await saveRights(demo.business, await holder(owner), "no-such-id", { preset: "AD", on: [] })).toEqual({ ok: false, code: "not_found" });
  });

  it("nobody takes away his own right to manage rights", async () => {
    expect(await save(owner, owner, { off: ["settings.users.rights"] })).toEqual({ ok: false, code: "own_right" });
    // …nor by switching off what it is nested under, or its whole group
    expect(await save(owner, owner, { off: ["settings.users"] })).toEqual({ ok: false, code: "own_right" });
    expect(await save(owner, owner, { off: ["group:settings"] })).toEqual({ ok: false, code: "own_right" });
    // his other rights are his to change
    expect(await save(owner, owner, { off: ["clients.export"] })).toMatchObject({ ok: true, changed: true });
  });

  it("the last owner stays an owner", async () => {
    expect(await saveRights(demo.business, await holder(owner), owner, { preset: "MG", ...presetRights("MG"), on: [...presetRights("MG").on] })).toEqual({ ok: false, code: "last_owner" });
    expect(await roleOf(owner)).toBe("owner");
    // with a second owner the first may step down
    const second = await add("second@example.test", "owner");
    expect(await saveRights(demo.business, await holder(second), owner, { preset: "MG", ...presetRights("MG") })).toMatchObject({ ok: true, role: "admin" });
    expect(await roleOf(owner)).toBe("admin");
    // and now the second is the last
    expect(await saveRights(demo.business, await holder(second), second, { preset: "MG", ...presetRights("MG") })).toEqual({ ok: false, code: "last_owner" });
  });
});

describe("a login that is not an owner hands out only what it holds", () => {
  /** The front desk, given the logins and their rights by the owner. */
  const manager = async () => {
    expect(await save(owner, desk, { on: ["settings.users", "settings.users.rights", "settings.users.invite"] })).toMatchObject({ ok: true });
    return desk;
  };

  it("what it holds, it gives; what it lacks, it cannot", async () => {
    const m = await manager();
    // the barber gets the services of the visit: the front desk has that right
    expect(await save(m, val, { on: ["visit.edit.services"] })).toMatchObject({ ok: true, changed: true });
    // the export is the owner's: not the front desk's to give
    expect(await save(m, val, { on: ["clients.export"] })).toEqual({ ok: false, code: "beyond", keys: ["clients.export"] });
    // the group's switch the front desk has; the salon's own settings inside it, it has not
    expect(await save(m, val, { on: ["group:settings", "settings.system", "clients.export"] })).toEqual({ ok: false, code: "beyond", keys: ["clients.export", "settings.system"] });
    expect((await setOf(val)).on).not.toContain("clients.export");
  });

  it("taking away needs nothing, and what the other already has stays his", async () => {
    const m = await manager();
    // the owner gave the barber the export; the manager, who lacks it, changes another switch
    await save(owner, val, { on: ["clients.export"] });
    expect(await save(m, val, { off: ["journal.phones"] })).toMatchObject({ ok: true, changed: true });
    expect((await setOf(val)).on).toContain("clients.export");
    // and may take it away
    expect(await save(m, val, { off: ["clients.export"] })).toMatchObject({ ok: true, changed: true });
  });

  it("a value no wider than its own", async () => {
    const m = await manager();
    // the manager sees one barber's column only
    await save(owner, m, { values: { "journal.staff": [demo.staff.valentin], "journal.history": 7 } });
    expect(await save(m, jev, { values: { "journal.staff": "all" } })).toEqual({ ok: false, code: "beyond", keys: ["journal.staff"] });
    expect(await save(m, jev, { values: { "journal.staff": [demo.staff.valentin, demo.staff.jevgeni] } })).toEqual({ ok: false, code: "beyond", keys: ["journal.staff"] });
    expect(await save(m, jev, { values: { "journal.staff": [demo.staff.valentin] } })).toMatchObject({ ok: true });
    expect(await save(m, jev, { values: { "journal.history": 30 } })).toEqual({ ok: false, code: "beyond", keys: ["journal.history"] });
    expect(await save(m, jev, { values: { "journal.history": 3 } })).toMatchObject({ ok: true });
  });

  it("an owner's login, and making an owner, are an owner's alone", async () => {
    const m = await manager();
    expect(await save(m, owner, { off: ["clients.export"] })).toEqual({ ok: false, code: "owner_only" });
    expect(await saveRights(demo.business, await holder(m), val, { preset: "OW", ...presetRights("OW") })).toEqual({ ok: false, code: "owner_only" });
  });

  it("a right whose function we do not have is not counted: a role's preset can be applied", async () => {
    const m = await manager();
    // «Только просмотр» for a barber's login made a front-desk one: its working rights are all the manager's
    await query("update users set staff_id = $2 where id = $1", [jev, demo.staff.jevgeni]);
    const r = await saveRights(demo.business, await holder(m), jev, { preset: "VW", ...presetRights("VW") });
    expect(r).toMatchObject({ ok: true, role: "admin" });
    expect((await setOf(jev)).on).toContain("reports.dashboard");
  });

  it("who may add a login: an owner anyone; anyone else no owner, and only a role whose start he holds whole", async () => {
    const m = await holder(await manager());
    const o = await holder(owner);
    expect(await mayAddLogin(query, demo.business.id, o, "owner", null)).toBe(true);
    expect(await mayAddLogin(query, demo.business.id, m, "owner", null)).toBe(false);
    expect(await mayAddLogin(query, demo.business.id, m, "staff", demo.staff.valentin)).toBe(true);
    expect(await mayAddLogin(query, demo.business.id, m, "admin", null)).toBe(true);
    // without the right to a barber's services he cannot add a login that would have it
    await query("update businesses set settings = settings || $2::jsonb where id = $1", [demo.business.id, JSON.stringify({ barber_self_price: "now" })]);
    await save(owner, desk, { off: ["services.staff"] });
    expect(await mayAddLogin(query, demo.business.id, await holder(desk), "staff", demo.staff.valentin)).toBe(false);
  });

  it("«Новый вход» with one of the eight roles: the old three start as before, the other five with their preset", async () => {
    const o = await holder(owner);
    const m = await holder(await manager());
    const sp = (await startingSet(query, demo.business.id, o, "SP", demo.staff.valentin))!;
    expect(sp.preset).toBe("SP");
    expect(sp.values["journal.staff"]).toEqual([demo.staff.valentin]);
    const vw = (await startingSet(query, demo.business.id, o, "VW", null))!;
    expect(vw).toEqual(normalizeRights({ preset: "VW", ...presetRights("VW") }));
    // nobody but an owner starts an owner; a manager hands out a viewer
    expect(await startingSet(query, demo.business.id, m, "OW", null)).toBeNull();
    expect(await startingSet(query, demo.business.id, m, "VW", null)).not.toBeNull();
    // and the set is what the new login then has
    const [u] = await query<{ id: string }>("insert into users (business_id, email, role) values ($1, 'viewer-new@example.test', 'admin') returning id", [demo.business.id]);
    await writeStartingSet(query, demo.business.id, u.id, vw);
    expect((await setOf(u.id)).preset).toBe("VW");
  });
});

describe("«Скопировать права»", () => {
  it("copies the whole set; «his own column» becomes the other barber's own", async () => {
    await save(owner, val, { off: ["journal.phones"], values: { "journal.history": 14 } });
    const got = (await rightsToCopy(query, demo.business.id, val, jev))!;
    const src = await setOf(val);
    expect([...got.on].sort()).toEqual([...src.on].sort());
    expect(got.on).not.toContain("journal.phones");
    expect(got.values["journal.history"]).toBe(14);
    expect(got.values["journal.staff"]).toEqual([demo.staff.jevgeni]);
    expect(got.values["clients.show"]).toEqual([demo.staff.jevgeni]);
    // nothing is written until it is saved
    expect((await setOf(jev)).on).toContain("journal.phones");
    expect(await saveRights(demo.business, await holder(owner), jev, got)).toMatchObject({ ok: true, role: "staff", changed: true });
    expect(can(await holder(jev), "journal.phones")).toBe(false);
    expect(can(await holder(jev), "journal.staff", { staffId: demo.staff.jevgeni })).toBe(true);
    expect(can(await holder(jev), "journal.staff", { staffId: demo.staff.valentin })).toBe(false);
  });

  it("from the front desk to a barber: everyone's columns, as the source has", async () => {
    const got = (await rightsToCopy(query, demo.business.id, desk, val))!;
    expect(got.preset).toBe("AD");
    expect(got.values["journal.staff"]).toBe("all");
  });

  it("from or to a login that is not there: nothing", async () => {
    const other = "99999999-9999-4999-8999-999999999999";
    expect(await rightsToCopy(query, demo.business.id, other, val)).toBeNull();
    expect(await rightsToCopy(query, demo.business.id, val, other)).toBeNull();
  });
});

describe("the history", () => {
  it("lists a login's saves, newest first, with who and what; only this business's, only this login's", async () => {
    await save(owner, val, { off: ["journal.phones"] });
    await save(owner, val, { on: ["journal.phones"], off: ["journal.stats"] });
    await save(owner, jev, { off: ["journal.move"] });
    const h = await listRightsHistory(query, demo.business.id, val);
    expect(h.map((x) => [x.by, x.on, x.off])).toEqual([
      ["Owner", ["journal.phones"], ["journal.stats"]],
      ["Owner", [], ["journal.phones"]],
    ]);
    expect(h[0].at).toBeGreaterThan(0);
    expect(await listRightsHistory(query, "99999999-9999-4999-8999-999999999999", val)).toEqual([]);
    expect(await listRightsHistory(query, demo.business.id, "nope")).toEqual([]);
  });

  it("a change of role says both roles", async () => {
    await saveRights(demo.business, await holder(owner), desk, { preset: "MG", ...presetRights("MG") });
    const [h] = await listRightsHistory(query, demo.business.id, desk);
    expect(h).toMatchObject({ presetFrom: "AD", presetTo: "MG" });
  });
});
