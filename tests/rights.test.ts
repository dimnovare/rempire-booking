/**
 * The one door (src/lib/auth/rights.ts): can() with group switches, nested
 * rights, rights with a value and with a period, rights we have no function
 * for; the set as it is stored; what changed between two sets; and what is
 * shown instead of a hidden phone.
 */
import { describe, expect, it } from "vitest";
import { can, canGroup, countOn, diffRights, historyFrom, maskEmail, maskPhone, normalizeRights, seenClients, seenStaff, toRights, valueWithin, type Holder } from "@/lib/auth/rights";
import { groupKey, presetRights, type RightValue } from "@/lib/auth/rights-catalogue";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const TODAY = "2026-11-19";

/** A login with exactly these switches on (group switches by name) and these values. */
function who(on: string[], values: Record<string, RightValue> = {}, role: Holder["role"] = "admin"): Holder {
  return { role, staffId: null, rights: toRights(normalizeRights({ preset: "AD", on, values })) };
}
const J = groupKey("journal");
const V = groupKey("visit");
const C = groupKey("clients");

describe("can()", () => {
  it("nobody and an empty set may nothing", () => {
    expect(can(null, "journal.phones")).toBe(false);
    expect(can(undefined, "visit.create")).toBe(false);
    expect(can(who([]), "journal.phones")).toBe(false);
  });

  it("a right needs its group's switch", () => {
    expect(can(who([J, "journal.phones"]), "journal.phones")).toBe(true);
    // stored as asked for, a right under a group that is off is dropped
    expect(can(who(["journal.phones"]), "journal.phones")).toBe(false);
    // and the door itself refuses it even if such a set got in
    const forged: Holder = { role: "admin", staffId: null, rights: { preset: "AD", on: new Set(["journal.phones"]), values: {} } };
    expect(can(forged, "journal.phones")).toBe(false);
    expect(canGroup(who([J]), "journal")).toBe(true);
    expect(canGroup(who([V]), "journal")).toBe(false);
  });

  it("a single right needs no group", () => {
    expect(can(who(["single.bulk_sms"]), "single.bulk_sms")).toBe(true);
    expect(can(who([J]), "single.bulk_sms")).toBe(false);
  });

  it("a child is off when its parent is off, however deep", () => {
    expect(can(who([V, "visit.edit", "visit.edit.arrived"]), "visit.edit.arrived")).toBe(true);
    expect(can(who([V, "visit.edit.arrived"]), "visit.edit.arrived")).toBe(false);
    expect(can(who([V, "visit.client_list", "visit.client_list.phones"]), "visit.client_list.phones")).toBe(true);
    expect(can(who([V, "visit.client_list.phones"]), "visit.client_list.phones")).toBe(false);
    // a set that was not normalized: the door still walks up to the top
    const forged: Holder = { role: "admin", staffId: null, rights: { preset: "AD", on: new Set([V, "visit.edit.arrived"]), values: {} } };
    expect(can(forged, "visit.edit.arrived")).toBe(false);
    const whole: Holder = { ...forged, rights: { ...forged.rights, on: new Set([V, "visit.edit", "visit.edit.arrived"]) } };
    expect(can(whole, "visit.edit.arrived")).toBe(true);
  });

  it("a right whose function we do not have is never yes, on or off", () => {
    const owner: Holder = { role: "owner", staffId: null, rights: toRights(normalizeRights({ preset: "OW", ...presetRights("OW") })) };
    expect(owner.rights.on.has("finance.flow")).toBe(true);
    expect(can(owner, "finance.flow")).toBe(false);
    expect(can(owner, "visit.pay")).toBe(false);
    expect(can(owner, "visit.edit.price")).toBe(false);
    expect(canGroup(owner, "finance")).toBe(false);
    // while what we have is yes
    expect(can(owner, "visit.edit.staff_time")).toBe(true);
  });

  it("whose columns: all, the chosen barbers, nobody", () => {
    const all = who([J], { "journal.staff": "all" });
    expect(can(all, "journal.staff", { staffId: A })).toBe(true);
    expect(seenStaff(all)).toBe("all");
    const one = who([J], { "journal.staff": [A] });
    expect(can(one, "journal.staff", { staffId: A })).toBe(true);
    expect(can(one, "journal.staff", { staffId: B })).toBe(false);
    expect(seenStaff(one)).toEqual([A]);
    // with no barber asked about, the right itself
    expect(can(one, "journal.staff")).toBe(true);
    const none = who([J], { "journal.staff": [] });
    expect(can(none, "journal.staff", { staffId: A })).toBe(false);
    // the group off: nobody's
    expect(seenStaff(who([V]))).toEqual([]);
    expect(can(who([V]), "journal.staff", { staffId: A })).toBe(false);
  });

  it("whose clients: all, or those of the chosen barbers", () => {
    const mine = who([C], { "clients.show": [A] });
    expect(can(mine, "clients.show", { staffIds: [B, A] })).toBe(true);
    expect(can(mine, "clients.show", { staffIds: [B] })).toBe(false);
    expect(seenClients(mine)).toEqual([A]);
    expect(seenClients(who([C], { "clients.show": "all" }))).toBe("all");
    expect(seenClients(who([J]))).toEqual([]);
  });

  it("how far back: no limit, so many days, no past days", () => {
    const free = who([J], { "journal.history": null });
    expect(historyFrom(free, TODAY)).toBeNull();
    expect(can(free, "journal.history", { date: "2020-01-01", today: TODAY })).toBe(true);
    const week = who([J], { "journal.history": 7 });
    expect(historyFrom(week, TODAY)).toBe("2026-11-12");
    expect(can(week, "journal.history", { date: "2026-11-12", today: TODAY })).toBe(true);
    expect(can(week, "journal.history", { date: "2026-11-11", today: TODAY })).toBe(false);
    const none = who([J], { "journal.history": 0 });
    expect(can(none, "journal.history", { date: TODAY, today: TODAY })).toBe(true);
    expect(can(none, "journal.history", { date: "2026-11-18", today: TODAY })).toBe(false);
    // days ahead are never history
    expect(can(none, "journal.history", { date: "2026-12-01", today: TODAY })).toBe(true);
  });

  it("a period: everything, or nothing dated before today; a nested right follows its parent's", () => {
    const anyDay = who([V, "visit.edit", "visit.edit.comment"], { "visit.edit": "all" });
    expect(can(anyDay, "visit.edit", { date: "2026-11-01", today: TODAY })).toBe(true);
    const today = who([V, "visit.edit", "visit.edit.comment"], { "visit.edit": "today" });
    expect(can(today, "visit.edit", { date: "2026-11-18", today: TODAY })).toBe(false);
    expect(can(today, "visit.edit", { date: TODAY, today: TODAY })).toBe(true);
    expect(can(today, "visit.edit", { date: "2026-11-25", today: TODAY })).toBe(true);
    expect(can(today, "visit.edit.comment", { date: "2026-11-18", today: TODAY })).toBe(false);
    expect(can(today, "visit.edit.comment", { date: TODAY, today: TODAY })).toBe(true);
    // asked without a day, the right itself
    expect(can(today, "visit.edit")).toBe(true);
  });

  it("deleting many clients at once stays the owner's", () => {
    const on = [C, "clients.delete"];
    expect(can(who(on, {}, "admin"), "clients.delete")).toBe(true);
    expect(can(who(on, {}, "admin"), "clients.delete", { bulk: true })).toBe(false);
    expect(can(who(on, {}, "owner"), "clients.delete", { bulk: true })).toBe(true);
    expect(can(who([C], {}, "owner"), "clients.delete", { bulk: true })).toBe(false);
  });
});

