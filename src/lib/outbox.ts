/**
 * The message outbox (db/migrations/004_notifications.sql): a row is one
 * message to one recipient; /api/cron/outbox sends the due ones.
 *
 * Reminders are planned from the appointments themselves on every run, so
 * neither the booking code nor the admin has to remember them:
 *   - a booked visit with reminder_min and a phone gets one SMS row, due at
 *     starts_at − reminder_min;
 *   - a visit that moved, was cancelled or lost its reminder gets its queued
 *     row cancelled (and, if still booked, a new one at the new time);
 *   - at send time it gets a short change link of its own (/v/…).
 *
 * The e-mail confirmation is queued by the booking itself (src/lib/booking.ts,
 * online and admin) and, for online bookings, sent by sendForVisit right
 * after the response; the cron sends the rest and retries. Its letter is built at send time from the visit as it is
 * then (a visit cancelled meanwhile gets no letter), with a change link of
 * its own (visit_links, 006) and the .ics attached.
 *
 * When the admin moves or cancels a visit, a «moved» or «cancelled» letter
 * goes to the address the confirmation went to (queueChangeLetter); the cron
 * sends it, a moved one 2 minutes later, so quick moves make one letter.
 *
 * Sending claims rows with `for update skip locked`, so two runs never send
 * one message twice; a claimed row whose run died is retried after
 * locked_until. A channel whose transport is «disabled» (production with no
 * provider yet) is not claimed at all: its rows wait, nothing is lost.
 *
 * Push (Phase B, B5): rows to one login each (user_id; src/lib/push.ts),
 * claimed only when the VAPID keys are set. Their text is built at send time
 * in that login's language (src/lib/push-kinds.ts); a push more than two
 * hours late is dropped, not sent. From 20:00 the cron also queues each
 * login's plan for tomorrow (planEveningPush), once per day.
 *
 * The client's reminder as a notification (docs/apps.md, step 4;
 * src/lib/client-push.ts): a push row of kind «client_reminder» to the
 * client's own phone, planned like the SMS for every visit some phone was
 * turned on for (a phone is tied to one visit, never to the client: 013), a
 * minute before the SMS's time. The business's switch
 * (settings.client_reminder) says how the two go together: «sms» plans no
 * notification; «both» sends both; «push» skips the SMS of a visit whose
 * notification went out, so only clients without it cost an SMS.
 */
import { after } from "next/server";
import { getBusinessById } from "./availability";
import { sendPushToClient } from "./client-push";
import { query, type Querier } from "./db";
import { emailTransport, sendEmail, type LetterBody } from "./email";
import { confirmationLetter, visitLetter } from "./letters";
import { pushConfigured, sendPushToUser, type PushSendResult } from "./push";
import { DEFAULT_ON, pushText, type PushText } from "./push-kinds";
import { siteUrl } from "./site";
import { sendSms, smsSegments, smsTransport } from "./sms";
import { mailGuard } from "./test-run";
import { addDays, localParts, startOfDay } from "./tz";
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
  /** a push this late is dropped: old news on a lock screen confuses */
  pushStaleMin: 120,
  /** the salon's local time from which tomorrow's plan goes out */
  planAt: "20:00",
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

// the business's switch as SQL: anything but «sms» or «push» is the default, «both» (src/lib/settings.ts)
const REMINDER_MODE = "(case when b.settings->>'client_reminder' in ('sms', 'push') then b.settings->>'client_reminder' else 'both' end)";
// a visit booked without the SMS reminder is still reminded by a notification, the business's usual time before
const PUSH_LEAD_MIN = "coalesce(a.reminder_min, case when jsonb_typeof(b.settings->'reminder_min') = 'number' then (b.settings->>'reminder_min')::numeric::int else 120 end)";
const PUSH_REMINDER_AT = `a.starts_at - make_interval(mins => ${PUSH_LEAD_MIN})`;

