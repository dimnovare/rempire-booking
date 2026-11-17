"use server";

/**
 * What a barber does to his own visits. Every action asks requireStaff()
 * which column this login may touch and passes it down: a visit id from
 * another barber's column is refused under the row lock, as if it did not
 * exist. The rules for a booking, a move and a cancel are the admin's
 * (src/lib/admin/visits.ts, via src/lib/barber/book.ts); the client gets
 * the same letters.
 */
import { refresh } from "next/cache";
import { adminSetStatus, isUuid, type AdminOutcome } from "@/lib/admin/visits";
import { requireStaff } from "@/lib/auth/current";
import { barberBook, barberCancel, barberFreeStarts, barberMove, searchMyClients, type MyClient, type NewVisitInput, type StartsAnswer } from "@/lib/barber/book";
import { clientCard, setClientNote, setVisitNote, type ClientCard } from "@/lib/barber/clients";
import { query } from "@/lib/db";

export async function setVisitStatus(visitId: string, status: string): Promise<boolean> {
  const { user, business, staff } = await requireStaff();
  const ok = await adminSetStatus(business, String(visitId), String(status), user.id, { onlyStaffId: staff.id });
  if (ok) refresh();
  return ok;
}

/** Free start times on a day: for these services, or for moving this visit. */
export async function freeStarts(date: string, what: { serviceIds?: string[]; visitId?: string }): Promise<StartsAnswer> {
  const { business, staff } = await requireStaff();
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
  const { business, staff } = await requireStaff();
  return searchMyClients(query, business.id, staff.id, String(text ?? ""));
}

/** A walk-in or the client's next visit, in his own column. */
export async function bookVisit(v: NewVisitInput): Promise<AdminOutcome> {
  const { user, business, staff } = await requireStaff();
  const out = await barberBook(business, staff.id, user.id, v);
  if (out.ok) refresh();
  return out;
}

/** Move one of his visits to another time. */
export async function moveVisit(visitId: string, start: number, force = false): Promise<AdminOutcome> {
  const { user, business, staff } = await requireStaff();
  const out = await barberMove(business, staff.id, user.id, String(visitId), Number(start), force === true);
  if (out.ok) refresh();
  return out;
}

/** The emergency cancel, with a reason. */
export async function cancelVisit(visitId: string, reason: string): Promise<"cancelled" | "already" | "not_found" | "reason"> {
  const { user, business, staff } = await requireStaff();
  const out = await barberCancel(business, staff.id, user.id, String(visitId), String(reason ?? ""));
  if (out === "cancelled") refresh();
  return out;
}

/** The card of a client of his (B6): null for anyone without a visit in his column. */
export async function loadClientCard(clientId: string): Promise<ClientCard | null> {
  const { business, staff } = await requireStaff();
  return clientCard(query, business, staff.id, String(clientId ?? ""));
}

/** The one shared note about a client of his; every barber and Renat see it. */
export async function saveClientNote(clientId: string, note: string): Promise<boolean> {
  const { user, business, staff } = await requireStaff();
  const ok = await setClientNote(business, staff.id, user.id, String(clientId ?? ""), String(note ?? ""));
  if (ok) refresh();
  return ok;
}

/** The note on one of his own visits. */
export async function saveVisitNote(visitId: string, note: string): Promise<boolean> {
  const { user, business, staff } = await requireStaff();
  const ok = await setVisitNote(business, staff.id, user.id, String(visitId ?? ""), String(note ?? ""));
  if (ok) refresh();
  return ok;
}
