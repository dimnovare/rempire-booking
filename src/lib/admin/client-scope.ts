/**
 * Whose clients a login sees («Показывать клиентов», clients.show): all of
 * them, or only those who have had a visit with the chosen barbers. One
 * place, so the client base, a client's card, the calendar's client search
 * and the barber app all mean the same clients.
 *
 * A barber's login had «his own clients only» before the rights; it is now
 * this right with his own column as the chosen barber.
 */
import { can, canGroup, seenClients, type Holder } from "../auth/rights";
import type { Querier } from "../db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the client list offers a login, each a right of its own. The screen only hides by these. */
export type ListMay = {
  /** «Операции с Excel» → «Выгрузить в Excel» */
  export: boolean;
  /** «Добавить клиента», «Добавить в категорию» */
  edit: boolean;
  /** «Отправить сообщение» to many */
  mass: boolean;
  /** «Удалить из базы» */
  bulkDelete: boolean;
};

export function listMay(who: Holder): ListMay {
  return { export: can(who, "clients.export"), edit: can(who, "clients.edit"), mass: can(who, "single.bulk_sms"), bulkDelete: can(who, "clients.delete", { bulk: true }) };
}

/** What a client's card offers a login. */
export type CardMay = {
  /** the section itself: «Клиентская база» */
  open: boolean;
  /** the card's fields but the note; the note */
  edit: boolean;
  note: boolean;
  /** the phones and the e-mail are shown whole; false: masked, and not to be changed */
  contacts: boolean;
  del: boolean;
  comments: boolean;
  commentAdd: boolean;
  commentDelOwn: boolean;
  commentDelOthers: boolean;
  files: boolean;
  upload: boolean;
  fileDelete: boolean;
  /** «История визитов» and «Статистика» */
  history: boolean;
  /** «Отправить сообщение» */
  send: boolean;
};

export function cardMay(who: Holder): CardMay {
  return {
    open: canGroup(who, "clients"),
    edit: can(who, "clients.edit"),
    note: can(who, "clients.note.edit"),
    contacts: can(who, "clients.card_contacts"),
    del: can(who, "clients.delete"),
    comments: can(who, "clients.comments"),
    commentAdd: can(who, "clients.comments_add"),
    commentDelOwn: can(who, "clients.comments_delete_own"),
    commentDelOthers: can(who, "clients.comments_delete_others"),
    files: can(who, "clients.files"),
    upload: can(who, "clients.files.upload"),
    fileDelete: can(who, "clients.files.delete"),
    history: can(who, "clients.history"),
    send: can(who, "single.bulk_sms"),
  };
}

/** Is this client one the login may see? */
export async function clientSeen(q: Querier, businessId: string, who: Holder, clientId: string): Promise<boolean> {
  const seen = seenClients(who);
  if (seen === "all") return true;
  if (!seen.length || !UUID_RE.test(String(clientId))) return false;
  const rows = await q<{ x: number }>("select 1 as x from appointments where business_id = $1 and client_id = $2 and staff_id = any($3::uuid[]) limit 1", [businessId, clientId, [...seen]]);
  return rows.length > 0;
}

/**
 * The same as a WHERE part over `clients c`: empty for «all», else «has a
 * visit with one of these barbers». `p` adds a value and gives its
 * placeholder.
 */
export function seenClientsSql(who: Holder | null | undefined, p: (value: unknown) => string): string {
  if (!who) return "";
  const seen = seenClients(who);
  if (seen === "all") return "";
  if (!seen.length) return " and false";
  return ` and exists (select 1 from appointments sa where sa.client_id = c.id and sa.staff_id = any(${p([...seen])}::uuid[]))`;
}
