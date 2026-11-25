/**
 * The bell in the admin's sidebar head (046_bell.sql, 047_bell_read.sql;
 * the bell itself is src/app/admin/(app)/bell.tsx). It lists what the staff
 * pushes say, for every login the push would reach, with a phone or
 * without one:
 *
 *   - written with the push, by the same rules and in the same transaction
 *     (src/lib/push.ts, ringBell; the evening plan in src/lib/outbox.ts,
 *     planEveningBell);
 *   - read here: a login's own rows only, of the last BELL.days days, each
 *     in the words of its push (pushText), in the reader's language. A kind
 *     the salon has switched off for push on «Уведомления» is left out, as
 *     the push leaves it out when it goes;
 *   - in two groups, as the product we follow has them: «Записи» (a visit
 *     booked, moved or cancelled) and «Остальные» (the evening plan,
 *     requests, reviews). The panel shows the newest BELL.preview of each;
 *     «Показать полностью» pages through one group, BELL.page at a time,
 *     the visits by a filter;
 *   - unread until the row is clicked, marked read on its own, or read
 *     with its whole group («Прочитать все»). Opening the bell reads
 *     nothing.
 */
import { readNotify, sendsKind } from "./admin/notifications";
import type { Querier } from "./db";
import type { Locale } from "./i18n";
import { OWNER_KINDS, pushText, STAFF_KINDS } from "./push-kinds";

export const BELL = {
  /** how far back */
  days: 30,
  /** rows of a group in the panel's first view */
  preview: 3,
  /** rows per page of «Показать полностью» */
  page: 20,
};

const DAY = 86_400_000;

export const BELL_GROUPS = ["visits", "other"] as const;
export type BellGroup = (typeof BELL_GROUPS)[number];
export const BELL_FILTERS = ["all", "new", "moved", "cancelled"] as const;
export type BellFilter = (typeof BELL_FILTERS)[number];

/** «Записи»: a visit booked, moved or cancelled. Everything else is «Остальные». */
export const VISIT_KINDS = ["visit_new", "visit_moved", "visit_cancelled", "own_online", "own_client", "own_barber"] as const;

/** The picture in the row's circle. */
export type BellIcon = "online" | "new" | "moved" | "cancelled" | "plan" | "request" | "review" | "answer";

export type BellItem = {
  id: string;
  icon: BellIcon;
  title: string;
  body: string;
  /** where the push's tap goes */
  url: string;
  /** when it happened, ISO */
  at: string;
  unread: boolean;
};

export type BellBlock = { unread: number; items: BellItem[] };
export type BellSummary = Record<BellGroup, BellBlock>;

/** Where the next page starts: after this row (its time in microseconds, exact, and its id). */
export type BellCursor = { us: string; id: string };

/** What the salon does not send by push now (src/lib/admin/notifications.ts): the bell leaves it out too. */
async function switchedOff(q: Querier, businessId: string): Promise<string[]> {
  const [b] = await q<{ settings: unknown }>("select settings from businesses where id = $1", [businessId]);
  const ns = readNotify(b?.settings);
  return [...STAFF_KINDS, ...OWNER_KINDS].filter((k) => !sendsKind(ns, k, "push"));
}

/** A row's own moved/cancelled, for the kinds that carry it in the payload (pushText reads it the same way). */
const MOVED = "(b.kind = 'visit_moved' or (b.kind in ('own_client', 'own_barber') and b.payload->>'action' = 'moved'))";
const CANCELLED = "(b.kind = 'visit_cancelled' or (b.kind in ('own_client', 'own_barber') and coalesce(b.payload->>'action', '') <> 'moved'))";

function where(group: BellGroup | null, filter: BellFilter): string {
  const visits = `b.kind = any('{${VISIT_KINDS.join(",")}}'::text[])`;
  if (group === null) return "";
  if (group === "other") return `and not ${visits}`;
  switch (filter) {
    case "new":
      return "and b.kind in ('visit_new', 'own_online')";
    case "moved":
      return `and ${MOVED}`;
    case "cancelled":
      return `and ${CANCELLED}`;
    default:
      return `and ${visits}`;
  }
}

function iconOf(kind: string, payload: Record<string, unknown>): BellIcon {
  switch (kind) {
    case "own_online":
      return "online";
    case "visit_new":
      return payload.source === "online" ? "online" : "new";
    case "visit_moved":
      return "moved";
    case "visit_cancelled":
      return "cancelled";
    case "own_client":
    case "own_barber":
      return payload.action === "moved" ? "moved" : "cancelled";
    case "day_plan":
    case "own_plan":
      return "plan";
    case "own_request":
      return "request";
    case "own_review":
      return "review";
    default:
      return "answer";
  }
}

type Row = { id: string; kind: string; payload: Record<string, unknown>; created_at: Date; us: string; read_at: Date | null; source: string | null };

