/**
 * The client's card beyond his fields (018_client_card.sql; the owner,
 * 19.11.2026: every tab of the tool we follow but loyalty and accounts).
 * His fields, his visits, deleting and anonymising him are in clients.ts.
 *
 *   comments    the dated history beside the one shared note: who wrote,
 *               when, the text. Anyone in the admin adds one; Renat and the
 *               front desk delete anyone's (finer rights come later).
 *   photo       kept like a barber's (007), in the database, shrunk by the
 *               browser first. Never public: served only to a login.
 *   files       his papers, in the database: 5 MB each, 20 a client, nine
 *               kinds. The kind is told three ways and all must agree: the
 *               name's ending, the type the browser declared, and, where a
 *               kind has a signature, its first bytes.
 *   messages    what we sent him, from the outbox (notifications), a mass
 *               message among them (kind «mass», client-bulk.ts), and a
 *               message written by hand: one row of kind «manual» per
 *               channel, sent by the cron like every other row
 *               (src/lib/outbox.ts). SMS has no provider yet, so an SMS
 *               stays «queued»; on staging a letter goes through the mail
 *               guard (src/lib/test-run.ts) like every letter.
 *   statistics  what he spent in a period: per month, per service, per
 *               barber. The same visits as «Продано»: begun, neither
 *               cancelled nor a no-show.
 *
 * Every function is scoped to the business it is handed; a client of
 * another business is «not found».
 *
 * Rights (src/lib/auth/rights.ts): reading the comments and the files asks
 * them here when it is handed a login, and so does deleting a comment
 * (one's own, or someone else's); the rest of the card's rights are asked
 * by the actions and routes that call these functions (clients/actions.ts).
 */
import { can, type Holder } from "../auth/rights";
import type { Business } from "../availability";
import type { L10n } from "../catalog";
import type { ClientChannel } from "../client-notify";
import { clientPushOffered } from "../client-push";
import { withTx, type Querier } from "../db";
import { isLocale } from "../i18n";
import { addDays, isLocalDate, localParts, startOfDay, todayIn } from "../tz";
import { imageMime, PHOTO_MAX_BYTES } from "./staff";
import { isUuid } from "./visits";

type Env = Record<string, string | undefined>;
const ms = (d: Date | string) => new Date(d).getTime();
const AUDIT = `insert into audit (actor, entity, entity_id, action, after) values ($1, 'client', $2, $3, $4::jsonb)`;

/**
 * This business's client, not merged away; locked for the rest of the
 * transaction when `lock`. An anonymised one (clients.ts, anonymiseClient)
 * only when `anonymisedToo`, for what reads his card: nothing is added to
 * his card again.
 */
async function hasClient(q: Querier, businessId: string, clientId: string, lock = false, anonymisedToo = false): Promise<boolean> {
  if (!isUuid(clientId)) return false;
  const [c] = await q<{ id: string }>(
    `select id from clients where id = $1 and business_id = $2 and merged_into is null${anonymisedToo ? "" : " and anonymised_at is null"}${lock ? " for update" : ""}`,
    [clientId, businessId],
  );
  return !!c;
}

/* ---------- comments ---------- */

export const COMMENT_MAX = 2000;
/** The comments a card shows, newest first. */
export const COMMENTS_MAX = 200;

/** `mine`, when the list is read for a login: it wrote this one (deleting one's own comment is a right of its own). */
export type ClientComment = { id: string; at: number; author: string; text: string; mine?: boolean };

/** With a login (`who`): only with «Просматривать комментарии», and each comment says whether that login wrote it. */
export async function listComments(q: Querier, businessId: string, clientId: string, who?: Holder): Promise<ClientComment[]> {
  if (!isUuid(clientId)) return [];
  if (who && !can(who, "clients.comments")) return [];
  const readerId = who?.id;
  const rows = await q<{ id: string; created_at: Date; author_id: string | null; author_name: string; body: string }>(
    `select id, created_at, author_id, author_name, body from client_comments
      where business_id = $1 and client_id = $2 order by created_at desc, id limit ${COMMENTS_MAX}`,
    [businessId, clientId],
  );
  return rows.map((r) => ({ id: r.id, at: ms(r.created_at), author: r.author_name, text: r.body, ...(readerId ? { mine: r.author_id === readerId } : {}) }));
}

