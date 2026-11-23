/**
 * «Сообщения»: every message the app sends, as a log (decision 29,
 * docs/kickoff.md; the messages report of the tool we follow,
 * docs/altegio-pages.md, «Сообщения»). A row is one row of the outbox
 * (notifications, 004 and the columns added later: user_id 008, client_id
 * 018, opened_at 025): when it was queued, to whom, what it said, its type,
 * its status with the time of it, its channel and the service that carried
 * it (Resend, Messaggio, Web Push).
 *
 * «Содержание» is built here from the row's kind and payload by the same
 * pure builders the outbox sends with (messageContent): an SMS's own text
 * (without its change link), a letter's subject, a notification's title and
 * words, the words written by hand. A login code's row shows nothing but its
 * kind: never the code, whatever its payload holds. The payload itself never
 * leaves the server.
 *
 * Rights (src/lib/auth/rights.ts): «Просматривать детализацию сообщений»
 * (reports.messages) opens it; the phones and e-mails are whole only with
 * «Показывать номера телефонов в сообщениях» (reports.messages.phones),
 * masked otherwise, and only then can they be searched by. A login that sees
 * some barbers' columns only (journal.staff) gets the messages about those
 * barbers' visits only; a message about no visit (a login code, a birthday,
 * an invoice, the evening plan) only a login that sees every barber.
 *
 * No Next.js here: the page, its action and the tests call the same code.
 */
import type { Business } from "../availability";
import type { Querier } from "../db";
import { can, maskEmail, maskPhone, seenStaff, type Holder } from "../auth/rights";
import { isLocale, type Locale } from "../i18n";
import { letterSubject } from "../letters";
import { clientReminderText, messageText } from "../outbox";
import { clientPushText, pushText } from "../push-kinds";
import { addDays, zonedToUtc } from "../tz";
import { seenClientsSql } from "./client-scope";
import type { MessageChannel, MessageFilter } from "./message-filter";

export type MessageRow = {
  id: string;
  /** when it was queued, ms */
  createdAt: number;
  channel: MessageChannel;
  kind: string;
  /** the outbox's status, or «opened»: a letter sent and then opened */
  status: string;
  /** the status's own time: sent, opened, or due (still to go); null for the others */
  statusAt: number | null;
  /** the phone or the address it went to, masked without the right; null for a notification, and for an anonymised client's */
  contact: string | null;
  /** who it went to: the client's name, or the login's for a notification to the salon's app; null for an anonymised client */
  name: string | null;
  /** the client's card, when the login sees him */
  clientId: string | null;
  /** to a login's phone (a barber's or the salon's app), not to a client */
  toStaff: boolean;
  /** what it said, in short; null: nothing to show but its kind */
  content: string | null;
  /** the visit it is about, and its barber */
  visitAt: number | null;
  staffName: string | null;
  /** resend, messaggio, webpush, console; null while it has not gone */
  provider: string | null;
  /** an SMS's parts */
  segments: number | null;
};

export type MessageList = { total: number; page: number; pages: number; rows: MessageRow[] };

export type MessagesMay = { open: boolean; phones: boolean };

export function messagesMay(who: Holder | null | undefined): MessagesMay {
  const open = can(who, "reports.messages");
  return { open, phones: open && can(who, "reports.messages.phones") };
}

const NONE: MessageList = { total: 0, page: 1, pages: 0, rows: [] };

/** The kinds whose row never shows what it said: a login code's letter carries the code. */
const SECRET = new Set(["login_code"]);
/** The kinds whose words are their own, kept in the payload. */
const WRITTEN = new Set(["manual", "mass"]);
const CONTENT_MAX = 200;

const short = (s: string | null | undefined): string | null => {
  const t = String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  return t.length > CONTENT_MAX ? `${t.slice(0, CONTENT_MAX - 1).trimEnd()}…` : t;
};
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export type ContentInput = {
  kind: string;
  channel: MessageChannel;
  locale: string;
  payload: Record<string, unknown> | null;
  /** the visit the row names, as it is now */
  visit: { startsAt: string; staff: string | null } | null;
  business: Pick<Business, "name" | "timezone">;
  /** an invoice letter's invoice */
  invoice?: { number: string | null; credit: boolean } | null;
};

