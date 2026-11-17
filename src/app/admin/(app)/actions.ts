"use server";

/**
 * The calendar's changes. Every action checks the login itself (never
 * trusts the page), copies each argument by name, and refreshes the
 * calendar on success.
 */
import { refresh } from "next/cache";
import { searchClients, type ClientHit } from "@/lib/admin/calendar";
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
      name: str(v?.name),
      phone: str(v?.phone),
      comment: str(v?.comment),
      staffNote: str(v?.staffNote),
      smsReminder: v?.smsReminder === true,
      idempotencyKey: String(v?.idempotencyKey ?? ""),
      force: v?.force === true,
    },
    user.id,
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
  );
  if (r.ok) refresh();
  return r;
}

export async function cancelVisit(id: string): Promise<string> {
  const { user, business } = await requireAdmin();
  const r = await adminCancelVisit(business, String(id), user.id);
  refresh();
  return r;
}

export async function setVisitStatus(id: string, status: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  const ok = await adminSetStatus(business, String(id), String(status), user.id);
  if (ok) refresh();
  return ok;
}

export async function findClients(text: string): Promise<ClientHit[]> {
  const { business } = await requireAdmin();
  return searchClients(query, business.id, String(text ?? ""));
}

export async function addBlock(b: { staffId: string; from: number; to: number; kind: string; note: string }): Promise<BlockResult> {
  const { user, business } = await requireAdmin();
  const r = await addTimeOff(business, { staffId: String(b?.staffId ?? ""), from: num(b?.from), to: num(b?.to), kind: String(b?.kind ?? ""), note: str(b?.note) }, user.id);
  if (r.ok) refresh();
  return r;
}

export async function deleteBlock(id: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  const ok = await removeTimeOff(business, String(id), user.id);
  if (ok) refresh();
  return ok;
}
