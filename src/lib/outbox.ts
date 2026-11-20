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
 *
 * A client's own switches (his card's «Уведомления» in the admin;
 * src/lib/client-notify.ts): a channel he does not accept and a kind he has
 * switched off are never queued for him, and a reminder that was queued
 * before he switched it off is cancelled at the next run.
 *
 * A message written by hand on a client's card is a row of kind «manual»
 * with its text in the payload and the client in client_id
 * (src/lib/admin/client-card.ts queues it). By SMS or e-mail it goes like
 * any other row; as a notification it goes to the phones turned on for the
 * visit named in the row, the client's next one.
 *
 * A mass message from the client base is a row of kind «mass» per client
 * and channel (src/lib/admin/client-bulk.ts queues them): the same words in
 * the payload, the client in client_id, and it goes exactly as a «manual»
 * row does.
 *
 * The client messages Altegio sends and we added (Dim, 20.11.2026: «All
 * three now, as Altegio does»; docs/altegio-pages.md, «Уведомления, per
 * type»; 022_client_messages.sql). Each has the business's on / off switch
 * (src/lib/settings.ts) and the client's own kind (src/lib/client-notify.ts):
 *   - «reminder_email»: the reminder by e-mail, settings.reminder_email_min
 *     (12 h) before, planned and re-planned from the visits as the SMS is,
 *     to the address this visit's confirmation went to and in its
 *     language, only once that letter went. A visit booked after its time
 *     gets none: its confirmation has just told it.
 *   - «birthday»: at 10:00 on the salon's clock on the client's birthday
 *     (29 February in another year: the 28th), once per client and day. The
 *     letter and the notification go at once; the SMS is planned
 *     OUTBOX.fallbackMin later and goes only if neither of them was sent by
 *     then (Altegio's «если не удалось доставить в предыдущий канал»).
 *   - «no_show»: «Приглашение недошедших», queued by the status change
 *     itself (planNoShow, from src/lib/admin/visits.ts adminSetStatus), by
 *     every channel, OUTBOX.noShowDelayMin later so a mis-tap put right
 *     sends nothing. Once per visit and channel; the status back from «Не
 *     пришёл» before it went drops it.
 * SMS are in English for everyone and one part (decision 30, docs/kickoff.md);
 * the reminder too. Letters and notifications are in the visit's or the
 * client's language.
 *
 * «Настройки → Уведомления» (src/lib/admin/notifications.ts; Dim, round
 * 11): the salon's switch per type and per channel, the leads, hours and
 * delays, and its own SMS texts. Nothing stored there is everything as
 * above. Every message is asked about twice:
 *   - when it is planned: a type or channel that is off plans nothing, and
 *     the planners above cancel the reminders it had queued;
 *   - when it goes (compose): one queued before it was switched off is
 *     skipped («switched off»), whoever queued it.
 * A changed SMS lead is written into the visits still to come
 * (appointments.reminder_min), the e-mail lead is the business's: either
 * moves every reminder not sent yet at the next run (the planners compare
 * each queued row's planned time, payload.dueAt, with the one in force).
 * A changed hour (birthday, the evening plan) or delay (the
 * invitation) applies to what is planned from then on; rows already queued
 * keep their time. A changed SMS text applies to every SMS not sent yet:
 * the words are built at send time.
 */
import { after } from "next/server";
import { atOf, NOTIFY_DEFAULTS, noShowDelay, readNotify, sends, sendsKind, smsTemplate, type NotifySettings } from "./admin/notifications";
import { smsWords, tokensIn, type SmsType, type SmsValues } from "./admin/notification-text";
import { getBusinessById, type Business } from "./availability";
import { birthdayMatch } from "./birthday";
import { clientTakes, refusesSql, takesSql } from "./client-notify";
import { sendPushToClient } from "./client-push";
import { query, type Querier } from "./db";
import { emailTransport, sendEmail, type LetterBody } from "./email";
import { birthdayLetter, confirmationLetter, noShowLetter, visitLetter } from "./letters";
import { pushConfigured, sendPushToUser, type PushSendResult } from "./push";
import { DEFAULT_ON, clientPushText, pushText, type PushText } from "./push-kinds";
import { siteUrl } from "./site";
import { sendSms, smsTransport } from "./sms";
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
  /** the salon's local time from which tomorrow's plan goes out, unless «Уведомления» says another */
  planAt: NOTIFY_DEFAULTS.at.day_plan,
  /** the salon's local time of the birthday greeting (Altegio's type 3), unless «Уведомления» says another */
  birthdayAt: NOTIFY_DEFAULTS.at.birthday,
  /** the birthday SMS waits this long for the letter or the notification (their retries take ~30 min) */
  fallbackMin: NOTIFY_DEFAULTS.birthdaySmsAfterMin,
  /** «Не пришёл» → the invitation, this much later: a mis-tap put right sends nothing («Уведомления» may say another) */
  noShowDelayMin: NOTIFY_DEFAULTS.noShowDelayMin,
  /** a visit marked «Не пришёл» this long after its start is not invited any more */
  noShowWithinDays: 7,
};

export type OutboxRow = {
  id: string;
  business_id: string;
  appointment_id: string | null;
  /** the client a row names itself (018): a hand-written or mass message, a birthday, a no-show */
  client_id?: string | null;
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

/**
 * The SMS reminder's time: the visit's start less its own lead
 * (appointments.reminder_min, the business's when it was booked). A new
 * lead on «Уведомления» is written into the visits still to come
 * (src/lib/admin/notification-store.ts), so their queued reminders move at
 * the next run. A visit booked without the reminder has no reminder_min.
 */
const REMINDER_AT = "a.starts_at - make_interval(mins => a.reminder_min)";
// the time a reminder was planned for; send_at moves on retries, this does not
const PLANNED_AT = "(n.payload->>'dueAt')::timestamptz";

// the business's switch as SQL: anything but «sms» or «push» is the default, «both» (src/lib/settings.ts)
const REMINDER_MODE = "(case when b.settings->>'client_reminder' in ('sms', 'push') then b.settings->>'client_reminder' else 'both' end)";
// the notification goes with the SMS; a visit booked without the SMS reminder is still reminded by a
// notification, the business's usual time before ($2)
const PUSH_REMINDER_AT = "a.starts_at - make_interval(mins => coalesce(a.reminder_min, $2::int))";

/** The businesses and what «Уведомления» has in force for each. */
async function businessesWithNotify(q: Querier): Promise<{ id: string; name: string; timezone: string; ns: NotifySettings }[]> {
  const rows = await q<{ id: string; name: string; timezone: string; settings: unknown }>("select id, name, timezone, settings from businesses");
  return rows.map((b) => ({ id: b.id, name: b.name, timezone: b.timezone, ns: readNotify(b.settings) }));
}

/** The same for the clients' notifications: a row per visit that a live phone was turned on for. */
async function planClientPush(q: Querier, b: { id: string; ns: NotifySettings }, now: number): Promise<{ added: number; cancelled: number }> {
  const on = sends(b.ns, "reminder", "push");
  const cancelled = await q<{ id: string }>(
    `update notifications n set status = 'cancelled', locked_until = null
       from appointments a, clients c
      where n.appointment_id = a.id and c.id = a.client_id and a.business_id = $1 and n.kind = 'client_reminder' and n.status = 'queued'
        and (not $3::boolean or a.status not in ('booked', 'pending') or ${PLANNED_AT} is distinct from ${PUSH_REMINDER_AT}
             or ${refusesSql("c", "push", "reminder")})
      returning n.id`,
    [b.id, b.ns.base.reminder_min, on],
  );
  if (!on) return { added: 0, cancelled: cancelled.length };
  const added = await q<{ id: string }>(
    `insert into notifications (business_id, appointment_id, channel, kind, recipient, locale, payload, send_at)
     select a.business_id, a.id, 'push', 'client_reminder', a.id::text, a.locale,
            jsonb_build_object('startsAt', a.starts_at, 'dueAt', ${PUSH_REMINDER_AT}, 'staff', s.display_name,
                               'business', b.name, 'address', l.address, 'tz', l.timezone),
            ${PUSH_REMINDER_AT} - interval '1 minute'
       from appointments a
       join clients c on c.id = a.client_id
       join staff s on s.id = a.staff_id
       join businesses b on b.id = a.business_id
       join locations l on l.id = a.location_id
      where a.business_id = $1 and a.status in ('booked', 'pending')
        and ${takesSql("c", "push", "reminder")}
        and exists (select 1 from client_push_subscriptions p where p.appointment_id = a.id and p.retired_at is null)
        and a.starts_at > $3
        and ${PUSH_REMINDER_AT} < $4
        and not exists (select 1 from notifications n
                         where n.appointment_id = a.id and n.kind = 'client_reminder'
                           and n.status <> 'cancelled' and ${PLANNED_AT} = ${PUSH_REMINDER_AT})
     returning id`,
    [b.id, b.ns.base.reminder_min, new Date(now + OUTBOX.reminderMinLeadMin * 60_000), new Date(now + OUTBOX.planAheadHours * 3_600_000)],
  );
  return { added: added.length, cancelled: cancelled.length };
}

/** Bring the queued reminders in line with the visits and with «Уведомления». */
export async function planReminders(q: Querier, now = Date.now()): Promise<{ added: number; cancelled: number }> {
  let added = 0;
  let cancelled = 0;
  for (const b of await businessesWithNotify(q)) {
    const on = sends(b.ns, "reminder", "sms");
    const gone = await q<{ id: string }>(
      `update notifications n set status = 'cancelled', locked_until = null
         from appointments a, clients c
        where n.appointment_id = a.id and c.id = a.client_id and a.business_id = $1 and n.kind = 'reminder' and n.status = 'queued'
          and (not $2::boolean or a.status not in ('booked', 'pending') or a.reminder_min is null or ${PLANNED_AT} is distinct from ${REMINDER_AT}
               or ${refusesSql("c", "sms", "reminder")})
        returning n.id`,
      [b.id, on],
    );
    cancelled += gone.length;
    if (on) {
      const rows = await q<{ id: string }>(
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
          where a.business_id = $1 and a.status in ('booked', 'pending') and a.reminder_min is not null
            and c.phone_e164 is not null and ${takesSql("c", "sms", "reminder")}
            and a.starts_at > $2
            and ${REMINDER_AT} < $3
            and not exists (select 1 from notifications n
                             where n.appointment_id = a.id and n.kind = 'reminder'
                               and n.status <> 'cancelled' and ${PLANNED_AT} = ${REMINDER_AT})
         returning id`,
        [b.id, new Date(now + OUTBOX.reminderMinLeadMin * 60_000), new Date(now + OUTBOX.planAheadHours * 3_600_000)],
      );
      added += rows.length;
    }
    const push = await planClientPush(q, b, now);
    added += push.added;
    cancelled += push.cancelled;
  }
  return { added, cancelled };
}

// the e-mail reminder's time: the business's lead ($3, minutes) before the visit
const EMAIL_REMINDER_AT = "(a.starts_at - make_interval(mins => $3::int))";

/**
 * The reminder by e-mail (Altegio's type 1: 12 hours before), per business:
 * planned, moved and dropped with the visits exactly as the SMS is. It goes
 * to the address the visit's confirmation went to, in that letter's
 * language, and only after that letter went: no address learns of a visit
 * it was not told about (as src/lib/booking.ts queueChangeLetter).
 */
export async function planEmailReminders(q: Querier, now = Date.now()): Promise<{ added: number; cancelled: number }> {
  let added = 0;
  let cancelled = 0;
  for (const b of await businessesWithNotify(q)) {
    // the type and its e-mail channel (email_reminder_on), and the lead (reminder_email_min)
    const s = { email_reminder_on: sends(b.ns, "reminder", "email"), reminder_email_min: b.ns.base.reminder_email_min };
    const gone = await q<{ id: string }>(
      `update notifications n set status = 'cancelled', locked_until = null
         from appointments a, clients c
        where n.appointment_id = a.id and c.id = a.client_id and a.business_id = $1
          and n.kind = 'reminder_email' and n.status = 'queued'
          and (not $2::boolean or a.status not in ('booked', 'pending') or ${PLANNED_AT} is distinct from ${EMAIL_REMINDER_AT}
               or ${refusesSql("c", "email", "reminder")})
        returning n.id`,
      [b.id, s.email_reminder_on, s.reminder_email_min],
    );
    cancelled += gone.length;
    if (!s.email_reminder_on) continue;
    const rows = await q<{ id: string }>(
      `insert into notifications (business_id, appointment_id, client_id, channel, kind, recipient, locale, payload, send_at)
       select a.business_id, a.id, a.client_id, 'email', 'reminder_email', conf.recipient, conf.locale,
              jsonb_build_object('dueAt', ${EMAIL_REMINDER_AT}), ${EMAIL_REMINDER_AT}
         from appointments a
         join clients c on c.id = a.client_id
         cross join lateral (select n.recipient, n.locale, n.created_at from notifications n
                              where n.appointment_id = a.id and n.kind = 'confirmation' and n.channel = 'email' and n.status = 'sent'
                              order by n.created_at limit 1) conf
        where a.business_id = $1 and $2::boolean and a.status in ('booked', 'pending')
          and ${takesSql("c", "email", "reminder")}
          and a.starts_at > $4
          and ${EMAIL_REMINDER_AT} < $5
          -- booked after its time: the confirmation (queued with the booking) has just told
          and conf.created_at < ${EMAIL_REMINDER_AT}
          and not exists (select 1 from notifications n
                           where n.appointment_id = a.id and n.kind = 'reminder_email'
                             and n.status <> 'cancelled' and ${PLANNED_AT} = ${EMAIL_REMINDER_AT})
       returning id`,
      [b.id, s.email_reminder_on, s.reminder_email_min, new Date(now + OUTBOX.reminderMinLeadMin * 60_000), new Date(now + OUTBOX.planAheadHours * 3_600_000)],
    );
    added += rows.length;
  }
  return { added, cancelled };
}

/**
 * The birthday greeting (Altegio's type 3), from 10:00 on each salon's
 * clock: one row per client, channel and day (the unique index of 022 makes
 * a second run add nothing).
 *   e-mail  to the address on his card, as a hand-written message goes;
 *   push    if a live phone was turned on for one of his visits;
 *   SMS     planned fallbackMin later, and sent only if neither of the two
 *           above went by then; at once when neither could be planned.
 * Every channel and the kind «birthday» as the client accepts them, and as
 * «Уведомления» has them on; the hour is the one set there (10:00 unless).
 */
export async function planBirthdays(q: Querier, now = Date.now()): Promise<number> {
  let added = 0;
  for (const b of await businessesWithNotify(q)) {
    const on = { email: sends(b.ns, "birthday", "email"), push: sends(b.ns, "birthday", "push"), sms: sends(b.ns, "birthday", "sms") };
    if (!on.email && !on.push && !on.sms) continue;
    const local = localParts(now, b.timezone);
    if (local.time < atOf(b.ns, "birthday")) continue;
    const m = birthdayMatch(local.date);
    const rows = await q<{ id: string }>(
      `insert into notifications (business_id, client_id, channel, kind, recipient, locale, payload, send_at)
       select c.business_id, c.id, ch.channel, 'birthday', ch.recipient, c.locale,
              jsonb_build_object('date', $2::text, 'tz', $6::text, 'business', $7::text),
              case when ch.channel = 'sms' and (f.email or f.push) then $9::timestamptz else $8::timestamptz end
         from clients c
         cross join lateral (select $10::boolean and c.email is not null and ${takesSql("c", "email", "birthday")} as email,
                                    $11::boolean and ${takesSql("c", "push", "birthday")}
                                      and exists (select 1 from appointments a join client_push_subscriptions p on p.appointment_id = a.id
                                                   where a.client_id = c.id and a.status <> 'cancelled' and p.retired_at is null) as push,
                                    $12::boolean and c.phone_e164 is not null and ${takesSql("c", "sms", "birthday")} as sms) f
         cross join lateral (values ('email', c.email, f.email), ('push', c.id::text, f.push), ('sms', c.phone_e164, f.sms)) ch(channel, recipient, fits)
        where c.business_id = $1 and c.merged_into is null and ch.fits
          and ((c.birth_month = $3 and c.birth_day = $4) or ($5::boolean and c.birth_month = 2 and c.birth_day = 29))
       on conflict (client_id, channel, (payload->>'date')) where kind = 'birthday' do nothing
       returning id`,
      [b.id, local.date, m.month, m.day, m.feb29, b.timezone, b.name, new Date(now), new Date(now + OUTBOX.fallbackMin * 60_000), on.email, on.push, on.sms],
    );
    added += rows.length;
  }
  return added;
}

/**
 * «Приглашение недошедших» (Altegio's type 72). Call it in the status
 * change's own transaction, with the new status: «no_show» queues the
 * invitation by every channel the client accepts, noShowDelayMin later;
 * any other status takes back one still queued. Idempotent per visit and
 * channel (the unique index of 022): marking it again adds nothing, and one
 * that went is never sent twice.
 *   e-mail  to the address this visit's confirmation went to, in its language;
 *   push    to the phones turned on for this visit;
 *   SMS     to his phone, in English.
 * Only a visit that has started, at most noShowWithinDays ago: a visit to
 * come marked by mistake, or an old one tidied up, invites nobody. The
 * channels and the delay are the ones «Уведомления» has in force.
 */
export async function planNoShow(q: Querier, business: Pick<Business, "id" | "settings">, appointmentId: string, status: string, now = Date.now()): Promise<number> {
  if (status !== "no_show") {
    await q("update notifications set status = 'cancelled', locked_until = null where appointment_id = $1 and kind = 'no_show' and status = 'queued'", [appointmentId]);
    return 0;
  }
  // the settings as stored now: `business` may have been read before a change on the page
  const [b] = await q<{ settings: unknown }>("select settings from businesses where id = $1", [business.id]);
  const ns = readNotify(b?.settings);
  const on = { email: sends(ns, "no_show", "email"), push: sends(ns, "no_show", "push"), sms: sends(ns, "no_show", "sms") };
  if (!on.email && !on.push && !on.sms) return 0;
  const rows = await q<{ id: string }>(
    `insert into notifications (business_id, appointment_id, client_id, channel, kind, recipient, locale, payload, send_at)
     select a.business_id, a.id, c.id, ch.channel, 'no_show', ch.recipient, ch.locale, '{}'::jsonb, $3::timestamptz
       from appointments a
       join clients c on c.id = a.client_id
       left join lateral (select n.recipient, n.locale from notifications n
                           where n.appointment_id = a.id and n.kind = 'confirmation' and n.channel = 'email' and n.status = 'sent'
                           order by n.created_at limit 1) conf on true
       cross join lateral (values
         ('email', conf.recipient, coalesce(conf.locale, a.locale), $6::boolean and conf.recipient is not null and ${takesSql("c", "email", "no_show")}),
         ('push', a.id::text, a.locale, $7::boolean and ${takesSql("c", "push", "no_show")}
                                         and exists (select 1 from client_push_subscriptions p where p.appointment_id = a.id and p.retired_at is null)),
         ('sms', c.phone_e164, a.locale, $8::boolean and c.phone_e164 is not null and ${takesSql("c", "sms", "no_show")})
       ) ch(channel, recipient, locale, fits)
      where a.id = $1 and a.business_id = $2 and a.status = 'no_show' and ch.fits
        and a.starts_at <= $4 and a.starts_at > $5
     on conflict (appointment_id, channel) where kind = 'no_show' and status <> 'cancelled' do nothing
     returning id`,
    [appointmentId, business.id, new Date(now + noShowDelay(ns) * 60_000), new Date(now), new Date(now - OUTBOX.noShowWithinDays * 86_400_000), on.email, on.push, on.sms],
  );
  return rows.length;
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
      returning id, business_id, appointment_id, client_id, channel, kind, recipient, locale, payload, send_at, attempts`,
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

/** What an SMS of ours may name (src/lib/admin/notification-text.ts), from its payload and the extras looked up for a salon's own text. */
function smsValues(p: { startsAt?: string; staff?: string; business?: string; address?: string; tz?: string; client?: string; service?: string }, link: string): SmsValues {
  const v: SmsValues = { salon: p.business || "REMPIRE", master: p.staff || "", address: p.address || "", client: p.client || "", service: p.service || "", link };
  if (p.startsAt && !Number.isNaN(Date.parse(p.startsAt))) {
    const when = localParts(Date.parse(p.startsAt), p.tz || "Europe/Tallinn");
    const [, m, d] = when.date.split("-").map(Number);
    v.date = `${pad(d)}.${pad(m)}`;
    v.time = when.time;
  }
  return v;
}

const OUR_SMS = new Set<string>(["reminder", "birthday", "no_show"]);

/**
 * The text of an SMS, built at send time from its payload. The ones we
 * write ourselves are in English for everyone and one part (decision 30,
 * docs/kickoff.md: «as today»); each drops what it can spare, the address
 * first, until it fits. `link` is the reminder's change link (Dim,
 * 17.11.2026: a short one), or the booking page for the other two. A
 * message written by hand is its own words, in whatever parts they take.
 *
 * `template`: the salon's own text from «Уведомления», sent as written with
 * its variables filled in. Left out, a row that went with one keeps it in
 * its payload (`template`), so the report «Сообщения» shows those words.
 */
export function messageText(row: Pick<OutboxRow, "kind" | "locale" | "payload">, link = "", template?: string | null): string | null {
  const p = row.payload as { startsAt?: string; staff?: string; business?: string; address?: string; tz?: string; text?: string; template?: unknown };
  if (OUR_SMS.has(row.kind)) {
    const own = template !== undefined ? template : typeof p.template === "string" && p.template ? p.template : null;
    const words = smsWords(row.kind as SmsType, smsValues(p, link), own);
    if (words) return words;
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

/**
 * A push to a client's phones names the visit they were turned on for; by
 * default the row's own. An SMS in the salon's own words keeps them in its
 * payload once it went (`keep`), for the report «Сообщения».
 */
type Composed = { skip: string } | { subject: string; body: string | LetterBody; keep?: Record<string, unknown> } | { push: PushText; visitId?: string };

/** «Уведомления» per business, read once per run. */
type Ctx = { ns: (businessId: string) => Promise<NotifySettings> };

function notifyCache(q: Querier): Ctx {
  const seen = new Map<string, Promise<NotifySettings>>();
  return {
    ns: (id) => {
      let p = seen.get(id);
      if (!p) {
        p = q<{ settings: unknown }>("select settings from businesses where id = $1", [id]).then(([b]) => readNotify(b?.settings));
        seen.set(id, p);
      }
      return p;
    },
  };
}

// a client «name» with three digits in a row is a phone typed as the name (src/lib/push-kinds.ts)
const nameOnly = (s: unknown) => {
  const n = String(s ?? "").trim().replace(/\s+/g, " ");
  return /\d{3}/.test(n) ? "" : n.slice(0, 40);
};

/**
 * What a salon's own SMS text names beyond the payload: the client's name
 * and the visit's services (in English, as the SMS is). Looked up only
 * when the text names them.
 */
async function smsExtras(q: Querier, template: string, o: { appointmentId?: string | null; clientId?: string | null }): Promise<{ client?: string; service?: string }> {
  const t = tokensIn(template);
  const out: { client?: string; service?: string } = {};
  if (!t.includes("client") && !t.includes("service")) return out;
  if (o.appointmentId) {
    const [r] = await q<{ client: string | null; service: string | null }>(
      `select c.name as client,
              (select string_agg(coalesce(nullif(x.name->>'en', ''), nullif(x.name->>'ru', ''), x.name->>'et'), ' + ' order by x.position)
                 from appointment_services x where x.appointment_id = a.id) as service
         from appointments a join clients c on c.id = a.client_id where a.id = $1`,
      [o.appointmentId],
    );
    if (t.includes("client")) out.client = nameOnly(r?.client);
    if (t.includes("service")) out.service = r?.service ?? "";
  } else if (o.clientId && t.includes("client")) {
    const [r] = await q<{ name: string | null }>("select name from clients where id = $1", [o.clientId]);
    out.client = nameOnly(r?.name);
  }
  return out;
}

/** An SMS of ours in the salon's own words, or the standard ones; `keep` is what the report needs to show them. */
async function ourSms(q: Querier, ns: NotifySettings, row: OutboxRow, payload: Record<string, unknown>, link: string): Promise<Composed> {
  const type = row.kind as SmsType;
  const template = smsTemplate(ns, type);
  if (!template) {
    const text = messageText({ ...row, payload }, link, null);
    return text ? { subject: "REMPIRE", body: text } : { skip: "no text" };
  }
  const extras = await smsExtras(q, template, { appointmentId: row.appointment_id, clientId: row.client_id });
  const text = messageText({ ...row, payload: { ...payload, ...extras } }, link, template);
  return text ? { subject: "REMPIRE", body: text, keep: { template, ...extras } } : { skip: "no text" };
}

const LIVE = new Set(["booked", "pending"]);

/** Push kinds that go to the phones of a client's visit, not to a staff login. */
const TO_CLIENT_PHONE = new Set(["client_reminder", "manual", "mass", "birthday", "no_show"]);

/**
 * The birthday greeting and the no-show invitation, built now from the
 * client and the visit as they are; or why one is not sent: the business or
 * the client switched it off since, the day is over, the visit is no longer
 * «Не пришёл», or (the birthday SMS) the letter or the notification went.
 * (Switched off on «Уведомления» is asked before, in compose.)
 */
async function composeClientMessage(q: Querier, row: OutboxRow, now: number, env: Env, ns: NotifySettings): Promise<Composed> {
  const kind = row.kind as "birthday" | "no_show";
  if (row.channel === "push" && now - new Date(row.send_at).getTime() > OUTBOX.pushStaleMin * 60_000) return { skip: "stale" };
  const business = await getBusinessById(q, row.business_id);
  if (!business) return { skip: "business gone" };
  if (!row.client_id || !(await clientTakes(q, row.client_id, row.channel, kind))) return { skip: "the client takes none" };
  const origin = siteUrl(env).origin;
  const book = `${origin}/${row.locale}`;
  if (kind === "birthday") {
    const p = row.payload as { date?: string; tz?: string; business?: string };
    if (!p.date || localParts(now, p.tz || business.timezone).date !== p.date) return { skip: "not the day any more" };
    if (row.channel === "email") {
      const [loc] = await q<{ address: string }>("select address from locations where business_id = $1 and active order by sort, name limit 1", [business.id]);
      const letter = birthdayLetter({ locale: row.locale, origin, business, address: loc?.address });
      return { subject: letter.subject, body: letter };
    }
    if (row.channel === "push") {
      // the phones of his latest visit that one was turned on for
      const [v] = await q<{ id: string }>(
        `select a.id from appointments a
          where a.client_id = $1 and a.status <> 'cancelled'
            and exists (select 1 from client_push_subscriptions p where p.appointment_id = a.id and p.retired_at is null)
          order by a.starts_at desc limit 1`,
        [row.client_id],
      );
      if (!v) return { skip: "no phone" };
      const text = clientPushText("birthday", { ...p, business: business.name }, row.locale);
      return text ? { push: text, visitId: v.id } : { skip: "no text" };
    }
    const [went] = await q<{ channel: string }>(
      "select channel from notifications where client_id = $1 and kind = 'birthday' and payload->>'date' = $2 and channel <> 'sms' and status = 'sent' limit 1",
      [row.client_id, p.date],
    );
    if (went) return { skip: `sent by ${went.channel}` };
    return ourSms(q, ns, row, { business: business.name }, book);
  }
  const v = row.appointment_id ? await visitById(q, row.appointment_id) : null;
  if (!v) return { skip: "visit gone" };
  if (v.status !== "no_show") return { skip: `visit ${v.status}` };
  if (row.channel === "email") {
    const letter = noShowLetter(v, { business, origin, locale: row.locale });
    return { subject: letter.subject, body: letter };
  }
  const seen = { business: business.name, startsAt: v.startsAt, tz: business.timezone, visitId: v.id };
  if (row.channel === "push") {
    const text = clientPushText("no_show", seen, row.locale);
    return text ? { push: text } : { skip: "no text" };
  }
  return ourSms(q, ns, row, { ...seen, staff: v.staffName, client: nameOnly(v.clientName) }, book);
}

/** What a claimed row sends, built now; or why it is not sent at all. */
async function compose(q: Querier, row: OutboxRow, now: number, env: Env, ctx: Ctx): Promise<Composed> {
  // «Уведомления»: a type or a channel switched off since this row was queued
  const ns = await ctx.ns(row.business_id);
  if (!sendsKind(ns, row.kind, row.channel)) return { skip: "switched off" };
  if (row.kind === "birthday" || row.kind === "no_show") return composeClientMessage(q, row, now, env, ns);
  if (row.channel === "push") return composePush(q, row, now);
  const p = row.payload as { startsAt?: string; subject?: string };
  if (row.kind === "reminder_email" && row.channel === "email") {
    // planned by planEmailReminders; built from the visit as it is now, with a change link of its own
    const v = row.appointment_id ? await visitById(q, row.appointment_id) : null;
    if (!v) return { skip: "visit gone" };
    if (!LIVE.has(v.status)) return { skip: `visit ${v.status}` };
    if (Date.parse(v.startsAt) <= now) return { skip: "visit already started" };
    const business = await getBusinessById(q, row.business_id);
    if (!business) return { skip: "business gone" };
    const token = await mintVisitLink(q, v.id, "email");
    const letter = visitLetter("reminder", v, { business, origin: siteUrl(env).origin, token, locale: row.locale, now });
    return { subject: letter.subject, body: letter };
  }
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
    return ourSms(q, ns, row, row.payload, link);
  }
  const text = messageText(row, link);
  if (!text) return { skip: "no text" };
  return { subject: String(p.subject || "REMPIRE"), body: text };
}

const emptyResult = (): OutboxResult => ({ planned: 0, cancelled: 0, sent: 0, retry: 0, failed: 0, skipped: 0, waiting: 0 });

/** One cron run: plan reminders, then send what is due on the channels that are set up. */
export async function runOutbox(q: Querier, now = Date.now(), env: Env = process.env, senders: Senders = { sms: sendSms, email: sendEmail }): Promise<OutboxResult> {
  const plan = await planReminders(q, now);
  const mail = await planEmailReminders(q, now);
  const res: OutboxResult = { ...emptyResult(), planned: plan.added + mail.added + (await planBirthdays(q, now)), cancelled: plan.cancelled + mail.cancelled };
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
  const ctx = notifyCache(q);
  for (const row of rows) {
    try {
      const msg = await compose(q, row, now, env, ctx);
      if ("skip" in msg) {
        await q(`update notifications set status = 'skipped', locked_until = null, last_error = $2 where id = $1`, [row.id, msg.skip]);
        res.skipped++;
        continue;
      }
      if (row.channel === "sms" && "body" in msg) {
        const r = await senders.sms(row.recipient, typeof msg.body === "string" ? msg.body : msg.body.text, env, { externalId: row.id });
        await q(
          `update notifications set status = 'sent', sent_at = $2, provider = $3, provider_ref = $4, segments = $5, locked_until = null, last_error = null,
                  payload = payload || $6::jsonb where id = $1`,
          [row.id, new Date(now), r.provider, r.ref, r.segments, JSON.stringify(msg.keep ?? {})],
        );
      } else if (row.channel === "push" && "push" in msg) {
        // a login's phones, or the phones turned on for this one visit
        const r = TO_CLIENT_PHONE.has(row.kind)
          ? await (senders.pushClient ?? sendPushToClient)(q, msg.visitId ?? row.appointment_id ?? "", msg.push, env)
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
      // a provider's «never» (src/lib/sms.ts SmsRejected): the same message would be refused again
      const permanent = typeof e === "object" && e !== null && (e as { permanent?: unknown }).permanent === true;
      if (permanent || row.attempts >= OUTBOX.maxAttempts) {
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
  if (row.kind === "manual" || row.kind === "mass") {
    // written by hand on the client's card, or to many clients at once: its own words, to the phones of the visit it names
    if (!row.appointment_id) return { skip: "no visit" };
    const p = row.payload as { text?: unknown; subject?: unknown };
    const body = typeof p.text === "string" ? p.text.trim() : "";
    if (!body) return { skip: "no text" };
    return { push: { title: String(p.subject || "REMPIRE"), body, url: `/v/${await mintVisitLink(q, row.appointment_id, "push", 12)}`, tag: `msg-${row.id}` } };
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
 * the unique index (008_push.sql) keeps each to one. Each of the two goes
 * from its own hour on «Уведомления» (20:00 unless), and not at all while
 * the salon has it off there.
 */
export async function planEveningPush(q: Querier, now = Date.now()): Promise<number> {
  let added = 0;
  for (const b of await businessesWithNotify(q)) {
    const local = localParts(now, b.timezone);
    const kinds = (["day_plan", "own_plan"] as const).filter((k) => sends(b.ns, k, "push") && local.time >= atOf(b.ns, k));
    if (!kinds.length) continue;
    const date = addDays(local.date, 1);
    const rows = await q<{ id: string }>(
      `insert into notifications (business_id, channel, kind, recipient, user_id, locale, payload, send_at)
       select u.business_id, 'push', k.kind, u.id::text, u.id, u.locale,
              jsonb_build_object('date', $2::text, 'tz', $3::text, 'staffId', u.staff_id), $4
         from users u
         cross join lateral (values ('day_plan', u.staff_id is not null), ('own_plan', u.role <> 'staff')) k(kind, fits)
        where u.business_id = $1 and u.active and k.fits and k.kind = any($7::text[])
          and coalesce((u.notify ->> k.kind)::boolean, case when k.kind = 'day_plan' then $5::boolean else $6::boolean end)
          and exists (select 1 from push_subscriptions p where p.user_id = u.id and p.retired_at is null)
       on conflict (user_id, kind, (payload->>'date')) where kind in ('day_plan', 'own_plan') do nothing
       returning id`,
      [b.id, date, b.timezone, new Date(now), DEFAULT_ON.day_plan, DEFAULT_ON.own_plan, kinds],
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