/** The same for the clients' notifications: a row per visit that a live phone was turned on for. */
async function planClientPush(q: Querier, now: number): Promise<{ added: number; cancelled: number }> {
  const cancelled = await q<{ id: string }>(
    `update notifications n set status = 'cancelled', locked_until = null
       from appointments a, businesses b
      where n.appointment_id = a.id and b.id = a.business_id and n.kind = 'client_reminder' and n.status = 'queued'
        and (a.status not in ('booked', 'pending') or ${REMINDER_MODE} = 'sms' or ${PLANNED_AT} is distinct from ${PUSH_REMINDER_AT})
      returning n.id`,
  );
  const added = await q<{ id: string }>(
    `insert into notifications (business_id, appointment_id, channel, kind, recipient, locale, payload, send_at)
     select a.business_id, a.id, 'push', 'client_reminder', a.id::text, a.locale,
            jsonb_build_object('startsAt', a.starts_at, 'dueAt', ${PUSH_REMINDER_AT}, 'staff', s.display_name,
                               'business', b.name, 'address', l.address, 'tz', l.timezone),
            ${PUSH_REMINDER_AT} - interval '1 minute'
       from appointments a
       join staff s on s.id = a.staff_id
       join businesses b on b.id = a.business_id
       join locations l on l.id = a.location_id
      where a.status in ('booked', 'pending') and ${REMINDER_MODE} <> 'sms'
        and exists (select 1 from client_push_subscriptions p where p.appointment_id = a.id and p.retired_at is null)
        and a.starts_at > $1
        and ${PUSH_REMINDER_AT} < $2
        and not exists (select 1 from notifications n
                         where n.appointment_id = a.id and n.kind = 'client_reminder'
                           and n.status <> 'cancelled' and ${PLANNED_AT} = ${PUSH_REMINDER_AT})
     returning id`,
    [new Date(now + OUTBOX.reminderMinLeadMin * 60_000), new Date(now + OUTBOX.planAheadHours * 3_600_000)],
  );
  return { added: added.length, cancelled: cancelled.length };
}

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
  const push = await planClientPush(q, now);
  return { added: added.length + push.added, cancelled: cancelled.length + push.cancelled };
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
  const rows = await q<OutboxRow>(
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
  // an UPDATE returns its rows in no promised order; they go out oldest first,
  // so a visit's notification (due a minute earlier) is sent before its SMS decides
  return rows.sort((a, b) => new Date(a.send_at).getTime() - new Date(b.send_at).getTime());
}

function enabledChannels(env: Env): Channel[] {
  const channels: Channel[] = [];
  if (smsTransport(env) !== "disabled") channels.push("sms");
  if (emailTransport(env) !== "disabled") channels.push("email");
  if (pushConfigured(env)) channels.push("push");
  return channels;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A redirected staging letter says on top who it was for (the text part has the same line). */
function withTestNote(html: string, note: string): string {
  const esc = note.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const bar = '<div style="background:#fff3c4;color:#000;padding:8px 12px;font:14px sans-serif">' + esc + "</div>";
  return /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (m) => m + bar) : bar + html;
}

// the reminder's change link label; Estonian avoids «õ», which would make the whole SMS UCS-2
const LINK_LABEL: Record<Locale, string> = { ru: "Перенести/отменить", et: "Muuda/tühista", en: "Change or cancel" };

/**
 * The text of a message, built at send time from its payload. A reminder
 * with a change link (Dim, 17.11.2026: a short link, 2 parts) drops the
 * address when the link would otherwise cost a third SMS part.
 */
/** The reminder as a notification: the salon's name is the title, so the line starts with the visit. */
export function clientReminderText(row: Pick<OutboxRow, "locale" | "payload" | "appointment_id">, url: string): PushText | null {
  const p = row.payload as { startsAt?: string; staff?: string; business?: string; address?: string; tz?: string };
  if (!p.startsAt) return null;
  const when = localParts(Date.parse(p.startsAt), p.tz || "Europe/Tallinn");
  const [, m, d] = when.date.split("-").map(Number);
  const day = `${pad(d)}.${pad(m)}`;
  const staff = p.staff ? p.staff : "";
  const head =
    row.locale === "et"
      ? `Meeldetuletus: Teie aeg ${day} kell ${when.time}${staff ? `, ${staff}` : ""}.`
      : row.locale === "en"
        ? `Reminder: your visit on ${day} at ${when.time}${staff ? ` with ${staff}` : ""}.`
        : `Напоминаем о записи ${day} в ${when.time}${staff ? `, барбер ${staff}` : ""}.`;
  return { title: p.business || "REMPIRE", body: `${head}${p.address ? ` ${p.address}.` : ""}`, url, tag: `visit-${row.appointment_id ?? "x"}` };
}