/** `author`: the login that writes it; its name is copied, so the comment still says who after the login is gone. */
export async function addComment(
  business: Business,
  clientId: string,
  text: unknown,
  author: { id: string; name: string },
  now = Date.now(),
): Promise<{ ok: true; id: string } | { ok: false; field: "id" | "text" }> {
  const body = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (!body || body.length > COMMENT_MAX) return { ok: false, field: "text" };
  return withTx(async (tx) => {
    if (!(await hasClient(tx, business.id, clientId))) return { ok: false as const, field: "id" as const };
    const [row] = await tx<{ id: string }>(
      `insert into client_comments (business_id, client_id, author_id, author_name, body, created_at) values ($1, $2, $3, $4, $5, $6) returning id`,
      [business.id, clientId, isUuid(author.id) ? author.id : null, String(author.name ?? "").trim().slice(0, 120), body, new Date(now)],
    );
    await tx(AUDIT, [author.id, clientId, "comment_add", JSON.stringify({ by: "admin", comment: row.id })]);
    return { ok: true as const, id: row.id };
  });
}

/**
 * Delete a comment: one's own with «Удалять свои комментарии», someone
 * else's with «Удалять чужие комментарии». (Before the rights Renat and the
 * front desk deleted anyone's and a barber's login none; their rights
 * started from that.)
 */
export async function deleteComment(business: Business, clientId: string, commentId: string, by: Holder & { id: string }): Promise<boolean> {
  if (!isUuid(clientId) || !isUuid(commentId)) return false;
  return withTx(async (tx) => {
    const [row] = await tx<{ author_id: string | null }>("select author_id from client_comments where id = $1 and client_id = $2 and business_id = $3 for update", [commentId, clientId, business.id]);
    if (!row) return false;
    if (!can(by, row.author_id !== null && row.author_id === by.id ? "clients.comments_delete_own" : "clients.comments_delete_others")) return false;
    const gone = await tx<{ id: string }>("delete from client_comments where id = $1 and client_id = $2 and business_id = $3 returning id", [commentId, clientId, business.id]);
    if (!gone.length) return false;
    await tx(AUDIT, [by.id, clientId, "comment_delete", JSON.stringify({ by: "admin", comment: commentId })]);
    return true;
  });
}

/* ---------- the photo ---------- */

/**
 * Keep the client's photo. The browser has shrunk it already; here only its
 * kind (by the first bytes) and its size are checked. Returns its version,
 * for the link.
 */
export async function saveClientPhoto(business: Business, clientId: string, bytes: Uint8Array, actor: string): Promise<{ ok: true; v: string } | { ok: false; field: "id" | "photo" }> {
  const mime = imageMime(bytes);
  if (!mime || bytes.length > PHOTO_MAX_BYTES) return { ok: false, field: "photo" };
  return withTx(async (tx) => {
    if (!(await hasClient(tx, business.id, clientId, true))) return { ok: false as const, field: "id" as const };
    const [row] = await tx<{ v: string }>(
      `insert into client_photo (client_id, mime, bytes) values ($1, $2, $3)
       on conflict (client_id) do update set mime = excluded.mime, bytes = excluded.bytes, updated_at = now()
       returning floor(extract(epoch from updated_at))::bigint::text as v`,
      [clientId, mime, Buffer.from(bytes)],
    );
    await tx(AUDIT, [actor, clientId, "photo", JSON.stringify({ by: "admin", mime, bytes: bytes.length })]);
    return { ok: true as const, v: row.v };
  });
}