/**
 * What a message said, in short, in its own language (an SMS is in
 * English for everyone, decision 30): built from its kind and payload by
 * the builders the outbox sends with. Null: nothing to show but its kind,
 * which a login code always is.
 */
export function messageContent(m: ContentInput): string | null {
  if (SECRET.has(m.kind)) return null;
  const L: Locale = isLocale(m.locale) ? m.locale : "ru";
  const p = m.payload && typeof m.payload === "object" ? m.payload : {};
  if (WRITTEN.has(m.kind)) return short(text(p.text));
  const startsAt = text(p.startsAt) ?? m.visit?.startsAt ?? null;
  const tz = text(p.tz) ?? m.business.timezone;
  const business = text(p.business) ?? m.business.name;
  if (m.channel === "sms") {
    // the reminder's change link is minted at send time: none here
    return short(messageText({ kind: m.kind, locale: L, payload: { ...p, startsAt: startsAt ?? undefined, tz, business, staff: text(p.staff) ?? m.visit?.staff ?? undefined } }, ""));
  }
  if (m.channel === "email") return short(letterSubject(m.kind, L, { startsAt, tz, number: m.invoice?.number ?? null, credit: m.invoice?.credit }));
  if (m.kind === "client_reminder") {
    const t = clientReminderText({ locale: L, payload: { ...p, startsAt: startsAt ?? undefined, tz, business, staff: text(p.staff) ?? m.visit?.staff ?? undefined }, appointment_id: null }, "");
    return short(t?.body);
  }
  if (m.kind === "birthday" || m.kind === "no_show" || m.kind === "review_request") return short(clientPushText(m.kind, { business, startsAt: startsAt ?? undefined, tz, date: text(p.date) ?? undefined }, L)?.body);
  if (m.kind === "day_plan" || m.kind === "own_plan") {
    // the plan's numbers are counted when it goes and not kept: its title and its day
    const date = text(p.date);
    const t = date ? pushText(m.kind, { ...p, count: 0 }, L) : null;
    return t && date ? `${t.title}: ${date.slice(8, 10)}.${date.slice(5, 7)}` : null;
  }
  const t = pushText(m.kind, p, L);
  return t ? short(`${t.title}: ${t.body}`) : null;
}

/**
 * A WHERE part over `notifications n` left-joined to its visit `a`: empty
 * for a login that sees every barber, else only the messages about the
 * visits of the barbers it sees (one about no visit belongs to no barber,
 * so a limited login does not get it).
 */
function seenMessagesSql(who: Holder | null | undefined, p: (value: unknown) => string): string {
  const seen = who ? seenStaff(who) : "all";
  if (seen === "all") return "";
  if (!seen.length) return " and false";
  return ` and a.staff_id = any(${p([...seen])}::uuid[])`;
}

const likeText = (s: string) => s.replace(/[%_\\]/g, (m) => "\\" + m);
const ms = (v: Date | string | null) => (v == null ? null : new Date(v).getTime());

// the recipient: the client a row names, or the one of its visit; a notification to a login is that login's
const FROM = `notifications n
       left join appointments a on a.id = n.appointment_id
       left join staff s on s.id = a.staff_id
       left join clients c on n.user_id is null and c.id = coalesce(n.client_id, a.client_id)
       left join users u on u.id = n.user_id`;

