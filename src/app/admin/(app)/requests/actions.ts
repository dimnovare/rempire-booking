"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth/current";
import { answerRequest, type AnswerResult } from "@/lib/barber/requests";
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
