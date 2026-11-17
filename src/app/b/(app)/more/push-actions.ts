"use server";

/**
 * Notifications on this phone (B5). Each action asks for the login itself
 * and touches only that login's phones and switches.
 */
import { refresh } from "next/cache";
import { requireStaffUser } from "@/lib/auth/current";
import { query } from "@/lib/db";
import { cleanSubscription, pushConfigured, removeSubscription, saveSubscription, sendPushToUser, setNotify } from "@/lib/push";
import { COPY } from "../../copy";
import { barberLang } from "../../lang-server";

export type PushAnswer = { ok: true } | { ok: false; code: "not_configured" | "invalid" | "error" };

export async function subscribePush(subscription: unknown, label: string): Promise<PushAnswer> {
  const { user } = await requireStaffUser();
  // never «on» while nothing can reach the phone
  if (!pushConfigured()) return { ok: false, code: "not_configured" };
  const sub = cleanSubscription(subscription, label);
  if (!sub) return { ok: false, code: "invalid" };
  try {
    await saveSubscription(query, user.id, sub);
  } catch {
    return { ok: false, code: "error" };
  }
  refresh();
  return { ok: true };
}

export async function unsubscribePush(endpoint: string): Promise<boolean> {
  const { user } = await requireStaffUser();
  const ok = await removeSubscription(query, user.id, String(endpoint));
  refresh();
  return ok;
}

export async function setPushKind(kind: string, on: boolean): Promise<boolean> {
  const { user, business } = await requireStaffUser();
  const ok = await setNotify(query, business.id, user.id, String(kind), on === true);
  if (ok) refresh();
  return ok;
}

/** A test push to this login's phones: how many took it. */
export async function testPush(): Promise<{ sent: number; devices: number }> {
  const { user } = await requireStaffUser();
  if (!pushConfigured()) return { sent: 0, devices: 0 };
  const B = COPY[await barberLang()];
  try {
    const r = await sendPushToUser(query, user.id, { title: B.push.testTitle, body: B.push.testBody, url: "/b/more", tag: "test" });
    return { sent: r.sent, devices: r.devices };
  } catch {
    return { sent: 0, devices: 1 };
  }
}
