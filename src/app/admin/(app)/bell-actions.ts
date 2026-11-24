"use server";

/**
 * The bell in the sidebar head (bell.tsx; src/lib/bell.ts): how many rows
 * are unread, asked on mount and every minute; and the rows themselves,
 * when it opens, which also marks them read. A login sees only its own.
 *
 * The bell asks by itself, while nobody is clicking: a login that has
 * ended or lost the admin gets nothing back, never a redirect.
 */
import { currentStaffUser } from "@/lib/auth/current";
import { canUseAdmin } from "@/lib/auth/sessions";
import { bellUnread, openBell, type BellItem } from "@/lib/bell";
import { currentBusiness } from "@/lib/business";
import { dbConfigured, query } from "@/lib/db";
import { adminLang } from "../lang-server";

async function me() {
  if (!dbConfigured()) return null;
  const user = await currentStaffUser();
  if (!user || !canUseAdmin(user)) return null;
  const business = await currentBusiness();
  if (!business || business.id !== user.businessId) return null;
  return { user, business };
}

/** The red dot: how many unread, or null when there is no login to ask for. */
export async function bellStateAction(): Promise<{ unread: number } | null> {
  const ctx = await me();
  return ctx ? { unread: await bellUnread(query, ctx.user.id, ctx.business.id) } : null;
}

export type BellOpened = { items: BellItem[]; tz: string; now: number };

/** The bell opened: its rows, newest first, in the login's language; then all of them read. */
export async function bellOpenAction(): Promise<BellOpened | null> {
  const ctx = await me();
  if (!ctx) return null;
  const now = Date.now();
  return { items: await openBell(query, ctx.user.id, ctx.business.id, await adminLang(), now), tz: ctx.business.timezone, now };
}
