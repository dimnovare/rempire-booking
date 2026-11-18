/**
 * Web Push for clients (docs/apps.md, step 4; 012_client_push.sql): the
 * reminder before a visit as a notification on the client's own phone.
 *
 * A client has no login. He turns the notification on after a booking, on
 * the confirmation or the visit page, and the visit's own link says whose
 * phone it is (src/app/api/visit/[token]/push). The phone then belongs to
 * that client: every later visit of his is reminded there too.
 *
 * The reminder is an outbox row (channel 'push', kind 'client_reminder'),
 * planned and sent by src/lib/outbox.ts with the staff's pushes. Which way
 * a reminder goes is the business's switch, settings.client_reminder.
 * The keys are the staff app's own (src/lib/push.ts).
 */
import type { Business } from "./availability";
import { withTx, type Querier } from "./db";
import { pushConfigured, pushToPhones, type PushSendResult, type PushSubscriptionInput } from "./push";
import type { PushText } from "./push-kinds";
import { isReminderChannel, type BusinessSettings } from "./settings";

type Env = Record<string, string | undefined>;

/** Are clients offered the notification here? Keys set, and the switch not on «SMS only». */
export function clientPushOffered(settings: Pick<BusinessSettings, "client_reminder">, env: Env = process.env): boolean {
  return pushConfigured(env) && settings.client_reminder !== "sms";
}

/** Renat's switch: the reminder by SMS, by a notification, or both. Kept in the audit like his other switches. */
export async function setClientReminder(business: Pick<Business, "id">, actor: string, value: string): Promise<boolean> {
  if (!isReminderChannel(value)) return false;
  return withTx(async (tx) => {
    const r = await tx<{ id: string }>("update businesses set settings = settings || jsonb_build_object('client_reminder', $2::text) where id = $1 returning id", [business.id, value]);
    if (!r.length) return false;
    await tx(`insert into audit (actor, entity, entity_id, action, after) values ($1, 'business', $2, 'settings', $3::jsonb)`, [actor, business.id, JSON.stringify({ client_reminder: value })]);
    return true;
  });
}

/**
 * This phone is this client's now. The same endpoint is the same browser:
 * if another client booked on it before, the reminders follow the newer one.
 */
export async function saveClientSubscription(q: Querier, businessId: string, clientId: string, s: PushSubscriptionInput): Promise<void> {
  await q(
    `insert into client_push_subscriptions (endpoint, business_id, client_id, p256dh, auth, label) values ($1, $2, $3, $4, $5, $6)
     on conflict (endpoint) do update
        set business_id = excluded.business_id, client_id = excluded.client_id, p256dh = excluded.p256dh, auth = excluded.auth,
            label = case when excluded.label = '' then client_push_subscriptions.label else excluded.label end,
            retired_at = null, retired_reason = null`,
    [s.endpoint, businessId, clientId, s.p256dh, s.auth, s.label],
  );
}

/** The client turned it off on this phone. False when it was not on. */
export async function removeClientSubscription(q: Querier, clientId: string, endpoint: string): Promise<boolean> {
  const rows = await q<{ endpoint: string }>(
    "update client_push_subscriptions set retired_at = now(), retired_reason = 'user' where endpoint = $1 and client_id = $2 and retired_at is null returning endpoint",
    [String(endpoint).slice(0, 2000), clientId],
  );
  return rows.length > 0;
}

/**
 * Send one message to every live phone of one client. Throws when nothing
 * could be sent but something may still work later (the outbox retries); a
 * client with no live phone sends nothing and does not throw.
 */
export async function sendPushToClient(q: Querier, clientId: string, msg: PushText, env: Env = process.env): Promise<PushSendResult> {
  if (!pushConfigured(env)) throw new Error("push is not configured");
  const subs = await q<{ endpoint: string; p256dh: string; auth: string }>(
    "select endpoint, p256dh, auth from client_push_subscriptions where client_id = $1 and retired_at is null order by created_at",
    [clientId],
  );
  if (!subs.length) return { devices: 0, sent: 0, failed: 0, gone: 0 };
  const outcomes = await pushToPhones(subs, msg, env);
  const ok = subs.filter((_, i) => outcomes[i] === "sent").map((s) => s.endpoint);
  const gone = subs.filter((_, i) => outcomes[i] === "gone").map((s) => s.endpoint);
  if (ok.length) await q("update client_push_subscriptions set last_ok_at = now() where endpoint = any($1::text[])", [ok]);
  if (gone.length) await q("update client_push_subscriptions set retired_at = now(), retired_reason = 'gone' where endpoint = any($1::text[]) and retired_at is null", [gone]);
  const res = { devices: subs.length, sent: ok.length, failed: subs.length - ok.length - gone.length, gone: gone.length };
  if (!res.sent && res.failed) throw new Error(`push failed on ${res.failed} phone(s)`);
  return res;
}
