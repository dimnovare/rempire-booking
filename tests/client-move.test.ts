/**
 * The client moves his own visit from its link (src/lib/client-move.ts), as
 * REMPIRE's Altegio lets him: the same barber and services, another time,
 * and only a time the booking page would offer him.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as moveSlotsRoute } from "@/app/api/visit/[token]/slots/route";
import { POST as moveRoute } from "@/app/api/visit/[token]/move/route";
import { loadAvailability } from "@/lib/availability";
import { book } from "@/lib/booking";
import { moveByClient, moveSlots } from "@/lib/client-move";
import { closeDb, query } from "@/lib/db";
import { localParts } from "@/lib/tz";
import { cancelByClient, findVisit } from "@/lib/visits";
import { freshDemo, zonedToUtc, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const NOW = zonedToUtc("2026-11-16", "10:00", TZ);
const iso = (ms: number) => new Date(ms).toISOString();

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});
afterAll(closeDb);

/** Slava's free starts for a cut (60 minutes with him) on one local day, as the booking page would offer them at `now`. */
async function free(date: string, now = NOW): Promise<number[]> {
  const r = await loadAvailability(query, { business: demo.business, serviceIds: [demo.services.clip], staffId: demo.staff.slava, from: date, days: 1, now });
  return r.days[0]?.slots.map((s) => s.start) ?? [];
}

async function booked(start: number, phone = "+372 5555 0501", now = NOW): Promise<string> {
  const r = await book(
    query,
    demo.business,
    {
      serviceIds: [demo.services.clip],
      staffId: demo.staff.slava,
      startsAt: iso(start),
      name: "Move Test Client",
      phone,
      email: null,
      comment: "",
      locale: "ru",
      smsReminder: false,
      idempotencyKey: `client-move-${Math.random()}`,
    },
    { now },
  );
  if (!r.ok || !r.manageToken) throw new Error(`book: ${JSON.stringify(r)}`);
  return r.manageToken;
}

describe("the client moves his own visit", () => {
  it("to a free time on another day: the barber, the services and the price stay", async () => {
    const [from] = await free("2026-11-17");
    const to = (await free("2026-11-18"))[2];
    const token = await booked(from);
    const before = (await findVisit(query, demo.business.id, token))!;

    const r = await moveByClient(demo.business, token, { startsAt: iso(to), extraCents: 0 }, NOW);
    expect(r).toMatchObject({ ok: true, startsAt: iso(to), totalCents: before.totalCents, extraCents: 0 });

    const after = (await findVisit(query, demo.business.id, token))!;
    expect(after.startsAt).toBe(iso(to));
    expect(Date.parse(after.endsAt) - Date.parse(after.startsAt)).toBe(Date.parse(before.endsAt) - Date.parse(before.startsAt));
    expect(after.staffId).toBe(before.staffId);
    expect(after.services.map((s) => s.serviceId)).toEqual(before.services.map((s) => s.serviceId));
    expect(after.status).toBe(before.status);
    // the audit row says who did it
    const [a] = await query<{ actor: string; action: string }>("select actor, action from audit where entity_id = $1 and action = 'move'", [after.id]);
    expect(a).toEqual({ actor: "client", action: "move" });
    // the old time is free again, the new one is taken
    expect(await free("2026-11-17")).toContain(from);
    expect(await free("2026-11-18")).not.toContain(to);
  });

  it("its own old time does not stand in its way: half an hour later works", async () => {
    const day = await free("2026-11-17");
    // two free starts 30 minutes apart: the 60-minute visit overlaps itself
    const later = (s: number) => s + 30 * 60_000;
    const from = day.find((s) => day.includes(later(s)))!;
    expect(from).toBeTruthy();
    const token = await booked(from);
    // without the visit out of the way the booking page would not offer it
    expect(await free("2026-11-17")).not.toContain(later(from));
    const offered = (await moveSlots(demo.business, token, 3, NOW))!.days.flatMap((d) => d.slots.map((s) => s.start));
    expect(offered).toContain(later(from));
    expect(await moveByClient(demo.business, token, { startsAt: iso(later(from)) }, NOW)).toMatchObject({ ok: true, startsAt: iso(later(from)) });
  });

  it("the time it already has is no move, and nothing is written", async () => {
    const [from] = await free("2026-11-17");
    const token = await booked(from);
    expect(await moveByClient(demo.business, token, { startsAt: iso(from) }, NOW)).toMatchObject({ ok: true, startsAt: iso(from) });
    const rows = await query("select 1 from audit where action = 'move'");
    expect(rows).toHaveLength(0);
  });

  it("a time another client has, a time off the grid, the night, a time gone by: slot_taken, and the visit stays", async () => {
    const day = await free("2026-11-17");
    const mine = day[0];
    const theirs = day.find((s) => s >= mine + 60 * 60_000)!;
    const token = await booked(mine);
    await booked(theirs, "+372 5555 0502");
    for (const start of [theirs, NOW + 5 * 60_000, zonedToUtc("2026-11-18", "03:00", TZ), zonedToUtc("2026-11-10", "12:00", TZ)]) {
      expect(await moveByClient(demo.business, token, { startsAt: iso(start) }, NOW), iso(start)).toEqual({ ok: false, code: "slot_taken" });
    }
    expect((await findVisit(query, demo.business.id, token))!.startsAt).toBe(iso(mine));
  });

  it("a price he was not shown: slot_taken", async () => {
    const [from] = await free("2026-11-17");
    const to = (await free("2026-11-18"))[0];
    const token = await booked(from);
    expect(await moveByClient(demo.business, token, { startsAt: iso(to), extraCents: 500 }, NOW)).toEqual({ ok: false, code: "slot_taken" });
  });

  it("an unknown link, no time, a cancelled visit, a visit that has begun", async () => {
    const [from] = await free("2026-11-17");
    const to = (await free("2026-11-18"))[0];
    const token = await booked(from);
    expect(await moveByClient(demo.business, "A".repeat(32), { startsAt: iso(to) }, NOW)).toEqual({ ok: false, code: "not_found" });
    expect(await moveByClient(demo.business, token, {}, NOW)).toEqual({ ok: false, code: "invalid" });
    expect(await moveByClient(demo.business, token, { startsAt: "soon" }, NOW)).toEqual({ ok: false, code: "invalid" });
    // once it has begun
    expect(await moveByClient(demo.business, token, { startsAt: iso(to) }, from + 60_000)).toEqual({ ok: false, code: "too_late" });
    expect(await moveSlots(demo.business, token, 3, from + 60_000)).toBeNull();
    // once it is cancelled
    expect(await cancelByClient(demo.business, token, NOW)).toBe("cancelled");
    expect(await moveByClient(demo.business, token, { startsAt: iso(to) }, NOW)).toEqual({ ok: false, code: "too_late" });
    expect(await moveSlots(demo.business, token, 3, NOW)).toBeNull();
  });
});

