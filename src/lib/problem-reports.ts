/**
 * «Сообщить о проблеме» (docs/test-run.md): during the staging test run a
 * barber or Renat writes what went wrong, from the screen it went wrong on.
 * Booking keeps the text, the screen (path), the login and the time; Renat
 * sees them at /admin/reports, and Claude reads them back from there. Only
 * on staging (src/lib/test-run.ts); never deleted, only ticked off.
 */
import type { Querier } from "./db";

export type ProblemReport = {
  id: string;
  email: string;
  role: string;
  app: "admin" | "b";
  path: string;
  text: string;
  userAgent: string;
  doneAt: string | null;
  createdAt: string;
};

type Row = { id: string; email: string; role: string; app: "admin" | "b"; path: string; text: string; user_agent: string; done_at: Date | null; created_at: Date };

const reportOf = (r: Row): ProblemReport => ({
  id: r.id,
  email: r.email,
  role: r.role,
  app: r.app,
  path: r.path,
  text: r.text,
  userAgent: r.user_agent,
  doneAt: r.done_at ? new Date(r.done_at).toISOString() : null,
  createdAt: new Date(r.created_at).toISOString(),
});

export const REPORTS = {
  maxText: 4000,
  /** one login's reports per hour: a stuck button can't fill the table */
  perHour: 30,
};

export type ReportInput = { app: string; path: string; text: string; userAgent?: string };

export async function saveReport(
  q: Querier,
  who: { businessId: string; userId: string; email: string; role: string },
  input: ReportInput,
  now = Date.now(),
): Promise<{ ok: true; id: string } | { ok: false; code: "empty" | "too_many" }> {
  const text = String(input.text ?? "").replace(/\r\n?/g, "\n").trim().slice(0, REPORTS.maxText);
  if (!text) return { ok: false, code: "empty" };
  const app = input.app === "b" ? "b" : "admin";
  // the screen without its query: a link token never lands here
  const path = String(input.path ?? "").split(/[?#]/)[0].slice(0, 500);
  const [{ n }] = await q<{ n: number }>("select count(*)::int as n from problem_reports where user_id = $1 and created_at > $2", [who.userId, new Date(now - 3_600_000)]);
  if (n >= REPORTS.perHour) return { ok: false, code: "too_many" };
  const [row] = await q<{ id: string }>(
    `insert into problem_reports (business_id, user_id, email, role, app, path, text, user_agent, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [who.businessId, who.userId, who.email.slice(0, 254), who.role.slice(0, 20), app, path, text, String(input.userAgent ?? "").slice(0, 400), new Date(now)],
  );
  return { ok: true, id: row.id };
}

/** Newest first; the open ones before the ticked-off ones. */
export async function listReports(q: Querier, businessId: string, limit = 200): Promise<ProblemReport[]> {
  const rows = await q<Row>(
    `select id, email, role, app, path, text, user_agent, done_at, created_at from problem_reports
      where business_id = $1 order by (done_at is not null), created_at desc limit $2`,
    [businessId, limit],
  );
  return rows.map(reportOf);
}

export async function openReportCount(q: Querier, businessId: string): Promise<number> {
  const [{ n }] = await q<{ n: number }>("select count(*)::int as n from problem_reports where business_id = $1 and done_at is null", [businessId]);
  return n;
}

/** Tick a report off, or open it again. */
export async function setReportDone(q: Querier, businessId: string, id: string, done: boolean, now = Date.now()): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const rows = await q("update problem_reports set done_at = $3 where id = $1 and business_id = $2 returning id", [id, businessId, done ? new Date(now) : null]);
  return rows.length > 0;
}
