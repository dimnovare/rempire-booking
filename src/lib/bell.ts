/**
 * The bell in the admin's sidebar head (046_bell.sql; the bell itself is
 * src/app/admin/(app)/bell.tsx). It lists what the staff pushes say, for
 * every login the push would reach, with a phone or without one:
 *
 *   - written with the push, by the same rules and in the same transaction
 *     (src/lib/push.ts, ringBell; the evening plan in src/lib/outbox.ts,
 *     planEveningBell);
 *   - read here: a login's own rows only, the newest BELL.limit of the
 *     last BELL.days days, each in the words of its push (pushText), in
 *     the reader's language. A kind the salon has switched off for push on
 *     «Уведомления» is left out, as the push leaves it out when it goes;
 *   - unread: newer than users.bell_seen_at. Opening the bell moves that
 *     mark to the newest row it showed.
 */
import { readNotify, sendsKind } from "./admin/notifications";
import type { Querier } from "./db";
import type { Locale } from "./i18n";
import { OWNER_KINDS, pushText, STAFF_KINDS } from "./push-kinds";

export const BELL = {
  /** rows listed */
  limit: 30,
  /** how far back */
  days: 30,
};

const DAY = 86_400_000;

export type BellItem = {
  id: string;
  title: string;
  body: string;
  /** where the push's tap goes */
  url: string;
  /** when it happened, ISO */
  at: string;
  /** newer than the login's mark */
  unread: boolean;
};

/** What the salon does not send by push now (src/lib/admin/notifications.ts): the bell leaves it out too. */
async function switchedOff(q: Querier, businessId: string): Promise<string[]> {
  const [b] = await q<{ settings: unknown }>("select settings from businesses where id = $1", [businessId]);
  const ns = readNotify(b?.settings);
  return [...STAFF_KINDS, ...OWNER_KINDS].filter((k) => !sendsKind(ns, k, "push"));
}

type Row = { id: string; kind: string; payload: Record<string, unknown>; created_at: Date; unread: boolean };

async function rows(q: Querier, userId: string, businessId: string, now: number, unreadOnly: boolean): Promise<Row[]> {
  const off = await switchedOff(q, businessId);
  return q<Row>(
    `select b.id::text as id, b.kind, b.payload, b.created_at, (u.bell_seen_at is null or b.created_at > u.bell_seen_at) as unread
       from bell b join users u on u.id = b.user_id
      where b.user_id = $1 and b.business_id = $2 and b.created_at > $3
        and not (b.kind = any($4::text[]))${unreadOnly ? "\n        and (u.bell_seen_at is null or b.created_at > u.bell_seen_at)" : ""}
      order by b.created_at desc, b.id desc
      limit $5`,
    [userId, businessId, new Date(now - BELL.days * DAY), off, BELL.limit],
  );
}

/** This login's bell, newest first, in `locale`; a row its push could not word either is left out. */
export async function bellFeed(q: Querier, userId: string, businessId: string, locale: Locale, now = Date.now()): Promise<BellItem[]> {
  const items: BellItem[] = [];
  for (const r of await rows(q, userId, businessId, now, false)) {
    const t = pushText(r.kind, r.payload ?? {}, locale);
    if (t) items.push({ id: r.id, title: t.title, body: t.body, url: t.url, at: new Date(r.created_at).toISOString(), unread: r.unread === true });
  }
  return items;
}

/** How many of the rows the bell would list are unread: the red dot. */
export async function bellUnread(q: Querier, userId: string, businessId: string, now = Date.now()): Promise<number> {
  return (await rows(q, userId, businessId, now, true)).filter((r) => pushText(r.kind, r.payload ?? {}, "ru") !== null).length;
}

/**
 * The login opened the bell: what it showed is read. The mark moves to the
 * newest row shown, never back; a row that came after stays unread.
 */
export async function markBellSeen(q: Querier, userId: string, businessId: string, upTo: string | null): Promise<void> {
  if (!upTo || Number.isNaN(Date.parse(upTo))) return;
  await q("update users set bell_seen_at = greatest(coalesce(bell_seen_at, '-infinity'::timestamptz), $3::timestamptz) where id = $1 and business_id = $2", [
    userId,
    businessId,
    new Date(upTo),
  ]);
}

/** The bell opened: its rows, with what was unread until now, and then all of them read. */
export async function openBell(q: Querier, userId: string, businessId: string, locale: Locale, now = Date.now()): Promise<BellItem[]> {
  const items = await bellFeed(q, userId, businessId, locale, now);
  await markBellSeen(q, userId, businessId, items[0]?.at ?? null);
  return items;
}

/** Rows older than the bell lists (the cron, src/lib/outbox.ts). The rows deleted. */
export async function pruneBell(q: Querier, now = Date.now()): Promise<number> {
  const [r] = await q<{ n: number }>("with d as (delete from bell where created_at < $1 returning 1) select count(*)::int as n from d", [new Date(now - BELL.days * DAY)]);
  return r?.n ?? 0;
}