export async function removeClientPhoto(business: Business, clientId: string, actor: string): Promise<boolean> {
  return withTx(async (tx) => {
    if (!(await hasClient(tx, business.id, clientId))) return false;
    const gone = await tx<{ client_id: string }>("delete from client_photo where client_id = $1 returning client_id", [clientId]);
    if (!gone.length) return false;
    await tx(AUDIT, [actor, clientId, "photo_remove", JSON.stringify({ by: "admin" })]);
    return true;
  });
}

/** The photo, for /admin/clients/<id>/photo: only this business's client. */
export async function clientPhoto(q: Querier, businessId: string, clientId: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
  if (!isUuid(clientId)) return null;
  const [row] = await q<{ mime: string; bytes: Uint8Array }>(
    "select p.mime, p.bytes from client_photo p join clients c on c.id = p.client_id where p.client_id = $1 and c.business_id = $2",
    [clientId, businessId],
  );
  return row ? { mime: row.mime, bytes: new Uint8Array(row.bytes) } : null;
}

/* ---------- files ---------- */

/** One file: at most this many bytes (5 MB). */
export const FILE_MAX_BYTES = 5 * 1024 * 1024;
/** Files on one client. */
export const FILES_MAX = 20;
/** A file's name: at most this many characters. */
export const FILE_NAME_MAX = 120;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** The name's ending → the one content type it may come with. */
export const FILE_TYPES: Readonly<Record<string, string>> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: DOCX,
  xls: "application/vnd.ms-excel",
  xlsx: XLSX,
  txt: "text/plain",
};
/** For the note on the card and the file picker. */
export const FILE_EXTS: readonly string[] = Object.keys(FILE_TYPES);

const BAD_IN_NAME = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;
const starts = (b: Uint8Array, sig: number[], at = 0) => b.length >= at + sig.length && sig.every((x, i) => b[at + i] === x);

/** The name a file came with, without a folder and without what a file system or a header cannot take. */
export function cleanFileName(raw: unknown): string {
  const base = String(raw ?? "").split(/[\\/]/).pop() ?? "";
  let s = base.normalize("NFC").replace(BAD_IN_NAME, "_").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  if (s.length > FILE_NAME_MAX) {
    // cut in the middle, so the ending that says its kind is kept
    const dot = s.lastIndexOf(".");
    const ext = dot > 0 && s.length - dot <= 6 ? s.slice(dot) : "";
    s = s.slice(0, FILE_NAME_MAX - ext.length).trim() + ext;
  }
  return s;
}

/**
 * Do the first bytes fit the kind? Only for the kinds that have one sure
 * signature: the three pictures, PDF, and the two zipped Office kinds. An
 * old .doc or .xls and a .txt have none worth trusting, so they pass.
 */
function looksLike(mime: string, b: Uint8Array): boolean {
  if (mime === "image/jpeg") return starts(b, [0xff, 0xd8, 0xff]);
  if (mime === "image/png") return starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === "image/gif") return starts(b, [0x47, 0x49, 0x46, 0x38]);
  if (mime === DOCX || mime === XLSX) return starts(b, [0x50, 0x4b, 0x03, 0x04]);
  if (mime === "application/pdf") {
    // «%PDF-», which readers accept a little way into the file
    for (let i = 0; i < Math.min(b.length, 1024); i++) if (starts(b, [0x25, 0x50, 0x44, 0x46, 0x2d], i)) return true;
    return false;
  }
  return true;
}

export type FileProblem = "empty" | "size" | "type";

/**
 * May this file be kept? Its name must end in one of the nine kinds, the
 * type the browser declared must be that kind's own, and the first bytes
 * must not say otherwise. Returns the cleaned name and the type to store:
 * ours, by the name's ending, never the upload's own word for it.
 */
