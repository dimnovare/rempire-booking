/**
 * «Список услуг», the sidebar's read-only list (serviceList in
 * src/lib/admin/services.ts): each working service with the range of price
 * and time over the barbers who do it, and every barber's own.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { listServices, serviceList } from "@/lib/admin/services";
import { closeDb, query } from "@/lib/db";
import { freshDemo, type Demo } from "./helpers";

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});
afterAll(closeDb);

/** One barber's own time and price for a service; null = the service's default. */
const offer = (staff: string, service: string, cents: number | null, min: number | null, max: number | null = null) =>
  query("update staff_services set price_cents = $3, duration_min = $4, price_max_cents = $5, active = true where staff_id = $1 and service_id = $2", [demo.staff[staff], demo.services[service], cents, min, max]);

describe("the list of services", () => {
  it("has the working services in «Услуги»'s order, each with its barbers", async () => {
    const list = await serviceList(query, demo.business.id);
    const all = (await listServices(query, demo.business.id)).filter((s) => s.active);
    expect(list.map((s) => s.id)).toEqual(all.map((s) => s.id));
    for (const s of list) {
      expect(s.barbers.length).toBe(all.find((x) => x.id === s.id)!.barbers);
      expect(s.priceFromCents).toBeLessThanOrEqual(s.priceToCents);
      expect(s.minFrom).toBeLessThanOrEqual(s.minTo);
    }
  });

  it("the range is the lowest and the highest among its barbers; an empty field is the service's own", async () => {
    await query("update services set price_cents = 4000, price_max_cents = null, duration_min = 60 where id = $1", [demo.services.clip]);
    for (const who of Object.keys(demo.staff)) await offer(who, "clip", null, null);
    await offer("renat", "clip", 5500, 45);
    await offer("valentin", "clip", 3500, 75);
    const clip = (await serviceList(query, demo.business.id)).find((s) => s.id === demo.services.clip)!;
    expect(clip).toMatchObject({ priceFromCents: 3500, priceToCents: 5500, minFrom: 45, minTo: 75 });
    const by = Object.fromEntries(clip.barbers.map((b) => [b.name, b]));
    expect(by.Renat).toMatchObject({ priceCents: 5500, priceMaxCents: null, durationMin: 45 });
    expect(by.Valentin).toMatchObject({ priceCents: 3500, durationMin: 75 });
    // Slava's fields are empty: the service's 40 € and 60 minutes
    expect(by.Slava).toMatchObject({ priceCents: 4000, priceMaxCents: null, durationMin: 60 });
  });

  it("a price «от–до» widens the range to its top: the service's for a barber without his own, his own otherwise", async () => {
    await query("update services set price_cents = 3000, price_max_cents = 3500, duration_min = 30 where id = $1", [demo.services.grey]);
    const doing = (await query<{ slug: string }>("select s.slug from staff_services ss join staff s on s.id = ss.staff_id where ss.service_id = $1 and ss.active", [demo.services.grey])).map((r) => r.slug);
    expect(doing.length).toBeGreaterThan(1);
    for (const who of doing) await offer(who, "grey", null, null);
    let grey = (await serviceList(query, demo.business.id)).find((s) => s.id === demo.services.grey)!;
    expect(grey).toMatchObject({ priceFromCents: 3000, priceToCents: 3500, minFrom: 30, minTo: 30 });
    expect(grey.barbers[0]).toMatchObject({ priceCents: 3000, priceMaxCents: 3500 });
    // one barber with his own price and top
    await offer(doing[0], "grey", 3200, 40, 4500);
    grey = (await serviceList(query, demo.business.id)).find((s) => s.id === demo.services.grey)!;
    expect(grey).toMatchObject({ priceFromCents: 3000, priceToCents: 4500, minFrom: 30, minTo: 40 });
    // his own price with no top of his own is one price, not the service's range
    await offer(doing[0], "grey", 3200, 40, null);
    grey = (await serviceList(query, demo.business.id)).find((s) => s.id === demo.services.grey)!;
    expect(grey.barbers.find((b) => b.priceCents === 3200)).toMatchObject({ priceMaxCents: null });
  });

  it("leaves out a service that is switched off, a barber who no longer works and a line he no longer does", async () => {
    const before = await serviceList(query, demo.business.id);
    const clip = before.find((s) => s.id === demo.services.clip)!;
    await query("update staff set active = false where id = $1", [demo.staff.milena]);
    await query("update staff_services set active = false where staff_id = $1 and service_id = $2", [demo.staff.slava, demo.services.clip]);
    await query("update services set active = false where id = $1", [demo.services.kid]);
    const after = await serviceList(query, demo.business.id);
    expect(after.map((s) => s.id)).not.toContain(demo.services.kid);
    expect(after).toHaveLength(before.length - 1);
    const names = after.find((s) => s.id === demo.services.clip)!.barbers.map((b) => b.name);
    expect(names).not.toContain("Milena");
    expect(names).not.toContain("Slava");
    expect(names).toHaveLength(clip.barbers.length - 2);
  });

  it("a service nobody does shows its own price and time", async () => {
    await query("update staff_services set active = false where service_id = $1", [demo.services.fs]);
    await query("update services set price_cents = 6500, price_max_cents = 7000, duration_min = 90 where id = $1", [demo.services.fs]);
    const fs = (await serviceList(query, demo.business.id)).find((s) => s.id === demo.services.fs)!;
    expect(fs).toMatchObject({ barbers: [], priceFromCents: 6500, priceToCents: 7000, minFrom: 90, minTo: 90 });
  });
});
