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
 * ([id]/files): a file is larger than an action may carry.
 */
import { refresh } from "next/cache";
import { addComment, cleanStatsPeriod, clientStats, deleteComment, deleteFile, queueClientMessage, removeClientPhoto, saveClientPhoto, type ClientStats, type MessageQueued } from "@/lib/admin/client-card";
import { clientDetail, deleteClient, listClients, saveClient, type ClientDeleted, type ClientInput, type ClientList, type ClientSaved } from "@/lib/admin/clients";
import { PHOTO_MAX_BYTES } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { CLIENT_KINDS } from "@/lib/client-notify";
import { query } from "@/lib/db";
import { cardFieldsOf, type CardFields, type NotifyFields } from "./card-fields";

export type ClientQuery = { q: string; label: string; page: number };

/** One page of the list for this search and category. */
export async function listClientsAction(f: ClientQuery): Promise<ClientList> {
  const { business } = await requireAdmin();
  return listClients(query, business.id, { q: String(f?.q ?? ""), label: String(f?.label ?? ""), page: Number(f?.page) });
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
  const r = await saveClient(business, null, input, user.id);
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
  );
  if (!r.ok) return r;
  const d = await clientDetail(query, business, cid);
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
  return deleteClient(business, str(id), user.id);
}

export async function addCommentAction(id: string, text: string): Promise<{ ok: true } | { ok: false; field: string }> {
  const { user, business } = await requireAdmin();
  const r = await addComment(business, str(id), str(text), { id: user.id, name: user.name || user.email });
  if (!r.ok) return r;
  refresh();
  return { ok: true };
}

export async function deleteCommentAction(id: string, commentId: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  const ok = await deleteComment(business, str(id), str(commentId), { id: user.id, role: user.role });
  if (ok) refresh();
  return ok;
}

/** The client's photo: one image in the form's «photo» field, already shrunk by the browser. Returns its version. */
export async function uploadClientPhotoAction(id: string, form: FormData): Promise<{ ok: true; v: string } | { ok: false; field: string }> {
  const { user, business } = await requireAdmin();
  const file = form?.get?.("photo");
  if (!(file instanceof Blob) || file.size < 1 || file.size > PHOTO_MAX_BYTES) return { ok: false, field: "photo" };
  const r = await saveClientPhoto(business, str(id), new Uint8Array(await file.arrayBuffer()), user.id);
  if (r.ok) refresh();
  return r;
}

export async function removeClientPhotoAction(id: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  const ok = await removeClientPhoto(business, str(id), user.id);
  if (ok) refresh();
  return ok;
}

export async function deleteFileAction(id: string, fileId: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  const ok = await deleteFile(business, str(id), str(fileId), user.id);
  if (ok) refresh();
  return ok;
}

/** «Отправить»: one outbox row per channel; the cron sends them. */
export async function sendMessageAction(id: string, m: { text: string; channels: string[] }): Promise<MessageQueued> {
  const { user, business } = await requireAdmin();
  const r = await queueClientMessage(business, str(id), { text: str(m?.text), channels: Array.isArray(m?.channels) ? m.channels.slice(0, 10).map(String) : [] }, user.id);
  if (r.ok) refresh();
  return r;
}

/** «Статистика» for another period. */
export async function clientStatsAction(id: string, from: string, to: string): Promise<ClientStats | null> {
  const { business } = await requireAdmin();
  return clientStats(query, business, str(id), cleanStatsPeriod(str(from), str(to), business.timezone));
}