export function checkFile(rawName: unknown, declaredType: unknown, bytes: Uint8Array): { ok: true; name: string; mime: string } | { ok: false; code: FileProblem } {
  if (!bytes.length) return { ok: false, code: "empty" };
  if (bytes.length > FILE_MAX_BYTES) return { ok: false, code: "size" };
  const name = cleanFileName(rawName);
  const dot = name.lastIndexOf(".");
  const mime = dot > 0 ? FILE_TYPES[name.slice(dot + 1).toLowerCase()] : undefined;
  if (!mime) return { ok: false, code: "type" };
  const declared = String(declaredType ?? "").split(";")[0].trim().toLowerCase();
  if (declared !== mime || !looksLike(mime, bytes)) return { ok: false, code: "type" };
  return { ok: true, name, mime };
}

export type ClientFile = { id: string; name: string; mime: string; size: number; at: number; by: string };

/** With a login (`who`): only with «Просматривать и скачивать файлы». */
export async function listFiles(q: Querier, businessId: string, clientId: string, who?: Holder): Promise<ClientFile[]> {
  if (!isUuid(clientId)) return [];
  if (who && !can(who, "clients.files")) return [];
  const rows = await q<{ id: string; name: string; mime: string; size: number; created_at: Date; uploaded_name: string }>(
    "select id, name, mime, size, created_at, uploaded_name from client_files where business_id = $1 and client_id = $2 order by created_at desc, id",
    [businessId, clientId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, mime: r.mime, size: r.size, at: ms(r.created_at), by: r.uploaded_name }));
}

/** `full`: he has `FILES_MAX` files already. */
export type FileAdded = { ok: true; id: string } | { ok: false; code: FileProblem | "full" | "not_found" };

