/**
 * The message outbox (db/migrations/004_notifications.sql): a row is one
 * message to one recipient; /api/cron/outbox sends the due ones.
 *
 * Reminders are planned from the appointments themselves on every run, so
 * neither the booking code nor the admin has to remember them:
 *   - a booked visit with reminder_min and a phone gets one SMS row, due at
 *     starts_at − reminder_min;
 *   - a visit that moved, was cancelled or lost its reminder gets its queued
 *     row cancelled (and, if still booked, a new one at the new time).
 *
 * The e-mail confirmation is queued by the booking itself (src/lib/booking.ts)
 * and sent by sendForVisit right after the response; the cron picks it up if
 * that try fails. Its letter is built at send time from the visit as it is
 * then (a visit cancelled meanwhile gets no letter), with a change link of
 * its own (visit_links, 006) and the .ics attached.
 *
 * Sending claims rows with `for update skip locked`, so two runs never send
 * one message twice; a claimed row whose run died is retried after
 * locked_until. A channel whose transport is «disabled» (production with no
 * provider yet) is not claimed at all: its rows wait, nothing is lost.
 */
import { getBusinessById } from "./availability";
import type { Querier } from "./db";
import { emailTransport, sendEmail, type LetterBody } from "./email";
import { confirmationLetter } from "./letters";
import { siteUrl } from "./site";
import { sendSms, smsTransport } from "./sms";
import { localParts } from "./tz";
import { mintVisitLink, visitById } from "./visits";

type Env = Record<string, string | undefined>;
export type Channel = "sms" | "email" | "push";
type Locale = "ru" | "et" | "en";

export const OUTBOX = {
  /** rows claimed per run */
  batch: 50,
  /** a claimed row is free again after this, if its run died */
  lockMin: 5,
  /** tries before a row is «failed» */
  maxAttempts: 5,
  /** reminders are planned this far ahead of their send time */
  planAheadHours: 48,
  /** a reminder is not sent closer to the visit than this */
  reminderMinLeadMin: 15,
};

export type OutboxRow = {
  id: string;
  business_id: string;
  appointment_id: string | null;
  channel: Channel;
  kind: string;
  recipient: string;
  locale: Locale;
  payload: Record<string, unknown>;
  send_at: Date;
  attempts: number;
};

export type NewMessage = {
  businessId: string;
  appointmentId?: string | null;
  channel: Channel;
  kind: string;
  recipient: string;
  locale?: Locale;
  payload?: Record<string, unknown>;
  sendAt?: number;
};

/** Queue one message. */
export async function enqueue(q: Querier, m: NewMessage, now = Date.now()): Promise<string> {
  const [r] = await q<{ id: string }>(
    `insert into notifications (business_id, appointment_id, channel, kind, recipient, locale, payload, send_at)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) returning id`,
    [m.businessId, m.appointmentId ?? null, m.channel, m.kind, m.recipient, m.locale ?? "ru", JSON.stringify(m.payload ?? {}), new Date(m.sendAt ?? now)],
  );
  return r.id;
}

const REMINDER_AT = "a.starts_at - make_interval(mins => a.reminder_min)";
// the time a reminder was planned for; send_at moves on retries, this does not
const PLANNED_AT = "(n.payload->>'dueAt')::timestamptz";

