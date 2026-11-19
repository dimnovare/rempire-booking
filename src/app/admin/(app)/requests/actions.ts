"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";
import { answerRequest, type AnswerResult } from "@/lib/barber/requests";
import { setClientReminder } from "@/lib/client-push";
import { sendPushSoon } from "@/lib/outbox";

/**
 * Renat or the front desk answers a barber's request; the barber gets a
 * push. Answering is making the change: it needs the right the change needs
 * (src/lib/barber/requests.ts).
 */
export async function answer(id: string, verdict: string, note: string): Promise<AnswerResult> {
  const { user, business } = await requireAdmin();
  const r = await answerRequest(business, user.id, String(id ?? ""), String(verdict ?? ""), String(note ?? "").slice(0, 300), Date.now(), user);
  if (r.ok || r.code === "gone") refresh();
  if (r.ok) sendPushSoon();
  return r;
}

/** «Доступ к системным настройкам»: the client's reminder before a visit by SMS, by a notification on his phone, or both. */
export async function setReminder(value: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  if (!can(user, "settings.system")) return false;
  const ok = await setClientReminder(business, user.id, String(value ?? ""));
  if (ok) refresh();
  return ok;
}
