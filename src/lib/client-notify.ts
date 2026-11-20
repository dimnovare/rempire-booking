/**
 * What a client lets us send him (018_client_card.sql; the «Уведомления»
 * tab of his card in the admin).
 *
 *   - the channels he accepts: SMS, e-mail, push (clients.sms_opt_out,
 *     email_opt_out, push_opt_out);
 *   - one switch per kind of message we send a client by ourselves
 *     (clients.notify_off lists the kinds that are off).
 *
 * The kinds are the ones the outbox really sends to a client, and no
 * others:
 *
 *   confirmation  the letter after a booking (src/lib/booking.ts)
 *   reminder      before a visit: the SMS («reminder»), the notification
 *                 on his phone («client_reminder») and the letter
 *                 («reminder_email»), src/lib/outbox.ts
 *   moved         the letter when the salon moves his visit
 *   cancelled     the letter when the salon cancels it
 *   birthday      the greeting on his birthday («birthday»): letter and
 *                 notification, the SMS only when neither went
 *   no_show       «Приглашение недошедших» («no_show»): when his visit is
 *                 marked «Не пришёл», by every channel he accepts
 *
 * A message written by hand on his card («manual») has no switch: somebody
 * chose to send it. It still goes only by a channel he accepts.
 *
 * A mass message from the client base («mass») is advertising: it goes only
 * by a channel he accepts, and not at all to a client who ticked «Рекламные
 * сообщения: не отправлять» (clients.marketing_opt_out). Those two rules
 * are kept where it is queued, src/lib/admin/client-bulk.ts.
 *
 * Whoever queues a message for a client asks here first, so a kind that is
 * off is never queued for him. No Next.js and no other module of ours in
 * here: booking.ts and outbox.ts both read it.
 */
import type { Querier } from "./db";

export const CLIENT_KINDS = ["confirmation", "reminder", "moved", "cancelled", "birthday", "no_show"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];
export const isClientKind = (k: unknown): k is ClientKind => typeof k === "string" && (CLIENT_KINDS as readonly string[]).includes(k);

export type ClientChannel = "sms" | "email" | "push";
export const CLIENT_CHANNELS: readonly ClientChannel[] = ["sms", "email", "push"];

const OPT_OUT: Record<ClientChannel, string> = { sms: "sms_opt_out", email: "email_opt_out", push: "push_opt_out" };

/** The switch an outbox row's kind answers to; undefined for a kind with none (a hand-written message, a staff push). */
export const SWITCH_OF: Record<string, ClientKind | undefined> = {
  confirmation: "confirmation",
  reminder: "reminder",
  client_reminder: "reminder",
  reminder_email: "reminder",
  moved: "moved",
  cancelled: "cancelled",
  birthday: "birthday",
  no_show: "no_show",
};

/**
 * As SQL: does the client behind the alias `c` take this kind by this
 * channel? Only names from the two lists above ever get into the text.
 */
export function takesSql(c: string, channel: ClientChannel, kind: ClientKind | null): string {
  const off = OPT_OUT[channel];
  return `(not ${c}.${off}${kind ? ` and not ('${kind}' = any(${c}.notify_off))` : ""})`;
}

/** The reverse, for cancelling what is queued already. */
export function refusesSql(c: string, channel: ClientChannel, kind: ClientKind): string {
  return `(${c}.${OPT_OUT[channel]} or '${kind}' = any(${c}.notify_off))`;
}

/** Does this client take this kind by this channel? A client who is not there takes nothing. */
export async function clientTakes(q: Querier, clientId: string, channel: ClientChannel, kind: ClientKind): Promise<boolean> {
  const [r] = await q<{ ok: boolean }>(`select ${takesSql("c", channel, kind)} as ok from clients c where c.id = $1`, [clientId]);
  return r?.ok === true;
}

/** Does the client of this visit take this kind by this channel? A visit that is not there takes nothing. */
export async function visitClientTakes(q: Querier, appointmentId: string, channel: ClientChannel, kind: ClientKind): Promise<boolean> {
  const [r] = await q<{ ok: boolean }>(
    `select ${takesSql("c", channel, kind)} as ok from appointments a join clients c on c.id = a.client_id where a.id = $1`,
    [appointmentId],
  );
  return r?.ok === true;
}
