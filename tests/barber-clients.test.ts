/**
 * The client's card in the barber app (B6): only his own clients, only his
 * own visits with them; one shared note per client; the visit's own note on
 * his visits only. Fake people only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminCancelVisit, adminCreateVisit, adminSetStatus, type AdminVisitInput } from "@/lib/admin/visits";
import { clientCard, NOTE_MAX, setClientNote, setVisitNote } from "@/lib/barber/clients";
import { closeDb, query } from "@/lib/db";
import { zonedToUtc } from "@/lib/tz";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const NOW = at("2026-11-30", "12:00");
const ACTOR = "test-admin";

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});
afterAll(closeDb);

let n = 0;
async function book(staff: string, date: string, time: string, o: Partial<AdminVisitInput> = {}) {
  const r = await adminCreateVisit(
    demo.business,
    { staffId: demo.staff[staff], start: at(date, time), serviceIds: [demo.services.clip], name: "Card Client", phone: "+372 5555 0801", idempotencyKey: `card-${++n}-${Math.random()}`, ...o },
    ACTOR,
  );
  if (!r.ok) throw new Error(`booking failed: ${r.code}`);
  return r;
}
const clientOf = async (visitId: string) => (await query<{ client_id: string }>("select client_id from appointments where id = $1", [visitId]))[0].client_id;

describe("the client's card", () => {
  it("shows his visits with this client: ahead soonest first, the rest newest first; no cancelled ones", async () => {
    const a = await book("valentin", "2026-12-01", "11:00");
    const b = await book("valentin", "2026-12-08", "11:00");
    const c = await book("valentin", "2026-12-15", "11:00");
    const d = await book("valentin", "2026-12-22", "11:00");
    await adminSetStatus(demo.business, a.id, "done", ACTOR);
    await adminSetStatus(demo.business, b.id, "no_show", ACTOR);
    await adminCancelVisit(demo.business, d.id, ACTOR);
    // the same client with another barber: not on Valentin's card
    await book("jevgeni", "2026-12-02", "12:00");
    const card = await clientCard(query, demo.business, demo.staff.valentin, await clientOf(a.id), NOW);
    expect(card).not.toBeNull();
    expect(card!.name).toBe("Card Client");
    expect(card!.phone).toBe("+37255550801");
    expect(card!.ahead.map((v) => v.id)).toEqual([c.id]);
    expect(card!.past.map((v) => [v.id, v.status])).toEqual([
      [b.id, "no_show"],
      [a.id, "done"],
    ]);
    expect([card!.count, card!.noShows]).toEqual([3, 1]);
    expect(card!.past[0].services.map((s) => s.serviceId)).toEqual([demo.services.clip]);
  });

  it("is not there for a client who never had a visit in his column", async () => {
    const j = await book("jevgeni", "2026-12-02", "12:00", { name: "Other Client", phone: "+372 5555 0802" });
    expect(await clientCard(query, demo.business, demo.staff.valentin, await clientOf(j.id), NOW)).toBeNull();
    expect(await clientCard(query, demo.business, demo.staff.valentin, "not-a-uuid", NOW)).toBeNull();
  });
});

describe("notes", () => {
  it("the shared note: his clients only, trimmed, the same one for everybody", async () => {
    const v = await book("valentin", "2026-12-01", "11:00");
    const client = await clientOf(v.id);
    expect(await setClientNote(demo.business, demo.staff.valentin, ACTOR, client, "  любит покороче \r\n виски  ")).toBe(true);
    const [row] = await query<{ staff_note: string }>("select staff_note from clients where id = $1", [client]);
    expect(row.staff_note).toBe("любит покороче \n виски");
    // Jevgeni never had this client
    expect(await setClientNote(demo.business, demo.staff.jevgeni, ACTOR, client, "x")).toBe(false);
    expect(await setClientNote(demo.business, demo.staff.valentin, ACTOR, client, "a".repeat(NOTE_MAX + 50))).toBe(true);
    expect((await clientCard(query, demo.business, demo.staff.valentin, client, NOW))!.note).toHaveLength(NOTE_MAX);
  });

  it("the visit's note: his own visits only", async () => {
    const v = await book("valentin", "2026-12-01", "11:00");
    expect(await setVisitNote(demo.business, demo.staff.valentin, ACTOR, v.id, "кофе без сахара")).toBe(true);
    expect(await setVisitNote(demo.business, demo.staff.jevgeni, ACTOR, v.id, "x")).toBe(false);
    const [row] = await query<{ staff_note: string }>("select staff_note from appointments where id = $1", [v.id]);
    expect(row.staff_note).toBe("кофе без сахара");
    const audit = await query<{ after: { length: number } }>("select after from audit where entity = 'appointment' and entity_id = $1 and action = 'note'", [v.id]);
    // the audit keeps the length, not the words
    expect(audit.map((a) => a.after.length)).toEqual([15]);
  });
});
