"use server";

/**
 * «Уведомления»: the one change, a type's switch from the list
 * or its page's «Сохранить». The arguments are copied by name; the store
 * (src/lib/admin/notification-store.ts) checks the login's rights for each
 * channel the change touches and every value itself.
 */
import { refresh } from "next/cache";
import { saveType, type SaveResult } from "@/lib/admin/notification-store";
import type { TypeChange } from "@/lib/admin/notifications";
import { requireAdmin } from "@/lib/auth/current";

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Only the fields a change has, by name; their kinds are checked by the store. */
function changeOf(raw: unknown): TypeChange {
  const o = obj(raw) ?? {};
  const c: Record<string, unknown> = {};
  for (const k of ["on", "at", "delay", "mode", "sms"]) if (k in o) c[k] = o[k];
  const ch = obj(o.channels);
  if (ch) c.channels = Object.fromEntries(["sms", "email", "push"].filter((k) => k in ch).map((k) => [k, ch[k]]));
  else if ("channels" in o) c.channels = o.channels;
  const lead = obj(o.lead);
  if (lead) c.lead = Object.fromEntries(["sms", "email"].filter((k) => k in lead).map((k) => [k, lead[k]]));
  else if ("lead" in o) c.lead = o.lead;
  return c as TypeChange;
}

export async function saveTypeAction(type: string, change: TypeChange): Promise<SaveResult> {
  const { user, business } = await requireAdmin();
  const r = await saveType(business, user, String(type ?? ""), changeOf(change));
  if (r.ok && r.changed.length) refresh();
  return r;
}
