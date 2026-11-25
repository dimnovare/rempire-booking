"use server";

/**
 * The bell in the sidebar head (bell.tsx; src/lib/bell.ts): how many rows
 * are unread, asked on mount and every minute; the panel's first view and
 * the pages of «Показать полностью»; and the rows read, one by one or a
 * group at a time. A login sees and reads only its own.
 *
 * The bell asks by itself, while nobody is clicking: a login that has
 * ended or lost the admin gets nothing back, never a redirect.
 */
import { currentStaffUser } from "@/lib/auth/current";
import { canUseAdmin } from "@/lib/auth/sessions";
import {
  BELL_FILTERS,
  BELL_GROUPS,
  bellPage,
  bellSummary,
  bellUnread,
  readBell,
  readBellGroup,
  type BellCursor,
  type BellFilter,
  type BellGroup,
  type BellItem,
  type BellSummary,
} from "@/lib/bell";
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

const isGroup = (g: unknown): g is BellGroup => (BELL_GROUPS as readonly unknown[]).includes(g);
const isFilter = (f: unknown): f is BellFilter => (BELL_FILTERS as readonly unknown[]).includes(f);
const isCursor = (c: unknown): c is BellCursor =>
  !!c && typeof c === "object" && /^\d{1,20}$/.test(String((c as BellCursor).us)) && /^\d{1,18}$/.test(String((c as BellCursor).id));

/** The red dot: how many unread, or null when there is no login to ask for. */
export async function bellStateAction(): Promise<{ unread: number } | null> {
  const ctx = await me();
  return ctx ? { unread: await bellUnread(query, ctx.user.id, ctx.business.id) } : null;
}

export type BellOpened = BellSummary & { tz: string; now: number };

/** The panel opened: each group's unread count and newest rows, in the login's language. Reads nothing. */
export async function bellOpenAction(): Promise<BellOpened | null> {
  const ctx = await me();
  if (!ctx) return null;
  const now = Date.now();
  return { ...(await bellSummary(query, ctx.user.id, ctx.business.id, await adminLang(), now)), tz: ctx.business.timezone, now };
}

export type BellPaged = { items: BellItem[]; next: BellCursor | null; unread: number; tz: string; now: number };

/** «Показать полностью»: one page of a group, by a filter for the visits. */
export async function bellPageAction(group: BellGroup, filter: BellFilter, after: BellCursor | null): Promise<BellPaged | null> {
  if (!isGroup(group) || !isFilter(filter) || (after !== null && !isCursor(after))) return null;
  const ctx = await me();
  if (!ctx) return null;
  const now = Date.now();
  const page = await bellPage(query, ctx.user.id, ctx.business.id, await adminLang(), group, filter, after, now);
  return { ...page, unread: await bellUnread(query, ctx.user.id, ctx.business.id, now, group), tz: ctx.business.timezone, now };
}

/** Rows read: these, or a whole group («Прочитать все»). The new count for the dot. */
export async function bellReadAction(what: { ids: string[] } | { group: BellGroup }): Promise<{ unread: number } | null> {
  const ctx = await me();
  if (!ctx) return null;
  if ("group" in what) {
    if (!isGroup(what.group)) return null;
    await readBellGroup(query, ctx.user.id, ctx.business.id, what.group);
  } else {
    if (!Array.isArray(what.ids) || what.ids.length > 100) return null;
    await readBell(query, ctx.user.id, ctx.business.id, what.ids.map(String));
  }
  return { unread: await bellUnread(query, ctx.user.id, ctx.business.id) };
}
