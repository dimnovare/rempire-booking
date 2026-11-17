"use server";

import { redirect } from "next/navigation";
import { currentBusiness } from "@/lib/business";
import { isLocale } from "@/lib/i18n";
import { sendPushSoon } from "@/lib/outbox";
import { cancelByClient } from "@/lib/visits";

/**
 * The client cancels from their own link. The token is the only proof
 * needed, and cancelByClient checks it, the status and the cutoff again.
 */
export async function cancelVisit(locale: string, token: string): Promise<void> {
  const business = await currentBusiness();
  // the barber's push goes right after this answer, not at the next cron run
  if (business && (await cancelByClient(business, String(token))) === "cancelled") sendPushSoon();
  redirect(`/${isLocale(locale) ? locale : "ru"}/visit/${encodeURIComponent(String(token))}`);
}
