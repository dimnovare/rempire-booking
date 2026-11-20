/**
 * The clients' reviews (migration 023, src/lib/reviews.ts): the booking
 * page's averages, hidden reviews left out, the admin's list and its
 * rights, and the Altegio import: idempotent, masked by default, rating
 * bounds. Fake people only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cleanReviews, defaultReviews } from "@/lib/admin/review-filter";
import { legacyHolder } from "@/lib/auth/rights-store";
import type { Holder } from "@/lib/auth/rights";
import { loadCatalog } from "@/lib/catalog";
import { closeDb, query } from "@/lib/db";
import { importReviews, listReviews, maskName, matchStaff, readReviewDate, reviewRef, setReviewHidden, staffRatings, type ReviewImportItem } from "@/lib/reviews";
import { freshDemo, type Demo } from "./helpers";

afterAll(closeDb);

const TZ = "Europe/Tallinn";
const PHONE = "+37255500123";
let demo: Demo;

beforeEach(async () => {
  demo = await freshDemo();
});

/** One review straight into the table, as ours would be written. */
async function add(staff: string | null, rating: number, opts: { hidden?: boolean; at?: string; body?: string; name?: string; client?: string } = {}) {
  const [row] = await query<{ id: string }>(
    `insert into reviews (business_id, rating, body, author_name, staff_id, client_id, created_at, hidden)
     values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8) returning id`,
    [demo.business.id, rating, opts.body ?? "", opts.name ?? "Тест", staff ? demo.staff[staff] : null, opts.client ?? null, opts.at ?? "2026-11-10T12:00:00Z", opts.hidden ?? false],
  );
  return row.id;
}

const all = (over: Record<string, unknown> = {}) => cleanReviews({ ...defaultReviews("2026-11-20"), from: "2025-01-01", to: "2026-12-31", ...over });

/** An owner, the front desk and a barber, as their roles start: the barber's login has no reports. */
const owner = (): Holder & { id: string } => legacyHolder("owner", "owner-login");
const desk = (): Holder & { id: string } => legacyHolder("admin", "desk-login");
const barber = (): Holder & { id: string } => legacyHolder("staff", "barber-login", demo.staff.valentin);
function ownerWith(off: string[]): Holder & { id: string } {
  const o = owner();
  return { ...o, rights: { ...o.rights, on: new Set([...o.rights.on].filter((k) => !off.includes(k))) } };
}

describe("the table", () => {
  it("takes 1 to 5 stars and nothing else", async () => {
    await add("valentin", 1);
    await add("valentin", 5);
    for (const bad of [0, 6, -1]) await expect(add("valentin", bad)).rejects.toThrow();
    // whole stars only: the column holds whole numbers (the importer refuses 4.5 before it gets here)
    await expect(query("insert into reviews (business_id, rating, created_at) values ($1, $2, now())", [demo.business.id, "4.5x"])).rejects.toThrow();
  });

  it("an imported review has its key; the same key twice is refused", async () => {
    await expect(query("insert into reviews (business_id, rating, created_at, source) values ($1, 5, now(), 'altegio')", [demo.business.id])).rejects.toThrow();
    const ins = () => query("insert into reviews (business_id, rating, created_at, source, source_ref) values ($1, 5, now(), 'altegio', 'abcdef0123')", [demo.business.id]);
    await ins();
    await expect(ins()).rejects.toThrow();
  });

  it("the staff's own rating columns are gone: the reviews are the one place", async () => {
    await expect(query("select rating from staff limit 1")).rejects.toThrow();
    await expect(query("select review_count from staff limit 1")).rejects.toThrow();
  });
});

describe("the booking page's stars", () => {
  it("each barber's average and count, over the reviews on show", async () => {
    await add("valentin", 5);
    await add("valentin", 4);
    await add("valentin", 4);
    await add("jevgeni", 3);
    const r = await staffRatings(query, demo.business.id);
    expect(r.get(demo.staff.valentin)).toEqual({ rating: 4.33, count: 3 });
    expect(r.get(demo.staff.jevgeni)).toEqual({ rating: 3, count: 1 });
    // a barber with no review is not there: no stars at all
    expect(r.has(demo.staff.milena)).toBe(false);
  });

  it("a hidden review is neither in the average nor in the count; one about the salon is nobody's", async () => {
    await add("valentin", 5);
    await add("valentin", 1, { hidden: true });
    await add(null, 1);
    const r = await staffRatings(query, demo.business.id);
    expect(r.get(demo.staff.valentin)).toEqual({ rating: 5, count: 1 });
    expect([...r.keys()]).toEqual([demo.staff.valentin]);
    // only hidden ones: no stars
    await add("slava", 2, { hidden: true });
    expect((await staffRatings(query, demo.business.id)).has(demo.staff.slava)).toBe(false);
  });

  it("the catalog the booking page is drawn from carries them; no review is no rating", async () => {
    await add("valentin", 5);
    await add("valentin", 4);
    const c = await loadCatalog(query, demo.business.id);
    const val = c.staff.find((s) => s.id === demo.staff.valentin)!;
    expect([val.rating, val.reviewCount]).toEqual([4.5, 2]);
    const mil = c.staff.find((s) => s.id === demo.staff.milena)!;
    expect([mil.rating, mil.reviewCount]).toEqual([null, 0]);
  });
});