export function messageText(row: Pick<OutboxRow, "kind" | "locale" | "payload">, link = ""): string | null {
  const p = row.payload as { startsAt?: string; staff?: string; business?: string; address?: string; tz?: string; text?: string };
  if (row.kind === "reminder" && p.startsAt) {
    const when = localParts(Date.parse(p.startsAt), p.tz || "Europe/Tallinn");
    const [, m, d] = when.date.split("-").map(Number);
    const day = `${pad(d)}.${pad(m)}`;
    const name = p.business || "REMPIRE";
    const place = p.address ? ` ${p.address}.` : "";
    const staff = p.staff ? p.staff : "";
    const head =
      row.locale === "et"
        ? `${name}: meeldetuletus, Teie aeg ${day} kell ${when.time}${staff ? `, ${staff}` : ""}.`
        : row.locale === "en"
          ? `${name}: reminder of your visit on ${day} at ${when.time}${staff ? ` with ${staff}` : ""}.`
          : `${name}: напоминаем о записи ${day} в ${when.time}${staff ? `, барбер ${staff}` : ""}.`;
    const tail = link ? ` ${LINK_LABEL[row.locale] ?? LINK_LABEL.ru}: ${link}` : "";
    const full = `${head}${place}${tail}`;
    if (tail && place && smsSegments(full).segments > 2) return `${head}${tail}`;
    return full;
  }
  if (typeof p.text === "string" && p.text) return p.text;
  return null;
}

export type Senders = {
  sms: typeof sendSms;
  email: typeof sendEmail;
  /** optional: left out, the real one is used */
  push?: (q: Querier, userId: string, msg: PushText, env: Env) => Promise<PushSendResult>;
  /** the same for the phones turned on for one visit (kind «client_reminder») */
  pushClient?: (q: Querier, appointmentId: string, msg: PushText, env: Env) => Promise<PushSendResult>;
};

export type OutboxResult = { planned: number; cancelled: number; sent: number; retry: number; failed: number; skipped: number; waiting: number };

type Composed = { skip: string } | { subject: string; body: string | LetterBody } | { push: PushText };

const LIVE = new Set(["booked", "pending"]);

/** What a claimed row sends, built now; or why it is not sent at all. */
async function compose(q: Querier, row: OutboxRow, now: number, env: Env): Promise<Composed> {
  if (row.channel === "push") return composePush(q, row, now);
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
  if ((row.kind === "moved" || row.kind === "cancelled") && row.channel === "email") {
    // queued by src/lib/booking.ts queueChangeLetter; built from the visit as it is now
    const v = row.appointment_id ? await visitById(q, row.appointment_id) : null;
    if (!v) return { skip: "visit gone" };
    if (Date.parse(v.startsAt) <= now) return { skip: "visit already started" };
    const from = row.payload as { fromStart?: string; fromStaffId?: string; fromStaff?: string };
    if (row.kind === "moved") {
      if (!LIVE.has(v.status)) return { skip: `visit ${v.status}` };
      // moved and moved back before the letter went
      if (from.fromStart && Date.parse(from.fromStart) === Date.parse(v.startsAt) && from.fromStaffId === v.staffId) return { skip: "back where it was" };
    } else if (v.status !== "cancelled") return { skip: `visit ${v.status}` };
    const business = await getBusinessById(q, row.business_id);
    if (!business) return { skip: "business gone" };
    const token = await mintVisitLink(q, v.id, "email");
    const letter = visitLetter(row.kind, v, {
      business,
      origin: siteUrl(env).origin,
      token,
      locale: row.locale,
      now,
      from: from.fromStart ? { startsAt: from.fromStart, staffName: from.fromStaff } : undefined,
    });
    return { subject: letter.subject, body: letter };
  }
  if (row.kind === "invoice" && row.channel === "email") {
    // Phase C: the issued invoice with its PDF (src/lib/billing/send.ts); loaded only when one is due
    const { invoiceMessage } = await import("./billing/send");
    return invoiceMessage(q, row, env);
  }
  let link = "";
  if (row.kind === "reminder") {
    if (Date.parse(String(p.startsAt)) <= now) return { skip: "visit already started" };
    // «push» mode: this visit's notification went out, so the SMS is not needed
    if (row.appointment_id) {
      const [told] = await q<{ id: string }>(
        `select n.id from notifications n join businesses b on b.id = n.business_id
          where n.appointment_id = $1 and n.kind = 'client_reminder' and n.status = 'sent'
            and ${PLANNED_AT} = ($2::text)::timestamptz and ${REMINDER_MODE} = 'push' limit 1`,
        [row.appointment_id, String((row.payload as { dueAt?: unknown }).dueAt ?? "")],
      );
      if (told) return { skip: "sent as a notification" };
    }
    // a short link of this SMS's own: /v/<16 characters> (src/app/v/[token])
    if (row.appointment_id) link = `${siteUrl(env).origin}/v/${await mintVisitLink(q, row.appointment_id, "sms", 12)}`;
  }
  const text = messageText(row, link);
  if (!text) return { skip: "no text" };
  return { subject: String(p.subject || "REMPIRE"), body: text };
}

