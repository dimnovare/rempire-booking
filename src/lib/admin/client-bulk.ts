/**
 * What the client base does to many clients at once (the owner,
 * 19.11.2026: «Действия» of the tool we follow, mass SMS included):
 *
 *   a mass message   the same words to every chosen client, by SMS, e-mail
 *                    and a notification on his phone;
 *   a category       added to every chosen client;
 *   deleting         only the clients the card's own «Удалить» would delete.
 *
 * **Whom:** the rows that are ticked (`ids`), or, with none ticked, every
 * client the list's search and conditions leave (`filter`, read by the
 * same `clientWhere` the list asks with). Always this business's, never
 * one merged away, never one anonymised.
 *
 * **A mass message is advertising.** It goes to nobody who ticked
 * «Рекламные сообщения: не отправлять» (clients.marketing_opt_out), and by
 * a channel only to who accepts that channel and has an address for it: a
 * phone, an e-mail, or, for a notification, a phone turned on for a visit
 * ahead (a phone is tied to a visit, never to a client: 013). `massPreview`
 * counts all of that before anything is queued; `queueMassMessage` queues
 * with the same rules: one outbox row per client and channel, kind «mass»,
 * the client in client_id, the words in the payload. The cron sends them
 * like every other row: an SMS waits while there is no provider
 * (src/lib/sms.ts), a letter passes the staging mail guard. Each client it
 * was queued for is marked (clients.mass_sent_at, 019), and one audit row
 * says who sent it, to how many and by which channels, never the words.
 *
 * Every function is scoped to the business it is handed.
 *
 * Rights (src/lib/auth/rights.ts): a mass message is «Совершать SMS
 * рассылки клиентам»; a category is «Редактировать данные клиента», and a
 * word nobody has yet also «Настройка списка категорий клиентов»; deleting
 * is «Удалять клиентов», and many at once stays the owner's as it was. The
 * chosen clients are always among the ones the login sees.
 */
import { randomUUID } from "node:crypto";
import { can, type Holder } from "../auth/rights";
import type { Business } from "../availability";
import { CLIENT_CHANNELS, type ClientChannel } from "../client-notify";
import { clientPushOffered } from "../client-push";
import { withTx, type Querier } from "../db";
import { smsSegments } from "../sms";
import { MESSAGE_MAX } from "./client-card";
import { seenClientsSql } from "./client-scope";
import { cleanLabels, clientLabels, clientWhere, LABELS_MAX, type ClientFilter } from "./clients";
import { isUuid } from "./visits";

type Env = Record<string, string | undefined>;

/** Ticked rows in one action, at most: a page of the list is 100. */
export const BULK_IDS_MAX = 100;

/** The ticked rows, or every client the list's filter leaves. */
export type BulkTarget = { ids: string[] } | { filter: ClientFilter };

/** A target as an action sent it: ids that are ids (none twice), or a filter. Null: neither. */
export function cleanTarget(raw: unknown): BulkTarget | null {
  const t = raw as { ids?: unknown; filter?: unknown } | null;
  if (!t || typeof t !== "object") return null;
  if (Array.isArray(t.ids)) {
    const ids = [...new Set(t.ids.map(String))];
    return ids.length && ids.length <= BULK_IDS_MAX && ids.every(isUuid) ? { ids } : null;
  }
  if (t.filter && typeof t.filter === "object") {
    const f = t.filter as Record<string, unknown>;
    // only what says which clients: never a page or an order
    return { filter: { q: typeof f.q === "string" ? f.q : "", label: typeof f.label === "string" ? f.label : "", conds: f.conds, join: f.join } };
  }
  return null;
}

/** The target as a WHERE over `clients c`, with its values: with a login, only among the clients it sees. */
function targetWhere(business: Business, target: BulkTarget, now: number, who?: Holder): { where: string; params: unknown[] } {
  if ("ids" in target) {
    const params: unknown[] = [business.id, target.ids];
    const only = seenClientsSql(who, (value) => {
      params.push(value);
      return `$${params.length}`;
    });
    // never an anonymised client (clients.ts, anonymiseClient), as the list never shows one
    return { where: `c.business_id = $1 and c.merged_into is null and c.anonymised_at is null and c.id = any($2::uuid[])${only}`, params };
  }
  return clientWhere(business.id, target.filter, now, business.timezone, who);
}