describe("the admin's list", () => {
  it("filters by barber, «О компании», rating, shown or hidden, and dates; the average is of what was found", async () => {
    await add("valentin", 5, { at: "2026-11-10T10:00:00Z" });
    await add("valentin", 3, { at: "2026-10-01T10:00:00Z", hidden: true });
    await add("jevgeni", 4, { at: "2026-09-01T10:00:00Z" });
    await add(null, 2, { at: "2026-08-01T10:00:00Z" });
    const b = demo.business;
    const l = await listReviews(query, b, all());
    expect(l.total).toBe(4);
    expect(l.average).toBe(3.5);
    // the newest first
    expect(l.rows.map((r) => r.rating)).toEqual([5, 3, 4, 2]);
    expect((await listReviews(query, b, all({ staffId: demo.staff.valentin }))).total).toBe(2);
    expect((await listReviews(query, b, all({ staffId: "company" }))).rows.map((r) => r.staffName)).toEqual([null]);
    expect((await listReviews(query, b, all({ rating: "4" }))).rows.map((r) => r.staffId)).toEqual([demo.staff.jevgeni]);
    expect((await listReviews(query, b, all({ shown: "hidden" }))).rows.map((r) => r.rating)).toEqual([3]);
    expect((await listReviews(query, b, all({ shown: "shown" }))).total).toBe(3);
    // the salon's days: 1 October up to and with 10 November
    expect((await listReviews(query, b, all({ from: "2026-10-01", to: "2026-11-10" }))).total).toBe(2);
    // a new page opens on the last twelve months
    expect(defaultReviews("2026-11-20")).toMatchObject({ from: "2025-11-20", to: "2026-11-20" });
  });

  it("a page of the right size, and nothing outside the choices", async () => {
    for (let i = 0; i < 30; i++) await add("valentin", 1 + (i % 5), { at: `2026-11-${String(1 + (i % 19)).padStart(2, "0")}T10:00:00Z` });
    const p2 = await listReviews(query, demo.business, all({ page: 2, size: 25 }));
    expect([p2.total, p2.pages, p2.page, p2.rows.length]).toEqual([30, 2, 2, 5]);
    expect(cleanReviews({ rating: "7", staffId: "x", shown: "nope", size: 33, page: -1 })).toMatchObject({ rating: null, staffId: null, shown: "all", size: 25, page: 1 });
  });

  it("only with «Просматривать отзывы»; the client's phone only with the contacts right", async () => {
    const [c] = await query<{ id: string }>("insert into clients (business_id, name, phone_e164) values ($1, 'Тест Клиент', $2) returning id", [demo.business.id, PHONE]);
    await add("valentin", 5, { client: c.id });
    expect((await listReviews(query, demo.business, all(), owner())).rows[0].clientPhone).toBe(PHONE);
    // the front desk starts with it; a barber's login has no reports at all
    expect((await listReviews(query, demo.business, all(), desk())).total).toBe(1);
    expect(await listReviews(query, demo.business, all(), barber())).toMatchObject({ total: 0, rows: [] });
    const noContacts = await listReviews(query, demo.business, all(), ownerWith(["clients.list_contacts"]));
    expect(noContacts.rows[0].clientPhone).not.toBe(PHONE);
    expect(noContacts.rows[0].clientPhone).toContain("•");
    expect((await listReviews(query, demo.business, all(), ownerWith(["reports.reviews"]))).total).toBe(0);
  });

  it("a login limited to some barbers gets only their reviews, and a client only when it sees the client", async () => {
    const [c] = await query<{ id: string }>("insert into clients (business_id, name, phone_e164) values ($1, 'Тест Клиент', $2) returning id", [demo.business.id, PHONE]);
    const valentins = await add("valentin", 5, { client: c.id });
    const jevgenis = await add("jevgeni", 4);
    await add(null, 3);
    const d = desk();
    const onlyValentin = (clients: string[]): Holder & { id: string } => ({
      ...d,
      rights: { ...d.rights, values: { ...d.rights.values, "journal.staff": [demo.staff.valentin], "clients.show": clients } },
    });
    // Valentin's review alone: not Jevgeni's, not the salon's; a pick of Jevgeni finds nothing
    const mine = await listReviews(query, demo.business, all(), onlyValentin([demo.staff.valentin]));
    expect(mine.rows.map((r) => r.id)).toEqual([valentins]);
    expect((await listReviews(query, demo.business, all({ staffId: demo.staff.jevgeni }), onlyValentin([demo.staff.valentin]))).total).toBe(0);
    // the client has no visit with the barbers whose clients this login sees: no card, no phone
    const blind = await listReviews(query, demo.business, all(), onlyValentin([demo.staff.jevgeni]));
    expect(blind.rows[0]).toMatchObject({ id: valentins, clientId: null, clientPhone: null });
    // «Скрыть» reaches only the reviews it lists
    expect(await setReviewHidden(query, demo.business.id, onlyValentin([demo.staff.valentin]), jevgenis, true)).toEqual({ ok: false, code: "not_found" });
    expect(await setReviewHidden(query, demo.business.id, onlyValentin([demo.staff.valentin]), valentins, true)).toEqual({ ok: true, hidden: true });
  });

  it("«Скрыть» and «Показать» with «Удалять отзывы», each change an audit row", async () => {
    const id = await add("valentin", 5);
    expect(await setReviewHidden(query, demo.business.id, barber(), id, true)).toEqual({ ok: false, code: "forbidden" });
    expect(await setReviewHidden(query, demo.business.id, ownerWith(["reports.reviews.delete"]), id, true)).toEqual({ ok: false, code: "forbidden" });
    expect(await setReviewHidden(query, demo.business.id, owner(), id, true)).toEqual({ ok: true, hidden: true });
    expect((await staffRatings(query, demo.business.id)).has(demo.staff.valentin)).toBe(false);
    // the same again changes nothing and writes nothing
    expect(await setReviewHidden(query, demo.business.id, owner(), id, true)).toEqual({ ok: true, hidden: true });
    expect(await setReviewHidden(query, demo.business.id, owner(), id, false)).toEqual({ ok: true, hidden: false });
    const audit = await query<{ action: string; actor: string }>("select action, actor from audit where entity = 'review' and entity_id = $1 order by id", [id]);
    expect(audit).toEqual([
      { action: "hide", actor: "owner-login" },
      { action: "show", actor: "owner-login" },
    ]);
    expect(await setReviewHidden(query, demo.business.id, owner(), "00000000-0000-4000-8000-000000000000", true)).toEqual({ ok: false, code: "not_found" });
  });
});

