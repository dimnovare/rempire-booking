"use server";

/**
 * «Клиенты»: the list's search and a client's changes. Each action checks
 * the login itself and copies its arguments by name.
 *
 * The search is an action, not a link with `?q=`: what is typed there is a
 * client's name or phone, and those stay out of addresses, the browser's
 * history and the server's request log.
 */
import { refresh } from "next/cache";
import { listClients, saveClient, type ClientInput, type ClientList, type ClientSaved } from "@/lib/admin/clients";
import { requireAdmin } from "@/lib/auth/current";
import { query } from "@/lib/db";

export type ClientQuery = { q: string; label: string; page: number };

/** One page of the list for this search and category. */
export async function listClientsAction(f: ClientQuery): Promise<ClientList> {
  const { business } = await requireAdmin();
  return listClients(query, business.id, { q: String(f?.q ?? ""), label: String(f?.label ?? ""), page: Number(f?.page) });
}

/** What a part of the client's page sends: only its own fields. */
export type ClientForm = { name?: string; phone?: string; email?: string; locale?: string; note?: string; labels?: string[]; smsOptOut?: boolean; emailOptOut?: boolean };

function inputOf(f: ClientForm | null | undefined): ClientInput {
  const out: ClientInput = {};
  if (f?.name !== undefined) out.name = String(f.name ?? "");
  if (f?.phone !== undefined) out.phone = String(f.phone ?? "");
  if (f?.email !== undefined) out.email = String(f.email ?? "");
  if (f?.locale !== undefined) out.locale = String(f.locale ?? "");
  if (f?.note !== undefined) out.note = String(f.note ?? "");
  // not a list: left as it came, for saveClient to refuse by name
  if (f?.labels !== undefined) out.labels = Array.isArray(f.labels) ? f.labels.slice(0, 100).map(String) : f.labels;
  if (f?.smsOptOut !== undefined) out.smsOptOut = f.smsOptOut === true;
  if (f?.emailOptOut !== undefined) out.emailOptOut = f.emailOptOut === true;
  return out;
}

/** Add a client (id null) or change one. */
export async function saveClientAction(id: string | null, f: ClientForm): Promise<ClientSaved> {
  const { user, business } = await requireAdmin();
  const r = await saveClient(business, id == null ? null : String(id), inputOf(f), user.id);
  if (r.ok) refresh();
  return r;
}
