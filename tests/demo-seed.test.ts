/**
 * The demo seed (tools/seed-demo.mjs): the salon's structure as it stands in
 * Altegio (tools/altegio-structure.json), and staging's busy calendar of
 * generated visits (SEED_BUSY=yes), which tests and e2e never get.
 * Fake people only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadCalendar } from "@/lib/admin/calendar";
import { loadBarberDays } from "@/lib/barber/day";
import { closeDb, query } from "@/lib/db";
import { planReminders } from "@/lib/outbox";
import { addDays, zonedToUtc } from "@/lib/tz";
import ALTEGIO from "../tools/altegio-structure.json";
import { BUSY, busyEnabled, DEMO, demoHours, seedDemo, seedDemoBusy, seedDemoLogins, seedDemoVisits } from "../tools/seed-demo.mjs";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const db = { query: async (sql: string, params?: unknown[]) => ({ rows: await query(sql, params) }) };
// the file's keys and the slugs the demo keeps for them
const SLUG: Record<string, string> = { cut: "clip", long: "long", buzz: "buzz", cut_beard: "cutbeard", beard: "beard", grey: "grey", kid: "kid", father_son: "fs" };
const FIRST: Record<string, string> = { Renat: "renat", Valentin: "valentin", Jevgeni: "jevgeni", Slava: "slava", Milena: "milena" };
const slugOfBarber = (name: string) => FIRST[name.split(" ")[0]];

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});
afterAll(closeDb);

describe("the structure is the salon's own", () => {
  it("the eight services: the file's Russian and English names and base prices, an Estonian name each", async () => {
    const rows = await query<{ slug: string; name: { ru: string; et: string; en: string }; price_cents: number; price_max_cents: number | null; sort: number; active: boolean; online: boolean }>(
      "select slug, name, price_cents, price_max_cents, sort, active, online from services order by sort",
    );
    expect(rows.map((r) => r.slug)).toEqual(ALTEGIO.services.map((s) => SLUG[s.key]));
    expect(rows).toHaveLength(8);
    for (const [i, s] of ALTEGIO.services.entries()) {
      expect(rows[i]).toMatchObject({ price_cents: s.baseCents, price_max_cents: s.maxCents ?? null, active: true, online: true });
      expect([rows[i].name.ru, rows[i].name.en]).toEqual([s.ru, s.en]);
      expect(rows[i].name.et.length, s.key).toBeGreaterThan(3);
    }
    // the Estonian names the demo had before
    expect(rows.map((r) => r.name.et)).toEqual([
      "Juukselõikus masina ja kääridega",
      "Pikad juuksed, kääridega",
      "Masinalõikus (buzzcut)",
      "Juukselõikus + habe",
      "Habeme piiramine",
      "Hallide juuste katmine",
      "Lapse juukselõikus",
      "Isa ja poeg",
    ]);
    // nothing the file lists as not offered
    const all = JSON.stringify(rows.map((r) => r.name));
    for (const gone of ["завивка", "Женская"]) expect(all).not.toContain(gone);
  });

  it("each barber's lines: his own minutes and price for every service he does, and no other", async () => {
    const rows = await query<{ staff: string; service: string; duration_min: number; price_cents: number; price_max_cents: number | null; active: boolean }>(
      `select s.slug as staff, sv.slug as service, ss.duration_min, ss.price_cents, ss.price_max_cents, ss.active
         from staff_services ss join staff s on s.id = ss.staff_id join services sv on sv.id = ss.service_id`,
    );
    const want = ALTEGIO.staff.flatMap((st) =>
      Object.entries(st.services as Record<string, number[]>).map(([key, [min, cents, max]]) => ({
        staff: slugOfBarber(st.name),
        service: SLUG[key],
        duration_min: min,
        price_cents: cents,
        price_max_cents: max ?? null,
        active: true,
      })),
    );
    const order = (a: { staff: string; service: string }, b: { staff: string; service: string }) => `${a.staff}:${a.service}`.localeCompare(`${b.staff}:${b.service}`);
    expect([...rows].sort(order)).toEqual([...want].sort(order));
    expect(rows).toHaveLength(26);
    // a few by hand
    const line = (staff: string, service: string) => rows.find((r) => r.staff === staff && r.service === service);
    expect(line("renat", "clip")).toMatchObject({ duration_min: 45, price_cents: 4000 });
    expect(line("jevgeni", "cutbeard")).toMatchObject({ duration_min: 90, price_cents: 6000 });
    expect(line("valentin", "grey")).toMatchObject({ duration_min: 30, price_cents: 3000, price_max_cents: 3500 });
    expect(line("renat", "beard")).toBeUndefined();
    expect(line("milena", "long")).toBeUndefined();
  });

  it("the weekly template: the weekdays and hours each barber usually works", async () => {
    const rows = await query<{ staff: string; weekday: number; starts: string; ends: string }>(
      `select s.slug as staff, h.weekday, to_char(h.starts, 'HH24:MI') as starts, to_char(h.ends, 'HH24:MI') as ends
         from staff_hours h join staff s on s.id = h.staff_id order by s.sort, h.weekday`,
    );
    const week = (staff: string) => rows.filter((r) => r.staff === staff).map((r) => `${r.weekday} ${r.starts}–${r.ends}`);
    expect(week("renat")).toEqual(["2 10:00–19:00", "3 10:00–19:00", "4 10:00–19:00", "5 10:00–19:00", "6 10:00–19:00"]);
    // a Monday of one hour (16.11) does not make his Mondays an hour long, nor a day to 18:30 half past
    expect(week("valentin")).toEqual(["1 10:00–18:00", "2 10:00–19:00", "3 09:00–19:00", "4 09:00–19:00", "5 09:00–19:00", "6 10:00–18:00"]);
    // one Monday hour out of two Mondays is not a working day; Wednesdays are short
    expect(week("jevgeni")).toEqual(["2 10:00–19:00", "3 10:00–17:30", "4 10:00–19:00", "5 10:00–19:00", "6 10:00–19:00"]);
    // a Monday and two Thursdays in five weeks are swaps, not his week
    expect(week("slava")).toEqual(["2 10:00–18:00", "3 10:00–18:00", "5 10:00–18:00", "6 10:00–18:00"]);
    expect(week("milena")).toEqual(["1 10:00–19:00", "4 10:00–19:00", "5 10:00–19:00"]);
  });

  it("the dated shifts are exact days: each shift as it is, a day without one off, and after his last shift the template again", async () => {
    const rows = await query<{ staff: string; day: string; intervals: [string, string][] }>(
      "select s.slug as staff, o.day::text as day, o.intervals from staff_day_overrides o join staff s on s.id = o.staff_id",
    );
    for (const st of ALTEGIO.staff) {
      const slug = slugOfBarber(st.name);
      const mine = rows.filter((r) => r.staff === slug).sort((a, b) => a.day.localeCompare(b.day));
      const last = st.shifts.map((x) => x[0]).sort().at(-1)!;
      // every day from Monday 16.11 to his last shift, once
      const days: string[] = [];
      for (let d = "2026-11-16"; d <= last; d = addDays(d, 1)) days.push(d);
      expect(mine.map((r) => r.day), slug).toEqual(days);
      for (const r of mine) {
        const shift = st.shifts.find((x) => x[0] === r.day);
        expect(r.intervals, `${slug} ${r.day}`).toEqual(shift ? [[shift[1], shift[2]]] : []);
      }
    }
    // as the calendar reads them: Tuesday 17.11, Monday 16.11, and a week in January
    const cal = await loadCalendar(query, demo.business, "2026-11-16", 2);
    const hours = (staff: string, date: string) => cal.work[demo.staff[staff]][date].map(([a, b]) => [a - at(date, "00:00"), b - at(date, "00:00")].map((ms) => ms / 60_000));
    expect(hours("valentin", "2026-11-16")).toEqual([[16 * 60, 17 * 60]]);
    expect(hours("valentin", "2026-11-17")).toEqual([]);
    expect(hours("slava", "2026-11-17")).toEqual([[10 * 60, 18 * 60 + 30]]);
    expect(hours("milena", "2026-11-16")).toEqual([[10 * 60, 19 * 60]]);
    const later = await loadCalendar(query, demo.business, "2027-01-11", 7);
    const works = (staff: string) => later.dates.filter((d) => later.work[demo.staff[staff]][d].length).map((d) => d.slice(8));
    expect(works("renat")).toEqual(["12", "13", "14", "15", "16"]);
    expect(works("valentin")).toEqual(["11", "12", "13", "14", "15", "16"]);
    expect(works("slava")).toEqual(["12", "13", "15", "16"]);
    expect(works("milena")).toEqual(["11", "14", "15"]);
    expect(later.work[demo.staff.jevgeni]["2027-01-13"]).toEqual([[at("2027-01-13", "10:00"), at("2027-01-13", "17:30")]]);
  });

  it("run again, it leaves alone what was changed in the admin; a new structure is written over the old once", async () => {
    const line = async (staff: string, service: string) =>
      (await query<{ price_cents: number; duration_min: number | null; active: boolean }>("select price_cents, duration_min, active from staff_services where staff_id = $1 and service_id = $2", [demo.staff[staff], demo.services[service]]))[0];
    const mondays = async () => (await query<{ n: number }>("select count(*)::int as n from staff_hours where staff_id = $1 and weekday = 1", [demo.staff.renat]))[0].n;
    // Renat's own changes: a price, a name, a Monday, a day off on a dated day, a service he took up
    await query("update staff_services set price_cents = 4200 where staff_id = $1 and service_id = $2", [demo.staff.renat, demo.services.clip]);
    await query(`update services set name = '{"ru": "Стрижка"}' where id = $1`, [demo.services.clip]);
    await query("insert into staff_hours (staff_id, weekday, starts, ends) values ($1, 1, '10:00', '20:00')", [demo.staff.renat]);
    await query("update staff_day_overrides set intervals = '[]' where staff_id = $1 and day = '2026-11-17'", [demo.staff.renat]);
    await query("insert into staff_services (staff_id, service_id, price_cents) values ($1, $2, 2500)", [demo.staff.renat, demo.services.beard]);
    await seedDemo(db);
    expect(await line("renat", "clip")).toMatchObject({ price_cents: 4200, duration_min: 45 });
    expect(await line("renat", "beard")).toMatchObject({ price_cents: 2500, active: true });
    expect(await mondays()).toBe(1);
    expect((await query<{ name: unknown }>("select name from services where id = $1", [demo.services.clip]))[0].name).toEqual({ ru: "Стрижка" });
    expect((await query<{ intervals: unknown }>("select intervals from staff_day_overrides where staff_id = $1 and day = '2026-11-17'", [demo.staff.renat]))[0].intervals).toEqual([]);

    // a database seeded before this structure (staging on 19.11.2026): no version, or another one
    await query("update businesses set settings = settings - 'demo_structure' || '{\"barber_self_price\": \"now\"}'::jsonb where id = $1", [demo.business.id]);
    await seedDemo(db);
    expect(await line("renat", "clip")).toMatchObject({ price_cents: 4000, duration_min: 45, active: true });
    // a service the file does not give him is switched off, not deleted
    expect(await line("renat", "beard")).toMatchObject({ price_cents: 2500, active: false });
    expect(await mondays()).toBe(0);
    expect((await query<{ name: { ru: string } }>("select name from services where id = $1", [demo.services.clip]))[0].name.ru).toBe("Стрижка ножницами и машинкой");
    expect((await query<{ intervals: unknown }>("select intervals from staff_day_overrides where staff_id = $1 and day = '2026-11-17'", [demo.staff.renat]))[0].intervals).toEqual([["10:00", "19:00"]]);
    const [biz] = await query<{ settings: Record<string, unknown> }>("select settings from businesses where id = $1", [demo.business.id]);
    expect(biz.settings).toEqual({ barber_self_price: "now", demo_structure: DEMO.version });
    // and from then on it is left alone again
    await query("update staff_services set price_cents = 4300 where staff_id = $1 and service_id = $2", [demo.staff.renat, demo.services.clip]);
    await seedDemo(db);
    expect((await line("renat", "clip")).price_cents).toBe(4300);
  });

  it("the barbers in Altegio's order; a database in the demo's first order moves to it once, and a barber Renat moved stays (round 15)", async () => {
    const order = async () => (await query<{ slug: string }>("select slug from staff order by sort, slug")).map((r) => r.slug);
    expect(await order()).toEqual(["jevgeni", "slava", "renat", "valentin", "milena"]);
    // staging before 24.11.2026: Renat, Valentin, Jevgeni, Slava, Milena
    for (const [i, slug] of ["renat", "valentin", "jevgeni", "slava", "milena"].entries()) await query("update staff set sort = $2 where slug = $1", [slug, i]);
    await seedDemo(db);
    expect(await order()).toEqual(["jevgeni", "slava", "renat", "valentin", "milena"]);
    await seedDemo(db);
    expect(await order()).toEqual(["jevgeni", "slava", "renat", "valentin", "milena"]);
    // Renat put Milena first: she stays there; the others still move
    for (const [i, slug] of ["renat", "valentin", "jevgeni", "slava"].entries()) await query("update staff set sort = $2 where slug = $1", [slug, i]);
    await query("update staff set sort = -1 where slug = 'milena'");
    await seedDemo(db);
    expect(await order()).toEqual(["milena", "jevgeni", "slava", "renat", "valentin"]);
    // the owner who cuts is still linked to Renat's barber, whoever is first
    await seedDemoLogins(db);
    expect((await query<{ staff_id: string }>("select staff_id from users where email = 'boss@example.test'"))[0].staff_id).toBe(demo.staff.renat);
  });
});

describe("the busy calendar (staging only)", () => {
  // Thursday 19.11.2026, 15:30 in Tallinn: 5.11 to 3.12
  const NOW = at("2026-11-19", "15:30");
  const FROM = "2026-11-05";
  const MIN = 60_000;
  type Row = { id: string; staff_id: string; client_id: string; starts_at: Date; ends_at: Date; blocked_until: Date; status: string; source: string; reminder_min: number | null; total_cents: number; key: string | null };
  const visits = () =>
    query<Row>("select id, staff_id, client_id, starts_at, ends_at, blocked_until, status, source, reminder_min, total_cents, idempotency_key as key from appointments order by staff_id, starts_at, id");
  /** every barber's 29 days, as his app reads them */
  async function days(slug: string) {
    const out = [];
    for (const from of [FROM, addDays(FROM, 14), addDays(FROM, 28)]) out.push(...(await loadBarberDays(query, demo.business, demo.staff[slug], from, from === addDays(FROM, 28) ? 1 : 14)));
    return out;
  }

  it("is behind its own switch, and never on where the app is the real thing", () => {
    expect(busyEnabled({ SEED_BUSY: "yes" })).toBe(true);
    expect(busyEnabled({ SEED_BUSY: "yes", SEED_DEMO: "yes", ALLOW_INDEXING: "" })).toBe(true);
    for (const env of [{}, { SEED_DEMO: "yes" }, { SEED_BUSY: "" }, { SEED_BUSY: "true" }, { SEED_BUSY: "1" }, { SEED_BUSY: "yes", ALLOW_INDEXING: "yes" }]) expect(busyEnabled(env), JSON.stringify(env)).toBe(false);
    // this run's own environment: the tests never have it
    expect(process.env.SEED_BUSY).toBeUndefined();
  });

  it("without it the demo database has no visits and no clients: tests and e2e keep their free times", async () => {
    expect(await query("select id from appointments")).toEqual([]);
    expect(await query("select id from clients")).toEqual([]);
  });

  it("fills 60–85 % of every shift of the last 14 days and the next 14, inside the hours, nothing twice on one chair", async () => {
    const made = await seedDemoBusy(db, NOW);
    expect(made.visits).toBeGreaterThan(450);
    expect(made.visits).toBeLessThan(750);
    let shifts = 0;
    for (const st of DEMO.staff) {
      for (const day of await days(st.slug)) {
        // his hours that day are the seeded ones: the dated shift or the template
        expect(day.windows.map(([a, b]) => [a, b]), `${st.slug} ${day.date}`).toEqual(demoHours(st.slug, day.date).map(([a, b]: [string, string]) => [at(day.date, a), at(day.date, b)]));
        if (!day.windows.length) {
          expect(day.visits, `${st.slug} ${day.date}`).toEqual([]);
          continue;
        }
        shifts++;
        const shift = day.windows.reduce((n, [a, b]) => n + b - a, 0);
        const taken = day.visits.reduce((n, v) => n + v.end - v.start, 0);
        expect(taken / shift, `${st.slug} ${day.date}`).toBeGreaterThanOrEqual(BUSY.fill[0]);
        expect(taken / shift, `${st.slug} ${day.date}`).toBeLessThanOrEqual(BUSY.fill[1]);
        for (const [i, v] of day.visits.entries()) {
          expect(day.windows.some(([a, b]) => v.start >= a && v.blockedUntil <= b), `${st.slug} ${day.date} inside`).toBe(true);
          if (i) expect(v.start, `${st.slug} ${day.date} overlap`).toBeGreaterThanOrEqual(day.visits[i - 1].blockedUntil);
          // on the 15-minute grid, one service, at his own price and time for it
          expect((v.start / MIN) % 15).toBe(0);
          expect(v.services).toHaveLength(1);
          const own = st.lines[Object.keys(demo.services).find((slug) => demo.services[slug] === v.services[0].serviceId)!];
          expect([v.end - v.start, v.totalCents, v.services[0].priceCents], `${st.slug} ${day.date} own`).toEqual([own.d * MIN, own.cents, own.cents]);
        }
      }
    }
    // five barbers, 29 days: Valentin away for a week, nobody on Sundays
    expect(shifts).toBe(made.shifts);
    expect(shifts).toBeGreaterThan(80);
    // the database's own rule, asked directly
    const [twice] = await query<{ n: number }>(
      `select count(*)::int as n from appointments a join appointments b on a.staff_id = b.staff_id and a.id < b.id
        where a.status <> 'cancelled' and b.status <> 'cancelled' and tstzrange(a.starts_at, a.blocked_until) && tstzrange(b.starts_at, b.blocked_until)`,
    );
    expect(twice.n).toBe(0);
  });

  it("behind: «Готово», a few no-shows and a few cancelled; ahead: all «Записан»; two thirds booked online", async () => {
    await seedDemoBusy(db, NOW);
    const all = await visits();
    const n = (f: (v: Row) => boolean) => all.filter(f).length;
    const past = all.filter((v) => v.ends_at.getTime() <= NOW);
    const ahead = all.filter((v) => v.starts_at.getTime() > NOW);
    expect(new Set(ahead.map((v) => v.status))).toEqual(new Set(["booked"]));
    expect(new Set(past.map((v) => v.status))).toEqual(new Set(["done", "no_show", "cancelled"]));
    // in the chair right now: «Пришёл», or still «Записан» for one who will not come
    for (const v of all.filter((v) => v.starts_at.getTime() <= NOW && v.ends_at.getTime() > NOW)) expect(["arrived", "booked"]).toContain(v.status);
    expect(past.length).toBeGreaterThan(200);
    expect(ahead.length).toBeGreaterThan(200);
    const share = (status: string) => n((v) => v.status === status) / past.length;
    expect(share("done")).toBeGreaterThan(0.85);
    expect(share("no_show")).toBeGreaterThan(0.01);
    expect(share("no_show")).toBeLessThan(0.1);
    expect(share("cancelled")).toBeGreaterThan(0.01);
    expect(share("cancelled")).toBeLessThan(0.1);
    const online = n((v) => v.source === "online") / all.length;
    expect(online).toBeGreaterThan(0.6);
    expect(online).toBeLessThan(0.74);
    expect(n((v) => v.source !== "online" && v.source !== "admin")).toBe(0);
    // booked before the visit, and never after «now»; a cancelled one was cancelled before it began
    const rows = await query<{ late: number; future: number; cancel: number }>(
      `select count(*) filter (where created_at > starts_at)::int as late, count(*) filter (where created_at > $1)::int as future,
              count(*) filter (where status = 'cancelled' and (cancelled_at is null or cancelled_at >= starts_at or cancelled_at < created_at or cancelled_by is null))::int as cancel
         from appointments`,
      [new Date(NOW)],
    );
    expect(rows[0]).toEqual({ late: 0, future: 0, cancel: 0 });
  });

  it("the clients are fake and come back: «Demo client N» with the demo's numbers, no e-mail, no reminder to send", async () => {
    await seedDemoBusy(db, NOW);
    const clients = await query<{ id: string; name: string; phone_e164: string; email: string | null; sms_opt_out: boolean; email_opt_out: boolean; n: number }>(
      `select c.id, c.name, c.phone_e164, c.email, c.sms_opt_out, c.email_opt_out, count(a.id)::int as n
         from clients c left join appointments a on a.client_id = c.id and a.status <> 'cancelled' group by c.id`,
    );
    expect(clients.length).toBeGreaterThan(135);
    expect(clients.length).toBeLessThanOrEqual(BUSY.clients);
    for (const c of clients) {
      const k = Number(/^Demo client (\d+)$/.exec(c.name)?.[1]);
      expect(k >= 101 && k <= 250, c.name).toBe(true);
      // +372 5555 0NNN: the demo's fake range, the number in the name
      expect(c.phone_e164).toBe(`+37255550${k}`);
      expect([c.email, c.sms_opt_out, c.email_opt_out]).toEqual([null, true, true]);
    }
    // history: most of them have several visits
    expect(clients.filter((c) => c.n >= 3).length).toBeGreaterThan(clients.length * 0.6);
    expect(Math.max(...clients.map((c) => c.n))).toBeLessThanOrEqual(8);
    // nobody twice on one day, and never within four days
    const [close] = await query<{ n: number }>(
      `select count(*)::int as n from appointments a join appointments b on a.client_id = b.client_id and a.id < b.id
        where a.status <> 'cancelled' and b.status <> 'cancelled'
          and abs((a.starts_at at time zone 'Europe/Tallinn')::date - (b.starts_at at time zone 'Europe/Tallinn')::date) < $1`,
      [BUSY.apart],
    );
    expect(close.n).toBe(0);
    // nothing to send: no SMS reminder on any visit, so the outbox plans none
    expect((await visits()).filter((v) => v.reminder_min !== null)).toEqual([]);
    expect(await planReminders(query, NOW)).toEqual({ added: 0, cancelled: 0 });
    // and none for a visit somebody books for one of them later with the reminder on: the client is «no SMS»
    await query("update appointments set reminder_min = 120 where status = 'booked'");
    expect(await planReminders(query, NOW)).toEqual({ added: 0, cancelled: 0 });
    expect(await query("select id from notifications")).toEqual([]);
    // (it is the mark that holds them back: without it the next two days' visits would each get one)
    await query("update clients set sms_opt_out = false");
    expect((await planReminders(query, NOW)).added).toBeGreaterThan(20);
  });

  it("is the same on every database: nothing is drawn by chance", async () => {
    await seedDemoBusy(db, NOW);
    const digest = async () => JSON.stringify((await visits()).map((v) => [v.id, v.staff_id, v.client_id, v.starts_at.toISOString(), v.ends_at.toISOString(), v.status, v.source, v.total_cents, v.key]));
    const one = await digest();
    demo = await freshDemo();
    await seedDemoBusy(db, NOW);
    expect(await digest()).toBe(one);
  });

  it("run again it adds nothing; a day later it adds the day that came in and closes what is behind", async () => {
    const first = await seedDemoBusy(db, NOW);
    const before = await visits();
    expect(await seedDemoBusy(db, NOW)).toEqual({ visits: 0, clients: 0, closed: 0, shifts: 0 });
    expect(await visits()).toEqual(before);

    // Friday 20.11, 15:30: Friday 4.12 is new; Thursday's later visits and Friday's earlier ones are behind now
    const next = NOW + 86_400_000;
    const second = await seedDemoBusy(db, next);
    expect(second.shifts).toBe(DEMO.staff.filter((st) => demoHours(st.slug, "2026-12-04").length).length);
    expect(second.shifts).toBe(5);
    expect(second.closed).toBeGreaterThan(10);
    const after = await visits();
    const added = after.filter((v) => !before.some((b) => b.id === v.id));
    expect(added.length).toBe(second.visits);
    // the new visits are that Friday's, and a cancelled one of a shift that is now behind
    for (const v of added) expect(v.status === "cancelled" || (v.starts_at.getTime() >= at("2026-12-04", "00:00") && v.starts_at.getTime() < at("2026-12-05", "00:00"))).toBe(true);
    expect(added.filter((v) => v.status !== "cancelled").length).toBeGreaterThan(20);
    // every visit of the first run is still there, at its time; nothing behind is left «Записан»
    for (const b of before) expect(after.find((v) => v.id === b.id)).toMatchObject({ starts_at: b.starts_at, client_id: b.client_id });
    expect(after.filter((v) => v.ends_at.getTime() <= next && (v.status === "booked" || v.status === "arrived"))).toEqual([]);
    expect(first.visits + second.visits).toBe(after.length);
  });

  it("goes round what is already there: the local demo visits keep their times, and count as taken", async () => {
    await seedDemoVisits(db, NOW);
    const fixed = await visits();
    expect(fixed.length).toBeGreaterThan(40);
    await seedDemoBusy(db, NOW);
    const all = await visits();
    for (const f of fixed) expect(all.find((v) => v.id === f.id)).toEqual(f);
    for (const slug of ["valentin", "jevgeni"]) {
      const list = (await days(slug)).filter((d) => d.windows.length);
      for (const day of list) {
        const live = day.visits;
        for (let i = 1; i < live.length; i++) expect(live[i].start, `${slug} ${day.date}`).toBeGreaterThanOrEqual(live[i - 1].blockedUntil);
        // lunch stays free
        for (const b of day.blocks) for (const v of live) expect(v.start >= b.to || v.blockedUntil <= b.from, `${slug} ${day.date} lunch`).toBe(true);
        const inside = live.filter((v) => day.windows.some(([a, b]) => v.start >= a && v.end <= b)).reduce((n, v) => n + v.end - v.start, 0);
        expect(inside / day.windows.reduce((n, [a, b]) => n + b - a, 0), `${slug} ${day.date}`).toBeLessThanOrEqual(BUSY.fill[1]);
      }
    }
  });

  it("after December too: only the weekly template is left, and it still fills", async () => {
    const later = at("2027-03-10", "12:00");
    const made = await seedDemoBusy(db, later);
    expect(made.visits).toBeGreaterThan(450);
    for (const st of DEMO.staff) {
      const list = await loadBarberDays(query, demo.business, demo.staff[st.slug], "2027-03-08", 7);
      const worked = list.filter((d) => d.visits.length).map((d) => new Date(`${d.date}T12:00:00Z`).getUTCDay() || 7);
      expect(worked, st.slug).toEqual(st.hours.map((h: { weekday: number }) => h.weekday));
    }
  });
});
