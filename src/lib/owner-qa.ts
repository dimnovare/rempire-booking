/**
 * Renat's answers in the database (db/migrations/005_owner_qa.sql). The
 * questions themselves are in src/lib/owner-qa-content.ts.
 */
import { createHash } from "node:crypto";
import { jsonbParam, type Querier } from "@/lib/db";
import type { Value } from "@/lib/owner-qa-content";

export { cleanValue } from "@/lib/owner-qa-content";

// The link: /ru/q/<token>. Only the token's SHA-256 is stored.
const TOKEN_RE = /^[A-Za-z0-9_-]{4,100}$/;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type Form = { id: string; label: string };

export async function findForm(q: Querier, token: string): Promise<Form | null> {
  if (!TOKEN_RE.test(token)) return null;
  const rows = await q<Form>("select id, label from qa_forms where token_hash = $1", [hashToken(token)]);
  return rows[0] ?? null;
}

export type Saved = { value: Value; updatedAt: string };

const iso = (d: unknown) => new Date(d as string | Date).toISOString();

export async function loadAnswers(q: Querier, formId: string): Promise<Record<string, Saved>> {
  const rows = await q<{ field: string; value: Value; updated_at: Date }>(
    "select field, value, updated_at from qa_answers where form_id = $1",
    [formId],
  );
  return Object.fromEntries(rows.map((r) => [r.field, { value: r.value, updatedAt: iso(r.updated_at) }]));
}

export type LogEntry = { field: string; value: Value; savedAt: string };

export async function loadLog(q: Querier, formId: string): Promise<LogEntry[]> {
  const rows = await q<{ field: string; value: Value; saved_at: Date }>(
    "select field, value, saved_at from qa_answer_log where form_id = $1 order by saved_at, id",
    [formId],
  );
  return rows.map((r) => ({ field: r.field, value: r.value, savedAt: iso(r.saved_at) }));
}

/**
 * Store one field. The same value again (a retry, a blur) changes nothing
 * and adds no log line. `q` should be a transaction (withTx).
 */
export async function saveAnswer(q: Querier, formId: string, field: string, value: Value): Promise<{ savedAt: string; changed: boolean }> {
  const json = jsonbParam(value);
  const up = await q<{ updated_at: Date }>(
    `insert into qa_answers (form_id, field, value) values ($1, $2, $3::jsonb)
     on conflict (form_id, field) do update set value = excluded.value, updated_at = now()
       where qa_answers.value is distinct from excluded.value
     returning updated_at`,
    [formId, field, json],
  );
  if (up.length) {
    await q("insert into qa_answer_log (form_id, field, value) values ($1, $2, $3::jsonb)", [formId, field, json]);
    return { savedAt: iso(up[0].updated_at), changed: true };
  }
  const same = await q<{ updated_at: Date }>("select updated_at from qa_answers where form_id = $1 and field = $2", [formId, field]);
  return { savedAt: iso(same[0].updated_at), changed: false };
}