/* ---------- a mass message ---------- */

/** Of the chosen clients, by one channel: who gets it, who has no address for it, who switched it off. */
export type ChannelCount = { ok: number; none: number; off: number };
export type MassPreview = {
  /** the chosen clients */
  clients: number;
  /** of them, who asked for no advertising: left out of every channel, and of the three counts below */
  ads: number;
} & Record<ClientChannel, ChannelCount>;

/** The visit whose phones a notification to the client `c` would reach: his next one some phone was turned on for. */
const PUSH_VISIT = (nowAt: string) => `left join lateral (
    select a.id from appointments a
     where a.business_id = c.business_id and a.client_id = c.id and a.status in ('booked', 'pending') and a.starts_at > ${nowAt}
       and exists (select 1 from client_push_subscriptions p where p.appointment_id = a.id and p.retired_at is null)
     order by a.starts_at limit 1
  ) pv on true`;

/** Who a mass message to these clients would reach, by channel. Nothing is queued. */
export async function massPreview(q: Querier, business: Business, target: BulkTarget, now = Date.now(), env: Env = process.env, who?: Holder): Promise<MassPreview> {
  const t = targetWhere(business, target, now, who);
  const nowAt = `$${t.params.length + 1}`;
  const push = `$${t.params.length + 2}::boolean`;
  const count = (cond: string) => `(count(*) filter (where not c.marketing_opt_out and ${cond}))::int`;
  const [r] = await q<Record<string, number>>(
    `select count(*)::int as clients, (count(*) filter (where c.marketing_opt_out))::int as ads,
            ${count("c.phone_e164 is null")} as sms_none,
            ${count("c.phone_e164 is not null and c.sms_opt_out")} as sms_off,
            ${count("c.phone_e164 is not null and not c.sms_opt_out")} as sms_ok,
            ${count("c.email is null")} as email_none,
            ${count("c.email is not null and c.email_opt_out")} as email_off,
            ${count("c.email is not null and not c.email_opt_out")} as email_ok,
            ${count(`(pv.id is null or not ${push})`)} as push_none,
            ${count(`pv.id is not null and ${push} and c.push_opt_out`)} as push_off,
            ${count(`pv.id is not null and ${push} and not c.push_opt_out`)} as push_ok
       from clients c ${PUSH_VISIT(nowAt)}
      where ${t.where}`,
    [...t.params, new Date(now), clientPushOffered(business.settings, env)],
  );
  const of = (ch: ClientChannel): ChannelCount => ({ ok: r[`${ch}_ok`], none: r[`${ch}_none`], off: r[`${ch}_off`] });
  return { clients: r.clients, ads: r.ads, sms: of("sms"), email: of("email"), push: of("push") };
}

export type MassInput = { text: unknown; channels: unknown };
/**
 * `clients`: the chosen ones; `reached`: of them, who has at least one row
 * queued; then the rows by channel, and the SMS parts they are billed as.
 * `nobody`: no chosen client can be reached by a chosen channel, so nothing
 * was queued.
 */
export type MassQueued =
  | { ok: true; batch: string; clients: number; reached: number; sms: number; email: number; push: number; parts: number }
  | { ok: false; code: "forbidden" | "text" | "channels" | "target" | "nobody" };

/**
 * Queue a mass message: one outbox row per client and channel, kind «mass».
 * Only for a login with «Совершать SMS рассылки клиентам» (Renat and the
 * front desk started with it). The chosen clients are locked first, so the
 * rows, the mark and the counts are of the same clients.
 */
