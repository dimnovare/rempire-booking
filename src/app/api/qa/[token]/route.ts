/**
 * Renat's answers (src/lib/owner-qa.ts).
 *
 *   GET /api/qa/<token>          → { label, answers: { field: { value, updatedAt } } }
 *   GET /api/qa/<token>?log=1    → the same, plus every earlier value
 *   PUT /api/qa/<token>  { field, value }  → { savedAt, changed }
 *
 * The token is the key: the page's own link. Nothing is cached.
 */
import { dbConfigured, query, withTx } from "@/lib/db";
import { cleanValue, findForm, loadAnswers, loadLog, saveAnswer } from "@/lib/owner-qa";

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: HEADERS });
const MAX_BODY = 24_000;

export async function GET(request: Request, ctx: RouteContext<"/api/qa/[token]">) {
  const { token } = await ctx.params;
  const form = dbConfigured() ? await findForm(query, token) : null;
  if (!form) return json({ error: "not_found" }, 404);
  const answers = await loadAnswers(query, form.id);
  const withLog = new URL(request.url).searchParams.get("log") === "1";
  return json({ label: form.label, answers, ...(withLog ? { log: await loadLog(query, form.id) } : {}) });
}

export async function PUT(request: Request, ctx: RouteContext<"/api/qa/[token]">) {
  const { token } = await ctx.params;
  const form = dbConfigured() ? await findForm(query, token) : null;
  if (!form) return json({ error: "not_found" }, 404);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: "too_long" }, 413);
  let body: { field?: unknown; value?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const field = typeof body?.field === "string" ? body.field : "";
  const value = cleanValue(field, body?.value);
  if (value === null) return json({ error: "bad_value", field }, 400);

  const saved = await withTx((q) => saveAnswer(q, form.id, field, value));
  return json(saved);
}
