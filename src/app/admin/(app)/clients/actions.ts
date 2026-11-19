"use server";

/**
 * «Клиенты»: the list's search and a client's changes. Each action checks
 * the login itself and copies its arguments by name.
 *
 * The search is an action, not a link with `?q=`: what is typed there is a
 * client's name or phone, and those stay out of addresses, the browser's
 * history and the server's request log.
 *
 * A client's files are uploaded and downloaded by routes of their own
 * ([id]/files): a file is larger than an action may carry. So is the
 * list as an .xlsx file (export/route.ts).
 *
 * What is done to many clients at once (a mass message, a category,
 * deleting) names its clients as a target: the ticked rows, or the list's
 * own filter (src/lib/admin/client-bulk.ts).
 *
 * Rights (src/lib/auth/rights.ts): every action asks the login's own. The
 * library is handed the login where the answer depends on the client or on
 * what exactly changes (which clients it sees, the note against the rest
 * of the card, a comment of one's own); the rest is asked here.
 */
import { refresh } from "next/cache";
import { addComment, cleanStatsPeriod, clientStats, deleteComment, deleteFile, queueClientMessage, removeClientPhoto, saveClientPhoto, type ClientStats, type MessageQueued } from "@/lib/admin/client-card";
import { bulkAddLabel, bulkDelete, cleanTarget, massPreview, queueMassMessage, type BulkDeleted, type BulkLabeled, type MassPreview, type MassQueued } from "@/lib/admin/client-bulk";
import { setClientColumns, type ClientColumn } from "@/lib/admin/client-columns";
import { clientSeen } from "@/lib/admin/client-scope";
import { clientDetail, deleteClient, listClients, PAGE_SIZE, saveClient, type ClientDeleted, type ClientInput, type ClientList, type ClientSaved } from "@/lib/admin/clients";
import { PHOTO_MAX_BYTES } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { can, canGroup } from "@/lib/auth/rights";
import { CLIENT_KINDS } from "@/lib/client-notify";
import { query } from "@/lib/db";
import { smsTransport } from "@/lib/sms";
import { cardFieldsOf, type CardFields, type NotifyFields } from "./card-fields";
import { filterOf, type ClientQuery } from "./query";

export type { ClientQuery };

/** One page of the list for this search, category and conditions, in this order. */
export async function listClientsAction(f: ClientQuery): Promise<ClientList> {
  const { user, business } = await requireAdmin();
  // the section itself: «Клиентская база»
  if (!canGroup(user, "clients")) return { rows: [], total: 0, page: 1, pages: 1, size: PAGE_SIZE, labels: [] };
  return listClients(query, business.id, filterOf(f), Date.now(), business.timezone, user);
}

/** The columns this login keeps in the table; answers with them as they are kept. */
export async function setColumnsAction(columns: string[]): Promise<ClientColumn[] | null> {
  const { user } = await requireAdmin();
  return setClientColumns(query, user.id, Array.isArray(columns) ? columns.slice(0, 20).map(String) : null);
}

/* ---------- «Действия»: many clients at once ---------- */

/** The ticked rows (`ids`), or with none ticked the list's own question (`filter`). */
export type TargetInput = { ids: string[] } | { filter: ClientQuery };

function targetOf(t: TargetInput | null | undefined) {
  const ids = (t as { ids?: unknown })?.ids;
  if (Array.isArray(ids)) return cleanTarget({ ids: ids.slice(0, 1000).map(String) });
  const f = (t as { filter?: ClientQuery })?.filter;
  return f && typeof f === "object" ? cleanTarget({ filter: filterOf(f) }) : null;
}

/** `smsReady`: an SMS can go now; false while there is no provider and it waits in the queue. */
export type MassPreviewed = (MassPreview & { smsReady: boolean }) | null;

