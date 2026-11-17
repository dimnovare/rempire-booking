"use server";

import { redirect } from "next/navigation";
import { currentBusiness } from "@/lib/business";
import { isLocale } from "@/lib/i18n";
import { cancelByClient } from "@/lib/visits";

/**
 * The client cancels from their own link. The token is the only proof
 * needed, and cancelByClient checks it, the status and the cutoff again.
 */
export async function cancelVisit(locale: string, token: string): Promise<void> {
  const business = await currentBusiness();
  if (business) await cancelByClient(business, String(token));
  redirect(`/${isLocale(locale) ? locale : "ru"}/visit/${encodeURIComponent(String(token))}`);
}
