/**
 * «Сообщения»: what the log of the messages the app sends is asked with
 * (decision 29, docs/kickoff.md; the messages report of the tool we follow,
 * docs/altegio-pages.md, «Сообщения»):
 *
 *   from, to  the day it was queued, between two days of the salon; a new
 *             page starts with the last month (`defaultMessages`);
 *   kind      one type of message (MESSAGE_KINDS), or every type;
 *   status    one status as the report shows it: the outbox's own, and
 *             «opened» for a letter the reader opened (025);
 *   channel   SMS, e-mail or a notification (push);
 *   q         the recipient: a part of the client's or the login's name,
 *             or a phone's digits or a part of an e-mail address (these
 *             two only for a login that sees them whole: message-log.ts).
 *
 * The page sends every field as it was typed or picked (`MessageQuery`);
 * `cleanMessages` reads it, and what is not one of the choices is the same
 * as nothing chosen. No database and no Next.js in here: the page in the
 * browser reads the same sizes and choices.
 */
import { OWNER_KINDS, STAFF_KINDS } from "../push-kinds";
import { isLocalDate } from "../tz";
import { addMonths } from "./record-filter";

export const MESSAGE_PAGE_SIZES = [25, 50, 100] as const;
export const MESSAGE_PAGE_SIZE = 25;
/** The longest search the field takes. */
export const MESSAGE_Q_MAX = 60;

export const MESSAGE_CHANNELS = ["sms", "email", "push"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

/** The outbox's statuses (004), and «opened»: a letter that was sent and then opened. */
export const MESSAGE_STATUSES = ["queued", "sending", "sent", "opened", "failed", "cancelled", "skipped"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/**
 * Every kind of message the app queues, in the type filter's groups:
 * to the client about his visit, written by hand or to many, to the
 * barbers' and the salon's own phones, and the salon's other letters.
 */
export const MESSAGE_KIND_GROUPS = [
  { key: "client", kinds: ["confirmation", "reminder", "reminder_email", "client_reminder", "moved", "cancelled", "no_show", "review_request", "birthday"] },
  { key: "written", kinds: ["manual", "mass"] },
  { key: "staff", kinds: [...STAFF_KINDS, ...OWNER_KINDS] },
  { key: "other", kinds: ["invoice", "login_code"] },
] as const satisfies readonly { key: string; kinds: readonly string[] }[];
export const MESSAGE_KINDS: readonly string[] = MESSAGE_KIND_GROUPS.flatMap((g) => [...g.kinds]);

export type MessageQuery = {
  from?: string;
  to?: string;
  /** one of MESSAGE_KINDS, or «» for every type */
  kind?: string;
  status?: string;
  channel?: string;
  q?: string;
  page?: number;
  size?: number;
};

export type MessageFilter = {
  from: string | null;
  to: string | null;
  kind: string | null;
  status: MessageStatus | null;
  channel: MessageChannel | null;
  q: string;
  page: number;
  size: number;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const day = (v: unknown) => (isLocalDate(str(v)) ? str(v) : null);
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null => ((list as readonly string[]).includes(str(v)) ? (str(v) as T) : null);

/** What the page opens with: the last month, every type, status and channel. `today` is the salon's day. */
export function defaultMessages(today: string): Required<MessageQuery> {
  return { from: addMonths(today, -1), to: today, kind: "", status: "", channel: "", q: "", page: 1, size: MESSAGE_PAGE_SIZE };
}

/** A question as it was sent, every part copied by name and checked. */
export function cleanMessages(raw: unknown): MessageFilter {
  const f = (raw && typeof raw === "object" ? raw : {}) as MessageQuery;
  let from = day(f.from);
  let to = day(f.to);
  if (from && to && from > to) [from, to] = [to, from];
  const size = Number(f.size);
  const page = Number(f.page);
  return {
    from,
    to,
    kind: oneOf(MESSAGE_KINDS, f.kind),
    status: oneOf(MESSAGE_STATUSES, f.status),
    channel: oneOf(MESSAGE_CHANNELS, f.channel),
    q: str(f.q).replace(/\s+/g, " ").slice(0, MESSAGE_Q_MAX),
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
    size: (MESSAGE_PAGE_SIZES as readonly number[]).includes(size) ? size : MESSAGE_PAGE_SIZE,
  };
}

/** The question, copied by name: what the page's action hands on. */
export function messageQuestion(q: MessageQuery | null | undefined): MessageQuery {
  return {
    from: String(q?.from ?? ""),
    to: String(q?.to ?? ""),
    kind: String(q?.kind ?? ""),
    status: String(q?.status ?? ""),
    channel: String(q?.channel ?? ""),
    q: String(q?.q ?? ""),
    page: Number(q?.page),
    size: Number(q?.size),
  };
}