/** Who a mass message to these clients would reach, by channel. Null: no such target. */
export async function massPreviewAction(t: TargetInput): Promise<MassPreviewed> {
  const { user, business } = await requireAdmin();
  if (!can(user, "single.bulk_sms")) return null;
  const target = targetOf(t);
  if (!target) return null;
  return { ...(await massPreview(query, business, target, Date.now(), process.env, user)), smsReady: smsTransport() !== "disabled" };
}

/** Queue the mass message: one outbox row per client and channel; the cron sends them. */
export async function massSendAction(t: TargetInput, m: { text: string; channels: string[] }): Promise<MassQueued> {
  const { user, business } = await requireAdmin();
  const r = await queueMassMessage(business, targetOf(t), { text: str(m?.text), channels: Array.isArray(m?.channels) ? m.channels.slice(0, 10).map(String) : [] }, user);
  if (r.ok) refresh();
  return r;
}

/** «Добавить в категорию»: one category on every chosen client. */
export async function bulkLabelAction(t: TargetInput, label: string): Promise<BulkLabeled> {
  const { user, business } = await requireAdmin();
  const r = await bulkAddLabel(business, targetOf(t), str(label), user.id, Date.now(), user);
  if (r.ok) refresh();
  return r;
}

/**
 * «Удалить из базы»: only the owner, and only clients with no history. No
 * refresh, as for one client's «Удалить»: a card that is open would be
 * asked for a client who is gone. The list asks for its page again itself.
 */
export async function bulkDeleteAction(t: TargetInput): Promise<BulkDeleted> {
  const { user, business } = await requireAdmin();
  return bulkDelete(business, targetOf(t), user);
}

/** What «Добавить клиента» sends. */
export type ClientForm = { name?: string; phone?: string; email?: string };

/** Add a client. */
export async function saveClientAction(id: null, f: ClientForm): Promise<ClientSaved> {
  const { user, business } = await requireAdmin();
  if (id !== null) return { ok: false, field: "id" };
  const input: ClientInput = { name: String(f?.name ?? "") };
  if (f?.phone !== undefined) input.phone = String(f.phone ?? "");
  if (f?.email !== undefined) input.email = String(f.email ?? "");
  const r = await saveClient(business, null, input, user.id, Date.now(), user);
  if (r.ok) refresh();
  return r;
}

const str = (v: unknown) => (v == null ? "" : String(v));
const WHOLE = /^\d{1,3}$/;

/** The card's fields as they are now saved; or what to fix (as saveClient names it). */
export type CardSaved = { ok: true; card: CardFields } | { ok: false; field: string; clientId?: string };

/** «Карточка клиента», «Сохранить»: every field of the left column at once. */
export async function saveCardAction(id: string, f: CardFields): Promise<CardSaved> {
  const { user, business } = await requireAdmin();
  const cid = str(id);
  const discount = str(f?.discount).trim();
  const r = await saveClient(
    business,
    cid,
    {
      name: str(f?.name),
      phone: str(f?.phone),
      phone2: str(f?.phone2),
      email: str(f?.email),
      birthday: str(f?.birthday),
      gender: str(f?.gender),
      importance: str(f?.importance),
      cardNo: str(f?.cardNo),
      // stored and shown only: no price reads it (src/lib/admin/clients.ts)
      discountPct: discount === "" ? 0 : WHOLE.test(discount) ? Number(discount) : NaN,
      locale: str(f?.locale),
      noOnline: f?.noOnline === true,
      note: str(f?.note),
      // not a list: left as it came, for saveClient to refuse by name
      labels: Array.isArray(f?.labels) ? f.labels.slice(0, 100).map(String) : f?.labels,
    },
    user.id,
    Date.now(),
    user,
  );
  if (!r.ok) return r;
  const d = await clientDetail(query, business, cid, Date.now(), user);
  if (!d) return { ok: false, field: "id" };
  refresh();
  return { ok: true, card: cardFieldsOf(d) };
}

