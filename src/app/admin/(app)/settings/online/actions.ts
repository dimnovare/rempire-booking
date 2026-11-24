"use server";

/**
 * «Настройки → Онлайн-запись»: its one change, the page's values as they
 * stand (they save by themselves, autosave.tsx). The login and the switch
 * of the group «Онлайн-запись» are asked here and again by the store
 * (src/lib/admin/online-settings.ts), which checks every value; the
 * arguments are copied by name.
 */
import { refresh } from "next/cache";
import { ONLINE_KEYS, onlineMay, saveOnlineSettings, type OnlineKey, type OnlineSaved } from "@/lib/admin/online-settings";
import { requireAdmin } from "@/lib/auth/current";

export async function saveOnlineAction(input: Partial<Record<OnlineKey, unknown>>): Promise<OnlineSaved> {
  const { user, business } = await requireAdmin();
  if (!onlineMay(user)) return { ok: false, field: "forbidden" };
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const asked: Partial<Record<OnlineKey, unknown>> = {};
  for (const k of ONLINE_KEYS) if (k in o) asked[k] = o[k];
  const r = await saveOnlineSettings(business, user, asked);
  if (r.ok && r.changed.length) refresh();
  return r;
}
