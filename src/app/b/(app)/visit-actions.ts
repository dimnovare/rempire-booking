"use server";

/**
 * What a barber does to his own visits. Every action asks requireStaff()
 * which column this login may touch and passes it down: a visit id from
 * another barber's column is refused under the row lock, as if it did not
 * exist. The rules for a booking, a move and a cancel are the admin's
 * (src/lib/admin/visits.ts, via src/lib/barber/book.ts); the client gets
 * the same letters. The login goes down with each call: its rights are
 * asked where the change is made (src/lib/auth/rights.ts).
 */
import { refresh } from "next/cache";
import { adminSetStatus, adminUpdateVisit, isUuid, type AdminOutcome } from "@/lib/admin/visits";
import { requireStaff } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";
import { barberBook, barberCancel, barberFreeStarts, barberMove, searchMyClients, type MyClient, type NewVisitInput, type StartsAnswer } from "@/lib/barber/book";
import { clientCard, setClientNote, setVisitNote, type ClientCard } from "@/lib/barber/clients";
import { query } from "@/lib/db";

/**
 * A visit's status. `confirmed` is «Подтвердил» on a visit that waits
 * (true: «Подтвердил», false: «Ожидание»); left out, it stays as it is. Any
 * other status clears it (src/lib/admin/visits.ts).
 */
export async function setVisitStatus(visitId: string, status: string, confirmed?: boolean): Promise<boolean> {
  const { user, business, staff } = await requireStaff();
  const ok = await adminSetStatus(business, String(visitId), String(status), user.id, { onlyStaffId: staff.id, who: user }, confirmed === undefined ? undefined : confirmed === true);
  if (ok) refresh();
  return ok;
}

/**
 * The services of one of his visits («+ Добавить услугу», «Убрать услугу»
 * in the visit sheet): his own prices and times, as the admin's window
 * (adminUpdateVisit, with the right «visit.edit.services»). `force`: the
 * «anyway» answer to his hours or a break.
 */
export async function setVisitServices(visitId: string, serviceIds: string[], force = false): Promise<AdminOutcome> {
  const { user, business, staff } = await requireStaff();
  const ids = Array.isArray(serviceIds) ? serviceIds.map(String) : [];
  if (!ids.length || !ids.every(isUuid)) return { ok: false, code: "invalid", field: "services" };
  const out = await adminUpdateVisit(business, String(visitId), { serviceIds: ids, force: force === true }, user.id, { onlyStaffId: staff.id, who: user });
  if (out.ok) refresh();
  return out;
}

/** Free start times on a day: for these services, or for moving this visit. */
export async function freeStarts(date: string, what: { serviceIds?: string[]; visitId?: string }): Promise<StartsAnswer> {
  const { user, business, staff } = await requireStaff();
  if (!can(user, "journal.staff", { staffId: staff.id })) return { ok: false, code: "not_found" };
  if (what?.visitId !== undefined) {
    if (!isUuid(what.visitId)) return { ok: false, code: "not_found" };
    return barberFreeStarts(query, business, staff.id, String(date), { visitId: what.visitId });
  }
  const ids = Array.isArray(what?.serviceIds) ? what.serviceIds.map(String) : [];
  if (!ids.every(isUuid)) return { ok: false, code: "invalid" };
  return barberFreeStarts(query, business, staff.id, String(date), { serviceIds: ids });
}

/** His own clients, by phone digits or name. */
export async function findMyClients(text: string): Promise<MyClient[]> {
  const { user, business, staff } = await requireStaff();
  return searchMyClients(query, business.id, staff.id, String(text ?? ""), user);
}

/** A walk-in or the client's next visit, in his own column. */
export async function bookVisit(v: NewVisitInput): Promise<AdminOutcome> {
  const { user, business, staff } = await requireStaff();
  const out = await barberBook(business, staff.id, user.id, v, user);
  if (out.ok) refresh();
  return out;
}

/** Move one of his visits to another time. */
export async function moveVisit(visitId: string, start: number, force = false): Promise<AdminOutcome> {
  const { user, business, staff } = await requireStaff();
  const out = await barberMove(business, staff.id, user.id, String(visitId), Number(start), force === true, user);
  if (out.ok) refresh();
  return out;
}

/** The emergency cancel, with a reason. */
export async function cancelVisit(visitId: string, reason: string): Promise<"cancelled" | "already" | "not_found" | "reason" | "forbidden"> {
  const { user, business, staff } = await requireStaff();
  const out = await barberCancel(business, staff.id, user.id, String(visitId), String(reason ?? ""), user);
  if (out === "cancelled") refresh();
  return out;
}

/** The card of a client of his (B6): null for anyone without a visit in his column. */
export async function loadClientCard(clientId: string): Promise<ClientCard | null> {
  const { user, business, staff } = await requireStaff();
  return clientCard(query, business, staff.id, String(clientId ?? ""), Date.now(), user);
}

/** The one shared note about a client of his; every barber and Renat see it. */
export async function saveClientNote(clientId: string, note: string): Promise<boolean> {
  const { user, business, staff } = await requireStaff();
  const ok = await setClientNote(business, staff.id, user.id, String(clientId ?? ""), String(note ?? ""), user);
  if (ok) refresh();
  return ok;
}

/** The note on one of his own visits. */
export async function saveVisitNote(visitId: string, note: string): Promise<boolean> {
  const { user, business, staff } = await requireStaff();
  const ok = await setVisitNote(business, staff.id, user.id, String(visitId ?? ""), String(note ?? ""), user);
  if (ok) refresh();
  return ok;
}