/** Keep one file on a client. The client's row is locked, so two uploads at once still count to `FILES_MAX`. */
export async function addFile(
  business: Business,
  clientId: string,
  file: { name: unknown; type: unknown; bytes: Uint8Array },
  by: { id: string; name: string },
  now = Date.now(),
): Promise<FileAdded> {
  const c = checkFile(file.name, file.type, file.bytes);
  if (!c.ok) return c;
  return withTx<FileAdded>(async (tx) => {
    if (!(await hasClient(tx, business.id, clientId, true))) return { ok: false, code: "not_found" };
    const [have] = await tx<{ n: number }>("select count(*)::int as n from client_files where client_id = $1", [clientId]);
    if (have.n >= FILES_MAX) return { ok: false, code: "full" };
    const [row] = await tx<{ id: string }>(
      `insert into client_files (business_id, client_id, name, mime, size, bytes, uploaded_by, uploaded_name, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [business.id, clientId, c.name, c.mime, file.bytes.length, Buffer.from(file.bytes), isUuid(by.id) ? by.id : null, String(by.name ?? "").trim().slice(0, 120), new Date(now)],
    );
    await tx(AUDIT, [by.id, clientId, "file_add", JSON.stringify({ by: "admin", file: row.id, mime: c.mime, bytes: file.bytes.length })]);
    return { ok: true, id: row.id };
  });
}

/** One file with its bytes, for the download route: only this business's, only this client's. */
export async function clientFile(q: Querier, businessId: string, clientId: string, fileId: string): Promise<{ name: string; mime: string; bytes: Uint8Array } | null> {
  if (!isUuid(clientId) || !isUuid(fileId)) return null;
  const [row] = await q<{ name: string; mime: string; bytes: Uint8Array }>("select name, mime, bytes from client_files where id = $1 and client_id = $2 and business_id = $3", [fileId, clientId, businessId]);
  return row ? { name: row.name, mime: row.mime, bytes: new Uint8Array(row.bytes) } : null;
}

export async function deleteFile(business: Business, clientId: string, fileId: string, actor: string): Promise<boolean> {
  if (!isUuid(clientId) || !isUuid(fileId)) return false;
  return withTx(async (tx) => {
    const gone = await tx<{ id: string }>("delete from client_files where id = $1 and client_id = $2 and business_id = $3 returning id", [fileId, clientId, business.id]);
    if (!gone.length) return false;
    await tx(AUDIT, [actor, clientId, "file_delete", JSON.stringify({ by: "admin", file: fileId })]);
    return true;
  });
}

/* ---------- messages ---------- */

/** A message written by hand: at most this many characters. */
export const MESSAGE_MAX = 1000;
/** The messages a card lists, newest first. */
export const MESSAGES_MAX = 200;
/** The kinds of outbox row that are a message to a client (src/lib/client-notify.ts, and «manual»). */
/** The kinds whose words are their own, kept in the payload: written by hand on the card, or to many clients at once (client-bulk.ts). */
const WRITTEN = ["manual", "mass"];
const TO_CLIENT = ["confirmation", "reminder", "client_reminder", "reminder_email", "moved", "cancelled", "birthday", "no_show", "review_request", ...WRITTEN];

export type ClientMessage = {
  id: string;
  /** an outbox kind: confirmation, reminder, client_reminder, moved, cancelled, manual, mass */
  kind: string;
  channel: ClientChannel;
  /** queued, sending, sent, failed, cancelled, skipped */
  status: string;
  /** when it went; for one that has not gone, when it is due */
  at: number;
  /** the words, for a message written by hand or sent to many; null for the ones built at send time */
  text: string | null;
  /** the visit it is about, when it is about one */
  visitAt: number | null;
};

/**
 * Every message to this client in the outbox: the ones about his visits and
 * the ones written by hand. In the order of the time each shows: one still
 * to go (a reminder two days ahead) on top, then the latest that went.
 */
export async function listMessages(q: Querier, businessId: string, clientId: string): Promise<ClientMessage[]> {
  if (!isUuid(clientId)) return [];
  const rows = await q<{ id: string; kind: string; channel: ClientChannel; status: string; send_at: Date; sent_at: Date | null; text: string | null; visit_at: Date | null }>(
    `select n.id, n.kind, n.channel, n.status, n.send_at, n.sent_at,
            case when n.kind = any($4::text[]) then n.payload->>'text' end as text,
            case when not (n.kind = any($4::text[])) then a.starts_at end as visit_at
       from notifications n left join appointments a on a.id = n.appointment_id
      where n.business_id = $1 and n.user_id is null and n.kind = any($3::text[])
        and (n.client_id = $2 or (n.client_id is null and a.client_id = $2))
      order by coalesce(n.sent_at, n.send_at) desc, n.created_at desc, n.id
      limit ${MESSAGES_MAX}`,
    [businessId, clientId, TO_CLIENT, WRITTEN],
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind, channel: r.channel, status: r.status, at: ms(r.sent_at ?? r.send_at), text: r.text, visitAt: r.visit_at ? ms(r.visit_at) : null }));
}

/**
 * Can a message go to him by this channel now?
 *   ok    yes;
 *   none  he has no phone, no e-mail, or no notification turned on;
 *   off   he does not accept this channel (his card's «Уведомления»).
 */
export type Reach = "ok" | "none" | "off";
export type ClientReach = Record<ClientChannel, Reach>;

type Reachable = { phone_e164: string | null; email: string | null; sms_opt_out: boolean; email_opt_out: boolean; push_opt_out: boolean; locale: string };

/**
 * The visit whose phones a notification to this client would reach: his
 * next one that some phone was turned on for. A phone is tied to a visit,
 * never to a client (013), so «he has notifications on» means exactly this.
 */
async function pushVisit(q: Querier, business: Business, clientId: string, now: number, env: Env): Promise<string | null> {
  if (!clientPushOffered(business.settings, env)) return null;
  const [a] = await q<{ id: string }>(
    `select a.id from appointments a
      where a.business_id = $1 and a.client_id = $2 and a.status in ('booked', 'pending') and a.starts_at > $3
        and exists (select 1 from client_push_subscriptions p where p.appointment_id = a.id and p.retired_at is null)
      order by a.starts_at limit 1`,
    [business.id, clientId, new Date(now)],
  );
  return a?.id ?? null;
}

const reachOf = (c: Reachable, visit: string | null): ClientReach => ({
  sms: !c.phone_e164 ? "none" : c.sms_opt_out ? "off" : "ok",
  email: !c.email ? "none" : c.email_opt_out ? "off" : "ok",
  push: !visit ? "none" : c.push_opt_out ? "off" : "ok",
});

const REACHABLE = "select phone_e164, email, sms_opt_out, email_opt_out, push_opt_out, locale from clients where id = $1 and business_id = $2 and merged_into is null";

/** By which channels a message can go to this client now; null: no such client. */
export async function clientReach(q: Querier, business: Business, clientId: string, now = Date.now(), env: Env = process.env): Promise<ClientReach | null> {
  if (!isUuid(clientId)) return null;
  const [c] = await q<Reachable>(REACHABLE, [clientId, business.id]);
  return c ? reachOf(c, await pushVisit(q, business, clientId, now, env)) : null;
}

export type MessageInput = { text: unknown; channels: unknown };
/** `refused`: `channel` cannot reach him (no address, or he does not accept it); nothing was queued. */
export type MessageQueued = { ok: true; ids: string[] } | { ok: false; code: "not_found" | "text" | "channels" } | { ok: false; code: "refused"; channel: ClientChannel };

/**
 * Queue a message written by hand, one outbox row per channel, kind
 * «manual». It goes by the channels he accepts and has an address for;
 * one that cannot reach him refuses the whole message, so nobody thinks
 * a half of it went. The audit row names the channels, never the words.
 */
export async function queueClientMessage(business: Business, clientId: string, input: MessageInput, actor: string, now = Date.now(), env: Env = process.env): Promise<MessageQueued> {
  if (!isUuid(clientId)) return { ok: false, code: "not_found" };
  const text = String(input?.text ?? "").replace(/\r\n/g, "\n").trim();
  if (!text || text.length > MESSAGE_MAX) return { ok: false, code: "text" };
  const asked = Array.isArray(input?.channels) ? input.channels : [];
  const channels = (["sms", "email", "push"] as const).filter((c) => asked.includes(c));
  if (!channels.length || channels.length !== new Set(asked).size) return { ok: false, code: "channels" };
  return withTx<MessageQueued>(async (tx) => {
    const [c] = await tx<Reachable>(`${REACHABLE} for update`, [clientId, business.id]);
    if (!c) return { ok: false, code: "not_found" };
    const visit = channels.includes("push") ? await pushVisit(tx, business, clientId, now, env) : null;
    const reach = reachOf(c, visit);
    const blocked = channels.find((ch) => reach[ch] !== "ok");
    if (blocked) return { ok: false, code: "refused", channel: blocked };
    const ids: string[] = [];
    for (const ch of channels) {
      const recipient = ch === "sms" ? c.phone_e164 : ch === "email" ? c.email : visit;
      const [row] = await tx<{ id: string }>(
        `insert into notifications (business_id, appointment_id, client_id, channel, kind, recipient, locale, payload, send_at, created_at)
         values ($1, $2, $3, $4, 'manual', $5, $6, $7::jsonb, $8, $8) returning id`,
        [business.id, ch === "push" ? visit : null, clientId, ch, recipient, isLocale(c.locale) ? c.locale : "ru", JSON.stringify({ text, subject: business.name }), new Date(now)],
      );
      ids.push(row.id);
    }
    await tx(AUDIT, [actor, clientId, "message", JSON.stringify({ by: "admin", channels })]);
    return { ok: true, ids };
  });
}

/* ---------- statistics ---------- */

/** A period longer than this many months starts later, so the chart stays readable. */
export const STATS_MONTHS_MAX = 60;

export type StatsPeriod = { from: string; to: string };
export type ClientStats = StatsPeriod & {
  /** the visits in the period that count: begun, neither cancelled nor a no-show */
  visits: number;
  totalCents: number;
  /** every month of the period, the empty ones too */
  months: { month: string; cents: number; visits: number }[];
  /** by what the services cost on their own: a special-time extra is in the months and the barbers, not here */
  services: { id: string; name: L10n; count: number; cents: number }[];
  staff: { id: string; name: string; count: number; cents: number }[];
};

/** The period a card opens with: this month and the eleven before it. */
export function defaultStatsPeriod(tz: string, now = Date.now()): StatsPeriod {
  const to = todayIn(tz, now);
  return { from: monthShift(`${to.slice(0, 7)}-01`, -11), to };
}

/** The first of the month `n` months from the month of `date`. */
function monthShift(date: string, n: number): string {
  const [y, m] = date.split("-").map(Number);
  const at = y * 12 + (m - 1) + n;
  return `${String(Math.floor(at / 12)).padStart(4, "0")}-${String((at % 12) + 1).padStart(2, "0")}-01`;
}

/** Two dates as a period: the default where one is missing, the right way round, no longer than `STATS_MONTHS_MAX` months. */
export function cleanStatsPeriod(from: unknown, to: unknown, tz: string, now = Date.now()): StatsPeriod {
  const d = defaultStatsPeriod(tz, now);
  let a = isLocalDate(from) ? from : d.from;
  let b = isLocalDate(to) ? to : d.to;
  if (a > b) [a, b] = [b, a];
  const earliest = monthShift(`${b.slice(0, 7)}-01`, -(STATS_MONTHS_MAX - 1));
  return { from: a < earliest ? earliest : a, to: b };
}

/** What this client spent in the period, or null: no such client. */
export async function clientStats(q: Querier, business: Business, clientId: string, period: StatsPeriod, now = Date.now()): Promise<ClientStats | null> {
  // an anonymised client's visits stay, and so do his numbers
  if (!(await hasClient(q, business.id, clientId, false, true))) return null;
  const tz = business.timezone;
  const { from, to } = cleanStatsPeriod(period?.from, period?.to, tz, now);
  const rows = await q<{ starts_at: Date; staff_id: string; staff_name: string; total_cents: number; lines: { id: string; name: L10n; cents: number }[] | null }>(
    `select a.starts_at, a.staff_id, s.display_name as staff_name, a.total_cents,
            (select json_agg(json_build_object('id', l.service_id, 'name', l.name, 'cents', l.price_cents) order by l.position)
               from appointment_services l where l.appointment_id = a.id) as lines
       from appointments a join staff s on s.id = a.staff_id
      where a.business_id = $1 and a.client_id = $2 and a.status not in ('cancelled', 'no_show')
        and a.starts_at >= $3 and a.starts_at < $4 and a.starts_at <= $5
      order by a.starts_at`,
    [business.id, clientId, new Date(startOfDay(from, tz)), new Date(startOfDay(addDays(to, 1), tz)), new Date(now)],
  );
  const months = new Map<string, { month: string; cents: number; visits: number }>();
  for (let m = `${from.slice(0, 7)}-01`; m <= to; m = monthShift(m, 1)) months.set(m.slice(0, 7), { month: m.slice(0, 7), cents: 0, visits: 0 });
  const services = new Map<string, { id: string; name: L10n; count: number; cents: number }>();
  const staff = new Map<string, { id: string; name: string; count: number; cents: number }>();
  let totalCents = 0;
  for (const r of rows) {
    totalCents += r.total_cents;
    const month = months.get(localParts(ms(r.starts_at), tz).date.slice(0, 7));
    if (month) {
      month.cents += r.total_cents;
      month.visits++;
    }
    const who = staff.get(r.staff_id) ?? { id: r.staff_id, name: r.staff_name, count: 0, cents: 0 };
    who.count++;
    who.cents += r.total_cents;
    staff.set(r.staff_id, who);
    for (const l of r.lines ?? []) {
      const s = services.get(l.id) ?? { id: l.id, name: l.name, count: 0, cents: 0 };
      s.count++;
      s.cents += l.cents;
      services.set(l.id, s);
    }
  }
  const bySum = <T extends { cents: number; count: number }>(a: T, b: T) => b.cents - a.cents || b.count - a.count;
  return { from, to, visits: rows.length, totalCents, months: [...months.values()], services: [...services.values()].sort(bySum), staff: [...staff.values()].sort(bySum) };
}
