/**
 * What the visit window shows beside the visit itself (the owner,
 * 19.11.2026: the admin's visit window copies the tool we follow;
 * docs/reference-looks.md, «The visit window: built»). The visit, its
 * barbers and services come with the calendar's own data (calendar.ts,
 * cut by calendarFor); this is read when the window opens:
 *
 *   «Данные записи»          when it was made, from where, and by whom;
 *   «История изменений»      its audit rows, the newest first, with who;
 *   «Уведомления о визите»   the outbox rows to the client about it;
 *   the client's column      «Статистика», his previous visit (its day,
 *                            its services: the violet «Последний визит»
 *                            on their cards, «Не посещал N дней»), his
 *                            comments, and what of his card opens here.
 *
 * Rights (src/lib/auth/rights.ts), the calendar's own scope:
 *   - a visit in a column the login does not see (journal.staff), or before
 *     its history limit (journal.history), is not found: null;
 *   - the client's part only with «Доступ к данным клиентов» and for a
 *     client the login is shown (clients.show, clientSeen); else none;
 *   - in it, «Статистика» and his previous visit with «Просмотр истории
 *     посещений клиента»; the comments with «Просматривать комментарии»;
 *     «+ Добавить примечание» with «Добавлять комментарии»; the card's
 *     links with the section «Клиентская база».
 * No phone and no e-mail is in here: the messages say what and when, never
 * to whom.
 */
import { can, canGroup, historyFrom, type Holder } from "../auth/rights";
import type { Business } from "../availability";
import type { Querier } from "../db";
import { localParts, startOfDay, todayIn } from "../tz";
import { listComments, type ClientComment } from "./client-card";
import { clientSeen } from "./client-scope";
import { makerOf, type RecordMaker } from "./records";
import { isUuid } from "./visits";

/** «Не посещал N дней» shows from this many days without a visit. */
export const AWAY_DAYS = 14;
/** The comments the window shows, the newest first. */
export const WINDOW_COMMENTS = 3;

/** A row of «История изменений»: create, move, edit, status, cancel, note. */
export type WindowLog = { at: number; action: string; by: RecordMaker; status: string | null; confirmed: boolean };

/** A row of «Уведомления о визите»: what, how, and where it stands. */
export type WindowMessage = { id: string; kind: string; channel: string; status: string; at: number };

export type WindowClient = {
  /** «Статистика»: null without the right to his visit history */
  stats: { lastVisit: number | null; visits: number; noShows: number; soldCents: number } | null;
  /** the services of his visit before this one (the violet «Последний визит») */
  lastServiceIds: string[];
  /** «Не посещал N дней»: whole days from that visit to this one, from AWAY_DAYS on; null: fewer, none before it, or no right */
  awayDays: number | null;
  /** his card opens for this login: with which tabs. Null: it does not */
  card: { history: boolean; notify: boolean } | null;
  comments: ClientComment[];
  commentAdd: boolean;
};

export type VisitExtras = {
  createdAt: number;
  source: string;
  by: RecordMaker;
  log: WindowLog[];
  messages: WindowMessage[];
  client: WindowClient | null;
};

// the outbox kinds that are a message to the client about a visit (as the card's «Сообщения»)
const ABOUT_VISIT = ["confirmation", "reminder", "client_reminder", "moved", "cancelled"];
const LOG_MAX = 100;
const ms = (v: unknown) => (v instanceof Date ? v.getTime() : Date.parse(String(v)));
const dayNo = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

/** The audit's actor as a maker: a login by its name, the client, or the salon. */
function actorOf(actor: string, name: string | null, email: string | null): RecordMaker {
  if (name || email) return { kind: "user", name: name || (email ?? "").split("@")[0] };
  if (actor === "client") return { kind: "client", name: "" };
  return { kind: "salon", name: "" };
}

/**
 * The window's own data for one visit, as this login may see it. Null: no
 * such visit in this business, or one the login may not open.
 */