describe("a set as it is stored", () => {
  it("keeps only keys the catalogue knows, each once", () => {
    const n = normalizeRights({ preset: "AD", on: [J, J, "journal.phones", "journal.phones", "no.such.right", 7] });
    expect(n.on.filter((k) => k === "journal.phones")).toHaveLength(1);
    expect(n.on).not.toContain("no.such.right");
  });

  it("a right with a value is on exactly while its group is", () => {
    expect(normalizeRights({ preset: "AD", on: [J] }).on).toEqual(expect.arrayContaining(["journal.staff", "journal.history", "journal.positions"]));
    expect(normalizeRights({ preset: "AD", on: ["journal.staff"] }).on).toEqual([]);
  });

  it("values are of their kind, or the widest", () => {
    const v = normalizeRights({ preset: "AD", on: [J], values: { "journal.staff": [A, A, "junk"], "journal.history": -3, "visit.edit": "yesterday", "clients.show": 5 } }).values;
    expect(v["journal.staff"]).toEqual([A]);
    expect(v["journal.history"]).toBeNull();
    expect(v["visit.edit"]).toBe("all");
    expect(v["clients.show"]).toBe("all");
    expect(normalizeRights({ preset: "AD", on: [], values: { "journal.history": 30, "visit.sell.create": "today" } }).values).toMatchObject({ "journal.history": 30, "visit.sell.create": "today" });
  });

  it("counts a group as the screen does", () => {
    const n = normalizeRights({ preset: "AD", on: [J, "journal.phones", "journal.move"] });
    // the three with a value, and the two switches
    expect(countOn(n.on, "journal")).toBe(5);
    expect(countOn(new Set(n.on), "visit")).toBe(0);
  });

  it("the difference of two sets: what went on, what went off, which values are other", () => {
    const a = normalizeRights({ preset: "AD", on: [J, "journal.phones"], values: { "journal.history": null } });
    const b = normalizeRights({ preset: "AD", on: [J, "journal.move"], values: { "journal.history": 7 } });
    expect(diffRights(a, b)).toEqual({ on: ["journal.move"], off: ["journal.phones"], values: ["journal.history"] });
    expect(diffRights(a, a)).toEqual({ on: [], off: [], values: [] });
  });

  it("a value no wider than one's own", () => {
    expect(valueWithin("scope", "all", [A])).toBe(true);
    expect(valueWithin("scope", [A, B], [A])).toBe(true);
    expect(valueWithin("scope", [A], [A, B])).toBe(false);
    expect(valueWithin("scope", [A], "all")).toBe(false);
    expect(valueWithin("history", null, 30)).toBe(true);
    expect(valueWithin("history", 7, 7)).toBe(true);
    expect(valueWithin("history", 7, 30)).toBe(false);
    expect(valueWithin("history", 7, null)).toBe(false);
    expect(valueWithin("period", "all", "today")).toBe(true);
    expect(valueWithin("period", "today", "all")).toBe(false);
  });
});

describe("instead of a hidden phone or e-mail", () => {
  it("a phone keeps its start and its last two digits", () => {
    expect(maskPhone("+37255512345")).toBe("+3725•••••45");
    expect(maskPhone("+37255512345")).not.toContain("5123");
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone("12345")).toBe("•••••");
  });

  it("an e-mail keeps its first letter and its domain", () => {
    expect(maskEmail("anna@example.test")).toBe("a•••@example.test");
    expect(maskEmail(null)).toBeNull();
  });
});