async function rows(
  q: Querier,
  userId: string,
  businessId: string,
  now: number,
  o: { group: BellGroup | null; filter?: BellFilter; limit: number; after?: BellCursor | null },
): Promise<Row[]> {
  const off = await switchedOff(q, businessId);
  const params: unknown[] = [userId, businessId, new Date(now - BELL.days * DAY), off, o.limit];
  let after = "";
  if (o.after) {
    params.push(o.after.us, o.after.id);
    after = "and ((extract(epoch from b.created_at) * 1000000)::bigint, b.id) < ($6::bigint, $7::bigint)";
  }
  return q<Row>(
    `select b.id::text as id, b.kind, b.payload, b.created_at, b.read_at, a.source,
            ((extract(epoch from b.created_at) * 1000000)::bigint)::text as us
       from bell b
       left join appointments a on a.id = b.appointment_id
      where b.user_id = $1 and b.business_id = $2 and b.created_at > $3
        and not (b.kind = any($4::text[]))
        ${where(o.group, o.filter ?? "all")}
        ${after}
      order by b.created_at desc, b.id desc
      limit $5`,
    params,
  );
}

function word(r: Row, locale: Locale): BellItem | null {
  const t = pushText(r.kind, r.payload ?? {}, locale);
  if (!t) return null;
  return { id: r.id, icon: iconOf(r.kind, { ...r.payload, source: r.source }), title: t.title, body: t.body, url: t.url, at: new Date(r.created_at).toISOString(), unread: r.read_at === null };
}

const words = (rs: Row[], locale: Locale) => rs.map((r) => word(r, locale)).filter((i): i is BellItem => i !== null);

/** Every row of this login, newest first, in `locale` (the tests' view; the panel pages by group). */
export async function bellFeed(q: Querier, userId: string, businessId: string, locale: Locale, now = Date.now()): Promise<BellItem[]> {
  return words(await rows(q, userId, businessId, now, { group: null, limit: 500 }), locale);
}

/** How many unread, of one group or of both: the red dot and the grey count by each title. */
export async function bellUnread(q: Querier, userId: string, businessId: string, now = Date.now(), group: BellGroup | null = null): Promise<number> {
  const off = await switchedOff(q, businessId);
  const [r] = await q<{ n: number }>(
    `select count(*)::int as n
       from bell b
      where b.user_id = $1 and b.business_id = $2 and b.created_at > $3
        and not (b.kind = any($4::text[])) and b.read_at is null
        ${where(group, "all")}`,
    [userId, businessId, new Date(now - BELL.days * DAY), off],
  );
  return r?.n ?? 0;
}

/** The panel's first view: each group's unread count and its newest rows. Reads nothing. */
export async function bellSummary(q: Querier, userId: string, businessId: string, locale: Locale, now = Date.now()): Promise<BellSummary> {
  const block = async (group: BellGroup): Promise<BellBlock> => ({
    unread: await bellUnread(q, userId, businessId, now, group),
    items: words(await rows(q, userId, businessId, now, { group, limit: BELL.preview }), locale),
  });
  return { visits: await block("visits"), other: await block("other") };
}

/** One page of a group, after `after`; `more` when another page follows. */
export async function bellPage(
  q: Querier,
  userId: string,
  businessId: string,
  locale: Locale,
  group: BellGroup,
  filter: BellFilter,
  after: BellCursor | null,
  now = Date.now(),
): Promise<{ items: BellItem[]; next: BellCursor | null }> {
  const rs = await rows(q, userId, businessId, now, { group, filter: group === "visits" ? filter : "all", limit: BELL.page + 1, after });
  const page = rs.slice(0, BELL.page);
  const last = page[page.length - 1];
  return { items: words(page, locale), next: rs.length > BELL.page && last ? { us: last.us, id: last.id } : null };
}

/** These rows read, of this login only. */
export async function readBell(q: Querier, userId: string, businessId: string, ids: string[], now = Date.now()): Promise<void> {
  const clean = ids.filter((id) => /^\d{1,18}$/.test(id));
  if (!clean.length) return;
  await q("update bell set read_at = $4 where user_id = $1 and business_id = $2 and read_at is null and id = any($3::bigint[])", [userId, businessId, clean, new Date(now)]);
}

/** «Прочитать все»: every row of the group read, of this login only. */
export async function readBellGroup(q: Querier, userId: string, businessId: string, group: BellGroup, now = Date.now()): Promise<void> {
  await q(`update bell b set read_at = $3 where b.user_id = $1 and b.business_id = $2 and b.read_at is null ${where(group, "all")}`, [userId, businessId, new Date(now)]);
}

/** Rows older than the bell lists (the cron, src/lib/outbox.ts). The rows deleted. */
export async function pruneBell(q: Querier, now = Date.now()): Promise<number> {
  const [r] = await q<{ n: number }>("with d as (delete from bell where created_at < $1 returning 1) select count(*)::int as n from d", [new Date(now - BELL.days * DAY)]);
  return r?.n ?? 0;
}