describe("the import", () => {
  const FILE: ReviewImportItem[] = [
    { date: "20.11.2026 14:32", rating: 5, text: "Отлично подстригли", name: "Кирилл", barber: "Valentin Nachinov", phone: "+372 5550 0123" },
    { date: "2026-11-02", rating: "4", text: "Хорошо", name: "Mari", barber: "Jevgeni Hair" },
    { date: "01.10.2026", rating: 3, text: "", name: "Anna", barber: "О компании" },
    { date: "2026-09-15 10:00", rating: 5, text: "Super", name: "John", barber: "Somebody Else" },
  ];

  it("writes each review once: a second run of the same file changes nothing", async () => {
    await query("insert into clients (business_id, name, phone_e164) values ($1, 'Тест Клиент', $2)", [demo.business.id, PHONE]);
    const first = await importReviews(query, demo.business, FILE);
    expect(first).toMatchObject({ read: 4, inserted: 4, updated: 0, unchanged: 0, skipped: [], clientsFound: 1, phonesMissed: 0, company: 1, staffMissed: { "Somebody Else": 1 } });
    const again = await importReviews(query, demo.business, FILE);
    expect(again).toMatchObject({ inserted: 0, updated: 0, unchanged: 4 });
    expect((await query("select 1 from reviews")).length).toBe(4);
    // the barbers by their first names; the unknown one and the salon have nobody
    const rows = await query<{ staff_id: string | null; rating: number; created_at: Date; client_id: string | null; source: string }>("select staff_id, rating, created_at, client_id, source from reviews order by created_at desc");
    expect(rows.map((r) => r.staff_id)).toEqual([demo.staff.valentin, demo.staff.jevgeni, null, null]);
    expect(rows.every((r) => r.source === "altegio")).toBe(true);
    // the salon's clock: 14:32 in Tallinn is 12:32 UTC in November; a day alone is its noon
    expect(new Date(rows[0].created_at).toISOString()).toBe("2026-11-20T12:32:00.000Z");
    expect(new Date(rows[1].created_at).toISOString()).toBe("2026-11-02T10:00:00.000Z");
    // the phone found the card and was dropped: the table has no place for one
    expect(rows[0].client_id).not.toBeNull();
    const cols = await query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'reviews'");
    expect(cols.map((c) => c.column_name).some((c) => /phone/.test(c))).toBe(false);
    // and the booking page has them at once
    expect((await staffRatings(query, demo.business.id)).get(demo.staff.valentin)).toEqual({ rating: 5, count: 1 });
  });

  it("masks the names by default; the whole names later update the same rows", async () => {
    await importReviews(query, demo.business, FILE);
    const names = async () => (await query<{ author_name: string }>("select author_name from reviews order by created_at desc")).map((r) => r.author_name);
    expect(await names()).toEqual(["К.", "M.", "A.", "J."]);
    const real = await importReviews(query, demo.business, FILE, { mask: false });
    expect(real).toMatchObject({ inserted: 0, updated: 4 });
    expect(await names()).toEqual(["Кирилл", "Mari", "Anna", "John"]);
    expect((await query("select 1 from reviews")).length).toBe(4);
    expect(maskName("  élise ")).toBe("É.");
    expect(maskName("")).toBe("");
  });

  it("a review hidden in the admin stays hidden; a corrected barber is taken on the next run", async () => {
    await importReviews(query, demo.business, FILE);
    await query("update reviews set hidden = true where rating = 3");
    const fixed = FILE.map((it) => (it.barber === "Somebody Else" ? { ...it, barber: "Milena Orehhova" } : it));
    const r = await importReviews(query, demo.business, fixed);
    expect(r).toMatchObject({ inserted: 0, updated: 1, unchanged: 3, staffMissed: {} });
    expect((await query<{ hidden: boolean }>("select hidden from reviews where rating = 3"))[0].hidden).toBe(true);
    expect((await staffRatings(query, demo.business.id)).get(demo.staff.milena)).toEqual({ rating: 5, count: 1 });
  });

  it("leaves out what it cannot read, and says why", async () => {
    const r = await importReviews(query, demo.business, [
      { date: "2026-11-01", rating: 0, name: "A" },
      { date: "2026-11-01", rating: 6, name: "B" },
      { date: "2026-11-01", rating: 4.5, name: "C" },
      { date: "2026-11-01", rating: "five", name: "D" },
      { date: "31.02.2026", rating: 5, name: "E" },
      { date: "yesterday", rating: 5, name: "F" },
      "not a review",
      { date: "2026-11-01", rating: 5, name: "G", text: "x" },
      { date: "2026-11-01", rating: 5, name: "G", text: "x" },
    ]);
    expect(r.inserted).toBe(1);
    expect(r.skipped).toEqual([
      { at: 0, why: "rating must be a whole number from 1 to 5" },
      { at: 1, why: "rating must be a whole number from 1 to 5" },
      { at: 2, why: "rating must be a whole number from 1 to 5" },
      { at: 3, why: "rating must be a whole number from 1 to 5" },
      { at: 4, why: "date not understood" },
      { at: 5, why: "date not understood" },
      { at: 6, why: "not an object" },
      { at: 8, why: "the same review twice in the file" },
    ]);
    await expect(importReviews(query, demo.business, { not: "an array" })).rejects.toThrow(/array/);
  });

  it("the key is the date, the name and the text as written; spaces at the ends do not count", () => {
    const k = reviewRef("2026-11-20T14:32", "Кирилл", "Отлично");
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(reviewRef("2026-11-20T14:32", " Кирилл ", "Отлично\r\n")).toBe(k);
    expect(reviewRef("2026-11-20T14:33", "Кирилл", "Отлично")).not.toBe(k);
    expect(reviewRef("2026-11-20T14:32", "Кирил", "Отлично")).not.toBe(k);
  });

  it("reads the dates the export may have", () => {
    expect(readReviewDate("20.11.2026", TZ)?.key).toBe("2026-11-20");
    expect(readReviewDate("5.3.2026 9:05", TZ)?.key).toBe("2026-03-05T09:05");
    expect(readReviewDate("2026-11-20 14:32:10", TZ)?.key).toBe("2026-11-20T14:32");
    expect(readReviewDate("2026-11-20T12:32:00Z", TZ)?.at).toBe(Date.parse("2026-11-20T12:32:00Z"));
    for (const bad of ["", "2026-13-01", "32.01.2026", "20.11.2026 25:00", "20/11/2026", null]) expect(readReviewDate(bad, TZ), String(bad)).toBeNull();
  });

  it("finds a barber by his whole name, or by a first name only one barber has", () => {
    const staff = [
      { id: "a", slug: "valentin", display_name: "Valentin" },
      { id: "b", slug: "slava", display_name: "Slava" },
      { id: "c", slug: "slava-k", display_name: "Slava K" },
    ];
    expect(matchStaff("Valentin Nachinov", staff)).toBe("a");
    expect(matchStaff("  VALENTIN ", staff)).toBe("a");
    expect(matchStaff("Slava K", staff)).toBe("c");
    // two barbers start with «Slava»: nobody is guessed
    expect(matchStaff("Slava Krasytel", staff)).toBeNull();
    expect(matchStaff("Nobody", staff)).toBeNull();
    expect(matchStaff("", staff)).toBeNull();
  });
});
