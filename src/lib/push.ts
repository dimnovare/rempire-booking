/**
 * Web Push for the barber app (B5). Adapted from the shop's
 * (rempire-web src/lib/push.ts): the same rules, but a subscription belongs
 * to a login (push_subscriptions.user_id, 008_push.sql), and messages go
 * through the outbox (channel 'push'), so the cron and its retries are
 * shared with SMS and e-mail.
 *
 * Environment (names only; Dim puts the values into Vercel):
 *   VAPID_PUBLIC_KEY   the application server key, base64url. The phone needs
 *                      it to subscribe; the app reads it from the server.
 *   VAPID_PRIVATE_KEY  the other half. Server only.
 *   VAPID_SUBJECT      optional: a mailto: or https: address the push
 *                      services can write to. Default: the site's own origin.
 * The two keys are a PAIR from one `npx web-push generate-vapid-keys`, never
 * the shop's. New keys cut off every subscribed phone.
 *
 * With no keys nothing sends and nothing throws, and the «Включить
 * уведомления» button is never green: subscribing is refused
 * (`not_configured`), so a phone is never «on» while nothing can reach it.
 */
import type { Querier } from "./db";
import { DEFAULT_ON, isPushKind, type PushKind, type PushText, type VisitPayload } from "./push-kinds";
import { siteUrl } from "./site";

type Env = Record<string, string | undefined>;

function vapid(env: Env = process.env): { subject: string; publicKey: string; privateKey: string } | null {
  const publicKey = (env.VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = (env.VAPID_PRIVATE_KEY ?? "").trim();
  if (!publicKey || !privateKey) return null;
  return { subject: (env.VAPID_SUBJECT ?? "").trim() || siteUrl(env).origin, publicKey, privateKey };
}

/** True when this deployment can send. */
export function pushConfigured(env: Env = process.env): boolean {
  return vapid(env) !== null;
}

/** The key a phone subscribes with; "" without keys. */
export function pushPublicKey(env: Env = process.env): string {
  return vapid(env)?.publicKey ?? "";
}

/* ---------- subscriptions ---------- */

export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string; label: string };

const MAX_ENDPOINT = 2000;
const MAX_KEY = 255;
const MAX_LABEL = 100;

