"use server";

/**
 * The calendar's changes. Every action checks the login itself (never
 * trusts the page), copies each argument by name, and refreshes the
 * calendar on success.
 *
 * Rights (src/lib/auth/rights.ts): a visit's own are asked by
 * src/lib/admin/visits.ts, which is handed the login (`who`); blocking
 * time in the calendar is «Изменять график работы… в журнале», asked here.
 */
import { refresh } from "next/cache";
import { searchClients, type ClientHit } from "@/lib/admin/calendar";
import { visitExtras, type VisitExtras } from "@/lib/admin/visit-window";
import {
  adminCancelVisit,
  adminCreateVisit,
  adminSetStatus,
  adminUpdateVisit,
  addTimeOff,
  removeTimeOff,
  type AdminOutcome,
  type BlockResult,
} from "@/lib/admin/visits";
import { requireAdmin } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";
import { query } from "@/lib/db";

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
const str = (v: unknown) => (v == null ? null : String(v));
const ids = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

export type NewVisit = {
  staffId: string;
  start: number;
  serviceIds: string[];
  clientId: string | null;
  name: string;
  phone: string;
  comment: string;
  staffNote: string;
  smsReminder: boolean;
  idempotencyKey: string;
  force: boolean;
};

export async function createVisit(v: NewVisit): Promise<AdminOutcome> {
  const { user, business } = await requireAdmin();
  const r = await adminCreateVisit(
    business,
    {
      staffId: String(v?.staffId ?? ""),
      start: num(v?.start),
      serviceIds: ids(v?.serviceIds),
      clientId: str(v?.clientId),
      // a picked client is his id: what the form shows of him (a masked phone, maybe) is not read
      name: v?.clientId ? null : str(v?.name),
      phone: v?.clientId ? null : str(v?.phone),
      comment: str(v?.comment),
      staffNote: str(v?.staffNote),
      smsReminder: v?.smsReminder === true,
      idempotencyKey: String(v?.idempotencyKey ?? ""),
      force: v?.force === true,
    },
    user.id,
    { who: user },
  );
  if (r.ok) refresh();
  return r;
}

export type Patch = { staffId?: string; start?: number; serviceIds?: string[]; staffNote?: string; force?: boolean };

export async function updateVisit(id: string, p: Patch): Promise<AdminOutcome> {
  const { user, business } = await requireAdmin();
  const r = await adminUpdateVisit(
    business,
    String(id),
    {
      staffId: p?.staffId === undefined ? undefined : String(p.staffId),
      start: p?.start === undefined ? undefined : num(p.start),
      serviceIds: p?.serviceIds === undefined ? undefined : ids(p.serviceIds),
      staffNote: p?.staffNote === undefined ? undefined : String(p.staffNote),
      force: p?.force === true,
    },
    user.id,
    { who: user },
  );
  if (r.ok) refresh();
  return r;
}

export async function cancelVisit(id: string): Promise<string> {
  const { user, business } = await requireAdmin();
  const r = await adminCancelVisit(business, String(id), user.id, { who: user });
  refresh();
  return r;
}

/**
 * A visit's status. `confirmed` is «Клиент подтвердил» on a visit that
 * waits (true: «Подтвердил», false: «Ожидание»); left out, it stays as it
 * is. Any other status clears it (src/lib/admin/visits.ts).
 */
export async function setVisitStatus(id: string, status: string, confirmed?: boolean): Promise<boolean> {
  const { user, business } = await requireAdmin();
  const ok = await adminSetStatus(business, String(id), String(status), user.id, { who: user }, confirmed === undefined ? undefined : confirmed === true);
  if (ok) refresh();
  return ok;
}

/**
 * What the visit window shows beside the visit (src/lib/admin/visit-window.ts):
 * the client's numbers, his previous visit, who made this one, its history
 * and its messages. Null: not a visit this login may open.
 */
export async function visitWindowAction(id: string): Promise<VisitExtras | null> {
  const { user, business } = await requireAdmin();
  return visitExtras(query, business, user, String(id ?? ""));
}

export async function findClients(text: string): Promise<ClientHit[]> {
  const { user, business } = await requireAdmin();
  return searchClients(query, business.id, String(text ?? ""), user);
}

export async function addBlock(b: { staffId: string; from: number; to: number; kind: string; note: string }): Promise<BlockResult> {
  const { user, business } = await requireAdmin();
  if (!can(user, "journal.schedule") || !can(user, "journal.staff", { staffId: String(b?.staffId ?? "") })) return { ok: false, field: "forbidden" };
  const r = await addTimeOff(business, { staffId: String(b?.staffId ?? ""), from: num(b?.from), to: num(b?.to), kind: String(b?.kind ?? ""), note: str(b?.note) }, user.id);
  if (r.ok) refresh();
  return r;
}

export async function deleteBlock(id: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  if (!can(user, "journal.schedule")) return false;
  const ok = await removeTimeOff(business, String(id), user.id, { who: user });
  if (ok) refresh();
  return ok;
}