export async function queueMassMessage(business: Business, target: BulkTarget | null, input: MassInput, by: Holder & { id: string }, now = Date.now(), env: Env = process.env): Promise<MassQueued> {
  if (!can(by, "single.bulk_sms")) return { ok: false, code: "forbidden" };
  if (!target) return { ok: false, code: "target" };
  const text = String(input?.text ?? "").replace(/\r\n/g, "\n").trim();
  if (!text || text.length > MESSAGE_MAX) return { ok: false, code: "text" };
  const asked = Array.isArray(input?.channels) ? input.channels : [];
  const channels = CLIENT_CHANNELS.filter((c) => asked.includes(c));
  if (!channels.length || channels.length !== new Set(asked).size) return { ok: false, code: "channels" };
  const pushOffered = clientPushOffered(business.settings, env);
  const batch = randomUUID();
  const at = new Date(now);
  const payload = JSON.stringify({ text, subject: business.name, batch });

  return withTx<MassQueued>(async (tx) => {
    const t = targetWhere(business, target, now, by);
    const chosen = (await tx<{ id: string }>(`select c.id from clients c where ${t.where} order by c.id for update of c`, t.params)).map((r) => r.id);
    const HEAD = `insert into notifications (business_id, appointment_id, client_id, channel, kind, recipient, locale, payload, send_at, created_at)`;
    // $1 the business, $2 the chosen clients, $3 the words, $4 now
    const FROM = `from clients c`;
    const WHO = `where c.business_id = $1 and c.id = any($2::uuid[]) and not c.marketing_opt_out`;
    const args = [business.id, chosen, payload, at];
    const queued: Record<ClientChannel, string[]> = { sms: [], email: [], push: [] };
    if (chosen.length) {
      if (channels.includes("sms"))
        queued.sms = (
          await tx<{ client_id: string }>(
            `${HEAD} select c.business_id, null::uuid, c.id, 'sms', 'mass', c.phone_e164, c.locale, $3::jsonb, $4::timestamptz, $4::timestamptz
               ${FROM} ${WHO} and c.phone_e164 is not null and not c.sms_opt_out returning client_id`,
            args,
          )
        ).map((r) => r.client_id);
      if (channels.includes("email"))
        queued.email = (
          await tx<{ client_id: string }>(
            `${HEAD} select c.business_id, null::uuid, c.id, 'email', 'mass', c.email, c.locale, $3::jsonb, $4::timestamptz, $4::timestamptz
               ${FROM} ${WHO} and c.email is not null and not c.email_opt_out returning client_id`,
            args,
          )
        ).map((r) => r.client_id);
      if (channels.includes("push") && pushOffered)
        queued.push = (
          await tx<{ client_id: string }>(
            `${HEAD} select c.business_id, pv.id, c.id, 'push', 'mass', pv.id::text, c.locale, $3::jsonb, $4::timestamptz, $4::timestamptz
               ${FROM} ${PUSH_VISIT("$4::timestamptz")} ${WHO} and pv.id is not null and not c.push_opt_out returning client_id`,
            args,
          )
        ).map((r) => r.client_id);
    }
    const reached = [...new Set([...queued.sms, ...queued.email, ...queued.push])];
    if (!reached.length) return { ok: false, code: "nobody" };
    await tx("update clients set mass_sent_at = $2 where id = any($1::uuid[])", [reached, at]);
    const parts = queued.sms.length * smsSegments(text).segments;
    const counts = { clients: chosen.length, reached: reached.length, sms: queued.sms.length, email: queued.email.length, push: queued.push.length, parts };
    await tx(`insert into audit (actor, entity, action, after) values ($1, 'client', 'mass_message', $2::jsonb)`, [by.id, JSON.stringify({ by: "admin", batch, channels, ...counts })]);
    return { ok: true, batch, ...counts };
  });
}

/* ---------- a category ---------- */

/** `added`: who has it now and had not; `had`: who had it already; `full`: who has no room for one more. */
export type BulkLabeled = { ok: true; label: string; clients: number; added: number; had: number; full: number } | { ok: false; field: "label" | "target" | "forbidden" };

/**
 * Add one category to every chosen client. A category is a free word
 * (016); one that is in use already is written as it is there, whatever
 * capitals were typed. The audit row says who, the word and how many.
 */