const emptyResult = (): OutboxResult => ({ planned: 0, cancelled: 0, sent: 0, retry: 0, failed: 0, skipped: 0, waiting: 0 });

/** One cron run: plan reminders, then send what is due on the channels that are set up. */
export async function runOutbox(q: Querier, now = Date.now(), env: Env = process.env, senders: Senders = { sms: sendSms, email: sendEmail }): Promise<OutboxResult> {
  const plan = await planReminders(q, now);
  const res: OutboxResult = { ...emptyResult(), planned: plan.added, cancelled: plan.cancelled };
  if (pushConfigured(env)) res.planned += await planEveningPush(q, now);
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
      if (row.channel === "sms" && "body" in msg) {
        const r = await senders.sms(row.recipient, typeof msg.body === "string" ? msg.body : msg.body.text, env);
        await q(
          `update notifications set status = 'sent', sent_at = $2, provider = $3, provider_ref = $4, segments = $5, locked_until = null, last_error = null where id = $1`,
          [row.id, new Date(now), r.provider, r.ref, r.segments],
        );
      } else if (row.channel === "push" && "push" in msg) {
        // a login's phones, or the phones turned on for this one visit
        const r =
          row.kind === "client_reminder"
            ? await (senders.pushClient ?? sendPushToClient)(q, row.appointment_id ?? "", msg.push, env)
            : await (senders.push ?? sendPushToUser)(q, row.recipient, msg.push, env);
        if (!r.devices) {
          await q(`update notifications set status = 'skipped', locked_until = null, last_error = 'no phone' where id = $1`, [row.id]);
          res.skipped++;
          continue;
        }
        await q(`update notifications set status = 'sent', sent_at = $2, provider = 'webpush', provider_ref = $3, locked_until = null, last_error = null where id = $1`, [
          row.id,
          new Date(now),
          `${r.sent}/${r.devices}`,
        ]);
      } else if (row.channel === "email" && "subject" in msg) {
        // staging: a letter reaches only staff; the rest goes to the shop inbox (src/lib/test-run.ts)
        const body = typeof msg.body === "string" ? { text: msg.body } : msg.body;
        const g = await mailGuard(q, row.recipient, msg.subject, body.text, env);
        const html = g.redirected && body.html ? withTestNote(body.html, g.text.split("\n")[0]) : body.html;
        const r = await senders.email(g.to, g.subject, { text: g.text, ...(html ? { html } : {}), ...(body.attachments ? { attachments: body.attachments } : {}) }, env);
        await q(`update notifications set status = 'sent', sent_at = $2, provider = $3, provider_ref = $4, locked_until = null, last_error = null where id = $1`, [
          row.id,
          new Date(now),
          r.provider,
          r.ref,
        ]);
        const invoiceId = row.kind === "invoice" ? row.payload.invoiceId : null;
        if (typeof invoiceId === "string" && /^[0-9a-f-]{36}$/i.test(invoiceId)) await q("update invoices set sent_at = coalesce(sent_at, $2) where id = $1", [invoiceId, new Date(now)]);
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

/* ---------- push (Phase B, B5) ---------- */

const VISIT_KINDS = new Set(["visit_new", "visit_moved", "own_online"]);

/** A push row's words, built now; or why it is not sent. */
async function composePush(q: Querier, row: OutboxRow, now: number): Promise<Composed> {
  if (now - new Date(row.send_at).getTime() > OUTBOX.pushStaleMin * 60_000) return { skip: "stale" };
  if (row.kind === "client_reminder") {
    // the visit as it is now; the notification opens the client's own change link
    if (!row.appointment_id) return { skip: "no visit" };
    const [a] = await q<{ status: string; starts_at: Date }>("select status, starts_at from appointments where id = $1", [row.appointment_id]);
    if (!a) return { skip: "visit gone" };
    if (!LIVE.has(a.status)) return { skip: `visit ${a.status}` };
    if (new Date(a.starts_at).getTime() <= now) return { skip: "visit already started" };
    const text = clientReminderText(row, `/v/${await mintVisitLink(q, row.appointment_id, "push", 12)}`);
    return text ? { push: text } : { skip: "no text" };
  }
  let payload = row.payload;
  if (VISIT_KINDS.has(row.kind) && row.appointment_id) {
    // a visit cancelled since: no «new visit» about it
    const [a] = await q<{ status: string }>("select status from appointments where id = $1", [row.appointment_id]);
    if (!a || a.status === "cancelled") return { skip: "visit cancelled" };
  }
  if (row.kind === "day_plan" || row.kind === "own_plan") {
    // the plan as it is when it goes, not when it was queued
    const p = row.payload as { date?: string; tz?: string; staffId?: string | null };
    if (!p.date || !p.tz) return { skip: "no date" };
    const from = new Date(startOfDay(p.date, p.tz));
    const to = new Date(startOfDay(addDays(p.date, 1), p.tz));
    if (row.kind === "day_plan") {
      const [d] = await q<{ n: number; first: Date | null; total: number }>(
        `select count(*)::int as n, min(starts_at) as first, coalesce(sum(total_cents), 0)::int as total
           from appointments where staff_id = $1 and status in ('pending', 'booked') and starts_at >= $2 and starts_at < $3`,
        [p.staffId, from, to],
      );
      payload = { ...p, count: d.n, firstAt: d.first ? new Date(d.first).toISOString() : null, totalCents: d.total };
    } else {
      const per = await q<{ name: string; n: number }>(
        `select s.display_name as name, count(*)::int as n
           from appointments a join staff s on s.id = a.staff_id
          where a.business_id = $1 and a.status in ('pending', 'booked') and a.starts_at >= $2 and a.starts_at < $3
          group by s.display_name, s.sort order by s.sort, s.display_name`,
        [row.business_id, from, to],
      );
      payload = { ...p, count: per.reduce((n, s) => n + s.n, 0), perStaff: per };
    }
  }
  const text = pushText(row.kind, payload, row.locale);
  return text ? { push: text } : { skip: "no text" };
}

/**
 * Tomorrow's plan, once a day from 20:00 on the salon's clock: each login
 * with a column its own day, Renat and the front desk the salon's (Renat,
 * who cuts too, may get both). Only logins with a live phone that want it;
 * the unique index (008_push.sql) keeps each to one.
 */
export async function planEveningPush(q: Querier, now = Date.now()): Promise<number> {
  let added = 0;
  for (const b of await q<{ id: string; timezone: string }>("select id, timezone from businesses")) {
    const local = localParts(now, b.timezone);
    if (local.time < OUTBOX.planAt) continue;
    const date = addDays(local.date, 1);
    const rows = await q<{ id: string }>(
      `insert into notifications (business_id, channel, kind, recipient, user_id, locale, payload, send_at)
       select u.business_id, 'push', k.kind, u.id::text, u.id, u.locale,
              jsonb_build_object('date', $2::text, 'tz', $3::text, 'staffId', u.staff_id), $4
         from users u
         cross join lateral (values ('day_plan', u.staff_id is not null), ('own_plan', u.role <> 'staff')) k(kind, fits)
        where u.business_id = $1 and u.active and k.fits
          and coalesce((u.notify ->> k.kind)::boolean, case when k.kind = 'day_plan' then $5::boolean else $6::boolean end)
          and exists (select 1 from push_subscriptions p where p.user_id = u.id and p.retired_at is null)
       on conflict (user_id, kind, (payload->>'date')) where kind in ('day_plan', 'own_plan') do nothing
       returning id`,
      [b.id, date, b.timezone, new Date(now), DEFAULT_ON.day_plan, DEFAULT_ON.own_plan],
    );
    added += rows.length;
  }
  return added;
}

/** Send the push rows that are due now. */
export async function sendDuePush(q: Querier, now = Date.now(), env: Env = process.env, senders: Senders = { sms: sendSms, email: sendEmail }): Promise<OutboxResult> {
  const res = emptyResult();
  if (!pushConfigured(env)) return res;
  await deliver(q, await claimDue(q, ["push"], now), now, env, senders, res);
  return res;
}

/**
 * After a change in the admin or the barber app: send its push right after
 * the response instead of at the next cron run. Outside a request (tests,
 * scripts) it does nothing; the cron sends it.
 */
export function sendPushSoon(): void {
  if (!pushConfigured()) return;
  try {
    after(async () => {
      try {
        await sendDuePush(query);
      } catch (err) {
        console.error("[push] send after the change failed:", err instanceof Error ? err.message : err);
      }
    });
  } catch {
    /* not in a request: the cron sends it */
  }
}
