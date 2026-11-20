/**
 * A client's own review from the salon's page («Оцените и напишите отзыв»;
 * Dim, 20.11.2026, decision page round 11): what may be sent
 * (cleanReviewInput), how it is kept waiting and never shown before the
 * salon approves it (submitReview, migration 035), the bot traps and the
 * limits per address and per day, the address kept only as a hash, the
 * admin's «Новый» first with «Одобрить» and «Скрыть» (listReviews,
 * setReviewHidden) and their audit rows, and POST /api/salon/reviews.
 * Fake people and fake addresses only (192.0.2.x is the documentation
 * range).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));

import { POST as postReview } from "@/app/api/salon/reviews/route";
import { cleanReviews, defaultReviews } from "@/lib/admin/review-filter";
import type { Holder } from "@/lib/auth/rights";
import { legacyHolder } from "@/lib/auth/rights-store";
import { loadCatalog } from "@/lib/catalog";
import { closeDb, query } from "@/lib/db";
import { cleanReviewInput, listReviews, REVIEW_LIMITS, REVIEW_MIN_MS, salonRating, salonReviews, setReviewHidden, staffRatings, submitReview, type ReviewInput } from "@/lib/reviews";
import { migrate, migrationFiles, newPglite } from "../tools/migrate.mjs";
import { freshDemo, type Demo } from "./helpers";

afterAll(closeDb);

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
  await query("delete from audit");
});

const IP = "192.0.2.10";
const NOW = Date.parse("2026-11-20T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const good = (over: ReviewInput = {}): ReviewInput => ({ rating: 5, staffId: "", name: "Тест Клиент", text: "Всё понравилось.\n\nПриду ещё.", website: "", ms: 30_000, ...over });
const send = (over: ReviewInput = {}, ctx: { ip?: string; now?: number } = {}) => submitReview(query, demo.business, good(over), { ip: ctx.ip ?? IP, now: ctx.now ?? NOW });
const ours = () =>
  query<{ id: string; rating: number; body: string; author_name: string; staff_id: string | null; source: string; hidden: boolean; pending: boolean; ip_hash: string | null; created_at: Date }>(
    "select id, rating, body, author_name, staff_id, source, hidden, pending, ip_hash, created_at from reviews where source = 'ours' order by created_at, id",
  );
const all = (over: Record<string, unknown> = {}) => cleanReviews({ ...defaultReviews("2026-11-20"), from: "2025-01-01", to: "2026-12-31", ...over });
const owner = (): Holder & { id: string } => legacyHolder("owner", "owner-login");

describe("what may be sent", () => {
  it("1 to 5 whole stars; the salon or one of its barbers; a name with a letter; a text of up to 1000", () => {
    expect(cleanReviewInput(good())).toEqual({ ok: true, value: { rating: 5, staffId: null, name: "Тест Клиент", body: "Всё понравилось.\n\nПриду ещё." } });
    expect(cleanReviewInput(good({ rating: "4" }))).toMatchObject({ ok: true, value: { rating: 4 } });
    for (const rating of [0, 6, 4.5, "five", null, undefined]) expect(cleanReviewInput(good({ rating }))).toEqual({ ok: false, field: "rating" });
    expect(cleanReviewInput(good({ staffId: "salon" }))).toMatchObject({ ok: true, value: { staffId: null } });
    expect(cleanReviewInput(good({ staffId: demo.staff.valentin }))).toMatchObject({ ok: true, value: { staffId: demo.staff.valentin } });
    for (const staffId of ["valentin", 7, "'; drop table reviews; --"]) expect(cleanReviewInput(good({ staffId }))).toEqual({ ok: false, field: "staff" });
    for (const name of ["", "   ", "1234", "x".repeat(61), 42]) expect(cleanReviewInput(good({ name }))).toEqual({ ok: false, field: "name" });
    expect(cleanReviewInput(good({ text: "a".repeat(1000) }))).toMatchObject({ ok: true });
    expect(cleanReviewInput(good({ text: "a".repeat(1001) }))).toEqual({ ok: false, field: "text" });
    // no text at all is a review too: the stars
    expect(cleanReviewInput(good({ text: "" }))).toMatchObject({ ok: true, value: { body: "" } });
  });

  it("the name on one line, the text's paragraphs kept, control and direction marks out", () => {
    const r = cleanReviewInput(good({ name: "  Тест\n\tКлиент‮ ", text: "Раз\r\n\r\n\r\n\r\nДва  \n\u0007Три​" }));
    expect(r).toEqual({ ok: true, value: { rating: 5, staffId: null, name: "Тест Клиент", body: "Раз\n\nДва\nТри" } });
  });

  it("no links: an address of a site in the name or the text is refused", () => {
    for (const text of ["see https://spam.example", "go to www.example.test", "cheap-pills.shop now", "СКИДКИ на casino.xyz"]) {
      expect(cleanReviewInput(good({ text }))).toEqual({ ok: false, field: "link" });
    }
    expect(cleanReviewInput(good({ name: "best.com" }))).toEqual({ ok: false, field: "link" });
    // an ordinary sentence with a dot is fine
    expect(cleanReviewInput(good({ text: "Стрижка 10/10. Мастер Валентин.Спасибо" }))).toMatchObject({ ok: true });
  });
});

describe("a review sent", () => {
  it("is kept waiting: hidden, pending, «ours», the address only as a hash", async () => {
    expect(await send({ staffId: demo.staff.valentin, rating: 4 })).toEqual({ ok: true });
    const [r] = await ours();
    expect(r).toMatchObject({ rating: 4, body: "Всё понравилось.\n\nПриду ещё.", author_name: "Тест Клиент", staff_id: demo.staff.valentin, source: "ours", hidden: true, pending: true });
    expect(new Date(r.created_at).getTime()).toBe(NOW);
    expect(r.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    // the address is nowhere in the row
    expect(JSON.stringify(r)).not.toContain("192.0.2");
    // the same address the same day: the same hash; another address or another day: another
    await send({}, { now: NOW + HOUR });
    await send({}, { ip: "192.0.2.11", now: NOW + 2 * HOUR });
    await send({}, { now: NOW + 26 * HOUR });
    const h = (await ours()).map((x) => x.ip_hash);
    expect(h[1]).toBe(h[0]);
    expect(h[2]).not.toBe(h[0]);
    expect(h[3]).not.toBe(h[0]);
  });

  it("never shown or counted while it waits: not on the salon's page, not in a barber's stars", async () => {
    const before = await salonRating(query, demo.business.id);
    await send({ rating: 1 });
    await send({ rating: 1, staffId: demo.staff.valentin }, { now: NOW + 1 });
    expect(await salonRating(query, demo.business.id)).toEqual(before);
    expect((await staffRatings(query, demo.business.id)).get(demo.staff.valentin)).toBeUndefined();
    expect((await salonReviews(query, demo.business.id)).rows.map((r) => r.name)).not.toContain("Тест Клиент");
    const L = (await loadCatalog(query, demo.business.id)).location;
    expect(L.reviewCount).toBe(before.count);
  });

  it("a bot is thanked and nothing is written: the hidden field filled, or sent too fast", async () => {
    expect(await send({ website: "http://spam.example" })).toEqual({ ok: true });
    expect(await send({ ms: REVIEW_MIN_MS - 1 })).toEqual({ ok: true });
    expect(await ours()).toEqual([]);
    expect(await send({ ms: REVIEW_MIN_MS })).toEqual({ ok: true });
    expect(await ours()).toHaveLength(1);
  });

  it("a barber who is not this salon's, or not bookable, is refused", async () => {
    expect(await send({ staffId: "00000000-0000-4000-8000-000000000000" })).toEqual({ ok: false, code: "invalid", field: "staff" });
    await query("update staff set bookable = false where id = $1", [demo.staff.valentin]);
    expect(await send({ staffId: demo.staff.valentin })).toEqual({ ok: false, code: "invalid", field: "staff" });
    expect(await ours()).toEqual([]);
  });

  it(`from one address ${REVIEW_LIMITS.perHour} an hour and ${REVIEW_LIMITS.perDay} a day; then «too_many»`, async () => {
    for (let i = 0; i < REVIEW_LIMITS.perHour; i++) expect(await send({}, { now: NOW + i * 1000 })).toEqual({ ok: true });
    expect(await send({}, { now: NOW + 10_000 })).toEqual({ ok: false, code: "too_many" });
    // another address is not held back by this one
    expect(await send({}, { ip: "192.0.2.20", now: NOW + 11_000 })).toEqual({ ok: true });
    // an hour on: two more, then the day is full
    expect(await send({}, { now: NOW + HOUR + 1000 })).toEqual({ ok: true });
    expect(await send({}, { now: NOW + HOUR + 2000 })).toEqual({ ok: true });
    expect(await send({}, { now: NOW + 3 * HOUR })).toEqual({ ok: false, code: "too_many" });
    expect((await ours()).length).toBe(REVIEW_LIMITS.perDay + 1);
  });

  it(`from the whole site ${REVIEW_LIMITS.siteDay} a day, whatever the addresses`, async () => {
    for (let i = 0; i < REVIEW_LIMITS.siteDay; i++) {
      await query(
        `insert into reviews (business_id, rating, body, author_name, created_at, source, hidden, pending)
         values ($1, 5, '', 'Тест', $2::timestamptz, 'ours', true, true)`,
        [demo.business.id, new Date(NOW - i * 60_000).toISOString()],
      );
    }
    expect(await send({}, { ip: "192.0.2.99" })).toEqual({ ok: false, code: "too_many" });
    // a day later the day's count starts again
    expect(await send({}, { ip: "192.0.2.99", now: NOW + 25 * HOUR })).toEqual({ ok: true });
  });

  it("the hashes are cleared after two days", async () => {
    await send();
    await send({}, { ip: "192.0.2.30", now: NOW + 2 * 24 * HOUR + 1000 });
    const rows = await ours();
    expect(rows[0].ip_hash).toBeNull();
    expect(rows[1].ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the salon looks at it in «Отзывы»", () => {
  it("the new ones first with their count; «Только новые» and «Только скрытые» do not mix", async () => {
    await query(
      `insert into reviews (business_id, rating, body, author_name, created_at, source) values ($1, 5, 'Старый', 'Анна Тест', '2026-11-19T10:00:00Z', 'ours')`,
      [demo.business.id],
    );
    await query(
      `insert into reviews (business_id, rating, body, author_name, created_at, source, hidden) values ($1, 2, 'Скрытый', 'Борис Тест', '2026-11-19T11:00:00Z', 'ours', true)`,
      [demo.business.id],
    );
    await send({ text: "Новый отзыв" }, { now: Date.parse("2026-11-18T09:00:00Z") });
    const list = await listReviews(query, demo.business, all(), owner());
    expect(list.waiting).toBe(1);
    expect(list.rows[0]).toMatchObject({ body: "Новый отзыв", pending: true, hidden: true });
    expect(list.rows.slice(1).every((r) => !r.pending)).toBe(true);

    const waiting = await listReviews(query, demo.business, all({ shown: "pending" }), owner());
    expect(waiting.rows.map((r) => r.body)).toEqual(["Новый отзыв"]);
    const hidden = await listReviews(query, demo.business, all({ shown: "hidden" }), owner());
    expect(hidden.rows.map((r) => r.body)).toEqual(["Скрытый"]);
    const shown = await listReviews(query, demo.business, all({ shown: "shown" }), owner());
    expect(shown.rows.map((r) => r.body)).not.toContain("Новый отзыв");
  });

  it("«Одобрить»: on the salon's page and counted, no longer new; the audit says «approve»", async () => {
    await send({ text: "Отличный салон" });
    const [r] = await ours();
    const before = await salonRating(query, demo.business.id);
    expect(await setReviewHidden(query, demo.business.id, owner(), r.id, false)).toEqual({ ok: true, hidden: false });
    expect((await ours())[0]).toMatchObject({ hidden: false, pending: false });
    expect((await salonRating(query, demo.business.id)).count).toBe(before.count + 1);
    expect((await salonReviews(query, demo.business.id)).rows.map((x) => x.body)).toContain("Отличный салон");
    expect((await listReviews(query, demo.business, all(), owner())).waiting).toBe(0);
    const audit = await query<{ action: string; before: unknown; after: unknown }>("select action, before, after from audit where entity = 'review'");
    expect(audit).toEqual([{ action: "approve", before: { hidden: true, pending: true }, after: { hidden: false, pending: false } }]);
  });

  it("«Скрыть» on a new one: it stays off the page and is new no more; the audit says «decline»; later «Показать» is an ordinary «show»", async () => {
    await send();
    const [r] = await ours();
    expect(await setReviewHidden(query, demo.business.id, owner(), r.id, true)).toEqual({ ok: true, hidden: true });
    expect((await ours())[0]).toMatchObject({ hidden: true, pending: false });
    expect((await listReviews(query, demo.business, all({ shown: "hidden" }), owner())).rows.map((x) => x.id)).toEqual([r.id]);
    await setReviewHidden(query, demo.business.id, owner(), r.id, false);
    const audit = await query<{ action: string }>("select action from audit where entity = 'review' order by at");
    expect(audit.map((a) => a.action)).toEqual(["decline", "show"]);
  });

  it("only a login with «Удалять отзывы» approves", async () => {
    await send();
    const [r] = await ours();
    const o = owner();
    const without = { ...o, rights: { ...o.rights, on: new Set([...o.rights.on].filter((k) => k !== "reports.reviews.delete")) } };
    expect(await setReviewHidden(query, demo.business.id, without, r.id, false)).toEqual({ ok: false, code: "forbidden" });
    expect((await ours())[0]).toMatchObject({ hidden: true, pending: true });
  });
});

describe("POST /api/salon/reviews", () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    postReview(
      new Request("http://localhost/api/salon/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "192.0.2.50, 10.0.0.1", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );

  it("201 kept; 422 names the field; 400 for no object; 413 for too much; never cached or indexed", async () => {
    const ok = await post(good());
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ ok: true });
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(ok.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(await ours()).toHaveLength(1);

    const bad = await post(good({ text: "visit https://spam.example" }));
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({ error: "invalid", field: "link" });
    expect((await post("not json")).status).toBe(400);
    expect((await post([good()])).status).toBe(400);
    expect((await post({ ...good(), text: "x".repeat(9000) })).status).toBe(413);
    // a field of its own is not passed on: only the review's own fields reach it
    await post({ ...good({ name: "Другой Тест" }), hidden: false, pending: false, source: "altegio" }, { "x-real-ip": "192.0.2.51" });
    const rows = await ours();
    expect(rows[1]).toMatchObject({ author_name: "Другой Тест", source: "ours", hidden: true, pending: true });
  });

  it("429 once the address has sent its share", async () => {
    for (let i = 0; i < REVIEW_LIMITS.perHour; i++) expect((await post(good())).status).toBe(201);
    const r = await post(good());
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: "too_many" });
  });
});

describe("migration 035", () => {
  it("adds «pending» (always hidden too), the hash column and the database's own key", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "booking-035-"));
    const pg = await newPglite();
    try {
      for (const m of migrationFiles()) if (m.name < "035") writeFileSync(path.join(dir, m.name), m.sql);
      await migrate(pg, { dir });
      const [biz] = (await pg.query<{ id: string }>("insert into businesses (slug, name) values ('rv-035', 'Test Salon') returning id")).rows;
      await pg.query("insert into reviews (business_id, rating, author_name, created_at) values ($1, 5, 'Тест', now())", [biz.id]);
      expect(await migrate(pg)).toContain("035_review_moderation.sql");
      expect((await pg.query("select pending, hidden, ip_hash from reviews")).rows).toEqual([{ pending: false, hidden: false, ip_hash: null }]);
      await expect(pg.query("update reviews set pending = true, hidden = false")).rejects.toThrow();
      await expect(pg.query("update reviews set ip_hash = '192.0.2.1'")).rejects.toThrow();
      await pg.query(`update reviews set ip_hash = '${"a".repeat(64)}'`);
      const salt = (await pg.query<{ salt: string }>("select salt from review_salt")).rows;
      expect(salt).toHaveLength(1);
      expect(salt[0].salt).toMatch(/^[0-9a-f]{64}$/);
      await expect(pg.query("insert into review_salt (id, salt) values (false, $1)", ["b".repeat(64)])).rejects.toThrow();
    } finally {
      await pg.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