describe("the routes behind «Перенести»", () => {
  const ctx = (token: string) => ({ params: Promise.resolve({ token }) }) as never;
  const post = (token: string, body: unknown) =>
    moveRoute(new Request(`http://x/api/visit/${token}/move`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), ctx(token));

  it("GET …/slots offers the days ahead; POST …/move moves; the codes say why not", async () => {
    // these run on the real clock: a visit some days from now
    const now = Date.now();
    const today = localParts(now, TZ).date;
    // Slava works four days a week, and fewer in some: three weeks always hold four of his days
    const ahead = (await loadAvailability(query, { business: demo.business, serviceIds: [demo.services.clip], staffId: demo.staff.slava, from: today, days: 21, now })).days
      .filter((d) => d.slots.length > 3)
      .slice(2, 4);
    expect(ahead).toHaveLength(2);
    const from = ahead[0].slots[0].start;
    const to = ahead[1].slots[1].start;
    const token = await booked(from, "+372 5555 0503", now);

    const slots = await moveSlotsRoute(new Request(`http://x/api/visit/${token}/slots?days=21`), ctx(token));
    expect(slots.status).toBe(200);
    expect(slots.headers.get("cache-control")).toBe("no-store");
    const j = (await slots.json()) as { offered: boolean; days: { d: string; s: [number, string, number][] }[] };
    expect(j.offered).toBe(true);
    expect(j.days.flatMap((d) => d.s.map((s) => s[0]))).toContain(to);
    // only his own barber
    expect(new Set(j.days.flatMap((d) => d.s.map((s) => s[1])))).toEqual(new Set([demo.staff.slava]));

    expect((await post(token, {})).status).toBe(422);
    expect((await post("A".repeat(32), { startsAt: iso(to) })).status).toBe(404);
    const taken = await post(token, { startsAt: iso(to), extraCents: 12345 });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: "slot_taken" });

    const ok = await post(token, { startsAt: iso(to), extraCents: 0 });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, startsAt: iso(to) });
    expect((await findVisit(query, demo.business.id, token))!.startsAt).toBe(iso(to));

    expect((await moveSlotsRoute(new Request("http://x/api/visit/nope/slots"), ctx("nope"))).status).toBe(404);
  });
});