export async function visitExtras(q: Querier, business: Business, who: Holder, id: string, now = Date.now()): Promise<VisitExtras | null> {
  if (!isUuid(id)) return null;
  const tz = business.timezone;
  const [v] = await q<{ staff_id: string; client_id: string; starts_at: Date; created_at: Date; source: string; made_name: string | null; made_email: string | null }>(
    `select a.staff_id, a.client_id, a.starts_at, a.created_at, a.source, mu.name as made_name, mu.email as made_email
       from appointments a
       left join lateral (
         select au.actor from audit au
          where au.entity = 'appointment' and au.entity_id = a.id and au.action = 'create'
          order by au.at, au.id limit 1) mk on true
       left join users mu on mu.business_id = a.business_id and mu.id::text = mk.actor
      where a.id = $1 and a.business_id = $2`,
    [id, business.id],
  );
  if (!v) return null;
  // the calendar's scope: his column, and nothing before the login's history limit
  if (!can(who, "journal.staff", { staffId: v.staff_id })) return null;
  const from = historyFrom(who, todayIn(tz, now));
  if (from && ms(v.starts_at) < startOfDay(from, tz)) return null;

  const [log, messages] = await Promise.all([
    q<{ at: Date; action: string; actor: string; after: { status?: string; confirmed?: boolean } | null; name: string | null; email: string | null }>(
      `select au.at, au.action, au.actor, au.after, u.name, u.email
         from audit au left join users u on u.business_id = $2 and u.id::text = au.actor
        where au.entity = 'appointment' and au.entity_id = $1
        order by au.at desc, au.id desc limit ${LOG_MAX}`,
      [id, business.id],
    ),
    q<{ id: string; kind: string; channel: string; status: string; send_at: Date; sent_at: Date | null }>(
      `select n.id, n.kind, n.channel, n.status, n.send_at, n.sent_at from notifications n
        where n.appointment_id = $1 and n.business_id = $2 and n.user_id is null and n.kind = any($3::text[])
        order by coalesce(n.sent_at, n.send_at) desc, n.created_at desc, n.id`,
      [id, business.id, ABOUT_VISIT],
    ),
  ]);

  return {
    createdAt: ms(v.created_at),
    source: v.source,
    by: makerOf(v),
    log: log.map((r) => ({
      at: ms(r.at),
      action: r.action,
      by: actorOf(r.actor, r.name, r.email),
      status: r.action === "status" && typeof r.after?.status === "string" ? r.after.status : null,
      confirmed: r.action === "status" && r.after?.confirmed === true,
    })),
    messages: messages.map((m) => ({ id: m.id, kind: m.kind, channel: m.channel, status: m.status, at: ms(m.sent_at ?? m.send_at) })),
    client: await clientPart(q, business, who, id, v.client_id, ms(v.starts_at), now),
  };
}

async function clientPart(q: Querier, business: Business, who: Holder, visitId: string, clientId: string, start: number, now: number): Promise<WindowClient | null> {
  if (!can(who, "visit.client_data") || !(await clientSeen(q, business.id, who, clientId))) return null;
  const history = can(who, "clients.history");
  const [comments, numbers] = await Promise.all([listComments(q, business.id, clientId, who), history ? clientNumbers(q, business, visitId, clientId, start, now) : null]);
  return {
    stats: numbers?.stats ?? null,
    lastServiceIds: numbers?.lastServiceIds ?? [],
    awayDays: numbers?.awayDays ?? null,
    card: canGroup(who, "clients") ? { history, notify: can(who, "clients.edit") } : null,
    comments: comments.slice(0, WINDOW_COMMENTS),
    commentAdd: can(who, "clients.comments_add"),
  };
}

/**
 * His numbers, as the card counts them: every visit not cancelled, the
 * no-shows, and «Продано»: the visits that began and were not a no-show
 * (the card's «Продано») with the products sold to him (not taken back).
 * His previous visit is the last one that starts before this one, the
 * cancelled ones and the no-shows aside.
 */
async function clientNumbers(q: Querier, business: Business, visitId: string, clientId: string, start: number, now: number) {
  const [[n], [goods], [prev]] = await Promise.all([
    q<{ visits: number; no_shows: number; sold: number }>(
      `select count(*) filter (where a.status <> 'cancelled')::int as visits,
              count(*) filter (where a.status = 'no_show')::int as no_shows,
              coalesce(sum(a.total_cents) filter (where a.status not in ('cancelled', 'no_show') and a.starts_at <= $3), 0)::int as sold
         from appointments a where a.business_id = $1 and a.client_id = $2`,
      [business.id, clientId, new Date(now)],
    ),
    q<{ cents: number }>(
      `select coalesce(sum(p.total_cents), 0)::int as cents from product_sales p
        where p.business_id = $1 and p.client_id = $2 and p.status = 'done' and p.reverses_id is null
          and not exists (select 1 from product_sales r where r.reverses_id = p.id)`,
      [business.id, clientId],
    ),
    q<{ id: string; starts_at: Date }>(
      `select a.id, a.starts_at from appointments a
        where a.business_id = $1 and a.client_id = $2 and a.id <> $3 and a.status not in ('cancelled', 'no_show') and a.starts_at < $4
        order by a.starts_at desc limit 1`,
      [business.id, clientId, visitId, new Date(start)],
    ),
  ]);
  const lines = prev ? await q<{ service_id: string }>("select service_id from appointment_services where appointment_id = $1 order by position", [prev.id]) : [];
  const tz = business.timezone;
  const lastVisit = prev ? ms(prev.starts_at) : null;
  const away = lastVisit === null ? null : dayNo(localParts(start, tz).date) - dayNo(localParts(lastVisit, tz).date);
  return {
    stats: { lastVisit, visits: n?.visits ?? 0, noShows: n?.no_shows ?? 0, soldCents: (n?.sold ?? 0) + (goods?.cents ?? 0) },
    lastServiceIds: [...new Set(lines.map((l) => l.service_id))],
    awayDays: away !== null && away >= AWAY_DAYS ? away : null,
  };
}