/** One page of the log for this filter, newest first. `who` null: no cut (the tests). */
export async function listMessageLog(q: Querier, business: Pick<Business, "id" | "name" | "timezone">, f: MessageFilter, who: Holder | null = null): Promise<MessageList> {
  if (who && !can(who, "reports.messages")) return NONE;
  const phones = !who || can(who, "reports.messages.phones");
  const params: unknown[] = [business.id];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  let where = "n.business_id = $1";
  if (f.from) where += ` and n.created_at >= ${p(new Date(zonedToUtc(f.from, "00:00", business.timezone)).toISOString())}::timestamptz`;
  if (f.to) where += ` and n.created_at < ${p(new Date(zonedToUtc(addDays(f.to, 1), "00:00", business.timezone)).toISOString())}::timestamptz`;
  if (f.kind) where += ` and n.kind = ${p(f.kind)}`;
  if (f.channel) where += ` and n.channel = ${p(f.channel)}`;
  if (f.status === "opened") where += " and n.status = 'sent' and n.opened_at is not null";
  else if (f.status) where += ` and n.status = ${p(f.status)}`;
  if (f.q) {
    const at = `'%' || ${p(likeText(f.q))} || '%'`;
    let any = `c.name ilike ${at} or u.name ilike ${at}`;
    // a login that sees the contacts masked finds nobody by them
    if (phones) {
      any += ` or (n.channel = 'email' and n.recipient ilike ${at})`;
      const digits = f.q.replace(/\D/g, "").replace(/^00/, "");
      // mostly digits is a phone
      if (digits.length >= 3 && digits.length >= f.q.replace(/[\s+()-]/g, "").length - 1) {
        const d = `'%' || ${p(digits)} || '%'`;
        any += ` or (n.channel = 'sms' and replace(n.recipient, '+', '') like ${d}) or replace(coalesce(c.phone_e164, ''), '+', '') like ${d}`;
      }
    }
    where += ` and (${any})`;
  }
  where += seenMessagesSql(who, p);

  const [head] = await q<{ n: number }>(`select count(*)::int as n from ${FROM} where ${where}`, params);
  const total = Number(head?.n ?? 0);
  if (!total) return { ...NONE, page: f.page };
  const pages = Math.ceil(total / f.size);
  const page = Math.min(f.page, pages);
  const rows = await q<{
    id: string;
    created_at: Date | string;
    channel: MessageChannel;
    kind: string;
    status: string;
    send_at: Date | string;
    sent_at: Date | string | null;
    opened_at: Date | string | null;
    recipient: string;
    locale: string;
    payload: Record<string, unknown> | null;
    provider: string | null;
    segments: number | null;
    user_id: string | null;
    visit_at: Date | string | null;
    staff_name: string | null;
    client_id: string | null;
    client_name: string | null;
    client_seen: boolean;
    user_name: string | null;
    user_email: string | null;
    invoice_number: string | null;
    invoice_kind: string | null;
  }>(
    `select n.id, n.created_at, n.channel, n.kind, n.status, n.send_at, n.sent_at, n.opened_at, n.recipient, n.locale,
            n.payload, n.provider, n.segments, n.user_id,
            a.starts_at as visit_at, s.display_name as staff_name,
            c.id as client_id, case when c.anonymised_at is null then c.name end as client_name, (c.id is not null${seenClientsSql(who, p)}) as client_seen,
            u.name as user_name, u.email as user_email,
            i.number as invoice_number, i.kind as invoice_kind
       from ${FROM}
       left join invoices i on n.kind = 'invoice' and i.business_id = n.business_id and i.id::text = n.payload->>'invoiceId'
      where ${where}
      order by n.created_at desc, n.id
      limit ${p(f.size)} offset ${p((page - 1) * f.size)}`,
    params,
  );
  return {
    total,
    page,
    pages,
    rows: rows.map((r) => {
      const opened = r.status === "sent" && r.opened_at != null;
      const status = opened ? "opened" : r.status;
      const statusAt = opened ? ms(r.opened_at) : r.status === "sent" ? ms(r.sent_at) : r.status === "queued" || r.status === "sending" ? ms(r.send_at) : null;
      // '' is no contact: the client was anonymised (src/lib/admin/clients.ts, anonymiseClient)
      const contact = !r.recipient ? null : r.channel === "sms" ? (phones ? r.recipient : maskPhone(r.recipient)) : r.channel === "email" ? (phones ? r.recipient : maskEmail(r.recipient)) : null;
      const toStaff = r.user_id != null;
      const visitAt = ms(r.visit_at);
      return {
        id: r.id,
        createdAt: ms(r.created_at)!,
        channel: r.channel,
        kind: r.kind,
        status,
        statusAt,
        contact,
        name: toStaff ? r.user_name || (r.user_email ?? "").split("@")[0] || null : r.client_name,
        clientId: r.client_seen ? r.client_id : null,
        toStaff,
        content: messageContent({
          kind: r.kind,
          channel: r.channel,
          locale: r.locale,
          payload: r.payload,
          visit: r.visit_at ? { startsAt: new Date(r.visit_at).toISOString(), staff: r.staff_name } : null,
          business,
          invoice: r.kind === "invoice" ? { number: r.invoice_number, credit: r.invoice_kind === "credit" } : null,
        }),
        visitAt,
        staffName: r.staff_name,
        provider: r.provider,
        segments: r.segments == null ? null : Number(r.segments),
      };
    }),
  };
}