/** A browser's PushSubscription (nested or flat keys) → a row, or null. https only. */
export function cleanSubscription(raw: unknown, label?: unknown): PushSubscriptionInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as { endpoint?: unknown; keys?: unknown; p256dh?: unknown; auth?: unknown };
  const keys = (body.keys && typeof body.keys === "object" ? body.keys : body) as { p256dh?: unknown; auth?: unknown };
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = typeof keys.auth === "string" ? keys.auth.trim() : "";
  if (!endpoint || !p256dh || !auth) return null;
  if (endpoint.length < 20 || endpoint.length > MAX_ENDPOINT || p256dh.length > MAX_KEY || auth.length > MAX_KEY) return null;
  try {
    if (new URL(endpoint).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { endpoint, p256dh, auth, label: typeof label === "string" ? label.trim().slice(0, MAX_LABEL) : "" };
}

/**
 * Add this phone for this login, or bring it back. The same endpoint is the
 * same browser: if another login used it before (a shared tablet), it is
 * this login's now.
 */
export async function saveSubscription(q: Querier, userId: string, s: PushSubscriptionInput): Promise<void> {
  await q(
    `insert into push_subscriptions (endpoint, user_id, p256dh, auth, label) values ($1, $2, $3, $4, $5)
     on conflict (endpoint) do update
        set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
            label = case when excluded.label = '' then push_subscriptions.label else excluded.label end,
            retired_at = null, retired_reason = null`,
    [s.endpoint, userId, s.p256dh, s.auth, s.label],
  );
}

/** Turn this phone off for this login. False when it was not on. */
export async function removeSubscription(q: Querier, userId: string, endpoint: string): Promise<boolean> {
  const rows = await q<{ endpoint: string }>(
    "update push_subscriptions set retired_at = now(), retired_reason = 'user' where endpoint = $1 and user_id = $2 and retired_at is null returning endpoint",
    [String(endpoint).slice(0, MAX_ENDPOINT), userId],
  );
  return rows.length > 0;
}

export type PushDevice = { endpoint: string; label: string; createdAt: string; lastOkAt: string | null };

/** This login's live phones. */
export async function listDevices(q: Querier, userId: string): Promise<PushDevice[]> {
  const rows = await q<{ endpoint: string; label: string; created_at: Date; last_ok_at: Date | null }>(
    "select endpoint, label, created_at, last_ok_at from push_subscriptions where user_id = $1 and retired_at is null order by created_at",
    [userId],
  );
  return rows.map((r) => ({ endpoint: r.endpoint, label: r.label, createdAt: new Date(r.created_at).toISOString(), lastOkAt: r.last_ok_at ? new Date(r.last_ok_at).toISOString() : null }));
}

/* ---------- which kinds a login wants ---------- */

/** Switch one kind on or off for this login (users.notify). */
export async function setNotify(q: Querier, businessId: string, userId: string, kind: string, on: boolean): Promise<boolean> {
  if (!isPushKind(kind)) return false;
  const rows = await q<{ id: string }>(
    "update users set notify = notify || jsonb_build_object($3::text, $4::boolean), updated_at = now() where id = $1 and business_id = $2 returning id",
    [userId, businessId, kind, !!on],
  );
  return rows.length > 0;
}

/* ---------- queueing ---------- */

export type PushAudience = { staffId: string } | "owners";

/**
 * Queue one push per login that should get it: the login(s) tied to the
 * column (a barber's, or Renat's own when he cuts too), or Renat and the
 * front desk. Only logins that are active,
 * have a live phone and want this kind; never the one who made the change.
 * In the caller's transaction, so the push exists only if the change does.
 */
export async function queuePush(
  q: Querier,
  m: { businessId: string; appointmentId?: string | null; kind: PushKind; to: PushAudience; exceptUserId?: string | null; payload: Record<string, unknown>; now?: number },
): Promise<number> {
  const staffId = m.to === "owners" ? null : m.to.staffId;
  const rows = await q<{ id: string }>(
    `insert into notifications (business_id, appointment_id, channel, kind, recipient, user_id, locale, payload, send_at)
     select $1, $2, 'push', $3, u.id::text, u.id, u.locale, $4::jsonb, $5
       from users u
      where u.business_id = $1 and u.active
        and (case when $6::uuid is null then u.role in ('owner', 'admin') else u.staff_id = $6::uuid end)
        and u.id::text is distinct from $7
        and coalesce((u.notify ->> $3)::boolean, $8)
        and exists (select 1 from push_subscriptions p where p.user_id = u.id and p.retired_at is null)
     returning id`,
    [m.businessId, m.appointmentId ?? null, m.kind, JSON.stringify(m.payload), new Date(m.now ?? Date.now()), staffId, m.exceptUserId ?? null, DEFAULT_ON[m.kind]],
  );
  return rows.length;
}

/**
 * A change to a visit, told by push: to the barber(s) whose column it is
 * (`kind`), and to Renat and the front desk when `owners` says so. The
 * words are a snapshot of the visit now (time, client's name, services,
 * barber), never the phone. Nothing for a visit already over, and nothing
 * to the login that made the change.
 */
export async function pushVisitChange(
  q: Querier,
  o: {
    businessId: string;
    appointmentId: string;
    staffIds: string[];
    kind: "visit_new" | "visit_moved" | "visit_cancelled";
    owners?: { kind: "own_online" | "own_client" | "own_barber"; action?: "moved" | "cancelled" } | null;
    actor?: string | null;
    extra?: Partial<VisitPayload>;
    now?: number;
  },
): Promise<number> {
  if (!pushConfigured()) return 0;
  const now = o.now ?? Date.now();
  const [v] = await q<{ id: string; starts_at: Date; blocked_until: Date; client: string; staff: string; tz: string; services: VisitPayload["services"] }>(
    `select a.id, a.starts_at, a.blocked_until, c.name as client, s.display_name as staff, l.timezone as tz,
            coalesce((select jsonb_agg(x.name order by x.position) from appointment_services x where x.appointment_id = a.id), '[]'::jsonb) as services
       from appointments a
       join clients c on c.id = a.client_id
       join staff s on s.id = a.staff_id
       join locations l on l.id = a.location_id
      where a.id = $1 and a.business_id = $2`,
    [o.appointmentId, o.businessId],
  );
  if (!v || new Date(v.blocked_until).getTime() <= now) return 0;
  const payload: VisitPayload = {
    visitId: v.id,
    startsAt: new Date(v.starts_at).toISOString(),
    tz: v.tz,
    client: v.client,
    services: v.services,
    staff: v.staff,
    ...o.extra,
    ...(o.owners?.action ? { action: o.owners.action } : {}),
  };
  let n = 0;
  for (const staffId of [...new Set(o.staffIds)]) {
    n += await queuePush(q, { businessId: o.businessId, appointmentId: v.id, kind: o.kind, to: { staffId }, exceptUserId: o.actor, payload, now });
  }
  if (o.owners) n += await queuePush(q, { businessId: o.businessId, appointmentId: v.id, kind: o.owners.kind, to: "owners", exceptUserId: o.actor, payload, now });
  return n;
}

/* ---------- sending ---------- */

/** How long one push may take; the library has no timeout of its own. */
const SEND_TIMEOUT_MS = 5_000;
/** How long the push service keeps it for a phone that is off. */
const TTL_SECONDS = 6 * 60 * 60;

type WebPush = typeof import("web-push");

/** web-push is CommonJS: its functions may sit under `default`. */
async function loadWebPush(): Promise<WebPush> {
  const mod = (await import("web-push")) as WebPush & { default?: WebPush };
  return mod.default ?? mod;
}

/** 404 and 410: this subscription will never work again. Anything else is about this try. */
const isGone = (err: unknown) => {
  const code = (err as { statusCode?: unknown })?.statusCode;
  return code === 404 || code === 410;
};

export type PushSendResult = { devices: number; sent: number; failed: number; gone: number };

/**
 * Send one message to every live phone of one login. Throws when nothing
 * could be sent but something may still work later (the outbox retries);
 * a login with no live phone sends nothing and does not throw.
 */
export async function sendPushToUser(q: Querier, userId: string, msg: PushText, env: Env = process.env): Promise<PushSendResult> {
  const details = vapid(env);
  if (!details) throw new Error("push is not configured");
  const subs = await q<{ endpoint: string; p256dh: string; auth: string }>(
    "select endpoint, p256dh, auth from push_subscriptions where user_id = $1 and retired_at is null order by created_at",
    [userId],
  );
  if (!subs.length) return { devices: 0, sent: 0, failed: 0, gone: 0 };
  const wp = await loadWebPush();
  const payload = JSON.stringify({ title: msg.title.slice(0, 100), body: msg.body.slice(0, 300), url: msg.url.slice(0, 500), tag: msg.tag.slice(0, 100) });
  const outcomes = await Promise.all(
    subs.map(async (s): Promise<"sent" | "gone" | "failed"> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          wp
            .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { vapidDetails: details, TTL: TTL_SECONDS, urgency: "high" })
            .then(() => "sent" as const),
          new Promise<"failed">((resolve) => {
            timer = setTimeout(() => resolve("failed"), SEND_TIMEOUT_MS);
          }),
        ]);
      } catch (err) {
        if (isGone(err)) return "gone";
        console.error("[push] a phone refused the push:", (err as { statusCode?: unknown })?.statusCode ?? "error");
        return "failed";
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  const ok = subs.filter((_, i) => outcomes[i] === "sent").map((s) => s.endpoint);
  const gone = subs.filter((_, i) => outcomes[i] === "gone").map((s) => s.endpoint);
  if (ok.length) await q("update push_subscriptions set last_ok_at = now() where endpoint = any($1::text[])", [ok]);
  if (gone.length) await q("update push_subscriptions set retired_at = now(), retired_reason = 'gone' where endpoint = any($1::text[]) and retired_at is null", [gone]);
  const res = { devices: subs.length, sent: ok.length, failed: subs.length - ok.length - gone.length, gone: gone.length };
  if (!res.sent && res.failed) throw new Error(`push failed on ${res.failed} phone(s)`);
  return res;
}