export async function bulkAddLabel(business: Business, target: BulkTarget | null, label: unknown, actor: string, now = Date.now(), who?: Holder): Promise<BulkLabeled> {
  if (who && !can(who, "clients.edit")) return { ok: false, field: "forbidden" };
  if (!target) return { ok: false, field: "target" };
  const cleaned = cleanLabels([label]);
  if (!cleaned || cleaned.length !== 1) return { ok: false, field: "label" };
  return withTx<BulkLabeled>(async (tx) => {
    const typed = cleaned[0];
    const inUse = (await clientLabels(tx, business.id)).find((l) => l.toLocaleLowerCase() === typed.toLocaleLowerCase());
    // a word nobody has yet makes the list of categories longer
    if (who && !inUse && !can(who, "settings.categories")) return { ok: false, field: "forbidden" };
    const word = inUse ?? typed;
    const t = targetWhere(business, target, now, who);
    const rows = await tx<{ id: string; labels: string[] }>(`select c.id, c.labels from clients c where ${t.where} order by c.id for update of c`, t.params);
    const key = word.toLocaleLowerCase();
    const has = (r: { labels: string[] }) => (r.labels ?? []).some((l) => l.toLocaleLowerCase() === key);
    const had = rows.filter(has).length;
    const add = rows.filter((r) => !has(r) && (r.labels ?? []).length < LABELS_MAX).map((r) => r.id);
    if (add.length) {
      await tx("update clients set labels = array_append(labels, $2::text), updated_at = now() where id = any($1::uuid[])", [add, word]);
      await tx(`insert into audit (actor, entity, action, after) values ($1, 'client', 'bulk_label', $2::jsonb)`, [actor, JSON.stringify({ by: "admin", label: word, clients: rows.length, added: add.length })]);
    }
    return { ok: true, label: word, clients: rows.length, added: add.length, had, full: rows.length - had - add.length };
  });
}

/* ---------- deleting ---------- */

/**
 * `kept`: who stays and why, each client under the first reason that holds:
 * he has visits (cancelled ones count: a visit is never deleted), he bought
 * something, or another client was merged into him.
 */
export type BulkDeleted = { ok: true; clients: number; deleted: number; kept: { visits: number; sales: number; merged: number } } | { ok: false; code: "forbidden" | "target" };

const pgCode = (err: unknown) => (err as { code?: string })?.code;

/**
 * Delete the chosen clients who have no history: exactly the ones the
 * card's own «Удалить» would delete (clients.ts, deleteClient). Everybody
 * else stays, and the answer says how many and why. Only an owner's login
 * with «Удалять клиентов» (the right alone deletes one client from his
 * card; many at once was the owner's before the rights and stays so). Each
 * deleted client gets the audit row a single delete writes, marked `bulk`.
 */
export async function bulkDelete(business: Business, target: BulkTarget | null, by: Holder & { id: string }, now = Date.now()): Promise<BulkDeleted> {
  if (!can(by, "clients.delete", { bulk: true })) return { ok: false, code: "forbidden" };
  if (!target) return { ok: false, code: "target" };
  const run = () =>
    withTx<BulkDeleted>(async (tx) => {
      const t = targetWhere(business, target, now, by);
      const rows = await tx<{ id: string; visits: boolean; sales: boolean; merged: boolean }>(
        `select c.id,
                exists (select 1 from appointments a where a.client_id = c.id) as visits,
                exists (select 1 from product_sales s where s.client_id = c.id) as sales,
                exists (select 1 from clients m where m.merged_into = c.id) as merged
           from clients c where ${t.where} order by c.id for update of c`,
        t.params,
      );
      const free = rows.filter((r) => !r.visits && !r.sales && !r.merged).map((r) => r.id);
      if (free.length) {
        await tx(
          `with gone as (delete from clients where id = any($1::uuid[]) returning id)
           insert into audit (actor, entity, entity_id, action, after) select $2, 'client', id, 'delete', $3::jsonb from gone`,
          [free, by.id, JSON.stringify({ by: "admin", bulk: true })],
        );
      }
      const kept = { visits: rows.filter((r) => r.visits).length, sales: rows.filter((r) => !r.visits && r.sales).length, merged: rows.filter((r) => !r.visits && !r.sales && r.merged).length };
      return { ok: true, clients: rows.length, deleted: free.length, kept };
    });
  try {
    return await run();
  } catch (err) {
    // a visit booked for one of them while they were being deleted: the database refused; asked again, he is kept
    if (pgCode(err) === "23503") return run();
    throw err;
  }
}

/** How many clients a target is. */
export async function bulkCount(q: Querier, business: Business, target: BulkTarget, now = Date.now()): Promise<number> {
  const t = targetWhere(business, target, now);
  const [r] = await q<{ n: number }>(`select count(*)::int as n from clients c where ${t.where}`, t.params);
  return r?.n ?? 0;
}