/** Bring the queued reminders in line with the visits. */
export async function planReminders(q: Querier, now = Date.now()): Promise<{ added: number; cancelled: number }> {
  const cancelled = await q<{ id: string }>(
    `update notifications n set status = 'cancelled', locked_until = null
       from appointments a
      where n.appointment_id = a.id and n.kind = 'reminder' and n.status = 'queued'
        and (a.status not in ('booked', 'pending') or a.reminder_min is null or ${PLANNED_AT} is distinct from ${REMINDER_AT})
      returning n.id`,
  );
  const added = await q<{ id: string }>(
    `insert into notifications (business_id, appointment_id, channel, kind, recipient, locale, payload, send_at)
     select a.business_id, a.id, 'sms', 'reminder', c.phone_e164, a.locale,
            jsonb_build_object('startsAt', a.starts_at, 'dueAt', ${REMINDER_AT}, 'staff', s.display_name,
                               'business', b.name, 'address', l.address, 'tz', l.timezone),
            ${REMINDER_AT}
       from appointments a
       join clients c on c.id = a.client_id
       join staff s on s.id = a.staff_id
       join businesses b on b.id = a.business_id
       join locations l on l.id = a.location_id
      where a.status in ('booked', 'pending') and a.reminder_min is not null
        and c.phone_e164 is not null and not c.sms_opt_out
        and a.starts_at > $1
        and ${REMINDER_AT} < $2
        and not exists (select 1 from notifications n
                         where n.appointment_id = a.id and n.kind = 'reminder'
                           and n.status <> 'cancelled' and ${PLANNED_AT} = ${REMINDER_AT})
     returning id`,
    [new Date(now + OUTBOX.reminderMinLeadMin * 60_000), new Date(now + OUTBOX.planAheadHours * 3_600_000)],
  );
  return { added: added.length, cancelled: cancelled.length };
}

/** Claim due rows of the given channels for this run, or for one visit only. */
export async function claimDue(
  q: Querier,
  channels: Channel[],
  now = Date.now(),
  limit = OUTBOX.batch,
  appointmentId: string | null = null,
): Promise<OutboxRow[]> {
  if (!channels.length) return [];
  return q<OutboxRow>(
    `update notifications set status = 'sending', locked_until = $2, attempts = attempts + 1
      where id in (select id from notifications
                    where channel = any($3::text[]) and send_at <= $1
                      and (status = 'queued' or (status = 'sending' and locked_until < $1))
                      and ($5::uuid is null or appointment_id = $5::uuid)
                    order by send_at
                    limit $4
                    for update skip locked)
      returning id, business_id, appointment_id, channel, kind, recipient, locale, payload, send_at, attempts`,
    [new Date(now), new Date(now + OUTBOX.lockMin * 60_000), channels, limit, appointmentId],
  );
}

