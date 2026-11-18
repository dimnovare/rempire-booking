"use server";

/**
 * «Сообщить о проблеме» (src/lib/problem-reports.ts): any login, admin or
 * barber app, on staging only.
 */
import { headers } from "next/headers";
import { refresh } from "next/cache";
import { currentStaffUser, requireOwner } from "@/lib/auth/current";
import { query } from "@/lib/db";
import { openReportCount, saveReport, setReportDone } from "@/lib/problem-reports";
import { testRun } from "@/lib/test-run";

export type ReportDone = { ok: true } | { ok: false; code: "off" | "login" | "empty" | "too_many" };

export async function reportProblemAction(input: { app: "admin" | "b"; path: string; text: string }): Promise<ReportDone> {
  if (!testRun()) return { ok: false, code: "off" };
  const user = await currentStaffUser();
  if (!user) return { ok: false, code: "login" };
  const userAgent = (await headers()).get("user-agent") ?? "";
  const r = await saveReport(
    query,
    { businessId: user.businessId, userId: user.id, email: user.email, role: user.role },
    { app: input?.app === "b" ? "b" : "admin", path: String(input?.path ?? ""), text: String(input?.text ?? ""), userAgent },
  );
  return r.ok ? { ok: true } : { ok: false, code: r.code };
}

/** For Renat only: how many reports are still open (the link in the sheet). Null for anyone else. */
export async function reportsInfoAction(): Promise<number | null> {
  if (!testRun()) return null;
  const user = await currentStaffUser();
  if (!user || user.role !== "owner") return null;
  return openReportCount(query, user.businessId);
}

/** Renat ticks a report off at /admin/reports, or opens it again. */
export async function reportDoneAction(id: string, done: boolean): Promise<boolean> {
  const { business } = await requireOwner();
  const ok = await setReportDone(query, business.id, String(id ?? ""), done === true);
  if (ok) refresh();
  return ok;
}
