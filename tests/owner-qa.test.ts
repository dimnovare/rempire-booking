import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET, PUT } from "@/app/api/qa/[token]/route";
import { closeDb, query, withTx } from "@/lib/db";
import { findForm, hashToken, loadAnswers, loadLog, saveAnswer } from "@/lib/owner-qa";
import { cleanValue, FIELDS, INTRO, QUESTIONS } from "@/lib/owner-qa-content";
import { DEMO_QA, OWNER_QA, seedOwnerQa } from "../tools/seed-demo.mjs";
import { freshDemo } from "./helpers";

const TOKEN = "test-token-for-renat";
let formId: string;

beforeEach(async () => {
  await freshDemo();
  await seedOwnerQa({ query: async (sql: string, p?: unknown[]) => ({ rows: await query(sql, p) }) }, [
    { label: "test", tokenHash: hashToken(TOKEN) },
  ]);
  formId = (await findForm(query, TOKEN))!.id;
});
afterAll(closeDb);

const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const put = (token: string, body: unknown) =>
  PUT(new Request(`http://x/api/qa/${token}`, { method: "PUT", body: JSON.stringify(body) }), ctx(token));

describe("the questions", () => {
  it("are as many as the intro says, each field a key the table accepts", () => {
    expect(INTRO).toContain(`${QUESTIONS.length} коротких вопросов`);
    for (const key of FIELDS.keys()) expect(key).toMatch(/^[a-z_]{1,30}\.[a-z_]{1,30}$/);
    expect(FIELDS.has("telegram.how")).toBe(true);
    expect(FIELDS.has("decided.note")).toBe(true);
    // 20.11: the switch before Altegio renews, then what the test run waits on
    expect(QUESTIONS.slice(0, 2).map((q) => q.id)).toEqual(["switch", "emails"]);
    expect(cleanValue("switch.ok", "Да")).toBe("Да");
    expect(cleanValue("switch.ok", "Добавил")).toBeNull();
    // the first set's closed questions are off the page; their answers stay in the table
    for (const gone of ["access.altegio", "costs.isolta", "universal.who", "altegio_extra.cash"]) expect(FIELDS.has(gone)).toBe(false);
    expect(cleanValue("emails.who", "Сначала я сам")).toBe("Сначала я сам");
    expect(cleanValue("emails.who", "Все")).toBeNull();
    expect(cleanValue("emails.list", "Valentin — valentin@example.test")).toBe("Valentin — valentin@example.test");
    // 18.11: a possible addition, asked before it is built; «Что ещё важно» stays last
    expect(QUESTIONS.slice(-2).map((q) => q.id)).toEqual(["qr", "extra"]);
    expect(cleanValue("qr.want", "Пока не нужна")).toBe("Пока не нужна");
    expect(cleanValue("qr.want", "Да")).toBeNull();
  });

  it("take only what the page offers", () => {
    expect(cleanValue("nope.x", "a")).toBeNull();
    expect(cleanValue("commission.vat", "От цены без НДС")).toBe("От цены без НДС");
    expect(cleanValue("commission.vat", "")).toBe("");
    expect(cleanValue("commission.vat", "something else")).toBeNull();
    expect(cleanValue("commission.vat", ["От цены без НДС"])).toBeNull();
    // many: the page's order, no repeats, nothing it never offered
    expect(cleanValue("self.may", ["Цены своих услуг", "Свой график", "Свой график"])).toEqual(["Свой график", "Цены своих услуг"]);
    expect(cleanValue("self.may", ["Всё"])).toBeNull();
    expect(cleanValue("extra.note", "x".repeat(5000))).toHaveLength(5000);
    expect(cleanValue("extra.note", "x".repeat(5001))).toBeNull();
    expect(cleanValue("skipped.need", ["Акции", "Расчёт зарплат"])).toEqual(["Расчёт зарплат", "Акции"]);
    expect(cleanValue("switch.isolta", "в марте")).toBe("в марте");
  });
});

describe("the link", () => {
  it("opens only with its token; only the hash is stored", async () => {
    expect(await findForm(query, TOKEN)).toMatchObject({ label: "test" });
    expect(await findForm(query, "test-token-for-renaT")).toBeNull();
    expect(await findForm(query, "bad token!")).toBeNull();
    const stored = await query<{ token_hash: string }>("select token_hash from qa_forms");
    expect(stored.map((r) => r.token_hash)).not.toContain(TOKEN);
  });

  it("Renat's and the demo form are hashes, never tokens", () => {
    for (const f of [...OWNER_QA, DEMO_QA]) expect(f.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("saving", () => {
  it("keeps the latest value and logs every change, not repeats", async () => {
    const a = await withTx((q) => saveAnswer(q, formId, "extra.note", "первое"));
    const again = await withTx((q) => saveAnswer(q, formId, "extra.note", "первое"));
    const b = await withTx((q) => saveAnswer(q, formId, "extra.note", "первое и ещё"));
    expect([a.changed, again.changed, b.changed]).toEqual([true, false, true]);
    expect(again.savedAt).toBe(a.savedAt);

    const answers = await loadAnswers(query, formId);
    expect(answers["extra.note"].value).toBe("первое и ещё");
    const log = await loadLog(query, formId);
    expect(log.map((l) => l.value)).toEqual(["первое", "первое и ещё"]);
  });

  it("stores lists as lists", async () => {
    await withTx((q) => saveAnswer(q, formId, "self.may", ["Свой график"]));
    expect((await loadAnswers(query, formId))["self.may"].value).toEqual(["Свой график"]);
  });
});

describe("/api/qa/<token>", () => {
  it("PUT saves, GET reads back, ?log=1 adds the history", async () => {
    const res = await put(TOKEN, { field: "telegram.how", value: "В Telegram" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ changed: true });
    await put(TOKEN, { field: "telegram.how", value: "И там, и там" });

    const got = await (await GET(new Request(`http://x/api/qa/${TOKEN}`), ctx(TOKEN))).json();
    expect(got.answers["telegram.how"].value).toBe("И там, и там");
    expect(got.log).toBeUndefined();
    const withLog = await (await GET(new Request(`http://x/api/qa/${TOKEN}?log=1`), ctx(TOKEN))).json();
    expect(withLog.log.map((l: { value: string }) => l.value)).toEqual(["В Telegram", "И там, и там"]);
  });

  it("refuses a wrong token, an unknown field, a value never offered, bad JSON", async () => {
    expect((await put("wrong-token", { field: "extra.note", value: "x" })).status).toBe(404);
    expect((await GET(new Request("http://x/api/qa/wrong-token"), ctx("wrong-token"))).status).toBe(404);
    expect((await put(TOKEN, { field: "admin.role", value: "x" })).status).toBe(400);
    expect((await put(TOKEN, { field: "telegram.how", value: "SMS" })).status).toBe(400);
    const bad = await PUT(new Request(`http://x/api/qa/${TOKEN}`, { method: "PUT", body: "{" }), ctx(TOKEN));
    expect(bad.status).toBe(400);
    expect(await loadAnswers(query, formId)).toEqual({});
  });
});