/** «Уведомления», «Сохранить»: the channels he accepts and the kinds he wants. */
export async function saveNotifyAction(id: string, f: NotifyFields): Promise<{ ok: true } | { ok: false; field: string }> {
  const { user, business } = await requireAdmin();
  const r = await saveClient(
    business,
    str(id),
    {
      marketingOptOut: f?.adsOff === true,
      smsOptOut: f?.sms !== true,
      emailOptOut: f?.email !== true,
      pushOptOut: f?.push !== true,
      notifyOff: CLIENT_KINDS.filter((k) => f?.kinds?.[k] !== true),
    },
    user.id,
    Date.now(),
    user,
  );
  if (!r.ok) return { ok: false, field: r.field };
  refresh();
  return { ok: true };
}

/**
 * «Удалить». No refresh here: the card's own page would be asked for a
 * client who is gone. The card goes back to the list, and the list asks
 * for its page again.
 */
export async function deleteClientAction(id: string): Promise<ClientDeleted> {
  const { user, business } = await requireAdmin();
  return deleteClient(business, str(id), user.id, user);
}

export async function addCommentAction(id: string, text: string): Promise<{ ok: true } | { ok: false; field: string }> {
  const { user, business } = await requireAdmin();
  if (!can(user, "clients.comments_add") || !(await clientSeen(query, business.id, user, str(id)))) return { ok: false, field: "forbidden" };
  const r = await addComment(business, str(id), str(text), { id: user.id, name: user.name || user.email });
  if (!r.ok) return r;
  refresh();
  return { ok: true };
}

export async function deleteCommentAction(id: string, commentId: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  const ok = await deleteComment(business, str(id), str(commentId), user);
  if (ok) refresh();
  return ok;
}

/** The client's photo: one image in the form's «photo» field, already shrunk by the browser. Returns its version. */
export async function uploadClientPhotoAction(id: string, form: FormData): Promise<{ ok: true; v: string } | { ok: false; field: string }> {
  const { user, business } = await requireAdmin();
  if (!can(user, "clients.edit") || !(await clientSeen(query, business.id, user, str(id)))) return { ok: false, field: "forbidden" };
  const file = form?.get?.("photo");
  if (!(file instanceof Blob) || file.size < 1 || file.size > PHOTO_MAX_BYTES) return { ok: false, field: "photo" };
  const r = await saveClientPhoto(business, str(id), new Uint8Array(await file.arrayBuffer()), user.id);
  if (r.ok) refresh();
  return r;
}

export async function removeClientPhotoAction(id: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  if (!can(user, "clients.edit") || !(await clientSeen(query, business.id, user, str(id)))) return false;
  const ok = await removeClientPhoto(business, str(id), user.id);
  if (ok) refresh();
  return ok;
}

export async function deleteFileAction(id: string, fileId: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  if (!can(user, "clients.files.delete") || !(await clientSeen(query, business.id, user, str(id)))) return false;
  const ok = await deleteFile(business, str(id), str(fileId), user.id);
  if (ok) refresh();
  return ok;
}

/** «Отправить»: one outbox row per channel; the cron sends them. */
export async function sendMessageAction(id: string, m: { text: string; channels: string[] }): Promise<MessageQueued> {
  const { user, business } = await requireAdmin();
  // a message by hand is the salon's SMS too: «Совершать SMS рассылки клиентам»
  if (!can(user, "single.bulk_sms") || !(await clientSeen(query, business.id, user, str(id)))) return { ok: false, code: "not_found" };
  const r = await queueClientMessage(business, str(id), { text: str(m?.text), channels: Array.isArray(m?.channels) ? m.channels.slice(0, 10).map(String) : [] }, user.id);
  if (r.ok) refresh();
  return r;
}

/** «Статистика» for another period. */
export async function clientStatsAction(id: string, from: string, to: string): Promise<ClientStats | null> {
  const { user, business } = await requireAdmin();
  if (!can(user, "clients.history") || !(await clientSeen(query, business.id, user, str(id)))) return null;
  return clientStats(query, business, str(id), cleanStatsPeriod(str(from), str(to), business.timezone));
}