function enabledChannels(env: Env): Channel[] {
  const channels: Channel[] = [];
  if (smsTransport(env) !== "disabled") channels.push("sms");
  if (emailTransport(env) !== "disabled") channels.push("email");
  return channels;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The text of a message, built at send time from its payload. */
export function messageText(row: Pick<OutboxRow, "kind" | "locale" | "payload">): string | null {
  const p = row.payload as { startsAt?: string; staff?: string; business?: string; address?: string; tz?: string; text?: string };
  if (row.kind === "reminder" && p.startsAt) {
    const when = localParts(Date.parse(p.startsAt), p.tz || "Europe/Tallinn");
    const [, m, d] = when.date.split("-").map(Number);
    const day = `${pad(d)}.${pad(m)}`;
    const name = p.business || "REMPIRE";
    const place = p.address ? ` ${p.address}.` : "";
    const staff = p.staff ? p.staff : "";
    if (row.locale === "et") return `${name}: meeldetuletus, Teie aeg ${day} kell ${when.time}${staff ? `, ${staff}` : ""}.${place}`;
    if (row.locale === "en") return `${name}: reminder of your visit on ${day} at ${when.time}${staff ? ` with ${staff}` : ""}.${place}`;
    return `${name}: напоминаем о записи ${day} в ${when.time}${staff ? `, барбер ${staff}` : ""}.${place}`;
  }
  if (typeof p.text === "string" && p.text) return p.text;
  return null;
}

export type Senders = {
  sms: typeof sendSms;
  email: typeof sendEmail;
};

export type OutboxResult = { planned: number; cancelled: number; sent: number; retry: number; failed: number; skipped: number; waiting: number };

type Composed = { skip: string } | { subject: string; body: string | LetterBody };

const LIVE = new Set(["booked", "pending"]);

/** What a claimed row sends, built now; or why it is not sent at all. */
async function compose(q: Querier, row: OutboxRow, now: number, env: Env): Promise<Composed> {
  const p = row.payload as { startsAt?: string; subject?: string };
  if (row.kind === "confirmation" && row.channel === "email") {
    const v = row.appointment_id ? await visitById(q, row.appointment_id) : null;
    if (!v) return { skip: "visit gone" };
    if (!LIVE.has(v.status)) return { skip: `visit ${v.status}` };
    if (Date.parse(v.startsAt) <= now) return { skip: "visit already started" };
    const business = await getBusinessById(q, row.business_id);
    if (!business) return { skip: "business gone" };
    // a link of this letter's own: only its hash is kept (006_visit_links.sql)
    const token = await mintVisitLink(q, v.id, "email");
    const letter = confirmationLetter(v, { business, origin: siteUrl(env).origin, token, locale: row.locale, now });
    return { subject: letter.subject, body: letter };
  }
  if (row.kind === "reminder" && Date.parse(String(p.startsAt)) <= now) return { skip: "visit already started" };
  const text = messageText(row);
  if (!text) return { skip: "no text" };
  return { subject: String(p.subject || "REMPIRE"), body: text };
}

const emptyResult = (): OutboxResult => ({ planned: 0, cancelled: 0, sent: 0, retry: 0, failed: 0, skipped: 0, waiting: 0 });

/** One cron run: plan reminders, then send what is due on the channels that are set up. */
export async function runOutbox(q: Querier, now = Date.now(), env: Env = process.env, senders: Senders = { sms: sendSms, email: sendEmail }): Promise<OutboxResult> {
  const plan = await planReminders(q, now);
  const res: OutboxResult = { ...emptyResult(), planned: plan.added, cancelled: plan.cancelled };
  await deliver(q, await claimDue(q, enabledChannels(env), now), now, env, senders, res);
  const [w] = await q<{ n: number }>(`select count(*)::int as n from notifications where status = 'queued' and send_at <= $1`, [new Date(now)]);
  res.waiting = w.n;
  return res;
}

/**
 * Send what is due for one visit now: the confirmation, right after the
 * booking's response. Whatever this misses, the next cron run sends.
 */
export async function sendForVisit(q: Querier, appointmentId: string, now = Date.now(), env: Env = process.env, senders: Senders = { sms: sendSms, email: sendEmail }): Promise<OutboxResult> {
  const res = emptyResult();
  await deliver(q, await claimDue(q, enabledChannels(env), now, OUTBOX.batch, appointmentId), now, env, senders, res);
  return res;
}

async function deliver(q: Querier, rows: OutboxRow[], now: number, env: Env, senders: Senders, res: OutboxResult) {
  for (const row of rows) {
    try {
      const msg = await compose(q, row, now, env);
      if ("skip" in msg) {
        await q(`update notifications set status = 'skipped', locked_until = null, last_error = $2 where id = $1`, [row.id, msg.skip]);
        res.skipped++;
        continue;
      }
      if (row.channel === "sms") {
        const r = await senders.sms(row.recipient, typeof msg.body === "string" ? msg.body : msg.body.text, env);
        await q(
          `update notifications set status = 'sent', sent_at = $2, provider = $3, provider_ref = $4, segments = $5, locked_until = null, last_error = null where id = $1`,
          [row.id, new Date(now), r.provider, r.ref, r.segments],
        );
      } else if (row.channel === "email") {
        const r = await senders.email(row.recipient, msg.subject, msg.body, env);
        await q(`update notifications set status = 'sent', sent_at = $2, provider = $3, provider_ref = $4, locked_until = null, last_error = null where id = $1`, [
          row.id,
          new Date(now),
          r.provider,
          r.ref,
        ]);
      } else {
        throw new Error(`no sender for ${row.channel}`);
      }
      res.sent++;
    } catch (e) {
      const error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      if (row.attempts >= OUTBOX.maxAttempts) {
        await q(`update notifications set status = 'failed', locked_until = null, last_error = $2 where id = $1`, [row.id, error]);
        res.failed++;
      } else {
        // 2, 4, 8, 16 minutes
        const next = new Date(now + 2 ** row.attempts * 60_000);
        await q(`update notifications set status = 'queued', locked_until = null, send_at = $2, last_error = $3 where id = $1`, [row.id, next, error]);
        res.retry++;
      }
    }
  }
}
