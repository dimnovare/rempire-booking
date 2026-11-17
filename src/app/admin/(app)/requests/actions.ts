"use server";

import { refresh } from "next/cache";
import { requireAdmin, requireOwner } from "@/lib/auth/current";
import { answerRequest, setBarberSelf, type AnswerResult } from "@/lib/barber/requests";
import { sendPushSoon } from "@/lib/outbox";

/** Renat or the front desk answers a barber's request; the barber gets a push. */
export async function answer(id: string, verdict: string, note: string): Promise<AnswerResult> {
  const { user, business } = await requireAdmin();
  const r = await answerRequest(business, user.id, String(id ?? ""), String(verdict ?? ""), String(note ?? "").slice(0, 300));
  if (r.ok || r.code === "gone") refresh();
  if (r.ok) sendPushSoon();
  return r;
}

/** Owner only: what barbers change themselves and what waits for him. */
export async function setSelf(key: string, value: string): Promise<boolean> {
  const { user, business } = await requireOwner();
  const ok = await setBarberSelf(business, user.id, String(key ?? ""), String(value ?? ""));
  if (ok) refresh();
  return ok;
}
